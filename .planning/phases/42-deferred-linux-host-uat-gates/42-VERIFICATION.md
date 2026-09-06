---
phase: 42-deferred-linux-host-uat-gates
verified: null
status: human_needed
score: N/A — collection phase, no must-haves. 0 items as of 2026-09-06 (file just created by plan 38-01, Task 1; items land in Task 2 of the same plan).
audit_tool_note: >
  `status` MUST stay `human_needed`. `gsd-sdk query audit-uat` admits a VERIFICATION.md when
  status is `human_needed` OR `gaps_found`, but `parseVerificationItems` only emits items when
  status === 'human_needed' — so `gaps_found` is admitted and then always yields ZERO items, and
  the phase disappears from the audit entirely. Verified live on Phase 34.1 (2026-08-13):
  switching that field dropped it from 10 open items to 0. The tool also counts EVERY entry in
  `human_verification` regardless of any `result:` field, so a discharged item must be MOVED to
  `human_verification_discharged` rather than annotated in place. Both failure modes are silent.

  THE `id:` FIELD DOES NOT SURVIVE INTO THE AUDIT OUTPUT. `audit-uat` emits each item with a
  POSITIONAL integer as `test:` and the `test:` prose as `name`; the `id:` is dropped entirely, so
  there is no key to join the audit back to this file except the prose. Positions do not track
  ids, because this array is in ARRIVAL order, not id order. CROSS-REFERENCE BY THE `test:`
  PROSE, NEVER BY POSITION, and never quote an audit position as if it were an ID.

  THIRD FAILURE MODE — THE PHANTOM-ITEM HAZARD (recorded in STATE.md under quick `260823-pzq`):
  with `status: human_needed` and an EMPTY `human_verification` array, `parseVerificationItems`
  falls through to a BODY SCRAPE looking for a `## human_verification` heading and reports that
  section's table rows as PHANTOM items. A phase enters the report only when `items.length > 0`.
  This file therefore carries NO `## human_verification` (or `## Human Verification`) heading
  anywhere in its prose body, by construction, so it stays correctly invisible to the audit until
  items are populated — that is the intended intermediate state while `human_verification: []`,
  not a defect.
purpose: >
  A collection phase. Every item here was relocated from Phase 38 (or, for `38-S17`, minted by a
  split of `38-S16`) because it can only be observed on a Linux host — Phase 38 narrowed on
  2026-09-06 (plan `38-01`) to Windows-plus-controller items only, per relocation rule (1): the
  destination must exist in ROADMAP.md BEFORE anything is relocated into it. Phase 34.9 routed 8
  items to a phase that was never in ROADMAP.md and six of them dangled 9-11 days while every
  gate read `unmapped 0` — this phase exists before Task 2 of plan 38-01 relocates anything into
  it, so that never happens again. Ships no code.

  THE HARDWARE IS OWNED AND AVAILABLE. A Linux machine is on hand; the only cost is the machine
  switch, not an acquisition.
deferral_note: >
  The `blocked_by:` KEY NAME IS HISTORICAL, inherited from `38-VERIFICATION.md`. Its values name
  the COST of running an item (a machine switch, or a machine switch plus a second-Steam-library
  setup step), never an unfalsifiable "needs hardware this project doesn't have" claim. Read
  `blocked_by` as "deferral cost", not as "blocker".
created: 2026-09-06
relocation_rules: >
  Inherited in substance from `38-VERIFICATION.md`, which minted them:
  (1) The destination must exist in ROADMAP.md BEFORE an item is relocated into it — Phase 34.9
  routed 8 items to a phase that never existed and every gate read green.
  (2) Every item names a `platform_gate` as a source-level expression, never a prose blocker.
  (3) Relocation is two-way: the origin phase keeps a `human_verification_relocated` receipt
  naming this phase and the item ID, and every item here names its origin.
  (4) Items are split at their branch boundary, never compounded. A compound item resolves to a
  single pass/fail and the un-run half disappears.

human_verification: []

human_verification_discharged: []
---

# Phase 42 — Deferred Linux-host UAT gates

This phase holds UAT items that can only be observed on a Linux host. It ships no code.

**The frontmatter above is the source of truth**, because it is what `gsd-sdk query audit-uat`
reads. This prose section is for narrative only; never record a result here alone.

## How to close an item

1. Run it and record the observation with a verbatim artifact — a log line, not a recollection.
   Prefer instrumenting the branch under test and reading the emitted value over asking an
   operator what they saw.
2. **Prove the branch was armed** before recording a pass. An item whose gate never executed is
   indistinguishable, in every green result, from one that passed.
3. Move the entry from `human_verification` to `human_verification_discharged`. Do not annotate
   it in place — the audit counts array membership and ignores any `result:` field.
4. Update the origin phase's `human_verification_relocated` receipt with the outcome, so the
   origin's record does not rot. A park is a promise with no receipt unless someone walks back.

## Adding to this phase

Append to `human_verification` with an `id`, an `origin_phase`, an `origin_item`, and a
`platform_gate` written as a source-level expression. Leave the matching
`human_verification_relocated` receipt in the origin phase in the same change — one-way
relocation is how items get orphaned.
