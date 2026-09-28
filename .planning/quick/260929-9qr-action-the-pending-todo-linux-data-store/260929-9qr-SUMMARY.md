---
phase: quick-260929-9qr
plan: 01
subsystem: planning-docs
tags: [linux, steam-embed, deferred-hardware, phase-38, todo-triage]
status: complete
dependency_graph:
  requires:
    - .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  provides:
    - "isolation todo `## Decision (2026-09-29)` section: shared cookie jar accepted on Linux"
    - "38-E03/38-E04 `linux_isolation_decided_2026_09_29` fields"
    - "positioning todo `## Addendum (2026-09-29)`"
  affects:
    - future Linux store-embed build work (must not rely on data_store_identifier for isolation)
tech_stack:
  added: []
  patterns:
    - "quick-task checker harness pinned to a single PRE_EDIT_BASE SHA (never HEAD~N), per sibling quick 260928-upj/raq precedent"
key_files:
  created:
    - .planning/quick/260929-9qr-action-the-pending-todo-linux-data-store/9qr-check.py
  modified:
    - .planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/STATE.md
decisions:
  - "Accept one shared cookie jar on Linux; document the hygiene cost as an accepted, documented limitation rather than a blocker (operator decision, 2026-09-29)."
  - "Isolation todo stays in pending/ (not completed/): the Windows question (## Windows: UNVERIFIED) is still open, and 38-E01/38-E03/38-E04 route to it by its pending/ path."
metrics:
  duration: "~55 minutes"
  completed: 2026-09-29
actuals:
  tokens: 22329
  tasks: 3
  commits: 1
  plan_head_before: 54a931199256acbed18d84759d2586168405e870
---

# Quick Task 260929-9qr: Action the pending todo — Linux data-store identifier Summary

Recorded the operator's LOCKED decision on the Linux isolation todo: accept one shared cookie
jar on Linux and document the hygiene cost, rather than fork `tauri-runtime-wry` or keep Linux
off the embed. Closed the Linux isolation question as a documented, accepted limitation and
carried the consequences into the sibling positioning todo and the Linux `blocked_by` clauses of
Phase 38 ledger items `38-E03`/`38-E04`, without discharging either item or moving any file.

## What changed

**Isolation todo** (`.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`):
- `platform: linux` -> `platform: windows`, `ready: human` -> `ready: live-gate`. `severity: minor`
  and everything else in the frontmatter unchanged.
- Everything above the new section — including `## The decision` (kept as history) and the whole
  `## Windows: UNVERIFIED` section — is byte-identical to the pre-edit file (proven by checker T2).
- Appended `## Decision (2026-09-29): accept one shared cookie jar on Linux`, stating who decided,
  what was decided, the hygiene cost, what this does not cost against today (the shipped macOS
  embed's own parity), why not the two rejected options, that Windows is NOT decided here, why
  `platform: windows`/`ready: live-gate`, and why the file stays in `pending/`.
- Stays in `pending/`. The operator's option text said "close this todo", but the Windows question
  (`## Windows: UNVERIFIED`) is still open, and `38-E01`'s `spike_evidence_2026_09_28` plus
  `38-E03`/`38-E04`'s `blocked_by` route to it by its exact `pending/` path — moving it now would
  orphan all three citations and hide the still-open Windows question.

**Positioning todo** (`.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`):
- Appended `## Addendum (2026-09-29): the isolation todo is decided, one shared cookie jar`.
  Everything above it, frontmatter (`ready: code`) included, is unchanged.
- States the sibling isolation todo is now DECIDED, that this resolves the tension the todo's own
  `260928-upj` decision section flagged (in favour of shipping, since keeping Linux off the embed
  was not chosen), and records a constraint for whoever builds the GTK-box-native layout: build
  against one shared cookie jar, and do not describe the Linux embed as per-store isolated.

**Phase 38 ledger** (`.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`):
- `38-E03` and `38-E04` each gained a `linux_isolation_decided_2026_09_29` field, inserted
  immediately after their existing `linux_rescoped_2026_09_28` field, quoting the pre-change
  `blocked_by` value verbatim and stating this is **NOT a discharge** — nothing was built, run or
  observed.
- In each item's `blocked_by`, exactly the isolation-todo clause/sentence was replaced (single-clause
  substitution, proven by checker L8): `38-E03`'s "which by its own title gates whether a Linux
  embed ships at all" and `38-E04`'s trailing "It is also blocked on ..., before any Linux embed
  ships." Everything else in each value — including the positioning-todo reference, `option (a)`,
  and branch (c)'s remaining "unbuilt GTK-box-native layout" gate — is unchanged (checker L9).
- `deferral_note` amended append-only: one new `AMENDED AGAIN 2026-09-29 (quick \`260929-9qr\`)`
  sentence appended before the closing single quote; every existing character kept.
