---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
fixed_at: 2026-10-26T00:00:00Z
review_path: .planning/phases/55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket/55-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 55: Code Review Fix Report

**Fixed at:** 2026-10-26
**Source review:** .planning/phases/55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket/55-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 5 (WR-01 to WR-05; fix_scope critical_warning, so the IN-* findings are excluded)
- Fixed: 4
- Skipped: 1

All shim fixes were made in `meta/gen_vtables.ts`. The output was regenerated with `pnpm gen-vtables`, and each commit contains both the generator change and the regenerated output. After every fix these suites passed when run with `--runInBand`: `callbackRegistryHost`, `gen_vtables`, `shimAbiGate`, `buildSteamBridgeShims`, `bridgeCensus` and `msvcCallbackBaseLayout`. `shimAbiGate` does a real zig cross-compile of the shim, so the regenerated C builds for the Windows targets. That suite times out at 180 s when run in parallel with the other suites. The timeouts come from the parallel run, not from these changes.

## Fixed Issues

### WR-01: Use-after-free window between the "still registered" check and the Run call

**Files modified:** `meta/gen_vtables.ts`, `native/steam-bridge/generated/steam_api_shim.c`, `meta/__tests__/fixtures/callback_registry_harness.c`, `meta/__tests__/callbackRegistryHost.test.ts`
**Commit:** cd34bd900
**Status:** fixed: requires human verification (concurrency logic)
**Applied fix:** Added in-flight state guarded by the registry lock: `gl_cb_running`, `gl_cb_run_tid` and `gl_cb_dispatching`. Only one RunCallbacks dispatch runs at a time; a concurrent or re-entrant RunCallbacks returns at once. Before each Run call the dispatcher marks the target object. While that mark is set, `gl_cb_unregister` for the same object from a different thread waits in an unlock, yield, relock loop. An unregister from the dispatching thread never waits, so a handler can still unregister itself. Two new items were added to the embedder contract: `GL_CB_THREAD_ID()` and `GL_CB_YIELD()`. The Windows embedder defines them as `GetCurrentThreadId()` and `Sleep(1)`. Two new harness cases were added. `cross_thread_unregister_waits` checks that a second thread's unregister does not return before Run does. I confirmed this case fails when the wait loop is removed. `reentrant_run_skipped` covers the second-dispatcher guard. Accepted tradeoff: if a handler blocks on a thread that is itself unregistering that same object, the two threads deadlock. The real SDK has the same behavior.

### WR-02: bridge_transact_once leaves an oversized reply payload unread, which desyncs the stream

**Files modified:** `meta/gen_vtables.ts`, `native/steam-bridge/generated/steam_api_shim.c`
**Commit:** 46767cfdc
**Applied fix:** A frame with `respLen < 5` now sets `*transportFailed = 1` before the subtraction, so the value cannot underflow. When `retLen > retBufCap`, the shim now closes the socket and sets `g_bridge_sock = INVALID_SOCKET`, so the unread payload is thrown away and the next call reconnects. This differs from the review suggestion on purpose: it does not set `*transportFailed`. Setting it would make `bridge_transact_locked` resend the request. The helper has already answered that request, and for DRAIN it has already popped the message. A resend would repeat a non-idempotent call, such as minting a second ticket or losing a queued callback.

### WR-04: Over-long identity is silently truncated to a different identity

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`, `native/steam-bridge/generated/steam_api_shim.c`, `native/steam-bridge/generated/bridge_dispatch.h` (doc comment only)
**Commit:** e16619e27
**Applied fix:** The in-string encoder in `packArgsBlock` no longer truncates. When a string is longer than `WIRE_IN_STRING_MAX_BYTES`, it sends length `WIRE_IN_STRING_MAX_BYTES + 1` with no payload bytes. The helper's existing T-51-24 check (`len > MAX`) refuses that length with a non-zero status, so the method returns its normal failure value. For GetAuthTicketForWebApi that value is 0, the invalid-ticket handle. The change applies to every in-string method, not only this one, because a truncated achievement or stat name is also the wrong string. No manifest or wire-policy change was needed. `WIRE_LAYOUT_DOC` was updated to match, and a generator test now asserts that no clamp expression remains anywhere in the shim.

### WR-05: A ticket consumed from the helper is discarded if no target is registered at that instant

**Files modified:** `meta/gen_vtables.ts`, `native/steam-bridge/generated/steam_api_shim.c`, `meta/__tests__/fixtures/callback_registry_harness.c`, `meta/__tests__/callbackRegistryHost.test.ts`
**Commit:** a65c8e393
**Applied fix:** I took the review's "documented limit" option. The registry doc comment now states that the drain is destructive and the message is dropped, as Steam drops an unhandled callback. A count-only counter, `gl_cb_no_target`, goes up when a validated message reaches no live non-gameserver handler. The shim registry has no logging channel, so the count is kept in memory and not logged. The harness case `no_target_counted` covers it.

## Skipped Issues

### WR-03: Queued tickets survive client disconnect, new connections and helper shutdown, and any local process can drain them

**File:** `native/steam-bridge/helper/bridge_helper.c:694-719`, `native/steam-bridge/helper/gamelib_cbqueue.h:97`, accept loop `bridge_helper.c:922`
**Reason:** Needs an operator/design decision, plus a live-game test I cannot run here. Clearing the ring when a connection is accepted or closed conflicts with how the shim reconnects. The helper's 5 s `SO_RCVTIMEO` closes idle connections, and the shim reconnects without telling the game after any transport failure, now including the WR-02 path. So the "next connection" is almost always the same game process. Clearing on reconnect could drop the very ticket the game is waiting for, which is the failure Phase 55 exists to fix. The real fix is the review's longer-term item: a per-launch secret in the HELLO handshake, with the ring bound to the authenticated session. That changes the protocol on both the shim and helper side, and someone needs to decide on it. Zeroing the ring "at helper exit" would not help either: the accept loop is `for (;;)` and the helper has no exit path, because it is ended by a signal.
**Original issue:** The ring is never cleared when a client disconnects or reconnects. The loopback listener has no authentication, so any local process can issue CONTROL slot 6 and pop a web-API ticket. The ring is not zeroed at exit.

---

_Fixed: 2026-10-26_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
