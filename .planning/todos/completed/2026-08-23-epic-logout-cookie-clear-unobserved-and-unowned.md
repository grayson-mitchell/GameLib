---
created: 2026-08-23
source: 34.4.1 gap cycle 3, plan 34 (from D-29-08, filed 2026-07-31)
status: CLOSED
severity: medium
resolves_phase: "34.6"
blocked_by: ""
blocked_by_history: "STALE AS WRITTEN 2026-08-23 — it named a future obligation of Phase 34.6, which closed; the obligation was discharged 2026-08-25 by plan 34.6-14 (see this file's own Disposition section). Corrected at closure, 2026-09-02, quick 260902-9el. Sixth recorded recurrence of the blocked_by-rot shape."
owner_confirmed: 2026-08-23
closed: 2026-09-02
closed_by: "quick task 260902-9el"
---

# Epic logout's cookie clear is UNOBSERVED — and, until now, unowned

## The claim that may NOT be made

Epic's logout calls the **same** Rust arm that Humble's disconnect proved fixed in Phase 34.4.1's
third live gate. The structural argument is sound.

**It is an inference from shared code, not a measurement.** That distinction is exactly what let
gate run 2's failure hide behind a fully green 3279/3279 suite. **No document may describe Epic's
logout as verified on this basis.**

What was actually observed on 2026-07-31: no authenticated Epic session existed, so the shared arm's
second caller was never exercised. No `clearEpicCookies` count line was seen. The removed-nothing
warning was neither observed to fire nor observed not to fire.

## Why this needed a todo — it was orphaned

`D-29-08` named **Phase 34.5** as owner. That was no longer true, and nothing had inherited it:

| claim | evidence | date |
|---|---|---|
| 34.5 does not own it | `34.5-26-SUMMARY.md:316` — *"The Epic logout path … was NOT specifically re-exercised by this plan … not independently live-verified here."* | — |
| 34.6 inherited only login + save-sync | 34.6's ROADMAP scope names *34.5 UAT test 11 (Epic login from scratch)* and *test 12 (`egsSync`)*. Logout is absent. | 2026-08-22 |
| 34.7 cannot own it | ON HOLD — its premise died (embedded Epic login works again) | 2026-08-22 |
| nothing else references it | `clearEpicCookies` appears in **no phase folder except 34.4.1's own** | 2026-08-23 |

Third recurrence of the `blocked_by`/`parked_to_phase` records-rot-silently shape. The dates are
recorded above precisely so the next reader can diff them instead of trusting the label.

## Greppable landmarks

- `clearEpicCookies` — the instrumented count line, added by `34.4.1-23-PLAN.md` (commit `ff298d657`,
  *"instrument and test Epic's clearEpicCookies, close the second F-6 Defect B caller"*)
- `epicLogout()` — `src/frontend/state/GlobalState.tsx:614-627` → `window.location.reload()`
- the shared origin-scoped storage-clear arm in `src-tauri/src/main.rs` (added by
  `34.4.1-15-PLAN.md`, wired by `34.4.1-16-PLAN.md`)

**Re-grep these before acting.** A code-read prediction on this project once outlived its own fix by
three days.

## Discharge condition — concrete, not a category

An authenticated Epic session exists, a logout is driven **live through the UI**, and the run
produces a `clearEpicCookies` count line whose count is cross-checked against an independent re-read
of the jar — the same paired-census discipline that closed F-6 for Humble.

A green unit suite does **not** discharge this. Every blocking defect in Phase 34.4.1 was found by a
human driving the UI; none by automation.

## Owner — CONFIRMED 2026-08-23

**Phase 34.6**, which already holds the live Epic surface (it inherited 34.5 UAT tests 11 and 12
from the parked 34.7). Adding it there is an explicit act — the existing inheritance demonstrably did
**not** cover logout.

**Confirmed by the operator on 2026-08-23** ("yes move to 34.6"), converting plan 34's proposal into
a decision. `resolves_phase` is now set accordingly.

### But `resolves_phase: 34.6` does NOT mean 34.6 closing discharges this

Setting `resolves_phase` is deliberate — an absent one makes todo auto-close miss everything, a
lesson this repo has relearned three times. The counter-risk has to be stated in the same breath:
**the discharge condition above is a LIVE OBSERVATION, and phase closure is not one.** If 34.6
closes without an authenticated Epic session, a UI-driven logout, and the paired jar census, then
auto-close will silently close an item nobody ever exercised — the exact "a pass can cover a surface
that was never exercised" shape this phase family keeps producing.

**Whoever plans 34.6: make this an explicit blocking gate item, not an inherited line.** The
inheritance from 34.7 already demonstrably failed to cover logout once.

### Why `blocked_by` was rewritten

It previously read *"no authenticated Epic session has been available on any gate run to date"* —
a statement about PAST gate runs that read as a present-tense blocker, which made this todo
permanently un-actionable: nobody would go obtain a session while the item announced itself as
blocked on having one. A blocker describing its own symptom. Embedded Epic login works (restored
2026-08-22 — that is why 34.7 went ON HOLD), so a session is obtainable; obtaining one is 34.6's
job, not a precondition it must wait on.

## Disposition (2026-08-25, plan 34.6-14) — does NOT close

The discharge condition's LETTER was satisfied: `34.6-LIVE-GATE.md` Step 8 (FINAL ADJUDICATION)
drove an authenticated Epic session, logged out live through the UI, and produced a
`clearEpicCookies` count line cross-checked against an independent re-read of the jar (D-13's
identity-check discipline) — exactly the paired-census shape this todo's discharge condition asks
for.

