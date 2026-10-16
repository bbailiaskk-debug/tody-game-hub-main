import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookHeart,
  BookOpen,
  Bot,
  Candy,
  ChessKnight,
  ChevronDown,
  Disc3,
  Download,
  Gamepad2,
  Grid3x3,
  Home,
  Info,
  Keyboard,
  LayoutGrid,
  Mail,
  Moon,
  Music2,
  Puzzle,
  Settings,
  Sparkles,
  Sun,
  Swords,
  Radio,
  Zap,
  Blocks,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { copy, resolveAccentContrast, useSiteSettings } from "./theme";
import { ANDROID_DOWNLOAD, PROGRAM_DOWNLOAD } from "../../lib/program-download";

const SettingsPanel = lazy(() =>
  import("./SettingsPanel").then((module) => ({ default: module.SettingsPanel })),
);

const socialLinks = [
  {
    label: "YouTube",
    href: "https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ",
    color: "#D90429",
  },
  { label: "TikTok", href: "https://www.tiktok.com/@todorkhristovgmaing", color: "#121212" },
  {
    label: "Spotify",
    href: "https://open.spotify.com/artist/0qeXEFSge1i8K1lC8np20",
    color: "#1DB954",
  },
  { label: "Discord", href: "https://discord.com/invite/uRNGhKf7vC", color: "#5865F2" },
] as const;

/**
 * Each button's label colour, decided by the brand colour underneath it.
 *
 * This used to be a blanket `text-white`, which is right for three of the four
 * and badly wrong for Spotify: white on #1DB954 is 2.59:1, against the 4.5:1
 * WCAG AA asks for. Two thirds of the way there is not enough — the fix has to be
 * the label colour, because the brand colour is the thing being recognised.
 *
 * `resolveAccentContrast` is the function the accent picker already uses to
 * answer exactly this question, so the decision is made in one place and stays
 * correct if a brand colour is ever changed to something lighter. The colours are
 * still literals here because they are the platforms', not ours to restyle — but
 * nothing downstream assumes white any more.
 */
const socialForeground = (color: string) => resolveAccentContrast(color).foreground;

const games = [
  { to: "/dino", label: "CHROME DINOSAUR", icon: Gamepad2 },
  { to: "/tictactoe", label: "TIC TAC TOE", icon: Grid3x3 },
  { to: "/chess", label: "CHESS", icon: ChessKnight },
  { to: "/game2048", label: "2048", icon: Puzzle },
  { to: "/airhockey", label: "AIR HOCKEY", icon: Disc3 },
  { to: "/wordle", label: "WORDLE", icon: Keyboard },
  { to: "/sudoku", label: "SUDOKU", icon: LayoutGrid },
  { to: "/candycrush", label: "CANDY CRUSH", icon: Candy },
  { to: "/ddlc", label: "DDLC", icon: BookHeart },
  { to: "/crystalrealm", label: "CRYSTAL REALM", icon: Swords },
  { to: "/prismheart", label: "PRISM HEART", icon: Sparkles },
  { to: "/streamer", label: "STREAM HEART", icon: Radio },
  { to: "/beatbattle", label: "BEAT BATTLE", icon: Zap },
  { to: "/tetris", label: "TETRIS", icon: Blocks },
] as const;

const GAME_PATHS: ReadonlySet<string> = new Set<string>(games.map((game) => game.to));

/**
 * The desktop navigation rail.
 *
 * Below lg the header's hamburger panel is the only navigation, and this
 * component renders nothing at all — a hidden element is cheaper than a
 * duplicate menu tree that has to be kept in step. At lg and up the panel is
 * suppressed instead (see SiteHeader), so the two never appear together.
 *
 * Width lives in --sidebar-w so the rail, the content offset and the tutorial
 * hint all read the same number instead of repeating a magic width.
 */
