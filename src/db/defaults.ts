// Starting data for a new hotel. Shared by signup, platform onboarding and the seed script,
// so it must not import anything server-only.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "./schema";

type Tx = PgDatabase<PgQueryResultHKT, typeof s>;

export const TRIAL_DAYS = 14;

export const DEFAULT_PLANS = [
  { code: "starter", name: "Starter", priceMonthly: 99900, maxEmployees: 25, maxUsers: 5 },
  { code: "growth", name: "Growth", priceMonthly: 199900, maxEmployees: 100, maxUsers: 15 },
  { code: "pro", name: "Pro", priceMonthly: 349900, maxEmployees: null, maxUsers: null },
];

export const DEFAULT_CATEGORIES: { name: string; children?: string[]; isWages?: boolean }[] = [
  { name: "Food", children: ["Dairy", "Grocery", "Vegetables & Fruits", "Meat & Poultry", "Bakery", "Beverages"] },
  { name: "Gas & Fuel" },
  { name: "Maintenance", children: ["Repairs", "Electrical", "Plumbing", "Housekeeping Supplies"] },
  { name: "Labour Wages", isWages: true },
  { name: "Utilities", children: ["Electricity", "Water", "Internet & Phone"] },
  { name: "Rooms", children: ["Laundry", "Toiletries & Linen"] },
  { name: "Banquet", children: ["Decoration", "Outside Catering"] },
  { name: "Rent" },
  { name: "Marketing" },
  { name: "Miscellaneous" },
];

export function addDaysISO(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayISTDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

// Creates the hotel, its owner login, default expense categories and the Zomato / Swiggy parties.
// Returns the new hotel and owner rows plus a name -> id map of categories.
export async function createHotelWithDefaults(
  db: Tx,
  input: {
    hotel: Omit<typeof s.hotels.$inferInsert, "status" | "trialEndsAt">;
    owner: { name: string; login: string; passwordHash: string };
  },
) {
  const [hotel] = await db
    .insert(s.hotels)
    .values({ ...input.hotel, status: "trial", trialEndsAt: addDaysISO(todayISTDate(), TRIAL_DAYS) })
    .returning();
  const [owner] = await db
    .insert(s.users)
    .values({ hotelId: hotel.id, role: "admin", ...input.owner })
    .returning();

  const catIds: Record<string, number> = {};
  for (const c of DEFAULT_CATEGORIES) {
    const [p] = await db.insert(s.expenseCategories).values({ hotelId: hotel.id, name: c.name, isWages: !!c.isWages }).returning();
    catIds[c.name] = p.id;
    for (const ch of c.children ?? []) {
      const [r] = await db.insert(s.expenseCategories).values({ hotelId: hotel.id, name: ch, parentId: p.id }).returning();
      catIds[ch] = r.id;
    }
  }
  const [zomato] = await db.insert(s.parties).values({ hotelId: hotel.id, name: "Zomato", kind: "aggregator" }).returning();
  const [swiggy] = await db.insert(s.parties).values({ hotelId: hotel.id, name: "Swiggy", kind: "aggregator" }).returning();

  return { hotel: hotel as s.Hotel, owner: owner as typeof s.users.$inferSelect, catIds, zomato, swiggy };
}
