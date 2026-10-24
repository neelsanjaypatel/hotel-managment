"use client";

import { useState } from "react";
import { ActionForm, Input, Select } from "@/components/forms";
import { createBooking, updateBooking } from "@/lib/booking-actions";
import { PAY_MODE_LABEL, SLOT_LABEL, UNIT_LABEL, rupees, rupeesPlain, toPaise } from "@/lib/format";
import type { Booking } from "@/db/schema";

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

function nights(from: string, to: string) {
  if (!from || !to) return 0;
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 864e5));
}

// New booking (with optional advance) or edit of an open one.
export function BookingForm({
  units,
  today,
  booking,
  customer,
}: {
  units: string[];
  today: string;
  booking?: Booking;
  customer?: { name: string; phone: string | null };
}) {
  const b = booking;
  const [unit, setUnit] = useState<string>(b?.unit ?? (units.includes("banquet") ? "banquet" : units[0]));
  const [date, setDate] = useState(b?.date ?? "");
  const [endDate, setEndDate] = useState(b?.unit === "rooms" ? b.endDate : "");
  const [guests, setGuests] = useState(b?.guests ? String(b.guests) : "");
  const [rate, setRate] = useState(b?.rate ? rupeesPlain(b.rate) : "");
  const [total, setTotal] = useState(b ? rupeesPlain(b.totalAmount) : "");
  const rooms = unit === "rooms";

  // Suggested total: rate x plates, or rate x rooms x nights for rooms.
  const r = toPaise(rate);
  const g = Number(guests) || 0;
  const n = rooms ? nights(date, endDate) : 1;
  const suggested = r && g && n ? r * g * n : null;

  return (
    <ActionForm action={b ? updateBooking : createBooking} submit={b ? "Save changes" : "Save booking"} resetOnOk={false}>
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {!b && (
          <>
            <Input name="customer" label="Customer name" required />
            <Input name="phone" label="Customer mobile" inputMode="numeric" maxLength={10} placeholder="for WhatsApp slip" />
          </>
        )}
        {b && <Input name="phone" label="Customer mobile" inputMode="numeric" maxLength={10} defaultValue={customer?.phone ?? ""} />}
        <Select name="unit" label="Booking for" options={opts(UNIT_LABEL).filter((o) => units.includes(o.value))} defaultValue={unit} onChange={setUnit} />
        <div className={b ? "" : "col-span-2 md:col-span-1"}>
          <Input name="title" label="Occasion / details" required defaultValue={b?.title} placeholder={rooms ? "2 deluxe rooms" : "Wedding reception"} />
        </div>
        <Input name="date" label={rooms ? "Check-in" : "Date"} type="date" required min={b ? undefined : today} value={date} onChange={(e) => setDate(e.target.value)} />
        {rooms ? (
          <Input name="endDate" label="Check-out" type="date" required min={date || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        ) : (
          <Select name="slot" label="Time" options={opts(SLOT_LABEL)} defaultValue={b?.slot ?? "dinner"} />
        )}
        <Input name="venue" label={rooms ? "Room numbers" : "Hall / area"} defaultValue={b?.venue ?? ""} placeholder={rooms ? "101, 102" : "Main hall"} />
        <Input name="guests" label={rooms ? "Rooms" : "Guests / plates"} inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value)} />
        <Input name="rate" label={rooms ? "Rate per room per night (₹)" : "Rate per plate (₹)"} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        <div>
          <Input name="totalAmount" label="Total amount (₹)" inputMode="decimal" required value={total} onChange={(e) => setTotal(e.target.value)} />
          {suggested != null && rupeesPlain(suggested) !== total && (
            <button type="button" className="mt-1 text-xs text-accent" onClick={() => setTotal(rupeesPlain(suggested))}>
              Use {rupees(suggested)}{rooms ? ` (${n} night${n === 1 ? "" : "s"})` : ""}
            </button>
          )}
        </div>
        <Select name="status" label="Status" options={[{ value: "confirmed", label: "Confirmed" }, { value: "tentative", label: "Tentative (on hold)" }]} defaultValue={b?.status ?? "confirmed"} />
        {!b && (
          <>
            <Input name="advance" label="Advance received now (₹)" inputMode="decimal" placeholder="0" />
            <Select name="advanceMode" label="Advance paid by" options={opts(PAY_MODE_LABEL)} defaultValue="upi" />
          </>
        )}
        <div className="col-span-2 md:col-span-4">
          <Input name="notes" label="Notes (menu, decoration, special requests)" defaultValue={b?.notes ?? ""} />
        </div>
      </div>
    </ActionForm>
  );
}
