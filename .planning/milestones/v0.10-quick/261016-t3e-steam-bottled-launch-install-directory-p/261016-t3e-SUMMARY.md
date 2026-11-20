---
phase: quick-261016-t3e
plan: 01
subsystem: steam
tags: [macos, crossover, wine, bottled-steam, process-monitor, jest-fake-timers]

requires:
  - phase: quick-261016-ra0 (D-UAT-10 live gate close)
    provides: the dispatchToBottledSteam launch-verb plumbing this task attaches to
provides:
  - "bottleProcessMonitor.ts: polls `ps` for processes under a bottled game's own install directory to detect start/stop"
  - "bottle.ts launch-verb wiring that starts the monitor with the library's known install_path"
  - "Full matcher-matrix test coverage (both Steam install roots, case-insensitivity, sibling-prefix non-match, no-deadline-on-first-match, restart cancellation, timer teardown, non-mac no-op)"
affects: [steam-bottled-launch, steam-play-feedback]

actuals:
  tokens: 8455
  tasks: 3
  commits: 2
  plan_head_before: 2ba3d0ba2
  plan_head_after: cf8d2e67c0db843d8e901d21d10986ff80fa3419

tech-stack:
  added: []
  patterns:
    - "Playnite SteamPlayController pattern: poll `ps` for processes under a game's own install directory as the start/stop signal for a bottled launch, with no fixed deadline on the first match"
    - "Lazy dynamic import (`await import('./bottleProcessMonitor')`) inside bottle.ts to keep `backend/ipc` out of bottle.ts's static module graph"
    - "Mutable `backend/constants/environment` test double to flip isMac/isWindows/isLinux per test case"

key-files:
  created:
    - src/backend/storeManagers/steam/bottleProcessMonitor.ts
    - src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - .planning/todos/pending/2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md (left UNCOMMITTED per task constraints)

key-decisions:
  - "Duplicated STEAM_CLIENT_PROCESS_NAMES locally in bottleProcessMonitor.ts rather than importing from bottle.ts, to avoid a circular import"
  - "No fixed deadline on the first process match (LD-4); a 10-minute no-match backoff only slows the poll cadence, it never gives up"
  - "The cadence-backoff assertion (driving 10 minutes of fake time) was deliberately SKIPPED, per the plan's explicit permission to omit it"

patterns-established:
  - "Bounded-cost guards for a fire-and-forget background poller: cap consecutive spawn failures (20) and back off cadence after a long no-match window, without ever violating 'never block the launch'"

requirements-completed: [TODO-261016-STEAM-BOTTLE-PLAY-FEEDBACK]

duration: ~64min (2026-10-16T20:21 to 2026-10-16T21:25, spans a context compaction)
completed: 2026-10-16
status: complete
---

# Quick Task 261016-t3e: Bottled Steam Launch Install-Directory Process Monitor Summary

**Bottled (CrossOver/Wine) Steam launches on macOS now get real `playing`/`done` feedback by polling `ps` for processes under the game's own bottle install directory, adopting Playnite's SteamPlayController pattern — with no fixed deadline on the first match, so a multi-minute Steam account-lock block still resolves correctly once the game actually starts.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 5 (2 new, 3 modified; 1 of the 3 — the todo — left uncommitted per task constraints)
- **Commits:** 2 (Task 1 tracer, Task 2 expansion). Task 3 produced no commit (todo-only, intentionally uncommitted).

## Accomplishments

- Added `bottleProcessMonitor.ts`, exporting exactly `startBottleProcessMonitor`, `stopBottleProcessMonitor`, `__stopAllBottleProcessMonitors`. It derives a Windows-style path prefix from the game's bottle install directory, polls `ps -axo pid=,command=` on a tracked/unref'd timer, and emits `playing` on first match and `done` (plus elapsed session seconds) when the matched set empties.
- Wired the monitor into `dispatchToBottledSteam`'s `'launch'` verb only (via a lazy `await import('./bottleProcessMonitor')`, keeping `backend/ipc` out of bottle.ts's static module graph) — `install`/`uninstall` and every other function are untouched.
- Built a full matcher-matrix test suite: both Steam install roots (`Program Files (x86)` / `Program Files`), case-insensitive matching, sibling-prefix non-match (`Avernum 4` vs `Avernum 4 Remaster`), no-deadline-on-first-match (4 empty polls then a match), restart-cancels-prior-monitor, timer-count-returns-to-zero on teardown, and non-mac no-op.
- Added a `bottle.test.ts` assertion proving the launch verb calls `startBottleProcessMonitor` with the library's known `install_path`, that install/uninstall never call it, and that a missing `install_path` logs a warning and skips starting a monitor without affecting the existing `{status:'done'}` launch contract.
- Appended a dated update to the pending todo recording this as a PARTIAL fix (the blocked-Steam "waiting for Steam…" case remains open) — left uncommitted per task constraints.