- Neither item discharged, no count moved: `human_verification` still holds 10 items in the same
  order (checker L3/L4), `38-E01`'s routing field and both dated `linux_rescoped_2026_09_28`
  snapshot fields are untouched (checker L4, L5-other-fields).
- Ledger grew by exactly **+2 physical lines** (461 -> 463 via `wc -l`), both new lines sitting
  below the plan's cited line 104 — the frontmatter closing fence moved 433 -> 435. This does not
  disturb in-flight quick `260928-tvk`'s cited ranges (1-12, 36-47), whose own edits are still
  pending in that branch's working tree; `398-431` shifts by +2 along with everything else below
  line 104, exactly as the plan anticipated.

**STATE.md** (left uncommitted, for the orchestrator's Step 8):
- Rotated `Last activity` (2026-09-28/`260928-tjj` demoted to the first `Previous activity`
  line, text kept verbatim under the renamed prefix) and inserted a new `Last activity:
  2026-09-29 -- Completed quick task 260929-9qr: ...` narrative line above it.
- Appended one row to `### Quick Tasks Completed`, directly after the `260928-upj` row and before
  the blank line + `## Deferred Items`.
- **Edited with the Edit tool only** — no `gsd-sdk`/`gsd_run query state.*` verb was used, per the
  plan's Task 3 instruction (a standing defect in those verbs has corrupted this file's narrative
  before). The S5 reconstruction check in `9qr-check.py` proves nothing else in the file moved.
- **Step 7 coordination note:** STATE.md's `260929-9qr` row and rotated `Last activity` line are
  already written by this executor. The orchestrator's Step 7/Step 8 must verify and commit
  STATE.md as-is, not append a second row or rewrite `Last activity` again.

## Deviations from Plan

None — plan executed exactly as written. All must-haves and artifacts match the plan's
specification; no Rule 1-4 auto-fixes were needed.

## Negative controls (both required by the plan, both recorded)

**Before any edit** (`9qr-check.py --items 38-E03`), exit 1, 10 FAILs:
```
FAIL T1-frontmatter-fields: consecutive=False counts={'severity: minor': 1, 'platform: windows': 0, 'ready: live-gate': 0}
FAIL T2-prefix-byte-identical: diverges at offset 375
FAIL T3-suffix-heading: undecidable: T2 failed
FAIL T4-suffix-literals: undecidable: T2 failed
FAIL L5-keyset-38-E03: (missing linux_isolation_decided_2026_09_29)
FAIL L6-newfield-content-38-E03: missing required literal(s), or base blocked_by not quoted verbatim
FAIL L7-newfield-position-38-E03: found 0 matches at 4-space indent
FAIL L8-clause-substitution-38-E03: middle_ok=False middle='which by its own title gates whether a Linux embed ships at all'
FAIL L9-blocked-by-content-38-E03: neg_hits=['gates whether a linux embed ships']
FAIL L11-line-count-delta: base=461 live=461 delta=0 expected=1
```
(All other checks — T5, T6, P1, L1-L4, L10 — PASSED, as expected against an unedited tree.) This
covers the plan's required minimum (T1, T3, T4, L5, L6, L11) plus four more the checker also
proved RED (T2, L7, L8, L9).

**Before the STATE.md edit** (`9qr-check.py --deferral-note --positioning --state`, after the
Task 2 commit), exit 1, 5 FAILs, all in the STATE half:
```
FAIL S1-row-appears-once: base_row_count=0 live_row_count=0
FAIL S2-row-content: undecidable: S1 row not found
FAIL S3-row-followed-by-blank-and-header: undecidable: S1 row not found
FAIL S4-last-activity-rotated: count=1 idxs=[75]
FAIL S5-reconstruction-matches-base: undecidable: S1 or S4 prerequisite failed
```
Every non-S check (T1-T6, P1, L1-L11) PASSED at this point, confirming the Task 2 commit was
already fully correct before STATE.md was touched.

## Final verification (all green)

**Checker**, full run (`--deferral-note --positioning --state`), post-STATE-edit: 33/33 PASS —
T1-T6, P1 (x3), L1-L11 (with both `38-E03` and `38-E04`), S1-S5.

**`ledger-check.cjs`**:
```
PASS js-yaml-version: 4.1.1
PASS frontmatter-parse
PASS status
PASS open-length: 10
PASS discharged-length: 16
PASS retired-length: 10
PASS unique-ids
PASS gsd-core-status
PASS gsd-core-item-count: 10
PASS audit-uat-by-phase-38: 10
PASS audit-uat-parse-gap-files: 0
PASS audit-uat-total-items: 429
PASS includes:open:38-E03:linux_isolation_decided_2026_09_29
PASS includes:open:38-E04:linux_isolation_decided_2026_09_29
PASS includes:open:38-E04:blocked_by
PASS includes:top:deferral_note
PASS no-stale-premise
```
Counts unchanged from the pre-edit ledger (10 open / 16 discharged / 10 retired), `audit-uat
by_phase['38']` still 10, `parse_gap_files` 0, total items 429 — matching the plan's
`planning_observations` measurement exactly.

