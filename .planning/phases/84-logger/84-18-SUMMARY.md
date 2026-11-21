---
phase: 84-logger
plan: 18
subsystem: logging
tags: [gap-closure, G-84-1, G-84-4, ci-proof, push, supply-chain]
status: complete
requires:
  - phase: 84-logger
    provides: "gap plans 84-12..84-17 (11 review findings fixed, windows golden harness fix)"
provides:
  - "clean-worktree proof of the gap closure at P (84-VALIDATION.md ## Gap-closure proof)"
  - "84-REVIEW-DISPOSITION.md: all 11 findings fixed, open: 0"
  - "the 7 jiff-tree crates pinned in cargoFeatures.test.ts (operator-accepted)"
  - "an authorised push of a0401bbc6 and the per-leg CI proof (84-VALIDATION.md ## Gap-closure CI proof)"
affects: [84-verification]
tech-stack:
  added: []
  patterns:
    - "a head other than the proven P is re-proven (affected step plus the nine pre-push checks) before it is pushed"
key-files:
  created: []
  modified:
    - .planning/phases/84-logger/84-VALIDATION.md
    - .planning/phases/84-logger/84-REVIEW-DISPOSITION.md
    - src/backend/__tests__/cargoFeatures.test.ts
key-decisions:
  - "operator chose push-now, pin updated first (own commit), proof record included in the push"
  - "the storeCorpus.test.ts red on test.yml is Phase 85-02's and was recorded, not fixed"
requirements-completed: [FND-05]
duration: multi-session (checkpoint between Task 1 and Task 2)
completed: 2026-11-22
commits: 3
plan_head_before: 5af07ab9fa35c488f5048c5d4e6ddd5c760bd498
plan_head_after: e79693b594c4c3d6c18b4d541fefc5ee6e8596b7
actuals:
  tokens: 6000
  tasks: 3
  commits: 3
---

# Phase 84 Plan 18: Gap-closure proof, push and CI proof Summary

The gap closure is proven locally at P, every review finding is recorded fixed, and the windows-latest leg G-84-1 found
red is re-run green on a pushed head; the only red left on CI is Phase 85-02's `storeCorpus.test.ts`.

## Task results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Clean-worktree proof at P (`5af07ab9f`) and the 11 dispositions | `94cc93f6e` | 84-VALIDATION.md (`## Gap-closure proof`), 84-REVIEW-DISPOSITION.md (11 fixed, `open: 0`) |
| 2 | Push decision (checkpoint), then the cargo pin | `a0401bbc6` | `src/backend/__tests__/cargoFeatures.test.ts` |
| 3 | Push and CI proof | `e79693b59` | 84-VALIDATION.md (`## Gap-closure CI proof`) |

## Task 2: the operator's decision (verbatim)

Shown to the operator: 80 commits `origin/main..P` (P = `5af07ab9f`; `origin/main` was `8b7d92f77`): Phase 84 37, Phase 100 25
(including merge `9264ca57c`), Phase 85 7, Phase 86 3, quick-261122-9sl 4, quick-261122-93a 3, merge 1; 152 files, +51403/-300
outside `.planning`.

- Push decision: **"push-now"**
- Cargo pin: **"Update pin first"**
- Proof commit: **"Include 94cc93f6e"**

`push-now` also authorises follow-up fix commits for CI-only Phase 84 failures and pushing them without asking again, each
re-proven locally first. None was needed.

## The push

- **Pin commit** `a0401bbc6`: added `jiff`, `jiff-core`, `jiff-static`, `jiff-tzdb`, `jiff-tzdb-platform`, `portable-atomic` and
  `portable-atomic-util` to `EXPECTED_LOCKFILE_CRATE_NAMES` in its own commit, citing `8fcadab94` / RUSTSEC-2026-0543 and
  stating the operator accepted these crates (operator decision, 2026-11-22). `chrono` stays (still locked). Cargo.lock
  Cargo.lock was not touched.
- **P' = `a0401bbc6d922b9e8df7df941d1e1ccc9144f555`** = P + `94cc93f6e` (docs only) + the pin commit (test-only), so the Task 1
  proof at P carries over for everything else. 82 commits published (the 80 shown plus those two); no Phase 85 / 100 commit
  was added between the checkpoint and the push (`git log a0401bbc6..HEAD` empty at push time).
