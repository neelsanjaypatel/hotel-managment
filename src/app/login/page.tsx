import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-accent">Hotel Desk</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Log in</h1>
          <p className="mt-1 text-sm text-muted">Use the login and password the owner gave you.</p>
        </div>
        <LoginForm />
        <p className="mt-4 text-center text-sm text-muted">
          New hotel? <Link href="/signup" className="font-medium text-accent">Start a free trial</Link>
        </p>
      </div>
    </main>
  );
}
