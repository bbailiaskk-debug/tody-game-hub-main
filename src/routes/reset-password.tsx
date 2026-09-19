import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { serverResetPassword } from "../lib/auth-functions";
import { useSiteSettings } from "../components/site/theme";
import { invalidateCachePrefix } from "../lib/remote-cache";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search["email"] === "string" ? search["email"] : "",
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const { email, token } = Route.useSearch();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!email || !token) {
      setError(
        isBg
          ? "Липсват данни за възстановяване. Поискайте нов линк."
          : isZh
            ? "缺少重置信息，请重新申请密码重置链接。"
            : "Missing reset details. Please request a new password reset link.",
      );
      return;
    }

    if (newPassword.length < 6) {
      setError(
        isBg
          ? "Паролата трябва да е поне 6 символа."
          : isZh
            ? "密码至少需要 6 个字符。"
            : "Password must be at least 6 characters long.",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(
        isBg
          ? "Паролите не съвпадат."
          : isZh
            ? "两次输入的密码不一致。"
            : "Passwords do not match.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const result = await serverResetPassword({
        data: {
          email,
          token,
          password: newPassword,
        },
      });

      if (!result.success) {
        setError(result.error ?? "The reset link could not be used.");
        return;
      }

      invalidateCachePrefix(`auth-login:${email.toLowerCase()}`);

      setNotice(
        isBg
          ? "Паролата е сменена успешно. Вече можете да влезете."
          : isZh
            ? "密码修改成功，现在可以登录。"
            : "Your password has been changed successfully. You can sign in now.",
      );
      setNewPassword("");
      setConfirmPassword("");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (caughtError) {
      console.warn("Password reset failed.", caughtError);
      setError(
        isBg
          ? "Линкът не може да бъде използван."
          : isZh
            ? "无法使用此重置链接。"
            : "The reset link could not be used.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid-bg flex min-h-[calc(100vh-68px)] items-center justify-center px-4 py-12 text-foreground">
      <div className="w-full max-w-md rounded-[2rem] border border-border bg-card/80 p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <p className="label-mono text-brand">TK GAMING</p>
        <h1 className="mt-4 font-display text-3xl">
          {isBg ? "Смяна на парола" : isZh ? "重置密码" : "Reset password"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isBg
            ? "Създайте нова сигурна парола за "
            : isZh
              ? "为以下账户创建新的安全密码："
              : "Create a new secure password for "}
          {email || (isBg ? "вашия акаунт" : isZh ? "你的账户" : "your account")}.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            {isBg ? "Нова парола" : isZh ? "新密码" : "New password"}
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
              autoComplete="new-password"
              required
            />
          </label>

          <label className="block text-sm">
            {isBg ? "Потвърдете новата парола" : isZh ? "确认新密码" : "Confirm new password"}
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-green-400">{notice}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting
              ? isBg
                ? "Обновяване..."
                : isZh
                  ? "更新中..."
                  : "Updating..."
              : isBg
                ? "Смени паролата"
                : isZh
                  ? "更新密码"
                  : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
