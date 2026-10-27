// Applies database migrations to the Postgres in DATABASE_URL (Railway / Supabase in production).
// Runs from `npm start`, before the server listens: Railway's private database address is
// not reachable during the build, and a single long-running server migrates once per deploy.
// Plain JavaScript so it needs no dev tools at runtime.
// Without DATABASE_URL (local development with PGlite) it does nothing: the dev server
// migrates its own embedded database.
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("migrate: no DATABASE_URL, skipping (local PGlite migrates on start).");
    return;
  }
  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("migrate: database is up to date.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
