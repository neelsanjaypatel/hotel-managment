// Usage:
//   npm run seed           -> plans + the platform owner login (hotels then sign up at /signup)
//   npm run seed -- --demo -> plus two demo hotels: one paying with 45 days of data, one on trial
// Uses DATABASE_URL when set, else the local PGlite folder (.data/pglite).
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as s from "../src/db/schema";
import { DEFAULT_PLANS, createHotelWithDefaults } from "../src/db/defaults";

const DEMO = process.argv.includes("--demo");
const migrationsFolder = path.join(process.cwd(), "drizzle");

async function connect() {
  if (process.env.DATABASE_URL) {
    const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
    const db = drizzlePg(client, { schema: s });
    await migratePg(db, { migrationsFolder });
    return { db, close: () => client.end() };
  }
  const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
  const db = drizzlePglite(client, { schema: s });
  await migratePglite(db, { migrationsFolder });
  return { db, close: () => client.close() };
}


// Deterministic pseudo-random so demo data is stable between runs.
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));
const rupees = (r: number) => r * 100;

function todayIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function finish(logins: string[]) {
  const out = path.join(process.cwd(), ".data", "logins.txt");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, logins.join("\n") + "\n");
  console.log(`Seeded${DEMO ? " (demo)" : ""}. Logins written to .data/logins.txt`);
}

