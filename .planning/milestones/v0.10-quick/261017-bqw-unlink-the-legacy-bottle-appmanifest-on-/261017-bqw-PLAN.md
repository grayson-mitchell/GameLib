---
phase: quick-261017-bqw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/todos/pending/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md
  - .planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md
  - .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md
autonomous: true
requirements: [TODO-261017-LEGACY-BRIDGE-BOTTLE-UNINSTALL-REVERTS]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "Uninstalling a bridge game that lives in the legacy shared GameLibSteamBridge bottle removes its install root AND its own appmanifest_<appId>.acf from that bottle's steamapps dir"
    - "After that uninstall, the exact path resolveBridgeBottleName probes for this appId's legacy manifest no longer exists, so the refresh that markBridgeGameUninstalled's gameStatusUpdate triggers has nothing to read back and cannot flip is_installed to true again"
    - "Nothing else in the legacy bottle is touched: a sibling legacy game's manifest and install dir survive, and the Phase 17 GameLibSteam bottle's own manifest for the same appId survives"
    - "A legacy-bottle uninstall whose manifest is already gone still completes with an empty stderr and marks the entry not-installed"
    - "The per-game bottle branch, the nothing-to-remove branch and the unsafe-path refusal behave exactly as before"
    - "The source todo is in .planning/todos/completed/ with its frontmatter unchanged and a Closed note naming 261017-bqw"
  artifacts:
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "uninstallBridgeGame() legacy branch removes the install root and appmanifest_<appId>.acf in one try block"
      contains: "appmanifest_"
    - path: "src/backend/storeManagers/steam/__tests__/games.test.ts"
      provides: "Real-filesystem regression cases for the legacy-bottle manifest unlink"
      contains: "261017-bqw"
    - path: ".planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md"
      provides: "Closed source todo with resolution note"
      contains: "261017-bqw"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts uninstallBridgeGame() legacy branch"
      to: "src/backend/storeManagers/steam/bottle.ts resolveBridgeBottleName() legacy probe"
      via: "the same path shape, join(getBottleSteamappsDir(<legacy bottle>), appmanifest_<appId>.acf)"
      pattern: "appmanifest_\\$\\{this\\.appId\\}\\.acf"
    - from: "src/backend/storeManagers/steam/games.ts uninstallBridgeGame() legacy branch"
      to: "src/backend/storeManagers/steam/library.ts buildBridgeInstalledMap()"
      via: "manifest absence on disk is what keeps the next refresh from re-marking the game installed"
      pattern: "buildBridgeInstalledMap"
---

<objective>
Stop a legacy-bottle bridge uninstall from reverting to installed and hiding the game from the
Library grid. The fix: the legacy branch of `uninstallBridgeGame()` deletes THIS game's
`appmanifest_<appId>.acf` from the legacy `GameLibSteamBridge` bottle's steamapps dir, in the same
try block that deletes the install root. A real-filesystem jest case proves it. Then close the
source todo.

Purpose: measured live on 2026-10-17 by quick task 261016-wsq, Arm 2. Uninstalling Avernum 5
(206040) from the legacy bottle deleted the files but left the manifest behind. The
`gameStatusUpdate done` from `markBridgeGameUninstalled()` triggered a `refreshLibrary` within the
same second. That refresh read the surviving manifest through `buildBridgeInstalledMap()` and
`resolveBridgeBottleName()` and re-marked the game `is_installed:true` with a deleted
`install_path`. `isGameAvailable()` then returned false, and the game dropped out of the grid until
someone deleted the manifest by hand. Avernum 6 and HOARD are still in the legacy bottle on the
operator's Mac. Per-game bottles are immune because `removePerGameBridgeBottle` deletes the whole
bottle.

Output: one code edit in `games.ts`, two new real-disk test cases in `games.test.ts`, the source
todo moved to `completed/`, and the sibling cleanup todo's item 1 annotated.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md
@.planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md

Load `Skill("gamelib-conventions")` before writing a `<verify>` result. This plan applies its
prettier rule and its todo-frontmatter rule. Load `Skill("spike-findings-gamelib")` only if
something about the bridge bottle layout surprises you.

Read source RANGES, not whole files. `games.ts` is 2952 lines and `games.test.ts` is 6795. Line
numbers below are at HEAD `b6696d81f`. They drift as you edit, so re-grep the symbol before each
edit.

