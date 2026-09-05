---
phase: quick-260905-luf
plan: '01'
subsystem: steam
tags: [steam, download-manager, notifications, logging, jest, tdd]

requires: []
provides:
  - "resolveGameTitle() — the single shared title-fallback chain (live → enqueue-time gameInfo → appName) for every DownloadManager title consumer"
  - "Once-per-appId logWarning on SteamGame.getGameInfo() double cache miss"
  - "Regression tests pinning both the {} sentinel contract and the fallback chain"
affects: [downloadmanager, sidecar-install-flows, steam-store-manager]

tech-stack:
  added: []
  patterns:
    - "Producer stays silent-but-loud (log once per key via a module-level Set + test-reset export), consumer becomes fallback-safe — instead of changing a shared cross-runner sentinel contract"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts
    - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts

key-decisions:
  - "D-01 (from plan, confirmed not overturned): keep {} as the cross-runner sentinel; make the miss loud at the producer, fallback-safe at every consumer. Task 1 did not surface evidence contradicting plan items 2-4, so the overturn clause was not invoked."
  - "The reported causal chain in the task title was wrong as stated: showDialogBoxModalAuto (the install-failure DIALOG) was already guarded via resolveQueueElementTitle's `title || appName`. The actual nameless surface was the OS notification from downloadqueue.ts's processNotification, which had no fallback at all."

requirements-completed: [QUICK-LUF-01]

duration: 5m (commit-to-commit span; tracing/RED-proof work preceding the first commit is not separately timestamped)
completed: 2026-09-05
---

# Quick Task 260905-luf: SteamGame.getGameInfo() double cache miss — Summary

**Kept the `{}` cross-runner sentinel intact, made the double cache miss loud (log once per appId) at the producer, and gave every DownloadManager title consumer a single shared `resolveGameTitle()` fallback chain so a Steam install failure can no longer surface a nameless subject.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 8 (4 production, 4 test)
- **Test count:** 4530 total (4528 passed, 2 skipped) → 4541 total (4539 passed, 2 skipped) — **+11 new tests**, 0 regressions

## Task 1: Trace the real chain and RED-prove the unguarded consumer

### The `file:line` causal chain

```
games.ts:558  SteamGame.getGameInfo()
  → in-memory `library` Map miss
  → persisted `steamLibraryStore` miss
  → return {} as GameInfo                              (silent, no log — the defect site)
       │
       ├─→ dispatch.ts:82-89           if (!Object.keys(tempGameInfo).length) return null
       │                                — CORRECTLY converts {} to null for the frontend. Untouched.
       │
       ├─→ utils.ts:60 (resolveQueueElementTitle)      const { title } = ...getGameInfo(); return title || appName
       │                                — ALREADY GUARDED. This is the install-failure DIALOG
       │                                  (`gamelib:box.error.install.failed`) path. It cannot
       │                                  render an empty subject unless appName itself is empty.
       │
       └─→ downloadqueue.ts:388-390 (processNotification, pre-fix)
                                        const { title } = libraryManagerMap[...].getGame(...).getGameInfo()
                                        — UNGUARDED. `{} as GameInfo` casts `undefined` past tsc.
                                        notify({ title, body: 'Installation Failed' })
                                        → THE ACTUAL NAMELESS SURFACE: an OS notification titled
                                          with `undefined`, not the reported dialog.
```

### Evidence item 6 discrepancy — resolved, not glossed

