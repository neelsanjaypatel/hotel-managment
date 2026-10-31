import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { payLabel, prettyDate, rupees, PAY_MODE_LABEL } from "@/lib/format";
import { paySupplier, saveSupplier } from "@/lib/actions";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Input, Select } from "@/components/forms";
import { PaidForm } from "../../counter/entry-forms";

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const user = await requirePage();
  if (user.role === "employee") notFound();
  const id = Number((await params).id);
  const db = await getDb();
  const { suppliers, expenses, supplierPayments, expenseCategories } = schema;
  const [s] = await db.select().from(suppliers).where(and(eq(suppliers.hotelId, user.hotelId), eq(suppliers.id, id || 0)));
  if (!s) notFound();
  const [buys, pays] = await Promise.all([
    db
      .select({ e: expenses, cat: expenseCategories.name })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(and(eq(expenses.hotelId, user.hotelId), eq(expenses.supplierId, s.id)))
      .orderBy(asc(expenses.date), asc(expenses.id)),
    db
      .select()
      .from(supplierPayments)
      .where(and(eq(supplierPayments.hotelId, user.hotelId), eq(supplierPayments.supplierId, s.id)))
      .orderBy(asc(supplierPayments.date), asc(supplierPayments.id)),
  ]);

  // Ledger: credit purchases raise the balance, payments lower it; purchases paid on the
  // spot are listed for reference but leave the balance alone.
  type Line = { date: string; key: string; what: string; bought: number; paid: number; affects: boolean; bill?: number | null };
  const lines: Line[] = [
    ...buys.map(({ e, cat }) => ({
      date: e.date,
      key: `e${e.id}`,
      what: `${cat}${e.note ? ` · ${e.note}` : ""} · ${payLabel(e.paidVia)}`,
      bought: e.amount,
      paid: e.paidVia === "credit" ? 0 : e.amount,
      affects: e.paidVia === "credit",
      bill: e.attachmentId,
    })),
    ...pays.map((p) => ({ date: p.date, key: `p${p.id}`, what: `Payment · ${PAY_MODE_LABEL[p.paidVia]}${p.note ? ` · ${p.note}` : ""}`, bought: 0, paid: p.amount, affects: true })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const withBalance: (Line & { balance: number })[] = [];
  for (const l of lines) {
    const prev = withBalance.length ? withBalance[withBalance.length - 1].balance : 0;
    withBalance.push({ ...l, balance: prev + (l.affects ? (l.bought ? l.bought : -l.paid) : 0) });
  }
  const due = withBalance.length ? withBalance[withBalance.length - 1].balance : 0;

  return (
    <>
      <PageHeader title={s.name} sub={[s.note, s.phone].filter(Boolean).join(" · ") || "Supplier"}>
        <Link href="/suppliers" className="btn btn-ghost">All suppliers</Link>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="To pay" value={rupees(Math.max(0, due))} tone={due > 0 ? "out" : undefined} hint={due < 0 ? `${rupees(-due)} paid in advance` : undefined} />
        <Stat label="Bought (all time)" value={rupees(buys.reduce((a, b) => a + b.e.amount, 0))} />
        <Stat label="Paid to them" value={rupees(pays.reduce((a, p) => a + p.amount, 0))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Account">
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Details</th><th className="r">Goods</th><th className="r">Paid</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {withBalance.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted">Nothing yet.</td></tr>
                )}
                {withBalance.map((l) => (
                  <tr key={l.key}>
                    <td className="whitespace-nowrap">{prettyDate(l.date).replace(/,/g, "").replace(/ \d{4}$/, "")}</td>
                    <td>
                      {l.what} {!l.affects && <Badge>paid on the spot</Badge>}{" "}
                      {l.bill && <a href={`/files/${l.bill}`} target="_blank" rel="noopener" className="text-accent underline underline-offset-2">Bill</a>}
                    </td>
                    <td className="r num">{l.bought ? rupees(l.bought) : ""}</td>
                    <td className="r num">{l.paid ? rupees(l.paid) : ""}</td>
                    <td className="r num font-medium">{rupees(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          {can(user, "enterCounter") && user.access.canWrite && (
            <Card title="Pay supplier">
              <PaidForm action={paySupplier} hidden={{ supplierId: s.id }} submit="Record payment" />
              <p className="mt-2 text-xs text-muted">Recorded on today&apos;s counter. Cash comes out of the drawer.</p>
            </Card>
          )}
          {can(user, "manageMaster") && user.access.canWrite && (
            <Card title="Edit supplier">
              <ActionForm action={saveSupplier} submit="Save" resetOnOk={false}>
                <input type="hidden" name="id" value={s.id} />
                <div className="space-y-3">
                  <Input name="name" label="Name" defaultValue={s.name} required />
                  <Input name="phone" label="Phone" defaultValue={s.phone ?? ""} inputMode="tel" />
                  <Input name="note" label="Supplies" defaultValue={s.note ?? ""} />
                  <Select name="active" label="Status" defaultValue="on" options={[{ value: "on", label: "Active" }, { value: "off", label: "Stopped (hide)" }]} />
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
