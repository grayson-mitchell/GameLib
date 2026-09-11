---
phase: quick-260911-ijv
plan: 01
subsystem: tooling
tags: [prettier, eslint, i18next, husky, pre-push, todo-lifecycle]

# Dependency graph
requires:
  - phase: quick-260909-s8x
    provides: "meta/lintScoped.cjs with SRC_CEILING/TESTS_CEILING replacing eslint --max-warnings"
provides:
  - "pnpm prettier exits 0 at HEAD (12 files reformatted)"
  - "public/locales/en/gamelib.json commits the i18next key-ordering fixpoint"
  - "pending lint-ratchet todo closed and moved to completed/ with accurate attribution"
  - "git push --dry-run succeeds without --no-verify on fix/steam-native-install-stability"
affects: [tooling, ci, pre-push-hook]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-commit todo closure (edit-in-place then plain-mv-and-two-step-add) to preserve R100 rename detection"

key-files:
  created: []
  modified:
    - src/backend/__tests__/quitTeardownWiring.test.ts
    - src/backend/__tests__/shellDiagPersistence.test.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/backend/longLivedChildren.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx
    - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/index.tsx
    - public/locales/en/gamelib.json
    - .planning/todos/pending/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md (moved to completed/)

key-decisions:
  - "Scoped prettier --write to the explicit 12-path list, never `.` — src/preload/.prettierrc overrides printWidth to 120 and would have leaked into these root-config files"
  - "Committed i18next's own key ordering for gamelib.json rather than treating the reorder as noise — it is the one catalog D-05 permits pnpm i18n to touch"
  - "Split the todo closure into an edit commit and a content-free move commit to keep git's rename detection at R100 instead of degrading to R051"
  - "Credited quick 260909-s8x for the lint half explicitly in the closure record so the todo cannot be misread as this task having fixed it"

requirements-completed: [QUICK-260911-ijv-01]

# Metrics
duration: ~15min
completed: 2026-09-11
---

# Quick 260911-ijv: Fix the red pre-push prettier gate and close the stale lint-ratchet todo Summary

**Reformatted 12 committed-debt files to close `pnpm prettier`, committed i18next's own catalog key-ordering as a fixpoint, and closed the stale lint-ratchet todo with attribution corrected to credit quick 260909-s8x for the lint half — pre-push hook now green end-to-end without `--no-verify`.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 (plus a 2-commit split on Task 3 per the plan's rename-detection requirement)
- **Files modified:** 14 (12 source files reformatted, 1 i18n catalog, 1 todo moved pending → completed)

## Accomplishments

- `pnpm prettier --check .` now exits 0 — 12 previously-red files reformatted, scoped to their explicit paths (never `.`) so `src/preload/.prettierrc`'s `printWidth: 120` override could not leak into root-config files.
- `pnpm lint` counts verified unchanged after the rewrap: production 1123/1124 (headroom 1, untouched), tests exactly 638/638 (zero headroom, exactly held) — no `eslint-disable-next-line` was orphaned by the reformat.
- `public/locales/en/gamelib.json`'s recurring i18next key reorder (`settledFromOwnership` moving into alphabetical position) is now committed. `pnpm i18n --fail-on-update` re-run after the commit leaves `public/locales` clean — a genuine fixpoint, not just an exit-0 that keeps rewriting.
- `.planning/todos/pending/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md` closed with an accurate Resolution section crediting quick `260909-s8x` for the lint half, and moved to `completed/` with an R100-scored rename (verified via `git show --stat -M HEAD` printing `rename ... (100%)`).
- `git push --dry-run origin fix/steam-native-install-stability` fired the real `.husky/pre-push` hook (all four legs: codecheck, lint, prettier, i18n) and succeeded — `bab7a5dae..4a3fff1a2 fix/steam-native-install-stability -> fix/steam-native-install-stability` — without `--no-verify`.
- `pnpm planning-gates` reports 10/10 green, including `todo-frontmatter-gate.py` (the closed todo carries `severity: medium`, `platform: any`, `ready: code` throughout, per the `pending/`-only scope of that gate).

## Task Commits

Each task was committed atomically, by explicit path, using `git commit --only -- <paths>`:

