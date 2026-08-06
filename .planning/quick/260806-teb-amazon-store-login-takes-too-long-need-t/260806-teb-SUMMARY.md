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
  duration_minutes: "~50 (3 implementation tasks + live checkpoint)"
  completed: "2026-08-06"
---

# Quick 260806-teb: Cut Amazon login dead time under Tauri Summary

**STATUS: ALL FOUR TASKS COMPLETE. Every behavior this plan promised is live-proven. The USER'S
UNDERLYING COMPLAINT IS NOT RESOLVED** -- the measured residual wait is 18-36s, and the live
measurement falsified the plan's central cost assumption. See "Checkpoint Results" below. A
follow-up investigation is owed and recorded in deferred-items.

All three automated tasks (tsc clean, 253 tests passing across the affected surface) landed and
committed. Task 4's live measurement was driven by the developer on the real Tauri build on
2026-08-06 at 21:27-21:30, corroborated against `gamelib.log` and `runners/nile.log`, and is
recorded verbatim below -- no timing here is estimated or fabricated.

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

## Checkpoint Results -- Task 4 (Live-verified 2026-08-06)

Driven by the developer on the real Tauri debug build. Evidence: `~/Library/Logs/GameLib/gamelib.log`
(single launch, bootstrap 21:27:45 -- no concurrent-instance sink split) and
`~/Library/Logs/GameLib/runners/nile.log`.

### Measured

| Attempt | Click -> window visible | Log window |
|---|---|---|
| 1 (cold, at app startup) | **36s** | spawn 21:28:04 -> register data 21:28:40, window 21:28:41 |
| 2 (warm, 90s later) | **18s** | spawn 21:29:38 -> register data 21:29:56, window 21:29:57 |
| GOG sanity check | **1s** | developer-observed |

### What the plan promised, and whether it held

| must_have | Verdict | Evidence |
|---|---|---|
| Exactly ONE `nile auth --login --non-interactive` spawn per Tauri attempt, not two | **PASS (live)** | `gamelib.log:27` and `:43` -- one invocation each, nothing else in between. The duplicate spawn is definitively gone. |
| A second sequential attempt mints FRESH PKCE material, never cached | **PASS (live)** | `code_verifier` `8V5I2WGQ...` vs `6W0rDNMg...`; `serial` `35CB8DBE...` vs `63525984...`. The deliberate no-TTL-cache decision is proven correct in the field, not just in the unit test. |
| Preparing surface holds the whole wait; never the false "window has opened" copy | **PASS (live)** | `phase=preparing (fetching login url)` at 21:28:04, `[TauriLoginPanel] phase=preparing` same second, sustained until the window at 21:28:41. Held for the full 36s. |
| legendary/gog/zoom go straight to `awaiting`, no preparing surface | **PASS (weak)** | GOG measured at 1s, consistent with a synchronous constant URL. Developer-observed only -- no GOG login appears in this log, so this rests on the 1s reading plus the unit tests, not on a log line. |
| Electron `<webview>` Amazon path behaviourally unchanged | **NOT LIVE-TESTED** | Unit/structural tests only. No Electron run was made. Unchanged from the plan's stated risk posture. |
| Concurrent callers share one in-flight spawn | **NOT LIVE-OBSERVABLE** | Unit-tested only; with the duplicate caller removed there is no longer a live path that produces concurrency. This is now purely a regression guard. |

### The plan's cost model was WRONG -- corrected here

The plan asserted a residual of "one ~12.8s nile spawn, not removable in-repo." Both halves of that
are false, measured directly on this machine (source binary warm in page cache):

```
public/bin/arm64/darwin/nile --version                     -> 7.09s / 6.81s   (5% CPU, I/O bound)
public/bin/arm64/darwin/nile auth --login --non-interactive -> 6.86s / 6.79s   (4% CPU, I/O bound)
```

`auth --login` costs the **same as `--version`** -- it is pure PyInstaller-onefile spawn tax doing
essentially no work of its own (the URL and PKCE material are generated locally; there is no slow
Amazon round-trip hiding in it). So:

