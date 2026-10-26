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
