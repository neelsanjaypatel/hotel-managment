"use client";

import { useState, useTransition } from "react";
import { revealAadhaar } from "@/lib/actions";

// Masked unless the owner asks; each look at the full number goes in the activity log.
export function AadhaarReveal({ employeeId, masked }: { employeeId: number; masked: string }) {
  const [text, setText] = useState(masked);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <span className="num inline-flex flex-wrap items-center gap-2 text-sm">
      Aadhaar {text}
      {!open && (
        <button
          type="button"
          disabled={pending}
          className="text-xs text-accent underline underline-offset-2"
          onClick={() =>
            start(async () => {
              const r = await revealAadhaar(employeeId);
              setText(r?.ok ?? r?.error ?? masked);
              setOpen(!!r?.ok);
            })
          }
        >
          Show full number
        </button>
      )}
    </span>
  );
}
