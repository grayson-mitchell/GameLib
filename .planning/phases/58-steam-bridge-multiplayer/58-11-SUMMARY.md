---
phase: 58-steam-bridge-multiplayer
plan: 11
subsystem: steam-bridge
tags: [shim, manual-dispatch, steamworks-net, facepunch, call-results, generator]
requires: [58-07, 58-10]
provides:
  - "Real SteamAPI_ManualDispatch_* exports (Init, RunFrame, GetNextCallback, FreeLastCallback, GetAPICallResult)"
  - "Bounded shim-side message FIFO (32) and results table (16, 10 s, zeroed)"
  - "ISteamUtils IsAPICallCompleted / GetAPICallResult as shimLocal for every served version"
affects: [58-12]
tech-stack:
  patterns: ["x64-only manual-dispatch block under #if !defined(__i386__); results table shared by both DLLs"]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/callbackRegistryHost.test.ts
    - meta/__tests__/fixtures/callback_registry_harness.c
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamutils005.manifest.json
    - meta/sdk/isteamutils007.manifest.json
    - meta/sdk/isteamutils008.manifest.json
    - meta/sdk/isteamutils009.manifest.json
    - meta/sdk/isteamutils010.manifest.json
    - native/steam-bridge/generated/steam_api_shim.c
    - native/steam-bridge/generated/bridge_dispatch.h
key-decisions:
  - "ManualDispatch RunFrame uses its own 30 ms floor timer, sharing only the slot fail counters/backoff with the registry"
  - "A full FIFO whose front message is in the game's hands drops the NEW message (the front cannot move); otherwise the oldest is evicted and zeroed; both report (id,0,0)"
  - "Polling games (no manual dispatch, no CCallResult) pull slot 11 on demand from IsAPICallCompleted/GetAPICallResult, throttled to the drain interval; a result whose CCallResult is already registered goes to the held table instead so RunCallbacks still delivers it"
  - "Registry-mode results with no registered CCallResult are also stored in the results table so a polling game finds them"
requirements-completed: [M-03]
duration: ~60min
completed: 2026-10-31
---

# Phase 58 Plan 11: Manual-dispatch callbacks and ISteamUtils call-result polling Summary

Unity/Steamworks.NET and Facepunch titles now get relayed callbacks and call results through real `SteamAPI_ManualDispatch_*` exports backed by a bounded, zeroing FIFO and results table; polling games read results through shimLocal `IsAPICallCompleted` / `GetAPICallResult`.

## Commits
- 04e4b19af feat(58-11): manual-dispatch FIFO, results table and real ManualDispatch exports
- f92839075 feat(58-11): shimLocal ISteamUtils polling; regenerate shim and manifests

## What was built
- Generated registry: `gl_md_init/run_frame/get_next/free_last/get_api_call_result/is_api_call_completed`. `get_next` fills the measured x64 `CallbackMsg_t` (`m_hSteamUser` 1, pointer into shim-owned FIFO memory); `free_last` pops and secure-zeroes. A slot-11 result in md mode is stored and announced by a synthesized 703 message at the measured `SteamAPICallCompleted_t` offsets. `GetAPICallResult` copies only on exact id and size match, sets `*pbFailed` (one byte), and removes the entry.
- After `ManualDispatch_Init`, `gl_cb_run_callbacks` returns at once, so only one consumer path drains the helper.
- D-08 reporting: `get_next` reports (id,1,0) once per message; expiry/eviction reports (id,0,0).
- `LIFECYCLE_NOOP_SPECS` lost the five ManualDispatch entries; `MANUAL_DISPATCH_EXPORT_BODIES` supplies real bodies and the export set (and `steam_api64.def`, exactly five entries) is unchanged. x86 untouched (D-11).
- `SHIM_LOCAL_BODIES` gained `SteamUtils.IsAPICallCompleted` and `SteamUtils.GetAPICallResult`; wire-policy marks both `shimLocal`, manifests 005, 007, 008, 009, 010 regenerated.
- Harness: 9 new cases (md_broadcast, md_callresult, md_callresult_failed_flag, md_callresult_wrong_id, md_fifo_bounded, md_runcallbacks_inert, md_report, utils_poll, md_registry_unmatched_pollable); 45 host cases total, all under ERRORCHECK mutexes.

## Deviations from Plan

1. **[Rule 3 - blocking] validateManifest rejected shimLocal pointer params.** Wire-mode pointer params need an explicit kind; a shimLocal method never marshals, so the check now skips shimLocal methods.
2. **[Rule 1 - test] Two gen_vtables tests assumed nothing used the extended wire doc.** The "real manifests embed base text only" test now filters shimLocal methods first; the regen-equality test title notes 58-11 uses shimLocal only. The old ManualDispatch "returns 0" pins were replaced by real-body pins.
3. **[Rule 1 - extractor] `pnpm extract-proton-inventory` drops the hand-added `helperInterface` field.** Pre-existing behaviour; I restored `"helperInterface": "SteamAPI_SteamUtils_v011"` in all five manifests, so the diff is only the two method overlays.
4. **[Rule 2 - correctness] Polling vs registered CCallResult.** The plan did not say what happens when an on-demand poll pulls a result a registered CCallResult needs; such results now go to the held table (delivered by RunCallbacks on the game's thread) rather than the polling table.
5. Prettier reformatted `meta/gen_vtables.ts` once after edits (no content change).

## Verification
- `jest` gen_vtables (309), shimAbiGate, callbackRegistryHost (45), shimCoverage: 464 tests green.
- `pnpm gen-vtables && pnpm build-steam-bridge`: helper built; x86 and x64 compile gates PASSED.
- `grep -c '^SteamAPI_ManualDispatch_' steam_api64.def` is 5; `"shimLocal": true` count in wire-policy is 2; prettier and `pnpm codecheck` clean.
- Not live-tested against a Unity/Facepunch title or the Wine runtime (no game launched, per instructions).

## Known Stubs
None.

## Threat Flags
None beyond the plan's register (T-58-35..37 mitigated: slot-6/11 replies validated by id/size/length before enqueue; GetAPICallResult exact id+cub; static bounded storage 32/16 with 10 s expiry; secure-zero on free, eviction, expiry, retrieval).

## Self-Check: PASSED
- 04e4b19af and f92839075 present in git log; generated files committed.
