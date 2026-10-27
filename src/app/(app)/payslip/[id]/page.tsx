import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { monthPayroll } from "@/lib/payroll";
import { isMonth, prettyDate, prettyMonth, rupees, todayIST, PAY_MODE_LABEL } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Payslip" };

// Printable salary slip. Owner and partners see anyone's; an employee only their own.
export default async function PayslipPage({ params, searchParams }: PageProps<"/payslip/[id]">) {
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
        <Link href={user.employeeId === id ? `/me?month=${month}` : `/payroll?month=${month}`} className="btn btn-ghost">Back</Link>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 print:border-0 print:p-0">
        <header className="border-b border-line pb-4 text-center">
          <h1 className="text-xl font-semibold">{h.name}</h1>
          <p className="text-sm text-muted">{[h.city, h.phone && `Ph ${h.phone}`].filter(Boolean).join(" · ")}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-accent">
            Salary slip · {prettyMonth(month)}{thisMonth ? " (till today)" : ""}
          </p>
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 py-4 text-sm">
          <dt className="text-muted">Employee</dt><dd className="font-semibold">{e.name} · {e.code}</dd>
          <dt className="text-muted">Department</dt><dd>{e.department}{e.designation ? ` · ${e.designation}` : ""}</dd>
          <dt className="text-muted">Pay</dt><dd className="num">{e.payType === "monthly" ? `${rupees(row.rate)} per month` : `${rupees(row.rate)} per day`}</dd>
          <dt className="text-muted">Attendance</dt>
          <dd>Present {row.counts.P} · Absent {row.counts.A} · Half {row.counts.H} · Leave {row.counts.L} · Week off {row.counts.WO}{row.ot ? ` · OT ${row.ot} h` : ""}</dd>
          <dt className="text-muted">Paid days</dt><dd className="num">{row.paidDays}</dd>
        </dl>

        <dl className="num grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line pt-4 text-sm">
          <dt>Basic earned</dt><dd className="text-right">{rupees(row.basic)}</dd>
          <dt>Overtime</dt><dd className="text-right">{rupees(row.otPay)}</dd>
          {row.adjustments.map((x) => (
            <Fragment key={x.id}>
              <dt>{x.kind === "deduction" ? "Less " : ""}{x.kind === "bonus" ? "Bonus" : x.kind === "allowance" ? "Allowance" : "deduction"} · {x.note}</dt>
              <dd className="text-right">{x.kind === "deduction" ? "-" : ""}{rupees(x.amount)}</dd>
            </Fragment>
          ))}
          <dt className="font-semibold">{row.adjustments.length ? "Gross pay" : "Gross earned"}</dt><dd className="text-right font-semibold">{rupees(row.earned)}</dd>
          <dt className="text-muted">Less advance{row.loanDue ? ` (loan installment ${rupees(row.loanDue)})` : ""}</dt><dd className="text-right">{rupees(row.advance)}</dd>
          {row.wagesPaid > 0 && <><dt className="text-muted">Less daily wages paid</dt><dd className="text-right">{rupees(row.wagesPaid)}</dd></>}
          <dt className="text-muted">Less salary paid</dt><dd className="text-right">{rupees(row.salaryPaid)}</dd>
          <dt className="border-t border-line pt-1.5 font-semibold">{row.net < 0 ? "Paid in excess" : "Balance payable"}</dt>
          <dd className="border-t border-line pt-1.5 text-right font-semibold">{rupees(Math.abs(row.net))}</dd>
        </dl>

        {row.loanLeft > 0 && <p className="mt-2 text-xs text-muted">Loan still to recover after this month: {rupees(row.loanLeft)}</p>}
        {paid.length > 0 && (
          <div className="mt-4 border-t border-line pt-3 text-sm">
            <div className="mb-1 text-xs font-medium text-muted">Salary payments</div>
            <ul className="num space-y-1">
              {paid.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{prettyDate(p.date)} · {PAY_MODE_LABEL[p.paidVia]}</span>
                  <span>{rupees(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="mt-8 flex items-end justify-between text-xs text-muted">
          <span className="border-t border-line pt-1">Employee signature</span>
          <span className="border-t border-line pt-1">Authorised signature</span>
        </footer>
      </article>
    </>
  );
}
