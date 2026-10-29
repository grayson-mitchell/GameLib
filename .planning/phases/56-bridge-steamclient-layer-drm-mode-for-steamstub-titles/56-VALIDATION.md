---
phase: 56
slug: bridge-steamclient-layer-drm-mode-for-steamstub-titles
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-28
audited: 2026-10-29
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `56-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7 + ts-jest (projects `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest src/backend/storeManagers/steam/bridge/drm --silent` |
| **Full suite command** | `pnpm test:ci` |
| **Type gate** | `pnpm codecheck` |
| **Estimated runtime** | ~30 seconds (quick), several minutes (full) |

---

## Sampling Rate

- **After every task commit:** the task's `npx jest <file>` plus `npx prettier --check <exact paths>` (check `--file-info` first; omit if every path is prettier-ignored)
- **After every plan wave:** `pnpm codecheck && pnpm test:ci`
- **Before `/gsd:verify-work`:** full suite green, `pnpm planning-gates`, then the Grim Dawn live gate
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Mapped per plan (task rows within a plan share the plan's test files). Requirement-to-behaviour detail is in `56-RESEARCH.md` § Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-* | 56-01 | 1 | D-08, D-11 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts` | ✅ | ✅ |
| 56-02-* | 56-02 | 1 | D-01, D-02, D-15, D-16, D-19 | — | — | unit (argv + build gates) | `npx jest meta/__tests__/buildLsteamclient.test.ts` | ✅ | ✅ |
| 56-03-* | 56-03 | 1 | D-01, D-03, D-07, D-08, D-21 | see 56-SECURITY.md | T: no HKLM / no DRM responder | unit + source gates | `npx jest meta/__tests__/buildDrmNativeParts.test.ts` | ✅ | ✅ |
| 56-04-* | 56-04 | 1 | D-09, D-12, D-13 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/steamclientLayerMode.test.ts src/backend/storeManagers/steam/bridge/__tests__/peSteamDrm.test.ts` | ✅ | ✅ |
| 56-05-* | 56-05 | 1 | D-15, D-16 | see 56-SECURITY.md | T: forged/helper trace lines rejected | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/drmTrace.test.ts meta/__tests__/bridgeCensus.test.ts` | ✅ | ✅ |
| 56-06-* | 56-06 | 1 | D-03, D-09 | see 56-SECURITY.md | T: refuses wrong sha / non-empty cave | unit + integration (skips w/o CrossOver) | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/ntdllPatch.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/ntdllPatch.realCrossover.test.ts` | ✅ | ✅ |
| 56-07-* | 56-07 | 2 | D-04, D-05, D-06 | see 56-SECURITY.md | T: sha mismatch, hostile/symlink zip | unit (fixtures) | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient.test.ts` | ✅ | ✅ |
| 56-08-* | 56-08 | 2 | D-08, D-09, D-10 | see 56-SECURITY.md | T: tampered ntdll detected | unit (temp dirs) | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts` | ✅ | ✅ |
| 56-09-* | 56-09 | 2 | D-07, D-11, D-21 | see 56-SECURITY.md | T: HKCU-only reg writes | unit (mock reg runner) | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts` | ✅ | ✅ |
| 56-10-* | 56-10 | 2 | D-02, D-18 | see 56-SECURITY.md | T: licence separation | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/steamclientLayerInstall.test.ts meta/__tests__/steamclientLayerNotice.test.ts` | ✅ | ✅ |
| 56-11-* | 56-11 | 3 | D-05, D-11, D-12, D-13 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts` | ✅ | ✅ |
| 56-12-* | 56-12 | 4 | D-05, D-12, D-13, D-15 | — | — | unit (games.ts w/ mocks) | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ |
| 56-13-* | 56-13 | 5 | D-14 | — | — | grep gate + i18n gates | `! grep -rnE "setupSteamClientForwarder\|builtBridgeSteamClient64Path\|forwardedTitle\|steamclient_fwd" src meta native public/locales/en`; `npx jest meta/__tests__/buildSteamBridgeShims.test.ts` | ✅ | ✅ |
| 56-14-* | 56-14 | 5 | D-14, D-20 | — | — | unit | `npx jest meta/__tests__/gen_vtables.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ | ✅ |
| 56-15-* | 56-15 | 6 | D-17, D-18 | — | — | live gate | manual — `56-15-LIVE-GATE.md` | n/a | manual |
| 56-16-* | 56-16 | 7 | D-15, D-16, D-17, D-21 | — | — | live gate | manual — `56-15-LIVE-GATE.md` | n/a | manual |
| 56-17-* | 56-17 | 1 | D-11, D-17, D-21 | — | — | diagnosis | manual — `56-17-DIAGNOSIS.md` | n/a | manual |
| 56-18-* | 56-18 | 1 | D-13 | — | — | unit | `npx jest src/frontend/components/UI/DialogHandler/__tests__/buttonActions.test.tsx` (displayConfirm.test.tsx dropped as duplicate, see 56-18-SUMMARY) | ✅ | ✅ |
| 56-19-* | 56-19 | 1 | D-12, D-13, D-17 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/drmScanExe.test.ts` | ✅ | ✅ |
| 56-20-* | 56-20 | 2 | D-05, D-11, D-13, D-15 | — | — | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts` | ✅ | ✅ |
| 56-21-* | 56-21 | 3 | D-11, D-12, D-17 | — | — | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` | ✅ | ✅ |
| 56-22-* | 56-22 | 4 | D-11, D-15, D-16, D-17 | — | — | live diagnosis | manual | n/a | manual |
| 56-23-* | 56-23 | 5 | D-07, D-11, D-13 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ |
| 56-24-* | 56-24 | 6 | D-01, D-02, D-12, D-17, D-18 | — | — | unit | `npx jest src/backend/storeManagers/steam/__tests__/drmKnownFix.test.ts src/backend/storeManagers/steam/bridge/__tests__/launchTarget.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ |
| 56-25-* | 56-25 | 7 | D-15, D-16, D-17, D-18, D-21 | — | — | live gate | manual — `56-25-LIVE-GATE.md` | n/a | manual |
| 56-26-* | 56-26 | 8 | D-15, D-16, D-17, D-18, D-21 | — | — | live gate | manual — `56-25-LIVE-GATE.md` | n/a | manual |
| 56-27-* | 56-27 | 1 | D-05, D-13 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ |
| 56-28-* | 56-28 | 1 | D-12, D-17 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` | ✅ | ✅ |
| 56-29-* | 56-29 | 1 | D-12, D-17 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/drmScanExe.test.ts` | ✅ | ✅ |
| 56-30-* | 56-30 | 1 | D-17 | — | — | unit | `npx jest meta/__tests__/machineFillGamelib.test.ts src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts src/backend/sidecar/__tests__/testContainment.test.ts src/backend/sidecar/__tests__/installFlows.test.ts` | ✅ | ✅ |
| 56-31-* | 56-31 | 2 | D-15, D-16 | — | — | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts` | ✅ | ✅ |
| 56-32-* | 56-32 | 2 | D-11, D-13, D-21 | — | — | unit | `npx jest src/backend/storeManagers/steam/bridge/drm/__tests__/stageWineLog.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts` | ✅ | ✅ |
| 56-33-* | 56-33 | 3 | D-13, D-15, D-16, D-17, D-18, D-21 | — | — | live gate | manual — `56-33-LIVE-GATE.md` | n/a | manual |
| 56-34-* | 56-34 | 4 | D-13, D-15, D-16, D-17, D-18, D-21 | — | — | live gate | manual — `56-33-LIVE-GATE.md` | n/a | manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/backend/storeManagers/steam/bridge/drm/__tests__/{valveClient,ntdllPatch,runnerClone,stageDrmBottle,drmTrace,steamclientLayerMode,steamclientLayerInstall,drmLaunchSetup}.test.ts`
- [x] `meta/__tests__/{buildLsteamclient,buildDrmNativeParts,steamclientLayerNotice}.test.ts`
- [x] Fixture: the live `steam_client_win64` manifest text, plus a tiny three-entry zip
- [x] Fixture: a synthetic minimal x86_64 PE for the ntdll applier (do not commit CrossOver's ntdll)
- [x] New cases in `games.test.ts` (steamclient-layer branch, D-13 notices) and `meta/__tests__/bridgeCensus.test.ts` (DRM branch)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grim Dawn 219990 reaches its menu with only Mac Steam running; the trace shows a game `create-interface` and a game `call` | D-15, D-16, D-17 | Wine trampoline + steamclient.dylib IPC can't run in jest | Operator launch, then `pnpm bridge-census` |
| Raft 648800, Ranch Simulator 1119730 results recorded | D-17 | live only | Operator launch, record verdict |
| lsteamclient builds from the CX 26.3.0 drop or the Wine 11.15 fallback | D-01, D-19 | native toolchain (mingw-w64, bison ≥3); the build-script gates themselves are unit-covered in `buildLsteamclient.test.ts` | Run the build script and check its size and sha gates |
| Ported helper runs in-process: shared-mem lock, IPC window class and ActiveProcess keys take effect under Wine | D-07 | Wine-side; source presence is unit-gated in `buildDrmNativeParts.test.ts` | Covered by the Grim Dawn live gate |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-29

---

## Validation Audit 2026-10-29

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

- Ran all 43 phase test suites: 42 pass, 2,576 tests green, 2 skipped. The one failing suite, `meta/__tests__/lintTranslations.test.ts` (2 tests: `steam.adoptRestart.*` locale drift), comes from quick-261029-ji2 and was ruled outside phase 56 (see `56-VERIFICATION.md`).
- D-14 removal grep gate: clean.
- `steamClientSetup.test.ts` is absent on purpose (deleted with the forwarder under D-14). `displayConfirm.test.tsx` was not written (56-18 deviation: duplicates the ack-based `display=confirmed` log). The RESEARCH name `buildSteamClientLayer.test.ts` was split into `buildLsteamclient.test.ts` and `buildDrmNativeParts.test.ts`.
- **Gap filled (D-07, was PARTIAL):** added the positive source gate `sets up the shim game-process env, registry writes in HKCU` to `meta/__tests__/buildDrmNativeParts.test.ts`. It checks that `helper/steam.c` keeps `Steam3Master_SharedMemLock`, `Global\Valve_SteamIPC_Class`, the ActiveProcess `pid`/`SteamClientDll64`/`SteamPath` values, the hidden window, and `write_registry` (the ported `setup_steam_registry`), and that every `set_sz`/`set_dword` targets `HKEY_CURRENT_USER`.
