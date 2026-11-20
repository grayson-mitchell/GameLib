---
quick_id: 260911-nyq
status: complete
completed: 2026-09-11
commits:
  - 2c68c17fe
source_todo: .planning/todos/pending/2026-09-11-humble-keys-gift-button-gate-makes-scenario-2-pair-unreachable.md
---

# Quick Task 260911-nyq — Summary

Split the Humble Keys gift AFFORDANCE from the giftable-spare CLASSIFICATION. `isGiftable`
(`UNREVEALED && platform !== 'gog_keyless'`) now gates the gift button; `isGiftableSpare`
(`ownedElsewhere && UNREVEALED`) keeps its meaning and still selects scenario 3. The claim and
gift gates can now co-occur, so `43-UI-SPEC.md:313` scenario 2's Claim+Gift pair is reachable.

## Verification

| Gate | Result |
|---|---|
| New tests proved RED before the fix | 8 failed |
| `viewFilters.test.ts` after | 50/50 pass (42 pre-existing + 8 new) |
| All Humble suites, both jest projects | 770/770 pass, 18 suites |
| `tsc --noEmit` | clean |
| `ts-prune` on the touched exports | neither `isGiftable` nor `isGiftableSpare` orphaned |
| `eslint` on changed files | 0 errors (1 pre-existing `exhaustive-deps` warning at `index.tsx:224`, untouched) |
| `prettier --check` | all four files clean |
| STATE.md vs pre-task snapshot | byte-identical; no `gsd-sdk state.*` verb used |

## Two planning-time findings that changed the fix

**The source todo's Solution section was wrong on one point, corrected here.** It claimed
`resolveKeyScenario`'s `gift-only` branch "depends on" `isGiftableSpare`. It did not — it
re-derived `ownedElsewhere && state === 'UNREVEALED'` inline, a second mirror of the same rule.
Had the fix trusted that claim and left the branch alone, `isGiftableSpare` would have been
orphaned and `ts-prune --error` would have gone red. The branch now calls the exported predicate,
which both keeps it load-bearing and collapses the mirror.

**`UNREVEALED` is a domain constraint, not part of the defect.** `viewFilters.ts`'s own doc
comment cites spec §2.1: revealing a key forfeits Humble's gift link. Only the `ownedElsewhere`
clause was wrong. A fix that dropped both clauses would have offered gifting on keys that can no
longer be gifted.

## Judgment call, flagged rather than buried

`gog_keyless` is excluded from `isGiftable`. A keyless entitlement redeems server-side to the
linked GOG account and carries no code to transfer — the same reason `REDEEM_URL_BUILDERS`
omits it. **Consequence worth knowing: on the operator's current library this fix renders no new
pair.** The only two unowned+UNREVEALED keys are Racine (`gog_keyless`, now excluded from gifting)
and an Alchemy VTT tier (`generic`, excluded from claiming). The pair is now structurally
reachable — a plain unowned, unrevealed Steam key produces it — but is not present in this
library. If the operator wants Racine to offer a gift button, drop the `gog_keyless` clause; the
test named for it will turn red and should be updated deliberately.

## Left open, named not dropped

- **`43-UI-SPEC.md:313` also lists `REVEALED` as a scenario-2 pair state.** Spec §2.1 says a
  revealed key cannot be gifted, so row 2's `REVEALED` half stays unreachable after this fix.
  That is a spec-vs-domain contradiction inside the UI-SPEC, not a coding defect — resolving it
  is the operator's call and has not been silently patched.
- **The REQ-43-19 live gate's item 2 disposition is now stale.** It was recorded NOT ATTEMPTABLE
  on the ground that the pair was structurally unreachable. That ground is gone as of `2c68c17fe`,
  though the gate's packaged build predates the fix, so the measurement taken against that build
  remains valid for it. Whether to rebuild and re-score is 43-10's decision.
- The test's `claimGateHolds` is a MIRROR of the real claim gate, which is an inline expression
  inside a React closure with no exported form. Said so in the test's own comment: if the real
  gate changes, the mirror must change with it.
