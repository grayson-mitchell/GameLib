---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
reviewed: 2026-10-26T00:02:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - meta/gen_vtables.ts
  - meta/msvcCallbackLayout.ts
  - meta/sdk/wire-policy.json
  - meta/sdk/isteamuser.manifest.json
  - native/steam-bridge/generated/steam_api_shim.c
  - native/steam-bridge/helper/bridge_helper.c
  - native/steam-bridge/helper/gamelib_cbqueue.h
  - src/backend/storeManagers/steam/bridge/protocol.ts
findings:
  critical: 0
  warning: 5
  info: 5
  total: 10
status: issues_found
---

# Phase 55: Code Review Report

**Reviewed:** 2026-10-26
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The locking design is sound. The registry lock is never held across the transport or a Run call. Register and unregister during dispatch are handled by the re-find check, and shutdown clear is safe. The slot-6 wire checks on the shim side are complete: len >= 4, count == 1, len >= 12, id in the allowlist, cub == size, and len == 12 + cub. The helper ring is bounded, FreeLastCallback is always paired, the allowlist is exact-size, and buffer sizes agree at 2584 on both sides. The MSVC offsets and the vslot of 1 are consistent with the dump (x64 flags 8 / iCallback 12, x86 4 / 8), and THISCALL is attached on i386 only. The GetAuthTicketForWebApi in-string is decoded with a bounds check in the helper. The defects below are mostly robustness and credential-hygiene gaps.

steam_api_shim.c is generated, so every shim finding is fixed in `meta/gen_vtables.ts`, not in the .c file.

## Warnings

### WR-01: Use-after-free window between the "still registered" check and the Run call

**File:** `meta/gen_vtables.ts:1010-1020` (emits shim `steam_api_shim.c:~560`)
**Issue:** The `still` check runs under the lock, but the lock is released before `gl_cb_dispatch_one`. If another game thread unregisters and destroys that `CCallback` in the gap, the dispatcher reads the vtable of freed memory and calls it. The comment claims "a handler may unregister" is safe. That holds for the same thread only. The real SDK serializes Run and Unregister on one thread. This shim now exposes the race to multi-threaded games that call RunCallbacks from a worker thread.
**Fix:** Document the single-thread assumption in the embedder contract. Better, add an in-flight marker (`gl_cb_dispatching` pointer plus a condition or spin) that `gl_cb_unregister` waits on when called from a different thread than the dispatcher. Do not wait when called from the dispatching thread itself, to avoid self-deadlock.

### WR-02: bridge_transact_once leaves an oversized reply payload unread, which desyncs the stream

**File:** `meta/gen_vtables.ts` (generated `steam_api_shim.c:327-328`)
**Issue:** `if (retLen > retBufCap) return 0;` returns without consuming the `retLen` payload bytes. Those bytes, which can contain the auth ticket, stay in the socket. The next transact then reads ticket bytes as a header. The request-id mismatch is treated as a transport failure and the connection is reset. That recovers eventually, but it makes an unrelated call fail. Slot 6 makes the path reachable. Also, `respLen - 5` underflows when `respLen < 5`. It is caught only by accident, as a huge retLen exceeding the cap.
**Fix:** Check `respLen < 5` explicitly and set `*transportFailed = 1`. Treat `retLen > retBufCap` as a transport failure too, so the connection is closed and the payload is discarded.

### WR-03: Queued tickets survive client disconnect, new connections and helper shutdown, and any local process can drain them

**File:** `native/steam-bridge/helper/bridge_helper.c:694-719`, `gamelib_cbqueue.h:97`; the accept loop is at `bridge_helper.c:922`
**Issue:** The ring is never cleared when a client disconnects or reconnects. A 168 produced for a previous connection can be delivered to the next one. The listener on loopback has no authentication (no token or nonce, only SO_RCVTIMEO). Any local process that connects can issue CONTROL slot 6 and pop the ticket, which is a web-API credential. The ring is also never zeroed at exit.
**Fix:** Call a `gl_cbq_clear(&g_cbq)` helper that secure-zeros all slots when a connection is accepted and when it is closed, and at helper exit. Longer term, add a per-launch secret to the HELLO handshake.

