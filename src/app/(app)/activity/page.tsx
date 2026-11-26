import Link from "next/link";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { addDays, isISODate, prettyDate, rupees, todayIST } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n";

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
  supplier: "supplier",
  drawing: "partner withdrawal",
  transfer: "cash ↔ bank",
  adjustment: "bonus / allowance / deduction",
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
  change_password: { label: "Changed own password", tone: "neutral" },
};

type Data = Record<string, unknown> | null;
const money = (v: unknown) => (typeof v === "number" ? rupees(v) : null);

// One readable line from the stored audit payload.
function describe(t: T, action: string, entity: string, entityId: string | null, data: Data) {
  const what = t(ENTITY[entity] ?? entity);
  const d = (data ?? {}) as Record<string, unknown>;
  if (action === "update" && d.before && d.after) {
    const before = d.before as Record<string, unknown>;
    const after = d.after as Record<string, unknown>;
    const changed = Object.keys(after).filter(
      (k) => !["createdAt", "markedAt"].includes(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k]),
    );
    const parts = changed.map((k) => {
      const fmt = (v: unknown) => (k === "amount" ? money(v) : v == null || v === "" ? t("blank") : String(v));
      return `${k}: ${fmt(before[k])} → ${fmt(after[k])}`;
    });
    return `${what}${parts.length ? ` · ${parts.join(", ")}` : ` · ${t("no change")}`}`;
  }
  if (action === "close_day") return `${entityId} · ${t("counted {amount}", { amount: money(d.counted) ?? "-" })}${d.deposit ? `, ${t("deposited {amount}", { amount: money(d.deposit) ?? "-" })}` : ""}`;
  if (action === "reopen_day") return String(entityId);
  if (action === "set_opening_cash") return `${entityId} · ${money(d.cash)}`;
  if (action === "mark_attendance") return `${entityId} · ${d.count === 1 ? t("1 person") : t("{n} people", { n: Number(d.count) })}`;
  if (action === "pay_all_salaries") return `${entityId} · ${t("{n} employees", { n: Number(d.count) })}, ${money(d.total)}`;
  const amount = money(d.amount) ?? money(d.bill) ?? money(d.counted);
  const who = (d.name as string) ?? (d.title as string) ?? (d.reference as string) ?? (d.vendor as string) ?? (d.note as string) ?? "";
  return [what, amount, who].filter(Boolean).join(" · ");
}

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const t = await getT();
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
      <PageHeader title={t("Activity log")} sub={`${prettyDate(date, t.locale)} · ${t("who added, changed or deleted what")}`}>
        <Link className="btn btn-ghost" href={`?date=${addDays(date, -1)}${onlyChanges ? "&show=changes" : ""}`} aria-label={t("Previous day")}>‹</Link>
        <PeriodPicker name="date" value={date} max={today} />
        {date < today && <Link className="btn btn-ghost" href={`?date=${addDays(date, 1)}${onlyChanges ? "&show=changes" : ""}`} aria-label={t("Next day")}>›</Link>}
        <Link className="btn btn-ghost" href={`?date=${date}${onlyChanges ? "" : "&show=changes"}`}>
          {onlyChanges ? t("Show everything") : t("Only edits and deletes")}
        </Link>
      </PageHeader>
      <Card>
        {shown.length === 0 ? (
          <Empty>{onlyChanges ? t("No edits or deletes recorded on this day.") : t("Nothing recorded on this day.")}</Empty>
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>{t("Time")}</th><th>{t("Who")}</th><th>{t("What")}</th><th>{t("Details")}</th></tr></thead>
              <tbody>
                {shown.map(({ a, who, role }) => {
                  const act = ACTION[a.action] ?? { label: a.action, tone: "neutral" as const };
                  return (
                    <tr key={a.id}>
                      <td className="num whitespace-nowrap text-muted">{time.format(a.at)}</td>
                      <td className="whitespace-nowrap">{who ?? "-"}<div className="text-xs text-muted">{role ? t(role) : ""}</div></td>
                      <td><Badge tone={act.tone}>{t(act.label)}</Badge></td>
                      <td>{describe(t, a.action, a.entity, a.entityId, a.data as Data)}</td>
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
