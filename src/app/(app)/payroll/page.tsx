import Link from "next/link";
import { requirePage, can } from "@/lib/auth";
import { monthPayroll } from "@/lib/payroll";
import { monthBounds, prettyMonth, rupees, rupeesPlain, todayIST, isMonth, PAY_MODE_LABEL } from "@/lib/format";
import { payAllSalaries, paySalary } from "@/lib/salary-actions";
import { AdjustmentForm } from "@/components/adjustment-form";
import { Card, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Input, PeriodPicker, Select } from "@/components/forms";
import { getT } from "@/i18n/server";

const MODES = Object.entries(PAY_MODE_LABEL).map(([value, label]) => ({ value, label }));

export const metadata = { title: "Payroll" };

export default async function PayrollPage({ searchParams }: PageProps<"/payroll">) {
  const t = await getT();
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
      <PageHeader title={t("Payroll")} sub={`${prettyMonth(month, t.locale)}${month === thisMonth ? ` · ${t("running total till today")}` : ""}`}>
        <PeriodPicker name="month" type="month" value={month} max={thisMonth} />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Total earned")} value={rupees(sum("earned"))} tone="in" hint={rows.length === 1 ? t("1 employee") : t("{n} employees", { n: rows.length })} />
        <Stat label={t("Advances to recover")} value={rupees(sum("advance"))} tone="warn" />
        <Stat label={t("Already paid")} value={rupees(sum("wagesPaid") + sum("salaryPaid"))} hint={t("Daily wages {wages} · salary {salary}", { wages: rupees(sum("wagesPaid")), salary: rupees(sum("salaryPaid")) })} />
        <Stat label={t("Balance to pay")} value={rupees(sum("net"))} hint={unmarked ? t("{n} with missing attendance days", { n: unmarked }) : t("Attendance complete")} />
      </div>

      {canPay && dueCount > 0 && (
        <Card title={t("Pay all balances for {month}", { month: prettyMonth(month, t.locale) })} className="mb-4">
          <ActionForm action={payAllSalaries} submit={dueCount === 1 ? t("Pay {amount} to 1 employee", { amount: rupees(dueTotal) }) : t("Pay {amount} to {n} employees", { amount: rupees(dueTotal), n: dueCount })} resetOnOk={false}>
            <input type="hidden" name="month" value={month} />
            <div className="sm:max-w-xs">
              <Select name="paidVia" label={t("Paid by")} options={MODES} defaultValue="bank" />
            </div>
            <p className="mt-2 text-xs text-muted">{t("Recorded as paid today. Cash payments come out of today's cash drawer.")}</p>
          </ActionForm>
        </Card>
      )}

      <Card>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Employee")}</th><th>{t("Type")}</th><th className="r">P</th><th className="r">A</th><th className="r">{t("Half")}</th><th className="r">{t("Leave+WO")}</th><th className="r">{t("OT h")}</th>
                <th className="r">{t("Paid days")}</th><th className="r">{t("+ Bonus / allow.")}</th><th className="r">{t("− Deduction")}</th><th className="r">{t("Earned")}</th><th className="r">{t("Advance")}</th><th className="r">{t("Wages paid")}</th><th className="r">{t("Salary paid")}</th><th className="r">{t("Balance")}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee.id}>
                  <td>
                    <Link href={`/employees/${r.employee.id}?month=${month}`} className="font-medium hover:text-accent">{r.employee.name}</Link>
                    <div className="text-xs text-muted">{r.employee.department}</div>
                  </td>
                  <td className="text-muted">{r.employee.payType === "monthly" ? t("Monthly") : t("Daily")}</td>
                  <td className="r num">{r.counts.P}</td>
                  <td className="r num">{r.counts.A || ""}</td>
                  <td className="r num">{r.counts.H || ""}</td>
                  <td className="r num">{r.counts.L + r.counts.WO || ""}</td>
                  <td className="r num">{r.ot || ""}</td>
                  <td className="r num">{r.paidDays}</td>
                  <td className="r num text-income">{r.bonus + r.allowance ? rupees(r.bonus + r.allowance) : ""}</td>
                  <td className="r num text-expense">{r.deduction ? rupees(r.deduction) : ""}</td>
                  <td className="r num">{rupees(r.earned)}</td>
                  <td className="r num text-warn">{r.advance ? rupees(r.advance) : ""}</td>
                  <td className="r num">{r.wagesPaid ? rupees(r.wagesPaid) : ""}</td>
                  <td className="r num">{r.salaryPaid ? rupees(r.salaryPaid) : ""}</td>
                  <td className={`r num font-semibold ${r.net < 0 ? "text-expense" : ""}`}>{rupees(r.net)}</td>
                  <td className="r whitespace-nowrap">
                    <span className="inline-flex items-start gap-3">
                      <Link href={`/payslip/${r.employee.id}?month=${month}`} className="text-xs text-accent">{t("Payslip")}</Link>
                      {canPay && (
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs text-muted">{t("+ Adjust")}</summary>
                          <div className="mt-2 w-60">
                            <AdjustmentForm employeeId={r.employee.id} month={month} />
                          </div>
                        </details>
                      )}
                      {canPay && r.net > 0 && (
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs font-semibold text-accent">{t("Pay")}</summary>
                          <div className="mt-2 w-56">
                            <ActionForm action={paySalary} submit={t("Pay")}>
                              <input type="hidden" name="month" value={month} />
                              <input type="hidden" name="employeeId" value={r.employee.id} />
                              <div className="space-y-2">
                                <Input name="amount" label={t("Amount (₹)")} inputMode="decimal" defaultValue={rupeesPlain(r.net)} required />
                                <Select name="paidVia" label={t("Paid by")} options={MODES} defaultValue="cash" />
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
        {t("Monthly staff: salary ÷ days in month × (present + leave + week off + half days ÷ 2). Daily staff: wage × (present + half days ÷ 2). Overtime: one day's pay ÷ 8 per hour. Bonus and allowance are added, deductions taken off. Advances, daily wages already paid from the counter and salary already paid for this month are deducted.")}
      </p>
    </>
  );
}
