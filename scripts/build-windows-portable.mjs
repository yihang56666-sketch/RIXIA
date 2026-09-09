import { existsSync, mkdirSync, copyFileSync, cpSync, writeFileSync } from "node:fs";
import path from "node:path";
import { projectRoot, releaseVersion, run, resetReleaseDirectory, validateWebDist, assertSafeReleasePath, writeReleaseManifest, archiveRelease } from "./release-utils.mjs";

if (process.platform !== "win32") throw new Error("The portable Node runtime must be packaged on Windows");
const version = releaseVersion();
const outDir = path.join(projectRoot, "release", `BEID-${version}-windows-portable`);
const zipPath = `${outDir}.zip`;
const setupPath = path.join(projectRoot, "release", `BEID-${version}-windows-portable-setup.cmd`);

if (!process.argv.includes("--prepared")) await run("npm.cmd", ["run", "build"]);
validateWebDist(path.join(projectRoot, "dist"));
assertSafeReleasePath(projectRoot, zipPath);
assertSafeReleasePath(projectRoot, setupPath);
resetReleaseDirectory(projectRoot, outDir);
mkdirSync(path.join(outDir, "runtime"), { recursive: true });
mkdirSync(path.join(outDir, "app", "electron"), { recursive: true });
copyFileSync(process.execPath, path.join(outDir, "runtime", "node.exe"));
const nodeLicense = path.join(path.dirname(process.execPath), "LICENSE");
if (existsSync(nodeLicense)) copyFileSync(nodeLicense, path.join(outDir, "runtime", "LICENSE"));
cpSync(path.join(projectRoot, "dist"), path.join(outDir, "app", "dist"), { recursive: true });
for (const filename of ["desktop-server.mjs", "portable-launcher.mjs"]) {
  copyFileSync(path.join(projectRoot, "electron", filename), path.join(outDir, "app", "electron", filename));
}
if (existsSync(path.join(projectRoot, "public", "beid-icon.png"))) {
  copyFileSync(path.join(projectRoot, "public", "beid-icon.png"), path.join(outDir, "beid-icon.png"));
}

writeFileSync(path.join(outDir, "BEID.cmd"), [
  "@echo off", "setlocal", 'wscript.exe "%~dp0launch.vbs"', "",
].join("\r\n"), "utf8");

writeFileSync(path.join(outDir, "启动BEID.vbs"), "\ufeff" + [
  'Set sh = CreateObject("Wscript.Shell")',
  'Set fso = CreateObject("Scripting.FileSystemObject")',
  'dir = fso.GetParentFolderName(WScript.ScriptFullName)',
  'sh.CurrentDirectory = dir',
  'result = sh.Run("""" & dir & "\\runtime\\node.exe"" """ & dir & "\\app\\electron\\portable-launcher.mjs""", 0, True)',
  'If result <> 0 Then MsgBox "BEID 启动失败。请确认 4173 端口空闲，并已安装 Edge 或 Chrome。", 16, "BEID"',
  "",
].join("\r\n"), "utf16le");
copyFileSync(path.join(outDir, "启动BEID.vbs"), path.join(outDir, "launch.vbs"));

writeFileSync(path.join(outDir, "使用说明.txt"), [
  `BEID ${version} Windows 便携版`, "",
  "双击「启动BEID.vbs」或 BEID.cmd。仅在本地服务成功监听后打开应用。",
  "本地服务使用 127.0.0.1:4173；端口被占用时停止，不连接到已有服务。",
  "需要 Edge 或 Chrome，使用 LOCALAPPDATA/BEID/portable-browser 独立资料目录，不读取默认浏览器账户。",
  "与旧版本默认浏览器资料目录相互隔离；旧数据请先在旧版本导出后导入。",
  "首次启动请检查系统防护提示；此版本没有代码签名。", "",
].join("\r\n"), "utf8");

writeFileSync(setupPath, [
  "@echo off", "setlocal",
  `set "SRC=%~dp0BEID-${version}-windows-portable"`,
  'set "DEST=%LOCALAPPDATA%\\Programs\\BEID-portable"',
  'if not exist "%SRC%\\launch.vbs" exit /b 1',
  'mkdir "%DEST%" >nul 2>nul',
  'xcopy /e /y /q "%SRC%\\*" "%DEST%\\" >nul',
  "if errorlevel 1 exit /b 1",
  'powershell -NoProfile -Command "$ErrorActionPreference=\'Stop\'; $dest=Join-Path $env:LOCALAPPDATA \'Programs\\BEID-portable\'; $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath(\'Desktop\')) \'BEID portable.lnk\')); $shortcut.TargetPath=Join-Path $dest \'launch.vbs\'; $shortcut.WorkingDirectory=$dest; $shortcut.Save()"',
  "if errorlevel 1 exit /b 1",
  'start "" "%DEST%\\launch.vbs"', "",
].join("\r\n"), "utf8");

writeReleaseManifest(outDir, version, "browser-portable-windows");
await archiveRelease(projectRoot, outDir, zipPath);
console.log(JSON.stringify({ ok: true, portableDir: outDir, zipPath, setupPath }, null, 2));
