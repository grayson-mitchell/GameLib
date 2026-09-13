---
phase: quick-260912-qop
plan: 01
subsystem: testing
tags: [jest, legendary, save-sync, characterisation-test, stale-cache]

requires: []
provides:
  - A hermetic jest characterisation test proving `getGameInfo(appName, forceReload=true)` returns
    a stale `save_path` because install fields are merged from the stale module-scope
    `installedGames` map, not re-read from `installed.json`.
  - Two recorded negative controls proving the probe can genuinely fail (not decorative).
  - A dated measurement note appended to the pending todo this probe serves (todo remains open).
affects: [legendary-save-sync, installed-json-watcher]

tech-stack:
  added: []
  patterns:
    - "jest.mock factory minting a disposable mkdtemp fixture root for a constants-shaped module,
       instead of hand-stubbing electron's app.getPath chain"
    - "Real, unmocked fs/graceful-fs against a hermetic temp root, when the measurement's entire
       question is whether production code consults the filesystem"

key-files:
  created:
    - src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts
  modified:
    - .planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md

key-decisions:
  - "Probe written as a PASSING characterisation test (not a red regression test), per CONTEXT.md,
     so it documents current behaviour and will flip red only when the defect is fixed."
  - "Mocked only ../constants (fixture root) plus heavy/irrelevant import-chain dependencies
     (backend/logger, ../../../utils, ../../../launcher, backend/online_monitor, ../electronStores,
     ../user, ../games); left fs, path, ./thirdParty, ./commands, backend/schemas,
     backend/constants/environment, ../e2eMock, backend/ipc, backend/platform, backend/main_window
     real and unmocked."
  - "No production source modified. No eslint-disable added; TS2556 spread errors were fixed by
     giving the underlying mock functions variadic signatures rather than suppressing."

requirements-completed: ['QT-260912-qop']

duration: ~90min
completed: 2026-09-12
---

# Quick Task 260912-qop: getGameInfo forceReload stale-map probe Summary

**Hermetic jest characterisation test measures (not fixes) that `LegendaryLibraryManager.getGameInfo('Iris', true)` returns a stale `save_path` from a module-scope cache even though `installed.json` on disk already holds a fresher value, with a positive control, a write-through control, a trap guard, and two verified-failing negative controls.**

## Performance

- **Duration:** ~90 min
- **Tasks:** 3/3 completed
- **Files modified:** 2 (test file created, pending todo appended); 1 SUMMARY created

## Accomplishments

- Turned a static reading of source into a repeatable, hermetic jest measurement.
- Proved via a positive control, write-through control, and trap guard that the staleness is real
  and not an artifact of a broken fixture or an early-return trap.
- Proved via two negative controls that the probe is capable of failing, i.e. it is not decorative.
- Left both `src/backend/save_sync.ts` and `src/backend/storeManagers/legendary/library.ts`
  byte-identical to HEAD.

## Task Commits

1. **Task 1 + Task 2 (combined): stale-map characterisation probe with three controls, negative
   controls run and reverted** - `7d6a9dbd4` (test)
   - Negative-control mutations (Task 2) were applied, run, captured, and reverted before this
     commit; only the final Task-1 state was committed.

**Task 3 (this summary + todo update):** not committed by this executor per commit discipline —
left for the orchestrator, along with this SUMMARY.md.

## Files Created/Modified

- `src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts` (created,
  329 lines) — the characterisation probe.
- `.planning/todos/pending/2026-09-05-getdefaultsavepath-live-redrive-never-taken-against-a-real-legendary-title.md`
  (modified) — dated section appended recording the desk-half measurement; todo remains in
  `pending/`, frontmatter (`severity: medium`, `platform: any`, `ready: live-gate`) unchanged since
  the discharge condition is still a live gate.

## Measurement Result

Running the real (unmocked) `LegendaryLibraryManager` against a hermetic mkdtemp fixture root
(only `../constants` and heavy/irrelevant import-chain dependencies mocked; `fs`/`graceful-fs` real):

