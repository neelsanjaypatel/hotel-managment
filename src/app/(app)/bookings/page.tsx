import Link from "next/link";
import { requirePage, can } from "@/lib/auth";
import { bookingsBetween } from "@/lib/bookings";
import { addDays, bookingNo, monthBounds, prettyDate, prettyMonth, rupees, todayIST, SLOT_LABEL, UNIT_LABEL } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";
import { BookingBadge } from "@/components/booking-badge";

export const metadata = { title: "Bookings" };

const CHIP: Record<string, string> = {
  confirmed: "bg-accent-soft text-accent",
  tentative: "bg-warn-soft text-warn",
  completed: "bg-surface-2 text-muted border border-line",
  cancelled: "bg-expense-soft text-expense line-through",
};

export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const user = await requirePage();
  if (user.role === "employee") return null;
  const sp = await searchParams;
  const today = todayIST();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const { from, to } = monthBounds(month);

  const [inMonth, upcoming] = await Promise.all([
    bookingsBetween(user.hotelId, from, to),
    bookingsBetween(user.hotelId, today, addDays(today, 60), ["tentative", "confirmed"]),
  ]);
  // Bookings whose date has passed but were never completed or cancelled.
  const overdue = await bookingsBetween(user.hotelId, "2000-01-01", addDays(today, -1), ["tentative", "confirmed"]);

  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const lead = (new Date(from + "T00:00:00Z").getUTCDay() + 6) % 7; // Monday first
  const onDay = (d: string) => inMonth.filter((r) => r.b.date <= d && r.b.endDate >= d);
  const advanceHeld = upcoming.reduce((a, r) => a + r.received, 0);
  const prevMonth = addDays(from, -1).slice(0, 7);
  const nextMonth = addDays(to, 1).slice(0, 7);

  return (
    <>
      <PageHeader title="Bookings" sub="Functions, rooms and tables booked for future dates.">
        {can(user, "enterCounter") && user.access.canWrite && <Link href="/bookings/new" className="btn">+ New booking</Link>}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Upcoming (60 days)" value={String(upcoming.length)} hint={`${upcoming.filter((r) => r.b.status === "tentative").length} tentative`} />
        <Stat label="Booked value" value={rupees(upcoming.reduce((a, r) => a + r.b.totalAmount, 0))} tone="in" />
        <Stat label="Advance received" value={rupees(advanceHeld)} hint="For bookings not yet held" />
        <Stat label="Balance to collect" value={rupees(upcoming.reduce((a, r) => a + r.balance, 0))} tone="warn" />
      </div>

      {overdue.length > 0 && (
        <Card title="Past date, still open" className="mb-4">
          <p className="mb-2 text-sm text-muted">Mark these completed (to post the bill) or cancelled.</p>
          <ul className="space-y-1 text-sm">
            {overdue.map((r) => (
              <li key={r.b.id}>
                <Link href={`/bookings/${r.b.id}`} className="font-medium hover:text-accent">{bookingNo(r.b.number)} · {r.customer} · {r.b.title}</Link>
                <span className="text-muted"> · {prettyDate(r.b.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title={prettyMonth(month)}
        action={
          <span className="flex items-center gap-2">
            <Link className="btn btn-ghost px-3 py-1" href={`?month=${prevMonth}`} aria-label="Previous month">‹</Link>
            <PeriodPicker name="month" type="month" value={month} />
            <Link className="btn btn-ghost px-3 py-1" href={`?month=${nextMonth}`} aria-label="Next month">›</Link>
          </span>
        }
      >
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="pb-1 text-center text-muted">{d}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
          {days.map((d) => {
            const list = onDay(d);
            return (
              <div key={d} className={`min-h-20 rounded-lg border p-1 ${d === today ? "border-accent" : "border-line"} ${d < today ? "opacity-70" : ""}`}>
                <div className="num mb-1 text-right text-[11px] text-muted">{Number(d.slice(8))}</div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((r) => (
                    <Link
                      key={r.b.id}
                      href={`/bookings/${r.b.id}`}
                      title={`${bookingNo(r.b.number)} ${r.customer} · ${r.b.title}`}
                      className={`block truncate rounded px-1 py-0.5 text-[11px] font-medium ${CHIP[r.b.status]}`}
                    >
                      {r.b.unit === "rooms" ? "Room" : SLOT_LABEL[r.b.slot]} · {r.customer}
                    </Link>
                  ))}
                  {list.length > 3 && <div className="px-1 text-[11px] text-muted">+{list.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Upcoming bookings" className="mt-4">
        {upcoming.length === 0 ? (
          <Empty>No upcoming bookings.</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>Date</th><th>Booking</th><th>For</th><th>Status</th><th className="r">Total</th><th className="r">Advance</th><th className="r">Balance</th></tr>
              </thead>
              <tbody>
                {upcoming.map((r) => (
                  <tr key={r.b.id}>
                    <td className="whitespace-nowrap">
                      {prettyDate(r.b.date).replace(/,/g, "").replace(/ \d{4}$/, "")}
                      <div className="text-xs text-muted">{r.b.unit === "rooms" ? `to ${r.b.endDate.slice(8)}/${r.b.endDate.slice(5, 7)}` : SLOT_LABEL[r.b.slot]}</div>
                    </td>
                    <td>
                      <Link href={`/bookings/${r.b.id}`} className="font-medium hover:text-accent">{r.customer}</Link>
                      <div className="text-xs text-muted">{bookingNo(r.b.number)} · {r.b.title}</div>
                    </td>
                    <td className="text-muted">{UNIT_LABEL[r.b.unit]}{r.b.venue ? ` · ${r.b.venue}` : ""}{r.b.guests ? ` · ${r.b.guests}` : ""}</td>
                    <td><BookingBadge status={r.b.status} /></td>
                    <td className="r num">{rupees(r.b.totalAmount)}</td>
                    <td className="r num">{rupees(r.received)}</td>
                    <td className="r num font-semibold">{rupees(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
