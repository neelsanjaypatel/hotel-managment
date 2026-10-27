import Link from "next/link";
import { requirePage, can } from "@/lib/auth";
import { supplierBalances } from "@/lib/ledger";
import { rupees } from "@/lib/format";
import { saveSupplier } from "@/lib/actions";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Input } from "@/components/forms";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const user = await requirePage();
  if (user.role === "employee") return null;
  const rows = await supplierBalances(user.hotelId);
  const totalDue = rows.reduce((a, r) => a + Math.max(0, r.due), 0);

  return (
    <>
      <PageHeader title="Suppliers" sub="What the hotel owes for goods taken on credit. Record purchases on the counter with “On credit”." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="To pay suppliers" value={rupees(totalDue)} tone="out" hint={`${rows.filter((r) => r.due > 0).length} with a balance`} />
        <Stat label="Bought (all time)" value={rupees(rows.reduce((a, r) => a + r.bought, 0))} />
        <Stat label="Paid (all time)" value={rupees(rows.reduce((a, r) => a + r.paid, 0))} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty>No suppliers yet{can(user, "manageMaster") ? ". Add one below." : "."}</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>Supplier</th><th className="r">Bought</th><th className="r">On credit</th><th className="r">Paid</th><th className="r">To pay</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/suppliers/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>
                      <div className="text-xs text-muted">{[r.note, r.phone].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="r num">{rupees(r.bought)}</td>
                    <td className="r num">{rupees(r.onCredit)}</td>
                    <td className="r num">{rupees(r.paid)}</td>
                    <td className={`r num font-semibold ${r.due > 0 ? "text-expense" : r.due < 0 ? "text-warn" : ""}`}>
                      {r.due < 0 ? `${rupees(-r.due)} advance` : rupees(r.due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {can(user, "manageMaster") && user.access.canWrite && (
        <Card title="Add supplier" className="mt-4">
          <ActionForm action={saveSupplier} submit="Add supplier">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Input name="name" label="Name" required placeholder="e.g. Amul Dairy" />
              <Input name="phone" label="Phone" inputMode="tel" />
              <Input name="note" label="Supplies" placeholder="Milk, paneer" />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
