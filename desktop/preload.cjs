"use strict";

/**
 * The one bridge between the window and the shell.
 *
 * Two functions, both about getting back to the app. Nothing here is a secret
 * and nothing here is a capability: the page already has the network, and this
 * only lets the offline page ask for one more try.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tody", {
  /** Try the live app again, from the offline page. */
  reopen: () => ipcRenderer.invoke("tody:reopen"),
  /** The version of the program, for a bug report. */
  version: () => ipcRenderer.invoke("tody:version"),
});
