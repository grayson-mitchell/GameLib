---
phase: quick-260803-eee
plan: 01
subsystem: frontend/WebView + sidecar OAuth capture (Tauri OAuth login surface)
tags: [tauri, oauth, login, ux, frontend, sidecar, rust]
dependency-graph:
  requires: []
  provides:
    - "TauriOAuthLoginState.finalizing phase"
    - "TauriLoginPanel finalizing render branch"
    - "useTauriOAuthLogin onCancelled callback + WebView/index.tsx cancel-path navigation"
    - "oauthLoginCapture.ts window-close detection -> { status: 'cancelled' }"
    - "LoginWindowNavEvent 'closed' kind, sourced from main.rs's WindowEvent::Destroyed hook"
  affects:
    - src/frontend/screens/WebView/useTauriOAuthLogin.ts
    - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
    - src/frontend/screens/WebView/index.tsx
    - src/backend/sidecar/oauthLoginCapture.ts
    - src/backend/sidecar/humbleLoginFlowRegistration.ts
    - src/backend/humble/loginWindowSeam.ts
    - src-tauri/src/main.rs
tech-stack:
  added: []
  patterns:
    - "Non-terminal safeSetState phase inserted at an existing await boundary (no new IPC)"
    - "Hand-rolled CSS spinner (no UpdateComponent/TextWithProgress/@mui import) to survive the DOM-less jest config"
    - "Terminal-outcome callback called directly (bypassing safeSetState's !cancelled gate), guarded for navigation purposes by the consumer's own true-unmount mountedRef -- mirrors ac3557ddb's onLoginSuccess/handleTauriOAuthSuccess pattern"
    - "Window-close observed via WindowEvent::Destroyed (not CloseRequested) on the built WebviewWindow handle, relayed through the SAME LOGIN_WINDOW_EVENTS queue nav events already use -- one relay mechanism, not two"
    - "Resolve-first-wins achieved for free from an existing settled flag + chronological event-array order, no new synchronization primitive needed"
key-files:
  created: []
  modified:
    - src/frontend/screens/WebView/useTauriOAuthLogin.ts
    - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
    - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
    - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
    - src/frontend/screens/WebView/index.css
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/__tests__/WebViewOAuthNavigation.test.ts
    - src-tauri/src/main.rs
    - src/backend/humble/loginWindowSeam.ts
    - src/backend/sidecar/oauthLoginCapture.ts
    - src/backend/sidecar/humbleLoginFlowRegistration.ts
    - src/backend/sidecar/__tests__/oauthLoginCapture.test.ts
    - src/backend/sidecar/__tests__/humbleLoginFlows.test.ts
decisions:
  - "Carry `runner` on the finalizing state member itself (mirroring `blocked`), so the panel names the runner from state alone rather than depending on the separately-passed `runner` prop staying in sync"
  - "Two pre-existing test assertions in useTauriOAuthLogin.test.tsx that captured the hook's captured-but-pending state as `{ phase: 'awaiting' }` were updated to `{ phase: 'finalizing', runner: 'gog' }` -- this is the exact, unavoidable, intended behavior change Task 1 introduces (see Deviations)"
  - "Task 4: onCancelled is called directly at the outcome.status === 'cancelled' site, not routed through safeSetState's own !cancelled gate -- mirrors onLoginSuccess exactly. It still shares the pre-capture short-circuit that also governs the timeout/error/unsupported siblings (a real unmount before oauthCaptureLogin resolves suppresses all four alike); this is intentional and covered by a dedicated regression test, not an oversight"
  - "Task 4: navigation is scoped strictly to the user-cancelled outcome -- timeout/error/unsupported keep their existing Retry-button surfaces untouched, per the developer's explicit scope instruction"
  - "Task 5: WindowEvent::Destroyed, not CloseRequested -- Destroyed is the point the window is actually gone; CloseRequested exists so a handler can veto the close, which this arm never wants to do"
  - "Task 5: the close signal reuses the EXISTING LOGIN_WINDOW_EVENTS queue and takeEvents() channel rather than adding a new rustInvoke command -- additive to an established seam, per the developer's explicit instruction to keep it in 34.4.1's existing shape"
  - "Task 5: coerceNavEvent's allow-list was the actual trap -- widening the TS type alone would NOT have fixed anything, since that function silently defaulted any unrecognized event to 'finished' before this task"
metrics:
  duration_minutes: "~70"
  completed: 2026-08-03
---

# Phase quick-260803-eee Plan 01: Tauri OAuth login finalizing state Summary

