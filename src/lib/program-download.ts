/**
 * The program, and where to get it.
 *
 * Google Drive rather than a file beside the site. Cloudflare Workers refuses any
 * static asset over 25 MiB and the installer is over 100 MiB, so putting it in
 * `public/` made `wrangler deploy` refuse the whole site rather than skip one file.
 * A bucket would do the same job, but the installer changes a handful of times a
 * year and Drive is where the build already is.
 *
 * The `usercontent` host with `confirm=t` rather than the `/view` link somebody
 * copies out of the address bar: over the size where Drive insists on a virus-scan
 * warning, the copied link lands the person on a form to fill in before anything
 * arrives, and this one hands the file over.
 *
 * Drive names the file itself through its own `Content-Disposition`, and the
 * `download` attribute is ignored cross-origin anyway, so the name lives with the
 * upload rather than here.
 *
 * The file has to be shared as "anyone with the link". A private one answers with a
 * sign-in page, and somebody who is not already signed in to Google then gets a
 * login form where the download should be — which looks exactly like a broken site.
 *
 * Not read from the shell. The page cannot know it is inside the program, because
 * that would mean the site depending on the shell, and the shell loads the live
 * site: the coupling would run the wrong way, and the site is the thing that has
 * to keep working without the program.
 */
export const PROGRAM_DOWNLOAD =
  "https://drive.usercontent.google.com/download?id=1zCg6kOjJtQOo48x_rWPZqaNmWySm30OA&export=download&confirm=t";

/**
 * The program for a phone, which is the same site in an Android shell.
 *
 * A separate file from the Windows one because the builds are separate: the Android
 * one comes out of `npm run dist:android` and is under a megabyte, where the Windows
 * installer is over a hundred, and they change for different reasons and at different
 * times. One constant each, so changing one never silently changes the other.
 */
export const ANDROID_DOWNLOAD =
  "https://drive.usercontent.google.com/download?id=1aP1G9VN1x_8ZXAx9RTlveDIgd5oS4eo8&export=download&confirm=t";
