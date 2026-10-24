import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { monthPayroll } from "@/lib/payroll";
import { monthBounds, prettyMonth, rupees, todayIST } from "@/lib/format";
import { Card, PageHeader, Stat } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";

export const metadata = { title: "Payroll" };

export default async function PayrollPage({ searchParams }: PageProps<"/payroll">) {
  const user = await requirePage("viewPayroll");
  const sp = await searchParams;
  const thisMonth = todayIST().slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth;
  const rows = await monthPayroll(user.hotelId, month);
  const sum = (k: "earned" | "advance" | "wagesPaid" | "net") => rows.reduce((a, r) => a + r[k], 0);
  const { days } = monthBounds(month);
  const unmarked = rows.filter((r) => r.marked < (month === thisMonth ? Number(todayIST().slice(8)) - 1 : days)).length;

  return (
    <>
      <PageHeader title="Payroll" sub={`${prettyMonth(month)}${month === thisMonth ? " · running total till today" : ""}`}>
        <PeriodPicker name="month" type="month" value={month} max={thisMonth} />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total earned" value={rupees(sum("earned"))} tone="in" hint={`${rows.length} employees`} />
        <Stat label="Advances to recover" value={rupees(sum("advance"))} tone="warn" />
        <Stat label="Daily wages already paid" value={rupees(sum("wagesPaid"))} />
        <Stat label="Balance to pay" value={rupees(sum("net"))} hint={unmarked ? `${unmarked} with missing attendance days` : "Attendance complete"} />
      </div>

      <Card>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Employee</th><th>Type</th><th className="r">P</th><th className="r">A</th><th className="r">Half</th><th className="r">Leave+WO</th><th className="r">OT h</th>
                <th className="r">Paid days</th><th className="r">Earned</th><th className="r">Advance</th><th className="r">Wages paid</th><th className="r">Balance</th>
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
                  <td className={`r num font-semibold ${r.net < 0 ? "text-expense" : ""}`}>{rupees(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted">
        Monthly staff: salary ÷ days in month × (present + leave + week off + half days ÷ 2). Daily staff: wage × (present + half days ÷ 2).
        Overtime: one day&apos;s pay ÷ 8 per hour. Advances and daily wages already paid from the counter are deducted.
      </p>
    </>
  );
}
