import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { rupees } from "@/lib/format";
import { TRIAL_DAYS } from "@/db/defaults";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Start free trial" };

export default async function SignupPage() {
  if (await getUser()) redirect("/");
  const db = await getDb();
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(schema.plans.priceMonthly);
  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-[1fr_420px]">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-accent">Hotel Desk</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Run your hotel&apos;s daily money and staff in one place.</h1>
        <ul className="mt-6 space-y-2 text-sm text-muted">
          <li>Daily counter: cash, UPI, card, Zomato, Swiggy and credit sales</li>
          <li>Expenses by category, cash drawer check every night</li>
          <li>Attendance, advances and payroll for every employee</li>
          <li>Partners see live reports, only you can change data</li>
        </ul>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="num mt-1 text-lg font-semibold">{rupees(p.priceMonthly)}<span className="text-xs font-normal text-muted">/month</span></div>
              <div className="mt-1 text-xs text-muted">
                {p.maxEmployees ? `Up to ${p.maxEmployees} employees` : "Unlimited employees"} · {p.maxUsers ? `${p.maxUsers} logins` : "unlimited logins"}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{TRIAL_DAYS} days free. No card needed. Choose a plan when the trial ends.</p>
      </div>
      <div>
        <h2 className="mb-1 text-xl font-semibold">Start your free trial</h2>
        <p className="mb-4 text-sm text-muted">
          Already registered? <Link href="/login" className="text-accent">Log in</Link>
        </p>
        <SignupForm />
      </div>
    </main>
  );
}
