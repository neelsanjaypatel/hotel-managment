import "server-only";
import { and, between, desc, eq, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, schema, type DB } from "@/db";

const { sales, receipts, expenses, advances, dayBooks, expenseCategories, parties } = schema;

type ModeRow = { key: string; total: number };

const sum = (col: AnyPgColumn) => sql<number>`coalesce(sum(${col}), 0)::int`;

function pick(rows: ModeRow[], key: string) {
  return rows.find((r) => r.key === key)?.total ?? 0;
}
function total(rows: ModeRow[]) {
  return rows.reduce((a, r) => a + r.total, 0);
}

// Rows of one hotel within a date range.
const inRange = (t: { hotelId: AnyPgColumn; date: AnyPgColumn }, hotelId: number, from: string, to: string) =>
  and(eq(t.hotelId, hotelId), between(t.date, from, to));

export type Totals = Awaited<ReturnType<typeof rangeTotals>>;

// All income / expense numbers for a date range (a single day when from = to).
export async function rangeTotals(hotelId: number, from: string, to: string, db?: DB) {
  db ??= await getDb();
  const [salesByMode, salesByUnit, receiptsByMode, expByVia, expByCat, advByVia] = await Promise.all([
    db.select({ key: sales.mode, total: sum(sales.amount) }).from(sales).where(inRange(sales, hotelId, from, to)).groupBy(sales.mode),
    db.select({ key: sales.unit, total: sum(sales.amount) }).from(sales).where(inRange(sales, hotelId, from, to)).groupBy(sales.unit),
    db.select({ key: receipts.mode, total: sum(receipts.amount) }).from(receipts).where(inRange(receipts, hotelId, from, to)).groupBy(receipts.mode),
    db.select({ key: expenses.paidVia, total: sum(expenses.amount) }).from(expenses).where(inRange(expenses, hotelId, from, to)).groupBy(expenses.paidVia),
    db
      .select({ id: expenseCategories.id, name: expenseCategories.name, parentId: expenseCategories.parentId, total: sum(expenses.amount) })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(inRange(expenses, hotelId, from, to))
      .groupBy(expenseCategories.id, expenseCategories.name, expenseCategories.parentId),
    db.select({ key: advances.paidVia, total: sum(advances.amount) }).from(advances).where(inRange(advances, hotelId, from, to)).groupBy(advances.paidVia),
  ]);

  const income = total(salesByMode);
  const expense = total(expByVia);
  const cashIn = pick(salesByMode, "cash") + pick(receiptsByMode, "cash");
  const cashOut = pick(expByVia, "cash") + pick(advByVia, "cash");
  const nonCash = (rows: ModeRow[]) => total(rows) - pick(rows, "cash");
  const bankIn =
    pick(salesByMode, "upi") + pick(salesByMode, "card") + pick(salesByMode, "bank") + nonCash(receiptsByMode);
  const bankOut = nonCash(expByVia) + nonCash(advByVia);
  const onCredit = pick(salesByMode, "zomato") + pick(salesByMode, "swiggy") + pick(salesByMode, "credit");

  return {
    income,
    expense,
    net: income - expense,
    advances: total(advByVia),
    receipts: total(receiptsByMode),
    cashIn,
    cashOut,
    bankIn,
    bankOut,
    onCredit,
    salesByMode,
    salesByUnit,
    expByCat,
  };
}

// Day book row, created on first touch. Opening cash = last closed day's counted cash.
export async function ensureDay(hotelId: number, date: string, db?: DB) {
  db ??= await getDb();
  const where = and(eq(dayBooks.hotelId, hotelId), eq(dayBooks.date, date));
  const [existing] = await db.select().from(dayBooks).where(where);
  if (existing) return existing;
  const [prev] = await db
    .select({ countedCash: dayBooks.countedCash })
    .from(dayBooks)
    .where(and(eq(dayBooks.hotelId, hotelId), lt(dayBooks.date, date), eq(dayBooks.status, "closed")))
    .orderBy(desc(dayBooks.date))
    .limit(1);
  const [row] = await db
    .insert(dayBooks)
    .values({ hotelId, date, openingCash: prev?.countedCash ?? 0 })
    .onConflictDoNothing()
    .returning();
  return row ?? (await db.select().from(dayBooks).where(where))[0];
}

