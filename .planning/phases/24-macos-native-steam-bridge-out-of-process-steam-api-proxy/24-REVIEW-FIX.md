---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
fixed_at: 2026-07-20T21:01:12Z
review_path: .planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 6
skipped: 1
status: partial
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-07-20T21:01:12Z
**Source review:** .planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (2 Critical/BLOCKER, 5 Warning; IN-01/IN-02 intentionally out of scope per instructions)
- Fixed: 6
- Skipped: 1 (WR-01, needs human/hardware-UAT judgment)

**Both gate-blocking findings (CR-01, CR-02) are FULLY RESOLVED.**

## Fixed Issues

### CR-01: `GetPersonaName` wire contract disagrees between helper and shim (returns garbage pointer or NULL)

**Files modified:** `meta/gen_vtables.ts`, `native/steam-bridge/generated/steam_api_shim.c`
**Commit:** `1e744d20`
**Applied fix:** Added an `isStringReturn()` predicate and a dedicated marshaling branch in `emitVtableStub()` (the source of truth for the generated shim) that routes any `const char*`-returning method away from the generic <=8-byte register-return path. The new branch: (1) sizes a per-stub `retbuf` at `STRING_RETURN_BUF_BYTES - 1` (255) bytes so `bridge_transact()` can actually receive the full persona-name string instead of rejecting it at the old 4-byte cap; (2) copies the received bytes into a shim-owned `static char <funcname>_buf[STRING_RETURN_BUF_BYTES]` and NUL-terminates it; (3) returns a pointer into that shim-owned buffer -- matching how the real Steamworks `GetPersonaName` returns a pointer to SDK-internally-owned memory, never a raw remote pointer. On any `bridge_transact` failure it now falls back to a safe empty string rather than a garbage/uninitialized-stack dereference. `STRING_RETURN_BUF_BYTES` (256) is emitted into the generated `.c` file's own `#define` so the generator and the generated source can never drift. Regenerated the committed `native/steam-bridge/generated/steam_api_shim.c` via `pnpm gen-vtables` so the fix ships in the actual served file, not just the generator. `bridge_helper.c`'s `GetPersonaName` handling (lines 354-364) needed no change -- it already sends the raw string bytes with length correctly implied by the response frame's own length field; the defect was entirely in the shim-side marshaling.
**Verification:** `tsc --noEmit` clean; `meta/__tests__/gen_vtables.test.ts` + `meta/__tests__/buildSteamBridgeShims.test.ts` + `src/backend/storeManagers/steam/bridge/__tests__/*` all pass (103/103); `clang -fsyntax-only -Wall -Wextra` on the regenerated `steam_api_shim.c` against stub Winsock headers reports zero errors (one pre-existing, unrelated `/*` doc-comment warning at line 4).
**Note:** logic-bearing fix (wire marshaling correctness) -- recommend human verification against a real running bridge game at hardware-UAT time per the phase's existing deferred-UAT pattern, though the fix follows the exact mechanism the review's own Fix guidance specified.

### CR-02: Shim coverage-validation set omits the interface accessor exports, so any interface-using game is wrongly rejected

**Files modified:** `src/backend/storeManagers/steam/bridge/shimGenerate.ts`
**Commit:** `934e51a0`
**Applied fix:** Added `'SteamAPI_SteamUser_v023'` and `'SteamAPI_SteamFriends_v018'` to `SHIM_EXPORTED_SYMBOLS`, matching `native/steam-bridge/generated/steam_api.def` exactly (verified byte-for-byte against the committed `.def`). Updated the preceding comment to document the full 12-symbol set and explicitly warn that an SDK bump/new interface accessor must update this list in the same review pass (CR-02's own root cause), preserving the existing manual-sync convention rather than replacing it with a cross-tree import (blocked by `tsconfig.json`'s `src`-only `include`, as the original comment already noted).
**Verification:** `tsc --noEmit` clean; `shimGenerate.test.ts` (9/9) passes unchanged.

### WR-02: No recv/idle timeout — a partial or stalled frame wedges the entire shared helper

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`
**Commit:** `c44a167d`
**Applied fix:** Set `SO_RCVTIMEO` (5 seconds, `RECV_TIMEOUT_SECONDS`) on every accepted socket in `main()`'s accept loop, before calling `serve_connection()`. `recv_all()`'s new EINTR-vs-terminal-error split (WR-05) already treats the resulting `EAGAIN`/`EWOULDBLOCK` as terminal (not retried), so a stalled/partial-frame connection now closes after 5s instead of blocking forever. 5s was chosen to comfortably exceed real request latency (`pump_callbacks()` alone sleeps up to 150ms) while still bounding a genuine stall.

### WR-03: `send()` without SIGPIPE suppression — a peer disconnect can kill the shared helper process

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`
**Commit:** `c44a167d`
**Applied fix:** Added `signal(SIGPIPE, SIG_IGN);` as the first statement in `main()`, before any socket I/O. A `send()` to an already-closed peer now returns `-1`/`EPIPE` (handled as an ordinary terminal error by `send_all()`) instead of raising SIGPIPE and killing the whole shared process.

