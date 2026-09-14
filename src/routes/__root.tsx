import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?inline";
import criticalCss from "../critical.css?inline";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "../components/site/SiteHeader";
import { SiteSettingsProvider } from "../components/site/theme";
import { SplashScreen } from "../components/site/SplashScreen";

const FONT_PRELOADS = [
  { href: "/fonts/archivoblack-latin.woff2", type: "font/woff2" },
  { href: "/fonts/manrope-latin.woff2", type: "font/woff2" },
  { href: "/fonts/manrope-cyrillic.woff2", type: "font/woff2" },
  { href: "/fonts/jetbrainsmono-latin.woff2", type: "font/woff2" },
  { href: "/fonts/jetbrainsmono-cyrillic.woff2", type: "font/woff2" },
];

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h2 className="text-7xl font-bold text-foreground">404</h2>
        <h3 className="mt-4 text-xl font-semibold text-foreground">Page not found</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            onClick={(event) => {
              event.preventDefault();
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "google-site-verification",
        content: "FGgEUyiAle8jzX9D-hWVJLXOKgRJ0K5yTiMMmhnQz5o",
      },
      { property: "og:site_name", content: "Todor Khristov Gaming" },
      { property: "og:locale", content: "bg_BG" },
      { name: "theme-color", content: "#1DB954" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "icon", href: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { rel: "icon", href: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="bg" className="dark">
      <head>
        <title>Todor Khristov Gaming — Яки игри и забавление</title>
        <meta
          name="description"
          content="Игри, моменти и енергия директно от командния център на Todor Khristov Gaming."
        />
        <link rel="canonical" href="https://tody-game-hub.bbailiaskk.workers.dev/" />
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
        {FONT_PRELOADS.map((font) => (
          <link
            key={font.href}
            rel="preload"
            as="font"
            href={font.href}
            type={font.type}
            crossOrigin="anonymous"
          />
        ))}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  name: "Todor Khristov Gaming",
                  url: "https://tody-game-hub.bbailiaskk.workers.dev/",
                  description: "Яки игри и забавление с Todor Khristov Gaming",
                  inLanguage: "bg",
                },
                {
                  "@type": "Organization",
                  name: "Todor Khristov Gaming",
                  url: "https://tody-game-hub.bbailiaskk.workers.dev/",
                  logo: "https://tody-game-hub.bbailiaskk.workers.dev/images/og-image.jpg",
                  sameAs: [
                    "https://www.youtube.com/channel/UCBZMHdKCLVYkEPElCScTiFQ",
                    "https://www.tiktok.com/@todorkhristovgmaing",
                    "https://open.spotify.com/artist/0qeXEFSge1i8K1lC8np20g",
                    "https://discord.gg/uRNGhKf7vC",
                  ],
                },
              ],
            }),
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased selection:bg-primary selection:text-primary-foreground">
        {children}
        <footer className="border-t border-border/60 py-10">
          <div className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-between gap-3 px-6">
            <span className="label-mono text-[0.6rem]">TODOR KHRISTOV GAMING</span>
            <nav className="flex items-center gap-4" aria-label="Footer navigation">
              <Link to="/" className="label-mono text-[0.6rem] hover:text-foreground">
                Начало
              </Link>
              <Link to="/games" className="label-mono text-[0.6rem] hover:text-foreground">
                Игри
              </Link>
              <Link to="/music" className="label-mono text-[0.6rem] hover:text-foreground">
                Музика
              </Link>
              <Link to="/info" className="label-mono text-[0.6rem] hover:text-foreground">
                Информация
              </Link>
              <span className="label-mono text-[0.6rem]">© {new Date().getFullYear()}</span>
            </nav>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <SiteSettingsProvider>
      <SplashScreen />
      <SiteHeader />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </SiteSettingsProvider>
  );
}
