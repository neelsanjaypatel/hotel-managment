import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { rupees } from "@/lib/format";
import { TRIAL_DAYS } from "@/db/defaults";
import { PHOTOS } from "@/lib/photos";
import { RULES_AT_A_GLANCE } from "@/lib/rules";
import { display, Mark } from "@/components/public-chrome";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Start free trial" };

export default async function SignupPage() {
  if (await getUser()) redirect("/");
  const db = await getDb();
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(schema.plans.priceMonthly);
  return (
    <div className={`${display.variable} min-h-dvh md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]`}>
      {/* Welcome panel: the flowers at a hotel entrance, the plans on top of them. */}
      <aside className="relative isolate flex min-h-64 flex-col justify-between overflow-hidden p-6 text-white md:sticky md:top-0 md:h-dvh md:p-10">
        <Image src={PHOTOS.welcome.src} alt={PHOTOS.welcome.alt} fill priority sizes="(min-width: 768px) 45vw, 100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/45 to-black/80" aria-hidden />
        <Link href="/welcome" className="flex items-center gap-2 font-display text-lg font-bold">
          <Mark />
          Hotel Desk
        </Link>
        <div className="mt-10">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance md:text-5xl">Welcome. Let&apos;s set up your hotel.</h1>
          <p className="mt-3 max-w-sm text-white/80">
            {TRIAL_DAYS} days free with every feature. No card needed. Choose a plan when the trial ends.
          </p>
          <dl className="mt-8 hidden max-w-sm divide-y divide-white/15 border-y border-white/15 md:block">
            {plans.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-4 py-3">
                <dt>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-white/70">
                    {p.maxEmployees ? `Up to ${p.maxEmployees} employees` : "Unlimited employees"} · {p.maxUsers ? `${p.maxUsers} logins` : "unlimited logins"}
                  </div>
                </dt>
                <dd className="num font-display text-xl font-bold">
                  {rupees(p.priceMonthly)}
                  <span className="font-sans text-xs font-normal text-white/70">/mo</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-xl px-4 py-8 md:px-10 md:py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">Start your free trial</h2>
          <Link href="/login" className="text-sm text-muted hover:text-ink">
            Have a login? <span className="font-medium text-accent">Log in</span>
          </Link>
        </div>
        <p className="mt-1 mb-6 text-sm text-muted">You become the owner login. Add managers, cashiers and partners after this.</p>
        <SignupForm />

        <section id="rules" className="mt-10 scroll-mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">The rules, in short</h3>
          <ol className="mt-4 space-y-4">
            {RULES_AT_A_GLANCE.map((r, i) => (
              <li key={r.title} className="flex gap-4">
                <span className="num font-mono text-sm font-medium text-accent">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="text-sm font-semibold">{r.title}</div>
                  <p className="text-sm text-muted">{r.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted">
            Full text: <Link href="/terms" className="font-medium text-accent underline underline-offset-2">Terms and privacy</Link>
          </p>
        </section>

        {/* On phones the plans sit here, since the photo panel is short. */}
        <section className="mt-10 md:hidden">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Plans after the trial</h3>
          <dl className="mt-3 divide-y divide-line border-y border-line">
            {plans.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-4 py-3">
                <dt>
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-muted">
                    {p.maxEmployees ? `Up to ${p.maxEmployees} employees` : "Unlimited employees"} · {p.maxUsers ? `${p.maxUsers} logins` : "unlimited logins"}
                  </div>
                </dt>
                <dd className="num font-display text-lg font-bold">
                  {rupees(p.priceMonthly)}
                  <span className="font-sans text-xs font-normal text-muted">/mo</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}
