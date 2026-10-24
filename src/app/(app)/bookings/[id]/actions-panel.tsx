"use client";

import { ActionForm, Input, Select } from "@/components/forms";
import { addBookingPayment, cancelBooking, completeBooking } from "@/lib/booking-actions";
import { PAY_MODE_LABEL, rupeesPlain } from "@/lib/format";

const modes = Object.entries(PAY_MODE_LABEL).map(([value, label]) => ({ value, label }));

export function PaymentForm({ bookingId }: { bookingId: number }) {
  return (
    <ActionForm action={addBookingPayment} submit="Record payment">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="grid grid-cols-2 gap-3">
        <Input name="amount" label="Amount received (₹)" inputMode="decimal" required />
        <Select name="mode" label="Paid by" options={modes} defaultValue="upi" />
        <div className="col-span-2"><Input name="note" label="Note" placeholder="optional" /></div>
      </div>
    </ActionForm>
  );
}

export function CompleteForm({ bookingId, total }: { bookingId: number; total: number }) {
  return (
    <ActionForm action={completeBooking} submit="Mark completed" resetOnOk={false}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="sm:max-w-xs">
        <Input name="finalAmount" label="Final bill amount (₹)" inputMode="decimal" defaultValue={rupeesPlain(total)} required />
      </div>
      <p className="mt-2 text-xs text-muted">Adds the bill to today&apos;s sales on this customer&apos;s account. Advance already received is adjusted automatically.</p>
    </ActionForm>
  );
}

export function CancelForm({ bookingId, received }: { bookingId: number; received: number }) {
  return (
    <ActionForm action={cancelBooking} submit="Cancel booking" resetOnOk={false}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="grid grid-cols-2 gap-3">
        {received > 0 && (
          <>
            <Input name="refund" label="Refund to customer (₹)" inputMode="decimal" defaultValue="0" />
            <Select name="refundMode" label="Refund paid by" options={modes} defaultValue="upi" />
          </>
        )}
        <div className="col-span-2"><Input name="reason" label="Reason" placeholder="optional" /></div>
      </div>
      {received > 0 && <p className="mt-2 text-xs text-muted">Whatever is not refunded is kept as a cancellation charge and counted as today&apos;s income.</p>}
    </ActionForm>
  );
}
