import { and, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { rupees, todayIST } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { PeriodPicker } from "@/components/forms";
import { SalaryView } from "@/components/salary";

export const metadata = { title: "My Salary" };

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const user = await requirePage();
  if (!user.employeeId) return <Empty>Your login is not linked to an employee record.</Empty>;
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayIST().slice(0, 7);
  const db = await getDb();
  const [e] = await db
    .select()
    .from(schema.employees)
    .where(and(eq(schema.employees.hotelId, user.hotelId), eq(schema.employees.id, user.employeeId)));
  if (!e) return <Empty>Your login is not linked to an employee record.</Empty>;
  return (
    <>
      <PageHeader title="My Salary" sub={e ? `${e.name} · ${e.department} · ${e.payType === "monthly" ? `${rupees(e.rate)}/month` : `${rupees(e.rate)}/day`}` : undefined}>
        <PeriodPicker name="month" type="month" value={month} max={todayIST().slice(0, 7)} />
      </PageHeader>
      <SalaryView hotelId={user.hotelId} employeeId={e.id} month={month} />
    </>
  );
}
