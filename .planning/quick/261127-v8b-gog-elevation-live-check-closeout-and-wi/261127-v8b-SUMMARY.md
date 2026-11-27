---
phase: quick-261127-v8b
plan: 01
subsystem: gog-uninstall
tags: [gog, uninstall, saves, safety-guard, windows]
requires: []
provides:
  - "GOG uninstall keeps save folders inside the install folder (gog/keepSaves.ts)"
  - "GOG Windows elevation live check closed with recorded results"
affects:
  - src/backend/storeManagers/gog/games.ts
tech-stack:
  added: []
  patterns:
    - "per-entry guarded delete: one target per entry, trustRoot = canonical install folder"
key-files:
  created:
    - src/backend/storeManagers/gog/keepSaves.ts
    - src/backend/storeManagers/gog/__tests__/keepSaves.test.ts
    - .planning/todos/pending/2026-11-27-gog-declined-setup-uac-reports-install-success.md
    - .planning/todos/pending/2026-11-27-gog-setup-uac-prompt-names-powershell-not-game.md
  modified:
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts
    - .planning/todos/completed/2026-11-20-gog-windows-elevation-live-check.md
decisions:
  - "Save sources: stored gogSaves plus cached <?INSTALL?> templates; getSaveSyncLocation (network) is not called"
  - "An unlistable ancestor fails the uninstall (canonicalize-failed) rather than widening to a whole-tree delete"
metrics:
  tasks: 3
  commits: 3
status: complete
commits: 3
plan_head_before: 0f3d39f1686aea1cce0ae174289a7fda790074ca
plan_head_after: e4e2269d1f0aabada43aeede7d05f5744f34fb28
actuals:
  tasks: 3
  commits: 3
---

# Phase quick-261127-v8b Plan 01: GOG uninstall keeps in-install saves; live check closed

GOG uninstall now deletes around save folders inside the install folder through the same Rust guard (per-entry targets, each with the canonical install folder as trustRoot), and the Windows elevation live check is closed with its results.

## Commits

- fc573a723: `fix(quick-261127-v8b): GOG uninstall keeps save folders inside the install folder` (Task 1, tracer)
- 60f03419c: `fix(quick-261127-v8b): GOG uninstall also keeps GOG-declared <?INSTALL?> save folders` (Task 2)
- e4e2269d1: `docs(quick-261127-v8b): close GOG Windows elevation live check; file two follow-up todos` (Task 3)

## What changed

- `gog/keepSaves.ts` (new): `planKeptSaves` canonicalizes the install folder and each save location, keeps only paths strictly inside, walks the ancestor chain and lists the entries to delete (`around`), or returns `whole-tree` / `unreadable`. `installSaveLocations` resolves GOG `<?INSTALL?>` templates offline.
- `gog/games.ts`: the settings read is hoisted out of the uninstaller block (overlay-census comment kept on the line above); `removalRequest(installPath, plan?)` builds per-entry targets for an `around` plan; the pre-check still sends the whole folder. An unreadable plan reports failed (`canonicalize-failed`) and deletes nothing. A save location equal to the install folder logs a warning and falls back to today's request. Kept folders are logged on success.
- Tests: 5 new end-to-end cases in `uninstallSafety.test.ts` (stored save kept with trustRoot assertions, template-only save kept, outside save unchanged request, absent save unchanged request, rejected delete reports failed) and a new `keepSaves.test.ts` (20 cases: template resolution, containment, links via junction, `..cache` folder, nesting, dedupe, case fold on win32/darwin, unreadable via injected readdir).
- Todos: live-check todo moved to `completed/` with `status: CLOSED`, resolution, and the `## Live check result (2026-11-27)` section; two follow-ups filed (declined UAC false success: medium/windows/code; PowerShell-named prompt: minor/windows/code).

## Verification

- `npx jest --runTestsByPath keepSaves.test.ts uninstallSafety.test.ts managerOverlayCensus.test.ts`: 3 suites, 45 tests passing (baseline before change: 2 suites, 20 tests).
- `pnpm codecheck`, `pnpm backend-di-ceilings` (jestMock 1582, unchanged), `pnpm boundaries`, `pnpm find-deadcode` (308 baselined, PASS), scoped `npx eslint` (0 errors; the 30 warnings are pre-existing in games.ts), `npx prettier --check` over the four source and test paths: green.
- `python .planning/todos/todo-frontmatter-gate.py` and `python meta/runPlanningGates.py`: exit 0. The three `.planning` todo paths are prettier-ignored per `--file-info`, so no `--check` is claimed for them.
- Not verifiable at the desk: a live Balrum uninstall that keeps `files\saves`. On re-run the GOG log should show `Kept 1 save folder(s) inside the install folder` and the folder should survive.

## Deviations from Plan

None to the plan's design. Process notes:

- The Task 2 template-only end-to-end test was first written during Task 1's RED step, then moved out of Task 1's commit into Task 2's so Task 1's commit stays green. It failed before the wiring, as the plan required.
- Task 2's `keepSaves.test.ts` passed on first run after the wiring; its RED was covered by the template test failing before `installSaveLocations` was wired.
- `graphify update .` was started; it ran long and was moved to the background. graphify-out is gitignored, so there is nothing to commit.

## Known Stubs

None.

## Threat Flags

None. The change only ever deletes less than before, and every delete still goes through the Rust guard.

## Self-Check: PASSED

- Files exist: keepSaves.ts, keepSaves.test.ts, completed live-check todo, two pending todos.
- Commits exist: fc573a723, 60f03419c, e4e2269d1 (`git rev-list --count` from the ledger base is 3).
