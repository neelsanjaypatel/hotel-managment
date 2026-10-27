import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { rupees } from "@/lib/format";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { EmployeeForm } from "./employee-form";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const user = await requirePage("viewEmployees");
  const sp = await searchParams;
  const showAll = sp.show === "all";
  const db = await getDb();
  const { employees, users } = schema;
  const rows = await db
    .select({ e: employees, manager: users.name })
    .from(employees)
    .leftJoin(users, eq(users.id, employees.managerUserId))
    .where(and(eq(employees.hotelId, user.hotelId), showAll ? undefined : eq(employees.active, true)))
    .orderBy(employees.department, employees.name);
  const visible = user.role === "manager" ? rows.filter((r) => r.e.managerUserId === user.id) : rows;
  const managers = (await db.select().from(users).where(and(eq(users.hotelId, user.hotelId), eq(users.role, "manager")))).map((m) => ({ value: m.id, label: m.name }));
  const monthlyBill = visible.filter((r) => r.e.active && r.e.payType === "monthly").reduce((a, r) => a + r.e.rate, 0);
  const daily = visible.filter((r) => r.e.active && r.e.payType === "daily");
  // Next code looks at every employee, including those who left, so it never repeats one.
  const allCodes = await db.select({ code: employees.code }).from(employees).where(eq(employees.hotelId, user.hotelId));
  const codes = allCodes.map((r) => Number(r.code.replace(/\D/g, "")) || 0);
  const nextCode = `E${String(Math.max(0, ...codes) + 1).padStart(3, "0")}`;
  const showPay = can(user, "viewPayroll");

  return (
    <>
      <PageHeader title="Employees" sub={user.role === "manager" ? "Your team" : "All staff"}>
        <Link className="btn btn-ghost" href={showAll ? "?" : "?show=all"}>{showAll ? "Working only" : "Include inactive"}</Link>
      </PageHeader>

      {showPay && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Working staff" value={String(visible.filter((r) => r.e.active).length)} />
          <Stat label="Monthly salary bill" value={rupees(monthlyBill)} hint="Fixed-salary staff, full month" />
          <Stat label="Daily-wage workers" value={String(daily.length)} hint={`${rupees(daily.reduce((a, r) => a + r.e.rate, 0))} per full day`} />
        </div>
      )}

      {can(user, "manageMaster") && (
        <details className="mb-4 rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">+ Add employee</summary>
          <div className="border-t border-line p-4">
            <EmployeeForm managers={managers} nextCode={nextCode} />
          </div>
        </details>
      )}

      <Card>
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Department</th><th>Pay</th>{showPay && <th className="r">Rate</th>}<th>Manager</th><th /></tr>
            </thead>
            <tbody>
              {visible.map(({ e, manager }) => (
                <tr key={e.id} className={e.active ? "" : "opacity-55"}>
                  <td className="text-muted">{e.code}</td>
                  <td>
                    <Link href={`/employees/${e.id}`} className="font-medium hover:text-accent">{e.name}</Link>
                    {e.designation && <div className="text-xs text-muted">{e.designation}</div>}
                  </td>
                  <td>{e.department}</td>
                  <td>{e.payType === "monthly" ? "Monthly" : "Daily"}</td>
                  {showPay && <td className="r num">{rupees(e.rate)}{e.payType === "daily" ? "/day" : "/mo"}</td>}
                  <td className="text-muted">{manager ?? "-"}</td>
                  <td>{!e.active && <Badge>Inactive</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
