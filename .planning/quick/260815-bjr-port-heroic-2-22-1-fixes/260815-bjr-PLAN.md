---
phase: quick-260815-bjr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/utils.ts
  - src/backend/__tests__/checkRosettaInstall.test.ts
  - src/frontend/screens/ConsoleMode/selectors.ts
  - src/frontend/screens/ConsoleMode/index.tsx
  - src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts
  - src/backend/storeManagers/legendary/games.ts
autonomous: true
requirements: [PORT-2.22.1-01, PORT-2.22.1-02, PORT-2.22.1-03]

must_haves:
  truths:
    - "On Apple Silicon without Rosetta, checkRosettaInstall() RESOLVES (does not reject) and shows the Rosetta warning dialog"
    - "checkRosettaInstall() no longer reads stdout, so an empty/short stdout can never produce a TypeError on .trim()"
    - "When the arch spawn succeeds, no Rosetta warning dialog is shown"
    - "A game present in hiddenGames.list is absent from the Console mode grid"
    - "A game NOT in hiddenGames.list is still present in the Console mode grid"
    - "The pre-existing GameLib exclusions (DLC, thirdPartyManagedApp, is_delisted) still apply after the hidden-games merge"
    - "Epic store metadata requests for Spanish use lang 'es-ES', matching the existing pt->pt-BR and zh_Hans->zh-CN mappings"
    - "No file under public/locales/ is modified"
  artifacts:
    - path: "src/backend/utils.ts"
      provides: "checkRosettaInstall() deriving availability from spawn success/failure"
      contains: "\\.catch\\(\\(\\) => false\\)"
    - path: "src/backend/__tests__/checkRosettaInstall.test.ts"
      provides: "regression proof that a rejecting spawn yields false + dialog, not an unhandled rejection"
      min_lines: 50
    - path: "src/frontend/screens/ConsoleMode/selectors.ts"
      provides: "selectConsoleGames() — the single console-grid eligibility filter, importable without scss/png side effects"
      exports: ["selectConsoleGames"]
    - path: "src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts"
      provides: "hidden-games + DLC + third-party + delisted filter coverage against the production function"
      min_lines: 60
    - path: "src/backend/storeManagers/legendary/games.ts"
      provides: "es -> es-ES language mapping for the Epic store-content API"
      contains: "es-ES"
  key_links:
    - from: "src/frontend/screens/ConsoleMode/index.tsx"
      to: "src/frontend/screens/ConsoleMode/selectors.ts"
      via: "allGames useMemo calls selectConsoleGames(all, hiddenGames.list)"
      pattern: "selectConsoleGames\\("
    - from: "src/frontend/screens/ConsoleMode/index.tsx"
      to: "ContextProvider"
      via: "hiddenGames destructured from useContext(ContextProvider)"
      pattern: "hiddenGames"
    - from: "src/backend/__tests__/checkRosettaInstall.test.ts"
      to: "src/backend/utils.ts"
      via: "imports the real exported checkRosettaInstall, mocking only child_process.exec"
      pattern: "from '\\.\\./utils'"
---

<objective>
Port three upstream Heroic v2.22.1 fixes into GameLib. All three touch regions
that GameLib either has not modified since the fork base (v2.22.0 @ b5b5cad3fa)
or has diverged from in a way that hand-merges cleanly.

Purpose:
- Fix 1 is the highest-value: GameLib is macOS-primary, and on Apple Silicon
  without Rosetta the current check throws an unhandled promise rejection, so
  the user never sees the "install Rosetta" warning they need.
- Fix 2 closes a privacy/UX leak: games the user explicitly hid still appear
  in Console mode.
- Fix 3 is a 3-line locale correctness fix for Epic store metadata.

Output: three atomic commits on the current branch, plus first-ever regression
coverage for `checkRosettaInstall()` and the Console mode grid filter.

Reference commits (readable locally via `git show <sha>`, remote `origin`):
- Fix 1: `9a1b0af1c`
- Fix 2: `13d45f47a`
- Fix 3: `4bccba197`
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

@src/backend/utils.ts
@src/frontend/screens/ConsoleMode/index.tsx
@src/backend/storeManagers/legendary/games.ts

