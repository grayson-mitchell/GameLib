---
status: diagnosed
trigger: "G30: pinned:wine-staging-11.20 -> crossover switch spends ~20 s in DXVK removal (two exactly-10 s steps) before launch"
created: 2026-11-03
updated: 2026-11-03
goal: find_root_cause_only
---

## Current Focus

known_pattern_candidate: "shared-redist-slow-wine-calls — runWineCommand settles on pipe close; wineserver inherits pipes and lingers"
hypothesis: DXVK.installRemove('restore') runs 2 `reg delete` + 1 `wineboot -u` through CrossOver wine via runWineCommand(wait:true) without resolveOnExit; each call settles only when the wineserver it started exits (linger + wineboot/winedevice), and the first CrossOver process in a bottle last updated by Staging runs an automatic prefix update (.update-timestamp mismatch), and the explicit wineboot -u is a second full update.
test: measure close-vs-exit timing for reg delete and wineboot -u on a scratch Staging prefix (not a real bottle, not CrossOver)
expecting: close >> exit for each call; wineboot -u several seconds
next_action: run scratch timing script

## Symptoms

expected: pinned -> crossover switch adds no ~20 s idle wait before launch
actual: item 42: 21:18:34 switch, 21:18:44 `Removing DXVK DLLs`, 21:18:54 `Removing dxvk-macOS version information` + launch. Item 41 online same ~21 s.
errors: none
reproduction: bottle marker pinned:wine-staging-11.20, Play with CrossOver healthy (Automatic)
started: since Phase 59 restore path

## Eliminated

## Evidence

- timestamp: 2026-11-03 checked: ~/Library/Logs/GameLib gamelib.log/.old found: item 41/42 window (21:11, 21:18) rotated out; no DEBUG lines survive for it. implication: per-command split must be inferred from code + log markers.
- timestamp: 2026-11-03 checked: src/backend/tools/index.ts installRemove restore branch found: logs `Removing DLL overrides`, then awaits one `wine reg delete` per unique DLL (dxvk-macOS 1.10.3: d3d10core, d3d11 = 2 calls), logs `Removing DXVK DLLs` (rmSync, instant), logs `Restoring Wine stock DLLs`, awaits `wineboot -u`, then logs `Removing dxvk-macOS version information`. All with wait:true, no resolveOnExit. implication: gap 1 (34->44) = 2 reg deletes; gap 2 (44->54) = wineboot -u.
- timestamp: 2026-11-03 checked: launcher.ts runWineCommand found: settles on child 'close' (all pipe holders gone), then spawns `wineserver --wait`. implication: each call costs until wineserver exits.
- timestamp: 2026-11-03 checked: .planning/debug/resolved/shared-redist-slow-wine-calls.md found: on a CrossOver bridge bottle, `wine reg query` exit 0.97 s, close 4.09 s with piped stdio. implication: ~4-5 s per reg call under CrossOver.
- timestamp: 2026-11-03 checked: bottle GameLibSteamBridge-1284190 .update-timestamp = 1793246336 (= Staging wine.inf mtime); CrossOver wine.inf mtime 1784047440. implication: every engine flip leaves a timestamp mismatch, so the first wine process of the other engine runs a full automatic prefix update.
- timestamp: 2026-11-03 checked: gamelib.log.old 21:24:18 reverse switch (crossover -> pinned, Staging) found: first `reg add d3d10core` 21:24:18 -> next at 21:24:32 (14 s), second `reg add d3d11` 21:24:32 -> 21:24:37 (5 s). implication: same mechanism visible in the other direction: first call carries the auto prefix update + linger, each later call ~4-5 s.

- timestamp: 2026-11-03 checked: scratch Staging 11.20 prefix (scratchpad, not a real bottle, not CrossOver), node spawn with piped stdio + `wineserver --wait`, mirroring runWineCommand. found: reg add/delete exit ~1.0 s, close ~4.1 s each; `wineboot -u` exit 6.0 s, close 10.1 s; first call after .update-timestamp mismatch exit 6.2 s, close 10.4 s, second call 4.3 s. `wineserver --wait` adds ~25 ms. implication: per-call cost = command + ~3-4 s wineserver linger held by inherited pipes; wineboot -u alone = 10 s (gap 2); 2 reg deletes = ~8-10 s (gap 1). Matches log.
- timestamp: 2026-11-03 checked: scratch prefix, rm system32+syswow64 d3d11.dll, set mismatched .update-timestamp, run one reg call. found: both d3d11.dll restored by the automatic update; with matching timestamp a removed DLL is NOT restored. implication: when the DLLs are removed before the first wine process of the new engine, the auto update that the engine flip already forces does the explicit `wineboot -u`'s job (UNVERIFIED on CrossOver).

## Resolution

root_cause: DXVK.installRemove 'restore' (src/backend/tools/index.ts) runs 3 serial wine processes through CrossOver via runWineCommand(wait:true): `reg delete` d3d10core, `reg delete` d3d11, `wineboot -u`. runWineCommand settles on 'close', which waits for the wineserver the call started (it inherits the piped stdout/stderr) to exit ~3-4 s after the last client: ~4-5 s per reg call (gap 1 = 10 s) and ~6 s + 4 s for wineboot -u (gap 2 = 10 s). The explicit wineboot -u also duplicates the full prefix update the engine flip already forces (.update-timestamp mismatch).
fix:
verification:
files_changed: []
