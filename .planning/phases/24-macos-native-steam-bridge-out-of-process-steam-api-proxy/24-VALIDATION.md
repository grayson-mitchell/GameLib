---
phase: 24
slug: macos-native-steam-bridge-out-of-process-steam-api-proxy
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-18
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: see `## Validation Architecture` in `24-RESEARCH.md` for the per-requirement validation design this contract is derived from.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (existing repo config; frontend tests run no-jsdom per `doc/frontend_testing.md`) |
| **Config file** | jest config (repo root) |
| **Quick run command** | `pnpm jest <changed spec> --silent` |
| **Full suite command** | `pnpm test:ci` |
| **Static/build checks** | `pnpm codecheck` (tsc + eslint) for grep/type-only tasks |
| **Estimated runtime** | Single changed spec ~10–20 s (`--silent`, non-watch); full `pnpm test:ci` runs the wave-merge suite |

---

## Sampling Rate

- **After every task commit:** Run `pnpm jest <changed spec> --silent` (or the task's grep/codecheck command)
- **After every plan wave:** Run `pnpm test:ci`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (single-spec `--silent` run; well under the sampling floor)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | R1 | — | Manifest is GameLib-authored (D-09), no vendored Valve headers | unit | `node -e "...manifests ok"` (JSON manifest shape assertion) | ✅ | ⬜ pending |
| 24-01-02 | 01 | 1 | R1 | — | ABI slot order/offsets, `__thiscall`, `ret N`, sret asserted (D-10) | unit | `pnpm jest meta/gen_vtables.test.ts --silent` | ✅ | ⬜ pending |
| 24-01-03 | 01 | 1 | R1 | — | Generated `.c`/`.def` committed, no built `.dll` (D-07) | build-artifact | `test -f native/steam-bridge/generated/steam_api_shim.c && ... && echo "generated source committed, no dll"` | ✅ | ⬜ pending |
| 24-02-01 | 02 | 1 | R2 | — | Wire-frame encode/decode bounds-checked | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts --silent` | ✅ | ⬜ pending |
| 24-02-02 | 02 | 1 | R2 | — | Loopback-only bind (INADDR_LOOPBACK, no INADDR_ANY), init-once | static-grep | `grep -q "INADDR_LOOPBACK" ... && ! grep -q "INADDR_ANY" ... && echo "loopback-only, init present"` | ✅ | ⬜ pending |
| 24-03-01 | 03 | 1 | R4 | — | Zod-validated allowlist loader (D-01/D-02) | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts --silent` | ✅ | ⬜ pending |
| 24-04-01 | 04 | 1 | R4, R6 | — | No SteamSetup.exe (no Windows Steam client, R6); CrossOver-only (D-08) | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/bottle.test.ts --silent` | ✅ | ⬜ pending |
| 24-05-01 | 05 | 2 | R3 | — | objdump import parser enumerates per-game steam_api imports | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts --silent` | ✅ | ⬜ pending |
| 24-05-02 | 05 | 2 | R3 | — | Automatic per-bottle shim placement (export set match) | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts --silent` | ✅ | ⬜ pending |
| 24-06-01 | 06 | 2 | R2 | — | Arch-aware bundled helper path (`process.arch`) | static-grep | `grep -q "steamBridgeHelperPath" ... && grep -q "process.arch" ... && pnpm codecheck` | ✅ | ⬜ pending |
| 24-06-02 | 06 | 2 | R2, R7 | — | FrontendMessages `steamBridgeSetupRequired` registered (finding #1) + shared lifecycle + `ensureBridgeHelperReady()` CONTROL-frame readiness (D-03/D-06); spawn cwd carries steam_appid.txt=480 (finding #4) | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts --silent` | ✅ | ⬜ pending |
| 24-06-03 | 06 | 2 | R2, R7 | T-24-15 | `shutdownBridgeHelper()` wired into main.ts `before-quit`/`handleExit` — no orphaned helper on quit (finding #8) | static-grep | `grep -q "shutdownBridgeHelper" src/backend/main.ts && pnpm codecheck 2>&1 | tail -1` | ✅ | ⬜ pending |
| 24-07-01 | 07 | 2 | R5 | — | Pinned zig tarball + checksum (ziglang.org) | static-grep | `grep -q "ziglang.org" ... && grep -Eq "shasum|sha256|checksum" ... && pnpm codecheck` | ✅ | ⬜ pending |
| 24-07-02 | 07 | 2 | R5 | — | clang helper + `zig cc` PE shim build; npm wiring | unit | `pnpm jest meta/__tests__/buildSteamBridgeShims.test.ts --silent` | ✅ | ⬜ pending |
| 24-08-01 | 08 | 3 | R4, R6 | T-24-18 | `resolveBridgeLaunchExe()` resolves the Windows launch exe from appinfo `config.launch[]` (oslist=windows) — finding #2 | unit | `pnpm jest src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts --silent` | ✅ | ⬜ pending |
| 24-08-02 | 08 | 3 | R4, R7 | T-24-07 | `isBridgeEligible()` numeric-guarded + session bridge-failed set (finding #3); install PROVISIONS bridge bottle inline when not ready (BLOCKER 1) then routes to bridge bottle, no `steam.exe`/`-applaunch` | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` | ✅ | ⬜ pending |
| 24-08-03 | 08 | 3 | R4, R7 | T-24-12 / T-24-13 / T-24-17 | Readiness gate + resolved-exe launch; not-ready → `markBridgeFailedThisSession` + `steamBridgeSetupRequired`, game NOT launched (fallback bypass, finding #3); empty-allowlist regression identical to Phase 17 | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` | ✅ | ⬜ pending |
| 24-09-01 | 09 | 4 | R7 | T-24-12 | Standalone handler opens D-05 dialog (no silent strand) | unit | `pnpm jest src/frontend/state/__tests__/SteamBridgeSetup.test.ts --silent` | ✅ | ⬜ pending |
| 24-09-02 | 09 | 4 | R7 | T-24-14 | Fallback re-routes existing non-bridge branch (Pitfall 4); no bespoke fallback IPC | static/integration | `pnpm codecheck 2>&1 | tail -1 && node -e "JSON.parse(...); console.log('en locale valid json')"` | ✅ | ⬜ pending |
| 24-10-01 | 10 | 5 | R5, R6 | — | Full-suite gate + packaged build + 24-UAT.md scaffold | full-suite | `pnpm test:ci --silent 2>&1 | tail -3` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Every auto/tdd task above has a fast non-watch-mode `<automated>` command. The FOUR human-HW-gated checkpoints in plan 24-10 (R1 vtable round-trip, R5 packaged-app run, R6 Avernum 4, R6 Hoard) are tracked in the Manual-Only Verifications table below, not here. (24-07-02 also runs a real `zig cc` compile gate during execution — finding #5a.)*

---

## Wave 0 Requirements

- [x] Test stubs for the vtable-generator unit checks (R1: slot order/offsets, `__thiscall`, `ret N`, sret) — covered by 24-01-02 (`meta/gen_vtables.test.ts`), automatable without hardware
- [x] Test stub for helper loopback-only bind + persistent-channel ≥2-request check (R2) — covered by 24-02-02 (loopback grep) + 24-02-01 (`protocol.test.ts`) + 24-06-02 (`helperProcess.test.ts`)
- [x] Test stub for allowlist routing branch (R4) and non-allowlisted regression (R7) — covered by 24-03-01 (`allowlist.test.ts`) + 24-08-02/24-08-03 (`games.test.ts` bridge-routing + empty-allowlist regression)

*All Wave 0 gaps are authored by the plans' own TDD tasks (each is a `tdd="true"` task that writes its failing test first) — no separate Wave 0 scaffold plan required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated shim vtable round-trip returns real SteamID64 | R1 | Requires the built shim + production helper + live signed-in Mac Steam on dev HW | Run the 006-style harness: a C++ virtual `GetSteamID()` through the GENERATED shim's vtable returns the real signed-in SteamID64 (finding #5b) |
| Packaged `.app` launches acceptance game via bundled helper | R5 | Requires a packaged build run on the developer's Apple-Silicon Mac | Build the app, launch an allowlisted game, confirm bundled helper is used (no staged binary) |
| Avernum 4 reaches playable single-player via bridge | R6 | Requires real Steam client + game + dev HW | Launch from GameLib; confirm real SteamID64 + persona; no `steam.exe` in bottle |
| Hoard reaches playable single-player via bridge | R6 | Requires real Steam client + game + dev HW | Launch from GameLib; confirm real SteamID64 + persona; no `steam.exe` in bottle |

*These four are the `checkpoint:human-verify gate="blocking-human"` tasks in plan 24-10 (R1 round-trip, R5 packaged run, R6 Avernum 4, R6 Hoard); they gate phase completion and record PASS/FAIL in `24-UAT.md`.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (authored by each plan's own TDD task)
- [x] No watch-mode flags (all commands use `--silent`/non-watch; `pnpm test:ci`/`pnpm codecheck` are single-run)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-18
