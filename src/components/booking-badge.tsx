import { BOOKING_STATUS_LABEL } from "@/lib/format";
import { getT } from "@/i18n/server";
import { Badge } from "./ui";

export async function BookingBadge({ status }: { status: string }) {
  const t = await getT();
  const tone = status === "confirmed" ? "ok" : status === "tentative" ? "warn" : status === "cancelled" ? "out" : "neutral";
  return <Badge tone={tone}>{t(BOOKING_STATUS_LABEL[status])}</Badge>;
}
