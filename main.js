import { app, BrowserWindow, powerSaveBlocker, ipcMain, shell } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let psbId = null;
let historyPath; // set after app is ready

// ---------- helpers ----------
function ensureFile(filePath, defaultContent = "[]") {
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, defaultContent, "utf-8");
    }
  } catch (e) {
    console.error("[ensureFile] error:", e);
  }
}

function readHistory() {
  try {
    ensureFile(historyPath);
    const raw = fs.readFileSync(historyPath, "utf-8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    console.error("[readHistory] error:", e);
    return [];
  }
}

function writeHistory(arr) {
  try {
    fs.writeFileSync(historyPath, JSON.stringify(arr, null, 2), "utf-8");
    return true;
  } catch (e) {
    console.error("[writeHistory] error:", e);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------- app lifecycle ----------
app.whenReady().then(() => {
  historyPath = path.join(app.getPath("userData"), "history.json");
  console.log("[history:path]", historyPath);
  ensureFile(historyPath);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------- power save blocker ----------
ipcMain.handle("psb:start", () => {
  if (psbId == null) psbId = powerSaveBlocker.start("prevent-app-suspension");
  return psbId;
});

ipcMain.handle("psb:stop", () => {
  if (psbId != null && powerSaveBlocker.isStarted(psbId)) {
    powerSaveBlocker.stop(psbId);
    psbId = null;
  }
  return true;
});

// ---------- history IPC ----------
ipcMain.handle("history:get", () => {
  const arr = readHistory();
  console.log("[history:get] size=", arr.length);
  return arr;
});

ipcMain.handle("history:append", (evt, entry) => {
  const arr = readHistory();
  arr.push(entry);
  const trimmed = arr.slice(-200); // keep last 200
  const ok = writeHistory(trimmed);
  console.log("[history:append] wrote=", ok, "size=", trimmed.length);
  return trimmed;
});

ipcMain.handle("history:clear", () => {
  const ok = writeHistory([]);
  console.log("[history:clear] ok=", ok);
  return ok;
});

ipcMain.handle("history:open-folder", async () => {
  try {
    // Try to reveal the actual file first
    if (fs.existsSync(historyPath)) {
      const res = shell.showItemInFolder(historyPath);
      console.log("[history:open-folder] showItemInFolder ->", res);
      return historyPath;
    }
  } catch (e) {
    console.error("[history:open-folder] showItemInFolder error", e);
  }
  // Fallback: open the userData folder (works on all OSes)
  const folder = path.dirname(historyPath);
  const opened = await shell.openPath(folder); // empty string means success
  console.log(
    "[history:open-folder] openPath ->",
    opened || "ok",
    "folder=",
    folder
  );
  return folder;
});
