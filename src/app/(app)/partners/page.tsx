import { requirePage, can } from "@/lib/auth";
import { partnerPosition } from "@/lib/partners";
import { isMonth, prettyMonth, rupees, todayIST } from "@/lib/format";
import { addDrawing } from "@/lib/actions";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { PeriodPicker, Select } from "@/components/forms";
import { PaidForm } from "../counter/entry-forms";

export const metadata = { title: "Partner shares" };

const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%`;

export default async function PartnersPage({ searchParams }: PageProps<"/partners">) {
  const user = await requirePage("viewPayroll");
  const sp = await searchParams;
  const thisMonth = todayIST().slice(0, 7);
  const month = isMonth(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const { fy, monthProfit: p, fyProfit, rows, allocatedBp } = await partnerPosition(user.hotelId, month);
  const canRecord = can(user, "manageMaster") && user.access.canWrite && month === thisMonth && rows.length > 0;

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

      <Card title={`${rows.length} partners · ${pct(allocatedBp)} allocated`}>
        {rows.length === 0 ? (
          <Empty>No partners set up yet. The owner can add them in Settings.</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Partner</th><th className="r">Share</th><th className="r">{prettyMonth(month)}</th>
                  <th className="r">{fy.label} share</th><th className="r">Taken out</th><th className="r">Still theirs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.partner.id} className={r.partner.userId === user.id ? "bg-accent-soft" : ""}>
                    <td className="font-medium">
                      {r.partner.name} {r.partner.userId === user.id && <Badge tone="ok">You</Badge>}
                      {r.partner.phone && <div className="text-xs font-normal text-muted">{r.partner.phone}</div>}
                    </td>
                    <td className="r num">{pct(r.partner.shareBp)}</td>
                    <td className={`r num ${r.monthShare < 0 ? "text-expense" : ""}`}>{rupees(r.monthShare)}</td>
                    <td className={`r num ${r.fyShare < 0 ? "text-expense" : ""}`}>{rupees(r.fyShare)}</td>
                    <td className="r num">{r.taken ? rupees(r.taken) : ""}</td>
                    <td className={`r num font-semibold ${r.balance < 0 ? "text-expense" : ""}`}>
                      {rupees(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canRecord && (
        <Card title="Record money taken by a partner" className="mt-4">
          <PaidForm
            action={addDrawing}
            hidden={{}}
            submit="Record withdrawal"
            extra={<Select name="partnerId" label="Partner" options={rows.map((r) => ({ value: r.partner.id, label: r.partner.name }))} required placeholder="Choose..." />}
          />
          <p className="mt-2 text-xs text-muted">Recorded on today&apos;s counter; cash comes out of the drawer. It is not an expense.</p>
        </Card>
      )}

      <p className="mt-3 text-xs text-muted">
        Profit = income - expenses - salaries earned by all staff in the month (daily wages are counted once, as salary). A loss is shared the same way.
        &quot;Still theirs&quot; = this financial year&apos;s share minus what they took out this year; a minus amount means they have taken more than their share (or the year is in loss).
      </p>
    </>
  );
}

