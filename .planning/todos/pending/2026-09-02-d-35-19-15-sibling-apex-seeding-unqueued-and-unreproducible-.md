---
created: 2026-09-02
title: "D-35-19-15's four Epic sibling apexes were never proven cleared — the item sat in ZERO queues, and `b5b3464bd` made it unreproducible until Phase 40 restores the embedded browser"
area: auth/webview
status: pending
severity: medium
blocked_by: "REAL and EXTERNAL — no seeding vehicle exists on this build. The Tauri build embeds no browser view, so no user action can create a non-primary Epic cookie in GameLib's own jar. Phase 40 is the trigger that unblocks it. This is NOT the self-describing-blocker shape corrected on the 2026-08-23 todo; nobody can go obtain the precondition today."
trigger_phase: "40"
owner: "NONE — D-35-19-15 has no owning phase. Phase 40 is named as the TRIGGER, not the owner."
files:
  - src/backend/storeManagers/legendary/user.ts:97
  - src/backend/storeManagers/legendary/user.ts:406
  - src/backend/storeManagers/legendary/__tests__/epicLogoutDomains.test.ts:549
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx:43
---

# D-35-19-15 — the four sibling apexes, unqueued and unreproducible

## Why this is being filed on 2026-09-02, and why filing it is not optional

A census taken today found `D-35-19-15` in **25 planning files and ZERO queues**:

| queue | hits |
|---|---|
| `.planning/todos/pending/` | **0** |
| `.planning/seeds/` | **0** |
| Phase 38 (the collection phase for deferred UAT) | **0** |
| Phase 39 | **0** |
| `.planning/todos/completed/` | 2 — **both closed today by quick `260902-9el`** |
| Phase 35 artifacts, `ROADMAP`/`REQUIREMENTS`/`STATE`/`debug` prose | 122 |

Everything above the fold is a **closed-phase artifact, an archived quick-task record, or prose**.
Until today the item at least rode along inside two *pending* todos; quick `260902-9el` moved both
to `completed/`, so its only todo-shaped mentions are now archived. **That closure is what makes
this filing necessary now** — it restores visibility the closure removed, and the closure was
correct on its own terms (both its carve-outs say in writing that `D-35-19-15` survives open).

This is the same shape Phase 40's own ROADMAP entry was filed to fix: an item living in
"three prose locations and **zero** queues: no todo, no seed, no backlog row, no `D-35-*` ledger
entry." Same family as the `blocked_by`/`parked_to_phase` rot this repo keeps producing, but a
distinct member of it: not a stale field, an item with **no field anywhere**.

## What the gap actually is — narrower than its name suggests

`EPIC_COOKIE_HOSTS` (`src/backend/storeManagers/legendary/user.ts:97`, pinned by
`epicLogoutDomains.test.ts:549`) sweeps five hosts on Epic logout. The **domain-suffix half is
exercised**: one `epicgames.com` step demonstrably sweeps `.epicgames.com`, `.www.epicgames.com`
and `.ecosec.on.epicgames.com`.

What has **never** been proven is the four non-primary sibling **apexes**:

```
fortnite.com    unrealengine.com    twinmotion.com    metahuman.com
```

All four report `before(matched=0)` on every run to date. A bare zero is not evidence of clearing —
it is evidence of nothing being there, which is exactly the "vacuous zero" this project has had to
argue down before (`35-LIVE-GATE.md:1241`).

## Why it is blocked — a real external precondition, not a symptom

`35-LIVE-GATE.md:1729`:

> **SEEDING STEP — BLOCKED, NO VEHICLE EXISTS ON THIS BUILD.** D-35-19-15 prescribes driving the
> webview to a non-primary Epic domain. The Tauri build embeds **no browser view**:
> `WebviewUnavailablePanel.tsx:43` … and offers only a system-browser handoff, which seeds Safari's
> jar, not GameLib's. **On this build no user action can create a non-primary Epic cookie**, so the
> `EPIC_COOKIE_HOSTS` widening is currently unreachable-by-construction: correct defensive code
> awaiting the browser's return.

It moved from *unexercised* to *unreproducible* by a fix that was right: **`b5b3464bd`** removed the
hidden logout webview that was the only thing ever seeding those four apexes during a logout. Before
that commit each showed `before(matched=1)` — **and those cookies were set by the removed window
itself.** Removing the defect removed the only thing that populated them.

Contrast with the stale blocker corrected on `2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md`:
that one described its own symptom and made the todo permanently un-actionable. This one names a
precondition that genuinely does not exist yet and identifies what creates it.

## Phase 40 is the TRIGGER, not the owner

Phase 40 (*In-app store and wiki browsing under Tauri — embedded child webview*, filed 2026-09-02)
restores `/store/*` and `/wiki` as embedded child webviews. **That is the seeding vehicle
returning** — and at that moment the `EPIC_COOKIE_HOSTS` widening stops being dormant defensive code
and starts guarding a surface users can actually reach.

**The connection is currently unmade.** Phase 40's ROADMAP entry discusses cookie jars at length —
spike 018's one-default-jar-per-process finding, quick `260902-8i2`'s live confirmation against both
real jars, Epic's pre-auth 403 inside an embed — and **never names `D-35-19-15` or
`EPIC_COOKIE_HOSTS`**. Whoever plans Phase 40 should pick this up as an explicit item; do not assign
Phase 40 as this item's owner on the strength of that alone. `D-35-19-15` has no owning phase.

## MUST NOT be used to reopen REQ-35-07

**REQ-35-07 is Complete** (`REQUIREMENTS.md:429` and `:1143`, quick `260901-vuy`, both clauses
live-proven on a genuine release artifact 2026-08-31 22:54). Two independent adjudication passes —
Phase 35's **fourth** and **fifth** — ruled that the sibling-apex seeding is `D-35-19-15`'s **own
sub-criterion and NOT a clause of REQ-35-07**; the sixth pass reaffirmed it a third time from the
requirement's own text. That ruling is why REQ-35-07 could close without it.

Anyone tempted to treat this todo as evidence against REQ-35-07 should read those three passes
first. It is a separate, narrower item.

## Discharge condition — a seeded fixture, not another zero

A non-primary Epic apex cookie (one of the four above) confirmed **PRESENT in GameLib's own jar
before logout**, then confirmed **absent after**, by an **independent jar read** rather than the
product's own census. Both halves are required: this repo has twice been misled by a count line that
matched, and by a `matched=0` that was accurate about an instant that stopped being true.

A green unit suite does not discharge this. Neither does another run reporting `before(matched=0)`.

## Related but distinct

- **`38-W06`** owns **off-macOS (Windows/Linux) Epic logout** — a different gap. `b5b3464bd`
  deliberately keeps a window off macOS (pointed at `https://gamelib.invalid/`); that leg is
  unexercised for its own reasons and is not this item.
- `.planning/todos/completed/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md`
  carve-out 2, and the matching carve-out in the `2026-08-24` closure — the two records that kept
  this item alive in writing before this todo existed.

## Sources

- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md:1714-1745`
  (criterion 21 — PASS on its contract, `D-35-19-15` NOT closed) and `:1876` (the
  unreproducible-by-construction addendum)
- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md` — sixth
  adjudication; `bears_on_req_35_07: "No"` recorded twice, by two different passes
- `.planning/REQUIREMENTS.md:429`, `:1143` — REQ-35-07 Complete, `D-35-19-15` struck as a condition
