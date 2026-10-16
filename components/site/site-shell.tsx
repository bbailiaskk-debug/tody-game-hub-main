"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteSidebar } from "@/components/site/SiteSidebar";
import { SiteSettingsProvider } from "@/components/site/theme";
import { SiteTutorial } from "@/components/site/SiteTutorial";
import { showsFullBleed, showsRulesHint, showsSidebar } from "@/lib/site-shell";

/**
 * The part of the old TanStack `RootShell` that depended on the current route.
 *
 * App Router layouts are rendered once and shared by every route beneath them,
 * so the rail / header / footer decisions cannot be made in `layout.tsx` — they
 * have to happen in a client component that re-runs on navigation.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = showsFullBleed(pathname);
  const sidebar = showsSidebar(pathname);

  return (
    <SiteSettingsProvider>
      {/*
        Rendered here rather than from the layout: the rail reads language,
        theme and the accent colour through useSiteSettings, and the provider
        has to be above it — the <body> that the layout owns sits outside it.
      */}
      {sidebar ? <SiteSidebar /> : null}
      {fullBleed ? null : <SiteHeader />}
      {showsRulesHint(pathname) ? <SiteTutorial /> : null}
      {/*
        The rail is fixed and the column beside it is inset by the same
        variable, rather than a two-column grid: the header stays full-bleed
        across the content column and the pages below keep their own
        `mx-auto` centring, which a grid cell would have fought with.
        Below lg the inset is zero and the rail is display:none, so mobile is
        untouched.
      */}
      <div className={sidebar ? "lg:pl-[var(--sidebar-w)]" : undefined}>
        {children}
        {fullBleed ? null : (
          <footer className="border-t border-border/60 py-10">
            <div className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-between gap-3 px-6">
              <span className="label-mono text-[0.6rem]">TODOR KHRISTOV GAMING</span>
              <nav className="flex items-center gap-4" aria-label="Footer navigation">
                <Link href="/" className="label-mono text-[0.6rem] hover:text-foreground">
                  Начало
                </Link>
                <Link href="/games" className="label-mono text-[0.6rem] hover:text-foreground">
                  Игри
                </Link>
                <Link href="/rules" className="label-mono text-[0.6rem] hover:text-foreground">
                  Правила
                </Link>
                <Link href="/tutorial" className="label-mono text-[0.6rem] hover:text-foreground">
                  Туториал
                </Link>
                <Link href="/music" className="label-mono text-[0.6rem] hover:text-foreground">
                  Музика
                </Link>
                <Link href="/messages" className="label-mono text-[0.6rem] hover:text-foreground">
                  Съобщения
                </Link>
                <Link href="/info" className="label-mono text-[0.6rem] hover:text-foreground">
                  Информация
                </Link>
                <span className="label-mono text-[0.6rem]">© {new Date().getFullYear()}</span>
              </nav>
            </div>
          </footer>
        )}
      </div>
    </SiteSettingsProvider>
  );
}