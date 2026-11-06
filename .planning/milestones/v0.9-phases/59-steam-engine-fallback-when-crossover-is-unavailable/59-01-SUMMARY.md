---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 01
subsystem: steam-engine
tags: [crossover, wine-staging, dxvk, spike, wave0]
requires: []
provides:
  - machine-readable Wave 0 findings consumed by 59-06 and 59-10
affects: [59-06, 59-10]
tech-stack:
  added: []
  patterns: [clone-only engine probes in temp CX_BOTTLE_PATH / WINEPREFIX]
key-files:
  created:
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/run-wave0.sh
    - .planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/README.md
  modified: []
key-decisions:
  - "Adoption with a minimal cxbottle.conf is clean; DXVK removal round-trips on CrossOver"
requirements-completed: [D-03, D-07, D-11, D-12]
duration: n/a
completed: 2026-11-01
---

# Phase 59 Plan 01: Wave 0 engine probes Summary

Real CrossOver 26.3 and Wine-Staging 11.20 were run against throwaway APFS clones only. The answers are below as parseable lines.

## Findings

adoption_clean: yes
adoption_conf_gained_timestamp: yes
dxvk_restore_clean: yes
dxvk_restore_engine: crossover
cx_bottle_has_update_timestamp: yes
staging_monitor_match: yes
nag_blocks: no
expired_dialog_seen: yes
create_under_expiry: succeeded # rc 0 in 14.0 s, no dialog; trial clock is per bottle (see evidence)
nag_handling_confirmed: n/a

## Evidence

**D-03 adoption** (wave0/logs/adopt-20261031T090354Z.log): `--demo-status` printed `Standard version` (rc 0, 8 s; 52 s on a first cold run). CrossOver added a `"Timestamp"` line and there is one `"Version"` line; `drive_c/users/crossover` was created. probe64.exe ran under CrossOver (rc 0, 0 s) and again under Staging afterwards (rc 0, 10 s); probe.txt `arch=x64 init=0 steamuser=null result=FAIL` both times (no bridge helper running, so this only proves execution). The probe needs steam_api64.dll beside it, otherwise rc 53.

**D-07 DXVK round trip** (dxvk-20261031T090419Z.log): clone of GameLibSteamBridge-1284190 (Planet Crafter), which has `.update-timestamp`. DXVK-macOS 1.10.3 backup by Staging, restore (reg delete, DLL delete, `wineboot -u`) by CrossOver, all rc 0. d3d11.dll sha256 prefixes: system32 9fb42c6df2774386 before, 0ff0b0835dde2955 after backup, 9fb42c6df2774386 after restore; syswow64 73ab10471fe377d5 before and after. 0 DXVK DllOverrides remain; `cmd /c ver` printed `Microsoft Windows 10.0.19045`, rc 0. Staging fallback not needed. DXVK was fetched from the Gcenx release tag the app pins, into the session scratchpad (not the user's tools dir), via `DXVK_DIR`.

**D-11 ps match** (psmatch-20261031T090508Z.log): `11624 C:\Games\Probe\probecmd.exe /c ping -n 25 127.0.0.1`. Starts with `C:\Games\Probe\`, so deriveWindowsPrefix matching works for Staging.

**D-12 spike-060** (.planning/spikes/060-crossover-trial-expiry/logs/events.log, operator watching):
- Step 1: the clone was left at `Demo version (expired 53 days ago)` from an earlier run; backdate to the original InstallTime 0x6148e3ae gave `15 days remaining`.
- Harness note: InstallTime is obfuscated and `backdate sub:<s>` is not monotonic in days remaining. Scanning found 0x6178e3ae (original XOR 0x300000) = `3 days remaining`. Single-bit flips: bit16 -1 day, bit18 -3 days, bit21 `expired 10 days ago`, bit23 `expired 82 days ago`. 0x6168e3ae = `expired 10 days ago`.
- Step 2 (3 days remaining): the first launch rc 53 because probe32.exe needs steam_api.dll beside it (same gap as probe64); the orchestrator copied public/bin/arm64/darwin/steam_api.dll into the clone's drive_c/spike060 by hand, run.sh unmodified. Relaunch rc 0 in 1.3 s, probe.txt `arch=x86 init=0 steamuser=null result=FAIL` (expected, no helper). No dialog. So the near-expiry nag does not block a launch.
- Open observation: the status check just before that launch took 80.8 s (rc 0) versus about 1 s on every other run. No dialog was seen; cause unknown.
- Step 3 (`cxbottle --create`, alarm 120, clone at 3 days remaining): rc 0 in 14.0 s, cxbottle.conf created, no dialog. The trial clock is per bottle, so the new bottle gets a fresh clock and the clone's expiry does not gate create; this was not tested against a truly expired state.
- Step 4 (expired 10 days ago): the launch was killed by the 90 s alarm, rc 142, 90.1 s, probe.txt NONE (probe never ran). The operator saw an "Expired Bottle" dialog with Continue greyed out and Cancel enabled; it closed itself when the launch was killed.
- Licence file mtime unchanged (Oct 22 19:57) before and after. The clone's wineserver was stopped. An unrelated user `control joy.cpl` winewrapper (PID 16027) was left alone.

## Consequences for later plans

- adoption_clean is yes: 59-06 Task 2 may proceed with the minimal cxbottle.conf.
- dxvk_restore_clean is yes under CrossOver: 59-06 Task 3 proceeds and uses CrossOver to run the restore.
- staging_monitor_match is yes: 59-10 may arm the launch deadline for non-CrossOver engines.
- nag_blocks is no: 59-10 needs no nag handling. It must still arm the launch deadline, because an expired bottle hangs behind an "Expired Bottle" dialog until killed (rc 142 at 90 s, probe never ran). Treat a hang past the deadline as a possible expired-bottle state and surface the CrossOver reminder; never edit NagTime, the registry or the licence.

## Deviations from Plan

- [Rule 3] Probe staging: probes need the shim DLL beside them, so the harness stages probe64.exe and steam_api64.dll into the clone. The first adopt log (rc 53, harness bug) was deleted.
- [Rule 3] `Standard version` was added to the accepted `--demo-status` strings.

## Self-Check: PASSED

Task 1 commit c54a0c3d6 exists; the wave0 harness, README and logs exist.
