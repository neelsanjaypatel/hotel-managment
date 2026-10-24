import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage, can } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { BookingForm } from "../booking-form";

export const metadata = { title: "New booking" };

export default async function NewBookingPage() {
  const user = await requirePage("enterCounter");
  if (!user.access.canWrite) redirect("/bookings");
  const h = user.hotel;
  const units = [h.hasBanquet && "banquet", h.hasRooms && "rooms", h.hasRestaurant && "restaurant"].filter(Boolean) as string[];
  return (
    <>
      <PageHeader title="New booking" sub="Book a function, rooms or a table for a future date. Advance goes into today's counter.">
        <Link href="/bookings" className="btn btn-ghost">All bookings</Link>
      </PageHeader>
      <Card>
        <BookingForm units={units} today={todayIST()} />
      </Card>
      {!can(user, "closeDay") && <p className="mt-3 text-xs text-muted">Completing or cancelling a booking needs a manager or the owner.</p>}
    </>
  );
}
