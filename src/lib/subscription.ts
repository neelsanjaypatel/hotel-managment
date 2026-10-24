import type { Hotel } from "@/db/schema";

// Days after the trial / paid period ends during which entries still work, with a warning.
export const GRACE_DAYS = 3;

export type Access = {
  state: "trial" | "active" | "grace" | "expired" | "suspended";
  endsOn: string | null;
  daysLeft: number; // negative once past the end date
  canRead: boolean;
  canWrite: boolean;
};

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);
}

// Expired hotels keep read access to their own data; suspended hotels see only Billing.
export function hotelAccess(h: Pick<Hotel, "status" | "trialEndsAt" | "paidUntil">, today: string): Access {
  if (h.status === "suspended") return { state: "suspended", endsOn: h.paidUntil ?? h.trialEndsAt, daysLeft: 0, canRead: false, canWrite: false };
  const endsOn = h.status === "trial" ? h.trialEndsAt : h.paidUntil;
  const daysLeft = endsOn ? daysBetween(today, endsOn) : -999;
  if (daysLeft >= 0) return { state: h.status, endsOn, daysLeft, canRead: true, canWrite: true };
  if (daysLeft >= -GRACE_DAYS) return { state: "grace", endsOn, daysLeft, canRead: true, canWrite: true };
  return { state: "expired", endsOn, daysLeft, canRead: true, canWrite: false };
}

// New paid-until date when a hotel pays for `months` more: continues from the current end
// if it is still in the future, otherwise starts today.
export function extendPeriod(paidUntil: string | null, today: string, months: number) {
  const start = paidUntil && paidUntil >= today ? addDay(paidUntil) : today;
  const d = new Date(start + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return { from: start, to: d.toISOString().slice(0, 10) };
}

function addDay(date: string) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
