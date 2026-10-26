import { and, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { monthProfit } from "@/lib/payroll";
import { isMonth, prettyMonth, rupees, todayIST } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";

export const metadata = { title: "Partner shares" };

// Indian financial year (April to March) that contains the month.
function fyMonths(month: string, upTo: string) {
  const [y, m] = month.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(startYear, 3 + i, 1));
    const key = d.toISOString().slice(0, 7);
    if (key > upTo) break;
    out.push(key);
  }
  return { out, label: `FY ${startYear}-${String(startYear + 1).slice(2)}` };
}

const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%`;
const shareOf = (amount: number, bp: number) => Math.round((amount * bp) / 10000);

export default async function PartnersPage({ searchParams }: PageProps<"/partners">) {
  const user = await requirePage("viewPayroll");
  const sp = await searchParams;
  const thisMonth = todayIST().slice(0, 7);
  const month = isMonth(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const db = await getDb();
  const fy = fyMonths(month, month);
  const [partners, monthly] = await Promise.all([
    db
      .select()
      .from(schema.partners)
      .where(and(eq(schema.partners.hotelId, user.hotelId), eq(schema.partners.active, true)))
      .orderBy(schema.partners.name),
    Promise.all(fy.out.map((m) => monthProfit(user.hotelId, m, db))),
  ]);
  const p = monthly[monthly.length - 1];
  const fyProfit = monthly.reduce((a, x) => a + x.profit, 0);
  const allocated = partners.reduce((a, x) => a + x.shareBp, 0);

  return (
    <>
      <PageHeader title="Partner shares" sub={`${prettyMonth(month)}${month === thisMonth ? " · till today" : ""}`}>
        <PeriodPicker name="month" type="month" value={month} max={thisMonth} />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income" value={rupees(p.income)} tone="in" />
        <Stat label="Expenses (excl. staff)" value={rupees(p.otherExpenses)} tone="out" />
        <Stat label="Staff salaries" value={rupees(p.salaries)} tone="out" />
        <Stat label="Profit to share" value={rupees(p.profit)} tone={p.profit >= 0 ? "in" : "out"} hint={`${fy.label} so far: ${rupees(fyProfit)}`} />
      </div>

      <Card title={`${partners.length} partners · ${pct(allocated)} allocated`}>
        {partners.length === 0 ? (
          <Empty>No partners set up yet. The owner can add them in Settings.</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>Partner</th><th className="r">Share</th><th className="r">{prettyMonth(month)}</th><th className="r">{fy.label} so far</th></tr>
              </thead>
              <tbody>
                {partners.map((x) => (
                  <tr key={x.id} className={x.userId === user.id ? "bg-accent-soft" : ""}>
                    <td className="font-medium">
                      {x.name} {x.userId === user.id && <Badge tone="ok">You</Badge>}
                      {x.phone && <div className="text-xs font-normal text-muted">{x.phone}</div>}
                    </td>
                    <td className="r num">{pct(x.shareBp)}</td>
                    <td className={`r num font-semibold ${p.profit < 0 ? "text-expense" : ""}`}>{rupees(shareOf(p.profit, x.shareBp))}</td>
                    <td className={`r num ${fyProfit < 0 ? "text-expense" : ""}`}>{rupees(shareOf(fyProfit, x.shareBp))}</td>
                  </tr>
                ))}
                {allocated < 10000 && (
                  <tr className="text-muted">
                    <td>Not allocated</td>
                    <td className="r num">{pct(10000 - allocated)}</td>
                    <td className="r num">{rupees(shareOf(p.profit, 10000 - allocated))}</td>
                    <td className="r num">{rupees(shareOf(fyProfit, 10000 - allocated))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        Profit = income - expenses - salaries earned by all staff in the month (daily wages are counted once, as salary). A loss is shared the same way.
        Money already taken out by partners is not tracked here.
      </p>
    </>
  );
}
