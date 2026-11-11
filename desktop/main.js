// ADITYA desktop: a thin, native shell around the web app's /talk orb.
// - floating, always-on-top orb window (frameless), toggled from the tray or Ctrl+Shift+Space
// - keeps running in the background when closed (tray), optional start at login
// - mic allowed for ADITYA's own site only; audio can play without a tap
// - one persistent login (you sign in once)
const { app, BrowserWindow, Tray, Menu, globalShortcut, session, shell, nativeImage, ipcMain, screen } = require("electron");
const path = require("node:path");

// `npm run dev` (--local) points at your local `npm run dev` server; otherwise the live site.
const APP_URL = (process.argv.includes("--local") ? "http://localhost:3000" : process.env.ADITYA_URL || "https://www.aditya4sure.dev").replace(/\/$/, "");
const ORIGIN = new URL(APP_URL).origin;
const HOTKEY = process.env.ADITYA_HOTKEY || "Control+Shift+Space";
const PARTITION = "persist:aditya";

// Voice replies should play the moment she wakes, no "tap first".
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showOrb(true));
}

function placeBottomRight(w, h) {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - w - 24, y: workArea.y + workArea.height - h - 24 };
}

function createWindow() {
  const W = 440;
  const H = 680;
  win = new BrowserWindow({
    width: W,
    height: H,
    ...placeBottomRight(W, H),
    minWidth: 360,
    minHeight: 480,
    frame: false,
    transparent: false,
    backgroundColor: "#0b0b0d",
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    title: "ADITYA",
    icon: path.join(__dirname, "assets", "icon-256.png"),
    webPreferences: {
      partition: PARTITION,
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Standby must keep listening while the window is hidden.
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.loadURL(`${APP_URL}/talk?desktop=1`);
  win.once("ready-to-show", () => showOrb(false));

  // Closing hides to the tray; quit from the tray menu.
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Links to anything that isn't ADITYA open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(ORIGIN)) shell.openExternal(url);
    return { action: url.startsWith(ORIGIN) ? "allow" : "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

function showOrb(wake) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (wake) win.webContents.send("aditya:wake");
}

function toggleOrb() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else showOrb(true);
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png"));
  tray = new Tray(icon);
  tray.setToolTip(`ADITYA (${HOTKEY.replace("Control", "Ctrl")})`);
  const refresh = () => {
    const login = app.getLoginItemSettings().openAtLogin;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Talk to me", accelerator: HOTKEY, click: () => showOrb(true) },
        { label: "Open full app", click: () => shell.openExternal(APP_URL) },
        { type: "separator" },
        {
          label: "Start with Windows",
          type: "checkbox",
          checked: login,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked, args: ["--hidden"] });
            refresh();
          },
        },
        { label: "Reload", click: () => win && win.reload() },
        { type: "separator" },
        {
          label: "Quit ADITYA",
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
  };
  refresh();
  tray.on("click", toggleOrb);
}

app.whenReady().then(() => {
  // Mic + speaker only for ADITYA's own site; everything else denied.
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const from = details.requestingUrl || wc.getURL();
    const ours = from.startsWith(ORIGIN);
    callback(ours && ["media", "audioCapture", "speaker-selection", "notifications"].includes(permission));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => origin === ORIGIN && ["media", "audioCapture", "speaker-selection"].includes(permission));

  createWindow();
  buildTray();

  if (!globalShortcut.register(HOTKEY, toggleOrb)) console.warn(`[aditya] hotkey ${HOTKEY} is taken by another app`);

  ipcMain.on("aditya:hide", () => win && win.hide());
  ipcMain.on("aditya:show", () => showOrb(false));

  // Launched at login with --hidden: stay in the tray (standby keeps running).
  if (process.argv.includes("--hidden")) win.once("ready-to-show", () => win.hide());
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("before-quit", () => (quitting = true));
app.on("window-all-closed", (e) => e.preventDefault());