### WR-04: Over-long identity is silently truncated to a different identity

**File:** `meta/gen_vtables.ts` (generated `steam_api_shim.c:1018`)
**Issue:** An identity longer than 4096 bytes is cut to 4096 and a ticket is issued for the truncated string. For a web-API ticket the identity is an audience binding, so this silently mints a ticket for the wrong identity. It is the same generic in-string pattern as the other methods, but this is the first one where truncation has a security meaning.
**Fix:** For this method, fail the call (return 0, the invalid-ticket handle) when `rawLen > WIRE_IN_STRING_MAX_BYTES`. Alternatively give the in-string kind a `reject-overlong` policy flag in `wire-policy.json`.

### WR-05: A ticket consumed from the helper is discarded if no target is registered at that instant

**File:** `meta/gen_vtables.ts:1000-1018`
**Issue:** The drain pops the message (the helper zeroes the slot) before the dispatcher knows whether any non-gameserver handler for that id exists. `gl_cb_relay_count` is checked only at the start of the run. If the only 168 handler is unregistered, or is a gameserver one, the ticket is lost and the game waits forever. This is a narrow window, but the loss is permanent because the pull is destructive.
**Fix:** Acceptable as a documented limit, since Steam also drops unhandled callbacks. If not, log a count-only "no target" line, using integers only.

## Info

### IN-01: Redundant and unreachable checks in the drain parser

**File:** `meta/gen_vtables.ts:~990`
**Issue:** `count == 0 || count != 1` reduces to `count != 1`. `len > GL_CB_DRAIN_RESP_MAX_BYTES` can never be true, because the transport already rejects retLen > cap.
**Fix:** Simplify the two checks. Keep the length check as defense in depth with a comment.

### IN-02: The param pointer passed to handlers is not guaranteed aligned

**File:** `meta/gen_vtables.ts:~1017`
**Issue:** `buf + 12` is handed to `Run` as the struct pointer. The `uint8_t buf[]` has no alignment guarantee, so 4-byte alignment of the struct is not guaranteed on every compiler. All handlers also share one mutable buffer, so one handler that writes to it changes what the next handler sees.
**Fix:** Declare `buf` with `_Alignas(8)` or inside a union with uint64_t. Copy the param to a fresh scratch buffer per target.

### IN-03: Registry throttle and failure state is not reset by Shutdown

**File:** `meta/gen_vtables.ts` (`gl_cb_clear_all`)
**Issue:** `gl_cb_clear_all` resets the table but not `gl_cb_fail_count`, `gl_cb_have_drained` or `gl_cb_overflow`. After Shutdown and re-Init, the 1000 ms backoff from an earlier failure run carries over.
**Fix:** Reset those fields inside `gl_cb_clear_all`.

### IN-04: Constants duplicated between the generator and the helper header

**File:** `meta/gen_vtables.ts:846-856`, `gamelib_cbqueue.h:28-31`
**Issue:** 2572, 2584 and the id 168 are hard-coded in both places. A cross-pin test is mentioned, but nothing in the C side asserts it.
**Fix:** Keep the cross-pin test and add `_Static_assert(GL_CBQ_DRAIN_RESP_MAX_BYTES == 2584, ...)` in the helper header.

### IN-05: The layout-dump parser's record regex is not bounded to the CCallbackBase record

**File:** `meta/msvcCallbackLayout.ts:62-65`
**Issue:** `Type: class CCallbackBase\n[\s\S]*?FieldOffsets: \[...\]` has no bound. If the CCallbackBase record lacks a FieldOffsets line, it silently picks up a later record's offsets. The generator also consumes the hard-coded constants and never the parsed values, so the guard exists only in tests.
**Fix:** Bound the match at the next `Type:` or `*** Dumping` boundary. Keep the test that compares the constants to the dump.

---

_Reviewed: 2026-10-26T00:02:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
