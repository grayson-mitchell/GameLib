---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 01
subsystem: bridge-drm-mode
tags: [crossover, apfs-clone, wine-wrapper, probe, launch-form]
requires: []
provides:
  - launch_form verdict (bin/wine+CX_BOTTLE) for 56-08, 56-11, 56-12
  - dlloverrides_channel verdict for 56-12
affects: [56-08, 56-11, 56-12]
tech-stack:
  added: []
  patterns: ["APFS clone of CrossOver CX_ROOT via cp -c -R keeps wine.inf mtime"]
key-files:
  created:
    - .planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-01-SUMMARY.md
  modified: []
key-decisions:
  - "Launch form is the clone's Perl bin/wine with CX_BOTTLE, exactly as runWineCommand spawns it"
  - "WINEDLLOVERRIDES must not be passed as plain env (the wrapper deletes it); use the --dll option, CX_ENV, or the registry"
requirements-completed: [D-08, D-11]
duration: ~25 min
completed: 2026-10-28
---

# Phase 56 Plan 01: Runner-clone and launch-form probe Summary

A throwaway probe APFS-cloned CrossOver 26.3.0.39832 and ran stock-created and copied bridge bottles under the clone's `bin/wine` with `CX_BOTTLE`. The clone works as a drop-in runner, no prefix update happens, and the verdict is `bin/wine+CX_BOTTLE`. Plain-env `WINEDLLOVERRIDES` is stripped by the wrapper, so 56-12 must use another channel.

## Probe results

```text
clone_method: cp -c
same_volume: yes
wine_inf_mtime_preserved: yes
applications_untouched: yes
clone_cx_root: yes
wineserver_from_clone: yes
stock_bottle_ran_under_clone: yes
prefix_update: none
existing_bridge_bottle_copy: ran (GameLibSteamBridge-648800)
winedllpath_plain_env: overwritten
winedlloverrides_plain_env: stripped
dllpath_channel: not-needed
dlloverrides_channel: dll-option
raw_form_ran: yes
launch_form: bin/wine+CX_BOTTLE
```

Verdict rule: `launch_form: bin/wine+CX_BOTTLE` iff `stock_bottle_ran_under_clone: yes`, `prefix_update: none`, `wineserver_from_clone: yes`, `clone_cx_root: yes`, and at least one non-raw overrides channel was functional in R3. All hold, so the verdict is `bin/wine+CX_BOTTLE`. (The raw form also ran cleanly with no prefix update, so it is a viable fallback, but it is not needed.)

Measured facts behind the block:

- Clone: `/bin/cp -c -R` exit 0 in 637 ms; source and scratch are both on `/System/Volumes/Data`. Clone `share/wine/wine.inf` mtime = `1784047440` (equals stock). Clone ntdll sha = `6dff64c00793ce92124f1316985c63783f539f26b392975c70f57637458d2387` (clean). `bin` symlink and the five binaries are intact and executable. `codesign --verify --strict` returned 0 for clone `bin/wineloader` and `lib/wine/x86_64-unix/wine`.
- Stock untouched: stock ntdll sha before equals after, and `find /Applications/CrossOver.app -newer start.marker` printed nothing.
- R1 (clone, plain env `WINEDLLPATH`/`WINEDLLOVERRIDES`): exit 0; wrapper dump shows `CX_ROOT`, `WINELOADER` and `WINESERVER` all under the clone; the running wineserver and wineloader were the clone's. `.update-timestamp` (`1784047440`), `cxbottle.conf` sha and `[Bottle] Timestamp` identical before and after; no `cxupgrade` process; `wineboot.exe --init` ran, which is Wine's normal session start, not a prefix update.
- Plain env: the caller's `WINEDLLPATH` sentinel directory was not in the wrapper's dump (the wrapper rebuilt it as `<clone>/lib/wine/x86_64-windows:<clone>/lib/wine/i386-windows:<clone>/lib/wine`), and `WINEDLLOVERRIDES` was undefined. Static reading (bin/wine lines 712, 716-717) is confirmed live.
- R2a (`--dll=...`): `WINEDLLOVERRIDES` reached the dump and Wine. R2b (`CX_ENV="WINEDLLPATH=... WINEDLLOVERRIDES=..."`): both variables reached the dump and `cmd /c set` inside Wine.
- R3 (functional, using `wineboot.exe`, which loads in the baseline): disabling it through plain env still loaded it (`envFunctional: false`); through `--dll` (`dllFunctional: true`), `CX_ENV` (`cxEnvFunctional: true`) and registry `DllOverrides` (`registryFunctional: true`) the load was suppressed.
- R4 (raw `bin/wineloader` with `WINELOADER`, `WINESERVER`, `WINEDLLPATH`, `WINEDLLOVERRIDES`, `WINEPREFIX`, no `CX_BOTTLE`): exit 0, no prefix update, sentinels and both variables visible in Wine, wineserver from the clone.
- Arm B (cp -c copy of `GameLibSteamBridge-648800`, run under the clone with `CX_BOTTLE`): exit 0, no prefix update, wineserver from the clone. The source bottle was never spawned against and its `.update-timestamp` mtime is unchanged (`1792784335`).
- Cleanup: zero `GameLibProbe5601*` bottles remain, the clone directory is removed, no `GameLibSteamBridge-*` bottle was written. The results file holds no raw env dump and no home path.

