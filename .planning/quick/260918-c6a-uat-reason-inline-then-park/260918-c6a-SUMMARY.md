---
phase: quick-260918-c6a
plan: 01
subsystem: planning-records
tags: [audit-uat, uat.js, block-scalar, yaml, planning-gate, todo-triage]

requires: []
provides:
  - "27-UAT.md's two `reason: |` block scalars relocated to `reason: <summary>` + verbatim body prose, closing item A of the audit-uat body-block-scalar todo"
  - "the parked todo, `ready: blocked`, `severity: minor`, with an argued severity call and a named testable unpark trigger"
affects: [audit-uat, uat-visibility-gate, todo-triage]

tech-stack:
  added: []
  patterns: ["relocate a reason: | block scalar to a one-line summary plus a reason-narrative:test-N HTML-comment-delimited verbatim body extent, done by script (never retyped) and proven lossless by sha1"]

key-files:
  created: []
  modified:
    - .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md
    - .planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md

key-decisions:
  - "Item A closed by relocation, not flattening — RE-MEASURED's multi-paragraph exclusion still holds"
  - "severity: medium -> minor for the parked todo, argued against the CLAUDE.md vocabulary, losing argument recorded"
  - "ready: human -> blocked; the todo stays in pending/"
  - "getMilestonePhaseFilter breadcrumb claim corrected: appears in 5 files under .planning/, not 1"

requirements-completed: [ITEM-A, ITEM-D-PARK]

duration: 32min
completed: 2026-09-18
---

# Quick 260918-c6a: Relocate 27-UAT reason narratives, then park the audit-uat todo Summary

**Closed item A of the audit-uat body-block-scalar todo by relocating both `reason: |` narratives in `27-UAT.md` into the document body (script-moved, sha1-verified lossless), then parked the todo `ready: blocked` / `severity: minor` with item D as the sole remaining, latent, milestone-gated item.**

## Verdict branch taken

Task 1 recorded **`VERDICT: PASS`** — all three pre-edit checks passed:
1. Exactly one dedenting module in the resolved SDK (`get-shit-done-cc` v1.42.3), both dedent sites at `uat.js:81-82` target `expected:` only; no verb block-parses `reason:`; `categorizeItem` cannot read `reason` for a `pending` item (unreachable branch).
2. Re-baseline `gsd-sdk query audit-uat` deep-compared identical to the orchestrator's pre-edit capture (0 diff lines).
3. Re-baseline `uat-visibility-gate.py` printed the required `36 / 154 / 95 / 59 across 12` line, rc=0.

Task 2 (relocation) therefore ran; Task 3 parked the todo on the PASS branch (item A closed, one item — D — remains).

## The two summary sentences authored (verbatim)

- **Test 4:** "The 2026-07-22 run found the library not loading and Steam login unresponsive; the login-channel port slice that caused it has since shipped, so this test is retestable and has never been observed passing." (205 chars)
- **Test 5:** "Never run because it is downstream of test 4 and an empty library gives nothing to click; that root cause is resolved, so this becomes retestable once test 4 populates the library." (180 chars)

Neither contains `reason:`, `blocked_by:`, `reported:`, or `|` (confirmed by grep before use). The attachment lead-in was deliberately reworded to say "a block scalar on the `reason` key" rather than "a `reason: |` block scalar" — the literal phrasing in the plan's own example would have tripped Task 2's own V2 check (a second `reason:` match inside the item block) per the orchestrator's Correction 1. The `reason-narrative:test-N:start/end` HTML-comment markers were kept exactly as specified (`reason-narrative:` does not contain the substring `reason:`).

## V1-V6 (Task 2, PASS branch)

