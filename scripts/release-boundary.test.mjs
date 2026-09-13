import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runModule } from "./test-support/module-harness.mjs";
import { archiveRelease, runPowerShell, powerShellQuote } from "./release-utils.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const artifactsRoot = path.join(scriptsRoot, ".test-artifacts");

function fixture(context, version = "0.3.0") {
  fs.mkdirSync(artifactsRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(artifactsRoot, "release space's & "));
  const write = (relative, content = "fixture") => {
    const destination = path.join(root, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  };
  write("package.json", JSON.stringify({ name: "beid", version, type: "module" }));
  write("dist/index.html", "<html>fixture</html>");
  write("dist/assets/app.js", "console.log('fixture')");
  write("runtime/electron.exe");
  write("runtime/resources/default_app.asar");
  write("runtime/locales/en-US.pak");
  write("runtime/version", "43.4.1");
  write("node.exe");
  for (const entry of fs.readdirSync(scriptsRoot).filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"))) {
    write(`scripts/${entry}`, fs.readFileSync(path.join(scriptsRoot, entry)));
  }
  for (const entry of fs.readdirSync(path.join(scriptsRoot, "../electron")).filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs"))) {
    write(`electron/${entry}`, fs.readFileSync(path.join(scriptsRoot, "../electron", entry)));
  }
  context.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(artifactsRoot) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const commands = [];
  async function run(name, args = []) {
    const filename = path.join(root, "scripts", name);
    return runModule(filename, {
      globals: {
        console: { log() {}, error() {} },
        process: { platform: "win32", env: { BEID_ELECTRON_DIST: path.join(root, "runtime") }, cwd: () => root, execPath: path.join(root, "node.exe"), argv: [process.execPath, filename, ...args] },
      },
      replacements: { "node:child_process": { spawn: (command, args, options) => {
        commands.push({ command, args, options });
        const child = new EventEmitter();
        queueMicrotask(() => child.emit("exit", 0));
        return child;
      } } },
    });
  }
  return { root, write, commands, run };
}

test("desktop release rebuilds the frontend even when stale dist exists", async (context) => {
  const { commands, run } = fixture(context);
  await run("build-windows-desktop.mjs");
  const invocation = commands[0];
  const encodedIndex = invocation.args.findIndex((argument) => argument.toLowerCase() === "-encodedcommand");
  const commandText = encodedIndex >= 0 ? Buffer.from(invocation.args[encodedIndex + 1], "base64").toString("utf16le") : invocation.args.join(" ");
  assert.ok(invocation.args.includes("build") || commandText.includes("'run' 'build'"), "first release command must rebuild the frontend");
});

test("portable package retains the server's relative dist layout and starts offline", async (context) => {
  const { root, run } = fixture(context);
  await run("build-windows-portable.mjs");
  const serverPath = path.join(root, "release/BEID-0.3.0-windows-portable/app/electron/desktop-server.mjs");
  assert.ok(fs.existsSync(serverPath), "packaged server must be next to ../dist, not inside dist's parent");
  const { startBeidDesktopServer } = await import(pathToFileURL(serverPath).href);
  const server = await startBeidDesktopServer();
  await server.close();
});

test("release payload rejects environment files instead of distributing them", async (context) => {
  const { write, run } = fixture(context);
  write("dist/.env", "EXAMPLE_SECRET=fixture-only");
  await assert.rejects(run("pack-electron-win.mjs"), /unsafe|unexpected|forbidden|private/i);
});

test("overridden Electron runtime cannot smuggle a previous app or private profile", async (context) => {
  const { write, run } = fixture(context);
  write("runtime/resources/app/private.json", '{"fixture":"private"}');
  await assert.rejects(run("pack-electron-win.mjs"), /unsafe|unexpected|forbidden|private/i);
});

test("release reset refuses a junction parent and preserves its contents", async (context) => {
  const { root, write, run } = fixture(context);
  write("outside/BEID-0.3.0-windows-app/keep.txt", "do not delete");
  fs.symlinkSync(path.join(root, "outside"), path.join(root, "release"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(run("pack-electron-win.mjs"), /junction|symlink|outside|unsafe/i);
  assert.equal(fs.readFileSync(path.join(root, "outside/BEID-0.3.0-windows-app/keep.txt"), "utf8"), "do not delete");
});

test("release version comes from the project manifest", async (context) => {
  const { root, run } = fixture(context, "0.4.2");
  await run("pack-electron-win.mjs");
  assert.ok(fs.existsSync(path.join(root, "release/BEID-0.4.2-windows-app/BEID.exe")));
});

test("PowerShell archive arguments are hidden, shell-free and safely quote apostrophes", async (context) => {
  const { root, commands, run } = fixture(context);
  await run("pack-electron-win.mjs");
  const invocation = commands.findLast((entry) => entry.command.toLowerCase().includes("powershell"));
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.windowsHide, true);
  const encodedIndex = invocation.args.findIndex((argument) => argument.toLowerCase() === "-encodedcommand");
  const script = encodedIndex >= 0 ? Buffer.from(invocation.args[encodedIndex + 1], "base64").toString("utf16le") : invocation.args.at(-1);
  assert.ok(script.includes(root.replaceAll("'", "''")));
});

test("release produces a deterministic hash inventory without machine paths", async (context) => {
  const { root, run } = fixture(context);
  await run("pack-electron-win.mjs");
  const outDir = path.join(root, "release/BEID-0.3.0-windows-app");
  const manifestPath = path.join(outDir, "release-manifest.json");
  assert.ok(fs.existsSync(manifestPath), "release inventory missing");
  const first = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(first);
  assert.equal(manifest.version, "0.3.0");
  assert.ok(!first.includes(root));
  assert.ok(manifest.files.length > 0);
  for (const entry of manifest.files) {
    const content = fs.readFileSync(path.join(outDir, entry.path));
    assert.equal(entry.sha256, createHash("sha256").update(content).digest("hex"), entry.path);
  }
  await run("pack-electron-win.mjs");
  assert.equal(fs.readFileSync(manifestPath, "utf8"), first);
});

test("portable launch waits for its own server and never opens a browser after a bind failure", async () => {
  const launcher = path.join(scriptsRoot, "../electron/portable-launcher.mjs");
  assert.ok(fs.existsSync(launcher), "portable launch needs an acknowledged server, not an 800ms sleep");
  let opened = false;
  await assert.rejects(runModule(launcher, { replacements: {
    "./desktop-server.mjs": { startBeidDesktopServer: async () => { throw new Error("EADDRINUSE"); } },
    "node:child_process": { spawn: () => { opened = true; } },
  } }), /EADDRINUSE/);
  assert.equal(opened, false);
});

test("portable launch files use an ASCII cmd entry and BOM-marked Unicode VBScript", async (context) => {
  const { root, run } = fixture(context);
  await run("build-windows-portable.mjs");
  const outDir = path.join(root, "release/BEID-0.3.0-windows-portable");
  const command = fs.readFileSync(path.join(outDir, "BEID.cmd"), "utf8");
  assert.match(command, /launch\.vbs/);
  assert.ok([...command].every((character) => character.charCodeAt(0) < 128));
  const script = fs.readFileSync(path.join(outDir, "启动BEID.vbs"));
  assert.deepEqual([...script.subarray(0, 2)], [0xff, 0xfe]);
});

test("real Windows archive round trip supports Unicode, spaces, apostrophes and ampersands", { skip: process.platform !== "win32" }, async (context) => {
  const { root, write } = fixture(context);
  write("release/archive-fixture/payload.txt", "offline archive fixture");
  const outDir = path.join(root, "release/archive-fixture");
  const zipPath = path.join(root, "release/archive-fixture.zip");
  const expanded = path.join(root, "release/expanded");
  await archiveRelease(root, outDir, zipPath);
  assert.ok(fs.statSync(zipPath).size > 0);
  await runPowerShell(`Expand-Archive -LiteralPath ${powerShellQuote(zipPath)} -DestinationPath ${powerShellQuote(expanded)}`);
  assert.equal(fs.readFileSync(path.join(expanded, "archive-fixture/payload.txt"), "utf8"), "offline archive fixture");
});

test("workspace version is aligned across the app, Android manifest and update check", () => {
  const root = path.resolve(scriptsRoot, "..");
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const miscServices = fs.readFileSync(path.join(root, "src/lib/bilibili/miscServices.ts"), "utf8");
  const aboutView = fs.readFileSync(path.join(root, "src/features/bilibili/AboutView.tsx"), "utf8");
  const settingsView = fs.readFileSync(path.join(root, "src/features/settings/SettingsView.tsx"), "utf8");
  const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

  assert.match(miscServices, new RegExp(`APP_VERSION = "${version}"`));
  assert.match(aboutView, /版本 \{APP_VERSION\}/);
  assert.match(settingsView, /BEID · \{APP_VERSION\}/);
  assert.match(gradle, new RegExp(`versionName "${version}"`));
  assert.match(gradle, /versionCode 8/);
});

test("pad fullscreen hides page details and narrow screens keep a single compact control row", () => {
  const root = path.resolve(scriptsRoot, "..");
  const css = fs.readFileSync(path.join(root, "src/styles/global.css"), "utf8");
  const fullscreenRules = css.slice(css.indexOf("html.fb-player-active-fullscreen"));
  assert.match(fullscreenRules, /\.focubili-rail/);
  assert.match(fullscreenRules, /\.fb-player-details\s*\{\s*display:\s*none;/);
  const compactRule = css.slice(css.lastIndexOf(".fb-player-ctl-row {"));
  assert.match(compactRule, /flex-wrap:\s*nowrap/);
  assert.match(compactRule, /overflow-x:\s*auto/);
});
