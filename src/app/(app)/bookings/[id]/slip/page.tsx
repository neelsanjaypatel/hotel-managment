import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { bookingNo, prettyDate, rupees, todayIST, SLOT_LABEL, UNIT_LABEL } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Booking confirmation" };

export default async function SlipPage({ params }: PageProps<"/bookings/[id]/slip">) {
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
  const when = b.unit === "rooms" ? `${prettyDate(b.date)} to ${prettyDate(b.endDate)}` : `${prettyDate(b.date)}, ${SLOT_LABEL[b.slot]}`;

  const lines = [
    `*${h.name}* - Booking ${b.status === "tentative" ? "on hold" : "confirmed"}`,
    `Booking no: ${bookingNo(b.number)}`,
    `Name: ${party.name}`,
    `For: ${b.title} (${UNIT_LABEL[b.unit]}${b.venue ? `, ${b.venue}` : ""})`,
    `When: ${when}`,
    b.guests ? `${b.unit === "rooms" ? "Rooms" : "Guests"}: ${b.guests}` : null,
    `Total: ${rupees(b.totalAmount)}`,
    `Advance received: ${rupees(received)}`,
    `Balance: ${rupees(balance)}`,
    h.phone ? `Contact: ${h.phone}` : null,
  ].filter(Boolean);
  const wa = `https://wa.me/${party.phone ? `91${party.phone}` : ""}?text=${encodeURIComponent(lines.join("\n"))}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Link href={`/bookings/${b.id}`} className="btn btn-ghost">Back to booking</Link>
        <PrintButton />
        <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          Send on WhatsApp{party.phone ? "" : " (choose contact)"}
        </a>
      </div>

      <article className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 print:border-0 print:p-0">
        <header className="border-b border-line pb-4 text-center">
          <h1 className="text-xl font-semibold">{h.name}</h1>
          <p className="text-sm text-muted">{[h.city, h.phone && `Ph ${h.phone}`, h.gstin && `GSTIN ${h.gstin}`].filter(Boolean).join(" · ")}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-accent">
            Booking {b.status === "tentative" ? "on hold" : "confirmation"}
          </p>
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 py-4 text-sm">
          <dt className="text-muted">Booking no</dt><dd className="font-semibold">{bookingNo(b.number)}</dd>
          <dt className="text-muted">Issued on</dt><dd>{prettyDate(todayIST())}</dd>
          <dt className="text-muted">Name</dt><dd>{party.name}{party.phone ? ` · ${party.phone}` : ""}</dd>
          <dt className="text-muted">Occasion</dt><dd>{b.title}</dd>
          <dt className="text-muted">Booked</dt><dd>{UNIT_LABEL[b.unit]}{b.venue ? ` · ${b.venue}` : ""}</dd>
          <dt className="text-muted">{b.unit === "rooms" ? "Stay" : "Date & time"}</dt><dd className="font-semibold">{when}</dd>
          {b.guests != null && <><dt className="text-muted">{b.unit === "rooms" ? "Rooms" : "Guests / plates"}</dt><dd>{b.guests}</dd></>}
          {b.rate != null && <><dt className="text-muted">Rate</dt><dd className="num">{rupees(b.rate)}{b.unit === "rooms" ? " per room per night" : " per plate"}</dd></>}
          {b.notes && <><dt className="text-muted">Notes</dt><dd className="whitespace-pre-line">{b.notes}</dd></>}
        </dl>

        <dl className="num grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-line pt-4 text-sm">
          <dt>Total amount</dt><dd className="text-right">{rupees(b.totalAmount)}</dd>
          <dt>Advance received</dt><dd className="text-right">{rupees(received)}</dd>
          <dt className="border-t border-line pt-1.5 font-semibold">Balance payable</dt>
          <dd className="border-t border-line pt-1.5 text-right font-semibold">{rupees(balance)}</dd>
        </dl>

        <footer className="mt-6 flex items-end justify-between text-xs text-muted">
          <span>Please keep this slip for your booking.</span>
          <span className="border-t border-line pt-1">Authorised signature</span>
        </footer>
      </article>
    </>
  );
}
