import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { createCompressedImageDataUrl } from "../../lib/image-utils";
import { AppleColorPicker } from "../ui/apple-color-picker";
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

            <AppleColorPicker
              value={accentColor}
              onChange={setAccentColor}
              labels={{
                grid: t.colorGrid,
                spectrum: t.colorSpectrum,
                sliders: t.colorSliders,
                recent: t.colorRecent,
                hex: t.colorHex,
                red: t.colorRed,
                green: t.colorGreen,
                blue: t.colorBlue,
                saturation: t.colorSaturation,
                hue: t.colorHue,
              }}
            />
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
