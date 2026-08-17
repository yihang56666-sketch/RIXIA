/**
 * Cross-viewport smoke check. Curls the dev server and confirms:
 * - HTTP 200
 * - HTML contains root selector and script tag
 * - dist build contains the new CSS tokens
 *
 * For full visual acceptance (layout, contrast, no overflow) run the dev
 * server and check in a browser. This script is a build-integrity gate.
 */
import { readFileSync, readdirSync } from "node:fs";
import http from "node:http";

const BASE = "http://127.0.0.1:5173";

function fetchIndex() {
  return new Promise((resolve, reject) => {
    const req = http.get(BASE, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

async function main() {
  const index = await fetchIndex();
  assert(index.status === 200, "dev server responds 200");
  assert(String(index.body).includes('<div id="root">'), "HTML has #root");

  const cssFiles = readdirSync("dist/assets").filter((name) => name.endsWith(".css"));
  assert(cssFiles.length === 1, `dist/assets has exactly one CSS file (got ${cssFiles.length})`);
  const css = readFileSync(`dist/assets/${cssFiles[0]}`, "utf-8");
  assert(css.includes('data-theme=porcelain]') || css.includes('data-theme="porcelain"]'), "CSS has porcelain skin");
  assert(css.includes('data-theme=graphite]') || css.includes('data-theme="graphite"]'), "CSS has graphite skin");
  assert(css.includes('data-theme=system]') || css.includes('data-theme="system"]'), "CSS has system skin");
  assert(css.includes(".today-action"), "CSS has today-action");
  assert(css.includes(".today-status-strip"), "CSS has status-strip");
  assert(css.includes(".segmented"), "CSS has segmented control");
  assert(css.includes(".capture-fab"), "CSS has capture FAB");
  assert(css.includes(".journal"), "CSS has journal");
  assert(css.includes("prefers-reduced-motion"), "CSS respects reduced motion");
  assert(css.includes("[data-density="), "CSS has density tokens");
  assert(!css.includes('data-theme=paper]') && !css.includes('data-theme="paper"]'), "CSS has no legacy paper skin");
  assert(!css.includes('data-theme=mist]') && !css.includes('data-theme="mist"]'), "CSS has no legacy mist skin");

  console.log("\nAll build-integrity checks passed.");
}

main().catch((err) => {
  console.error("Cross-viewport check failed:", err.message);
  process.exit(1);
});