// Outstanding dues per party: credit-type sales minus receipts, all time.
export async function partyBalances(hotelId: number, db?: DB) {
  db ??= await getDb();
  const rows = await db
    .select({
      id: parties.id,
      name: parties.name,
      kind: parties.kind,
      phone: parties.phone,
      // Written as plain SQL: drizzle drops table qualifiers inside select-list subqueries.
      billed: sql<number>`coalesce((select sum(s.amount) from sales s where s.party_id = "parties"."id"), 0)::int`,
      received: sql<number>`coalesce((select sum(r.amount) from receipts r where r.party_id = "parties"."id"), 0)::int`,
    })
    .from(parties)
    .where(and(eq(parties.hotelId, hotelId), eq(parties.active, true)))
    .orderBy(parties.name);
  return rows.map((r) => ({ ...r, due: r.billed - r.received }));
}

// Daily income / expense series for charts.
export async function dailySeries(hotelId: number, from: string, to: string, db?: DB) {
  db ??= await getDb();
  const [inc, exp] = await Promise.all([
    db.select({ date: sales.date, total: sum(sales.amount) }).from(sales).where(inRange(sales, hotelId, from, to)).groupBy(sales.date),
    db.select({ date: expenses.date, total: sum(expenses.amount) }).from(expenses).where(inRange(expenses, hotelId, from, to)).groupBy(expenses.date),
  ]);
  const map = new Map<string, { income: number; expense: number }>();
  for (const r of inc) map.set(r.date, { income: r.total, expense: 0 });
  for (const r of exp) map.set(r.date, { income: map.get(r.date)?.income ?? 0, expense: r.total });
  return map;
}

// Group a flat category total list under parents: Food > Dairy, Grocery...
export function groupCategories(rows: Totals["expByCat"], cats: { id: number; name: string; parentId: number | null }[]) {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const groups = new Map<string, { total: number; children: { name: string; total: number }[] }>();
  for (const r of rows) {
    const parent = r.parentId ? byId.get(r.parentId)?.name ?? r.name : r.name;
    const g = groups.get(parent) ?? { total: 0, children: [] };
    g.total += r.total;
    if (r.parentId) g.children.push({ name: r.name, total: r.total });
    groups.set(parent, g);
  }
  return [...groups.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.total - a.total);
}

export type DayRow = {
  date: string;
  income: number;
  cash: number;
  bank: number;
  credit: number;
  expense: number;
  advances: number;
  receipts: number;
  status: string | null;
  diff: number | null;
};

// One row per calendar day with totals and the cash-drawer difference (closed days only).
export async function dayRows(hotelId: number, from: string, to: string, db?: DB): Promise<DayRow[]> {
  db ??= await getDb();
  const res = await db.execute(sql`
    with days as (select generate_series(${from}::date, ${to}::date, interval '1 day')::date as date),
    s as (select date,
            sum(amount) as income,
            sum(amount) filter (where mode = 'cash') as cash,
            sum(amount) filter (where mode in ('upi','card','bank')) as bank,
            sum(amount) filter (where mode in ('zomato','swiggy','credit')) as credit
          from sales where hotel_id = ${hotelId} and date between ${from} and ${to} group by date),
    e as (select date, sum(amount) as total, sum(amount) filter (where paid_via = 'cash') as cash
          from expenses where hotel_id = ${hotelId} and date between ${from} and ${to} group by date),
    a as (select date, sum(amount) as total, sum(amount) filter (where paid_via = 'cash') as cash
          from advances where hotel_id = ${hotelId} and date between ${from} and ${to} group by date),
    r as (select date, sum(amount) as total, sum(amount) filter (where mode = 'cash') as cash
          from receipts where hotel_id = ${hotelId} and date between ${from} and ${to} group by date)
    select to_char(days.date, 'YYYY-MM-DD') as date,
      coalesce(s.income, 0)::int as income, coalesce(s.cash, 0)::int as cash, coalesce(s.bank, 0)::int as bank,
      coalesce(s.credit, 0)::int as credit, coalesce(e.total, 0)::int as expense, coalesce(a.total, 0)::int as advances,
      coalesce(r.total, 0)::int as receipts, b.status,
      case when b.status = 'closed' then (b.counted_cash - (b.opening_cash - b.cash_deposit + coalesce(s.cash, 0)
        + coalesce(r.cash, 0) - coalesce(e.cash, 0) - coalesce(a.cash, 0)))::int end as diff
    from days
    left join s on s.date = days.date left join e on e.date = days.date
    left join a on a.date = days.date left join r on r.date = days.date
    left join day_books b on b.hotel_id = ${hotelId} and b.date = days.date
    order by days.date`);
  const rows = (res as unknown as { rows?: DayRow[] }).rows ?? (res as unknown as DayRow[]);
  return rows.map((r) => ({ ...r, diff: r.diff == null ? null : Number(r.diff) }));
}