But applied against this todo's own **stricter** bar rather than its weaker wording: the
count-only cross-check **PASSED** (app reported clearing 8, matching the 8 expected), while D-13's
stricter, named-planted-cookie identity re-read caught the real defect underneath — **0 of the 7
in-scope `epicgames.com` cookies were genuinely removed.** Read literally against "a count line
cross-checked," this could misread as discharged; read against the project's established stricter
bar (a count match is not evidence, per D-13), it is a confirmed **FAIL**, not a discharge.

This todo is no longer "unobserved" — it is observed, live, and broken. The confirmed defect is
now owned by a separate, newer todo filed the following day from the same gate run:
`.planning/todos/pending/2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md`.
Closing this todo would misrepresent an unresolved defect as a resolved concern, so it **stays
pending** — superseded in effect, kept as the historical record of the ownership question this
todo existed to settle and of the observation that finally settled it.

**`resolves_phase: "34.6"` must not be read as "34.6 closing discharges this."** 34.6 closes with
this exact item scored FAIL, not silently — the phase discharged its own obligation (drive the
observation); the observation's *result* is what stays open, under the 2026-08-24 todo, which
currently has no owning phase.

## CLOSURE RECORD — 2026-09-02, quick task 260902-9el

**Discharge condition satisfied 2026-08-25.** This file's own `## Disposition (2026-08-25, plan
34.6-14)` section above records the discharge condition's letter being satisfied by
`34.6-LIVE-GATE.md` Step 8: an authenticated Epic session, a UI-driven logout, and a
`clearEpicCookies` count line cross-checked against an independent re-read of the jar.

**Why this stayed pending until now — and why that reason is gone.** This todo stayed pending
for exactly one stated reason: the confirmed defect that the 2026-08-25 disposition surfaced was
"now owned by a separate, newer todo" —
`2026-08-24-epic-logout-reports-clearing-cookies-it-does-not-clear.md`. That successor todo is now
FIXED and live-verified, and is closed by this same quick task (260902-9el) alongside this one. The
reason this todo could not close — an unresolved defect it would have misrepresented as resolved —
no longer holds.

**The evidence.** REQ-35-07 ("Logging out clears the embedded browser's persisted state — cookies,
localStorage, IndexedDB and disk cache — and the app does not report success unless a post-clear
read confirms it") was marked Complete 2026-09-01 by quick task `260901-vuy`, at
`REQUIREMENTS.md:429` (status table) and `REQUIREMENTS.md:1143` (body checkbox). Both clauses were
live-proven on a GENUINE RELEASE ARTIFACT at 22:52–22:54 on 2026-08-31 — Phase 35's sixth
adjudication pass, the first verified against a release build rather than a debug-packaged one.
Fixed by commit `b5b3464bd` ("fix(35): stop the Epic logout re-creating the cookies it deletes")
and commit `bea07cd17` ("fix(35): close the fail-open post-clear verification sweep").

**Why `resolves_phase: "34.6"` did NOT close this, and still does not.** This file itself warned
(see "But `resolves_phase: 34.6` does NOT mean 34.6 closing discharges this" above) that phase
closure is not a live observation, and that auto-close on phase closure alone would silently close
an item nobody had exercised. That warning held: 34.6 closed with this item scored FAIL, not
discharged. This todo closes now on the OBSERVATION (the 2026-08-25 disposition) plus the
successor defect's fix and live verification (2026-09-01/08-31) — never on 34.6 having closed. This
sentence exists so the record cannot later be misread as an auto-close on phase completion.

**The stale `blocked_by` and its correction.** The frontmatter's `blocked_by` field previously
read: `"nothing external — Phase 34.6 must OBTAIN an authenticated Epic session as part of its live
gate. This is a prerequisite of the gate, not a blocker on it."` That was a FUTURE obligation of a
phase that has since closed, and this file's own body already records that obligation being
discharged eight days later (2026-08-25, plan 34.6-14). It has been corrected at closure to
`blocked_by: ""` with the old value preserved verbatim above (`blocked_by_history`) and here, as
historical record rather than erased. This is the **sixth recorded recurrence** of the
`blocked_by`-rot shape in this repository (this file's own body, at the time it was written,
already called itself the third).

**Carve-out 1 — off-macOS Epic logout is NOT covered by this closure.** All evidence cited above is
macOS-only. This is already routed to **Phase 38** — the ROADMAP's Phase 35 entry reads "Routed
out: … Windows/Linux and off-macOS Epic logout → Phase 38", ledgered as **`38-W06`** in
`38-VERIFICATION.md`'s `human_verification` array. Commit `b5b3464bd` deliberately KEEPS a hidden
window off macOS (pointed at `https://gamelib.invalid/`) — exactly the leg nobody has exercised.
Commit `bea07cd17` additionally made an unreadable jar throw, so a rejecting read off-macOS surfaces
as a user-visible sign-out error. **Phase 38 owns this**, not this closure.

**Carve-out 2 — `D-35-19-15` SURVIVES OPEN and does not re-block this todo.** `D-35-19-15`'s
sibling-apex seeding remains UNEXERCISED and is unreproducible by construction: `b5b3464bd` removed
the hidden window that was the only thing ever seeding those four sibling apexes during a logout.
Two independent adjudication passes (the fourth and fifth) ruled it is `D-35-19-15`'s OWN
sub-criterion and NOT a clause of REQ-35-07, which is why REQ-35-07 could close without it; the
sixth pass reaffirmed that a third time from the requirement's own text. The domain-*suffix* half IS
exercised (one `epicgames.com` step sweeps `.epicgames.com`, `.www.epicgames.com`,
`.ecosec.on.epicgames.com`); only the four sibling *apexes* are not. `D-35-19-15` remains an open
item with **no owning phase**. It is not described as closed here, and it does not re-block this
todo's closure.
