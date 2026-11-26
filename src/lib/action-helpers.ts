import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, schema, type DB } from "@/db";
import { Forbidden, type HotelUser } from "./auth";
import { addDays, isISODate, toPaise, todayIST } from "./format";
import type { Vars } from "@/i18n";
import { ensureDay } from "./ledger";

// Shared by the "use server" action files. Kept out of them so none of these become callable endpoints.

// `key` and `vars` travel with a message that carries a value ("Paid {amount} to {name}"), so the
// screen can say it in the reader's language. `ok` / `error` always hold the finished English line.
export type FormState = { ok?: string; error?: string; key?: string; vars?: Vars; at?: number } | null;

const fill = (msg: string, vars?: Vars) => (vars ? msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : msg);

export const ok = (msg: string, vars?: Vars): FormState => ({ ok: fill(msg, vars), key: vars && msg, vars, at: Date.now() });
export const fail = (msg: string, vars?: Vars): FormState => ({ error: fill(msg, vars), key: vars && msg, vars, at: Date.now() });

export async function run(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return e.key ? fail(e.key, e.vars) : fail(e.message);
    if (e instanceof Forbidden) return fail(e.message);
    console.error(e);
    return fail("Something went wrong. Please try again.");
  }
}

export class UserError extends Error {
  key?: string;
  vars?: Vars;
  constructor(msg: string, vars?: Vars) {
    super(fill(msg, vars));
    if (vars) {
      this.key = msg;
      this.vars = vars;
    }
  }
}

// Postgres unique_violation. Drizzle wraps the driver error, so the code is on `cause`.
export function isUniqueViolation(e: unknown): boolean {
  for (let x = e as { code?: string; cause?: unknown } | undefined, i = 0; x && i < 5; x = x.cause as typeof x, i++) {
    if (x.code === "23505") return true;
  }
  return false;
}

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const CLOSED = "This day is closed. Admin must reopen it first.";

// Holds the day open until the transaction ends: closing the day takes the row FOR UPDATE, so it
// waits for entries already being saved, and entries arriving after it see "closed".
export async function assertDayOpen(tx: Tx, hotelId: number, date: string) {
  const [day] = await tx
    .select({ status: schema.dayBooks.status })
    .from(schema.dayBooks)
    .where(and(eq(schema.dayBooks.hotelId, hotelId), eq(schema.dayBooks.date, date)))
    .for("share");
  if (day?.status !== "open") throw new UserError(CLOSED);
}

// Saves money entries on a day. The date must have passed checkEntryDate.
export async function onOpenDay<T>(user: HotelUser, date: string, fn: (tx: Tx) => Promise<T>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await assertDayOpen(tx, user.hotelId, date);
    return fn(tx);
  });
}

// One at a time per hotel, for "check, then write" work that no row lock can cover: two people
// booking one hall, or two presses of Pay all. Released when the transaction ends.
export async function lockHotel(tx: Tx, hotelId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${hotelId}::int)`);
}

export async function audit(user: HotelUser, action: string, entity: string, entityId: string | number, data?: unknown) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({ hotelId: user.hotelId, userId: user.id, action, entity, entityId: String(entityId), data: data ?? null });
}

// A referenced row (party, employee, category...) must belong to the user's hotel.
export async function owned<T extends { id: AnyPgColumn; hotelId: AnyPgColumn }>(table: T, id: number, hotelId: number, what: string) {
  if (!id) throw new UserError("Choose the {what}.", { what });
  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row] = await db.select().from(table as any).where(and(eq(table.id, id), eq(table.hotelId, hotelId)));
  if (!row) throw new UserError("Choose the {what}.", { what });
  return row as Record<string, unknown>;
}

// Staff can post to today and yesterday only; admin to any date. The day must be open.
export async function checkEntryDate(user: HotelUser, date: unknown): Promise<string> {
  if (!isISODate(date)) throw new UserError("Invalid date.");
  const today = todayIST();
  if (date > today) throw new UserError("Cannot enter for a future date.");
  if (user.role !== "admin" && date < addDays(today, -1)) {
    throw new UserError("Only today and yesterday can be entered. Ask admin for older dates.");
  }
  const day = await ensureDay(user.hotelId, date);
  if (day.status !== "open") throw new UserError(CLOSED);
  return date;
}

export function amount(fd: FormData, key = "amount") {
  const v = toPaise(fd.get(key));
  if (v == null || v <= 0) throw new UserError("Enter a valid amount.");
  return v;
}

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

