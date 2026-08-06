---
phase: quick-260806-teb
plan: 01
subsystem: frontend/WebView + backend/storeManagers/nile (Tauri Amazon OAuth login critical path)
tags: [tauri, nile, amazon, oauth, login, ux, spawn-tax, i18n]
dependency-graph:
  requires: []
  provides:
    - "isTauri()-gated /loginweb/nile effect in WebView/index.tsx (Electron-only nile fetch)"
    - "NileUser.getLoginData() in-flight-promise memoization (no value cache/TTL)"
    - "TauriOAuthLoginState.preparing phase + TauriLoginPanel preparing render branch"
  affects:
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/useTauriOAuthLogin.ts
    - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
    - src/backend/storeManagers/nile/user.ts
tech-stack:
  added: []
  patterns:
    - "In-flight-promise memoization without a value cache -- deliberately DIFFERENT from GOGUser.getCredentials()'s TTL cache, because NileLoginData carries single-use PKCE material that must never be replayed across a retry"
    - "A transient phase set before an await and cleared to the next phase after it resolves, mirroring the 260803-eee finalizing precedent -- preparing is non-terminal and never touches reachedTerminal"
key-files:
  created:
    - src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts
    - src/backend/storeManagers/nile/__tests__/user.test.ts
  modified:
    - src/frontend/screens/WebView/index.tsx
    - src/backend/storeManagers/nile/user.ts
    - src/frontend/screens/WebView/useTauriOAuthLogin.ts
    - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
    - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
    - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
decisions:
  - "No value cache/TTL on NileUser.getLoginData()'s memoization -- only an in-flight promise, cleared in a finally with an identity check (systeminfo's own precedent). A sequential call issued after the previous one resolved always spawns fresh, pinned by a negative test, because code_verifier/serial are single-use PKCE material."
  - "safeSetState({ phase: 'awaiting' }) moved from the top of run() to immediately after the login URL is resolved (for ALL four runners), immediately before oauthCaptureLogin -- not just for nile. The three constant-URL runners resolve synchronously so they still reach awaiting in the same tick as before; only nile's async fetch now has a preceding preparing state to cover."
  - "preparing carries `runner` on the state itself (mirroring finalizing/blocked), so TauriLoginPanel reads it from state rather than depending on the separately-passed runner prop staying in sync."
metrics:
  duration_minutes: "~35 (implementation tasks only; checkpoint task pending)"
  completed: null
---

# Quick 260806-teb: Cut Amazon login dead time under Tauri Summary

**STATUS: IMPLEMENTATION COMPLETE, CHECKPOINT PENDING.** All three automated tasks (auto-verified:
tsc clean, 253 tests passing across the affected surface) landed and committed. Task 4 is a
blocking live-verification checkpoint requiring a human to drive the real Tauri build and record
the actual click-to-window-visible timing -- that measurement has NOT been taken and is NOT
fabricated here. This plan is **not complete** until that checkpoint resolves.

## Performance

- **Duration (implementation only):** ~35 min
- **Started:** 2026-08-06 (session start)
- **Completed:** N/A -- checkpoint pending, live timing not yet recorded
- **Tasks:** 3 of 4 (Tasks 1-3 auto; Task 4 is the pending human-verify checkpoint)
- **Files modified:** 6 (4 source, 2 test), 2 new test files

## Accomplishments

- Removed one of two redundant `nile auth --login --non-interactive` subprocess spawns
  (~12.8s/invocation, `pyinstaller-onefile-spawn-tax`) from the Tauri Amazon login critical path:
  `WebView/index.tsx`'s `/loginweb/nile` effect now early-returns under `isTauri()` before ever
  calling `amazon.getLoginData()`, since both of its consumers (`<webview>` `src`,
  `handleAmazonLogin`) are structurally unreachable under Tauri.
- Added in-flight-promise memoization to `NileUser.getLoginData()` so any future remount/duplicate
  caller can never reintroduce a second concurrent spawn -- deliberately with NO value cache, so a
  retry after a cancelled login still mints fresh PKCE material.
