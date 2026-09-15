import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useSiteSettings } from "../components/site/theme";
import {
  serverRegister,
  serverGetUserProfile,
  serverLogin,
  serverRequestPasswordReset,
  serverSyncUserProfile,
  serverUserExists,
} from "../lib/auth-functions";
import {
  readRegisteredUsers,
  readPersistedAuthSession,
  readPersistedUserAccentColor,
  readPersistedUserProfile,
  parseStoredJson,
  writePersistedUserProfile,
  writePersistedAuthSession,
  writeRegisteredUsers,
  storageGet,
  storageSet,
} from "../lib/local-persistence";
import { verifyGoogleToken } from "../lib/verify-google-token";
import {
  EMAILJS_PASSWORD_RESET_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY,
  EMAILJS_SERVICE_ID,
} from "../lib/emailjs-config";
import { describeEmailJsError, sendEmailJsWithFallback } from "../lib/emailjs-send";

type GoogleCredentialResponse = { credential: string };
type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string>) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

type StoredUser = {
  name: string;
  email: string;
};

const welcomeSlides = [
  "/undraw_ai-response_gaip.png",
  "/undraw_audio-player_7uwh.png",
  "/undraw_listening_fz9g.png",
  "/undraw_retro-video-game_l9zp.png",
] as const;

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Вход — Todor Khristov Gaming" },
      {
        name: "description",
        content:
          "Влез в своя акаунт в Todor Khristov Gaming. Достъп до игри, музика и ексклузивно съдържание.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Вход — Todor Khristov Gaming" },
      {
        property: "og:description",
        content:
          "Влез в своя акаунт в Todor Khristov Gaming. Достъп до игри, музика и ексклузивно съдържание.",
      },
      { property: "og:url", content: "https://tody-game-hub.bbailiaskk.workers.dev/login" },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content: "https://tody-game-hub.bbailiaskk.workers.dev/images/og-image.jpg",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/jpeg" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:image",
        content: "https://tody-game-hub.bbailiaskk.workers.dev/images/og-image.jpg",
      },
    ],
    links: [
      { rel: "canonical", href: "https://tody-game-hub.bbailiaskk.workers.dev/login" },
      {
        rel: "alternate",
        hrefLang: "bg",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/login",
      },
      {
        rel: "alternate",
        hrefLang: "en",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/login?lang=en",
      },
      {
        rel: "alternate",
        hrefLang: "zh",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/login?lang=zh",
      },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: "https://tody-game-hub.bbailiaskk.workers.dev/login",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [birthday, setBirthday] = useState({ month: "", day: "", year: "" });
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [error, setError] = useState("");
  const [existingAccountEmail, setExistingAccountEmail] = useState("");
  const [errorTone, setErrorTone] = useState<"error" | "neutral">("error");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = readPersistedAuthSession();
    if (!session) return;

    const normalizedEmail = session.email.trim().toLowerCase();
    const profile = readPersistedUserProfile();
    const hasLocalAccount =
      profile?.email === normalizedEmail ||
      readRegisteredUsers().some(
        (user) => (user.email ?? "").trim().toLowerCase() === normalizedEmail,
      );

    if (hasLocalAccount) {
      window.location.replace("/");
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((slide) => (slide + 1) % welcomeSlides.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, []);

  const syncStoredUserProfile = useCallback(
    async (user: {
      name: string;
      email: string;
      password?: string | undefined;
      birthday?: string;
      gender?: string;
    }) => {
      const normalizedEmail = user.email.trim().toLowerCase();
      const users = readRegisteredUsers();
      const existingUser = users.find(
        (storedUser) => (storedUser.email ?? "").trim().toLowerCase() === normalizedEmail,
      );

      const birthdayValue = user.birthday ?? existingUser?.birthday ?? "";
      const genderValue = user.gender ?? existingUser?.gender ?? "";

      const nextUser = {
        name: user.name,
        email: normalizedEmail,
        ...(birthdayValue ? { birthday: birthdayValue } : {}),
        ...(genderValue ? { gender: genderValue } : {}),
      };

      const nextUsers = existingUser
        ? users.map((storedUser) =>
            (storedUser.email ?? "").trim().toLowerCase() === normalizedEmail
              ? nextUser
              : storedUser,
          )
        : [...users, nextUser];

      writeRegisteredUsers(nextUsers);
      writePersistedUserProfile({
        name: user.name,
        email: normalizedEmail,
        birthday: birthdayValue,
        gender: genderValue,
      });
    },
    [],
  );

  const signIn = useCallback(
    (
      user: StoredUser & {
        password?: string;
        birthday?: string;
        gender?: string;
        accentColor?: string;
      },
      token?: string,
    ) => {
      const secureCookie =
        window.location.protocol === "https:" ? "; Secure; SameSite=None" : "; SameSite=Lax";
      const safeToken = token?.trim();

      if (safeToken) {
        document.cookie = `siteSession=${encodeURIComponent(safeToken)}; path=/; max-age=${60 * 60 * 24 * 365}${secureCookie}`;
      }

      const nextBirthday = user.birthday ?? "";
      const nextGender = user.gender ?? "";
      const nextAccentColor =
        user.accentColor ?? readPersistedUserAccentColor(user.email) ?? "#40cc3c";

      void syncStoredUserProfile({
        name: user.name,
        email: user.email,
        ...(user.password !== undefined ? { password: user.password } : {}),
        ...(nextBirthday ? { birthday: nextBirthday } : {}),
        ...(nextGender ? { gender: nextGender } : {}),
      });

      const syncPromise = serverSyncUserProfile({
        data: {
          email: user.email,
          name: user.name,
          ...(user.password !== undefined ? { password: user.password } : {}),
          ...(nextBirthday ? { birthday: nextBirthday } : {}),
          ...(nextGender ? { gender: nextGender } : {}),
          accentColor: nextAccentColor,
        },
      }).catch((error) => {
        console.warn("Profile sync to server failed.", error);
        return null;
      });

      writePersistedUserProfile({
        name: user.name,
        email: user.email,
        birthday: nextBirthday,
        gender: nextGender,
        accentColor: nextAccentColor,
      });
      if (safeToken) {
        storageSet("siteSessionToken", safeToken);
      }
      writePersistedAuthSession({
        email: user.email,
        name: user.name,
        ...(safeToken ? { token: safeToken } : {}),
      });

      const avatarPromise = serverGetUserProfile({ data: { email: user.email } })
        .then((result) => {
          if (result.success && result.data && result.data.avatar) {
            writePersistedUserProfile({ avatar: result.data.avatar });
          }
          return null;
        })
        .catch(() => null);

      window.dispatchEvent(new Event("userStateChanged"));
      void Promise.all([syncPromise, avatarPromise]).finally(() => window.location.replace("/"));
    },
    [syncStoredUserProfile],
  );

  useEffect(() => {
    const clientId = import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined;
    if (!clientId || !googleButtonRef.current) return;
    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setSubmitting(true);
          setError("");
          const profile = await verifyGoogleToken({ data: { credential } });
          if (!profile) {
            setError(
              isBg ? "Google входът не беше успешен." : "Google sign-in was not successful.",
            );
            setSubmitting(false);
            return;
          }

          const storedUsers = storageGet("registeredUsers");
          const parsedUsers = parseStoredJson<unknown>(storedUsers, []);
          const users = Array.isArray(parsedUsers) ? (parsedUsers as StoredUser[]) : [];
          if (!users.some((user) => user.email === profile.email)) {
            writeRegisteredUsers([...users, { name: profile.name, email: profile.email }]);
          }
          signIn(profile);
        },
      });
      googleButtonRef.current.replaceChildren();
      const googleWidth = Math.round(
        Math.max(240, Math.min(360, googleButtonRef.current.clientWidth || 360)),
      );
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: String(googleWidth),
        text: "signin_with",
      });
    };

    const existingScript = document.getElementById("google-identity-services");
    if (existingScript) {
      renderGoogleButton();
      return;
    }

    const script = document.createElement("script");
    script.id = "google-identity-services";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.head.appendChild(script);
  }, [isBg, signIn]);

  const requestPasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError(
        isBg ? "Въведи имейл за смяна на паролата." : "Enter an email to reset your password.",
      );
      return;
    }

    setSubmitting(true);
    setError("");
    setErrorTone("error");
    setNotice("");

    try {
      const result = await serverRequestPasswordReset({
        data: {
          email: normalizedEmail,
        },
      });

      if (!result.success || !result.data) {
        setError(
          isBg
            ? "Не е намерен акаунт с този имейл."
            : isZh
              ? "未找到使用此邮箱的账户。"
              : "No account was found for this email.",
        );
        setSubmitting(false);
        return;
      }

      const resetUrl = `${window.location.origin}/reset-password?email=${encodeURIComponent(normalizedEmail)}&token=${encodeURIComponent(result.data.token)}`;
      await sendEmailJsWithFallback(
        EMAILJS_SERVICE_ID,
        EMAILJS_PASSWORD_RESET_TEMPLATE_ID,
        {
          email: normalizedEmail,
          name: result.data.name,
          to_email: normalizedEmail,
          to_name: result.data.name,
          passcode: resetUrl,
          code: resetUrl,
          link: resetUrl,
          url: resetUrl,
          resetUrl,
          reset_url: resetUrl,
          reset_link: resetUrl,
          resetLink: resetUrl,
        },
        EMAILJS_PUBLIC_KEY,
      );

      setNotice(
        isBg ? "Линкът е изпратен успешно!" : "We sent a password reset link to your email.",
      );
    } catch (caughtError) {
      console.warn("Password reset email failed.", caughtError);
      setErrorTone("error");
      const detail = describeEmailJsError(caughtError);
      setError(
        `${isBg ? "Имейлът не можа да бъде изпратен. Опитайте отново." : isZh ? "邮件暂时无法发送，请稍后重试。" : "The email could not be sent right now. Please try again."} (${detail})`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setExistingAccountEmail("");
    setErrorTone("error");
    setNotice("");

    const normalizedEmail = email.trim().toLowerCase();

    if (mode === "register") {
      if (!name.trim() || !normalizedEmail || !password) {
        setError(isBg ? "Попълни всички полета." : "Please fill in all fields.");
        return;
      }
      if (password.length < 6) {
        setError(
          isBg ? "Паролата трябва да е поне 6 символа." : "Password must be at least 6 characters.",
        );
        return;
      }
      if (password !== confirmPassword) {
        setError(isBg ? "Паролите не съвпадат." : "Passwords do not match.");
        return;
      }

      let birthdayString = "";
      if (birthday.year && birthday.month && birthday.day) {
        birthdayString = `${birthday.year}-${birthday.month.padStart(2, "0")}-${birthday.day.padStart(2, "0")}`;
      }

      const newUser = { name: name.trim(), email: normalizedEmail, password };
      const storedUser = readRegisteredUsers().find(
        (user) => (user.email ?? "").trim().toLowerCase() === normalizedEmail,
      );
      if (storedUser) {
        setError(
          isBg
            ? "Този имейл вече има регистриран акаунт."
            : isZh
              ? "此邮箱已经注册了账户。"
              : "This email already has a registered account.",
        );
        return;
      }
      setSubmitting(true);
      try {
        const result = await serverRegister({
          data: {
            ...newUser,
            ...(birthdayString ? { birthday: birthdayString } : {}),
            ...(gender ? { gender } : {}),
          },
        });

        if (!result.success || !result.data) {
          setError(
            isBg
              ? "Този имейл вече има регистриран акаунт."
              : isZh
                ? "此邮箱已经注册了账户。"
                : "This email already has a registered account.",
          );
          setSubmitting(false);
          return;
        }

        const authenticatedUser = {
          name: result.data.name,
          email: result.data.email,
          ...(result.data.birthday !== undefined ? { birthday: result.data.birthday } : {}),
          ...(result.data.gender !== undefined ? { gender: result.data.gender } : {}),
          ...(result.data.accentColor !== undefined
            ? { accentColor: result.data.accentColor }
            : {}),
        };
        signIn(authenticatedUser, result.data.token);
      } catch (caughtError) {
        console.warn("Registration failed.", caughtError);
        setError(
          isBg
            ? "Регистрацията не беше успешна. Опитайте отново."
            : isZh
              ? "注册失败，请重试。"
              : "Registration failed. Please try again.",
        );
        setSubmitting(false);
      }
      return;
    }

    try {
      const existsResult = await serverUserExists({
        data: { email: normalizedEmail },
      });

      if (!existsResult.success || !existsResult.data || !existsResult.data.exists) {
        setError(
          isBg
            ? "Няма регистриран профил с този имейл. Натисни „Регистрация“, за да създадеш акаунт."
            : "There is no registered profile with this email. Select Register to create an account.",
        );
        setNotice("");
        setSubmitting(false);
        return;
      }

      const result = await serverLogin({
        data: {
          email: normalizedEmail,
          password,
        },
      });
      if (!result.success || !result.data) {
        setError(isBg ? "Невалиден имейл или парола." : "Invalid email or password.");
        setNotice("");
        setSubmitting(false);
        return;
      }

      const user = {
        name: result.data.name,
        email: result.data.email,
        password,
        birthday: result.data.birthday,
        gender: result.data.gender,
        accentColor: result.data.accentColor,
      };
      signIn(user, result.data.token);
      return;
    } catch (caughtError) {
      console.warn("Login failed on server.", caughtError);
      setError(isBg ? "Невалиден имейл или парола." : "Invalid email or password.");
      setNotice("");
      setSubmitting(false);
      return;
    }
  };

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setError("");
  };

  return (
    <main className="grid-bg flex min-h-[calc(100vh-68px)] items-center justify-center px-4 py-8 text-foreground sm:px-6 sm:py-12">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border bg-card/80 shadow-2xl backdrop-blur-md lg:grid-cols-[0.95fr_1.05fr]">
        <div className="relative hidden min-h-[620px] overflow-hidden bg-brand p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
          <div className="relative z-10">
            <p className="label-mono text-primary-foreground">TK GAMING</p>
            <p className="mt-5 max-w-sm font-display text-4xl leading-tight">
              {isBg ? "Влез в своя свят" : isZh ? "进入你的世界" : "Enter your world."}
            </p>
            <p className="mt-4 max-w-xs text-sm text-primary-foreground">
              {isBg
                ? "Игри, музика и твоят профил на едно място."
                : isZh
                  ? "游戏、音乐和个人资料尽在一处。"
                  : "Games, music, and your profile in one place."}
            </p>
          </div>
          <div
            aria-label="Todor Khristov Gaming music illustration"
            className={`welcome-slide-${activeSlide} relative z-10 mx-auto h-[280px] w-full max-w-sm bg-contain bg-center bg-no-repeat drop-shadow-2xl transition-opacity duration-500`}
            role="img"
          />
          <div
            className="relative z-10 flex justify-center gap-2"
            aria-label={isBg ? "Слайдове" : "Slides"}
          >
            {welcomeSlides.map((slide, index) => (
              <button
                key={slide}
                type="button"
                onClick={() => setActiveSlide(index)}
                className={`size-2 rounded-full transition-all ${index === activeSlide ? "w-6 bg-primary-foreground" : "bg-primary-foreground/30"}`}
                aria-label={`${isBg ? "Слайд" : "Slide"} ${index + 1}`}
              />
            ))}
          </div>
          <div className="absolute -bottom-24 -left-16 size-72 rounded-full border-[32px] border-primary-foreground/10" />
          <div className="absolute -right-24 top-24 size-80 rounded-full border-[42px] border-primary-foreground/10" />
        </div>

        <div className="p-6 sm:p-10 lg:p-14">
          <div className="mb-8">
            <p className="label-mono mb-3 text-brand lg:hidden">TK GAMING</p>
            <h1 className="font-display text-3xl sm:text-4xl">
              {mode === "login"
                ? isBg
                  ? "Вход в акаунта"
                  : isZh
                    ? "登录"
                    : "Sign in"
                : isBg
                  ? "Създай акаунт"
                  : isZh
                    ? "创建账户"
                    : "Create account"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "login"
                ? isBg
                  ? "Влез, за да видиш своя профил на всички устройства."
                  : isZh
                    ? "登录后即可在所有设备上访问你的个人资料。"
                    : "Sign in to access your profile on every device."
                : isBg
                  ? "Регистрацията е обща за всички устройства."
                  : isZh
                    ? "你的注册信息可在所有设备上使用。"
                    : "Your registration is shared across all devices."}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {isBg
                ? "Тук можеш да създадеш своя профил, да следиш личните си предпочитания, да запазваш избраните игри и да се връщаш към любимата си музика и атмосфера по всяко време. Всичко е направено така, че да е удобно, бързо и създадено за гейминг общност, която цени стил и комуникация."
                : isZh
                  ? "你可以在这里创建个人资料、管理偏好、保存喜欢的游戏，并随时回到喜爱的音乐和氛围中。一切都为注重风格、交流和社区体验的玩家而设计，方便又快捷。"
                  : "Here you can create your profile, keep your preferences, save favorite titles, and return to your music and atmosphere whenever you want. Everything is designed to feel quick, comfortable, and tailored for a gaming community that values style, access, and connection."}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-xl bg-surface p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {isBg ? "Вход" : isZh ? "登录" : "Login"}
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${mode === "register" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {isBg ? "Регистрация" : isZh ? "注册" : "Register"}
            </button>
          </div>

          {mode === "login" && import.meta.env["VITE_GOOGLE_CLIENT_ID"] && (
            <>
              <div ref={googleButtonRef} className="mb-5 flex min-h-10 justify-center" />
              <div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>{isBg ? "или с email" : isZh ? "或使用邮箱" : "or use email"}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <label className="block text-sm">
                {isBg ? "Име" : isZh ? "姓名" : "Name"}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
                  autoComplete="name"
                />
              </label>
            )}
            <label className="block text-sm">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
                autoComplete="email"
                required
              />
            </label>

            {mode === "register" && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm">
                    {isBg ? "Рожден ден" : isZh ? "生日" : "Birthday"}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={birthday.month}
                      onChange={(e) => setBirthday({ ...birthday, month: e.target.value })}
                      className="min-w-0 w-full rounded-lg border border-border bg-background px-2 py-2.5 text-sm outline-none focus:border-primary"
                    >
                      <option value="">{isBg ? "Месец" : isZh ? "月份" : "Month"}</option>
                      {Array.from({ length: 12 }, (_, i) => {
                        const monthNum = (i + 1).toString().padStart(2, "0");
                        const monthName = new Date(2024, i, 1).toLocaleDateString(
                          isBg ? "bg-BG" : "en-US",
                          {
                            month: "short",
                          },
                        );
                        return (
                          <option key={i} value={monthNum}>
                            {monthName}
                          </option>
                        );
                      })}
                    </select>
                    <select
                      value={birthday.day}
                      onChange={(e) => setBirthday({ ...birthday, day: e.target.value })}
                      className="min-w-0 w-full rounded-lg border border-border bg-background px-2 py-2.5 text-sm outline-none focus:border-primary"
                    >
                      <option value="">{isBg ? "Ден" : isZh ? "日期" : "Day"}</option>
                      {Array.from({ length: 31 }, (_, i) =>
                        (i + 1).toString().padStart(2, "0"),
                      ).map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                    <select
                      value={birthday.year}
                      onChange={(e) => setBirthday({ ...birthday, year: e.target.value })}
                      className="min-w-0 w-full rounded-lg border border-border bg-background px-2 py-2.5 text-sm outline-none focus:border-primary"
                    >
                      <option value="">{isBg ? "Година" : isZh ? "年份" : "Year"}</option>
                      {Array.from({ length: 100 }, (_, i) => {
                        const year = new Date().getFullYear() - i;
                        return (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm">{isBg ? "Пол" : isZh ? "性别" : "Gender"}</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setGender("male")}
                      className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        gender === "male"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-background text-foreground hover:border-primary"
                      }`}
                    >
                      {isBg ? "Мъжки" : isZh ? "男" : "Male"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender("female")}
                      className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        gender === "female"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-background text-foreground hover:border-primary"
                      }`}
                    >
                      {isBg ? "Женски" : isZh ? "女" : "Female"}
                    </button>
                  </div>
                </div>
              </>
            )}
            <label className="block text-sm">
              {isBg ? "Парола" : isZh ? "密码" : "Password"}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>
            {mode === "register" && (
              <label className="block text-sm">
                {isBg ? "Повтори паролата" : isZh ? "确认密码" : "Confirm password"}
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
                  autoComplete="new-password"
                  required
                />
              </label>
            )}
            {error && (
              <div className="space-y-2" role="alert">
                <p
                  className={`text-sm ${errorTone === "neutral" ? "text-muted-foreground" : "text-red-400"}`}
                >
                  {error}
                </p>
                {(existingAccountEmail || error.toLowerCase().includes("already exists")) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      if (existingAccountEmail) setEmail(existingAccountEmail);
                      setError("");
                      setExistingAccountEmail("");
                      setNotice("");
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    className="text-sm font-medium text-brand hover:opacity-90"
                  >
                    {isBg ? "Вход" : "Sign in"}
                  </button>
                )}
              </div>
            )}
            {notice && (
              <p className="text-sm text-green-400" role="status">
                {notice}
              </p>
            )}
            {mode === "login" && (
              <button
                type="button"
                onClick={() => void requestPasswordReset()}
                className="w-full text-left text-sm font-medium text-brand hover:opacity-90"
              >
                {isBg ? "Забравена парола?" : isZh ? "忘记密码？" : "Forgot password?"}
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {submitting
                ? isBg
                  ? "Изпращане..."
                  : isZh
                    ? "发送中..."
                    : "Sending..."
                : mode === "login"
                  ? isBg
                    ? "Влез"
                    : isZh
                      ? "登录"
                      : "Sign in"
                  : isBg
                    ? "Регистрирай се"
                    : isZh
                      ? "创建账户"
                      : "Create account"}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-border bg-surface/60 p-4 text-sm leading-relaxed text-muted-foreground">
            {isBg
              ? "След влизането в акаунта ще имаш достъп до персонализирани настройки, запазени предпочитания и още по-подробно изживяване в средата на канала. Това е мястото, където твоят гейминг профил, музиката и общността се свързват в едно удобно пространство."
              : isZh
                ? "登录后，你将获得个性化设置、已保存的偏好，以及更完整的频道体验。你的游戏资料、音乐和社区会在这里汇聚成一个简单便捷的空间。"
                : "After signing in, you will have access to personalized settings, saved preferences, and a richer experience inside the channel ecosystem. This is where your gaming profile, music, and community all meet in one simple, convenient space."}
          </div>
        </div>
      </section>
    </main>
  );
}
