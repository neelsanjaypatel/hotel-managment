import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { dayRows } from "@/lib/ledger";
import { monthBounds, prettyDate, prettyMonth, rupees, todayIST } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requirePage("viewReports");
  const sp = await searchParams;
  const today = todayIST();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const rows = (await dayRows(user.hotelId, from, to < today ? to : today)).reverse();
  const t = rows.reduce(
    (a, r) => ({ income: a.income + r.income, cash: a.cash + r.cash, bank: a.bank + r.bank, credit: a.credit + r.credit, expense: a.expense + r.expense, advances: a.advances + r.advances, diff: a.diff + (r.diff ?? 0) }),
    { income: 0, cash: 0, bank: 0, credit: 0, expense: 0, advances: 0, diff: 0 },
  );

  return (
    <>
      <PageHeader title="Day-wise report" sub={prettyMonth(month)}>
        <PeriodPicker name="month" type="month" value={month} max={today.slice(0, 7)} />
        <a className="btn btn-ghost" href={`/reports/export?month=${month}`}>Download Excel (CSV)</a>
      </PageHeader>
      <Card>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th><th className="r">Income</th><th className="r">Cash</th><th className="r">Bank/UPI/Card</th><th className="r">Zomato/Swiggy/Credit</th>
                <th className="r">Expense</th><th className="r">Net</th><th className="r">Advances</th><th className="r">Cash diff</th><th>Day</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td className="whitespace-nowrap"><Link href={`/counter?date=${r.date}`} className="hover:text-accent">{prettyDate(r.date).replace(/,/g, "").replace(/ \d{4}$/, "")}</Link></td>
                  <td className="r num text-income">{rupees(r.income)}</td>
                  <td className="r num">{rupees(r.cash)}</td>
                  <td className="r num">{rupees(r.bank)}</td>
                  <td className="r num">{rupees(r.credit)}</td>
                  <td className="r num text-expense">{rupees(r.expense)}</td>
                  <td className="r num font-medium">{rupees(r.income - r.expense)}</td>
                  <td className="r num">{r.advances ? rupees(r.advances) : ""}</td>
                  <td className={`r num ${r.diff ? (r.diff < 0 ? "text-danger" : "text-warn") : "text-muted"}`}>{r.diff == null ? "" : r.diff === 0 ? "OK" : rupees(r.diff)}</td>
                  <td>{r.status === "closed" ? <Badge>Closed</Badge> : r.status === "open" ? <Badge tone="ok">Open</Badge> : <span className="text-xs text-muted">No entry</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="r num px-3">{rupees(t.income)}</td><td className="r num px-3">{rupees(t.cash)}</td><td className="r num px-3">{rupees(t.bank)}</td>
                <td className="r num px-3">{rupees(t.credit)}</td><td className="r num px-3">{rupees(t.expense)}</td><td className="r num px-3">{rupees(t.income - t.expense)}</td>
                <td className="r num px-3">{rupees(t.advances)}</td><td className="r num px-3">{rupees(t.diff)}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
