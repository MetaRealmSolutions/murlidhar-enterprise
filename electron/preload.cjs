const { contextBridge, ipcRenderer } = require("electron");

// The only desktop capability exposed to the web app: read update status, start a check, and
// restart into a downloaded update. No generic IPC or Node access is exposed.
contextBridge.exposeInMainWorld("murlidharUpdater", {
  getState: () => ipcRenderer.invoke("updater:get-state"),
  check: () => ipcRenderer.invoke("updater:check"),
  install: () => ipcRenderer.invoke("updater:install"),
  onState: (callback) => {
    if (typeof callback !== "function") return () => undefined;
    const listener = (_event, next) => callback(next);
    ipcRenderer.on("updater:state", listener);
    return () => ipcRenderer.removeListener("updater:state", listener);
  },
});