**`todo-frontmatter-gate.py`**: exit 0, "OK: 16 pending todo(s) all carry in-vocabulary severity,
platform, ready triage keys" (all 15 self-tests pass).

**`pnpm planning-gates`**: 12/12 passed.

**Prettier ignored-status probe** (run instead of `--check`, per CLAUDE.md's formatter-check
convention — these paths are in `.prettierignore` and a `--check` would be vacuous):
```
.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md          -> { "ignored": true, "inferredParser": null }
.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md    -> { "ignored": true, "inferredParser": null }
.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md -> { "ignored": true, "inferredParser": null }
.planning/STATE.md                                                                                  -> { "ignored": true, "inferredParser": null }
```

**Post-commit path/commit assertions**: exactly one commit (`1f2d7b42e`) landed between the pinned
base `54a931199` and `HEAD`, subject `docs(quick-260929-9qr): record shared-jar decision,
re-scope 38-E03/38-E04 Linux isolation gates`, touching exactly the two todos, the ledger and
`9qr-check.py` — nothing under `src/`, `src-tauri/`, `meta/` or `package.json` changed.

## Files deliberately NOT edited (and why)

- **ROADMAP.md's dated "as of 2026-09-28" paragraph** (Phase 38 section, ~line 4648) and its
  **Phase 40 "Spike 018 — one default cookie jar per PROCESS" bullet** (~line 4930): both are
  historical/dated record of prior quick tasks (`260928-raq`, and the original spike-018 finding).
  This task cites the spike-018 bullet by its text in the new Decision section, but does not amend
  either — ROADMAP.md's own convention is that these dated paragraphs are historical, and the
  ledger's `score:` field (unchanged by this task) is the current-state source of truth per that
  paragraph's own first sentence.
- **`38-HUMAN-UAT.md`**: exists for Phase 38 but has no content referencing the isolation todo or
  either `blocked_by` clause; out of scope for a decision-recording task touching only the ledger's
  `human_verification` frontmatter array.
- **`.planning/spikes/MANIFEST.md` Idea C**: the source evidence the isolation todo's own
  "What it contradicts" section already cites; unaffected by accepting the shared-jar limitation
  (the spike's finding about macOS isolation working is unchanged, only the Linux disposition is
  decided).
- **`38-E01`'s routing field** (`spike_evidence_2026_09_28`): still correctly routes the spike 027
  Windows isolation result to the isolation todo by its unchanged `pending/` path — the todo
  staying in `pending/` is exactly what keeps this citation valid. Proven unchanged by checker L4.
- **The dated `linux_rescoped_2026_09_28` fields** on `38-E03`/`38-E04`: deliberate snapshots of
  the 2026-09-28 positioning decision, explicitly not superseded by editing (only referenced as
  "unchanged" from the new `linux_isolation_decided_2026_09_29` field's own text). Proven unchanged
  by checker L5-other-fields.
- **upj's `## Decision (2026-09-28)` section** on the positioning todo: kept byte-identical as
  history; this task's addendum explicitly supersedes only its "sibling isolation todo is NOT
  decided here" bullet, via the new `## Addendum (2026-09-29)` section, not by editing the original
  text. Proven unchanged (byte-for-byte prefix) by checker P1-positioning-prefix.

## Flagged for the operator

The option text said to close this todo, but **the file stays in `pending/`**, not
`.planning/todos/completed/`. Only the *Linux* half of the isolation question is decided; the
file's own `## Windows: UNVERIFIED` section is a separate, still-open question, and `38-E01`'s
`spike_evidence_2026_09_28` plus `38-E03`/`38-E04`'s `blocked_by` all route to this exact filename
by its `pending/` path to receive that Windows result when the sitting runs. If the operator wants
the file itself closed now regardless, the Windows question needs a new home first (a fresh todo,
or folding it directly into `38-E01`), and all three of those citations — `38-E01`,
`38-E03`, `38-E04` — would need to be re-pointed to the new location in the same change.

## Self-Check: PASSED

- `.planning/quick/260929-9qr-action-the-pending-todo-linux-data-store/9qr-check.py`: FOUND
- `.planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md`: FOUND, contains `## Decision (2026-09-29)`
- `.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`: FOUND, contains `## Addendum (2026-09-29)`
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`: FOUND, contains `linux_isolation_decided_2026_09_29` (both items)
- Commit `1f2d7b42e`: FOUND in `git log --oneline --all`
- `.planning/STATE.md`: modified, unstaged, uncommitted (confirmed via `git status --porcelain`)
