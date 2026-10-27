import "server-only";
import { and, between, desc, eq, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, schema, type DB } from "@/db";

const { sales, receipts, expenses, advances, dayBooks, expenseCategories, parties, salaryPayments, supplierPayments, partnerDrawings, cashTransfers } =
  schema;

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
// Money leaving the drawer or bank comes from several tables; only expenses and the
// commission Zomato / Swiggy keep back are costs. Advances, salary, supplier payments
// and partner withdrawals move money without being an expense of that day.
export async function rangeTotals(hotelId: number, from: string, to: string, db?: DB) {
  db ??= await getDb();
  const byMode = <T extends { hotelId: AnyPgColumn; date: AnyPgColumn; amount: AnyPgColumn; paidVia: AnyPgColumn }>(table: T) =>
    db
      .select({ key: table.paidVia, total: sum(table.amount) })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(table as any)
      .where(inRange(table, hotelId, from, to))
      .groupBy(table.paidVia) as Promise<ModeRow[]>;
  const [salesByMode, salesByUnit, receiptsByMode, [comm], expByVia, expByCat, advByVia, salByVia, supByVia, drawByVia, transfers] =
    await Promise.all([
      db.select({ key: sales.mode, total: sum(sales.amount) }).from(sales).where(inRange(sales, hotelId, from, to)).groupBy(sales.mode),
      db.select({ key: sales.unit, total: sum(sales.amount) }).from(sales).where(inRange(sales, hotelId, from, to)).groupBy(sales.unit),
      db.select({ key: receipts.mode, total: sum(receipts.amount) }).from(receipts).where(inRange(receipts, hotelId, from, to)).groupBy(receipts.mode),
      db.select({ total: sum(receipts.commission) }).from(receipts).where(inRange(receipts, hotelId, from, to)),
      byMode(expenses),
      db
        .select({ id: expenseCategories.id, name: expenseCategories.name, parentId: expenseCategories.parentId, total: sum(expenses.amount) })
        .from(expenses)
        .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
        .where(inRange(expenses, hotelId, from, to))
        .groupBy(expenseCategories.id, expenseCategories.name, expenseCategories.parentId),
      byMode(advances),
      byMode(salaryPayments),
      byMode(supplierPayments),
      byMode(partnerDrawings),
      db
        .select({ key: cashTransfers.direction, total: sum(cashTransfers.amount) })
        .from(cashTransfers)
        .where(inRange(cashTransfers, hotelId, from, to))
        .groupBy(cashTransfers.direction),
    ]);

  const commission = comm?.total ?? 0;
  const income = total(salesByMode);
  const expense = total(expByVia) + commission;
  const toBank = pick(transfers, "to_bank");
  const toCash = pick(transfers, "to_cash");
  // Paid other than in cash and not left on credit: came out of the bank.
  const banked = (rows: ModeRow[]) => total(rows) - pick(rows, "cash") - pick(rows, "credit");
  const outflows = [expByVia, advByVia, salByVia, supByVia, drawByVia];
  const cashIn = pick(salesByMode, "cash") + pick(receiptsByMode, "cash") + toCash;
  const cashOut = outflows.reduce((a, rows) => a + pick(rows, "cash"), 0) + toBank;
  const bankIn =
    pick(salesByMode, "upi") + pick(salesByMode, "card") + pick(salesByMode, "bank") + banked(receiptsByMode) + toBank;
  const bankOut = outflows.reduce((a, rows) => a + banked(rows), 0) + toCash;
  const onCredit = pick(salesByMode, "zomato") + pick(salesByMode, "swiggy") + pick(salesByMode, "credit");

  return {
    income,
    expense,
    net: income - expense,
    commission,
    creditPurchases: pick(expByVia, "credit"),
    advances: total(advByVia),
    salaryPaid: total(salByVia),
    supplierPaid: total(supByVia),
    drawings: total(drawByVia),
    toBank,
    toCash,
    receipts: total(receiptsByMode),
    cashIn,
    cashOut,
    bankIn,
    bankOut,
    onCredit,
    salesByMode,
    salesByUnit,
    // Commission shows as its own line in the category breakdown.
    expByCat: commission ? [...expByCat, { id: -1, name: "Zomato / Swiggy commission", parentId: null, total: commission }] : expByCat,
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

// Day book for display. Unlike ensureDay it never writes, so just looking at a date
// does not leave an "open" day behind.
export async function getDay(hotelId: number, date: string, db?: DB) {
  db ??= await getDb();
  const [existing] = await db.select().from(dayBooks).where(and(eq(dayBooks.hotelId, hotelId), eq(dayBooks.date, date)));
  if (existing) return existing;
  const [prev] = await db
    .select({ countedCash: dayBooks.countedCash })
    .from(dayBooks)
    .where(and(eq(dayBooks.hotelId, hotelId), lt(dayBooks.date, date), eq(dayBooks.status, "closed")))
    .orderBy(desc(dayBooks.date))
    .limit(1);
  return {
    hotelId,
    date,
    openingCash: prev?.countedCash ?? 0,
    countedCash: null,
    cashDeposit: 0,
    status: "open" as const,
    closedBy: null,
    closedAt: null,
    note: null,
  };
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
      received: sql<number>`coalesce((select sum(r.amount + r.commission) from receipts r where r.party_id = "parties"."id"), 0)::int`,
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
  salary: number;
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
    a as (select date, sum(amount) as total
          from advances where hotel_id = ${hotelId} and date between ${from} and ${to} group by date),
    r as (select date, sum(amount) as total, sum(commission) as commission, sum(amount) filter (where mode = 'cash') as cash
          from receipts where hotel_id = ${hotelId} and date between ${from} and ${to} group by date),
    sp as (select date, sum(amount) as total
          from salary_payments where hotel_id = ${hotelId} and date between ${from} and ${to} group by date),
    -- cash paid out other than expenses: advances, salary, suppliers, partner withdrawals
    oc as (select date, sum(amount) as cash from (
            select date, amount from advances where hotel_id = ${hotelId} and paid_via = 'cash' and date between ${from} and ${to}
            union all select date, amount from salary_payments where hotel_id = ${hotelId} and paid_via = 'cash' and date between ${from} and ${to}
            union all select date, amount from supplier_payments where hotel_id = ${hotelId} and paid_via = 'cash' and date between ${from} and ${to}
            union all select date, amount from partner_drawings where hotel_id = ${hotelId} and paid_via = 'cash' and date between ${from} and ${to}
          ) x group by date),
    t as (select date, sum(amount) filter (where direction = 'to_bank') as to_bank, sum(amount) filter (where direction = 'to_cash') as to_cash
          from cash_transfers where hotel_id = ${hotelId} and date between ${from} and ${to} group by date)
    select to_char(days.date, 'YYYY-MM-DD') as date,
      coalesce(s.income, 0)::int as income, coalesce(s.cash, 0)::int as cash, coalesce(s.bank, 0)::int as bank,
      coalesce(s.credit, 0)::int as credit, (coalesce(e.total, 0) + coalesce(r.commission, 0))::int as expense,
      coalesce(a.total, 0)::int as advances, coalesce(sp.total, 0)::int as salary, coalesce(r.total, 0)::int as receipts, b.status,
      case when b.status = 'closed' then (b.counted_cash - (b.opening_cash - b.cash_deposit + coalesce(s.cash, 0)
        + coalesce(r.cash, 0) + coalesce(t.to_cash, 0) - coalesce(e.cash, 0) - coalesce(oc.cash, 0) - coalesce(t.to_bank, 0)))::int end as diff
    from days
    left join s on s.date = days.date left join e on e.date = days.date
    left join a on a.date = days.date left join r on r.date = days.date left join sp on sp.date = days.date
    left join oc on oc.date = days.date left join t on t.date = days.date
    left join day_books b on b.hotel_id = ${hotelId} and b.date = days.date
    order by days.date`);
  const rows = (res as unknown as { rows?: DayRow[] }).rows ?? (res as unknown as DayRow[]);
  return rows.map((r) => ({ ...r, diff: r.diff == null ? null : Number(r.diff) }));
}

// What each supplier is owed: goods taken on credit minus payments made to them.
// `bought` also counts purchases paid on the spot, for the full picture.
export async function supplierBalances(hotelId: number, db?: DB) {
  db ??= await getDb();
  const { suppliers } = schema;
  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      phone: suppliers.phone,
      note: suppliers.note,
      // Plain SQL: drizzle drops table qualifiers inside select-list subqueries.
      bought: sql<number>`coalesce((select sum(e.amount) from expenses e where e.supplier_id = "suppliers"."id"), 0)::int`,
      onCredit: sql<number>`coalesce((select sum(e.amount) from expenses e where e.supplier_id = "suppliers"."id" and e.paid_via = 'credit'), 0)::int`,
      paid: sql<number>`coalesce((select sum(p.amount) from supplier_payments p where p.supplier_id = "suppliers"."id"), 0)::int`,
    })
    .from(suppliers)
    .where(and(eq(suppliers.hotelId, hotelId), eq(suppliers.active, true)))
    .orderBy(suppliers.name);
  return rows.map((r) => ({ ...r, due: r.onCredit - r.paid }));
}
