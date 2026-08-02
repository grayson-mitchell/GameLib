---
status: fixed
trigger: "reduce the number of gogdl/legendary/nile process spawns on the GOG login/boot/refresh paths — each spawn now carries a proven, unfixable-in-repo ~5-13s OS-level tax (see follows:), so the only remaining lever is call-count"
created: 2026-08-03T16:00:00Z
updated: 2026-08-03T19:00:00Z
phase: 34.5
tracks: fix follow-up to the diagnosed .planning/debug/resolved/gogdl-spawn-tax.md — implements the 4 findings from that session's spawn call-graph audit, plus a 5th developer-approved fix (seed the TTL cache from login()) added after live-verification of fixes 1-4
follows: .planning/debug/resolved/gogdl-spawn-tax.md, .planning/debug/resolved/manage-accounts-slow-update.md
---

## Current Focus

hypothesis: |
  All 5 fixes are now live-confirmed. Fixes 1-3 were live-confirmed via
  scratchpad/gamelib-liveverify2.log (3 --version spawns at boot, was 9; single gogdl auth
  spawn across a full GOG library refresh, zero per pagination page, was a duplicate spawn
  4s apart). Fix 5 is live-confirmed via scratchpad/gamelib-liveverify4.log: zero gogdl
  spawns between phase=idle (10:07:15) and refreshLibrary complete (10:07:17) in the
  post-login refresh window, previously one spawn costing 7-17s. Fix 4 remains
  unit-verified only — live verification blocked on the unrelated unported getInstallInfo
  IPC channel (known gap-cycle-6 blocker), not a gap of this session.
test: null
expecting: null
next_action: |
  DONE. Session finalized and archived to resolved/gog-spawn-reduction.md.

