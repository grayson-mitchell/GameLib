---
phase: 60
slug: steam-overlay-in-bridged-games-on-macos
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-02
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

Filled in by the planner and executor as task IDs are assigned. Decision → test mapping:

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-01..D-03 | `resolveOverlayEnabled` precedence (platform gate → user on/off → known-fix → default on) | unit | `pnpm exec jest overlayLaunch.test` | ❌ W0 | ⬜ pending |
| D-02 | Tri-state setting reader; toggle component writes `steamOverlayOverride` | unit + component | `pnpm exec jest readStoredOverlayOverride SteamOverlayOverride.test` | ❌ W0 | ⬜ pending |
| D-03 | Tier-1 known-fix key `steamGameOverlay` accepts only `"off"` | unit | `pnpm exec jest knownFixes knownFixReportDrift` | ✅ edit | ⬜ pending |
| D-04, D-06 | Overlay clone: no ntdll, both loaders re-signed, sibling root, marker, re-clone, no allowlist | unit | `pnpm exec jest overlayRunnerClone.test` | ❌ W0 | ⬜ pending |
| D-05 | DRM clone re-signs wineloader best-effort; marker schema 2 | unit | `pnpm exec jest runnerClone.test` | ✅ edit | ⬜ pending |
| D-07 | Fallback engine skips overlay and logs reason | unit | `pnpm exec jest games.test -t overlay` | ✅ edit | ⬜ pending |
| D-08, D-09 | Every setup failure fails open, notifies each launch, notice line shape | unit | `overlayLaunch.test`, `games.test` | ❌ W0 / edit | ⬜ pending |
| D-10 | Abnormal-exit predicate + message | unit | `overlayLaunch.test` | ❌ W0 | ⬜ pending |
| D-11 | console_log attach watcher: cutoff, 10 s bound, unref'd, abortable | unit (fake timers) | `pnpm exec jest overlayAttachWatch.test` | ❌ W0 | ⬜ pending |
| D-12 | Exact `CX_ENV` token string, shim first; unsafe paths rejected; `appendCxEnvTokens` merge | unit | `overlayLaunch.test`, `buildDrmLaunchEnvironment` | ❌ W0 / edit | ⬜ pending |
| D-13, D-14 | Vendored shim hash pin, NOTICE; compile argv/lipo | unit | `overlayShimVendor.test`, `jest --selectProjects Meta buildSteamBridgeShims.test` | ❌ W0 / edit | ⬜ pending |
| conventions | fake-HOME isolation; sidecar exit | gate / smoke | `pnpm exec jest fakeHomeIsolation`, `pnpm smoke:sidecar` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts` — D-01/03/08/10/12
- [ ] `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts` — D-04/06
- [ ] `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayAttachWatch.test.ts` — D-11
- [ ] `src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayShimVendor.test.ts` — D-13/14
- [ ] `src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx` — D-02

Framework install: none (Jest exists).

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Shift+Tab opens overlay, draws correctly, takes clicks on Schedule I (3205720), Planet Crafter (1284190), Manor Lords (1363080 via UE stub), Grim Dawn (219990, DRM) | D-15 | `screencapture` returns stale Metal frames (spike 062 run 3); operator judgment required | Launch via GameLib's real path; bridge verified strictly (D-53-13 / D-56-15/16) |
| `vmmap` shows shim + steamloader + gameoverlayrenderer; D-11 attach line; `hook_set_pixel_format` trace | D-15 | Live-process evidence | Operator captures per title |
| What the overlay's invite button does in a bridged game | D-16 | Record only | Operator notes result in UAT |
| Real build yields fat x86_64+arm64 shim | D-14 | Build host | `pnpm build-steam-bridge && lipo -info public/bin/arm64/darwin/overlay_shim.dylib` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
