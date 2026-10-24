import { getUser, can } from "@/lib/auth";
import { dayRows } from "@/lib/ledger";
import { monthBounds, todayIST } from "@/lib/format";

const r = (p: number) => (p / 100).toFixed(2);

export async function GET(req: Request) {
  const user = await getUser();
  if (!user?.hotelId || !user.access?.canRead || !can(user, "viewReports")) return new Response("Forbidden", { status: 403 });
  const param = new URL(req.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(param) ? param : todayIST().slice(0, 7);
  const { from, to } = monthBounds(month);
  const rows = await dayRows(user.hotelId, from, to);
  const lines = [
    "Date,Income,Cash,Bank/UPI/Card,Zomato/Swiggy/Credit,Expense,Net,Advances,Payments received,Cash difference,Day status",
    ...rows.map((x) =>
      [x.date, r(x.income), r(x.cash), r(x.bank), r(x.credit), r(x.expense), r(x.income - x.expense), r(x.advances), r(x.receipts), x.diff == null ? "" : r(x.diff), x.status ?? ""].join(","),
    ),
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hotel-report-${month}.csv"`,
    },
  });
}
