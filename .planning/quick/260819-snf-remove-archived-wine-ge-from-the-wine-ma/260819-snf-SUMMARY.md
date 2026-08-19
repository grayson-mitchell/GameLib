---
quick_id: 260819-snf
title: "Remove archived Wine-GE from the Wine Manager + make GE-Proton downloads deterministic"
subsystem: wine/linux
tags: [wine-manager, ge-proton, github-releases, upstream-port]
requires:
  - phase: none (standalone quick task)
provides:
  - "Repositorys enum without WINEGE"
  - "fetchReleases arch-matched GE-Proton asset selection"
affects: [wine-manager, wine-downloader]
tech-stack:
  added: []
  patterns:
    - "GE-Proton asset selection keyed on process.arch, matching upstream feb170afb"
key-files:
  created:
    - src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts
  modified:
    - src/backend/wine/manager/downloader/constants.ts
    - src/backend/wine/manager/downloader/main.ts
    - src/backend/wine/manager/downloader/utilities.ts
    - src/backend/wine/manager/utils.ts
    - src/common/types.ts
    - src/frontend/screens/WineManager/index.tsx
    - src/backend/wine/manager/downloader/__tests__/main/getter.test.ts
key-decisions:
  - "Locale catalogs left untouched per 260810-tr4 precedent; orphaned wineExplanation.wine-ge keys stay inert"
  - "Type union member 'Wine-GE' and ReleasesInfo key 'wine-ge' kept (matching upstream) so already-installed Wine-GE versions on disk remain valid"
requirements-completed: []
metrics:
  duration: 45min
  completed: 2026-08-19
---

# Quick Task 260819-snf: Remove archived Wine-GE + deterministic GE-Proton downloads Summary

