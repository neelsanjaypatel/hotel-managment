import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { TRIAL_DAYS } from "@/db/defaults";
import { rupees } from "@/lib/format";
import { PHOTOS, type Photo } from "@/lib/photos";
import { RULES_AT_A_GLANCE } from "@/lib/rules";
import { display, PublicFooter, PublicHeader } from "@/components/public-chrome";

// Same for every visitor: served from cache, plan prices refreshed hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Hotel Desk · daily money and staff for Indian hotels" },
  description: `Counter, expenses, day close, attendance, payroll and partner reports for hotels, restaurants and banquets. ${TRIAL_DAYS} days free.`,
};

function Photo({ photo, sizes, className = "", priority = false }: { photo: Photo; sizes: string; className?: string; priority?: boolean }) {
  return (
    <Image
      src={photo.src}
      width={photo.w}
      height={photo.h}
      alt={photo.alt}
      sizes={sizes}
      priority={priority}
      className={`h-full w-full rounded-xl object-cover outline outline-1 -outline-offset-1 outline-black/10 ${className}`}
    />
  );
}

// The hour stamp that opens each chapter of the day.
function Hour({ time, label }: { time: string; label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="num font-mono text-sm font-medium text-accent">{time}</span>
      <span className="h-px w-8 translate-y-[-3px] bg-marigold" aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</span>
    </div>
  );
}

const PAY_MODES = ["Cash", "UPI", "Card", "Zomato", "Swiggy", "Credit (udhaar)"];

const ROLES = [
  { role: "Owner", sees: "Everything. Adds staff, sets salaries, closes the day, manages billing." },
  { role: "Manager", sees: "Counter, day close, bookings, dues and staff attendance." },
  { role: "Cashier", sees: "Counter entries, bookings and dues." },
  { role: "Partner", sees: "Live reports and their share. View only, cannot change entries." },
  { role: "Employee", sees: "Only their own salary and payslips." },
];

