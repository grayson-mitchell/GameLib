---
quick_id: 260808-gl6
description: Humble sign-in window close should not show an error
date: 2026-08-07
status: complete
commit: 63ae6c818
---

# Quick Task 260808-gl6 — SUMMARY

## What was wrong

Closing the native Humble sign-in window rendered `TauriLoginPanel`'s generic failure panel:
"Something went wrong while signing in: the Humble sign-in window closed or could not be reached".

`watchForLogin()` in `src/backend/humble/user.ts` consumed the Rust `WindowEvent::Destroyed`-sourced
`{ event: 'closed' }` nav event and settled `{ status: 'error' }` — the same status the UNDECIDABLE
and UNSUPPORTED_OR_ERROR cookie-read verdicts settle. `LoginResult` had no status meaning "the user
backed out", so `runHumbleLoginWatch()` could not distinguish a deliberate close from a genuine
watch failure and rendered the failure surface for both.

## What changed

**T1 — `src/backend/humble/user.ts`, `src/common/types/ipc.ts`**
- `LoginResult['status']` and both `humbleStartLogin` / `humbleReconnect` IPC signatures gain
  `'cancelled'`.
- The `'closed'` branch settles `{ status: 'cancelled' }` and logs at `logInfo` instead of
  `logWarning` — a user closing a window is not a warning condition.
- The two genuine-failure settles (`'error'`) are untouched, as is `settle()` itself: its one-shot
  guard plus floated `seam.close()` already behaved identically on every exit path, so a
  self-triggered `'closed'` event stays a no-op exactly as before.
- `humbleLoginFlowRegistration.ts`'s handlers pass the result through untouched — no change needed.

**T2 — `src/frontend/screens/WebView/index.tsx`**
- `runHumbleLoginWatch()` gains a `result.status === 'cancelled'` arm, ordered before the `'error'`
  arm, that logs the outcome and calls `navigate('/login')` while leaving `humbleLoginState` at
  `'idle'` — so no panel renders at all and the user lands back on Manage Accounts.
- `TauriLoginPanel.tsx` needed no change: `'cancelled'` never reaches it (the route navigates away),
  and its generic error/timeout branches stay reachable for real failures.
- No new i18n keys — nothing new is rendered, so the blocking localisation gate is unaffected.

**T3 — tests**
- `src/backend/humble/__tests__/user.test.ts`: the `{ event: 'closed' }` test now expects
  `{ status: 'cancelled' }` and asserts the log went to `logInfo` **and not** to `logWarning` — the
  absence assertion is what stops a future revert from silently reclassifying this as a failure
  while the status assertion still passes. Its two original structural assertions (no cookie read
  was needed; the watch is fully torn down) are unchanged.
- `src/frontend/screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts`: two new
  source-text gates — the `'cancelled'` arm navigates to `/login` and never calls
  `setHumbleLoginState`, and it is ordered before the `'error'` arm — plus a matching anti-vacuity
  self-test, following the file's existing convention.
- `TauriLoginPanel.test.tsx` needed no change.

## Verification

| Check | Result |
|-------|--------|
| `npx jest src/backend/humble/__tests__/user.test.ts src/frontend/screens/WebView` | 8/8 suites, 259/259 tests pass |
| `npx tsc --noEmit` | clean |
| `npx eslint` (5 changed files) | 0 errors (100 pre-existing warnings) |
| `npx jest --runInBand --silent` (full suite) | **216/216 suites, 4218/4218 tests pass** |

## Not verified

Live behaviour was not exercised — no app run. Every test in this tree is structural or
unit-level (no jsdom; `WebView/index.tsx` is gated by source text, per the file's own stated
limitation). Confirming that closing the real sign-in window lands on Manage Accounts with no
panel needs a live run.

## Decisions

- **A new status, not a widened `'error'`.** Reusing `'error'` with a frontend-side heuristic would
  have made the genuine-failure surface (Retry button) unreachable for the UNDECIDABLE /
  UNSUPPORTED_OR_ERROR verdicts, which is the outcome that surface exists for.
- **The renderer navigates rather than showing a "cancelled" panel.** The OAuth runners have a
  `phase: 'cancelled'` panel with a Retry button, but the request here was explicitly to return to
  the standard Manage Accounts page, where the Humble tile already offers sign-in again.