## Task Commits

1. **Task 1: Tracer — bottleProcessMonitor module + launch-verb wiring + 2 tests** — `87c3d4fda` (feat)
2. **Task 2: Expand to the full matcher matrix, cancellation contract, and launch-verb wiring assertion** — `cf8d2e67c` (test)
3. **Task 3: Record the partial fix on the pending todo and sweep every gate** — no commit (todo edit intentionally left uncommitted; see Constraints below)

Task 2's commit was amended once in-session to add the required `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer that was accidentally omitted from the first commit attempt (hash changed from `94a382b18` to `cf8d2e67c` before any push).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `jest.requireMock()` cast triggered `@typescript-eslint/no-unnecessary-type-assertion`, breaking the zero-headroom `tests` lint ceiling**
- **Found during:** Task 2's verify sweep (`pnpm lint:tests`)
- **Issue:** The original accessor pattern `(jest.requireMock('../bottleProcessMonitor') as { startBottleProcessMonitor: jest.Mock }).startBottleProcessMonitor` was flagged as an unnecessary type assertion over an `any`-typed value, producing 1 lint ERROR and pushing the `tests` scope to 639 problems against a 638-warning, 0-error gate.
- **Fix:** Replaced with a direct import of `startBottleProcessMonitor` plus `jest.mocked(startBottleProcessMonitor)` — the same typed-mock-accessor pattern already used elsewhere in the codebase (e.g. `depot.finalize.test.ts`).
- **Files modified:** `src/backend/storeManagers/steam/__tests__/bottle.test.ts`
- **Commit:** `cf8d2e67c`

