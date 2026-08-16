// 将 RIXIA 网页构建产物同步到 FocuBili（合体工程）的 Flutter assets 中。
// 用法：node scripts/export-flutter-assets.mjs <focubili 工程路径>
// 默认路径：../focubili-src
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(root, "..");
const target = resolve(process.argv[2] ?? join(projectRoot, "..", "focubili-src"));
const targetAssets = join(target, "assets", "rixia");

if (!existsSync(join(target, "pubspec.yaml"))) {
  console.error(`未找到 FocuBili 工程：${target}`);
  process.exit(1);
}

console.log("构建 RIXIA（相对路径 base）…");
execSync("npx vite build", { cwd: projectRoot, stdio: "inherit" });

console.log(`同步到 ${targetAssets} …`);
rmSync(targetAssets, { recursive: true, force: true });
mkdirSync(targetAssets, { recursive: true });
cpSync(join(projectRoot, "dist"), targetAssets, { recursive: true });

console.log("完成。接下来在 FocuBili 工程执行 flutter build apk 即可。");
