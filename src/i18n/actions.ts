"use server";

import { cookies } from "next/headers";
import { isLocale, LANG_COOKIE } from ".";

// The choice stays on this phone or computer for a year, for whoever logs in on it.
export async function setLanguage(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LANG_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
