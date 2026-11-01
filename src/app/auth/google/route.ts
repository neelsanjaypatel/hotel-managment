import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, authorizeUrl, FLOW_COOKIE, FLOW_COOKIE_PATH, googleConfigured, newFlow } from "@/lib/google";

// Starts Google sign-in. ?mode=connect links Google to whoever is logged in; ?mode=signup is the
// signup page, where a new Google account goes on to create a hotel.
export function GET(req: NextRequest) {
  const origin = appOrigin(req);
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/login?google=off`);
  const mode = req.nextUrl.searchParams.get("mode");
  const flow = newFlow(mode === "connect" || mode === "signup" ? mode : "login");
  const res = NextResponse.redirect(authorizeUrl(flow, `${origin}/auth/google/callback`));
  res.cookies.set(FLOW_COOKIE, JSON.stringify(flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: FLOW_COOKIE_PATH,
    maxAge: 600,
  });
  return res;
}
