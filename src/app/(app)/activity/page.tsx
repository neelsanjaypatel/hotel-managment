import Link from "next/link";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { addDays, isISODate, prettyDate, rupees, todayIST } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";

export const metadata = { title: "Activity log" };

const ENTITY: Record<string, string> = {
  sale: "sale",
  expense: "expense",
  advance: "advance",
  receipt: "payment received",
  salary: "salary payment",
  day: "day",
  attendance: "attendance",
  employee: "employee",
  user: "login",
  category: "category",
  party: "party",
  partner: "partner",
  booking: "booking",
  hotel: "hotel account",
};

const ACTION: Record<string, { label: string; tone: "ok" | "warn" | "out" | "neutral" }> = {
  create: { label: "Added", tone: "ok" },
  update: { label: "Changed", tone: "warn" },
  delete: { label: "Deleted", tone: "out" },
  close_day: { label: "Closed day", tone: "neutral" },
  reopen_day: { label: "Reopened day", tone: "warn" },
  set_opening_cash: { label: "Opening cash", tone: "warn" },
  mark_attendance: { label: "Attendance", tone: "neutral" },
  complete: { label: "Completed", tone: "ok" },
  cancel: { label: "Cancelled", tone: "out" },
  disable: { label: "Disabled", tone: "out" },
  enable: { label: "Enabled", tone: "ok" },
  reset_password: { label: "Password reset", tone: "warn" },
  remove: { label: "Removed", tone: "out" },
  pay_all_salaries: { label: "Paid salaries", tone: "ok" },
  onboard: { label: "Hotel created", tone: "ok" },
  payment: { label: "Subscription paid", tone: "ok" },
  extend_trial: { label: "Trial extended", tone: "neutral" },
  suspend: { label: "Suspended", tone: "out" },
  resume: { label: "Resumed", tone: "ok" },
};

type Data = Record<string, unknown> | null;
const money = (v: unknown) => (typeof v === "number" ? rupees(v) : null);

// One readable line from the stored audit payload.
function describe(action: string, entity: string, entityId: string | null, data: Data) {
  const d = (data ?? {}) as Record<string, unknown>;
  if (action === "update" && d.before && d.after) {
    const before = d.before as Record<string, unknown>;
    const after = d.after as Record<string, unknown>;
    const changed = Object.keys(after).filter(
      (k) => !["createdAt", "markedAt"].includes(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k]),
    );
    const parts = changed.map((k) => {
      const fmt = (v: unknown) => (k === "amount" ? money(v) : v == null || v === "" ? "blank" : String(v));
      return `${k}: ${fmt(before[k])} → ${fmt(after[k])}`;
    });
    return `${ENTITY[entity] ?? entity}${parts.length ? ` · ${parts.join(", ")}` : " · no change"}`;
  }
  if (action === "close_day") return `${entityId} · counted ${money(d.counted)}${d.deposit ? `, deposited ${money(d.deposit)}` : ""}`;
  if (action === "reopen_day") return String(entityId);
  if (action === "set_opening_cash") return `${entityId} · ${money(d.cash)}`;
  if (action === "mark_attendance") return `${entityId} · ${d.count} ${d.count === 1 ? "person" : "people"}`;
  if (action === "pay_all_salaries") return `${entityId} · ${d.count} employees, ${money(d.total)}`;
  const amount = money(d.amount) ?? money(d.bill) ?? money(d.counted);
  const who = (d.name as string) ?? (d.title as string) ?? (d.reference as string) ?? (d.vendor as string) ?? (d.note as string) ?? "";
  return [ENTITY[entity] ?? entity, amount, who].filter(Boolean).join(" · ");
}

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const user = await requirePage("viewPayroll");
  const sp = await searchParams;
  const today = todayIST();
  const date = isISODate(sp.date) && sp.date <= today ? sp.date : today;
  const onlyChanges = sp.show === "changes";
  const db = await getDb();
  // Audit times are stored in UTC; the page shows one Indian calendar day.
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(`${addDays(date, 1)}T00:00:00+05:30`);
  const rows = await db
    .select({ a: schema.auditLog, who: schema.users.name, role: schema.users.role })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(and(eq(schema.auditLog.hotelId, user.hotelId), gte(schema.auditLog.at, start), lt(schema.auditLog.at, end)))
    .orderBy(desc(schema.auditLog.at))
    .limit(500);
  const shown = onlyChanges ? rows.filter((r) => ["update", "delete", "reopen_day", "set_opening_cash", "cancel"].includes(r.a.action)) : rows;
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <>
      <PageHeader title="Activity log" sub={`${prettyDate(date)} · who added, changed or deleted what`}>
        <Link className="btn btn-ghost" href={`?date=${addDays(date, -1)}${onlyChanges ? "&show=changes" : ""}`} aria-label="Previous day">‹</Link>
        <PeriodPicker name="date" value={date} max={today} />
        {date < today && <Link className="btn btn-ghost" href={`?date=${addDays(date, 1)}${onlyChanges ? "&show=changes" : ""}`} aria-label="Next day">›</Link>}
        <Link className="btn btn-ghost" href={`?date=${date}${onlyChanges ? "" : "&show=changes"}`}>
          {onlyChanges ? "Show everything" : "Only edits and deletes"}
        </Link>
      </PageHeader>
      <Card>
        {shown.length === 0 ? (
          <Empty>Nothing recorded {onlyChanges ? "(edits / deletes) " : ""}on this day.</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
              <tbody>
                {shown.map(({ a, who, role }) => {
                  const act = ACTION[a.action] ?? { label: a.action, tone: "neutral" as const };
                  return (
                    <tr key={a.id}>
                      <td className="num whitespace-nowrap text-muted">{time.format(a.at)}</td>
                      <td className="whitespace-nowrap">{who ?? "-"}<div className="text-xs text-muted">{role}</div></td>
                      <td><Badge tone={act.tone}>{act.label}</Badge></td>
                      <td>{describe(a.action, a.entity, a.entityId, a.data as Data)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
