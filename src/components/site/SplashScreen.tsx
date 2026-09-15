import { useEffect, useState } from "react";

const MIN_VISIBLE_MS = 1500;
const MAX_VISIBLE_MS = 1650;
const FADE_DURATION_MS = 350;
const CHECK_INTERVAL_MS = 150;
const SPLASH_DONE_KEY = "tk-splash-done";

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
    if (window.sessionStorage.getItem(SPLASH_DONE_KEY)) return;

    window.sessionStorage.setItem(SPLASH_DONE_KEY, "1");
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
        {/* Outer ambient glow ring */}
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
        {/* Animated progress ring */}
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
        {/* Inner dark circle */}
        <circle cx="84" cy="84" r="58" fill="#0d120d" />
        {/* TK text */}
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
    </div>
  );
}
