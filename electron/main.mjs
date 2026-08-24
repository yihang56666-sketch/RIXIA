import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBeidDesktopServer } from "./desktop-server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveDistDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, "dist");
  return path.resolve(here, "../dist");
}

let desktopServer;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    desktopServer = await startBeidDesktopServer({ distDir: resolveDistDir() });
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 720,
      minHeight: 540,
      title: "BEID · 专注备考工作台",
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.once("ready-to-show", () => win.show());
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http://127.0.0.1")) return { action: "allow" };
      void shell.openExternal(url);
      return { action: "deny" };
    });
    await win.loadURL(desktopServer.url);
  });
}

app.on("window-all-closed", async () => {
  if (desktopServer) {
    try {
      await desktopServer.close();
    } catch {
      // ignore shutdown races
    }
  }
  app.quit();
});
