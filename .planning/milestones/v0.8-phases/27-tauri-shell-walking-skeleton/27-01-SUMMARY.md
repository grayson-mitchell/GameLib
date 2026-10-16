---
phase: 27-tauri-shell-walking-skeleton
plan: 01
subsystem: tauri-shell
tags: [tauri, rust, sidecar, transport, interface-first]
requires: []
provides:
  - "src/common/types/sidecarTransport.ts — the JSON-RPC transport contract (SidecarRpcRequest/Response/Notification + Tauri command-name constants + READY_SENTINEL) imported by 27-02 (sidecar) and 27-03 (renderer bridge)"
  - "src-tauri/ — Tauri v2 Rust shell hosting the electron-vite renderer, spawning the Node sidecar, exposing four relay commands + the steam:// opener"
  - "npm scripts tauri:dev and build:sidecar"
affects:
  - "package.json (added @tauri-apps/cli dev dep, @tauri-apps/api + @tauri-apps/plugin-opener runtime deps, 2 scripts)"
tech-stack:
  added:
    - "@tauri-apps/cli@^2.11.4 (dev)"
    - "@tauri-apps/api@^2.11.1"
    - "@tauri-apps/plugin-opener@^2.5.4"
    - "cargo crates: tauri v2, tauri-plugin-opener v2, serde, serde_json"
  patterns:
    - "stdio JSON-RPC (parent<->child pipe), NOT a loopback TCP port (T-27-01)"
    - "3 preload factory contract shapes (invoke/send/on) preserved verbatim by the transport"
key-files:
  created:
    - "src/common/types/sidecarTransport.ts"
    - "src-tauri/Cargo.toml"
    - "src-tauri/build.rs"
    - "src-tauri/tauri.conf.json"
    - "src-tauri/capabilities/default.json"
    - "src-tauri/src/main.rs"
    - "src-tauri/.gitignore"
    - "src-tauri/icons/ (macOS/desktop icon set)"
  modified:
    - "package.json"
    - "pnpm-lock.yaml"
decisions:
  - "Transport framed as stdio JSON-RPC (not loopback) per T-27-01 — Wine on macOS shares the host netns"
  - "All RPC ids are strings (64-bit-safe for Steam ids)"
  - "Icons pruned to macOS/desktop set (dropped generated iOS/Android/Windows-Store icons)"
metrics:
  duration: 9min
  completed: 2026-07-20
---

# Phase 27 Plan 01: Tauri Shell + Transport Contract Summary

Stood up the Tauri v2 Rust shell and the single stdio-JSON-RPC transport contract every other Phase-27 plan builds on — additive, leaving the Electron build byte-for-byte intact.

## What Was Built

**Task 1 — Package legitimacy gate (checkpoint:human-verify, blocking-human):** PASSED. The user verified all six artifacts as official first-party Tauri/keyring packages (`@tauri-apps/cli`, `@tauri-apps/api`, `@tauri-apps/plugin-opener` on npm; `tauri` v2, `tauri-plugin-opener`, `keyring` on crates.io). No [SLOP] packages. (`keyring` was verified for the arc but is not a dependency of this plan — token persistence lands in a later plan.)

**Task 2 — Transport contract (`src/common/types/sidecarTransport.ts`):** The interface-first deliverable. Types + constants only, no runtime logic, no `electron` import. Defines `SidecarRpcRequest` (id/kind/channel/args), `SidecarRpcResponse` (id/ok/result?/error?), `SidecarNotification` (frontendMessage push), `READY_SENTINEL`, and the Tauri command-name constants `SIDECAR_INVOKE`/`SIDECAR_SEND`/`OPEN_EXTERNAL`/`SIDECAR_STORE_SNAPSHOT` + event name `FRONTEND_MESSAGE_EVENT`. All ids are strings (64-bit-safe). Preserves the exact call/return shapes of the three preload factories (`makeHandlerInvoker`→invoke, `makeListenerCaller`→send, `frontendListenerSlot`→on) so 27-03 can re-point them without touching the 379 call-sites. `npm run codecheck` (tsc --noEmit) passes; 10 exports.

**Task 3 — `src-tauri/` Rust shell:** `cargo build` compiles clean. `main.rs` spawns the Node sidecar (`node build/main/sidecar.js`, overridable via `GAMELIB_SIDECAR_ENTRY`), holds its stdin/stdout, and registers four `#[tauri::command]`s per the contract:
- `sidecar_invoke` — writes an invoke frame, awaits the matching response by id (60s guardrail timeout)
- `sidecar_send` — fire-and-forget
- `open_external` — opens the URL via `tauri-plugin-opener` (the `shell.openExternal` / `steam://` parity path)
- `sidecar_store_snapshot` — requests the sidecar's minimal store snapshot for the renderer's synchronous store bridge

