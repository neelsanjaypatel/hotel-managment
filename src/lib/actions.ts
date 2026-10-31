"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getUser, hashPassword, keepOnlyThisSession, login, loginLocked, logout, requireAction, verifyPassword, type HotelUser } from "./auth";
import { addDays, isISODate, toPaise, todayIST, PAID_MODES } from "./format";
import { UserError, amount, audit, checkEntryDate, fail, isUniqueViolation, lockHotel, ok, onOpenDay, owned, run, str, type FormState, type Tx } from "./action-helpers";
import type { AttendanceStatus } from "@/db/schema";

export type { FormState } from "./action-helpers";

// ---------- auth ----------

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const loginId = String(fd.get("login") ?? "");
  const result = await login(loginId, String(fd.get("password") ?? ""));
  if (result === "google") return fail("This owner login uses Google. Tap Continue with Google above.");
  if (result === "wrong") return fail((await loginLocked(loginId)) ? "Too many wrong tries. Please wait 15 minutes." : "Wrong login or password.");
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// ---------- counter ----------

const saleSchema = z.object({
  unit: z.enum(schema.unitEnum.enumValues),
  mode: z.enum(schema.saleModeEnum.enumValues),
});

function payModeOf(fd: FormData, key: string, msg: string) {
  const m = z.enum(PAID_MODES).safeParse(fd.get(key));
  if (!m.success) throw new UserError(msg);
  return m.data;
}

// Field parsing shared by "add" and "edit" so both apply the same rules.
async function parseSale(user: HotelUser, fd: FormData) {
  const p = saleSchema.safeParse({ unit: fd.get("unit"), mode: fd.get("mode") });
  if (!p.success) throw new UserError("Pick section and payment mode.");
  const h = user.hotel;
  if (!(p.data.unit === "restaurant" ? h.hasRestaurant : p.data.unit === "rooms" ? h.hasRooms : h.hasBanquet)) {
    throw new UserError("This section is not enabled for your hotel.");
  }
  let partyId: number | null = null;
  if (p.data.mode === "zomato" || p.data.mode === "swiggy") {
    const name = p.data.mode === "zomato" ? "Zomato" : "Swiggy";
    const db = await getDb();
    const [party] = await db
      .select()
      .from(schema.parties)
      .where(and(eq(schema.parties.hotelId, user.hotelId), eq(schema.parties.name, name)));
    if (!party) throw new UserError(`${name} party is missing. Ask admin to add it under Dues.`);
    partyId = party.id;
  } else if (p.data.mode === "credit") {
    partyId = Number(fd.get("partyId"));
    await owned(schema.parties, partyId, user.hotelId, "credit customer");
  }
  return { ...p.data, amount: amount(fd), partyId, reference: str(fd, "reference") };
}

// Optional money field (blank = 0), never negative.
function optionalAmount(fd: FormData, key: string, msg: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return 0;
  const v = toPaise(raw);
  if (v == null || v < 0) throw new UserError(msg);
  return v;
}

async function parseExpense(user: HotelUser, fd: FormData) {
  const cat = await owned(schema.expenseCategories, Number(fd.get("categoryId")), user.hotelId, "category");
  // "credit" = goods taken from a supplier now, paid later: needs the supplier.
  const paidVia = fd.get("paidVia") === "credit" ? ("credit" as const) : payModeOf(fd, "paidVia", "Choose how it was paid.");
  let employeeId: number | null = null;
  if (cat.isWages) {
    employeeId = Number(fd.get("employeeId"));
    await owned(schema.employees, employeeId, user.hotelId, "worker");
  }
  const supplierId = Number(fd.get("supplierId")) || null;
  if (supplierId) await owned(schema.suppliers, supplierId, user.hotelId, "supplier");
  if (paidVia === "credit" && !supplierId) throw new UserError("Choose the supplier this is owed to.");
  return { categoryId: cat.id as number, amount: amount(fd), paidVia, vendor: str(fd, "vendor"), note: str(fd, "note"), employeeId, supplierId };
}

