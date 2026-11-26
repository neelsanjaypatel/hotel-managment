import Link from "next/link";
import { sql } from "drizzle-orm";
import { requirePlatformPage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { hotelAccess } from "@/lib/subscription";
import { rupees, todayIST } from "@/lib/format";
import { onboardHotel } from "@/lib/platform-actions";
import { Card, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Input, Select } from "@/components/forms";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { getT } from "@/i18n/server";

export const metadata = { title: "Hotels" };

export default async function PlatformPage() {
  const t = await getT();
  await requirePlatformPage();
  const db = await getDb();
  const today = todayIST();
  const [plans, rows] = await Promise.all([
    db.select().from(schema.plans).orderBy(schema.plans.priceMonthly),
    db.execute(sql`
      select h.*, p.name as plan_name, p.price_monthly,
        (select count(*) from employees e where e.hotel_id = h.id and e.active)::int as employees,
        (select count(*) from users u where u.hotel_id = h.id and u.active)::int as users,
        (select max(date) from sales s where s.hotel_id = h.id) as last_entry,
        (select name || ' · ' || login from users u where u.hotel_id = h.id and u.role = 'admin' order by u.id limit 1) as owner
      from hotels h join plans p on p.id = h.plan_id order by h.created_at desc`),
  ]);
  type Row = {
    id: number; name: string; city: string | null; status: "trial" | "active" | "suspended"; trial_ends_at: string | null; paid_until: string | null;
    plan_name: string; price_monthly: number; employees: number; users: number; last_entry: string | null; owner: string | null;
  };
  const hotels = ((rows as unknown as { rows?: Row[] }).rows ?? (rows as unknown as Row[])).map((r) => {
    const d = (v: unknown) => (v == null ? null : String(v instanceof Date ? v.toISOString() : v).slice(0, 10));
    const row = { ...r, trial_ends_at: d(r.trial_ends_at), paid_until: d(r.paid_until), last_entry: d(r.last_entry) };
    return { ...row, access: hotelAccess({ status: row.status, trialEndsAt: row.trial_ends_at, paidUntil: row.paid_until }, today) };
  });
  const paying = hotels.filter((h) => h.access.state === "active" || h.access.state === "grace");
  const mrr = paying.reduce((a, h) => a + Number(h.price_monthly), 0);

  return (
    <>
      <PageHeader title={t("Hotels")} sub={t("Every hotel on Hotel Desk, its plan and subscription.")} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Hotels")} value={String(hotels.length)} />
        <Stat label={t("Paying")} value={String(paying.length)} tone="in" />
        <Stat label={t("On trial")} value={String(hotels.filter((h) => h.access.state === "trial").length)} />
        <Stat label={t("Monthly revenue (MRR)")} value={rupees(mrr)} tone="in" hint={t("{n} expired", { n: hotels.filter((h) => h.access.state === "expired").length })} />
      </div>

      <Card className="mb-4">
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>{t("Hotel")}</th><th>{t("Owner")}</th><th>{t("Plan")}</th><th>{t("Status")}</th><th className="r">{t("Staff")}</th><th className="r">{t("Logins")}</th><th>{t("Last entry")}</th></tr></thead>
            <tbody>
              {hotels.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link href={`/platform/hotels/${h.id}`} className="font-medium hover:text-accent">{h.name}</Link>
                    <div className="text-xs text-muted">{t("HD-")}{String(h.id).padStart(4, "0")}{h.city ? ` · ${h.city}` : ""}</div>
                  </td>
                  <td className="text-muted">{h.owner}</td>
                  <td>{h.plan_name}</td>
                  <td><SubscriptionBadge access={h.access} /></td>
                  <td className="r num">{h.employees}</td>
                  <td className="r num">{h.users}</td>
                  <td className="text-muted">{h.last_entry ?? t("Never")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{t("+ Onboard a hotel yourself")}</summary>
        <div className="border-t border-line p-4">
          <p className="mb-3 text-sm text-muted">{t("Hotels can also sign up themselves at /signup. Either way they start on a free trial.")}</p>
          <ActionForm action={onboardHotel} submit={t("Create hotel")}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Input name="hotelName" label={t("Hotel name")} required />
              <Input name="city" label={t("City")} required />
              <Select name="planId" label={t("Plan")} options={plans.map((p) => ({ value: p.id, label: p.name }))} defaultValue={plans.find((p) => p.code === "growth")?.id} />
              <Input name="ownerName" label={t("Owner name")} required />
              <Input name="login" label={t("Owner mobile (login)")} required inputMode="numeric" maxLength={10} />
              <Input name="password" label={t("Temporary password")} type="text" minLength={8} required autoComplete="off" />
            </div>
            <fieldset className="mt-3 flex flex-wrap gap-4 text-sm">
              <legend className="label">{t("Sections")}</legend>
              <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasRestaurant" defaultChecked />{" "}{t("Restaurant")}</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasRooms" />{" "}{t("Rooms")}</label>
              <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasBanquet" />{" "}{t("Banquet")}</label>
            </fieldset>
          </ActionForm>
        </div>
      </details>
    </>
  );
}
