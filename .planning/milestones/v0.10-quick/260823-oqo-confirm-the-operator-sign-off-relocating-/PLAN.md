---
quick_id: 260823-oqo
slug: confirm-the-operator-sign-off-relocating-
description: Confirm the operator sign-off relocating D-29-08 (Epic logout's clearEpicCookies) to Phase 34.6, and unseal the todo's self-sealing blocked_by
created: 2026-08-23
status: complete
---

# Quick Task 260823-oqo — D-29-08's owner is confirmed, not proposed

Operator signed off 2026-08-23: *"yes move to 34.6"*. Docs-only. **No source changes, no phase
planning, no attempt to discharge the item.**

## Already done — do not redo

Phase 34.4.1 gap cycle 3 plan 34 established the orphaning with dates (34.5 disclaims it at
`34.5-26-SUMMARY.md:316`; 34.6 inherited only the Epic *login* and `egsSync` legs; 34.7 is ON HOLD;
`clearEpicCookies` appears in no phase folder but 34.4.1's own), filed the todo, and wrote the item
into ROADMAP's Phase 34.6 scope block at `ROADMAP.md:2743` — **unconditionally**, no "proposed"
hedge, discharge condition spelled out.

**ROADMAP needs no edit.** It is the one document already reading as confirmed; everything else
lags behind it. `ROADMAP.md:1850` is also untouched — it describes what plan 34 did, and is history.

## The six sites — two classes, handled differently

**Live status docs — amend in place** (they describe the present):

1. `.planning/todos/pending/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md` —
   frontmatter `resolves_phase: null`, and `## Proposed owner` at line 59.
2. `.../34.4.1/deferred-items.md:645` — "**Proposed owner: 34.6**".
3. `.../34.4.1/deferred-items.md:667` — disposition row `| D-29-08 | ORPHANED, now tracked | plan 34
   → todo, proposed 34.6 | todo file above |`.
4. `.../34.4.1-VERIFICATION.md:90` — "PENDING OPERATOR SIGN-OFF -- the owner was proposed by plan
   34, not confirmed by a human." The enclosing `human_verification:` entry's `moved_to: "Phase
   34.6"` is already correct; **only the note's last sentence is stale**.

**Historical SUMMARIES — do NOT rewrite, APPEND a dated amendment**:

5. `.../34.4.1-34-SUMMARY.md:30` — "**Proposed owner 34.6**".
6. `.../34.4.1-35-SUMMARY.md:101` — "*pending operator sign-off*, proposed by plan 34, not confirmed
   by a human."

These record what was true when written. The standing rule is to amend in place with a date, not to
rewrite the sentence out of existence.

## T1 — set `resolves_phase: 34.6`, and name the counter-risk in the same breath

Setting it is right: a recorded lesson (3 recurrences) is that an absent `resolves_phase:` makes
todo auto-close miss everything.

**But 34.6 closing does not by itself discharge this item.** The discharge condition is a *live
observation* — an authenticated Epic session, a logout driven through the UI, and a
`clearEpicCookies` count cross-checked against an independent re-read of the jar. If 34.6 closes
without that, auto-close silently closes an undischarged item: exactly the "a pass can cover a
surface that was never exercised" shape this phase family keeps producing. **One sentence in the
todo body naming that risk**, so whoever plans 34.6 sees it before it bites.

## T2 — the `blocked_by` is self-sealing, and that is a real defect

It reads `blocked_by: "no authenticated Epic session has been available on any gate run to date"`.

That is a statement about **past gate runs**, not about feasibility — and as written it makes the
todo permanently un-actionable. Nothing will ever change it, because nobody will go obtain an Epic
session while the item reads as *blocked on having one*. It is a blocker that describes its own
symptom.

Embedded Epic login **works** (restored 2026-08-22 — that is why 34.7 went ON HOLD), so a session is
obtainable. Rewrite it to say what is actually required: 34.6 must **obtain** an authenticated Epic
session as part of its live gate. A prerequisite of the gate, not an external blocker.

Related recorded lesson: `blocked_by` / `parked_to_phase` records rot silently; diff the dates.

## Out of scope

Do **not** plan Phase 34.6 (folder empty, `Requirements: TBD — mint at /gsd-plan-phase 34.6`). Do
**not** attempt to observe the Epic logout.

## Verification — grep proved in BOTH directions

Baseline recorded **before** any edit: `grep -rn "proposed 34.6\|Proposed owner\|PENDING OPERATOR
SIGN-OFF\|pending operator sign-off" .planning/` → **6 hits across 5 files**. After the edits it must
return **exactly 2** — the two historical SUMMARY lines, whose original sentences are preserved by
design. Running the grep only afterwards would prove nothing: an assertion proved in one direction
is a recorded repo failure (6 recurrences).

## Commit discipline

Two unrelated renames are staged ("steam-library-22-games" × 2) and have survived 20 commits today —
every commit uses `git commit --only <paths>`; verify `git diff --cached --name-status | grep -c
"^R"` still returns 2. Never `git stash` / `git reset` / `git stash pop`. No `gsd-sdk state.*` verbs;
hand-apply the STATE.md row and assert one hunk, +1/-0.

Learned today and relevant if anything needs untracking: `git commit --only` **re-reads the working
tree** for the named paths and therefore silently defeats a staged `git rm --cached` — the tell is
`Bin N -> M bytes` in the stat where a removal reads `delete mode`.
