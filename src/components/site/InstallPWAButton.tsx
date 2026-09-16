import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { useSiteSettings } from "./theme";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as typeof window.navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPWAButton() {
  const { lang } = useSiteSettings();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => setDeferredPrompt(null);

    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) setDeferredPrompt(null);
    };

    const displayMode = window.matchMedia("(display-mode: standalone)");

    if (isStandalone()) setDeferredPrompt(null);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (typeof displayMode.addEventListener === "function") {
      displayMode.addEventListener("change", handleMediaChange);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);

      if (typeof displayMode.removeEventListener === "function") {
        displayMode.removeEventListener("change", handleMediaChange);
      }
    };
  }, []);

  if (!deferredPrompt) return null;

  const handleInstall = () => {
    void (async () => {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    })();
  };

  const label = lang === "bg" ? "Инсталирай" : lang === "zh" ? "安装" : "Install";

  return (
    <button
      type="button"
      onClick={handleInstall}
      aria-label={label}
      className="inline-flex items-center justify-center rounded-full border border-border bg-surface/90 px-4 py-2.5 font-mono text-[0.6rem] font-medium tracking-[0.18em] text-foreground transition-transform duration-200 hover:-translate-y-0.5 hover:bg-surface"
    >
      <Download className="size-3.5" aria-hidden="true" />
      <span className="ml-2 hidden min-[480px]:inline">{label}</span>
    </button>
  );
}
