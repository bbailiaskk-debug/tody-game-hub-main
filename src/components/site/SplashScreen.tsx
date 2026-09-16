import { useEffect, useState } from "react";

const MIN_VISIBLE_MS = 300;
const MAX_VISIBLE_MS = 550;
const FADE_DURATION_MS = 220;
const CHECK_INTERVAL_MS = 120;
const SPLASH_DONE_KEY = "tk-splash-done";

export function shouldRenderSplash(): boolean {
  if (typeof window === "undefined") return true;

  const forced = new URLSearchParams(window.location.search).get("splash");
  if (forced === "0" || forced === "false") return false;
  if (forced === "1" || forced === "true") return true;

  return true;
}

function isPageFullyLoaded(): boolean {
  if (typeof document === "undefined") return true;
  if (document.readyState !== "complete") return false;

  const appCss = document.getElementById("app-css") as HTMLLinkElement | null;
  if (!appCss) return true;
  return appCss.media === "all" || document.documentElement.hasAttribute("data-css-on");
}

export function SplashScreen() {
  const [phase, setPhase] = useState<"hidden" | "visible" | "fading">("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!shouldRenderSplash()) {
      setPhase("hidden");
      return;
    }
    try {
      if (window.sessionStorage.getItem(SPLASH_DONE_KEY)) return;
      window.sessionStorage.setItem(SPLASH_DONE_KEY, "1");
    } catch {
      // The splash must never prevent the app from starting when storage is blocked.
    }
    setPhase("visible");

    const startedAt = Date.now();
    let faded = false;
    let hideTimer: number | undefined;
    let pendingTimer: number | undefined;

    const hide = () => setPhase("hidden");

    const finish = () => {
      if (faded) return;
      faded = true;
      setPhase("fading");
      hideTimer = window.setTimeout(hide, FADE_DURATION_MS);
    };

    const check = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= MIN_VISIBLE_MS && isPageFullyLoaded()) {
        finish();
      } else if (elapsed >= MAX_VISIBLE_MS) {
        finish();
      } else {
        pendingTimer = window.setTimeout(check, CHECK_INTERVAL_MS);
      }
    };

    pendingTimer = window.setTimeout(check, CHECK_INTERVAL_MS);

    return () => {
      window.clearTimeout(pendingTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div aria-hidden="true" className={`splash-root ${phase === "fading" ? "splash-fade" : ""}`}>
      <svg
        className="splash-logo"
        width="168"
        height="168"
        viewBox="0 0 168 168"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="splash-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx="84"
          cy="84"
          r="72"
          fill="none"
          stroke="#1DB954"
          strokeOpacity="0.12"
          strokeWidth="8"
          filter="url(#splash-glow)"
        />
        <circle
          className="splash-ring"
          cx="84"
          cy="84"
          r="72"
          fill="none"
          stroke="#1DB954"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="452.39"
          strokeDashoffset="452.39"
        />
        <circle cx="84" cy="84" r="58" fill="#0d120d" />
        <text
          x="84"
          y="106"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="52"
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
          fontWeight="700"
          letterSpacing="-2"
        >
          TK
        </text>
      </svg>

      <div className="splash-track">
        <div className="splash-fill" />
      </div>
      <div className="splash-status">
        <span className="splash-status-dot" />
        INITIALIZING SIGNAL
      </div>
    </div>
  );
}
