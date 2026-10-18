
const { app, BrowserWindow, shell } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { initUpdater } = require("./updater.cjs");

const distDir = path.join(__dirname, "../dist");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

let server;
let mainWindow;

function startLocalServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let pathname;

      try {
        pathname = decodeURIComponent(
          new URL(req.url, "http://127.0.0.1").pathname
        );
      } catch {
        res.writeHead(400).end("Bad request");
        return;
      }

      const relativePath = pathname.replace(/^\/+/, "");
      let filePath = path.resolve(distDir, relativePath || "index.html");

      if (
        filePath !== distDir &&
        !filePath.startsWith(distDir + path.sep)
      ) {
        res.writeHead(403).end("Forbidden");
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        // Allow client-side application routes, but not missing assets.
        if (path.extname(pathname)) {
          res.writeHead(404).end("Not found");
          return;
        }

        filePath = path.join(distDir, "index.html");
      }

      res.setHeader(
        "Content-Type",
        mimeTypes[path.extname(filePath).toLowerCase()] ||
          "application/octet-stream"
      );
      res.setHeader("X-Content-Type-Options", "nosniff");

      fs.createReadStream(filePath)
        .on("error", () => {
          if (!res.headersSent) res.writeHead(500);
          res.end("Unable to read application file");
        })
        .pipe(res);
    });

    server.once("error", reject);

    // Bind only to this computer; do not expose the app on the LAN.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function createWindow() {
  const localUrl = await startLocalServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "../assets/branding/windows-icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(localUrl);
}

app.whenReady().then(() => {
  initUpdater(() => mainWindow);
  return createWindow();
}).catch((error) => {
  console.error("Unable to start Murlidhar Enterprise:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (server) server.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (server) server.close();
});
