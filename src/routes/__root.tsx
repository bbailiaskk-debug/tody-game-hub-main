import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import appCssUrl from "../styles.css?url";
import criticalCss from "../critical.css?inline";
import { SITE_URL } from "../lib/seo";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "../components/site/SiteHeader";
import { SiteSidebar } from "../components/site/SiteSidebar";
import { SiteSettingsProvider } from "../components/site/theme";
import { SiteTutorial } from "../components/site/SiteTutorial";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-7xl font-bold text-foreground">404</p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Страницата не е намерена</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Страницата, която търсиш, не съществува или е преместена.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Към началото
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  if (import.meta.env.DEV) console.error(error);
  const router = useRouter();
  const [recoveryFailed, setRecoveryFailed] = useState(false);

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Страницата не се зареди
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Възникна неочаквана грешка. Опитай отново или презареди страницата.
        </p>
        {recoveryFailed ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Повторният опит не успя. Презареди страницата, за да опиташ отново.
          </p>
        ) : null}
        {import.meta.env.DEV && error?.message ? (
          <details className="mt-4 text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer">Технически подробности</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap">{error.message}</pre>
          </details>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRecoveryFailed(false);
              void router
                .invalidate()
                .then(() => {
                  reset();
                })
                .catch((retryError: unknown) => {
                  console.error("Root route recovery failed", retryError);
                  setRecoveryFailed(true);
                });
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Опитай отново
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Презареди страницата
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Към началото
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
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        name: "google-site-verification",
        content: "FGgEUyiAle8jzX9D-hWVJLXOKgRJ0K5yTiMMmhnQz5o",
      },
      { property: "og:site_name", content: "Todor Khristov Gaming" },
      { property: "og:locale", content: "bg_BG" },
      { name: "theme-color", content: "#1DB954" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "TK Gaming" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "icon", href: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { rel: "icon", href: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "sitemap", type: "application/xml", href: `${SITE_URL}/sitemap.xml` },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const FULL_BLEED_ROUTES = ["/messages"];
const isFullBleed = (pathname: string) =>
  FULL_BLEED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

/*
 * Routes that supply their own full-screen layout and must not be wrapped in
 * the desktop rail. /messages already opts out via FULL_BLEED_ROUTES; /ai is
 * a fixed-inset chat shell that covers the viewport on its own, so putting a
 * rail beside it would only push the conversation off-centre.
 */
const NO_SIDEBAR_ROUTES = ["/messages", "/ai"];
const showsSidebar = (pathname: string) =>
  !NO_SIDEBAR_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export const showsRulesHint = (pathname: string) => !isFullBleed(pathname);

function RootShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = isFullBleed(pathname);
  const sidebar = showsSidebar(pathname);

  return (
    <html
      lang="bg"
      className="dark"
      style={{ colorScheme: "dark", backgroundColor: "#161B16" }}
      suppressHydrationWarning
    >
      <head>
        {/*
          The very first bytes of <head>. Literal values, no custom properties
          and no dependency on a stylesheet, so the canvas is the site's colour
          from the moment the parser reaches this line — before the critical
          sheet below, before any network, and before any of it can fail.
          Without it the browser paints its default white while the rest of the
          head is still arriving, which is the white frame FCP is measured on.

          #161B16 is the site's own --background, kept in step with styles.css by
          hand. It is a literal rather than a custom property on purpose: this
          rule has to apply before the rest of the head, including the critical
          sheet that defines the tokens. Measured from a rendered pixel, so the
          first frame is the same colour as the last instead of shifting to it.
        */}
        <style
          dangerouslySetInnerHTML={{
            __html: "html{background-color:#161B16;color-scheme:dark}",
          }}
        />
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
        {/*
          Loaded without blocking the first paint: fetched at high priority by
          the preload, held off-screen by media="print", switched to "all" once
          it has arrived. The inline sheet above carries the first paint.

          This is safe because critical.css is generated, not hand-written —
          scripts/extract-critical-css.mjs renders the built page and keeps every
          rule matching the first viewport, and scripts/check-critical-css.mjs
          fails the build if that render stops matching the full stylesheet.
          Maintaining the mirror by hand is what made this arrangement show a
          broken layout before: 35 classes above the fold were missing and the
          header and hero buttons rendered collapsed.

          The script below may not simply wait for `load`. `load` does not fire
          when the stylesheet fails, and media="print" is permanent until
          something flips it, so a single failed request pinned the whole page
          to critical.css forever: unstyled links, the browser's default font
          stack, the hero heading at 102px instead of 61px, and no recovery
          short of a manual reload. A cached HTML document outliving the
          hashed stylesheet it names is enough to trigger it, and so is a 504
          from the network.
          
          So it treats "did the rules actually arrive" as the only success
          signal, and it is checked on load, on error, and on a timer — because
          a cached response can report success while carrying nothing. A miss
          is re-requested under a fresh URL, which is the one cache layer this
          cannot answer: HTTP cache, Cache Storage and the service worker all
          key on the exact string, and a query that was never stored misses all
          three at once.
        */}
        <link rel="preload" href={appCssUrl} as="style" fetchPriority="high" />
        <link
          rel="stylesheet"
          href={appCssUrl}
          media="print"
          id="app-css"
          fetchPriority="high"
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
var l=document.getElementById("app-css");if(!l)return;
var settled=false;
function activate(){if(settled)return;settled=true;l.media="all";}
if(l.sheet){activate();return;}
l.addEventListener("load",activate,{once:true});

function recover(){
  if(settled)return;
  // A slow stylesheet has a sheet by now even though load has not fired yet.
  // Anything without rules is a miss, whatever the response said.
  if(l.sheet&&l.sheet.cssRules&&l.sheet.cssRules.length){activate();return;}
  settled=true;
  var href=l.getAttribute("href");
  // Nothing left to wait for: this link either failed outright or came back
  // carrying no rules, and leaving it in the document means getElementById
  // keeps handing out a stylesheet that can never style anything.
  l.remove();
  if(!href)return;
  var fresh=document.createElement("link");
  fresh.rel="stylesheet";
  // media="all" rather than the print/activate dance: the page has already
  // painted once, so holding the second one back would only buy a flash of
  // critical-only layout between the two.
  fresh.media="all";
  fresh.href=href+(href.indexOf("?")<0?"?":"&")+"tkg-css-retry="+Date.now();
  document.head.appendChild(fresh);
}
l.addEventListener("error",recover,{once:true});
setTimeout(recover,4000);
})();`,
          }}
        />
        <noscript>
          <link rel="stylesheet" href={appCssUrl} />
        </noscript>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  name: "Todor Khristov Gaming",
                  url: `${SITE_URL}/`,
                  description: "Яки игри и забавление с Todor Khristov Gaming",
                  inLanguage: "bg",
                },
                {
                  "@type": "Organization",
                  name: "Todor Khristov Gaming",
                  url: `${SITE_URL}/`,
                  logo: `${SITE_URL}/images/og-image.jpg`,
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
                  <Link to="/" className="label-mono text-[0.6rem] hover:text-foreground">
                    Начало
                  </Link>
                  <Link to="/games" className="label-mono text-[0.6rem] hover:text-foreground">
                    Игри
                  </Link>
                  <Link to="/rules" className="label-mono text-[0.6rem] hover:text-foreground">
                    Правила
                  </Link>
                  <Link to="/tutorial" className="label-mono text-[0.6rem] hover:text-foreground">
                    Туториал
                  </Link>
                  <Link to="/music" className="label-mono text-[0.6rem] hover:text-foreground">
                    Музика
                  </Link>
                  <Link to="/messages" className="label-mono text-[0.6rem] hover:text-foreground">
                    Съобщения
                  </Link>
                  <Link to="/info" className="label-mono text-[0.6rem] hover:text-foreground">
                    Информация
                  </Link>
                  <span className="label-mono text-[0.6rem]">© {new Date().getFullYear()}</span>
                </nav>
              </div>
            </footer>
          )}
        </div>
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ("serviceWorker" in navigator) {
window.addEventListener("load", function () {
            var hadController = Boolean(navigator.serviceWorker.controller);
            var refreshing = false;
            navigator.serviceWorker.addEventListener("controllerchange", function () {
            if (!hadController || refreshing) return;
            refreshing = true;
            window.location.reload();
            });
            navigator.serviceWorker
            .register("/sw.js", { updateViaCache: "none" })
            .then(function (registration) {
            console.log("ServiceWorker registered:", registration.scope);
            function activateWaitingWorker() {
            if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
            }
            activateWaitingWorker();
            registration.addEventListener("updatefound", function () {
            var installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", function () {
            if (installing.state === "installed") activateWaitingWorker();
            });
            });
            function updateWorker() {
            registration.update().catch(function (error) {
            console.warn("ServiceWorker update check failed:", error);
});
}
if (navigator.onLine) updateWorker();
window.addEventListener("online", updateWorker);
document.addEventListener("visibilitychange", function () {
if (document.visibilityState === "visible" && navigator.onLine) updateWorker();
});
})
.catch(function (error) {
console.warn("ServiceWorker registration failed:", error);
});
});
}`,
          }}
        />
      </body>
    </html>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = isFullBleed(pathname);

  return (
    <SiteSettingsProvider>
      {/*
        Rendered here rather than from RootShell: the rail reads language,
        theme and the accent colour through useSiteSettings, and the provider
        lives inside this component — the shell's <body> is outside it.
      */}
      {showsSidebar(pathname) ? <SiteSidebar /> : null}
      {fullBleed ? null : <SiteHeader />}
      {showsRulesHint(pathname) ? <SiteTutorial /> : null}
      <Outlet />
    </SiteSettingsProvider>
  );
}
