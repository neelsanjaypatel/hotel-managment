import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { getDay, rangeTotals } from "@/lib/ledger";
import { addDays, isISODate, prettyDate, prettyMonth, rupees, rupeesPlain, todayIST, PAY_MODE_LABEL, SALE_MODE_LABEL, UNIT_LABEL } from "@/lib/format";
import { deleteEntry, reopenDay, setOpeningCash, updateEntry } from "@/lib/actions";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ActButton, ActionForm, Input, PeriodPicker } from "@/components/forms";
import { AdvanceForm, EntryPanel, ExpenseForm, ReceiptForm, SaleForm, SalaryEditForm } from "./entry-forms";
import { CloseDayForm } from "./close-day";

export const metadata = { title: "Daily Counter" };

type Kind = "sale" | "expense" | "advance" | "receipt" | "salary";

const KIND: Record<Kind, { label: string; tone: "ok" | "out" | "warn" | "neutral"; sign: 1 | -1 }> = {
  sale: { label: "Sale", tone: "ok", sign: 1 },
  receipt: { label: "Payment in", tone: "ok", sign: 1 },
  expense: { label: "Expense", tone: "out", sign: -1 },
  advance: { label: "Advance", tone: "warn", sign: -1 },
  salary: { label: "Salary", tone: "warn", sign: -1 },
};

