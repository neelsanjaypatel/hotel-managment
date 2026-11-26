import type { ReactNode } from "react";
import { I18n } from "@/i18n/boundary";

export default function Layout({ children }: { children: ReactNode }) {
  return <I18n>{children}</I18n>;
}