**Ports Heroic bdafb95ff (#5251) and feb170afb (#5708): Wine-GE dropped from the Wine Manager options list, GE-Proton asset selection now keyed on `process.arch` instead of GitHub asset order.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3/3 completed
- **Files modified:** 7 (6 source + 1 existing test), 1 new test file

## Accomplishments

- Wine-GE removed as an installable option: `WINEGE_URL` deleted, `Repositorys.WINEGE`
  removed, the Linux Wine Manager repositories array now has exactly two entries
  (`Proton-CachyOS`, `GE-Proton`), and the orange Wine-GE info box / `faWarning` import
  are gone.
- `fetchReleases` now selects the GE-Proton `download`/`checksum` pair by matching
  `process.arch`, closing a determinism gap where the x86_64 build was picked only
  because it happened to be last in the GitHub API's asset array.
- A RED-proven regression gate (`geProtonArch.test.ts`) was added specifically because
  the pre-existing `getter.test.ts` fixture uses `.tar.xz` assets and would stay green
  under the new `.tar.gz`-only matcher without ever exercising the arch branch.

## Task Commits

1. **Task 1: Port bdafb95ff — remove Wine-GE from the Wine Manager** — `5d011350d` (fix)
2. **Task 2 RED: add failing gate for GE-Proton arch selection** — `296819221` (test)
2. **Task 2 GREEN: port feb170afb — arch-matched GE-Proton asset selection** — `dc7e62096` (feat)
3. **Task 3: mark upstream-triage todo RESOLVED** — `d019844eb` (docs)

_Note: Task 3's "full gate" step produced no source commit — it is a verification-only task
per the plan. The one commit it did produce is the todo bookkeeping update._

## Files Created/Modified

- `src/backend/wine/manager/downloader/constants.ts` — deleted `WINEGE_URL`
- `src/backend/wine/manager/downloader/main.ts` — dropped `WINEGE_URL` import, the
  `Repositorys.WINEGE` default and `case` block
- `src/backend/wine/manager/downloader/utilities.ts` — new `else if (type === 'GE-Proton')`
  arch-matching branch in `fetchReleases`
- `src/backend/wine/manager/utils.ts` — removed `latestWineGE` tracking and its
  `updateWineListsIfOutdated` guard; non-mac default repo list is now
  `[Repositorys.PROTONGE, Repositorys.PROTONCACHYOS]`
- `src/common/types.ts` — removed `WINEGE` from the `Repositorys` enum (kept `Type`'s
  `'Wine-GE'` member and `ReleasesInfo['wine-ge']` — see key-decisions)
- `src/frontend/screens/WineManager/index.tsx` — dropped `faWarning` import, the
  `Wine-GE` repository tab, the `startsWith('Wine-GE')` branch in `getWineVersions`, and
  the `case 'Wine-GE':` info-box arm; the sole pre-existing GameLib divergence at
  ~line 111 ("default in GameLib") is untouched
- `src/backend/wine/manager/downloader/__tests__/main/getter.test.ts` — 3 URL assertions
  repointed from `wine-ge-custom` to `proton-ge-custom`
- `src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts` — **new**,
  3 tests (x64, arm64, Proton-CachyOS regression guard)

## RED Step Observation (Task 2)

Ran `npx jest .../geProtonArch.test.ts` against unmodified `utilities.ts` (before the
`feb170afb` port). Actual output:

```
FAIL Backend src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts
  ● Utilities - fetchReleases GE-Proton arch selection › x64: picks the non-aarch64 tar.gz and non-aarch64 sha512sum

    expect(received).toBe(expected) // Object.is equality

    Expected: ".../GE-Proton10-1/GE-Proton10-1.tar.gz"
    Received: ".../GE-Proton10-1/GE-Proton10-1-aarch64.tar.gz"

Test Suites: 1 failed, 1 total
Tests:       1 failed, 2 passed, 3 total
```

**Discrepancy from the plan's `<done>` claim, recorded honestly per the executor's
honest-reporting instruction:** the plan's done criteria state "Tests 1 and 2 were
observed FAILING." In the actual RED run, only **Test 1 (x64) failed**; **Test 2 (arm64)
passed even against the unmodified fallback code.** Root cause: the pre-fix fallback
branch (`endsWith('sha512sum')` / `endsWith('tar.gz')`, last-match-wins, no arch check)
iterates all four assets in order and always ends up assigning whichever matching asset
is **last** in the list — which, under the deliberately aarch64-last fixture ordering, is
always the aarch64 asset regardless of `process.arch`. That means the fallback's output
for the arm64 case coincidentally equals the correct arm64 answer, so Test 2 could not
fail no matter how the fixture was ordered without breaking Test 1's own bad-input
property (`<behavior>`'s explicit rationale for the ordering only derives Test 1's
failure, so this is a plan-stated expectation that does not hold in practice, not a
defect in the test or the fix). Test 1 alone is sufficient to make the gate non-vacuous,
and both tests are green after the implementation (see below).

## Full Gate Results (Task 3)

- `pnpm codecheck` — **exit 0**, no errors.
- `npx jest src/backend/wine/manager/downloader` — **4 suites, 16 tests, all green**
  (baseline before Task 2 was 3 suites/13 tests; +1 suite/+3 tests from
  `geProtonArch.test.ts`).
- `npx jest meta/__tests__/i18nCatalogChurnGuard.test.ts` — **green**, proves the
  locked no-catalog-churn decision held.
- `git status --short public/locales` — **empty**, both mid-plan and at final gate.
- `pnpm lint` — **exit 0** (0 errors). 3914 pre-existing warnings across the repo, none
  newly introduced in any of this task's 7 touched files (spot-checked
  `main.ts`/`utils.ts`/`getter.test.ts` — all warnings present are pre-existing lines
  outside this task's diff hunks, e.g. `main.ts:301` unrelated `any`-typed call,
  `utils.ts:352` unrelated `removeWineVersion` require-await).
