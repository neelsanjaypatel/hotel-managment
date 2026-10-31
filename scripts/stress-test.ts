// Concurrency and load test against a real Postgres. It calls the real server actions with many
// logins at once, the way a busy hotel would, and checks the money still adds up.
// Run: DATABASE_URL=postgres://...@127.0.0.1:PORT/empty_db npm run stress
// It writes test hotels, so it refuses any database that is not on this machine.
import Module from "node:module";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, createHash } from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
if (!["127.0.0.1", "localhost"].includes(url ? new URL(url).hostname : "")) {
  console.error("Refusing to run: DATABASE_URL must point to a Postgres on this machine.");
  process.exit(1);
}

// Next.js supplies these inside a request; here each simulated login carries its own cookie.
const who = new AsyncLocalStorage<string>();
const store = {
  get: (name: string) => (name === "hm_session" && who.getStore() ? { value: who.getStore() } : undefined),
  set: () => {},
  delete: () => {},
};
const mocks: Record<string, unknown> = {
  "server-only": {},
  "next/cache": { revalidatePath: () => {} },
  "next/headers": { cookies: async () => store, headers: async () => new Map([["x-forwarded-for", who.getStore() ?? "test"]]) },
  "next/navigation": {
    redirect: (to: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { to });
    },
  },
};
const load = (Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown })._load = function (request, ...rest) {
  if (request in mocks) return mocks[request];
  const mod = load.call(this, request, ...rest);
  // React's request cache exists only in the server build; a test has no request to cache for.
  if (request === "react" && !(mod as { cache?: unknown }).cache) return { ...(mod as object), cache: <T,>(f: T) => f };
  return mod;
};

let failed = 0;
function check(name: string, pass: boolean, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

// A redirect at the end of a successful action is a success.
const settle = async <T,>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if ((e as { to?: string }).to) return { ok: "redirected" } as T;
    return { error: String(e) } as T;
  }
};

