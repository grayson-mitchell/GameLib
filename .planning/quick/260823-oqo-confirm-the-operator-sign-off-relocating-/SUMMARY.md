---
quick_id: 260823-oqo
slug: confirm-the-operator-sign-off-relocating-
description: Confirm the operator sign-off relocating D-29-08 (Epic logout's clearEpicCookies) to Phase 34.6, and unseal the todo's self-sealing blocked_by
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Summary — D-29-08 belongs to Phase 34.6, confirmed

Operator signed off 2026-08-23: *"yes move to 34.6"*. Commit `205ac34e0`, 5 files.

## What actually needed doing

`ROADMAP.md:2743` already read unconditionally ("ADDED 2026-08-23", no hedge, discharge condition
spelled out). **Every other document lagged behind it** — five of them still said "proposed" or
"pending operator sign-off". That is the wrong way round: the roadmap was ahead of the status docs.

| site | treatment |
|---|---|
| todo frontmatter `resolves_phase` + `blocked_by` + `## Proposed owner` | amended in place |
| `deferred-items.md:645` and its disposition row `:667` | amended in place |
| `34.4.1-VERIFICATION.md:90` note | amended in place |
| `34.4.1-34-SUMMARY.md:30`, `34.4.1-35-SUMMARY.md:101` | **original preserved + dated amendment** |

The two SUMMARIES record what was true when those plans ran, so their sentences stay and each gains
a dated `> **AMENDED 2026-08-23**` block. `ROADMAP.md:1850` untouched for the same reason.

## `resolves_phase: 34.6` — set, with the counter-risk named in the same breath

Setting it is right; an absent `resolves_phase` makes todo auto-close miss everything, a lesson
relearned three times here. **But 34.6 closing does not discharge this item.** The discharge
condition is a *live observation* — an authenticated Epic session, a UI-driven logout, and a
`clearEpicCookies` count cross-checked against an independent re-read of the jar. If 34.6 closes
without it, auto-close silently closes something nobody exercised: the "a pass can cover a surface
that was never exercised" shape this phase family keeps producing.

The todo now says so explicitly, addressed to whoever plans 34.6 — with the note that the 34.7
inheritance already failed to cover logout once, so this needs to be an explicit blocking gate item,
not an inherited line.

## The defect found while in the file: a self-sealing `blocked_by`

It read *"no authenticated Epic session has been available on any gate run to date"* — a statement
about **past gate runs** that reads as a present-tense blocker. As written it made the todo
**permanently un-actionable**: nobody goes and obtains an Epic session while the item announces
itself as blocked on having one. A blocker describing its own symptom.

Embedded Epic login works (restored 2026-08-22 — the reason 34.7 went ON HOLD), so a session is
obtainable. Rewritten to say obtaining one is 34.6's job, a prerequisite of the gate rather than a
blocker on it.

## Verification

**Grep proved in both directions**, which is the only reason it means anything: **6 hits across 5
files before**, **2 after** — the two preserved historical sentences. Running it only afterwards
would have proved nothing.

Worth noting for the next task that uses this pattern: the raw after-grep returned **10**, because
this task's own PLAN.md quotes all four search strings while documenting the sites it fixes. **A
planning doc that names its own grep pattern pollutes that grep.** Excluding the task directory
gives the real answer, 2.

`34.4.1-VERIFICATION.md` re-checked through its **real consumer** rather than a YAML library
(pyyaml is not installed): `gsd-sdk query audit-uat` parses it, the phase is still visible, and the
`human_verification:` entry count is **16 before and 16 after** — the edit changed prose inside one
entry and nothing structural. The `3` open items it reports predates this task (D-29-05 moved to
Phase 38 earlier today).

## Status of the item itself

**Still OPEN and UNOBSERVED.** Confirming an owner is not observing a logout. No document may call
Epic's logout verified until the live discharge is actually run — the structural argument (it calls
the same Rust arm Humble's disconnect proved fixed) is an inference from shared code, and that exact
distinction is what let gate run 2's failure hide behind a fully green suite.

## Out of scope, as planned

Phase 34.6 not planned (folder empty, `Requirements: TBD`). No attempt to observe the Epic logout.
No source changes.
