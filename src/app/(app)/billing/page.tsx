import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { prettyDate, rupees } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { SubscriptionBadge } from "@/components/subscription-badge";

export const metadata = { title: "Billing" };

// How hotels pay the platform. Set PLATFORM_PAYMENT_NOTE in the environment (UPI ID, bank details, WhatsApp number).
const PAYMENT_NOTE =
  process.env.PLATFORM_PAYMENT_NOTE ?? "To renew or upgrade, pay by UPI or bank transfer and share the receipt with Hotel Desk support. Your plan is activated the same day.";

export default async function BillingPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "superadmin") redirect("/platform");
  if (!user.hotelId || !user.hotel || !user.access) redirect("/login");
  if (user.role !== "admin") {
    return <Empty>Billing is managed by the hotel owner.</Empty>;
  }
  const db = await getDb();
  const h = user.hotelId;
  const [plans, payments, [emp], [usr]] = await Promise.all([
    db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(schema.plans.priceMonthly),
    db
      .select({ p: schema.subscriptionPayments, plan: schema.plans.name })
      .from(schema.subscriptionPayments)
      .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptionPayments.planId))
      .where(eq(schema.subscriptionPayments.hotelId, h))
      .orderBy(desc(schema.subscriptionPayments.createdAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.employees).where(and(eq(schema.employees.hotelId, h), eq(schema.employees.active, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.hotelId, h), eq(schema.users.active, true))),
  ]);
  const plan = plans.find((p) => p.id === user.hotel!.planId);
  const a = user.access;

  return (
    <>
      <PageHeader title="Billing" sub={<span className="inline-flex items-center gap-2">{user.hotel.name} <SubscriptionBadge access={a} /></span>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current plan" value={plan?.name ?? "-"} hint={plan ? `${rupees(plan.priceMonthly)} / month` : undefined} />
        <Stat
          label={user.hotel.paidUntil ? "Paid until" : "Trial ends"}
          value={a.endsOn ? prettyDate(a.endsOn) : "-"}
          tone={a.state === "expired" || a.state === "grace" || a.state === "suspended" ? "out" : undefined}
        />
        <Stat label="Employees" value={`${emp.n}${plan?.maxEmployees ? ` / ${plan.maxEmployees}` : ""}`} />
        <Stat label="Logins" value={`${usr.n}${plan?.maxUsers ? ` / ${plan.maxUsers}` : ""}`} />
      </div>

      <Card title="How to pay" className="mb-4">
        <p className="text-sm">{PAYMENT_NOTE}</p>
        <p className="mt-2 text-xs text-muted">Hotel ID for reference: HD-{String(h).padStart(4, "0")}</p>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={`rounded-xl border bg-surface px-4 py-3 ${p.id === plan?.id ? "border-accent" : "border-line"}`}>
            <div className="flex items-center justify-between text-sm font-semibold">
              {p.name} {p.id === plan?.id && <span className="text-xs font-medium text-accent">Current</span>}
            </div>
            <div className="num mt-1 text-lg font-semibold">{rupees(p.priceMonthly)}<span className="text-xs font-normal text-muted">/month</span></div>
            <div className="mt-1 text-xs text-muted">
              {p.maxEmployees ? `Up to ${p.maxEmployees} employees` : "Unlimited employees"} · {p.maxUsers ? `${p.maxUsers} logins` : "unlimited logins"}
            </div>
          </div>
        ))}
      </div>

      <Card title="Payment history">
        {payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Paid on</th><th>Plan</th><th>Period</th><th>Method</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {payments.map(({ p, plan }) => (
                  <tr key={p.id}>
                    <td>{prettyDate(p.createdAt.toISOString().slice(0, 10))}</td>
                    <td>{plan} · {p.months} mo</td>
                    <td className="text-muted">{p.periodFrom} to {p.periodTo}</td>
                    <td className="text-muted">{p.method}{p.reference ? ` · ${p.reference}` : ""}</td>
                    <td className="r num">{rupees(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