async function main() {
  const { db, close } = await connect();

  const [{ n: userCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users);
  if (userCount > 0) {
    console.log("Database already has users; seed skipped. Delete .data/pglite to start over locally.");
    await close();
    return;
  }

  const logins: string[] = [];
  for (const plan of DEFAULT_PLANS) await db.insert(s.plans).values(plan);
  const plans = await db.select().from(s.plans);
  const planId = (code: string) => plans.find((p) => p.code === code)!.id;

  const platformPw = DEMO ? "demo1234" : (process.env.SEED_PLATFORM_PASSWORD ?? randomBytes(9).toString("base64url"));
  await db.insert(s.users).values({ name: "Platform Owner", login: "platform", passwordHash: await bcrypt.hash(platformPw, 10), role: "superadmin" });
  logins.push(`platform / ${platformPw}  (platform owner: onboard hotels, record payments)`);

  if (!DEMO) {
    finish(logins);
    await close();
    return;
  }

  // Demo hotel 1: a year-old paying customer with 45 days of data.
  const today0 = todayIST();
  const created = await createHotelWithDefaults(db, {
    hotel: { name: "Shree Palace", city: "Vadodara", phone: "9800000000", planId: planId("growth"), hasRestaurant: true, hasRooms: true, hasBanquet: true },
    owner: { name: "Owner (Admin)", login: "admin", passwordHash: await bcrypt.hash("demo1234", 10) },
  });
  const H = created.hotel.id;
  const admin = created.owner;
  const { catIds, zomato, swiggy } = created;
  await db.update(s.hotels).set({ status: "active", paidUntil: addDays(today0, 20) }).where(eq(s.hotels.id, H));
  await db.insert(s.subscriptionPayments).values({
    hotelId: H, planId: planId("growth"), amount: 199900, months: 1, periodFrom: addDays(today0, -10), periodTo: addDays(today0, 20), method: "upi", reference: "DEMO-UTR", recordedBy: admin.id,
  });
  logins.push(`admin / demo1234  (Shree Palace owner)`);

  if (DEMO) {
    const pw = await bcrypt.hash("demo1234", 10);
    const mk = async (name: string, login: string, role: s.Role, employeeId?: number) => {
      const [u] = await db.insert(s.users).values({ hotelId: H, name, login, passwordHash: pw, role, employeeId }).returning();
      logins.push(`${login} / demo1234  (${role})`);
      return u;
    };
    const kitchenMgr = await mk("Ramesh (Kitchen Manager)", "ramesh", "manager");
    const frontMgr = await mk("Kavita (Front Office Manager)", "kavita", "manager");
    await mk("Counter Cashier", "counter", "cashier");
    await mk("Partner Mehul", "mehul", "partner");
    await mk("Partner Nisha", "nisha", "partner");
    await mk("Accountant (view only)", "accounts", "viewer");

    const [credit1] = await db.insert(s.parties).values({ hotelId: H, name: "Shah Traders (credit)", kind: "credit", phone: "9800000001" }).returning();
    const [banquet1] = await db.insert(s.parties).values({ hotelId: H, name: "Patel Family Wedding", kind: "banquet", phone: "9800000002" }).returning();

    const staff: [string, string, string, "monthly" | "daily", number, number][] = [
      // name, department, designation, payType, rate (₹), manager user id
      ["Suresh Yadav", "Kitchen", "Head Chef", "monthly", 32000, kitchenMgr.id],
      ["Manoj Kumar", "Kitchen", "Tandoor Chef", "monthly", 22000, kitchenMgr.id],
      ["Ajay Thakor", "Kitchen", "Commis", "monthly", 14000, kitchenMgr.id],
      ["Bhavesh Rathod", "Kitchen", "Helper", "daily", 550, kitchenMgr.id],
      ["Dinesh Vasava", "Kitchen", "Dishwasher", "daily", 500, kitchenMgr.id],
      ["Lalit Parmar", "Kitchen", "Helper", "daily", 550, kitchenMgr.id],
      ["Pooja Solanki", "Service", "Captain", "monthly", 18000, kitchenMgr.id],
      ["Rahul Chauhan", "Service", "Waiter", "monthly", 12000, kitchenMgr.id],
      ["Imran Shaikh", "Service", "Waiter", "monthly", 12000, kitchenMgr.id],
      ["Vijay Makwana", "Service", "Waiter", "daily", 500, kitchenMgr.id],
      ["Neha Desai", "Front Office", "Receptionist", "monthly", 16000, frontMgr.id],
      ["Kiran Patel", "Front Office", "Night Auditor", "monthly", 17000, frontMgr.id],
      ["Savita Bariya", "Housekeeping", "Room Attendant", "monthly", 11000, frontMgr.id],
      ["Geeta Vaghela", "Housekeeping", "Room Attendant", "daily", 450, frontMgr.id],
      ["Mahesh Damor", "Housekeeping", "Laundry", "daily", 450, frontMgr.id],
      ["Arjun Bhil", "Banquet", "Banquet Boy", "daily", 600, frontMgr.id],
      ["Hitesh Joshi", "Maintenance", "Electrician", "monthly", 19000, frontMgr.id],
      ["Raju Gohil", "Security", "Guard", "monthly", 13000, frontMgr.id],
    ];
    const empIds: { id: number; payType: string; rate: number }[] = [];
    let i = 1;
    for (const [name, department, designation, payType, rate, mgr] of staff) {
      const [e] = await db
        .insert(s.employees)
        .values({
          hotelId: H,
          code: `E${String(i++).padStart(3, "0")}`,
          name,
          department,
          designation,
          payType,
          rate: rupees(rate),
          joinDate: "2025-04-01",
          managerUserId: mgr,
          phone: `98${String(10000000 + i * 7919).slice(0, 8)}`,
        })
        .returning();
      empIds.push({ id: e.id, payType, rate: rupees(rate) });
    }
    await mk("Rahul Chauhan", "rahul", "employee", empIds[7].id);

    const today = todayIST();
    const start = addDays(today, -44);
    for (let d = start; d < today; d = addDays(d, 1)) {
      const weekend = [0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay());
      const boost = weekend ? 1.35 : 1;
      const by = admin.id;
      const saleRows: (typeof s.sales.$inferInsert)[] = [
        { hotelId: H, date: d, unit: "restaurant", mode: "cash", amount: rupees(Math.round(between(14000, 26000) * boost)), createdBy: by },
        { hotelId: H, date: d, unit: "restaurant", mode: "upi", amount: rupees(Math.round(between(22000, 38000) * boost)), createdBy: by },
        { hotelId: H, date: d, unit: "restaurant", mode: "card", amount: rupees(between(4000, 12000)), createdBy: by },
        { hotelId: H, date: d, unit: "restaurant", mode: "zomato", amount: rupees(between(5000, 11000)), partyId: zomato.id, createdBy: by },
        { hotelId: H, date: d, unit: "restaurant", mode: "swiggy", amount: rupees(between(3000, 8000)), partyId: swiggy.id, createdBy: by },
        { hotelId: H, date: d, unit: "rooms", mode: "upi", amount: rupees(Math.round(between(15000, 30000) * boost)), createdBy: by, reference: "Room checkouts" },
        { hotelId: H, date: d, unit: "rooms", mode: "cash", amount: rupees(between(2000, 8000)), createdBy: by },
      ];
      if (rnd() < 0.25) saleRows.push({ hotelId: H, date: d, unit: "restaurant", mode: "credit", amount: rupees(between(1500, 5000)), partyId: credit1.id, createdBy: by });
      if (weekend && rnd() < 0.6)
        saleRows.push({ hotelId: H, date: d, unit: "banquet", mode: "bank", amount: rupees(between(60000, 150000)), createdBy: by, reference: "Function booking" });
      await db.insert(s.sales).values(saleRows);

      const exp: (typeof s.expenses.$inferInsert)[] = [
        { hotelId: H, date: d, categoryId: catIds["Dairy"], amount: rupees(between(2500, 4500)), paidVia: "cash", vendor: "Amul parlour", createdBy: by },
        { hotelId: H, date: d, categoryId: catIds["Vegetables & Fruits"], amount: rupees(between(3000, 6000)), paidVia: "cash", vendor: "APMC market", createdBy: by },
      ];
      if (rnd() < 0.4) exp.push({ hotelId: H, date: d, categoryId: catIds["Grocery"], amount: rupees(between(4000, 12000)), paidVia: "upi", vendor: "Wholesale kirana", createdBy: by });
      if (rnd() < 0.3) exp.push({ hotelId: H, date: d, categoryId: catIds["Meat & Poultry"], amount: rupees(between(3000, 7000)), paidVia: "cash", createdBy: by });
      if (rnd() < 0.2) exp.push({ hotelId: H, date: d, categoryId: catIds["Repairs"], amount: rupees(between(500, 3500)), paidVia: "cash", note: "Daily maintenance", createdBy: by });
      if (rnd() < 0.15) exp.push({ hotelId: H, date: d, categoryId: catIds["Gas & Fuel"], amount: rupees(between(5000, 9000)), paidVia: "upi", vendor: "LPG agency", createdBy: by });
      if (rnd() < 0.2) exp.push({ hotelId: H, date: d, categoryId: catIds["Laundry"], amount: rupees(between(800, 2500)), paidVia: "cash", createdBy: by });
      // Daily-wage staff paid in cash at day end for days they worked.
      for (const e of empIds.filter((e) => e.payType === "daily")) {
        if (rnd() < 0.85) exp.push({ hotelId: H, date: d, categoryId: catIds["Labour Wages"], amount: e.rate, paidVia: "cash", employeeId: e.id, createdBy: by });
      }
      await db.insert(s.expenses).values(exp);

      if (rnd() < 0.15) {
        const e = empIds[between(0, empIds.length - 1)];
        await db.insert(s.advances).values({ hotelId: H, date: d, employeeId: e.id, amount: rupees(between(5, 30) * 100), paidVia: "cash", createdBy: by });
      }
      if (rnd() < 0.3) {
        await db.insert(s.receipts).values({
          hotelId: H,
          date: d,
          partyId: rnd() < 0.5 ? zomato.id : swiggy.id,
          mode: "bank",
          amount: rupees(between(15000, 40000)),
          note: "Weekly payout",
          createdBy: by,
        });
      }
    }

    await db.insert(s.sales).values({ hotelId: H, date: addDays(today, -10), unit: "banquet", mode: "credit", amount: rupees(180000), partyId: banquet1.id, reference: "Wedding, 350 plates", createdBy: admin.id });
    await db.insert(s.receipts).values({ hotelId: H, date: addDays(today, -10), partyId: banquet1.id, mode: "bank", amount: rupees(100000), note: "Advance", createdBy: admin.id });

    // Attendance and closed day books for every past day.
    let opening = rupees(20000);
    for (let d = start; d < today; d = addDays(d, 1)) {
      const rows = empIds.map((e, k) => {
        const r = rnd();
        const status = new Date(d + "T00:00:00Z").getUTCDay() === (k % 7) ? "WO" : r < 0.88 ? "P" : r < 0.94 ? "A" : r < 0.97 ? "H" : "L";
        return { hotelId: H, employeeId: e.id, date: d, status: status as s.AttendanceStatus, otHours: rnd() < 0.1 ? 2 : 0, markedBy: admin.id };
      });
      await db.insert(s.attendance).values(rows);
      // Daily wages are paid only for days worked; half day earns half.
      await db.execute(sql`delete from expenses e using attendance a
        where e.employee_id = a.employee_id and e.date = a.date and e.date = ${d} and a.status not in ('P', 'H')`);
      await db.execute(sql`update expenses e set amount = e.amount / 2 from attendance a
        where e.employee_id = a.employee_id and e.date = a.date and e.date = ${d} and a.status = 'H'`);

      const cash = await db.execute(sql`
        select
          coalesce((select sum(amount) from sales where hotel_id = ${H} and date = ${d} and mode = 'cash'), 0)::int
        + coalesce((select sum(amount) from receipts where hotel_id = ${H} and date = ${d} and mode = 'cash'), 0)::int
        - coalesce((select sum(amount) from expenses where hotel_id = ${H} and date = ${d} and paid_via = 'cash'), 0)::int
        - coalesce((select sum(amount) from advances where hotel_id = ${H} and date = ${d} and paid_via = 'cash'), 0)::int as net`);
      const net = Number((cash as unknown as { rows: { net: number }[] }).rows?.[0]?.net ?? (cash as unknown as { net: number }[])[0]?.net);
      // Most cash goes to the bank at close; small random shortages keep the report realistic.
      const deposit = opening + net > rupees(25000) ? Math.floor((opening + net - rupees(20000)) / rupees(1000)) * rupees(1000) : 0;
      const expected = opening + net - deposit;
      const counted = expected - (rnd() < 0.2 ? rupees(between(50, 400)) : 0);
      await db.insert(s.dayBooks).values({ hotelId: H, date: d, openingCash: opening, cashDeposit: deposit, countedCash: counted, status: "closed", closedBy: admin.id, closedAt: new Date() });
      opening = counted;
    }

    // Demo hotel 2: a new hotel on trial, to check that hotels never see each other's data.
    const second = await createHotelWithDefaults(db, {
      hotel: { name: "Sagar Residency", city: "Surat", phone: "9811111111", planId: planId("starter"), hasRestaurant: true, hasRooms: true },
      owner: { name: "Sagar Shah", login: "sagar", passwordHash: pw },
    });
    await db.insert(s.employees).values([
      { hotelId: second.hotel.id, code: "E001", name: "Mukesh Rana", department: "Kitchen", payType: "monthly", rate: rupees(15000), joinDate: today0 },
      { hotelId: second.hotel.id, code: "E002", name: "Sonal Mehta", department: "Front Office", payType: "monthly", rate: rupees(14000), joinDate: today0 },
    ]);
    await db.insert(s.sales).values({ hotelId: second.hotel.id, date: addDays(today0, -1), unit: "rooms", mode: "upi", amount: rupees(4200), createdBy: second.owner.id });
    logins.push(`sagar / demo1234  (Sagar Residency owner, on trial)`);
  }

  finish(logins);
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
