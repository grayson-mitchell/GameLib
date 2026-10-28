---
phase: 56
slug: bridge-steamclient-layer-drm-mode-for-steamstub-titles
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-28
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

Filled in by the planner and executor. The requirement-to-test map lives in `56-RESEARCH.md` § Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/bridge/drm/__tests__/{valveClient,ntdllPatch,runnerClone,stageDrmBottle,drmTrace,steamclientLayerMode,steamclientLayerInstall,drmLaunchSetup}.test.ts`
- [ ] `meta/__tests__/{buildLsteamclient,buildDrmNativeParts,steamclientLayerNotice}.test.ts`
- [ ] Fixture: the live `steam_client_win64` manifest text, plus a tiny three-entry zip
- [ ] Fixture: a synthetic minimal x86_64 PE for the ntdll applier (do not commit CrossOver's ntdll)
- [ ] New cases in `games.test.ts` (steamclient-layer branch, D-13 notices) and `meta/__tests__/bridgeCensus.test.ts` (DRM branch)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grim Dawn 219990 reaches its menu with only Mac Steam running; the trace shows a game `create-interface` and a game `call` | D-15, D-16, D-17 | Wine trampoline + steamclient.dylib IPC can't run in jest | Operator launch, then `pnpm bridge-census` |
| Raft 648800, Ranch Simulator 1119730 results recorded | D-17 | live only | Operator launch, record verdict |
| lsteamclient builds from the CX 26.3.0 drop or the Wine 11.15 fallback | D-01, D-19 | native toolchain (mingw-w64, bison ≥3) | Run the build script and check its size and sha gates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
