---
phase: quick-260928-sph
plan: 01
subsystem: planning-records
tags: [python, yaml, js-yaml, ci-gate, audit-uat, gsd-core]

requires: []
provides:
  - A phase-ledger walk (89 files: phases/*/ + archived milestones/*-phases/*/) in
    .planning/planning-frontmatter-gate.py, strictly parsing every VERIFICATION/UAT
    frontmatter block audit-uat reads, with shrink-only pin tables for the two no-fence
    files and the three unparseable terminal-status files.
affects: [audit-uat, planning-gates, phase-38-ledger-editors]

actuals:
  tokens: 15187
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Same-function self-test discipline: check_phase_ledger is called by both the live
      walk and every ledger: self-test case -- never a reimplementation."
    - "Shrink-only pin tables with a status cross-check (read_status_line, a regex shape
      read, never a second parser), mirroring the existing REQUIRED_STATE_KEYS
      anti-vacuity pattern."
    - "Hash-pinned real-history fixtures (LEDGER_SCORE_EXCERPT/LEDGER_RESULT_EXCERPT),
      extracted programmatically from git history and sha256-asserted before use,
      following the gate's own HISTORICAL_EXCERPT convention."

key-files:
  created: []
  modified:
    - .planning/planning-frontmatter-gate.py
    - .planning/todos/completed/2026-09-28-no-gate-parses-phase-verification-frontmatter.md
    - .planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md (moved to completed/)

key-decisions:
  - "DD-1: extended the existing gate file rather than adding a new *-gate.py, so
    MINIMUM_EXPECTED_GATES stays 12 (meta/runPlanningGates.py untouched)."
  - "DD-5: check_divergence_shapes (the STATE.md/ROADMAP.md check) is never applied to
    ledgers -- it would convict 10 ledgers (19 problems) including 38-VERIFICATION.md's
    own repair, since gsd-core reads ledgers through vendored js-yaml where that shape is
    correct, not a divergence."
  - "DD-8: shape (1) (unquoted plain scalar with a colon-space at column 0) is rejected by
    this gate even though gsd-core's own repairAmbiguousColonValues sometimes rescues it.
    Measured: the score-only splice alone reads human_needed under gsd-core (not the
    hiding defect); the indented shape-2 quote defect is what actually hid Phase 38."

requirements-completed: [QUICK-260928-SPH]

duration: ~70min
completed: 2026-09-28
status: complete
---

# Quick Task 260928-sph: Phase-Ledger Frontmatter Walk Summary

**Extended `.planning/planning-frontmatter-gate.py` to strictly parse all 89 phase VERIFICATION/UAT ledger frontmatter blocks `audit-uat` reads, closing the gap that let Phase 38 silently vanish from the audit for five days.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 2 (`.planning/planning-frontmatter-gate.py`, the todo file moved pending -> completed)
- **Gate runtime:** measured 3.742s wall-clock for a full run (self-test's 38 cases + the
  live TARGETS + 89-ledger walk), up from the pre-task baseline of ~0.65s for 20 cases +
  2 targets -- the increase is almost entirely the ~87 additional node/js-yaml subprocess
  spawns the 89-ledger walk requires (one per ledger, minus the 2 pinned no-fence files
  that never reach `run_parser`).

## Accomplishments

- `find_phase_ledgers`/`read_status_line`/`check_phase_ledger`/`check_phase_ledgers` added
  to `.planning/planning-frontmatter-gate.py`, walking `phases/*/` and archived
  `milestones/*-phases/*/` (89 files at the 2026-09-28 census: 85 active + 4 archived),
  and strictly parsing each one's frontmatter through the EXISTING `run_parser`/
  `extract_frontmatter` -- never a reimplementation.
- Two shrink-only pin tables: `KNOWN_NO_FRONTMATTER` (2 files with no fence at all) and
  `KNOWN_UNPARSEABLE_TERMINAL` (3 files with terminal statuses whose frontmatter does not
  parse), each cross-checked at scan time against a SHAPE READ (`STATUS_LINE_RE`) of the
  file's own column-0 `status:` line -- a pinned file's status silently moving still FAILS.
