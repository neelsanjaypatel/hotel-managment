"use client";

// Shown when a page cannot load, usually a moment of database trouble. Entries are never half saved.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">This page could not load</h1>
      <p className="mt-2 text-sm text-muted">Please try again. If you were saving an entry, check that it is there before adding it again.</p>
      <button className="btn mt-6" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
