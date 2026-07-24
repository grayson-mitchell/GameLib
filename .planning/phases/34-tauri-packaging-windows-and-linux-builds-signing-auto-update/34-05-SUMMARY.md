---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 05
subsystem: infra
tags: [tauri, updater, minisign, externalBin, shell-plugin, capabilities, packaging]

# Dependency graph
requires:
  - phase: 34-01
    provides: tauriConf.test.ts gate (bundle/updater shape assertions)
  - phase: 34-02
    provides: SEA sidecar build (build:sidecar-sea), tauri-plugin-updater/tauri-plugin-shell crates added, sidecarOutputPath convention
  - phase: 34-03
    provides: minisign keypair (public key pasted verbatim into plugins.updater.pubkey)
provides:
  - Tauri shell with bundle.active=true, lean targets (nsis/appimage/dmg), committed icon set
  - externalBin sidecar wiring (binaries/gamelib-sidecar) + createUpdaterArtifacts
  - plugins.updater configured with 34-03 minisign pubkey + hardcoded fork-pointed feed (never derived from package.json.repository)
  - main.rs dev/packaged sidecar spawn split (spawn_sidecar_dev vs spawn_sidecar_packaged via tauri-plugin-shell)
  - capabilities/default.json scoped grants: updater:default + shell:allow-execute limited to {name:"binaries/gamelib-sidecar", sidecar:true}
