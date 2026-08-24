import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const electronDist = "C:\\\\beid-build\\\\node_modules\\\\electron\\\\dist";
const outDir = path.join(projectRoot, "release", "BEID-0.3.0-windows-app");
const zipPath = path.join(projectRoot, "release", "BEID-0.3.0-windows-app.zip");

if (!existsSync(path.join(electronDist, "electron.exe"))) {
  throw new Error(`electron.exe missing at ${electronDist}`);
}
if (!existsSync(path.join(projectRoot, "dist", "index.html"))) {
  throw new Error("frontend dist missing");
}

rmSync(outDir, { recursive: true, force: true });
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
      version: "0.3.0",
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
  path.join(projectRoot, "release", "BEID-0.3.0-windows-setup.cmd"),
  [
    "@echo off",
    "setlocal",
    "set SRC=%~dp0BEID-0.3.0-windows-app",
    "if not exist \"%SRC%\\BEID.exe\" set SRC=%~dp0BEID-0.3.0-windows-portable",
    "set DEST=%LOCALAPPDATA%\\Programs\\BEID",
    "if not exist \"%SRC%\\BEID.exe\" if not exist \"%SRC%\\启动BEID.vbs\" (",
    "  echo 未找到 Windows 安装内容",
    "  pause",
    "  exit /b 1",
    ")",
    "mkdir \"%DEST%\" >nul 2>nul",
    "xcopy /e /y /q \"%SRC%\\*\" \"%DEST%\\\" >nul",
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

if (existsSync(zipPath)) rmSync(zipPath);
await run("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -LiteralPath '${outDir}' -DestinationPath '${zipPath}' -Force`]);
console.log(JSON.stringify({ ok: true, outDir, zipPath }, null, 2));