async function parseAdvance(user: HotelUser, fd: FormData) {
  const employeeId = Number(fd.get("employeeId"));
  await owned(schema.employees, employeeId, user.hotelId, "employee");
  const total = amount(fd);
  // A loan is recovered in monthly installments instead of all from this month's salary.
  let installment: number | null = null;
  if (fd.get("recover") === "monthly") {
    installment = optionalAmount(fd, "installment", "Enter a valid monthly installment.");
    if (!installment) throw new UserError("Enter how much to recover each month.");
    if (installment > total) throw new UserError("Monthly installment cannot be more than the loan.");
  }
  return { employeeId, amount: total, paidVia: payModeOf(fd, "paidVia", "Choose how it was paid."), installment, note: str(fd, "note") };
}

async function parseReceipt(user: HotelUser, fd: FormData) {
  const partyId = Number(fd.get("partyId"));
  await owned(schema.parties, partyId, user.hotelId, "party who paid");
  const commission = optionalAmount(fd, "commission", "Enter a valid commission amount.");
  return { partyId, mode: payModeOf(fd, "mode", "Choose how it was received."), amount: amount(fd), commission, note: str(fd, "note") };
}

export async function addSale(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const values = await parseSale(user, fd);
    const [row] = await onOpenDay(user, date, (tx) =>
      tx.insert(schema.sales).values({ hotelId: user.hotelId, date, ...values, createdBy: user.id }).returning(),
    );
    await audit(user, "create", "sale", row.id, row);
    revalidatePath("/", "layout");
    return ok("Sale added.");
  });
}

export async function addExpense(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const values = await parseExpense(user, fd);
    const [row] = await onOpenDay(user, date, (tx) =>
      tx.insert(schema.expenses).values({ hotelId: user.hotelId, date, ...values, createdBy: user.id }).returning(),
    );
    await audit(user, "create", "expense", row.id, row);
    revalidatePath("/", "layout");
    return ok("Expense added.");
  });
}

export async function addAdvance(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const values = await parseAdvance(user, fd);
    const [row] = await onOpenDay(user, date, (tx) =>
      tx.insert(schema.advances).values({ hotelId: user.hotelId, date, ...values, createdBy: user.id }).returning(),
    );
    await audit(user, "create", "advance", row.id, row);
    revalidatePath("/", "layout");
    return ok("Advance recorded. It will be deducted from salary.");
  });
}

export async function addReceipt(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const values = await parseReceipt(user, fd);
    const [row] = await onOpenDay(user, date, (tx) =>
      tx.insert(schema.receipts).values({ hotelId: user.hotelId, date, ...values, createdBy: user.id }).returning(),
    );
    await audit(user, "create", "receipt", row.id, row);
    revalidatePath("/", "layout");
    return ok("Payment received recorded.");
  });
}

const ENTRY_TABLES = {
  sale: schema.sales,
  expense: schema.expenses,
  advance: schema.advances,
  receipt: schema.receipts,
  salary: schema.salaryPayments,
  supplier: schema.supplierPayments,
  drawing: schema.partnerDrawings,
  transfer: schema.cashTransfers,
} as const;

// Salary and partner withdrawals are the owner's to record, change or remove.
const OWNER_ONLY = new Set<keyof typeof ENTRY_TABLES>(["salary", "drawing"]);

function parseTransfer(fd: FormData) {
  const direction = z.enum(["to_bank", "to_cash"]).safeParse(fd.get("direction"));
  if (!direction.success) throw new UserError("Choose cash to bank or bank to cash.");
  return { direction: direction.data, amount: amount(fd), note: str(fd, "note") };
}

const parsePaid = (fd: FormData) => ({ amount: amount(fd), paidVia: payModeOf(fd, "paidVia", "Choose how it was paid."), note: str(fd, "note") });

