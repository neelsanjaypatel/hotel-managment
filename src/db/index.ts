import "server-only";
import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL set (Supabase / any Postgres) -> real server.
// Not set -> embedded Postgres (PGlite) in .data/, for local development.
function create() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL;
  if (url) {
    // Each serverless instance holds its own connections and many instances run at once, so
    // keep this small; the rest queue here instead of exhausting the database's limit.
    // Never query `db` inside a transaction: use its `tx`, or a full pool can wait on itself.
    // keep_alive 15: find a dead socket sooner than the 60s default.
    const client = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, keep_alive: 15 });
    const db = drizzlePg(client, { schema });
    watch(client);
    // Production migrates once per deploy (scripts/migrate.mjs from npm run build / npm start).
    // Running it here too would let several serverless instances race on one migration.
    return { db, ready: process.env.MIGRATE_ON_START === "1" ? migratePg(db, { migrationsFolder }) : Promise.resolve() };
  }
  // A hosted container's disk is wiped on every deploy; PGlite there would silently lose
  // every entry. Refuse to start instead of pretending to save.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE !== "1") {
    throw new Error("DATABASE_URL is not set. Add the Postgres connection string to the server's environment variables.");
  }
  const dir = path.join(process.cwd(), ".data", "pglite");
  // PGlite does not create parent folders; a fresh checkout has no .data yet.
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  // PGlite keeps the database in memory and flushes on close; a hard kill leaves the
  // folder unreadable. Close it cleanly when the dev server is stopped.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      client.close().finally(() => process.exit(0));
    });
  }
  const db = drizzlePglite(client, { schema });
  // Same query builder API; typed as one so call sites see a single type.
  return { db: db as unknown as PostgresJsDatabase<typeof schema>, ready: migratePglite(db, { migrationsFolder }) };
}

type Conn = ReturnType<typeof create>;
const g = globalThis as unknown as { __hotelDb?: Conn };

// Watchdog. On 2026-11-22 all pooled connections hung on the Supabase pooler with no error:
// every page that read the database waited forever until the service was restarted.
// Every 30s run `select 1` with an 8s limit. A healthy pool answers in milliseconds; a pool
// whose connections are all stuck makes the probe queue and time out. After two misses in a
// row, open a fresh pool for new requests and close the old one, which fails its stuck
// queries with an error instead of leaving them hanging.
const PROBE_EVERY_MS = 30_000;
const PROBE_LIMIT_MS = 8_000;
function watch(client: ReturnType<typeof postgres>) {
  let misses = 0;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    let limit: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        client`select 1`,
        new Promise((_, reject) => {
          limit = setTimeout(() => reject(new Error("probe timed out")), PROBE_LIMIT_MS);
        }),
      ]);
      misses = 0;
    } catch (e) {
      misses += 1;
      console.error(`[db] health probe failed (${misses}/2):`, e instanceof Error ? e.message : e);
      if (misses >= 2) {
        clearInterval(timer);
        console.error("[db] replacing stuck connection pool");
        g.__hotelDb = undefined; // the next getDb() opens a fresh pool
        client.end({ timeout: 5 }).catch(() => {});
      }
    } finally {
      clearTimeout(limit);
      busy = false;
    }
  }, PROBE_EVERY_MS);
  timer.unref();
}

export type DB = Conn["db"];

// Opened on first query, not on import: Next dev briefly loads server modules in helper
// processes, and two processes opening the same PGlite folder can corrupt it.
export async function getDb(): Promise<DB> {
  const conn = (g.__hotelDb ??= create());
  await conn.ready;
  return conn.db;
}

export { schema };
