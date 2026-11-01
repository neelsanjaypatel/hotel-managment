import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { spendToken } from "@/lib/email-tokens";
import { appOrigin } from "@/lib/google";

// The link in the confirmation mail.
export async function GET(req: NextRequest) {
  const userId = await spendToken(req.nextUrl.searchParams.get("token") ?? "", "verify");
  if (userId) {
    const db = await getDb();
    await db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, userId));
  }
  return NextResponse.redirect(`${appOrigin(req)}/account?email=${userId ? "confirmed" : "expired"}`);
}
