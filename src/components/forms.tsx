"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { FormState } from "@/lib/actions";
import { useT } from "@/i18n/client";
import { sayState } from "@/i18n";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

// Form bound to a server action: shows the result line, clears inputs on success.
export function ActionForm({
  action,
  children,
  className = "",
  submit = "Save",
  resetOnOk = true,
  onOk,
  wide = false,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  submit?: string;
  resetOnOk?: boolean;
  onOk?: () => void;
  wide?: boolean;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const onOkRef = useRef(onOk);
  useEffect(() => {
    onOkRef.current = onOk;
  });
  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnOk) ref.current?.reset();
    onOkRef.current?.();
    // Ready for the next entry: put the cursor back in the field marked data-refocus.
    ref.current?.querySelector<HTMLInputElement>("[data-refocus]")?.focus();
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
        <button className={`btn ${wide ? "w-full py-3 text-base sm:w-auto sm:py-2 sm:text-sm" : ""}`} disabled={pending}>
          {pending ? t("Saving...") : t(submit)}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function Result({ state }: { state: FormState }) {
  const t = useT();
  if (!state) return null;
  return (
    <span role="status" key={state.at} className={`text-sm ${state.error ? "text-danger" : "text-income"}`}>
      {sayState(t, state)}
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
  const t = useT();
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
      {msg?.error && <span className="text-xs text-danger">{sayState(t, msg)}</span>}
    </span>
  );
}

// Date / month picker that navigates by query string.
export function PeriodPicker({ name, value, type = "date", max }: { name: string; value: string; type?: "date" | "month"; max?: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <input
      type={type}
      className="field field-auto"
      value={value}
      max={max}
      onChange={(e) => e.target.value && router.push(`?${name}=${e.target.value}`)}
      aria-label={type === "month" ? t("Month") : t("Date")}
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
  const t = useT();
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
            {t(o.label)}
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
      {props.type === "password" ? <PasswordField {...props} /> : <input className="field" {...props} />}
    </label>
  );
}

// Password box with an eye button: people type on phones and want to check what they typed.
// Every password input in the app goes through this.
export function PasswordField(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={show ? "text" : "password"} className="field field-pw" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t("Hide password") : t("Show password")}
        aria-pressed={show}
        title={show ? t("Hide password") : t("Show password")}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-[10px] text-muted hover:text-ink"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {/* A stroke through the eye while the password is visible: tap again to hide. */}
          {show && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}

// Tap-to-pick buttons for a short list (payment mode, section). The value travels in a
// hidden input, which form.reset() leaves alone, so the choice survives "save and add next".
export function Chips({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  return (
    <div>
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink hover:bg-surface-2"
              }`}
            >
              {t(o.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
