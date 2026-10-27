// Money is stored as integer paise; these are the only conversions.

export function toPaise(input: FormDataEntryValue | null): number | null {
  if (input == null) return null;
  const s = String(input).replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ""] = s.split(".");
  return Number(r) * 100 + Number(p.padEnd(2, "0"));
}

const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Whole rupees print without decimals; anything with paise prints both digits.
export function rupees(paise: number | null | undefined): string {
  const p = paise ?? 0;
  return (p < 0 ? "-₹" : "₹") + (p % 100 === 0 ? inr0 : inr2).format(Math.abs(p) / 100);
}

export function rupeesPlain(paise: number): string {
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

// Business dates are Indian dates regardless of server timezone.
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

// Rejects impossible dates such as 2026-02-31, which JS would roll over but Postgres refuses.
export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthBounds(month: string): { from: string; to: string; days: number } {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, "0")}`, days };
}

export function prettyDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function prettyMonth(month: string): string {
  return new Date(month + "-01T00:00:00Z").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const SALE_MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank: "Bank transfer",
  zomato: "Zomato",
  swiggy: "Swiggy",
  credit: "Credit (udhaar)",
};

export const UNIT_LABEL: Record<string, string> = {
  restaurant: "Restaurant",
  rooms: "Rooms",
  banquet: "Banquet",
};

// Ways money actually moves. "credit" (pay a supplier later) exists only for expenses.
export const PAID_MODES = ["cash", "upi", "card", "bank"] as const;

export const payLabel = (mode: string) => PAY_MODE_LABEL[mode] ?? (mode === "credit" ? "On credit" : mode);

export const PAY_MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank: "Bank",
};

export const bookingNo = (n: number) => `BK-${String(n).padStart(4, "0")}`;

export const SLOT_LABEL: Record<string, string> = {
  morning: "Morning",
  lunch: "Lunch",
  evening: "Evening",
  dinner: "Dinner",
  full_day: "Full day",
};

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  tentative: "Tentative",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};
