"use client";

import { ActionForm, Input, Select } from "@/components/forms";
import { addBookingPayment, cancelBooking, completeBooking } from "@/lib/booking-actions";
import { PAY_MODE_LABEL, rupeesPlain } from "@/lib/format";
import { useT } from "@/i18n/client";

const modes = Object.entries(PAY_MODE_LABEL).map(([value, label]) => ({ value, label }));

export function PaymentForm({ bookingId }: { bookingId: number }) {
  const t = useT();
  return (
    <ActionForm action={addBookingPayment} submit={t("Record payment")}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="grid grid-cols-2 gap-3">
        <Input name="amount" label={t("Amount received (₹)")} inputMode="decimal" required />
        <Select name="mode" label={t("Paid by")} options={modes} defaultValue="upi" />
        <div className="col-span-2"><Input name="note" label={t("Note")} placeholder={t("optional")} /></div>
      </div>
    </ActionForm>
  );
}

export function CompleteForm({ bookingId, total }: { bookingId: number; total: number }) {
  const t = useT();
  return (
    <ActionForm action={completeBooking} submit={t("Mark completed")} resetOnOk={false}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="sm:max-w-xs">
        <Input name="finalAmount" label={t("Final bill amount (₹)")} inputMode="decimal" defaultValue={rupeesPlain(total)} required />
      </div>
      <p className="mt-2 text-xs text-muted">{t("Adds the bill to today's sales on this customer's account. Advance already received is adjusted automatically.")}</p>
    </ActionForm>
  );
}

export function CancelForm({ bookingId, received }: { bookingId: number; received: number }) {
  const t = useT();
  return (
    <ActionForm action={cancelBooking} submit={t("Cancel booking")} resetOnOk={false}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="grid grid-cols-2 gap-3">
        {received > 0 && (
          <>
            <Input name="refund" label={t("Refund to customer (₹)")} inputMode="decimal" defaultValue="0" />
            <Select name="refundMode" label={t("Refund paid by")} options={modes} defaultValue="upi" />
          </>
        )}
        <div className="col-span-2"><Input name="reason" label={t("Reason")} placeholder={t("optional")} /></div>
      </div>
      {received > 0 && <p className="mt-2 text-xs text-muted">{t("Whatever is not refunded is kept as a cancellation charge and counted as today's income.")}</p>}
    </ActionForm>
  );
}
