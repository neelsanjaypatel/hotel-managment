import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { googleConfigured } from "@/lib/google";
import { PHOTOS } from "@/lib/photos";
import { display, Mark } from "@/components/public-chrome";
import { GoogleButton } from "@/components/google-button";
import { InstallApp } from "@/components/install-app";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

const GOOGLE_MESSAGE: Record<string, string> = {
  unlinked: "This Google account is not connected to an owner login. Log in with your password, then connect Google from My account.",
  failed: "Google did not finish. Please try again.",
  off: "Google login is not switched on yet. Please use your password.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { google } = await searchParams;
  const message = typeof google === "string" ? GOOGLE_MESSAGE[google] : undefined;
  return (
    <div className={`${display.variable} min-h-dvh md:grid md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]`}>
      {/* The same welcome as the signup page: the day starts at the hotel's front door. */}
      <aside className="relative isolate flex min-h-44 flex-col justify-between overflow-hidden p-6 text-white md:sticky md:top-0 md:h-dvh md:min-h-0 md:p-10">
        <Image src={PHOTOS.diningRoom.src} alt={PHOTOS.diningRoom.alt} fill priority sizes="(min-width: 768px) 55vw, 100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/65 via-black/35 to-black/80" aria-hidden />
        <Link href="/welcome" className="flex items-center gap-2 font-display text-lg font-bold">
          <Mark />
          Hotel Desk
        </Link>
        <p className="mt-8 max-w-md font-display text-2xl font-bold tracking-tight text-balance md:text-4xl">Today&apos;s counter, staff and cash, all in one place.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-8 md:px-10">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-bold tracking-tight">Log in</h1>
          {message && <p className="mt-3 text-sm text-danger">{message}</p>}
          {googleConfigured() && (
            <section className="mt-6">
              <h2 className="label">Hotel owner</h2>
              <GoogleButton href="/auth/google">Continue with Google</GoogleButton>
            </section>
          )}
          <section className="mt-6">
            <h2 className="label">Staff and partners</h2>
            <LoginForm />
          </section>
          <p className="mt-5 text-center text-sm text-muted">
            New hotel? <Link href="/signup" className="font-medium text-accent">Start a free trial</Link>
          </p>
          <InstallApp className="mt-6" />
        </div>
      </main>
    </div>
  );
}
