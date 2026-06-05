const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const BACKEND_PORT = 8765;
const DEV_MODE = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow = null;
let backendProcess = null;

// ── Backend process ───────────────────────────────────────────────────────────

function getBackendPath() {
  if (app.isPackaged) {
    // Bundled executable inside the installed app via extraResources
    return path.join(process.resourcesPath, "backend_dist", "main", "main.exe");
  }
  // Development: run Python directly
  return null;
}

function startBackend() {
  if (DEV_MODE) {
    // In dev the developer runs `npm run dev:backend` separately
    console.log("[electron] Dev mode — expecting backend on :" + BACKEND_PORT);
    return;
  }

  const exePath = getBackendPath();
  console.log("[electron] Starting backend:", exePath);

  backendProcess = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    stdio: "ignore",
    windowsHide: true,
  });

  backendProcess.on("error", (err) => {
    console.error("[electron] Backend failed to start:", err);
  });

  backendProcess.on("exit", (code) => {
    console.log("[electron] Backend exited with code:", code);
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// ── Health-check poll until backend is ready ──────────────────────────────────

function waitForBackend(retries = 30, delay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode < 500) resolve();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) reject(new Error("Backend did not start in time"));
      else setTimeout(check, delay);
    };
    check();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Storage Inventory",
    icon: (() => { const p = path.join(__dirname, "icon.ico"); return fs.existsSync(p) ? p : undefined; })(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // shown after backend is ready
  });

  // Open external links in the OS browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  createWindow();
  startBackend();

  try {
    await waitForBackend();
  } catch (e) {
    console.error("[electron] Backend never became ready:", e.message);
    // Load anyway — the app's Settings page will surface the error
  }

  const url = `http://127.0.0.1:${BACKEND_PORT}`;
  mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => mainWindow.show());
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopBackend);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
