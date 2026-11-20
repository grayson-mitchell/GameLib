---
phase: quick-260930-ssf
plan: 01
subsystem: build/dev-server
tags: [vite, chokidar, dev-watcher, ebusy, windows]
requires: []
provides:
  - "server.watch.ignored covers spike target-cache dirs"
  - "committed re-runnable read-only Vite watcher probe"
affects: [vite.config.ts, meta/__tests__/viteRendererConfig.test.ts]
key-files:
  created:
    - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/watcherProbe.mjs
    - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/260930-ssf-GATE.md
    - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/probe-baseline.txt
    - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/probe-postfix.txt
    - .planning/quick/260930-ssf-close-the-vite-dev-watcher-ebusy-todo-ig/evidence/red-proof.txt
  modified:
    - vite.config.ts
    - meta/__tests__/viteRendererConfig.test.ts
    - .planning/spikes/027-windows-add-child-crosscheck/README.md
key-decisions:
  - "OD-1: ignore '**/target-cache/**' (the measured directory), not the whole .planning tree"
metrics:
  duration: ~25min
  completed: 2026-09-30
status: complete
commits: 3
plan_head_before: 6594950cad5aa69096637adcd07ced1c334fa30a
plan_head_after: 79740e8b05e3f9099c25ab171ca7cb017f5ede1f
actuals:
  tokens: 30000
  tasks: 3
  commits: 3
---

# Phase quick-260930-ssf Plan 01: Vite dev-watcher target-cache ignore Summary

Third measured entry `'**/target-cache/**'` in `server.watch.ignored`, proven on a real Vite 6.3.5
dev server (519 dirs / 3846 entries watched before, 0 / 0 after) and pinned by a jest case
whose failure was measured.

## No live repro

The EBUSY crash was NOT re-reproduced live: no `cargo build` was run under a live
`pnpm tauri:dev`. What was measured is dev-watcher membership, before and after, on a real Vite
6.3.5 dev server (`createServer`, no `listen()`, read-only). The crash evidence remains the
todo's Phase 38 sitting 13 observation.

## What changed

- `vite.config.ts`: `'**/target-cache/**'` appended as the last element, plus a dated
  260930-ssf rationale paragraph (real measured numbers, the OD-1 reason, the `dot: true`
  dependency). The trailing sentence now reads "See 260925-re8-GATE.md and 260930-ssf-GATE.md."
- `watcherProbe.mjs`: committed probe (re8's was scratchpad-only and lost). Default mode never
  binds a port, so a live `pnpm tauri:dev` on 5173 is undisturbed.
- Measurement (`evidence/`): baseline `target_cache_dirs: 519`, `target_cache_entries: 3846`;
  post-fix 0 / 0. Controls: `src-tauri/target` 0 in both runs; `.planning` (target-cache
  excluded) 716 baseline, 717 post-fix, so the zero is the entry and not the watcher skipping the
  dot-directory. Resolved ignore list in force matches the three-entry list exactly.
- Jest pin: 43 to 46 tests (exact-array `toEqual` updated, dedicated case under both modes with
  `not.toContain('**/.planning/**')`, and a 260930-ssf source-text guard). RED proof with the
  entry removed: 4 failed / 42 passed / 46 total; `vite.config.ts` restored byte-exact.
- Todo closed into `.planning/todos/completed/` (`status: RESOLVED`, `resolved: 2026-09-30`, Result
  and Resolution sections, no original line altered). The spike 027 README pointer is a one-line
  diff (`pending` to `completed`).

## Line numbers

The todo's cited lines (`vite.config.ts:101-123` comment, `:124-126` array) were verified against
the live file before the edit, and they matched.

## Coverage

- The new entry covers spikes 025 and 027, whose recipes build into a `target-cache`. Only 027's
  exists on disk.
- Spikes 013, 016, 019, 020, 021, 022, 024 and 029 build into `src-tauri/target`, which the first
  entry already covered.
- Spike 011's `parity-probe/target/` is covered by NO entry. No crash has been observed there and
  it was deliberately not added, per the observation-only rule.

## Why the glob works

It reaches through `.planning` only because Vite's bundled chokidar passes `dot: true`
(`ANYMATCH_OPTS`). A future Vite/chokidar upgrade that changes ignore-glob matching should re-run
the committed probe (`watcherProbe.mjs`).

## Commits

- `91a9ee0ff` fix(quick-260930-ssf): ignore spike target-cache dirs in the Vite dev watcher
- `0719c7c5b` test(quick-260930-ssf): pin the target-cache watcher ignore and prove the pin can fail
- `79740e8b0` docs(quick-260930-ssf): close the vite dev-watcher target-cache EBUSY todo

## Deviations from Plan

**1. [Rule 1 - plan gate defect] 80-column awk check in the Task 1 verify cannot pass**
- The verify's `sed -n '/Quick task 260930-ssf/,/watch: {/p' | awk 'length > 80'` range also
  sweeps in the pre-existing "Each entry below ..." paragraph, whose lines are 81 and 83 columns
  at HEAD. The new 260930-ssf paragraph itself was hand-wrapped to 80 columns or fewer (checked
  over the range ending at "Each entry below": 0 long lines). Left the pre-existing lines alone.
- The post-fix probe was run before a comment-only re-wrap of the new paragraph; the ignore list
  is unchanged by that re-wrap, and jest, prettier and `pnpm codecheck` were run after it.

**2. Observation, not a change:** the first `pnpm exec` after the RED proof triggered pnpm's own
dependency check (an install that reported `Packages: -127`, husky reinstall,
`download-helper-binaries`). Working tree stayed clean and all checks passed after; not caused by
this plan's edits.

Otherwise the plan was executed as written. `graphify update .` ran successfully.

## Known Stubs

None.

## Self-Check: PASSED

- Files present: `watcherProbe.mjs`, `evidence/probe-baseline.txt`, `evidence/probe-postfix.txt`,
  `evidence/red-proof.txt`, `260930-ssf-GATE.md`, the completed-todo path.
- Commits `91a9ee0ff`, `0719c7c5b`, `79740e8b0` present in `git log`.
- Gates: jest 46/46, prettier clean on both .ts files, `pnpm codecheck` green,
  `12/12 planning gates passed`.
