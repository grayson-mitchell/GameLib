---
task: 260822-b05
title: "Fix reconcileNonAvailableGames trapping uninstalled games on the nonAvailableGames list"
type: quick
branch: fix/steam-native-install-stability
area: frontend/library
severity: major
resolves_todo: .planning/todos/pending/2026-08-22-nonavailablegames-permanently-traps-uninstalled-games.md
resolves_phase: 37
planned_as: 37-08
files_modified:
  - src/frontend/hooks/constants.ts
  - src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
---

<objective>
`reconcileNonAvailableGames` can only heal a `nonAvailableGames` entry when
`window.api.isGameAvailable()` returns `true`. A NOT-INSTALLED game can never return `true` from
that predicate in any of the four runners, so once an owned game becomes uninstalled its entry is
trapped forever: it is excluded from the grid, so its GameCard never mounts, so the card's own
removal path never runs. Observed live 2026-08-22 on appid 259130.

Fix the FRONTEND reconciliation semantics: an entry for a not-installed game is meaningless by
construction and must be dropped without consulting `isGameAvailable`. One runner-agnostic change
covers steam/gog/nile/legendary at once.

Output: a shared drop-from-list helper, a `!is_installed` heal branch in
`reconcileNonAvailableGames`, three tests, and refreshed doc comments.
</objective>

<context>
The defect is ALREADY FULLY ROOT-CAUSED. Do not re-investigate. Everything below was verified by
direct source reading on 2026-08-22 and is current at HEAD.

@.planning/todos/pending/2026-08-22-nonavailablegames-permanently-traps-uninstalled-games.md

Verified facts (each with a line reference — re-read only what you edit):

- `src/frontend/hooks/constants.ts:76-78` — `storage`, and `nonAvailbleGamesArray` parsed from
  localStorage ONCE at module load. Module-level mutable state; tests must control it at import
  time (see Task 1).
- `src/frontend/hooks/constants.ts:80-104` — `handleNonAvailableGames`. Its `!gameAvailable`
  branch is the ONLY writer that ADDS to the list; its `else` branch is the only remover
  (splice + `storage.setItem`). That remover is the side effect to extract.
- `src/frontend/hooks/constants.ts:153-176` — `reconcileNonAvailableGames`. Snapshots the list,
  finds each appName in `libraryUnion`, calls `handleNonAvailableGames`, returns the healed
  appNames.
- `src/frontend/screens/Library/index.tsx:922-930` — the caller. A NON-EMPTY return value is what
  bumps `reconcileTick` and forces the one extra render that surfaces the correction. A heal via
  the new branch MUST be included in the returned array or the fix will not reach the screen this
  render.

INTERACTION REVIEW — RESOLVED, but must be PINNED by a test:
`filterEngine.isNonAvailableGame` (`src/frontend/screens/Library/filterEngine.ts:241-249`) is
`deps.nonAvailableAppNames.includes(app_name) || (runner === 'steam' && !!is_delisted)`. The
delisted clause is an INDEPENDENT `OR`, not routed through the list. Dropping a delisted game's
entry from `nonAvailableGames` therefore CANNOT make it visible — the delisted clause still hides
it. `findSilentlyExcludedGames` (`components/LibraryHeader/gameCount.ts:121-140`) also filters
`!game.is_delisted` deliberately, so the fix cannot make the blind-spot guard noisy on delisted
titles. Task 1 pins this premise; do not merely trust this paragraph.
(Relevant but separate: the nine-false-delisted defect is 37-03. Do not touch it.)

Test environment facts:
- `src/frontend/jest.config.js` is `testEnvironment: 'node'` — there is NO `window`, NO jsdom, and
  `resetMocks: true`. Stub `window` on `globalThis` BEFORE the import, per
  `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx:26-32`.
- `src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` MOCKS `../constants` wholesale, so it
  is NOT the home for these tests. Create a new file.
- ts-jest runs TRANSPILE-ONLY here: type errors do NOT fail tests. Run `tsc` separately.
</context>

<reference_shapes>
Target shape for the extracted helper (adapt freely; the constraint is that exactly ONE place
mutates the array and persists it):

```ts
/** Removes `appName` from the nonAvailableGames list and persists. Returns true if it removed. */
function dropFromNonAvailableGames(appName: string): boolean {
  const index = nonAvailbleGamesArray.indexOf(appName)
  if (index === -1) return false
  nonAvailbleGamesArray.splice(index, 1)
  storage.setItem('nonAvailableGames', JSON.stringify(nonAvailbleGamesArray))
  return true
}
```

