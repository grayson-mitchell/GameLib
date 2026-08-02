---
status: fixed
trigger: "after logged into gog the manage accounts form should instantly be updated and re-render showing gog as logged in rather than take >30 seconds to be updated"
created: 2026-08-03T12:00:00Z
updated: 2026-08-03T14:00:00Z
phase: 34.5
tracks: latency follow-on to the resolved manage-accounts-panel-stuck defect
follows: .planning/debug/resolved/manage-accounts-panel-stuck.md, .planning/debug/resolved/gog-login-ui-never-updates.md
---

## Current Focus

hypothesis: |
  CONFIRMED — static analysis, two independent live-log capture sessions before the fix,
  and one live-verified capture after the fix (see Evidence). The "login window" the
  developer watches close is the NATIVE OAuth capture popup — it closes at
  `status=captured` in `oauthLoginCapture.ts`, well BEFORE the app's own in-progress
  screen (`TauriLoginPanel`, `phase: 'awaiting'`, "Signing in to Gog") can go away. That
  screen only clears when `handleTauriOAuthSuccess` (`WebView/index.tsx`) runs
  `navigate('/login')`, which only happens once `useTauriOAuthLogin`'s `run()` reaches
  `phase: 'idle'` — i.e. once the frontend's `window.api.authGOG()` RPC fully resolves.
  `authGOG` was slow because `GOGUser.login()` (`user.ts:26-68`) performed two SEPARATE
  `gogdl auth` CLI subprocess invocations back to back: first `gogdl auth --code <code>`
  (obtains a token, logs "Login Successful"), then unconditionally called
  `getUserDetails()` -> `getCredentials()`, which invoked a SECOND, REDUNDANT `gogdl auth`
  (no `--code`) purely to re-derive an access_token the FIRST call's stdout (`GOGLoginData`,
  `common/types.ts:431-438`) already contained verbatim.
test: |
  Two pre-fix live GOG re-login cycles (06:46-06:47, 06:56-06:57) plus one post-fix
  live re-login cycle (08:43, after `electron-vite build` + `build:sidecar` +
  `tauri:dev`), all read from `gamelib.log` copied aside before trusting it.
expecting: |
  MET. Removing the redundant second `gogdl auth` call shaved the predicted ~5s leg off
  a live GOG login and did not change any other behavior (boot-time `getUserDetails()`
  calls at main.ts:458, which have no fresh token in hand, are unaffected — confirmed by
  code read and unchanged in the post-fix live log).
next_action: |
  DONE. Fix implemented, unit-tested, full suite + tsc + lint verified clean twice, and
  now LIVE-VERIFIED by the developer. Session closed — see Resolution.

