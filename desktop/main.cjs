"use strict";

/**
 * Tody Game Hub, as a program.
 *
 * The app is a site: the chat, its object and the calls all run on the live
 * origin, and this process is the window around it. That is deliberate. The
 * messages live in a Durable Object on the edge, so a copy of the site on the
 * disk would have nothing to talk to, and a second copy of the chat code would
 * be a second thing to keep true. One origin, one truth, and a shell that adds
 * what a browser cannot: a real icon, a real window, and the microphone granted
 * without hunting through a permission prompt.
 */

const {
  app,
  BrowserWindow,
  Menu,
  desktopCapturer,
  ipcMain,
  screen,
  shell,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const {
  DEFAULT_ORIGIN,
  displayForBounds,
  isExternal,
  isInternal,
  mayGrant,
  nextBounds,
  resolveEntry,
  shareCards,
} = require("./shell.cjs");

/** One window, one chat, one microphone light. */
const APP_ID = "com.todor.todygamehub";
const BOUNDS_FILE = "window-bounds.json";

/** The offline page is the app's own, so a dead network is a sentence and not a browser error page. */
const OFFLINE_PAGE = path.join(__dirname, "offline.html");

let win = null;

const storeFile = (name) => path.join(app.getPath("userData"), name);

const readBounds = () => {
  try {
    return JSON.parse(fs.readFileSync(storeFile(BOUNDS_FILE), "utf8"));
  } catch {
    // A missing or unreadable file is simply a first run.
    return null;
  }
};

const writeBounds = (bounds) => {
  try {
    fs.writeFileSync(storeFile(BOUNDS_FILE), JSON.stringify(bounds), "utf8");
  } catch {
    // Losing the window position is not worth interrupting a call over.
  }
};

/**
 * The microphone, the camera and the clipboard.
 *
 * Granted for this app's own pages only. A browser would ask every time; here
 * the answer is written once, because a person who installed a chat is going to
 * use its microphone.
 */
const grantPermissions = () => {
  const origin = appOrigin();
  const answer = (webContents, permission, callback) => {
    const requester = webContents?.getURL?.() ?? "";
    callback(mayGrant(permission, requester, origin));
  };
  session.defaultSession.setPermissionRequestHandler(answer);
  session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
    mayGrant(permission, webContents?.getURL?.() ?? "", origin),
  );
};

/** Which source a share landed on, said out loud, because the failure is silent. */
const trace = (message, detail) => {
  try {
    console.log(`[tody] screen share: ${message}${detail ? ` (${detail})` : ""}`);
  } catch {
    // A console is not somewhere to fail over.
  }
};

/** The page's own HTML for the picker, so it needs no bridge into the chat. */
const PICKER_PAGE = path.join(__dirname, "share-picker.html");

/** One share waiting for an answer. */
let pendingShare = null;
let pickerWin = null;

/**
 * Answer the waiting question, once.
 *
 * The callback is a one-shot handle and calling it twice throws inside Electron,
 * so every path that ends a share goes through here: a choice, a cancel, the
 * picker being closed, the window going away. `null` is how a refusal is spelled,
 * and it arrives at the page as the `NotAllowedError` it should be.
 */
const settleShare = (source) => {
  const share = pendingShare;
  pendingShare = null;
  if (pickerWin && !pickerWin.isDestroyed()) pickerWin.destroy();
  pickerWin = null;
  if (!share) return;
  try {
    share.callback(source);
  } catch (error) {
    trace("answering the page failed", String(error?.message ?? error));
  }
};

/**
 * What the picker shows.
 *
 * The list itself is `shareCards`, which is a decision about ordering and naming
 * and is kept where it can be tested. This is only the part that needs Electron:
 * asking the desktop what is there, and asking for pictures to go with it.
 *
 * Thumbnails are fetched here and nowhere else — `toDataURL` turns each one into a
 * bitmap the renderer has to hold, and a desktop with thirty windows open would
 * carry all thirty across the bridge for a list most people scroll past.
 */
const shareSources = async () => {
  const display = displayForBounds(win?.getBounds(), screen.getAllDisplays());
  const found = await desktopCapturer.getSources({
    types: ["screen", "window"],
    fetchWindowIcons: false,
    thumbnailSize: { width: 320, height: 180 },
  });
  return shareCards(found, display);
};

