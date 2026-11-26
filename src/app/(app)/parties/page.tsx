import { desc, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { partyBalances } from "@/lib/ledger";
import { rupees, PAY_MODE_LABEL } from "@/lib/format";
import { saveParty } from "@/lib/actions";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Input, Select } from "@/components/forms";
import { getT } from "@/i18n/server";

export const metadata = { title: "Dues" };

const KIND = { aggregator: "Online app", credit: "Credit customer", banquet: "Banquet client" } as const;

export default async function PartiesPage() {
  const t = await getT();
  const user = await requirePage();
  if (user.role === "employee") return null;
  const db = await getDb();
  const balances = await partyBalances(user.hotelId, db);
  const recent = await db
    .select({ r: schema.receipts, party: schema.parties.name })
    .from(schema.receipts)
    .innerJoin(schema.parties, eq(schema.parties.id, schema.receipts.partyId))
    .where(eq(schema.receipts.hotelId, user.hotelId))
    .orderBy(desc(schema.receipts.date), desc(schema.receipts.id))
    .limit(15);
  const due = (k: string) => balances.filter((b) => b.kind === k).reduce((a, b) => a + b.due, 0);

  return (
    <>
      <PageHeader title={t("Dues")} sub={t("Money others owe the hotel. Record payments from the Daily Counter.")} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("Zomato + Swiggy")} value={rupees(due("aggregator"))} tone="warn" />
        <Stat label={t("Credit customers")} value={rupees(due("credit"))} tone="warn" />
        <Stat label={t("Banquet clients")} value={rupees(due("banquet"))} tone="warn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title={t("Balances")}>
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>{t("Party")}</th><th>{t("Type")}</th><th className="r">{t("Billed")}</th><th className="r">{t("Received")}</th><th className="r">{t("Due")}</th></tr></thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.name}{b.phone && <div className="text-xs font-normal text-muted">{b.phone}</div>}</td>
                    <td><Badge>{t(KIND[b.kind])}</Badge></td>
                    <td className="r num">{rupees(b.billed)}</td>
                    <td className="r num">{rupees(b.received)}</td>
                    <td className={`r num font-semibold ${b.due > 0 ? "text-warn" : b.due < 0 ? "text-income" : ""}`}>{b.due < 0 ? t("{amount} adv.", { amount: rupees(-b.due) }) : rupees(b.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title={t("Recent payments received")}>
            <ul className="num space-y-1.5 text-sm">
              {recent.map(({ r, party }) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span>{r.date.slice(8)}/{r.date.slice(5, 7)} · {party} <span className="text-muted">· {t(PAY_MODE_LABEL[r.mode])}{r.commission ? ` + ${t("{amount} commission", { amount: rupees(r.commission) })}` : ""}</span></span>
                  <span>{rupees(r.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {can(user, "manageMaster") && user.access.canWrite && (
            <Card title={t("Add party")}>
              <ActionForm action={saveParty} submit={t("Add party")}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Input name="name" label={t("Name")} required /></div>
                  <Select name="kind" label={t("Type")} options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} defaultValue="credit" />
                  <Input name="phone" label={t("Phone")} inputMode="tel" />
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
