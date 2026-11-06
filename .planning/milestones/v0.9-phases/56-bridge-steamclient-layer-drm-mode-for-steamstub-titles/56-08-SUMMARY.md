---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 08
subsystem: bridge-drm-mode
tags: [crossover, apfs-clone, ntdll-patch, codesign, allowlist]
requires: [56-01, 56-04, 56-06]
provides:
  - detectAllowedCrossover (D-09 allowlist step)
  - ensureRunnerClone / verifyRunnerClone (D-08, D-10 runner step)
affects: [56-11, 56-12]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/runnerClone.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts
  modified: []
key-decisions:
  - "cp argv follows the 56-01 SUMMARY: primary ['-c','-R'] (no -p), fallback ['-R','-p']; mtime check and utimes restore kept regardless"
  - "lsteamclient.dll size cap is 64 MiB, not the plan's 4 MiB (real DLL is about 34 MB); the .so keeps 4 MiB"
requirements-completed: [D-08, D-09, D-10]
completed: 2026-10-28
---

# Phase 56 Plan 08: Runner clone and CrossOver allowlist Summary

`runnerClone.ts` adds the two DRM-mode steps between the component and the Valve client: a fail-closed CrossOver allowlist (CFBundleVersion plus clean ntdll sha against 56-06's table) and an APFS-cloned, ntdll-patched, builtin-equipped, loader-re-signed runner that is re-verified on every launch.

## Exported signatures (for 56-11 / 56-12)

- `detectAllowedCrossover(opts?: { crossoverBinDir?: string; appFolder?: string }, deps?: DetectCrossoverDeps): Promise<DrmStepResult<CrossoverAllowed>>`
- `CrossoverAllowed = { appPath; cxRoot; binDir; crossoverBuild; cleanNtdllSha256; row: NtdllPatchRow; supportedBuilds: string[] }`
- `DetectCrossoverDeps = { resolveCrossoverBinDir?; runTool?; findRow?; supportedBuilds?; platform? }`
- `ensureRunnerClone(opts: { appFolder; crossover: CrossoverAllowed; component: RunnerComponentInput }, deps?: RunnerCloneDeps): Promise<DrmStepResult<RunnerReady>>`
- `RunnerComponentInput = { componentId; files: { lsteamclientDll; lsteamclientSo; detourPayload } }` (56-10's `SteamclientLayerReady` is passed as is)
- `RunnerReady = { crossoverBuild; runnerDir; cxRoot; wrapperBin; wineloaderBin; wineserverBin; windowsDllDir; unixDllDir; source: 'cache'|'clone'; cloneMethod?; provenanceRemaining?; pruned; pruneSkipped }`
- `RunnerCloneDeps = { runTool?; applyPatch?; onCloneStart?; timeouts? }`
- `verifyRunnerClone(runnerDir, { crossover, component }, runTool?): Promise<{ ok: true } | { ok: false; reason }>`
- `RunTool`, `RunToolResult`, `defaultRunTool` (five allowlisted tools, fake HOME, unref'd, never rejects).

Steps: `unsupported-crossover` (detect), `runner-clone` (copy, checks, scrub, marker, rename, in-use, verify), `runner-patch` (ntdll, builtins, loader re-sign).

## cp argv used

`/bin/cp -c -R <cxRoot> <partial>/CrossOver`, fallback `/bin/cp -R -p <cxRoot> <partial>/CrossOver`. Source: 56-01-SUMMARY "Consequences for later plans": "`cp -c -R` alone is enough; no `-p` and no post-clone mtime restore is needed ... The `cp -R` fallback is still wise for non-APFS or cross-volume layouts, where the mtime must be re-checked." The wine.inf mtime check plus utimes restore is mandatory in code anyway.

## Launch form (56-01: `bin/wine+CX_BOTTLE`)

Not chosen in this module. For `bin/wine+CX_BOTTLE`, 56-11 swaps the wine version to `bin: wrapperBin, wineserver: wineserverBin` (type stays `crossover`). For raw `WINELOADER+WINEPREFIX` use `wineloaderBin`, `wineserverBin`, `windowsDllDir`, `unixDllDir`. `onCloneStart` is the hook 56-11 maps to the `Compatibility runner` progress context (called once per fresh build only).

## Opt-in real arm result (GAMELIB_DRM_REAL_RUNNER=1, run on this Mac)

Passed. Clone method `cp -c`, wall time about 1.2 s (ensureRunnerClone), `provenanceRemaining: true` (tolerated, as 56-01 predicted), clone ntdll sha `c0e21a9a...ded97e` (pinned patched), loader lists the dyld entitlement, `lsteamclient.so` reports not signed (so `--remove-signature` was a no-op on 56-10's output), `find -newer` on `/Applications/CrossOver.app` printed nothing, installed ntdll sha still `6dff64c0...2387`, second call returned `source: 'cache'`. The appFolder contained a space.

## Deviations from Plan

**1. [Rule 1 - Bug] lsteamclient.dll size cap**
- **Issue:** the plan capped builtins at 4 MiB; the real `lsteamclient.dll` is about 34 MB, so the real arm would have failed.
- **Fix:** 64 MiB cap for the DLL, 4 MiB kept for the `.so`. Hashing is streamed, so the per-launch verify does not buffer it.
- **Commit:** 764a4a03d

**2. TDD ordering:** tests and module were committed together in one commit (764a4a03d) instead of per-task RED/GREEN commits; all three tasks' behaviors are covered in one test file, 58 tests pass, 1 skipped (the opt-in real arm, which passed when enabled).

**3. Primary cp argv:** `['-c','-R']` (not the plan default `['-c','-R','-p']`), per the 56-01 SUMMARY as the plan directs.

## Verification

- `npx jest src/backend/storeManagers/steam/bridge/drm` + `fakeHomeIsolation.test.ts`: 170 passed, 1 skipped (opt-in arm).
- `pnpm codecheck` clean; prettier check clean (both paths not ignored).
- `node meta/findDeadcode.cjs`: only the 3 pre-existing findings (gameMakerRunner, peSteamDrm, sharedRedists); none in runnerClone.ts.
- `src/backend/constants/paths.ts` and `crossoverLocation.ts` untouched.

## Notes for 56-11 / 56-12

- 56-01 probed a clone path without a space; the real runner path contains one (`Application Support`). The real arm here cloned under a path with a space and the wrapper/loader were only signed/inspected, not launched. Confirm the wrapper and loader at the first live launch.
- `pnpm find-deadcode` equals `node meta/findDeadcode.cjs`; exports carry `// ts-prune-ignore-next` until 56-11 consumes them.
- `requirements.mark-complete`: REQUIREMENTS.md is missing in this repo (known); skipped.

## Known Stubs

None.

## Self-Check: PASSED

- runnerClone.ts and runnerClone.test.ts exist; commit 764a4a03d exists.