export default async function CounterPage({ searchParams }: PageProps<"/counter">) {
  const user = await requirePage();
  if (user.role === "employee") return null;
  const sp = await searchParams;
  const today = todayIST();
  const date = isISODate(sp.date) && sp.date <= today ? sp.date : today;
  const db = await getDb();
  const { sales, expenses, advances, receipts, salaryPayments, parties, employees, expenseCategories: cats, users, dayBooks } = schema;

  const h = user.hotelId;
  const day = await getDay(h, date, db);
  const [t, saleRows, expRows, advRows, recRows, salRows, partyRows, empRows, catRows, closer, priorClosed, usage] = await Promise.all([
    rangeTotals(h, date, date, db),
    db.select({ s: sales, party: parties.name }).from(sales).leftJoin(parties, eq(parties.id, sales.partyId)).where(and(eq(sales.hotelId, h), eq(sales.date, date))),
    db
      .select({ e: expenses, cat: cats.name, parentId: cats.parentId, worker: employees.name })
      .from(expenses)
      .innerJoin(cats, eq(cats.id, expenses.categoryId))
      .leftJoin(employees, eq(employees.id, expenses.employeeId))
      .where(and(eq(expenses.hotelId, h), eq(expenses.date, date))),
    db.select({ a: advances, name: employees.name }).from(advances).innerJoin(employees, eq(employees.id, advances.employeeId)).where(and(eq(advances.hotelId, h), eq(advances.date, date))),
    db.select({ r: receipts, party: parties.name }).from(receipts).innerJoin(parties, eq(parties.id, receipts.partyId)).where(and(eq(receipts.hotelId, h), eq(receipts.date, date))),
    db
      .select({ p: salaryPayments, name: employees.name })
      .from(salaryPayments)
      .innerJoin(employees, eq(employees.id, salaryPayments.employeeId))
      .where(and(eq(salaryPayments.hotelId, h), eq(salaryPayments.date, date))),
    db.select().from(parties).where(and(eq(parties.hotelId, h), eq(parties.active, true))).orderBy(parties.name),
    db.select().from(employees).where(and(eq(employees.hotelId, h), eq(employees.active, true))).orderBy(employees.name),
    db.select().from(cats).where(and(eq(cats.hotelId, h), eq(cats.active, true))).orderBy(cats.name),
    db.select({ name: users.name }).from(users).where(and(eq(users.hotelId, h), eq(users.id, day.closedBy ?? 0))),
    db.select({ date: dayBooks.date }).from(dayBooks).where(and(eq(dayBooks.hotelId, h), eq(dayBooks.status, "closed"), lt(dayBooks.date, date))).limit(1),
    // Categories used most in the last 60 days become one-tap buttons on the expense form.
    db
      .select({ categoryId: expenses.categoryId, n: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(eq(expenses.hotelId, h), gte(expenses.date, addDays(today, -60))))
      .groupBy(expenses.categoryId)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
  ]);

  const open = day.status === "open";
  const staffWindow = date >= addDays(today, -1);
  const canEnter = can(user, "enterCounter") && user.access.canWrite && open && (user.role === "admin" || staffWindow);
  // Before the first day is closed, admin types the cash already in the drawer.
  const firstDay = priorClosed.length === 0;
  const hotel = user.hotel;
  const units = (["restaurant", "rooms", "banquet"] as const).filter((u) =>
    u === "restaurant" ? hotel.hasRestaurant : u === "rooms" ? hotel.hasRooms : hotel.hasBanquet,
  );
  const canChange = (kind: Kind, createdBy: number) =>
    canEnter && (user.role === "admin" || createdBy === user.id) && (kind !== "salary" || can(user, "manageMaster"));
  const expectedBeforeDeposit = day.openingCash + t.cashIn - t.cashOut;

  // "Food > Dairy" style labels, children listed under their parent.
  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const catOptions = catRows
    .filter((c) => !catRows.some((x) => x.parentId === c.id))
    .map((c) => ({ value: c.id, label: c.parentId ? `${catName.get(c.parentId)} › ${c.name}` : c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const quickCategories = usage
    .map((u) => catRows.find((c) => c.id === u.categoryId))
    .filter((c): c is (typeof catRows)[number] => !!c)
    .map((c) => ({ value: c.id, label: c.name }));
  const wageCategoryIds = catRows.filter((c) => c.isWages).map((c) => c.id);
  const empOptions = empRows.map((e) => ({ value: e.id, label: `${e.name} (${e.department})` }));
  const workerOptions = empRows.filter((e) => e.payType === "daily").map((e) => ({ value: e.id, label: e.name }));
  const creditParties = partyRows.filter((p) => p.kind !== "aggregator").map((p) => ({ value: p.id, label: p.name }));
  const partyOptions = partyRows.map((p) => ({ value: p.id, label: p.name }));

  // Every entry of the day in one list, newest first.
  const entries = [
    ...saleRows.map(({ s, party }) => ({
      kind: "sale" as const, row: s, linked: !!s.bookingId,
      title: `${UNIT_LABEL[s.unit]} · ${SALE_MODE_LABEL[s.mode]}${party && s.mode === "credit" ? ` · ${party}` : ""}`,
      sub: s.reference,
    })),
    ...expRows.map(({ e, cat, parentId, worker }) => ({
      kind: "expense" as const, row: e, linked: false,
      title: `${parentId ? `${catName.get(parentId)} › ` : ""}${cat} · ${PAY_MODE_LABEL[e.paidVia]}`,
      sub: worker ?? e.vendor ?? e.note,
    })),
    ...advRows.map(({ a, name }) => ({ kind: "advance" as const, row: a, linked: false, title: `${name} · ${PAY_MODE_LABEL[a.paidVia]}`, sub: a.note })),
    ...recRows.map(({ r, party }) => ({
      kind: "receipt" as const, row: r, linked: !!r.bookingId,
      title: `${party} · ${PAY_MODE_LABEL[r.mode]}`, sub: r.note,
    })),
    ...salRows.map(({ p, name }) => ({
      kind: "salary" as const, row: p, linked: false,
      title: `${name} · ${PAY_MODE_LABEL[p.paidVia]}`, sub: `For ${prettyMonth(p.month)}${p.note ? ` · ${p.note}` : ""}`,
    })),
  ].sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime());
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <>
      <PageHeader
        title="Daily Counter"
        sub={
          <span className="inline-flex items-center gap-2">
            {prettyDate(date)} <Badge tone={open ? "ok" : "neutral"}>{open ? "Open" : "Closed"}</Badge>
          </span>
        }
      >
        <span className="flex items-center gap-2">
          <Link className="btn btn-ghost px-3" href={`?date=${addDays(date, -1)}`} aria-label="Previous day">‹</Link>
          <PeriodPicker name="date" value={date} max={today} />
          {date < today && <Link className="btn btn-ghost px-3" href={`?date=${addDays(date, 1)}`} aria-label="Next day">›</Link>}
        </span>
      </PageHeader>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Income" value={rupees(t.income)} tone="in" />
        <Stat label="Expense" value={rupees(t.expense)} tone="out" />
        <Stat label="Cash in drawer" value={rupees(expectedBeforeDeposit - (open ? 0 : day.cashDeposit))} hint="Should be, right now" />
      </div>
      <details className="mt-2 rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted">All totals for the day</summary>
        <dl className="num grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line px-4 py-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Net for the day</dt><dd className={t.net >= 0 ? "text-income" : "text-expense"}>{rupees(t.net)}</dd></div>
          <div><dt className="text-xs text-muted">Cash received</dt><dd>{rupees(t.cashIn)}</dd></div>
          <div><dt className="text-xs text-muted">Paid out in cash</dt><dd>{rupees(t.cashOut)}</dd></div>
          <div><dt className="text-xs text-muted">Opening cash</dt><dd>{rupees(day.openingCash)}</dd></div>
          <div><dt className="text-xs text-muted">Bank / UPI / card in</dt><dd>{rupees(t.bankIn)}</dd></div>
          <div><dt className="text-xs text-muted">Paid from bank</dt><dd>{rupees(t.bankOut)}</dd></div>
          <div><dt className="text-xs text-muted">Zomato / Swiggy / credit</dt><dd>{rupees(t.onCredit)}</dd></div>
          <div><dt className="text-xs text-muted">Advances / salary paid</dt><dd>{rupees(t.advances)} / {rupees(t.salaryPaid)}</dd></div>
        </dl>
      </details>

      <div className="mt-4">
        {canEnter ? (
          <EntryPanel
            date={date}
            units={units}
            creditParties={creditParties}
            categories={catOptions}
            quickCategories={quickCategories}
            wageCategoryIds={wageCategoryIds}
            workers={workerOptions}
            employees={empOptions}
            parties={partyOptions}
          />
        ) : (
          can(user, "enterCounter") && (
            <p className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
              {!user.access.canWrite
                ? "Subscription has ended. Entries are locked until it is renewed."
                : open
                  ? "Only admin can enter for older dates."
                  : "This day is closed. Entries are locked."}
            </p>
          )
        )}
      </div>

      <Card title={`Entries (${entries.length})`} className="mt-4">
        {entries.length === 0 ? (
          <Empty>Nothing entered for this day yet.</Empty>
        ) : (
          <ul className="-mx-4 -my-4 divide-y divide-line">
            {entries.map((en) => {
              const k = KIND[en.kind];
              const line = (
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={k.tone}>{k.label}</Badge>
                      <span className="font-medium">{en.title}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted">
                      {time.format(en.row.createdAt)}{en.sub ? ` · ${en.sub}` : ""}{en.linked ? " · from booking" : ""}
                    </div>
                  </div>
                  <div className={`num shrink-0 text-right font-semibold ${k.sign > 0 ? "text-income" : "text-expense"}`}>
                    {k.sign > 0 ? "" : "-"}{rupees(en.row.amount)}
                  </div>
                </div>
              );
              if (!canChange(en.kind, en.row.createdBy) || en.linked) return <li key={`${en.kind}${en.row.id}`}>{line}</li>;
              const update = updateEntry.bind(null, en.kind, en.row.id);
              const initial = en.row as unknown as Record<string, unknown>;
              return (
                <li key={`${en.kind}${en.row.id}`}>
                  <details className="group">
                    <summary className="cursor-pointer list-none hover:bg-surface-2 [&::-webkit-details-marker]:hidden">{line}</summary>
                    <div className="border-t border-line bg-surface-2 px-4 py-4">
                      {en.kind === "sale" && <SaleForm date={date} units={units} creditParties={creditParties} action={update} initial={initial} />}
                      {en.kind === "expense" && (
                        <ExpenseForm
                          date={date}
                          categories={catOptions}
                          quickCategories={[]}
                          wageCategoryIds={wageCategoryIds}
                          workers={workerOptions}
                          action={update}
                          initial={initial}
                        />
                      )}
                      {en.kind === "advance" && <AdvanceForm date={date} employees={empOptions} action={update} initial={initial} />}
                      {en.kind === "receipt" && <ReceiptForm date={date} parties={partyOptions} action={update} initial={initial} />}
                      {en.kind === "salary" && <SalaryEditForm action={update} initial={initial} />}
                      <div className="mt-3 border-t border-line pt-3">
                        <ActButton run={deleteEntry.bind(null, en.kind, en.row.id)} label={`Delete this ${k.label.toLowerCase()}`} confirm={`Delete this ${k.label.toLowerCase()}?`} />
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Cash drawer" className="mt-4">
        <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:max-w-md">
          <dt className="text-muted">Opening cash</dt><dd className="text-right">{rupees(day.openingCash)}</dd>
          <dt className="text-muted">+ Cash received</dt><dd className="text-right text-income">{rupees(t.cashIn)}</dd>
          <dt className="text-muted">- Cash paid out</dt><dd className="text-right text-expense">{rupees(t.cashOut)}</dd>
          {!open && <><dt className="text-muted">- Deposited to bank</dt><dd className="text-right">{rupees(day.cashDeposit)}</dd></>}
          <dt className="border-t border-line pt-1 font-medium">Should be in drawer</dt>
          <dd className="border-t border-line pt-1 text-right font-semibold">{rupees(expectedBeforeDeposit - (open ? 0 : day.cashDeposit))}</dd>
          {!open && day.countedCash != null && (() => {
            const diff = day.countedCash - (expectedBeforeDeposit - day.cashDeposit);
            return (
              <>
                <dt className="text-muted">Counted</dt><dd className="text-right">{rupees(day.countedCash)}</dd>
                <dt className="text-muted">Difference</dt>
                <dd className={`text-right font-semibold ${diff === 0 ? "text-income" : diff < 0 ? "text-danger" : "text-warn"}`}>{diff === 0 ? "Matches" : rupees(diff)}</dd>
              </>
            );
          })()}
        </dl>
        {!open && (
          <p className="mt-3 text-xs text-muted">
            Closed by {closer[0]?.name ?? "-"}{day.note ? ` · ${day.note}` : ""}
          </p>
        )}
        {canEnter && firstDay && user.role === "admin" && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-sm text-muted">First day: enter the cash already in the drawer before you started using Hotel Desk.</p>
            <ActionForm action={setOpeningCash} submit="Save opening cash" resetOnOk={false}>
              <input type="hidden" name="date" value={date} />
              <div className="sm:max-w-xs">
                <Input name="openingCash" label="Opening cash (₹)" inputMode="decimal" defaultValue={rupeesPlain(day.openingCash)} required />
              </div>
            </ActionForm>
          </div>
        )}
        {canEnter && can(user, "closeDay") && (
          <div className="mt-4 border-t border-line pt-4">
            <CloseDayForm date={date} expected={expectedBeforeDeposit} />
          </div>
        )}
        {!open && can(user, "reopenDay") && user.access.canWrite && (
          <div className="mt-3">
            <ActButton run={reopenDay.bind(null, date)} label="Reopen this day" confirm="Reopen this day for corrections?" className="btn btn-ghost" />
          </div>
        )}
      </Card>
    </>
  );
}
