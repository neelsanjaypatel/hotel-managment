"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translator, type Locale } from ".";

const LocaleContext = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

export function useT() {
  const locale = useContext(LocaleContext);
  return useMemo(() => translator(locale), [locale]);
}
