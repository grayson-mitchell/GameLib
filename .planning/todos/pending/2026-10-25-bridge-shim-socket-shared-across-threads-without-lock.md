---
created: 2026-10-25
title: "Generated bridge shim shares one socket and request id across game threads with no lock (51-REVIEW WR-04)"
source: 51-REVIEW.md WR-04, skipped in 51-REVIEW-FIX.md (generated native C + live multi-threaded gate)
area: steam-bridge
files:
  - meta/gen_vtables.ts
  - native/steam-bridge/generated/steam_api_shim.c
severity: medium
platform: macos
ready: live-gate
---

The shim emitted by `meta/gen_vtables.ts` keeps a single `g_bridge_sock` and request id;
`bridge_ensure_connected` / `bridge_transact_once` take no lock. Concurrent `bridge_transact`
calls from two game threads interleave frames on one stream, a request-id mismatch then closes
the socket under the other thread. Phase 51/53's wider served surface makes cross-thread calls
more likely.

Fix in the generator (never hand-edit generated output): a `CRITICAL_SECTION` initialised via
`InitOnceExecuteOnce`, held across connect + one transact. Verify with a zig shim build and a live
multi-threaded Wine run to rule out deadlock / loader-lock interactions.
