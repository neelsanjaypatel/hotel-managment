"use client";

import { useState } from "react";
import { ActionForm, Input } from "@/components/forms";
import { closeDay } from "@/lib/actions";
import { rupees, rupeesPlain, toPaise } from "@/lib/format";

const NOTES = [500, 200, 100, 50, 20, 10];

export function CloseDayForm({ date, expected }: { date: string; expected: number }) {
  const [counted, setCounted] = useState("");
  const [deposit, setDeposit] = useState("");
  // Optional note-by-note count; filling it writes the total into "Cash counted".
  const [notes, setNotes] = useState<Record<string, string>>({});
  const countNotes = (next: Record<string, string>) => {
    setNotes(next);
    const paise =
      NOTES.reduce((a, n) => a + n * 100 * (Number(next[n]) || 0), 0) + (toPaise(next.coins || "0") ?? 0);
    setCounted(paise ? rupeesPlain(paise) : "");
  };
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
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-accent">Count notes</summary>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-7">
          {NOTES.map((n) => (
            <label key={n} className="block">
              <span className="label">₹{n} ×</span>
              <input
                className="field num"
                inputMode="numeric"
                placeholder="0"
                value={notes[n] ?? ""}
                onChange={(e) => countNotes({ ...notes, [n]: e.target.value.replace(/\D/g, "") })}
                aria-label={`Number of ₹${n} notes`}
              />
            </label>
          ))}
          <label className="block">
            <span className="label">Coins ₹</span>
            <input
              className="field num"
              inputMode="decimal"
              placeholder="0"
              value={notes.coins ?? ""}
              onChange={(e) => countNotes({ ...notes, coins: e.target.value })}
              aria-label="Coins total in rupees"
            />
          </label>
        </div>
      </details>
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
