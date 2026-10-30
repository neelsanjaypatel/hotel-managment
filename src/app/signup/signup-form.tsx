"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { signupAction } from "@/lib/platform-actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, null);
  const [, startTransition] = useTransition();
  return (
    // Submitted by hand so a server error does not wipe what the owner typed.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <label className="block">
        <span className="label">Hotel name</span>
        <input name="hotelName" className="field" required />
      </label>
      <label className="block">
        <span className="label">City</span>
        <input name="city" className="field" required />
      </label>
      <fieldset>
        <legend className="label">What does your hotel have?</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasRestaurant" defaultChecked /> Restaurant</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasRooms" /> Rooms</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasBanquet" /> Banquet</label>
        </div>
      </fieldset>
      <label className="block">
        <span className="label">Your name (owner)</span>
        <input name="ownerName" className="field" required autoComplete="name" />
      </label>
      <label className="block">
        <span className="label">Mobile number (this is your login)</span>
        <input name="login" className="field" required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel-national" />
      </label>
      <label className="block">
        <span className="label">Password (8+ characters)</span>
        <input name="password" type="password" className="field" required minLength={8} autoComplete="new-password" />
      </label>
      <label className="flex items-start gap-2 pt-1 text-sm">
        <input type="checkbox" name="agree" required className="mt-1" />
        <span>
          I have read <a href="#rules" className="font-medium text-accent underline underline-offset-2">the rules</a> and agree to the{" "}
          <Link href="/terms" target="_blank" className="font-medium text-accent underline underline-offset-2">terms and privacy</Link>.
        </span>
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Creating your hotel..." : "Start free trial"}
      </button>
    </form>
  );
}