// Fix a typo: the person who entered it (or admin) can delete while the day is open.
export async function deleteEntry(kind: keyof typeof ENTRY_TABLES, id: number): Promise<FormState> {
  return run(async () => {
    if (!Object.hasOwn(ENTRY_TABLES, kind) || !Number.isInteger(id)) throw new UserError("Unknown entry.");
    const user = await requireAction(OWNER_ONLY.has(kind) ? "manageMaster" : "enterCounter");
    const table = ENTRY_TABLES[kind];
    const db = await getDb();
    const where = and(eq(table.id, id), eq(table.hotelId, user.hotelId));
    const [row] = await db.select().from(table).where(where);
    if (!row) throw new UserError("Entry not found.");
    if (user.role !== "admin" && row.createdBy !== user.id) throw new UserError("You can delete only your own entries.");
    // Booking bills and refunds are posted by the booking itself; removing one here would leave
    // the booking saying "completed" or "cancelled" with the money gone. Advances on an open
    // booking can still be removed to fix a typo.
    if ("bookingId" in row && row.bookingId) {
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, row.bookingId));
      if (kind === "sale" || !b || b.status === "completed" || b.status === "cancelled") {
        throw new UserError("This entry belongs to a closed booking and cannot be deleted here.");
      }
    }
    await onOpenDay(user, await checkEntryDate(user, row.date), (tx) => tx.delete(table).where(where));
    await audit(user, "delete", kind, id, row);
    revalidatePath("/", "layout");
    return ok("Entry deleted.");
  });
}

// Correct an entry in place (same rules as delete). The date never changes; the audit log
// keeps the values before and after.
export async function updateEntry(kind: keyof typeof ENTRY_TABLES, id: number, _: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    if (!Object.hasOwn(ENTRY_TABLES, kind) || !Number.isInteger(id)) throw new UserError("Unknown entry.");
    const user = await requireAction(OWNER_ONLY.has(kind) ? "manageMaster" : "enterCounter");
    const table = ENTRY_TABLES[kind];
    const db = await getDb();
    const where = and(eq(table.id, id), eq(table.hotelId, user.hotelId));
    const [before] = await db.select().from(table).where(where);
    if (!before) throw new UserError("Entry not found.");
    if (user.role !== "admin" && before.createdBy !== user.id) throw new UserError("You can change only your own entries.");
    if ("bookingId" in before && before.bookingId) throw new UserError("This entry belongs to a booking. Change it from the booking.");
    const date = await checkEntryDate(user, before.date);
    const values =
      kind === "sale"
        ? await parseSale(user, fd)
        : kind === "expense"
          ? await parseExpense(user, fd)
          : kind === "advance"
            ? await parseAdvance(user, fd)
            : kind === "receipt"
              ? await parseReceipt(user, fd)
              : kind === "transfer"
                ? parseTransfer(fd)
                : parsePaid(fd);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [after] = await onOpenDay(user, date, (tx) => tx.update(table).set(values as any).where(where).returning());
    await audit(user, "update", kind, id, { before, after });
    revalidatePath("/", "layout");
    return ok("Entry updated.");
  });
}

export async function closeDay(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("closeDay");
    const date = await checkEntryDate(user, fd.get("date"));
    const counted = toPaise(fd.get("countedCash"));
    if (counted == null) throw new UserError("Enter the cash counted in the drawer.");
    const deposit = toPaise(fd.get("cashDeposit") || "0") ?? 0;
    const db = await getDb();
    const thisDay = and(eq(schema.dayBooks.hotelId, user.hotelId), eq(schema.dayBooks.date, date));
    const next = await db.transaction(async (tx) => {
      // Waits for entries still being saved; a second manager closing at once stops here.
      const [day] = await tx.select({ status: schema.dayBooks.status }).from(schema.dayBooks).where(thisDay).for("update");
      if (day?.status !== "open") throw new UserError("This day is already closed.");
      await tx
        .update(schema.dayBooks)
        .set({ countedCash: counted, cashDeposit: deposit, status: "closed", closedBy: user.id, closedAt: new Date(), note: str(fd, "note") })
        .where(thisDay);
      // The next day's opening cash was copied when that day was first opened; if this day
      // is closed after that (late close, or reopened and re-closed) carry the new count forward.
      const [following] = await tx
        .select()
        .from(schema.dayBooks)
        .where(and(eq(schema.dayBooks.hotelId, user.hotelId), gt(schema.dayBooks.date, date)))
        .orderBy(asc(schema.dayBooks.date))
        .limit(1);
      if (following && following.openingCash !== counted) {
        await tx
          .update(schema.dayBooks)
          .set({ openingCash: counted })
          .where(and(eq(schema.dayBooks.hotelId, user.hotelId), eq(schema.dayBooks.date, following.date)));
      }
      return following;
    });
    await audit(user, "close_day", "day", date, { counted, deposit, nextDay: next?.date, nextOpeningWas: next?.openingCash });
    revalidatePath("/", "layout");
    return ok(next && next.openingCash !== counted ? `Day closed. Opening cash of ${next.date} updated to match.` : "Day closed.");
  });
}

