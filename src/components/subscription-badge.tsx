import type { Access } from "@/lib/subscription";
import { Badge } from "./ui";

export function SubscriptionBadge({ access }: { access: Access }) {
  const { state, daysLeft } = access;
  if (state === "trial") return <Badge tone={daysLeft <= 3 ? "warn" : "ok"}>Trial · {daysLeft}d left</Badge>;
  if (state === "active") return <Badge tone={daysLeft <= 7 ? "warn" : "ok"}>Active · {daysLeft}d left</Badge>;
  if (state === "grace") return <Badge tone="out">Ended · grace</Badge>;
  if (state === "expired") return <Badge tone="out">Expired</Badge>;
  return <Badge tone="out">Suspended</Badge>;
}
