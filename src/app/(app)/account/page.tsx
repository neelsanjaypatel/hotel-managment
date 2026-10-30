import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { changeMyPassword } from "@/lib/actions";
import { googleConfigured } from "@/lib/google";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, Input } from "@/components/forms";
import { GoogleButton } from "@/components/google-button";

export const metadata = { title: "My account" };

const GOOGLE_MESSAGE: Record<string, string> = {
  connected: "Google connected. From now on, log in with Google.",
  failed: "Google did not finish. Please try again.",
  taken: "That Google account is already connected to another login.",
  owners: "Only owner logins can use Google.",
};

// Every login, including staff of a suspended hotel, can change their own password.
// Owners can connect Google instead; after that the password no longer works.
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { google } = await searchParams;
  const message = typeof google === "string" ? GOOGLE_MESSAGE[google] : undefined;
  const owner = user.role === "admin" || user.role === "superadmin";
  return (
    <>
      <PageHeader title="My account" sub={user.name} />
      {message && <p className="mb-4 max-w-md text-sm font-medium">{message}</p>}
      {owner && (user.hasGoogle || googleConfigured()) && (
        <Card title="Google login" className="mb-4 max-w-md">
          {user.hasGoogle ? (
            <p className="text-sm">
              Connected to <span className="font-medium">{user.email}</span>. If you lose this Google account, contact Hotel Desk support.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Connect your Google account to log in without a password. Your password stops working after this.</p>
              <GoogleButton href="/auth/google?mode=connect">Connect Google</GoogleButton>
            </>
          )}
        </Card>
      )}
      {!user.hasGoogle && (
        <Card title="Change password" className="max-w-md">
          <ActionForm action={changeMyPassword} submit="Change password">
            <div className="space-y-3">
              <Input name="current" label="Current password" type="password" autoComplete="current-password" required />
              <Input name="password" label="New password (8+ characters)" type="password" autoComplete="new-password" minLength={8} required />
              <Input name="confirm" label="New password again" type="password" autoComplete="new-password" minLength={8} required />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