Added a `finalizing` phase to the Tauri OAuth login surface so the 5-27s gap between the native
popup closing and the token exchange completing shows an animated spinner and "Finalizing sign-in
with `<Runner>`…" instead of the static, seemingly-frozen "Signing in to `<Runner>`" panel. Two
follow-up tasks (added mid-execution, driven by live verification) fixed a chain of sibling
defects in the cancel path: the frontend had no exit navigation on cancel (Task 4), and beneath
that, the backend never even detected a user-closed popup in the first place (Task 5) -- so Task
4's fix, while correct, was unreachable until Task 5 landed.

## What Was Built

**Task 1** (`cc6d8c34b`): Added `{ phase: 'finalizing'; runner: OAuthRunner }` to
`TauriOAuthLoginState` in `useTauriOAuthLogin.ts`. The transition is set via the existing
`safeSetState` helper at the one correct site: after the four non-captured outcome branches
(`cancelled`/`timeout`/`unsupported`/`error`) return, and before the auth-exchange `try` block --
i.e. exactly where `outcome.status === 'captured'` is the only remaining possibility. A single
`window.api.logInfo` line containing `phase=finalizing` and the runner name is emitted immediately
before the state transition. `reachedTerminal` is untouched, so `onLoginSuccess` and the existing
idle/blocked/error settlement paths are unaffected -- finalizing is purely intermediate.

**Task 2** (`5c94aef64`): Added the `phase === 'finalizing'` render branch to `TauriLoginPanel.tsx`,
placed immediately after the `awaiting` branch. It reads the runner label from `state.runner`
(falling back to the existing `runnerLabel` local), renders a bare `<div
className="WebView__unavailablePanel-spinner">` above the heading (no new imports -- this
component's test file has no CSS transform), and logs one `[TauriLoginPanel] runner=<runner>
phase=finalizing` line. Added a top-level `.WebView__unavailablePanel-spinner` rule plus a
`gamelibFinalizingSpin` keyframes animation to `index.css` (top-level because the panel renders
outside the `.WebView` wrapper; a nested rule would never match).

**Task 3**: `checkpoint:human-verify` -- reached and returned without attempting to drive the Tauri
UI. See "Checkpoint Verdicts" below.

**Task 4** (`5e68cee30`, added after the first checkpoint): Added the cancel-path exit navigation
-- the cancel-path sibling of `ac3557ddb`'s success-path fix (`handleTauriOAuthSuccess` ->
`navigate('/login')`).
  - `useTauriOAuthLogin.ts`: added an optional third param `onCancelled?: () => void`, called
    directly at the `outcome.status === 'cancelled'` branch (not routed through `safeSetState`'s
    `!cancelled` gate), added to the effect's dependency array.
  - `WebView/index.tsx`: added `handleTauriOAuthCancelled`, a `useCallback` guarded by the existing
    true-unmount `mountedRef` (not the hook's internal `cancelled` flag) that calls
    `navigate('/login')`, wired as the hook's third argument alongside the existing
    `handleTauriOAuthSuccess`.
  - Scoped strictly to the `cancelled` outcome -- timeout/error/unsupported keep their own
    Retry-button surfaces, untouched.
  - **This code was correct but UNREACHABLE at the time it was written** -- see Task 5's live-check
    finding below.

**Task 5** (`e1cef86e4`, added after the second checkpoint's live check FAILED): The developer's
live check showed Task 4's fix had no effect, and the session log revealed why: closing the login
popup produced **no status line of any kind** for that window -- `oauthCaptureLogin` never
resolved at all; it was still pending when the developer gave up and retried. The real defect was
one layer down from Task 4: nothing on the backend ever observed the popup actually being closed.
  - `src-tauri/src/main.rs`: `humble_login_open`'s built window now registers
    `window.on_window_event(...)`, pushing `{ event: "closed", url: "" }` onto the SAME
    `LOGIN_WINDOW_EVENTS` queue the existing `on_page_load` hook already feeds, on
    `WindowEvent::Destroyed` (fires only once the window is truly gone, not on the earlier,
    vetoable `CloseRequested`).
  - `src/backend/humble/loginWindowSeam.ts`: `LoginWindowNavEvent.event` widened to `'started' |
    'finished' | 'closed'` (additive).
  - `src/backend/sidecar/humbleLoginFlowRegistration.ts`: **the actual trap.**
    `coerceNavEvent()` had an allow-list that silently defaulted any unrecognized `event` value to
    `'finished'` -- widening the TS type alone would have done nothing; a real `'closed'` event
    would have been coerced away into a bogus, non-matching nav event before it ever reached
    `oauthLoginCapture.ts`. Extended the allow-list to include `'closed'`.
  - `src/backend/sidecar/oauthLoginCapture.ts`: `poll()` now checks for a `'closed'` event first
    in its per-event loop (ahead of the nav-host logging, which would otherwise emit a spurious
    line for the close event's empty url) and settles `{ status: 'cancelled' }`. `settle()` gained
    an optional `reason` parameter, so the outcome now logs `status=cancelled
    reason=window-closed`. Resolve-first-wins is not a new mechanism -- it falls out of the
    existing `settled` flag plus the events array's chronological push order; a close this module
    triggers itself (via its own `activeSeam.close()` call inside `settle()`) can never be read
    back, because `settle()` always clears the poll interval before calling `close()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, but really an unavoidable consequence of the feature] Updated two pre-existing