- `src/backend/storeManagers/steam/games.ts`:
  - L1-5: imports. `rmSync` comes from `node:fs` (L4) and `join` from `node:path` (L5). Both are
    already imported.
  - L54-65: imports from `./bottle`. `getBottleSteamappsDir` (L59) is already imported, so this
    task adds no new import.
  - L1495-1520: `resolveBridgeGameInstallRoot`.
  - L1557-1588: `markBridgeGameUninstalled`.
  - L2470-2557: the `uninstallBridgeGame` JSDoc and body. Line 2491 is the signature, L2493 the
    per-game branch, L2513 the `!exePath` "nothing to remove" branch, L2523 the unsafe-path
    refusal, L2535-2547 the `rmSync(installRoot, ...)` try/catch, and L2550-2556 the success log
    and `markBridgeGameUninstalled()`.
  - L2647-2672: the A-12 `NUMERIC_APP_ID` guard precedent in `uninstallBottleGameDirectly`.
  - L2742-2830: the exact precedent for this fix. It builds
    `manifestPath = join(steamappsDir, `appmanifest_${this.appId}.acf`)` and calls
    `rmSync(installRoot, { recursive: true, force: true })` then
    `rmSync(manifestPath, { force: true })` inside ONE try block (L2814-2827).
- `src/backend/storeManagers/steam/library.ts` L2219-2237: `removeSteamInstallCopy`, the second
  in-repo precedent with the same two-rmSync pair. L2325-2370: `buildBridgeInstalledMap`, the
  reader that re-marked the game installed.
- `src/backend/storeManagers/steam/bottle.ts`:
  - L1170-1192: `resolveBridgeBottleName`. The legacy arm runs `existsSync(join(getBottleSteamappsDir(DEFAULT_BRIDGE_BOTTLE_NAME), `appmanifest_${appId}.acf`))`,
    and this fix deletes exactly that path.
  - L1253-1268: `getBridgeBottleSettings` throws on a non-numeric appId.
- `src/backend/storeManagers/steam/bridge/launchTarget.ts` L68-152: `resolveBridgeLaunchExe`
  returns `undefined` when there is no CM client, PICS fails or no Windows launch entry exists.
  When it does, the game's files are usually still on disk.
- `src/backend/storeManagers/steam/__tests__/games.test.ts`:
  - L74-87: the real, unmocked fs imports already present: `mkdtempSync`, `rmSync as realRmSync`,
    `existsSync as realExistsSync`, `writeFileSync`, `mkdirSync`, `join as realJoin` and `tmpdir`.
    games.ts's own `rmSync` is never mocked anywhere in this file.
  - L236-258: the `./bottle` mock. `getBottleSteamappsDir` and `getBridgeBottleSettings` are
    `jest.fn()`. `bridgeBottleNameFor` is a plain arrow function returning
    `GameLibSteamBridge-<appId>`.
  - L334: `APP_ID = '570'`.
  - L5237-5290: the SharedDepots real-disk fixture. It uses `mkdtempSync` with `realJoin(tmpdir(), ...)`,
    builds the tree, mocks `getBottleSteamappsDir` and runs `realRmSync(tmp, ...)` in `afterEach`.
    Copy this shape.
  - L5682-5882: `describe('SteamGame.uninstall() — Phase 24 Plan 08 bridge routing (R4/R6)')`.
    Its `beforeEach` sets `isMac`, sets `steamMetadataStore.get` to platformsCaptured +
    not-mac-native, sets `getBridgeBottleSettings` to `{ wineCrossoverBottle: 'GameLibSteamBridge' }`
    (the legacy bottle), and keys `getBottleSteamappsDir` on `===`. The nested
    `describe('per-game bottle removal (D-D)')` starts at L5747. The describe closes at L5882.

Traps measured on this repo (see the 261016-u1w plan, which hit them):
- `src/backend/jest.config.js` sets `resetMocks: true`. Re-arm every `jest.fn` mock you rely on
  in your own nested `beforeEach`.
- `pnpm lint` tests scope has ZERO headroom: 638 warnings against `TESTS_CEILING = 638`. Rules
  that fire in this file are `@typescript-eslint/unbound-method` (never `expect(obj.method)`;
  assert on top-level imported `jest.fn`s or on `realExistsSync(...)` results) and
  `@typescript-eslint/require-await` (use `mockResolvedValue`, never an `async` mock
  implementation without `await`). `{} as any` does NOT warn in the tests scope:
  `no-explicit-any` is off there, and line 5683's
  `eslint-disable-next-line @typescript-eslint/no-explicit-any` is itself reported as an UNUSED
  directive. So do NOT add a new `no-explicit-any` disable comment. It would add a warning and
  red the ceiling. Write `game.uninstall({} as any)` bare, like the 42 existing call sites.
