import "server-only";
import { and, between, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { monthBounds } from "./format";

const { employees, attendance, advances, expenses, expenseCategories } = schema;

export type PayrollRow = Awaited<ReturnType<typeof monthPayroll>>[number];

// Salary sheet for one month.
// monthly: rate / days-in-month per paid day (P, L, WO full; H half).
// daily:   rate per worked day (P full; H half). Wages already paid in cash
//          during the month (Labour Wages expenses) are subtracted.
// OT: per-day rate / 8 per hour, both types. Advances in the month are recovered.
export async function monthPayroll(hotelId: number, month: string, opts: { employeeIds?: number[] } = {}, db?: DB) {
  db ??= await getDb();
  const { from, to, days } = monthBounds(month);
  // Someone who left mid-month is inactive now but still has salary due for the days worked,
  // so the sheet includes anyone with attendance or an advance in the month.
  const workedThisMonth = sql`(${employees.active} or exists (select 1 from attendance a where a.employee_id = ${employees.id} and a.date between ${from} and ${to})
    or exists (select 1 from advances v where v.employee_id = ${employees.id} and v.date between ${from} and ${to}))`;
  const empFilter = and(eq(employees.hotelId, hotelId), opts.employeeIds ? inArray(employees.id, opts.employeeIds) : workedThisMonth);

  const [emps, att, adv, wages] = await Promise.all([
    db.select().from(employees).where(empFilter).orderBy(employees.department, employees.name),
    db
      .select({
        employeeId: attendance.employeeId,
        status: attendance.status,
        n: sql<number>`count(*)::int`,
        ot: sql<number>`coalesce(sum(${attendance.otHours}), 0)::real`,
      })
      .from(attendance)
      .where(and(eq(attendance.hotelId, hotelId), between(attendance.date, from, to)))
      .groupBy(attendance.employeeId, attendance.status),
    db
      .select({ employeeId: advances.employeeId, total: sql<number>`sum(${advances.amount})::int` })
      .from(advances)
      .where(and(eq(advances.hotelId, hotelId), between(advances.date, from, to)))
      .groupBy(advances.employeeId),
    db
      .select({ employeeId: expenses.employeeId, total: sql<number>`sum(${expenses.amount})::int` })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(and(eq(expenses.hotelId, hotelId), between(expenses.date, from, to), eq(expenseCategories.isWages, true)))
      .groupBy(expenses.employeeId),
  ]);

  return emps.map((e) => {
    const mine = att.filter((a) => a.employeeId === e.id);
    const c = (s: string) => mine.find((a) => a.status === s)?.n ?? 0;
    const counts = { P: c("P"), A: c("A"), H: c("H"), L: c("L"), WO: c("WO") };
    const ot = mine.reduce((a, r) => a + r.ot, 0);
    const perDay = e.payType === "monthly" ? e.rate / days : e.rate;
    const paidDays =
      e.payType === "monthly" ? counts.P + counts.L + counts.WO + counts.H / 2 : counts.P + counts.H / 2;
    const basic = Math.round(perDay * paidDays);
    const otPay = Math.round((perDay / 8) * ot);
    const earned = basic + otPay;
    const advance = adv.find((a) => a.employeeId === e.id)?.total ?? 0;
    const wagesPaid = wages.find((w) => w.employeeId === e.id)?.total ?? 0;
    return {
      employee: e,
      counts,
      marked: mine.reduce((a, r) => a + r.n, 0),
      ot,
      paidDays,
      basic,
      otPay,
      earned,
      advance,
      wagesPaid,
      net: earned - advance - wagesPaid,
    };
  });
}