export async function reopenDay(date: string): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("reopenDay");
    if (!isISODate(date)) throw new UserError("Invalid date.");
    const db = await getDb();
    await db
      .update(schema.dayBooks)
      .set({ status: "open", closedAt: null, closedBy: null })
      .where(and(eq(schema.dayBooks.hotelId, user.hotelId), eq(schema.dayBooks.date, date)));
    await audit(user, "reopen_day", "day", date);
    revalidatePath("/", "layout");
    return ok("Day reopened.");
  });
}

// First day only: admin sets the cash already in the drawer when they start using the app.
export async function setOpeningCash(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("manageMaster");
    const date = await checkEntryDate(user, fd.get("date"));
    const cash = toPaise(fd.get("openingCash"));
    if (cash == null) throw new UserError("Enter the opening cash.");
    const db = await getDb();
    // After any day is closed, opening cash comes from the previous day's count.
    const [closedBefore] = await db
      .select({ date: schema.dayBooks.date })
      .from(schema.dayBooks)
      .where(and(eq(schema.dayBooks.hotelId, user.hotelId), eq(schema.dayBooks.status, "closed"), lt(schema.dayBooks.date, date)))
      .limit(1);
    if (closedBefore) throw new UserError("Opening cash is set only for the first day. Later days take it from the previous day's count.");
    await db
      .update(schema.dayBooks)
      .set({ openingCash: cash })
      .where(and(eq(schema.dayBooks.hotelId, user.hotelId), eq(schema.dayBooks.date, date)));
    await audit(user, "set_opening_cash", "day", date, { cash });
    revalidatePath("/", "layout");
    return ok("Opening cash saved.");
  });
}

// ---------- attendance ----------

export async function saveAttendance(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("markAttendance");
    const date = fd.get("date");
    if (!isISODate(date) || date > todayIST()) throw new UserError("Invalid date.");
    if (user.role !== "admin" && date < addDays(todayIST(), -1)) {
      throw new UserError("Managers can mark only today and yesterday.");
    }
    const ids = [...new Set(fd.getAll("employeeId").map(Number).filter(Boolean))];
    const db = await getDb();
    // Only this hotel's employees; managers only the workers assigned to them.
    const allowed = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.hotelId, user.hotelId),
          inArray(schema.employees.id, ids.length ? ids : [0]),
          user.role === "admin" ? undefined : eq(schema.employees.managerUserId, user.id),
        ),
      );
    const allowedSet = new Set(allowed.map((a) => a.id));
    const rows = ids.flatMap((id) => {
      const status = fd.get(`s_${id}`) as AttendanceStatus | null;
      if (!allowedSet.has(id) || !status || !schema.attendanceEnum.enumValues.includes(status)) return [];
      const otHours = Math.max(0, Math.min(16, Number(fd.get(`ot_${id}`)) || 0));
      return [{ hotelId: user.hotelId, employeeId: id, date, status, otHours, markedBy: user.id }];
    });
    // One statement, so a big staff list does not cost one round trip per person.
    if (rows.length) {
      await db
        .insert(schema.attendance)
        .values(rows)
        .onConflictDoUpdate({
          target: [schema.attendance.employeeId, schema.attendance.date],
          set: { status: sql`excluded.status`, otHours: sql`excluded.ot_hours`, markedBy: user.id, markedAt: new Date() },
        });
    }
    const n = rows.length;
    await audit(user, "mark_attendance", "attendance", date, { count: n });
    revalidatePath("/", "layout");
    return ok(`Attendance saved for ${n} ${n === 1 ? "person" : "people"}.`);
  });
}

