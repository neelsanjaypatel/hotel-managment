import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";

const { bookings, parties } = schema;

// Bookings with customer and money received, for lists and the calendar.
export async function bookingsBetween(hotelId: number, from: string, to: string, statuses?: (typeof schema.bookingStatusEnum.enumValues)[number][], db?: DB) {
  db ??= await getDb();
  const rows = await db
    .select({
      b: bookings,
      customer: parties.name,
      phone: parties.phone,
      // Plain SQL: drizzle drops table qualifiers inside select-list subqueries.
      received: sql<number>`coalesce((select sum(r.amount) from receipts r where r.booking_id = "bookings"."id"), 0)::float8`,
    })
    .from(bookings)
    .innerJoin(parties, eq(parties.id, bookings.partyId))
    .where(
      and(
        eq(bookings.hotelId, hotelId),
        lte(bookings.date, to),
        gte(bookings.endDate, from),
        statuses ? inArray(bookings.status, statuses) : undefined,
      ),
    )
    .orderBy(asc(bookings.date), asc(bookings.slot));
  return rows.map((r) => ({ ...r, balance: r.b.status === "cancelled" ? 0 : r.b.totalAmount - r.received }));
}

export type BookingRow = Awaited<ReturnType<typeof bookingsBetween>>[number];
