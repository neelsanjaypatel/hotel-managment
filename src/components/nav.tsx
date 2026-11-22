"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavIcon = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: NavIcon; group?: string };

// One small line drawing per menu entry, so the menu can be read at a glance.
const ICONS = {
  dashboard: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />,
  counter: (
    <>
      <path d="M3 7h18v12H3z" />
      <path d="M3 11h18M7 15h3" />
    </>
  ),
  bookings: (
    <>
      <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
    </>
  ),
  attendance: (
    <>
      <path d="M5 4h14v17H5z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  employees: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.5c1.8.800 3 2.7 3 5.5" />
    </>
  ),
  payroll: (
    <>
      <path d="M3 6h18v12H3z" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9v6M18 9v6" />
    </>
  ),
  partners: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </>
  ),
  dues: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  suppliers: (
    <>
      <path d="M2 7h11v9H2zM13 10h4l4 3v3h-8z" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  summary: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  reports: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h5" />
    </>
  ),
  activity: <path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  billing: (
    <>
      <path d="M3 6h18v12H3z" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  salary: (
    <>
      <path d="M4 7h16v12H4z" />
      <path d="M4 7l2-3h12l2 3M15 13h2" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5c0-4 3.4-7 7.5-7s7.5 3 7.5 7" />
    </>
  ),
  hotels: <path d="M4 21V4h10v17M14 9h6v12M2 21h20M8 8h2M8 12h2M8 16h2M17 13h0M17 17h0" />,
  plans: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="8" cy="9" r="1.4" />
    </>
  ),
} as const;

function Icon({ name }: { name: NavIcon }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:shrink-0 md:flex-col md:gap-0.5 md:overflow-visible md:pb-0" aria-label="Main menu">
      {items.map((it, i) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        // A heading above the first entry of each group.
        const heading = it.group && it.group !== items[i - 1]?.group ? it.group : null;
        return (
          <div key={it.href} className="contents">
            {heading && <div className="hidden px-3 pt-4 pb-1 text-[0.688rem] font-semibold uppercase tracking-widest text-side-muted md:block">{heading}</div>}
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-side-active font-semibold text-side-active-ink" : "text-side-muted hover:bg-side-hover hover:text-side-ink"
              }`}
            >
              {active && <span className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-side-mark md:block" aria-hidden />}
              <Icon name={it.icon} />
              {it.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
