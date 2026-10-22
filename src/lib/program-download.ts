/** Same-origin downloads so users do not need access to an external drive. */
export const PROGRAM_DOWNLOAD = "/todor/Tody-Game-Hub-1.0.0-setup-x64.exe";

/**
 * The program for a phone, which is the same site in an Android shell.
 *
 * A separate file from the Windows one because the builds are separate: the Android
 * one comes out of `npm run dist:android` and is under a megabyte, where the Windows
 * installer is over a hundred, and they change for different reasons and at different
 * times. One constant each, so changing one never silently changes the other.
 */
export const ANDROID_DOWNLOAD = "/todor/app-release-signed.apk";
