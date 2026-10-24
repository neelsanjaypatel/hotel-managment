"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gt, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireAction, type HotelUser } from "./auth";
import { addDays, bookingNo, isISODate, toPaise, todayIST } from "./format";
import { UserError, amount, audit, checkEntryDate, ok, owned, run, str, type FormState } from "./action-helpers";
import { ensureDay } from "./ledger";

const { bookings, receipts, sales, parties } = schema;

const detailsSchema = z.object({
  unit: z.enum(schema.unitEnum.enumValues),
  title: z.string().trim().min(2, "Write what the booking is for, e.g. Wedding reception"),
  date: z.string().refine(isISODate, "Choose the booking date"),
  slot: z.enum(schema.slotEnum.enumValues).optional(),
  status: z.enum(["tentative", "confirmed"]),
});

type Details = {
  unit: (typeof schema.unitEnum.enumValues)[number];
  title: string;
  date: string;
  endDate: string;
  slot: (typeof schema.slotEnum.enumValues)[number];
  venue: string | null;
  guests: number | null;
  rate: number | null;
  totalAmount: number;
  status: "tentative" | "confirmed";
  notes: string | null;
};

function unitEnabled(user: HotelUser, unit: string) {
  const h = user.hotel;
  return unit === "restaurant" ? h.hasRestaurant : unit === "rooms" ? h.hasRooms : h.hasBanquet;
}

function readDetails(user: HotelUser, fd: FormData): Details {
  const p = detailsSchema.safeParse({
    unit: fd.get("unit"),
    title: fd.get("title"),
    date: fd.get("date"),
    slot: fd.get("slot") || undefined,
    status: fd.get("status") || "confirmed",
  });
  if (!p.success) throw new UserError(p.error.issues[0].message);
  if (!unitEnabled(user, p.data.unit)) throw new UserError("This section is not enabled for your hotel.");
  if (user.role !== "admin" && p.data.date < addDays(todayIST(), -1)) throw new UserError("Booking date cannot be in the past.");

  const rooms = p.data.unit === "rooms";
  const endDate = rooms ? String(fd.get("endDate") ?? "") : p.data.date;
  if (rooms && (!isISODate(endDate) || endDate <= p.data.date)) throw new UserError("Check-out must be after check-in.");

  const guestsRaw = String(fd.get("guests") ?? "").trim();
  const guests = guestsRaw ? Number(guestsRaw) : null;
  if (guests != null && (!Number.isInteger(guests) || guests < 1 || guests > 100000)) throw new UserError("Guests / plates must be a whole number.");
  const rateRaw = String(fd.get("rate") ?? "").trim();
  const rate = rateRaw ? toPaise(rateRaw) : null;
  if (rateRaw && rate == null) throw new UserError("Enter a valid rate.");

  return {
    unit: p.data.unit,
    title: p.data.title,
    date: p.data.date,
    endDate,
    slot: rooms ? "full_day" : (p.data.slot ?? "full_day"),
    venue: str(fd, "venue"),
    guests,
    rate,
    totalAmount: amount(fd, "totalAmount"),
    status: p.data.status,
    notes: str(fd, "notes"),
  };
}

// Same venue, overlapping dates and (for halls / tables) the same part of the day.
async function findClash(hotelId: number, d: Details, exceptId?: number) {
  if (!d.venue) return null;
  const db = await getDb();
  const rooms = d.unit === "rooms";
  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.hotelId, hotelId),
        eq(bookings.unit, d.unit),
        inArray(bookings.status, ["tentative", "confirmed"]),
        sql`lower(${bookings.venue}) = lower(${d.venue})`,
        // Rooms: check-out day is free for the next guest. Halls: same calendar day.
        rooms ? and(lt(bookings.date, d.endDate), gt(bookings.endDate, d.date)) : and(lte(bookings.date, d.endDate), gte(bookings.endDate, d.date)),
        exceptId ? ne(bookings.id, exceptId) : undefined,
      ),
    );
  return rows.find((b) => rooms || b.slot === "full_day" || d.slot === "full_day" || b.slot === d.slot) ?? null;
}

