---
quick_id: 260823-ris
slug: close-out-34-9-review-fix-in-03
date: 2026-08-23
description: "Close out 34.9-REVIEW-FIX.md — IN-03 landed on 2026-08-22 and the fix pass never followed"
type: docs
files_touched:
  - .planning/phases/34.9-macos-runner-onedir-repackaging-eliminate-the-pyinstaller-co/34.9-REVIEW-FIX.md
---

# Quick task 260823-ris — close out `34.9-REVIEW-FIX.md`

## Problem

`34.9-REVIEW-FIX.md` still reads `status: partial`, `findings_fixed: 5`, `outstanding: [IN-03]`,
and its Outstanding section states IN-03 "is not fixed; it is formally deferred as ledger item 11".

That was true when the file was written (quick task `260822-h37`, commit `00a486adf`). It stopped
being true **hours later**, in the same day's other quick task: `260822-hrf` renamed
`meta/cleanDistMac.ts` → `meta/cleanDist.ts` (`df7af9f4a`) and generalized it to a required
`--platform=` mac/win/linux argument with no silent default (`ab1ee0448`), wiring
`clean:dist-win` / `clean:dist-linux` into `dist:win`/`release:win`/`dist:linux`/`release:linux`
alongside the pre-existing mac wiring. `deferred-items.md:336` already carries the IN-03 **FIXED**
row and item 11 already carries its closure note (`deferred-items.md:363`). Only the fix-pass
sibling was left behind.

The cost is not cosmetic: `reviewStatus()` in `~/.vscode/extensions/gsd-phase-status/parse.js`
reads the fix pass's `status:` *in place of* the review's own, so `partial` paints **both**
`34.9-REVIEW.md` and `34.9-REVIEW-FIX.md` yellow in the Explorer for a finding that is closed.

This is the [[code-read-prediction-outlives-its-fix]] shape at document scale: a record that was
accurate at authoring time, outliving its own fix.

## Scope

Docs-only. **No code changes** — the code change this records already landed on 2026-08-22 and is
not re-touched here. One file is edited.

## Tasks

### Task 1 — flip the frontmatter and both IN-03 prose sites

In `.planning/phases/34.9-.../34.9-REVIEW-FIX.md`:

- Frontmatter: `status: partial` → `all_fixed` (the repo's dominant value for a fully-closed fix
  pass — 7 of 12 siblings use it; `artifactStatus()` normalises `_`→`-` and maps `all-fixed` to
  `complete`), `findings_fixed: 5` → `6`, `outstanding: [IN-03]` → `[]`, and `fixed: 2026-08-22`
  gains the second date rather than being overwritten — the five original fixes were recorded on
  2026-08-22 and IN-03's is being recorded 2026-08-23.
- Dispositions table: the IN-03 row goes `DEFERRED` → `FIXED`, evidence sourced **verbatim** from
  `deferred-items.md:336` (the ledger is the source of truth; this file quotes it, never invents).
- The `## Outstanding` section is replaced by a `## Outstanding — none` section that records what
  IN-03 was, when it closed, and — carried forward unchanged — the **UNCONFIRMED** win/linux
  caveat from item 11's closure note. The generalization closed the code-parity gap; it did not
  manufacture a live win/linux build observation this macOS arm64 machine cannot produce. A
  closure that quietly drops that caveat would be a worse defect than the stale status.
- The `## Verification` block's recorded `fix.status = partial` / `-> inprogress` transcript is
  replaced with this task's own re-run, not edited by hand.

### Task 2 — re-run all three of `260822-h37`'s gates against the edited file

The prior task proved this file three ways; a status flip invalidates all three transcripts, so
each is re-derived rather than assumed:

1. **Dispositions-match-ledger** — every ID's disposition in the fix pass equals its disposition in
   `deferred-items.md`. Must report 6/6 with IN-03 now FIXED on both sides.
2. **Honesty gate** — `status: all_fixed` is only honest if no table row is non-FIXED and
   `outstanding: []` names nothing. RED-proof required in both directions: a mutated copy with a
   non-FIXED row must be rejected, and a mutated copy with a populated `outstanding:` must be
   rejected.
3. **Badge replay** against the real extension `parse.js` — `fix.status = all_fixed` must paint
   REVIEW **and** REVIEW-FIX `complete`, with a RED-proof that the pre-edit `partial` still paints
   `inprogress` (so the gate is measuring the flip, not agreeing with everything).

Additionally: re-run `node 34.9-REVIEW-SWEEP-CHECK.cjs` from the phase directory. It must still
report `24/24 mapped, unmapped 0`, exit 0 — the edit must not perturb the phase's ID census.

## Acceptance

- [ ] `34.9-REVIEW-FIX.md` frontmatter reads `all_fixed` / 6 of 6 / `outstanding: []`
- [ ] IN-03's table row and prose both read FIXED, evidence quoted from the ledger
- [ ] The win/linux **UNCONFIRMED** caveat survives the closure verbatim in substance
- [ ] All three gates re-run green, each with an observed rejection
- [ ] `34.9-REVIEW-SWEEP-CHECK.cjs` → `24/24 mapped, unmapped 0`, exit 0
- [ ] No file outside `.planning/` is modified

## Out of scope

The other 18 open ledger items (`34.9-.../deferred-items.md`) — six routed to Phase 34.16 and
blocked on a default-branch push, items 8 and 20 genuinely unowned. Nothing here closes any of
them, and this file does not speak for them: its scope statement already says it dispositions
`34.9-REVIEW.md`'s six findings only, not the phase.
