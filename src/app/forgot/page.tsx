import Link from "next/link";
import { ActionForm, Input } from "@/components/forms";
import { forgotPassword } from "@/lib/account-actions";
import { mailConfigured } from "@/lib/mail";
import { display, PublicHeader } from "@/components/public-chrome";

export const metadata = { title: "Forgot password" };
// Depends on the server's mail settings, so it cannot be built ahead of time.
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <div className={`${display.variable} min-h-dvh`}>
      <PublicHeader />
      <main className="mx-auto max-w-sm px-4 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">Forgot password</h1>
        {mailConfigured() ? (
          <>
            <p className="mt-2 mb-6 text-muted">Enter the email confirmed on your login. We will send a link to set a new password.</p>
            <ActionForm action={forgotPassword} submit="Send reset link">
              <Input name="email" label="Email" type="email" autoComplete="email" required />
            </ActionForm>
          </>
        ) : (
          <p className="mt-3 text-muted">Email reset is not switched on yet.</p>
        )}
        <p className="mt-6 text-sm text-muted">
          No email on your login? Ask your hotel owner to set a new password. <Link href="/login" className="font-medium text-accent">Back to log in</Link>
        </p>
      </main>
    </div>
  );
}
