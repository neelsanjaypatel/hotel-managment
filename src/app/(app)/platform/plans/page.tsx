import { requirePlatformPage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { rupeesPlain } from "@/lib/format";
import { savePlan } from "@/lib/platform-actions";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, Input } from "@/components/forms";

export const metadata = { title: "Plans" };

export default async function PlansPage() {
  await requirePlatformPage();
  const db = await getDb();
  const plans = await db.select().from(schema.plans).orderBy(schema.plans.priceMonthly);
  return (
    <>
      <PageHeader title="Plans" sub="Prices and limits shown on the signup and billing pages. Leave a limit blank for unlimited." />
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} title={p.name}>
            <ActionForm action={savePlan} submit="Save" resetOnOk={false}>
              <input type="hidden" name="id" value={p.id} />
              <div className="space-y-3">
                <Input name="name" label="Name" defaultValue={p.name} required />
                <Input name="price" label="Price per month (₹)" inputMode="decimal" defaultValue={rupeesPlain(p.priceMonthly)} required />
                <Input name="maxEmployees" label="Max employees" inputMode="numeric" defaultValue={p.maxEmployees ?? ""} />
                <Input name="maxUsers" label="Max logins" inputMode="numeric" defaultValue={p.maxUsers ?? ""} />
              </div>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
