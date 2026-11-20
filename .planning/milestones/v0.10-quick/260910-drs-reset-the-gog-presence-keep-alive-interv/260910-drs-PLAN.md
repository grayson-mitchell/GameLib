---
phase: quick-260910-drs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/gog/presence.ts
  - src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts
  - .planning/todos/pending/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md
autonomous: true
requirements:
  - TODO-2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm
user_setup: []

must_haves:
  truths:
    - "After a deletePresence() call, a subsequent setPresence() call in the SAME process arms a live 5-minute keep-alive again -- proven by a presence POST that fires from the timer, not from the direct call."
    - "Repeated setPresence() calls with a live keep-alive already armed still arm exactly ONE timer -- the fix must not trade a dead-guard defect for a stacked-timer leak."
    - "The interaction between deletePresence()'s four early-return guards (`disablePlaytimeSync`, `(!force && disableGOGPresence)`, `!GOGUser.isLoggedIn()`, `!isOnline()`), its `!credentials` return, and the timer teardown has been AUDITED against every real call site, and the outcome is recorded as decision D-DRS-01 in presence.ts -- either the teardown moved, or it provably belongs where it is."
    - "The regression suite is RED against the pre-fix code and GREEN after -- proven by a captured transcript of both runs, not asserted."
    - "`pnpm codecheck`, `pnpm lint` (both ceilings, unchanged), the scoped backend jest run, and `pnpm planning-gates` are all green at the end."
    - "The todo is moved from pending/ to completed/ with a status: line naming quick-260910-drs and the D-DRS-01 outcome."
  artifacts:
    - path: "src/backend/storeManagers/gog/presence.ts"
      provides: "`interval` widened to `NodeJS.Timeout | undefined` and reset to `undefined` wherever it is cleared, plus the D-DRS-01 guard-ordering decision recorded as a comment"
      contains: "D-DRS-01"
    - path: "src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts"
      provides: "Dedicated keep-alive lifecycle suite: arm -> no-stack -> tear down -> RE-ARM, plus the D-DRS-01 receipt case"
      contains: "D-DRS-01"
    - path: ".planning/todos/completed/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md"
      provides: "The closed todo, moved with git mv, filename unchanged, status: rewritten to RESOLVED"
      contains: "RESOLVED 2026-09-10 by quick-260910-drs"
  key_links:
    - from: "src/backend/storeManagers/gog/presence.ts"
      to: "src/backend/storeManagers/gog/presence.ts"
      via: "deletePresence()'s clearInterval site assigns `interval = undefined`, which is the ONLY thing that lets setPresence()'s `if (!interval)` arm run a second time"
      pattern: "interval = undefined"
    - from: "src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts"
      to: "src/backend/storeManagers/gog/presence.ts"
      via: "default import of the presence module, driven through a full arm/tear-down/re-arm cycle under fake timers"
      pattern: "storeManagers/gog/presence"
---

<objective>
`presence.ts:82`'s `deletePresence()` calls `clearInterval(interval)` but never reassigns
`interval`. `clearInterval` does not mutate its argument, so `interval` keeps holding a
now-dead `Timeout` object and stays truthy forever. `setPresence()`'s `if (!interval)` arm at
`:38-40` is therefore false for the rest of the process, and the 5-minute GOG presence
keep-alive can never re-arm after the first `deletePresence()` call — even though
`setPresence()` itself keeps being called and keeps posting presence successfully.

Purpose: restore the keep-alive's ability to re-arm, and settle — with evidence, not a
"consider" — the second, never-audited question the todo raises: whether `deletePresence()`'s
own early-return guards mean the teardown is sometimes skipped when it should still run.

Output: a one-file production fix, a dedicated RED-proven regression suite, a recorded
decision D-DRS-01, and the todo closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md
@src/backend/storeManagers/gog/presence.ts
@src/backend/sidecar/__tests__/gogPresenceBootWire.test.ts
@src/backend/storeManagers/gog/__tests__/logoutCookies.test.ts

<interfaces>
<!-- Extracted at planning time. Do NOT go exploring for these. -->

