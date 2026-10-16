/**
 * Which pages get the desktop rail, the header and the rules hint.
 *
 * These live in `lib/` rather than in the layout because they are pure functions
 * over a pathname, and `lib/site-shell.test.ts` asserts against them directly.
 * The layout is a client component that calls them with `usePathname()`.
 */

const FULL_BLEED_ROUTES = ["/messages"];

const isFullBleed = (pathname: string) =>
  FULL_BLEED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

/**
 * Routes that supply their own full-screen layout and must not be wrapped in
 * the desktop rail. /messages already opts out via FULL_BLEED_ROUTES; /ai is
 * a fixed-inset chat shell that covers the viewport on its own, so putting a
 * rail beside it would only push the conversation off-centre.
 */
const NO_SIDEBAR_ROUTES = ["/messages", "/ai"];

export const showsSidebar = (pathname: string) =>
  !NO_SIDEBAR_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export const showsFullBleed = isFullBleed;

export const showsRulesHint = (pathname: string) => !isFullBleed(pathname);