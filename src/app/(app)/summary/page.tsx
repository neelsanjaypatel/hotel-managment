import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { getDay, partyBalances, rangeTotals, supplierBalances } from "@/lib/ledger";
import { monthPayroll } from "@/lib/payroll";
import { partnerPosition } from "@/lib/partners";
import { addDays, isMonth, prettyMonth, rupees, todayIST } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";

export const metadata = { title: "Money summary" };

function Row({ label, value, href, strong, tone }: { label: string; value: number; href?: string; strong?: boolean; tone?: "in" | "out" }) {
  const color = tone === "in" ? "text-income" : tone === "out" ? "text-expense" : "";
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "border-t border-line pt-2.5 font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{href ? <Link href={href} className="hover:text-accent">{label} ›</Link> : label}</dt>
      <dd className={`num ${color}`}>{rupees(value)}</dd>
    </div>
  );
}

// Everything about money in one place: the month's profit, and today's position
// (what others owe us, what we owe, cash in the drawer).
export default async function SummaryPage({ searchParams }: PageProps<"/summary">) {
  const user = await requirePage("viewPayroll");
  const sp = await searchParams;
  const today = todayIST();
  const thisMonth = today.slice(0, 7);
  const month = isMonth(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const lastMonth = addDays(`${thisMonth}-01`, -1).slice(0, 7);
  const db = await getDb();
  const h = user.hotelId;

  const [position, dues, supplierRows, payNow, payLast, day, todayT, [held]] = await Promise.all([
    partnerPosition(h, month, db),
    partyBalances(h, db),
    supplierBalances(h, db),
    monthPayroll(h, thisMonth, {}, db),
    monthPayroll(h, lastMonth, {}, db),
    getDay(h, today, db),
    rangeTotals(h, today, today, db),
    // Advances taken for bookings that have not happened yet: the customer's money.
    db
      .select({ total: sql<number>`coalesce(sum(${schema.receipts.amount}), 0)::float8` })
      .from(schema.receipts)
      .innerJoin(schema.bookings, eq(schema.bookings.id, schema.receipts.bookingId))
      .where(and(eq(schema.receipts.hotelId, h), inArray(schema.bookings.status, ["tentative", "confirmed"]))),
  ]);
  const p = position.monthProfit;
  const due = (kind: string) => dues.filter((d) => d.kind === kind).reduce((a, d) => a + Math.max(0, d.due), 0);
  const receivable = due("aggregator") + due("credit") + due("banquet");
  const supplierDue = supplierRows.reduce((a, r) => a + Math.max(0, r.due), 0);
  const salaryDue = [...payLast, ...payNow].reduce((a, r) => a + Math.max(0, r.net), 0);
  const partnersDue = position.rows.reduce((a, r) => a + Math.max(0, r.balance), 0);
  const payable = supplierDue + salaryDue + held.total + partnersDue;
  const loans = payNow.reduce((a, r) => a + r.loanLeft + r.loanDue, 0);
  const drawerNow = day.openingCash + todayT.cashIn - todayT.cashOut - (day.status === "closed" ? day.cashDeposit : 0);

  return (
    <>
      <PageHeader title="Money summary" sub="Profit for the month, and what the hotel owes and is owed right now.">
        <PeriodPicker name="month" type="month" value={month} max={thisMonth} />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Profit · ${prettyMonth(month)}${month === thisMonth ? " (till today)" : ""}`}>
          <dl className="text-sm">
            <Row label="Income (all sales)" value={p.income} tone="in" href={`/reports?month=${month}`} />
            <Row label="Expenses, incl. goods on credit and commission" value={-p.otherExpenses} tone="out" href={`/?month=${month}`} />
            <Row label="Staff salaries earned" value={-p.salaries} tone="out" href={`/payroll?month=${month}`} />
            <Row label="Profit" value={p.profit} strong tone={p.profit >= 0 ? "in" : "out"} href={`/partners?month=${month}`} />
          </dl>
          <p className="mt-3 text-xs text-muted">{position.fy.label} profit so far: {rupees(position.fyProfit)}</p>
        </Card>

        <Card title="Cash">
          <dl className="text-sm">
            <Row label="Cash in drawer now (as per entries)" value={drawerNow} href="/counter" strong />
          </dl>
          <p className="mt-3 text-xs text-muted">Bank balance is not shown: Hotel Desk is not connected to the bank.</p>
        </Card>

        <Card title="Others owe us">
          <dl className="text-sm">
            <Row label="Zomato / Swiggy" value={due("aggregator")} href="/parties" />
            <Row label="Credit customers" value={due("credit")} href="/parties" />
            <Row label="Banquet clients" value={due("banquet")} href="/parties" />
            <Row label="Staff loans still to recover" value={loans} href="/payroll" />
            <Row label="Total to receive" value={receivable + loans} strong tone="in" />
          </dl>
        </Card>

        <Card title="We owe">
          <dl className="text-sm">
            <Row label="Suppliers (goods on credit)" value={supplierDue} href="/suppliers" />
            <Row label={`Salary still to pay (${prettyMonth(lastMonth)} + this month so far)`} value={salaryDue} href="/payroll" />
            <Row label="Advances held for upcoming bookings" value={held.total} href="/bookings" />
            <Row label={`Partners' profit not yet taken (${position.fy.label})`} value={partnersDue} href="/partners" />
            <Row label="Total to pay" value={payable} strong tone="out" />
          </dl>
        </Card>
      </div>
    </>
  );
}
