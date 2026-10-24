"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { hashPassword, login, logout, requireAction, type HotelUser } from "./auth";
import { addDays, isISODate, toPaise, todayIST } from "./format";
import { UserError, amount, audit, checkEntryDate, fail, ok, owned, run, str, type FormState } from "./action-helpers";
import type { AttendanceStatus } from "@/db/schema";

export type { FormState } from "./action-helpers";

// ---------- auth ----------

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const ok = await login(String(fd.get("login") ?? ""), String(fd.get("password") ?? ""));
  if (!ok) return fail("Wrong login or password.");
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

export async function addSale(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const p = saleSchema.safeParse({ unit: fd.get("unit"), mode: fd.get("mode") });
    if (!p.success) throw new UserError("Pick section and payment mode.");
    const db = await getDb();
    let partyId: number | null = null;
    if (p.data.mode === "zomato" || p.data.mode === "swiggy") {
      const name = p.data.mode === "zomato" ? "Zomato" : "Swiggy";
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
    const [row] = await db
      .insert(schema.sales)
      .values({ hotelId: user.hotelId, date, ...p.data, amount: amount(fd), partyId, reference: str(fd, "reference"), createdBy: user.id })
      .returning();
    await audit(user, "create", "sale", row.id, row);
    revalidatePath("/", "layout");
    return ok("Sale added.");
  });
}

export async function addExpense(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const cat = await owned(schema.expenseCategories, Number(fd.get("categoryId")), user.hotelId, "category");
    const paidVia = z.enum(schema.payModeEnum.enumValues).safeParse(fd.get("paidVia"));
    if (!paidVia.success) throw new UserError("Choose how it was paid.");
    let employeeId: number | null = null;
    if (cat.isWages) {
      employeeId = Number(fd.get("employeeId"));
      await owned(schema.employees, employeeId, user.hotelId, "worker");
    }
    const db = await getDb();
    const [row] = await db
      .insert(schema.expenses)
      .values({
        hotelId: user.hotelId,
        date,
        categoryId: cat.id as number,
        amount: amount(fd),
        paidVia: paidVia.data,
        vendor: str(fd, "vendor"),
        note: str(fd, "note"),
        employeeId,
        createdBy: user.id,
      })
      .returning();
    await audit(user, "create", "expense", row.id, row);
    revalidatePath("/", "layout");
    return ok("Expense added.");
  });
}

export async function addAdvance(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const employeeId = Number(fd.get("employeeId"));
    await owned(schema.employees, employeeId, user.hotelId, "employee");
    const paidVia = z.enum(schema.payModeEnum.enumValues).safeParse(fd.get("paidVia"));
    if (!paidVia.success) throw new UserError("Choose how it was paid.");
    const db = await getDb();
    const [row] = await db
      .insert(schema.advances)
      .values({ hotelId: user.hotelId, date, employeeId, amount: amount(fd), paidVia: paidVia.data, note: str(fd, "note"), createdBy: user.id })
      .returning();
    await audit(user, "create", "advance", row.id, row);
    revalidatePath("/", "layout");
    return ok("Advance recorded. It will be deducted from salary.");
  });
}

export async function addReceipt(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const date = await checkEntryDate(user, fd.get("date"));
    const partyId = Number(fd.get("partyId"));
    await owned(schema.parties, partyId, user.hotelId, "party who paid");
    const mode = z.enum(schema.payModeEnum.enumValues).safeParse(fd.get("mode"));
    if (!mode.success) throw new UserError("Choose how it was received.");
    const db = await getDb();
    const [row] = await db
      .insert(schema.receipts)
      .values({ hotelId: user.hotelId, date, partyId, mode: mode.data, amount: amount(fd), note: str(fd, "note"), createdBy: user.id })
      .returning();
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
} as const;

