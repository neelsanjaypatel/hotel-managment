import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, can } from "@/lib/auth";
import { googleConfigured } from "@/lib/google";
import { logoutAction } from "@/lib/actions";
import { NavLinks, type NavItem } from "@/components/nav";
import { InstallApp } from "@/components/install-app";
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
  const DAILY = "Daily work";
  const PEOPLE = "People";
  const MONEY = "Money";
  const ADMIN = "Admin";
  const YOU = "You";
  const items: NavItem[] = platform
    ? [
        { href: "/platform", label: "Hotels", icon: "hotels" },
        { href: "/platform/plans", label: "Plans", icon: "plans" },
        { href: "/account", label: "My account", icon: "account" },
      ]
    : ([
        readable && can(user, "viewReports") && { href: "/", label: "Dashboard", icon: "dashboard", group: DAILY },
        readable && staff && { href: "/counter", label: "Daily Counter", icon: "counter", group: DAILY },
        readable && staff && { href: "/bookings", label: "Bookings", icon: "bookings", group: DAILY },
        readable && (can(user, "markAttendance") || can(user, "viewEmployees")) && { href: "/attendance", label: "Attendance", icon: "attendance", group: DAILY },
        readable && can(user, "viewEmployees") && { href: "/employees", label: "Employees", icon: "employees", group: PEOPLE },
        readable && can(user, "viewPayroll") && { href: "/payroll", label: "Payroll", icon: "payroll", group: PEOPLE },
        readable && can(user, "viewPayroll") && { href: "/partners", label: "Partners", icon: "partners", group: PEOPLE },
        readable && staff && { href: "/parties", label: "Dues", icon: "dues", group: MONEY },
        readable && staff && { href: "/suppliers", label: "Suppliers", icon: "suppliers", group: MONEY },
        readable && can(user, "viewPayroll") && { href: "/summary", label: "Money summary", icon: "summary", group: MONEY },
        readable && can(user, "viewReports") && { href: "/reports", label: "Reports", icon: "reports", group: MONEY },
        readable && can(user, "viewPayroll") && { href: "/activity", label: "Activity log", icon: "activity", group: ADMIN },
        readable && can(user, "manageMaster") && { href: "/settings", label: "Settings", icon: "settings", group: ADMIN },
        can(user, "manageMaster") && { href: "/billing", label: "Billing", icon: "billing", group: ADMIN },
        readable && user.employeeId && { href: "/me", label: "My Salary", icon: "salary", group: YOU },
        { href: "/account", label: "My account", icon: "account", group: YOU },
      ].filter(Boolean) as NavItem[]);
  // Letters only: "Owner (Admin)" is OA, not O(.
  const initials = (user.name.match(/\p{L}+/gu) ?? ["?"]).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="side-scope border-b border-side-line bg-side text-side-ink print:hidden md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-4 md:pt-5 md:pb-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-side-mark text-sm font-bold text-side" aria-hidden>
              {platform ? "HD" : (user.hotel?.name ?? "H").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{platform ? "Hotel Desk · Platform" : user.hotel?.name}</div>
              <div className="truncate text-xs text-side-muted">{ROLE_LABEL[user.role]}</div>
            </div>
          </div>
          <form action={logoutAction} className="md:hidden">
            <button className="text-sm text-side-muted">Log out</button>
          </form>
        </div>
        <NavLinks items={items} />
        <div className="hidden md:mt-auto md:block">
          <InstallApp className="px-4 pt-4" />
          <div className="mt-4 flex items-center gap-3 border-t border-side-line px-4 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-side-active text-xs font-semibold text-side-active-ink" aria-hidden>{initials}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
            <form action={logoutAction}>
              <button className="rounded-md px-2 py-1 text-sm text-side-muted hover:bg-side-hover hover:text-side-ink">Log out</button>
            </form>
          </div>
        </div>
        <InstallApp className="px-4 pb-3 md:hidden" />
      </aside>
      <div className="min-w-0">
        {user.access && <SubscriptionBanner access={user.access} isAdmin={user.role === "admin"} />}
        {user.role === "admin" && !user.hasGoogle && googleConfigured() && (
          <div className="border-b border-line bg-surface px-4 py-2 text-sm print:hidden md:px-8">
            Log in faster and safer: <Link href="/account" className="font-medium text-accent">connect your Google account</Link>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
