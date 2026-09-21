import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createCompressedImageDataUrl } from "../../lib/image-utils";
import { copy, useSiteSettings } from "./theme";

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[62px] items-center justify-center rounded-[18px] border text-[1.15rem] font-medium transition-all ${
        active
          ? "border-[#1ce38b] bg-[#0a2922] text-[#7ef7bb] shadow-[0_0_0_1px_rgba(28,227,139,0.35)]"
          : "border-[#2d3b37] bg-[#101b19] text-[#f2f8f3] hover:border-[#374d47]"
      }`}
    >
      {children}
    </button>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;

  const numeric = Number.parseInt(value, 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsv(r: number, g: number, b: number) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  const saturation = max === 0 ? 0 : (delta / max) * 100;
  const value = max * 100;

  return { h: hue, s: Math.round(saturation), v: Math.round(value) };
}

function hsvToHex(h: number, s: number, v: number) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;

  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue >= 0 && hue < 60) {
    red = chroma;
    green = x;
    blue = 0;
  } else if (hue >= 60 && hue < 120) {
    red = x;
    green = chroma;
    blue = 0;
  } else if (hue >= 120 && hue < 180) {
    red = 0;
    green = chroma;
    blue = x;
  } else if (hue >= 180 && hue < 240) {
    red = 0;
    green = x;
    blue = chroma;
  } else if (hue >= 240 && hue < 300) {
    red = x;
    green = 0;
    blue = chroma;
  } else {
    red = chroma;
    green = 0;
    blue = x;
  }

  return rgbToHex(red * 255 + match * 255, green * 255 + match * 255, blue * 255 + match * 255);
}

function hexToHsv(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const {
    theme,
    lang,
    accentColor,
    backgroundImage,
    setTheme,
    setLang,
    setAccentColor,
    setBackgroundImage,
  } = useSiteSettings();
  const t = copy[lang];
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const [hue, setHue] = useState(() => hexToHsv(accentColor).h);
  const [saturation, setSaturation] = useState(() => hexToHsv(accentColor).s);
  const [value, setValue] = useState(() => hexToHsv(accentColor).v);

  useEffect(() => {
    const { h, s, v } = hexToHsv(accentColor);
    setHue(h);
    setSaturation(s);
    setValue(v);
  }, [accentColor]);

  const swatches = ["#40cc3c", "#59d87a", "#d7f3ff", "#ff7f50", "#8a6eff", "#ffbf00"];

  const matrixBackground = `linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,1)), linear-gradient(to right, rgba(255,255,255,1), hsl(${hue}, 100%, 50%))`;
  const squareHandleLeft = `${saturation}%`;
  const squareHandleTop = `${100 - value}%`;
  const squareIsDragging = useRef(false);
  const hueIsDragging = useRef(false);
  const squareRect = useRef<DOMRect | null>(null);
  const hueRect = useRef<DOMRect | null>(null);
  const sliderGradient = `linear-gradient(
    to bottom,
    #ff0000 0%,
    #ff4500 8%,
    #ff8c00 16%,
    #ffd400 25%,
    #baff00 33%,
    #00ff66 45%,
    #00f2ff 58%,
    #0077ff 72%,
    #5b2dff 83%,
    #ff00bf 92%,
    #ff0000 100%
  )`;

  const handleColorFromHex = (nextHex: string) => {
    const sanitized = nextHex.trim();
    if (
      !/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(sanitized) &&
      !/^#?[0-9a-fA-F]{6}$/.test(sanitized)
    ) {
      return;
    }

    const normalized = sanitized.startsWith("#") ? sanitized : `#${sanitized}`;
    const { h, s, v } = hexToHsv(normalized);
    setHue(h);
    setSaturation(s);
    setValue(v);
    setAccentColor(normalized.toLowerCase());
  };

  const handleSquareSelect = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = clamp((clientX - rect.left) / rect.width, 0, 1) * 100;
    const y = clamp((clientY - rect.top) / rect.height, 0, 1) * 100;
    const nextSaturation = x;
    const nextValue = 100 - y;
    setSaturation(nextSaturation);
    setValue(nextValue);
    setAccentColor(hsvToHex(hue, nextSaturation, nextValue).toLowerCase());
  };

  const handleHueSelect = (clientY: number, rect: DOMRect) => {
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    const nextHue = Math.round(y * 360);
    setHue(nextHue);
    setAccentColor(hsvToHex(nextHue, saturation, value).toLowerCase());
  };

  const handleSquarePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    squareIsDragging.current = true;
    squareRect.current = event.currentTarget.getBoundingClientRect();
    handleSquareSelect(event.clientX, event.clientY, squareRect.current);
  };

  const handleSquarePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!squareIsDragging.current || !squareRect.current) return;
    handleSquareSelect(event.clientX, event.clientY, squareRect.current);
  };

  const handleSquarePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    squareIsDragging.current = false;
    squareRect.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleHuePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    hueIsDragging.current = true;
    hueRect.current = event.currentTarget.getBoundingClientRect();
    handleHueSelect(event.clientY, hueRect.current);
  };

  const handleHuePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hueIsDragging.current || !hueRect.current) return;
    handleHueSelect(event.clientY, hueRect.current);
  };

  const handleHuePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    hueIsDragging.current = false;
    hueRect.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#02110d]/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="scrollbar-brand w-full max-w-[560px] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[32px] border border-[#2d3d36] bg-[#0d1a17]/90 p-7 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-mono text-[0.72rem] tracking-[0.25em] text-[#6ce9ae]">
              {t.settingsLabel}
            </p>
            <h2 className="mt-3 text-[clamp(2.1rem,3.8vw,3.5rem)] leading-none tracking-[-0.06em] text-[#e5f4ee]">
              {t.settings}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Затвори"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-full border border-[#2d3d36] bg-[#121c1a] text-[#cfdad4] transition-colors hover:text-[#ffffff]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-8 space-y-7">
          <div>
            <p className="label-mono mb-3 text-[0.7rem] tracking-[0.22em] text-[#b7c8c1]">
              {t.language}
            </p>
            <div className="grid grid-cols-3 gap-4">
              <OptionButton active={lang === "bg"} onClick={() => setLang("bg")}>
                Български
              </OptionButton>
              <OptionButton active={lang === "en"} onClick={() => setLang("en")}>
                English
              </OptionButton>
              <OptionButton active={lang === "zh"} onClick={() => setLang("zh")}>
                中文
              </OptionButton>
            </div>
          </div>

          <div>
            <p className="label-mono mb-3 text-[0.7rem] tracking-[0.22em] text-[#b7c8c1]">
              {t.theme}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <OptionButton active={theme === "dark"} onClick={() => setTheme("dark")}>
                {t.dark}
              </OptionButton>
              <OptionButton active={theme === "light"} onClick={() => setTheme("light")}>
                {t.light}
              </OptionButton>
            </div>
          </div>

          <div>
            <p className="label-mono mb-3 text-[0.7rem] tracking-[0.22em] text-[#b7c8c1]">
              {t.accentColor}
            </p>

            <div className="flex items-stretch gap-3">
              <div
                className="relative h-[260px] w-full cursor-crosshair overflow-hidden rounded-[18px] border border-[#2d3d36]"
                style={{ background: matrixBackground }}
                onPointerDown={handleSquarePointerDown}
                onPointerMove={handleSquarePointerMove}
                onPointerUp={handleSquarePointerUp}
                onPointerLeave={handleSquarePointerUp}
              >
                <div
                  className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]"
                  style={{
                    left: squareHandleLeft,
                    top: squareHandleTop,
                    background: "transparent",
                  }}
                />
              </div>

              <div
                className="relative h-[260px] w-[28px] cursor-pointer overflow-hidden rounded-[10px] border border-[#2d3d36] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                style={{ background: sliderGradient }}
                onPointerDown={handleHuePointerDown}
                onPointerMove={handleHuePointerMove}
                onPointerUp={handleHuePointerUp}
                onPointerLeave={handleHuePointerUp}
              >
                <div
                  className="absolute left-1/2 h-[18px] w-[28px] -translate-x-1/2 rounded-[6px] border-[3px] border-white bg-transparent shadow-[0_0_0_2px_rgba(0,0,0,0.2)]"
                  style={{ top: `calc(${(hue / 360) * 100}% - 9px)` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <input
                type="text"
                value={accentColor.toLowerCase()}
                onChange={(event) => handleColorFromHex(event.target.value)}
                className="w-full rounded-lg border border-[#2d3d36] bg-[#0f1715] px-3 py-2 text-sm font-mono text-[#dfe9e5] outline-none placeholder:text-[#7d8e87] focus:border-[#1ce38b]"
                aria-label="Hex color code"
              />
              <span
                className="size-6 rounded-full border border-[#f4f4f4] shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
                style={{ backgroundColor: accentColor }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2 text-sm text-[#dfe9e5]">
                <span
                  className="size-4 rounded-full ring-2 ring-[#1e2b28]"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="font-mono text-[0.75rem] text-[#dfe9e5]">
                  {accentColor.toLowerCase()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {swatches.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`Set accent to ${swatch}`}
                    onClick={() => setAccentColor(swatch)}
                    className="size-4 rounded-full border border-[#1f2a28] transition-transform hover:scale-110"
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="label-mono mb-3 text-[0.7rem] tracking-[0.22em] text-[#b7c8c1]">
              {t.bgImage}
            </p>
            <div className="overflow-hidden rounded-[18px] border border-[#2d3d36] bg-[#0f1715]">
              {backgroundImage ? (
                <div
                  className="h-32 bg-cover bg-center"
                  style={{ backgroundImage: `url("${backgroundImage}")` }}
                  aria-hidden="true"
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-3 p-3">
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    setBackgroundError(null);
                    const maxFileSize = 17.1 * 1024 * 1024;
                    if (!file || file.size > maxFileSize) {
                      setBackgroundError(t.bgErrorTooLarge);
                      return;
                    }

                    try {
                      const compressedImage = await createCompressedImageDataUrl(file, {
                        maxWidth: 4096,
                        maxHeight: 4096,
                        maxBytes: 1_500_000,
                        quality: 0.72,
                      });
                      setBackgroundImage(compressedImage);
                    } catch {
                      setBackgroundError(t.bgErrorGeneral);
                    } finally {
                      event.target.value = "";
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => backgroundInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-[#2d3d36] bg-[#121c1a] px-4 py-2.5 font-mono text-[0.65rem] tracking-[0.18em] text-[#dfe9e5] transition-colors hover:border-[#1ce38b] hover:text-[#7ef7bb]"
                >
                  <ImagePlus className="size-4" />
                  {t.bgUpload}
                </button>
                {backgroundImage ? (
                  <button
                    type="button"
                    onClick={() => setBackgroundImage(null)}
                    className="rounded-lg border border-[#2d3d36] bg-transparent px-4 py-2.5 font-mono text-[0.65rem] tracking-[0.18em] text-[#b7c8c1] transition-colors hover:border-red-400/50 hover:text-red-400"
                  >
                    {t.bgRemove}
                  </button>
                ) : null}
              </div>
              {backgroundError ? (
                <p className="px-3 pb-3 text-[0.7rem] text-red-400">{backgroundError}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
