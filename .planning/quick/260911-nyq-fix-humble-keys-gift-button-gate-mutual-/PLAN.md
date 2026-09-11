---
quick_id: 260911-nyq
created: 2026-09-11
title: "Decouple the Humble Keys gift affordance from the giftable-spare classification"
status: executing
branch: fix/steam-native-install-stability
source_todo: .planning/todos/pending/2026-09-11-humble-keys-gift-button-gate-makes-scenario-2-pair-unreachable.md
files_modified:
  - src/common/humble/viewFilters.ts
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/backend/humble/__tests__/viewFilters.test.ts
---

# Quick Task 260911-nyq

## Problem

`claimAction` (`Keys/index.tsx:421-424`) requires `!ownedElsewhere`; `giftAction` (`:446`) is
gated on `isGiftableSpare` = `ownedElsewhere && state === 'UNREVEALED'`. Mutually exclusive, so
`43-UI-SPEC.md:313` scenario 2's Claim+Gift side-by-side pair can never render. Full diagnosis in
the source todo.

## Findings that shape the fix (established during planning, not assumed)

1. **`resolveKeyScenario`'s `gift-only` branch does NOT call `isGiftableSpare`.** It re-derives
   `ownedElsewhere && state === 'UNREVEALED'` inline at `HumbleKeyRow/index.tsx:250-255`. The
   source todo's Solution section claims the branch "depends on it" — that claim is WRONG and is
   corrected here. The condition is mirrored in two places, which is the same third-mirror hazard
   that bit `clearAllFilters` in Phase 37.
2. **Reveal forfeits the gift link.** `viewFilters.ts:92-97`'s own doc comment cites spec §2.1:
   owned + REVEALED keys are deliberately excluded because revealing a key destroys Humble's gift
   affordance. So `state === 'UNREVEALED'` is a REAL domain constraint and must survive the fix —
   only the `ownedElsewhere` clause is wrong.
3. **Gifting is platform-agnostic in the flow itself.** `openGiftDialog` (`:334-359`) takes no key
   code, no keyindex and no per-platform URL — it records the open and sends the user to
   `humblebundle.com/home/keys`. So nothing about the mechanics restricts which platforms may gift.
4. **`gog_keyless` has nothing to transfer.** A keyless entitlement redeems server-side to the
   linked GOG account and carries no code — the same reason `REDEEM_URL_BUILDERS`
   (`keyTypePresentation.ts:121-125`) deliberately omits it. Offering "gift" on it would promise a
   transfer the user cannot complete, so it is excluded from the new predicate. **This is a
   judgment call, flagged for the operator rather than buried.**
5. **`ts-prune --error` runs as `find-deadcode`**, so `isGiftableSpare` must not be left orphaned.
   Task 2 keeps it load-bearing by pointing the `gift-only` branch at it, which also collapses the
   duplicate condition from finding 1.

## Tasks

### Task 1 — `isGiftable` + a test proving the gates are NOT mutually exclusive
Add `isGiftable(key)` to `src/common/humble/viewFilters.ts`: `state === 'UNREVEALED' &&
platform !== 'gog_keyless'`. Add a test describe block that asserts a single `HumbleKey` shape
satisfies BOTH the claim-gate predicate and the gift-gate predicate — the assertion no existing
test could make, because every current test exercises one scenario at a time.
**Prove the new test RED before the source change lands** (revert-and-read, per the standing
lesson that a test named for a bug can sit upstream of the bug).

### Task 2 — Wire the gate, de-mirror the branch
`Keys/index.tsx:446`: `isGiftableSpare(key)` → `isGiftable(key)`.
`HumbleKeyRow/index.tsx:250-255`: replace the inline `ownedElsewhere && UNREVEALED` re-derivation
with a call to `isGiftableSpare`, keeping the export load-bearing and removing the second mirror.
Assert that owned+unrevealed keys still resolve to `gift-only` (full-width single button, UI-SPEC
row 3) and do not start resolving to `claim-and-gift`.

### Task 3 — Gates, SUMMARY.md, STATE.md
`tsc`, the Humble jest projects, `find-deadcode`, and the planning gates. Then SUMMARY.md and the
STATE.md "Quick Tasks Completed" row. STATE.md is edited BY HAND — no `gsd-sdk state.*` verb
(snapshot at `/tmp/STATE.md.260911-nyq.snapshot`, sha `462d65c5`).

## Out of scope, named not silently dropped

- **UI-SPEC row 2 also lists `REVEALED` as a pair state.** Finding 2 says a revealed key cannot be
  gifted, so row 2's `REVEALED` half stays unreachable after this fix. That is a spec-vs-domain
  contradiction, not a coding defect, and resolving it is the operator's call — recorded in the
  SUMMARY, not silently fixed.
- Re-running the REQ-43-19 live gate. This fix makes item 2's pair sub-check reachable, so its
  NOT ATTEMPTABLE disposition becomes stale — but the gate build is a packaged artifact and
  rebuilding mid-run is 43-10's decision, not this task's.
