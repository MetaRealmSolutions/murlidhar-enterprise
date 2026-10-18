const { app, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

// Update lifecycle for the installed Windows app. Updates come from the public GitHub Releases
// configured under "build.publish" in package.json; no credential is embedded in the app.
// status: disabled | idle | checking | available | downloading | downloaded | up-to-date | error

const STARTUP_CHECK_DELAY_MS = 10_000;

let getWindow = () => null;
let state = { status: "idle", currentVersion: app.getVersion() };

function setState(patch) {
  state = { currentVersion: app.getVersion(), ...patch };
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send("updater:state", state);
}

function friendlyError(error) {
  const text = String((error && error.message) || error || "");
  if (/ENOTFOUND|ENETUNREACH|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ERR_INTERNET|ERR_NETWORK|net::/i.test(text)) {
    return "Cannot reach the update server. Check the internet connection and try again.";
  }
  return "The update could not be completed. Please try again later.";
}

function isBusy() {
  return state.status === "checking" || state.status === "downloading";
}

async function checkForUpdates() {
  if (!app.isPackaged) return state;
  // Avoid duplicate concurrent checks, and never re-check while a downloaded update is waiting.
  if (isBusy() || state.status === "downloaded") return state;
  setState({ status: "checking" });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("Update check failed:", error);
    setState({ status: "error", message: friendlyError(error) });
  }
  return state;
}

function installUpdate() {
  // Only the supported updater workflow installs, and only once the download has finished.
  if (state.status !== "downloaded") return false;
  // Silent (/S) keeps the update unattended: the NSIS installer skips its scope and directory pages and
  // reuses the existing install's scope and InstallLocation from the registry (per-machine updates
  // elevate themselves). Force-run relaunches the app afterwards.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}

async function promptToRestart(version) {
  const win = getWindow();
  const options = {
    type: "info",
    buttons: ["Restart and install", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Update ready",
    message: `Murlidhar Enterprise ${version} has been downloaded.`,
    detail: "Restart now to install it. Unsaved work in open forms will be lost.",
  };
  const { response } = win && !win.isDestroyed()
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);
  if (response === 0) installUpdate();
}

function initUpdater(windowGetter) {
  getWindow = windowGetter;

  // The renderer is trusted only while it is our own window, never a window.open() child.
  const fromMainWindow = (event) => {
    const win = getWindow();
    return !!win && event.sender === win.webContents;
  };

  ipcMain.handle("updater:get-state", (event) => (fromMainWindow(event) ? state : null));
  ipcMain.handle("updater:check", (event) => (fromMainWindow(event) ? checkForUpdates() : null));
  ipcMain.handle("updater:install", (event) => (fromMainWindow(event) ? installUpdate() : false));

  if (!app.isPackaged) {
    state = { status: "disabled", currentVersion: app.getVersion(), message: "Updates are disabled in development builds." };
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("update-available", (info) => setState({ status: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => setState({ status: "up-to-date" }));
  autoUpdater.on("download-progress", (p) =>
    setState({ status: "downloading", version: state.version, percent: Math.round(p.percent) })
  );
  autoUpdater.on("update-downloaded", (info) => {
    setState({ status: "downloaded", version: info.version });
    promptToRestart(info.version).catch((error) => console.error("Update prompt failed:", error));
  });
  autoUpdater.on("error", (error) => {
    console.error("Updater error:", error);
    setState({ status: "error", message: friendlyError(error) });
  });

  setTimeout(() => void checkForUpdates(), STARTUP_CHECK_DELAY_MS);
}

module.exports = { initUpdater };
