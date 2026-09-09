import { useEffect, useState } from "react";

const FILL_DURATION_MS = 1800;
const FADE_DURATION_MS = 700;

export function SplashScreen() {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const value = Math.min(100, (elapsed / FILL_DURATION_MS) * 100);

      setProgress(value);

      if (value >= 100) {
        setFading(true);
        window.setTimeout(() => setRemoved(true), FADE_DURATION_MS);
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (removed) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#161B16] transition-opacity duration-700 ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
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

      <div className="relative mt-10 h-[3px] w-60 overflow-hidden rounded-full bg-white/10">
        <div
          className="splash-fill h-full rounded-full"
          style={{
            width: `${progress}%`,
            boxShadow: "0 0 10px rgba(255,255,255,0.9), 0 0 28px rgba(255,255,255,0.45)",
          }}
        />
      </div>
    </div>
  );
}