Target shape for the new branch inside `reconcileNonAvailableGames`'s per-candidate callback,
placed AFTER the existing `if (!game) return null` guard and BEFORE the
`handleNonAvailableGames` call (so the IPC round-trip is skipped entirely for this case):

```ts
if (!game.is_installed) {
  return dropFromNonAvailableGames(appName) ? appName : null
}
```
</reference_shapes>

<tasks>

### Task 1 — Write the tests and PROVE the regression test is RED at HEAD

**Files:** `src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts` (new)

**Action:**
Create the test file. It must import the REAL `frontend/hooks/constants` (not a mock). Because
`nonAvailbleGamesArray` is seeded from `localStorage` once at module load, each test needs a fresh
module registry: set up a fake `window` (`localStorage` with a real backing `Map`-or-object, plus
`api.isGameAvailable` as a `jest.fn`) on `globalThis`, seed the fake `nonAvailableGames` key, then
`jest.isolateModules(() => { ... require('../constants') ... })` per test. Set the
`isGameAvailable` implementation INSIDE each test — `resetMocks: true` wipes implementations
between tests.

Write exactly three tests:

1. **Regression (must be RED at HEAD).** Seed the list with one appName. Pass a `libraryUnion`
   containing that game with `is_installed: false` and an empty `install: {}`, `runner: 'steam'`.
   Assert BOTH: (a) the returned healed array contains the appName — this is the half the caller
   at `Library/index.tsx:923` depends on to force the corrective render, and a fix that only
   mutates localStorage would silently fail here; and (b) the persisted
   `localStorage['nonAvailableGames']` no longer contains it.
2. **Over-correction guard (GREEN before and after).** Seed the list with one appName, pass it in
   the union with `is_installed: true`, and make `isGameAvailable` resolve `false` (the genuine
   "installed but install_path is gone" case). Assert the returned array is EMPTY and the appName
   is STILL persisted on the list. This is what stops the fix from silently deleting the feature.
3. **Delisted-premise pin (GREEN before and after).** In the same file (or, if you prefer it
   co-located, `screens/Library/__tests__/filterEngine.test.ts`), assert
   `isNonAvailableGame({ runner: 'steam', is_delisted: true, ... }, { nonAvailableAppNames: [], ... })`
   returns `true` — i.e. delisted hiding does not depend on the list at all. Name it so the
   comment says explicitly that this is what makes the not-installed heal safe for delisted games.

Do NOT touch `constants.ts` in this task.

**Verify:**
```
pnpm jest --selectProjects Frontend src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
```
Test 1 MUST FAIL. Tests 2 and 3 MUST PASS. Copy the failing assertion output verbatim into a
scratch note — it goes into Task 2's commit message. A regression test that cannot fail against
known-bad input proves nothing (ledgered lesson, 6 instances); if test 1 passes at HEAD, the test
is wrong, not the diagnosis — fix the test before continuing.

**Done:** Test 1 observed RED with the actual assertion text captured; tests 2 and 3 green.

**Commit:** NONE. Deliberate — committing a red test would leave a broken HEAD for CI and for the
concurrent sessions in this tree. The RED evidence is carried into Task 2's commit message
instead.

---

### Task 2 — Implement the fix and commit it atomically with the tests

**Files:** `src/frontend/hooks/constants.ts`

**Action:**
1. Extract the splice + `storage.setItem` side effect from `handleNonAvailableGames`'s `else`
   branch (lines ~95-102) into a module-level helper (see `<reference_shapes>`), and call it from
   that `else` branch so there is exactly ONE mutator/persister for the array.
2. Add the `!game.is_installed` branch to `reconcileNonAvailableGames`'s per-candidate callback,
   after the `if (!game) return null` guard and before the `handleNonAvailableGames` call.
   Returning the appName on a successful drop is load-bearing, not cosmetic — it is what makes
   `Library/index.tsx` bump `reconcileTick`.