<scope_fence>
- Stay on the current branch `fix/steam-native-install-stability`. Do NOT create
  or switch branches.
- CODE ONLY. Do NOT touch `public/locales/`. None of these three fixes adds,
  removes, or renames an i18n key (`box.warning.rosetta.title` /
  `box.warning.rosetta.message` already exist and are untouched), so the
  project's blocking localisation gate is NOT implicated. Do NOT run
  `pnpm i18n` — there is known unrelated catalog drift that must be triaged
  separately, and regenerating would collide with `i18nCatalogChurnGuard`.
- Do NOT update ROADMAP.md. Quick tasks are tracked in STATE.md only.
- Do NOT `git cherry-pick` any of the three upstream commits. Fix 2's file has
  local divergence; Fixes 1 and 3 are small enough to hand-apply.
- Do NOT modify `src/backend/main.ts`. Its un-awaited `checkRosettaInstall()`
  call at line 253 is the same shape upstream ships; after Fix 1 the spawn path
  can no longer reject, which is what this port is for. Adding a `.catch()`
  there is a separate concern, out of scope.
</scope_fence>

<interfaces>
<!-- Extracted from the codebase. Use these directly — no exploration needed. -->

From `src/frontend/types.ts` (the ContextProvider value shape):
```typescript
hiddenGames: {
  list: HiddenGame[]
  add: (appNameToHide: string, appTitle: string) => void
  remove: (appNameToUnhide: string) => void
}

interface HiddenGame {
  appName: string
  title: string
}
```

From `src/common/types.ts` (fields the console filter reads):
```typescript
thirdPartyManagedApp?: string   // line 218
is_delisted?: boolean           // line 231
// plus: app_name, title, runner, is_installed, install?.is_dlc
```

From `src/backend/utils.ts`:
```typescript
import { exec, spawn, SpawnOptions, spawnSync } from 'child_process'  // line 14
import { promisify } from 'util'                                     // line 16
const execAsync = promisify(exec)                                    // line 88
import { isLinux, isMac, isIntelMac, isWindows } from './constants/environment'  // line 71
export async function checkRosettaInstall()                          // line 1366
```

From `src/backend/__mocks__/electron.ts` (auto-used by `jest.mock('electron')`):
```typescript
const dialog = { showErrorBox: jest.fn(), showMessageBox: jest.fn() }
```
Note: both backend and frontend jest projects set `resetMocks: true`, so any
`mockImplementation` must be installed inside the test body / `beforeEach`,
never at module-factory time.
</interfaces>

<test_environment_constraints>
Read before writing any test in this plan — these are hard properties of the
repo's jest setup, not preferences.

1. **No jsdom, no react-test-renderer.** `src/frontend/jest.config.js` runs
   `testEnvironment: 'node'` and documents this deliberately. `render()` from
   `@testing-library/react` CANNOT be used even though the package is in
   `package.json`. Frontend component tests in this repo call function
   components directly or test extracted pure modules.
2. **No `moduleNameMapper` in any jest project.** Importing
   `ConsoleMode/index.tsx` from a test would fail on its
   `import './index.scss'` and `import GameLibIcon from '...png'`. This is
   exactly why Task 2 extracts the filter into a side-effect-free
   `selectors.ts` rather than testing `index.tsx` directly.
3. **`modulePaths: [./src/]`** — so `common/types` and `frontend/...` resolve
   from test files.
4. Test file naming: backend `**/__tests__/**/*.test.ts`; frontend
   `**/__tests__/**/*.test.tsx` or `.test.ts`.
5. GameInfo fixture convention (see `MacArchBadge.test.tsx:23`,
   `HumbleOriginInfo.test.tsx:39`):
   `function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo { return { ... , ...overrides } as unknown as GameInfo }`
