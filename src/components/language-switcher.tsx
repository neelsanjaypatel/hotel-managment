"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, LOCALE_NAME } from "@/i18n";
import { useLocale } from "@/i18n/client";
import { setLanguage } from "@/i18n/actions";

// Said in all three scripts: the person looking for this may read only one of them.
const NAME = "Language / भाषा / ભાષા";

function Globe() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.300 6.400-3.900 9c-2.600-2.600-3.900-5.600-3.900-9s1.300-6.400 3.900-9z" />
    </svg>
  );
}

// `buttons` shows all three names at once (login page, My account, the phone's More sheet).
// `menu` is the small drop-down for the side menu and the phone's top strip.
export function LanguageSwitcher({ variant = "buttons", className = "" }: { variant?: "buttons" | "menu"; className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (next: string) => {
    if (next === locale) return;
    start(async () => {
      await setLanguage(next);
      router.refresh();
    });
  };

  if (variant === "menu") {
    return (
      <label className={`relative inline-flex items-center text-side-muted ${className}`}>
        <span className="pointer-events-none absolute left-2">
          <Globe />
        </span>
        <select
          value={locale}
          disabled={pending}
          onChange={(e) => pick(e.target.value)}
          aria-label={NAME}
          className="h-9 cursor-pointer appearance-none rounded-lg border border-side-line bg-side py-1 pr-3 pl-8 text-sm text-side-ink hover:bg-side-hover disabled:opacity-60"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAME[l]}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div role="group" aria-label={NAME} className={`flex items-center gap-2 ${className}`}>
      <span className="text-muted">
        <Globe />
      </span>
      <div className="flex flex-1 gap-1 rounded-xl border border-line bg-surface p-1">
        {LOCALES.map((l) => {
          const on = l === locale;
          return (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={on}
              disabled={pending}
              onClick={() => pick(l)}
              className={`min-h-9 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors ${on ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-2"}`}
            >
              {LOCALE_NAME[l]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
