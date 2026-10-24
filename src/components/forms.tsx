"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { FormState } from "@/lib/actions";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

// Form bound to a server action: shows the result line, clears inputs on success.
export function ActionForm({
  action,
  children,
  className = "",
  submit = "Save",
  resetOnOk = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  submit?: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form
      ref={ref}
      // Submitted by hand instead of <form action>: React clears every field after an action
      // runs, which would wipe the user's input when the server answers with an error.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className={className}
    >
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>
          {pending ? "Saving..." : submit}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function Result({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <span role="status" key={state.at} className={`text-sm ${state.error ? "text-danger" : "text-income"}`}>
      {state.error ?? state.ok}
    </span>
  );
}

// Small button for a bound server action (delete, reopen, disable), with confirm.
export function ActButton({
  run,
  label,
  confirm,
  className = "text-xs text-muted hover:text-danger",
}: {
  run: () => Promise<FormState>;
  label: string;
  confirm?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setMsg(await run()));
        }}
      >
        {pending ? "..." : label}
      </button>
      {msg?.error && <span className="text-xs text-danger">{msg.error}</span>}
    </span>
  );
}

// Date / month picker that navigates by query string.
export function PeriodPicker({ name, value, type = "date", max }: { name: string; value: string; type?: "date" | "month"; max?: string }) {
  const router = useRouter();
  return (
    <input
      type={type}
      className="field w-auto"
      value={value}
      max={max}
      onChange={(e) => e.target.value && router.push(`?${name}=${e.target.value}`)}
      aria-label={type === "month" ? "Month" : "Date"}
    />
  );
}

export function Select({
  name,
  label,
  options,
  defaultValue,
  required,
  onChange,
  placeholder,
}: {
  name: string;
  label: string;
  options: { value: string | number; label: string }[];
  defaultValue?: string | number;
  required?: boolean;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select
        name={name}
        className="field"
        defaultValue={defaultValue ?? ""}
        required={required}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field" {...props} />
    </label>
  );
}
