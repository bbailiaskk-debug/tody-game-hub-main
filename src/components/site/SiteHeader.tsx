import { Link } from "@tanstack/react-router";

import { Mail, Menu, Moon, Music2, Settings, Sun, LogIn, LogOut, X } from "lucide-react";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";

import {
  clearPersistedUserProfile,
  readPersistedAuthSession,
  readPersistedUserProfile,
  storageGet,
} from "../../lib/local-persistence";

import { copy, useSiteSettings } from "./theme";

const SettingsPanel = lazy(() =>
  import("./SettingsPanel").then((module) => ({ default: module.SettingsPanel })),
);

export function SiteHeader() {
  const { lang, theme, toggleTheme, setLang } = useSiteSettings();

  const [open, setOpen] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [mounted, setMounted] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [userName, setUserName] = useState<string | null>(null);

  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const checkUser = useCallback(() => {
    const profile = readPersistedUserProfile();
    const session = readPersistedAuthSession();
    const activeEmail = session?.email || profile?.email || storageGet("currentUserEmail");

    const storedName = session?.name || profile?.name || storageGet("userName");

    const storedAvatar = profile?.avatar ?? storageGet("userAvatar");

    if (!activeEmail || activeEmail.trim() === "") {
      setUserEmail(null);

      setUserName(null);

      setUserAvatar(null);

      return;
    }

    const defaultName = activeEmail.includes("@")
      ? (activeEmail.split("@")[0] ?? activeEmail)
      : activeEmail;

    setUserEmail(activeEmail);

    setUserName(storedName && storedName.trim() !== "" ? storedName : defaultName);

    setUserAvatar(storedAvatar && storedAvatar.trim() !== "" ? storedAvatar : null);
  }, []);

  useEffect(() => {
    setMounted(true);

    checkUser();

    const handleUserChange = () => {
      checkUser();
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    window.addEventListener("storage", handleUserChange);

    window.addEventListener("userStateChanged", handleUserChange);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("storage", handleUserChange);

      window.removeEventListener("userStateChanged", handleUserChange);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [checkUser]);

  const handleLogout = () => {
    clearPersistedUserProfile();

    setUserEmail(null);

    setUserName(null);

    setUserAvatar(null);

    window.dispatchEvent(new Event("userStateChanged"));

    window.location.href = "/login";
  };

  const t = copy[lang];

  const menuItems = [
    { to: "/", label: t.nav.home },
    { to: "/music", label: t.nav.music },
    { to: "/info", label: t.nav.info },
  ] as const;

  const navLink =
    "rounded-full px-6 py-2.5 font-mono text-xs tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1600px] items-center justify-between gap-4 px-5">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="relative grid size-12 place-items-center rounded-full bg-surface-2 font-display text-base font-bold">
            TK
            <span className="absolute right-0 top-0 size-2 rounded-full bg-brand" />
          </span>

          <div className="flex flex-col gap-0.5">
            <span className="block font-display text-sm font-bold tracking-tight leading-tight">
              TODOR <span className="text-brand">KHRISTOV</span>
            </span>
            <span className="text-[0.55rem] font-mono tracking-[0.15em] text-muted-foreground">
              {t.tagline}
            </span>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {mounted && userEmail ? (
            // User is logged in - show profile menu
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                aria-label={profileMenuOpen ? "Close profile menu" : "Open profile menu"}
                aria-expanded={profileMenuOpen}
                aria-controls="profile-menu"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3 py-2 font-mono text-[0.6rem] font-medium tracking-[0.18em] text-foreground transition-transform duration-200 hover:-translate-y-0.5 hover:bg-surface"
              >
                {userAvatar ? (
                  <span
                    role="img"
                    aria-label="User avatar"
                    style={{ backgroundImage: `url(${userAvatar})` }}
                    className="size-6 rounded-full bg-cover bg-center bg-no-repeat"
                  />
                ) : (
                  <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {(userName || userEmail).charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[80px] truncate">{userName || userEmail}</span>
              </button>

              <div
                id="profile-menu"
                className={`absolute right-0 top-full mt-2 w-[18rem] z-50 overflow-hidden rounded-[1.5rem] border border-border/80 bg-background shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 ${
                  profileMenuOpen
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none -translate-y-2 opacity-0"
                }`}
              >
                <div className="border-b border-border/70 px-4 py-3">
                  <p className="text-[0.7rem] font-mono tracking-[0.1em] text-muted-foreground uppercase">
                    {lang === "bg" ? "Профил" : "Profile"}
                  </p>
                  <p className="mt-1 truncate font-display text-sm font-bold">
                    {userName || userEmail}
                  </p>
                </div>

                <Link
                  to="/profile"
                  onClick={() => setProfileMenuOpen(false)}
                  className="block px-4 py-3 text-[0.75rem] font-mono tracking-[0.15em] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground uppercase"
                >
                  {lang === "bg" ? "Профилни настройки" : "Profile Settings"}
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full border-t border-border/70 px-4 py-3 text-left text-[0.75rem] font-mono tracking-[0.15em] text-red-400 transition-colors hover:bg-surface/50 hover:text-red-300 uppercase"
                >
                  <span className="inline-flex items-center gap-2">
                    <LogOut className="size-3.5" />
                    {lang === "bg" ? "Изход" : "Logout"}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            // User is not logged in - show login button
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface/90 px-4 py-2.5 font-mono text-[0.6rem] font-medium tracking-[0.18em] text-foreground transition-transform duration-200 hover:-translate-y-0.5 hover:bg-surface"
            >
              <span>{lang === "bg" ? "ВХОД" : "LOGIN"}</span>
            </Link>
          )}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label={menuOpen ? "Затвори менюто" : "Отвори менюто"}
              aria-expanded={menuOpen}
              aria-controls="site-main-menu"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="grid size-10 place-items-center rounded-full border border-border bg-surface/90 text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-surface"
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>

            <div
              id="site-main-menu"
              className={`absolute right-0 top-full z-50 mt-3 w-[calc(100vw-1rem)] max-w-[28rem] overflow-hidden rounded-[2rem] border border-border/80 bg-background shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 sm:w-[28rem] ${
                menuOpen
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-2 opacity-0"
              }`}
            >
              <div className="border-b border-border/70 px-4 py-4 text-[0.9rem] font-mono tracking-[0.28em] text-muted-foreground uppercase">
                {lang === "bg" ? "Меню" : "Menu"}
              </div>

              <nav className="space-y-1.5 p-3">
                {menuItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    {...(item.to === "/" ? { activeOptions: { exact: true } } : {})}
                    className="group flex items-center justify-between rounded-[1.2rem] px-3 py-3.5 font-mono text-[1.05rem] tracking-[0.2em] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                    activeProps={{
                      className:
                        "flex items-center justify-between rounded-[1.2rem] bg-primary px-3 py-3.5 font-mono text-[1.05rem] tracking-[0.2em] text-primary-foreground",
                    }}
                  >
                    <span>{item.label}</span>
                    <span className="text-[1rem] text-current transition-transform group-hover:translate-x-1">
                      ›
                    </span>
                  </Link>
                ))}
              </nav>

              <div className="border-t border-border/70 p-3">
                <p className="mb-2 text-[0.9rem] font-mono tracking-[0.2em] text-muted-foreground uppercase">
                  {lang === "bg" ? "Език" : "Language"}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLang("bg");
                      setMenuOpen(false);
                    }}
                    className={`rounded-xl border px-3 py-2.5 font-mono text-[0.95rem] tracking-[0.18em] transition-colors ${
                      lang === "bg"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    BG
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLang("en");
                      setMenuOpen(false);
                    }}
                    className={`rounded-xl border px-3 py-2.5 font-mono text-[0.95rem] tracking-[0.18em] transition-colors ${
                      lang === "en"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLang("zh");
                      setMenuOpen(false);
                    }}
                    className={`rounded-xl border px-3 py-2.5 font-mono text-[0.95rem] tracking-[0.18em] transition-colors ${
                      lang === "zh"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    中文
                  </button>
                </div>
              </div>

              <div className="border-t border-border/70 p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-[0.9rem] tracking-[0.16em] text-foreground transition-colors hover:bg-surface-2"
                >
                  {theme === "dark" ? "LIGHT" : "DARK"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(true);
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 font-mono text-[0.9rem] tracking-[0.16em] text-foreground transition-colors hover:bg-surface-2"
                >
                  {lang === "bg" ? "НАСТРОЙКИ" : "SETTINGS"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {open && mounted
        ? createPortal(
            <Suspense fallback={null}>
              <SettingsPanel onClose={() => setOpen(false)} />
            </Suspense>,
            document.body,
          )
        : null}
    </header>
  );
}
