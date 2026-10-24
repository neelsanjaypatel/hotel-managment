"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <label className="block">
        <span className="label">Login (phone or username)</span>
        <input name="login" className="field" autoComplete="username" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" className="field" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Checking..." : "Log in"}
      </button>
    </form>
  );
}
