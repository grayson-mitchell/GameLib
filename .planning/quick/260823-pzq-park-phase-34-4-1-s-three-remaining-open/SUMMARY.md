---
quick_id: 260823-pzq
slug: park-phase-34-4-1-s-three-remaining-open
description: Park 34.4.1's three remaining live-only items without re-creating the invisibility this phase's VERIFICATION.md exists to prevent
created: 2026-08-23
completed: 2026-08-23
status: complete
---

# Summary — 34.4.1's three residuals are parked

Commit `14666b800`, 6 files. `audit-uat` now reports **zero** for 34.4.1.

## The hard part was not the parking

`34.4.1-VERIFICATION.md`'s own `audit_tool_note` documents three silent `audit-uat` failure modes,
and the mechanism is confirmed in `sdk/dist/query/uat.js`: items are emitted **only** when
`status === 'human_needed'`; with an empty `human_verification` the parser **falls through to a body
scrape** for a `## human_verification` heading and reports table rows as **phantom** items; and a
phase enters the report only when `items.length > 0`.

So the naive park — empty the array, leave the status — yields **either phantoms or a phase that
silently vanishes from every cross-phase sweep**. The second is *exactly* the 23-day invisibility
this file was written to end. The `status: human_needed → passed` flip in the same edit is what
makes the exclusion deliberate and legible.

## Design

Moved to a new **`human_verification_parked:`** key — which turned out to follow a convention the
file had already established with `human_verification_relocated:`, whose own comment gives the same
reason: *"a distinct key is used so a future reader cannot mistake 'relocated' for 'passed'"*. Not
`human_verification_resolved:`; they are not resolved, and mislabelling them is a lie that outlives
this session.

**Visibility survives via todos, not via that file.** Two new (GAP-11, D-29-02); the pre-existing
F-9 todo **amended, not duplicated**. Each carries a **concrete revisit trigger rather than an
owner** — parking is not assignment, and the operator assigned nothing:

| item | revisit trigger |
|---|---|
| `REQ-34.4.1-GAP-11` | the next live login gate anyone runs (34.6 runs one) — cheap to fold in, not a commitment |
| `D-29-02` | a user-visible symptom appears; non-blocking by construction, so absent one there is nothing to chase |
| `D-29-06`/F-9 | the timeout recurs with a cookie operation in the same window |

**No self-sealing `blocked_by`** — the defect fixed on the Epic todo earlier today. F-9's had that
shape (*"id=1575 carries no channel name…"* read as a present-tense blocker) and was rewritten to
say **unscheduled, not blocked**, keeping the id caveat as a *method* note.

## Verification — the zero had to be proven non-vacuous

| | before | after |
|---|---|---|
| 34.4.1 items | **3** | **0**, phase absent, **no phantoms** |
| other six phases | 27:2, 30:2, 32:2, 33:3, 34:2, 38:8 = **19** | **19, unchanged** |
| totals | 7 files / 22 items | 6 files / 19 items |

**A zero for 34.4.1 proves nothing on its own** — it is equally consistent with the query breaking.
The other six phases still reporting all 19 is what distinguishes "deliberately excluded" from
"broken", and the totals reconcile exactly: −3 items, −1 file. Also confirmed the file carries **no**
`## Human Verification` body heading the fallback could latch onto if someone later flips `status`
back.

## Two errors caught mid-task, both by assertions rather than by luck

1. **My region bounds were wrong.** The span I chose ran from the `# OPEN` banner to the `# RESOLVED`
   banner and therefore swallowed `human_verification_relocated:` as well — 5 entries where I
   asserted 3. The `assert` aborted before any write and the file was verified untouched. Re-bounded
   to the `# RELOCATED` banner.
2. **A verification grep was itself broken.** `grep -rlE "D-29-02\|user/info"` returned 0 because
   `\|` inside `-E` is a *literal* pipe, not alternation — it looked like a missing todo. Redone
   unescaped, **with a negative control** (`ZZ-NOT-A-REAL-ITEM` → 0) proving the grep discriminates.

Also: I predicted `grep -rl "34\.4\.1" .planning/todos/pending/` would return **3** and it returned
**4** — the Epic-logout todo also names 34.4.1 as its source, so the "2" baseline was F-9 *plus*
Epic. **The count was the wrong instrument**; verifying each parked item has a todo *by identity* is
the right one, and that is what was done.

## Also corrected

`ROADMAP.md`'s 34.4.1 block said *"That decision is not yet made and is deliberately not recorded
here"* — false as of this commit; replaced with the park, its date, its triggers and the three todo
paths (checked with a positive control so the grep couldn't pass by finding nothing).
`VERIFICATION.md`'s `score:` and `# OPEN` banner corrected. `deferred-items.md` rows for D-29-02 and
D-29-06 marked PARKED.

## Not done, deliberately

The phase is **not** reopened or re-closed — it closed 2026-07-31 on run 3, and parking residuals
does not change that. No gate run. The Epic-logout todo (owned by 34.6) untouched. Historical
SUMMARIES and `LIVE-GATE-RERUN-4.md` untouched. `pnpm planning-gates` 7/7.