</test_environment_constraints>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix the Rosetta check crash (upstream 9a1b0af1c)</name>
  <files>src/backend/utils.ts, src/backend/__tests__/checkRosettaInstall.test.ts</files>

  <behavior>
    - Test 1 (the actual bug): when the `arch -x86_64 ...` spawn REJECTS,
      `checkRosettaInstall()` resolves normally (no throw) AND
      `dialog.showMessageBox` is called exactly once with the Rosetta warning.
      This is the regression that mattered: the rejection previously escaped as
      an unhandled promise rejection from the un-awaited call in main.ts and the
      warning never appeared.
    - Test 2: when the spawn SUCCEEDS, `checkRosettaInstall()` resolves and
      `dialog.showMessageBox` is NOT called.
    - Test 3: when the spawn succeeds with empty stdout, the function still does
      not throw. This pins the second half of the old bug —
      `''.split(':')[1]` is `undefined`, so `.trim()` was a TypeError. The new
      code must not read stdout at all.
  </behavior>

  <action>
Edit `src/backend/utils.ts`, function `checkRosettaInstall()` (starts line 1366).
Replace the two statements that currently destructure `stdout` and parse it:

Currently the function destructures `{ stdout: rosettaCheck }` from
`await execAsync('arch -x86_64 /usr/sbin/sysctl sysctl.proc_translated')` and
then computes `const result = rosettaCheck.split(':')[1].trim() === '1'`.

Replace both with a single `const result` bound to the awaited `execAsync` call
of the SAME command, chained `.then(() => true).catch(() => false)`. Keep
upstream's explanatory comment immediately above it: the spawn itself fails when
Rosetta is not installed, so spawn failure alone is the signal. Do not read,
destructure, or parse stdout anywhere in this function.

Everything below (`logInfo`, the `if (!result)` dialog block with GameLib's own
localised message text, the trailing `logInfo`) is UNCHANGED — GameLib's dialog
copy says "GameLib" where upstream says "Heroic"; preserve GameLib's wording
verbatim. The `if (isIntelMac) return` guard at the top is UNCHANGED.

Then create `src/backend/__tests__/checkRosettaInstall.test.ts`.

Module mocks (all at file top, before imports):
- `jest.mock('electron')`, `jest.mock('../logger')`,
  `jest.mock('../dialog/dialog')`, `jest.mock('../config')` — copy this exact
  set from the existing `src/backend/__tests__/utils.test.ts`, which already
  proves `../utils` imports cleanly under it.
- `jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), exec: jest.fn() }))`.
  Spread `requireActual` — `utils.ts` also imports `spawn`, `spawnSync` and
  `SpawnOptions` from this module and they must stay real.
- `jest.mock('../constants/environment', () => ({ ...jest.requireActual('../constants/environment'), isIntelMac: false }))`.
  Override ONLY `isIntelMac`. Do NOT also force `isMac: true` — `isMac` is read
  at module scope by other modules in `utils.ts`'s import graph, and flipping it
  on a Linux CI runner would change behaviour far outside this test. On Linux
  `isIntelMac` is already false; on an Intel Mac it is true and would hit the
  early return, which is the only reason the override is needed at all.

Test body mechanics:
- `const mockedExec = exec as unknown as jest.Mock` after
  `import { exec } from 'child_process'`.
- `promisify(exec)` is captured at `utils.ts` module load against the jest.fn
  object, and `promisify` falls back to callback style because a plain jest.fn
  carries no `util.promisify.custom` symbol. So the mock drives the promise via
  its callback argument: `mockedExec.mockImplementation((_cmd, cb) => cb(new Error('arch: posix_spawnp: /usr/sbin/sysctl: Bad CPU type in executable')))`
  to reject, and `(_cmd, cb) => cb(null, { stdout: '', stderr: '' })` to resolve.
  Because `resetMocks: true` is set for the Backend project, install these
  implementations inside each test (or a `beforeEach`), NOT in the mock factory.
- The resolved value is intentionally ignored by the production code
  (`.then(() => true)`), so do not assert on it and do not build a
  multi-arg/`multiArgs` promisify harness.
- Assert the dialog via `import { dialog } from 'electron'` and
  `expect(dialog.showMessageBox as jest.Mock).toHaveBeenCalledTimes(1)` /
  `.not.toHaveBeenCalled()`.
- For the no-throw assertion use
  `await expect(checkRosettaInstall()).resolves.toBeUndefined()` — asserting the
  RESOLUTION is the point of the regression; a bare `await` inside the test
  would also fail on rejection but states the intent less clearly.