test baseline assertions in `useTauriOAuthLogin.test.tsx`**
- **Found during:** Task 1, first `npx jest` run for this file.
- **Issue:** The pre-existing test `after teardown, the hook never performs a setState -- no
  console warning, and no observable state change across a flush` captured a snapshot of the
  hook's state while a captured outcome's auth channel was still pending, asserting it equalled
  `{ phase: 'awaiting' }` (twice in the same test). Adding the `finalizing` phase means the hook
  now correctly advances past `awaiting` to `finalizing` in exactly this scenario -- that is the
  whole point of this task. The old assertion value was made false by the feature it was never
  written to anticipate.
- **Fix:** Updated both assertions to `{ phase: 'finalizing', runner: 'gog' }`. The test's actual
  subject (no setState after unmount) is unchanged; only the baseline value was corrected.
- **Files modified:** `src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx`
- **Commit:** `cc6d8c34b`

**2. [Self-caught during Task 4] Corrected an overclaim in my own doc comment / test before it
shipped**
- **Found during:** Task 4, drafting the "onCancelled fires even when torn down mid-capture"
  regression test.
- **Issue:** I initially wrote both a doc comment and a test claiming `onCancelled` fires
  "unconditionally, like `onLoginSuccess`" even across a mid-flight teardown. Tracing the actual
  control flow showed this is false: `onCancelled` sits behind the SAME pre-capture short-circuit
  that already governs the timeout/error/unsupported siblings, which returns before my new branch
  is ever reached. Only `onLoginSuccess` survives that short-circuit (it lives on the far side of
  the `captured`-outcome fall-through, deliberately exempted since a captured code is perishable
  and must still be exchanged).
- **Fix:** Corrected the doc comments to state precisely what "unconditional" means here, and
  rewrote the test to assert the true behavior: a late cancelled resolution after a real unmount
  does NOT invoke `onCancelled` -- fine, since there is no route left to navigate away from.
- **Files modified:** `src/frontend/screens/WebView/useTauriOAuthLogin.ts`,
  `src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx`
- **Commit:** `5e68cee30`

