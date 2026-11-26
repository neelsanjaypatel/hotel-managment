"use client";

import { useT } from "@/i18n/client";

export function PrintButton() {
  const t = useT();
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      {t("Print / Save PDF")}
    </button>
  );
}
