import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { TRIAL_DAYS } from "@/db/defaults";
import { rupees } from "@/lib/format";
import { PHOTOS } from "@/lib/photos";
import { RULES_AT_A_GLANCE } from "@/lib/rules";
import { display, PublicFooter, PublicHeader } from "@/components/public-chrome";

// Same for every visitor: served from cache, plan prices refreshed hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Hotel Desk · run your hotel from your phone" },
  description: `Sales, expenses, staff salary, bookings and daily cash for hotels, restaurants and banquets, in one simple app. ${TRIAL_DAYS} days free.`,
};

const TODAY = [
  ["Sales", "₹84,500"],
  ["Expenses", "₹18,590"],
  ["Cash in drawer", "₹48,250"],
];

const FEATURES = [
  { photo: PHOTOS.counter, title: "Daily counter", body: "Enter each sale and expense in seconds. Cash, UPI, card, Zomato, Swiggy or udhaar.", area: "md:col-span-2" },
  { photo: PHOTOS.kitchen, title: "Staff and salary", body: "Attendance, advances and loans. The salary works itself out.", area: "md:col-span-3" },
  { photo: PHOTOS.banquet, title: "Banquet bookings", body: "Date, hall, advance and balance. No double booking.", area: "md:col-span-3" },
  { photo: PHOTOS.room, title: "Rooms", body: "Check-in to check-out, with the money received.", area: "md:col-span-2" },
];

const STEPS = [
  ["Add your hotel", "Name, city and your mobile number. It takes two minutes."],
  ["Add your staff", "Give each person a mobile login and what they can do."],
  ["Enter today's sales", "From the phone, at the counter. Reports fill in by themselves."],
];

const ROLES = [
  ["Owner", "Everything"],
  ["Partner", "Reports and their share"],
  ["Manager", "Counter, attendance, day close"],
  ["Cashier", "Daily counter"],
  ["Employee", "Own salary and payslip"],
];

const QUESTIONS = [
  ["Do I need a computer?", "No. Hotel Desk works on any phone browser, and you can add it to your home screen like an app. A computer works too."],
  ["Is it hard for my staff?", "Each person sees only their own work. A cashier sees the counter, not salaries or reports."],
  ["What happens after the free trial?", `You get ${TRIAL_DAYS} days with every feature and no card. If you do not pay after that, you can still open and export your data. Nothing is deleted.`],
  ["Is my data safe?", "Your entries are stored in Mumbai and only your hotel's logins can see them. Aadhaar numbers are encrypted and shown masked."],
];

