import { BOOKING_STATUS_LABEL } from "@/lib/format";
import { Badge } from "./ui";

export function BookingBadge({ status }: { status: string }) {
  const tone = status === "confirmed" ? "ok" : status === "tentative" ? "warn" : status === "cancelled" ? "out" : "neutral";
  return <Badge tone={tone}>{BOOKING_STATUS_LABEL[status]}</Badge>;
}