- Substring trap: `'GameLibSteamBridge'` is a prefix of `GameLibSteamBridge-<appId>`. Key every
  mock on `===`, never `includes`.

Measured on this machine, 2026-10-17, at HEAD `b6696d81f`, before any edit. Re-measure only if
HEAD has moved.

| Check | Baseline |
|-------|----------|
| `npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/steam/__tests__/games.test.ts` | `Running one project: Backend`, `Test Suites: 1 passed, 1 total`, `Tests: 274 passed, 274 total` |
| `pnpm codecheck` | exit 0 |
| `pnpm lint` | `production: PASS \| tests: PASS`, production 1089 warnings (ceiling 1124), tests 638 (ceiling 638) |
| `npx prettier --check` over both source paths | `All matched files use Prettier code style!` |
| `npx prettier --file-info` on `games.ts` and `games.test.ts` | `"ignored":false`, `"inferredParser":"typescript"` (this prettier prints it unspaced, so match with `[[:space:]]*`) |
| `npx prettier --file-info` on any `.planning/todos/**` path | `"ignored":true`, `"inferredParser":null` |
| `pnpm planning-gates` | `12/12 planning gates passed.` |
| non-comment `rmSync(` lines in the `uninstallBridgeGame` slice (awk command in Task 1 verify) | 1 |
| non-comment `appmanifest_` lines in that slice | 0 |
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Legacy-bottle bridge uninstall removes the game's own appmanifest ACF alongside the install root (real-disk test first)</name>
  <files>src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/storeManagers/steam/games.ts</files>
  <behavior>
    - Test A (fails at HEAD on the manifest assertion, passes after the fix). Fixture: a real tmp tree. The legacy bridge bottle has `steamapps/common/Avernum 4/Avernum4.exe`, `steamapps/appmanifest_570.acf`, a sibling legacy game `steamapps/common/Avernum 6/Avernum 6.exe` and `steamapps/appmanifest_206060.acf`. A separate Phase 17 tree has `phase17/steamapps/appmanifest_570.acf`. `getBottleSteamappsDir` returns the bridge steamapps dir for exactly `'GameLibSteamBridge'` and the phase17 steamapps dir for any other name. `getBridgeBottleSettings` returns the legacy name. `resolveBridgeLaunchExe` resolves to the real tmp `Avernum4.exe`. `bridgeAllowlist.has` is true. Then `new SteamGame(APP_ID).uninstall({} as any)` resolves to `{ stdout: '', stderr: '' }`. Afterwards the `Avernum 4` dir is gone and `appmanifest_570.acf` in the bridge steamapps dir is gone. The `Avernum 6` dir with its exe, `appmanifest_206060.acf` and the phase17 `appmanifest_570.acf` all still exist. `library.get(APP_ID)?.is_installed` is false and `removePerGameBridgeBottle` was not called.
    - Test B: same fixture, but delete `appmanifest_570.acf` with `realRmSync` before calling uninstall. The result is still `{ stdout: '', stderr: '' }`, the `Avernum 4` dir is gone and `is_installed` is false. This pins `force: true` on the manifest delete, so a missing manifest does not turn a successful uninstall into an error.
    - Every existing case in the bridge-routing describe stays green unchanged. That covers the per-game D-D cases, the D-UAT-24-07 `done` cases and the nothing-to-remove case.
  </behavior>
  <action>
RED first. In `src/backend/storeManagers/steam/__tests__/games.test.ts`, add a nested describe
inside `describe('SteamGame.uninstall() — Phase 24 Plan 08 bridge routing (R4/R6)')`. Place it
after the `per-game bottle removal (D-D)` describe and before the regression test for
non-allowlisted titles. Name it
`'261017-bqw: legacy shared bottle — real filesystem manifest unlink'`, and add a 3-5 line
comment above it that cites the source todo and the 261016-wsq Arm 2 measurement.

Copy the SharedDepots real-disk fixture's shape (L5237-5290):
- `let` bindings for `tmp`, `bridgeSteamappsDir`, `phase17SteamappsDir`, `installDir`,
  `manifestPath`, `siblingDir` and `siblingManifestPath`.