// Fix a typo: the person who entered it (or admin) can delete while the day is open.
export async function deleteEntry(kind: keyof typeof ENTRY_TABLES, id: number): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("enterCounter");
    const table = ENTRY_TABLES[kind];
    if (!table) throw new UserError("Unknown entry.");
    const db = await getDb();
    const where = and(eq(table.id, id), eq(table.hotelId, user.hotelId));
    const [row] = await db.select().from(table).where(where);
    if (!row) throw new UserError("Entry not found.");
    if (user.role !== "admin" && row.createdBy !== user.id) throw new UserError("You can delete only your own entries.");
    await checkEntryDate(user, row.date);
    await db.delete(table).where(where);
    await audit(user, "delete", kind, id, row);
    revalidatePath("/", "layout");
    return ok("Entry deleted.");
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
    await db
      .update(schema.dayBooks)
      .set({ countedCash: counted, cashDeposit: deposit, status: "closed", closedBy: user.id, closedAt: new Date(), note: str(fd, "note") })
      .where(and(eq(schema.dayBooks.hotelId, user.hotelId), eq(schema.dayBooks.date, date)));
    await audit(user, "close_day", "day", date, { counted, deposit });
    revalidatePath("/", "layout");
    return ok("Day closed.");
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
    const ids = fd.getAll("employeeId").map(Number).filter(Boolean);
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
    let n = 0;
    for (const id of ids) {
      if (!allowedSet.has(id)) continue;
      const status = fd.get(`s_${id}`) as AttendanceStatus | null;
      if (!status || !schema.attendanceEnum.enumValues.includes(status)) continue;
      const otHours = Math.max(0, Math.min(16, Number(fd.get(`ot_${id}`)) || 0));
      await db
        .insert(schema.attendance)
        .values({ hotelId: user.hotelId, employeeId: id, date, status, otHours, markedBy: user.id })
        .onConflictDoUpdate({
          target: [schema.attendance.employeeId, schema.attendance.date],
          set: { status, otHours, markedBy: user.id, markedAt: new Date() },
        });
      n++;
    }
    await audit(user, "mark_attendance", "attendance", date, { count: n });
    revalidatePath("/", "layout");
    return ok(`Attendance saved for ${n} ${n === 1 ? "person" : "people"}.`);
  });
}

// ---------- master data (hotel admin) ----------

async function planLimits(user: HotelUser) {
  const db = await getDb();
  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, user.hotel.planId));
  return plan;
}

async function countWhere(table: typeof schema.employees | typeof schema.users, hotelId: number) {
  const db = await getDb();
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(and(eq(table.hotelId, hotelId), eq(table.active, true)));
  return r.n;
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
    if (id) await owned(schema.employees, id, user.hotelId, "employee");
    if (!id) {
      const plan = await planLimits(user);
      if (plan?.maxEmployees != null && (await countWhere(schema.employees, user.hotelId)) >= plan.maxEmployees) {
        throw new UserError(`Your ${plan.name} plan allows ${plan.maxEmployees} employees. Upgrade from Billing to add more.`);
      }
    }
    const values = { ...p.data, phone: p.data.phone || null, designation: p.data.designation || null, rate, managerUserId, active };
    try {
      if (id) {
        await db.update(schema.employees).set(values).where(and(eq(schema.employees.id, id), eq(schema.employees.hotelId, user.hotelId)));
        await audit(user, "update", "employee", id, values);
      } else {
        const [row] = await db.insert(schema.employees).values({ ...values, hotelId: user.hotelId }).returning();
        await audit(user, "create", "employee", row.id, values);
      }
    } catch (e) {
      if (String(e).includes("unique") || String(e).includes("duplicate")) throw new UserError("That employee code is already used.");
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
    const plan = await planLimits(admin);
    if (plan?.maxUsers != null && (await countWhere(schema.users, admin.hotelId)) >= plan.maxUsers) {
      throw new UserError(`Your ${plan.name} plan allows ${plan.maxUsers} logins. Upgrade from Billing to add more.`);
    }
    const db = await getDb();
    try {
      const [row] = await db
        .insert(schema.users)
        .values({ hotelId: admin.hotelId, name, login: loginId, role: role.data, employeeId, passwordHash: await hashPassword(password) })
        .returning({ id: schema.users.id });
      await audit(admin, "create", "user", row.id, { name, login: loginId, role: role.data });
    } catch (e) {
      if (String(e).includes("unique") || String(e).includes("duplicate")) throw new UserError("That login is already taken. Try a phone number.");
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
    await owned(schema.users, userId, admin.hotelId, "login");
    const db = await getDb();
    await db.update(schema.users).set({ active }).where(and(eq(schema.users.id, userId), eq(schema.users.hotelId, admin.hotelId)));
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
