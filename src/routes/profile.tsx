import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Trash2, Upload } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";

import { useSiteSettings } from "../components/site/theme";
import {
  serverDeleteAccount,
  serverGetUserProfile,
  serverLogin,
  serverRequestAccountDeletionCode,
  serverSyncUserProfile,
} from "../lib/auth-functions";
import {
  clearPersistedUserProfile,
  readPersistedUserAccentColor,
  readRegisteredUsers,
  writePersistedUserProfile,
  writeRegisteredUsers,
  storageGet,
  storageRemove,
  storageSet,
} from "../lib/local-persistence";
import { compressImageFile } from "../lib/image-utils";
import {
  EMAILJS_CODE_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY,
  EMAILJS_SERVICE_ID,
} from "../lib/emailjs-config";
import { describeEmailJsError, sendEmailJsWithFallback } from "../lib/emailjs-send";

type StoredUser = {
  name: string;
  email: string;
  birthday?: string;
  gender?: string;
};

export const Route = createFileRoute("/profile")({
  component: Profile,
});

function Profile() {
  const { lang } = useSiteSettings();
  const isBg = lang === "bg";
  const isZh = lang === "zh";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordMessageTone, setPasswordMessageTone] = useState<"error" | "success">("error");
  const [changingPassword, setChangingPassword] = useState(false);
  const [deletionModalOpen, setDeletionModalOpen] = useState(false);
  const [deletionCode, setDeletionCode] = useState("");
  const [deletionMessage, setDeletionMessage] = useState("");
  const [deletionMessageTone, setDeletionMessageTone] = useState<"error" | "success">("error");
  const [deletionCodeSent, setDeletionCodeSent] = useState(false);
  const [requestingDeletionCode, setRequestingDeletionCode] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const currentEmail = storageGet("currentUserEmail")?.trim().toLowerCase() ?? "";
      const userEmail = storageGet("userEmail")?.trim().toLowerCase() ?? "";
      const profileEmail = currentEmail || userEmail;
      const users = readRegisteredUsers();

      const activeUser =
        users.find((user) => (user.email ?? "").trim().toLowerCase() === currentEmail) ??
        users.find((user) => (user.email ?? "").trim().toLowerCase() === userEmail) ??
        null;

      const nextEmail =
        storageGet("userEmail") ?? activeUser?.email ?? currentEmail ?? userEmail ?? "";
      let nextBirthday = activeUser?.birthday ?? storageGet("userBirthday") ?? "";
      let nextGender = activeUser?.gender ?? storageGet("userGender") ?? "";
      let nextName = storageGet("userName") ?? activeUser?.name ?? "";
      let nextAvatar = storageGet("userAvatar") ?? null;

      if (profileEmail) {
        try {
          const result = await serverGetUserProfile({ data: { email: profileEmail } });
          if (result.success && result.data) {
            nextName = result.data.name || nextName;
            nextBirthday = result.data.birthday || nextBirthday;
            nextGender = result.data.gender || nextGender;
            if (result.data.avatar) nextAvatar = result.data.avatar;
            writePersistedUserProfile({
              name: result.data.name,
              email: result.data.email,
              birthday: result.data.birthday,
              gender: result.data.gender,
              accentColor: result.data.accentColor,
              ...(result.data.avatar ? { avatar: result.data.avatar } : {}),
            });
          }
        } catch (error) {
          console.warn("Failed to hydrate profile from backend.", error);
        }
      }

      setName(nextName);
      setEmail(nextEmail);
      setBirthday(nextBirthday);
      setGender(nextGender);
      setAvatar(nextAvatar);
    };

    loadProfile();
    window.addEventListener("userStateChanged", loadProfile);

    return () => window.removeEventListener("userStateChanged", loadProfile);
  }, []);

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    try {
      const compressed = await compressImageFile(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        maxBytes: 250_000,
        quality: 0.7,
      });

      setAvatar(compressed);
      storageSet("userAvatar", compressed);
      writePersistedUserProfile({ avatar: compressed });
      const activeEmail = (email || storageGet("currentUserEmail") || "").trim().toLowerCase();
      if (activeEmail) {
        void serverSyncUserProfile({ data: { email: activeEmail, avatar: compressed } }).catch(
          (syncError) => console.warn("Avatar sync failed.", syncError),
        );
      }
      window.dispatchEvent(new Event("userStateChanged"));
    } catch {
      setError(isBg ? "Неуспешно качване на снимка." : "Image upload failed.");
    } finally {
      event.target.value = "";
    }
  };

  const removeAvatar = () => {
    setAvatar(null);
    storageRemove("userAvatar");
    writePersistedUserProfile({ avatar: null });
    const activeEmail = (email || storageGet("currentUserEmail") || "").trim().toLowerCase();
    if (activeEmail) {
      void serverSyncUserProfile({ data: { email: activeEmail, avatar: "" } }).catch((syncError) =>
        console.warn("Avatar sync failed.", syncError),
      );
    }
    window.dispatchEvent(new Event("userStateChanged"));
  };

  const saveProfile = () => {
    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();
    if (!nextName || !nextEmail) {
      setError(isBg ? "Името и email-ът са задължителни." : "Name and email are required.");
      return;
    }

    const currentEmail = storageGet("currentUserEmail") ?? nextEmail;
    const users = readRegisteredUsers();
    const updatedUsers = users.map((user) =>
      (user.email ?? "").trim().toLowerCase() === (currentEmail ?? "").trim().toLowerCase()
        ? { ...user, name: nextName, email: nextEmail }
        : user,
    );

    const accentColor = readPersistedUserAccentColor(currentEmail ?? nextEmail);
    const profileData = {
      email: currentEmail ?? nextEmail,
      name: nextName,
      ...(birthday ? { birthday } : {}),
      ...(gender ? { gender } : {}),
      ...(accentColor ? { accentColor } : {}),
      ...(avatar ? { avatar } : {}),
    };

    void serverSyncUserProfile({ data: profileData }).catch((error) => {
      console.warn("Server profile sync failed.", error);
    });

    writeRegisteredUsers(updatedUsers);
    writePersistedUserProfile({
      name: nextName,
      email: nextEmail,
      birthday: birthday || "",
      gender: gender || "",
      avatar: storageGet("userAvatar"),
    });
    window.dispatchEvent(new Event("userStateChanged"));
    setName(nextName);
    setEmail(nextEmail);
    setError("");
    setEditing(false);
  };

  const handleLogout = () => {
    clearPersistedUserProfile();
    window.dispatchEvent(new Event("userStateChanged"));
    window.location.href = "/login";
  };

  const clearDeletedAccount = (currentEmail: string) => {
    const users = readRegisteredUsers();
    const remainingUsers = users.filter(
      (user) => (user.email ?? "").trim().toLowerCase() !== currentEmail,
    );

    writeRegisteredUsers(remainingUsers);
    clearPersistedUserProfile();
    window.dispatchEvent(new Event("userStateChanged"));
    window.location.href = "/login";
  };

  const openDeletionModal = () => {
    setDeletionModalOpen(true);
    setDeletionCode("");
    setDeletionCodeSent(false);
    setDeletionMessage("");
  };

  const requestDeletionCode = async () => {
    const currentEmail =
      storageGet("currentUserEmail")?.trim().toLowerCase() || email.trim().toLowerCase();
    if (!currentEmail) {
      window.location.href = "/login";
      return;
    }

    setRequestingDeletionCode(true);
    setDeletionMessage("");
    setDeletionMessageTone("error");
    try {
      const result = await serverRequestAccountDeletionCode({
        data: { email: currentEmail, name },
      });

      if (!result.success) {
        setDeletionMessage(
          isBg ? "Кодът не можа да бъде изпратен." : "The confirmation code could not be sent.",
        );
        return;
      }
      if (!result.data?.passcode) {
        throw new Error("Deletion code was not generated.");
      }

      await sendEmailJsWithFallback(
        EMAILJS_SERVICE_ID,
        EMAILJS_CODE_TEMPLATE_ID,
        {
          email: currentEmail,
          name,
          to_email: currentEmail,
          to_name: name,
          passcode: result.data.passcode,
          code: result.data.passcode,
          verification_code: result.data.passcode,
          verificationCode: result.data.passcode,
          otp: result.data.passcode,
        },
        EMAILJS_PUBLIC_KEY,
      );
      setDeletionCode("");
      setDeletionCodeSent(true);
      setDeletionMessageTone("success");
      setDeletionMessage(isBg ? "Кодът е изпратен успешно!" : "The code was sent successfully.");
    } catch (error) {
      console.warn("Account deletion code request failed.", error);
      const detail = describeEmailJsError(error);
      setDeletionMessage(
        `${isBg ? "Кодът не можа да бъде изпратен." : "The confirmation code could not be sent."} (${detail})`,
      );
    } finally {
      setRequestingDeletionCode(false);
    }
  };

  const deleteAccount = async () => {
    const currentEmail = storageGet("currentUserEmail")?.trim().toLowerCase() ?? "";
    if (!currentEmail || deletionCode.trim().length !== 6) {
      setDeletionMessage(
        isBg ? "Въведете 6-цифрения код от email-а." : "Enter the 6-digit code from your email.",
      );
      return;
    }

    setDeletingAccount(true);
    setDeletionMessage("");
    try {
      const result = await serverDeleteAccount({
        data: { email: currentEmail, code: deletionCode.trim() },
      });
      if (!result.success) {
        setDeletionMessage(
          isBg ? "Кодът е грешен или е изтекъл." : "The code is invalid or has expired.",
        );
        return;
      }
      clearDeletedAccount(currentEmail);
    } catch (error) {
      console.warn("Account deletion failed on server.", error);
      setDeletionMessage(
        isBg ? "Акаунтът не можа да бъде изтрит." : "The account could not be deleted.",
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const changePassword = async () => {
    setPasswordMessage("");
    setPasswordMessageTone("error");
    const currentEmail = storageGet("currentUserEmail")?.trim().toLowerCase() ?? "";
    if (!currentEmail || !currentPassword) {
      setPasswordMessage(isBg ? "Текущата парола е грешна." : "Current password is incorrect.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage(
        isBg
          ? "Новата парола трябва да е поне 6 символа."
          : "New password must be at least 6 characters.",
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage(isBg ? "Новите пароли не съвпадат." : "New passwords do not match.");
      return;
    }

    setChangingPassword(true);
    try {
      const loginResult = await serverLogin({
        data: { email: currentEmail, password: currentPassword },
      });
      if (!loginResult.success) {
        setPasswordMessage(isBg ? "Текущата парола е грешна." : "Current password is incorrect.");
        return;
      }

      const updateResult = await serverSyncUserProfile({
        data: { email: currentEmail, password: newPassword },
      });
      if (!updateResult.success) {
        setPasswordMessage(isBg ? "Паролата не можа да бъде сменена." : "Password change failed.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordMessageTone("success");
      setPasswordMessage(isBg ? "Паролата е сменена успешно." : "Password changed successfully.");
    } catch {
      setPasswordMessage(
        isBg ? "Известието не можа да се изпрати." : "The notification could not be sent.",
      );
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <main className="grid-bg min-h-screen px-5 py-10 text-foreground sm:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 md:flex-row">
        <aside className="h-fit w-full space-y-4 rounded-2xl border border-border bg-card/40 p-4 backdrop-blur-md md:w-72">
          <div className="px-4 py-2 text-xl font-bold">
            {isBg ? "Акаунт" : isZh ? "账户" : "Account"}
          </div>
          <div className="rounded-xl bg-primary/20 px-4 py-2 font-medium text-primary">
            {isBg ? "Лична информация" : isZh ? "个人信息" : "Personal info"}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full cursor-pointer rounded-xl px-4 py-2 text-left font-medium text-red-400 transition-colors hover:bg-red-500/10"
          >
            {isBg ? "Изход от профила" : isZh ? "退出登录" : "Log out"}
          </button>
          <button
            type="button"
            onClick={openDeletionModal}
            className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-left font-medium text-red-400 transition-colors hover:bg-red-500/10"
          >
            <Trash2 className="size-4" />
            {isBg ? "Изтрий акаунта" : isZh ? "删除账户" : "Delete account"}
          </button>
        </aside>

        <section className="flex-1 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">
                {isBg ? "Лична информация" : isZh ? "个人信息" : "Personal info"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {isBg
                  ? "Информацията за вас и вашите предпочитания в сайта"
                  : "Info about you and your preferences"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing((value) => !value);
                setError("");
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-2"
            >
              <Pencil className="size-4" />
              {editing
                ? isBg
                  ? "Отказ"
                  : isZh
                    ? "取消"
                    : "Cancel"
                : isBg
                  ? "Редактирай"
                  : isZh
                    ? "编辑"
                    : "Edit"}
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/50 divide-y divide-border">
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Upload className="size-5" />
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {isBg ? "Профилна снимка" : "Profile picture"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isBg ? "Качи или смени снимката си" : "Upload or change your picture"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex size-12 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-primary/20 font-bold text-primary shadow-inner">
                  {avatar ? (
                    <div
                      aria-label={isBg ? "Профилна снимка" : isZh ? "头像" : "Profile picture"}
                      style={{ backgroundImage: `url("${avatar}")` }}
                      className="size-full bg-cover bg-center"
                    />
                  ) : (
                    name.charAt(0).toUpperCase()
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {avatar && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    aria-label={isBg ? "Премахни снимката" : "Remove picture"}
                    className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 p-4">
              <div className="font-medium text-foreground">
                {isBg ? "Потребителско име" : "username"}
              </div>
              {editing ? (
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full max-w-[320px] rounded-lg border border-border bg-background px-3 py-2 text-right outline-none focus:border-primary"
                />
              ) : (
                <div className="text-sm text-muted-foreground">{name}</div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 p-4">
              <div className="font-medium text-foreground">Email</div>
              {editing ? (
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full max-w-[320px] rounded-lg border border-border bg-background px-3 py-2 text-right outline-none focus:border-primary"
                />
              ) : (
                <div className="text-sm text-muted-foreground">{email}</div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 p-4">
              <div className="font-medium text-foreground">
                {isBg ? "Дата на раждане" : "Birthday"}
              </div>
              <div className="text-sm text-muted-foreground">
                {birthday
                  ? new Date(`${birthday}T00:00:00`).toLocaleDateString(isBg ? "bg-BG" : "en-US", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : isBg
                    ? "Не е посочена"
                    : "Not specified"}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 p-4">
              <div className="font-medium text-foreground">{isBg ? "Пол" : "Gender"}</div>
              <div className="text-sm text-muted-foreground">
                {gender === "male"
                  ? isBg
                    ? "Мъж"
                    : "Male"
                  : gender === "female"
                    ? isBg
                      ? "Жена"
                      : "Female"
                    : isBg
                      ? "Не е посочено"
                      : "Not specified"}
              </div>
            </div>
          </div>

          {editing && (
            <div className="flex items-center justify-end gap-3">
              {error && <p className="mr-auto text-sm text-red-400">{error}</p>}
              <button
                type="button"
                onClick={saveProfile}
                className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
              >
                {isBg ? "Запази промените" : "Save changes"}
              </button>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-5">
            <div>
              <h2 className="text-xl font-bold">
                {isBg ? "Смяна на парола" : isZh ? "修改密码" : "Change password"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isBg
                  ? "Ще получиш email известие при промяна."
                  : "You will receive an email notification after changing it."}
              </p>
            </div>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder={isBg ? "Текуща парола" : isZh ? "当前密码" : "Current password"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder={isBg ? "Нова парола" : isZh ? "新密码" : "New password"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              placeholder={
                isBg ? "Повтори новата парола" : isZh ? "确认新密码" : "Confirm new password"
              }
              className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
            {passwordMessage && (
              <p
                className={`text-sm ${passwordMessageTone === "success" ? "text-green-400" : "text-red-400"}`}
              >
                {passwordMessage}
              </p>
            )}
            <button
              type="button"
              disabled={changingPassword}
              onClick={changePassword}
              className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {changingPassword
                ? isBg
                  ? "Изпращане..."
                  : "Sending..."
                : isBg
                  ? "Смени паролата"
                  : isZh
                    ? "修改密码"
                    : "Change password"}
            </button>
          </div>
        </section>
      </div>

      {deletionModalOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingAccount) {
              setDeletionModalOpen(false);
              setDeletionMessage("");
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-md space-y-5 rounded-2xl border border-red-400/30 bg-card p-6 shadow-2xl"
          >
            <div>
              <h2 id="delete-account-title" className="text-xl font-bold text-red-400">
                {isBg
                  ? "Потвърждение за изтриване"
                  : isZh
                    ? "确认删除账户"
                    : "Confirm account deletion"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {deletionCodeSent
                  ? isBg
                    ? "Изпратихме 6-цифрен код на email адреса ви. Въведете го, за да изтриете акаунта окончателно."
                    : "We sent a 6-digit code to your email. Enter it to permanently delete your account."
                  : isBg
                    ? "Изпратете код на email адреса си, след което го въведете за окончателно изтриване."
                    : "Send a code to your email, then enter it to permanently delete your account."}
              </p>
            </div>
            <button
              type="button"
              disabled={requestingDeletionCode}
              onClick={requestDeletionCode}
              className="w-full rounded-lg border border-red-400/40 px-4 py-2 font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              {requestingDeletionCode
                ? isBg
                  ? "Изпращане..."
                  : "Sending..."
                : deletionCodeSent
                  ? isBg
                    ? "Изпрати нов код"
                    : isZh
                      ? "重新发送验证码"
                      : "Send a new code"
                  : isBg
                    ? "Изпрати код"
                    : isZh
                      ? "发送验证码"
                      : "Send code"}
            </button>
            <input
              autoFocus
              value={deletionCode}
              disabled={!deletionCodeSent}
              onChange={(event) =>
                setDeletionCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              maxLength={6}
              placeholder={isBg ? "Код за потвърждение" : "Confirmation code"}
              className="w-full rounded-lg border border-border bg-background px-3 py-3 text-center text-lg tracking-[0.35em] outline-none focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {deletionMessage && (
              <p
                className={`text-sm ${deletionMessageTone === "success" ? "text-green-400" : "text-red-400"}`}
              >
                {deletionMessage}
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => {
                  setDeletionModalOpen(false);
                  setDeletionMessage("");
                }}
                className="rounded-lg border border-border px-4 py-2 font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                {isBg ? "Отказ" : isZh ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={!deletionCodeSent || deletingAccount || deletionCode.length !== 6}
                onClick={deleteAccount}
                className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingAccount
                  ? isBg
                    ? "Изтриване..."
                    : "Deleting..."
                  : isBg
                    ? "Потвърди изтриването"
                    : isZh
                      ? "确认删除"
                      : "Confirm deletion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
