import { useEffect, useState } from "react";

const FILL_DURATION_MS = 700;
const FADE_DURATION_MS = 350;
const SPLASH_DONE_KEY = "tk-splash-done";

export function SplashScreen() {
  const [phase, setPhase] = useState<"hidden" | "visible" | "fading">("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SPLASH_DONE_KEY)) return;

    window.sessionStorage.setItem(SPLASH_DONE_KEY, "1");
    setPhase("visible");

    const fillTimer = window.setTimeout(() => setPhase("fading"), FILL_DURATION_MS);
    const fadeTimer = window.setTimeout(
      () => setPhase("hidden"),
      FILL_DURATION_MS + FADE_DURATION_MS,
    );

    return () => {
      window.clearTimeout(fillTimer);
      window.clearTimeout(fadeTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div aria-hidden="true" className={`splash-root ${phase === "fading" ? "splash-fade" : ""}`}>
      <svg
        width="168"
        height="168"
        viewBox="0 0 168 168"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="84" cy="84" r="66" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="2" />
        <text
          x="84"
          y="106"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="70"
          fontFamily="'Archivo Black', 'LIGHTZ', 'Arial Black', sans-serif"
          fontWeight="700"
          letterSpacing="-3"
        >
          TK
        </text>
      </svg>

      <div className="splash-track">
        <div className="splash-fill h-full rounded-full" />
      </div>
    </div>
  );
}
