---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
plan: 03a
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/screens/Library/__tests__/filterEngine.test.ts
  - src/frontend/screens/Library/components/LibraryHeader/gameCount.ts
  - src/frontend/hooks/constants.ts
  - src/frontend/screens/ConsoleMode/selectors.ts
  - src/frontend/screens/ConsoleMode/index.tsx
autonomous: true
requirements: [REQ-37-02]

must_haves:
  truths:
    - "An owned Steam game is never hidden from the library grid because its store page returned success: false"
    - "SteamGame.isGameAvailable() no longer returns false for a delisted-but-installed game, so the delisted game is never pushed onto nonAvailableGames"
    - "A delisted Steam game appears in Console Mode's grid and can be activated there"
    - "The is_delisted DETECTION path is untouched — no migration, no retry pass, no change to fetchMetadataIfNeeded's success === false branch (Corrections §1)"
    - "The new facet is NOT routed through nonAvailableGames (D-16) — that list keeps exactly one writer and one meaning"
    - "The Install-with-options doors stay CLOSED (D-14) — steamInstallOptionsEntry.ts is not touched by this plan"
  artifacts:
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "isGameAvailable() with the LIB-07 delisted gate removed (D-15, forced)"
    - path: "src/frontend/screens/Library/filterEngine.ts"
      provides: "isNonAvailableGame reduced to the nonAvailableAppNames membership test alone"
    - path: "src/frontend/screens/ConsoleMode/selectors.ts"
      provides: "selectConsoleGames with the is_delisted exclusion removed (D-13)"
  key_links:
    - from: "src/frontend/hooks/constants.ts"
      to: "src/frontend/screens/Library/filterEngine.ts"
      via: "the doc comment at the reconcile branch describing the delisted OR clause"
      pattern: "keeps hiding it regardless"
    - from: "src/frontend/screens/Library/components/LibraryHeader/gameCount.ts"
      to: "findSilentlyExcludedGames"
      via: "the !game.is_delisted exclusion term that goes stale once delisted no longer hides"
      pattern: "is_delisted"
---

<objective>
Stop a store-availability flag from acting as a library-visibility filter. Remove the delisted hide
in BOTH places that enforce it — the backend availability verdict and the frontend filter clause —
in one change, and correct the two readers that go stale the moment it lands.

Purpose: Nine owned Steam games are invisible. One of them, Dead Island (91310), is INSTALLED on
this machine and cannot be seen or launched. The flag itself is CORRECT — all nine genuinely return
`success: false` from Steam's store API, re-measured by cold `curl` on three separate dates with a
passing four-title control. The defect is the FILTER POLICY, not the detection.

Output: a delisted, installed game renders in the library grid and in Console Mode at default
filter settings.

**D-15 is FORCED, not discretionary.** Removing the `filterEngine` clause ALONE does not unhide Dead
Island — it traps it harder. Once the card mounts, `hasStatus`'s effect calls
`handleNonAvailableGames` -> `isGameAvailable()` still returns `false` because of the untouched
backend gate -> the appName is pushed onto `nonAvailableGames` -> the game is hidden again by the
FIRST clause of the same OR. And `reconcileNonAvailableGames` cannot heal it: its two heal branches
fire only when the game is not-installed or available, and Dead Island is installed and permanently
"unavailable". **Task 2 changes both files. Do not commit one without the other.**
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-CONTEXT.md
@.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-RESEARCH.md
@.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-VALIDATION.md
@.planning/todos/pending/2026-08-21-nine-owned-games-permanently-flagged-delisted-and-hidden.md

<interfaces>
<!-- Extracted from the codebase at plan time. Use these directly; do not re-explore. -->

From `src/backend/storeManagers/steam/games.ts` (~:2706-2720):
  async isGameAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const info = this.getGameInfo()
      // LIB-07: delisted game is non-available regardless of install state
      if (info?.is_delisted) { return resolve(false) }
      resolve(Boolean(info?.is_installed && info.install?.install_path && existsSync(info.install.install_path)))
    })
  }

From `src/frontend/screens/Library/filterEngine.ts` (~:236-250):
  export function isNonAvailableGame(game: GameInfo, deps: FilterEngineDeps): boolean {
    return deps.nonAvailableAppNames.includes(game.app_name) ||
           (game.runner === 'steam' && !!game.is_delisted)
  }