export default async function WelcomePage() {
  const db = await getDb();
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(schema.plans.priceMonthly);

  return (
    <div className={`${display.variable} min-h-dvh`}>
      <PublicHeader />

      <main>
        {/* Hero: the promise, then the dining room the owner recognises as their own. */}
        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pt-6 pb-16 md:grid-cols-[1.05fr_1fr] md:gap-12 md:px-8 md:pt-12 md:pb-24">
          <div>
            <h1 className="font-display text-[2.4rem] leading-[1.05] font-bold tracking-tight text-balance md:text-6xl">
              Every hotel day, closed with the cash matching.
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              Counter, expenses, staff and partners in one app your cashier, manager and partners can all open on their phones.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn px-6 py-3 text-base">Start {TRIAL_DAYS}-day free trial</Link>
              <Link href="#day" className="btn btn-ghost px-6 py-3 text-base">See a day in Hotel Desk</Link>
            </div>
          </div>
          <div className="aspect-[4/3] md:aspect-[5/4]">
            <Photo photo={PHOTOS.diningRoom} sizes="(min-width: 768px) 50vw, 100vw" priority />
          </div>
        </section>

        {/* A day in the hotel: 7 AM to 11:45 PM. */}
        <section id="day" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <h2 className="font-display max-w-xl text-3xl font-bold tracking-tight md:text-4xl">One day at your hotel, the way Hotel Desk sees it.</h2>

            {/* 7:00 AM: kitchen opens, staff arrive. */}
            <div className="mt-14 grid items-center gap-8 md:grid-cols-2 md:gap-14">
              <div className="reveal aspect-[4/3]">
                <Photo photo={PHOTOS.kitchen} sizes="(min-width: 768px) 50vw, 100vw" />
              </div>
              <div>
                <Hour time="7:00 AM" label="Kitchen opens" />
                <h3 className="font-display mt-3 text-2xl font-bold tracking-tight md:text-3xl">Attendance before the first dosa.</h3>
                <p className="mt-3 text-muted">
                  Managers mark who came in. Advances, staff loans, bonus and deductions stay against each person, so the month-end salary is already worked out.
                </p>
              </div>
            </div>

            {/* 1:30 PM: lunch rush at the counter. */}
            <div className="mt-20 grid gap-8 md:grid-cols-[1fr_320px] md:items-end md:gap-14">
              <div>
                <Hour time="1:30 PM" label="Lunch rush" />
                <h3 className="font-display mt-3 text-2xl font-bold tracking-tight md:text-3xl">Every rupee, by how it was paid.</h3>
                <p className="mt-3 max-w-lg text-muted">
                  The cashier enters each sale under its payment mode. Zomato and Swiggy sales wait in their dues until they pay out, with the commission they keep counted as an expense. Credit sales stay on the customer&apos;s name until paid.
                </p>
                <ul className="mt-6 flex flex-wrap gap-2" aria-label="Payment modes">
                  {PAY_MODES.map((m) => (
                    <li key={m} className="rounded-full border border-line bg-bg px-4 py-1.5 text-sm font-medium">{m}</li>
                  ))}
                </ul>
              </div>
              <div className="reveal aspect-square">
                <Photo photo={PHOTOS.thali} sizes="(min-width: 768px) 320px, 100vw" />
              </div>
            </div>

            {/* 4:00 PM: rooms and banquet bookings. */}
            <div className="mt-20">
              <Hour time="4:00 PM" label="Rooms and banquet" />
              <h3 className="font-display mt-3 max-w-xl text-2xl font-bold tracking-tight md:text-3xl">Bookings with the advance already counted.</h3>
              <div className="mt-8 grid gap-4 sm:grid-cols-[1.4fr_1fr]">
                <figure>
                  <div className="reveal aspect-[16/10]"><Photo photo={PHOTOS.banquet} sizes="(min-width: 640px) 58vw, 100vw" /></div>
                  <figcaption className="mt-2 text-sm text-muted">Banquet and party bookings: date, advance taken, balance due.</figcaption>
                </figure>
                <figure>
                  <div className="reveal aspect-[16/10] sm:aspect-auto sm:h-[calc(100%-1.75rem)]"><Photo photo={PHOTOS.room} sizes="(min-width: 640px) 40vw, 100vw" /></div>
                  <figcaption className="mt-2 text-sm text-muted">Room bookings from check-in to check-out.</figcaption>
                </figure>
              </div>
            </div>
          </div>
        </section>

        {/* 11:45 PM: the day close. The one moment the whole product exists for. */}
        <section className="relative isolate overflow-hidden">
          <Image src={PHOTOS.cashCounter.src} alt={PHOTOS.cashCounter.alt} fill sizes="100vw" className="-z-10 object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/80 via-black/60 to-black/30" aria-hidden />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-[1fr_380px] md:px-8 md:py-28">
            <div className="text-white">
              <div className="flex items-baseline gap-3">
                <span className="num font-mono text-sm font-medium text-marigold">11:45 PM</span>
                <span className="h-px w-8 translate-y-[-3px] bg-marigold" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-widest text-white/70">Day close</span>
              </div>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-balance md:text-5xl">Count the drawer. See the difference. Sleep.</h2>
              <p className="mt-4 max-w-md text-white/80">
                Hotel Desk works out how much cash should be in the drawer. The manager counts it, and any short or extra amount stays on record for that day.
              </p>
            </div>

            {/* Day-close slip, styled like a ruled ledger page. */}
            <div className="rounded-xl bg-surface p-6 text-ink shadow-2xl shadow-black/40">
              <div className="flex items-baseline justify-between">
                <div className="font-display text-lg font-bold">Day close</div>
                <div className="text-xs font-medium uppercase tracking-widest text-muted">Example</div>
              </div>
              <dl className="num mt-4 divide-y divide-line border-y border-line text-sm">
                {[
                  ["Opening cash", "₹5,000"],
                  ["Cash sales", "₹61,840"],
                  ["Cash expenses", "− ₹18,590"],
                  ["Expected in drawer", "₹48,250"],
                  ["Counted", "₹48,250"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-accent-soft px-4 py-3">
                <span className="text-sm font-semibold text-accent">Difference</span>
                <span className="num font-display text-2xl font-bold text-accent">₹0</span>
              </div>
            </div>
          </div>
        </section>

        {/* Month end and the people around the owner. */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
          <div className="grid gap-12 md:grid-cols-[1fr_1.3fr] md:gap-16">
            <div>
              <Hour time="1st of month" label="Month end" />
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight md:text-4xl">Salaries, partners and profit, without a calculator.</h2>
              <ul className="mt-6 space-y-3 text-muted">
                <li><b className="text-ink">Payroll</b> from attendance, minus advances, plus bonus and allowances. Payslips for every employee.</li>
                <li><b className="text-ink">Partners</b> see profit after salaries and their % share, with every withdrawal recorded.</li>
                <li><b className="text-ink">Suppliers and dues</b>: who you owe, who owes you, and since when.</li>
                <li><b className="text-ink">Reports</b> by day, month and category, plus an Excel export of everything.</li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">Who sees what</h3>
              <dl className="mt-4 border-t border-line">
                {ROLES.map((r) => (
                  <div key={r.role} className="grid gap-1 border-b border-line py-4 sm:grid-cols-[120px_1fr] sm:gap-6">
                    <dt className="font-display font-bold">{r.role}</dt>
                    <dd className="text-sm text-muted">{r.sees}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-muted">Every change is kept in the activity log, with who made it and when.</p>
            </div>
          </div>
        </section>

        {/* Pricing straight from the plans the platform sells. */}
        <section id="pricing" className="scroll-mt-4 border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Simple monthly plans.</h2>
            <p className="mt-3 text-muted">{TRIAL_DAYS} days free on any plan. No card needed to start.</p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((p, i) => (
                <div key={p.id} className={`flex flex-col rounded-xl border p-6 ${i === 1 ? "border-accent" : "border-line"}`}>
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-xl font-bold">{p.name}</div>
                    {i === 1 && <div className="text-xs font-semibold uppercase tracking-widest text-accent">Recommended</div>}
                  </div>
                  <div className="num mt-4 font-display text-4xl font-bold tracking-tight">
                    {rupees(p.priceMonthly)}
                    <span className="font-sans text-sm font-normal text-muted"> / month</span>
                  </div>
                  <ul className="mt-4 space-y-1.5 text-sm text-muted">
                    <li>{p.maxEmployees ? `Up to ${p.maxEmployees} employees` : "Unlimited employees"}</li>
                    <li>{p.maxUsers ? `${p.maxUsers} logins` : "Unlimited logins"}</li>
                    <li>Every feature included</li>
                  </ul>
                  <Link href="/signup" className={`btn mt-6 ${i === 1 ? "" : "btn-ghost"}`}>Start free trial</Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The rules in short, so nobody is surprised at the end of the trial. */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr] md:gap-16">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">The rules, in plain words.</h2>
              <p className="mt-3 text-muted">
                Read the full <Link href="/terms" className="font-medium text-accent underline underline-offset-2">terms and privacy</Link>.
              </p>
            </div>
            <ol className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {RULES_AT_A_GLANCE.map((r, i) => (
                <li key={r.title} className="flex gap-4">
                  <span className="num font-mono text-sm font-medium text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="font-semibold">{r.title}</div>
                    <p className="mt-1 text-sm text-muted">{r.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing call to action over the welcome flowers. */}
        <section className="px-4 pb-16 md:px-8 md:pb-24">
          <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-xl">
            <Image src={PHOTOS.welcome.src} alt="" fill sizes="(min-width: 1152px) 1152px, 100vw" className="-z-10 object-cover" />
            <div className="absolute inset-0 -z-10 bg-black/55" aria-hidden />
            <div className="flex flex-col items-start gap-6 px-6 py-14 text-white md:flex-row md:items-center md:justify-between md:px-12">
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Close tonight&apos;s day in Hotel Desk.</h2>
                <p className="mt-2 text-white/80">Add your hotel, your staff and your first sale. Partners can watch from day one.</p>
              </div>
              <Link href="/signup" className="btn shrink-0 px-6 py-3 text-base">Start {TRIAL_DAYS}-day free trial</Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
