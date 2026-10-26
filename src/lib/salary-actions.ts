"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireAction } from "./auth";
import { isMonth, prettyMonth, rupees, todayIST } from "./format";
import { monthPayroll } from "./payroll";
import { UserError, amount, audit, checkEntryDate, ok, owned, run, str, type FormState } from "./action-helpers";

function payMode(fd: FormData) {
  const m = z.enum(schema.payModeEnum.enumValues).safeParse(fd.get("paidVia"));
  if (!m.success) throw new UserError("Choose how the salary was paid.");
  return m.data;
}

function salaryMonth(fd: FormData) {
  const month = fd.get("month");
  if (!isMonth(month) || month > todayIST().slice(0, 7)) throw new UserError("Choose a valid month.");
  return month;
}

// Hand over salary to one employee. The money leaves today's counter; it settles `month`.
export async function paySalary(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("manageMaster");
    const month = salaryMonth(fd);
    const employeeId = Number(fd.get("employeeId"));
    const emp = await owned(schema.employees, employeeId, user.hotelId, "employee");
    const date = await checkEntryDate(user, todayIST());
    const db = await getDb();
    const [row] = await db
      .insert(schema.salaryPayments)
      .values({ hotelId: user.hotelId, employeeId, month, date, amount: amount(fd), paidVia: payMode(fd), note: str(fd, "note"), createdBy: user.id })
      .returning();
    await audit(user, "create", "salary", row.id, row);
    revalidatePath("/", "layout");
    return ok(`Paid ${rupees(row.amount)} to ${emp.name} for ${prettyMonth(month)}.`);
  });
}

// Pay every employee's remaining balance for the month in one go.
export async function payAllSalaries(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("manageMaster");
    const month = salaryMonth(fd);
    const paidVia = payMode(fd);
    const date = await checkEntryDate(user, todayIST());
    const db = await getDb();
    const due = (await monthPayroll(user.hotelId, month, {}, db)).filter((r) => r.net > 0);
    if (due.length === 0) throw new UserError("Nobody has a balance left for this month.");
    const rows = due.map((r) => ({
      hotelId: user.hotelId,
      employeeId: r.employee.id,
      month,
      date,
      amount: r.net,
      paidVia,
      note: "Monthly salary",
      createdBy: user.id,
    }));
    await db.transaction(async (tx) => {
      await tx.insert(schema.salaryPayments).values(rows);
    });
    const total = rows.reduce((a, r) => a + r.amount, 0);
    await audit(user, "pay_all_salaries", "salary", month, { count: rows.length, total, paidVia });
    revalidatePath("/", "layout");
    return ok(`Paid ${rupees(total)} to ${rows.length} employees for ${prettyMonth(month)}.`);
  });
}
