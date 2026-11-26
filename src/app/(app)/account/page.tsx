import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { changeMyPassword } from "@/lib/actions";
import { setMyEmail } from "@/lib/account-actions";
import { mailConfigured } from "@/lib/mail";
import { googleConfigured } from "@/lib/google";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, Input } from "@/components/forms";
import { GoogleButton } from "@/components/google-button";
import { getT } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";

export const metadata = { title: "My account" };

const GOOGLE_MESSAGE: Record<string, string> = {
  connected: "Google connected. From now on, log in with Google.",
  failed: "Google did not finish. Please try again.",
  taken: "That Google account is already connected to another login.",
};

// Every login, including staff of a suspended hotel, can change their own password.
// Anyone can connect Google instead; after that the password no longer works.
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const t = await getT();
  const user = await getUser();
  if (!user) redirect("/login");
  const { google, email } = await searchParams;
  const message =
    (typeof google === "string" && GOOGLE_MESSAGE[google] ? t(GOOGLE_MESSAGE[google]) : undefined) ??
    (email === "confirmed" ? t("Email confirmed. You can use it to log in or reset your password.") : email === "expired" ? t("That link has expired. Save your email again for a new one.") : undefined);
  return (
    <>
      <PageHeader title={t("My account")} sub={user.name} />
      {message && <p className="mb-4 max-w-md text-sm font-medium">{message}</p>}
      <Card title="Language / भाषा / ભાષા" className="mb-4 max-w-md">
        <LanguageSwitcher />
      </Card>
      {(user.hasGoogle || googleConfigured()) && (
        <Card title={t("Google login")} className="mb-4 max-w-md">
          {user.hasGoogle ? (
            <p className="text-sm">
              {t("Connected to")}{" "}<span className="font-medium">{user.email}</span>{t(". If you lose this Google account, use Forgot password on the login page.")}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">{t("Connect your Google account to log in without a password. Your password stops working after this.")}</p>
              <GoogleButton href="/auth/google?mode=connect">{t("Connect Google")}</GoogleButton>
            </>
          )}
        </Card>
      )}
      {!user.hasGoogle && (
        <Card title={t("Recovery email")} className="mb-4 max-w-md">
          <p className="mb-3 text-sm text-muted">
            {user.email && user.emailVerified
              ? t("Confirmed. You can log in with it, and reset your password if you forget it.")
              : user.email
                ? t("Not confirmed yet. Open the link in the mail, or save it again for a new link.")
                : t("Add your email so you can reset your password yourself.")}
            {!mailConfigured() && t(" Email sending is not switched on yet.")}
          </p>
          <ActionForm action={setMyEmail} submit={t("Save email")} resetOnOk={false}>
            <Input name="email" label={t("Email")} type="email" autoComplete="email" defaultValue={user.email ?? ""} required />
          </ActionForm>
        </Card>
      )}
      {!user.hasGoogle && (
        <Card title={t("Change password")} className="max-w-md">
          <ActionForm action={changeMyPassword} submit={t("Change password")}>
            <div className="space-y-3">
              <Input name="current" label={t("Current password")} type="password" autoComplete="current-password" required />
              <Input name="password" label={t("New password (8+ characters)")} type="password" autoComplete="new-password" minLength={8} required />
              <Input name="confirm" label={t("New password again")} type="password" autoComplete="new-password" minLength={8} required />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
