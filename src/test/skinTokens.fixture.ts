import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cssPath = resolve(__dirname, "../styles/global.css");
export const GLOBAL_CSS_SNIPPET = readFileSync(cssPath, "utf-8");
