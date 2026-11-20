---
phase: quick-260929-vyi
plan: 01
subsystem: release-ci
tags: [release-tauri, linux, appimage, glibc, ubuntu-22.04, rust-cache]
status: complete
requirements: [QUICK-260929-VYI]
key-files:
  modified:
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts
    - .planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md
  created:
    - .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/jammy-apt-census.txt
    - .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt
plan_head_before: ef5638a7cdcad8e295a3675f4cc4324fd11e7923
actuals:
  tasks: 3
  commits: 2
---

# Quick 260929-vyi: Linux release leg moved to ubuntu-22.04

The Linux leg of `release-tauri.yml` now builds on ubuntu-22.04 (glibc 2.35) instead of
ubuntu-24.04 (glibc 2.39), the apt guard and Rust cache key follow it, and a parsed-YAML test
block pins all three with every test proven able to fail. The AppImage floor being 2.35 is
expected by construction, NOT measured: no CI run has happened.

## Commits

- `09aab2b97` fix(quick-260929-vyi): build the Linux release leg on ubuntu-22.04 so the AppImage glibc floor is 2.35
- `3b3dc97c5` docs(quick-260929-vyi): record the ubuntu-22.04 build-base change, jammy census and negative controls on the glibc todo

## Workflow edits (3) and tests (4)

1. Linux matrix leg platform `ubuntu-24.04` -> `ubuntu-22.04`.
2. `Install Ubuntu system dependencies` guard is now `matrix.platform == 'ubuntu-22.04'`; the
   apt package list is unchanged.
3. `swatinem/rust-cache@v2` gained `key: ${{ matrix.platform }}` (its default key is OS+arch and it
   restores by prefix, so it could not tell 22.04 from 24.04).
4. A dated 260929-vyi header entry (why, Tauri's oldest-base guidance, census path, cold-cache
   consequence, 4m53s figure not re-measured, UNPROVEN LIVE statement, image deprecation path).

Tests (new describe `release-tauri.yml Linux build base`, parsed YAML only), replacing the raw-text
`includes an ubuntu runner (24.04 or latest)` regex test: (a) one Linux leg on ubuntu-22.04 and
exactly one `ubuntu-` leg; (b) apt guard equals the parsed Linux leg's platform; (c) apt list equals
`JAMMY_CENSUSED_APT_PACKAGES`; (d) rust-cache `key` and `workspaces`.

## Measured test counts

| Run | Result |
| --- | --- |
| Baseline, before edits: `--selectProjects Backend Meta --testPathPattern 'releaseWorkflow\|tauriConf\|artifactTargets\|cleanDist'` | 4 suites, 176 tests passed |
| After (measured, three separate runs incl. after negative controls) | 4 suites, 179 tests passed; trailing line `Ran all test suites matching /releaseWorkflow\|tauriConf\|artifactTargets\|cleanDist/i in 2 projects.` |

176 - 1 (removed regex test) + 4 = 179, matching the measured number. Scoped `releaseWorkflow`
alone: 109 tests.

## RED / GREEN evidence

Arm A (test edited, workflow at HEAD `ef5638a7c`): exit 1, `Tests: 2 failed, 107 passed, 109 total`,
failing exactly (a) and (d). After the workflow edit: exit 0, 109 passed.

## Jammy apt census (read from the six real archive indexes)

| package | jammy archive hits | verdict |
| --- | --- | --- |
| libwebkit2gtk-4.1-dev | jammy-universe 2.36.0-2ubuntu1; jammy-updates-universe and jammy-security-universe 2.50.4-0ubuntu0.22.04.1 | FOUND |
| libayatana-appindicator3-dev | jammy-main 0.5.90-7ubuntu2 | FOUND |
| librsvg2-dev | jammy-main 2.52.5+dfsg-3; updates/security-main 2.52.5+dfsg-3ubuntu0.2 | FOUND |
| patchelf | jammy-universe 0.14.3-1 | FOUND |
| xdg-utils | jammy-main 1.1.3-4.1ubuntu1; jammy-updates-main 1.1.3-4.1ubuntu3~22.04.1 | FOUND |

5/5 FOUND. Premise correction: on this host `apt-cache policy` lists only `/var/lib/dpkg/status`
(`/var/lib/apt/lists` holds a stale `noble` cache while the sources point at `jammy`), so
"Candidate" equals the installed version and is not a jammy-availability oracle. Full detail and
index sizes/sha256 in `evidence/jammy-apt-census.txt`.

## Negative-control arms

| test | red arm | failing set observed |
| --- | --- | --- |
| (a) Linux leg on ubuntu-22.04 | A: pre-edit workflow | (a) and (d) exactly |
| (b) apt guard equals leg platform | B: guard-only half-edit (numstat 1/1) | (b) exactly, `1 failed, 108 passed` |
| (c) apt list equals censused set | C: `libfuse2` appended (numstat 1/1) | (c) exactly, `1 failed, 108 passed` |
| (d) rust-cache keyed on platform | A | (a) and (d) exactly |

Workflow restored from `git show HEAD:` after B and C; `git diff --quiet` exit 0 both times;
`git status --porcelain -- .github src` empty. `git stash` never used.

## Other checks