- `beforeEach`: `mkdtempSync(realJoin(tmpdir(), 'gamelib-bridge-legacy-uninstall-test-'))`, then
  `mkdirSync(..., { recursive: true })` and `writeFileSync` to build the tree described in
  `<behavior>`. Re-arm the mocks here, because `resetMocks` wipes them and the outer
  `beforeEach` keys `getBottleSteamappsDir` to `/mock/...` paths:
  - `getBottleSteamappsDir` gets a plain synchronous `mockImplementation` keyed with `===` on
    `'GameLibSteamBridge'`.
  - `bridgeAllowlist.has` gets `mockReturnValue(true)`.
  - `resolveBridgeLaunchExe` gets `mockResolvedValue(realJoin(installDir, 'Avernum4.exe'))`.
  - `library.set(APP_ID, makeEntry({ title: 'Avernum 4', is_installed: true, install: { install_path: installDir } }))`.
- `afterEach`: `realRmSync(tmp, { recursive: true, force: true })`.

Write Test A and Test B from `<behavior>`. Assert files with `realExistsSync(...)` and mocks with
the top-level imported `jest.fn`s. Use no `async` mock implementations and add no
`no-explicit-any` disable comment (see the lint trap in `<context>`).

Run the jest command from `<verify>` and confirm Test A FAILS on the `appmanifest_570.acf`
existence assertion, and only that one. Record the failing assertion line for the SUMMARY.
Test B may already pass at HEAD, which is expected: it pins the `force` semantics rather than the
defect. If Test A fails on anything other than the manifest assertion, the fixture is wrong. Fix
the fixture, not the production code.

GREEN. In `src/backend/storeManagers/steam/games.ts`, `uninstallBridgeGame()`, legacy branch only.
This is the code path after the per-game `if`, the `!exePath` branch and the `!installRoot`
refusal:
1. After `installRoot` is resolved and the unsafe-path refusal passes, build a `manifestPath`
   const. Use `join` on `getBottleSteamappsDir(bottleName)` and the filename
   `appmanifest_${this.appId}.acf`, where `bottleName` is the method's existing local from its
   first line. This is the exact path shape `resolveBridgeBottleName`'s legacy arm probes, and
   the same construction `uninstallBottleGameDirectly` uses at L2770. Build it from the resolved
   bottle's steamapps dir and the appId only, never from any other string.
2. Inside the existing try block, add `rmSync(manifestPath, { force: true })` immediately after
   `rmSync(installRoot, { recursive: true, force: true })`. This mirrors games.ts L2815-2816 and
   library.ts L2236-2237. Keep the single try/catch: if either delete throws, the existing catch
   logs a warning, returns `Failed to remove bridge install: ...` in stderr and does NOT call
   `markBridgeGameUninstalled()`, which is the precedent's behaviour. The catch's warning text
   names only `installRoot`; extend it to name both paths so a failed manifest delete is
   diagnosable from the log.
3. Extend the success `logInfo` to name both removed paths, keeping its existing prefix
   `SteamGame: removed bridge install for appId ${this.appId} at "${installRoot}"`. Append
   ` and its manifest "${manifestPath}"`. Live gates grep this line for evidence.
4. Leave the `!exePath` "nothing to remove" branch UNCHANGED, and add a full-line `//` comment
   (2-4 lines) there saying why. `resolveBridgeLaunchExe` returns undefined on no CM client, a
   PICS failure or no Windows launch entry, so the game's files are usually still on disk.
   Deleting only the manifest there would orphan an install GameLib could no longer see. A
   surviving manifest there re-marks a game whose files still exist, so it stays visible.
5. Do not add a new `NUMERIC_APP_ID` guard. It would be unreachable: `getBridgeBottleSettings(this.appId)`
   on the method's first line already throws for a non-numeric appId (bottle.ts L1253-1260, via
   `bridgeBottleNameFor`'s `NUMERIC_APP_ID` test), and `isBridgeEligible()` only admits
   allowlisted ids, which `bridge/allowlist.ts` validates with a `^\d+$` zod regex. Record this
   instead in a 2-3 line full-line `//` comment directly above the `manifestPath` const, so the
   A-12 lesson (games.ts L2650-2660) is visibly answered at this site.
