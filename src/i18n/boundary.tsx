import type { ReactNode } from "react";
import { I18nProvider } from "./client";
import { getLocale } from "./server";

// Wraps a section of the site so its client components know the chosen language. The root layout
// cannot do this: reading the cookie there would stop the public welcome page being pre-built.
export async function I18n({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <div lang={locale} className="contents">
        {children}
      </div>
    </I18nProvider>
  );
}