- Structural js-yaml check printed OK (3 legs, one `ubuntu-` leg = ubuntu-22.04, apt guard, cache key,
  no `ubuntu-24.04` in the parsed document).
- `pnpm planning-gates`: exit 0, 12/12 passed.
- `pnpm codecheck`: exit 0 (re-run after the lint fix).
- `pnpm lint:tests`: exit 0, `tests: PASS`, 0 errors, 638 warnings (pre-existing). It printed one
  scope line, not two ceilings.
- `actionlint`: not run (not on PATH).
- Prettier `--check`: REAL on `.github/workflows/release-tauri.yml` and
  `src/backend/__tests__/releaseWorkflow.test.ts` (both `ignored: false`, pass). VACUOUS-by-ignore, so
  no check was run, on the todo and both evidence files (`ignored: true`).
- Todo diff: `git diff --numstat` 64 added, 0 deleted (append-only); severity/platform/ready unchanged;
  still in `pending/`. Planning-gates passes (includes the todo-frontmatter gate).

## Scope decisions

- `promote-updater-feed.yml:47` stays ubuntu-24.04: it only promotes `latest.json`, builds nothing that ships.
- `tauriConf.test.ts:659` unchanged: its comment describes that job's runner, still true.
- `meta/__tests__/fixtures/upstream-workflows/legendary-0.21.0/build-base.yml` unchanged: frozen upstream fixture.
- `.github/actions/install-deps/action.yml` installs no apt packages, so there is no 22.04 branch to change.
- Step 0 re-grep matched the planning-time list exactly; no new hits.

Why not the alternative (a documented minimum glibc of 2.39): it would leave every 22.04-era user,
including the operator's own Pop!_OS 22.04 target host, with a download that does not start. Tauri's
guidance is to build on the oldest supported base, naming Ubuntu 22.04.

## Deviations from Plan

**1. [Rule 1 - Bug] Lint errors in my own new test code.** `pnpm lint:tests` first failed with 2
`no-unnecessary-type-assertion` errors (`legs[0] as ReleaseMatrixLeg`, `steps[0] as
ParsedReleaseStep`). Removed the two casts; codecheck, prettier and lint re-run green and the
scoped jest re-run (179) before the commit. Nothing committed carried the errors.

**2. Ledger file name.** The plan-commit ledger was written as `gsd-plan-head-before-quick-260929-vyi`
(the plan's `{phase}-{plan}` placeholder resolved to the quick id). `commits: 2` is measured from it.

Otherwise none: executed as written. Advisory note 1 honoured (measured 179 == expected). Advisory
note 2 honoured (numstat 0 deletions on the todo).

## Known Stubs

None.

## UNVERIFIED (until a CI run on the new base produces an AppImage that is smoke-launched on this host)

1. No `release-tauri.yml` run has executed on ubuntu-22.04: apt install, Rust compile, SEA sidecar
   build and AppImage bundling on the 22.04 image are all unobserved.
2. The rebuilt AppImage's max `GLIBC_` reference being at most 2.35 is by construction, not measured.
3. Launch on this Pop!_OS 22.04 host (the 38-W05 re-run) is out of scope. A default
   `workflow_dispatch` dry run proves item 1 safely but yields a build LOG only, no binary. Only a
   real `v*` tag push yields an AppImage, and that writes the shared draft release v0.7.0 (operator's call).
4. Launch on a glibc 2.39+ host is unchanged/open.
5. The first run after this change is a cold Rust cache on all three legs; the 60-minute
   tauri-action bound has never been measured against a cold build.
6. GitHub's ubuntu-22.04 hosted image is on a deprecation path (no date asserted); the floor must be re-decided when it retires.
7. Helper binaries (`pnpm download-helper-binaries`) and the SEA sidecar's nodejs.org Node carry
   their own glibc floors independent of the build base; prior "not known" items untouched.

## Follow-up risks (not decided here)

- ubuntu-22.04 image deprecation path, no date.
- `macos-latest` / `windows-latest` share the same cache-key blind spot: the key is `matrix.platform`
  which is the label, so GitHub re-pointing a `*-latest` label would let a stale cache restore.

## Pre-existing header staleness (observed, NOT changed)

- `release-tauri.yml` l.5-9 says the pipeline has never completed a tag-push run, while a later
  entry records one (run 35942560790).
- The Pitfall-7 NOTE names `draft-release-mac.yml` and `draft-release-linux.yml`, which no longer
  exist in `.github/workflows/`.

## Threat Flags

None. Nothing pushed, tagged or dispatched (T-vyi-01); the cache-key mitigation (T-vyi-02) is pinned
by test (d).

## Statement

Nothing was pushed, tagged or dispatched; no `gh` or authenticated network command was run (the only
network use was anonymous HTTP downloads of the six public Ubuntu index files). `STATE.md`,
`ROADMAP.md`, `38-VERIFICATION.md`, `38-HUMAN-UAT.md` and `35-LIVE-GATE.md` were not touched. The
union of files touched by the two commits is exactly the five `files_modified` paths.

## Self-Check: PASSED

Both commit shas exist on `quick-260928-tvk`; both evidence files, the SUMMARY and the modified
files exist; working tree has no stray modifications (only the pre-existing untracked spike paths
and the uncommitted PLAN.md/SUMMARY.md).
