---
phase: 58-steam-bridge-multiplayer
plan: 07
subsystem: steam-bridge
tags: [helper, callbacks, call-results, net-evidence, control-slot]
requires: [58-02]
provides:
  - "13 relayed broadcast callback rows with table-driven Mac->MSVC repack"
  - "gamelib_callresult.h: pending-call table (16), result ring (8), slot-11 encoder"
  - "CONTROL slot 11 drainCallResults"
  - "gl_net_evidence NET emitter and gl_helper_cr_track"
affects: [58-10, 58-11]
tech-stack:
  added: []
  patterns: ["field-map rows {macOff, winOff, width} instead of per-struct repack functions"]
key-files:
  created:
    - native/steam-bridge/helper/gamelib_callresult.h
  modified:
    - native/steam-bridge/helper/gamelib_cbqueue.h
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/cbqueue_harness.c
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
key-decisions:
  - "Allowlist rows are {id, winSize, macSize, map}; gl_cbq_offer still demands the wire size, so a raw Mac buffer is rejected"
  - "NET lines are assembled from closed literal word tables and sent via logts(), so no NET/CBQ logts_f format carries %s"
requirements-completed: [M-03, M-04, M-05]
duration: ~50min
completed: 2026-10-31
---

# Phase 58 Plan 07: Helper callback relay, call results and NET evidence Summary

The helper now relays the 13 roadmap callback families with field-by-field repack, completes tracked call results (513, 510, 504) and serves them on CONTROL slot 11, and emits D-08 NET evidence lines.

## Commits
- 7e15c2a0e feat(58-07): broadcast relay rows, table-driven repack and call-result table
- b025ccfb3 feat(58-07): pump routing, CONTROL slot 11, join promotion and NET emitter

## Contract for 58-10 / 58-11

Final emitter signature (bridge_helper.c, declared in gamelib_callresult.h):

```c
void gl_net_evidence(int game, int kind, int iface, int32_t cb, uint32_t n, int path);
// game: 1 role=game, 0 role=helper
// kind: GL_NET_KIND_{JOIN,SEND,RECV,PATH,OVERSIZE}
// iface: GL_NET_IFACE_{MATCHMAKING,NETWORKING,SOCKETS,MESSAGES}
// path: GL_NET_PATH_{UNKNOWN,DIRECT,RELAYED}
int gl_helper_cr_track(uint64_t hCall, int32_t iCallback); // call after a wire method returns a SteamAPICall_t
```

Slot 11 reply: `[u32 count 0|1]` and, if 1, `[u64 hAPICall][i32 iCallback][u32 ioFailure][u32 cub][cub bytes]` (cub is the x64 wire size; ioFailure 1 gives zero-filled bytes). Slot 10 accepts any broadcast or call-result id (504, 513, 510 and the 13 families).

## Deviations from Plan

1. **[Rule 1 - consistency] Ring size 8 -> 32 required updating two existing harness cases** (`overflow-count`, `drop-oldest` now offer 33 messages).
2. **CBQ `queued` log line no longer prints `result=`** for 168: the generic row path logs `iCallback` and `cub` only (the old +4 read was meaningless for the new structs and V7 prefers fewer fields). No test or consumer depended on it.
3. **Join note also set from call-result completions of 504** (JoinLobby result), not only the broadcast, so slot-10 reports for a call-result 504 promote to `role=game`.
4. **Unlisted observation only for non-703 ids**; 703 is consumed wholly by the stats/tracked branches and is never counted as unlisted.
5. Source pin in helperIntegration widened to allow the second `g_md_get_api_call_result` call (tracked handles only) and the NET `logts("NET", msg)` call that builds `msg` from literal tables.

Cross-pinned: 15 id pairs of MAC/WIN size defines plus the 1221/504 classifier offsets against CALLBACK_LAYOUTS.

## Verification
- cbqueue 66 tests, protocol, helperIntegration (27) green; `pnpm build-steam-bridge` exit 0; `pnpm codecheck` clean; prettier clean on touched TS.
- Live Steam behaviour (real call results, join evidence) is not exercised here: needs 58-10/58-11 shim half.

## Known Stubs
None. Nothing calls `gl_helper_cr_track` or `gl_net_evidence` for send/recv yet by design (58-10).

## Self-Check: PASSED
- 7e15c2a0e and b025ccfb3 in git log; gamelib_callresult.h present.