- `pnpm prettier` (`prettier --check .`) — **repo-wide pre-existing failure, exit 2,
  5065 files flagged.** None of this task's 8 touched files appear in the flagged list
  (verified by grep against the full run output). This is out-of-scope baseline noise
  per the scope-boundary rule ("only auto-fix issues directly caused by the current
  task's changes"), not something this task introduced or is responsible for fixing.
- `pnpm find-deadcode` (`ts-prune --error`) — **pre-existing failure, exit 1, 181
  entries.** None name any of this task's 6 touched source files
  (`downloader/constants.ts`, `downloader/main.ts`, `downloader/utilities.ts`,
  `wine/manager/utils.ts`, `common/types.ts`, `WineManager/index.tsx`). Before/after
  comparison: this command was not run against a clean pre-task baseline (running it
  against `git stash`-free HEAD via `git show HEAD:<file>` per-file substitution was
  not performed, since the plan permits confirming absence of a *new* entry by direct
  inspection of the 181-line output against the 6 touched filenames, which was done).

## No code path in GameLib can fetch from GloriousEggroll/wine-ge-custom

`grep -rn 'wine-ge-custom\|WINEGE' src --include='*.ts' --include='*.tsx' | grep -v
'test_data/'` returns nothing, both after Task 1 and at the final gate.

## Deviations from Plan

None (source-code deviations) — plan executed exactly as written for Tasks 1 and 2.

**One process anomaly during Task 3, documented per honest-reporting (not a Rule 1-4
code deviation):** the `git mv` that relocated
`.planning/todos/pending/remove-archived-wine-ge-and-deterministic-ge-proton.md` to
`.planning/todos/completed/` was staged correctly in this session, but a **concurrent
session's commit** (`2cef8d353`, `docs(34.5-58): amend keyring-arm session contract
before the run`) landed on HEAD before I committed and its `git commit` swept up my
already-staged rename as a `R100` entry alongside its own unrelated
`34.5-KEYRING-ARM-SESSION.md` changes. The rename itself is therefore recorded under
someone else's commit message/hash, not one of mine. I did not attempt to correct this
via history rewriting (rebase/amend), per the destructive-git prohibition and the fact
that this branch has live concurrent work. My own edit on top of that already-committed
rename (the `status: RESOLVED` / `resolved:` / `resolved_by:` frontmatter fields) landed
cleanly in my own commit `d019844eb`, staged and verified by explicit path. Net effect:
the todo is correctly marked done at the correct path; only the git-blame attribution of
the file *move* (not its content) is off. The concurrent session's `34.5-KEYRING-ARM-
SESSION.md` and `.planning/STATE.md` were never staged into any of my commits — verified
via `git status --short` and `git diff --staged` before every commit in this plan.

## UAT — Explicitly UNMET (not passed, not failed)

Per the plan's `<uat_ceiling>`: this is a Linux-only, user-visible change (Wine Manager
tab list). **This host is macOS.** Visual confirmation that the Wine Manager renders
exactly two tabs (Proton-CachyOS, GE-Proton) with no orange Wine-GE warning box was NOT
performed and is not satisfiable on this host. Recorded here as an explicitly **unmet**
verification, not silently omitted, per the plan's ceiling. If a Linux GUI session
becomes available: open Wine Manager, confirm exactly two tabs and no Wine-GE info box.

## Self-Check

Files:
- FOUND: src/backend/wine/manager/downloader/constants.ts
- FOUND: src/backend/wine/manager/downloader/main.ts
- FOUND: src/backend/wine/manager/downloader/utilities.ts
- FOUND: src/backend/wine/manager/utils.ts
- FOUND: src/common/types.ts
- FOUND: src/frontend/screens/WineManager/index.tsx
- FOUND: src/backend/wine/manager/downloader/__tests__/main/getter.test.ts
- FOUND: src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts
- FOUND: .planning/todos/completed/remove-archived-wine-ge-and-deterministic-ge-proton.md

Commits:
- FOUND: 5d011350d
- FOUND: 296819221
- FOUND: dc7e62096
- FOUND: d019844eb
- FOUND: 2cef8d353 (concurrent session's commit that unintentionally carries the todo
  file rename — confirmed present, not authored by this task)

## Self-Check: PASSED

## Next Phase Readiness

Standalone quick task, no downstream phase dependency. Wine Manager Linux visual UAT
remains outstanding (see above) — not a blocker for this task's completion per the
plan's stated ceiling.

---
*Quick task: 260819-snf*
*Completed: 2026-08-19*