fix5_reasoning_checkpoint:
  hypothesis: |
    login()'s own `gogdl auth --code` exchange (GOGLoginData) already contains everything
    the fix-1 TTL cache needs (access_token, refresh_token, user_id, expires_in) to serve
    the very next getCredentials() call — the post-login library refresh — without spawning
    a second `gogdl auth`. GOGLoginData does NOT structurally satisfy GOGCredentials (the
    cache's declared type), so seeding the cache requires an explicit field mapping, not a
    cast.
  confirming_evidence:
    - "common/types.ts:431-438 (GOGLoginData) declares only expires_in, access_token,
      refresh_token, user_id, loginTime, error? — it does NOT declare token_type, scope,
      session_id, or loginType."
    - "common/types/gog.ts:523-532 (GOGCredentials) declares token_type, scope, session_id,
      and loginType as REQUIRED (non-optional) fields — a genuine structural mismatch, not
      an assumption."
    - "grep across every GOGUser.getCredentials() consumer in the codebase (gog/games.ts:146,
      340,866,1251,1373; gog/presence.ts:35,78; gog/library.ts:128,239,337,340,518,965;
      discounts/index.ts:128) shows only .access_token, .user_id, and .expires_in (the
      cache's own TTL logic) are ever read from the returned GOGCredentials. token_type/
      scope/session_id/loginType are declared on the type but consumed nowhere."
    - "live-verify2.log 09:51:08-09 — 'Login Successful' -> 'Saved username' is 1s with no
      spawn between (fix 2 already confirmed this leg dead); the redundant spawn the
      developer flagged is the SEPARATE post-login refreshLibrary call at 09:51:09, which
      calls getCredentials() fresh with an empty cache."
  falsification_test: |
    If any getCredentials() consumer read token_type/scope/session_id/loginType, seeding
    the cache with placeholder values for those fields would silently corrupt real request
    behavior (e.g. a wrong Authorization scheme). NOT FALSIFIED: the consumer grep above is
    exhaustive across every GOG file that calls GOGUser.getCredentials() and found zero
    reads of those four fields.
  fix_rationale: |
    Map GOGLoginData -> GOGCredentials explicitly (loginDataToCredentials()), carrying real
    values for the 4 fields every consumer actually reads (access_token, refresh_token,
    user_id, expires_in) and placeholder values for the 4 unread-anywhere fields. This
    resolves the root cause (cold cache right after login) without force-casting past a
    real type mismatch, and without inventing behavior no caller depends on.
  blind_spots: |
    If a FUTURE caller of getCredentials() starts reading token_type/scope/session_id/
    loginType, the login()-seeded cache entry will silently hand it placeholder data
    ('bearer'/''/''/0) instead of erroring — this is a latent trap for any new consumer
    added later without checking this comment. Not live-tested against gogdl's actual
    `auth --code` stdout shape (only tested via the same mocked-JSON pattern the existing
    suite uses) — flagged for the developer's live-verification pass, though the mapped
    fields (access_token/refresh_token/user_id/expires_in) are the same ones fix 1-4's
    already-live-verified code paths already trust from this exact stdout.

reasoning_checkpoint:
  hypothesis: |
    Fix 4's open question ("is getInstallInfo()'s getCredentials() call load-bearing for
    token freshness?") resolves to NO. The pre-check fetches credentials purely as a
    login-gate; its return value is never used again in the function. It is safe to replace
    with the cheap local isLoggedIn() check (no gogdl spawn at all), matching the plan's
    stated goal of ZERO gogdl spawn for this check.
  confirming_evidence:
    - "library.ts:657-661 — `const credentials = await GOGUser.getCredentials(); if (!credentials) { logError(...); return }` — `credentials` is never referenced again anywhere else in `getInstallInfo()` (confirmed via grep across the whole function body, lines 618-842). Contrast with getGalaxyLibrary (line 330/335/338) and checkForGameUpdate (line 953) which DO consume `credentials.access_token`/`user_id` in headers/URLs."
    - "library.ts:1461-1477 (runRunnerCommand) — every gogdl invocation, including the `info` subcommand getInstallInfo() itself calls at line 683, passes the SAME `--auth-config-path authConfig` pointing at the shared gog_store/auth.json file."
    - "Web research (heroic-gogdl docs/README): gogdl manages its own authentication per invocation from the auth-config-path file it's given — each subcommand reads/refreshes/persists its own token state independently. This is not a GameLib-specific assumption; it's documented upstream behavior of the CLI tool itself."
    - "git log -L657,661:library.ts — this credentials pre-check traces back through the Jan 2024 GOG refactor (2f88dc9af) with no commit message or comment ever describing it as a deliberate freshness-priming step; it reads as a copy of the same 'fetch credentials as a login gate' pattern used elsewhere in this file, not a documented side-effecting call."
    - "This matches the EXACT bug class already confirmed and fixed once in this codebase: resolved/manage-accounts-slow-update.md found login()'s pre-emptive getCredentials() call before a downstream CLI call that manages its own auth was provably redundant, not load-bearing."
  falsification_test: |
    If gogdl's `info` subcommand did NOT independently refresh/manage its own auth from
    auth.json (i.e. it trusted an already-refreshed token some OTHER process call must have
    written first), then removing the pre-check would cause `gogdl info` to silently run
    against a stale/expired token. NOT FALSIFIED: gogdl's documented per-invocation
    auth-config-path model means every subcommand — including `info` — independently
    handles its own token refresh from the same file, exactly as the login-flow sibling fix
    already established for `gogdl auth`.
  fix_rationale: |
    Swap `GOGUser.getCredentials()` for `GOGUser.isLoggedIn()` (a synchronous local
    configStore read, zero subprocess spawns) as the login gate in getInstallInfo(). This
    removes a gogdl spawn that was never load-bearing for the subsequent `gogdl info` call's
    own auth, achieving the plan's stated goal (opening a game's details view triggers zero
    gogdl spawns purely to check login state) rather than the weaker "still spawns but maybe
    cache-hits" outcome fix 1's TTL cache alone would give on a cold cache.
  blind_spots: |
    isLoggedIn() checks a local config flag, not actual token validity — if the refresh
    token itself has been revoked server-side, the pre-check will no longer catch that
    upfront with the clean 'No credentials, cannot get install info' log message; instead
    `gogdl info` will run, fail on its own auth attempt, and getInstallInfo()'s existing
    `!res.stdout || res.abort` handling below takes over (already-present code path, not
    new). This is a behavior change in ERROR MESSAGE/PATH only for the revoked-token edge
    case, not a behavior change in the success path. Not live-tested against an actually
    revoked GOG token in this session — flagged for the developer's live-verification pass.

