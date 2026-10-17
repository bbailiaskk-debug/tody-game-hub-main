"use strict";

/**
 * The bridge for the screen picker, and nothing else.
 *
 * Separate from the main preload on purpose: this page is a local file that shows
 * thumbnails and answers one question, and it has no business carrying the
 * ability to navigate the app, reload it, or read its version. The chat's window
 * and this one are different trust problems and get different sets of doors.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("picker", {
  /**
   * The screens and windows on offer.
   *
   * Asked for rather than pushed. The push had a gap in it: the main process
   * sends the moment the page has loaded, and anything sent before the page's own
   * script registered its listener is simply dropped, which showed up as an empty
   * picker on a slow machine. A question has no window to be lost in.
   */
  sources: () => ipcRenderer.invoke("tody:share-list"),
  /** Somebody chose. The id is the one they were shown. */
  pick: (id) => ipcRenderer.invoke("tody:share-pick", id),
  /** Somebody changed their mind, which is an answer and not a failure. */
  cancel: () => ipcRenderer.invoke("tody:share-cancel"),
});