1. **Task 1: Format the 12 prettier offenders** - `ba612dd3c7932ec40f7e4739c858597ab25deb46` (style) — 12 files, 171 insertions / 119 deletions
2. **Task 2: Commit the i18n catalog key reorder** - `94396bf9241dc948f2040e3bcbde103621ea5f38` (chore) — `public/locales/en/gamelib.json`, 2 insertions / 2 deletions
3. **Task 3a: Close the lint-ratchet todo (edit in place)** - `2f83e05c256e39742c5ec5d72d197809546793d1` (docs) — 40 insertions / 1 deletion
4. **Task 3b: Move the closed todo to completed/** - `4a3fff1a29f3c6f8a817194758fd8fd59eaae2b0` (docs) — content-free rename, R100

_Task 3 is split into two commits (3a edit, 3b move) per the plan's explicit instruction — bundling the content edit with the rename would have dropped git's rename detection from R100 to borderline R051._

**No plan-metadata commit was made by this executor.** Per this quick task's constraints, SUMMARY.md/PLAN.md/STATE.md are NOT committed here — the orchestrator owns that commit and the STATE.md/ROADMAP.md delta.

## Files Created/Modified

- 12 source files under `src/backend/` and `src/frontend/screens/` (see `key-files.modified` in frontmatter) — pure prettier reformatting, no behavioural change
- `public/locales/en/gamelib.json` — `settledFromOwnership` key moved into alphabetical position (2 ins / 2 del, no key or value change)
- `.planning/todos/pending/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md` → `.planning/todos/completed/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md` — status flipped OPEN → CLOSED, `closed:`/`closed_by:` frontmatter added, `## Resolution (2026-09-11, quick 260911-ijv)` section appended

## Decisions Made

- Scoped every `prettier --write` and every commit to explicit paths — never `.` and never a bulk `git add` — to avoid the `src/preload/.prettierrc` printWidth trap and to keep the untracked `.claude/skills/archify/` / `skills-lock.json` out of every commit.
- Treated the i18next key reorder as the correct fix to commit, not noise to suppress — it is the parser's own canonical serialization, matches CLAUDE.md's "new strings go in gamelib.json" convention, and is the one catalog `pnpm i18n-churn-guard` (D-05) permits `pnpm i18n` to touch.
- Attribution in the todo's Resolution section explicitly states the lint half was fixed by quick `260909-s8x` (commits `1c1345064`, `8f0d7ff20`, `7392244d0`) on 2026-09-09, not by this task — so the closed record cannot be misread later as this task having done that work.

## Deviations from Plan

None - plan executed exactly as written. Lint counts came back at the expected baseline (production 1123/1124, tests 638/638) with zero rewrap-induced regressions, so no `eslint-disable-next-line` re-attachment or `// prettier-ignore` fencing was needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

All items below were measured live, not assumed:

- `pnpm prettier` (`prettier --check .`): exit 0, "All matched files use Prettier code style!"
- `pnpm lint`: exit 0, `production: PASS | tests: PASS`, counts `1123 problems` (production) / `638 problems` (tests)
- `pnpm codecheck` (`tsc --noEmit`): exit 0
- `pnpm i18n --fail-on-update`: exit 0, `git status --porcelain public/locales` empty (fixpoint proven by a second run after commit)
- `pnpm i18n-churn-guard`: exit 0, "clean -- no upstream public/locales/ catalog changed"
- `pnpm planning-gates`: exit 0, 10/10 gates PASS
- `git push --dry-run origin fix/steam-native-install-stability`: exit 0, real `.husky/pre-push` hook fired (all four legs ran to completion), ref update line printed: `bab7a5dae..4a3fff1a2 fix/steam-native-install-stability -> fix/steam-native-install-stability`. No `--no-verify` used.
- `git show --stat -M HEAD` (Task 3b): rename scored `(100%)`.

## STATE.md / ROADMAP.md write-ban gesture (per this task's constraints)

```
$ git status --porcelain .planning/STATE.md .planning/ROADMAP.md
```
Output: **(empty)** — confirmed no gsd-sdk `state.*`/`roadmap.*` verb was invoked and neither file was hand-edited.

## Untracked-file preservation check

```
$ git status --porcelain
?? .claude/skills/archify/
?? skills-lock.json
```
Both remain untracked after all four commits, as required — neither ever appeared in `git diff --cached --name-only` before any commit in this task.

## Next Phase Readiness

The pre-push hook is fully green on `fix/steam-native-install-stability`; a normal `git push` (no `--no-verify`) will succeed. No blockers. The `.planning/todos/completed/` archive now correctly reflects that the lint ratchet was fixed by `260909-s8x`, not by this task.

## Self-Check: PASSED

- FOUND: ba612dd3c7932ec40f7e4739c858597ab25deb46 (Task 1)
- FOUND: 94396bf9241dc948f2040e3bcbde103621ea5f38 (Task 2)
- FOUND: 2f83e05c256e39742c5ec5d72d197809546793d1 (Task 3a)
- FOUND: 4a3fff1a29f3c6f8a817194758fd8fd59eaae2b0 (Task 3b)
- FOUND: public/locales/en/gamelib.json
- FOUND: .planning/todos/completed/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md
- CONFIRMED ABSENT: .planning/todos/pending/2026-09-09-lint-warning-ratchet-regressed-by-96-and-a-push-bypassed-it.md
- `git status --porcelain .planning/STATE.md .planning/ROADMAP.md` → empty (no write occurred)

---
*Phase: quick-260911-ijv*
*Completed: 2026-09-11*
