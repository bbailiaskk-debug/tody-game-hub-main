import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCssUrl from "../styles.css?url";
import criticalCss from "../critical.css?inline";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "../components/site/SiteHeader";
import { SiteSettingsProvider, useSiteSettings } from "../components/site/theme";
import { SplashScreen } from "../components/site/SplashScreen";

/**
 * The page for a URL that is not here.
 *
 * Localised like everything else, because this is the one page somebody arrives at
 * from outside — a link in a chat, a bookmark, a search result — and an English
 * sentence on a Bulgarian site is the first thing they read.
 *
 * The heading is an `h1` rather than the second and third levels it used to be, for
 * the same reason every other page has one: a page whose main heading is an `h2`
 * has no heading as far as a reader — human or crawler — is concerned, and this is
 * exactly the page a crawler reaches when it follows a stale link.
 */
function NotFoundComponent() {
  const { lang } = useSiteSettings();
  const copy =
    lang === "bg"
      ? {
          code: "404",
          title: "Страницата не е намерена",
          body: "Страницата, която търсиш, не съществува или е преместена.",
          home: "Към началото",
        }
      : lang === "zh"
        ? {
            code: "404",
            title: "页面未找到",
            body: "你找的页面不存在或已被移动。",
            home: "回到首页",
          }
        : {
            code: "404",
            title: "Page not found",
            body: "The page you're looking for doesn't exist or has been moved.",
            home: "Go home",
          };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-7xl font-bold text-foreground">{copy.code}</p>
        <h1 className="mt-4 text-xl font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {copy.home}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  if (import.meta.env.DEV) console.error(error);
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
      { name: "theme-color", content: "#161B16" },
      // iOS ignores the manifest when a page is added to the home screen, so it
      // is told here as well: full screen, with the site's own bar colour.
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
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * A route that owns the whole window, with no site furniture around it.
 *
 * The header already respected this. The footer did not, and it is not a small
 * thing on a full height page: the chat fills the viewport exactly, so a footer
 * under it pushed the document past the screen and left a scrollbar with nowhere
 * to scroll. That is what F11 exposed — a fullscreen window has no browser chrome
 * left to hide the overflow behind.
 *
 * Checked here in the shell rather than in the document, because the footer lives
 * in the shell and the header in the component: they were written as two separate
 * decisions about the same idea, and only one of them knew.
 */
const FULL_BLEED_ROUTES = ["/messages"];

const isFullBleed = (pathname: string) =>
  FULL_BLEED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

function RootShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = isFullBleed(pathname);

  return (
    <html
      lang="bg"
      className="dark"
      style={{ backgroundColor: "#161B16", colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        <style>{`html, body { background-color: #161B16 !important; margin: 0; }`}</style>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  var forced=new URLSearchParams(window.location.search).get("splash");
  var suppressed=forced==="0"||forced==="false";
  if(!suppressed){try{suppressed=!!window.sessionStorage.getItem("tk-splash-done");}catch(e){}}
  if(suppressed)document.documentElement.setAttribute("data-splash-suppressed","");
})();`,
          }}
        />
        <link rel="stylesheet" href={appCssUrl} id="app-css" suppressHydrationWarning />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  var l=document.getElementById("app-css");if(!l)return;
  function apply(){
    document.documentElement.setAttribute("data-css-on","");
  }
  l.addEventListener("load",apply,{once:true});
  l.addEventListener("error",function(){console.warn("Application stylesheet failed to load:",l.href);},{once:true});
  try{if(l.sheet&&l.sheet.cssRules.length)apply();}catch(e){apply();}
})();`,
          }}
        />
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
                  logo: "https://tody-game-hub.bbailiaskk.workers.dev/images/og-share.jpg",
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
      <body
        className="bg-background text-foreground min-h-screen antialiased selection:bg-primary selection:text-primary-foreground"
        style={{ backgroundColor: "#161B16", colorScheme: "dark" }}
      >
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
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js")
      .then(function (registration) {
        console.log("ServiceWorker registered:", registration.scope);
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

/**
 * Routes that own the whole window.
 *
 * The header is 68px, and on a chat that is a strip of the screen taken from the
 * conversation for a row of links the person is not using while they are talking
 * to somebody. On these routes it is not rendered at all, so what is left is the
 * chat, edge to edge, and there is no height for it to be short of.
 *
 * `/` keeps it: it is the way back, and a page that is the way back does not hide
 * the way back.
 *
 * The footer is held back by the same list, but only on these routes. Everywhere
 * else the pages scroll, and a footer at the bottom of a long page is the one
 * place its links sit at a size anybody reads.
 */
function RootComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = isFullBleed(pathname);

  return (
    <SiteSettingsProvider>
      <SplashScreen />
      {fullBleed ? null : <SiteHeader />}
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </SiteSettingsProvider>
  );
}
