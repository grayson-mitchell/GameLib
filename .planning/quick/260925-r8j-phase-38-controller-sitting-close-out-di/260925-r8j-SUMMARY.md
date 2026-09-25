---
phase: quick-260925-r8j
plan: 01
subsystem: planning-ledger / gamepad
tags: [phase-38, uat-ledger, gamepad, controller-sitting, todo-triage]
requires: []
provides:
  - "38-VERIFICATION.md: eight controller items (38-C01a, 38-C01b, 38-C02, 38-C03, 38-C04a, 38-C05, 38-C06, 38-C08) discharged PASS"
  - "38-HUMAN-UAT.md: Sitting 3 session block with full artifacts"
  - "Origin-phase receipts (34.1, 34.10, 34.11, 34.13) reconciled with discharge outcomes"
  - "Two pending todos: controller-focus affordance (major), mouse-highlight-vs-DOM-focus (medium)"
affects:
  - src/frontend/helpers/gamepad.ts
tech-stack:
  added: []
  patterns:
    - "Line-scanning read/write for non-strict-YAML planning files (38-VERIFICATION.md, 34.13-UAT.md), never js-yaml"
key-files:
  created:
    - .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md
    - .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
  modified:
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
    - .planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md
    - .planning/phases/34.10-navigation-shell-horizontal-card-tabs-replace-the-sidebar/34.10-VERIFICATION.md
    - .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-VERIFICATION.md
    - .planning/phases/34.13-steam-install-time-wine-bottle-form-gog-parity/34.13-UAT.md
    - src/frontend/helpers/gamepad.ts
decisions:
  - "34.10 gets an `outcome:` field on its existing `deferred[0]` receipt rather than a new `human_verification_relocated` key — decided in-plan (`the_34_10_decision`), because the two-way relocation obligation was already satisfied by that entry and a second parallel receipt would only create drift risk."
  - "38-C03's `test:`/`expected:` text corrected at discharge to describe tab/shiftTab as rewrites inside `checkAction()`'s switch, never a physical binding — disclosed explicitly as a specification correction, not a re-score."
  - "38-C01a's cold-start clause discharged as covered by 38-C01b's shared `!el` recovery branch, explicitly NOT claimed as an independently observed d-pad event."
metrics:
  duration: "~35 minutes (five task commits, ~20:11-20:24 local time for the commit span; earlier tasks took longer per-task due to file size)"
  completed: 2026-09-25
---

# Quick 260925-r8j: Phase 38 Controller Sitting Close-Out Summary

Discharged all eight surviving Phase 38 controller items (38-C01a, 38-C01b, 38-C02, 38-C03,
38-C04a, 38-C05, 38-C06, 38-C08) as PASS from the 2026-09-25 hardware sitting, walked the receipts
back to all four origin phases, filed the two defects the sitting surfaced, and removed the
temporary `[GAMEPAD-ACT]` diagnostic probe that made the sitting machine-evidenced.

## What Was Built

**Task 1 — `38-VERIFICATION.md`.** Moved the eight entries from `human_verification` to
`human_verification_discharged` (never annotated in place, since the audit counts array
membership). Each carries a `result:` field quoting its verbatim `[GAMEPAD-ACT]` artifact and
naming its observation commit. `38-C01a` discloses the `cdf07ee95`/`959e5c01b` commit boundary
(quick `260925-pga` landed mid-sitting) and a dedicated `cold_start_clause:` field stating its
cold-start half was NOT independently observed as a d-pad event — discharged instead via
`38-C01b`'s shared `!el` recovery branch. `38-C06` discloses its clause-(3) caveat rests on log
evidence (`FilterFacetRow` entries), not operator observation, quoting the operator's own words.
`38-C03` received a specification correction to its `test:`/`expected:` text (tab/shiftTab are
rewrites, never a binding) with the correction disclosed as such, and its `sitting_1_2026_09_23`
field corrected in place rather than deleted. `status:` stayed `human_needed`;
`human_verification_retired` stayed untouched at 10 entries. `score:` and
`sweep_notes.windows_linux_dependency` updated to the new counts and history.

**Task 2 — `38-HUMAN-UAT.md`.** Appended a "Sitting 3 — 2026-09-25" section with the commit
boundary, the positive control, all eight per-item artifacts, the C01a cold-start disposition, and
the C06 caveat. Reconciled the stale `status: not_started` frontmatter and "not started" narrative
without rewriting sitting 1's frozen record — the "CONTROLLER LEG NOT RUN AT SITTING 1" paragraph
and its heading survive unchanged, with a dated forward pointer added directly beneath it, and
each disposition-list bullet got a dated resolved-outcome line appended below it.

**Task 3 — origin-phase receipts.** Added `outcome:` fields to all four origins per relocation
rule (3): 34.1's combined gamepad receipt (five survivors discharged PASS, `38-C04b` noted as
unchanged/retired, plus a correction of the inherited "depends on `buttons[4]/[5]` shoulders"
premise); 34.11's `38-C06` receipt (log-evidence caveat carried across, plus a dated correction of
the stale "measurement has still never been performed" line); 34.13's `38-C08` receipt (outcome
replaced from "open — not yet run" to the discharge result) and its body table row (`RELOCATED` →
`RELOCATED → DISCHARGED PASS 2026-09-25`), with `38-C07`'s retirement receipt left byte-identical;
and 34.10's existing `deferred[0]` entry, which got both an `outcome:` and a `receipt_key_note:`
explaining why no new `human_verification_relocated` key was created (per the plan's
`the_34_10_decision`). 34.13-UAT.md was edited as text only — zero `expected:` lines touched, no
block scalar reflowed.