6. Update `uninstallBridgeGame()`'s JSDoc (L2470-2490). The sentence saying the legacy-bottle
   body "runs unchanged" is no longer true. Replace it with 3-6 lines saying that the legacy
   branch now ALSO removes this appId's own `appmanifest_<appId>.acf` from the legacy bottle's
   steamapps dir, together with the install root. Give the reason: a surviving manifest is read
   back by `buildBridgeInstalledMap()` and `resolveBridgeBottleName()` on the refresh that
   `markBridgeGameUninstalled()`'s `gameStatusUpdate done` triggers. That refresh re-marked the
   game installed with a deleted `install_path` and hid it from the grid, as measured by quick
   task 261016-wsq, Arm 2. Cite quick task 261017-bqw. Say that the per-game branch gets the same
   result by construction, because the whole bottle is removed.

Write comments as full-line `//` comments, never trailing code-line comments. The verify gate
strips full-line comments before counting.

Out of scope, with reasons:
- No frontend `nonAvailableGames` or bridge-poller change. The todo's own evidence shows the grid
  healed with no frontend change once the manifest was gone and the library refreshed
  (07:49:52 / 07:50:08), so the manifest unlink alone removes the revert.
- No change to `removeSteamInstallCopy`, which already removes the manifest.
- No change to the per-game branch or to `bottle.ts`.
- No live CrossOver run. A live confirmation would mean uninstalling one of the operator's real
  remaining legacy-bottle games (Avernum 6 or HOARD). That is an operator decision, not part of
  this desk task.

GREEN check: run the full `<verify>` set. Test A and Test B pass, the file count is 276, and
nothing else changed. Then run `graphify update .` (graphify-out is git-ignored, so this adds
nothing to the commit). Commit both files together as
`fix(261017-bqw): unlink the legacy bridge bottle appmanifest on uninstall`. A separate RED
`test(261017-bqw): ...` commit beforehand is also acceptable.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm lint</automated>
    <automated>npx prettier --file-info src/backend/storeManagers/steam/games.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/backend/storeManagers/steam/__tests__/games.test.ts | grep -Eq '"ignored":[[:space:]]*false'</automated>
    <automated>npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
    <automated>test "$(awk '/private async uninstallBridgeGame\(/{f=1} /private async uninstallBottleGameDirectly\(/{f=0} f' src/backend/storeManagers/steam/games.ts | grep -vE '^[[:space:]]*(//|\*)' | grep -cE 'rmSync\(')" = "2"</automated>
    <automated>test "$(awk '/private async uninstallBridgeGame\(/{f=1} /private async uninstallBottleGameDirectly\(/{f=0} f' src/backend/storeManagers/steam/games.ts | grep -vE '^[[:space:]]*(//|\*)' | grep -c 'appmanifest_')" -ge 1</automated>
    <automated>test "$(grep -c '261017-bqw' src/backend/storeManagers/steam/__tests__/games.test.ts)" -ge 1</automated>
  </verify>
  <done>
    - RED recorded: before the games.ts edit, Test A failed on the `appmanifest_570.acf` existence assertion.
    - The jest run prints `Running one project: Backend`, `Test Suites: 1 passed, 1 total` and `Tests: 276 passed, 276 total`. That is the 274 baseline plus exactly the two new cases, with 0 failed and 0 skipped. Read the full-file count; never rely on a `-t`-filtered run as the pass signal.
    - `pnpm codecheck` exits 0.
    - `pnpm lint` prints `production: PASS | tests: PASS`. The tests scope stays at ≤ 638 warnings and `TESTS_CEILING` is not bumped.
    - Both source paths report `"ignored": false` and pass `npx prettier --check`.
    - The `uninstallBridgeGame` slice has exactly 2 non-comment `rmSync(` lines (baseline 1) and at least 1 non-comment `appmanifest_` line (baseline 0).
    - The `!exePath` branch and the per-game branch are byte-unchanged apart from the added explanatory comment.
  </done>
</task>

<task type="auto">
  <name>Task 2: Close the source todo and annotate the sibling cleanup todo</name>
  <files>.planning/todos/pending/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md, .planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md, .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md</files>
  <action>
1. Run `git mv .planning/todos/pending/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md .planning/todos/completed/`
   so history follows the file. `.planning/todos/completed/` is the repo's convention: the
   261016-wsq close moved `2026-10-16-per-game-bridge-bottles-live-gate.md` there the same way.
