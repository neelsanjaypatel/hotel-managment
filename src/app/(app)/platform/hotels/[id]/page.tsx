import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { requirePlatformPage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { hotelAccess } from "@/lib/subscription";
import { prettyDate, rupees, rupeesPlain, todayIST } from "@/lib/format";
import { extendTrial, recordPayment, setSuspended } from "@/lib/platform-actions";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ActButton, ActionForm, Input, Select } from "@/components/forms";
import { SubscriptionBadge } from "@/components/subscription-badge";

export default async function PlatformHotelPage({ params }: PageProps<"/platform/hotels/[id]">) {
  await requirePlatformPage();
  const id = Number((await params).id);
  const db = await getDb();
  const [hotel] = await db.select().from(schema.hotels).where(eq(schema.hotels.id, id || 0));
  if (!hotel) notFound();
  const [plans, payments, owners, [emp]] = await Promise.all([
    db.select().from(schema.plans).orderBy(schema.plans.priceMonthly),
    db.select().from(schema.subscriptionPayments).where(eq(schema.subscriptionPayments.hotelId, id)).orderBy(desc(schema.subscriptionPayments.createdAt)),
    db.select().from(schema.users).where(and(eq(schema.users.hotelId, id), eq(schema.users.role, "admin"))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.employees).where(and(eq(schema.employees.hotelId, id), eq(schema.employees.active, true))),
  ]);
  const access = hotelAccess(hotel, todayIST());
  const plan = plans.find((p) => p.id === hotel.planId);
  const planName = new Map(plans.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader
        title={hotel.name}
        sub={<span className="inline-flex items-center gap-2">HD-{String(hotel.id).padStart(4, "0")}{hotel.city ? ` · ${hotel.city}` : ""} <SubscriptionBadge access={access} /></span>}
      >
        <Link href="/platform" className="btn btn-ghost">All hotels</Link>
        <ActButton
          run={setSuspended.bind(null, hotel.id, hotel.status !== "suspended")}
          label={hotel.status === "suspended" ? "Resume hotel" : "Suspend hotel"}
          confirm={hotel.status === "suspended" ? undefined : `Suspend ${hotel.name}? Their staff will not be able to open the app.`}
          className="btn btn-ghost"
        />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Plan" value={plan?.name ?? "-"} hint={plan ? `${rupees(plan.priceMonthly)} / month` : undefined} />
        <Stat label={hotel.status === "trial" ? "Trial ends" : "Paid until"} value={access.endsOn ? prettyDate(access.endsOn) : "-"} />
        <Stat label="Employees" value={`${emp.n}${plan?.maxEmployees ? ` / ${plan.maxEmployees}` : ""}`} />
        <Stat label="Owner" value={owners[0]?.name ?? "-"} hint={owners[0]?.login} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Record subscription payment">
          <ActionForm action={recordPayment} submit="Save payment">
            <input type="hidden" name="hotelId" value={hotel.id} />
            <div className="grid grid-cols-2 gap-3">
              <Select name="planId" label="Plan" options={plans.map((p) => ({ value: p.id, label: `${p.name} (${rupees(p.priceMonthly)}/mo)` }))} defaultValue={hotel.planId} />
              <Input name="months" label="Months" type="number" min={1} max={36} defaultValue={1} required />
              <Input name="amount" label="Amount received (₹)" inputMode="decimal" defaultValue={plan ? rupeesPlain(plan.priceMonthly) : ""} required />
              <Select
                name="method"
                label="Paid by"
                options={[{ value: "upi", label: "UPI" }, { value: "bank", label: "Bank transfer" }, { value: "cash", label: "Cash" }, { value: "cheque", label: "Cheque" }]}
                defaultValue="upi"
              />
              <div className="col-span-2"><Input name="reference" label="UTR / reference" placeholder="optional" /></div>
            </div>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">The new period starts the day after the current paid-until date, or today if it has already ended.</p>
        </Card>

        {hotel.status === "trial" && (
          <Card title="Extend free trial">
            <ActionForm action={extendTrial} submit="Extend trial">
              <input type="hidden" name="hotelId" value={hotel.id} />
              <div className="sm:max-w-40"><Input name="days" label="Extra days" type="number" min={1} max={90} defaultValue={7} required /></div>
            </ActionForm>
          </Card>
        )}
      </div>

      <Card title="Payments" className="mt-4">
        {payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Recorded</th><th>Plan</th><th>Period</th><th>Method</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{prettyDate(p.createdAt.toISOString().slice(0, 10))}</td>
                    <td>{planName.get(p.planId)} · {p.months} mo</td>
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
