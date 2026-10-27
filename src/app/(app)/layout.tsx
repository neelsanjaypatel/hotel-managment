import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, can } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";
import { NavLinks, type NavItem } from "@/components/nav";
import type { Access } from "@/lib/subscription";

const ROLE_LABEL = {
  superadmin: "Platform owner",
  admin: "Owner / Admin",
  manager: "Manager",
  cashier: "Cashier",
  partner: "Partner",
  viewer: "View only",
  employee: "Employee",
} as const;

function SubscriptionBanner({ access, isAdmin }: { access: Access; isAdmin: boolean }) {
  const { state, daysLeft } = access;
  if ((state === "active" && daysLeft > 7) || (state === "trial" && daysLeft > 5)) return null;
  const msg =
    state === "trial"
      ? `Free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
      : state === "active"
        ? `Subscription renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
        : state === "grace"
          ? "Subscription has ended. Entries will stop in a few days unless it is renewed."
          : state === "expired"
            ? "Subscription has ended. Data is view-only until it is renewed."
            : "This hotel account is suspended.";
  const tone = state === "trial" || state === "active" ? "bg-warn-soft text-warn" : "bg-expense-soft text-expense";
  return (
    <div className={`px-4 py-2 text-sm font-medium print:hidden md:px-8 ${tone}`}>
      {msg}{" "}
      {isAdmin ? (
        <Link href="/billing" className="underline underline-offset-2">
          Go to Billing
        </Link>
      ) : (
        "Please inform the owner."
      )}
    </div>
  );
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  if (!user) redirect("/login");

  const platform = user.role === "superadmin";
  const staff = user.role !== "employee";
  const readable = !!user.access?.canRead;
  const items: NavItem[] = platform
    ? [
        { href: "/platform", label: "Hotels" },
        { href: "/platform/plans", label: "Plans" },
        { href: "/account", label: "My account" },
      ]
    : ([
        readable && can(user, "viewReports") && { href: "/", label: "Dashboard" },
        readable && staff && { href: "/counter", label: "Daily Counter" },
        readable && staff && { href: "/bookings", label: "Bookings" },
        readable && (can(user, "markAttendance") || can(user, "viewEmployees")) && { href: "/attendance", label: "Attendance" },
        readable && can(user, "viewEmployees") && { href: "/employees", label: "Employees" },
        readable && can(user, "viewPayroll") && { href: "/payroll", label: "Payroll" },
        readable && can(user, "viewPayroll") && { href: "/partners", label: "Partners" },
        readable && staff && { href: "/parties", label: "Dues" },
        readable && staff && { href: "/suppliers", label: "Suppliers" },
        readable && can(user, "viewPayroll") && { href: "/summary", label: "Money summary" },
        readable && can(user, "viewReports") && { href: "/reports", label: "Reports" },
        readable && can(user, "viewPayroll") && { href: "/activity", label: "Activity log" },
        readable && can(user, "manageMaster") && { href: "/settings", label: "Settings" },
        can(user, "manageMaster") && { href: "/billing", label: "Billing" },
        readable && user.employeeId && { href: "/me", label: "My Salary" },
        { href: "/account", label: "My account" },
      ].filter(Boolean) as NavItem[]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-surface print:hidden md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:block md:px-5 md:py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-accent">{platform ? "Hotel Desk · Platform" : user.hotel?.name}</div>
            <div className="mt-0.5 text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={logoutAction} className="md:hidden">
            <button className="text-sm text-muted">Log out</button>
          </form>
        </div>
        <NavLinks items={items} />
        <form action={logoutAction} className="hidden px-5 pt-6 md:block">
          <button className="text-sm text-muted hover:text-ink">Log out</button>
        </form>
      </aside>
      <div className="min-w-0">
        {user.access && <SubscriptionBanner access={user.access} isAdmin={user.role === "admin"} />}
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
