import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { projectRoot, releaseVersion, run, resetReleaseDirectory, validateWebDist, validateElectronRuntime, assertSafeReleasePath, writeReleaseManifest, archiveRelease } from "./release-utils.mjs";

// Electron dist 跟随当前工程解析：优先 BEID_ELECTRON_DIST 环境变量，
// 其次本仓库 node_modules 里的 electron 包，不再硬编码某台打包机的盘符路径。
const electronDist =
  process.env.BEID_ELECTRON_DIST ??
  path.dirname(createRequire(path.join(projectRoot, "package.json")).resolve("electron/package.json")) +
    path.sep +
    "dist";
const version = releaseVersion();
const outDir = path.join(projectRoot, "release", `BEID-${version}-windows-app`);
const zipPath = `${outDir}.zip`;
const setupPath = path.join(projectRoot, "release", `BEID-${version}-windows-setup.cmd`);

if (!existsSync(path.join(electronDist, "electron.exe"))) {
  throw new Error(`electron.exe missing at ${electronDist}`);
}
validateElectronRuntime(electronDist);
if (!process.argv.includes("--prepared")) await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);
if (!existsSync(path.join(projectRoot, "dist", "index.html"))) {
  throw new Error("frontend dist missing");
}

validateWebDist(path.join(projectRoot, "dist"));
assertSafeReleasePath(projectRoot, zipPath);
assertSafeReleasePath(projectRoot, setupPath);
resetReleaseDirectory(projectRoot, outDir);
mkdirSync(path.dirname(outDir), { recursive: true });
cpSync(electronDist, outDir, { recursive: true });
copyFileSync(path.join(outDir, "electron.exe"), path.join(outDir, "BEID.exe"));
rmSync(path.join(outDir, "electron.exe"), { force: true });
rmSync(path.join(outDir, "resources", "default_app.asar"), { force: true });

const appDir = path.join(outDir, "resources", "app");
mkdirSync(path.join(appDir, "electron"), { recursive: true });
copyFileSync(path.join(projectRoot, "electron", "main.mjs"), path.join(appDir, "electron", "main.mjs"));
copyFileSync(path.join(projectRoot, "electron", "desktop-server.mjs"), path.join(appDir, "electron", "desktop-server.mjs"));
writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify(
    {
      name: "beid",
      version,
      private: true,
      type: "module",
      main: "electron/main.mjs",
    },
    null,
    2,
  ) + "\n",
);

cpSync(path.join(projectRoot, "dist"), path.join(outDir, "resources", "dist"), { recursive: true });

writeFileSync(
  setupPath,
  [
    "@echo off",
    "setlocal",
    `set "SRC=%~dp0BEID-${version}-windows-app"`,
    `if not exist "%SRC%\\BEID.exe" set "SRC=%~dp0BEID-${version}-windows-portable"`,
    'set "DEST=%LOCALAPPDATA%\\Programs\\BEID"',
    "if not exist \"%SRC%\\BEID.exe\" if not exist \"%SRC%\\启动BEID.vbs\" (",
    "  echo 未找到 Windows 安装内容",
    "  pause",
    "  exit /b 1",
    ")",
    "mkdir \"%DEST%\" >nul 2>nul",
    "xcopy /e /y /q \"%SRC%\\*\" \"%DEST%\\\" >nul",
    "if errorlevel 1 exit /b 1",
    "if exist \"%DEST%\\BEID.exe\" (",
    "  set TARGET=%DEST%\\BEID.exe",
    ") else (",
    "  set TARGET=%DEST%\\启动BEID.vbs",
    ")",
    "powershell -NoProfile -Command \"$dest=$env:LOCALAPPDATA+'\\Programs\\BEID'; $target=Join-Path $dest 'BEID.exe'; if (-not (Test-Path $target)) { $target=Join-Path $dest '启动BEID.vbs' }; $s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\BEID.lnk'); $s.TargetPath=$target; $s.WorkingDirectory=$dest; $s.Save(); $sm=Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'; New-Item -ItemType Directory -Force -Path $sm | Out-Null; $s2=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $sm 'BEID.lnk')); $s2.TargetPath=$target; $s2.WorkingDirectory=$dest; $s2.Save()\"",
    "echo 已安装到 %DEST%",
    "if exist \"%DEST%\\BEID.exe\" (start \"\" \"%DEST%\\BEID.exe\") else (start \"\" \"%DEST%\\启动BEID.vbs\")",
    "",
  ].join("\r\n"),
  "utf8",
);

writeReleaseManifest(outDir, version, "electron-windows");
await archiveRelease(projectRoot, outDir, zipPath);
console.log(JSON.stringify({ ok: true, outDir, zipPath }, null, 2));