`src/backend/storeManagers/gog/presence.ts` (110 lines, module state and default export):
- `let CURRENT_GAME = ''` (:17), `let interval: NodeJS.Timeout` (:18) — module scope, NO initializer.
- `setPresence()` (:24, async): reads `GlobalConfig.get().getSettings()`; early-returns on
  `disableGOGPresence || disablePlaytimeSync || !GOGUser.isLoggedIn() || !isOnline()`; then
  `await GOGUser.getCredentials()` and early-returns on falsy; then the `if (!interval)` arm at
  :38-40; then POSTs `https://presence.gog.com/users/{user_id}/status` via
  `axiosClient.post`. Whole body is inside one try/catch that swallows into `logError`.
- `deletePresence(force = false)` (:67, async): reads the same settings; early-returns on
  `disablePlaytimeSync || (!force && disableGOGPresence) || !GOGUser.isLoggedIn() || !isOnline()`;
  then `await GOGUser.getCredentials()` and early-returns on falsy; THEN `clearInterval(interval)`
  at :82; then `axiosClient.delete` of the same URL. Same swallowing try/catch.
- Module-scope `backendEvents.on('settingChanged', ...)` at :96-104: on `disableGOGPresence`,
  calls `void deletePresence(true)` when the new value is truthy, `void setPresence()` otherwise.
- `export default { setCurrentGame, setPresence, deletePresence }`.

Call sites (already established — do NOT re-derive, and do NOT modify any of these files):
- `src/backend/launcher.ts:269` — `gogPresence.setCurrentGame(appName)` then `await gogPresence.setPresence()` on game start.
- `src/backend/launcher.ts:289` — `gogPresence.setCurrentGame('')` then `await gogPresence.setPresence()` on game stop.
- `src/backend/utils.ts:326` — `await gogPresence.deletePresence()` on the quit path, immediately before `shutdownLongLivedChildren()` and `app.exit()`. NOTE: no `force` argument.
- `src/backend/sidecar/bootstrap.ts:738` — Block H's `setGogPresenceWhenOnline()` calls `gogPresence.setPresence()` inside a `runOnceWhenOnline` callback.
- `presence.ts:96-104` itself — the `settingChanged` listener, the ONLY caller that passes `force = true`.

`src/backend/backend_events.ts`: `export const backendEvents` is a plain Node `EventEmitter`
typed as `TypedEventEmitter<BackendEvents>`; `settingChanged` carries `{ key, oldValue, newValue }`.

Test-harness facts (verified at planning time — do NOT re-derive):
- `src/backend/jest.config.js` sets `displayName: 'Backend'`, `resetMocks: true`,
  `modulePaths: [baseUrl]` (so `backend/...` specifiers resolve inside `jest.mock`), and a
  `setupFiles` containment entry. `resetMocks: true` STRIPS the implementation off every
  `jest.fn(...)` — including one supplied at module-factory time — before EVERY test, the first
  one included. Every mock implementation must therefore be (re)installed in `beforeEach`.
- `src/backend/sidecar/__tests__/structuralContainment.test.ts` runs a `node:os` gate over a walk
  rooted at `src/backend`. The new suite must contain NO reference to the `node:os` specifier and
  no `homedir`/`userInfo` usage — containment is already structural via `setupFiles`.
- The two directory censuses in `src/backend/sidecar/__tests__/testContainment.test.ts` are
  scoped to `readdirSync(__dirname)` (the sidecar `__tests__` dir) and to
  `EXTERNAL_PROJECT_DIRS` (frontend/common/preload/meta). Neither covers
  `src/backend/storeManagers/gog/__tests__`, so the new file needs NO census registration.
