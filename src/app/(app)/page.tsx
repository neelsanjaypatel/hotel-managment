import Link from "next/link";
import { redirect } from "next/navigation";
import { and, between, eq, sql } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { dailySeries, dayRows, groupCategories, partyBalances, rangeTotals } from "@/lib/ledger";
import { bookingsBetween } from "@/lib/bookings";
import { monthProfit } from "@/lib/payroll";
import { addDays, bookingNo, monthBounds, prettyDate, prettyMonth, rupees, todayIST, SALE_MODE_LABEL, SLOT_LABEL, UNIT_LABEL, isMonth } from "@/lib/format";
import { Badge, Bar, Card, PageHeader, QuickAction, Stat } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";
import { DailyChart } from "@/components/daily-chart";
import { getT } from "@/i18n/server";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const t = await getT();
  const user = await requirePage();
  if (!can(user, "viewReports")) redirect(user.role === "employee" ? "/me" : "/counter");

  const today = todayIST();
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const last = to < today ? to : today;
  const db = await getDb();
  const { dayBooks, expenseCategories } = schema;

  const h = user.hotelId;
  const [todayT, m, series, dues, cats, todayBook, shortRows] = await Promise.all([
    rangeTotals(h, today, today, db),
    rangeTotals(h, from, to, db),
    dailySeries(h, from, to, db),
    partyBalances(h, db),
    db.select().from(expenseCategories).where(eq(expenseCategories.hotelId, h)),
    db.select().from(dayBooks).where(and(eq(dayBooks.hotelId, h), eq(dayBooks.date, today))),
    // Closed days where counted cash differs from expected (same formula as the day-wise report).
    dayRows(h, from, to, db),
  ]);
  const shorts = shortRows.filter((r) => r.status === "closed" && r.diff != null && r.diff !== 0).map((r) => ({ date: r.date, diff: r.diff ?? 0 }));
  const shortTotal = shorts.reduce((a, r) => a + r.diff, 0);
  const totalDue = dues.reduce((a, d) => a + Math.max(0, d.due), 0);
  const groups = groupCategories(m.expByCat, cats);
  const maxGroup = Math.max(1, ...groups.map((g) => g.total));
  const maxUnit = Math.max(1, ...m.salesByUnit.map((u) => u.total));
  const maxMode = Math.max(1, ...m.salesByMode.map((u) => u.total));
  const setup = user.role === "admin" ? await setupSteps(h) : [];
  const profit = await monthProfit(h, month, db);
  // Things left undone: attendance not marked today, yesterday's counter not closed.
  const yesterday = addDays(today, -1);
  const [[unmarked], [yBook], [hadYesterday]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.hotelId, h),
          eq(schema.employees.active, true),
          sql`not exists (select 1 from attendance a where a.employee_id = ${schema.employees.id} and a.date = ${today})`,
        ),
      ),
    db.select({ status: dayBooks.status }).from(dayBooks).where(and(eq(dayBooks.hotelId, h), eq(dayBooks.date, yesterday))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.sales).where(and(eq(schema.sales.hotelId, h), eq(schema.sales.date, yesterday))),
  ]);
  const reminders = [
    unmarked.n > 0 && { text: unmarked.n === 1 ? t("Attendance not marked yet for 1 person today") : t("Attendance not marked yet for {n} people today", { n: unmarked.n }), href: "/attendance" },
    (yBook?.status === "open" || (!yBook && hadYesterday.n > 0)) && { text: t("Yesterday's counter is not closed (cash not counted)"), href: `/counter?date=${yesterday}` },
  ].filter(Boolean) as { text: string; href: string }[];
  const soon = await bookingsBetween(h, today, addDays(today, 7), ["tentative", "confirmed"], db);
  const units = (["restaurant", "rooms", "banquet"] as const).filter((u) =>
    u === "restaurant" ? user.hotel.hasRestaurant : u === "rooms" ? user.hotel.hasRooms : user.hotel.hasBanquet,
  );
  const openDays = await db.select({ n: sql<number>`count(*)::int` }).from(dayBooks).where(and(eq(dayBooks.hotelId, h), eq(dayBooks.status, "open"), between(dayBooks.date, from, last)));

  return (
    <>
      <PageHeader title={t("Dashboard")} sub={`${prettyMonth(month, t.locale)} · ${t("all sections")}`}>
        <Link href={`/summary?month=${month}`} className="btn btn-ghost">{t("Money summary")}</Link>
        <PeriodPicker name="month" type="month" value={month} max={today.slice(0, 7)} />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickAction href="/counter" title={t("Add sale or expense")} sub={t("Today's counter")}>
          <path d="M12 5v14M5 12h14" />
        </QuickAction>
        <QuickAction href="/attendance" title={t("Mark attendance")} sub={t("Who came today")}>
          <path d="M5 4h14v17H5zM9 12l2 2 4-4" />
        </QuickAction>
        <QuickAction href="/bookings" title={t("New booking")} sub={t("Rooms and banquet")}>
          <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
        </QuickAction>
        <QuickAction href="/reports" title={t("See reports")} sub={t("Day, month, sections")}>
          <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
        </QuickAction>
      </div>

      {reminders.length > 0 && (
        <div className="mb-4 space-y-2">
          {reminders.map((r) => (
            <Link key={r.href} href={r.href} className="block rounded-lg bg-warn-soft px-4 py-2.5 text-sm font-medium text-warn">
              {r.text} ›
            </Link>
          ))}
        </div>
      )}

      {setup.some((s) => !s.done) && (
        <Card title={t("Get your hotel ready")} className="mb-4">
          <ol className="space-y-2 text-sm">
            {setup.map((s, i) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-accent text-accent-ink" : "border border-line text-muted"}`}>
                  {s.done ? "✓" : i + 1}
                </span>
                {s.done ? (
                  <span className="text-muted line-through">{s.label}</span>
                ) : (
                  <Link href={s.href} className="font-medium hover:text-accent">{s.label} ›</Link>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card
        title={<span className="inline-flex items-center gap-2">{t("Today")}{" "}<Badge tone={todayBook[0]?.status === "closed" ? "neutral" : "ok"}>{todayBook[0]?.status === "closed" ? t("Closed") : t("Live")}</Badge></span>}
        action={<Link href="/counter" className="text-sm text-accent">{t("Open counter ›")}</Link>}
      >
        <div className="num grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><div className="text-xs text-muted">{t("Income")}</div><div className="text-lg font-semibold text-income">{rupees(todayT.income)}</div></div>
          <div><div className="text-xs text-muted">{t("Expense")}</div><div className="text-lg font-semibold text-expense">{rupees(todayT.expense)}</div></div>
          <div><div className="text-xs text-muted">{t("Cash received")}</div><div className="text-lg font-semibold">{rupees(todayT.cashIn)}</div></div>
          <div><div className="text-xs text-muted">{t("Bank / UPI / card")}</div><div className="text-lg font-semibold">{rupees(todayT.bankIn)}</div></div>
        </div>
      </Card>

      {soon.length > 0 && (
        <Card title={t("Bookings in the next 7 days ({n})", { n: soon.length })} action={<Link href="/bookings" className="text-sm text-accent">{t("All bookings ›")}</Link>} className="mt-4">
          <ul className="space-y-1.5 text-sm">
            {soon.map((r) => (
              <li key={r.b.id} className="flex flex-wrap justify-between gap-2">
                <Link href={`/bookings/${r.b.id}`} className="hover:text-accent">
                  <span className="font-medium">{prettyDate(r.b.date, t.locale).replace(/,/g, "").replace(/ \d{4}$/, "")}</span>
                  {" · "}{r.b.unit === "rooms" ? t("Rooms") : t(SLOT_LABEL[r.b.slot])} · {r.customer} · {r.b.title}
                  <span className="text-muted"> · {bookingNo(r.b.number)}</span>
                </Link>
                <span className="num text-muted">{t("Balance")}{" "}{rupees(r.balance)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Month income")} value={rupees(m.income)} tone="in" />
        <Stat label={t("Expenses (excl. staff)")} value={rupees(profit.otherExpenses)} tone="out" />
        <Stat label={t("Staff salaries")} value={rupees(profit.salaries)} tone="out" hint={month === today.slice(0, 7) ? t("Earned so far this month") : t("Earned in the month")} />
        <Stat
          label={t("Profit after salaries")}
          value={rupees(profit.profit)}
          tone={profit.profit >= 0 ? "in" : "out"}
          hint={<Link href={`/partners?month=${month}`} className="text-accent">{t("Partner shares ›")}</Link>}
        />
        <Stat label={t("Pending dues")} value={rupees(totalDue)} tone="warn" hint={t("Zomato, Swiggy, credit, banquet")} />
        <Stat label={t("Cash received")} value={rupees(m.cashIn)} />
        <Stat label={t("Bank / UPI / card")} value={rupees(m.bankIn)} />
        <Stat label={t("Advances given")} value={rupees(m.advances)} />
        <Stat label={t("Cash short / excess")} value={rupees(shortTotal)} tone={shortTotal < 0 ? "out" : undefined} hint={`${t("{n} day(s) did not match", { n: shorts.length })}${openDays[0]?.n ? ` · ${t("{n} day(s) not closed", { n: openDays[0].n })}` : ""}`} />
      </div>

      <Card title={t("Daily income vs expense")} className="mt-4">
        <DailyChart from={from} to={to} data={series} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t("Income by section")}>
          <ul className="space-y-3">
            {units.map((u) => {
              const v = m.salesByUnit.find((x) => x.key === u)?.total ?? 0;
              return (
                <li key={u}>
                  <div className="num mb-1 flex justify-between text-sm"><span>{t(UNIT_LABEL[u])}</span><span className="font-medium">{rupees(v)}</span></div>
                  <Bar value={v} max={maxUnit} />
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title={t("Income by payment mode")}>
          <ul className="space-y-3">
            {[...m.salesByMode].sort((a, b) => b.total - a.total).map((r) => (
              <li key={r.key}>
                <div className="num mb-1 flex justify-between text-sm"><span>{t(SALE_MODE_LABEL[r.key])}</span><span className="font-medium">{rupees(r.total)}</span></div>
                <Bar value={r.total} max={maxMode} />
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("Expenses by category")}>
          <ul className="space-y-3">
            {groups.map((g) => (
              <li key={g.name}>
                <div className="num mb-1 flex justify-between text-sm"><span>{g.name}</span><span className="font-medium">{rupees(g.total)}</span></div>
                <Bar value={g.total} max={maxGroup} tone="out" />
                {g.children.length > 0 && (
                  <ul className="num mt-1.5 space-y-0.5 pl-3 text-xs text-muted">
                    {g.children.sort((a, b) => b.total - a.total).map((c) => (
                      <li key={c.name} className="flex justify-between"><span>{c.name}</span><span>{rupees(c.total)}</span></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

// Onboarding checklist for a new hotel's owner; disappears once every step is done.
async function setupSteps(hotelId: number) {
  const t = await getT();
  const db = await getDb();
  const count = async (table: typeof schema.employees | typeof schema.users | typeof schema.sales) => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.hotelId, hotelId));
    return r.n;
  };
  const [emps, users, salesN, closed] = await Promise.all([
    count(schema.employees),
    count(schema.users),
    count(schema.sales),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.dayBooks)
      .where(and(eq(schema.dayBooks.hotelId, hotelId), eq(schema.dayBooks.status, "closed"))),
  ]);
  return [
    { label: t("Add your employees with salary or daily wage"), href: "/employees", done: emps > 0 },
    { label: t("Create logins for managers and partners"), href: "/settings", done: users > 1 },
    { label: t("Set opening cash and enter the first sale"), href: "/counter", done: salesN > 0 },
    { label: t("Close your first day (count the cash)"), href: "/counter", done: closed[0].n > 0 },
  ];
}
