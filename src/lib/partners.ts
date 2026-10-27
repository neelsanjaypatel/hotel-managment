import "server-only";
import { and, between, eq, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { monthBounds } from "./format";
import { monthProfit } from "./payroll";

// Indian financial year (April to March) containing `month`, months up to `month`.
export function fyMonths(month: string) {
  const [y, m] = month.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const key = new Date(Date.UTC(startYear, 3 + i, 1)).toISOString().slice(0, 7);
    if (key > month) break;
    out.push(key);
  }
  return { months: out, label: `FY ${startYear}-${String(startYear + 1).slice(2)}`, from: `${out[0]}-01` };
}

export const shareOf = (amount: number, bp: number) => Math.round((amount * bp) / 10000);

// Each partner's share of profit for the month and the financial year so far, what they
// have already taken out this year, and what is still theirs to take.
export async function partnerPosition(hotelId: number, month: string, db?: DB) {
  db ??= await getDb();
  const fy = fyMonths(month);
  const { to } = monthBounds(month);
  const [partners, monthly, drawn] = await Promise.all([
    db
      .select()
      .from(schema.partners)
      .where(and(eq(schema.partners.hotelId, hotelId), eq(schema.partners.active, true)))
      .orderBy(schema.partners.name),
    Promise.all(fy.months.map((m) => monthProfit(hotelId, m, db))),
    db
      .select({ partnerId: schema.partnerDrawings.partnerId, total: sql<number>`sum(${schema.partnerDrawings.amount})::int` })
      .from(schema.partnerDrawings)
      .where(and(eq(schema.partnerDrawings.hotelId, hotelId), between(schema.partnerDrawings.date, fy.from, to)))
      .groupBy(schema.partnerDrawings.partnerId),
  ]);
  const month0 = monthly[monthly.length - 1];
  const fyProfit = monthly.reduce((a, x) => a + x.profit, 0);
  const rows = partners.map((p) => {
    const fyShare = shareOf(fyProfit, p.shareBp);
    const taken = drawn.find((d) => d.partnerId === p.id)?.total ?? 0;
    return { partner: p, monthShare: shareOf(month0.profit, p.shareBp), fyShare, taken, balance: fyShare - taken };
  });
  return { fy, monthProfit: month0, fyProfit, rows, allocatedBp: partners.reduce((a, p) => a + p.shareBp, 0) };
}