- Proven end-to-end against the REAL incident bytes: a copied tree with the real
  pre-repair `38-VERIFICATION.md` (`git show 0801e07eb^:...`) spliced in turns red with a
  `GATE FAILED:` line naming the file and its shape-read `human_needed` status. The
  unmodified copy stays green. Live gate summary:
  `PHASE LEDGERS: 89 walked (floor 89); 84 parsed as a mapping (15 at an open status:
  human_needed/gaps_found); 2 pinned no-frontmatter NOTE; 3 pinned unparseable-terminal
  NOTE; 0 failed.`
- Self-test grew from 18 to 38 lines: 20 new `ledger:` cases covering both hash-pinned
  incident shapes (extracted programmatically from git history, sha256-asserted before
  use), the repaired form (proving `check_divergence_shapes` is never applied to
  ledgers, DD-5), every pin failure mode (stale-by-nonexistence, stale-by-now-parsing,
  stale-by-now-fenced, pinned-flip, status-line-removed, ambiguous-status),
  fix-by-relabel, fix-by-deletion, the inexact-opening-fence divergence (DD-6),
  not-a-mapping, and the scan-level anti-vacuity floor (`MINIMUM_PHASE_LEDGERS = 89`).
- Module docstring rewritten: cites `260928-sph`, adds a PHASE-LEDGER WALK sub-section
  (incident, audit-uat mechanism with `uat.cjs`/`frontmatter.cjs` line numbers, scope,
  verdict rules, the DD-8 shape-(1) rescue nuance), and rewrites THE LIMIT to state the
  ledger walk's own stated-not-implemented limits (DD-9: anchors/aliases/U+E000 accepted
  here but refused by gsd-core; 0 ledgers use any of the three today).
- Todo `2026-09-28-no-gate-parses-phase-verification-frontmatter.md` moved to
  `completed/` with a `## Resolution` section naming both code commits, the shipped
  policy, why `MINIMUM_EXPECTED_GATES` stays 12, why the three terminal files were
  pinned not repaired, the measured shape-(1)/(2) correction to the todo's own
  narrative, the archive-scope widening, why `check_divergence_shapes` is not applied,
  the DD-9 limits, and the live audit-uat re-measure.

## Task Commits

1. **Task 1: Tracer — walk phase ledgers end-to-end and prove red on the real pre-repair 38-VERIFICATION.md** - `b1849e908` (feat)
2. **Task 2: Expand the ledger self-test matrix (pins, relabel, deletion, fence, floor) and rewrite the docstring** - `643787228` (test)
3. **Task 3: Gate battery, live audit-uat re-measure, close the todo, commit as one sequence** - `85d93807f` (docs)

## Files Created/Modified

- `.planning/planning-frontmatter-gate.py` - phase-ledger walk (4 new functions), 2 pin
  tables + module-load asserts, 2 hash-pinned real-history excerpts, 20 new `ledger:`
  self-test lines, docstring rewrite.
- `.planning/todos/completed/2026-09-28-no-gate-parses-phase-verification-frontmatter.md`
  (moved from `pending/`) - appended `## Resolution`.

## Decisions Made

- DD-1: extend the existing gate file; no new `*-gate.py` added, so
  `MINIMUM_EXPECTED_GATES` in `meta/runPlanningGates.py` stays 12 (file untouched).
- DD-2/DD-3/DD-4: parse first, never excuse a failure by status alone; a pin is a
  (path, status) or (path, reason) pair that FAILS the moment the file it describes no
  longer matches it (deleted, now parses, now fenced, or status moved).
- DD-5: `check_divergence_shapes` (the STATE.md/ROADMAP.md divergence check) is
  deliberately never called against ledgers -- its premise (the retired get-shit-done-cc
  hand-rolled parser) does not apply to how gsd-core actually reads ledgers (vendored
  js-yaml), and applying it would convict 10 correct ledgers (19 problems).
- DD-6: the opening fence must be byte-exact (`---\n`/`---\r\n`), matching gsd-core's own
  `frontmatterRegion` rule -- a `.strip()`-tolerant fence check would silently diverge
  from what the real consumer reads.
- DD-7: the walk covers archived `milestones/*-phases/*/` as well as active `phases/*/`,
  because `audit-uat` (`uat.cjs:84-123`) scans archives too; `MINIMUM_PHASE_LEDGERS = 89`
  is the discovered floor.