**Task 4 — two pending todos**, after a duplicate check (see below). Todo A (`major`): controller
focus has no perceptible affordance across Console Mode chips, the tier-2 filter panel, and the
game-page split button — the operator drove the whole sitting by "mash down until focused
regained," and it measurably contaminated `38-C06`'s clause-(3) evidence. Notes the adjacency to
quick `260925-pga`'s unified hover/focus ring as an open question. Todo B (`medium`): a
mouse-highlighted library card does not confer real DOM focus, corroborated by two `padLeft`
presses at 18:12:16/18:12:18 both logging `tag=none` while a card appeared highlighted.

**Task 5 — `gamepad.ts`.** Removed both halves of the temporary probe: the `requestedAction`
capture (line 182, plus its separating blank line) and the eight-line comment + `try`/`catch`
emission block, restoring a single blank line between the switch's closing brace and the dispatch
chain. The permanent `[GAMEPAD] id=...` connect line and the pre-existing commented-out
`console.log` were left untouched.

## Duplicate Check (Task 4)

Grepped `.planning/todos/pending/` and `.planning/todos/completed/` for `controller focus`,
`DOM focus`, `focus affordance`, `consoleChip`, `FilterFacetRow` — no matches. Read the nearest
neighbour, `completed/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`
— confirmed it is about the SEARCH-SUGGESTION list being mouse-dead until Tab, a different
mechanism from either new finding (library-card gamepad focus visibility and mouse-vs-DOM-focus
on cards). Neither todo is a duplicate of anything on file.

## Measured Before/After (`audit-uat`)

| | Before | After |
|---|---|---|
| Phase 38 open items | 24 | **16** |
| Phase 38 discharged items | 2 | **10** |
| Phase 38 retired items | 10 | 10 (frozen) |
| Grand total open items | 49 | **41** |
| Phase 34.13 open items | 7 | 7 (unchanged) |

## Gate Battery (verbatim results)

- `npx gsd-sdk query audit-uat` → `phase38=16 phase34.13=7 total=41` — confirmed after every task.
- `pnpm planning-gates` → `13/13 planning gates passed` — confirmed after every task, including
  `[PASS] .planning\uat-visibility-gate.py`.
- `python .planning/todos/todo-frontmatter-gate.py` → `OK: 16 pending todo(s) all carry
  in-vocabulary severity, platform, ready triage keys.`
- `grep -rn "GAMEPAD-ACT" src/ meta/` → zero hits (was 5, all in `gamepad.ts`).
- `grep -c requestedAction src/frontend/helpers/gamepad.ts` → 0 (was 3).
- `pnpm codecheck` → exit 0 (tsc --noEmit clean, both projects).
- `pnpm lint` → `0 errors and 71 warnings` (pre-existing warnings, unrelated to this change) —
  `production: PASS | tests: PASS`.
- `npx jest --selectProjects Frontend --testPathPattern nintendoLayout` → `35 passed, 35 total`.
- `npx jest --selectProjects Frontend --testPathPattern gamepadRepeatTiming` → `2 passed, 2 total`.
- `npx jest --selectProjects Frontend --testPathPattern gamepadDisconnect` → `2 passed, 2 total`.
- `npx prettier --check` on every file this plan touched → `All matched files use Prettier code
  style!` in each case (the `.planning/**` checks are vacuous per `.prettierignore`; the
  `gamepad.ts` check is the one load-bearing prettier check in this plan and is clean).
- A broad `npx jest --selectProjects Frontend nintendoLayout` (mis-scoped: `nintendoLayout` etc.
  were consumed as extra project-selector args rather than a path filter, so it ran the FULL
  Frontend suite) surfaced the two pre-existing, unrelated expected-red suites recorded in the
  plan's `measured_baseline` — `labelSuiteI18nCensus.test.ts` and
  `storeEmbedSingleOpener.test.ts` — 3 failed / 3014 passed across 177 suites. Not chased, per the
  plan's explicit instruction; the properly-scoped `--testPathPattern` runs above are the ones
  that matter for this plan's own gate.

## Deviations from Plan

None — plan executed exactly as written, task order preserved, all five tasks completed
autonomously with no checkpoints hit. One clarification worth recording: the plan's Task 3 asked
to correct "sitting 1's wrong shoulder-button premise ... where it appears in this entry"
(34.1-VERIFICATION.md's gamepad receipt); on inspection, that entry's own fields (`split_reason`,
`cannot_be_discharged_at_a_keyboard`) never literally state the "depends on buttons[4]/[5]
shoulders" claim — only `38-C03`'s own `sitting_1_2026_09_23` field in `38-VERIFICATION.md` did,
and that was already corrected in Task 1. A `shoulder_premise_correction:` field was still added
to the 34.1 receipt (Rule 2 — filling in a cross-reference a future reader following the receipt
chain would otherwise be missing) recording that the literal claim lives at `38-C03`, not here,
so the correction is discoverable from either direction.

## Known Stubs

None — this plan is entirely planning-ledger reconciliation and a diagnostic-code removal; no UI
or data-flow stubs were introduced.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes at a trust
boundary were introduced. The plan's own `threat_model` register (T-r8j-01 through T-r8j-05) was
followed as written; see the plan file for the register.

## Self-Check: PASSED

- `.planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md` — FOUND
- `.planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md` — FOUND
- Commit `bba39a71a` (Task 1) — FOUND in `git log --oneline --all`
- Commit `5a0edd4a9` (Task 2) — FOUND in `git log --oneline --all`
- Commit `73d8403d9` (Task 3) — FOUND in `git log --oneline --all`
- Commit `831a5a64d` (Task 4) — FOUND in `git log --oneline --all`
- Commit `5a4dffc0e` (Task 5) — FOUND in `git log --oneline --all`
- `audit-uat` phase38=16, phase34.13=7, total=41 — CONFIRMED at time of writing