**3. [Self-caught during Task 5] Two new instances of a pre-existing eslint ERROR class, fixed
before committing**
- **Found during:** Task 5's eslint gate run on `oauthLoginCapture.test.ts`.
- **Issue:** Two new test blocks copied this file's existing `jest.requireMock('backend/logger')
  as { logInfo: jest.Mock }` cast pattern -- a pattern the file already had 5 pre-existing
  instances of, all flagged `@typescript-eslint/no-unnecessary-type-assertion` (an ERROR in this
  project's config, not a warning). Copying it added 2 more, raising the file's error count from 5
  to 7.
- **Fix:** Removed the redundant `as {...}` cast in my 2 new blocks (eslint's own message confirms
  the cast changes nothing type-wise). This trades the error for a few more `no-unsafe-*` WARNING
  lines -- an already-pervasive, tolerated category throughout this file and its sibling test
  files (documented in Deviation 3 of Tasks 1/2's own history). File's error count returned to the
  pre-existing baseline of 5; the 5 baseline errors themselves are pre-existing and out of scope
  (not touched).
- **Files modified:** `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts`
- **Commit:** `e1cef86e4`

No other deviations. Every other pre-existing test in every touched test file passed unmodified.

## Checkpoint Verdicts

### First checkpoint (Task 3)

Items 1, 2, 3, 5, 6 PASS -- live-verified: the finalizing surface appears the moment the popup
closes, holds through the exchange, and the login completes; Electron's embedded-webview path is
unchanged.

Item 5's log-line confirmation: the Tauri session log was lost to rotation before it could be read.
`phase=finalizing` is recorded as **verified via UI observation plus the unit test** -- the log
line itself was not observed live in this session; that specific claim is not made.

**Item 4's original "PASS" is SUPERSEDED -- do not cite it as having live-proven the cancelled
branch.** It passed its stated criterion (no finalizing flash on cancel) but the follow-up live
check for Task 4 (see below) produced session-log evidence that no `status=` line of any kind was
ever emitted for a closed popup -- meaning `outcome.status === 'cancelled'` may never have actually
run during that original check either. The cancelled surface's appearance in that first check is
unexplained by the evidence now available and should not be treated as proof the cancelled branch
executed.

### Second checkpoint (Task 4, live check FAILED)

The developer cancelled a GOG popup expecting Task 4's navigation to fire. It did not. Session log
evidence (preserved by the developer) showed `[oauthLoginCapture] runner=gog label=loginwin-0-...`
then `nav host=login.gog.com`, then **nothing** -- no `status=` line ever appeared for that window,
and `oauthCaptureLogin` was still pending when a second login window (`loginwin-1`) opened moments
later from a retry. This proved Task 4's frontend code was correct but structurally unreachable:
the backend never detected the close, so the `cancelled` outcome that Task 4's `onCancelled` reacts
to never arrived. This is what Task 5 fixes.

## Verification

- `npx tsc --noEmit` clean after every task.
- `npx jest --silent` (full suite, after Task 5): **187 suites, 3646 tests, all passing.**
  `src/frontend/screens/WebView` alone: 136/136. `oauthLoginCapture.test.ts` +
  `humbleLoginFlows.test.ts` alone: 87/87.
- `npx eslint` on all touched files across all three code tasks: 0 new errors (one pre-existing
  5-error baseline in `oauthLoginCapture.test.ts`, confirmed unchanged and out of scope -- see
  Deviation 3). No new warning categories anywhere; counts diffed before/after each task.
  `oauthLoginCapture.ts` and `loginWindowSeam.ts` (the two Task 5 source files) report **zero**
  eslint findings.
- `cargo build` and `cargo test`: clean build, **93/93 Rust tests pass** (up from 92 -- one new
  pure-function case for the `"closed"` event shape; the `on_window_event` closure itself needs a
  live window/event-loop context this test harness does not provide).
- `cargo fmt --check` / `cargo clippy`: confirmed zero NEW diff hunks or warnings touch any of my
  added Rust code (pre-existing formatting/clippy drift elsewhere in `main.rs`, unrelated to this
  task, left untouched per the scope-boundary rule).
- `git diff --stat -- src/ src-tauri/` across all five commits lists exactly the thirteen files in
  `key-files.modified` above. The perf-fix files (`gog/user.ts`, `gog/library.ts`,
  `utils/systeminfo/index.ts`) remain confirmed byte-stable throughout.

## Known Stubs

None.

## Live Verification: CONFIRMED (2026-08-03)

Task 5's live check PASSED on the developer's hardware after `npm run build:sidecar` +
`pnpm tauri:dev` (Rust shell recompiled on launch). The developer closed the GOG login popup
without completing sign-in and landed back on Manage Accounts ("bingo! worked"). Log evidence
(preserved at the session scratchpad as `gamelib-cancel-verified.log`):

```
(11:18:48) [Backend]:  [oauthLoginCapture] runner=gog status=cancelled reason=window-closed
(11:18:48) [Frontend]: [useTauriOAuthLogin] runner=gog phase=cancelled
```

The full chain — Rust `WindowEvent::Destroyed` → sidecar `'closed'` coercion → capture settles
`cancelled` → hook's cancelled branch → `onCancelled` → `navigate('/login')` — is live-proven
end to end. This also retires the earlier caveat: the cancelled branch, never before reachable
from a popup-close, has now rendered and exited correctly in a real run.

## Self-Check: PASSED

- FOUND: `src/frontend/screens/WebView/useTauriOAuthLogin.ts` (contains `phase: 'finalizing'` and
  `onCancelled`)
- FOUND: `src/frontend/screens/WebView/components/TauriLoginPanel.tsx` (contains
  `webview.login.oauth.finalizing.heading`)
- FOUND: `src/frontend/screens/WebView/index.css` (contains `WebView__unavailablePanel-spinner`)
- FOUND: `src/frontend/screens/WebView/index.tsx` (contains `handleTauriOAuthCancelled`)
- FOUND: `src-tauri/src/main.rs` (contains `on_window_event`)
- FOUND: `src/backend/sidecar/oauthLoginCapture.ts` (contains `reason=`)
- FOUND: `src/backend/sidecar/humbleLoginFlowRegistration.ts` (contains `'closed'` in
  `coerceNavEvent`)
- FOUND commit `cc6d8c34b` in `git log --oneline --all`
- FOUND commit `5c94aef64` in `git log --oneline --all`
- FOUND commit `5e68cee30` in `git log --oneline --all`
- FOUND commit `e1cef86e4` in `git log --oneline --all`