export default async function WelcomePage() {
  const db = await getDb();
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(schema.plans.priceMonthly);

  return (
    <div className={`${display.variable} min-h-dvh`}>
      <main>
        {/* The owner at her own front desk; everything on this page answers "is this for me?" */}
        {/* Phones get the whole photo above the words: stretched behind them it would crop and blur. */}
        <section className="relative isolate flex flex-col bg-[#14110d] text-white md:min-h-[86dvh]">
          <div className="relative aspect-[4/3] md:absolute md:inset-0 md:-z-10 md:aspect-auto">
            <Image src={PHOTOS.hero.src} alt={PHOTOS.hero.alt} fill priority sizes="100vw" className="object-cover object-right md:object-center" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-[#14110d] md:bg-gradient-to-r md:from-black/80 md:via-black/45 md:to-transparent" aria-hidden />
          </div>
          <div className="absolute inset-x-0 top-0 z-10">
            <PublicHeader overPhoto />
          </div>
          <div className="mx-auto w-full max-w-6xl px-4 pb-24 md:my-auto md:px-8 md:pt-20 md:pb-32">
            <h1 className="max-w-2xl font-display text-[2.75rem] leading-[1.02] font-bold tracking-tight text-balance md:text-7xl">
              Run your hotel from your phone.
            </h1>
            <p className="mt-5 max-w-md text-lg text-white/85 md:text-xl">Sales, expenses, staff salary and daily cash. One simple app.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="btn btn-lg">Start {TRIAL_DAYS} days free</Link>
              <Link href="/login" className="btn btn-lg btn-light">Log in</Link>
            </div>
          </div>
        </section>

        {/* What the owner opens every night: three numbers and one that must be zero. */}
        <section aria-label="Example of the daily summary" className="relative z-10 mx-auto -mt-14 max-w-6xl px-4 md:px-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-xl shadow-black/10 md:grid-cols-4">
            {TODAY.map(([k, v]) => (
              <div key={k} className="bg-surface p-4 md:p-6">
                <div className="text-sm text-muted">{k}</div>
                <div className="num mt-1 font-display text-2xl font-bold tracking-tight md:text-3xl">{v}</div>
              </div>
            ))}
            <div className="bg-accent-soft p-4 md:p-6">
              <div className="text-sm font-medium text-accent">Cash difference</div>
              <div className="num mt-1 font-display text-2xl font-bold tracking-tight text-accent md:text-3xl">₹0</div>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted">Example of what you see each day</p>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 md:px-8 md:py-24">
          <h2 className="max-w-xl font-display text-3xl font-bold tracking-tight text-balance md:text-5xl">Everything your hotel does in a day.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-5">
            {FEATURES.map((f) => (
              <article key={f.title} className={`reveal relative isolate flex min-h-80 flex-col justify-end overflow-hidden rounded-2xl p-6 text-white md:min-h-96 ${f.area}`}>
                <Image src={f.photo.src} alt={f.photo.alt} fill sizes="(min-width: 768px) 60vw, 100vw" className="-z-10 object-cover" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/30 to-transparent" aria-hidden />
                <h3 className="font-display text-2xl font-bold tracking-tight">{f.title}</h3>
                <p className="mt-1 max-w-sm text-white/85">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* The moment the product exists for. */}
        <section className="bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 md:grid-cols-2 md:gap-14 md:px-8 md:py-24">
            <div className="reveal relative aspect-[16/10] overflow-hidden rounded-2xl">
              <Image src={PHOTOS.dayClose.src} alt={PHOTOS.dayClose.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-balance md:text-5xl">Know your cash before you sleep.</h2>
              <p className="mt-4 max-w-md text-lg text-muted">Hotel Desk tells you how much cash should be in the drawer. Count it, and any short or extra stays on record.</p>
              <ul className="mt-6 space-y-2">
                {["Who changed what, and when", "Partners see profit live, from their own phone", "Bill photos kept with every expense", "Salary slips and Excel reports in one tap"].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-marigold" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Start today in three steps.</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <div className="num grid size-12 place-items-center rounded-full bg-accent font-display text-xl font-bold text-accent-ink">{i + 1}</div>
                <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
                <p className="mt-1 text-muted">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 border-t border-line pt-8">
            <h3 className="font-semibold">Everyone sees only their own work</h3>
            <dl className="mt-4 flex flex-wrap gap-2">
              {ROLES.map(([role, sees]) => (
                <div key={role} className="rounded-full border border-line px-4 py-2 text-sm">
                  <dt className="inline font-semibold">{role}: </dt>
                  <dd className="inline text-muted">{sees}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Pricing straight from the plans the platform sells. */}
        <section id="pricing" className="scroll-mt-4 border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Simple pricing.</h2>
            <p className="mt-3 text-lg text-muted">{TRIAL_DAYS} days free on any plan. No card needed.</p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((p, i) => (
                <div key={p.id} className={`flex flex-col rounded-2xl border p-6 ${i === 1 ? "border-2 border-accent" : "border-line"}`}>
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-display text-xl font-bold">{p.name}</h3>
                    {i === 1 && <div className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">Recommended</div>}
                  </div>
                  <div className="num mt-4 font-display text-5xl font-bold tracking-tight">
                    {rupees(p.priceMonthly)}
                    <span className="font-sans text-base font-normal text-muted"> / month</span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2 text-muted">
                    <li>{p.maxEmployees ? `Up to ${p.maxEmployees} employees` : "Unlimited employees"}</li>
                    <li>{p.maxUsers ? `${p.maxUsers} logins` : "Unlimited logins"}</li>
                    <li>Every feature included</li>
                  </ul>
                  <Link href="/signup" className={`btn btn-lg mt-6 ${i === 1 ? "" : "btn-ghost"}`}>Start free</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_1.4fr] md:gap-16 md:px-8 md:py-24">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-5xl">Common questions.</h2>
            <p className="mt-3 text-muted">
              Read the full <Link href="/terms" className="font-medium text-accent underline underline-offset-2">terms and privacy</Link>.
            </p>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {QUESTIONS.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-2xl leading-none text-accent group-open:rotate-45 motion-safe:transition-transform" aria-hidden>+</span>
                </summary>
                <p className="mt-2 text-muted">{a}</p>
              </details>
            ))}
            {RULES_AT_A_GLANCE.slice(1, 2).map((r) => (
              <details key={r.title} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  What if a payment is late?
                  <span className="text-2xl leading-none text-accent group-open:rotate-45 motion-safe:transition-transform" aria-hidden>+</span>
                </summary>
                <p className="mt-2 text-muted">{r.body}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-4 pb-16 md:px-8 md:pb-24">
          <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-2xl">
            <Image src={PHOTOS.room.src} alt="" fill sizes="(min-width: 1152px) 1152px, 100vw" className="-z-10 object-cover" />
            <div className="absolute inset-0 -z-10 bg-black/60" aria-hidden />
            <div className="flex flex-col items-start gap-6 px-6 py-14 text-white md:flex-row md:items-center md:justify-between md:px-12 md:py-20">
              <h2 className="max-w-lg font-display text-3xl font-bold tracking-tight text-balance md:text-5xl">Try it free for {TRIAL_DAYS} days.</h2>
              <Link href="/signup" className="btn btn-lg shrink-0">Start free</Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