// ---------- master data (hotel admin) ----------

// Run inside the transaction that adds the employee or login, so two adds at once cannot both
// take the last slot on the plan.
async function needSlot(tx: Tx, user: HotelUser, kind: "employees" | "logins") {
  await lockHotel(tx, user.hotelId);
  const [plan] = await tx.select().from(schema.plans).where(eq(schema.plans.id, user.hotel.planId));
  const limit = kind === "employees" ? plan?.maxEmployees : plan?.maxUsers;
  if (limit == null) return;
  const table = kind === "employees" ? schema.employees : schema.users;
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.hotelId, user.hotelId), eq(table.active, true)));
  if (r.n >= limit) throw new UserError(`Your ${plan.name} plan allows ${limit} ${kind}. Upgrade from Billing to add more.`);
}

const employeeSchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  name: z.string().trim().min(2, "Name is required"),
  phone: z.string().trim().optional(),
  department: z.string().trim().min(1, "Department is required"),
  designation: z.string().trim().optional(),
  payType: z.enum(["monthly", "daily"]),
  joinDate: z.string().refine(isISODate, "Join date is required"),
});

export async function saveEmployee(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("manageMaster");
    const p = employeeSchema.safeParse(Object.fromEntries(fd));
    if (!p.success) throw new UserError(p.error.issues[0].message);
    const rate = amount(fd, "rate");
    const managerUserId = Number(fd.get("managerUserId")) || null;
    if (managerUserId) await owned(schema.users, managerUserId, user.hotelId, "manager");
    const active = fd.get("active") !== "off";
    const db = await getDb();
    const id = Number(fd.get("id")) || null;
    const existing = id ? await owned(schema.employees, id, user.hotelId, "employee") : null;
    // New employee, or an inactive one being made active again, takes a plan slot.
    const takesSlot = active && (!existing || !existing.active);
    // A changed salary applies from the chosen date; earlier months keep the old rate.
    const rateFrom = fd.get("rateFrom");
    const rateChanged = !!existing && existing.rate !== rate;
    if (rateChanged && !isISODate(rateFrom)) throw new UserError("Choose the date the new salary applies from.");
    const today = todayIST();
    // employees.rate is the rate in force today; a raise dated in the future waits.
    const currentRate = rateChanged && (rateFrom as string) > today ? (existing!.rate as number) : rate;
    const values = { ...p.data, phone: p.data.phone || null, designation: p.data.designation || null, rate: currentRate, managerUserId, active };
    try {
      if (id) {
        await db.transaction(async (tx) => {
          if (takesSlot) await needSlot(tx, user, "employees");
          await tx.update(schema.employees).set(values).where(and(eq(schema.employees.id, id), eq(schema.employees.hotelId, user.hotelId)));
          if (rateChanged) {
            // Employees saved before salary history existed have no rows yet: record the
            // old rate from the join date first so earlier months keep it.
            await tx
              .insert(schema.employeeRates)
              .values({ hotelId: user.hotelId, employeeId: id, fromDate: existing!.joinDate as string, rate: existing!.rate as number })
              .onConflictDoNothing();
            await tx
              .insert(schema.employeeRates)
              .values({ hotelId: user.hotelId, employeeId: id, fromDate: rateFrom as string, rate })
              .onConflictDoUpdate({ target: [schema.employeeRates.employeeId, schema.employeeRates.fromDate], set: { rate } });
          }
        });
        await audit(user, "update", "employee", id, { before: existing, after: { ...values, rate, rateFrom: rateChanged ? rateFrom : undefined } });
      } else {
        const row = await db.transaction(async (tx) => {
          if (takesSlot) await needSlot(tx, user, "employees");
          const [r] = await tx.insert(schema.employees).values({ ...values, hotelId: user.hotelId }).returning();
          await tx.insert(schema.employeeRates).values({ hotelId: user.hotelId, employeeId: r.id, fromDate: p.data.joinDate, rate });
          return r;
        });
        await audit(user, "create", "employee", row.id, values);
      }
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserError("That employee code is already used.");
      throw e;
    }
    revalidatePath("/", "layout");
    return ok(id ? "Employee updated." : "Employee added.");
  });
}