### WR-04: Interface accessors are called before `InitFlat` success is confirmed

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`
**Commit:** `c44a167d`
**Applied fix:** `init_steam_api_once()` now only calls `GetUser()`/`GetFriends()` when `InitFlat` returned `0`; on failure `g_user`/`g_friends` stay `NULL` and `g_inited` is correctly derived as `false`, exactly as the review's suggested fix specified.

### WR-05: `recv_all`/`send_all` treat `EINTR` as a fatal connection close

**Files modified:** `native/steam-bridge/helper/bridge_helper.c`
**Commit:** `c44a167d`
**Applied fix:** Both loops now distinguish `k < 0 && errno == EINTR` (retried, `continue`) from `k == 0` (real EOF, terminal) and any other negative-`k` error (terminal). `#include <errno.h>` added.

**Combined verification for WR-02/03/04/05:** `clang -fsyntax-only -Wall -Wextra -Wpedantic` on `bridge_helper.c` (compiled against real macOS system headers, the file's actual target) reports zero warnings/errors, before and after. `tsc --noEmit` clean (no TS files touched by this commit). `pnpm jest src/backend/storeManagers/steam --silent`: 802/805 pass; the 3 failures are the pre-existing `library.ts:1033` cross-file timer-leak issue (documented in project memory), reproduced by running `helperProcess.test.ts` alongside `library.test.ts` in the same worker -- `helperProcess.test.ts` run in isolation is 9/9 green, confirming no regression from this commit.

## Skipped Issues

### WR-01: Single-threaded helper serializes connections — a second bridge game (and its readiness probe) is starved and refused

**File:** `native/steam-bridge/helper/bridge_helper.c:384-421, 451-455`
**Reason:** skipped-needs-human -- architecturally uncertain, cannot be safely resolved without live hardware verification.

The review's Fix section offers two paths: (a) full concurrent connection service (thread/select/poll per connection), or (b) at minimum, keep single-connection-at-a-time but surface a clear "busy" reason instead of a silent timeout.

Path (a) was rejected: this helper calls into the real `libsteam_api.dylib` (`RunCallbacks`, `GetSteamID`, `BLoggedOn`, `GetPersona`) from whatever thread invokes `dispatch_and_respond()`. The Steamworks SDK's general threading contract requires the flat/callback API to be driven from a single, consistent thread; genuinely servicing two connections concurrently via `pthread`-per-connection would call these functions from multiple OS threads simultaneously, which is a correctness risk I cannot verify without a live dual-bridge-game hardware scenario (no Steam client, no real `libsteam_api.dylib`, and no way to exercise two simultaneous bridge games are available in this environment). Introducing thread-safety bugs into a Steamworks-calling process is exactly the kind of "plausible-but-wrong" change the task instructions say not to force.

A `poll()`/`select()`-based single-threaded event loop (still one thread driving Steamworks, but multiplexed I/O across multiple accepted connections) would avoid the threading risk, but requires converting the current blocking `recv_all`/`serve_connection` read loop into a resumable partial-frame state machine per connection -- a substantial rewrite of the connection-handling core that I judged too large and too unverifiable-without-hardware to apply confidently in this pass (the 3-tier verification strategy available here -- re-read, syntax-only compile, existing Jest suites -- cannot exercise actual concurrent-socket behavior).

Path (b) alone (reject a second connection immediately with a clear "busy" log/status instead of letting it sit unaccepted in the backlog) was considered but is not achievable as a small, safe patch either: in the current fully-blocking single-threaded model, `accept()` in `main()`'s loop does not run again until `serve_connection()` for the FIRST connection returns -- so the process literally cannot accept, and therefore cannot even inspect or reject, a second connection while the first is active. Implementing even the "reject fast" fallback requires the same non-blocking/`poll()`-based accept loop as path (a)'s I/O layer, just without the concurrent-dispatch risk.

**Recommendation:** Treat as a follow-up implementation task validated against real hardware (a poll()-based single-threaded multiplexer that still serializes all Steamworks calls onto the one thread, i.e. path (a)'s I/O model without its threading risk), consistent with the phase's existing pattern of deferring native-bridge behavioral verification to hardware-UAT (per project memory: Phase 21/23 native-install UAT items).

---

_Fixed: 2026-07-20T21:01:12Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