The plan's evidence item 6 flagged a contradiction: the task's own framing implied the
install-failure **dialog** was the nameless surface, but `resolveQueueElementTitle`
(the dialog's title source) already has `|| appName`. Task 1's Test A is the falsifier
for this claim, and it came back **GREEN on first run, as the plan predicted**:

- **Test A** (`utils.test.ts`, CONTROL) — `installQueueElement` with a Steam runner,
  `getGameInfo()` mocked to `{}`, `install()` resolving `{status: 'error'}`. Asserted
  `showDialogBoxModalAuto` was called with a message containing the non-empty appName
  (`'1091500'`). **Result: PASSED on first run.** This confirms evidence item 6 as
  written — the dialog path was never broken.

- **Test B** (`downloadqueue.test.ts`, SUSPECT) — drove `processNotification`'s
  `status === 'error'` branch via the file's existing `initQueue()` harness, with a
  queue element carrying a real `params.gameInfo.title` and `getGameInfo()` mocked to
  `{}`. Asserted `notify` was called with a non-empty title. **Result: FAILED on first
  run** — `notify` was called with `title: undefined`, not a generic "cannot read
  property" error, confirming the harness reached the intended branch.

**Conclusion recorded per the plan's instruction:** the task description's framing
("install-failure dialog") is a hypothesis that does not hold; the actual nameless
surface a user would see is the **OS notification emitted by `processNotification`**,
not the dialog. D-01 was not overturned — this discrepancy is about *which surface*
is broken, not about the sentinel contract itself.

### Consumer census

Started from the four sites named in the plan's evidence items 2-9, widened with
`grep -rn "getGameInfo()" src/backend --include='*.ts' | grep -v __tests__` (full
census recorded; only title/GameInfo-shape consumers relevant to this defect are
verdicted below — the remaining ~60 hits across gog/legendary/nile/sideload/zoom
managers and library sync paths are same-runner reads of their own always-populated
`GameInfo` and are not-applicable to the Steam `{}` sentinel).

| Site | Reads | Verdict (pre-fix) | Action |
|---|---|---|---|
| `downloadmanager/utils.ts:60` (`resolveQueueElementTitle`) | `title` | **Guarded** (`title \|\| appName`) | Rewritten to delegate to `resolveGameTitle` (Task 2) — no behavior change |
| `downloadmanager/downloadqueue.ts:388-390` (`processNotification`) | `title` | **Unguarded** — the actual nameless surface | Fixed: now calls `resolveGameTitle(map, runner, appName, element.params.gameInfo)` |
| `sidecar/installFlowRegistration.ts:342` (`moveInstall`) | `title` | **Unguarded** | Fixed: now calls `resolveGameTitle(map, runner, appName)` (no queue element in scope, so chain is `live.title \|\| appName`) |
| `sidecar/installFlowRegistration.ts:475` (`importGame`) | `title` | **Unguarded** | Fixed: same as above |
| `gamedetails/dispatch.ts:82` | `Object.keys(tempGameInfo).length` | **Relies on `{}` intentionally** | Untouched — this IS the sentinel contract (`{}` → `null` for the frontend) |
| `sidecar/appShellFlowRegistration.ts:536` (tray runner resolution) | `info?.app_name` | **Relies on `{}` intentionally** | Untouched — a populated stub would make Steam falsely claim ownership of every unknown appName |
| `storeManagers/steam/library.ts:1257` | `fromGame.app_name` | **Relies on `{}` intentionally** | Untouched — a populated stub would short-circuit this fallback's own persisted-cache read |
| `backend/utils.ts:330`, `utils/uninstaller.ts:108`, `shortcuts/ipc_handler.ts:34`, `sidecar/shortcutsFlowRegistration.ts:143` | `title` off `getGame(...).getGameInfo()` | **Not Steam-specific / not in this task's file list** | Out of scope — not touched by the plan's `files_modified`; left for a future census if a similar report surfaces against these runners |

## Task 2: Make the miss loud at the producer and fallback-safe at every consumer

Implemented D-01 exactly as planned, 4 edits:

1. **`games.ts`** — double-miss branch now calls `logWarning` (module-level
   `loggedEmptyGameInfoMisses: Set<string>` gates it to once per appId) immediately
   before `return {} as GameInfo`. Return value unchanged; existing pin test at
   `games.test.ts` (~L6472, `expect(result).toEqual({})`) verified untouched and
   still passing.
2. **`downloadmanager/utils.ts`** — new exported `resolveGameTitle(libraryManagerMap,
   runner, appName, fallback?): string` implementing
   `live.title || fallback?.title || appName`. `resolveQueueElementTitle` rewritten
   to delegate to it (one fallback chain in the module).
3. **`downloadmanager/downloadqueue.ts`** — `processNotification`'s bare destructure
   replaced with a `resolveGameTitle(...)` call passing `element.params.gameInfo` as
   the fallback, covering the paused/canceled/failed/finished branches at once.
4. **`sidecar/installFlowRegistration.ts`** — same fallback applied at the
   `moveInstall` (L342→348) and `importGame` (L475→483) call sites, confirmed
   unguarded by the Task 1 census.

No stub populated, no async, no throw — per D-01's rejected alternatives. `tsc --noEmit`
clean, `git diff --stat public/locales/en/translation.json` empty (no new i18n keys
needed).

**Deviation (Rule 1 — auto-fix, blocking):** `sidecar/__tests__/downloadQueueFlows.test.ts`
broke with `TypeError: resolveGameTitle is not a function` after Task 2's `utils.ts`
export was added, because its `jest.mock('../../downloadmanager/utils', ...)` factory
didn't include the new export. Fixed by adding a bare `resolveGameTitle: jest.fn()` to
that factory. Committed as part of the Task 2 commit (`546a6d12c`).

## Task 3: Lock the contract with regression tests

Added 9 new tests across 3 files, each with its own RED-proof (see ledger below).

## RED-proof ledger

| # | File | Test | Revert used to prove RED | Observed failure |
|---|---|---|---|---|
| 1 | `utils.test.ts` | Test A (control) | N/A — expected/observed GREEN on first run per plan; this IS the falsifier for evidence item 6, not a RED-proof of a fix | Passed immediately, confirming `resolveQueueElementTitle` was already guarded |
| 2 | `downloadqueue.test.ts` | Test B (suspect) | N/A — pre-fix production code (bare destructure) | `notify` called with `title: undefined`, not a thrown error — confirms harness reached the branch |
| 3 | `games.test.ts` | "still returns the {} sentinel unchanged" | Full logging removal (revert games.ts to pre-Task-2 state) | N/A — this is a pin, not fix-dependent; verified it passes both before and after the logging addition |
| 4 | `games.test.ts` | "logs a warning ... for a given appId" | Full logging removal | `logWarning` mock: 0 calls (expected ≥1) |
| 5 | `games.test.ts` | "does NOT log again for the SAME appId ... (log-once)" | Removed the `loggedEmptyGameInfoMisses.has(...)` guard only (kept the `logWarning` call unconditional) | `logWarning` called 2 times (expected 1) |
| 6 | `games.test.ts` | "DOES log again for a DIFFERENT appId" | Same Set-guard removal as #5, plus (separately) collapsing the guard to a single boolean instead of a `Set` | `logWarning` called 1 time total across both appIds (expected 2) |
| 7 | `utils.test.ts` | "a live (non-empty) title ... wins" | Reverted `resolveGameTitle` to the bare pre-fix destructure (`const { title } = ...; return title`) | `result` was `'Live Title'` still correct for this one — this revert alone does not RED-prove case #7; see note below |
| 8 | `utils.test.ts` | "{} falls back to fallback.title" | Bare pre-fix destructure revert | `result` was `undefined` (expected `'Cyberpunk 2077'`) |
| 9 | `utils.test.ts` | "{} with no fallback falls back to appName" | Bare pre-fix destructure revert | `result` was `undefined` (expected `'1091500'`) |
| 10 | `utils.test.ts` | "empty-string title treated as absent" | Bare pre-fix destructure revert | `result` was `''` (expected `'Cyberpunk 2077'`) |
| 11 | `downloadqueue.test.ts` | "still notifies with the LIVE title when hydrated" | First revert attempt (bare destructure, no `resolveGameTitle`) did NOT fail this test (a live title was present, so the old code returned it correctly too) — recognized as an inadequate RED-proof and replaced with a second, targeted revert: swapping the fallback chain's precedence to `fallback?.title \|\| live.title \|\| appName` | `notify` called with `title: 'Stale Enqueue-Time Title'` (expected `'Cyberpunk 2077'`) — Test B (#2) remained unaffected by this second revert, confirming the two tests are independently discriminating |

**Note on #7:** the bare pre-fix destructure revert does not distinguish "live title
wins" from "any title is returned," since both old and new code return the live title
when present. This case is adequately covered instead by test #8's converse (the same
revert DOES fail when the live title is absent), which jointly with #7's passing
assertion demonstrates the live-title-wins branch is exercised. No separate isolating
revert was constructed for #7 alone; this is recorded rather than silently assumed
sufficient.