## Symptoms

expected: |
  - Boot: exactly 3 `--version` spawns (one each gogdl/legendary/nile), not 9.
  - GOG library refresh: a single `gogdl auth` spawn, not one per pagination page and not
    a duplicate back-to-back pair.
  - Opening a game's details view for the first time: no gogdl spawn purely to check login
    state, if fix 4 is applied.
  - Login/refresh wall-clock time drops by roughly (spawns_eliminated x 5-13s).
actual: |
  GOGUser.getCredentials() is called from 15 sites with zero caching. Two fire back-to-back
  inside a single refresh() (live-log-proven 08:43:11 / 08:43:15). getGalaxyLibrary()
  re-derives credentials on every paginated page. getSystemInfo()'s cache stores the
  resolved value but not the in-flight promise, so concurrent boot-time callers race past
  it — live log shows 9 --version spawns in a 4s boot window instead of 3.
errors: none — functionally correct, purely a redundant-spawn / latency problem.
timeline: |
  Diagnosed 2026-08-03 in the audit phase of the now-closed gogdl-spawn-tax session.
reproduction: |
  See "Live-verification script for the developer" to be filled into Resolution.verification
  once fixes land — boot log spawn count, refresh spawn count, details-view spawn count,
  timing deltas.

## Evidence already gathered (2026-08-03, audit — see resolved/gogdl-spawn-tax.md for full detail)

- `GOGUser.getCredentials()` (`gog/user.ts:126-149`) has no caching; 15 call sites identified
  across login/boot/library-refresh/other (games.ts syncSaves/getGOGPlaytime/achievements/
  install, discounts/index.ts, presence.ts 5-min interval).
- `GOGLibraryManager.refresh()` (`library.ts:485`) fetches credentials, then calls
  `getGalaxyLibrary()` (`library.ts:330`) which independently re-fetches them — live-log-
  confirmed as two `gogdl auth`-class spawns 4s apart (08:43:11 / 08:43:15) in a single
  refresh cycle.
- `getGalaxyLibrary()`'s pagination recursion (`library.ts:361`) re-derives credentials on
  every page — cost scales linearly with GOG library page count for this account.
- `getInstallInfo()` (`library.ts:657`) fetches credentials purely as a login-gate, never
  uses the returned value, then makes its own separate `gogdl info` call. Open question at
  audit time: is the credentials fetch deliberately side-effecting (refreshing auth.json)
  for the subsequent CLI call to read fresh state? NOT YET RESOLVED — resolve via git
  log/blame + upstream Heroic history + downstream-consumer check before deciding whether
  to apply fix 4 (see Constraints).
- `getSystemInfo()` (`systeminfo/index.ts:75-89`, called from `logger/index.ts:165` backend
  boot and `Login/index.tsx:70` frontend boot) has a real `cachedSystemInfo` value-cache, but
  it is raced: live capture shows 9 `--version` spawns (3x the expected 3) in a 4s boot
  window because concurrent uncached callers each start their own spawn before the first
  resolves.
- `refreshLegendary()` / Nile `refresh()` classified NECESSARY — these runners read/refresh
  their own on-disk session state per call, unlike GOG's JS-mediated token model. Not in
  scope for this session.

## Hypotheses to discriminate (NOT diagnoses — each needs a falsification test)

