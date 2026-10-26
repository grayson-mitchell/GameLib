---
created: 2026-10-25
title: "Live multi-threaded Wine gate for the shim bridge SRWLOCK (51-REVIEW WR-04)"
source: 51-REVIEW.md WR-04, skipped in 51-REVIEW-FIX.md (generated native C + live multi-threaded gate)
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
  - meta/__tests__/gen_vtables.test.ts
severity: minor
platform: macos
ready: live-gate
---

Status: the code fix landed in 082ff80db (2026-10-26, "fix(debug-abiotic): serialize shim bridge
round trips with an SRWLOCK"). The generator emits `static SRWLOCK g_bridge_lock = SRWLOCK_INIT;`.
`bridge_transact` holds it exclusively across `bridge_transact_locked` (connect, one transact, and
the retry-once on a fresh socket), and `SteamAPI_Shutdown` takes it around the socket close.

Why SRWLOCK rather than the originally proposed CRITICAL_SECTION + InitOnceExecuteOnce:
`SRWLOCK_INIT` is a static initializer, so there is no lazy init, no InitOnce, and no DllMain or
loader-lock exposure. The lock is not recursive; nothing that holds it may call `bridge_transact`
again.

Regression pin: the 'bridge transport serialization (WR-04)' describe in
`meta/__tests__/gen_vtables.test.ts` fails if the lock is removed from `bridge_transact`, if an
early return precedes the release, if a new caller reaches the transport functions outside the
locked path, or if `g_bridge_sock` / `g_next_request_id` is touched without the lock held.

What remains (the live gate): run, under Wine on this Mac, a title that calls Steam from two or
more threads concurrently (UE titles are the likely candidates). Abiotic Factor runs do not count:
it is single-threaded on the bridge, so they cannot exercise contention. Pass criteria: no deadlock
and no hang (the game reaches gameplay and quits cleanly, `SteamAPI_Shutdown` returns), and the
helper log shows no request-id-mismatch connection closes. Close this todo once a qualifying run is
recorded.

## Resolution

Resolved 2026-10-26 by the live gate recorded in quick 261026-kyv (SUMMARY, "Live gate"). The statement above that Abiotic runs do not count was stale: since `62d86ac0c` (Phase 55) its OSS Steam thread drains callbacks through `bridge_transact` while the game thread makes its own calls. A traced-shim run (124 s, quit from menu) showed two bridge threads (224: 340 calls, 448: 2,856), 6 real lock waits, 0 failed calls, 0 request-id mismatches, max 15 ms per call, and a clean `SteamAPI_Shutdown` / `LogExit`. The diagnostic trace was not committed.