All six printed `OK`:
- **V1** (nothing lost): both pre-edit dedented block bodies hash-matched the pinned expected sha1s (`102d46d3d3b22e2a65da20e4bc3894e9354ea58a` for test 4, `07922d3434e85a9d4f6e52a6faa44fd24a9763c6` for test 5) **and** the relocated marked extents hashed identically — method: sha1 of dedented text, never a read-back comparison.
- **V2**: 7 items visible to `audit-uat`'s pattern, tests 4/5 each carry exactly one `reason:` match, zero `blocked_by:`/`reported:`, no pipe, length >= 40.
- **V3**: `audit-uat` JSON differs from baseline in exactly 2 permitted paths (`results/0/items/{0,1}/reason`, `"|"` -> sentence), 0 unpermitted diffs.
- **V4**: 8 files / 59 items / `{pending:2, human_uat:57}` / phase 34.5 still absent.
- **V5**: gate line unchanged, `36 / 154 / 95 / 59 across 12`, rc=0.
- **V6**: numstat shows exactly 1 file changed (`27-UAT.md`, +31/-21); no forbidden `34.3-*`/`34.5-*`/`34.6-*`/`uat-visibility-gate.py` path touched.

## V7-V11 (Task 3)

- **V7**: `severity=minor platform=any ready=blocked`, key order correct (severity, platform, ready adjacent).
- **V8**: park section present with all 9 required needles (heading, quick id, supersession bullet, trigger name/value, order-mattered precedent, severity argument, latency mechanism, non-conflict note); file grew; zero pre-existing body lines deleted.
- **V9**: todo remains in `pending/`; nothing landed in `completed/`.
- **V10 / V11**: see below.

## severity and ready calls, with the argument

- **`severity: minor`** (was `medium`). *For minor:* the vocabulary's "latent trap with no live consequence" fits — D's 17 fields are provably unreachable today (`getMilestonePhaseFilter` strips their phase dirs before any file opens; measured 2026-09-12 injection-probe: 23/62 phase dirs, including D's three, did not surface). *Losing argument, recorded:* D is unmeasured past the trigger, and unknown severity normally cuts upward — rebutted because the unknown is about post-trigger magnitude, not present-day existence, and re-grading after the trigger is what the unpark step is for. *Strongest objection, answered:* downgrading severity and parking in the same edit is a double visibility suppression (the exact burial pattern item 3 of the park section warns against) — answered by using the trigger + breadcrumb as the visibility mechanism instead of an inflated severity.
- **`ready: blocked`** (was `human`). Item A is no longer a human decision (it's closed); item D is correctly blocked on a milestone event, not on desk work or a live gate.

## Deviations from Plan

### Auto-fixed / corrected during execution

**1. [Correction from orchestrator, applied verbatim] Reworded the attachment lead-in to avoid the substring `reason:`.** The plan's own illustrative lead-in text ("from a `reason: |` block scalar") would have (a) violated Task 2's own constraint against adding a second `reason:`-bearing line and (b) tripped V2's `len(rs) == 1` check as a false failure. Reworded to "a block scalar on the `reason` key" instead — same meaning, no forbidden substring. The V2 check itself was left untouched, per the orchestrator's explicit instruction not to widen it.

**2. [Rule 2 — corrected a false claim rather than repeat it] The todo's own breadcrumb claim ("`getMilestonePhaseFilter` appears in this todo and in nothing else under `.planning/`") was measured FALSE.** `grep -rl 'getMilestonePhaseFilter' .planning/ | sort` returns 5 files, not 1 (STATE.md, two prior quick-task summaries, this plan file, and the todo itself). Recorded the true result in the park section's item 5 instead of perpetuating the stale claim — the breadcrumb still functions (grep still surfaces this file), it just isn't exclusive.

No architectural changes, no auth gates, no blocking issues.

## Self-Check: PASSED

- `.planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md` — FOUND, contains both `reason-narrative:test-4` and `reason-narrative:test-5` markers.
- `.planning/todos/pending/2026-09-11-audit-uat-reads-block-scalars-in-document-bodies.md` — FOUND, still in `pending/`.
- Commit hash — recorded post-commit below; verified present via `git log --oneline`.
