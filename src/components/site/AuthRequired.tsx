import { Link } from "@tanstack/react-router";
import { LoaderCircle, Lock, LogIn, RotateCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { serverValidateAuthSession } from "../../lib/auth-functions";
import { readPersistedAuthSession } from "../../lib/local-persistence";
import { savePostLoginRedirect } from "../../lib/auth-redirect";
import { useSiteSettings } from "./theme";

type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "error";

export function AuthRequired({ children }: { children: ReactNode }) {
  const { lang } = useSiteSettings();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const session = readPersistedAuthSession();
    if (!session?.token) {
      setStatus("unauthenticated");
      return () => {
        active = false;
      };
    }

    setStatus("checking");
    void serverValidateAuthSession({ data: { email: session.email, token: session.token } })
      .then(({ valid }) => {
        if (active) setStatus(valid ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [retry]);

  useEffect(() => {
    if (status !== "unauthenticated") return;
    try {
      savePostLoginRedirect(
        window.sessionStorage,
        `${window.location.pathname}${window.location.search}`,
      );
    } catch (error) {
      console.warn("Could not save the protected page for after sign-in.", error);
    }
    window.location.replace("/login");
  }, [status]);

  if (status === "authenticated") return children;

  const copy =
    lang === "zh"
      ? {
          title: "需要登录",
          checking: "正在验证账户…",
          error: "暂时无法验证登录状态。请检查网络后重试。",
          retry: "重试",
          login: "登录账户",
        }
      : lang === "en"
        ? {
            title: "Sign-in required",
            checking: "Checking your account…",
            error: "Your sign-in could not be verified. Check your connection and try again.",
            retry: "Try again",
            login: "Sign in",
          }
        : {
            title: "Необходим е вход",
            checking: "Проверяваме профила ти…",
            error: "Входът не може да бъде проверен. Провери връзката и опитай отново.",
            retry: "Опитай отново",
            login: "Вход в профила",
          };

  return (
    <main className="grid-bg flex min-h-[calc(100vh-68px)] items-center justify-center px-6 py-20">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-[0_20px_70px_rgba(0,0,0,0.28)] sm:p-10">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl border border-brand/30 bg-brand/10 text-brand">
          {status === "checking" ? (
            <LoaderCircle className="size-7 animate-spin" />
          ) : (
            <Lock className="size-7" />
          )}
        </span>
        <h1 className="mt-6 font-display text-3xl font-bold text-foreground">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {status === "checking" ? copy.checking : status === "error" ? copy.error : null}
        </p>
        {status === "error" ? (
          <button
            type="button"
            onClick={() => setRetry((current) => current + 1)}
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 font-mono text-xs font-bold tracking-[0.14em] text-foreground transition hover:border-primary hover:text-primary"
          >
            <RotateCw className="size-4" />
            {copy.retry}
          </button>
        ) : null}
        {status === "unauthenticated" ? (
          <Link
            to="/login"
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-mono text-xs font-bold tracking-[0.14em] text-primary-foreground transition hover:bg-primary/90"
          >
            <LogIn className="size-4" />
            {copy.login}
          </Link>
        ) : null}
      </section>
    </main>
  );
}