A reader thread parses each stdout line: response frames (`ok` present) fulfil the pending invoke by id; `frontendMessage` notifications are re-emitted to the webview as the `frontend_message` Tauri event (the backend→frontend push path). `tauri.conf.json` points `frontendDist` at `../build` (the electron-vite renderer output). Added npm scripts `tauri:dev` and `build:sidecar`. Zero changes under `src/preload/` or `src/backend/`.

## Verification Results

- `cd src-tauri && cargo build` — succeeds (clean, no warnings on incremental build).
- `npm run codecheck` — passes with `sidecarTransport.ts` present.
- `grep -c 'tauri::command' src-tauri/src/main.rs` → 5 (≥4 relay commands).
- `grep -c 'frontendDist' src-tauri/tauri.conf.json` → 1, value `../build` resolves to the electron-vite renderer output.
- `npm run` lists `tauri:dev` and `build:sidecar`; existing scripts (`start`, `codecheck`, `test`, `dist:mac`) unchanged.
- `git diff --stat` shows ZERO changes under `src/preload/` or `src/backend/` from this plan (additive/reversible — REQ-27-06). The only tracked change under `src/backend/` in the working tree is a pre-existing, unrelated `steam/bridge/allowlist.ts` edit that this plan did not touch, stage, or commit.

## Deviations from Plan

**1. [Rule 3 - Blocking] Dev-run wiring made runnable (dropped dangling `devUrl`)**
- **Found during:** Task 3
- **Issue:** The plan suggested `build.devUrl` + `beforeDevCommand` pointing at "the existing renderer dev server," but electron-vite has no standalone renderer-only HTTP server (`electron-vite dev` launches Electron itself). A `devUrl: http://localhost:5173` that nothing serves would make `tauri dev` hang trying to connect.
- **Fix:** Removed `devUrl`/`beforeDevCommand` from `tauri.conf.json` (Tauri then serves `frontendDist` directly) and made `tauri:dev` build the renderer + sidecar first (`electron-vite build && pnpm build:sidecar && tauri dev`). Coherent and actually launchable for the skeleton; live HMR wiring can be refined when 27-02/27-03 land.
- **Files:** `src-tauri/tauri.conf.json`, `package.json`

**2. [Rule 3 - Blocking] Default window icon required for `cargo build`**
- **Found during:** Task 3
- **Issue:** `tauri::generate_context!()` panics at compile without `src-tauri/icons/icon.png` even with `bundle.icon: []`.
- **Fix:** Generated the icon set from the tracked `public/icon.png` via `tauri icon`, then pruned the generated iOS/Android/Windows-Store icons — kept only the macOS/desktop set (`icon.png`, `icon.icns`, 32/64/128 PNGs) to keep the commit lean.
- **Files:** `src-tauri/icons/`

**3. [Rule 3 - Blocking] mpsc `channel` import aliased**
- **Found during:** Task 3 (first `cargo build`)
- **Issue:** The `channel: String` command parameter shadowed the imported `std::sync::mpsc::channel` function, breaking compilation.
- **Fix:** Imported it as `channel as mpsc_channel`.
- **Files:** `src-tauri/src/main.rs`

## Authentication / Human Gates

Task 1 was a `blocking-human` package-legitimacy checkpoint (not auto-approvable). It was surfaced to the user and approved before any install ran — normal flow, not a deviation.

## Known Stubs

- `build:sidecar` targets `src/sidecar/index.ts`, which **27-02 creates** — the script is defined here as the contract entry point but is not runnable until 27-02 lands the sidecar entry. This is the documented interface-first seam, not an accidental stub. `main.rs` spawns `build/main/sidecar.js` (its output) for the same reason.
- `sidecar_store_snapshot` invokes a reserved `sidecar:store-snapshot` channel the sidecar (27-02) will answer via the electron-store shim. Intentional forward reference.

## Notes for Downstream Plans

- **27-02 (sidecar):** import the frame types + `READY_SENTINEL` from `src/common/types/sidecarTransport.ts`; print `READY_SENTINEL` on stdout once shims are installed; answer `invoke` frames with `SidecarRpcResponse`, push `frontendMessage` notifications; entry must bundle to `build/main/sidecar.js` (or set `GAMELIB_SIDECAR_ENTRY`).
- **27-03 (renderer bridge):** re-point the three `src/preload/ipc.ts` factories onto Tauri commands (`SIDECAR_INVOKE`/`SIDECAR_SEND`) and `listen(FRONTEND_MESSAGE_EVENT)`; use `OPEN_EXTERNAL` for the `shell.openExternal` path; the Tauri renderer bundle does NOT include the Electron preload, so attaching `window.api` + the 6 preload globals is 27-03's responsibility.

## Self-Check: PASSED

- Files verified present: `src/common/types/sidecarTransport.ts`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`.
- Commits verified in git log: `c6af6b99` (Task 2), `83dc57a7` (Task 3).
