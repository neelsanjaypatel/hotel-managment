"use client";

import { useState } from "react";
import { ActionForm, Input } from "@/components/forms";
import { closeDay } from "@/lib/actions";
import { rupees, toPaise } from "@/lib/format";

export function CloseDayForm({ date, expected }: { date: string; expected: number }) {
  const [counted, setCounted] = useState("");
  const [deposit, setDeposit] = useState("");
  const dep = toPaise(deposit || "0") ?? 0;
  const c = toPaise(counted);
  const shouldBe = expected - dep;
  const diff = c == null ? null : c - shouldBe;
  return (
    <ActionForm action={closeDay} submit="Close day" resetOnOk={false}>
      <input type="hidden" name="date" value={date} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input name="cashDeposit" label="Cash deposited to bank (₹)" inputMode="decimal" placeholder="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        <Input name="countedCash" label="Cash counted in drawer (₹)" inputMode="decimal" required value={counted} onChange={(e) => setCounted(e.target.value)} />
        <div className="col-span-2 sm:col-span-1">
          <span className="label">Drawer should have</span>
          <div className="num py-2 font-semibold">{rupees(shouldBe)}</div>
        </div>
      </div>
      {diff != null && (
        <p className={`mt-2 text-sm font-medium ${diff === 0 ? "text-income" : diff < 0 ? "text-danger" : "text-warn"}`}>
          {diff === 0 ? "Cash matches." : diff < 0 ? `Short by ${rupees(-diff)}` : `Excess ${rupees(diff)}`}
        </p>
      )}
      <div className="mt-3">
        <Input name="note" label="Note (reason for short/excess)" placeholder="optional" />
      </div>
    </ActionForm>
  );
}