async function main() {
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const raw = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
  await migrate(drizzle(raw), { migrationsFolder: path.join(process.cwd(), "drizzle") });

  const { eq } = await import("drizzle-orm");
  const { getDb, schema } = await import("../src/db");
  const { createHotelWithDefaults } = await import("../src/db/defaults");
  const actions = await import("../src/lib/actions");
  const bookings = await import("../src/lib/booking-actions");
  const salary = await import("../src/lib/salary-actions");
  const { login } = await import("../src/lib/auth");
  const { rangeTotals, dayRows } = await import("../src/lib/ledger");
  const { todayIST, addDays } = await import("../src/lib/format");
  const db = await getDb();
  const eqHotel = (t: typeof schema.bookings, id: number) => eq(t.hotelId, id);
  const today = todayIST();
  const tag = randomBytes(3).toString("hex");

  await db.insert(schema.plans).values({ code: `t${tag}`, name: "Test", priceMonthly: 0 }).onConflictDoNothing();
  const [plan] = await db.select().from(schema.plans).limit(1);

  async function hotel(name: string, planId = plan.id) {
    const made = await createHotelWithDefaults(db, {
      hotel: { name, city: "Test", phone: "9000000000", planId, hasRestaurant: true, hasRooms: true, hasBanquet: true },
      owner: { name: "Owner", login: `${name}-${tag}`, passwordHash: await (await import("bcryptjs")).default.hash("right-password", 4) },
    });
    const token = randomBytes(16).toString("hex");
    await db.insert(schema.sessions).values({
      id: createHash("sha256").update(token).digest("hex"),
      userId: made.owner.id,
      expiresAt: new Date(Date.now() + 864e5),
    });
    return { ...made, as: <T,>(fn: () => Promise<T>) => who.run(token, () => settle(fn)), token };
  }

  const salesOf = async (hotelId: number) =>
    raw<{ n: number; total: string }[]>`select count(*)::int n, coalesce(sum(amount),0) total from sales where hotel_id = ${hotelId}`;

  // ---- double clicks and two people pressing the same button ----
  {
    const h = await hotel("payall");
    const [e] = await db
      .insert(schema.employees)
      .values({ hotelId: h.hotel.id, code: "E1", name: "Worker", department: "Kitchen", payType: "monthly", rate: 3000000, joinDate: "2020-01-01" })
      .returning();
    const month = addDays(today.slice(0, 7) + "-01", -1).slice(0, 7);
    await db.insert(schema.salaryAdjustments).values({ hotelId: h.hotel.id, employeeId: e.id, month, kind: "bonus", amount: 3000000, note: "test", createdBy: h.owner.id });
    await Promise.all(
      Array.from({ length: 6 }, () => h.as(() => salary.payAllSalaries(null, form({ month, paidVia: "cash" })))),
    );
    const [r] = await raw<{ n: number; total: string }[]>`select count(*)::int n, coalesce(sum(amount),0) total from salary_payments where employee_id = ${e.id}`;
    check("Pay all salaries pressed 6 times pays once", r.n === 1, `${r.n} payments, ₹${Number(r.total) / 100}`);
  }
  {
    const h = await hotel("complete");
    const made = await h.as(() => bookings.createBooking(null, form({ customer: "A", unit: "banquet", title: "Wedding", date: today, slot: "evening", totalAmount: "10000", status: "confirmed" })));
    const [b] = await db.select().from(schema.bookings).where(eqHotel(schema.bookings, h.hotel.id));
    await Promise.all(Array.from({ length: 6 }, () => h.as(() => bookings.completeBooking(null, form({ bookingId: String(b.id), finalAmount: "10000" })))));
    const [r] = await salesOf(h.hotel.id);
    check("Complete booking pressed 6 times bills once", !!made && r.n === 1, `${r.n} sales, ₹${Number(r.total) / 100}`);
  }
  {
    const h = await hotel("cancel");
    await h.as(() => bookings.createBooking(null, form({ customer: "A", unit: "banquet", title: "Party", date: today, slot: "evening", totalAmount: "10000", status: "confirmed", advance: "5000", advanceMode: "cash" })));
    const [b] = await db.select().from(schema.bookings).where(eqHotel(schema.bookings, h.hotel.id));
    await Promise.all(Array.from({ length: 6 }, () => h.as(() => bookings.cancelBooking(null, form({ bookingId: String(b.id), refund: "1000", refundMode: "cash" })))));
    const [r] = await salesOf(h.hotel.id);
    const [ref] = await raw<{ n: number }[]>`select count(*)::int n from receipts where booking_id = ${b.id} and amount < 0`;
    check("Cancel booking pressed 6 times refunds once", r.n === 1 && ref.n === 1, `${ref.n} refunds, ${r.n} charges`);
  }
  {
    const h = await hotel("clash");
    const tries = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        h.as(() => bookings.createBooking(null, form({ customer: `C${i}`, unit: "banquet", title: `Event ${i}`, date: addDays(today, 5), slot: "evening", venue: "Main Hall", totalAmount: "5000", status: "confirmed" }))),
      ),
    );
    const n = (await db.select().from(schema.bookings).where(eqHotel(schema.bookings, h.hotel.id))).length;
    check("8 people book the same hall at once, one gets it", n === 1, `${n} bookings, ${tries.filter((t) => (t as { error?: string })?.error).length} told it is taken`);
  }
  {
    const h = await hotel("number");
    const tries = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        h.as(() => bookings.createBooking(null, form({ customer: `C${i}`, unit: "banquet", title: `Event ${i}`, date: addDays(today, 5 + i), slot: "evening", venue: `Hall ${i}`, totalAmount: "5000", status: "confirmed" }))),
      ),
    );
    const rows = await db.select().from(schema.bookings).where(eqHotel(schema.bookings, h.hotel.id));
    check("12 different bookings at once all save", rows.length === 12 && new Set(rows.map((b) => b.number)).size === 12, `${rows.length} saved, ${tries.filter((t) => (t as { error?: string })?.error).length} failed`);
  }

  // ---- plan limits and partner shares ----
  {
    const [small] = await db.insert(schema.plans).values({ code: `s${tag}`, name: "Small", priceMonthly: 0, maxEmployees: 3, maxUsers: 3 }).returning();
    const h = await hotel("limits", small.id);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => h.as(() => actions.saveUser(null, form({ name: `Staff ${i}`, login: `lim${i}-${tag}`, role: "viewer", password: "password1" })))),
    );
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        h.as(() => actions.saveEmployee(null, form({ code: `E${i}`, name: `Worker ${i}`, department: "Rooms", payType: "monthly", joinDate: "2020-01-01", rate: "10000" }))),
      ),
    );
    const [u] = await raw<{ n: number }[]>`select count(*)::int n from users where hotel_id = ${h.hotel.id} and active`;
    const [e] = await raw<{ n: number }[]>`select count(*)::int n from employees where hotel_id = ${h.hotel.id} and active`;
    check("Plan limit holds when 8 logins are added at once", u.n === 3, `${u.n} of 3`);
    check("Plan limit holds when 8 employees are added at once", e.n === 3, `${e.n} of 3`);
    await Promise.all(Array.from({ length: 4 }, (_, i) => h.as(() => actions.savePartner(null, form({ name: `Partner ${i}`, share: "40" })))));
    const [p] = await raw<{ bp: number }[]>`select coalesce(sum(share_bp),0)::int bp from partners where hotel_id = ${h.hotel.id} and active`;
    check("Partner shares stay within 100% when saved at once", p.bp <= 10000, `${p.bp / 100}%`);
  }

  // ---- entries racing the day close ----
  {
    const h = await hotel("close");
    await h.as(() => actions.addSale(null, form({ date: today, unit: "restaurant", mode: "cash", amount: "100" })));
    const work = Array.from({ length: 40 }, () => h.as(() => actions.addSale(null, form({ date: today, unit: "restaurant", mode: "cash", amount: "100" }))));
    const closes = Array.from({ length: 4 }, (_, i) => h.as(() => actions.closeDay(null, form({ date: today, countedCash: String(1000 + i) }))));
    const res = await Promise.all([...work, ...closes]);
    const [late] = await raw<{ n: number }[]>`
      select count(*)::int n from sales s join day_books d on d.hotel_id = s.hotel_id and d.date = s.date
      where s.hotel_id = ${h.hotel.id} and s.created_at > d.closed_at`;
    const closedOk = res.slice(40).filter((r) => (r as { ok?: string })?.ok).length;
    check("No sale slips into a closed day", late.n === 0, `${late.n} late sales`);
    check("Two managers cannot both close the day", closedOk === 1, `${closedOk} closes succeeded`);
  }

  // ---- big hotels ----
  {
    const h = await hotel("bigmoney");
    // ₹90 lakh a day for 3 days passes ₹2.1 crore, the most a 32-bit paise total can hold.
    const days = [0, 1, 2].map((i) => addDays(today, -i));
    await db.insert(schema.sales).values(days.map((date) => ({ hotelId: h.hotel.id, date, unit: "banquet" as const, mode: "cash" as const, amount: 900000000, createdBy: h.owner.id })));
    let error = "";
    let income = 0;
    try {
      income = (await rangeTotals(h.hotel.id, days[2], days[0])).income;
      await dayRows(h.hotel.id, days[2], days[0]);
    } catch (e) {
      error = (e as { cause?: { message?: string } }).cause?.message ?? String(e);
    }
    check("Reports work past ₹2.1 crore", !error && income === 2700000000, error || `₹${income / 100}`);
  }

  // ---- full Excel export for a busy hotel ----
  {
    const h = await hotel("export");
    const YEARS = Number(process.env.EXPORT_YEARS ?? 3);
    await raw`insert into sales (hotel_id, date, unit, mode, amount, reference, created_by)
      select ${h.hotel.id}, current_date - d, 'restaurant', 'upi', 25000 + n, 'Bill ' || n, ${h.owner.id}
      from generate_series(0, ${365 * YEARS}) d, generate_series(1, 150) n`;
    const { GET } = await import("../src/app/(app)/export/route");
    const t = Date.now();
    const res = await h.as(() => GET());
    const file = res instanceof Response ? await res.arrayBuffer() : new ArrayBuffer(0);
    const secs = ((Date.now() - t) / 1000).toFixed(1);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file);
    const rows = wb.getWorksheet("Sales")?.rowCount ?? 0;
    const expected = (365 * YEARS + 1) * 150 + 1;
    check("Excel export of a busy hotel opens with every row", rows === expected, `${rows} rows, ${(file.byteLength / 1048576).toFixed(1)} MB in ${secs} s`);
  }

  // ---- logins ----
  {
    const h = await hotel("lock");
    const name = h.owner.login;
    await Promise.all(Array.from({ length: 12 }, () => who.run(`ip-${tag}`, () => login(name, "wrong"))));
    const after = await who.run(`ip-${tag}`, () => login(name, "right-password"));
    check("12 wrong passwords at once lock the login", after === "wrong", `correct password now gives "${after}"`);
  }

  // ---- attendance for a big staff ----
  {
    const h = await hotel("attendance");
    const staff = await db
      .insert(schema.employees)
      .values(Array.from({ length: 200 }, (_, i) => ({ hotelId: h.hotel.id, code: `E${i}`, name: `Worker ${i}`, department: "Rooms", payType: "monthly" as const, rate: 1500000, joinDate: "2020-01-01" })))
      .returning();
    const fields: Record<string, string | string[]> = { date: today, employeeId: [...staff.map((e) => String(e.id)), String(staff[0].id)] };
    for (const e of staff) fields[`s_${e.id}`] = schema.attendanceEnum.enumValues[0];
    const t = Date.now();
    const res = await h.as(() => actions.saveAttendance(null, form(fields)));
    const ms = Date.now() - t;
    const [r] = await raw<{ n: number }[]>`select count(*)::int n from attendance where hotel_id = ${h.hotel.id}`;
    check("Attendance for 200 staff saves", r.n === 200 && !!(res as { ok?: string })?.ok, `${r.n} rows in ${ms} ms`);
  }

  // ---- heavy load: many hotels, each with staff entering and reading at once ----
  {
    const HOTELS = Number(process.env.HOTELS ?? 40);
    const ROUNDS = Number(process.env.ROUNDS ?? 25);
    const list = await Promise.all(Array.from({ length: HOTELS }, (_, i) => hotel(`load${i}`)));
    const times: number[] = [];
    let errors = 0;
    let peak = 0;
    const watch = setInterval(async () => {
      const [r] = await raw<{ n: number }[]>`select count(*)::int n from pg_stat_activity where datname = current_database()`;
      peak = Math.max(peak, r.n);
    }, 100);
    const started = Date.now();
    await Promise.all(
      list.flatMap((h) =>
        Array.from({ length: 3 }, () =>
          (async () => {
            for (let i = 0; i < ROUNDS; i++) {
              const t = Date.now();
              const res = (await h.as(async () => {
                const r = await actions.addSale(null, form({ date: today, unit: "restaurant", mode: "upi", amount: "250" }));
                await rangeTotals(h.hotel.id, today, today);
                return r;
              })) as { ok?: string };
              times.push(Date.now() - t);
              if (!res?.ok) errors++;
            }
          })(),
        ),
      ),
    );
    clearInterval(watch);
    const secs = (Date.now() - started) / 1000;
    times.sort((a, b) => a - b);
    const p = (q: number) => times[Math.floor(times.length * q)];
    const [r] = await raw<{ n: number }[]>`select count(*)::int n from sales where hotel_id = any(${list.map((h) => h.hotel.id)})`;
    const expected = HOTELS * 3 * ROUNDS;
    check(`${HOTELS} hotels × 3 logins, every entry saved`, errors === 0 && r.n === expected, `${r.n}/${expected}, ${errors} errors`);
    console.log(`      ${Math.round(times.length / secs)} entry+report/s, median ${p(0.5)} ms, p95 ${p(0.95)} ms, slowest ${times.at(-1)} ms, ${peak} connections at peak`);
  }

  await raw.end();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
