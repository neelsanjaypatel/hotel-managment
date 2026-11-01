"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser, hashPassword, noteTry, overLimit } from "./auth";
import { UserError, isUniqueViolation, ok, run, type FormState } from "./action-helpers";
import { normalEmail, sendResetMail, sendVerifyMail, spendToken, validEmail } from "./email-tokens";
import { mailConfigured } from "./mail";

const { users, sessions, auditLog } = schema;

// Anyone logged in can set the email used to recover their own login. It counts only after the
// link in the mail is opened, so a typing mistake cannot hand the account to a stranger.
export async function setMyEmail(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const me = await getUser();
    if (!me) throw new UserError("Please log in again.");
    if (me.hasGoogle) throw new UserError("This login uses your Google email.");
    const email = normalEmail(fd.get("email"));
    if (!validEmail(email)) throw new UserError("Enter a valid email.");
    const db = await getDb();
    try {
      await db.update(users).set({ email, emailVerified: false }).where(eq(users.id, me.id));
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserError("That email is already used by another login.");
      throw e;
    }
    await sendVerifyMail(me.id, email);
    revalidatePath("/account");
    return ok(mailConfigured() ? "Check your email and open the link to confirm it." : "Email saved. It can be confirmed once email sending is switched on.");
  });
}

// The answer is the same whether the email exists or not, so this cannot be used to find accounts.
export async function forgotPassword(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const email = normalEmail(fd.get("email"));
    if (!validEmail(email)) throw new UserError("Enter a valid email.");
    if (!mailConfigured()) throw new UserError("Email reset is not switched on yet. Please ask your hotel owner.");
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    for (const key of [`forgot:${ip}`, `forgot:${email.slice(0, 100)}`]) {
      if (await overLimit(key, 5)) throw new UserError("Too many tries. Please wait an hour.");
      await noteTry(key, 60 * 60 * 1000);
    }
    const db = await getDb();
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, eq(users.emailVerified, true), eq(users.active, true)));
    if (u) await sendResetMail(u.id, email);
    return ok("If that email belongs to a login, a reset link is on its way. Check spam too.");
  });
}

export async function resetWithToken(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const password = String(fd.get("password") ?? "");
    if (password.length < 8) throw new UserError("Password must be at least 8 characters.");
    if (password !== String(fd.get("confirm") ?? "")) throw new UserError("The two passwords do not match.");
    const userId = await spendToken(String(fd.get("token") ?? ""), "reset");
    if (!userId) throw new UserError("This link has expired or was already used. Ask for a new one.");
    const db = await getDb();
    // A password reset is also how someone gets back in after losing their Google account.
    const [u] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(password), googleSub: null })
      .where(eq(users.id, userId))
      .returning({ hotelId: users.hotelId });
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.insert(auditLog).values({ hotelId: u?.hotelId ?? null, userId, action: "reset_password_email", entity: "user", entityId: String(userId) });
    return ok("Password changed. You can log in now.");
  });
}
