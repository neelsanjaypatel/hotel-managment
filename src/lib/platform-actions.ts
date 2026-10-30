"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { createHotelWithDefaults } from "@/db/defaults";
import { getUser, hashPassword, requirePlatformAction, startSession } from "./auth";
import { addDays, toPaise, todayIST } from "./format";
import { extendPeriod } from "./subscription";
import { UserError, isUniqueViolation, ok, run, type FormState } from "./action-helpers";

const hotelSchema = z.object({
  hotelName: z.string().trim().min(2, "Hotel name is required"),
  city: z.string().trim().min(2, "City is required"),
  ownerName: z.string().trim().min(2, "Your name is required"),
  login: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function units(fd: FormData) {
  const u = { hasRestaurant: fd.get("hasRestaurant") === "on", hasRooms: fd.get("hasRooms") === "on", hasBanquet: fd.get("hasBanquet") === "on" };
  if (!u.hasRestaurant && !u.hasRooms && !u.hasBanquet) throw new UserError("Pick at least one: restaurant, rooms or banquet.");
  return u;
}

async function newHotel(fd: FormData, planId?: number) {
  const p = hotelSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) throw new UserError(p.error.issues[0].message);
  const db = await getDb();
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.login, p.data.login));
  if (taken) throw new UserError("This mobile number already has an account. Log in instead.");
  const [plan] = planId
    ? await db.select().from(schema.plans).where(eq(schema.plans.id, planId))
    : await db.select().from(schema.plans).where(eq(schema.plans.code, "growth"));
  if (!plan) throw new UserError("No plan found. Platform setup is incomplete.");
  const hotelUnits = units(fd);
  const passwordHash = await hashPassword(p.data.password);
  try {
    return await db.transaction((tx) =>
      createHotelWithDefaults(tx, {
        hotel: { name: p.data.hotelName, city: p.data.city, phone: p.data.login, planId: plan.id, ...hotelUnits },
        owner: { name: p.data.ownerName, login: p.data.login, passwordHash },
      }),
    );
  } catch (e) {
    // Two sign-ups with the same number at once: the second hits the unique login index.
    if (isUniqueViolation(e)) throw new UserError("This mobile number already has an account. Log in instead.");
    throw e;
  }
}

// Public self sign-up: creates the hotel on a free trial and logs the owner in.
export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const res = await run(async () => {
    if (await getUser()) throw new UserError("You are already logged in.");
    if (fd.get("agree") !== "on") throw new UserError("Please read the rules and tick the box to accept the terms.");
    const { owner, hotel } = await newHotel(fd);
    // Keeps proof of when the owner accepted the terms shown on the signup page.
    await platformAudit(owner.id, "accept_terms", hotel.id);
    await startSession(owner.id);
    return ok("created");
  });
  if (res?.ok) redirect("/");
  return res;
}

// ---------- platform owner ----------

async function platformAudit(userId: number, action: string, hotelId: number | null, data?: unknown) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({ hotelId, userId, action, entity: "hotel", entityId: hotelId ? String(hotelId) : null, data: data ?? null });
}

export async function onboardHotel(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await requirePlatformAction();
    const { hotel } = await newHotel(fd, Number(fd.get("planId")) || undefined);
    await platformAudit(me.id, "onboard", hotel.id);
    revalidatePath("/platform");
    return ok(`${hotel.name} created on a free trial. Share the mobile number and password with the owner.`);
  });
}

