import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { bookingNo, prettyDate, rupees, todayIST, SLOT_LABEL, UNIT_LABEL } from "@/lib/format";
import { PrintButton } from "@/components/print-button";
import { getT } from "@/i18n/server";

export const metadata = { title: "Booking confirmation" };

export default async function SlipPage({ params }: PageProps<"/bookings/[id]/slip">) {
  const t = await getT();
  const user = await requirePage();
  if (user.role === "employee") notFound();
  const id = Number((await params).id);
  const db = await getDb();
  const { bookings, parties, receipts } = schema;
  const [row] = await db
    .select({ b: bookings, party: parties })
    .from(bookings)
    .innerJoin(parties, eq(parties.id, bookings.partyId))
    .where(and(eq(bookings.hotelId, user.hotelId), eq(bookings.id, id || 0)));
  if (!row || row.b.status === "cancelled") notFound();
  const { b, party } = row;
  const [{ received }] = await db
    .select({ received: sql<number>`coalesce(sum(${receipts.amount}), 0)::float8` })
    .from(receipts)
    .where(and(eq(receipts.hotelId, user.hotelId), eq(receipts.bookingId, b.id)));
  const h = user.hotel;
  const balance = b.totalAmount - received;
  const when = b.unit === "rooms" ? t("{from} to {to}", { from: prettyDate(b.date, t.locale), to: prettyDate(b.endDate, t.locale) }) : `${prettyDate(b.date, t.locale)}, ${t(SLOT_LABEL[b.slot])}`;

  const lines = [
    `*${h.name}* - ${b.status === "tentative" ? t("Booking on hold") : t("Booking confirmed")}`,
    `${t("Booking no")}: ${bookingNo(b.number)}`,
    `${t("Name")}: ${party.name}`,
    `${t("For")}: ${b.title} (${t(UNIT_LABEL[b.unit])}${b.venue ? `, ${b.venue}` : ""})`,
    `${t("When")}: ${when}`,
    b.guests ? `${b.unit === "rooms" ? t("Rooms") : t("Guests")}: ${b.guests}` : null,
    `${t("Total")}: ${rupees(b.totalAmount)}`,
    `${t("Advance received")}: ${rupees(received)}`,
    `${t("Balance")}: ${rupees(balance)}`,
    h.phone ? `${t("Contact")}: ${h.phone}` : null,
  ].filter(Boolean);
  const wa = `https://wa.me/${party.phone ? `91${party.phone}` : ""}?text=${encodeURIComponent(lines.join("\n"))}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Link href={`/bookings/${b.id}`} className="btn btn-ghost">{t("Back to booking")}</Link>
        <PrintButton />
        <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          {t("Send on WhatsApp")}{party.phone ? "" : t(" (choose contact)")}
        </a>
      </div>

      <article className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 print:border-0 print:p-0">
        <header className="border-b border-line pb-4 text-center">
          <h1 className="text-xl font-semibold">{h.name}</h1>
          <p className="text-sm text-muted">{[h.city, h.phone && `Ph ${h.phone}`, h.gstin && `GSTIN ${h.gstin}`].filter(Boolean).join(" · ")}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-accent">
            {t("Booking")}{" "}{b.status === "tentative" ? t("on hold") : t("confirmation")}
          </p>
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 py-4 text-sm">
          <dt className="text-muted">{t("Booking no")}</dt><dd className="font-semibold">{bookingNo(b.number)}</dd>
          <dt className="text-muted">{t("Issued on")}</dt><dd>{prettyDate(todayIST(), t.locale)}</dd>
          <dt className="text-muted">{t("Name")}</dt><dd>{party.name}{party.phone ? ` · ${party.phone}` : ""}</dd>
          <dt className="text-muted">{t("Occasion")}</dt><dd>{b.title}</dd>
          <dt className="text-muted">{t("Booked")}</dt><dd>{t(UNIT_LABEL[b.unit])}{b.venue ? ` · ${b.venue}` : ""}</dd>
          <dt className="text-muted">{b.unit === "rooms" ? t("Stay") : t("Date & time")}</dt><dd className="font-semibold">{when}</dd>
          {b.guests != null && <><dt className="text-muted">{b.unit === "rooms" ? t("Rooms") : t("Guests / plates")}</dt><dd>{b.guests}</dd></>}
          {b.rate != null && <><dt className="text-muted">{t("Rate")}</dt><dd className="num">{rupees(b.rate)}{b.unit === "rooms" ? t(" per room per night") : t(" per plate")}</dd></>}
          {b.notes && <><dt className="text-muted">{t("Notes")}</dt><dd className="whitespace-pre-line">{b.notes}</dd></>}
        </dl>

        <dl className="num grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line pt-4 text-sm">
          <dt>{t("Total amount")}</dt><dd className="text-right">{rupees(b.totalAmount)}</dd>
          <dt>{t("Advance received")}</dt><dd className="text-right">{rupees(received)}</dd>
          <dt className="border-t border-line pt-1.5 font-semibold">{t("Balance payable")}</dt>
          <dd className="border-t border-line pt-1.5 text-right font-semibold">{rupees(balance)}</dd>
        </dl>

        <footer className="mt-6 flex items-end justify-between text-xs text-muted">
          <span>{t("Please keep this slip for your booking.")}</span>
          <span className="border-t border-line pt-1">{t("Authorised signature")}</span>
        </footer>
      </article>
    </>
  );
}
