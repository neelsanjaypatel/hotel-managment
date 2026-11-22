import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-[1.75rem]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

// A number that matters. Money in is tinted with the income colour, money out with the
// expense colour, things to chase with the warning colour; plain facts stay white.
export function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "in" | "out" | "warn"; hint?: ReactNode }) {
  const box =
    tone === "in"
      ? "border-income/25 bg-income-soft"
      : tone === "out"
        ? "border-expense/25 bg-expense-soft"
        : tone === "warn"
          ? "border-warn/25 bg-warn-soft"
          : "border-line bg-surface";
  const color = tone === "in" ? "text-income" : tone === "out" ? "text-expense" : tone === "warn" ? "text-warn" : "";
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${box}`}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`num mt-1 text-2xl font-bold tracking-tight ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

// Large tap targets for the jobs done every day, so a new person knows where to start.
export function QuickAction({ href, title, sub, children }: { href: string; title: string; sub: string; children: ReactNode }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-accent hover:bg-accent-soft">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {children}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="hidden truncate text-xs text-muted sm:block">{sub}</span>
      </span>
    </Link>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "out" }) {
  const cls =
    tone === "ok"
      ? "bg-accent-soft text-accent"
      : tone === "warn"
        ? "bg-warn-soft text-warn"
        : tone === "out"
          ? "bg-expense-soft text-expense"
          : "bg-surface-2 text-muted border border-line";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

// Horizontal share bar used in breakdown lists.
export function Bar({ value, max, tone = "in" }: { value: number; max: number; tone?: "in" | "out" }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-2">
      <div className={`h-1.5 rounded-full ${tone === "in" ? "bg-income" : "bg-expense"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
