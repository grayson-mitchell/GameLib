# Quick 261026-kyv: Pin the shim bridge SRWLOCK (WR-04) Summary

Four regression tests on the generated shim C now fail if the bridge SRWLOCK is removed or bypassed; the WR-04 todo is narrowed to its live multi-threaded Wine gate.

## Commits
- e88486bf4 test(quick-261026-kyv): pin the shim bridge SRWLOCK serialization (WR-04) - meta/__tests__/gen_vtables.test.ts
- (second commit) docs(quick-261026-kyv): narrow WR-04 todo to its live multi-threaded gate - the pending todo

## Mutation proofs (both reverted; gen_vtables.ts and generated/ identical to HEAD afterwards)
1. Deleted the Acquire in bridge_transact: 1 failed - "bridge_transact holds the lock across bridge_transact_locked with no early return".
2. Added a bridge_transact_once call in gamelib_bridge_hello: 1 failed - "transport functions are only reachable through the locked path".

## Deviations
- The plan expected mutation 1 to also fail the shared-state test. It did not: Shutdown's own Acquire remains, and the transport functions touch the socket by design, so that test stays green. The ordering test alone catches it. The plan's "existing sync test also fails" did not occur either (only 1 failure each time).

## Verification
- jest gen_vtables.test.ts: 233/233 pass. prettier --check on the test file passes. pnpm planning-gates: 12/12 pass. graphify update run.
- The todo file is prettier-ignored, so no prettier check was carried for it.

## Live gate (2026-10-26, operator Mac, Abiotic Factor 427410): PASS

Diagnostic shim (NOT committed): `bridge_transact` used TryAcquire to flag contention and appended `t tid ord slot contended ok dt mism` per call to `gamelib_bridge_trace.log` beside the DLL. Deployed hash `ef9119bf5963` confirmed in the bottle after launch. Reverted afterwards and the production shim rebuilt (`steam_api64.dll` `71cedba71ea2`, reproducible across two builds). The bottle keeps the traced DLL until the next launch's byte-mismatch redeploy.

The todo's "Abiotic runs do not count" was stale. That trace predates `62d86ac0c` (Phase 55), which made `SteamAPI_RunCallbacks` drain through `bridge_transact`, so Abiotic now drives the bridge from two threads.

| Measure | Result |
|---|---|
| Run | 15:23:01 launch, menu idle ~2 min, quit from menu; 124 s of play |
| Bridge callers | tid 224 game thread: 340 calls (GetSteamID, BLoggedOn, auth tickets, stats). tid 448 OSS Steam thread: 2,855 DRAIN_CALLBACKS + 1 call |
| Real contention | 6 `contended=1` waits, 3 overlapping pairs (224 vs 448) |
| Failures | 0 `ok=0`, 0 request-id mismatches |
| Latency | max 15 ms per call, including the trace write |
| Shutdown | AbioticFactor.log: `OnlineSubsystemSteam::Shutdown()`, "Unloading the Steam API", `LogExit: Exiting.` at 02:25:06. Process gone at 15:25:06; helper stopped normally by GameLib (SIGTERM) |
| Helper log | HELLO, GINIT ok, CALLs, CBQ 168 queued; no errors or connection closes |

No deadlock, no hang, no mismatch closes. WR-04 todo closed. Manor Lords was not run.
