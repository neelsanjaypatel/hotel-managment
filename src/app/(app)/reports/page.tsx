import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { dayRows } from "@/lib/ledger";
import { monthBounds, prettyDate, prettyMonth, rupees, todayIST, isMonth } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";
import { getT } from "@/i18n/server";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const t = await getT();
  const user = await requirePage("viewReports");
  const sp = await searchParams;
  const today = todayIST();
  const month = isMonth(sp.month) ? sp.month : today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const rows = (await dayRows(user.hotelId, from, to < today ? to : today)).reverse();
  const tot = rows.reduce(
    (a, r) => ({ income: a.income + r.income, cash: a.cash + r.cash, bank: a.bank + r.bank, credit: a.credit + r.credit, expense: a.expense + r.expense, advances: a.advances + r.advances, diff: a.diff + (r.diff ?? 0) }),
    { income: 0, cash: 0, bank: 0, credit: 0, expense: 0, advances: 0, diff: 0 },
  );

  return (
    <>
      <PageHeader title={t("Day-wise report")} sub={prettyMonth(month, t.locale)}>
        <PeriodPicker name="month" type="month" value={month} max={today.slice(0, 7)} />
        <a className="btn btn-ghost" href={`/reports/export?month=${month}`}>{t("Download Excel (CSV)")}</a>
      </PageHeader>
      <Card>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("Date")}</th><th className="r">{t("Income")}</th><th className="r">{t("Cash")}</th><th className="r">{t("Bank/UPI/Card")}</th><th className="r">{t("Zomato/Swiggy/Credit")}</th>
                <th className="r">{t("Expense")}</th><th className="r">{t("Net")}</th><th className="r">{t("Advances")}</th><th className="r">{t("Cash diff")}</th><th>{t("Day")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td className="whitespace-nowrap"><Link href={`/counter?date=${r.date}`} className="hover:text-accent">{prettyDate(r.date, t.locale).replace(/,/g, "").replace(/ \d{4}$/, "")}</Link></td>
                  <td className="r num text-income">{rupees(r.income)}</td>
                  <td className="r num">{rupees(r.cash)}</td>
                  <td className="r num">{rupees(r.bank)}</td>
                  <td className="r num">{rupees(r.credit)}</td>
                  <td className="r num text-expense">{rupees(r.expense)}</td>
                  <td className="r num font-medium">{rupees(r.income - r.expense)}</td>
                  <td className="r num">{r.advances ? rupees(r.advances) : ""}</td>
                  <td className={`r num ${r.diff ? (r.diff < 0 ? "text-danger" : "text-warn") : "text-muted"}`}>{r.diff == null ? "" : r.diff === 0 ? t("OK") : rupees(r.diff)}</td>
                  <td>{r.status === "closed" ? <Badge>{t("Closed")}</Badge> : r.status === "open" ? <Badge tone="ok">{t("Open")}</Badge> : <span className="text-xs text-muted">{t("No entry")}</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-2">{t("Total")}</td>
                <td className="r num px-3">{rupees(tot.income)}</td><td className="r num px-3">{rupees(tot.cash)}</td><td className="r num px-3">{rupees(tot.bank)}</td>
                <td className="r num px-3">{rupees(tot.credit)}</td><td className="r num px-3">{rupees(tot.expense)}</td><td className="r num px-3">{rupees(tot.income - tot.expense)}</td>
                <td className="r num px-3">{rupees(tot.advances)}</td><td className="r num px-3">{rupees(tot.diff)}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
