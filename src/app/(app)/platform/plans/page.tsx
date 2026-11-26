import { requirePlatformPage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { rupeesPlain } from "@/lib/format";
import { savePlan } from "@/lib/platform-actions";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, Input } from "@/components/forms";
import { getT } from "@/i18n/server";

export const metadata = { title: "Plans" };

export default async function PlansPage() {
  const t = await getT();
  await requirePlatformPage();
  const db = await getDb();
  const plans = await db.select().from(schema.plans).orderBy(schema.plans.priceMonthly);
  return (
    <>
      <PageHeader title={t("Plans")} sub={t("Prices and limits shown on the signup and billing pages. Leave a limit blank for unlimited.")} />
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} title={p.name}>
            <ActionForm action={savePlan} submit={t("Save")} resetOnOk={false}>
              <input type="hidden" name="id" value={p.id} />
              <div className="space-y-3">
                <Input name="name" label={t("Name")} defaultValue={p.name} required />
                <Input name="price" label={t("Price per month (₹)")} inputMode="decimal" defaultValue={rupeesPlain(p.priceMonthly)} required />
                <Input name="maxEmployees" label={t("Max employees")} inputMode="numeric" defaultValue={p.maxEmployees ?? ""} />
                <Input name="maxUsers" label={t("Max logins")} inputMode="numeric" defaultValue={p.maxUsers ?? ""} />
              </div>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
