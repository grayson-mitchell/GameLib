---
quick_id: 260823-n5b
slug: refresh-humble-key-annotations-when-the-
description: Refresh Humble key annotations when the key set changes
date: 2026-08-23
status: complete
commit: b52a8eed0
source_todo: .planning/todos/completed/2026-08-23-humble-keys-annotations-stale-after-sync-claim-disabled.md
---

# Quick Task 260823-n5b — SUMMARY

A newly-synced Humble key could not be claimed until the user navigated away and back.
Operator-observed live during Phase 34.4.1 gate run 4, with the **backend measured correct
throughout** (`gamekeys 31 → 32`, `keysCached 32`) — the view was the stale part.

## The fix

`refreshAnnotations()` had three call sites — a `[]`-keyed mount effect, `closeWizard()`, and the
undo action — and **none fired on a sync**. Now keyed on a stable identity of the **key set**
(sorted `${gamekey}:${machineName}`, the same composite the annotations map uses), rather than a
fourth manual call site: sync is not the only non-claim writer of `humble.keys`, and the next one
would reproduce this again.

**This was the other half of a defect already fixed once on this exact map** — `Waiting/index.tsx:60-73`
records wiring `refreshAnnotations` into "every claim-flow mutation". Sync was never covered.

## The load-bearing detail: the effects are SPLIT

The obvious fix — adding deps to the existing mount effect — **also moves its cleanup**, latching
the component-lifetime `mountedRef` (WR-02) to `false` on the first key-set change and silently
killing every later annotation write. A worse, far less visible version of the same defect.

Lifecycle keeps `[]`; the fetch gets its own keyed effect, and still runs on first render, so no
double-fetch and no lost mount behaviour.

## The harness was vacuous twice, and the second catch is the useful one

1. The react mock **ran every effect on every render, ignoring dependency arrays**. Against the
   broken `[]`-keyed code a rerender still refetched — so a "refetches when the key set changes"
   test would have **passed against the very bug it exists to catch**. Made dep-aware.
2. The mock **never invoked cleanups**, which made the `mountedRef` hazard test **vacuous**: the
   naive fix passed all 13 tests, because the latch can only fire from a cleanup the harness never
   called.

**The second was caught only by red-proofing the NAIVE fix, not just the reverted one.** Reverting
the fix is the obvious red-proof and it would have left a gate that guards nothing. Cleanup now runs
before a re-run, per React's real semantics.

| mutation | result |
|---|---|
| fix reverted to original | **3 tests FAIL** |
| naive fix (deps added, cleanup not split) | **2 tests FAIL** |
| correct fix | **13 pass** |

The no-refetch-loop test correctly **passes** against the broken code — it guards the opposite
property, and would be the wrong thing to red-prove against this defect.

## Verification

Humble frontend suites **23/23**, `tsc` 0, eslint **0 errors** (1 pre-existing warning).
Scope was exactly two files.

## Recorded, not fixed

28 frontend files carry a `[]`-keyed effect calling `window.api`; most are settings nothing pushes
to. The one sibling with the same shape is **`Humble/Keys/Spares/index.tsx`** (`giftedMap`).
**Its exposure is milder and it is not the same bug** — `giftedAt` feeds a display annotation, not a
gate, so a stale map cannot disable an action the way `keyindexResolved ?? false` disabled Claim.
Residual gap: a gift recorded outside that view may not show until remount. Left alone per scope.

## Related

Same family as **D-29-01** (Manage Accounts not self-refreshing after sign-in, closed 2026-08-23) —
identical "navigate away and back and it's correct" signature on a different surface. That fix was
in the login panel and does nothing here.
