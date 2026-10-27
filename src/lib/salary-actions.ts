"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireAction } from "./auth";
import { isMonth, prettyMonth, rupees, todayIST, PAID_MODES } from "./format";
import { monthPayroll } from "./payroll";
import { UserError, amount, audit, checkEntryDate, ok, owned, run, str, type FormState } from "./action-helpers";

function payMode(fd: FormData) {
  const m = z.enum(PAID_MODES).safeParse(fd.get("paidVia"));
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

const KIND_LABEL = { bonus: "Bonus", allowance: "Allowance", deduction: "Deduction" } as const;

// Bonus / allowance (added to pay) or deduction (taken off pay) for one employee and month.
// It changes what is owed, not money in the drawer: the money moves when salary is paid.
export async function addAdjustment(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("manageMaster");
    const month = salaryMonth(fd);
    const employeeId = Number(fd.get("employeeId"));
    const emp = await owned(schema.employees, employeeId, user.hotelId, "employee");
    const kind = z.enum(["bonus", "allowance", "deduction"]).safeParse(fd.get("kind"));
    if (!kind.success) throw new UserError("Choose bonus, allowance or deduction.");
    const note = str(fd, "note");
    if (!note) throw new UserError("Write the reason (it is shown on the payslip).");
    const db = await getDb();
    const [row] = await db
      .insert(schema.salaryAdjustments)
      .values({ hotelId: user.hotelId, employeeId, month, kind: kind.data, amount: amount(fd), note, createdBy: user.id })
      .returning();
    await audit(user, "create", "adjustment", row.id, row);
    revalidatePath("/", "layout");
    return ok(`${KIND_LABEL[kind.data]} of ${rupees(row.amount)} added for ${emp.name}.`);
  });
}

export async function deleteAdjustment(id: number): Promise<FormState> {
  return run(async () => {
    const user = await requireAction("manageMaster");
    if (!Number.isInteger(id)) throw new UserError("Entry not found.");
    const row = await owned(schema.salaryAdjustments, id, user.hotelId, "entry");
    const db = await getDb();
    await db.delete(schema.salaryAdjustments).where(and(eq(schema.salaryAdjustments.id, id), eq(schema.salaryAdjustments.hotelId, user.hotelId)));
    await audit(user, "delete", "adjustment", id, row);
    revalidatePath("/", "layout");
    return ok("Removed.");
  });
}