const HOTEL_ROLES = ["admin", "manager", "cashier", "partner", "viewer", "employee"] as const;

export async function saveUser(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const name = str(fd, "name");
    const loginId = str(fd, "login");
    const role = z.enum(HOTEL_ROLES).safeParse(fd.get("role"));
    const password = String(fd.get("password") ?? "");
    if (!name || !loginId || !role.success) throw new UserError("Name, login and role are required.");
    if (password.length < 8) throw new UserError("Password must be at least 8 characters.");
    const employeeId = Number(fd.get("employeeId")) || null;
    if (role.data === "employee" && !employeeId) throw new UserError("Employee logins must be linked to an employee.");
    if (employeeId) await owned(schema.employees, employeeId, admin.hotelId, "employee");
    const db = await getDb();
    const passwordHash = await hashPassword(password);
    try {
      const row = await db.transaction(async (tx) => {
        await needSlot(tx, admin, "logins");
        const [r] = await tx
          .insert(schema.users)
          .values({ hotelId: admin.hotelId, name, login: loginId, role: role.data, employeeId, passwordHash })
          .returning({ id: schema.users.id });
        return r;
      });
      await audit(admin, "create", "user", row.id, { name, login: loginId, role: role.data });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserError("That login is already taken. Try a phone number.");
      throw e;
    }
    revalidatePath("/settings");
    return ok("Login created.");
  });
}

export async function setUserActive(userId: number, active: boolean): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    if (userId === admin.id) throw new UserError("You cannot disable your own login.");
    const target = await owned(schema.users, userId, admin.hotelId, "login");
    const db = await getDb();
    await db.transaction(async (tx) => {
      if (active && !target.active) await needSlot(tx, admin, "logins");
      await tx.update(schema.users).set({ active }).where(and(eq(schema.users.id, userId), eq(schema.users.hotelId, admin.hotelId)));
    });
    if (!active) await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await audit(admin, active ? "enable" : "disable", "user", userId);
    revalidatePath("/settings");
    return ok(active ? "Login enabled." : "Login disabled.");
  });
}

export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const userId = Number(fd.get("userId"));
    await owned(schema.users, userId, admin.hotelId, "login");
    const password = String(fd.get("password") ?? "");
    if (password.length < 8) throw new UserError("Password must be at least 8 characters.");
    const db = await getDb();
    await db
      .update(schema.users)
      .set({ passwordHash: await hashPassword(password) })
      .where(and(eq(schema.users.id, userId), eq(schema.users.hotelId, admin.hotelId)));
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await audit(admin, "reset_password", "user", userId);
    return ok("Password changed. That user must log in again.");
  });
}

export async function saveCategory(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const name = str(fd, "name");
    if (!name) throw new UserError("Category name is required.");
    const parentId = Number(fd.get("parentId")) || null;
    if (parentId) await owned(schema.expenseCategories, parentId, admin.hotelId, "parent category");
    const db = await getDb();
    const [row] = await db.insert(schema.expenseCategories).values({ hotelId: admin.hotelId, name, parentId }).returning();
    await audit(admin, "create", "category", row.id, row);
    revalidatePath("/", "layout");
    return ok("Category added.");
  });
}

export async function saveParty(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const name = str(fd, "name");
    const kind = z.enum(schema.partyKindEnum.enumValues).safeParse(fd.get("kind"));
    if (!name || !kind.success) throw new UserError("Name and type are required.");
    const db = await getDb();
    const [row] = await db.insert(schema.parties).values({ hotelId: admin.hotelId, name, kind: kind.data, phone: str(fd, "phone") }).returning();
    await audit(admin, "create", "party", row.id, row);
    revalidatePath("/", "layout");
    return ok("Party added.");
  });
}

