import Link from "next/link";
import { and, desc, eq, lt } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { ensureDay, rangeTotals } from "@/lib/ledger";
import { addDays, isISODate, prettyDate, rupees, rupeesPlain, todayIST, PAY_MODE_LABEL, SALE_MODE_LABEL, UNIT_LABEL } from "@/lib/format";
import { deleteEntry, reopenDay, setOpeningCash } from "@/lib/actions";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { ActButton, ActionForm, Input, PeriodPicker } from "@/components/forms";
import { AdvanceForm, ExpenseForm, ReceiptForm, SaleForm } from "./entry-forms";
import { CloseDayForm } from "./close-day";

export const metadata = { title: "Daily Counter" };

export default async function CounterPage({ searchParams }: PageProps<"/counter">) {
  const user = await requirePage();
  if (user.role === "employee") return null;
  const sp = await searchParams;
  const today = todayIST();
  const date = isISODate(sp.date) && sp.date <= today ? sp.date : today;
  const db = await getDb();
  const { sales, expenses, advances, receipts, parties, employees, expenseCategories: cats, users, dayBooks } = schema;

  const h = user.hotelId;
  const day = await ensureDay(h, date, db);
  const [t, saleRows, expRows, advRows, recRows, partyRows, empRows, catRows, closer, priorClosed] = await Promise.all([
    rangeTotals(h, date, date, db),
    db.select({ s: sales, party: parties.name }).from(sales).leftJoin(parties, eq(parties.id, sales.partyId)).where(and(eq(sales.hotelId, h), eq(sales.date, date))).orderBy(desc(sales.id)),
    db
      .select({ e: expenses, cat: cats.name, parentId: cats.parentId, worker: employees.name })
      .from(expenses)
      .innerJoin(cats, eq(cats.id, expenses.categoryId))
      .leftJoin(employees, eq(employees.id, expenses.employeeId))
      .where(and(eq(expenses.hotelId, h), eq(expenses.date, date)))
      .orderBy(desc(expenses.id)),
    db.select({ a: advances, name: employees.name }).from(advances).innerJoin(employees, eq(employees.id, advances.employeeId)).where(and(eq(advances.hotelId, h), eq(advances.date, date))).orderBy(desc(advances.id)),
    db.select({ r: receipts, party: parties.name }).from(receipts).innerJoin(parties, eq(parties.id, receipts.partyId)).where(and(eq(receipts.hotelId, h), eq(receipts.date, date))).orderBy(desc(receipts.id)),
    db.select().from(parties).where(and(eq(parties.hotelId, h), eq(parties.active, true))).orderBy(parties.name),
    db.select().from(employees).where(and(eq(employees.hotelId, h), eq(employees.active, true))).orderBy(employees.name),
    db.select().from(cats).where(and(eq(cats.hotelId, h), eq(cats.active, true))).orderBy(cats.name),
    db.select({ name: users.name }).from(users).where(and(eq(users.hotelId, h), eq(users.id, day.closedBy ?? 0))),
    db.select({ date: dayBooks.date }).from(dayBooks).where(and(eq(dayBooks.hotelId, h), eq(dayBooks.status, "closed"), lt(dayBooks.date, date))).limit(1),
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
  const canDelete = (createdBy: number) => canEnter && (user.role === "admin" || createdBy === user.id);
  const expectedBeforeDeposit = day.openingCash + t.cashIn - t.cashOut;

  // "Food > Dairy" style labels, children listed under their parent.
  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const catOptions = catRows
    .filter((c) => !catRows.some((x) => x.parentId === c.id))
    .map((c) => ({ value: c.id, label: c.parentId ? `${catName.get(c.parentId)} › ${c.name}` : c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const empOptions = empRows.map((e) => ({ value: e.id, label: `${e.name} (${e.department})` }));
  const workerOptions = empRows.filter((e) => e.payType === "daily").map((e) => ({ value: e.id, label: e.name }));

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
        <Link className="btn btn-ghost" href={`?date=${addDays(date, -1)}`} aria-label="Previous day">‹</Link>
        <PeriodPicker name="date" value={date} max={today} />
        {date < today && <Link className="btn btn-ghost" href={`?date=${addDays(date, 1)}`} aria-label="Next day">›</Link>}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total income" value={rupees(t.income)} tone="in" />
        <Stat label="Total expense" value={rupees(t.expense)} tone="out" />
        <Stat label="Net for the day" value={rupees(t.net)} tone={t.net >= 0 ? "in" : "out"} />
        <Stat label="Advances given" value={rupees(t.advances)} tone="warn" />
        <Stat label="Cash received" value={rupees(t.cashIn)} hint={`Paid out in cash ${rupees(t.cashOut)}`} />
        <Stat label="Bank / UPI / card" value={rupees(t.bankIn)} hint={`Paid from bank ${rupees(t.bankOut)}`} />
        <Stat label="Zomato / Swiggy / credit" value={rupees(t.onCredit)} hint="To be received later" />
        <Stat label="Opening cash" value={rupees(day.openingCash)} />
      </div>

      {canEnter && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Add sale">
            <SaleForm date={date} units={units} creditParties={partyRows.filter((p) => p.kind !== "aggregator").map((p) => ({ value: p.id, label: p.name }))} />
          </Card>
          <Card title="Add expense">
            <ExpenseForm date={date} categories={catOptions} wageCategoryIds={catRows.filter((c) => c.isWages).map((c) => c.id)} workers={workerOptions} />
          </Card>
          <Card title="Advance to employee">
            <AdvanceForm date={date} employees={empOptions} />
          </Card>
          <Card title="Payment received (Zomato, Swiggy, credit, banquet)">
            <ReceiptForm date={date} parties={partyRows.map((p) => ({ value: p.id, label: p.name }))} />
          </Card>
        </div>
      )}
      {!canEnter && can(user, "enterCounter") && (
        <p className="mt-6 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
          {!user.access.canWrite
            ? "Subscription has ended. Entries are locked until it is renewed."
            : open
              ? "Only admin can enter for older dates."
              : "This day is closed. Entries are locked."}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title={`Sales (${saleRows.length})`}>
          {saleRows.length === 0 ? (
            <Empty>No sales entered yet.</Empty>
          ) : (
            <div className="-mx-4 -my-4 overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr><th>Section</th><th>Mode</th><th>Note</th><th className="r">Amount</th><th /></tr>
                </thead>
                <tbody>
                  {saleRows.map(({ s, party }) => (
                    <tr key={s.id}>
                      <td>{UNIT_LABEL[s.unit]}</td>
                      <td>{SALE_MODE_LABEL[s.mode]}{party && s.mode === "credit" ? ` · ${party}` : ""}</td>
                      <td className="text-muted">{s.reference}</td>
                      <td className="r num">{rupees(s.amount)}</td>
                      <td className="r">{canDelete(s.createdBy) && <ActButton run={deleteEntry.bind(null, "sale", s.id)} label="Delete" confirm="Delete this sale?" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={`Expenses (${expRows.length})`}>
          {expRows.length === 0 ? (
            <Empty>No expenses entered yet.</Empty>
          ) : (
            <div className="-mx-4 -my-4 overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr><th>Category</th><th>Paid</th><th>For</th><th className="r">Amount</th><th /></tr>
                </thead>
                <tbody>
                  {expRows.map(({ e, cat, parentId, worker }) => (
                    <tr key={e.id}>
                      <td>{parentId ? <><span className="text-muted">{catName.get(parentId)} › </span>{cat}</> : cat}</td>
                      <td>{PAY_MODE_LABEL[e.paidVia]}</td>
                      <td className="text-muted">{worker ?? e.vendor ?? e.note}</td>
                      <td className="r num">{rupees(e.amount)}</td>
                      <td className="r">{canDelete(e.createdBy) && <ActButton run={deleteEntry.bind(null, "expense", e.id)} label="Delete" confirm="Delete this expense?" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {advRows.length > 0 && (
          <Card title="Advances">
            <div className="-mx-4 -my-4 overflow-x-auto">
              <table className="tbl">
                <tbody>
                  {advRows.map(({ a, name }) => (
                    <tr key={a.id}>
                      <td>{name}</td>
                      <td>{PAY_MODE_LABEL[a.paidVia]}</td>
                      <td className="text-muted">{a.note}</td>
                      <td className="r num">{rupees(a.amount)}</td>
                      <td className="r">{canDelete(a.createdBy) && <ActButton run={deleteEntry.bind(null, "advance", a.id)} label="Delete" confirm="Delete this advance?" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {recRows.length > 0 && (
          <Card title="Payments received">
            <div className="-mx-4 -my-4 overflow-x-auto">
              <table className="tbl">
                <tbody>
                  {recRows.map(({ r, party }) => (
                    <tr key={r.id}>
                      <td>{party}</td>
                      <td>{PAY_MODE_LABEL[r.mode]}</td>
                      <td className="text-muted">{r.note}</td>
                      <td className="r num">{rupees(r.amount)}</td>
                      <td className="r">{canDelete(r.createdBy) && <ActButton run={deleteEntry.bind(null, "receipt", r.id)} label="Delete" confirm="Delete this payment?" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Card title="Cash drawer" className="mt-6">
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
