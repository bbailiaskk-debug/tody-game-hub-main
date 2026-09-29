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
  screenSourceFor,
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
  const answer = (webContents, permission, callback) => {
    const requester = webContents?.getURL?.() ?? "";
    callback(mayGrant(permission, requester));
  };
  session.defaultSession.setPermissionRequestHandler(answer);
  session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
    mayGrant(permission, webContents?.getURL?.() ?? ""),
  );
};

/**
 * Sharing the screen from a call.
 *
 * Windows 11 offers its own picker, which is the one people already know. Where
 * it is not there, the primary screen is offered, because a half finished share
 * is worse than an obvious choice.
 */
/**
 * Sharing the screen from a call.
 *
 * Windows 11 22H2 and later put up the system's own picker, the same one
 * Windows uses everywhere else, and that is what is asked for: it is the picker
 * people already know, and it can show windows as well as screens.
 *
 * Where the OS has no such picker, something still has to be shared, and the
 * screen the window is on is the one a person means by "my screen". The handler
 * is only called in that case, so the fallback never overrides a choice anybody
 * made.
 */
const grantScreenShare = () => {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      // The screen this window is on, not blindly the first one: a two monitor
      // desk otherwise shares the monitor nobody is looking at.
      const display = displayForBounds(win?.getBounds(), screen.getAllDisplays());
      desktopCapturer
        .getSources({
          // Windows as well as screens, so the fallback can offer a window too.
          types: ["screen", "window"],
          fetchWindowIcons: false,
          thumbnailSize: { width: 0, height: 0 },
        })
        .then((sources) => {
          const source = screenSourceFor(sources, display);
          // Loopback is the sound the machine is playing, which is what somebody
          // sharing a video wants and what a whole screen cannot do on its own.
          callback(source ? { video: source, audio: "loopback" } : null);
        })
        .catch(() => callback(null));
    },
    { useSystemPicker: true },
  );
};

/** Where the window points, and where it goes back to after a lost network. */
const entryUrl = () => resolveEntry(process.env.TODY_APP_ORIGIN || DEFAULT_ORIGIN);

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
    icon: path.join(__dirname, "icon.png"),
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
    if (isExternal(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  // The same for anything that tries to walk the window somewhere else.
  win.webContents.on("will-navigate", (event, url) => {
    if (isInternal(url)) return;
    event.preventDefault();
    if (isExternal(url)) void shell.openExternal(url);
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
