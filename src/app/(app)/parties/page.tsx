import { desc, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { partyBalances } from "@/lib/ledger";
import { rupees, PAY_MODE_LABEL } from "@/lib/format";
import { saveParty } from "@/lib/actions";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Input, Select } from "@/components/forms";

export const metadata = { title: "Dues" };

const KIND = { aggregator: "Online app", credit: "Credit customer", banquet: "Banquet client" } as const;

export default async function PartiesPage() {
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
      <PageHeader title="Dues" sub="Money others owe the hotel. Record payments from the Daily Counter." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Zomato + Swiggy" value={rupees(due("aggregator"))} tone="warn" />
        <Stat label="Credit customers" value={rupees(due("credit"))} tone="warn" />
        <Stat label="Banquet clients" value={rupees(due("banquet"))} tone="warn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Balances">
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Party</th><th>Type</th><th className="r">Billed</th><th className="r">Received</th><th className="r">Due</th></tr></thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.name}{b.phone && <div className="text-xs font-normal text-muted">{b.phone}</div>}</td>
                    <td><Badge>{KIND[b.kind]}</Badge></td>
                    <td className="r num">{rupees(b.billed)}</td>
                    <td className="r num">{rupees(b.received)}</td>
                    <td className={`r num font-semibold ${b.due > 0 ? "text-warn" : b.due < 0 ? "text-income" : ""}`}>{b.due < 0 ? `${rupees(-b.due)} adv.` : rupees(b.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Recent payments received">
            <ul className="num space-y-1.5 text-sm">
              {recent.map(({ r, party }) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span>{r.date.slice(8)}/{r.date.slice(5, 7)} · {party} <span className="text-muted">· {PAY_MODE_LABEL[r.mode]}{r.commission ? ` + ${rupees(r.commission)} commission` : ""}</span></span>
                  <span>{rupees(r.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {can(user, "manageMaster") && user.access.canWrite && (
            <Card title="Add party">
              <ActionForm action={saveParty} submit="Add party">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Input name="name" label="Name" required /></div>
                  <Select name="kind" label="Type" options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} defaultValue="credit" />
                  <Input name="phone" label="Phone" inputMode="tel" />
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