3. Update the STALE doc comments in the same commit — a comment that lies about behaviour is the
   same class of defect as a gate that is stale by behaviour. Specifically:
   - `constants.ts:132` ("the existing self-heal branch above removes it") — now there are two
     heal paths; say so.
   - `constants.ts:137` ("the list only shrinks from here ... only `handleNonAvailableGames`'s own
     `installed` branch adds to it") — the "only shrinks / converges to a no-op" property still
     holds and is still worth stating, but the reason list changed.
   - Add a short note on the new branch recording WHY it is correct: the list only ever means "an
     INSTALLED game whose install_path went missing", so an entry for a not-installed game is
     meaningless by construction; and note the verified delisted independence
     (`filterEngine.ts:241-249`) so a future reader does not re-derive it.
   Keep `Library/index.tsx`'s comment block untouched unless it makes a claim that is now false —
   if it does, fix it here rather than in a separate commit.

Do NOT change `isGameAvailable` in any runner. It has four implementations
(`steam/games.ts:2707`, `gog/games.ts` ~1298-1313, `nile/games.ts` ~570-580,
`legendary/games.ts`) and other callers; redefining its meaning is out of scope for this task.

**Verify:**
```
pnpm jest --selectProjects Frontend src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
pnpm codecheck
pnpm exec eslint -f json src/frontend/hooks/constants.ts src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
```
All three tests green. `tsc --noEmit` clean (ts-jest is transpile-only — a green suite says nothing
about types). For eslint, count ONLY entries with `severity === 2`; warnings print adjacent to
errors and have been mis-attributed here before.

**Done:** All three tests green, tsc clean, zero eslint errors on the two touched files.

**Commit:** ONE commit, both files, by EXPLICIT path (`gsd-sdk query commit` stages the entire
tree — do not use it; there is concurrent uncommitted work in `.planning/`, `src/backend/.../depot/`
and the depot test files owned by other sessions). Never `git stash`.
```
git add src/frontend/hooks/constants.ts src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
git commit
```
Message: `fix(library): drop nonAvailableGames entries for not-installed games`, body quoting the
Task 1 RED assertion output as proof the regression test discriminates.

---

### Task 3 — Full-gate sweep and handoff

**Files:** none expected

**Action:**
Run the full Frontend jest project to confirm nothing else depended on the old semantics —
`engineWiring.test.ts`, `filterEngine.test.ts`, `libraryHeaderVisibility.test.ts` and
`hasStatus.reconcile.test.ts` all sit adjacent to this behaviour. If any of them breaks, fix the
CODE only if the break reveals a real defect; if a test's premise legitimately changed, update the
test and say which premise died. Then update the todo file's status.

Do not run repo-wide `prettier --write`. The prettier gate is RED repo-wide by default here, so
complaints about files you did not touch are not yours; if prettier wants a change in one of the
two files you touched, apply it IN PLACE (not on a temp copy — a copy resolves a different config)
and amend Task 2's commit rather than adding a formatting commit.

**Verify:**
```
pnpm jest --selectProjects Frontend
pnpm exec prettier --check src/frontend/hooks/constants.ts src/frontend/hooks/__tests__/reconcileNonAvailableGames.test.ts
```

**Done:** Frontend project green with no new failures relative to the pre-task baseline (capture
that baseline count from HEAD BEFORE editing if you have not already — a subagent's suite count is
stamped to its own base, and HEAD moves under concurrent sessions).

**Commit:** Only if the sweep required a change (a test premise update, or in-place prettier on a
touched file). Otherwise no commit, and say so explicitly in the summary.

</tasks>

<out_of_scope>
- Changing `isGameAvailable` in any runner. Frontend fix only.
- `src/frontend/index.tsx:121`'s `storage.removeItem('nonAvailableGames')`. Note only: under ESM,
  `constants.ts`'s module body (and its `getItem` snapshot at line 77) evaluates before
  `index.tsx`'s body, so that removeItem cannot clear the in-memory array — which is part of why
  the entry survives launches. It is NOT this task's fix and must not be touched here.
- The wider library-hydration area, the false-delisted cluster (37-03), and the depot-decode work
  in flight in this tree.
- Live on-hardware re-verification, the cross-runner (gog/nile/legendary) confirmation, and
  closing `.planning/debug/uninstall-game-vanishes.md`. All three are explicitly owed by 37-08 per
  the todo. A green suite does not prove this fix — a live gate has beaten a green suite three
  times in this repo. Hand these forward; do not silently mark them done.
</out_of_scope>

<handoff>
Two-command live repro for whoever runs the 37-08 gate:
```
cd ~/Library/Application\ Support/Steam/steamapps
mv appmanifest_259130.acf /tmp/
mv common/Wasteland /tmp/
```
Relaunch GameLib; the game must now appear (as not-installed) instead of vanishing, and the
`Library: N owned Steam game(s) silently excluded ...` guard line must stop firing.
</handoff>
