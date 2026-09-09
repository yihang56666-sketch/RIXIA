import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export function releaseVersion(root = projectRoot) {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error("Unsafe release version");
  return version;
}

export function powerShellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function run(command, args, options = {}) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return runPowerShell(`& ${powerShellQuote(command)} ${args.map(powerShellQuote).join(" ")}; exit $LASTEXITCODE`, options);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? projectRoot,
      env: options.env ?? process.env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code ?? signal})`)));
  });
}

export function runPowerShell(script, options) {
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(`$ErrorActionPreference = 'Stop'; ${script}`, "utf16le").toString("base64")], options);
}

export function assertSafeReleasePath(root, target) {
  const base = path.resolve(root);
  const releaseRoot = path.join(base, "release");
  const resolved = path.resolve(target);
  const relative = path.relative(releaseRoot, resolved);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Unsafe release path outside release directory");
  }
  let current = base;
  for (const segment of path.relative(base, resolved).split(path.sep)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error("Unsafe release path: symlink or junction");
    }
  }
  return resolved;
}

export function resetReleaseDirectory(root, target) {
  const resolved = assertSafeReleasePath(root, target);
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function filesIn(root, allowedDirectory = () => true) {
  const files = [];
  function visit(directory, relative = "") {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error(`Unsafe symlink in package: ${relative || "."}`);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) throw new Error(`Unsafe private or linked package entry: ${next}`);
      if (entry.isDirectory()) {
        if (!allowedDirectory(next)) throw new Error(`Unexpected package directory: ${next}`);
        visit(path.join(directory, entry.name), next);
      } else if (entry.isFile()) {
        files.push(next);
      } else {
        throw new Error(`Unsafe package entry: ${next}`);
      }
    }
  }
  visit(root);
  return files.sort();
}

export function validateWebDist(distDir) {
  const assetTypes = new Set([".js", ".css", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".wasm"]);
  const rootFiles = new Set(["index.html", "sw.js", "manifest.webmanifest"]);
  const rootImageTypes = new Set([".png", ".svg", ".jpg", ".jpeg", ".webp", ".gif", ".ico"]);
  if (!fs.existsSync(path.join(distDir, "index.html"))) throw new Error("Frontend dist missing");
  for (const relative of filesIn(distDir, (directory) => directory === "assets" || directory.startsWith("assets/"))) {
    const extension = path.extname(relative).toLowerCase();
    if (rootFiles.has(relative) || relative.startsWith("assets/") && assetTypes.has(extension)
      || !relative.includes("/") && rootImageTypes.has(extension)) continue;
    throw new Error(`Unexpected or private frontend payload: ${relative}`);
  }
}

export function validateElectronRuntime(runtimeDir) {
  const runtimeFiles = new Set([
    "electron.exe", "chrome_100_percent.pak", "chrome_200_percent.pak", "d3dcompiler_47.dll", "ffmpeg.dll",
    "icudtl.dat", "libEGL.dll", "libGLESv2.dll", "LICENSE", "LICENSES.chromium.html", "resources.pak",
    "snapshot_blob.bin", "v8_context_snapshot.bin", "vk_swiftshader.dll", "vk_swiftshader_icd.json",
    "vulkan-1.dll", "dxcompiler.dll", "dxil.dll", "version", "resources/default_app.asar", "chrome_crashpad_handler.exe",
  ]);
  for (const relative of filesIn(runtimeDir, (directory) => ["resources", "locales"].includes(directory))) {
    if (runtimeFiles.has(relative) || /^locales\/[a-zA-Z0-9_-]+\.pak$/.test(relative)) continue;
    throw new Error(`Unexpected or private Electron runtime payload: ${relative}`);
  }
}

export function writeReleaseManifest(outDir, version, kind) {
  const files = filesIn(outDir).filter((relative) => relative !== "release-manifest.json").map((relative) => {
    const content = fs.readFileSync(path.join(outDir, relative));
    return { path: relative, bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") };
  });
  fs.writeFileSync(path.join(outDir, "release-manifest.json"), JSON.stringify({ schemaVersion: 1, version, kind, files }, null, 2) + "\n");
}

export async function archiveRelease(root, outDir, zipPath) {
  assertSafeReleasePath(root, outDir);
  assertSafeReleasePath(root, zipPath);
  await runPowerShell(`Compress-Archive -LiteralPath ${powerShellQuote(outDir)} -DestinationPath ${powerShellQuote(zipPath)} -Force`);
}
