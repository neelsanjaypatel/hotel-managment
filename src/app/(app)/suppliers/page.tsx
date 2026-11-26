import Link from "next/link";
import { requirePage, can } from "@/lib/auth";
import { supplierBalances } from "@/lib/ledger";
import { rupees } from "@/lib/format";
import { saveSupplier } from "@/lib/actions";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Input } from "@/components/forms";
import { getT } from "@/i18n/server";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const t = await getT();
  const user = await requirePage();
  if (user.role === "employee") return null;
  const rows = await supplierBalances(user.hotelId);
  const totalDue = rows.reduce((a, r) => a + Math.max(0, r.due), 0);

  return (
    <>
      <PageHeader title={t("Suppliers")} sub={t("What the hotel owes for goods taken on credit. Record purchases on the counter with “On credit”.")} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("To pay suppliers")} value={rupees(totalDue)} tone="out" hint={t("{n} with a balance", { n: rows.filter((r) => r.due > 0).length })} />
        <Stat label={t("Bought (all time)")} value={rupees(rows.reduce((a, r) => a + r.bought, 0))} />
        <Stat label={t("Paid (all time)")} value={rupees(rows.reduce((a, r) => a + r.paid, 0))} />
      </div>

      <Card>
        {rows.length === 0 ? (
          <Empty>{t("No suppliers yet")}{can(user, "manageMaster") ? t(". Add one below.") : "."}</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>{t("Supplier")}</th><th className="r">{t("Bought")}</th><th className="r">{t("On credit")}</th><th className="r">{t("Paid")}</th><th className="r">{t("To pay")}</th></tr>
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
                      {r.due < 0 ? t("{amount} advance", { amount: rupees(-r.due) }) : rupees(r.due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {can(user, "manageMaster") && user.access.canWrite && (
        <Card title={t("Add supplier")} className="mt-4">
          <ActionForm action={saveSupplier} submit={t("Add supplier")}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Input name="name" label={t("Name")} required placeholder={t("e.g. Amul Dairy")} />
              <Input name="phone" label={t("Phone")} inputMode="tel" />
              <Input name="note" label={t("Supplies")} placeholder={t("Milk, paneer")} />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
