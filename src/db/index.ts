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
    const client = postgres(url, { prepare: false });
    const db = drizzlePg(client, { schema });
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

export type DB = Conn["db"];

// Opened on first query, not on import: Next dev briefly loads server modules in helper
// processes, and two processes opening the same PGlite folder can corrupt it.
export async function getDb(): Promise<DB> {
  const conn = (g.__hotelDb ??= create());
  await conn.ready;
  return conn.db;
}

export { schema };
