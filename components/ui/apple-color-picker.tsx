import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

const RECENT_COLORS_KEY = "tody_recent_accent_colors";

type PickerMode = "grid" | "spectrum" | "sliders";
type RgbColor = { r: number; g: number; b: number };
type HsvColor = { h: number; s: number; v: number };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export type AppleColorPickerLabels = {
  grid: string;
  spectrum: string;
  sliders: string;
  recent: string;
  hex: string;
  red: string;
  green: string;
  blue: string;
  saturation: string;
  hue: string;
};

type AppleColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  labels: AppleColorPickerLabels;
};

const GRAY_SWATCHES = [
  "#ffffff",
  "#e5e5ea",
  "#aeaeb2",
  "#8e8e93",
  "#636366",
  "#48484a",
  "#2c2c2e",
  "#1c1c1e",
];

const GRID_HUES = [0, 20, 40, 60, 90, 140, 180, 210, 260, 320];
const GRID_COLORS = [
  ...GRAY_SWATCHES,
  ...GRID_HUES.flatMap((hue) => [
    hsvToHex(hue, 12, 96),
    hsvToHex(hue, 58, 78),
    hsvToHex(hue, 78, 58),
    hsvToHex(hue, 86, 36),
  ]),
];

const HUE_GRADIENT =
  "linear-gradient(to right, #ff3b30 0%, #ff9500 17%, #ffcc00 33%, #34c759 50%, #00c7be 67%, #0a84ff 83%, #5e5ce6 90%, #bf5af2 96%, #ff375f 100%)";

function normalizeHex(value: string): string | null {
  const compact = value.trim().replace(/^#/, "").toLowerCase();
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(compact)) return null;
  if (compact.length === 3) {
    return `#${compact
      .split("")
      .map((character) => character + character)
      .join("")}`;
  }
  return `#${compact}`;
}

function hexToRgb(hex: string): RgbColor {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
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

  if (hue < 0) hue += 6;
  hue = Math.round(hue * 60);
  if (hue === 360) hue = 0;

  return {
    h: hue,
    s: Math.round(max === 0 ? 0 : (delta / max) * 100),
    v: Math.round(max * 100),
  };
}

function hsvToHex(h: number, s: number, v: number) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [chroma, x, 0];
  else if (hue < 120) [r, g, b] = [x, chroma, 0];
  else if (hue < 180) [r, g, b] = [0, chroma, x];
  else if (hue < 240) [r, g, b] = [0, x, chroma];
  else if (hue < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return rgbToHex((r + match) * 255, (g + match) * 255, (b + match) * 255);
}

