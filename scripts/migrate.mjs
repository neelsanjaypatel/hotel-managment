// Applies database migrations to the Postgres in DATABASE_URL (Supabase / Railway in production).
// Runs from `npm run build` (Vercel: each deploy migrates once, before any function starts) and
// again from `npm start` (Railway: its private database address is not reachable while building).
// Both are no-ops once the database is up to date.
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
    // Migration 0009 closed Supabase's public REST API on every table that existed then.
    // A table added by a later migration must not reopen it, so switch row level security on
    // for any table that lacks it. The app connects as the table owner and is not restricted.
    const open = await client`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    for (const { relname } of open) {
      await client`alter table public.${client(relname)} enable row level security`;
      console.log(`migrate: row level security switched on for ${relname}.`);
    }
    console.log("migrate: database is up to date.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