- `pnpm lint` routes through `meta/lintScoped.cjs`, which enforces TWO independent ceilings at
  their EXACT measured values with ZERO headroom: `SRC_CEILING = 1123`, `TESTS_CEILING = 638`.
  The new test file is matched by the tests scope glob `**/__tests__/**/*.ts`. It must introduce
  ZERO new eslint warnings. Do NOT touch either ceiling or either `minFiles` floor.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit the guard/teardown interaction and record decision D-DRS-01</name>
  <files>src/backend/storeManagers/gog/presence.ts</files>
  <action>
    Comment-only change in this task — NO behavior change, NO type change yet. Those land in
    Task 2, informed by what this task decides.

    The todo names a second item that must be settled rather than skipped: whether
    `deletePresence()`'s own early-return guards mean `clearInterval` is sometimes skipped in a
    case where the timer should still be torn down. Settle it now, against the real call sites
    listed in the `<interfaces>` block above (do not re-derive that list; do confirm it is
    complete with one repo-wide search for `deletePresence` across `src/`, and record what that
    search returned).

    Build the audit as a guard-by-guard matrix. For EACH of the five ways `deletePresence()`
    returns before reaching `clearInterval(interval)` — `disablePlaytimeSync`,
    `(!force && disableGOGPresence)`, `!GOGUser.isLoggedIn()`, `!isOnline()`, and the falsy
    `credentials` return — answer two questions with evidence:
      1. Which real call site can reach `deletePresence()` with that guard true? Name it.
         (Recall: `utils.ts:326` passes no `force`, so it takes the `!force` branch; the
         `settingChanged` listener is the only `force = true` caller.)
      2. When that guard short-circuits, SHOULD the 5-minute keep-alive still be running? A
         timer that keeps firing after logout, after going offline, or after playtime sync is
         disabled is calling `setPresence()` every 5 minutes into its own no-op gate — state
         that check explicitly rather than assuming it.

    Then pick ONE and record it as decision `D-DRS-01`:
      - Option A: hoist the teardown (the `clearInterval` plus the `interval` reset Task 2 adds)
        ABOVE the settings read and all guards, at the very top of `deletePresence()`, so the
        guards gate only the network DELETE and the local timer is always torn down. If A is
        chosen, state explicitly why unconditional teardown is safe at every call site — in
        particular that no call site expects the keep-alive to survive a `deletePresence()` call.
      - Option B: leave the teardown where it is. If B is chosen, name the specific reachable
        path that makes the current placement correct, and state what observable behaviour makes
        it correct rather than merely tolerable.

    Write D-DRS-01 as a comment block attached to `deletePresence()`. It must contain: the
    literal marker `D-DRS-01`, the guard-by-guard matrix outcome, the chosen option, and the
    rationale in the terms above. Follow the house comment style already used in
    `bootstrap.ts`'s `setGogPresenceWhenOnline()` docblock — plain prose, no bullets-only
    shorthand, no "TODO"/"consider"/"future" language. This decision is being made now, not
    deferred. Also carry the D-DRS-01 outcome forward into the SUMMARY.

    Keep the file prettier-clean by hand (the repo-wide prettier gate is red at HEAD for
    unrelated reasons, so only the touched file is checked).
  </action>
  <verify>
    <automated>grep -vE "^[[:space:]]*(//|\*|/\*)" src/backend/storeManagers/gog/presence.ts | grep -c "clearInterval" | grep -qx 1 && grep -q "D-DRS-01" src/backend/storeManagers/gog/presence.ts && pnpm codecheck && pnpm exec prettier --check src/backend/storeManagers/gog/presence.ts</automated>
  </verify>
  <done>
    `presence.ts` carries a D-DRS-01 comment block naming all five early-return paths, their
    reachable call sites, and a chosen Option A or B with rationale. Exactly one live
    (non-comment) `clearInterval` call still exists and no runtime behaviour changed yet.
    `pnpm codecheck` and the file-scoped prettier check are green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED-prove the re-arm defect, then fix it per D-DRS-01</name>
  <files>src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts, src/backend/storeManagers/gog/presence.ts</files>
  <behavior>
    - Case 1 (THE defect, RED today): a full lifecycle in one ordered test — `setPresence()` arms
      the keep-alive; `deletePresence(true)` tears it down; a THIRD `setPresence()` call arms it
      AGAIN. Proven behaviourally: after the re-arm, advancing fake timers by 5 minutes produces
      an ADDITIONAL `axiosClient.post` to the presence URL. Against the current code the timer
      never re-arms, so that extra POST never happens and the case fails.
    - Case 2 (no stacked timers): calling `setPresence()` twice in a row while a keep-alive is
      already live arms exactly ONE timer — advancing 5 minutes yields exactly one timer-driven
      POST, not two. This is what stops a naive "just call setInterval unconditionally" fix.
    - Case 3 (D-DRS-01 receipt): pins whichever placement Task 1 decided. Under Option A: with
      `disablePlaytimeSync: true` the teardown STILL runs (no live timer survives) while
      `axiosClient.delete` is never called — the guard gates the network call only. Under Option
      B: the same scenario leaves the timer live, and the case's own comment cites D-DRS-01's
      named reachable path as the reason. Either way the case names `D-DRS-01` in its title or
      comment so the decision cannot be silently reverted later.
  </behavior>
  <action>
    Create `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`. Open it with a
    docblock in the house style (see `logoutCookies.test.ts` and `gogPresenceBootWire.test.ts`):
    what defect it pins, why each case is load-bearing, and the D-DRS-01 reference.

    Mocking shape — follow the established gog-suite factories, all before imports:
    `backend/platform` to `{ app: { getVersion: () => '1.0.0' } }`; `backend/logger` to
    `logInfo`/`logError`/`logWarning` jest.fn()s plus `LogPrefix: { Gog: 'Gog' }`;
    `backend/online_monitor` to `{ isOnline: () => true }`; `backend/utils` to a factory
    exposing only `axiosClient` with `post` and `delete` jest.fn()s (never mock the whole real
    utils module — the established pattern is a narrow factory listing only what the unit under
    test consumes); `backend/config` to `{ GlobalConfig: { get: jest.fn() } }`;
    `backend/storeManagers/gog/user` to `{ GOGUser: { isLoggedIn: jest.fn(), getCredentials:
    jest.fn() } }`. Leave `backend/backend_events` REAL — a plain EventEmitter is harmless and
    the module-scope listener registration must keep working.

    `resetMocks: true` strips every factory-time implementation before the first test runs, so
    install ALL of them in `beforeEach`: `GlobalConfig.get` returning an object whose
    `getSettings()` yields `{ disableGOGPresence: false, disablePlaytimeSync: false }`,
    `GOGUser.isLoggedIn` returning true, `GOGUser.getCredentials` resolving
    `{ user_id: 'u1', access_token: 't1' }`, and `axiosClient.post`/`delete` resolving
    `{ status: 204 }`. Cast through `as unknown as ...` rather than `any` — the tests lint scope
    sits at its exact measured ceiling with zero headroom, so a single new warning turns
    `pnpm lint` red.

    Timers: `jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })` in `beforeEach`,
    `jest.useRealTimers()` in `afterEach`. `setPresence()` is async and the interval callback is
    async, so after each `jest.advanceTimersByTime(5 * 60 * 1000)` flush the microtask queue with
    `await new Promise(setImmediate)` — the same flush shape `gogPresenceBootWire.test.ts` case 4
    already relies on. Assert on `axiosClient.post` call counts (behaviour), and use
    `jest.getTimerCount()` only as a secondary structural check, never as the sole assertion.

    Module-state ordering matters: `interval` is module scope and sticky across tests in a file.
    Put the Case 1 lifecycle test FIRST and write it as ONE ordered `it`. If a later case needs a
    virgin `interval`, get it with `jest.isolateModules` plus a fresh require — and keep such
    re-requires to at most two, because each one re-registers the module-scope `settingChanged`
    listener on the real emitter and Node warns past ten.

    Do NOT reference the `node:os` specifier or `homedir`/`userInfo` anywhere in this file.

    RED PROOF, before touching `presence.ts`: run the scoped suite and capture the verbatim
    failing transcript into the SUMMARY. Case 1 MUST fail. If it passes against unfixed code the
    test is measuring nothing — fix the test, not the expectation. Commit the failing suite on
    its own as `test(quick-260910-drs): ...`.

    THEN fix `presence.ts`: widen the declaration at `:18` to
    `let interval: NodeJS.Timeout | undefined`, and assign `interval = undefined` immediately
    after `clearInterval(interval)` — placed per Task 1's D-DRS-01 outcome (top of
    `deletePresence()` under Option A, at the existing site under Option B). Change nothing else:
    `setPresence()`'s `if (!interval)` guard already reads correctly once the reset exists, and
    `clearInterval(undefined)` is a legal no-op so no extra null check is needed. Do not touch
    `launcher.ts`, `utils.ts`, or `bootstrap.ts`. Commit the fix as `fix(quick-260910-drs): ...`.

    Re-run the suite GREEN and capture that transcript too. Then run one mutation proof: revert
    ONLY the `interval = undefined` line, confirm Case 1 goes RED again, restore, confirm GREEN.
    Record all three transcripts in the SUMMARY.
  </action>
  <verify>
    <automated>pnpm exec jest --selectProjects Backend src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts && grep -q "interval = undefined" src/backend/storeManagers/gog/presence.ts && grep -q "NodeJS.Timeout | undefined" src/backend/storeManagers/gog/presence.ts && pnpm codecheck</automated>
  </verify>
  <done>
    The new suite runs under the `Backend` project (exact casing) with a NON-ZERO test count and
    all cases passing; no `--passWithNoTests` anywhere. `presence.ts` declares
    `NodeJS.Timeout | undefined` and resets `interval` at its teardown site. The SUMMARY carries
    three verbatim transcripts: pre-fix RED, post-fix GREEN, and the revert-the-reset mutation
    RED. Two commits exist (test, then fix). No file outside `presence.ts` and the new test file
    changed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the todo and run the full gate set</name>
  <files>.planning/todos/pending/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md</files>
  <action>
    Close the todo following the convention this repo already uses (see commit `6c9d0c795`, which
    closed `2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md`, and the
    completed file itself):
      - `git mv` the file from `.planning/todos/pending/` to `.planning/todos/completed/`. The
        FILENAME does not change.
      - Keep the existing `created`, `title`, `area`, `severity`, `platform`, `ready` keys as they
        are, and ADD a `status:` key whose value is a prose record opening with
        `RESOLVED 2026-09-10 by quick-260910-drs`. It must name: the mechanism fixed (`interval`
        reset after `clearInterval`, declaration widened to `NodeJS.Timeout | undefined`), the
        D-DRS-01 decision and its chosen option with a one-line rationale, and the regression
        suite path `src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts`. Use the
        same YAML block-scalar style the k5x closure used so the long value stays valid YAML.
      - Append a `## Resolution` section to the body recording the two task commit shas from
        Task 2 and, in one sentence, the mutation proof that showed the reset line is
        load-bearing.
    Explicitly close BOTH halves of the todo — the re-arm defect AND the "Likely fix" section's
    second bullet (the never-audited guard interaction), the latter by pointing at D-DRS-01.

    Then run the full gate set from the repo root and record each verbatim result in the SUMMARY:
    `pnpm codecheck`; `pnpm lint` (BOTH ceilings must pass at their current values — if the new
    test file pushed the tests scope over 638, fix the file's warnings, never the ceiling and
    never the `minFiles` floor); the scoped backend jest run from Task 2; `pnpm exec prettier
    --check` on the two touched source files; and `pnpm planning-gates` (its todo-frontmatter gate
    scopes to `pending/` only, so the moved file leaves its scope — run it anyway to prove nothing
    else regressed). Commit as `docs(quick-260910-drs): ...`.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md && grep -q "RESOLVED 2026-09-10 by quick-260910-drs" .planning/todos/completed/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md && grep -q "D-DRS-01" .planning/todos/completed/2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md && pnpm planning-gates && pnpm lint && pnpm codecheck</automated>
  </verify>
  <done>
    The todo exists only under `completed/`, with an unchanged filename, a `status:` line naming
    quick-260910-drs and D-DRS-01, and a `## Resolution` body section carrying the commit shas.
    `pnpm codecheck`, `pnpm lint` (both ceilings unchanged at 1123/638), the scoped backend jest
    run, the file-scoped prettier check, and `pnpm planning-gates` are all green, with verbatim
    results in the SUMMARY.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib backend → presence.gog.com | Authenticated outbound POST/DELETE carrying a GOG bearer token and `user_id`; the user's online/offline presence and current `game_id` cross here |