## Task Commits

1. **Task 1: Trace the real chain and RED-prove the unguarded consumer** — `5d3593035` (test)
2. **Task 2: Make the miss loud at the producer and fallback-safe at every consumer** — `546a6d12c` (fix)
3. **Task 3: Lock the contract with regression tests** — `29d6de95d` (test)

## Files Created/Modified

- `src/backend/storeManagers/steam/games.ts` — once-per-appId `logWarning` on double cache miss; `{}` return unchanged
- `src/backend/downloadmanager/utils.ts` — new exported `resolveGameTitle()`; `resolveQueueElementTitle` delegates to it
- `src/backend/downloadmanager/downloadqueue.ts` — `processNotification` uses `resolveGameTitle` with the queue element's `gameInfo` as fallback
- `src/backend/sidecar/installFlowRegistration.ts` — `moveInstall`/`importGame` use `resolveGameTitle`
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — +4 tests (log-once contract)
- `src/backend/downloadmanager/__tests__/utils.test.ts` — +5 tests (Test A control + 4 `resolveGameTitle` behavior cases)
- `src/backend/downloadmanager/__tests__/downloadqueue.test.ts` — +2 tests (Test B suspect + no-regression)
- `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` — mock factory fix (Rule 1)

## Decisions Made

- D-01 confirmed, not overturned: `{}` sentinel kept; producer made loud, consumers made fallback-safe. Task 1 found no evidence contradicting plan items 2-4.
- The task's originally-reported causal chain (dialog) was corrected to the actual nameless surface (OS notification via `processNotification`) — recorded per the plan's explicit instruction to report this rather than assume it away.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `downloadQueueFlows.test.ts` mock factory missing the new export**
- **Found during:** Task 2
- **Issue:** `TypeError: resolveGameTitle is not a function` — the file's `jest.mock('../../downloadmanager/utils', ...)` factory didn't declare the new export added to the real module.
- **Fix:** Added `resolveGameTitle: jest.fn()` to the mock factory.
- **Files modified:** `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts`
- **Commit:** `546a6d12c`

