---
phase: 58-steam-bridge-multiplayer
fixed_at: 2026-11-01T00:00:00Z
review_path: .planning/phases/58-steam-bridge-multiplayer/58-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 58: Code Review Fix Report

**Fixed at:** 2026-11-01
**Source review:** .planning/phases/58-steam-bridge-multiplayer/58-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01..WR-05; IN-01 and IN-02 are out of scope for `critical_warning`)
- Fixed: 5
- Skipped: 0

Verification for every fix: `pnpm build-steam-bridge` (native helper plus both shim compile gates) passed. The jest suites under `src/backend/storeManagers/steam/bridge`, plus `meta/__tests__/buildSteamBridgeShims.test.ts` and `src/frontend/state`, passed: 61 suites, 1660 tests, 3 skipped. `npx prettier --check` passed on every TS path edited.

## Fixed Issues

### WR-01: Picker trigger is a log line that the helper caps at 16 per process

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`, `src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts`, `src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c`
**Commit:** 3c76c1cf5, e2ac4e8a5 (test update)
**Applied fix:** Removed `GL_INVITE_DIALOG_LOG_MAX`. The `INVITE dialog appid=` line now fires on every call that clears the 2 s gap. The gap and the backend's 2 s debounce still bound the volume. The harness test now expects 41 lines (1 for the burst plus 40 spaced calls) instead of 16.

### WR-02: Unauthenticated or slow connections can exhaust the 16-slot table

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`, `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts`
**Commit:** 98aa57699
**Applied fix:** Added `acceptedSec` per connection. A connection that has not authenticated is closed `GL_AUTH_DEADLINE_SECONDS` (5 s) after accept, even if it keeps trickling bytes. When the table is full, the oldest unauthenticated slot is evicted to make room. Authenticated slots are never evicted, and "connection table full" is logged only when all 16 slots are authenticated. All three legitimate clients send HELLO right after connecting: the shim's `bridge_handshake`, the backend probe (HEALTH then HELLO) and the invite client. The old cap integration test is replaced by three tests: eviction, a table where every slot is authenticated, and a trickle client closed 4-7 s after accept.

### WR-03: A blocking send in the single-threaded loop stalls every connection and the Steam pump

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`
**Commit:** 4bb27b5fe
**Status:** fixed: requires human verification
**Applied fix:** This is the review's "smaller step", not a POLLOUT redesign. `SO_SNDTIMEO` drops from 5 s to 250 ms (`GL_SEND_TIMEOUT_USEC`). `SO_SNDBUF` is raised to at least 2 x (4 + `MAX_FRAME_BYTES`) when the default is smaller. The largest reply is about 61 KB and fits in an empty send buffer. Every legitimate client reads each reply before sending its next request, so a send only blocks when a peer lets replies pile up unread. That peer is now dropped after 250 ms through `send_all`'s existing EAGAIN close path. With WR-02 in place, unauthenticated peers only ever get tiny replies, so a stall also requires the launch secret. **Human check:** confirm on a live bridge session (Wine game plus invite path) that no slow-reading legitimate client is dropped. No automated test reproduces a stalled reader, because a large reply needs live Steam.

### WR-04: Friend ordinals are re-assigned on every list call, so a stale picker can invite the wrong friend

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`, `src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c`, `src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts`, `src/common/types/steam.ts`
**Commit:** 56f46ff7a
**Status:** fixed: requires human verification
**Applied fix:** The wire `ordinal` is now an opaque per-snapshot token, `(generation << 8) | index`. Each `gl_invite_list_friends` call increments a 24-bit generation that skips 0, so a bare index is never valid. `gl_invite_send` returns `GL_INVITE_BAD_ORDINAL` when the generation does not match. A `_Static_assert` keeps `GL_INVITE_FRIENDS_MAX` within the 8-bit index field. SteamIDs stay inside the helper. No TS wire change was needed: the ordinal was already an opaque u32 from the sidecar validation through `inviteBridge.ts` to the UI, where it is only a key and a pass-back value. The `BridgeFriend` doc comment now says this. New harness cases cover a stale token, a bare index (both refused) and a current token (sent to the correct friend). **Human check:** one live picker invite to confirm the token round-trips through the UI unchanged.

### WR-05: `INVITE dialog` regex is unanchored, so any log line containing the text triggers the picker

**Files modified:** `src/backend/storeManagers/steam/bridge/helperProcess.ts`, `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts`
**Commit:** 0453435c9
**Applied fix:** `INVITE_DIALOG_LINE` is now `/^\[[^\]]*\] INVITE +dialog appid=(\d+)\r?$/`, which matches the whole line `logts` writes (`[%s] %-6s %s`). A new test checks that the text embedded inside another category's line, or appearing without the timestamp prefix, causes no push and no raise.

---

_Fixed: 2026-11-01_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
