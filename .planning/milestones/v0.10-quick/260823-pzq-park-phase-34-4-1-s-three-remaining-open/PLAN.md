---
quick_id: 260823-pzq
slug: park-phase-34-4-1-s-three-remaining-open
description: Park 34.4.1's three remaining live-only items without re-creating the invisibility this phase's VERIFICATION.md exists to prevent
created: 2026-08-23
status: complete
---

# Quick Task 260823-pzq — park 34.4.1's three residuals

Operator decision 2026-08-23: *"park the three remaining items."* Docs only. No source changes, no
gate runs, no attempt to discharge or investigate any of the three.

## The three, all live-only, no code work remaining

| item | why it is live-only |
|---|---|
| `REQ-34.4.1-GAP-11` | bounded, classified `keyring_get` timeout. Its own body: "This box stays UNCHECKED — live-only". **The one with real teeth** — an unbounded call can consume the sidecar's whole 60s RPC budget. An OBSERVABILITY requirement, *not* a root-cause fix for F-9 |
| `D-29-02` | post-login `/api/v1/user/info` → 232-byte HTML 404. Path-moved vs interstitial **both fit every offline observation**; an unauthenticated probe cannot discriminate. **Non-blocking**: `finishLogin` gates on `getGamekeys`, never `getAccountIdentity` |
| `D-29-06` / **F-9** | a generic RPC timeout fired live (`response for unknown/timed-out id=1575`). Co-occurrence with a cookie operation **UNDETERMINED**, deliberately not rounded to "no" |

## The trap — measured, not theoretical

Confirmed directly in `sdk/dist/query/uat.js`: `parseVerificationItems` emits items **only** when
`status === 'human_needed'`; with an empty `human_verification` it **falls through to a body scrape**
matching `/##\s*human[_\s-]verification/i`, reporting table rows as phantom items; and a phase enters
the report only when `items.length > 0`.

So emptying the array while leaving `status: human_needed` yields **either phantom prose items or a
phase that silently vanishes from every cross-phase sweep**. The second is precisely the 23-day
invisibility this VERIFICATION.md was written to end. **Do not re-create it.**

## Design

**T1 — move all three** out of `human_verification:` into a new `human_verification_parked:` key, one
the tool does not read. **Not** `human_verification_resolved:` — they are not resolved, and
mislabelling them is a lie that outlives this session. Each keeps `test`/`record`/`requirement`/
`blocker` and gains `parked`, `parked_by`, its todo path, and its discharge condition.

**T2 — flip `status: human_needed` → `passed` in the SAME edit.** `passed` is the house convention
(26 of 41 VERIFICATION files). This makes the exclusion deliberate and legible instead of accidental.
Record inline *why* it is mandatory: empty-array + `human_needed` is the one combination that
misreports.

**T3 — visibility survives via todos.** F-9 already has one
(`2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`, plan 34) — **amend, do not
duplicate**. Create two new ones for `REQ-34.4.1-GAP-11` and `D-29-02`, shaped like the existing F-9
and Epic-logout todos: frontmatter, the claim that may **not** be made, greppable landmarks with a
re-grep warning, and a concrete discharge condition. After: `grep -rl "34\.4\.1"
.planning/todos/pending/` returns **3** (2 today).

**T4 — no self-sealing `blocked_by`.** Fixed on the Epic todo hours ago: *"no authenticated Epic
session has been available on any gate run to date"* described its own symptom and made the item
permanently un-actionable. Each parked item gets a **concrete revisit trigger**, not an owner and not
an open-ended block — **parking is not assignment, and the operator assigned nothing.**

**T5 — correct the docs that now assert a decision that has been made.** `34.4.1-VERIFICATION.md`'s
`score:` and its `# OPEN --` banner ("3 items remain open" / "now 3"); `ROADMAP.md`'s 34.4.1 block,
which I wrote an hour ago (`e20e3a658`) and which says *"That decision is not yet made and is
deliberately not recorded here"* — **now false**; and `deferred-items.md`'s disposition rows for
D-29-02 and D-29-06, in the style of the D-29-08 row updated earlier today.

## Verification — and the zero must not be ambiguous

Baseline recorded: audit-uat 7 files / 22 items, `by_phase` `{27:2, 30:2, 32:2, 33:3, 34:2, 38:8,
34.4.1:3}`; todos naming 34.4.1 = 2.

After, 34.4.1 must report **zero** — but **a zero proves nothing on its own**, so the same run must
show the **other six phases still reporting 19 items**. That distinguishes "34.4.1 deliberately
excluded" from "the query broke". Also confirm **no phantom items** for 34.4.1, and grep the phase
folder for a `## Human Verification`-style body heading the fallback could latch onto if someone
later flips `status` back.

## Scope fences

Do not touch `34.4.1-3N-SUMMARY.md` or `34.4.1-LIVE-GATE-RERUN-4.md` (historical). Do not re-open or
re-close the phase — it closed 2026-07-31 on run 3, and parking residuals does not change that. Do
not touch the Epic-logout todo (settled today, owned by 34.6, not one of these three).

## Commit discipline

**`git commit --only <path>` takes the entire WORKING-TREE state of that path** — it protects the
staged index, not the working tree. An hour ago the concurrent session's commit `8719629cd` absorbed
my uncommitted STATE.md row this way. So: re-read `git log --oneline -3` immediately before and after
any STATE.md edit, and **if the row vanishes, check whether it was absorbed** rather than re-applying
and creating a duplicate. Never "restore" a concurrent edit without re-reading HEAD first — mine was
already committed, so restoring would have been a regression.

Two unrelated renames staged ("steam-library-22-games" ×2), survived 24 commits — verify the count is
still 2. Never `git stash` / `git reset` / `git stash pop`. No `gsd-sdk state.*` verb; snapshot
STATE.md and diff the whole file.