---

**Total deviations:** 1 auto-fixed (Rule 1 — blocking bug, pre-existing test mock needed updating for a new production export).
**Impact on plan:** Necessary for correctness (test suite would not run otherwise). No scope creep — same file already in the "files touched by this quick task's blast radius" set, though not in the plan's explicit `files_modified` list (an omission in the plan's file inventory, not a new decision).

## Issues Encountered

- One inadequate RED-proof attempt (ledger #11): the first revert chosen for the
  "still notifies with the LIVE title when hydrated" test did not actually fail it,
  because the revert (bare destructure) still returns the live title correctly when
  one is present. Recognized this as testing the wrong axis and constructed a second,
  targeted revert (precedence swap) that correctly RED-proved the assertion.
- One flaky failure in `enrichmentFlows.test.ts` observed during a full-suite run;
  did not reproduce in isolation (41/41) nor on a full-suite re-run (195/195 suites
  passed). Matches a previously documented load-induced flake pattern in this repo;
  not attributable to this task's changes and not modified.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

The `{}` sentinel contract, its single logging gate, and the shared `resolveGameTitle`
fallback chain are now pinned by tests. No further work is required to close this
quick task. If the double-miss's root cause (the hydration race itself, not just its
surface symptom) is ever attacked, D-01's rejected alternative (b) — making
`getGameInfo()` async — was scoped out here as non-trivial (~40 call sites across
~20 files) and would need its own phase.

---
*Quick task: 260905-luf*
*Completed: 2026-09-05*

## Self-Check: PASSED

All 8 modified files confirmed present on disk. All 3 task commits
(`5d3593035`, `546a6d12c`, `29d6de95d`) confirmed present in `git log --oneline --all`.
Full backend suite re-run at HEAD: 195/195 suites, 4539/4541 tests passed
(2 pre-existing skips), matching the count reported above.
