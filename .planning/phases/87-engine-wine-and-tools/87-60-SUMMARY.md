---
phase: 87-engine-wine-and-tools
plan: 60
subsystem: live-gate-contract
tags: [live-gate, svc-02, d-11, d-12, d-21, uat, structural-reachability-review, gap-closure, todos, macos]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: "87-HUMAN-UAT.md as scored by 87-59 (findings F1 to F5, the deferred engine-log gap, the non-gate observations)"
provides:
  - "87-RERUN-1-HUMAN-UAT.md: the seven-item live re-run contract for the gap closure (authored_by 87-60, run_by 87-69), with builds, preflight P1 to P8, run order, kept 87-59 results, evidence capture, required literals, a seven-test Structural Reachability Review and withdrawals"
  - "Six pending todos for the 87-59 non-gate observations, each with severity, platform and ready"
affects: [87-61, 87-62, 87-63, 87-64, 87-65, 87-66, 87-67, 87-68, 87-69, 87-70]

actuals:
  tokens: 12700
  tasks: 3
  commits: 3

plan_head_before: b81419c02d11697d395871246e5a99ef07ce8064
plan_head_after: cc02603cac7085703fae1cbf8f80bc82bc059b0b
commits: 3

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/87-engine-wine-and-tools/87-RERUN-1-HUMAN-UAT.md
    - .planning/todos/pending/2026-11-24-game-page-opened-from-downloads-has-no-way-back-to-the-library.md
    - .planning/todos/pending/2026-11-24-stop-on-a-steam-bridge-title-logs-a-missing-abort-controller-error.md
    - .planning/todos/pending/2026-11-24-bottled-games-exit-about-one-second-after-the-wine-command.md
    - .planning/todos/pending/2026-11-24-library-install-state-disagrees-with-disk-racine-bloody-hell.md
    - .planning/todos/pending/2026-11-24-crossover-trial-notice-has-no-dismiss-and-buy-is-unlogged.md
    - .planning/todos/pending/2026-11-24-phase-87-owed-live-checks-56b-56c-not-run.md
  modified: []

key-decisions:
  - "Item 7 (the destructive bottle removal) runs as its own launch 4 after launches 1 to 3, with the sibling compare taken app closed and P2 clean before any other launch."
  - "Item 4's offline Apply uses a different verb from its success verb, so the bottle's winetricks.log check reads the success verb only."
  - "Every Required-literals row is CONDITIONAL with re-check: 87-69 Task 1, because the shell's engine log is wired only by 87-61; the redaction check records counts with a presence control, never a matched line."

requirements-completed: []

duration: about 4 min of executor wall clock
completed: 2026-11-24
---

# Phase 87 Plan 60: Gap-closure live re-run contract Summary

