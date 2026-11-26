"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { signupAction } from "@/lib/platform-actions";
import { PasswordField } from "@/components/forms";
import { useT } from "@/i18n/client";
import { sayState } from "@/i18n";

export function SignupForm({ googleEmail }: { googleEmail?: string }) {
  const t = useT();
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
        <span className="label">{t("Hotel name")}</span>
        <input name="hotelName" className="field" required />
      </label>
      <label className="block">
        <span className="label">{t("City")}</span>
        <input name="city" className="field" required />
      </label>
      <fieldset>
        <legend className="label">{t("What does your hotel have?")}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasRestaurant" defaultChecked />{" "}{t("Restaurant")}</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasRooms" />{" "}{t("Rooms")}</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" name="hasBanquet" />{" "}{t("Banquet")}</label>
        </div>
      </fieldset>
      <label className="block">
        <span className="label">{t("Your name (owner)")}</span>
        <input name="ownerName" className="field" required autoComplete="name" />
      </label>
      <label className="block">
        <span className="label">{t("Mobile number (this is your login)")}</span>
        <input name="login" className="field" required inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel-national" />
      </label>
      {googleEmail ? (
        <p className="text-sm text-muted">{t("You will log in with Google as")}{" "}<span className="font-medium text-ink">{googleEmail}</span>.</p>
      ) : (
        <>
          <label className="block">
            <span className="label">{t("Email (to recover your password)")}</span>
            <input name="email" type="email" className="field" required autoComplete="email" />
          </label>
          <label className="block">
            <span className="label">{t("Password (8+ characters)")}</span>
            <PasswordField name="password" required minLength={8} autoComplete="new-password" />
          </label>
        </>
      )}
      <label className="flex items-start gap-2 pt-1 text-sm">
        <input type="checkbox" name="agree" required className="mt-1" />
        <span>
          {t("I have read")}{" "}<a href="#rules" className="font-medium text-accent underline underline-offset-2">{t("the rules")}</a>{" "}{t("and agree to the")}{" "}
          <Link href="/terms" target="_blank" className="font-medium text-accent underline underline-offset-2">{t("terms and privacy")}</Link>.
        </span>
      </label>
      {state?.error && <p className="text-sm text-danger">{sayState(t, state)}</p>}
      <button className="btn w-full" disabled={pending}>
        {pending ? t("Creating your hotel...") : t("Start free trial")}
      </button>
    </form>
  );
}
