import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { bookingNo, prettyDate, rupees, todayIST, PAY_MODE_LABEL, SLOT_LABEL, UNIT_LABEL } from "@/lib/format";
import { Card, PageHeader, Stat } from "@/components/ui";
import { BookingBadge } from "@/components/booking-badge";
import { BookingForm } from "../booking-form";
import { CancelForm, CompleteForm, PaymentForm } from "./actions-panel";
import { getT } from "@/i18n/server";

export default async function BookingPage({ params, searchParams }: PageProps<"/bookings/[id]">) {
  const t = await getT();
  const user = await requirePage();
  if (user.role === "employee") notFound();
  const id = Number((await params).id);
  const saved = (await searchParams).saved === "1";
  const db = await getDb();
  const { bookings, parties, receipts, sales } = schema;
  const [row] = await db
    .select({ b: bookings, party: parties })
    .from(bookings)
    .innerJoin(parties, eq(parties.id, bookings.partyId))
    .where(and(eq(bookings.hotelId, user.hotelId), eq(bookings.id, id || 0)));
  if (!row) notFound();
  const { b, party } = row;
  const [pays, bills] = await Promise.all([
    db.select().from(receipts).where(and(eq(receipts.hotelId, user.hotelId), eq(receipts.bookingId, b.id))).orderBy(asc(receipts.id)),
    db.select().from(sales).where(and(eq(sales.hotelId, user.hotelId), eq(sales.bookingId, b.id))).orderBy(asc(sales.id)),
  ]);
  const received = pays.reduce((a, p) => a + p.amount, 0);
  const billed = bills.reduce((a, s) => a + s.amount, 0);
  const open = b.status === "tentative" || b.status === "confirmed";
  const balance = b.status === "cancelled" ? billed - received : b.totalAmount - received;
  const today = todayIST();
  const writable = user.access.canWrite;
  const h = user.hotel;
  const units = [h.hasBanquet && "banquet", h.hasRooms && "rooms", h.hasRestaurant && "restaurant"].filter(Boolean) as string[];
  const when =
    b.unit === "rooms"
      ? `${prettyDate(b.date, t.locale)} to ${prettyDate(b.endDate, t.locale)}`
      : `${prettyDate(b.date, t.locale)} · ${t(SLOT_LABEL[b.slot])}`;

  return (
    <>
      <PageHeader
        title={`${party.name} · ${b.title}`}
        sub={<span className="inline-flex flex-wrap items-center gap-2">{bookingNo(b.number)} · {when} <BookingBadge status={b.status} /></span>}
      >
        <Link href="/bookings" className="btn btn-ghost">{t("All bookings")}</Link>
        {b.status !== "cancelled" && <Link href={`/bookings/${b.id}/slip`} className="btn">{t("Confirmation slip")}</Link>}
      </PageHeader>

      {saved && (
        <p className="mb-4 rounded-lg bg-accent-soft px-4 py-3 text-sm font-medium text-accent">
          {t("Booking saved. Open the confirmation slip to print it or send it on WhatsApp.")}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={b.status === "completed" ? t("Final bill") : b.status === "cancelled" ? t("Cancellation charge kept") : t("Total amount")}
          value={rupees(b.status === "cancelled" ? billed : b.totalAmount)}
          hint={b.status === "cancelled" ? t("Booked for {amount}", { amount: rupees(b.totalAmount) }) : undefined}
        />
        <Stat label={t("Received")} value={rupees(received)} tone="in" />
        <Stat label={balance < 0 ? t("To refund") : t("Balance due")} value={rupees(Math.abs(balance))} tone={balance > 0 ? "warn" : undefined} />
        <Stat label={t("Customer")} value={party.name} hint={party.phone ?? t("No mobile number")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("Details")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted">{t("For")}</dt><dd>{t(UNIT_LABEL[b.unit])}{b.venue ? ` · ${b.venue}` : ""}</dd>
            <dt className="text-muted">{t("When")}</dt><dd>{when}</dd>
            {b.guests != null && <><dt className="text-muted">{b.unit === "rooms" ? t("Rooms") : t("Guests / plates")}</dt><dd>{b.guests}</dd></>}
            {b.rate != null && <><dt className="text-muted">{t("Rate")}</dt><dd className="num">{rupees(b.rate)}{b.unit === "rooms" ? t(" per room per night") : t(" per plate")}</dd></>}
            {b.notes && <><dt className="text-muted">{t("Notes")}</dt><dd className="whitespace-pre-line">{b.notes}</dd></>}
          </dl>
        </Card>

        <Card title={t("Payments and bills")}>
          {pays.length + bills.length === 0 ? (
            <p className="text-sm text-muted">{t("No money received yet.")}</p>
          ) : (
            <ul className="num space-y-1.5 text-sm">
              {pays.map((p) => (
                <li key={`r${p.id}`} className="flex justify-between gap-3">
                  <span>{prettyDate(p.date, t.locale)} · {p.amount < 0 ? t("Refund") : t("Received")} · {t(PAY_MODE_LABEL[p.mode])}</span>
                  <span className={p.amount < 0 ? "text-expense" : "text-income"}>{rupees(p.amount)}</span>
                </li>
              ))}
              {bills.map((s) => (
                <li key={`s${s.id}`} className="flex justify-between gap-3">
                  <span>{prettyDate(s.date, t.locale)} · {s.reference?.startsWith("Cancellation") ? t("Cancellation charge") : t("Bill")}</span>
                  <span>{rupees(s.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {writable && b.status !== "cancelled" && balance > 0 && can(user, "enterCounter") && (
          <Card title={b.status === "completed" ? t("Collect balance") : t("Add advance")}>
            <PaymentForm bookingId={b.id} />
          </Card>
        )}

        {writable && open && can(user, "closeDay") && b.date <= today && (
          <Card title={b.unit === "rooms" ? t("Guest checked out? Post the bill") : t("Function done? Post the bill")}>
            <CompleteForm bookingId={b.id} total={b.totalAmount} />
          </Card>
        )}
      </div>

      {writable && open && can(user, "enterCounter") && (
        <details className="mt-4 rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{t("Change booking details")}</summary>
          <div className="border-t border-line p-4">
            <BookingForm units={units} today={today} booking={b} customer={{ name: party.name, phone: party.phone }} />
          </div>
        </details>
      )}

      {writable && open && can(user, "closeDay") && (
        <details className="mt-4 rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-danger">{t("Cancel booking")}</summary>
          <div className="border-t border-line p-4">
            <CancelForm bookingId={b.id} received={received} />
          </div>
        </details>
      )}
    </>
  );
}