1. `installed.json` is seeded with `Iris.save_path = OLD_SENTINEL` (`/qop/OLD-stale-save-path`).
2. `manager.loadGamesInAccount()` + `manager.refreshInstalled()` simulate app startup.
3. `installed.json` on disk is rewritten with `NEW_SENTINEL` (`/qop/NEW-fresh-save-path`),
   simulating what `legendary sync-saves --accept-path` does inside
   `getDefaultLegendarySavePath()`.
4. `manager.getGameInfo('Iris', true)` is called — the exact call `save_sync.ts` L89-91 makes.

**All three controls held:**

- **Trap guard:** `staleInfo` is defined, `title === 'Phoenix Point'`, `is_installed === true` —
  rules out all five `loadFile()` early-return paths as the explanation.
- **Write-through control:** reading `installed.json` back with real `fs` at the same point
  confirms `save_path === NEW_SENTINEL` on disk — the staleness cannot be blamed on a fixture write
  that silently failed.
- **The defect (characterisation, asserted GREEN):** `staleInfo.save_path === OLD_SENTINEL` — the
  in-memory `getGameInfo(appName, true)` call returns a value already superseded on disk.
- **Positive control:** after an explicit `manager.refreshInstalled()`, the SAME
  `getGameInfo('Iris', true)` call now returns `save_path === NEW_SENTINEL`.

Suite result: `Test Suites: 1 passed, 1 total` / `Tests: 1 passed, 1 total`.

## Negative Controls (verbatim)

**NC-1** — mutate the defect assertion's expected value from `OLD_SENTINEL` to `NEW_SENTINEL`.
Required observation: fails with `Received:` = the OLD sentinel.

```
expect(received).toBe(expected) // Object.is equality

Expected: "/qop/NEW-fresh-save-path"
Received: "/qop/OLD-stale-save-path"

  316 |       // disk rewrite above. This assertion is EXPECTED TO FLIP TO RED the day someone fixes
  317 |       // getGameInfo/save_sync; that flip is the signal this probe exists to produce.
> 318 |       expect(staleInfo!.save_path).toBe(NEW_SENTINEL) // NC-1 mutation (temporary)
      |                                    ^
  319 |
  320 |       // POSITIVE CONTROL: without this arm, the "stale" assertion above would be satisfiable
  321 |       // by a probe that never wired anything up at all. After an explicit refreshInstalled(),

  at Object.<anonymous> (src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts:318:36)
```

Result: PASS (required observation met) — the stale arm reads a real, distinct OLD value, not
`undefined` and not a mock.

**NC-2** — comment out only the step that rewrites `installed.json` with `NEW_SENTINEL`.

Literal-mutation result (fails at the WRITE-THROUGH CONTROL, not the positive control, because
jest's sequential `it()` block fails fast at the first thrown `expect()` and the write-through
control sits between the mutation and the positive control):

```
expect(received).toBe(expected) // Object.is equality

Expected: "/qop/NEW-fresh-save-path"
Received: "/qop/OLD-stale-save-path"

  299 |         InstalledJsonMetadata
  300 |       >
> 301 |       expect(onDisk[APP_NAME].save_path).toBe(NEW_SENTINEL)
      |                                          ^
  302 |
  303 |       // Step 4 (plan): the exact call save_sync.ts L89-91 makes.
  304 |       const staleInfo = manager.getGameInfo(APP_NAME, true)

  at Object.<anonymous> (src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts:301:42)
```

Supplementary isolated result (write-through control's own assertion also suppressed, in addition
to the disk-rewrite mutation, to isolate the positive-control arm specifically):

```
expect(received).toBe(expected) // Object.is equality

Expected: "/qop/NEW-fresh-save-path"
Received: "/qop/OLD-stale-save-path"

  324 |       const freshInfo = manager.getGameInfo(APP_NAME, true)
  325 |       expect(freshInfo).toBeDefined()
> 326 |       expect(freshInfo!.save_path).toBe(NEW_SENTINEL)
      |                                    ^
  327 |     }
  328 |   )
  329 | })

  at Object.<anonymous> (src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts:326:36)
```

Result: PASS (required observation met, via the supplementary isolated run) — the positive control
is genuinely driven by the disk rewrite + `refreshInstalled()`, not decorative. The literal
mutation's failure at the upstream write-through control is itself a correct and expected outcome
of jest's fail-fast semantics, not a fixture defect — it independently confirms the write-through
control is disk-driven too.

