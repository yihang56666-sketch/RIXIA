import { app, BrowserWindow, shell, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBeidDesktopServer } from "./desktop-server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveDistDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, "dist");
  return path.resolve(here, "../dist");
}

let desktopServer;

function isAppUrl(url) {
  try {
    const target = new URL(url);
    return !target.username && !target.password && target.origin === new URL(desktopServer.url).origin;
  } catch {
    return false;
  }
}

function openExternalUrl(url) {
  let target;
  try {
    target = new URL(url);
  } catch {
    return;
  }
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password) return;
  void shell.openExternal(target.href).catch((error) => console.error("BEID external link failed:", error.code ?? error.name));
}

async function closeDesktopServer() {
  if (!desktopServer) return;
  const closing = desktopServer;
  desktopServer = undefined;
  closing.server?.closeAllConnections();
  await closing.close();
}

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
    desktopServer = await startBeidDesktopServer({ distDir: resolveDistDir(), port: 4173 });
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
      if (isAppUrl(url)) {
        void win.loadURL(url).catch((error) => console.error("BEID navigation failed:", error.code ?? error.name));
      } else {
        openExternalUrl(url);
      }
      return { action: "deny" };
    });
    for (const eventName of ["will-navigate", "will-redirect"]) {
      win.webContents.on(eventName, (event, url) => {
        if (!isAppUrl(url)) event.preventDefault();
      });
    }
    win.webContents.on("will-attach-webview", (event) => event.preventDefault());
    const mayUsePermission = (contents, permission, requestingUrl, isMainFrame) => contents === win.webContents
      && isMainFrame === true && isAppUrl(requestingUrl) && isAppUrl(contents.getURL())
      && ["notifications", "fullscreen"].includes(permission);
    win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(mayUsePermission(contents, permission, details.requestingUrl, details.isMainFrame));
    });
    win.webContents.session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
      mayUsePermission(contents, permission, requestingOrigin, details.isMainFrame));
    await win.loadURL(desktopServer.url);
  }).catch(async (error) => {
    console.error("BEID desktop startup failed:", error.code ?? error.name);
    dialog.showErrorBox("BEID 启动失败", "无法启动本地应用服务。请检查 4173 端口是否被占用，然后重试；不会连接到其他程序的服务。");
    try {
      await closeDesktopServer();
    } catch (closeError) {
      console.error("BEID desktop shutdown failed:", closeError.code ?? closeError.name);
    }
    app.quit();
  });
}

app.on("window-all-closed", async () => {
  try {
    await closeDesktopServer();
  } catch (error) {
    console.error("BEID desktop shutdown failed:", error.code ?? error.name);
  }
  app.quit();
});