- **Local re-proof at P' before the push:** `npx jest src/backend/__tests__/cargoFeatures.test.ts` 12 passed; scoped
  `npx prettier --check` on it clean; the nine `.husky/pre-push` checks all exit 0 (codecheck, lint, prettier, i18n
  --fail-on-update, find-deadcode, boundaries, steam-line-ceiling, backend-di-ceilings, gameinfo-narrowing-ceiling).
- **Fast-forward check immediately before the push**, nothing in between: `git fetch origin` then
  `git merge-base --is-ancestor origin/main a0401bbc6...` -> true (`FF-OK origin/main=8b7d92f77ea86f0422fbc254a9184af59ccfb3d6`).
- **Push:** `git push origin a0401bbc6d922b9e8df7df941d1e1ccc9144f555:refs/heads/main`, hooks ran (nine checks passed, graphify
  refresh ran), no `--no-verify`, no force: `8b7d92f77..a0401bbc6 -> main`.

## CI proof (details in 84-VALIDATION.md `## Gap-closure CI proof`)

| Workflow | Run id | Result |
|----------|--------|--------|
| rust-test.yml | 44942334026 | windows-latest success, macos-latest success, ubuntu-latest success |
| codecheck.yml | 44942333992 | success |
| lint.yml | 44942334060 | success |
| audit.yml (Supply-chain audit) | 44942334032 | cargo-deny success, pnpm-audit success |
| test.yml | 44942334064 | failure: `meta/__tests__/storeCorpus.test.ts` only (1 failed; 1125 suites and 23905 tests pass) |

G-84-1: on windows-latest, in the multi-crate step, `rust_writer_matches_the_ts_golden ... ok`,
`tokenise_normalises_a_windows_path_with_a_space_to_the_end_of_the_line ... ok`,
`rust_sanitiser_matches_the_ts_golden_for_every_renderer_case ... ok`, `tokenise_ends_a_path_at_a_quote ... ok`, and the
win32 clippy ratchet `PASS (win32, toolchain 1.99.1)`.

## Red attributed to Phase 85

`meta/__tests__/storeCorpus.test.ts` ("store corpus redaction > finds no account data in any committed file"): files under
`backups/sideload_apps/` in the store corpus carry the OS account name in `$.games[N].runner`. Owner: Phase 85-02
(`44e0c7a24`, `fa6c791de`, `b6834ba46`). Same red on `8b7d92f77`'s run 44932352973. Not fixed here.

Other Task 1 reds at P: `steamFilesPortComplete.test.ts` (a jest-parallelism race on `meta/runTs.__probe__.cjs`, passed alone;
did not recur on CI) and the `cargoFeatures` pin (fixed by `a0401bbc6`, green on CI).

## Deviations from Plan

**1. [Operator decision - supply chain] cargoFeatures pin updated in this plan.**
- **Found during:** Task 1 (red at P), resolved at Task 2.
- **Issue:** `8fcadab94` (RUSTSEC-2026-0543) swapped chrono for jiff in gamelib-log without re-pinning the lockfile crate-name set.
- **Fix:** the operator accepted the 7 crates and chose "Update pin first"; pinned in `a0401bbc6`, test-only.
- **Files modified:** `src/backend/__tests__/cargoFeatures.test.ts`
- **Commit:** `a0401bbc6`

Otherwise the plan executed as written; no clippy ceiling was changed (no count fell, none rose).

## Not pushed

The final docs commit (this SUMMARY) is local only, as instructed. `origin/main` is `a0401bbc6`; local `main` carries
`e79693b59` (CI proof) and the SUMMARY commit on top, unpublished.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file surface; test-only code change.

## Self-Check: PASSED

- `src/backend/__tests__/cargoFeatures.test.ts`, 84-VALIDATION.md, 84-REVIEW-DISPOSITION.md: FOUND
- `94cc93f6e`, `a0401bbc6`, `e79693b59` are ancestors of HEAD; `a0401bbc6` is `origin/main`.
