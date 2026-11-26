import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { monthPayroll } from "@/lib/payroll";
import { isMonth, prettyDate, prettyMonth, rupees, todayIST, PAY_MODE_LABEL } from "@/lib/format";
import { PrintButton } from "@/components/print-button";
import { getT } from "@/i18n/server";

export const metadata = { title: "Payslip" };

// Printable salary slip. Owner and partners see anyone's; an employee only their own.
export default async function PayslipPage({ params, searchParams }: PageProps<"/payslip/[id]">) {
  const t = await getT();
  const user = await requirePage();
  const id = Number((await params).id);
  if (!can(user, "viewPayroll") && user.employeeId !== id) notFound();
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : todayIST().slice(0, 7);
  const db = await getDb();
  const [row] = await monthPayroll(user.hotelId, month, { employeeIds: [id || 0] }, db);
  if (!row) notFound();
  const e = row.employee;
  const paid = await db
    .select()
    .from(schema.salaryPayments)
    .where(and(eq(schema.salaryPayments.hotelId, user.hotelId), eq(schema.salaryPayments.employeeId, e.id), eq(schema.salaryPayments.month, month)))
    .orderBy(asc(schema.salaryPayments.date));
  const h = user.hotel;
  const thisMonth = month === todayIST().slice(0, 7);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Link href={user.employeeId === id ? `/me?month=${month}` : `/payroll?month=${month}`} className="btn btn-ghost">{t("Back")}</Link>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 print:border-0 print:p-0">
        <header className="border-b border-line pb-4 text-center">
          <h1 className="text-xl font-semibold">{h.name}</h1>
          <p className="text-sm text-muted">{[h.city, h.phone && `Ph ${h.phone}`].filter(Boolean).join(" · ")}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-accent">
            {t("Salary slip ·")}{" "}{prettyMonth(month, t.locale)}{thisMonth ? t(" (till today)") : ""}
          </p>
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 py-4 text-sm">
          <dt className="text-muted">{t("Employee")}</dt><dd className="font-semibold">{e.name} · {e.code}</dd>
          <dt className="text-muted">{t("Department")}</dt><dd>{e.department}{e.designation ? ` · ${e.designation}` : ""}</dd>
          <dt className="text-muted">{t("Pay")}</dt><dd className="num">{e.payType === "monthly" ? t("{amount} per month", { amount: rupees(row.rate) }) : t("{amount} per day", { amount: rupees(row.rate) })}</dd>
          <dt className="text-muted">{t("Attendance")}</dt>
          <dd>{t("Present")} {row.counts.P} · {t("Absent")} {row.counts.A} · {t("Half")} {row.counts.H} · {t("Leave")} {row.counts.L} · {t("Week off")} {row.counts.WO}{row.ot ? ` · ${t("OT {n} hrs", { n: row.ot })}` : ""}</dd>
          <dt className="text-muted">{t("Paid days")}</dt><dd className="num">{row.paidDays}</dd>
        </dl>

        <dl className="num grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line pt-4 text-sm">
          <dt>{t("Basic earned")}</dt><dd className="text-right">{rupees(row.basic)}</dd>
          <dt>{t("Overtime")}</dt><dd className="text-right">{rupees(row.otPay)}</dd>
          {row.adjustments.map((x) => (
            <Fragment key={x.id}>
              <dt>{x.kind === "deduction" ? t("Less ") : ""}{x.kind === "bonus" ? t("Bonus") : x.kind === "allowance" ? t("Allowance") : t("deduction")} · {x.note}</dt>
              <dd className="text-right">{x.kind === "deduction" ? "-" : ""}{rupees(x.amount)}</dd>
            </Fragment>
          ))}
          <dt className="font-semibold">{row.adjustments.length ? t("Gross pay") : t("Gross earned")}</dt><dd className="text-right font-semibold">{rupees(row.earned)}</dd>
          <dt className="text-muted">{t("Less advance")}{row.loanDue ? ` (${t("loan {amount}", { amount: rupees(row.loanDue) })})` : ""}</dt><dd className="text-right">{rupees(row.advance)}</dd>
          {row.wagesPaid > 0 && <><dt className="text-muted">{t("Less daily wages paid")}</dt><dd className="text-right">{rupees(row.wagesPaid)}</dd></>}
          <dt className="text-muted">{t("Less salary paid")}</dt><dd className="text-right">{rupees(row.salaryPaid)}</dd>
          <dt className="border-t border-line pt-1.5 font-semibold">{row.net < 0 ? t("Paid in excess") : t("Balance payable")}</dt>
          <dd className="border-t border-line pt-1.5 text-right font-semibold">{rupees(Math.abs(row.net))}</dd>
        </dl>

        {row.loanLeft > 0 && <p className="mt-2 text-xs text-muted">{t("Loan still to recover after this month:")}{" "}{rupees(row.loanLeft)}</p>}
        {paid.length > 0 && (
          <div className="mt-4 border-t border-line pt-3 text-sm">
            <div className="mb-1 text-xs font-medium text-muted">{t("Salary payments")}</div>
            <ul className="num space-y-1">
              {paid.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{prettyDate(p.date, t.locale)} · {t(PAY_MODE_LABEL[p.paidVia])}</span>
                  <span>{rupees(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="mt-8 flex items-end justify-between text-xs text-muted">
          <span className="border-t border-line pt-1">{t("Employee signature")}</span>
          <span className="border-t border-line pt-1">{t("Authorised signature")}</span>
        </footer>
      </article>
    </>
  );
}
