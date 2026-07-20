---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 02
subsystem: infra
tags: [steam, macos, bridge, native-helper, tcp, loopback, wire-protocol, dlopen, thiscall, steam_api, c]

# Dependency graph
requires:
  - phase: 24-01
    provides: "meta/gen_vtables.ts + committed native/steam-bridge/generated/steam_api_shim.c whose bridge_transact() framing this plan's protocol.ts and helper match byte-for-byte (ordinal/slot/wire layout)"
provides:
  - "src/backend/storeManagers/steam/bridge/protocol.ts -- TS-side encode/decode of the shared binary wire frame (24-RESEARCH.md Pattern 3), imported by the 24-06 readiness probe"
  - "CONTROL frame (HEALTH + WHOAMI) definition -- two-state readiness contract (process-up vs init-succeeded) the 24-06 probe consumes (review finding #7)"
  - "native/steam-bridge/helper/bridge_helper.c -- R2 persistent-channel, loopback-only, init-once native arm64 host helper (D-03/D-04), compiled at packaging time by Plan 24-07"
  - "MAX_FRAME_BYTES=65536 wire cap, single-sourced across the TS decoder and the C read loop (T-24-03)"
affects: [24-06-readiness-probe, 24-07-packaging-helper, 24-10-hardware-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Binary wire frame with a self-excluding 4-byte LE length prefix + request_id correlation, defined once in protocol.ts and matched byte-for-byte by the C on both ends (shim bridge_transact + helper read loop)"
    - "Two-state CONTROL readiness (HEALTH pre-init / WHOAMI post-live-init) reconciling spike 005b's PING/WHOAMI text handshake into the binary protocol"
    - "Persistent-connection C read loop that bounds an inbound frame's DECLARED length against MAX_FRAME_BYTES BEFORE reading the body into a fixed-size (never attacker-sized) static buffer"

key-files:
  created:
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - native/steam-bridge/helper/bridge_helper.c
  modified: []

key-decisions:
  - "protocol.ts's frame layout was reverse-validated against the ALREADY-committed generated shim (native/steam-bridge/generated/steam_api_shim.c bridge_transact()), not just the RESEARCH prose -- guaranteeing the TS decoder and the live wire agree byte-for-byte"
  - "The helper does NOT exit() on InitFlat failure (deliberate divergence from spike 005b, which returns non-zero) -- it degrades to serving CONTROL HEALTH ok / WHOAMI not-inited so the 24-06 probe can observe 'process up' separately from 'init succeeded' (finding #7)"
  - "MAX_FRAME_BYTES=65536 single-sourced conceptually across both ends; the C helper uses it to size a fixed static argument buffer so an inbound frame is bounds-checked before any recv() into it (T-24-03) -- never a variable-size allocation from attacker input"
  - "The helper writes its own steam_appid.txt=480 in the working directory (D-04 identity resolution) rather than assuming the packaging step placed it, so single-InitFlat identity never silently fails with 'No appID found'"

patterns-established:
  - "Wire-frame source of truth lives in protocol.ts (TS, testable, no native dep) AND is spoken verbatim by C on both ends -- the TS module documents+validates, the C implements"
  - "FrameTooLargeError / FrameTruncatedError distinguish an oversized declared length (reject before allocating) from a short buffer (report incomplete, never silently accept)"

requirements-completed: [R2]

# Metrics
duration: ~20min
completed: 2026-07-20
---

# Phase 24 Plan 02: macOS Native Steam Bridge -- Native Helper + Wire Protocol Summary

**A persistent, loopback-only, init-once native arm64 host helper (`bridge_helper.c`) that `dlopen`s the real `libsteam_api.dylib` once and proxies the live signed-in Mac Steam's identity over a single TCP connection, plus `protocol.ts` -- the TS-side encode/decode of the shared binary wire frame (with a CONTROL HEALTH/WHOAMI two-state readiness contract and a MAX_FRAME_BYTES cap), 21 tests green.**

## Performance

- **Duration:** ~20 min (including post-crash closeout)
- **Started:** 2026-07-20T04:49:32Z (after 24-01 completion)
- **Completed:** 2026-07-20T04:58:00Z (task commits) + closeout
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments

- **`protocol.ts`** (Task 1): pure, dependency-free encode/decode of the Pattern-3 binary frame — `encodeRequest`/`decodeRequest`, `encodeResponse`/`decodeResponse`, and an `encodeControl(requestId, slot)` helper — plus the `INTERFACE_ORDINAL` map (flat=0/user=1/friends=2, matching the 24-01 generator), the reserved `CONTROL_ORDINAL` (0xFFFF) with `health`/`whoami` slots (review finding #7), and a `MAX_FRAME_BYTES=65536` cap enforced before any body allocation (T-24-03). Layout reverse-validated against the already-committed generated shim's `bridge_transact()` framing.
- **`protocol.test.ts`** (Task 1): 21 tests covering request/response round-trip (byte-for-byte), oversized-frame rejection (`FrameTooLargeError`, asserted from a 4-byte header alone so no allocation past the cap), truncated-frame rejection (`FrameTruncatedError`), the exact-`MAX_FRAME_BYTES` boundary case, ordinal/slot mapping, and CONTROL HEALTH (process-up ok) vs WHOAMI (init-succeeded ok+raw-SteamID64-bytes / not-inited err) distinguishability.
- **`bridge_helper.c`** (Task 2): D-03 persistent-channel upgrade of spike 005b's connect-per-call server — single `dlopen` (canonical `$HOME`-derived path, T-24-SC), single `SteamAPI_InitFlat` before the bind/listen/accept loop (D-04, no AppID param), held `ISteamUser`/`ISteamFriends` accessor pointers for process lifetime, `INADDR_LOOPBACK`-only bind (T-24-01), a persistent per-connection read loop serving ≥2 sequential requests without re-init, and the CONTROL HEALTH/WHOAMI two-state readiness handlers. Syntax-checked clean with `clang -fsyntax-only -Wall -Wextra` (0 warnings).

## Task Commits

Each task was committed atomically:

1. **Task 1: protocol.ts — shared wire-frame encode/decode + bounds + CONTROL** - `54646dd6` (feat)
2. **Task 2: bridge_helper.c — persistent, loopback-only, init-once native helper** - `071145ed` (feat)

_Note: Task 1 was `tdd="true"`; test + implementation landed together as a single feat commit (the frame layout was validated against the pre-existing generated shim, so RED/GREEN collapsed into one structural-assertion commit consistent with 24-01's precedent)._

## Files Created/Modified

- `src/backend/storeManagers/steam/bridge/protocol.ts` — TS definition + pure encode/decode of the binary wire frame; frame constants, ordinal/CONTROL maps, MAX_FRAME_BYTES cap, `FrameTooLargeError`/`FrameTruncatedError`.
- `src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts` — 21 round-trip / bounds / truncation / CONTROL tests.
- `native/steam-bridge/helper/bridge_helper.c` — the R2 native arm64 host helper (persistent, loopback-only, init-once), compiled later in Plan 24-07.

## Decisions Made

- **Frame layout reverse-validated against the committed generated shim** (`native/steam-bridge/generated/steam_api_shim.c` `bridge_transact()`), not just RESEARCH prose — the response header is `[4B len][4B request_id][1B status]` (9 bytes) and `len` excludes itself; `protocol.ts` and the helper both match this exactly so the TS decoder and the live wire never diverge.
- **Helper degrades instead of exiting on InitFlat failure** (divergence from spike 005b): it keeps serving CONTROL HEALTH ok and WHOAMI not-inited when Steam is not running/signed-in, so the 24-06 probe can distinguish "process up" from "init succeeded against a live session" (finding #7). A `g_inited` flag gates every identity-bearing slot and WHOAMI; HEALTH is unconditional.
- **Helper writes its own `steam_appid.txt`=480** in the working directory (D-04) rather than assuming packaging placed it — single-InitFlat identity resolution never silently fails.
- **`MAX_FRAME_BYTES`=65536** is the shared cap; the C helper sizes a fixed static argument buffer to it and bounds-checks the declared length before any `recv()` into it (T-24-03), so no attacker-controlled-size allocation/read is ever possible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded two C comments so the plan's own `<verify>` grep for `INADDR_ANY`-absence passes**
- **Found during:** Task 2 (bridge_helper.c)
- **Issue:** The plan's automated verify is `grep -q INADDR_LOOPBACK ... && ! grep -q INADDR_ANY ...`. Two explanatory comments I wrote contained the literal string `INADDR_ANY` (as in "never INADDR_ANY"), which would have made the plan's own acceptance grep fail even though the code binds loopback-only.
- **Fix:** Reworded both comments to "never a routable/all-interfaces bind" — same meaning, no literal `INADDR_ANY` token anywhere in the file.
- **Files modified:** `native/steam-bridge/helper/bridge_helper.c`
- **Verification:** `grep -q INADDR_LOOPBACK ... && ! grep -q INADDR_ANY ... && grep -c InitFlat ...` now prints "loopback-only, init present"; `clang -fsyntax-only -Wall -Wextra` still 0 warnings.
- **Committed in:** `071145ed` (Task 2 commit)

**2. [Rule 3 - Blocking] BigInt literal → `BigInt('...')` in the test for the project's TS target**
- **Found during:** Task 1 (protocol.test.ts)
- **Issue:** `pnpm codecheck` (`tsc --noEmit`) failed with TS2737 "BigInt literals are not available when targeting lower than ES2020" on the `76561197995867096n` SteamID64 round-trip assertion.
- **Fix:** Replaced the two `...n` BigInt literals with `BigInt('76561197995867096')` — identical value, compatible with the project's TS target.
- **Files modified:** `src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts`
- **Verification:** `pnpm codecheck` clean; all 21 protocol tests still green.
- **Committed in:** `54646dd6` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking). Neither changed behavior; both were mechanical fixes so the plan's own verify/codecheck gates pass.
**Impact on plan:** No scope creep. Both fixes were required for this plan's own `<verify>` and `pnpm codecheck` gates to pass.

## Issues Encountered

- The prior execution turn was cut off by an API "Connection closed mid-response" error after the two task commits landed. Both commits (`54646dd6`, `071145ed`) survived on disk with a clean working tree; this closeout wrote the SUMMARY and tracking updates only — no task code was re-run or re-committed.
- Pre-existing, out-of-scope: `pnpm jest src/backend/storeManagers/steam` prints a `library.ts:1033` leaked-timer `TypeError` during teardown (known `readAcfState`/`getSteamLibraries` poller-timer issue tracked in project memory `steam-install-slow-start-outcome`). It is unrelated to this plan's files and does not fail the suite — all 729 steam-backend tests pass, including the 21 new protocol tests.

## Known Stubs

None that block this plan's goal. The helper serves exactly the identity surface this phase's acceptance set needs (`ISteamUser::GetSteamID`/`BLoggedOn`, `ISteamFriends::GetPersonaName`, CONTROL HEALTH/WHOAMI); any other ordinal+slot answers a clean `STATUS_ERR` rather than hanging — the broader API/callback surface is the tracked follow-up per 24-RESEARCH.md Pattern 1, not a placeholder in this plan's scope. The flat-ordinal (0) path is marshaled client-side by the generated shim's own stubs (24-01), not served over the wire here by design.

## Threat Flags

None beyond the plan's own threat register. T-24-01 (loopback-only bind) and T-24-03 (MAX_FRAME_BYTES cap in both the TS decoder and the C read loop) are mitigated as specified and asserted (verify grep + tests). T-24-02 (unauthenticated localhost peers) and T-24-16 (fixed loopback port) remain the plan's documented **accepted** residual risks for secure-phase — this plan did not silently expand scope to add a handshake/nonce no locked decision calls for.

## User Setup Required

None — no external service configuration and no package installs (0 new npm dependencies).

## Next Phase Readiness

- **`protocol.ts` is ready for the 24-06 readiness probe** to import: it can encode CONTROL HEALTH/WHOAMI request frames and decode the helper's responses (process-up vs init-succeeded) with no native dependency.
- **`bridge_helper.c` is source-complete and syntax-clean** — Plan 24-07 compiles it with `clang` to `public/bin/arm64/darwin/steam-bridge-helper`.
- **Explicitly NOT proven by this plan** (R2's human-HW acceptance rows, deferred to 24-10 on the developer's Apple-Silicon Mac): that the helper actually inits against a LIVE signed-in Mac Steam and round-trips the REAL SteamID64/persona, and that a real bottle client serves ≥2 sequential requests end-to-end. This plan delivers R2's automated + structural rows (loopback-only bind asserted, single InitFlat structurally before the accept loop, frame bounds tested); REQ-24-02 is source/structural-complete with the live round-trip gated to 24-10, mirroring 24-01's runtime-deferral posture.

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-20*

## Self-Check: PASSED

- Created files verified present on disk: `src/backend/storeManagers/steam/bridge/protocol.ts`, `src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts`, `native/steam-bridge/helper/bridge_helper.c` — all FOUND.
- Commit hashes verified in `git log`: `54646dd6` (Task 1) FOUND, `071145ed` (Task 2) FOUND.
- Automated verify re-run: `pnpm jest .../protocol.test.ts` → 21/21 pass; helper grep → "loopback-only, init present"; `pnpm codecheck` → clean.
