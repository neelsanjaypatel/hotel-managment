import { NextResponse, type NextRequest } from "next/server";

// Try a colour theme: /theme?set=emerald | royal | amber | classic. Remembered in a cookie for
// this browser only; the app shell reads it. Temporary, while the owner picks one.
const THEMES = ["emerald", "royal", "amber"];

export function GET(req: NextRequest) {
  const set = req.nextUrl.searchParams.get("set") ?? "";
  const res = NextResponse.redirect(new URL("/", process.env.APP_URL ?? req.url), 303);
  if (THEMES.includes(set)) res.cookies.set("hm_theme", set, { path: "/", maxAge: 60 * 60 * 24 * 90, sameSite: "lax" });
  else res.cookies.delete("hm_theme");
  return res;
}
