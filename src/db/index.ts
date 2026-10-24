import "server-only";
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
    return { db, ready: migratePg(db, { migrationsFolder }) };
  }
  const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
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
