"use client";

import { useActionState, useTransition } from "react";
import { loginAction } from "@/lib/actions";
import { PasswordField } from "@/components/forms";
import { useT } from "@/i18n/client";
import { sayState } from "@/i18n";

export function LoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState(loginAction, null);
  const [, startTransition] = useTransition();
  return (
    // Submitted by hand so a wrong password does not also clear the login field.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <label className="block">
        <span className="label">{t("Mobile, username or email")}</span>
        <input name="login" className="field" autoComplete="username" required autoFocus />
      </label>
      <label className="block">
        <span className="label">{t("Password")}</span>
        <PasswordField name="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="text-sm text-danger">{sayState(t, state)}</p>}
      <button className="btn btn-lg w-full" disabled={pending}>
        {pending ? t("Checking...") : t("Log in")}
      </button>
    </form>
  );
}