- Replaced the false "A sign-in window has opened" copy during nile's pre-window wait with a new
  `preparing` phase: an honest, spinner-backed "Preparing Amazon sign-in..." surface, set before
  the login-URL fetch and cleared to `awaiting` only once the URL actually resolves. The three
  constant-URL runners (legendary/gog/zoom) never observe `preparing` -- their URLs resolve
  synchronously with no spawn to wait on.

## Task Commits

Each task was committed atomically:

1. **Task 1: Stop the Tauri path spawning nile a second time for data it discards** - `5593ab029` (fix)
2. **Task 2: Share one in-flight nile auth spawn across concurrent callers, without ever caching PKCE material** - `0c240c234` (fix)
3. **Task 3: Replace the false "window has opened" copy during the Amazon pre-window wait with a live preparing surface** - `965225796` (fix)
4. **Task 4: Live-verify the Amazon login wait and record the measured timing** - **NOT STARTED (blocking checkpoint)**

_Plan metadata commit not yet made -- orchestrator handles the docs commit per this session's constraints._

## Files Created/Modified

- `src/frontend/screens/WebView/index.tsx` - Added `isTauri()` early-return guard in the
  `/loginweb/nile` effect, positioned before `amazon.getLoginData()`, with a comment explaining
  why both of its Tauri-side consumers are unreachable.
- `src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts` (new) - Source-text
  structural gate pinning the guard's presence and position, with anti-vacuity self-tests.
- `src/backend/storeManagers/nile/user.ts` - Added module-level `inFlightLoginData` in-flight
  promise memoization around `getLoginData()`'s `runRunnerCommand` spawn, plus
  `__resetInFlightLoginDataForTests()`. No value cache/TTL by design.
- `src/backend/storeManagers/nile/__tests__/user.test.ts` (new) - Four behaviors: concurrent
  calls share one spawn, sequential calls after resolution always spawn fresh (the load-bearing
  negative test), a rejected in-flight fetch clears the memo for retry, concurrent callers share
  one rejection.
- `src/frontend/screens/WebView/useTauriOAuthLogin.ts` - Added `{ phase: 'preparing'; runner }` to
  `TauriOAuthLoginState`. Moved the `awaiting` transition to fire for all four runners only after
  the login URL resolves; `preparing` is set (nile only) immediately before the
  `getAmazonLoginData()` await. Added a `phase=preparing (fetching login url)` log line. Extended
  the module docstring.
- `src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx` - Added 8 new tests covering
  the preparing->awaiting sequence, the three constant-URL runners never observing preparing, the
  rejection/error path, and the teardown-during-preparing cancelled-midflight log line.
- `src/frontend/screens/WebView/components/TauriLoginPanel.tsx` - Added the `preparing` render
  branch (placed before `awaiting`), reusing the existing spinner element, with i18n keys
  `webview.login.oauth.preparing.heading` / `.body`.
- `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx` - Added 4 new tests
  for the preparing branch's rendered copy, spinner presence, log line, and non-interference with
  the awaiting/declared-blocked branches.

## Decisions Made

See frontmatter `decisions` above. Summarized: (1) no value cache on the nile in-flight memo, only
an in-flight promise -- a security/correctness requirement per T-TEB-01/T-TEB-02, not a style
choice; (2) `awaiting` fires after URL resolution for all four runners, not just nile, so the
non-nile runners' observable behavior is unchanged while nile gets an honest `preparing` state
ahead of it; (3) `preparing` carries `runner` on the state itself, matching the existing
`finalizing`/`blocked` convention.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1-3. No Rule 1/2/3 auto-fixes were needed; no
Rule 4 architectural questions arose.

## Issues Encountered

One self-caught test-authoring mistake, fixed before the affected test suite was reported as
passing: an early draft of the "teardown during preparing" test in
`useTauriOAuthLogin.test.tsx` resolved `getAmazonLoginData()` successfully after unmount and
asserted `oauthCaptureLogin` was never called -- but the hook's actual (and correct, pre-existing)
behavior is that a successful URL resolution always proceeds to call `oauthCaptureLogin`
regardless of `cancelled`; only a *rejected* `getAmazonLoginData()` after teardown hits the
`cancelled-midflight at=login-url` log line the plan's behavior spec describes. Traced the control
flow, corrected the test to reject the promise instead (mirroring the existing
`capture-transport-failed` teardown precedent in the same file), and re-verified. Not a production
code defect -- caught and fixed entirely within the test file before any task was marked done.

