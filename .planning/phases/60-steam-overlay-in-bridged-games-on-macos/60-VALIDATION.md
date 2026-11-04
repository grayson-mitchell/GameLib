---
phase: 60
slug: steam-overlay-in-bridged-games-on-macos
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-02
audited: 2026-11-04
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `60-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 (root project + `Meta` project) |
| **Config file** | `jest.config.js`, `meta/jest.config.js` |
| **Quick run command** | `pnpm exec jest src/backend/storeManagers/steam/bridge/overlay src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts` |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm planning-gates && pnpm smoke:sidecar` |
| **Estimated runtime** | ~30 s quick; several minutes full |

---

## Sampling Rate

- **After every task commit:** quick run for touched modules, plus `npx prettier --check <exact paths written>` (scoped, after `--file-info`)
- **After every plan wave:** `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`
- **Before `/gsd-verify-work`:** full suite green, `pnpm lint-translations`, then the four-title live UAT (D-15)
- **Max feedback latency:** ~30 seconds per task

---

## Per-Task Verification Map

Decision → test mapping. `O` = `src/backend/storeManagers/steam/bridge/overlay/__tests__`, `games.test` = `src/backend/storeManagers/steam/__tests__/games.test.ts`. Meta files run with `pnpm exec jest --selectProjects Meta --runTestsByPath <path>`.

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-01..D-03 | `resolveOverlayEnabled` precedence (platform gate → user on/off → known-fix → default on) | unit | `pnpm exec jest O/overlayPolicy.test.ts` | ✅ | ✅ green |
| D-02 | Tri-state setting reader; toggle component writes `steamOverlayOverride` | unit + component | `pnpm exec jest O/overlayPolicy.test.ts src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx` | ✅ | ✅ green |
| D-03 | Tier-1 known-fix key `steamGameOverlay` accepts only `"off"` | unit | `pnpm exec jest src/backend/__tests__/knownFixesOverlay.test.ts src/backend/__tests__/knownFixReportDrift.test.ts` | ✅ | ✅ green |
| D-04, D-06 | Overlay clone: no ntdll, both loaders re-signed, sibling root, marker, re-clone, no allowlist | unit | `pnpm exec jest O/overlayRunnerClone.test.ts` (+ opt-in `overlayRunnerClone.realCrossover.test.ts`) | ✅ | ✅ green |
| D-05 | DRM clone re-signs wineloader best-effort; marker schema 2 | unit | `pnpm exec jest src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts` | ✅ | ✅ green |
| D-07 | Fallback engine injects the overlay through plain env (quick 261103-wci, superseding "skip"); overlay off → no env; clone wineserver ended on switch | unit | `pnpm exec jest games.test -t "fallback engine"` | ✅ | ✅ green |
| D-08, D-09 | Every setup failure fails open (throwing policy read, missing module), notifies each launch, notice line shape | unit | `pnpm exec jest O/overlayNotice.test.ts games.test -t "overlay"` | ✅ | ✅ green |
| D-10 | Abnormal-exit predicate + message; no notice for non-overlay or never-seen launches | unit | `pnpm exec jest O/overlayPolicy.test.ts -t D-10 O/overlayNotice.test.ts games.test -t "post-launch: attach watch, wine log, D-10"` (a bare `-t D-10` also matches Phase 17's bottle-routing describe, whose 4 tests fail when run in isolation) | ✅ | ✅ green |
| D-11 | console_log attach watcher: cutoff, 10 s bound, unref'd, abortable; overlay wine-log sink | unit (fake timers) | `pnpm exec jest O/overlayAttachWatch.test.ts O/overlayWineLog.test.ts` | ✅ | ✅ green |
| D-12 | Exact `CX_ENV` token string, shim first; unsafe paths rejected; `appendCxEnvTokens` merge | unit | `pnpm exec jest O/overlayLaunch.test.ts games.test -t buildDrmLaunchEnvironment` | ✅ | ✅ green |
| D-13, D-14 | Vendored shim hash pin, NOTICE; compile argv/lipo | unit | Meta: `meta/__tests__/overlayShimVendor.test.ts meta/__tests__/buildSteamBridgeShims.test.ts` | ✅ | ✅ green |
| G1 | `overlay_input.dylib`: release on open, defer, replay; inserted after the renderer on clone and env routes; `overlay input fix=` line; `GAMELIB_OVERLAY_INPUT_FIX=off` | unit + compiled smoke | `pnpm exec jest O/overlayLaunch.test.ts games.test -t "60-20"`; Meta: `meta/__tests__/overlayInputSmoke.test.ts` | ✅ | ✅ green |
| G1 (instrument) | Probe dylib and helper `GameOverlayActivated` Darwin notification | compiled smoke | Meta: `meta/__tests__/overlayInputProbeSmoke.test.ts meta/__tests__/overlaySignal.test.ts` | ✅ | ✅ green |
| G2 | DRM-mode attach watch gets the 30 s window; TCP gets the default | unit | `pnpm exec jest O/overlayAttachWatch.test.ts games.test -t "30 s window"` | ✅ | ✅ green |
| G3 | `getSettings()` carries `steamOverlayOverride` for bottle-eligible titles | unit | `pnpm exec jest games.test -t "overlay override"` | ✅ | ✅ green |
| G4 | `publishOverlayNotice` validation; in-app non-modal "Steam overlay unavailable" notice | unit + component | `pnpm exec jest src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts src/frontend/components/UI/SteamEngineLaunchNotice` | ✅ | ✅ green |
| conventions | fake-HOME isolation; sidecar exit; hardcoded-string gate | gate / smoke | `pnpm exec jest src/backend/__tests__/fakeHomeIsolation.test.ts`, `pnpm smoke:sidecar`, Meta: `meta/__tests__/hardcodedStringGate.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts` — D-01/03/08/10/12
- [x] `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts` — D-04/06
- [x] `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayAttachWatch.test.ts` — D-11
- [x] `meta/__tests__/overlayShimVendor.test.ts` — D-13/14 (planned under `overlay/__tests__`, landed in Meta)
- [x] `src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx` — D-02

Framework install: none (Jest exists).

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Shift+Tab opens overlay, draws correctly, takes clicks on Schedule I (3205720), Planet Crafter (1284190), Manor Lords (1363080 via UE stub), Grim Dawn (219990, DRM) | D-15, G1 | `screencapture` returns stale Metal frames (spike 062 run 3); operator judgment required | Launch via GameLib's real path; bridge verified strictly (D-53-13 / D-56-15/16). `60-UAT.md` items 1-4, re-run 10-14: all pass 2026-11-04 |
| `vmmap` shows shim + steamloader + gameoverlayrenderer; D-11 attach line; `hook_set_pixel_format` trace | D-15 | Live-process evidence | Operator captures per title (`60-UAT.md` evidence lines) |
| What the overlay's invite button does in a bridged game | D-16 | Record only | `60-UAT.md` item 5: no Invite option shown (Grim Dawn, DRM) |
| Real build yields fat x86_64+arm64 shim | D-14 | Build host | `pnpm build-steam-bridge && lipo -info public/bin/arm64/darwin/overlay_shim.dylib`. Re-checked 2026-11-04: `overlay_shim.dylib` and `overlay_input.dylib` both `x86_64 arm64` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-04 (`/gsd-validate-phase 60`)

---

## Validation Audit 2026-11-04

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

- Re-run 2026-11-04: 15 backend/frontend suites (1180 passed, 2 skipped), 6 Meta suites including `hardcodedStringGate` (254 passed), `fakeHomeIsolation` (7 passed), `pnpm smoke:sidecar` PASS.
- Map extended with the gap-closure rows G1-G4 (plans 60-11..60-20), which postdate the original draft.
- D-07 row corrected: the fallback engine now injects the overlay through plain env (quick 261103-wci, `60-UAT.md` items 9 and 14), not skips it. The tests encode the new behaviour.
- `hardcodedStringGate.test.ts` was reported failing on 60-14's strings in the 60-15/17/19/20 summaries and was left as "pre-existing". It passes now.
