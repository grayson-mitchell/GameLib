---
phase: quick-260925-nxt
plan: 01
subsystem: planning-ledger
tags: [uat, phase-38, gamepad, deferred-hardware]
dependency-graph:
  requires: []
  provides:
    - "38-C01a / 38-C01b (post-split d-pad / left-stick UAT items)"
    - "38-C04a / 38-C04b (post-split B/back / stick-click UAT items)"
  affects:
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md"
    - ".planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md"
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md"
tech-stack:
  added: []
  patterns:
    - "UAT item split at branch boundary (relocation rule 4), replacing the compound parent in place rather than appending"
key-files:
  created: []
  modified:
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md"
    - ".planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md"
    - ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md"
decisions:
  - "38-C04b (stick clicks) stays OPEN in human_verification rather than retired, per the user's locked decision, so the unmet expectation (no code dispatches L3/R3 to any action) stays visible to audit-uat instead of silently disappearing."
  - "Sitting 1's frozen historical records (the two sitting_1_2026_09_23 fields on 38-C03/38-C08, and the entire human_verification_retired array) were left verbatim; the new halves point back to their parent via origin_item instead."
metrics:
  duration: "~45 minutes"
  completed: 2026-09-25
---

# Quick 260925-nxt: Split compound UAT item 38-C01 and 38-C04 Summary

Split two compound Phase-38 UAT items (`38-C01`: d-pad + left stick; `38-C04`: B/back + stick
clicks) at their measured branch boundaries so the controller leg is cleanly scoreable before the
next hardware sitting, and repaired every reference the split invalidated. No application code
touched; no result recorded for any item.

## What Changed

**`38-VERIFICATION.md`** — `38-C01` was replaced in place (between `38-W06` and `38-C02`) by
`38-C01a` (d-pad) and `38-C01b` (left stick). `38-C04` was replaced in place (between `38-C03` and
`38-C05`) by `38-C04a` (B/back) and `38-C04b` (stick clicks). Each half carries the full nine-field
shape (`id`, `test`, `expected`, `why_human`, `blocked_by`, `platform_gate`, `origin_phase`,
`origin_item`, `prior_state`); `38-C04b` additionally carries `not_a_deferral_cost`, explaining why
its `blocked_by` names a feature decision rather than a switching cost. Every dangling
`— see 38-C01.` / `38-C01..CNN` cross-reference in `38-C02`, `38-C03`, `38-C05`, `38-C06` and
`38-C08` was repointed to `38-C01a` or the post-split range, and every quoted controller-item count
was corrected from seven/six to nine (eight dischargeable in one sitting). The frontmatter `score`,
`deferral_note` and `sweep_notes.windows_linux_dependency` fields were updated to match.

**`34.1-VERIFICATION.md`** — the gamepad `human_verification_relocated` receipt's `moved_as` field
was updated from `"38-C01, 38-C02, 38-C03, 38-C04 (SPLIT into four)"` to name all six post-split
IDs (`SPLIT into six`), and `split_reason` was extended with a dated 2026-09-25 note explaining why
these two of the four original boundaries were re-cut.

**`38-HUMAN-UAT.md`** — the "CONTROLLER LEG NOT RUN" paragraph and the disposition list were
rewritten to record that the blocking mapping/hat-axis/shifted-face-index defect is now fixed
(quicks `260923-qe5`, `260925-9de`, `260925-m5i`, `260925-ms5`) and that the leg is runnable — not
that any result was observed. `status: not_started` and `sessions: []` are unchanged. The `## Scope`
line naming the controller-only range was repointed from `38-C01` to `38-C01a`.

## Before/After (measured at the tool, not asserted)

| Check                       | Before        | After         |
| ---------------------------- | ------------- | -------------- |
| `audit-uat` phase 38 items   | 23            | **25**         |
| `audit-uat` total items      | 48            | **50**         |

Confirmed live with `gsd-sdk query audit-uat` after both commits landed; a flat or dropped count
would have meant the array stopped parsing or an item was silently lost.

## Array Positions

- `38-C01a`, `38-C01b` sit where `38-C01` sat: between `38-W06` and `38-C02`.
- `38-C04a`, `38-C04b` sit where `38-C04` sat: between `38-C03` and `38-C05`.
- No other entry in `human_verification` moved. `human_verification_retired` and
  `human_verification_discharged` were not touched by this plan.

## Deliberate Non-Changes

- **Frozen records left verbatim.** `38-C03`'s and `38-C08`'s `sitting_1_2026_09_23` fields still
  read `38-C01`/`38-C04` — these are historical observations attached to the pre-split ids as they
  existed at sitting time, and rewriting them would misrepresent what was actually recorded that
  day. The `human_verification_retired` array (including `38-C07`'s `platform_gate`, which reads
  "Same gate as 38-C01..C06") was likewise left untouched. Readers reach the split from these old
  records via each new half's `origin_item`, which names its parent.
- **`38-C04b` stays OPEN, not retired.** Per the user's locked decision, the stick-click half is
  kept visible in `human_verification` as an unmet expectation — no layout in this repo dispatches
  `buttons[10]`/`buttons[11]` to any action, on any mapping (standing source finding:
  `.planning/todos/pending/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md`) — rather than
  dropped out of `audit-uat`'s view the way a retirement would. Its `blocked_by` names a feature
  decision, which is why `deferral_note` was amended to name it (alongside the pre-existing
  `38-E01`/`38-E02`) as one of the three values that state a gap rather than a cost.

## Deviations from Plan

### Operational hazard — concurrent commit interleaving (not a Rule 1-4 deviation, recorded for transparency)

While Task 1 was staged but not yet committed, a different concurrently-running agent (quick task
`260925-o9b`, operating in the same non-worktree checkout) ran its own `git commit`, which swept my
staged `38-VERIFICATION.md` changes into its unrelated commit `a6a0c301f` ("close report-upstream
todo as obsolete"). That agent subsequently rewrote its own history (visible as `356cfd73e` /
`4874a5018` replacing `a6a0c301f` in the log), which reverted `38-VERIFICATION.md` back to its
pre-split content and left my edits sitting unstaged in the working tree again. I re-verified the
working-tree content was still exactly my intended edit (diffed identically to what had briefly
been committed), re-ran every automated `<verify>` block, then re-staged and committed
`38-VERIFICATION.md` (`545b29283`) and the Task 2 files (`6a8e838bb`) under this plan's own
attribution, checking `git status` immediately before each `git add`/`git commit` pair to keep the
two tasks' changes from being interleaved again. No content was lost or duplicated; final `git log`
shows both commits cleanly attributed to this quick task, and the final `git status --porcelain`
shows no residual diff in the three target files.

### Auto-fixed Issues

None — plan executed exactly as written; no bugs, missing functionality, or blocking issues
required a Rule 1-3 fix.

## Self-Check: PASSED

- FOUND: `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md`
- FOUND: `.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md`
- FOUND: `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md`
- FOUND commit `545b29283` (Task 1: split 38-C01/38-C04, repoint cross-references)
- FOUND commit `6a8e838bb` (Task 2: 34.1 receipt + 38-HUMAN-UAT.md narrative)