## Verification

- `npx jest --selectProjects Frontend --testPathPattern "WebView"`: **6 suites, 155 tests, all
  passing** (includes the 2 new/extended suites plus all 4 pre-existing WebView suites, unmodified
  baselines intact).
- `npx jest --selectProjects Backend --testPathPattern "nile|runnerAuthFlows"`: **2 suites, 34
  tests, all passing** (new `nile/__tests__/user.test.ts` plus the pre-existing
  `runnerAuthFlows.test.ts`).
- `npx tsc --noEmit -p tsconfig.json`: clean (exit 0) -- confirms the new `preparing` union member
  did not break any exhaustive switch/branch elsewhere in the codebase.
- `git diff src/frontend/screens/WebView/index.tsx`: confirmed to contain ONLY the guard plus its
  comment, matching Task 1's done criteria exactly.

## Known Stubs

None. No new empty/placeholder data paths introduced.

## Threat Flags

None. All threat-model dispositions from the plan (T-TEB-01 through T-TEB-04, T-TEB-SC) were
addressed exactly as scoped: the in-flight memo carries no value cache (T-TEB-01/02, enforced by
the sequential-call test), the new log lines carry only runner/phase vocabulary and never PKCE
material (T-TEB-03, consistent with the existing permitted-key-vocabulary test in
`useTauriOAuthLogin.test.tsx`), the `isTauri()` guard's worst case fails loudly at the Electron
`<webview>` `src` (T-TEB-04, accepted), and no packages were installed (T-TEB-SC, not applicable).

## User Setup Required

None - no external service configuration required.

## CHECKPOINT PENDING -- Task 4 (Live-verify the Amazon login wait)

This is a **blocking live checkpoint**. It requires a human to:

1. Launch the Tauri build and confirm exactly one GameLib process is running
   (`pgrep -fl GameLib`).
2. Go to Manage Accounts, click Amazon, start a stopwatch on the click.
3. Confirm the panel shows the new spinner + "Preparing Amazon sign-in..." surface (NOT "A
   sign-in window has opened").
4. Stop the stopwatch when the native Amazon sign-in window actually appears. Record the elapsed
   seconds -- expectation is roughly half the previous wait, with one ~12.8s nile spawn remaining
   (not removable in-repo).
5. Confirm `gamelib.log` shows `phase=preparing (fetching login url)` exactly once, followed by
   `phase=awaiting`, with only ONE nile auth invocation for the attempt.
6. Close the sign-in window without signing in, confirm landing back on Manage Accounts, click
   Amazon again, and confirm a real second spawn occurs (fresh PKCE material, not cached).
7. Complete a real Amazon sign-in through to the library.
8. Sanity-check GOG: must go straight to "Signing in to Gog" with no preparing surface.

**No timing has been measured or fabricated.** This SUMMARY will need to be updated (or the
orchestrator will spawn a continuation agent) once a human provides the step-4 and step-8
measurements at the checkpoint.

## Next Phase Readiness

Not applicable -- this is a quick task, not a phase. Nothing downstream depends on this work
completing before proceeding with other phases; it is a standalone latency/UX fix scoped to the
Amazon Tauri login path.

## Self-Check: PASSED

- FOUND: `src/frontend/screens/WebView/index.tsx` (contains `isTauri()` guard in the
  `/loginweb/nile` effect)
- FOUND: `src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts`
- FOUND: `src/backend/storeManagers/nile/user.ts` (contains `inFlightLoginData`)
- FOUND: `src/backend/storeManagers/nile/__tests__/user.test.ts`
- FOUND: `src/frontend/screens/WebView/useTauriOAuthLogin.ts` (contains `phase: 'preparing'`)
- FOUND: `src/frontend/screens/WebView/components/TauriLoginPanel.tsx` (contains
  `webview.login.oauth.preparing.heading`)
- FOUND commit `5593ab029` in `git log --oneline --all`
- FOUND commit `0c240c234` in `git log --oneline --all`
- FOUND commit `965225796` in `git log --oneline --all`