export function SiteSidebar() {
  const { lang, theme, toggleTheme, setLang } = useSiteSettings();
  const pathname = usePathname();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const t = copy[lang];

  const navItems = [
    { to: "/", label: t.nav.home, icon: Home },
    { to: "/games", label: t.nav.games, icon: Gamepad2, expandable: true },
    { to: "/rules", label: t.nav.rules, icon: BookOpen },
    { to: "/music", label: t.nav.music, icon: Music2 },
    { to: "/messages", label: t.nav.messages, icon: Mail },
    { to: "/info", label: t.nav.info, icon: Info },
  ] as const;

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : GAME_PATHS.has(to) ? pathname === to : pathname.startsWith(to);

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 rounded-2xl px-3 py-2.5 font-mono text-[0.9rem] tracking-[0.14em] transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-surface hover:text-foreground"
    }`;

  return (
    <aside
      aria-label={lang === "bg" ? "Основна навигация" : "Main navigation"}
      className="site-sidebar fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-border/70 bg-background/95 backdrop-blur-xl lg:flex"
    >
      <Link
        href="/"
        /*
         * No aria-label, deliberately — and the same as the header's logo link.
         *
         * An aria-label here replaced what is on screen with a word that is not
         * ("Начало"), which is label-content-name-mismatch: a control whose
         * visible text is not contained in its accessible name cannot be reached
         * by voice, and there is nothing on screen called "Начало" to dictate.
         * The brand lockup reads "TK TODOR KHRISTOV ГЕЙМИНГ / СЪЗДАТЕЛ", which is
         * an honest name for a link to the front page.
         */
        className="flex items-center gap-3 px-4 py-[18px]"
      >
        <span className="site-header-logo relative grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-base font-bold">
          TK
          <span className="absolute right-0 top-0 size-2 rounded-full bg-brand" />
        </span>
        <div className="min-w-0">
          <span className="block font-display text-sm font-bold tracking-tight leading-tight">
            TODOR <span className="text-brand">KHRISTOV</span>
          </span>
          <span className="block font-mono text-[0.55rem] tracking-[0.15em] text-muted-foreground">
            {t.tagline}
          </span>
        </div>
      </Link>

      <nav className="site-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p className="px-3 pb-2 pt-2 font-mono text-[0.58rem] tracking-[0.24em] text-muted-foreground uppercase">
          {lang === "bg" ? "Навигация" : "Navigation"}
        </p>

        <div className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;

            if (!("expandable" in item)) {
              return (
                <Link key={item.to} href={item.to} className={itemClass(active)}>
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            }

            return (
              <div key={item.to}>
                <button
                  type="button"
                  onClick={() => setGamesOpen((open) => !open)}
                  aria-expanded={gamesOpen}
                  aria-controls="sidebar-games"
                  className={`${itemClass(active)} w-full justify-between`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <ChevronDown
                    className={`size-4 shrink-0 transition-transform duration-200 ${
                      gamesOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {gamesOpen ? (
                  <div id="sidebar-games" className="mt-1 space-y-1 border-l border-border/60 pl-3">
                    {games.map((game) => {
                      const GameIcon = game.icon;
                      return (
                        <Link
                          key={game.to}
                          href={game.to}
                          className={`flex items-center gap-2.5 rounded-xl px-3 py-2 font-mono text-[0.76rem] tracking-[0.1em] transition-colors ${
                            pathname === game.to
                              ? "bg-surface text-foreground"
                              : "text-muted-foreground hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          <GameIcon className="size-3.5 shrink-0 text-brand" />
                          <span className="truncate">{game.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}

          <Link
            href="/ai"
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 font-mono text-[0.9rem] tracking-[0.14em] transition-colors ${
              pathname.startsWith("/ai")
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <Bot className="size-4 shrink-0" />
            <span className="truncate">{lang === "bg" ? "TK-BOT AI" : "TK-BOT AI"}</span>
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {[
            {
              key: "windows",
              href: PROGRAM_DOWNLOAD,
              label: lang === "bg" ? "ИЗТЕГЛИ ЗА WINDOWS" : "DOWNLOAD FOR WINDOWS",
            },
            {
              key: "android",
              href: ANDROID_DOWNLOAD,
              label: lang === "bg" ? "ИЗТЕГЛИ ЗА ANDROID" : "DOWNLOAD FOR ANDROID",
            },
          ].map(({ key, href, label }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-surface px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-surface-2"
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-mono text-[0.85rem] font-bold tracking-[0.16em] text-foreground">
                  {lang === "bg" ? "ПРОГРАМА" : "APP"}
                </span>
                <span className="truncate font-mono text-[0.58rem] tracking-[0.12em] text-muted-foreground">
                  {label}
                </span>
              </span>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground transition-transform group-hover:translate-y-0.5">
                <Download className="size-4" />
              </span>
            </a>
          ))}
        </div>

        <div className="mt-4 space-y-1.5 border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 font-mono text-[0.85rem] tracking-[0.16em] text-foreground transition-colors hover:bg-surface-2"
          >
            {theme === "dark" ? (
              <Sun className="size-4 shrink-0" />
            ) : (
              <Moon className="size-4 shrink-0" />
            )}
            <span>{theme === "dark" ? "LIGHT" : "DARK"}</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 font-mono text-[0.85rem] tracking-[0.16em] text-foreground transition-colors hover:bg-surface-2"
          >
            <Settings className="size-4 shrink-0" />
            <span>{lang === "bg" ? "НАСТРОЙКИ" : "SETTINGS"}</span>
          </button>
        </div>

        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="px-3 pb-2 font-mono text-[0.58rem] tracking-[0.24em] text-muted-foreground uppercase">
            {lang === "bg" ? "Език" : "Language"}
          </p>
          <div className="grid grid-cols-3 gap-2 px-1">
            {(
              [
                ["bg", "BG"],
                ["en", "EN"],
                ["zh", "中文"],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`rounded-xl border px-2 py-2 font-mono text-[0.8rem] tracking-[0.14em] transition-colors ${
                  lang === code
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="px-3 pb-2 font-mono text-[0.58rem] tracking-[0.24em] text-muted-foreground uppercase">
            {lang === "bg" ? "Социални мрежи" : "Social Media"}
          </p>
          <div className="grid grid-cols-2 gap-2 px-1">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${social.label} — ${
                  lang === "bg" ? "отваря се в нов раздел" : "opens in a new tab"
                }`}
                style={{ backgroundColor: social.color, color: socialForeground(social.color) }}
                className="inline-flex items-center justify-center rounded-xl px-3 py-2.5 font-mono text-[0.7rem] font-bold tracking-[0.1em] transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-110"
              >
                <span className="truncate">{social.label}</span>
              </a>
            ))}
          </div>
        </div>
      </nav>

      {settingsOpen && mounted
        ? createPortal(
            <Suspense fallback={null}>
              <SettingsPanel onClose={() => setSettingsOpen(false)} />
            </Suspense>,
            document.body,
          )
        : null}
    </aside>
  );
}
