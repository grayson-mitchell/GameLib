---
phase: quick-260928-raq
plan: 01
subsystem: planning-records
tags: [yaml, audit-uat, gsd-core, phase-38, tauri, add_child, spikes]

requires:
  - phase: spike-025-linux-add-child-compile
    provides: "Linux add_child compiles and a real embed attaches/loads/reads cookies"
  - phase: spike-026-linux-add-child-runtime
    provides: "Linux positioning/data_store_identifier are source-confirmed no-ops; segfault isolated"
  - phase: spike-027-windows-add-child-crosscheck
    provides: "Windows/WebView2 cross-compile type-checks cleanly from a Linux host"
provides:
  - "38-VERIFICATION.md frontmatter repaired to valid YAML (was broken since 2026-09-23)"
  - "38-E01 narrowed to a live-Windows machine-switch cost; 38-E02 discharged as ANSWERED"
  - "38-E03/38-E04 Linux branches re-gated onto a named design-decision todo"
  - "ledger-check.cjs, a reusable quick-task harness for this ledger's shape"
  - "Three new todos: Linux GtkBox positioning, Linux data_store_identifier no-op, missing frontmatter parse gate"
affects: [phase-38, phase-40, audit-uat, planning-frontmatter-gate]

actuals:
  tokens: 26288
  tasks: 3
  commits: 3
  plan_head_before: a8c6d289f

tech-stack:
  added: []
  patterns:
    - "Quick-task verification harness (ledger-check.cjs) that cross-checks against gsd-core's own parser and audit-uat CLI, not just an independent re-implementation"

key-files:
  created:
    - .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs
    - .planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
    - .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md
  modified:
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-VERIFICATION.md
    - .planning/ROADMAP.md

key-decisions:
  - "38-E02 discharged as ANSWERED rather than split into sub-items: its own expected: is a two-branch disjunction (works the same way, OR a documented named reason it cannot), spike 025 answered the attach clause YES and spike 026 answered the positioning/geometry clauses NO with a documented, source-confirmed reason (GtkBox packing) — so no observation remains, only a design decision, which ROADMAP Phase 38 rule says does not belong in this ledger. A retina/scale-factor sub-item would have duplicated 38-E03; the segfault and data_store_identifier no-op are outside 38-E02's test: and were filed as todos instead."
  - "38-E01 narrowed, not discharged: spike 027 only answers the compile-level question (type-checks against WebView2 from a Linux host); the runtime question — attach, placement, geometry tracking on real WebView2 — remains a NAMED UNKNOWN pending a live Windows sitting."
  - "The Linux branches of 38-E03/38-E04 were re-gated onto the new GtkBox-positioning todo rather than discharged or left on the superseded premise, because unlike 38-E02 they still have something to observe (retina scaling, drag-resize latency) once a Linux layout strategy exists — moving them out entirely would hide an un-run half."

requirements-completed: [QUICK-260928-RAQ]

duration: ~90min
completed: 2026-09-28
status: complete
---

# Quick Task 260928-raq: Phase 38 ledger repair and 38-E01/38-E02 correction Summary

**Repaired Phase 38's invalid-YAML ledger (invisible to gsd-core audit-uat since 2026-09-23), then narrowed 38-E01 to a live-Windows cost and discharged 38-E02 as ANSWERED on spike 025/026/027 evidence, re-gating 38-E03/38-E04's Linux branches onto a new design-decision todo.**

## Performance

- **Tasks:** 3/3 completed
- **Commits:** 3 (one per task; measured via `git rev-list --count a8c6d289f..HEAD`)
- **Files created:** 4
- **Files modified:** 4

## Step-0 baseline and every `by_phase['38']` measurement

Measured with `node ~/.claude/gsd-core/bin/gsd-tools.cjs audit-uat --raw` (`@opengsd/gsd-core` 1.14.0) at each stage:

| Stage | `by_phase['38']` | `summary.total_items` | `parse_gap_files` |
|---|---|---|---|
| Step 0 baseline (before any edit) | **absent** (no `38` key) | 419 | 0 |
| After Task 1's syntax-only repair | **11** | 430 | 0 |
| After Task 2's `38-E02` discharge | **10** | 429 | 0 |
| After Task 3 (docs-only, no ledger array change) | **10** | 429 | 0 |

Net change from baseline: **+10** (419 → 429) = +11 from the repair making the 11 pre-existing open items visible, −1 from `38-E02` leaving the open array on discharge — exactly as the plan's `<verification>` section predicted (429, not 430).

## Both census runs

`node .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs --census [--expect-bad N]`, walking every `.planning/phases/*/*-{VERIFICATION,UAT,HUMAN-UAT}.md` under js-yaml 4.1.1:

- **Before repair:** 78 ok, 2 with no frontmatter, 5 bad (`34.13-UAT.md`, `34.4.1-VERIFICATION.md`, `38-HUMAN-UAT.md`, `38-VERIFICATION.md`, `39-VERIFICATION.md`).
- **After repair (final state):** 80 ok, 2 with no frontmatter, 3 bad (`34.13-UAT.md`, `34.4.1-VERIFICATION.md`, `39-VERIFICATION.md`). The three remaining bad files carry terminal statuses (`complete`/`passed`/`passed`), so `audit-uat` skips them regardless — no live audit consequence today, but nothing gates them from breaking again in an open-status file, which is why the gate-gap todo was filed.

