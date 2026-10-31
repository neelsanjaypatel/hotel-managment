import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";

// Display face for the public pages only, so app screens do not load it.
export const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["500", "700"] });

export function Mark() {
  return (
    <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-accent text-[13px] font-bold tracking-tight text-accent-ink">
      HD
    </span>
  );
}

// `overPhoto` sits on the hero image, so its text and outline are white.
export function PublicHeader({ overPhoto = false }: { overPhoto?: boolean }) {
  const quiet = overPhoto ? "text-white/85 hover:text-white" : "text-muted hover:text-ink";
  const login = overPhoto ? "btn-light" : "btn-ghost";
  return (
    <header className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
      <Link href="/welcome" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
        <Mark />
        Hotel Desk
      </Link>
      <nav className="flex items-center gap-2 sm:gap-3">
        <Link href="/welcome#features" className={`hidden rounded-md px-2 py-1 md:inline ${quiet}`}>
          Features
        </Link>
        <Link href="/welcome#pricing" className={`hidden rounded-md px-2 py-1 sm:inline ${quiet}`}>
          Pricing
        </Link>
        <Link href="/login" className={`btn btn-lg ${login}`}>
          Log in
        </Link>
        <span className="hidden sm:block">
          <Link href="/signup" className="btn btn-lg">
            Start free
          </Link>
        </span>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-2">
          <Mark />
          <span>Hotel Desk · made for Indian hotels, restaurants and banquets</span>
        </div>
        <div className="flex gap-4">
          <Link href="/terms" className="hover:text-ink">Terms &amp; privacy</Link>
          <Link href="/login" className="hover:text-ink">Log in</Link>
        </div>
      </div>
    </footer>
  );
}
