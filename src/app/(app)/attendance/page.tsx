import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { addDays, isISODate, prettyDate, todayIST } from "@/lib/format";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";
import { AttendanceGrid } from "./grid";
import { getT } from "@/i18n/server";

export const metadata = { title: "Attendance" };

const LABEL: Record<string, string> = { P: "Present", A: "Absent", H: "Half day", L: "Leave", WO: "Week off" };

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const t = await getT();
  const user = await requirePage();
  if (!can(user, "markAttendance") && !can(user, "viewEmployees")) return null;
  const sp = await searchParams;
  const today = todayIST();
  const date = isISODate(sp.date) && sp.date <= today ? sp.date : today;
  const db = await getDb();
  const { employees, attendance } = schema;

  const own = user.role === "manager";
  const emps = await db
    .select({ e: employees, a: attendance })
    .from(employees)
    .leftJoin(attendance, and(eq(attendance.employeeId, employees.id), eq(attendance.date, date)))
    .where(and(eq(employees.hotelId, user.hotelId), eq(employees.active, true), own ? eq(employees.managerUserId, user.id) : undefined))
    .orderBy(employees.department, employees.name);

  const editable = can(user, "markAttendance") && user.access.canWrite && (user.role === "admin" || date >= addDays(today, -1));
  const count = (s: string) => emps.filter((r) => r.a?.status === s).length;

  return (
    <>
      <PageHeader title={t("Attendance")} sub={`${prettyDate(date, t.locale)}${own ? ` · ${t("your team")}` : ""}`}>
        <Link className="btn btn-ghost" href={`?date=${addDays(date, -1)}`} aria-label={t("Previous day")}>‹</Link>
        <PeriodPicker name="date" value={date} max={today} />
        {date < today && <Link className="btn btn-ghost" href={`?date=${addDays(date, 1)}`} aria-label={t("Next day")}>›</Link>}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t("Present")} value={String(count("P"))} tone="in" />
        <Stat label={t("Absent")} value={String(count("A"))} tone="out" />
        <Stat label={t("Half day")} value={String(count("H"))} tone="warn" />
        <Stat label={t("Leave / week off")} value={String(count("L") + count("WO"))} />
        <Stat label={t("Not marked")} value={String(emps.filter((r) => !r.a).length)} />
      </div>

      <Card title={t("{n} employees", { n: emps.length })}>
        {emps.length === 0 ? (
          <Empty>{t("No employees assigned")}{own ? t(" to you. Ask admin to assign your team.") : "."}</Empty>
        ) : editable ? (
          <AttendanceGrid
            date={date}
            rows={emps.map(({ e, a }) => ({ id: e.id, name: e.name, department: e.department, payType: e.payType, status: a?.status ?? null, ot: a?.otHours ?? 0 }))}
          />
        ) : (
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>{t("Employee")}</th><th>{t("Department")}</th><th>{t("Status")}</th><th className="r">{t("OT hrs")}</th></tr></thead>
              <tbody>
                {emps.map(({ e, a }) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td className="text-muted">{e.department}</td>
                    <td>{a ? t(LABEL[a.status]) : <span className="text-muted">{t("Not marked")}</span>}</td>
                    <td className="r num">{a?.otHours || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
