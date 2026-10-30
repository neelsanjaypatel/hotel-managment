import { TRIAL_DAYS } from "@/db/defaults";
import { GRACE_DAYS } from "./subscription";

// The service rules in short, shown on the welcome and signup pages. The full text is
// /terms; both read the same numbers the billing code enforces.
export const RULES_AT_A_GLANCE = [
  { title: `${TRIAL_DAYS} days free`, body: "Every feature open, no card. Pick a plan before the trial ends." },
  { title: `${GRACE_DAYS} days of grace`, body: "If a payment is late, entries keep working for a few days, with a reminder." },
  { title: "Then view-only, never deleted", body: "Unpaid hotels can still open and export every entry. Nothing is lost." },
  { title: "Your data is yours", body: "Only your hotel's logins see your entries. The owner can export everything to Excel at any time." },
  { title: "Stored in India", body: "Data is kept on servers in Mumbai. Passwords are stored scrambled, never in plain text." },
] as const;