reasoning_checkpoint:
  hypothesis: |
    `GOGUser.login()`'s unconditional `await this.getUserDetails()` call performs a second,
    redundant `gogdl auth` CLI subprocess invocation via `getCredentials()` to obtain an
    access_token that the FIRST `gogdl auth --code` call already returned in its parsed
    stdout (`data.access_token`, typed as `GOGLoginData`). This redundant round trip is on
    the critical path between OAuth capture and `gog.username` being set in the frontend, and
    is exactly what the developer observes as the Manage Accounts panel sitting logged-out
    before spontaneously flipping.
  confirming_evidence:
    - "user.ts:52-67 — `login()` parses `stdout` into `data: GOGLoginData`, logs 'Login Successful', then calls `await this.getUserDetails()` with NO arguments, discarding `data.access_token` entirely."
    - "common/types.ts:431-438 — `GOGLoginData` already has `access_token: string`. The value `login()` just obtained is thrown away."
    - "user.ts:70-109 — `getUserDetails()` unconditionally calls `const user = await this.getCredentials()` (line 80), which itself runs a SECOND `gogdl auth` CLI subprocess (line 125, no `--code`) purely to obtain `user.access_token` for the `userData.json` HTTP call at line 88 — the ONLY field of `GOGCredentials` that `getUserDetails()` uses."
    - "LIVE LOG, run 1 (06:46): 'Login Successful' 06:46:42 -> 'Checking if login is valid' + second 'Running command...auth' 06:46:42 -> 'Saved username to config file' 06:46:47 -- exactly 5s consumed by the second subprocess+HTTP call, immediately before frontend `phase=idle` at 06:46:47."
    - "LIVE LOG, run 2 (06:57): identical shape, identical 5s cost (06:57:20 -> 06:57:25), 11 minutes apart in the same running session -- reproducible, not a one-off."
    - "main.ts:445-460 — `getUserDetails()` is ALSO called at boot with no fresh token in hand (`runOnceWhenOnline`); that call path genuinely needs `getCredentials()`'s disk-read/refresh behavior, which is why the fix must be additive (optional accessToken param), not a removal of `getCredentials()`."
    - "LIVE LOG, POST-FIX run (08:43, rebuilt sidecar): `status=captured` 08:43:02 -> `gogdl auth --code` (first call, 8s) -> `Login Successful` 08:43:10 -> `Checking if login is valid` -> `Saved username to config file` 08:43:11 -- 1s, and NO second `gogdl auth` subprocess between them, versus the ~5s baseline. `phase=idle` at 08:43:11. The redundant leg is eliminated exactly as predicted."
  falsification_test: |
    If the second `gogdl auth` subprocess call were doing something OTHER than obtaining an
    access_token for the userData.json fetch (e.g. validating scope, refreshing an
    already-stale token issued moments ago, or writing state getUserDetails' HTTP call
    depends on), removing it would either break the userData.json fetch or silently persist
    wrong data. Checked: `getCredentials()`'s only consumer inside `getUserDetails()` is
    `user.access_token` (line 88); no other field of `GOGCredentials` is read. A token
    obtained seconds earlier by `gogdl auth --code` cannot be stale. NOT FALSIFIED: the
    post-fix live log shows the `userData.json` fetch succeeding (username saved, phase=idle,
    library refresh triggered) with the reused token.
  fix_rationale: |
    Give `getUserDetails()` an optional `accessToken` parameter. When the caller already has
    a fresh token (only `login()` does, immediately after the `--code` exchange), skip
    `getCredentials()` and use it directly. The boot-time call site (main.ts:458) passes
    nothing and keeps its existing disk-read/refresh path untouched. This addresses the root
    cause (an unconditional, avoidable second subprocess call on the login critical path)
    rather than a symptom (e.g. adding a loading spinner to Manage Accounts, or debouncing
    the render, which would hide the wait rather than remove it).
  blind_spots: |
    1. This does NOT make the login "instant." The FIRST `gogdl auth --code` call remains
       (a real network round trip; the prior resolved session `gog-login-ui-never-updates.md`
       measured it at up to ~23s and explicitly scoped further latency work to
       "start at gogdl auth, not the frontend" — this fix is exactly that follow-up, but only
       for the second, provably redundant call). Post-fix live capture: the first call alone
       took 8s of the total 9s capture-to-idle window — this remains untouched and is the
       dominant remaining cost.
    2. The developer's ">30 seconds" first observation is not fully reconciled against the
       ~10-13s this session's pre-fix logs show; network/session variance in the FIRST `gogdl
       auth --code` call (not touched by this fix) is the most likely explanation, consistent
       with the prior session's own finding that that call alone ranged from ~5s to ~23s.
    3. OBSERVATION for future GOG-refresh-latency work (not a gap in this fix): the post-fix
       live log shows two ADDITIONAL `gogdl auth` invocations at 08:43:11 and 08:43:15, AFTER
       `phase=idle` — off this bug's critical path, presumably from the post-login
       library-refresh path calling `getCredentials()`. Not investigated in this session;
       flagged for whoever next touches GOG library-refresh latency.

## Symptoms

expected: |
  After a successful GOG login under Tauri, the Manage Accounts panel shows GOG as
  logged in essentially instantly — under a second, ideally resolved even before the
  login window closes.
actual: |
  CORRECTED by the developer 2026-08-03: the panel does NOT show a logged-out account
  list. Instead, the normal Manage Accounts screen is REPLACED by a largely blank screen
  saying a login is in progress (the UI state that indicates the login window is open).
  That in-progress screen persists for ~10-30s AFTER the login window has resolved and
  closed, then spontaneously gives way to the normal accounts screen showing GOG logged
  in — no user interaction needed. Developer observed >30s on the first report; a repeat
  attempt took ~10s. The defect is therefore in clearing the login-in-progress UI state
  when the login window closes, not in the account-status data itself.
errors: |
  None observed at the UI. Developer has NOT yet inspected gamelib.log for this window —
  "gamelib.log should contain details, but have not looked". Debugger should pull
  ~/Library/Logs/GameLib/gamelib.log itself (and copy it aside BEFORE trusting it —
  rotation lost a gate run once, see memory F-34.5-G6-15).
timeline: |
  New observation. Before ac3557ddb the panel was stuck on "Signing in to Gog" forever,
  so a delayed update was unobservable. Not established as a regression.
reproduction: |
  Sign out of GOG, sign back in via Manage Accounts under `pnpm tauri:dev`. Watch how
  long the panel takes to show GOG as logged in after the login window closes.
  Reproduced twice (>30s, then ~10s) — delay magnitude varies.

## Prior context (load-bearing — read before forming hypotheses)

- `resolved/gog-login-ui-never-updates.md` (fix `eb117d9e4`): sidecar-initiated store
  writes were invisible to the renderer's frozen sync-store snapshot; fixed by emitting
  STORE_CHANGED_CHANNEL frames for sidecar writes. The Library now renders after login.
- `resolved/manage-accounts-panel-stuck.md` (fix in `343a0f6d9`/`ac3557ddb`): the Tauri
  OAuth path never navigated off the login route, and the panel's terminal state update
  was suppressed by a mid-flight teardown. Fixed with handleTauriOAuthSuccess →
  navigate('/login').
- OPEN blind spot recorded in that session: WHY the effect teardown fires mid-login
  (~0-5s after Login Successful) was never diagnosed. Deps `[runner, onLoginSuccess]`
  should be stable. May or may not be related to this latency. NOT relevant to this
  session's fix — the post-fix live log shows `phase=teardown inflight=false` on both
  pre-fix captures, confirming that fix is holding and this is a separate mechanism.
- Plausible shapes worth testing (NOT diagnoses): the Manage Accounts logged-in
  indicator may poll on an interval rather than subscribe to a push signal; or it reads
  a store whose storeChanged frame arrives only when some slower backend step (e.g.
  refreshLibrary completion, ~15s in past logs) rewrites the store; or the sync-store
  snapshot refresh introduced by eb117d9e4 has its own latency for this particular store.
  ELIMINATED — see Eliminated section; the actual cause was backend RPC latency, not a
  render/subscription issue.

## Evidence

- timestamp: 2026-08-03T06:46-06:47 and 06:56-06:57 (live gamelib.log, copied to
    scratchpad/gamelib-snapshot-*.log before trusting it)
  checked: two independent real GOG sign-out/sign-in cycles under the currently-running
    `pnpm tauri:dev` instance (PIDs 12257/12269/12315/12412/12459, up since 02:09)
  found: |
    Both cycles show the identical shape: `status=captured` (native OAuth window closes) ->
    `Logging using GOG credentials` -> `gogdl auth --code` (~5s) -> `Login Successful` ->
    `Checking if login is valid` -> a SECOND `gogdl ... auth` (no --code, ~5s) ->
    `Saved username to config file` -> frontend `[useTauriOAuthLogin] phase=idle` (same
    second) -> `[refreshLibrary] runner=gog origin=login-success` -> `phase=teardown
    inflight=false` (same second — confirms `manage-accounts-panel-stuck`'s fix is holding;
    teardown is a CONSEQUENCE of navigate, not mid-flight).
    Run 1: captured 06:46:36 -> phase=idle/navigate 06:46:47 = 11s.
    Run 2: captured 06:57:15 -> phase=idle/navigate 06:57:25 = 10s.
  implication: |
    Matches the developer's corrected symptom exactly (~10-30s between window-close and the
    in-progress screen clearing, "repeat attempt took ~10s"). `phase=teardown inflight=false`
    on both runs rules out a recurrence of the OLD mid-flight-teardown defect — this is a
    different, new mechanism: legitimate but avoidable backend latency inside the `authGOG`
    RPC itself, specifically a second, redundant `gogdl auth` subprocess call that costs a
    reproducible ~5s of the ~10-11s total in both captures.

- timestamp: 2026-08-03
  checked: src/backend/storeManagers/gog/user.ts (login, getUserDetails, getCredentials) and
    src/common/types.ts (GOGLoginData)
  found: |
    `login()` parses `gogdl auth --code`'s stdout into `data: GOGLoginData`, which already
    has `access_token`. It discards that value and calls `getUserDetails()` with no
    arguments; `getUserDetails()` unconditionally calls `getCredentials()`, which spawns a
    SECOND `gogdl auth` subprocess (no `--code`) whose only consumed output
    (`user.access_token`) duplicates data `login()` already had.
  implication: |
    The second subprocess call is provably redundant for the post-login call path (not for
    the boot-time call path at main.ts:445-460, which has no fresh token and legitimately
    needs it). A minimal, additive fix — passing the already-known access_token through —
    removes exactly this redundant call without touching the boot path.

- timestamp: 2026-08-03 (this session, third attempt)
  checked: |
    Applied fix on disk (`git diff src/backend/storeManagers/gog/user.ts`) and new test
    file (`src/backend/storeManagers/gog/__tests__/user.test.ts`) against main.ts's boot-time
    call site (main.ts:445-460).
  found: |
    main.ts:458 calls `GOGUser.getUserDetails()` with NO argument, exactly as before the
    fix -- the new optional `accessToken` parameter defaults to `undefined`, so `token =
    accessToken ?? (await this.getCredentials())?.access_token` still calls
    `getCredentials()` (the disk-read/refresh `gogdl auth` subprocess) for this call path,
    unchanged.
  implication: |
    The boot-time revalidation path is genuinely untouched, as the reasoning checkpoint
    predicted. Test 2 in the new suite (`getUserDetails() called with NO token...`) pins
    this exactly (asserts exactly one `['auth']`-no-code subprocess call).

- timestamp: 2026-08-03 (this session, third attempt)
  checked: |
    `pnpm test:ci` (full suite, `--runInBand --silent`), run TWICE in a row on the working
    tree with the fix + new test file in place.
  found: |
    Both runs: 185/185 test suites passed, 3591/3591 tests passed, 0 failures. The single
    failing test a prior attempt (session 2) flagged as needing pre-existing-vs-caused-by-fix
    triage did NOT reproduce in either run -- no test name or file was recorded by that
    prior attempt before it died, so it could not be targeted directly, but a full clean
    double run rules out this fix as an ongoing/deterministic cause.
  implication: |
    Consistent with this project's own recorded lesson (`flake-baselines-can-be-undiagnosed-bugs.md`)
    that failures can be transient/flaky rather than real regressions. Two consecutive
    full-suite green runs is the strongest evidence obtainable without the original prior
    attempt's specific failure output, which was never captured to disk before that attempt
    died. Proceeding is justified; if this resurfaces, it is NOT this fix (see Eliminated).

- timestamp: 2026-08-03 (this session, third attempt)
  checked: |
    `pnpm codecheck` (tsc --noEmit) on the full project; `npx eslint` on the two changed
    files, then `git stash` isolating just `src/backend/storeManagers/gog/user.ts`'s fix
    (not the new test file, not the unrelated `.vscode/settings.json` working-tree change)
    to lint the UNMODIFIED file for comparison.
  found: |
    tsc: clean, zero errors/output. eslint on changed files: 0 errors, 11 warnings (3 in
    the new test file, 8 in user.ts). Stashing just the user.ts fix and re-linting the
    unmodified file: also 0 errors, 8 warnings, IDENTICAL pattern
    (`no-unsafe-assignment`/`no-unsafe-member-access` on `JSON.parse(stdout...)` results at
    the same relative lines, only shifted by the added comment lines). The fix introduces
    zero new warnings.
  implication: |
    The fix is lint-clean relative to the existing codebase baseline; the pre-existing
    `no-unsafe-*` warnings on this file are an existing pattern (untyped `gogdl` CLI JSON
    output), not something this change worsens.

- timestamp: 2026-08-03T08:43 (live gamelib.log, copied to scratchpad/gamelib-liveverify.log
    before trusting it)
  checked: |
    Live verification by the developer under `pnpm tauri:dev`, AFTER a full rebuild
    (`electron-vite build` + `build:sidecar`, since `tauri:dev` only rebuilds the sidecar
    at launch — see project gotcha). Two re-login attempts: first WITHOUT rebuilding
    (~50s stopwatch — stale sidecar still running old code, expected and discarded), then
    after the rebuild (~15s stopwatch, with log detail below).
  found: |
    08:43:02 `[oauthLoginCapture] runner=gog status=captured` (native OAuth window closes)
    08:43:02 `gogdl ... auth --code <redacted>` (first call, unchanged by this fix, 8s)
    08:43:10 `Login Successful` -> 08:43:10 `Checking if login is valid` -> 08:43:11
    `Saved username to config file` -- 1s, and NO second `gogdl auth` subprocess between
    them (pre-fix baseline had this leg costing 5s).
    08:43:11 `[useTauriOAuthLogin] runner=gog phase=idle`.
    Capture-to-idle: 9s total, ~8s of it the untouched first `gogdl auth --code` network
    exchange. GOG shows logged in correctly afterward (username saved, phase=idle,
    library refresh triggered) -- the userData.json fetch survived the fix.
    Two further `gogdl auth` invocations appear at 08:43:11 and 08:43:15, AFTER
    phase=idle -- off this bug's critical path (see reasoning_checkpoint blind_spots #3).
  implication: |
    LIVE-VERIFIED. The redundant-subprocess leg is eliminated exactly as predicted: pre-fix
    captures cost ~10-11s end to end with a measured 5s redundant leg; post-fix capture
    costs 9s end to end with zero redundant leg, leaving only the untouched first `gogdl
    auth --code` call. Matches the developer's own live confirmation ("confirmed fixed").

## Eliminated

- hypothesis: |
    The single test failure a prior (second) attempt flagged as needing triage
    (pre-existing vs. caused by this fix) was caused by this fix.
  evidence: |
    Two consecutive full `pnpm test:ci` runs on the working tree WITH the fix applied are
    both 100% green (185/185 suites, 3591/3591 tests, zero failures). The prior attempt's
    failure did not reproduce and its specific test name/output was never captured to disk
    before that attempt was killed by an infrastructure disconnect, so it cannot be proven
    pre-existing by direct A/B comparison -- but it is ruled out as an ONGOING or
    DETERMINISTIC consequence of this fix, which is what mattered for shipping it.
  timestamp: 2026-08-03T00:00:00Z

- hypothesis: |
    The Manage Accounts logged-in indicator polls on an interval rather than subscribing
    to a push signal, or reads a store whose storeChanged frame arrives only when a
    slower backend step (e.g. refreshLibrary completion) rewrites it, or the eb117d9e4
    sync-store snapshot refresh has its own latency for this particular store.
  evidence: |
    Live logs (both pre-fix and post-fix) show the in-progress screen clearing in the SAME
    second as `[useTauriOAuthLogin] phase=idle`, which itself fires in the same second as
    `Saved username to config file` -- i.e. the render is driven directly and immediately
    by the RPC's own resolution, not by a separate poll or a delayed store frame. The delay
    was entirely inside the backend RPC (the redundant `gogdl auth` subprocess), not in any
    render/subscription mechanism.
  timestamp: 2026-08-03

## Resolution

root_cause: |
  `GOGUser.login()` (src/backend/storeManagers/gog/user.ts) discarded the `access_token`
  already returned by its `gogdl auth --code` subprocess call and then called
  `getUserDetails()` with no arguments. `getUserDetails()` unconditionally called
  `getCredentials()`, which spawned a SECOND, redundant `gogdl auth` CLI subprocess (no
  `--code`) purely to re-derive the same access_token value for a single downstream use
  (the Authorization header on the `userData.json` HTTP call). This second subprocess sat
  directly on the critical path between the native OAuth window closing and the frontend's
  "Signing in to Gog" in-progress screen clearing (`useTauriOAuthLogin`'s `phase: 'idle'`
  navigate), and was measured at a reproducible ~5s in two independent pre-fix live log
  captures 11 minutes apart in the same running session (06:46:42->06:46:47 and
  06:57:20->06:57:25).
fix: |
  Gave `getUserDetails()` an optional `accessToken` parameter. `login()` now passes the
  access_token it already has from the `--code` exchange straight through, so
  `getUserDetails()` uses it directly instead of calling `getCredentials()` when a token is
  supplied. The boot-time caller (main.ts:458, `runOnceWhenOnline`) has no fresh token in
  hand and continues to call `getUserDetails()` with no argument, preserving its original
  disk-read/refresh behavior via `getCredentials()` unchanged. Files:
  `src/backend/storeManagers/gog/user.ts`.
verification: |
  LIVE-VERIFIED by the developer (2026-08-03) — CONFIRMED FIXED.

  Automated verification (this session):
  - main.ts:458's boot-time call site confirmed unaffected by direct code read (calls
    `getUserDetails()` with zero arguments, same as before the fix).
  - New regression tests (`src/backend/storeManagers/gog/__tests__/user.test.ts`) pin both
    call paths: `login()` now spawns exactly ONE `gogdl auth` subprocess (asserts
    `mockRunRunnerCommand` called once, with `--code`) and reuses the returned
    `access_token` verbatim in the `userData.json` Authorization header; the no-argument
    `getUserDetails()` path still spawns exactly one `gogdl auth` (no `--code`) subprocess,
    unchanged.
  - Full suite (`pnpm test:ci`) green twice in a row: 185/185 suites, 3591/3591 tests, 0
    failures. `pnpm codecheck` (tsc --noEmit): clean. `eslint` on changed files: 0 errors,
    11 warnings, all pre-existing pattern (verified via `git stash` A/B against the
    unmodified file -- identical 8 warnings on user.ts, same lines, zero new).

  Live verification (developer, `pnpm tauri:dev` after `electron-vite build` +
  `build:sidecar` rebuild — log preserved at scratchpad/gamelib-liveverify.log):
  - Post-fix capture-to-idle: 9s total (08:43:02 `status=captured` -> 08:43:11
    `phase=idle`), of which ~8s is the untouched first `gogdl auth --code` call and the
    redundant second subprocess leg (previously ~5s) is ABSENT — `Login Successful` ->
    `Checking if login is valid` -> `Saved username to config file` collapsed to 1s.
  - GOG shows logged in correctly afterward; the userData.json fetch survived on the
    reused token.
  - Two further `gogdl auth` invocations observed at 08:43:11 and 08:43:15, AFTER
    phase=idle — off this bug's critical path (post-login library-refresh calling
    getCredentials(), not touched by this fix). Flagged as an observation for any future
    GOG-refresh-latency work, not a gap in this fix.
files_changed:
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/gog/__tests__/user.test.ts
