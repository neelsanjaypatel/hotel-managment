import Link from "next/link";
import { requirePage, can } from "@/lib/auth";
import { monthPayroll } from "@/lib/payroll";
import { monthBounds, prettyMonth, rupees, rupeesPlain, todayIST, isMonth, PAY_MODE_LABEL } from "@/lib/format";
import { payAllSalaries, paySalary } from "@/lib/salary-actions";
import { Card, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Input, PeriodPicker, Select } from "@/components/forms";

const MODES = Object.entries(PAY_MODE_LABEL).map(([value, label]) => ({ value, label }));

export const metadata = { title: "Payroll" };

export default async function PayrollPage({ searchParams }: PageProps<"/payroll">) {
  const user = await requirePage("viewPayroll");
  const sp = await searchParams;
  const thisMonth = todayIST().slice(0, 7);
  const month = isMonth(sp.month) ? sp.month : thisMonth;
  const rows = await monthPayroll(user.hotelId, month);
  const sum = (k: "earned" | "advance" | "wagesPaid" | "salaryPaid" | "net") => rows.reduce((a, r) => a + r[k], 0);
  // Salary is handed over by the owner from today's counter.
  const canPay = can(user, "manageMaster") && user.access.canWrite;
  const dueCount = rows.filter((r) => r.net > 0).length;
  const dueTotal = rows.reduce((a, r) => a + Math.max(0, r.net), 0);
  const { days } = monthBounds(month);
  const unmarked = rows.filter((r) => r.marked < (month === thisMonth ? Number(todayIST().slice(8)) - 1 : days)).length;

  return (
    <>
      <PageHeader title="Payroll" sub={`${prettyMonth(month)}${month === thisMonth ? " · running total till today" : ""}`}>
        <PeriodPicker name="month" type="month" value={month} max={thisMonth} />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total earned" value={rupees(sum("earned"))} tone="in" hint={`${rows.length} ${rows.length === 1 ? "employee" : "employees"}`} />
        <Stat label="Advances to recover" value={rupees(sum("advance"))} tone="warn" />
        <Stat label="Already paid" value={rupees(sum("wagesPaid") + sum("salaryPaid"))} hint={`Daily wages ${rupees(sum("wagesPaid"))} · salary ${rupees(sum("salaryPaid"))}`} />
        <Stat label="Balance to pay" value={rupees(sum("net"))} hint={unmarked ? `${unmarked} with missing attendance days` : "Attendance complete"} />
      </div>

      {canPay && dueCount > 0 && (
        <Card title={`Pay all balances for ${prettyMonth(month)}`} className="mb-4">
          <ActionForm action={payAllSalaries} submit={`Pay ${rupees(dueTotal)} to ${dueCount} ${dueCount === 1 ? "employee" : "employees"}`} resetOnOk={false}>
            <input type="hidden" name="month" value={month} />
            <div className="sm:max-w-xs">
              <Select name="paidVia" label="Paid by" options={MODES} defaultValue="bank" />
            </div>
            <p className="mt-2 text-xs text-muted">Recorded as paid today. Cash payments come out of today&apos;s cash drawer.</p>
          </ActionForm>
        </Card>
      )}

      <Card>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Employee</th><th>Type</th><th className="r">P</th><th className="r">A</th><th className="r">Half</th><th className="r">Leave+WO</th><th className="r">OT h</th>
                <th className="r">Paid days</th><th className="r">Earned</th><th className="r">Advance</th><th className="r">Wages paid</th><th className="r">Salary paid</th><th className="r">Balance</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee.id}>
                  <td>
                    <Link href={`/employees/${r.employee.id}?month=${month}`} className="font-medium hover:text-accent">{r.employee.name}</Link>
                    <div className="text-xs text-muted">{r.employee.department}</div>
                  </td>
                  <td className="text-muted">{r.employee.payType === "monthly" ? "Monthly" : "Daily"}</td>
                  <td className="r num">{r.counts.P}</td>
                  <td className="r num">{r.counts.A || ""}</td>
                  <td className="r num">{r.counts.H || ""}</td>
                  <td className="r num">{r.counts.L + r.counts.WO || ""}</td>
                  <td className="r num">{r.ot || ""}</td>
                  <td className="r num">{r.paidDays}</td>
                  <td className="r num">{rupees(r.earned)}</td>
                  <td className="r num text-warn">{r.advance ? rupees(r.advance) : ""}</td>
                  <td className="r num">{r.wagesPaid ? rupees(r.wagesPaid) : ""}</td>
                  <td className="r num">{r.salaryPaid ? rupees(r.salaryPaid) : ""}</td>
                  <td className={`r num font-semibold ${r.net < 0 ? "text-expense" : ""}`}>{rupees(r.net)}</td>
                  <td className="r whitespace-nowrap">
                    <span className="inline-flex items-start gap-3">
                      <Link href={`/payslip/${r.employee.id}?month=${month}`} className="text-xs text-accent">Payslip</Link>
                      {canPay && r.net > 0 && (
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs font-semibold text-accent">Pay</summary>
                          <div className="mt-2 w-56">
                            <ActionForm action={paySalary} submit="Pay">
                              <input type="hidden" name="month" value={month} />
                              <input type="hidden" name="employeeId" value={r.employee.id} />
                              <div className="space-y-2">
                                <Input name="amount" label="Amount (₹)" inputMode="decimal" defaultValue={rupeesPlain(r.net)} required />
                                <Select name="paidVia" label="Paid by" options={MODES} defaultValue="cash" />
                              </div>
                            </ActionForm>
                          </div>
                        </details>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted">
        Monthly staff: salary ÷ days in month × (present + leave + week off + half days ÷ 2). Daily staff: wage × (present + half days ÷ 2).
        Overtime: one day&apos;s pay ÷ 8 per hour. Advances, daily wages already paid from the counter and salary already paid for this month are deducted.
      </p>
    </>
  );
}