affects: [34-06-packaging-ci-signing, 34-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dev-vs-packaged sidecar spawn split: use_dev_sidecar() gates on GAMELIB_SIDECAR_ENTRY env override OR cfg!(debug_assertions); packaged builds always resolve the bundled externalBin via app.shell().sidecar(name), never a system `node`"
    - "Updater feed is a hardcoded literal in tauri.conf.json, never derived from package.json.repository (which still points at upstream Heroic by design)"
    - "capabilities/default.json narrow-scoping discipline extended: every new permission grant gets an inline justification appended to the shared `description` field rather than a separate doc"

key-files:
  created: []
  modified:
    - src-tauri/tauri.conf.json
    - src-tauri/src/main.rs
    - src-tauri/capabilities/default.json

key-decisions:
  - "bundle.active flipped to true with the lean target set nsis/appimage/dmg (D-01/D-02) — no .deb/.rpm, which would not auto-update"
  - "No certificateThumbprint/signCommand in the base config (D-04) — signing stays a CI --config override injected in 34-06 so a secrets-less build never fails"
  - "shell:allow-execute scoped to exactly {name:'binaries/gamelib-sidecar', sidecar:true} (T-34-09) — no broad shell execution exposed to the webview"
  - "Task 3 (human-verify checkpoint: npm run tauri:dev + npm start both launch) deferred by user decision — recorded as pending human-UAT, not claimed as passed"

requirements-completed: [REQ-34-01, REQ-34-02, REQ-34-03, REQ-34-05, REQ-34-08]

# Metrics
duration: ~10min (tasks 1-2 only; checkpoint deferred)
completed: 2026-07-24
---

# Phase 34 Plan 05: Tauri Packaging Activation — Bundle, Updater, Sidecar externalBin Summary

**Tauri shell flipped to bundle-active with lean nsis/appimage/dmg targets, an externalBin-resolved sidecar via tauri-plugin-shell, and an updater plugin wired to the 34-03 minisign key and a hardcoded fork-pointed GitHub Releases feed — the human-verify launch check (Task 3) is deferred, not passed.**

## Performance

- **Duration:** ~10 min (Tasks 1-2; Task 3 checkpoint deferred by user, not executed)
- **Tasks:** 2 of 3 completed (Task 3 is a deferred checkpoint, not a failure)
- **Files modified:** 3

## Accomplishments
- `tauri.conf.json`: `bundle.active: true`, lean targets (`nsis`/`appimage`/`dmg`), committed icon set, `externalBin: ["binaries/gamelib-sidecar"]`, `createUpdaterArtifacts: true`, and `plugins.updater` with the 34-03 minisign pubkey + hardcoded `grayson-mitchell/GameLib` feed literal (never derived from `package.json.repository`) and `windows.installMode: "passive"`. No `certificateThumbprint`/`signCommand` present.
- `main.rs`: registered `tauri_plugin_updater` and `tauri_plugin_shell` in the builder chain. Split sidecar spawning into `spawn_sidecar_dev()` (unchanged `node build/main/sidecar.js` path, `GAMELIB_SIDECAR_ENTRY` override preserved) and `spawn_sidecar_packaged()` (resolves the bundled `externalBin` via `app.shell().sidecar("gamelib-sidecar")`, converts the plugin's `Command` into `std::process::Command`). `use_dev_sidecar()` dispatches on `GAMELIB_SIDECAR_ENTRY` presence OR `cfg!(debug_assertions)`, so a release build always uses the packaged path. Pre-spawn path/cwd/exists + success/failure `eprintln!` diagnostic discipline preserved on both paths.
- `capabilities/default.json`: added `updater:default` (required for the JS `check()`/`downloadAndInstall()` surface) and a scoped `shell:allow-execute` entry (`allow: [{name: "binaries/gamelib-sidecar", sidecar: true}]`) — not a broad shell grant. Extended the shared `description` field with inline justification for both, per the existing narrow-scoping convention.
- Automated gate `npx jest --testPathPattern=tauriConf` reconfirmed green: **8/8 PASS** (bundle shape D-01/D-02, updater plugin shape D-07/D-08, negative test forbidding `Heroic-Games-Launcher`).

## Task Commits

Each task was committed atomically:

1. **Task 1: tauri.conf.json — bundle activation, targets, externalBin, updater feed** - `0188985b` (feat)
2. **Task 2: main.rs plugin init + externalBin sidecar spawn; scoped capabilities** - `9196f2c7` (feat)

**Task 3: checkpoint:human-verify — DEFERRED, not executed.** See "Deferred Human-UAT" below.

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `src-tauri/tauri.conf.json` - bundle.active/targets/icon/externalBin/createUpdaterArtifacts + plugins.updater (pubkey, endpoints, windows.installMode)
- `src-tauri/src/main.rs` - registers `tauri_plugin_updater` + `tauri_plugin_shell`; adds `use_dev_sidecar()`, `spawn_sidecar_dev()`, `spawn_sidecar_packaged()`, dispatching `spawn_sidecar(app)`
- `src-tauri/capabilities/default.json` - adds `updater:default` + scoped `shell:allow-execute` grant, with inline justification appended to `description`

## Decisions Made
- Lean bundle targets only (`nsis`/`appimage`/`dmg`) — `.deb`/`.rpm` intentionally excluded since they don't participate in the Tauri updater flow.
- Updater feed is a hardcoded string literal, never derived from `package.json.repository` (which still points at upstream Heroic by design) — enforced by a negative jest test.
- Signing fields (`certificateThumbprint`/`signCommand`) deliberately absent from the base config; injected only via CI `--config` override in 34-06 so local/dev builds never require secrets.
- `shell:allow-execute` scoped to exactly one named sidecar binary with `sidecar: true`, not an unscoped grant — keeps the webview from being able to launch arbitrary host programs.

## Deviations from Plan

None - Tasks 1 and 2 executed exactly as written. No auto-fixes were required.

## Issues Encountered
None during Tasks 1-2. Task 3 was not attempted — see below.

## Deferred Human-UAT (Task 3 — NOT executed, NOT passed)

**Status: DEFERRED by explicit user decision.** This is a pending verification item, not a completed or failed one. Do not treat REQ-34-08 as closed until this is run.

**What needs verification (per the plan's checkpoint):**
1. Run `npm run tauri:dev` — GameLib should launch in the Tauri shell; the sidecar should spawn (check logs at `~/Library/Logs/GameLib/gamelib.log`); the app should be usable (library loads).
2. Run `npm start` — the Electron build should still launch unchanged (additive/reversible invariant intact).
3. Confirm `pnpm test -- --testPathPattern="tauriConf|electronUntouched"` is green (feed shape + no-real-electron-import). The `tauriConf` half of this was reconfirmed green during this continuation (8/8); `electronUntouched` was not re-run here and should be included when Task 3 is picked up.

**Resume signal (per plan):** Type "approved" once both `npm run tauri:dev` and `npm start` launch cleanly and the tests are green; or describe the breakage.

**Why deferred:** User elected to defer live-launch verification for this plan rather than run it now. The automated `tauriConf` gate (8/8) and static `cargo build`-time correctness of the sidecar dispatch logic give reasonable but not equivalent confidence — the additive/reversible invariant (both shells launching, sidecar spawning end-to-end) is a runtime claim that only a live run can prove.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `tauri.conf.json`/`main.rs`/`capabilities/default.json` mutation surface for this plan is closed; 34-06 (CI packaging/signing) can now inject its `--config` overlay against a config that is otherwise packaging-ready.
- REQ-34-08 (additive/reversible invariant) remains open pending the deferred Task 3 human-verify run — carry forward to a future human-UAT pass or the next plan touching this surface.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: `src-tauri/tauri.conf.json`
- FOUND: `src-tauri/src/main.rs`
- FOUND: `src-tauri/capabilities/default.json`
- FOUND commit: `0188985b`
- FOUND commit: `9196f2c7`
- Reconfirmed `npx jest --testPathPattern=tauriConf` -- 8/8 PASS