## Both negative-control outcomes

1. **Pre-change blob (`a8c6d289f`) still fails to parse.** `node ledger-check.cjs --rev a8c6d289f --open 11 --discharged 15 --retired 10` exits 1 with `FAIL frontmatter-parse: bad indentation of a mapping entry (4:108)` — proving the harness actually discriminates broken YAML from repaired YAML, rather than passing regardless of input.
2. **`--no-stale-premise` failed on the live file before Task 2, and passes after.** Run against the Task-1-only state (`--open 11 --discharged 15 --retired 10 --no-stale-premise`), the check FAILed on `38-E01`/`38-E02`'s `blocked_by`/`why_human` and `38-E03`/`38-E04`'s stale phrasing. After Task 2's re-gating, the identical check against the final ledger (`--open 10 --discharged 16 --retired 10 --no-stale-premise`) PASSes — proving the check can see the premise it later verifies is gone, not just report green unconditionally.

## Prettier checks: real vs. vacuous

`.prettierignore` lists `.planning` (and `.claude`, `graphify-out`), so `npx prettier --check` against any `.planning/**/*.md` path silently matches nothing and prints "All matched files use Prettier code style!" regardless of the file's actual formatting — this is a **VACUOUS** pass for every `.md` file touched in this quick (`38-VERIFICATION.md`, `38-HUMAN-UAT.md`, `40-VERIFICATION.md`, `ROADMAP.md`, all three new todos). The **REAL** check is `npx prettier --check --ignore-path /dev/null ledger-check.cjs`, which forces prettier to actually walk the `.cjs` file against the root `.prettierrc.json` (`printWidth` default 80, `semi: false`, `singleQuote: true`, `trailingComma: none`) — this passed after `--write --ignore-path /dev/null` was run once during Task 1.

## Decision: discharge 38-E02 rather than split it

See `key-decisions` in frontmatter for the full rationale. In short: `38-E02`'s own `expected:` is a two-branch disjunction ("works the same way, OR a documented, named reason it cannot"). Spike 025 answered the attach/load/cookie branch **YES**; spike 026 answered the positioning/geometry branch **NO**, with a source-confirmed, named reason (`GtkBox` packing in `tauri-runtime-wry` + wry's `is_in_fixed_parent` gate on `set_bounds`). Both branches of the disjunction are now answered, so nothing remains to *observe* — what remains is a *design decision* (which Linux layout strategy to adopt), and ROADMAP.md's own Phase 38 rules say an item blocked on something other than hardware does not belong in this ledger, because parking it there would disguise a real defect as a hardware excuse. That decision was filed as a todo instead. The suggested alternative (splitting into sub-items that stay open) was rejected because a retina/scale-factor sub-item would duplicate `38-E03`, and the segfault + `data_store_identifier` no-op are both outside `38-E02`'s own `test:` scope (they were already observed facts, not pending observations), so they became todos rather than ledger sub-items.

## The three todo paths

1. `.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md` (`severity: minor`, `platform: linux`, `ready: human`) — the Linux layout-strategy decision; gates `38-E03`/`38-E04`'s Linux branches.
2. `.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md` (`severity: minor`, `platform: linux`, `ready: human`) — the Linux cookie-isolation decision; Windows parity left explicitly UNVERIFIED.
3. `.planning/todos/pending/2026-09-28-no-gate-parses-phase-verification-frontmatter.md` (`severity: medium`, `platform: any`, `ready: code`) — the missing CI gate that let Phase 38's ledger go invalid and invisible for 5 days undetected.

## Task Commits

1. **Task 1: Tracer — repair the ledger YAML, build the harness** — `0801e07eb` (docs)
2. **Task 2: Narrow 38-E01, discharge 38-E02, re-gate 38-E03/E04 Linux branches, file Linux todos** — `63cf948e2` (docs)
3. **Task 3: Align ROADMAP.md and 38-HUMAN-UAT.md with the corrected ledger** — `746efc7cf` (docs)

## Deviations from Plan

None — plan executed exactly as written, including all negative-control checks specified in each task's `<verify>` block.

## Threat Flags

None — this quick task touched only `.planning/` documentation; `git diff --stat a8c6d289f -- src src-tauri src/backend meta package.json` is empty, confirming no application code or CI gate was touched.

## Next Phase Readiness

- Phase 38's ledger is audit-visible again and will stay checkable via `ledger-check.cjs` for any future Phase 38 quick task.
- `38-E01` is ready to close on the next Windows sitting (`.planning/spikes/027-windows-add-child-crosscheck/app/` with `SPIKE_AUTORUN=1`).
- The Linux embed cannot proceed to a shipped feature until the GtkBox-positioning todo's design decision is made — this is now a named, scheduled item rather than an invisible ledger row.
- The gate-gap todo (`ready: code`) is desk-ready for anyone who wants to extend `planning-frontmatter-gate.py`'s TARGET POLICY.

## Self-Check: PASSED

All 9 created/modified files confirmed present on disk; all 3 task commits (`0801e07eb`, `63cf948e2`, `746efc7cf`) confirmed in `git log --oneline --all`.

---
*Phase: quick-260928-raq*
*Completed: 2026-09-28*
