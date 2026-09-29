---
phase: quick-260929-vyi
verified: 2026-09-29T00:00:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
gaps: []
---

# Quick 260929-vyi Verification Report

**Goal:** Move the Linux leg of `.github/workflows/release-tauri.yml` from ubuntu-24.04 to ubuntu-22.04, update everything keyed on the runner string, prove locally what can be proven, never push/tag/dispatch, leave 38-W05 and the ledger untouched, update the todo in place with what changed and what stays UNVERIFIED.
**Commits checked:** `09aab2b97` (workflow + test), `3b3dc97c5` (todo + 2 evidence files), on branch `quick-260928-tvk`.
**Status:** passed (the live CI and AppImage behavior is deliberately unproven, and the todo says so).

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Linux matrix leg is ubuntu-22.04 | VERIFIED | `release-tauri.yml:155` `platform: 'ubuntu-22.04'`; the only ubuntu leg; sidecar_triple unchanged |
| 2 | apt step guard equals the leg | VERIFIED | `:233` `if: matrix.platform == 'ubuntu-22.04'`; package list unchanged in the diff |
| 3 | rust-cache keyed on matrix.platform | VERIFIED | `:317` `key: ${{ matrix.platform }}`, workspaces line unchanged |
| 4 | No other runner pin missed | VERIFIED | See sweep below; every other `matrix.platform` use is macos/windows-conditioned or a pass-through |
| 5 | New tests read the parsed workflow and fail on the old runner | VERIFIED | Tests use `parseReleaseWorkflow()` / `parseReleaseSteps()` (comments dropped). The old raw-text regex test, which a comment alone could satisfy, was removed. Negative-control evidence records arm A (pre-edit workflow): 2 red (leg, cache key). Arms B/C: red for guard-only half-edit and extra package. |
| 6 | 38-VERIFICATION / 38-HUMAN-UAT / STATE / ROADMAP untouched | VERIFIED | `git diff ef5638a7c 3b3dc97c5 --stat` lists only 5 files: workflow, test, todo, 2 evidence files. No `.planning/phases`, STATE.md or ROADMAP.md paths. |
| 7 | Todo diff append-only, frontmatter intact, still in pending/ | VERIFIED | Diff is 2 added `files:` list entries plus an appended section. No deletions in the todo diff. `severity: major`, `platform: linux`, `ready: live-gate` unchanged. File is still in `.planning/todos/pending/` and not in `completed/`. `todo-frontmatter-gate` passes. |
| 8 | Nothing pushed | VERIFIED | `git branch -r --contains 09aab2b97` and `--contains 3b3dc97c5` both return empty. `origin/main` is `1953365c8` and is unchanged. `origin/quick-260928-tvk` (`55aa0d54b`) was last updated 21:17 by an earlier push, before these commits (22:58 or later), and HEAD is 9 ahead of it. Read-only, no network. |
| 9 | Todo UNVERIFIED list honestly says the AppImage was never built or launched | VERIFIED | The todo's "UNVERIFIED" section item 1: no run has executed on 22.04, so apt, compile, SEA sidecar and AppImage bundling are unobserved. Item 2: glibc <= 2.35 is "expected by construction, not measured". Item 3: the launch on the Pop!_OS host is the 38-W05 re-run, out of scope. Item 4: launch on a 2.39+ host is unchanged. Items 5-7 cover the cold cache, the 22.04 image deprecation and the helper-binary floors. |

## Runner-string sweep (repo excluding node_modules/target/graphify-out/.planning)

- `.github/workflows/promote-updater-feed.yml:47` `runs-on: ubuntu-24.04`. Intentionally out of scope. It is a feed-promotion job, not the AppImage build, so it does not set the AppImage glibc floor.
- `src/backend/__tests__/tauriConf.test.ts:659` comment "present on the ubuntu-24.04 runner this job uses". This refers to promote-updater-feed, so it stays accurate and is out of scope.
- `src/backend/__tests__/releaseWorkflow.test.ts:1690` and `release-tauri.yml` header lines 68-103. Historical prose in comments describing the old runner. Not functional.
- `meta/__tests__/fixtures/upstream-workflows/legendary-0.21.0/build-base.yml`. Upstream fixture, unrelated.
- `ubuntu-latest` jobs (test, lint, codecheck and others). Unrelated to the release build base.
- No functional `ubuntu-24.04` remains in `release-tauri.yml`.

## Mechanical checks

| Check | Result |
|-------|--------|
| `pnpm -s jest --selectProjects Backend Meta --testPathPattern 'releaseWorkflow\|tauriConf\|artifactTargets\|cleanDist'` | exit 0, 4 suites, 179 tests passed |
| `pnpm -s planning-gates` | exit 0, 12/12 pass |
| `npx prettier --check` on releaseWorkflow.test.ts and release-tauri.yml | pass, and neither path is ignored |
| `evidence/jammy-apt-census.txt` | 5/5 packages FOUND in jammy archive indexes; matches the `JAMMY_CENSUSED_APT_PACKAGES` constant and the workflow's apt list |

## Anti-patterns

No TBD/FIXME/XXX markers were introduced. The workflow header states its UNPROVEN LIVE status instead of implying a verified fix.

## Observations (not gaps)

- `260929-vyi-PLAN.md` and `260929-vyi-SUMMARY.md` are still untracked (visible in git status). The commits only carry code and todo, so the orchestrator needs to bundle those files.
- Whether the rebuilt AppImage launches on glibc 2.35 stays open by design. The todo keeps `ready: live-gate` and 38-W05 stays open. This is a residual live gate, not a defect in this task.

## Gaps Summary

None. Every must-have is verified against the code and git state rather than the SUMMARY.

_Verified: 2026-09-29_
_Verifier: Claude (gsd-verifier)_