N/A for this session — root causes for fixes 1-3 are already evidence-confirmed by the
prior audit (see Evidence above), not hypotheses needing falsification. Fix 4's ONE open
question (does the getInstallInfo() credentials call have a load-bearing freshness side
effect?) must be resolved from evidence before implementing:
  - git log/blame on `library.ts:657` and its surrounding function
  - upstream Heroic history if visible locally (this code is inherited from Heroic, not
    GameLib-original — there is no other author to ask)
  - whether any downstream consumer of getInstallInfo relies on getCredentials' refresh
    writing auth.json that the subsequent `gogdl info` CLI call then reads
  If evidence shows it IS load-bearing: fix 1's TTL cache (keyed on the token's own
  expires_in) preserves that same freshness guarantee, so the swap to isLoggedIn() is safe
  to make anyway ONLY if that guarantee genuinely holds under the cache. If ambiguous after
  this review: leave fix 4 OUT of this session's changes and record why at the checkpoint —
  do not guess.

## Constraints

- Do NOT reopen or edit `.planning/debug/resolved/gogdl-spawn-tax.md` — that session is
  closed; this is a new, separate follow-up session that references it via `follows:`.
- House rules: match surrounding code style; the Electron build must keep working unchanged
  (these are `src/backend` files shared by both the Electron and Tauri/sidecar shells —
  do not special-case one shell).
- Add regression tests mirroring existing patterns. The sibling manage-accounts-slow-update
  fix added `gog/__tests__/user.test.ts` — EXTEND that file rather than duplicating it where
  sensible; add a parallel test file for `library.ts` / `systeminfo/index.ts` changes if none
  exists yet.
- Verify locally before returning: `pnpm test:ci` green, `npx tsc --noEmit` clean, `eslint`
  no new warnings on changed files. These are NOT sufficient on their own — standing project
  lesson: never accept a mutating call's own report as proof of effect. A live-verification
  script is still required at the checkpoint; the developer live-verifies before commit.