export async function saveHotelProfile(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const name = str(fd, "name");
    if (!name) throw new UserError("Hotel name is required.");
    const values = {
      name,
      city: str(fd, "city"),
      phone: str(fd, "phone"),
      gstin: str(fd, "gstin"),
      hasRestaurant: fd.get("hasRestaurant") === "on",
      hasRooms: fd.get("hasRooms") === "on",
      hasBanquet: fd.get("hasBanquet") === "on",
    };
    if (!values.hasRestaurant && !values.hasRooms && !values.hasBanquet) throw new UserError("Pick at least one section.");
    const db = await getDb();
    await db.update(schema.hotels).set(values).where(eq(schema.hotels.id, admin.hotelId));
    await audit(admin, "update", "hotel", admin.hotelId, values);
    revalidatePath("/", "layout");
    return ok("Hotel details saved.");
  });
}

// ---------- partners (profit share) ----------

function shareBp(fd: FormData) {
  const raw = String(fd.get("share") ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new UserError("Share must be a percentage, e.g. 12.5");
  const bp = Math.round(Number(raw) * 100);
  if (bp <= 0 || bp > 10000) throw new UserError("Share must be between 0.01% and 100%.");
  return bp;
}

async function activeShareTotal(tx: Tx, hotelId: number, exceptId?: number) {
  const rows = await tx
    .select({ id: schema.partners.id, bp: schema.partners.shareBp })
    .from(schema.partners)
    .where(and(eq(schema.partners.hotelId, hotelId), eq(schema.partners.active, true)));
  return rows.filter((r) => r.id !== exceptId).reduce((a, r) => a + r.bp, 0);
}

export async function savePartner(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const name = str(fd, "name");
    if (!name) throw new UserError("Partner name is required.");
    const bp = shareBp(fd);
    const id = Number(fd.get("id")) || null;
    if (id) await owned(schema.partners, id, admin.hotelId, "partner");
    const userId = Number(fd.get("userId")) || null;
    if (userId) await owned(schema.users, userId, admin.hotelId, "login");
    const values = { name, phone: str(fd, "phone"), shareBp: bp, userId };
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      await lockHotel(tx, admin.hotelId);
      const others = await activeShareTotal(tx, admin.hotelId, id ?? undefined);
      if (others + bp > 10000) {
        throw new UserError(`Shares would add up to ${(others + bp) / 100}%. Total cannot be more than 100%.`);
      }
      if (id) {
        await tx.update(schema.partners).set(values).where(and(eq(schema.partners.id, id), eq(schema.partners.hotelId, admin.hotelId)));
        return id;
      }
      const [row] = await tx.insert(schema.partners).values({ ...values, hotelId: admin.hotelId }).returning();
      return row.id;
    });
    await audit(admin, id ? "update" : "create", "partner", saved, values);
    revalidatePath("/", "layout");
    return ok(id ? "Partner updated." : "Partner added.");
  });
}

export async function removePartner(partnerId: number): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    await owned(schema.partners, partnerId, admin.hotelId, "partner");
    const db = await getDb();
    await db.update(schema.partners).set({ active: false }).where(and(eq(schema.partners.id, partnerId), eq(schema.partners.hotelId, admin.hotelId)));
    await audit(admin, "remove", "partner", partnerId);
    revalidatePath("/", "layout");
    return ok("Partner removed.");
  });
}

// ---------- suppliers, partner withdrawals, cash <-> bank ----------

export async function saveSupplier(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const name = str(fd, "name");
    if (!name) throw new UserError("Supplier name is required.");
    const id = Number(fd.get("id")) || null;
    if (id) await owned(schema.suppliers, id, admin.hotelId, "supplier");
    const values = { name, phone: str(fd, "phone"), note: str(fd, "note"), active: fd.get("active") !== "off" };
    const db = await getDb();
    if (id) {
      await db.update(schema.suppliers).set(values).where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.hotelId, admin.hotelId)));
      await audit(admin, "update", "supplier", id, values);
    } else {
      const [row] = await db.insert(schema.suppliers).values({ ...values, hotelId: admin.hotelId }).returning();
      await audit(admin, "create", "supplier", row.id, values);
    }
    revalidatePath("/", "layout");
    return ok(id ? "Supplier updated." : "Supplier added.");
  });
}

