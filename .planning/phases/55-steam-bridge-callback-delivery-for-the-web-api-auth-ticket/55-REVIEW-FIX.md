---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
fixed_at: 2026-10-26T00:00:00Z
review_path: .planning/phases/55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket/55-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 55: Code Review Fix Report

**Fixed at:** 2026-10-26
**Source review:** .planning/phases/55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket/55-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 5 (WR-01 to WR-05; fix_scope critical_warning, so the IN-* findings are excluded)
- Fixed: 5 (four in this pass; WR-03 later, in quick `261027-9vr`)
- Skipped: 0

All shim fixes were made in `meta/gen_vtables.ts`. The output was regenerated with `pnpm gen-vtables`, and each commit contains both the generator change and the regenerated output. After every fix these suites passed when run with `--runInBand`: `callbackRegistryHost`, `gen_vtables`, `shimAbiGate`, `buildSteamBridgeShims`, `bridgeCensus` and `msvcCallbackBaseLayout`. `shimAbiGate` does a real zig cross-compile of the shim, so the regenerated C builds for the Windows targets. That suite times out at 180 s when run in parallel with the other suites. The timeouts come from the parallel run, not from these changes.

## Fixed Issues

### WR-01: Use-after-free window between the "still registered" check and the Run call

**Files modified:** `meta/gen_vtables.ts`, `native/steam-bridge/generated/steam_api_shim.c`, `meta/__tests__/fixtures/callback_registry_harness.c`, `meta/__tests__/callbackRegistryHost.test.ts`
**Commit:** cd34bd900
**Status:** fixed. The human verification this asked for was met on 2026-10-26. 55-UAT run 2 re-ran every live item on the shim regenerated from this commit and passed. The `cross_thread_unregister_waits` harness case fails when the wait loop is removed. 55-SECURITY closed T-55-16 against the in-flight guard.
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

### WR-03: Queued tickets survive client disconnect, new connections and helper shutdown, and any local process can drain them

**Fixed later:** 2026-10-27, by quick `261027-9vr`. It was skipped in this pass because it needed an operator decision on the protocol.
**Files modified:** `native/steam-bridge/helper/bridge_helper.c`, `meta/gen_vtables.ts`, `native/steam-bridge/generated/steam_api_shim.c`, `src/backend/storeManagers/steam/bridge/protocol.ts`, `bridgeConfig.ts`, `helperProcess.ts`, `src/backend/storeManagers/steam/games.ts`
**Commits:** bad35fc50 (backend), 36f015607 (helper), 26d37a064 (log hygiene), 50c3024cc (shim)
**Applied fix:** This is the review's longer-term option: a per-launch secret in the HELLO handshake. The backend mints a secret for each spawn. The helper gets it as `GAMELIB_BRIDGE_SECRET` in its env (never argv) and scrubs it from the startup block. The shim gets it as `secret=` in a 0600 `gamelib_bridge.cfg`. The helper answers only HEALTH and HELLO until a constant-time match, so DRAIN never reaches the ring on an unauthenticated socket. A wrong HELLO de-authenticates, and a helper with no valid secret fails closed. The ring is bound to the secret, not to the socket. It is still not cleared on accept or close, so a re-authenticated reconnect from the same game keeps the ticket it is waiting for (the concern recorded when this was skipped). The threat model is other OS users and processes that cannot read the user's files. A same-user attacker can already read the cfg and the stored refresh token, so this fix does not stop them.
**Tests:** `WR-03` cases in `helperIntegration.test.ts` and `gen_vtables.test.ts`, plus `bridgeConfig`, `helperProcess` and steam `games.test.ts`.
**Live gate:** passed, all four checks (`30c6b2bd5`, `todos/completed/2026-10-27-bridge-hello-secret-live-gate-on-a-phase-55-ticket-title.md`). Source todo: `todos/completed/2026-10-26-bridge-helper-callback-ring-drainable-by-any-local-process.md`.

## Skipped Issues

None. WR-03 was skipped in iteration 1 and has since been fixed (above). The reason it was skipped at the time, kept for the record: the ring could not be cleared on reconnect without dropping the ticket the game was waiting for, and the real fix was a protocol change that needed an operator decision.

---

_Fixed: 2026-10-26_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
