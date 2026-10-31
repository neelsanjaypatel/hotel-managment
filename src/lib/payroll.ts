import "server-only";
import { and, asc, between, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { monthBounds } from "./format";
import { rangeTotals } from "./ledger";

const { employees, attendance, advances, expenses, expenseCategories, salaryPayments, employeeRates, salaryAdjustments } = schema;

export type PayrollRow = Awaited<ReturnType<typeof monthPayroll>>[number];

// Whole months from `fromMonth` to `toMonth` (YYYY-MM), 0 when equal.
function monthsBetween(fromMonth: string, toMonth: string) {
  const [y1, m1] = fromMonth.split("-").map(Number);
  const [y2, m2] = toMonth.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// A loan of `amount` recovered `inst` per month starting in its own month:
// what is due in `month`, and what is still left after it.
export function loanSchedule(amount: number, inst: number, loanMonth: string, month: string) {
  const k = monthsBetween(loanMonth, month);
  if (k < 0) return { due: 0, left: amount };
  const before = Math.min(amount, inst * k);
  const due = Math.min(inst, amount - before);
  return { due, left: amount - before - due };
}

// Salary sheet for one month.
// monthly: rate / days-in-month for each paid day (P, L, WO full; H half).
// daily:   rate for each worked day (P full; H half). Wages already paid in cash
//          during the month (Labour Wages expenses) are subtracted.
// The rate is the one in force on each day (employee_rates), so a raise in November
// does not change October. OT: that day's per-day rate / 8 per hour.
// Advances given in the month are recovered in full; loans (advances with an
// installment) are recovered one installment per month.
// Salary already handed over for this month (salary_payments.month) is subtracted too.
// Bonus and allowance entries for the month are added; deductions are taken off.
export async function monthPayroll(hotelId: number, month: string, opts: { employeeIds?: number[] } = {}, db?: DB) {
  db ??= await getDb();
  const { from, to, days } = monthBounds(month);
  // Someone who left mid-month is inactive now but still has salary due for the days worked,
  // so the sheet includes anyone with attendance or an advance in the month.
  const workedThisMonth = sql`(${employees.active} or exists (select 1 from attendance a where a.employee_id = ${employees.id} and a.date between ${from} and ${to})
    or exists (select 1 from advances v where v.employee_id = ${employees.id} and v.date between ${from} and ${to})
    or exists (select 1 from salary_payments p where p.employee_id = ${employees.id} and p.month = ${month})
    or exists (select 1 from salary_adjustments j where j.employee_id = ${employees.id} and j.month = ${month}))`;
  const empFilter = and(eq(employees.hotelId, hotelId), opts.employeeIds ? inArray(employees.id, opts.employeeIds) : workedThisMonth);

  const [emps, att, adv, wages, salary, rates, adjustments] = await Promise.all([
    db.select().from(employees).where(empFilter).orderBy(employees.department, employees.name),
    db
      .select({ employeeId: attendance.employeeId, date: attendance.date, status: attendance.status, ot: attendance.otHours })
      .from(attendance)
      .where(and(eq(attendance.hotelId, hotelId), between(attendance.date, from, to))),
    // Advances of this month, plus older loans that may still be recovering.
    db
      .select({ employeeId: advances.employeeId, date: advances.date, amount: advances.amount, installment: advances.installment })
      .from(advances)
      .where(and(eq(advances.hotelId, hotelId), lte(advances.date, to))),
    db
      .select({ employeeId: expenses.employeeId, total: sql<number>`sum(${expenses.amount})::float8` })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(and(eq(expenses.hotelId, hotelId), between(expenses.date, from, to), eq(expenseCategories.isWages, true)))
      .groupBy(expenses.employeeId),
    db
      .select({ employeeId: salaryPayments.employeeId, total: sql<number>`sum(${salaryPayments.amount})::float8` })
      .from(salaryPayments)
      .where(and(eq(salaryPayments.hotelId, hotelId), eq(salaryPayments.month, month)))
      .groupBy(salaryPayments.employeeId),
    db
      .select({ employeeId: employeeRates.employeeId, fromDate: employeeRates.fromDate, rate: employeeRates.rate })
      .from(employeeRates)
      .where(eq(employeeRates.hotelId, hotelId))
      .orderBy(asc(employeeRates.fromDate)),
    db
      .select()
      .from(salaryAdjustments)
      .where(and(eq(salaryAdjustments.hotelId, hotelId), eq(salaryAdjustments.month, month)))
      .orderBy(asc(salaryAdjustments.id)),
  ]);

  return emps.map((e) => {
    const history = rates.filter((r) => r.employeeId === e.id);
    // Rate on a date: last change on or before it; before any history, the earliest known.
    const rateOn = (date: string) => {
      let r = history[0]?.rate ?? e.rate;
      for (const h of history) if (h.fromDate <= date) r = h.rate;
      return r;
    };
    const perDayOn = (date: string) => (e.payType === "monthly" ? rateOn(date) / days : rateOn(date));
    const weight = (s: string) => (s === "H" ? 0.5 : s === "P" ? 1 : e.payType === "monthly" && (s === "L" || s === "WO") ? 1 : 0);

    const mine = att.filter((a) => a.employeeId === e.id);
    const c = (s: string) => mine.filter((a) => a.status === s).length;
    const counts = { P: c("P"), A: c("A"), H: c("H"), L: c("L"), WO: c("WO") };
    const ot = mine.reduce((a, r) => a + r.ot, 0);
    const paidDays = mine.reduce((a, r) => a + weight(r.status), 0);
    const basic = Math.round(mine.reduce((a, r) => a + weight(r.status) * perDayOn(r.date), 0));
    const otPay = Math.round(mine.reduce((a, r) => a + (perDayOn(r.date) / 8) * r.ot, 0));
    const extras = adjustments.filter((x) => x.employeeId === e.id);
    const sumOf = (kind: string) => extras.filter((x) => x.kind === kind).reduce((a, x) => a + x.amount, 0);
    const bonus = sumOf("bonus");
    const allowance = sumOf("allowance");
    const deduction = sumOf("deduction");
    // Gross pay for the month: attendance pay + OT + bonus + allowance - deductions.
    const earned = basic + otPay + bonus + allowance - deduction;

    let advance = 0;
    let loanDue = 0;
    let loanLeft = 0;
    for (const a of adv.filter((x) => x.employeeId === e.id)) {
      if (a.installment) {
        const s = loanSchedule(a.amount, a.installment, a.date.slice(0, 7), month);
        loanDue += s.due;
        loanLeft += s.left;
      } else if (a.date >= from) {
        advance += a.amount;
      }
    }
    const wagesPaid = wages.find((w) => w.employeeId === e.id)?.total ?? 0;
    const salaryPaid = salary.find((s) => s.employeeId === e.id)?.total ?? 0;
    return {
      employee: e,
      rate: rateOn(to),
      counts,
      marked: mine.length,
      ot,
      paidDays,
      basic,
      otPay,
      bonus,
      allowance,
      deduction,
      adjustments: extras,
      earned,
      advance: advance + loanDue,
      loanDue,
      loanLeft,
      wagesPaid,
      salaryPaid,
      net: earned - advance - loanDue - wagesPaid - salaryPaid,
    };
  });
}

// Month profit counting staff cost as earned (payroll), not as paid. Daily wages paid from
// the counter are expenses in the "Labour Wages" category; they are left out of other
// expenses here because payroll's "earned" already includes that work.
export async function monthProfit(hotelId: number, month: string, db?: DB) {
  db ??= await getDb();
  const { from, to } = monthBounds(month);
  const [totals, rows, [w]] = await Promise.all([
    rangeTotals(hotelId, from, to, db),
    monthPayroll(hotelId, month, {}, db),
    db
      .select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)::float8` })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(and(eq(expenses.hotelId, hotelId), between(expenses.date, from, to), eq(expenseCategories.isWages, true))),
  ]);
  const salaries = rows.reduce((a, r) => a + r.earned, 0);
  const otherExpenses = totals.expense - w.total;
  return { income: totals.income, otherExpenses, salaries, profit: totals.income - otherExpenses - salaries, totals };
}
