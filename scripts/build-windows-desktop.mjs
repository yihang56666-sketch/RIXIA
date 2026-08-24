import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const distIndex = path.join(root, "dist", "index.html");
const isWindows = process.platform === "win32";
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: isWindows });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

if (!existsSync(distIndex)) {
  await run(isWindows ? "npm.cmd" : "npm", ["run", "build"]);
}

await run("node", ["scripts/build-windows-portable.mjs"]);
await run("node", ["scripts/pack-electron-win.mjs"]);