Commit as a single atomic commit:
`fix(rosetta): treat arch spawn failure as Rosetta missing (port Heroic 9a1b0af1c)`
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Backend --runInBand src/backend/__tests__/checkRosettaInstall.test.ts src/backend/__tests__/utils.test.ts && npx eslint src/backend/utils.ts src/backend/__tests__/checkRosettaInstall.test.ts && grep -v "^\s*//" src/backend/utils.ts | grep -c "rosettaCheck" | grep -qx 0 && echo ROSETTA-STDOUT-PARSE-GONE</automated>
  </verify>

  <done>
`checkRosettaInstall()` derives `result` solely from spawn success/failure; the
identifier `rosettaCheck` no longer appears in non-comment source; the new test
file passes with the rejecting-spawn case proving resolution + dialog and the
succeeding-spawn case proving no dialog; the pre-existing `utils.test.ts` still
passes unchanged; eslint reports 0 errors on both files.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Exclude hidden games from Console mode (upstream 13d45f47a, hand-merged)</name>
  <files>src/frontend/screens/ConsoleMode/selectors.ts, src/frontend/screens/ConsoleMode/index.tsx, src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts</files>

  <behavior>
    - Test 1: a game whose `app_name` is in the hidden list is excluded.
    - Test 2: a game whose `app_name` is NOT in the hidden list is kept.
    - Test 3: an empty hidden list excludes nothing (pass-through).
    - Test 4: a hidden entry naming an `app_name` that is not in the library is
      a no-op — it must not drop an unrelated game.
    - Test 5 (regression guard on GameLib's pre-existing exclusions, which the
      merge must not lose): a game with `install.is_dlc === true`, a game with a
      truthy `thirdPartyManagedApp`, and a game with `is_delisted === true` are
      each still excluded even when the hidden list is empty.
    - Test 6: exclusion is by `app_name`, not by `title` — two games sharing a
      title but differing in `app_name` are treated independently.
  </behavior>

  <action>
DO NOT `git cherry-pick`. GameLib's `ConsoleMode/index.tsx` has diverged from the
fork base (+25 lines): its `allGames` spread includes `steam.library`, and its
filter carries a GameLib-only `!g.is_delisted` clause with a "GAP-B" comment.
Hand-merge.

Step A — create `src/frontend/screens/ConsoleMode/selectors.ts`. This is a new,
side-effect-free module: no scss import, no image import, no React import. It
exists specifically so the filter is testable under this repo's node-environment
jest (see `<test_environment_constraints>`; importing `index.tsx` from a test
would fail on `./index.scss`). It must export:

`selectConsoleGames(all: GameInfo[], hiddenGames: readonly { appName: string }[]): GameInfo[]`

Behaviour: build `const hiddenAppNames = new Set(hiddenGames.map((game) => game.appName))`,
then return `all.filter(...)` excluding, in this order, games with
`install?.is_dlc`, games with a truthy `thirdPartyManagedApp`, games with
`is_delisted`, and games whose `app_name` is in `hiddenAppNames`. Import
`GameInfo` as `import type { GameInfo } from 'common/types'`.

Move BOTH explanatory comments onto this function so no rationale is lost:
GameLib's existing "GAP-B: exclude delisted Steam games from the grid (and,
transitively, from storesWithGames/storeFilters ...)" note, and upstream's
"Match normal library: respect games hidden from the library view" note with its
issue link `https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/5783`.

Take the parameter as an already-flattened `GameInfo[]` plus the hidden list —
do NOT change the signature to accept six separate library arrays. Keeping the
spread in the component keeps this diff minimal and keeps the useMemo dependency
list readable.

Step B — edit `src/frontend/screens/ConsoleMode/index.tsx`:
1. Add `hiddenGames` to the destructuring of `useContext(ContextProvider)`
   (currently ends with `gameUpdates` at line 72). Its type is already declared
   on the context value — see `<interfaces>` — so no type work is needed.
2. Add `import { selectConsoleGames } from './selectors'` alongside the other
   local imports.
3. In the `allGames` useMemo (line 122): keep the `const all: GameInfo[] = [...]`
   spread exactly as-is, including `steam.library`. Replace the trailing
   `return all.filter((g) => !g.install?.is_dlc && !g.thirdPartyManagedApp && !g.is_delisted)`
   with `return selectConsoleGames(all, hiddenGames.list)`.