// Pay a supplier what is owed for goods taken on credit; money leaves today's counter.
export async function paySupplier(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const supplierId = Number(fd.get("supplierId"));
    await owned(schema.suppliers, supplierId, user.hotelId, "supplier");
    const date = await checkEntryDate(user, todayIST());
    const [row] = await onOpenDay(user, date, (tx) =>
      tx.insert(schema.supplierPayments).values({ hotelId: user.hotelId, supplierId, date, ...parsePaid(fd), createdBy: user.id }).returning(),
    );
    await audit(user, "create", "supplier", row.id, row);
    revalidatePath("/", "layout");
    return ok("Payment to supplier recorded.");
  });
}

export async function addDrawing(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const partnerId = Number(fd.get("partnerId"));
    await owned(schema.partners, partnerId, admin.hotelId, "partner");
    const date = await checkEntryDate(admin, todayIST());
    const [row] = await onOpenDay(admin, date, (tx) =>
      tx.insert(schema.partnerDrawings).values({ hotelId: admin.hotelId, partnerId, date, ...parsePaid(fd), createdBy: admin.id }).returning(),
    );
    await audit(admin, "create", "drawing", row.id, row);
    revalidatePath("/", "layout");
    return ok("Withdrawal recorded.");
  });
}

export async function addTransfer(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const [row] = await onOpenDay(user, date, (tx) =>
      tx.insert(schema.cashTransfers).values({ hotelId: user.hotelId, date, ...parseTransfer(fd), createdBy: user.id }).returning(),
    );
    await audit(user, "create", "transfer", row.id, row);
    revalidatePath("/", "layout");
    return ok(row.direction === "to_bank" ? "Cash moved to bank." : "Cash drawn from bank.");
  });
}

// ---------- logins ----------

// Any logged-in person changes their own password; other devices are signed out.
export async function changeMyPassword(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getUser();
    if (!me) throw new UserError("Please log in again.");
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("password") ?? "");
    if (next.length < 8) throw new UserError("New password must be at least 8 characters.");
    if (next !== String(fd.get("confirm") ?? "")) throw new UserError("The two new passwords do not match.");
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, me.id));
    if (!u || !(await verifyPassword(current, u.passwordHash))) throw new UserError("Current password is wrong.");
    await db.update(schema.users).set({ passwordHash: await hashPassword(next) }).where(eq(schema.users.id, me.id));
    await keepOnlyThisSession(me.id);
    if (me.hotelId) {
      await db.insert(schema.auditLog).values({ hotelId: me.hotelId, userId: me.id, action: "change_password", entity: "user", entityId: String(me.id) });
    }
    return ok("Password changed. Other devices have been logged out.");
  });
}

// Owner changes an existing login's role or the employee it is linked to.
export async function updateUserAccess(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAction("manageMaster");
    const userId = Number(fd.get("userId"));
    await owned(schema.users, userId, admin.hotelId, "login");
    const role = z.enum(HOTEL_ROLES).safeParse(fd.get("role"));
    if (!role.success) throw new UserError("Choose a role.");
    if (userId === admin.id && role.data !== "admin") throw new UserError("You cannot remove your own owner access.");
    const employeeId = Number(fd.get("employeeId")) || null;
    if (employeeId) await owned(schema.employees, employeeId, admin.hotelId, "employee");
    if (role.data === "employee" && !employeeId) throw new UserError("Employee logins must be linked to an employee.");
    const db = await getDb();
    await db
      .update(schema.users)
      .set({ role: role.data, employeeId })
      .where(and(eq(schema.users.id, userId), eq(schema.users.hotelId, admin.hotelId)));
    await audit(admin, "update", "user", userId, { role: role.data, employeeId });
    revalidatePath("/", "layout");
    return ok("Login updated.");
  });
}
