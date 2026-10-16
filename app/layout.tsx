import type { Metadata, Viewport } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

/*
 * Ported from the TanStack `__root.tsx`.
 *
 * What did NOT survive the move, and why:
 *
 *  - `critical.css` and the media="print" async-CSS dance around it. Those
 *    existed because Vite ships CSS as a separate hashed file the browser must
 *    fetch, and the inline critical sheet was a hand-maintained mirror of the
 *    rules above the fold. Next bundles the stylesheet into the document's
 *    render-blocking <head>, so there is nothing left to mirror and nothing to
 *    recover from a failed request.
 *  - `<HeadContent />` and `<Scripts />`. Next writes the document itself.
 *  - the `beforeLoad` auth guard on /messages and /music, which threw a
 *    `redirect`. App Router has no per-route beforeLoad, so those two pages
 *    redirect from inside the client component instead.
 */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TK Gaming",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    other: [
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
    ],
  },
  other: {
    "google-site-verification": "FGgEUyiAle8jzX9D-hWVJLXOKgRJ0K5yTiMMmhnQz5o",
    "og:site_name": "Todor Khristov Gaming",
    "og:locale": "bg_BG",
  },
};

export const viewport: Viewport = {
  themeColor: "#1DB954",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The first bytes of <head>. Literal values, no custom property and no
 * dependency on a stylesheet, so the canvas is the site's colour before the
 * stylesheet arrives — otherwise the browser paints its default white while
 * the rest of the head is still in flight, which is the frame FCP is measured
 * on. #161B16 is the site's own --background, kept in step with globals.css.
 */
const FIRST_PAINT = "html{background-color:#161B16;color-scheme:dark}";

const STRUCTURED_DATA = {
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
};

const SERVICE_WORKER = `if ("serviceWorker" in navigator) {
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
}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="bg"
      className="dark"
      style={{ colorScheme: "dark", backgroundColor: "#161B16" }}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: FIRST_PAINT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased selection:bg-primary selection:text-primary-foreground">
        <SiteShell>{children}</SiteShell>
        <script dangerouslySetInnerHTML={{ __html: SERVICE_WORKER }} />
      </body>
    </html>
  );
}