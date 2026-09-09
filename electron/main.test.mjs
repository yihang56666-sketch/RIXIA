import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { runModule } from "../scripts/test-support/module-harness.mjs";

async function startMain({ startupError } = {}) {
  const opened = [];
  const windows = [];
  const startupCalls = [];
  const errors = [];
  let ready;
  const app = new EventEmitter();
  app.isPackaged = false;
  app.requestSingleInstanceLock = () => true;
  app.quit = () => { app.didQuit = true; };
  app.whenReady = () => ({ then: (callback) => { ready = Promise.resolve().then(callback); return ready; } });
  class BrowserWindow extends EventEmitter {
    static getAllWindows() { return windows; }
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = (handler) => { this.popup = handler; };
      this.webContents.session = {
        setPermissionRequestHandler: (handler) => { this.permissionRequest = handler; },
        setPermissionCheckHandler: (handler) => { this.permissionCheck = handler; },
      };
      this.webContents.getURL = () => this.url;
      windows.push(this);
    }
    async loadURL(url) { this.url = url; }
    show() {}
  }
  await runModule(fileURLToPath(new URL("./main.mjs", import.meta.url)), { replacements: {
    electron: { app, BrowserWindow, shell: { openExternal: async (url) => { opened.push(url); } }, dialog: { showErrorBox: (...args) => errors.push(args) } },
    "./desktop-server.mjs": { startBeidDesktopServer: async (options) => {
      startupCalls.push(options);
      if (startupError) throw startupError;
      return { url: "http://127.0.0.1:4173/", close: async () => {} };
    } },
  } });
  await ready.catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  return { app, window: windows[0], opened, startupCalls, errors };
}

test("Electron uses a stable origin so localStorage survives restarts", async () => {
  const { startupCalls } = await startMain();
  assert.equal(startupCalls[0].port, 4173);
});

test("popups never create privileged windows, including loopback lookalikes", async () => {
  const { window } = await startMain();
  for (const url of ["http://127.0.0.1:4173/study", "http://127.0.0.1.attacker.invalid/", "https://www.bilibili.com/video/BVfixture"]) {
    assert.equal(window.popup({ url }).action, "deny", url);
  }
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
});

test("file, script and OS protocol links are not passed to the shell", async () => {
  const { window, opened } = await startMain();
  for (const url of ["file:///C:/private.txt", "javascript:alert(1)", "ms-settings:privacy", "data:text/html,hello"]) {
    assert.equal(window.popup({ url }).action, "deny");
  }
  await Promise.resolve();
  assert.deepEqual(opened, []);
});

test("top-level navigations and webview attachment cannot leave the application boundary", async () => {
  const { window } = await startMain();
  for (const eventName of ["will-navigate", "will-redirect"]) {
    let prevented = false;
    window.webContents.emit(eventName, { preventDefault() { prevented = true; } }, "https://attacker.invalid/");
    assert.equal(prevented, true, eventName);
  }
  let prevented = false;
  window.webContents.emit("will-attach-webview", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test("sensitive permissions default to deny, including subframes", async () => {
  const { window } = await startMain();
  assert.equal(typeof window.permissionRequest, "function");
  assert.equal(typeof window.permissionCheck, "function");
  for (const permission of ["media", "geolocation", "midiSysex", "clipboard-read", "openExternal"]) {
    let granted;
    window.permissionRequest(window.webContents, permission, (value) => { granted = value; }, { requestingUrl: window.url, isMainFrame: true });
    assert.equal(granted, false, permission);
    assert.equal(window.permissionCheck(window.webContents, permission, window.url, { isMainFrame: true }), false);
  }
  let granted;
  window.permissionRequest(window.webContents, "notifications", (value) => { granted = value; }, { requestingUrl: "https://attacker.invalid/", isMainFrame: false });
  assert.equal(granted, false);
});

test("a port collision fails visibly instead of opening another local service", async () => {
  const { app, window, errors } = await startMain({ startupError: new Error("listen EADDRINUSE") });
  assert.equal(window, undefined);
  assert.equal(app.didQuit, true);
  assert.equal(errors.length, 1);
});
