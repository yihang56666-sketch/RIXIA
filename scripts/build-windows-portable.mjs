import { existsSync, mkdirSync, copyFileSync, cpSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const distIndex = path.join(root, "dist", "index.html");
const outDir = path.join(root, "release", "BEID-0.3.0-windows-portable");
const zipPath = path.join(root, "release", "BEID-0.3.0-windows-portable.zip");
const setupPath = path.join(root, "release", "BEID-0.3.0-windows-setup.cmd");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

if (!existsSync(distIndex)) {
  await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(path.join(outDir, "runtime"), { recursive: true });
mkdirSync(path.join(outDir, "app"), { recursive: true });

copyFileSync(process.execPath, path.join(outDir, "runtime", "node.exe"));
cpSync(path.join(root, "dist"), path.join(outDir, "app", "dist"), { recursive: true });
copyFileSync(path.join(root, "electron", "desktop-server.mjs"), path.join(outDir, "app", "desktop-server.mjs"));
if (existsSync(path.join(root, "public", "beid-icon.png"))) {
  copyFileSync(path.join(root, "public", "beid-icon.png"), path.join(outDir, "beid-icon.png"));
}

writeFileSync(
  path.join(outDir, "BEID.cmd"),
  [
    "@echo off",
    "setlocal",
    "cd /d \"%~dp0\"",
    "set BEID_DESKTOP_PORT=4173",
    "start \"BEID-runtime\" /min \"%~dp0runtime\\node.exe\" \"%~dp0app\\desktop-server.mjs\"",
    "powershell -NoProfile -Command \"Start-Sleep -Milliseconds 800\"",
    "if exist \"%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe\" (",
    "  start \"\" \"%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe\" --app=http://127.0.0.1:4173/",
    ") else if exist \"%ProgramFILES%\\Google\\Chrome\\Application\\chrome.exe\" (",
    "  start \"\" \"%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe\" --app=http://127.0.0.1:4173/",
    ") else (",
    "  start \"\" http://127.0.0.1:4173/",
    ")",
    "",
  ].join("\r\n"),
  "utf8",
);

writeFileSync(
  path.join(outDir, "启动BEID.vbs"),
  [
    "Set sh = CreateObject(\"Wscript.Shell\")",
    "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
    "dir = fso.GetParentFolderName(WScript.ScriptFullName)",
    "sh.CurrentDirectory = dir",
    "sh.Environment(\"Process\")(\"BEID_DESKTOP_PORT\") = \"4173\"",
    "sh.Run \"\"\"\" & dir & \"\\runtime\\node.exe\"\" \"\"\" & dir & \"\\app\\desktop-server.mjs\"\"\", 0, False",
    "WScript.Sleep 800",
    "edge = sh.ExpandEnvironmentStrings(\"%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe\")",
    "chrome = sh.ExpandEnvironmentStrings(\"%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe\")",
    "If fso.FileExists(edge) Then",
    "  sh.Run \"\"\"\" & edge & \"\"\" --app=http://127.0.0.1:4173/\", 1, False",
    "ElseIf fso.FileExists(chrome) Then",
    "  sh.Run \"\"\"\" & chrome & \"\"\" --app=http://127.0.0.1:4173/\", 1, False",
    "Else",
    "  sh.Run \"http://127.0.0.1:4173/\", 1, False",
    "End If",
    "",
  ].join("\r\n"),
  "utf8",
);

writeFileSync(
  path.join(outDir, "使用说明.txt"),
  [
    "BEID 0.3.0 Windows 便携版",
    "",
    "双击「启动BEID.vbs」或 BEID.cmd 即可使用。",
    "会在本机 127.0.0.1:4173 启动带 B 站媒体代理的本地服务，并用 Edge/Chrome 应用窗口打开。",
    "手机/平板请安装同目录上一级的 BEID-0.3.0-android-debug.apk。",
    "",
  ].join("\r\n"),
  "utf8",
);

writeFileSync(
  setupPath,
  [
    "@echo off",
    "setlocal",
    "set SRC=%~dp0BEID-0.3.0-windows-portable",
    "set DEST=%LOCALAPPDATA%\\Programs\\BEID",
    "if not exist \"%SRC%\\启动BEID.vbs\" (",
    "  echo 未找到便携版目录: %SRC%",
    "  pause",
    "  exit /b 1",
    ")",
    "mkdir \"%DEST%\" >nul 2>nul",
    "xcopy /e /y /q \"%SRC%\\*\" \"%DEST%\\\" >nul",
    "powershell -NoProfile -Command \"$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\BEID.lnk'); $s.TargetPath=$env:LOCALAPPDATA+'\\Programs\\BEID\\启动BEID.vbs'; $s.WorkingDirectory=$env:LOCALAPPDATA+'\\Programs\\BEID'; $s.WindowStyle=7; $s.Save(); $sm=[Environment]::GetFolderPath('StartMenu')+'\\Programs'; New-Item -ItemType Directory -Force -Path $sm | Out-Null; $s2=(New-Object -ComObject WScript.Shell).CreateShortcut($sm+'\\BEID.lnk'); $s2.TargetPath=$env:LOCALAPPDATA+'\\Programs\\BEID\\启动BEID.vbs'; $s2.WorkingDirectory=$env:LOCALAPPDATA+'\\Programs\\BEID'; $s2.Save()\"",
    "echo 已安装到 %DEST%",
    "echo 桌面和开始菜单已创建 BEID 快捷方式。",
    "start \"\" \"%DEST%\\启动BEID.vbs\"",
    "",
  ].join("\r\n"),
  "utf8",
);

if (existsSync(zipPath)) rmSync(zipPath);
await run("powershell.exe", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -LiteralPath '${outDir}' -DestinationPath '${zipPath}' -Force`,
]);

console.log(
  JSON.stringify(
    {
      ok: true,
      portableDir: outDir,
      zipPath,
      setupPath,
    },
    null,
    2,
  ),
);
