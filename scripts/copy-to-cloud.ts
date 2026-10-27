// Copies chosen hotels from the local PGlite database into the cloud Postgres in DATABASE_URL.
// Usage (stop the dev server first: PGlite allows one process at a time):
//   npm run copy-to-cloud -- --list                 -> hotels in the local database
//   npm run copy-to-cloud -- --hotels 1,4           -> copy those hotels (target must be empty)
// Options: --from <folder> reads another PGlite folder (default .data/pglite).
//
// Rows keep their ids, so every link between them survives; sequences are moved past the
// copied ids afterwards. The platform owner login comes along; sessions do not (everyone
// logs in again). Logins still on the demo password get a new random password, written to
// .data/cloud-logins.txt, because the demo password is public in this repository.
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const DEMO_PASSWORD = "demo1234";

// Parents before children, so foreign keys hold while inserting.
const HOTEL_TABLES = [
  "subscription_payments", "employees", "employee_rates", "attendance", "day_books",
  "parties", "bookings", "sales", "receipts", "suppliers", "supplier_payments",
  "expense_categories", "expenses", "advances", "salary_payments", "salary_adjustments",
  "partners", "partner_drawings", "cash_transfers", "audit_log",
];

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const from = arg("--from") ?? path.join(process.cwd(), ".data", "pglite");
  if (!fs.existsSync(from)) throw new Error(`No PGlite database at ${from}`);
  const src = new PGlite(from);
  const rows = async <T = Record<string, unknown>>(q: string, p: unknown[] = []) => (await src.query<T>(q, p)).rows;

  try {
    if (process.argv.includes("--list")) {
      console.table(await rows(`
        select h.id, h.name, h.status,
          (select count(*)::int from users u where u.hotel_id = h.id) as users,
          (select count(*)::int from employees e where e.hotel_id = h.id) as staff,
          (select count(*)::int from sales s where s.hotel_id = h.id) as sales,
          (select count(*)::int from expenses x where x.hotel_id = h.id) as expenses
        from hotels h order by h.id`));
      return;
    }

    const ids = (arg("--hotels") ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) throw new Error("Pass --hotels 1,2 (see --list).");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set.");

    const found = await rows<{ id: number; name: string }>(`select id, name from hotels where id = any($1::int[]) order by id`, [ids]);
    if (found.length !== ids.length) throw new Error(`Unknown hotel id in ${ids.join(",")}.`);
    console.log("Copying:", found.map((h) => `${h.id} ${h.name}`).join(", "));

    const dst = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(dst), { migrationsFolder: path.join(process.cwd(), "drizzle") });
      const [{ n }] = await dst<{ n: number }[]>`select count(*)::int as n from hotels`;
      if (n > 0) throw new Error("The cloud database already has hotels; refusing to copy over them.");

      // [table, where clause on the source]
      const plan: [string, string][] = [
        ["plans", "true"],
        ["hotels", "id = any($1::int[])"],
        ["users", "hotel_id = any($1::int[]) or (hotel_id is null and role = 'superadmin')"],
        ...HOTEL_TABLES.map((t): [string, string] => [t, "hotel_id = any($1::int[])"]),
      ];

      const copied: Record<string, number> = {};
      await dst.begin(async (tx) => {
        for (const [table, where] of plan) {
          // row_to_json keeps dates, timestamps, enums and json exactly as Postgres prints them;
          // json_populate_recordset turns them back into the same column types on the other side.
          const data = await rows<{ r: unknown }>(`select row_to_json(t) as r from ${table} t where ${where}`, where === "true" ? [] : [ids]);
          for (let i = 0; i < data.length; i += 500) {
            const chunk = JSON.stringify(data.slice(i, i + 500).map((d) => d.r));
            await tx.unsafe(`insert into ${table} select * from json_populate_recordset(null::${table}, $1::json)`, [chunk]);
          }
          copied[table] = data.length;
          // Serial ids were copied explicitly; move the sequence past them.
          await tx.unsafe(`
            select setval(s, coalesce((select max(id) from ${table}), 1), (select max(id) from ${table}) is not null)
            from pg_get_serial_sequence('${table}', 'id') s where s is not null`);
        }
      });

      // Verify: row counts and money totals must match the source exactly.
      let ok = true;
      for (const [table] of plan) {
        const [{ n: got }] = await dst.unsafe<{ n: number }[]>(`select count(*)::int as n from ${table}`);
        const flag = got === copied[table] ? "ok" : "MISMATCH";
        if (flag !== "ok") ok = false;
        console.log(`${table.padEnd(22)} ${String(copied[table]).padStart(6)} -> ${String(got).padStart(6)}  ${flag}`);
      }
      for (const table of ["sales", "receipts", "expenses", "advances", "salary_payments", "supplier_payments"]) {
        const [a] = await rows<{ s: string }>(`select coalesce(sum(amount), 0)::text as s from ${table} where hotel_id = any($1::int[])`, [ids]);
        const [b] = await dst.unsafe<{ s: string }[]>(`select coalesce(sum(amount), 0)::text as s from ${table}`);
        const flag = a.s === b.s ? "ok" : "MISMATCH";
        if (flag !== "ok") ok = false;
        console.log(`sum(${table}.amount) ${a.s} -> ${b.s}  ${flag}`);
      }
      if (!ok) throw new Error("Verification failed; see MISMATCH lines above.");

      // Replace the public demo password wherever it is still in use.
      const users = await dst<{ id: number; login: string; name: string; role: string; hotel_id: number | null; password_hash: string }[]>`
        select id, login, name, role, hotel_id, password_hash from users order by hotel_id nulls first, id`;
      const lines: string[] = [];
      for (const u of users) {
        if (!(await bcrypt.compare(DEMO_PASSWORD, u.password_hash))) continue;
        const pw = randomBytes(9).toString("base64url");
        await dst`update users set password_hash = ${await bcrypt.hash(pw, 10)} where id = ${u.id}`;
        const hotel = found.find((h) => h.id === u.hotel_id)?.name ?? "platform";
        lines.push(`${u.login} / ${pw}  (${u.role}, ${hotel})`);
      }
      if (lines.length) {
        const out = path.join(process.cwd(), ".data", "cloud-logins.txt");
        fs.writeFileSync(out, `New passwords for the cloud database (change them after first login):\n${lines.join("\n")}\n`, { mode: 0o600 });
        console.log(`${lines.length} demo passwords replaced; new ones in ${out}`);
      }
      console.log("Done.");
    } finally {
      await dst.end();
    }
  } finally {
    await src.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
