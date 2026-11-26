import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { isLocale, LANG_COOKIE, translator, type Locale } from ".";

// Read once per request; every server component on the page shares the answer.
export const getLocale = cache(async (): Promise<Locale> => {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(v) ? v : "en";
});

export async function getT() {
  return translator(await getLocale());
}
