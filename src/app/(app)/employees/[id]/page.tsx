import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requirePage, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { rupees, todayIST, isMonth } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";
import { SalaryView } from "@/components/salary";
import { EmployeeForm } from "../employee-form";

export default async function EmployeePage({ params, searchParams }: PageProps<"/employees/[id]">) {
  const user = await requirePage("viewEmployees");
  const id = Number((await params).id);
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : todayIST().slice(0, 7);
  const db = await getDb();
  const [e] = await db
    .select()
    .from(schema.employees)
    .where(and(eq(schema.employees.hotelId, user.hotelId), eq(schema.employees.id, id || 0)));
  if (!e || (user.role === "manager" && e.managerUserId !== user.id)) notFound();
  const managers = (await db.select().from(schema.users).where(and(eq(schema.users.hotelId, user.hotelId), eq(schema.users.role, "manager")))).map((m) => ({ value: m.id, label: m.name }));

  return (
    <>
      <PageHeader
        title={e.name}
        sub={`${e.code} · ${e.department}${e.designation ? ` · ${e.designation}` : ""} · ${e.payType === "monthly" ? `${rupees(e.rate)}/month` : `${rupees(e.rate)}/day`}`}
      >
        <Link href="/employees" className="btn btn-ghost">All employees</Link>
        <PeriodPicker name="month" type="month" value={month} max={todayIST().slice(0, 7)} />
      </PageHeader>
      {can(user, "viewPayroll") ? (
        <SalaryView hotelId={user.hotelId} employeeId={e.id} month={month} />
      ) : (
        <p className="text-sm text-muted">Salary details are visible to admin and partners only.</p>
      )}
      {can(user, "manageMaster") && (
        <Card title="Edit details" className="mt-4">
          <EmployeeForm employee={e} managers={managers} />
        </Card>
      )}
    </>
  );
}
