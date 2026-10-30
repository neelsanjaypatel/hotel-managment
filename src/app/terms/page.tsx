import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS } from "@/db/defaults";
import { GRACE_DAYS } from "@/lib/subscription";
import { PHOTOS } from "@/lib/photos";
import { display, PublicFooter, PublicHeader } from "@/components/public-chrome";

export const metadata: Metadata = {
  title: "Terms and privacy",
  description: "The rules for using Hotel Desk: trial, payment, what happens after the end date, and how your data is kept.",
};

const SECTIONS: { id: string; title: string; points: string[] }[] = [
  {
    id: "trial",
    title: "1. Free trial",
    points: [
      `A new hotel gets ${TRIAL_DAYS} days free, with every feature. No card or payment is needed to start.`,
      "The person who signs up is the owner login for that hotel and is responsible for the logins they create.",
    ],
  },
  {
    id: "payment",
    title: "2. Plans and payment",
    points: [
      "Plans are monthly. The price and limits (employees, logins) are shown on the pricing page and in Billing.",
      "You pay by UPI or bank transfer as shown in Billing. Your paid period starts from the date the payment is recorded, or continues from your current end date if it has not passed yet.",
      "Payment covers the period recorded for it. For any question about a payment or a refund, contact Hotel Desk support from the Billing page.",
      "If prices change, the new price applies from your next payment, never to a period already paid.",
    ],
  },
  {
    id: "after-end",
    title: "3. After the trial or paid period ends",
    points: [
      `For ${GRACE_DAYS} days after the end date, everything keeps working and a reminder is shown.`,
      "After that the hotel becomes view-only: every login can still open reports and the owner can still export everything, but no new entries can be made until a payment is recorded.",
      "Your data is not deleted because a payment is late.",
      "An account may be suspended for misuse or on the owner's request. A suspended hotel sees only the Billing page.",
    ],
  },
  {
    id: "data",
    title: "4. Your data",
    points: [
      "Everything your hotel enters (sales, expenses, staff, salaries, bookings, partners) belongs to your hotel.",
      "Only logins of your hotel can see your entries. Each hotel's data is kept separate from every other hotel's.",
      "The owner can export all data to Excel at any time, including after the hotel becomes view-only.",
      "Ask us and we will delete your hotel and all its entries. Deleted data cannot be brought back, so export it first.",
    ],
  },
  {
    id: "privacy",
    title: "5. Privacy",
    points: [
      "We keep what the app needs to work: the hotel name and city, login names and mobile numbers, the Google email of an owner who connects Google, and the entries your team makes.",
      "Data is stored on servers in Mumbai, India. Passwords are stored scrambled (hashed) and are never visible to anyone, including us.",
      "The Hotel Desk team's screens show your hotel's name, plan, logins and employee count, for billing and support. We do not open your entries unless you ask us to help with something.",
      "We do not sell or share your data with anyone. We do not show ads inside the app.",
      "The app uses one cookie to keep you logged in. There are no tracking or advertising cookies.",
    ],
  },
  {
    id: "use",
    title: "6. Using Hotel Desk properly",
    points: [
      "Keep passwords private. After 5 wrong passwords a login is locked for 15 minutes.",
      "Every change is kept in the activity log with the login that made it.",
      "Hotel Desk is a record-keeping tool. Your accountant remains responsible for tax filing (GST, income tax) and legal compliance.",
      "Do not use the service for anything unlawful, or try to reach another hotel's data.",
    ],
  },
  {
    id: "changes",
    title: "7. Changes to these rules",
    points: ["If these rules change, the new version is published on this page and shown to owners before it applies."],
  },
];

export default function TermsPage() {
  return (
    <div className={`${display.variable} min-h-dvh`}>
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-16 md:px-8 md:pt-14 md:pb-24">
        <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">Terms and privacy</h1>
        <p className="mt-3 text-muted">The rules for using Hotel Desk, in plain words.</p>

        <nav aria-label="Sections" className="mt-8 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-ink">
              {s.title.replace(/^\d+\.\s*/, "")}
            </a>
          ))}
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="mt-12 scroll-mt-6">
            <h2 className="font-display text-2xl font-bold tracking-tight">{s.title}</h2>
            <ul className="mt-4 space-y-3">
              {s.points.map((p) => (
                <li key={p} className="flex gap-3 text-[0.95rem] leading-relaxed">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-marigold" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section id="photos" className="mt-16 scroll-mt-6 border-t border-line pt-10">
          <h2 className="font-display text-2xl font-bold tracking-tight">Photo credits</h2>
          <p className="mt-2 text-sm text-muted">
            Photos on the welcome and signup pages are from Wikimedia Commons, resized and cropped, and shared under the licence shown.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {Object.values(PHOTOS).map((p) => (
              <li key={p.src} className="[overflow-wrap:anywhere]">
                <a href={p.source} className="text-accent underline underline-offset-2" rel="noopener">{p.title}</a>
                {" by "}{p.artist}
                {", "}
                <a href={p.licenseUrl} className="text-accent underline underline-offset-2" rel="license noopener">{p.license}</a>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-sm text-muted">
          Questions? Owners can reach Hotel Desk support from the <Link href="/billing" className="text-accent">Billing</Link> page.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
