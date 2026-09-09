import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { startBeidDesktopServer } from "./desktop-server.mjs";

const desktop = await startBeidDesktopServer({ port: 4173 });

async function closeDesktop() {
  desktop.server.closeAllConnections();
  await desktop.close();
}

try {
  const candidates = [
    [process.env["ProgramFiles(x86)"], "Microsoft/Edge/Application/msedge.exe"],
    [process.env.ProgramFiles, "Microsoft/Edge/Application/msedge.exe"],
    [process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe"],
    [process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"],
  ];
  const browser = candidates.filter(([base]) => base).map(([base, suffix]) => path.join(base, suffix)).find(existsSync);
  if (!browser || !process.env.LOCALAPPDATA) throw new Error("Edge or Chrome and LOCALAPPDATA are required");
  const profile = path.join(process.env.LOCALAPPDATA, "BEID", "portable-browser");
  mkdirSync(profile, { recursive: true });
  const child = spawn(browser, [`--app=${desktop.url}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check"], {
    shell: false, windowsHide: true, stdio: "ignore",
  });
  child.once("error", (error) => {
    console.error("BEID browser launch failed:", error.code ?? error.name);
    process.exitCode = 1;
    void closeDesktop().catch((closeError) => console.error("BEID shutdown failed:", closeError.code ?? closeError.name));
  });
  child.once("exit", () => {
    void closeDesktop().catch((error) => console.error("BEID shutdown failed:", error.code ?? error.name));
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      void closeDesktop().catch((error) => console.error("BEID shutdown failed:", error.code ?? error.name));
    });
  }
} catch (error) {
  await closeDesktop();
  throw error;
}