| User settings (`disableGOGPresence`, `disablePlaytimeSync`) → presence.ts | The user's opt-out crosses into the module that decides whether to broadcast presence at all |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-DRS-01 | Information disclosure | `setPresence()`'s opt-out gate | mitigate | The fix touches only the `interval` declaration and its reset. `setPresence()`'s `disableGOGPresence \|\| disablePlaytimeSync \|\| !GOGUser.isLoggedIn() \|\| !isOnline()` early-return is NOT moved, duplicated, or weakened — every timer-driven tick re-evaluates it fresh, so a re-armed keep-alive that outlives an opt-out still posts nothing. Task 2 Case 3 pins this at the boundary the D-DRS-01 decision touches. |
| T-DRS-02 | Information disclosure | D-DRS-01 Option A (teardown hoisted above the guards) | mitigate | Hoisting moves only a LOCAL timer teardown, never a network call. `axiosClient.delete` stays behind every existing guard, so Option A cannot cause a presence DELETE to be issued in a case that previously issued none. Task 2 Case 3 asserts `axiosClient.delete` is not called on the guarded path. |
| T-DRS-03 | Denial of service | re-armed keep-alive | mitigate | The `if (!interval)` guard is preserved rather than removed, and Task 2 Case 2 proves two consecutive `setPresence()` calls arm exactly one timer. A fix that armed unconditionally would stack a new 5-minute timer per game launch and fan out into N presence POSTs per tick. |
| T-DRS-04 | Denial of service | quit path (`utils.ts:326`) | accept | `deletePresence()` is awaited immediately before `app.exit()`. Neither option changes its await structure or adds a network call, so the quit path's timing is unchanged. `utils.ts` is explicitly out of scope for this plan. |
| T-DRS-05 | Information disclosure | new test suite | mitigate | The suite uses fabricated credentials (`u1`/`t1`) and a fully mocked `axiosClient` — no real token, no real network call, no real GOG account. `backend/utils` is mocked with a narrow factory exposing only `axiosClient`, so no live HTTP client is constructed. |
| T-DRS-SC | Tampering | npm/pip/cargo installs | accept | ZERO package installs in this task. Every module the fix and the suite touch (`presence.ts`, jest, eslint, prettier) is already resident. No `## Package Legitimacy Audit` is required because no package-manager install task exists. |
</threat_model>