/**
 * The picker's own window, a moment.
 *
 * Modal to the chat so it cannot be left behind on another desktop, and closed by
 * any of its three endings — a choice, the cancel button, or the window's own
 * close — because a share nobody can finish is a share that hangs the page.
 *
 * Every failure here answers `null` rather than throwing into a `void`. A picker
 * that failed to open would otherwise leave `getDisplayMedia` pending forever,
 * which reads on the page as a button stuck on "sharing" with no error at all.
 */
const askWithPicker = async () => {
  const share = pendingShare;
  if (!share) return;
  let cards = [];
  try {
    cards = await shareSources();
  } catch (error) {
    trace("listing sources failed", String(error?.message ?? error));
    settleShare(null);
    return;
  }
  if (cards.length === 0) {
    trace("nothing to offer");
    settleShare(null);
    return;
  }
  // A newer request arrived while the list was being gathered.
  if (pendingShare !== share) return;
  share.sources = cards;

  try {
    pickerWin = new BrowserWindow({
      width: 720,
      height: 560,
      parent: win && !win.isDestroyed() ? win : undefined,
      modal: Boolean(win && !win.isDestroyed()),
      title: "Share your screen",
      backgroundColor: "#0b0d12",
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "share-picker.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
  } catch (error) {
    trace("the picker would not open", String(error?.message ?? error));
    settleShare(null);
    return;
  }

  const picker = pickerWin;
  picker.once("ready-to-show", () => picker.show());
  picker.on("closed", () => {
    if (pickerWin === picker) pickerWin = null;
    // Closing is an answer in its own right. Electron keeps the page waiting
    // until the callback runs, so this has to be the one that runs it.
    if (pendingShare === share) settleShare(null);
  });

  /**
   * A missing or unreadable page rejects here.
   *
   * Left alone it would reject the whole `askWithPicker`, which is called with
   * `void`, and the `getDisplayMedia` in the chat would wait for a callback that
   * nothing was ever going to make: the share button stuck on "starting", with
   * no error and no way out but a reload.
   */
  try {
    await picker.loadFile(PICKER_PAGE);
  } catch (error) {
    trace("the picker page would not load", String(error?.message ?? error));
    if (pendingShare === share) settleShare(null);
  }
};

/** Whether an IPC message came from our picker, and not from the chat. */
const fromPicker = (event) => {
  const sender = event?.sender;
  if (!sender || !pickerWin || pickerWin.isDestroyed()) return false;
  return sender.id === pickerWin.webContents.id;
};

/** What the picker draws. Empty rather than an error, so it shows its own empty state. */
ipcMain.handle("tody:share-list", (event) => {
  if (!fromPicker(event)) return [];
  const share = pendingShare;
  return share?.sources ?? [];
});

/** Sharing the screen from a call. */
const grantScreenShare = () => {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    /**
     * A second press while the first question is still on screen.
     *
     * There is one pending callback because there is one pending question, and
     * leaving the older one unanswered would leave that earlier `getDisplayMedia`
     * hanging for good — the page would sit on "starting" with no error and no
     * stream, which is the worst of the three things that can happen here.
     */
    if (pendingShare) settleShare(null);

    pendingShare = { callback, sources: [] };
    trace("the app was asked for a source");
    void askWithPicker();
  });
};

/** Where the window points, and where it goes back to after a lost network. */
const entryUrl = () => resolveEntry(appOrigin());

/**
 * The origin this window is talking to.
 *
 * Read from the environment every time rather than defaulted inside the helpers,
 * because the helpers that check "is this my own page" take an origin and default
 * it to production. Under `desktop:dev` the window points at localhost, so every
 * one of those checks was comparing localhost against workers.dev, answering no,
 * and refusing the microphone and the camera on a build that was working perfectly
 * well. One place reads the environment; everything else is handed the answer.
 */
const appOrigin = () => process.env.TODY_APP_ORIGIN || DEFAULT_ORIGIN;

