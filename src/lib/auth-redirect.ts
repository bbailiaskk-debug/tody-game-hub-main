const POST_LOGIN_REDIRECT_KEY = "tody-post-login-redirect";
const PROTECTED_PATHS = new Set([
  "/ai",
  "/airhockey",
  "/beatbattle",
  "/calendar",
  "/candycrush",
  "/chess",
  "/crystalrealm",
  "/ddlc",
  "/dino",
  "/game2048",
  "/games",
  "/messages",
  "/music",
  "/prismheart",
  "/profile",
  "/prompt-lab",
  "/streamer",
  "/sudoku",
  "/tetris",
  "/tictactoe",
  "/tutorial",
  "/wordle",
]);

export function requiresAuthentication(pathname: string) {
  return PROTECTED_PATHS.has(pathname);
}

export function savePostLoginRedirect(storage: Storage, path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  if (!requiresAuthentication(pathname)) return false;
  storage.setItem(POST_LOGIN_REDIRECT_KEY, path);
  return true;
}

export function consumePostLoginRedirect(storage: Storage) {
  const path = storage.getItem(POST_LOGIN_REDIRECT_KEY);
  storage.removeItem(POST_LOGIN_REDIRECT_KEY);
  if (!path?.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  return requiresAuthentication(pathname) ? path : "/";
}
