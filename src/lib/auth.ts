import "server-only";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, schema } from "@/db";
import type { Hotel, Role } from "@/db/schema";
import { hotelAccess, type Access } from "./subscription";
import { todayIST } from "./format";

const COOKIE = "hm_session";
const SESSION_DAYS = 30;
let DUMMY_HASH: string | undefined;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type CurrentUser = {
  id: number;
  name: string;
  role: Role;
  employeeId: number | null;
  hotelId: number | null;
  hotel: Hotel | null;
  access: Access | null;
};

// A user inside a hotel, after the hotel checks passed.
export type HotelUser = CurrentUser & { hotelId: number; hotel: Hotel; access: Access };

// Who may do what inside a hotel. Every server action checks one of these.
export const CAN = {
  enterCounter: ["admin", "manager", "cashier"],
  closeDay: ["admin", "manager"],
  reopenDay: ["admin"],
  markAttendance: ["admin", "manager"],
  manageMaster: ["admin"],
  viewReports: ["admin", "partner", "viewer"],
  viewPayroll: ["admin", "partner"],
  viewEmployees: ["admin", "partner", "manager"],
  platform: ["superadmin"],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof CAN;

export function can(user: CurrentUser | null, perm: Permission): boolean {
  return !!user && (CAN[perm] as Role[]).includes(user.role);
}

export async function startSession(userId: number) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: hash(token), userId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function login(loginId: string, password: string): Promise<boolean> {
  const db = await getDb();
  const [u] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.login, loginId.trim()), eq(schema.users.active, true)));
  // Compare against a dummy hash when the user is missing so timing does not leak which logins exist.
  const ok = await bcrypt.compare(password, u?.passwordHash ?? (DUMMY_HASH ??= bcrypt.hashSync("-", 10)));
  if (!u || !ok) return false;
  await startSession(u.id);
  return true;
}

export async function logout() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, hash(token)));
  }
  store.delete(COOKIE);
}

export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ u: schema.users, hotel: schema.hotels })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .leftJoin(schema.hotels, eq(schema.hotels.id, schema.users.hotelId))
    .where(and(eq(schema.sessions.id, hash(token)), gt(schema.sessions.expiresAt, new Date())));
  if (!row || !row.u.active) return null;
  const { u, hotel } = row;
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    employeeId: u.employeeId,
    hotelId: u.hotelId,
    hotel,
    access: hotel ? hotelAccess(hotel, todayIST()) : null,
  };
});

// For pages: send to login, the platform console, billing, or home as needed.
export async function requirePage(perm?: Permission): Promise<HotelUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "superadmin") redirect("/platform");
  if (!user.hotelId || !user.hotel || !user.access) redirect("/login");
  if (!user.access.canRead) redirect("/billing");
  if (perm && !can(user, perm)) redirect("/");
  return user as HotelUser;
}

export async function requirePlatformPage(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "superadmin") redirect("/");
  return user;
}

export class Forbidden extends Error {}

// For hotel server actions: throw instead of redirect so the form shows the message.
// All hotel actions write data, so they also need an active (or grace) subscription.
export async function requireAction(perm: Permission): Promise<HotelUser> {
  const user = await getUser();
  if (!user || !can(user, perm) || !user.hotelId || !user.access) throw new Forbidden("You do not have permission for this.");
  if (!user.access.canWrite) {
    throw new Forbidden("Your subscription has ended. Data is view-only until it is renewed (see Billing).");
  }
  return user as HotelUser;
}

export async function requirePlatformAction(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user || user.role !== "superadmin") throw new Forbidden("Only the platform owner can do this.");
  return user;
}

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
