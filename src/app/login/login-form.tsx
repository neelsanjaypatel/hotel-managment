"use client";

import { useActionState, useTransition } from "react";
import { loginAction } from "@/lib/actions";

export function LoginForm() {
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
        <span className="label">Login (phone or username)</span>
        <input name="login" className="field" autoComplete="username" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" className="field" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn btn-lg w-full" disabled={pending}>
        {pending ? "Checking..." : "Log in"}
      </button>
    </form>
  );
}
