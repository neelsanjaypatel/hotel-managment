// Applies database migrations to the Postgres in DATABASE_URL (Supabase in production).
// Runs as part of `npm run build`, so each deploy migrates once, before any server starts.
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
  const client = postgres(url, { prepare: false, max: 1 });
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
