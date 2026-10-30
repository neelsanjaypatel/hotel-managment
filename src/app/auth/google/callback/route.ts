import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getUser, keepOnlyThisSession, startSession } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/action-helpers";
import { appOrigin, exchangeCode, FLOW_COOKIE, FLOW_COOKIE_PATH, type Flow } from "@/lib/google";

const OWNER_ROLES = ["admin", "superadmin"] as const;

export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const store = await cookies();
  const raw = store.get(FLOW_COOKIE)?.value;
  store.delete({ name: FLOW_COOKIE, path: FLOW_COOKIE_PATH });
  const flow = raw ? (JSON.parse(raw) as Flow) : null;
  const params = req.nextUrl.searchParams;
  const back = flow?.mode === "connect" ? "/account" : "/login";
  const to = (path: string) => NextResponse.redirect(`${origin}${path}`);
  const code = params.get("code");
  if (!flow || !code || params.get("state") !== flow.state) return to(`${back}?google=failed`);
  const google = await exchangeCode(code, flow, `${origin}/auth/google/callback`);
  if (!google) return to(`${back}?google=failed`);
  const db = await getDb();

  if (flow.mode === "connect") {
    const me = await getUser();
    if (!me) return to("/login");
    if (!(OWNER_ROLES as readonly string[]).includes(me.role)) return to("/account?google=owners");
    try {
      await db.update(schema.users).set({ googleSub: google.sub, email: google.email }).where(eq(schema.users.id, me.id));
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

  const [user] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.googleSub, google.sub), eq(schema.users.active, true), inArray(schema.users.role, [...OWNER_ROLES])));
  if (!user) return to("/login?google=unlinked");
  await startSession(user.id);
  return to("/");
}