2. Do not touch the moved file's frontmatter. `severity: major`, `platform: macos` and
   `ready: code` stay exactly as written. The CI todo gate (`.planning/todos/todo-frontmatter-gate.py`)
   scans `pending/` only, and `completed/` is deliberately exempt, so there is nothing to change.
   Append a `## Closed` section to the end of the body, matching
   `.planning/todos/completed/2026-10-16-per-game-bridge-bottles-live-gate.md`'s `## Closed`
   section. Its first line is "Closed 2026-10-17 by quick task 261017-bqw
   (`.planning/quick/261017-bqw-unlink-the-legacy-bottle-appmanifest-on-/`)." Follow it with one
   short paragraph covering:
   - what changed: the legacy branch of `uninstallBridgeGame()` now deletes this appId's
     `appmanifest_<appId>.acf` from the legacy bottle's steamapps dir, in the same try as the
     install root;
   - Task 1's commit short hash;
   - the two new test names and the jest count, 274 → 276;
   - that the frontend `nonAvailableGames` path was deliberately left unchanged, with the todo's
     own heal-on-refresh evidence as the reason.

   Add one further sentence: the fix is desk-verified against a real-filesystem jest fixture,
   not on CrossOver. A live confirmation would mean uninstalling one of the operator's remaining
   legacy-bottle games (Avernum 6 or HOARD), which is an operator decision.

   Wrap prose at the width the file already uses. Prettier ignores this path, so hand-match the
   surrounding corpus.
3. In `.planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md`,
   edit the BODY only, and leave the frontmatter untouched. The file stays in `pending/` because
   its item 2 (LD-5) is still open. At the end of item 1's paragraph, append one sentence:
   "**Fixed 2026-10-17 by quick task 261017-bqw** — the legacy branch of `uninstallBridgeGame()`
   now removes the manifest; the promoted todo is in `.planning/todos/completed/`." Keep item 1's
   existing indentation, so the list does not break.
4. Commit all three paths as
   `docs(quick-261017-bqw): close legacy-bottle uninstall revert todo`. Stage explicitly by path,
   including the pending-side deletion that `git mv` already staged. Do NOT stage `.planning/STATE.md`,
   `.planning/milestone.lock` or anything else. The orchestrator owns STATE.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md && test ! -e .planning/todos/pending/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md</automated>
    <automated>test "$(awk 'NR==1 && /^---$/ {f=1; next} f && /^---$/ {exit} f' .planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md | grep -cE '^(severity: major|platform: macos|ready: code)$')" = "3"</automated>
    <automated>test "$(awk 'NR==1 && /^---$/ {f=1; next} f && /^---$/ {exit} f' .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md | grep -cE '^(severity: minor|platform: macos|ready: human)$')" = "3"</automated>
    <automated>test "$(grep -c '261017-bqw' .planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md)" -ge 1 && test "$(grep -c '261017-bqw' .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md)" -ge 1</automated>
    <automated>pnpm planning-gates</automated>
    <automated>npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
    <automated>npx prettier --file-info .planning/todos/completed/2026-10-17-legacy-bridge-bottle-uninstall-reverts-within-seconds.md | grep -Eq '"ignored":[[:space:]]*true' && npx prettier --file-info .planning/todos/pending/2026-10-16-bridge-bottle-cleanup-gaps-after-per-game-bottles.md | grep -Eq '"ignored":[[:space:]]*true'</automated>
  </verify>
  <done>
    - The source todo exists only under `.planning/todos/completed/`, and git records it as a rename.
    - Its frontmatter still carries `severity: major`, `platform: macos` and `ready: code`, byte-identical.
    - It ends with a `## Closed` section naming 261017-bqw, Task 1's commit and 274 → 276.
    - The sibling todo's item 1 carries the fixed-by sentence, and its frontmatter is byte-identical.
    - `pnpm planning-gates` prints `12/12 planning gates passed.`.
    - The games.test.ts run still prints `Tests: 276 passed, 276 total`.
    - Prettier: all three written paths are under `.planning/`, which `npx prettier --file-info` reports as `"ignored": true`. A `--check` over them would be vacuous, so this task deliberately omits it, per the gamelib-conventions `<verify>` rule. The `--file-info` probe in `<verify>` proves the omission is correct, and consistency comes from hand-matching the surrounding file.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| appId string → filesystem delete path | The appId reaches `uninstall()` from renderer IPC (`getGame(appName)`) and becomes part of a second delete target, `appmanifest_<appId>.acf`. |
