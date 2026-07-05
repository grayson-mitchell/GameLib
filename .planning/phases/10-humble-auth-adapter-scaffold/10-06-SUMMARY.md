---
phase: 10-humble-auth-adapter-scaffold
plan: 06
subsystem: auth
tags: [humble, axios, zod, electron-session, webview, validation-gate]

# Dependency graph
requires:
  - phase: 10-05
    provides: embedded /loginweb/humble WebView login surface (retired popup + HumbleConnect)
provides:
  - runHumbleValidation() with identity demoted to advisory (D-13 revised); overall verdict computed from gamekeys + order-detail + steamAppIdPresent only
  - Live-account PASS on axios transport (Cookie + X-Requested-By: hb_android_app) — no ses.fetch() fallback needed
  - Corrected gamekeys zod schema (order-summary array shape) with self-diagnosing schema_error logging
  - Frontend isLoggedIn wired end-to-end as the Humble connected flag, independent of the best-effort username fetch
  - 10-VALIDATION.md recorded as the canonical, redacted Phase 11 reference (Nyquist strategy + live-gate report, dual-purpose file)
affects: [phase-11-library-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Advisory endpoint pattern: HumbleValidationEndpointResult.advisory flag lets a non-critical endpoint (account identity) be recorded in a report without ever flipping the overall pass/fail verdict"
    - "Connected-state flag independent of best-effort profile data: frontend gates 'is this account connected' on a boolean (isLoggedIn), never on optional profile fields like username, so UI does not silently break when a profile endpoint is unavailable"

key-files:
  created: []
  modified:
    - src/common/types/humble.ts
    - src/backend/humble/validation.ts
    - src/backend/humble/adapter.ts
    - .planning/phases/10-humble-auth-adapter-scaffold/10-VALIDATION.md

key-decisions:
  - "D-13 revised confirmed correct in practice: the Humble identity endpoint (/api/v1/user/info) hard-404s on the real account tested; had identity remained a hard gate criterion, Phase 10 would never have passed"
  - "D-14 revised fallback (ses.fetch on persist:humble) was prepared but not activated — axios reached the live Humble API successfully on the first clean run after the schema fix, so the fallback seam stays dormant for now"
  - "Frontend connected-state must never be gated on optional profile fields (username) — only on the backend's isLoggedIn boolean; this was the actual root cause of the Task 2 UAT failure, not a login/auth failure"

requirements-completed: [HACCT-01, HACCT-02, HACCT-03]

# Metrics
duration: ~55min (including two checkpoint re-issue cycles for real-account bugs)
completed: 2026-07-05
---

# Phase 10 Plan 06: Live Validation Gate + Full HACCT UX UAT Summary

**Live Humble API gate passes on axios (Cookie + X-Requested-By) with identity demoted to advisory; full HACCT-01/02/03 UX verified end-to-end on a real account through the embedded WebView, closing two real-account bugs found only under live UAT (gamekeys schema mismatch, tile never flipping to "Connected").**

## Performance

- **Duration:** ~55 min across three checkpoint cycles (Task 1 auto + two UAT re-runs with fixes)
- **Started:** 2026-07-05T17:27:09+12:00
- **Completed:** 2026-07-05 (checkpoint approved: "all steps passed, validation gate reports PASS")
- **Tasks:** 2 (1 auto, 1 checkpoint:human-verify — required two auto-fix cycles before final approval)
- **Files modified:** 4 (2 source, 1 type, 1 validation doc) across Task 1 + two fix commits, plus this Summary and VALIDATION.md

## Accomplishments

- D-13-revised live validation gate confirmed PASS on a real Humble Bundle account: gamekeys retrieval (200), order-detail retrieval (200), and `steam_app_id` presence in `tpkd_dict.all_tpks` all passed, with the account-identity endpoint correctly demoted to advisory (it hard-404s and cannot fail the gate).
- Full HACCT-01/02/03 UX verified through the new embedded `/loginweb/humble` WebView: login (email/password + reCAPTCHA + Humble Guard), silent cancel, persistence across relaunch, live gate PASS, expiry → reconnect, and disconnect with session wipe.
- Confirmed axios (with `Cookie` + `X-Requested-By: hb_android_app`) as the working transport from Electron main — the D-14-revised `ses.fetch()` fallback was prepared but never needed.
- Found and fixed two real-account-only bugs during UAT re-runs (see Deviations) that would not have surfaced from unit tests alone.
- `10-VALIDATION.md` now stands as the canonical, redacted Phase 11 reference: original Nyquist "Phase 10 — Validation Strategy" frontmatter/header preserved, with an appended "Live Validation Gate (D-12 / D-15)" section recording the full redacted result.

## Task Commits

1. **Task 1: Demote identity to advisory in the gate, and prepare the ses.fetch transport fallback seam** - `1aee0d07` (feat)
2. **Task 2: Live validation gate + full HACCT UX UAT (checkpoint)** - two auto-fix cycles were required before the checkpoint could be approved:
   - Fix 1 (gamekeys schema mismatch, found in first UAT re-run): `c782983b` (fix)
   - Fix 2 (tile never flipped to "Connected", found in second UAT re-run): `e2236bc1` (fix)
   - Checkpoint state recorded at each pause: `1bf77db9`, `b875cb9d`, `4d8b1aac`

**Plan metadata:** (this commit — docs: complete plan)

_Note: Task 2 is a `checkpoint:human-verify` gate, not a standard auto task — its "commits" are the fixes discovered and resolved during the live UAT loop, all captured above._

## Files Created/Modified

- `src/common/types/humble.ts` - Added `advisory?: boolean` to `HumbleValidationEndpointResult`; narrowed `HumbleValidationReport.transport` to `'axios' | 'session-fetch'`
- `src/backend/humble/validation.ts` - `runHumbleValidation()` overall verdict now computed from gamekeys + order-detail + `steamAppIdPresent` only; identity endpoint always pushed with `advisory: true`; gamekeys zod schema corrected to the real order-summary array shape; self-diagnosing `schema_error` logging added (redacted — status/shape only, never body/cookie values)
- `src/backend/humble/adapter.ts` - `humbleRequest` kept axios as primary transport; refactored to leave the same-signature seam ready for a `ses.fetch()` swap (never activated — axios worked)
- `src/frontend/**` (GlobalState + Login screen, see `e2236bc1`) - `isLoggedIn` threaded through as the Humble connected-state flag (initial state, `humbleLogin`, `handleHumbleAuthState`, `humbleDisconnect`, startup health-check gate) so the Manage Accounts tile flips to "Connected" independent of the best-effort username fetch (D-02 fallback wired end-to-end)
- `.planning/phases/10-humble-auth-adapter-scaffold/10-VALIDATION.md` - Nyquist strategy frontmatter/header preserved (`status: approved`); Per-Task Verification Map, Wave 0, and Manual-Only sections filled with real Phase 10 values; new "Live Validation Gate (D-12 / D-15)" section appended recording the redacted PASS result, fix history, and the identity-endpoint known limitation

## Decisions Made

- D-13 revised (identity advisory, not a hard gate criterion) proved necessary in practice, not just in theory: the real account's identity endpoint hard-404s every time, and the gate still needed to pass on gamekeys + order-detail + steam_app_id alone.
- The D-14-revised `ses.fetch()` fallback stays dormant — axios is the validated transport for this phase and for Phase 11 to build on. The seam remains in `adapter.ts` in case future Humble-side changes block axios.
- Frontend "connected" state must be derived from an explicit `isLoggedIn` boolean, never from the presence of an optional profile field like `username` — this generalizes past just Humble and is the correct pattern for any adapter whose identity endpoint may be unavailable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gamekeys schema mismatch caused every live gate run to fail with `schema_error`**
- **Found during:** Task 2, first live UAT re-run
- **Issue:** The zod schema for `/api/v1/user/order` did not match the real Humble response shape (an order-summary array), so every real gamekeys fetch failed schema validation even though the HTTP call itself succeeded.
- **Fix:** Corrected the schema to the real order-summary array shape; added self-diagnosing `schema_error` logging (redacted — logs status/shape mismatch only, never cookie or response body values) to speed diagnosis of any future schema drift.
- **Files modified:** `src/backend/humble/validation.ts` (and the underlying schema in the adapter/types layer)
- **Verification:** Re-ran the live gate; gamekeys endpoint returned `status: 'ok'` with schema valid.
- **Committed in:** `c782983b`

**2. [Rule 1 - Bug] Manage Accounts tile never flipped to "Connected" after a valid login**
- **Found during:** Task 2, second live UAT re-run
- **Issue:** Login via the embedded WebView completed successfully (cookie stored, session valid), but the tile continued to show "Humble Bundle Login" instead of a connected state. Root cause: the frontend's connected-state check (`GlobalState`, Login screen) was gated on `username`, which is always `undefined` for this account because the identity endpoint 404s — the D-02 generic-"Connected" fallback was designed but never actually wired into the connected-state check.
- **Fix:** Threaded the backend's `isLoggedIn` flag through `GlobalState` (initial state, `humbleLogin`, `handleHumbleAuthState`, `humbleDisconnect`, the startup health-check gate) and the Login screen's `isHumbleLoggedIn` check + tile user prop, with a "Connected" i18n fallback when no username is present.
- **Files modified:** Frontend `GlobalState` and Login screen components (see commit for exact paths)
- **Verification:** Re-ran the full login UAT; tile correctly flipped to "Connected" immediately after a successful login with no username available.
- **Committed in:** `e2236bc1`

---

**Total deviations:** 2 auto-fixed (2 bugs, both Rule 1, both found only under real-account UAT — neither was catchable by the Plan 01 adapter unit tests, which mock the transport layer and do not exercise the real Humble response shape or the full frontend connected-state wiring)
**Impact on plan:** Both fixes were necessary for HACCT-01/02/03 correctness. No scope creep — both are direct bugs in code delivered by this plan and its predecessor (10-05), not new features.

## Issues Encountered

- The live validation gate required two checkpoint re-issue cycles before final approval — each cycle surfaced a real bug that only manifested against the actual Humble API / actual UI state, not against unit-test mocks. This is expected and by design for a `checkpoint:human-verify` gate whose entire purpose is to catch exactly this class of issue before Phase 11 builds on an unproven transport.
- No log-level record of the final PASS validation report exists in `~/Library/Logs/GameLib/gamelib.log` — the report is only surfaced via the dev-only IPC call to devtools console (by design, to avoid ever writing potentially sensitive redacted-but-structured data to a persistent log file). The PASS result is recorded here and in `10-VALIDATION.md` based on the user's direct confirmation of the devtools output.

## User Setup Required

None - no external service configuration required. The dev-only validation trigger requires no setup beyond a running dev build and a connected real Humble account (already true for this phase's own UAT).

## Next Phase Readiness

- Phase 11 (Library Sync + 5-State Key Model) can now build on a **proven** transport: axios reaches the live Humble API from Electron main with the real stored cookie, gamekeys and order-detail endpoints both return real, schema-valid data including `steam_app_id`.
- **Known limitation carried forward:** the Humble account-identity endpoint is unreliable (hard 404 on the tested account). Any future work wanting to display a real Humble username will need a different identity source — this is out of scope for HACCT-01/02/03 and is not a blocker for Phase 11's library-sync work, which does not depend on identity.
- `10-VALIDATION.md` is now the canonical redacted reference other Phase 11 planning can cite for "is the Humble transport proven" — no further live-gate work is needed before Phase 11 planning begins.

---
*Phase: 10-humble-auth-adapter-scaffold*
*Completed: 2026-07-05*
