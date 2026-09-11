---
created: 2026-09-11
title: "Gift button gate is mutually exclusive with the claim gate, so UI-SPEC scenario 2's Claim+Gift pair can never render"
area: humble-keys-ui
status: RESOLVED
severity: major
platform: any
ready: code
source: "Phase 43 plan 43-10 Task 2 live gate, operator run 2026-09-11 (session /tmp/gamelib-gate-20260911T043842Z)"
resolved: 2026-09-11
resolved_by: "quick task 260911-nyq, commit 2c68c17fe"
files:
  - src/frontend/screens/Humble/Keys/index.tsx (claimAction gate :421-424, giftAction gate :446)
  - src/common/humble/viewFilters.ts (isGiftableSpare :98-100)
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx (giftContent guard :541-542, resolveKeyScenario :229-276)
  - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-UI-SPEC.md (scenario matrix row 2, :313)
resolves_phase: null
---

## Problem

The Humble Keys unified list can never render the `claim-and-gift` scenario's button PAIR. Not
for this operator's library — **for any key, in any library, for any user.** The two actions the
pair is made of are gated on contradictory conditions:

```
claimAction  Keys/index.tsx:421-424   !key.ownedElsewhere && platform !== GENERIC_KEY_PLATFORM && hasClaimEligibleState(key)
giftAction   Keys/index.tsx:446       isGiftableSpare(key)
                viewFilters.ts:98-100   key.ownedElsewhere && key.state === 'UNREVEALED'
```

`claimAction` requires `!ownedElsewhere`. `giftAction` requires `ownedElsewhere`. No key can
satisfy both, so `giftContent` (`HumbleKeyRow/index.tsx:541-542`, which renders only when the
scenario is `gift-only` or `claim-and-gift` **and** `giftAction` is supplied) is structurally
unreachable on every `claim-and-gift` row. The scenario renders at most one affordance and is
misnamed for what it can actually produce.

`43-UI-SPEC.md:313` specifies the opposite. Scenario matrix row 2 reads: `state ∈ {UNREVEALED,
REVEALED}`, **not owned elsewhere**, and a "**Pair**: `gamelib:humbleKeys.activate` / 
`humbleKeys.claimOnStore` **+** `humbleKeys.giftOnHumble`", shape "Side-by-side pair". That is
unimplementable against the shipped predicates. The ROADMAP goal text names the same thing by
hand: *"(2) waiting — `Claim on [store]` and `Gift a friend` side by side."*

The user-facing consequence, stated plainly: **you cannot gift a Humble key from GameLib unless
you already own that game somewhere else.** A key you do not own elsewhere is exactly the key you
are most likely to want to give away, and Humble's own site lets you gift any unrevealed key.

### How it was found, and the corroboration

Found by code read during the REQ-43-19 live gate, then independently corroborated by the
operator's own enumeration of the shapes visible on their real 33-entitlement library:
`revealed / gift-only / claim-only / settled / expired` — **five shapes, none of them a button
pair.** Cache cross-check (`humble_library.json`, 33 entries): 2 keys are
`UNREVEALED && !ownedElsewhere` — Racine (`gog_keyless`) and an Alchemy VTT tier (`generic`). The
generic one is excluded from `claimAction` by the platform clause so it renders no control at
all, which is why Racine is the sole claim-only row. Neither gets a gift button.

### Likely root cause

`isGiftableSpare` was the old **tab-membership predicate** — it answered "which keys belong in the
`Giftable spares` tab", where `ownedElsewhere` is the correct and meaningful test (the copy is
surplus to you). Plan 43-04 exported it and 43-07 reused it verbatim as the per-row **gift button**
gate. Phase 43's stated premise was that "the tab predicates stop being list filters and become
PER-ROW state", and this is the one place that translation changed the meaning: as an action gate,
`ownedElsewhere` is not a precondition for being able to gift.

## Solution

Decouple the gift AFFORDANCE from the giftable-spare CLASSIFICATION. `isGiftableSpare` should keep
its current definition — `resolveKeyScenario`'s `gift-only` branch (`HumbleKeyRow/index.tsx:250-255`)
depends on it and is correct — but the `giftAction` prop at `Keys/index.tsx:446` should be gated on
"is this key giftable at all" rather than "is this key a spare". Candidate predicate: an unrevealed,
non-expired key with a real Humble gift destination, independent of `ownedElsewhere`.

Watch the interaction: widening `giftAction` alone changes `hasGiftAction`, which feeds
`resolveKeyScenario`'s `gift-only` branch (`ownedElsewhere && UNREVEALED && hasGiftAction &&
!hasClaimAction`). Owned+unrevealed keys must keep resolving to `gift-only` (full-width single
button, UI-SPEC row 3) and must not start resolving to `claim-and-gift` — `hasClaimAction` still
being false for them is what preserves that, but assert it rather than assume it.

Verification that would have caught this and should ship with the fix: a unit test asserting the
claim and gift gates are **not** mutually exclusive — i.e. that at least one `HumbleKey` shape
yields both actions defined. The current suite cannot see this defect because every existing test
exercises one scenario at a time.

A live confirmation that the pair actually renders side by side is owed on top of the unit test,
but the fix itself is desk work.

## Related

- Blocks nothing in Phase 43's REQ-43-19 gate, which measures COLUMN GEOMETRY only. That gate's
  item 2 sub-check "KEY width, shape: side-by-side pair" is recorded **NOT ATTEMPTABLE** for this
  structural reason, not as a PASS or a FAIL.
- Second-order finding: `43-LIVE-GATE.md`'s 34-row Structural Reachability Review declared "Zero
  surviving IMPOSSIBLE rows" but missed this. It tested whether each shape was reachable *in this
  operator's library* (correctly flagging `login-and-claim` and the override shapes on those
  grounds) and never asked whether the pair was reachable **at all**. Worth folding into
  `references/live-gate-contract-authoring.md` as a distinct test: for every shape a contract
  scores, check reachability against the CODE, not only against the operator's data.


## Resolution (2026-09-11, quick task `260911-nyq`, `2c68c17fe`)

FIXED. `isGiftable` (`UNREVEALED && platform !== 'gog_keyless'`) now gates the gift affordance;
`isGiftableSpare` keeps its spare-classification meaning and still selects scenario 3. The two
gates can co-occur, so the pair is structurally reachable.

**One claim in the Solution section above was WRONG and is corrected here:** it said
`resolveKeyScenario`'s `gift-only` branch "depends on" `isGiftableSpare`. It did not — it
re-derived `ownedElsewhere && state === 'UNREVEALED'` inline. Following the prescription as
written would have orphaned the export and reddened `ts-prune --error`. The branch now calls the
predicate, which also collapses the duplicate condition.

**`gog_keyless` was excluded as a judgment call**, so on this operator's library the fix renders
no new pair — Racine is `gog_keyless` and the only other unowned+UNREVEALED key is `generic`
(no claim action). Reachable, not present.

See `.planning/quick/260911-nyq-fix-humble-keys-gift-button-gate-mutual-/SUMMARY.md`.