export async function recordPayment(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await requirePlatformAction();
    const hotelId = Number(fd.get("hotelId"));
    const months = Number(fd.get("months"));
    const amount = toPaise(fd.get("amount"));
    const method = String(fd.get("method") ?? "");
    const planId = Number(fd.get("planId"));
    if (!Number.isInteger(hotelId) || !Number.isInteger(planId)) throw new UserError("Hotel or plan not found.");
    if (!Number.isInteger(months) || months < 1 || months > 36) throw new UserError("Months must be 1 to 36.");
    if (amount == null || amount <= 0) throw new UserError("Enter the amount received.");
    if (!["upi", "bank", "cash", "cheque"].includes(method)) throw new UserError("Choose how it was paid.");
    const db = await getDb();
    const [hotel] = await db.select().from(schema.hotels).where(eq(schema.hotels.id, hotelId));
    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId));
    if (!hotel || !plan) throw new UserError("Hotel or plan not found.");
    // Paying during the trial keeps the remaining trial days: the paid period starts after the trial.
    const period = extendPeriod(hotel.paidUntil ?? (hotel.status === "trial" ? hotel.trialEndsAt : null), todayIST(), months);
    await db.transaction(async (tx) => {
      await tx.insert(schema.subscriptionPayments).values({
        hotelId,
        planId,
        amount,
        months,
        periodFrom: period.from,
        periodTo: period.to,
        method,
        reference: String(fd.get("reference") ?? "").trim() || null,
        recordedBy: me.id,
      });
      await tx.update(schema.hotels).set({ planId, status: "active", paidUntil: period.to }).where(eq(schema.hotels.id, hotelId));
    });
    await platformAudit(me.id, "payment", hotelId, { amount, months, planId, ...period });
    revalidatePath("/platform", "layout");
    return ok(`Payment saved. Active till ${period.to}.`);
  });
}

export async function extendTrial(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await requirePlatformAction();
    const hotelId = Number(fd.get("hotelId"));
    const days = Number(fd.get("days"));
    if (!Number.isInteger(hotelId)) throw new UserError("Hotel not found.");
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new UserError("Days must be 1 to 90.");
    const db = await getDb();
    const [hotel] = await db.select().from(schema.hotels).where(eq(schema.hotels.id, hotelId));
    if (!hotel) throw new UserError("Hotel not found.");
    if (hotel.status !== "trial") throw new UserError("Only hotels on trial can get more trial days.");
    const base = hotel.trialEndsAt && hotel.trialEndsAt > todayIST() ? hotel.trialEndsAt : todayIST();
    const trialEndsAt = addDays(base, days);
    await db.update(schema.hotels).set({ trialEndsAt }).where(eq(schema.hotels.id, hotelId));
    await platformAudit(me.id, "extend_trial", hotelId, { days, trialEndsAt });
    revalidatePath("/platform", "layout");
    return ok(`Trial now ends on ${trialEndsAt}.`);
  });
}

export async function setSuspended(hotelId: number, suspended: boolean): Promise<FormState> {
  return run(async () => {
    const me = await requirePlatformAction();
    if (!Number.isInteger(hotelId)) throw new UserError("Hotel not found.");
    const db = await getDb();
    const [hotel] = await db.select().from(schema.hotels).where(eq(schema.hotels.id, hotelId));
    if (!hotel) throw new UserError("Hotel not found.");
    const status = suspended ? "suspended" : hotel.paidUntil ? "active" : "trial";
    await db.update(schema.hotels).set({ status }).where(eq(schema.hotels.id, hotelId));
    await platformAudit(me.id, suspended ? "suspend" : "resume", hotelId);
    revalidatePath("/platform", "layout");
    return ok(suspended ? "Hotel suspended." : "Hotel resumed.");
  });
}

export async function savePlan(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await requirePlatformAction();
    const id = Number(fd.get("id"));
    const price = toPaise(fd.get("price"));
    const limit = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      if (!v) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) throw new UserError("Limits must be whole numbers, or blank for unlimited.");
      return n;
    };
    if (price == null) throw new UserError("Enter the monthly price.");
    if (!Number.isInteger(id)) throw new UserError("Plan not found.");
    const db = await getDb();
    const values = { name: String(fd.get("name") ?? "").trim() || "Plan", priceMonthly: price, maxEmployees: limit("maxEmployees"), maxUsers: limit("maxUsers") };
    await db.update(schema.plans).set(values).where(eq(schema.plans.id, id));
    await platformAudit(me.id, "update_plan", null, { id, ...values });
    revalidatePath("/platform", "layout");
    return ok("Plan saved.");
  });
}
