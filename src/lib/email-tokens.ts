import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mailConfigured, sendMail } from "./mail";

type Purpose = "verify" | "reset";

const LIFETIME_MS: Record<Purpose, number> = { verify: 24 * 60 * 60 * 1000, reset: 30 * 60 * 1000 };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const siteUrl = () => (process.env.APP_URL ?? "http://localhost:3420").replace(/\/$/, "");

export const normalEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;

// Only the hash is stored, and a newer link replaces an older one of the same kind.
async function newToken(userId: number, purpose: Purpose) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const { emailTokens: t } = schema;
  await db.delete(t).where(and(eq(t.userId, userId), eq(t.purpose, purpose)));
  await db.insert(t).values({ id: hash(token), userId, purpose, expiresAt: new Date(Date.now() + LIFETIME_MS[purpose]) });
  return token;
}

// One use only: the row goes as it is read, so a link cannot work twice.
export async function spendToken(token: string, purpose: Purpose) {
  const db = await getDb();
  const { emailTokens: t } = schema;
  const [row] = await db
    .delete(t)
    .where(and(eq(t.id, hash(token)), eq(t.purpose, purpose), gt(t.expiresAt, new Date())))
    .returning({ userId: t.userId });
  return row?.userId ?? null;
}

export async function sendVerifyMail(userId: number, email: string) {
  if (!mailConfigured()) return;
  const link = `${siteUrl()}/verify-email?token=${await newToken(userId, "verify")}`;
  await sendMail(email, "Confirm your email for Hotel Desk", `Open this link to confirm your email:\n\n${link}\n\nIt works for 24 hours. If you did not ask for this, ignore this mail.`);
}

export async function sendResetMail(userId: number, email: string) {
  if (!mailConfigured()) return;
  const link = `${siteUrl()}/reset?token=${await newToken(userId, "reset")}`;
  await sendMail(email, "Reset your Hotel Desk password", `Open this link to set a new password:\n\n${link}\n\nIt works for 30 minutes, one time. If you did not ask for this, ignore this mail. Your password stays the same.`);
}
