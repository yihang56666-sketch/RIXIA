# BEID Tauri — historical scaffold, not a release target

Status verified against main `46ff23c` during the native audit dated 2026-09-05 (checks continued on 2026-09-06).

The supported desktop entry in the root package is `electron/main.mjs`; `npm run desktop:win` runs the Windows packaging scripts in `scripts/`. Nothing in that release chain invokes this directory. Android uses Capacitor independently.

This directory preserves an earlier Tauri experiment. Do not treat its old configuration, plugin registration, broad CSP, or frontend Tauri detection branches as evidence of a functioning or security-reviewed Tauri release:

- `Cargo.toml` declares a library, but `src/lib.rs` is absent. Only `src/main.rs` is present.
- There is no checked-in Cargo lockfile or Tauri capability definition.
- The previous README claimed notification support, although the Rust entry only registers deep-link, HTTP and shell plugins.
- The JavaScript config is not evidence that the installed Tauri CLI supports that entry; the root project does not install or call this nested CLI.
- Rust/Cargo were not available in the audit environment. No Tauri compilation, bundling, protocol registration, capability grant, or device validation was performed.

No permissions or capabilities were added to make the scaffold appear operational. Reviving it needs an explicit product decision, a working and locked build, least-privilege Tauri capabilities, protocol/origin validation, and separate regression tests. Use the Electron release path for current desktop work.

See `../docs/NATIVE_AUDIT_2026-09-05.md` for scope, evidence and remaining native release gates.