/** A menu that keeps the keyboard shortcuts a text field needs, and little else. */
const buildMenu = () => {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => void win?.loadURL(entryUrl()) },
        { role: "quit", label: "Exit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", label: "Undo" },
        { role: "redo", label: "Redo" },
        { type: "separator" },
        { role: "cut", label: "Cut" },
        { role: "copy", label: "Copy" },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select all" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom", label: "Actual size" },
        { role: "zoomIn", label: "Zoom in" },
        { role: "zoomOut", label: "Zoom out" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Full screen" },
        // The developer tools are a development tool, not a shipped feature.
        ...(app.isPackaged
          ? []
          : [
              {
                label: "Developer tools",
                accelerator: "F12",
                click: () => win?.webContents.toggleDevTools(),
              },
            ]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createWindow = () => {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const bounds = nextBounds(readBounds(), area);

  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    // The site's own background, so there is no white flash before it paints.
    backgroundColor: "#0d120d",
    show: false,
    title: "Tody Game Hub",
    // The icon lives beside the build script that draws it, not beside this file.
    // Pointed at the wrong directory it resolved to nothing, and a window with no
    // icon is a program with the default one — which is the whole of what this
    // window is not.
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      // The page is a stranger with no business touching this machine.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // The only bridge in the app, and it holds two functions.
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.once("ready-to-show", () => win?.show());
  win.on("close", () => {
    if (win && !win.isDestroyed()) writeBounds(win.getBounds());
  });
  win.on("closed", () => {
    win = null;
  });

  // A link to another site is the user's business, opened where they expect it.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url, appOrigin())) void shell.openExternal(url);
    return { action: "deny" };
  });
  // The same for anything that tries to walk the window somewhere else. Both of
  // these default to the production origin, which under a dev run meant the app's
  // own page counted as somebody else's and was bounced out to the browser.
  win.webContents.on("will-navigate", (event, url) => {
    if (isInternal(url, appOrigin())) return;
    event.preventDefault();
    if (isExternal(url, appOrigin())) void shell.openExternal(url);
  });
  win.webContents.on("did-fail-load", (_event, errorCode, description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    void win?.loadFile(OFFLINE_PAGE);
  });

  void win.loadURL(entryUrl());
};

/** A second copy of the program would fight over the microphone; it focuses instead. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    grantPermissions();
    grantScreenShare();
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

/** The offline page asks for this one thing: to try the network again. */
ipcMain.handle("tody:reopen", () => {
  if (win && !win.isDestroyed()) void win.loadURL(entryUrl());
});

ipcMain.handle("tody:version", () => app.getVersion());

/**
 * The picker picked something.
 *
 * The id is matched against the list the picker was actually sent, rather than
 * looked up in a fresh `getSources`, so what was on screen is what is shared: the
 * ids are stable within a request but not across one, and a window that closed
 * while the question was open has to come back as "cannot share that" rather than
 * as whatever took its place.
 */
ipcMain.handle("tody:share-pick", (event, id) => {
  if (!fromPicker(event)) return false;
  const share = pendingShare;
  const source = share?.sources.find((card) => card.id === String(id));
  if (!share || !source) {
    trace("picked something that is no longer there", String(id));
    settleShare(null);
    return false;
  }
  trace("sharing", source.name);
  /**
   * Video only, and not as a preference.
   *
   * `audio: "loopback"` used to be asked for here, and it was the whole reason
   * screen sharing never started: the capture itself was fine, the screen was
   * found and handed over, and the share then died on `NotReadableError: Could
   * not start audio source`. Measured end to end, not inferred — the request
   * object does not report what the page asked for (`audio` comes back
   * `undefined`), so the earlier attempt to answer it conditionally allowed the
   * loopback every single time and quietly protected nothing.
   *
   * It is not worth being cleverer about. The runs where loopback did start
   * produced a stream with no audio track in it anyway, so it bought a share that
   * works without sound for a share that mostly did not work at all — and on the
   * way it displaced the microphone's sender, which is how a person ended up
   * muted for the rest of the call.
   *
   * The page asks for sound because a browser gives it, and gets what it can:
   * here that is a video track and nothing else, which is what the call already
   * handles.
   */
  void desktopCapturer
    .getSources({
      types: ["screen", "window"],
      fetchWindowIcons: false,
      thumbnailSize: { width: 0, height: 0 },
    })
    .then((found) => {
      const video = found.find((item) => String(item.id) === source.id);
      if (!video) {
        trace("it closed while the question was open", source.name);
        settleShare(null);
        return;
      }
      settleShare({ video });
    })
    .catch((error) => {
      trace("re-reading the source failed", String(error?.message ?? error));
      settleShare(null);
    });
  return true;
});

ipcMain.handle("tody:share-cancel", (event) => {
  if (!fromPicker(event)) return false;
  trace("the picker was dismissed");
  settleShare(null);
  return true;
});
