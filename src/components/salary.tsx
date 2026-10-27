import Link from "next/link";
import { and, between, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { monthPayroll } from "@/lib/payroll";
import { addDays, monthBounds, prettyMonth, rupees, PAY_MODE_LABEL } from "@/lib/format";
import { Card, Empty, Stat } from "./ui";
import { ActButton } from "./forms";
import { AdjustmentForm } from "./adjustment-form";
import { deleteAdjustment } from "@/lib/salary-actions";

const TONE: Record<string, string> = {
  P: "bg-accent-soft text-accent",
  A: "bg-expense-soft text-expense",
  H: "bg-warn-soft text-warn",
  L: "bg-surface-2 text-ink border border-line",
  WO: "bg-surface-2 text-muted border border-line",
};

// Salary slip, attendance calendar and advances for one employee and month.
const ADJ_LABEL: Record<string, string> = { bonus: "Bonus", allowance: "Allowance", deduction: "Deduction" };

// canEdit: the owner may add or remove bonus / allowance / deductions here.
export async function SalaryView({ hotelId, employeeId, month, canEdit = false }: { hotelId: number; employeeId: number; month: string; canEdit?: boolean }) {
  const db = await getDb();
  const { from, to } = monthBounds(month);
  const [row] = await monthPayroll(hotelId, month, { employeeIds: [employeeId] }, db);
  if (!row) return <Empty>Employee not found.</Empty>;
  const [att, adv] = await Promise.all([
    db.select().from(schema.attendance).where(and(eq(schema.attendance.hotelId, hotelId), eq(schema.attendance.employeeId, employeeId), between(schema.attendance.date, from, to))),
    db.select().from(schema.advances).where(and(eq(schema.advances.hotelId, hotelId), eq(schema.advances.employeeId, employeeId), between(schema.advances.date, from, to))).orderBy(desc(schema.advances.date)),
  ]);
  const byDate = new Map(att.map((a) => [a.date, a]));
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const lead = (new Date(from + "T00:00:00Z").getUTCDay() + 6) % 7; // Monday first
  const e = row.employee;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/payslip/${employeeId}?month=${month}`} className="btn btn-ghost">Payslip</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Earned so far" value={rupees(row.earned)} tone="in" hint={`${row.paidDays} paid day(s)${row.otPay ? ` + OT ${rupees(row.otPay)}` : ""}`} />
        <Stat label="Advance / loan cut" value={rupees(row.advance)} tone="warn" hint={row.loanLeft ? `Loan left after this month: ${rupees(row.loanLeft)}` : undefined} />
        <Stat label="Already paid" value={rupees(row.wagesPaid + row.salaryPaid)} hint={row.wagesPaid ? `Daily wages ${rupees(row.wagesPaid)}` : undefined} />
        <Stat label="Balance payable" value={rupees(row.net)} tone={row.net >= 0 ? "in" : "out"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title={`Attendance · ${prettyMonth(month)}`}>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="pb-1 text-muted">{d}</div>)}
            {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
            {days.map((d) => {
              const a = byDate.get(d);
              return (
                <div key={d} className={`rounded-md py-1.5 ${a ? TONE[a.status] : "text-muted"}`} title={a ? `${a.status}${a.otHours ? `, OT ${a.otHours}h` : ""}` : "Not marked"}>
                  <div className="num">{Number(d.slice(8))}</div>
                  <div className="text-[10px] font-semibold">{a?.status ?? "·"}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            P {row.counts.P} · A {row.counts.A} · Half {row.counts.H} · Leave {row.counts.L} · Week off {row.counts.WO}{row.ot ? ` · OT ${row.ot} hrs` : ""}
          </p>
        </Card>

        <Card title="Salary calculation">
          <dl className="num grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-muted">{e.payType === "monthly" ? "Monthly salary" : "Daily wage"}</dt><dd className="text-right">{rupees(row.rate)}</dd>
            <dt className="text-muted">Paid days</dt><dd className="text-right">{row.paidDays}</dd>
            <dt className="text-muted">Basic earned</dt><dd className="text-right">{rupees(row.basic)}</dd>
            <dt className="text-muted">Overtime</dt><dd className="text-right">{rupees(row.otPay)}</dd>
            {row.bonus > 0 && <><dt className="text-muted">+ Bonus</dt><dd className="text-right text-income">{rupees(row.bonus)}</dd></>}
            {row.allowance > 0 && <><dt className="text-muted">+ Allowance</dt><dd className="text-right text-income">{rupees(row.allowance)}</dd></>}
            {row.deduction > 0 && <><dt className="text-muted">- Deduction</dt><dd className="text-right text-expense">{rupees(row.deduction)}</dd></>}
            <dt className="text-muted">- Advance{row.loanDue ? " (incl. loan installment)" : ""}</dt><dd className="text-right text-expense">{rupees(row.advance)}</dd>
            <dt className="text-muted">- Wages already paid</dt><dd className="text-right text-expense">{rupees(row.wagesPaid)}</dd>
            <dt className="text-muted">- Salary paid</dt><dd className="text-right text-expense">{rupees(row.salaryPaid)}</dd>
            <dt className="border-t border-line pt-1.5 font-semibold">Balance payable</dt><dd className="border-t border-line pt-1.5 text-right font-semibold">{rupees(row.net)}</dd>
          </dl>
          {row.adjustments.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 text-xs font-medium text-muted">Bonus, allowance and deductions</div>
              <ul className="num space-y-1 text-sm">
                {row.adjustments.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3">
                    <span>{ADJ_LABEL[x.kind]} · {x.note}</span>
                    <span className="inline-flex items-center gap-3">
                      <span className={x.kind === "deduction" ? "text-expense" : "text-income"}>
                        {x.kind === "deduction" ? "-" : "+"}{rupees(x.amount)}
                      </span>
                      {canEdit && <ActButton run={deleteAdjustment.bind(null, x.id)} label="Remove" confirm={`Remove ${ADJ_LABEL[x.kind].toLowerCase()} "${x.note}"?`} />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canEdit && (
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-sm font-medium text-accent">+ Add bonus / allowance / deduction</summary>
              <div className="mt-3 sm:max-w-xs">
                <AdjustmentForm employeeId={employeeId} month={month} />
              </div>
            </details>
          )}
          {adv.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 text-xs font-medium text-muted">Advances this month</div>
              <ul className="num space-y-1 text-sm">
                {adv.map((a) => (
                  <li key={a.id} className="flex justify-between"><span>{a.date.slice(8)}/{a.date.slice(5, 7)} · {PAY_MODE_LABEL[a.paidVia]}{a.note ? ` · ${a.note}` : ""}</span><span>{rupees(a.amount)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
