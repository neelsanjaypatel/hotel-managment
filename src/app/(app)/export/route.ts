import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";
import { getUser, can } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { todayIST } from "@/lib/format";

// Paise to rupees for the spreadsheet; other values go through unchanged.
const money = (v: unknown) => (typeof v === "number" ? v / 100 : v);
type Col<T> = [header: string, value: (row: T) => unknown, isMoney?: boolean];

// Streamed row by row: a finished file held in memory would fail on a big hotel, since a Vercel
// Function can return at most 4.5 MB in one piece.
async function addSheet<T>(wb: ExcelJS.stream.xlsx.WorkbookWriter, name: string, rows: T[], cols: Col<T>[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = cols.map(([header, , isMoney]) => ({ header, width: isMoney ? 14 : 22, style: isMoney ? { numFmt: "#,##0.00" } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).commit();
  let n = 0;
  for (const r of rows) {
    ws.addRow(cols.map(([, get, isMoney]) => (isMoney ? money(get(r)) : get(r) ?? ""))).commit();
    // Lets the finished part leave for the browser instead of piling up here.
    if (++n % 2000 === 0) await new Promise(setImmediate);
  }
  ws.commit();
}

// Everything entered for the hotel, one sheet per kind of record. Owner only.
export async function GET() {
  const user = await getUser();
  if (!user?.hotelId || !user.access?.canRead || !can(user, "manageMaster")) return new Response("Forbidden", { status: 403 });
  const h = user.hotelId;
  const db = await getDb();
  const s = schema;
  const [emps, parties, cats, suppliers, partners, users] = await Promise.all([
    db.select().from(s.employees).where(eq(s.employees.hotelId, h)).orderBy(asc(s.employees.code)),
    db.select().from(s.parties).where(eq(s.parties.hotelId, h)),
    db.select().from(s.expenseCategories).where(eq(s.expenseCategories.hotelId, h)),
    db.select().from(s.suppliers).where(eq(s.suppliers.hotelId, h)),
    db.select().from(s.partners).where(eq(s.partners.hotelId, h)),
    db.select({ id: s.users.id, name: s.users.name, login: s.users.login, role: s.users.role, active: s.users.active }).from(s.users).where(eq(s.users.hotelId, h)),
  ]);
  const name = <R extends { id: number; name: string }>(list: R[]) => {
    const m = new Map(list.map((x) => [x.id, x.name]));
    return (id: number | null | undefined) => (id ? m.get(id) ?? id : "");
  };
  const emp = name(emps), party = name(parties), cat = name(cats), sup = name(suppliers), partner = name(partners), who = name(users);

  const [sales, expenses, advances, receipts, salary, supPay, drawings, transfers, attendance, days, bookings, rates, adjustments] = await Promise.all([
    db.select().from(s.sales).where(eq(s.sales.hotelId, h)).orderBy(asc(s.sales.date), asc(s.sales.id)),
    db.select().from(s.expenses).where(eq(s.expenses.hotelId, h)).orderBy(asc(s.expenses.date), asc(s.expenses.id)),
    db.select().from(s.advances).where(eq(s.advances.hotelId, h)).orderBy(asc(s.advances.date)),
    db.select().from(s.receipts).where(eq(s.receipts.hotelId, h)).orderBy(asc(s.receipts.date)),
    db.select().from(s.salaryPayments).where(eq(s.salaryPayments.hotelId, h)).orderBy(asc(s.salaryPayments.date)),
    db.select().from(s.supplierPayments).where(eq(s.supplierPayments.hotelId, h)).orderBy(asc(s.supplierPayments.date)),
    db.select().from(s.partnerDrawings).where(eq(s.partnerDrawings.hotelId, h)).orderBy(asc(s.partnerDrawings.date)),
    db.select().from(s.cashTransfers).where(eq(s.cashTransfers.hotelId, h)).orderBy(asc(s.cashTransfers.date)),
    db.select().from(s.attendance).where(eq(s.attendance.hotelId, h)).orderBy(asc(s.attendance.date)),
    db.select().from(s.dayBooks).where(eq(s.dayBooks.hotelId, h)).orderBy(asc(s.dayBooks.date)),
    db.select().from(s.bookings).where(eq(s.bookings.hotelId, h)).orderBy(asc(s.bookings.date)),
    db.select().from(s.employeeRates).where(eq(s.employeeRates.hotelId, h)).orderBy(asc(s.employeeRates.fromDate)),
    db.select().from(s.salaryAdjustments).where(eq(s.salaryAdjustments.hotelId, h)).orderBy(asc(s.salaryAdjustments.month)),
  ]);

  const output = new PassThrough();
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true });
  wb.creator = "Hotel Desk";
  const write = async () => {
  await addSheet(wb, "Sales", sales, [["Date", (r) => r.date], ["Section", (r) => r.unit], ["Mode", (r) => r.mode], ["Amount", (r) => r.amount, true], ["Party", (r) => party(r.partyId)], ["Note", (r) => r.reference], ["Booking", (r) => r.bookingId], ["By", (r) => who(r.createdBy)]]);
  await addSheet(wb, "Expenses", expenses, [["Date", (r) => r.date], ["Category", (r) => cat(r.categoryId)], ["Amount", (r) => r.amount, true], ["Paid by", (r) => r.paidVia], ["Supplier", (r) => sup(r.supplierId)], ["Worker", (r) => emp(r.employeeId)], ["Vendor", (r) => r.vendor], ["Note", (r) => r.note], ["By", (r) => who(r.createdBy)]]);
  await addSheet(wb, "Payments received", receipts, [["Date", (r) => r.date], ["From", (r) => party(r.partyId)], ["Mode", (r) => r.mode], ["Amount", (r) => r.amount, true], ["Commission", (r) => r.commission, true], ["Note", (r) => r.note], ["By", (r) => who(r.createdBy)]]);
  await addSheet(wb, "Advances & loans", advances, [["Date", (r) => r.date], ["Employee", (r) => emp(r.employeeId)], ["Amount", (r) => r.amount, true], ["Monthly installment", (r) => r.installment, true], ["Paid by", (r) => r.paidVia], ["Note", (r) => r.note]]);
  await addSheet(wb, "Salary paid", salary, [["Date", (r) => r.date], ["For month", (r) => r.month], ["Employee", (r) => emp(r.employeeId)], ["Amount", (r) => r.amount, true], ["Paid by", (r) => r.paidVia], ["Note", (r) => r.note]]);
  await addSheet(wb, "Bonus, allowance, deduction", adjustments, [["Month", (r) => r.month], ["Employee", (r) => emp(r.employeeId)], ["Type", (r) => r.kind], ["Amount", (r) => r.amount, true], ["Reason", (r) => r.note], ["By", (r) => who(r.createdBy)]]);
  await addSheet(wb, "Supplier payments", supPay, [["Date", (r) => r.date], ["Supplier", (r) => sup(r.supplierId)], ["Amount", (r) => r.amount, true], ["Paid by", (r) => r.paidVia], ["Note", (r) => r.note]]);
  await addSheet(wb, "Partner withdrawals", drawings, [["Date", (r) => r.date], ["Partner", (r) => partner(r.partnerId)], ["Amount", (r) => r.amount, true], ["Paid by", (r) => r.paidVia], ["Note", (r) => r.note]]);
  await addSheet(wb, "Cash-bank transfers", transfers, [["Date", (r) => r.date], ["Direction", (r) => (r.direction === "to_bank" ? "Cash to bank" : "Bank to cash")], ["Amount", (r) => r.amount, true], ["Note", (r) => r.note]]);
  await addSheet(wb, "Day close", days, [["Date", (r) => r.date], ["Status", (r) => r.status], ["Opening cash", (r) => r.openingCash, true], ["Deposited", (r) => r.cashDeposit, true], ["Counted", (r) => r.countedCash, true], ["Closed by", (r) => who(r.closedBy)], ["Note", (r) => r.note]]);
  await addSheet(wb, "Attendance", attendance, [["Date", (r) => r.date], ["Employee", (r) => emp(r.employeeId)], ["Status", (r) => r.status], ["OT hours", (r) => r.otHours]]);
  await addSheet(wb, "Employees", emps, [["Code", (r) => r.code], ["Name", (r) => r.name], ["Phone", (r) => r.phone], ["Department", (r) => r.department], ["Designation", (r) => r.designation], ["Pay type", (r) => r.payType], ["Current rate", (r) => r.rate, true], ["Joined", (r) => r.joinDate], ["Working", (r) => (r.active ? "Yes" : "No")]]);
  await addSheet(wb, "Salary history", rates, [["Employee", (r) => emp(r.employeeId)], ["From", (r) => r.fromDate], ["Rate", (r) => r.rate, true]]);
  await addSheet(wb, "Bookings", bookings, [["Number", (r) => `BK-${String(r.number).padStart(4, "0")}`], ["Customer", (r) => party(r.partyId)], ["For", (r) => r.unit], ["Occasion", (r) => r.title], ["Date", (r) => r.date], ["Until", (r) => r.endDate], ["Slot", (r) => r.slot], ["Venue", (r) => r.venue], ["Guests", (r) => r.guests], ["Total", (r) => r.totalAmount, true], ["Status", (r) => r.status]]);
  await addSheet(wb, "Parties", parties, [["Name", (r) => r.name], ["Type", (r) => r.kind], ["Phone", (r) => r.phone]]);
  await addSheet(wb, "Suppliers", suppliers, [["Name", (r) => r.name], ["Phone", (r) => r.phone], ["Supplies", (r) => r.note], ["Active", (r) => (r.active ? "Yes" : "No")]]);
  await addSheet(wb, "Partners", partners, [["Name", (r) => r.name], ["Phone", (r) => r.phone], ["Share %", (r) => r.shareBp / 100], ["Active", (r) => (r.active ? "Yes" : "No")]]);
  await addSheet(wb, "Logins", users, [["Name", (r) => r.name], ["Login", (r) => r.login], ["Role", (r) => r.role], ["Active", (r) => (r.active ? "Yes" : "No")]]);

  await wb.commit();
  };
  write().catch((e) => {
    console.error(e);
    output.destroy(e);
  });
  const file = `${user.hotel!.name.replace(/[^\w]+/g, "-")}-${todayIST()}.xlsx`;
  return new Response(Readable.toWeb(output) as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
