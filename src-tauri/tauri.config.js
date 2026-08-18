// Tauri main process entry — RIXIA desktop shell
// Provides: window creation, deep-link protocol handling, HTTP bridge
// Author: RIXIA

import { defineConfig } from "@tauri-apps/cli";

export default defineConfig({
  // Plugins are auto-discovered from package.json; this file exists mainly
  // so that `tauri dev` and `tauri build` have a stable entrypoint.
});
