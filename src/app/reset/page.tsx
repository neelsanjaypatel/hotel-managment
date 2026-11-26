import Link from "next/link";
import { ActionForm, Input } from "@/components/forms";
import { resetWithToken } from "@/lib/account-actions";
import { display, PublicHeader } from "@/components/public-chrome";
import { getT } from "@/i18n/server";

export const metadata = { title: "Set a new password" };

export default async function ResetPage({ searchParams }: PageProps<"/reset">) {
  const t = await getT();
  const { token } = await searchParams;
  return (
    <div className={`${display.variable} min-h-dvh`}>
      <PublicHeader />
      <main className="mx-auto max-w-sm px-4 py-10">
        <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">{t("Set a new password")}</h1>
        <ActionForm action={resetWithToken} submit={t("Save new password")}>
          <input type="hidden" name="token" value={typeof token === "string" ? token : ""} />
          <div className="space-y-3">
            <Input name="password" label={t("New password (8+ characters)")} type="password" autoComplete="new-password" minLength={8} required />
            <Input name="confirm" label={t("New password again")} type="password" autoComplete="new-password" minLength={8} required />
          </div>
        </ActionForm>
        <p className="mt-6 text-sm"><Link href="/login" className="font-medium text-accent">{t("Back to log in")}</Link></p>
      </main>
    </div>
  );
}
