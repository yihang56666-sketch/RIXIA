# FocuBili Desktop (Tauri)

Tauri 2 configuration for packaging FocuBili as a native Windows application.

When the app runs in this environment, it can:

- Bypass browser CORS restrictions via @tauri-apps/plugin-http
- Handle bilibili:// and focubili:// protocol deep links via @tauri-apps/plugin-deep-link
- Play DASH video streams directly via HTML5 video + MSE (no iframe needed)
- Receive native notifications and use system services

## Prerequisites

- Rust 1.70+ (https://rustup.rs/)
- Node.js 20+
- Microsoft Visual Studio 2022 with Desktop development with C++ workload
- WebView2 Runtime (bundled with Windows 11)

## Build

    cd src-tauri
    npm install
    npm run build

Output: target/release/bundle/msi or nsis installer.

## Architecture

The Rust main process (src/main.rs) registers three Tauri plugins:
- tauri-plugin-deep-link: registers bilibili:// and focubili:// URI schemes
- tauri-plugin-http: provides @tauri-apps/plugin-http for CORS-free HTTP from frontend
- tauri-plugin-shell: opens external URLs in default browser

The frontend (src/lib/bilibili/httpAdapter.ts) auto-detects the Tauri environment
via window.__TAURI__ and switches HTTP requests from fetch to Tauri HTTP plugin.
The same codebase works in browser/PWA, Capacitor Android, and Tauri desktop
without modification; only the transport layer changes.

## License boundary

Tauri configuration files are part of the FocuBili repository and follow its license.
Tauri framework itself is MIT/Apache-2.0 dual-licensed.