<verification>
1. `pnpm exec jest --selectProjects Backend src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts` — non-zero test count, all green, no `--passWithNoTests`.
2. `pnpm codecheck` green.
3. `pnpm lint` green with `SRC_CEILING = 1123` and `TESTS_CEILING = 638` both UNCHANGED in `meta/lintScoped.cjs` (`git diff --stat meta/lintScoped.cjs` must be empty).
4. `pnpm exec prettier --check src/backend/storeManagers/gog/presence.ts src/backend/storeManagers/gog/__tests__/gogPresenceKeepAlive.test.ts` — run from the repo root, never from a copied or `cd`-ed directory.
5. `pnpm planning-gates` green.
6. `git diff --name-only <base>..HEAD` lists exactly: `src/backend/storeManagers/gog/presence.ts`, the new test file, and the todo's move (delete under `pending/`, add under `completed/`). Nothing else.
7. The SUMMARY carries three verbatim jest transcripts — pre-fix RED, post-fix GREEN, mutation RED — and the D-DRS-01 decision text.
</verification>

<success_criteria>
- `deletePresence()` resets `interval` to `undefined` wherever it clears it, and the declaration is `NodeJS.Timeout | undefined`.
- A `setPresence()` → `deletePresence()` → `setPresence()` cycle in one process leaves a LIVE keep-alive that fires a presence POST 5 minutes later, proven by an automated test that was RED before the fix.
- Two consecutive `setPresence()` calls still arm exactly one timer.
- The guard/teardown interaction is decided, not deferred: `D-DRS-01` is recorded in `presence.ts` with a guard-by-guard matrix, the reachable call site for each guard, a chosen option, and a rationale — and a test case pins it.
- The todo is closed under `completed/` with a `status:` line naming quick-260910-drs and D-DRS-01, and a `## Resolution` section with commit shas.
- All five gates in `<verification>` are green with verbatim evidence, and neither lint ceiling moved.
</success_criteria>

<output>
Create `.planning/quick/260910-drs-reset-the-gog-presence-keep-alive-interv/260910-drs-SUMMARY.md` when done.
</output>
