import Link from "next/link";
import { and, between, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { monthPayroll } from "@/lib/payroll";
import { addDays, monthBounds, prettyMonth, rupees, PAY_MODE_LABEL } from "@/lib/format";
import { Card, Empty, Stat } from "./ui";

const TONE: Record<string, string> = {
  P: "bg-accent-soft text-accent",
  A: "bg-expense-soft text-expense",
  H: "bg-warn-soft text-warn",
  L: "bg-surface-2 text-ink border border-line",
  WO: "bg-surface-2 text-muted border border-line",
};

// Salary slip, attendance calendar and advances for one employee and month.
export async function SalaryView({ hotelId, employeeId, month }: { hotelId: number; employeeId: number; month: string }) {
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
        <Stat label="Advance taken" value={rupees(row.advance)} tone="warn" />
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
            <dt className="text-muted">{e.payType === "monthly" ? "Monthly salary" : "Daily wage"}</dt><dd className="text-right">{rupees(e.rate)}</dd>
            <dt className="text-muted">Paid days</dt><dd className="text-right">{row.paidDays}</dd>
            <dt className="text-muted">Basic earned</dt><dd className="text-right">{rupees(row.basic)}</dd>
            <dt className="text-muted">Overtime</dt><dd className="text-right">{rupees(row.otPay)}</dd>
            <dt className="text-muted">- Advance</dt><dd className="text-right text-expense">{rupees(row.advance)}</dd>
            <dt className="text-muted">- Wages already paid</dt><dd className="text-right text-expense">{rupees(row.wagesPaid)}</dd>
            <dt className="text-muted">- Salary paid</dt><dd className="text-right text-expense">{rupees(row.salaryPaid)}</dd>
            <dt className="border-t border-line pt-1.5 font-semibold">Balance payable</dt><dd className="border-t border-line pt-1.5 text-right font-semibold">{rupees(row.net)}</dd>
          </dl>
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
