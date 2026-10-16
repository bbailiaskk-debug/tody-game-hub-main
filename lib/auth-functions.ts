import { serverFnFor } from "@/lib/server-fn";
import type {
  RegisterInput,
  LoginInput,
  UserRecord,
  AuthStore,
  AuthKvNamespace,
} from "@/lib/auth-functions-server";

/* Re-exported so the call sites that imported these types from here keep working. */
export type {
  RegisterInput,
  LoginInput,
  UserRecord,
  AuthStore,
  AuthKvNamespace,
} from "@/lib/auth-functions-server";

/* The types of each route come from its handler via `typeof`, which is erased
   at build time — no handler code reaches the browser bundle. */
import type { serverUserExists as _serverUserExists } from "@/lib/auth-functions-server";
export const serverUserExists = serverFnFor<typeof _serverUserExists>("/api/auth/user-exists");

import type { serverRegister as _serverRegister } from "@/lib/auth-functions-server";
export const serverRegister = serverFnFor<typeof _serverRegister>("/api/auth/register");

import type { serverLogin as _serverLogin } from "@/lib/auth-functions-server";
export const serverLogin = serverFnFor<typeof _serverLogin>("/api/auth/login");

import type { serverGetUserProfile as _serverGetUserProfile } from "@/lib/auth-functions-server";
export const serverGetUserProfile = serverFnFor<typeof _serverGetUserProfile>("/api/auth/profile");

import type { serverSyncUserProfile as _serverSyncUserProfile } from "@/lib/auth-functions-server";
export const serverSyncUserProfile = serverFnFor<typeof _serverSyncUserProfile>("/api/auth/profile/sync");

import type { serverDeleteAccount as _serverDeleteAccount } from "@/lib/auth-functions-server";
export const serverDeleteAccount = serverFnFor<typeof _serverDeleteAccount>("/api/auth/delete-account");

import type { serverRequestAccountDeletionCode as _serverRequestAccountDeletionCode } from "@/lib/auth-functions-server";
export const serverRequestAccountDeletionCode = serverFnFor<typeof _serverRequestAccountDeletionCode>("/api/auth/deletion-code");

import type { serverRequestPasswordReset as _serverRequestPasswordReset } from "@/lib/auth-functions-server";
export const serverRequestPasswordReset = serverFnFor<typeof _serverRequestPasswordReset>("/api/auth/password-reset/request");

import type { serverResetPassword as _serverResetPassword } from "@/lib/auth-functions-server";
export const serverResetPassword = serverFnFor<typeof _serverResetPassword>("/api/auth/password-reset/confirm");