| shared legacy bridge bottle → other games' state | `GameLibSteamBridge` is shared by every pre-migration bridge game (Avernum 5, Avernum 6 and HOARD on the operator's Mac). A wrong delete flips another game to not-installed. |
| on-disk ACF manifest → installed state | A manifest in any ready bridge bottle decides what `buildBridgeInstalledMap()` reports as installed on the next refresh. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-bqw-01 | Tampering | `manifestPath` construction in `uninstallBridgeGame()` legacy branch | medium | mitigate | The filename is built only from `this.appId`, which is numeric by construction. `getBridgeBottleSettings(this.appId)` on the method's first line throws for a non-numeric id (via `bridgeBottleNameFor`'s `NUMERIC_APP_ID`), and `isBridgeEligible()` admits only allowlisted ids validated by a `^\d+$` zod regex. The directory is `getBottleSteamappsDir(bottleName)` for the resolver-chosen legacy bottle, so no renderer string other than the validated appId reaches the path. The reasoning is recorded in a code comment at the site (Task 1, step 5). |
| T-bqw-02 | Tampering | Over-deletion inside the shared legacy bottle or the Phase 17 bottle | high | mitigate | Exactly one extra file is deleted: `appmanifest_<thisAppId>.acf`, a single `rmSync` with `force: true` and no `recursive`, no glob and no directory walk. Test A proves it on a real filesystem: the sibling legacy game's manifest and install dir survive, and so does the Phase 17 `GameLibSteam` bottle's own `appmanifest_570.acf` for the same appId. |
| T-bqw-03 | Repudiation | Partial failure where the install root is removed but the manifest delete throws | low | accept | Both deletes share one try/catch, mirroring `uninstallBottleGameDirectly` and `removeSteamInstallCopy`. A throw returns a real stderr and skips `markBridgeGameUninstalled()`, so the user sees a failed uninstall rather than a silent revert. The catch's log names both paths (Task 1, step 2). |
| T-bqw-04 | Denial of Service | `!exePath` branch keeps the manifest | low | accept | Deliberate: with no CM client or no PICS answer, the game's files are usually still on disk. Deleting only the manifest would orphan an install GameLib cannot see. The surviving manifest re-marks a game whose files exist, so it stays visible. This is documented in a code comment (Task 1, step 4). |
| T-bqw-SC | Tampering | npm/pip/cargo installs | high | accept | No package-manager install is in scope. If an executor finds it needs one, STOP and escalate. The package-legitimacy gate has not been run for this task. |
</threat_model>

<verification>
- Task 1's RED-then-GREEN sequence is recorded. The real-disk Test A fails at HEAD on the manifest assertion and passes after the edit.
- `games.test.ts` goes from 274 to 276 passing, with no other count change.
- `pnpm codecheck` exits 0, `pnpm lint` prints `production: PASS | tests: PASS`, and `TESTS_CEILING` is untouched.
- Both source paths are prettier-clean, and the three `.planning/` paths are confirmed prettier-ignored.
- `pnpm planning-gates` prints 12/12.
- `git status --short` after the last commit shows only the pre-existing untracked `.planning/milestone.lock`, plus whatever the orchestrator itself writes.
</verification>

<success_criteria>
- A bridge game in the legacy shared bottle, once uninstalled, leaves no `appmanifest_<appId>.acf` in that bottle. The refresh that follows therefore cannot re-mark it installed or drop it from the grid.
- No other game's files or manifests are touched in the legacy bottle or the Phase 17 bottle.
- The per-game, nothing-to-remove and unsafe-path branches are behaviourally unchanged.
- The source todo is closed in `.planning/todos/completed/` with its frontmatter intact. The sibling cleanup todo records that its item 1 is fixed.
</success_criteria>

## Output

After completion, write `.planning/quick/261017-bqw-unlink-the-legacy-bottle-appmanifest-on-/261017-bqw-SUMMARY.md`.
It must include:
- the RED failing-assertion line for Test A;
- a before/after table for every gate above (jest 274 → 276, codecheck, lint per scope, prettier, planning-gates, the two awk slice counts);
- both commit hashes;
- an explicit statement that the fix is desk-verified only, against a real-filesystem jest fixture, and has not been run on CrossOver;
- under open observations, the `!exePath` branch's offline behaviour, written up as described in Task 1, step 4.

Do not write `.planning/STATE.md`.