4. Append `hiddenGames` to that useMemo's dependency array (currently
   `[epic.library, gog.library, amazon.library, steam.library, zoom.library, sideloadedLibrary]`).

   NOTE ON A BRIEFING DISCREPANCY: the task briefing mentions upstream adding
   `hiddenGames` to "two dependency lists". `git show 13d45f47a` shows exactly
   ONE dependency list changed (the `allGames` useMemo). GameLib likewise has
   only one. Do not go hunting for a second — `visibleGames`, `storesWithGames`
   and `storeFilters` all derive from `allGames` and correctly need no direct
   `hiddenGames` dependency.

   Depend on the `hiddenGames` object (matching upstream), not on
   `hiddenGames.list`; `react-hooks/exhaustive-deps` is enforced in this repo and
   `hiddenGames` is the identity it tracks.
5. Change nothing else in this file. No JSX changes, no new UI. Console mode
   still has no in-console hide action; this only makes the existing hidden flag
   apply there.

Step C — create `src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts`
covering the six behaviours above. Import the real `selectConsoleGames` from
`../selectors` — this IS the production call path, since step B makes
`index.tsx` call it. Per project convention, do not reconstruct the predicate
inside the test file. Use the repo's `makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo`
fixture-factory convention documented in `<test_environment_constraints>` item 5.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Frontend src/frontend/screens/ConsoleMode && npx eslint src/frontend/screens/ConsoleMode/selectors.ts src/frontend/screens/ConsoleMode/index.tsx src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts && test "$(grep -v '^\s*//' src/frontend/screens/ConsoleMode/index.tsx | grep -c 'selectConsoleGames(')" -ge 1 && test "$(grep -v '^\s*//' src/frontend/screens/ConsoleMode/index.tsx | grep -c 'is_dlc')" -eq 0 && echo CONSOLE-FILTER-EXTRACTED-AND-WIRED</automated>
  </verify>

  <done>
`selectors.ts` exports `selectConsoleGames`; `index.tsx` destructures
`hiddenGames` from context, calls `selectConsoleGames(all, hiddenGames.list)`,
lists `hiddenGames` in the `allGames` dependency array, and no longer contains
the inline `is_dlc` predicate; the new test passes all six behaviours; eslint
reports 0 errors on all three files (in particular no
`react-hooks/exhaustive-deps` error). Committed as
`fix(console-mode): exclude hidden games from the console grid (port Heroic 13d45f47a)`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Map Spanish to es-ES for Epic store metadata (upstream 4bccba197) + full regression gate</name>
  <files>src/backend/storeManagers/legendary/games.ts</files>

  <action>
Edit `src/backend/storeManagers/legendary/games.ts`, private method
`getExtraFromAPI` (line 163). It currently reads `lang` from `configStore` and
then applies two remaps before interpolating `lang` into the
`https://store-content.ak.epicgames.com/api/${lang}/content/products/${slug}`
URL: `pt` -> `pt-BR` and `zh_Hans` -> `zh-CN`.

Add a third remap in the same `if (lang === 'x') { lang = 'y' }` style,
immediately after the `zh_Hans` block and before the blank line preceding
`const epicUrl`: `es` -> `es-ES`. Three lines, matching upstream exactly. Do not
restructure the three checks into a lookup map — keeping the shape identical to
upstream keeps future ports of this region trivial.

No test for this one. `getExtraFromAPI` is a PRIVATE method whose only caller is
line 309 of the same class; covering it would mean constructing a full
`LegendaryGame` with a mocked configStore, axios, and logger, which is
disproportionate to a 3-line mechanical remap — and the two sibling remaps it
copies have no coverage either. The task briefing scopes new regression tests to
the Rosetta and Console-mode cases only.

Commit as `fix(legendary): request es-ES for Spanish Epic store metadata (port Heroic 4bccba197)`.

Then run the full gate below. Note the repo's eslint baseline is 0 errors and
~168 warnings — warnings are pre-existing and acceptable, errors are not.

