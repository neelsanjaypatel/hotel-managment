"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

// Chrome's install event; not in the DOM typings yet.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const never = () => () => {};
// Already opened from the home screen icon: nothing to offer.
const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
// iPhone and iPad have no install prompt; the user adds it from the Share menu.
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

export function InstallApp({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);
  const standalone = useSyncExternalStore(never, isStandalone, () => true);
  const ios = useSyncExternalStore(never, isIos, () => false);

  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    return () => {
      removeEventListener("beforeinstallprompt", onPrompt);
      removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || (!prompt && !ios)) return null;

  async function install() {
    if (!prompt) return setHelp((h) => !h);
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }

  return (
    <div className={className}>
      <button type="button" onClick={install} className="btn btn-ghost w-full">
        Install app on this phone
      </button>
      {help && (
        <p className="mt-2 text-xs text-muted">
          Tap the Share button <span aria-hidden>(square with an arrow)</span> at the bottom of Safari, then choose{" "}
          <b className="text-ink">Add to Home Screen</b>.
        </p>
      )}
    </div>
  );
}