async function loadBooking(user: HotelUser, id: number) {
  const b = await owned(bookings, id, user.hotelId, "booking");
  return b as unknown as schema.Booking;
}

function payMode(fd: FormData, key: string) {
  const m = z.enum(schema.payModeEnum.enumValues).safeParse(fd.get(key));
  if (!m.success) throw new UserError("Choose how the money was paid.");
  return m.data;
}

export async function createBooking(_: FormState, fd: FormData): Promise<FormState> {
  let newId = 0;
  const res = await run(async () => {
    const user = await requireAction("enterCounter");
    const customer = str(fd, "customer");
    if (!customer) throw new UserError("Enter the customer name.");
    const phone = str(fd, "phone");
    if (phone && !/^\d{10}$/.test(phone)) throw new UserError("Phone must be a 10-digit number.");
    const d = readDetails(user, fd);
    const clash = await findClash(user.hotelId, d);
    if (clash) throw new UserError(`${d.venue} is already booked: ${bookingNo(clash.number)} ${clash.title} on ${clash.date}.`);

    const advanceRaw = String(fd.get("advance") ?? "").trim();
    const advance = advanceRaw ? toPaise(advanceRaw) : 0;
    if (advance == null || advance < 0) throw new UserError("Enter a valid advance amount.");
    if (advance > d.totalAmount) throw new UserError("Advance cannot be more than the total amount.");
    const today = todayIST();
    // The advance is money received today, so today's counter must be open.
    if (advance > 0) {
      const day = await ensureDay(user.hotelId, today);
      if (day.status !== "open") {
        throw new UserError("Today's counter is already closed. Save the booking without advance and add the advance tomorrow, or ask admin to reopen today.");
      }
    }
    const mode = advance > 0 ? payMode(fd, "advanceMode") : null;

    const db = await getDb();
    const booking = await db.transaction(async (tx) => {
      const [party] = await tx
        .insert(parties)
        .values({ hotelId: user.hotelId, name: customer, kind: d.unit === "rooms" ? "credit" : "banquet", phone })
        .returning();
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${bookings.number}), 0)::int + 1` })
        .from(bookings)
        .where(eq(bookings.hotelId, user.hotelId));
      const [b] = await tx
        .insert(bookings)
        .values({ hotelId: user.hotelId, number: next, partyId: party.id, ...d, createdBy: user.id })
        .returning();
      if (advance > 0 && mode) {
        await tx.insert(receipts).values({
          hotelId: user.hotelId,
          date: today,
          partyId: party.id,
          bookingId: b.id,
          mode,
          amount: advance,
          note: `Advance ${bookingNo(b.number)}`,
          createdBy: user.id,
        });
      }
      return b;
    });
    await audit(user, "create", "booking", booking.id, { ...booking, advance });
    newId = booking.id;
    revalidatePath("/", "layout");
    return ok("Booking saved.");
  });
  if (res?.ok && newId) redirect(`/bookings/${newId}?saved=1`);
  return res;
}

export async function updateBooking(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const b = await loadBooking(user, Number(fd.get("id")));
    if (b.status === "completed" || b.status === "cancelled") throw new UserError("This booking is closed and cannot be changed.");
    const d = readDetails(user, fd);
    const clash = await findClash(user.hotelId, d, b.id);
    if (clash) throw new UserError(`${d.venue} is already booked: ${bookingNo(clash.number)} ${clash.title} on ${clash.date}.`);
    const db = await getDb();
    await db.update(bookings).set(d).where(and(eq(bookings.id, b.id), eq(bookings.hotelId, user.hotelId)));
    const phone = str(fd, "phone");
    if (phone && !/^\d{10}$/.test(phone)) throw new UserError("Phone must be a 10-digit number.");
    await db.update(parties).set({ phone }).where(and(eq(parties.id, b.partyId), eq(parties.hotelId, user.hotelId)));
    await audit(user, "update", "booking", b.id, d);
    revalidatePath("/", "layout");
    return ok("Booking updated.");
  });
}

// More advance, or the balance, received against a booking.
export async function addBookingPayment(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const b = await loadBooking(user, Number(fd.get("bookingId")));
    if (b.status === "cancelled") throw new UserError("This booking is cancelled.");
    const date = await checkEntryDate(user, todayIST());
    const db = await getDb();
    const [row] = await db
      .insert(receipts)
      .values({
        hotelId: user.hotelId,
        date,
        partyId: b.partyId,
        bookingId: b.id,
        mode: payMode(fd, "mode"),
        amount: amount(fd),
        note: str(fd, "note") ?? `Payment ${bookingNo(b.number)}`,
        createdBy: user.id,
      })
      .returning();
    await audit(user, "create", "receipt", row.id, row);
    revalidatePath("/", "layout");
    return ok("Payment recorded.");
  });
}

// The function happened: post the final bill as a sale on the customer's account.
export async function completeBooking(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("closeDay");
    const b = await loadBooking(user, Number(fd.get("bookingId")));
    if (b.status === "completed" || b.status === "cancelled") throw new UserError("This booking is already closed.");
    if (b.date > todayIST()) throw new UserError("A booking can be completed on or after its date.");
    const date = await checkEntryDate(user, todayIST());
    const bill = amount(fd, "finalAmount");
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.insert(sales).values({
        hotelId: user.hotelId,
        date,
        unit: b.unit,
        mode: "credit",
        amount: bill,
        partyId: b.partyId,
        bookingId: b.id,
        reference: `${bookingNo(b.number)} ${b.title}`,
        createdBy: user.id,
      });
      await tx.update(bookings).set({ status: "completed", totalAmount: bill }).where(eq(bookings.id, b.id));
    });
    await audit(user, "complete", "booking", b.id, { bill });
    revalidatePath("/", "layout");
    return ok("Booking completed. The bill is added to today's sales.");
  });
}

// Cancel: part of the advance may be refunded; whatever is kept becomes income today.
export async function cancelBooking(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("closeDay");
    const b = await loadBooking(user, Number(fd.get("bookingId")));
    if (b.status === "completed" || b.status === "cancelled") throw new UserError("This booking is already closed.");
    const db = await getDb();
    const [{ paid }] = await db
      .select({ paid: sql<number>`coalesce(sum(${receipts.amount}), 0)::int` })
      .from(receipts)
      .where(and(eq(receipts.hotelId, user.hotelId), eq(receipts.bookingId, b.id)));
    const refundRaw = String(fd.get("refund") ?? "").trim();
    const refund = refundRaw ? toPaise(refundRaw) : 0;
    if (refund == null || refund < 0 || refund > paid) throw new UserError(`Refund must be between ₹0 and the ₹${paid / 100} received.`);
    const kept = paid - refund;
    const date = paid > 0 ? await checkEntryDate(user, todayIST()) : todayIST();
    const mode = refund > 0 ? payMode(fd, "refundMode") : null;
    const reason = str(fd, "reason");
    await db.transaction(async (tx) => {
      if (refund > 0 && mode) {
        await tx.insert(receipts).values({
          hotelId: user.hotelId,
          date,
          partyId: b.partyId,
          bookingId: b.id,
          mode,
          amount: -refund,
          note: `Refund ${bookingNo(b.number)}`,
          createdBy: user.id,
        });
      }
      if (kept > 0) {
        await tx.insert(sales).values({
          hotelId: user.hotelId,
          date,
          unit: b.unit,
          mode: "credit",
          amount: kept,
          partyId: b.partyId,
          bookingId: b.id,
          reference: `Cancellation charge ${bookingNo(b.number)}`,
          createdBy: user.id,
        });
      }
      await tx
        .update(bookings)
        .set({ status: "cancelled", notes: [b.notes, reason && `Cancelled: ${reason}`].filter(Boolean).join("\n") || null })
        .where(eq(bookings.id, b.id));
    });
    await audit(user, "cancel", "booking", b.id, { paid, refund, kept, reason });
    revalidatePath("/", "layout");
    return ok(kept > 0 ? "Booking cancelled. The amount kept is added to today's income." : "Booking cancelled.");
  });
}
