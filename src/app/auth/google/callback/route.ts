import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser, keepOnlyThisSession, startSession } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/action-helpers";
import { appOrigin, exchangeCode, FLOW_COOKIE, FLOW_COOKIE_PATH, sealIdentity, SIGNUP_COOKIE, type Flow } from "@/lib/google";

export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const store = await cookies();
  const raw = store.get(FLOW_COOKIE)?.value;
  store.delete({ name: FLOW_COOKIE, path: FLOW_COOKIE_PATH });
  const flow = raw ? (JSON.parse(raw) as Flow) : null;
  const params = req.nextUrl.searchParams;
  const back = flow?.mode === "connect" ? "/account" : flow?.mode === "signup" ? "/signup" : "/login";
  const to = (path: string) => NextResponse.redirect(`${origin}${path}`);
  const code = params.get("code");
  if (!flow || !code || params.get("state") !== flow.state) return to(`${back}?google=failed`);
  const google = await exchangeCode(code, flow, `${origin}/auth/google/callback`);
  if (!google) return to(`${back}?google=failed`);
  const db = await getDb();

  if (flow.mode === "connect") {
    const me = await getUser();
    if (!me) return to("/login");
    try {
      await db.update(schema.users).set({ googleSub: google.sub, email: google.email.toLowerCase(), emailVerified: true }).where(eq(schema.users.id, me.id));
    } catch (e) {
      if (isUniqueViolation(e)) return to("/account?google=taken");
      throw e;
    }
    if (me.hotelId) {
      await db.insert(schema.auditLog).values({ hotelId: me.hotelId, userId: me.id, action: "connect_google", entity: "user", entityId: String(me.id) });
    }
    // The password stops working now, so end any session opened with it elsewhere.
    await keepOnlyThisSession(me.id);
    return to("/account?google=connected");
  }

  const { users } = schema;
  // Known Google account, or a login whose confirmed email is this one: link it the first time.
  let [user] = await db.select().from(users).where(and(eq(users.googleSub, google.sub), eq(users.active, true)));
  if (!user) {
    [user] = await db
      .select()
      .from(users)
      .where(and(sql`lower(${users.email}) = ${google.email.toLowerCase()}`, eq(users.emailVerified, true), eq(users.active, true)));
    if (user) await db.update(users).set({ googleSub: google.sub }).where(eq(users.id, user.id));
  }
  if (!user) {
    if (flow.mode !== "signup") return to("/login?google=unlinked");
    store.set(SIGNUP_COOKIE, sealIdentity(google), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 1800 });
    return to("/signup");
  }
  await startSession(user.id);
  return to("/");
}