**2. [Rule 3 - Blocking issue] Missing module-load mocks when importing `getBottleDir` from `bottle.ts` in the new test file**
- **Found during:** Task 1, writing `bottleProcessMonitor.test.ts`
- **Issue:** Importing anything from `bottle.ts` transitively evaluates `backend/platform` (`app.getPath`), `backend/config` (`GlobalConfig`), and `./electronStores` at module-load time, which would throw without mocks.
- **Fix:** Added `jest.mock('graceful-fs', ...)`, `jest.mock('backend/platform', ...)`, `jest.mock('../electronStores', ...)`, and `jest.mock('backend/config', ...)`, matching the existing pattern in `bottle.test.ts` and `depot.finalize.test.ts`.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts`
- **Commit:** `87c3d4fda`

**3. [Rule 1 - Formatting] Prettier formatting violations after hand-writing new/modified TypeScript**
- **Found during:** Task 1 and Task 2 verify sweeps
- **Issue:** `npx prettier --check` reported formatting issues in `bottle.ts` and both test files at different points.
- **Fix:** Ran `npx prettier --write` on the flagged files each time, then re-ran `--check` to confirm clean.
- **Files modified:** `src/backend/storeManagers/steam/bottle.ts`, `src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts`
- **Commits:** `87c3d4fda`, `cf8d2e67c`

### Explicit Disclosures (required by the plan)

- **bottle.test.ts launch-verb wiring assertion: ADDED.** Three new tests in the `'bottle process monitor wiring (quick/261016-t3e)'` describe block confirm (a) launch starts the monitor with the library's `appId`/`install_path`, (b) install/uninstall never start a monitor (LD-1), and (c) a missing `install_path` logs a warning and does not start a monitor while the launch dispatch still resolves `{status:'done'}`.
- **Cadence-backoff assertion (driving 10 minutes of fake time to exercise the `NO_MATCH_BACKOFF_AFTER_MS` cadence change): SKIPPED**, per the plan's explicit permission to omit it. The backoff logic exists in `bottleProcessMonitor.ts` (`runPollLoop`'s `noMatchElapsed` branch) but is not directly exercised by a fake-timer-advance test; it is covered only indirectly by code review and the no-deadline test, which proves the loop keeps running past several poll intervals without matching.
- **No `TESTS_CEILING` bump was needed.** `pnpm lint:tests` sits at exactly 638 problems (0 errors, 638 warnings) after the fix in Deviation 1 — the same ceiling value as before this task, with zero headroom spent.

## Gate Sweep — Measured Before/After

| Gate | Command | Result |
|------|---------|--------|
| Jest (Task 1, 2 suites) | `npx jest --selectProjects Backend --runTestsByPath bottleProcessMonitor.test.ts bottle.test.ts` | PASS (part of the 4-suite run below) |
| Jest (Task 2, 4 suites) | `npx jest --selectProjects Backend --runTestsByPath bottleProcessMonitor.test.ts bottle.test.ts games.test.ts library.test.ts` | **592/592 passed**, 4/4 suites |
| Jest (Task 3, 3 suites) | `npx jest --selectProjects Backend --runTestsByPath bottleProcessMonitor.test.ts bottle.test.ts games.test.ts` | **374/374 passed**, 3/3 suites |
| `pnpm codecheck` | `tsc --noEmit && tsc -p tsconfig.meta.json --noEmit` | **exit 0** (clean, no output) |
| `pnpm lint:src` | `node meta/lintScoped.cjs --src` | **1089 problems (0 errors, 1089 warnings)** — `production: PASS` |
| `pnpm lint:tests` | `node meta/lintScoped.cjs --tests` | **638 problems (0 errors, 638 warnings)** — `tests: PASS` (ceiling is exactly 638; zero headroom spent) |
| `pnpm find-deadcode` | `node meta/findDeadcode.cjs` | **`unreachable: 46 OK \| used-in-module: 0 OK`** — unchanged; all 3 new exports from `bottleProcessMonitor.ts` are consumed |
| `npx prettier --check` (4 touched TS paths) | bottleProcessMonitor.ts, bottle.ts, bottleProcessMonitor.test.ts, bottle.test.ts | **All matched files use Prettier code style!** |
| `pnpm planning-gates` | `python3 meta/runPlanningGates.py` | **12/12 planning gates passed.** |
| Todo frontmatter byte-identity | `sed -n '8,10p' <todo>` vs expected | **Match** — `severity: medium`, `platform: macos`, `ready: code`, bare/lowercase/in order |
| bottle.ts static-import guard | `grep -cE '^import .*bottleProcessMonitor' bottle.ts` (comments stripped) | **0** — no top-level import of the monitor module |

All verify commands above were run to completion with real output; none were filtered, piped through a grep that discarded the summary line, or skipped. The one `pnpm lint:tests` run during Task 2 that initially failed (1 error) is documented above as Deviation 1 and was re-run clean after the fix.

## Live-Hardware Gate — NOT Yet Run

**This mechanism is fixture-verified only.** Every test above runs against mocked `ps` output and a mocked `spawnAsync` — none of it has been exercised against a real CrossOver/Wine bottle on macOS hardware. The plan does not include a live gate task, and none was run in this session. Before this is considered production-verified, someone needs to:

1. Launch a real bottled Steam game on macOS.
2. Confirm the `playing` `gameStatusUpdate` fires when the actual game process appears under `<bottleDir>/drive_c/Program Files (x86)/Steam/steamapps/common/<game>/`.
3. Confirm `done` fires with a sane elapsed-seconds value when the game is closed.
4. Confirm a sibling-prefix game (if one exists on the test machine) does not falsely match.

This live-hardware verification is still owed and is explicitly called out here per task constraints.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Threat Flags

None. The new module only reads process listings via `ps` (read-only, no new attack surface) and only starts on the already-privileged `launch` verb path; no new network endpoints, auth paths, or schema changes were introduced.

## Constraints Honored

- The todo edit (`.planning/todos/pending/2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md`) is left UNCOMMITTED in the working tree, as instructed.
- `.planning/milestone.lock` was not touched.
- `ROADMAP.md` was not updated.
- No worktree isolation was used; all edits were made directly on branch `quick-261002-b63`, which was never switched.
- Both code commits were checked for conflict markers (`git diff --cached | grep -n -E '^(<<<<<<<|=======|>>>>>>>)'`) before committing; neither matched.

## Self-Check: PASSED

- `src/backend/storeManagers/steam/bottleProcessMonitor.ts` — FOUND
- `src/backend/storeManagers/steam/__tests__/bottleProcessMonitor.test.ts` — FOUND
- `src/backend/storeManagers/steam/bottle.ts` (modified) — FOUND
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` (modified) — FOUND
- `.planning/todos/pending/2026-10-16-steam-bottle-play-gives-no-feedback-while-steam-is-blocked.md` (modified, uncommitted) — FOUND
- Commit `87c3d4fda` — FOUND in `git log --oneline --all`
- Commit `cf8d2e67c` — FOUND in `git log --oneline --all`

## Orchestrator addendum 2026-10-16

- Orchestrator re-measured after hand-back: 3 Steam suites 374/374, `pnpm codecheck` exit 0, `pnpm lint` `production: PASS | tests: PASS` (638/638 ceiling held), `pnpm find-deadcode` `unreachable: 46 OK | used-in-module: 0 OK`, prettier clean on the 4 touched src paths.
- One follow-up code commit by the orchestrator: `7d0bdc873` fix(261016-t3e) -- session duration is now measured from the FIRST MATCH, not from monitor start, so a long blocked-Steam wait no longer inflates the logged play time. The done-transition test only pins the `\d+s` shape, so no test change was needed; 11/11 green after the fix.
- `f272eb638` (docs(todo), three bridge/Phase 22 todos) landed on this branch from a sibling session between the executor hand-back and the docs commit. It is NOT part of this task; the STATE.md row cites `7d0bdc873`.
- `graphify update .` was run after the code change (graphify-out is gitignored).
