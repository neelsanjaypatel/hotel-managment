import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage, can } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { BookingForm } from "../booking-form";
import { getT } from "@/i18n/server";

export const metadata = { title: "New booking" };

export default async function NewBookingPage() {
  const t = await getT();
  const user = await requirePage("enterCounter");
  if (!user.access.canWrite) redirect("/bookings");
  const h = user.hotel;
  const units = [h.hasBanquet && "banquet", h.hasRooms && "rooms", h.hasRestaurant && "restaurant"].filter(Boolean) as string[];
  return (
    <>
      <PageHeader title={t("New booking")} sub={t("Book a function, rooms or a table for a future date. Advance goes into today's counter.")}>
        <Link href="/bookings" className="btn btn-ghost">{t("All bookings")}</Link>
      </PageHeader>
      <Card>
        <BookingForm units={units} today={todayIST()} />
      </Card>
      {!can(user, "closeDay") && <p className="mt-3 text-xs text-muted">{t("Completing or cancelling a booking needs a manager or the owner.")}</p>}
    </>
  );
}
