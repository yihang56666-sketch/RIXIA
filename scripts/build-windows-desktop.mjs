import { run } from "./release-utils.mjs";
const isWindows = process.platform === "win32";
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

await run(isWindows ? "npm.cmd" : "npm", ["run", "build"]);
await run(process.execPath, ["scripts/build-windows-portable.mjs", "--prepared"]);
await run(process.execPath, ["scripts/pack-electron-win.mjs", "--prepared"]);