**The Phase 87 gap-closure live re-run contract exists before any gap fix is coded: seven items (the F1 offline refusal, engine lines reaching gamelib.log redacted, the 180 s no-raise hold, Winetricks on the game's own bottle with a visible failure, Stop on a CrossOver non-Steam game, a never-installed wine-manager entry with the list following, and the bottle removal with the sibling byte-identical), authored here and run only by 87-69, plus six triaged todos for the 87-59 non-gate observations.**

## Accomplishments

- **Contract (Tasks 1 and 2).** `87-RERUN-1-HUMAN-UAT.md` parses under gsd-core's `parseUatItemsWithStats` as exactly 7 items with `headingsSeen` 0, each `result: pending`. It names the signed 0.13.1 gap build (recorded by 87-68) installed over the signed 0.13.0 build, preflight P1 to P8 (P8 compares the gap build's identity), a run order of three plain or sandboxed launches plus a fourth for the destructive item 7, and `## Kept from 87-59` quoting each half that stands.
- **Structural Reachability Review.** All seven defect-class tests applied to every item, sub-check and precondition. Test 5 reduction: 11 state-mutating steps against 7 evidence-bearing ones, 77 pairs considered, 11 flagged each with a resolution (log rotation, the 0.13.0 session's log, truncating transcript, network-off scoping, the pin move, the failing-verb versus success-verb `winetricks.log` confound, Stop before Winetricks, marker drift after the fallback runs, the wine-downloader store rewrite, the post-removal sibling compare, restores last). Test 4 names a presence case for each of the four absences (no download, no shared prefix, no IPC rejection, no home path in engine lines) plus four more.
- **Required literals.** Eight rows, every one CONDITIONAL with `re-check: 87-69 Task 1` (the sink is 87-61's `ShellEngineLog`; the removal-outcome line exists only after 87-66 and 87-70). Item 2's redaction procedure records counts inside the engine-origin selection only, with a presence control against the TS `Logging to file(s)` line, and never pastes a matched line.
- **Todos (Task 3).** Six new pending todos, none duplicating an existing one (checked against all 19 pending titles and bodies), each with `severity:`, `platform:`, `ready:` in that order and a "Not fixed in Phase 87" line citing the user's 2026-11-24 decision: back-navigation from Downloads (minor, any, code), Stop's abort-controller ERROR (minor, macos, code), bottled 1 s exits (medium, macos, live-gate), library install state versus disk (medium, macos, live-gate), the trial notice with no dismiss and an unlogged Buy (minor, any, human), and the owed 56b-1, 56b-2, 56b-3 and 56c-3 checks (medium, macos, live-gate). The disabled "Remove prefix" contrast observation is not a todo: 87-67 fixes it.

## Task Commits

1. **Task 1 (tracer): contract end to end** - `2143f510c` (frontmatter, builds, deliberate changes, preflight, seven items, run order, kept results; the tracer `<verify>` re-run and passed: 7 items, `headingsSeen` 0, 7 pending lines, `run_by: 87-69`).
2. **Task 2: SRR, required literals, evidence capture, withdrawals** - `6081d3bf1` (nine required headings, 8 CONDITIONAL literal rows, Tests 1 to 7, still 7 parsed items, `pnpm planning-gates` 12/12).
3. **Task 3: six todos** - `cc02603ca` (key order check passes for all six, `pnpm planning-gates` 12/12).

`commits: 3` is `git rev-list --count b81419c02..cc02603ca` (measured from the plan-head ledger).

## Deviations from Plan

None - plan executed exactly as written.

One authoring note, not a deviation: the plan said P5's never-installed wine-manager entry "was never installed"; the contract states the sharper premise (the stored entry never held `isInstalled`, because an entry that was installed and then removed carries the keys and does not exercise F2), per Test 6 of the review.

## Authentication gates

None.

## Known Stubs

None. This plan wrote only planning artifacts. The contract's rows that depend on 87-61 to 87-67 and 87-70 are marked CONDITIONAL on purpose (D-21) and are resolved by 87-69 Task 1, not stubs.

## Threat Flags

None. No network endpoint, auth path, file access pattern or schema was introduced; the contract and todos carry `~` paths, hashes and counts only (T-87-99, T-87-100), and the real-bottle steps keep their `ditto` copy, recorded approval and operator-decided restore (T-87-101). `grep` found no account name or absolute home path in any new file.

## Issues Encountered

None. The shared tree's unrelated dirty files (`.planning/ROADMAP.md` and `STATE.md` hunks from other sessions, `state.json`, spike and todo dirt, a stray `.dxvk-cache`) were left alone and never staged.

## Next Phase Readiness

Ready for 87-61 to 87-67 and 87-70 (the fixes), then 87-68 (the signed 0.13.1 build) and 87-69 (the only plan that runs this contract). 87-69 Task 1 must re-check every CONDITIONAL row against the shipped gap code before the first launch.

## Self-Check: PASSED

- FOUND: .planning/phases/87-engine-wine-and-tools/87-RERUN-1-HUMAN-UAT.md (7 parsed items, `headingsSeen` 0, 9 required headings, 8 CONDITIONAL literal rows, Tests 1 to 7)
- FOUND: the six `.planning/todos/pending/2026-11-24-*.md` files
- FOUND commits (ancestors of HEAD): 2143f510c, 6081d3bf1, cc02603ca
- `pnpm planning-gates`: 12/12 passed
