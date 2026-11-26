import type { Access } from "@/lib/subscription";
import { Badge } from "./ui";
import { getT } from "@/i18n/server";

export async function SubscriptionBadge({ access }: { access: Access }) {
  const t = await getT();
  const { state, daysLeft } = access;
  if (state === "trial") return <Badge tone={daysLeft <= 3 ? "warn" : "ok"}>{t("Trial · {n}d left", { n: daysLeft })}</Badge>;
  if (state === "active") return <Badge tone={daysLeft <= 7 ? "warn" : "ok"}>{t("Active · {n}d left", { n: daysLeft })}</Badge>;
  if (state === "grace") return <Badge tone="out">{t("Ended · grace")}</Badge>;
  if (state === "expired") return <Badge tone="out">{t("Expired")}</Badge>;
  return <Badge tone="out">{t("Suspended")}</Badge>;
}