export function AppleColorPicker({ value, onChange, labels }: AppleColorPickerProps) {
  const [mode, setMode] = useState<PickerMode>("spectrum");
  const [draft, setDraft] = useState(value);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const normalizedValue = normalizeHex(value) ?? "#000000";
  const rgb = useMemo(() => hexToRgb(normalizedValue), [normalizedValue]);
  const hsv = useMemo(() => rgbToHsv(rgb), [rgb]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(RECENT_COLORS_KEY) ?? "[]");
      if (!Array.isArray(stored)) return;
      const colors = stored
        .filter((color): color is string => typeof color === "string")
        .map(normalizeHex)
        .filter((color): color is string => color !== null);
      setRecentColors([...new Set(colors)].slice(0, 8));
    } catch {
      setRecentColors([]);
    }
  }, []);

  useEffect(() => {
    const normalized = normalizeHex(value);
    if (!normalized) return;

    const timeout = window.setTimeout(() => {
      setRecentColors((current) => {
        const next = [normalized, ...current.filter((color) => color !== normalized)].slice(0, 8);
        try {
          window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next));
        } catch {
          return next;
        }
        return next;
      });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [value]);

  const selectSpectrumColor = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const valueLevel = clamp(100 - ((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    onChange(hsvToHex(hsv.h, saturation, valueLevel));
  };

  const selectHue = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const hue = clamp(((event.clientX - rect.left) / rect.width) * 360, 0, 359);
    onChange(hsvToHex(hue, hsv.s, hsv.v));
  };

  const handleSpectrumKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    let saturation = hsv.s;
    let valueLevel = hsv.v;

    if (event.key === "ArrowLeft") saturation -= step;
    else if (event.key === "ArrowRight") saturation += step;
    else if (event.key === "ArrowUp") valueLevel += step;
    else if (event.key === "ArrowDown") valueLevel -= step;
    else if (event.key === "Home") saturation = 0;
    else if (event.key === "End") saturation = 100;
    else return;

    event.preventDefault();
    onChange(hsvToHex(hsv.h, saturation, valueLevel));
  };

  const handleHueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    let hue = hsv.h;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") hue -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") hue += step;
    else if (event.key === "Home") hue = 0;
    else if (event.key === "End") hue = 359;
    else return;

    event.preventDefault();
    onChange(hsvToHex(hue, hsv.s, hsv.v));
  };

  const commitDraft = () => {
    const normalized = normalizeHex(draft);
    if (!normalized) {
      setDraft(value);
      return;
    }
    setDraft(normalized);
    onChange(normalized);
  };

  const channels = [
    {
      label: labels.red,
      value: rgb.r,
      color: "#ff453a",
      update: (next: number) => onChange(rgbToHex(next, rgb.g, rgb.b)),
    },
    {
      label: labels.green,
      value: rgb.g,
      color: "#30d158",
      update: (next: number) => onChange(rgbToHex(rgb.r, next, rgb.b)),
    },
    {
      label: labels.blue,
      value: rgb.b,
      color: "#0a84ff",
      update: (next: number) => onChange(rgbToHex(rgb.r, rgb.g, next)),
    },
  ];

  const spectrumBackground = `linear-gradient(to top, rgb(0 0 0), transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`;

  return (
    <div className="w-full select-none rounded-[24px] bg-[#f2f2f7] p-3 text-[#1c1c1e] shadow-[0_12px_35px_rgba(0,0,0,0.2)]">
      <div className="flex items-center gap-3 rounded-[18px] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div
          className="size-14 shrink-0 rounded-[14px] border border-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
          style={{ backgroundColor: normalizedValue }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#86868b]">
            {labels.hex}
          </span>
          <input
            type="text"
            value={draft}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              const normalized = normalizeHex(next);
              if (normalized) onChange(normalized);
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft();
                event.currentTarget.blur();
              }
            }}
            onFocus={(event) => event.currentTarget.select()}
            aria-label={labels.hex}
            spellCheck={false}
            className="mt-0.5 w-full bg-transparent font-mono text-lg font-medium tracking-tight text-[#1c1c1e] outline-none"
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label={labels.hex}
        className="mt-3 grid grid-cols-3 gap-1 rounded-[14px] bg-[#dedee3] p-1"
      >
        {(
          [
            ["grid", labels.grid],
            ["spectrum", labels.spectrum],
            ["sliders", labels.sliders],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`rounded-[10px] px-2 py-2 text-xs font-semibold transition-all ${
              mode === id
                ? "bg-white text-[#1c1c1e] shadow-[0_1px_4px_rgba(0,0,0,0.16)]"
                : "text-[#636366] hover:text-[#1c1c1e]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-[226px] rounded-[18px] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {mode === "grid" ? (
          <div id="apple-color-grid-panel" role="tabpanel" className="grid grid-cols-8 gap-2">
            {GRID_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange(color)}
                aria-label={`${labels.grid} ${color}`}
                className={`aspect-square min-w-0 rounded-[9px] border border-black/10 transition-transform hover:scale-110 ${
                  normalizedValue === color ? "ring-2 ring-[#0a84ff] ring-offset-2" : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        ) : null}

        {mode === "spectrum" ? (
          <div id="apple-color-spectrum-panel" role="tabpanel" className="space-y-3">
            <div
              role="slider"
              tabIndex={0}
              aria-label={labels.saturation}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(hsv.s)}
              aria-valuetext={`${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%`}
              onKeyDown={handleSpectrumKeyDown}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                selectSpectrumColor(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  selectSpectrumColor(event);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              className="relative h-[174px] cursor-crosshair touch-none overflow-hidden rounded-[14px] border border-black/10"
              style={{ background: spectrumBackground }}
            >
              <span
                className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_2px_5px_rgba(0,0,0,0.35)]"
                style={{
                  left: `${4 + hsv.s * 0.92}%`,
                  top: `${4 + (100 - hsv.v) * 0.92}%`,
                }}
              />
            </div>
            <div
              role="slider"
              tabIndex={0}
              aria-label={labels.hue}
              aria-valuemin={0}
              aria-valuemax={359}
              aria-valuenow={hsv.h}
              onKeyDown={handleHueKeyDown}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                selectHue(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) selectHue(event);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              className="relative h-5 cursor-pointer touch-none rounded-full border border-black/10"
              style={{ background: HUE_GRADIENT }}
            >
              <span
                className="pointer-events-none absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.55)]"
                style={{ left: `${(hsv.h / 360) * 100}%` }}
              />
            </div>
          </div>
        ) : null}

        {mode === "sliders" ? (
          <div
            id="apple-color-sliders-panel"
            role="tabpanel"
            className="flex min-h-[210px] flex-col justify-center gap-6 px-1"
          >
            {channels.map((channel) => (
              <div
                key={channel.label}
                className="grid grid-cols-[22px_1fr_42px] items-center gap-3"
              >
                <span className="text-xs font-semibold text-[#636366]">{channel.label}</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={1}
                  value={channel.value}
                  onChange={(event) => channel.update(Number(event.target.value))}
                  aria-label={channel.label}
                  className="h-2 min-w-0 cursor-pointer"
                  style={{ accentColor: channel.color }}
                />
                <span className="rounded-md bg-[#f2f2f7] py-1 text-center font-mono text-xs text-[#3a3a3c]">
                  {String(channel.value).padStart(3, "0")}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 border-t border-[#d8d8dc] pt-3">
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#86868b]">
          {labels.recent}
        </p>
        <div className="flex min-h-8 flex-wrap gap-2">
          {recentColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              aria-label={`${labels.recent} ${color}`}
              className={`size-8 rounded-full border border-black/10 transition-transform hover:scale-110 ${
                normalizedValue === color ? "ring-2 ring-[#0a84ff] ring-offset-2" : ""
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
