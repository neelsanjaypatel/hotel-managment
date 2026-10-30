import { NextResponse, type NextRequest } from "next/server";

// Visitors without a session see the welcome page at the site's root; logged-in staff get
// the dashboard as before. Only a cookie check here; the app layout still verifies it.
export function proxy(req: NextRequest) {
  if (!req.cookies.has("hm_session")) return NextResponse.rewrite(new URL("/welcome", req.url));
}

export const config = { matcher: "/" };