- The nile binary accounts for only **~7s**, not 12.8s.
- That leaves **~29s unexplained on attempt 1 and ~11s on attempt 2** -- app-side latency this
  plan neither addressed nor knew about. It is now the dominant cost, and "not removable in-repo"
  is an unsupported claim about it.

Attempt 1's excess has a strong candidate: the app fires `legendary --version`, `gogdl --version`
and `nile --version` concurrently at 21:28:01 (`gamelib.log:19-23`), and `nile.log` shows the
`--version` output landing *after* the 21:28:04 auth command was logged -- so four PyInstaller
onefile extractions were contending on disk when the user clicked. **Attempt 2 has no such
explanation**: it ran in isolation with nothing else spawning, and still took 18s against a 6.8s
standalone baseline. That ~11s gap is undiagnosed.

### Checkpoint contract defect (recorded, per the live-gate-contract-authoring discipline)

Step 7 of this checkpoint ("complete a real Amazon sign-in through to the library") was
**unsatisfiable as written**: `gamelib.log:24` shows
`[TauriLoginPanel] declared-blocked: runner=nile channel=authAmazon -- lands in Phase 34.5`.
Amazon sign-in cannot complete until Phase 34.5 ports that channel, so the developer could only
cancel -- which is exactly what both attempts did (`status=cancelled reason=window-closed`). The
step demanded an outcome the app currently forbids. This is the same defect class as
`contract-interaction-defects-evade-item-review`: each step was individually reasonable, but step 7
contradicted a known platform state that no per-step review caught. Not a defect in the code under
test.

### Honest bottom line

The three code fixes did exactly what they were designed to do, and the design was aimed at the
wrong dominant cost. The user asked for a faster Amazon login; 18-36s is still an unacceptable
wait. **This task removed a real, proven duplicate spawn and made the remaining wait honest, but
did not solve the presenting problem.** The follow-up is filed in deferred-items below.

## Deferred Items

**D-TEB-01 (open, recommended next): the ~11-29s app-side gap between the nile binary's 6.8s
standalone cost and the 18-36s observed in-app.** Undiagnosed with more than one live candidate --
route through `/gsd-debug`, not a guessed fix. Candidates, none preferred:
(a) concurrent PyInstaller extraction contention from the three startup `--version` probes
(explains attempt 1, but demonstrably NOT attempt 2, which ran isolated);
(b) sidecar-spawn overhead specific to `runRunnerCommand` (different parent process, env, or cwd
than a plain shell invocation -- the standalone 6.8s baseline was measured from a shell, so the
comparison is not yet apples-to-apples);
(c) debug-build overhead in `target/debug/gamelib-shell`, untested against a release build.
The cheap discriminator to run first is a release-build timing plus a `sample` of the sidecar
during the wait -- per `sample-the-hung-process-before-killing`, one sample has collapsed a
multi-candidate field here before.

**D-TEB-02 (open, design decision the user should weigh): prefetch the nile login URL.** The
in-flight memoization from Task 2 already makes a prefetch safe to land -- a fetch started on
Manage Accounts mount would be reused by the click rather than racing it, and a cancel/retry still
mints fresh PKCE material. This could hide most of the remaining wait behind the time the user
spends reading the page. **Not implemented, deliberately**: it spawns a multi-second subprocess for
every visitor to Manage Accounts including the majority who never touch Amazon, which is a real
cost trade the user should decide rather than absorb silently. Revisit after D-TEB-01, since the
right prefetch lead time depends on what the true cost turns out to be.

**D-TEB-03 (open, low priority): the Electron `<webview>` Amazon path was never live-exercised.**
Task 1's guard is pinned by structural/unit tests only. Worth one Electron run if that path is
still considered supported.

## Next Phase Readiness

Not applicable -- this is a quick task, not a phase. Nothing downstream depends on this work
completing before proceeding with other phases; it is a standalone latency/UX fix scoped to the
Amazon Tauri login path. Note that a complete Amazon sign-in remains blocked until Phase 34.5
ports the `authAmazon` channel, so the end-to-end flow cannot be validated before then.

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