From `src/frontend/screens/ConsoleMode/selectors.ts`:
  export function selectConsoleGames(all: GameInfo[], hiddenGames: readonly { appName: string }[]): GameInfo[]
  — filters on `!g.install?.is_dlc && !g.thirdPartyManagedApp && !g.is_delisted && !hiddenAppNames.has(g.app_name)`

From `src/frontend/screens/ConsoleMode/index.tsx` (~:248-255):
  const activateGame = useCallback((game: GameInfo) => {
    if (!idle) return
    if (game.is_delisted) return          // GAP-B early return
    ...

From `src/frontend/screens/Library/components/LibraryHeader/gameCount.ts` (~:121-138):
  export function findSilentlyExcludedGames(libraryUnion: GameInfo[], deps: FilterEngineDeps): string[]
  — filters on `game.runner === 'steam' && !game.install.is_dlc && !game.is_delisted && deps.nonAvailableAppNames.includes(game.app_name)`

From `src/frontend/hooks/constants.ts` (~:150-160), inside `reconcileNonAvailableGames`'s doc comment:
  "...that clause is `deps.nonAvailableAppNames.includes(...) || (runner === 'steam' &&
   !!is_delisted)`, an OR, not routed through this list, so dropping a delisted game's entry here
   cannot make it visible -- the delisted clause keeps hiding it regardless."

Existing test to FLIP, `src/frontend/screens/Library/__tests__/filterEngine.test.ts` (~:170-182):
  it('a delisted Steam game counts as non-available even when nonAvailableAppNames is empty', ...)
  — currently asserts `expect(result).toHaveLength(0)`

Existing `isGameAvailable` tests, `src/backend/storeManagers/steam/__tests__/games.test.ts`
(~:6230-6270, inside `describe('SteamGame supporting read methods — GAME-01 unblock')`):
  three cases covering installed+existsSync true, not-installed, install_path missing.
  NONE covers `is_delisted: true`. Harness: `library.set(APP_ID, makeEntry({...}))` plus
  `existsSyncMock` from `jest.requireMock('graceful-fs').existsSync`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wave 0 — write the two gates that must go RED against today's code</name>
  <files>src/frontend/screens/Library/__tests__/filterEngine.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <read_first>
    - src/frontend/screens/Library/__tests__/filterEngine.test.ts ~:150-195 — the existing delisted test, its `makeGame`/`makeState`/`makeDeps` helpers, and the SCOPE WARNING comment immediately below it
    - src/backend/storeManagers/steam/__tests__/games.test.ts ~:6060-6280 — the `SteamGame supporting read methods` describe block, its `beforeEach` (`library.clear()`, `pendingFetches.clear()`, `existsSyncMock`), and the `makeEntry` helper
    - src/backend/storeManagers/steam/games.ts ~:2700-2722 — `isGameAvailable()` as it stands
    - .planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-VALIDATION.md § Wave 0 Requirements, items 1 and 2
  </read_first>
  <action>
    FLIP the existing `filterEngine.test.ts` test rather than adding a second one beside it — a
    stale test asserting the old forced-hide behaviour left green next to a new one asserting the
    opposite is how this repo's ledger records a gate going vacuous. Rename it to
    `'a delisted Steam game is VISIBLE at default filters — is_delisted no longer implies
    non-available (REQ-37-02, D-11)'` and change its assertion from `expect(result).toHaveLength(0)`
    to asserting the returned array contains exactly `['delisted-app']`.

    Add a companion case in the same `describe`, so the OTHER half of the OR is still pinned:
    a Steam game whose `app_name` IS in `nonAvailableAppNames` is still excluded at
    `showNonAvailable: 'off'`. Without this, removing the delisted clause could be over-removed
    into removing the whole function and nothing would notice.

    Add to `games.test.ts`, inside the existing `SteamGame supporting read methods` describe and
    immediately after the three existing `isGameAvailable()` cases, two new cases:
    (a) `isGameAvailable()` resolves TRUE for `is_delisted: true` + `is_installed: true` +
        an `install.install_path` that `existsSync` reports present — this is the D-15 gate, and
        the live specimen it stands in for is Dead Island (91310);
    (b) `isGameAvailable()` still resolves FALSE for `is_delisted: true` + `is_installed: false`
        — proving the removal did not turn the function into "always true".

    Run both suites now and record the RED output verbatim in the SUMMARY. Case (a) MUST fail
    against today's `games.ts`, and the flipped filterEngine case MUST fail against today's
    `filterEngine.ts`. A Wave 0 gate that is green before the fix measured nothing.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Library/__tests__/filterEngine.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts --silent; echo "EXPECTED RED at this point — record the failures"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "toHaveLength(0)" src/frontend/screens/Library/__tests__/filterEngine.test.ts` no longer matches inside the delisted test.
    - The flipped test asserts on the returned `app_name` list, not merely on `.length` — a length assertion cannot tell "the right game came back" from "a different one did".
    - `grep -c "is_delisted" src/backend/storeManagers/steam/__tests__/games.test.ts` is at least 2.
    - The SUMMARY quotes the actual RED failure lines for the flipped filterEngine case AND for games.test case (a). Both must name the assertion that failed, not just "2 failed".
    - No production file is modified in this task.
  </acceptance_criteria>
  <done>Two gates exist, both observed FAILING against unmodified production code, with the failure text recorded.</done>
</task>

<task type="auto">
  <name>Task 2: Remove the delisted hide from BOTH enforcement points, and correct the two readers it makes stale</name>
  <files>src/backend/storeManagers/steam/games.ts, src/frontend/screens/Library/filterEngine.ts, src/frontend/screens/Library/components/LibraryHeader/gameCount.ts, src/frontend/hooks/constants.ts</files>
  <read_first>
    - src/backend/storeManagers/steam/games.ts ~:2700-2722 — `isGameAvailable()`
    - src/backend/storeManagers/steam/games.ts ~:636-666 — `fetchMetadataIfNeeded`'s `entry?.success === false` branch and the adjacent `!data` guard. READ THESE SO YOU DO NOT TOUCH THEM. Corrections §1 records the filed cause as DISPROVEN: all nine appids return `success: false` from a cold `curl` a month apart with a passing control, so the branch is doing what it says and clearing the flags would record a falsehood.
    - src/frontend/screens/Library/filterEngine.ts ~:230-295 — `isNonAvailableGame`, `isHiddenGame`, and `passesMore`'s tri-state block that consumes them
    - src/frontend/screens/Library/components/LibraryHeader/gameCount.ts ~:82-140 — `findSilentlyExcludedGames` and the doc comment explaining WHY `!game.is_delisted` is there
    - src/frontend/hooks/constants.ts ~:86-215 — `handleNonAvailableGames` and `reconcileNonAvailableGames`, especially the heal-branch doc comment
    - .planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-CONTEXT.md § D-15, D-16, and the "Claude's Discretion" paragraph naming these two stale readers
  </read_first>
  <action>
    In `games.ts`, delete the `if (info?.is_delisted) { return resolve(false) }` guard and its
    `// LIB-07:` comment from `isGameAvailable()`. Replace them with a comment recording the
    reversal by requirement ID: that LIB-07's forced-hide reading is SUPERSEDED by REQ-37-02 / D-15,
    that `is_delisted` is now user-driven filterable state, and that this function answers only
    "is this game installed and is its install_path on disk" — the same question its
    gog/nile/legendary analogs answer. Nothing else in `games.ts` changes; in particular
    `fetchMetadataIfNeeded`'s `is_delisted` write and the adjacent `!data` guard are untouched.

    In `filterEngine.ts`, reduce `isNonAvailableGame` to `deps.nonAvailableAppNames.includes(
    game.app_name)`. Rewrite its header comment: the list means "an INSTALLED game whose
    install_path went missing" and has exactly one writer (`handleNonAvailableGames`); the
    delisted OR clause is removed by REQ-37-02/D-15; and per D-16 the new delisted facet added by
    plan 37-03b is deliberately NOT routed back through this list, because a second writer would
    collide at every existing reader.

    In `gameCount.ts`'s `findSilentlyExcludedGames`, delete the `!game.is_delisted &&` term from the
    filter predicate and rewrite the corresponding paragraph of the doc comment. The paragraph
    currently justifies the exclusion by saying a delisted game is "a real, correct, permanent
    non-availability (LIB-07)" — that justification is now false. The replacement rationale: the
    guard exists to catch a game silently excluded by a FALSE-NEGATIVE `isGameAvailable()` verdict
    landing it on `nonAvailableGames`, and after REQ-37-02 a delisted game reaching that list is
    exactly as anomalous as any other game reaching it — there is no longer a legitimate reason for
    a delisted game to be on that list, so folding it in strengthens the guard rather than
    generating noise.

    In `hooks/constants.ts`, correct the sentence in `reconcileNonAvailableGames`'s doc comment that
    reads "...that clause is `deps.nonAvailableAppNames.includes(...) || (runner === 'steam' &&
    !!is_delisted)`, an OR, not routed through this list, so dropping a delisted game's entry here
    cannot make it visible -- the delisted clause keeps hiding it regardless." Every clause of that
    sentence is now FALSE. Replace it with the post-REQ-37-02 truth: `isNonAvailableGame` is now the
    list membership test alone, so dropping a delisted game's entry here DOES make it visible, and
    that is the intended behaviour. Leave the surrounding branch LOGIC untouched — only the comment
    is wrong. Do the same for the `handleNonAvailableGames` doc comment above it if it repeats the
    claim.

    Both suites from Task 1 must now be GREEN. This task's two production edits (games.ts and
    filterEngine.ts) are the D-15 forced pair — they land in the same commit.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Library/__tests__/filterEngine.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts --silent</automated>
  </verify>
  <acceptance_criteria>
    - `grep -v '^\s*[*/]' src/frontend/screens/Library/filterEngine.ts | grep -c 'is_delisted'` returns `0` — the clause is gone from CODE, and comment lines are excluded from the count so the new explanatory comment cannot make this gate self-satisfying.
    - `grep -n "is_delisted" src/backend/storeManagers/steam/games.ts` returns hits ONLY inside `fetchMetadataIfNeeded`'s write block, the `library.ts`-fed defaults, and comments — no hit inside the `isGameAvailable` body. Confirm by reading the enclosing function of each hit, not just the line.
    - `grep -v '^\s*[*/]' src/frontend/screens/Library/components/LibraryHeader/gameCount.ts | grep -c 'is_delisted'` returns `0`.
    - `grep -c "keeps hiding it regardless" src/frontend/hooks/constants.ts` returns `0`.
    - Both Task 1 gates are now GREEN, and the SUMMARY states this explicitly against the RED text it recorded.
    - `src/frontend/helpers/steamInstallOptionsEntry.ts` is unmodified: `git diff --name-only` does not list it (D-14 — the Install-with-options doors stay closed; 34.13 review C-04 closed the third one deliberately, and re-opening a door on unverified evidence would trade this defect for a worse one).
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors.
  </acceptance_criteria>
  <done>Both enforcement points are gone in one change, both gates are green, and neither stale reader is left as a landmine.</done>
</task>

<task type="auto">
  <name>Task 3: Lift the same forced hide out of Console Mode (D-13)</name>
  <files>src/frontend/screens/ConsoleMode/selectors.ts, src/frontend/screens/ConsoleMode/index.tsx</files>
  <read_first>
    - src/frontend/screens/ConsoleMode/selectors.ts — the whole file; `selectConsoleGames` is short and its GAP-B comment states the rationale being reversed
    - src/frontend/screens/ConsoleMode/index.tsx ~:240-275 — `activateGame`'s guard chain and what each early return does
    - any existing test for `selectConsoleGames` — locate it with `ls src/frontend/screens/ConsoleMode/__tests__/ 2>/dev/null` and `grep -rn "selectConsoleGames" src/frontend --include-dir=__tests__` before writing a new one
    - .planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-CONTEXT.md § D-13
  </read_first>
  <action>
    Remove the `!g.is_delisted &&` term from `selectConsoleGames`'s filter predicate and rewrite the
    GAP-B paragraph of its doc comment: the exclusion is reversed by REQ-37-02/D-13, because it is
    the same forced-hide defect on a second screen — without this change Dead Island is visible and
    launchable in the library and still invisible in Console Mode. Keep every other term
    (`is_dlc`, `thirdPartyManagedApp`, hidden-games) exactly as-is.

    Remove the `if (game.is_delisted) return` early return from `activateGame` in
    `ConsoleMode/index.tsx`, along with its GAP-B comment. Keep the `if (!idle) return` guard and
    every status branch below it untouched.

    If a test file covering `selectConsoleGames` exists, add a case asserting a delisted game is
    now RETURNED and a case asserting a hidden game is still excluded (the second is the
    over-removal guard). If none exists, create
    `src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts` with those two cases plus one
    asserting a DLC entry is still excluded — `selectors.ts` is a pure function with a `GameInfo`
    input, so it needs no jsdom and runs under the frontend project's `testEnvironment: 'node'`.
    Observe the delisted case failing before the predicate change.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/ConsoleMode --silent</automated>
  </verify>
  <acceptance_criteria>
    - `grep -v '^\s*[*/]' src/frontend/screens/ConsoleMode/selectors.ts | grep -c 'is_delisted'` returns `0`.
    - `grep -v '^\s*[*/]' src/frontend/screens/ConsoleMode/index.tsx | grep -c 'is_delisted'` returns `0`.
    - The selectors test asserts a delisted game IS returned AND that a hidden game and a DLC entry are still excluded — three assertions, not one.
    - The SUMMARY records the delisted case's RED output before the predicate change.
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors.
  </acceptance_criteria>
  <done>A delisted game appears in the Console Mode grid and can be activated there.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam Store API -> backend cache | `appdetails` `success: false` becomes the persisted `is_delisted` flag. This plan changes only how that flag is READ; the write path is untouched. |
| localStorage -> renderer | `nonAvailableGames` is a browser-local list this plan reduces to a single reader semantics. Local-user-writable only. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-37-06 | Information Disclosure | `isGameAvailable()` loses one of its two false-returning conditions, so a game previously suppressed is now surfaced | accept | Nothing sensitive is exposed: the game is one the signed-in user OWNS, and the remaining conditions (`is_installed` + `install_path` + `existsSync`) still answer the actual availability question. The delisted gate was never an access control — it was a visibility policy, and D-11 reverses that policy deliberately. |
| T-37-07 | Tampering | `activateGame`'s `is_delisted` early return is removed, so a delisted title can now be activated from Console Mode | accept | `activateGame` routes to the SAME install/launch handlers the library screen already offers for a delisted game, and D-14 keeps the "Install with options…" doors closed independently in `steamInstallOptionsEntry.ts` (untouched by this plan). Activation of a game the user owns is not a boundary crossing. |
| T-37-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs zero packages. `37-RESEARCH.md` § Package Legitimacy Audit records the phase as install-free. |

**Not a security boundary:** per `37-RESEARCH.md` § Security Domain, V5 Input Validation applies to
37-10 ONLY. This defect is a data-correctness / visibility-policy bug. V2/V3/V4/V6 are untouched:
no auth flow, no session, no access control, no cryptography is involved.
</threat_model>

<verification>
- `npx jest src/frontend/screens/Library/__tests__/ src/frontend/screens/ConsoleMode/ src/frontend/hooks/__tests__/ --silent` — the Library, Console Mode and hooks suites green.
- `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts --silent` — green including the two new `isGameAvailable` cases.
- `npx tsc --noEmit -p tsconfig.json` — clean.
- `npx eslint src/backend/storeManagers/steam/games.ts src/frontend/screens/Library/filterEngine.ts src/frontend/screens/Library/components/LibraryHeader/gameCount.ts src/frontend/hooks/constants.ts src/frontend/screens/ConsoleMode/selectors.ts src/frontend/screens/ConsoleMode/index.tsx -f json` — zero entries with `severity === 2`.
- `pnpm test:ci` at end of wave.
- The live gate for this requirement lives in plan **37-03b** — it needs 37-03b's "No store page"
  label to be checkable in the same restart. A green suite does NOT close REQ-37-02.
</verification>

<success_criteria>
- `isGameAvailable()` returns `true` for a delisted, installed game whose `install_path` exists.
- `isNonAvailableGame` is the `nonAvailableAppNames` membership test and nothing else.
- `selectConsoleGames` returns delisted games; `activateGame` no longer refuses them.
- Neither `gameCount.findSilentlyExcludedGames` nor `reconcileNonAvailableGames`'s doc comment still
  asserts the removed behaviour.
- `fetchMetadataIfNeeded`, `steamInstallOptionsEntry.ts` and `nonAvailableGames`'s single writer are
  all unmodified.
</success_criteria>

<output>
Create `.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-03a-SUMMARY.md` when done.
</output>