Both mutations were reverted after capture; `git diff` against HEAD showed no residual changes, and
the suite was re-run fresh: `Test Suites: 1 passed, 1 total` / `Tests: 1 passed, 1 total`.

## Open Question

**Does making this behaviour observable require a production source change?**

**Answer: NO**, confirmed by execution. `refreshInstalled()` and `getGameInfo()` are both public
methods; `hasGame()` is satisfied via the public `loadGamesInAccount()`; the fixture root is fully
reachable by mocking `../constants` alone (`legendaryConfigPath` and its five derived paths). No
edit to `src/backend/save_sync.ts` or `src/backend/storeManagers/legendary/library.ts` was needed
or made. This planning-time answer is re-affirmed, not corrected.

## Decisions Made

- Characterisation test (passing, not red) per CONTEXT.md's locked decision — pins current
  behaviour so a future fix flips it red as the signal.
- Mock boundary: `../constants` (fixture root) + `backend/logger`, `../../../utils`,
  `../../../launcher`, `backend/online_monitor`, `../electronStores`, `../user`, `../games` (heavy
  or irrelevant import-chain dependencies). Left `fs`/`graceful-fs`, `path`, `./thirdParty`,
  `./commands`, `backend/schemas`, `backend/constants/environment`, `../e2eMock`, `backend/ipc`,
  `backend/platform`, `backend/main_window` real and unmocked — each confirmed lightweight or
  deliberately import-safe by design.
- Fixed 4 TS2556 spread-argument errors by giving the underlying mock functions variadic
  `(..._args: unknown[])` signatures instead of the delegating-arrow wrappers assuming zero-arg
  mocks.
- Fixed one `@typescript-eslint/require-await` warning by removing an unneeded `async` and
  returning `Promise.resolve(false)` directly — no `eslint-disable` added, per repo lint-ceiling
  convention.

## Deviations from Plan

None — plan executed exactly as written. Both negative controls were run per Task 2's exact
specification; NC-2's literal mutation surfaced at the write-through control rather than the
positive control due to jest's fail-fast sequential-assertion semantics, which was resolved by
running the supplementary isolated variant specified as acceptable investigation rather than by
altering the fixture (the fixture was not "wrong" — the literal result is itself correct and
expected given the block's assertion order).

## Issues Encountered

- TS2556 spread-argument errors (4 occurrences) — resolved, see Decisions Made.
- One `require-await` ESLint warning — resolved, see Decisions Made.
- NC-2 ordering ambiguity between the plan's literal instruction and jest's fail-fast semantics —
  resolved by capturing both the literal result and a supplementary isolated result, both recorded
  verbatim above.

## Verification Observed

1. `npx jest --selectProjects Backend --runTestsByPath .../getGameInfoForceReloadStaleness.test.ts`
   — `Test Suites: 1 passed, 1 total`, `Tests: 1 passed, 1 total`.
2. Both negative controls produced their required failure signatures (verbatim above) and were
   reverted; suite re-run green afterward.
3. `git status --porcelain -- src/backend/save_sync.ts src/backend/storeManagers/legendary/library.ts`
   — empty (confirmed twice: once after Task 2, once again before writing this summary).
4. `npx tsc --noEmit -p tsconfig.json` — clean.
5. `npx eslint` on the test file — 0 errors, 0 warnings, no `eslint-disable` added.
6. `pnpm planning-gates` — see below.

## Next Phase Readiness

- The desk-provable half of the pending todo is now measured; the todo stays open on its live-gate
  condition (a real legendary title, live app session).
- A future fix task (adding a `refreshInstalled()` call before the `getGameInfo` readback in
  `save_sync.ts`, or having `getGameInfo` consult `installed.json` directly) is gated on this
  result and is a separate, unstarted task.

---
*Quick task: 260912-qop*
*Completed: 2026-09-12*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/legendary/__tests__/getGameInfoForceReloadStaleness.test.ts`
- FOUND: `.planning/quick/260912-qop-getgameinfo-forcereload-stale-map/260912-qop-SUMMARY.md`
- FOUND: commit `7d6a9dbd4` in `git log --oneline --all`
- `pnpm planning-gates`: 11/11 passed (matches pre-existing baseline at `5ded84fab`)