## Consequences for later plans

- **56-08 (runner clone):** `cp -c -R` alone is enough; no `-p` and no post-clone mtime restore is needed, because `wine.inf` mtime and the clean ntdll sha both survive (D-08). The `cp -R` fallback is still wise for non-APFS or cross-volume layouts, where the mtime must be re-checked. `xattr -d com.apple.provenance` left 5851 provenance attributes on the clone (quarantine: 0); this did not stop the clone from running, but 56-08 should not assume the scrub removes provenance.
- **56-11 (`getBridgeBottleSettings` DRM variant):** swap the wine version to `bin: <clone>/bin/wine` with `wineserver: <clone>/bin/wineserver`, keep `type: 'crossover'` so `runWineCommand` sets `CX_BOTTLE` as it does today. The bottle's wineserver was started from the clone in every run; there was no stock wineserver to conflict with, but the probe always stopped the previous server (`wineserver -k`/`-w`) between runs, so 56-11 should stop a still-running stock wineserver for the appId before the first clone launch (D-11).
- **56-12 (wine launch):** `WINEDLLPATH` needs no extra entry for files installed under the clone's `lib/wine` (the wrapper already points there and Wine resolves `x86_64-windows`/`x86_64-unix` below it); anything outside the clone must go through `CX_ENV="WINEDLLPATH=<paths>"`. Carry `steamclient=n;steamclient64=n;lsteamclient=b` through the `--dll=<overrides>` option (argv, so `bin/wine --dll=...`) or `CX_ENV`; never plain env. The registry channel (`bottleDllOverrides.ts`) also works and remains valid.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Probe script defects fixed during execution**
- **Found during:** Task 2
- **Issue:** First run quoted-value parsing marked `cxRootIsClone` false, the process scan matched my own shell's command text and reported a false `cxupgrade` signal, `WINEDEBUG` is overwritten by the wrapper so R3 saw no `Loaded` lines, and `wineboot --init` was wrongly counted as an update.
- **Fix:** Unquoted parsed values, excluded shell/node/ps rows from the process scan, counted only `cxupgrade`, `wineboot --update/-u` and snapshot changes as update signals, and drove `+loaddll` through the wrapper's `--debugmsg=` option. The whole bottle stage was re-run from a clean state.
- **Files modified:** scratchpad probe script only (not committed).

**Total deviations:** 1 auto-fixed (probe tooling only). **Impact:** none on results; plan otherwise executed as written. The `bottle` stage used the declared real-profile arm (bottles, licence state and `CX_BOTTLE` lookup live under the real `~/Library`); the `clone` stage used a fresh `createFakeHomeProfile()` for every child.

## Known Stubs

None.

## Threat Flags

None. No repo source changed (`git status -- src meta native public` is empty).

## Self-Check: PASSED

- 15 result keys present; `launch_form` valid; Consequences section present.
- `/Applications/CrossOver.app` unchanged, no `GameLibProbe5601*` bottles remain.