Finally, confirm no locale churn: `git diff --stat HEAD~3 -- public/locales/`
must be empty.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx tsc -p tsconfig.json && npx eslint src/backend/utils.ts src/backend/__tests__/checkRosettaInstall.test.ts src/frontend/screens/ConsoleMode/selectors.ts src/frontend/screens/ConsoleMode/index.tsx src/frontend/screens/ConsoleMode/__tests__/selectors.test.ts src/backend/storeManagers/legendary/games.ts && pnpm test:ci && test -z "$(git diff --stat HEAD~3 -- public/locales/)" && echo NO-LOCALE-CHURN</automated>
  </verify>

  <done>
`tsc -p tsconfig.json` exits 0; eslint reports 0 errors across all six changed
files; `pnpm test:ci` is green (baseline: 251 suites / 4867 passed / 1 skipped,
plus the two new suites added by this plan); `git diff -- public/locales/` across
the three commits is empty; three atomic commits exist on
`fix/steam-native-install-stability`, one per upstream fix.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local shell -> `arch -x86_64 /usr/sbin/sysctl` | Fixed literal command string, no interpolation. Unchanged by this plan. |
| app -> `store-content.ak.epicgames.com` | `lang` (from local `configStore`) is interpolated into the request URL. Pre-existing; Fix 3 adds one more constant-valued branch. |
| ContextProvider state -> Console mode grid | Hidden-games list is local app state, not remote input. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bjr-01 | Information disclosure | `ConsoleMode` grid | mitigate | This plan IS the mitigation: games the user hid were leaking into Console mode. Filter now applied via `selectConsoleGames`. |
| T-bjr-02 | Denial of service | `checkRosettaInstall()` | mitigate | The unhandled promise rejection is removed at source; the function can no longer reject on the spawn path, so the un-awaited call in `main.ts` is safe. |
| T-bjr-03 | Tampering | `lang` interpolated into the Epic URL | accept | `lang` originates from the local `configStore` language setting, compared against string literals and only ever replaced with a hardcoded constant. No new attacker-controlled path; matches the two pre-existing remaps. |
| T-bjr-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs NO packages. `@testing-library/react` is already present and is deliberately NOT used (no jsdom). If any task appears to need a new dependency, STOP — that requires a separate human package-legitimacy checkpoint. |
</threat_model>

<verification>
1. `npx tsc -p tsconfig.json` exits 0.
2. `npx eslint <the six changed files>` reports 0 errors (warnings are the
   pre-existing ~168 baseline and are acceptable).
3. `npx jest --selectProjects Backend --runInBand src/backend/__tests__/checkRosettaInstall.test.ts src/backend/__tests__/utils.test.ts` passes.
4. `npx jest --selectProjects Frontend src/frontend/screens/ConsoleMode` passes.
5. `pnpm test:ci` is green with no new failures against the 251-suite baseline.
6. `git diff -- public/locales/` is empty across all three commits.
7. `git log --oneline -3` shows exactly three commits, one per upstream fix,
   on branch `fix/steam-native-install-stability`.
8. Non-comment source of `src/backend/utils.ts` contains no `rosettaCheck`.
9. Non-comment source of `ConsoleMode/index.tsx` contains no `is_dlc` and at
   least one `selectConsoleGames(`.
</verification>

<success_criteria>
- All three upstream fixes are functionally present and behaviourally equivalent
  to their upstream commits, with GameLib's local divergences (the "GameLib"
  dialog wording, `steam.library`, `is_delisted`) preserved.
- `checkRosettaInstall()` resolves rather than rejecting when the arch spawn
  fails, and shows the Rosetta warning in that case — proven by a test that
  drives the real exported function through a rejecting `child_process.exec`.
- Hidden games are absent from the Console mode grid — proven by a test against
  the real `selectConsoleGames` that `index.tsx` calls, not a reconstructed
  predicate.
- Three atomic commits, one per fix, on the existing branch.
- Zero changes under `public/locales/`; `pnpm i18n` was never run.
- Full suite green; tsc clean; 0 eslint errors on changed files.
</success_criteria>

<output>
Create `.planning/quick/260815-bjr-port-heroic-2-22-1-fixes/260815-bjr-SUMMARY.md` when done.
</output>
</content>
</invoke>