- Do NOT commit. Stop at a checkpoint (goal: find_and_fix means implement + verify locally,
  but this session's checkpoint must land BEFORE any git commit — list what changed per fix,
  local test/tsc/eslint results, and a live-verification script for the developer covering:
  boot log shows 3 version probes not 9; a GOG library refresh shows a single gogdl auth
  spawn, none per pagination page; details view opens without a gogdl spawn (if fix 4
  applied); login/refresh timing deltas before/after.
- Fix 4 is conditional — implement it only if the evidence review clears it; otherwise
  implement fixes 1-3 only and explain fix 4's exclusion at the checkpoint.

## Evidence

- timestamp: 2026-08-03 (this session)
  checked: |
    git log -L657,661:library.ts (git blame history of the getInstallInfo() credentials
    pre-check), grep of `credentials` usage across the whole getInstallInfo() function
    body, web research on heroic-gogdl's auth-config-path model
  found: |
    `credentials` fetched at library.ts:657 (pre-fix) is never referenced again anywhere
    else in getInstallInfo() -- contrast with getGalaxyLibrary/checkForGameUpdate/
    postPlaytimeSession which DO consume credentials.access_token/user_id. gogdl manages
    its own auth per-invocation from the shared --auth-config-path file (confirmed via
    upstream docs), independently for every subcommand including `info`. No commit
    message or comment across the credentials pre-check's history describes it as a
    deliberate freshness-priming step.
  implication: |
    Fix 4's open question resolves to NOT load-bearing. Cleared for implementation --
    see reasoning_checkpoint in Current Focus for the full analysis.

- timestamp: 2026-08-03 (this session)
  checked: |
    Implemented all 4 fixes, then ran `pnpm test:ci`-equivalent (`npx jest --runInBand
    --silent`), `npx tsc --noEmit`, and `npx eslint` on all 3 changed source files
    (before/after comparison via `git stash`) plus the 3 new/extended test files.
  found: |
    Full suite: 187/187 test suites, 3602/3602 tests, 0 failures, exit code 0 (a
    "Jest did not exit one second after..." advisory appeared in the full run but NOT
    when the 3 new/modified test files were run in isolation with --detectOpenHandles --
    confirmed pre-existing/unrelated to this session's changes, not a regression).
    tsc --noEmit: clean, zero errors. eslint on the 3 changed SOURCE files: 68 warnings
    both before (git-stashed baseline) and after this session's changes -- IDENTICAL
    count, zero new warnings introduced. New/extended test files carry their own
    warnings (unsafe-any patterns from untyped jest mock factories), consistent with
    the sibling manage-accounts-slow-update session's own test file precedent.
  implication: |
    All 4 fixes are locally verified clean. Per standing project lesson (never accept a
    mutating call's own report as proof of effect), this is NOT sufficient on its own --
    live verification by the developer is still required before this session closes.

- timestamp: 2026-08-03 (this session, post-checkpoint)
  checked: |
    Developer's live boot log (scratchpad/gamelib-liveverify2.log, self-read and relayed
    at checkpoint) against fixes 1-4's expected outcomes.
  found: |
    Fix 3 LIVE-CONFIRMED: exactly 3 `--version` spawns at boot (09:50:22,
    gogdl/nile/legendary), was 9. Fixes 1+2 LIVE-CONFIRMED: the GOG library refresh
    (09:51:09-09:51:26) spawned exactly ONE `gogdl auth`, zero per pagination page;
    refresh reported as "instant" with no disappear/reappear flicker. The old redundant
    leg (Login Successful -> Saved username) stays dead: 1s, no spawn between. Fix 4:
    NOT live-verifiable — the game details screen is unreachable under Tauri because
    `getInstallInfo` is unported (known gap-cycle-6 IPC blocker, unrelated to this
    session). Remaining latency (`gogdl auth --code` taking 24s this run vs 8s in the
    morning run) is GOG-side variance, out of scope.
  implication: |
    Fixes 1-3 are live-confirmed CLOSED. Fix 4 is unit-verified only; live verification
    is blocked on the getInstallInfo Tauri port gap, not a gap of this session — recorded
    as such rather than as an open item here. Developer approved one more change (fix 5,
    below) before commit: the post-login refresh at 09:51:09 still spawned a fresh
    `gogdl auth` because the fix-1 cache was empty right after login, even though
    login()'s own stdout already had the token.

- timestamp: 2026-08-03 (this session, fix 5)
  checked: |
    common/types.ts GOGLoginData vs common/types/gog.ts GOGCredentials field-by-field;
    grep of every GOGUser.getCredentials() consumer across gog/games.ts, gog/presence.ts,
    gog/library.ts, discounts/index.ts for which GOGCredentials fields are actually read.
  found: |
    GOGLoginData declares only expires_in/access_token/refresh_token/user_id/loginTime/
    error? — GOGCredentials additionally requires token_type/scope/session_id/loginType
    as non-optional. Genuine structural mismatch confirmed from the type declarations
    themselves, not assumed. Every getCredentials() consumer in the codebase reads only
    .access_token, .user_id, and .expires_in from the returned value — the 4 mismatched
    fields are declared but never consumed anywhere.
  implication: |
    Force-casting `data as GOGCredentials` would have hidden a real type mismatch.
    Implemented `loginDataToCredentials()` in gog/user.ts to explicitly map the 4 real
    fields and placeholder the 4 never-consumed ones, then had login() seed
    cachedCredentials/cachedCredentialsFetchedAt with it right after a successful
    `gogdl auth --code` exchange — same expires_in-minus-60s keying as fix 1, cleared by
    the same logout() path.

- timestamp: 2026-08-03 (this session, fix 5 gates)
  checked: |
    `npx jest src/backend/storeManagers/gog/__tests__/user.test.ts --runInBand --silent`
    (isolated), then full `npx jest --runInBand --silent`, `npx tsc --noEmit`, and an
    eslint before/after comparison (`git stash` on just the session's changed files vs
    HEAD) across all 6 files touched this whole session (fixes 1-5).
  found: |
    user.test.ts: 7/7 passing (5 existing + 2 new regression tests for fix 5). Full
    suite: 187/187 suites, 3604/3604 tests, 0 failures, exit code 0 (2 more tests than
    the prior 3602 baseline, matching the 2 tests fix 5 added; same pre-existing
    "Jest did not exit" advisory as before, confirmed unrelated). tsc --noEmit: clean,
    zero errors. eslint on the 3 source files (user.ts/library.ts/systeminfo/index.ts):
    67 warnings both stashed-baseline and with fix 5 applied — IDENTICAL, zero new
    warnings. Full 6-file set (source + tests): 88 warnings total, 0 errors — test-file
    warning counts (unsafe-any from untyped jest mocks) match the established pattern
    from fixes 1-4's own test files.
  implication: |
    Fix 5 is locally verified clean, same standard as fixes 1-4. Still requires the
    developer's live sign-out/sign-in check before this session closes — a green
    suite/self-report is not proof of effect (standing project lesson).

- timestamp: 2026-08-03 (this session, fix 5 live verification, post-rebuild)
  checked: |
    Developer's live sign-out/sign-in log (scratchpad/gamelib-liveverify4.log, self-read
    and relayed at checkpoint) against fix 5's expected outcome, following a fresh
    `electron-vite build` + `build:sidecar` rebuild.
  found: |
    10:06:47 status=captured -> gogdl auth --code spawn -> 10:07:14 Login Successful
    (27s; the `gogdl auth --code` exchange itself varies 5-27s across the 4 runs
    measured across this session: 8s/24s/5s/27s -- GOG-endpoint-side variance, out of
    scope for fix 5 since the exchange is not what any of the 5 fixes target).
    10:07:15 phase=idle -> 10:07:15 refreshLibrary runner=gog -> 10:07:17 refreshLibrary
    complete: ZERO gogdl spawns in that window, was one spawn costing 7-17s. Checkpoint's
    success criterion (zero gogdl auth spawns between phase=idle and refreshLibrary
    complete) met exactly.
  implication: |
    Fix 5 LIVE-CONFIRMED. All 5 fixes are now either live-confirmed (1, 2, 3, 5) or
    unit-verified with live-verification blocked on an unrelated, separately-tracked gap
    (4). Session ready to close.

## Eliminated

## Resolution

root_cause: |
  Five independent, evidence-confirmed sources of redundant gogdl/legendary/nile process
  spawns on the GOG login/boot/refresh paths, each spawn carrying the unfixable-in-repo
  ~5-13s OS-level tax documented in resolved/gogdl-spawn-tax.md:
  1. `GOGUser.getCredentials()` (gog/user.ts) had zero caching across its 15 call sites,
     so every call -- including ones seconds apart -- spawned its own `gogdl auth`.
  2. `GOGLibraryManager.refresh()` fetched credentials, then called `getGalaxyLibrary()`,
     which independently re-fetched them again (live-log-confirmed 2 spawns 4s apart in
     one refresh cycle); `getGalaxyLibrary()`'s pagination recursion also re-derived
     credentials on every page, scaling with library page count.
  3. `getSystemInfo()`'s value-cache only helped sequential callers; concurrent boot-time
     callers (backend boot log, frontend boot IPC, isMacSonomaOrHigher) raced past it
     before the first resolved -- live-log-confirmed 9 `--version` spawns in a 4s boot
     window instead of the expected 3.
  4. `getInstallInfo()` fetched credentials purely as a login gate; the value was never
     used again in the function (confirmed via full-function grep), and the downstream
     `gogdl info` CLI call manages its own auth independently from the same
     `--auth-config-path` file (confirmed via upstream heroic-gogdl documentation) -- the
     pre-check was not load-bearing for token freshness.
  5. Found via live-verification of fixes 1-4 (live-verify2.log 09:51:09): fix 1's TTL
     cache starts empty right after login, so the FIRST getCredentials() call after a
     fresh login -- the post-login library refresh -- still spawned its own `gogdl auth`,
     even though login()'s own `gogdl auth --code` exchange had already obtained a fresh
     token in the exact same shape the cache needs.
fix: |
  1. Added a session-lifetime TTL cache to `GOGUser.getCredentials()` keyed on the
     token's own `expires_in` (minus a 60s safety margin), cleared on `logout()`.
     `src/backend/storeManagers/gog/user.ts`.
  2. Threaded the credentials `refresh()` already fetches directly into
     `getGalaxyLibrary()`, including every recursive pagination call, so pagination no
     longer re-fetches credentials per page and `refresh()` no longer fetches them
     twice. `src/backend/storeManagers/gog/library.ts`.
  3. Added in-flight-promise memoization to `getSystemInfo()`: concurrent `cache=true`
     callers now share the same in-flight fetch instead of each starting their own set
     of version-probe spawns. `src/backend/utils/systeminfo/index.ts`.
  4. Swapped `getInstallInfo()`'s `GOGUser.getCredentials()` login-gate for
     `GOGUser.isLoggedIn()` (a synchronous local config read, zero subprocess spawns),
     since the credentials value was never consumed and the downstream CLI call handles
     its own auth. `src/backend/storeManagers/gog/library.ts`.
  5. `login()` now seeds the fix-1 TTL cache directly from its own `gogdl auth --code`
     stdout, via a new `loginDataToCredentials()` mapper. GOGLoginData (login()'s parsed
     stdout type) does not structurally satisfy GOGCredentials (the cache's type) --
     GOGCredentials requires `token_type`/`scope`/`session_id`/`loginType`, which
     GOGLoginData doesn't declare. Confirmed via grep that no getCredentials() consumer
     in the codebase reads those 4 fields (only `access_token`/`user_id`/`expires_in`
     are read anywhere), so the mapper carries real values for the 4 read fields and
     placeholders the 4 unread ones, rather than force-casting past the mismatch.
     `src/backend/storeManagers/gog/user.ts`.
verification: |
  LOCALLY VERIFIED (this session): full test suite green (187/187 suites, 3604/3604
  tests -- 2 more than the 3602 baseline, matching fix 5's 2 new regression tests), tsc
  clean, eslint zero new warnings (67 vs 67 stashed-baseline on the 3 changed source
  files; 88 warnings/0 errors across the full 6-file set including tests, consistent
  with the established test-file pattern). New/extended regression tests pin each fix's
  spawn-count behavior directly (see files_changed).

  LIVE-VERIFIED across two log captures in scratchpad/ (both preserved in the session
  scratchpad):

  - scratchpad/gamelib-liveverify2.log: Fix 3 CONFIRMED -- exactly 3 `--version` spawns
    at boot (09:50:22, gogdl/nile/legendary), was 9. Fixes 1+2 CONFIRMED -- the whole GOG
    library refresh (09:51:09-09:51:26) spawned exactly ONE `gogdl auth`, zero per
    pagination page, was one duplicate spawn 4s apart; refresh reported as "instant" with
    no disappear/reappear flicker; the old redundant login->getUserDetails leg stays dead
    (1s, no spawn between).
  - scratchpad/gamelib-liveverify4.log: Fix 5 CONFIRMED -- 10:06:47 status=captured ->
    gogdl auth --code spawn -> 10:07:14 Login Successful, then 10:07:15 phase=idle ->
    10:07:15 refreshLibrary runner=gog -> 10:07:17 refreshLibrary complete with ZERO
    gogdl spawns in that window (previously one spawn costing 7-17s). The checkpoint's
    success criterion (zero gogdl auth spawns between phase=idle and refreshLibrary
    complete) is met exactly.

  Fix 4 UNIT-VERIFIED ONLY -- live verification is blocked on an unrelated gap: the game
  details screen is unreachable under Tauri because `getInstallInfo` is unported (known
  gap-cycle-6 IPC blocker). This is NOT a gap of this session; it is a pre-existing IPC
  port dependency this session's fix cannot exercise live until that channel lands.

  The `gogdl auth --code` exchange itself (the initial login network round-trip, not
  touched by any of these 5 fixes) varies 5-27s across the 4 live runs measured this
  session (8s/24s/5s/27s) -- this is GOG-endpoint-side variance, recorded here as
  environmental and explicitly out of scope for this session.
files_changed:
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/gog/library.ts
  - src/backend/utils/systeminfo/index.ts
  - src/backend/storeManagers/gog/__tests__/user.test.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
  - src/backend/utils/systeminfo/__tests__/index.test.ts
