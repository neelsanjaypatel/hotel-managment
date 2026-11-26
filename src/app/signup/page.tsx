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
import { cookies } from "next/headers";
import { GoogleButton } from "@/components/google-button";
import { googleConfigured, openIdentity, SIGNUP_COOKIE } from "@/lib/google";
import { SignupForm } from "./signup-form";
import { getT } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";

export const metadata = { title: "Start free trial" };

export default async function SignupPage() {
  const t = await getT();
  if (await getUser()) redirect("/");
  const google = openIdentity((await cookies()).get(SIGNUP_COOKIE)?.value);
  const db = await getDb();
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(schema.plans.priceMonthly);
  return (
    <div className={`${display.variable} min-h-dvh md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]`}>
      {/* Welcome panel: the flowers at a hotel entrance, the plans on top of them. */}
      <aside className="relative isolate flex min-h-64 flex-col justify-between overflow-hidden p-6 text-white md:sticky md:top-0 md:h-dvh md:p-10">
        <Image src={PHOTOS.room.src} alt={PHOTOS.room.alt} fill priority sizes="(min-width: 768px) 45vw, 100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/45 to-black/80" aria-hidden />
        <Link href="/welcome" className="flex items-center gap-2 font-display text-lg font-bold">
          <Mark />
          {t("Hotel Desk")}
        </Link>
        <div className="mt-10">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance md:text-5xl">{t("Welcome. Let's set up your hotel.")}</h1>
          <p className="mt-3 max-w-sm text-white/80">
            {t("{n} days free with every feature. No card needed. Choose a plan when the trial ends.", { n: TRIAL_DAYS })}
          </p>
          <dl className="mt-8 hidden max-w-sm divide-y divide-white/15 border-y border-white/15 md:block">
            {plans.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-4 py-3">
                <dt>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-white/70">
                    {p.maxEmployees ? t("Up to {n} employees", { n: p.maxEmployees }) : t("Unlimited employees")} · {p.maxUsers ? t("{n} logins", { n: p.maxUsers }) : t("unlimited logins")}
                  </div>
                </dt>
                <dd className="num font-display text-xl font-bold">
                  {rupees(p.priceMonthly)}
                  <span className="font-sans text-xs font-normal text-white/70">{t("/mo")}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-xl px-4 py-8 md:px-10 md:py-14">
        <LanguageSwitcher className="mb-8 max-w-sm" />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">{t("Start your free trial")}</h2>
          <Link href="/login" className="text-sm text-muted hover:text-ink">
            {t("Have a login?")}{" "}<span className="font-medium text-accent">{t("Log in")}</span>
          </Link>
        </div>
        <p className="mt-1 mb-6 text-sm text-muted">{t("You become the owner login. Add managers, cashiers and partners after this.")}</p>
        {googleConfigured() && !google && (
          <div className="mb-4">
            <GoogleButton href="/auth/google?mode=signup">{t("Continue with Google")}</GoogleButton>
          </div>
        )}
        <SignupForm googleEmail={google?.email} />

        <section id="rules" className="mt-10 scroll-mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("The rules, in short")}</h3>
          <ol className="mt-4 space-y-4">
            {RULES_AT_A_GLANCE.map((r, i) => (
              <li key={r.title} className="flex gap-4">
                <span className="num font-mono text-sm font-medium text-accent">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="text-sm font-semibold">{"titleKey" in r ? t(r.titleKey, { n: r.n }) : t(r.title)}</div>
                  <p className="text-sm text-muted">{t(r.body)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted">
            {t("Full text:")}{" "}<Link href="/terms" className="font-medium text-accent underline underline-offset-2">{t("Terms and privacy")}</Link>
          </p>
        </section>

        {/* On phones the plans sit here, since the photo panel is short. */}
        <section className="mt-10 md:hidden">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("Plans after the trial")}</h3>
          <dl className="mt-3 divide-y divide-line border-y border-line">
            {plans.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-4 py-3">
                <dt>
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-muted">
                    {p.maxEmployees ? t("Up to {n} employees", { n: p.maxEmployees }) : t("Unlimited employees")} · {p.maxUsers ? t("{n} logins", { n: p.maxUsers }) : t("unlimited logins")}
                  </div>
                </dt>
                <dd className="num font-display text-lg font-bold">
                  {rupees(p.priceMonthly)}
                  <span className="font-sans text-xs font-normal text-muted">{t("/mo")}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}
