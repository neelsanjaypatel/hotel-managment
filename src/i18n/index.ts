import { hi } from "./hi";
import { gu } from "./gu";

// The app is written in English. Hindi and Gujarati are look-up tables keyed by the English
// sentence, so a sentence with no translation yet simply stays in English.
export const LOCALES = ["en", "hi", "gu"] as const;
export type Locale = (typeof LOCALES)[number];

// Each language is named in its own script, so a person who reads only that script finds it.
export const LOCALE_NAME: Record<Locale, string> = { en: "English", hi: "हिंदी", gu: "ગુજરાતી" };

export const LANG_COOKIE = "lang";

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

const DICT: Record<Exclude<Locale, "en">, Record<string, string>> = { hi, gu };

export type Vars = Record<string, string | number>;
export type T = ((text: string, vars?: Vars) => string) & { locale: Locale };

// "{name}" in a sentence is filled from vars, so each language can put it where it reads right.
export function translator(locale: Locale): T {
  const dict = locale === "en" ? undefined : DICT[locale];
  const t = (text: string, vars?: Vars) => {
    const s = dict?.[text] ?? text;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
  };
  return Object.assign(t, { locale });
}

// A server action's answer, said in the reader's language. Words passed as values ("employee",
// "Bonus") are looked up too; names and amounts pass through untouched.
export function sayState(t: T, state: { ok?: string; error?: string; key?: string; vars?: Vars }): string {
  if (!state.key) return t(state.error ?? state.ok ?? "");
  const vars: Vars = {};
  for (const [k, v] of Object.entries(state.vars ?? {})) vars[k] = typeof v === "string" ? t(v) : v;
  return t(state.key, vars);
}