- DD-8: shape (1) (an unquoted plain `score:` scalar with a colon-space at column 0) is
  rejected by this gate even though gsd-core's `repairAmbiguousColonValues` rescues that
  EXACT shape at column 0. Measured against the real pre-repair bytes: splicing the
  score-only defect alone reads gsd-core status `human_needed` -- it did NOT, by itself,
  hide Phase 38. Splicing the quote-only defect (shape 2, an INDENTED double-quoted
  scalar with an unescaped inner `"`) alone reads `undefined` -- that is what actually
  hid the phase. This corrects the pending todo's own narrative, which described one
  undifferentiated defect. `39-VERIFICATION.md` carries the column-0 shape alone and is
  rescued by gsd-core today, which is why it stays a pinned `NOTE:` rather than being
  promoted to `OK:` -- the gate enforces the strict js-yaml-4 property, not "parses under
  a consumer's repair crutch".
- DD-9: gsd-core's `parseGuardedYamlRegion` refuses YAML anchors, aliases, and the
  U+E000 sentinel; this gate's js-yaml accepts them. No ledger uses any of the three
  today (measured), so this is recorded as a stated limit in the docstring, not
  implemented.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' `<verify>` blocks passed on
first execution; no auto-fixes, no architectural questions, no checkpoints hit.

## Live Audit-UAT Re-measure

`node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` after this task's commits:
`total_items` 429, `total_files` 56, `parse_gap_files` 0, `by_phase['38']` 10 --
identical to the planning-time baseline (429/56/0/10). This task edited no ledger, only
the gate and the todo corpus, so no change was expected. CLAUDE.md's "419 outstanding
items across 55 files" figure was left untouched, per the todo's own instruction --
it remains a dated measurement from before Phase 38 was ever visible to `audit-uat`,
not a live one.

## In-band Note: Formatter Check Omitted by Design

Both written paths (`.planning/planning-frontmatter-gate.py` and both todo paths) are
prettier-IGNORED: `npx prettier --file-info` reports
`{ "ignored": true, "inferredParser": null }` for all of them. Per CLAUDE.md's
formatter-check convention, a `prettier --check` over an ignored path is vacuous (it
would print "All matched files use Prettier code style!" and exit 0 having matched zero
files) and is deliberately omitted from every task's `<verify>` block. Task 1 and 3's
`<verify>` blocks instead assert `"ignored": true` in-band via `--file-info`, which is
the honest substitute.

## Observations (out of scope, recorded per plan's `<output>`)

- **`check_divergence_shapes`'s premise for STATE.md has not been re-examined.** This
  task did not touch the STATE.md/ROADMAP.md divergence check, its 18 self-test cases,
  or `TARGETS`/`REQUIRED_STATE_KEYS`/`VALID_STATE_DOCUMENT`. Whether the SDK's hand-rolled
  `parseFrontmatterYamlLines` premise that check exists to guard against is still current
  under `@opengsd/gsd-core` 1.14.0 (as opposed to the retired `get-shit-done-cc` it was
  written against) is an open question this task deliberately did not answer -- it is
  noted here, not fixed.
- **`38-HUMAN-UAT.md`'s boolean `status: false`.** This ledger parses cleanly as a mapping
  (counted among the 84 `OK:` ledgers), but its `status` field is the YAML boolean `false`
  rather than a string. `str(value.get("status")).lower()` in `check_phase_ledger`
  stringifies it to `"false"`, which is not one of `OPEN_VERIFICATION_STATUSES`, so it is
  not counted as open and this gate treats it correctly. It is a UAT file, so `audit-uat`
  reads its items from the body regardless of this field. Left untouched -- out of scope
  for this task.

## Next Phase Readiness

The gate is live in `pnpm planning-gates` (12/12 passing) and will turn red the next time
any hand-edit leaves an open-status phase ledger's frontmatter unparseable, closing the
five-day blind window this todo documented. No follow-up work is required by this task;
the divergence-shape re-examination noted above is a candidate for a future todo, not
filed here since the plan's `<out of scope>` explicitly excluded it from this task.

---

*Quick task: 260928-sph*
*Completed: 2026-09-28*
