---
created: 2026-08-23
completed: 2026-08-23
fixed_by: "quick task 260823-n5b, commit b52a8eed0"
source: 34.4.1 gap cycle 3, live gate run 4 (operator finding, not a D-29 item)
status: complete
severity: medium
resolves_phase: null
blocked_by: null
---

# A newly-synced Humble key cannot be claimed until you navigate away and back

## Observed live, 2026-08-23 (gate run 4)

Operator bought a new game on Humble, then in GameLib:

1. Could not click **Claim** on the new key.
2. Synced + refreshed Humble keys — **the new row appeared**, but with the caption
   *"Sync to enable claiming"*.
3. **Synced again — no change.**
4. **Navigated away and back — Claim appeared.**

Backend was correct the whole time:

```
15:45:34  Humble sync finished: gamekeys=31 ... keysCached=31
15:55:06  Humble sync finished: gamekeys=32 fetched=8/8 frozen=24 ... keysCached=32   <-- new key present
15:56:45  Humble sync finished: gamekeys=32 fetched=8/8 frozen=24 ... keysCached=32   <-- 2nd sync, correctly a no-op
```

## Root cause — identified from source, not inferred from the symptom

`src/frontend/screens/Humble/Keys/Waiting/index.tsx`

The claim button is gated on `claimAction.keyindexResolved`
(`HumbleKeyRow/index.tsx:242`); when falsy it renders `humbleKeys.syncToEnableClaiming`.
That value comes from the `annotations` map:

```
keyindexResolved: annotation?.keyindexResolved ?? false     // Waiting/index.tsx:167
```

`refreshAnnotations()` has exactly **three** call sites:

| # | trigger | line |
|---|---|---|
| 1 | `useEffect(() => {...}, [])` — **mount only** | 104 |
| 2 | `closeWizard()` — claim-flow exit | 118 |
| 3 | the standalone undo action | 181-182 |

**None of them fires on a library sync, and the mount effect's dependency array is `[]`**, so it
never re-runs when `humble.keys` changes.

A sync therefore updates `humble.keys` (via the backend's `humbleKeysUpdated` push) — so the new
row renders — while `annotations` stays the mount-time snapshot with **no entry for the new key**.
`?? false` disables the button. A second sync takes the identical path. Navigating away and back
**remounts**, the mount effect refetches, and Claim appears.

This accounts for all four observed symptoms with no unexplained residue.

## This is an INCOMPLETE FIX of a defect already known on this exact map

The comment at `Waiting/index.tsx:60-73` records the same shape being fixed once already:

> "…this map was previously fetched ONLY once at mount and never refreshed — a successful
> reveal/mark-redeemed/undo updates `humble.keys` … but left this annotations map stale, so
> HumbleKeyRow kept reading a revealedAt/redeemedAt of `null` and rendered the original 'Claim'
> button … `refreshAnnotations` is re-invoked after every claim-flow mutation exits"

The fix covered **claim-flow mutations**. It did not cover **sync**, which is the other writer of
`humble.keys`. Two sources of truth, one refresh path.

## Same family as D-29-01, different surface

D-29-01 (Manage Accounts not self-refreshing after sign-in, closed 2026-08-23) had the identical
signature — *"navigate away and back and it's correct"*. Its fix was in the login panel and does
nothing here. **Worth checking whether any other view derives state from a mount-only fetch
alongside a pushed store.**

## Suggested fix

Re-run `refreshAnnotations()` when the key set changes — e.g. an effect keyed on a stable identity
of `humble.keys` (length plus a key-id digest, not the array reference, which changes on every
push). Prefer that over adding a fourth manual call site: sync is not the only non-claim writer,
and the next one will reproduce this again.

## Greppable landmarks

- `refreshAnnotations` — `src/frontend/screens/Humble/Keys/Waiting/index.tsx:81`
- `keyindexResolved` — `Waiting/index.tsx:167`, `HumbleKeyRow/index.tsx:14,242`
- `humbleKeys.syncToEnableClaiming` — the user-visible caption
- `humbleKeysUpdated` — the backend push that updates `humble.keys`

## Discharge condition

Buy or otherwise acquire a new Humble key, sync, and observe **Claim** available **without**
navigating away and back. A unit test pinning that `refreshAnnotations` re-runs on a key-set change
is necessary but not sufficient — this defect was invisible to a fully green suite, as every
blocking defect in Phase 34.4.1 was.


---

## FIXED 2026-08-23 — quick task `260823-n5b`, commit `b52a8eed0`

The fetch is now keyed on a stable identity of the **key set** (a sorted join of
`${gamekey}:${machineName}`, the same composite the annotations map is keyed by), rather than a
fourth manual call site — sync is not the only non-claim writer of `humble.keys`.

**The effects were SPLIT, and that is the load-bearing part.** The obvious fix — adding deps to the
existing mount effect — also moves its cleanup, which latches the component-lifetime `mountedRef`
(WR-02) to `false` on the first key-set change and silently kills every later annotation write. A
worse, far less visible version of this same defect. Lifecycle keeps `[]`; the fetch gets its own
keyed effect and still runs on first render, so there is no double-fetch.

### The harness had to be fixed TWICE, both times because a gate was otherwise vacuous

1. The react mock ran **every effect on every render, ignoring dependency arrays**. Against the
   broken `[]`-keyed code a rerender still refetched, so a "refetches when the key set changes"
   test would have passed against the very bug it exists to catch. Made dep-aware.
2. The mock **never invoked cleanups**, which made the `mountedRef` hazard test **vacuous** — the
   naive fix passed all 13 tests, because the latch can only fire from a cleanup the harness never
   called. **Caught by red-proofing the NAIVE fix, not just the reverted one.** Cleanup now runs
   before a re-run, per React's real semantics.

| mutation | result |
|---|---|
| fix reverted to original | **3 tests FAIL** |
| naive fix (deps added, cleanup not split) | **2 tests FAIL** |
| correct fix | 13 pass |

The no-refetch-loop test correctly **passes** against the broken code — it guards the opposite
property.

### Census recorded, deliberately NOT fixed (out of scope)

28 frontend files carry a `[]`-keyed effect calling `window.api`. Most are settings nothing pushes
to. The one sibling with the same shape is **`Humble/Keys/Spares/index.tsx`** — `giftedMap` is
fetched at mount with `[]` deps and read as `giftedMap[key.machineName] ?? null`.

**Its exposure is milder and it is NOT the same bug:** `giftedAt` feeds a display annotation, not a
gate, so a stale map cannot disable an action the way `keyindexResolved ?? false` disabled Claim.
Local gifting also updates it optimistically in-place. The residual gap is that a gift recorded
outside this view may not show until remount. Worth a look if it ever surfaces; not fixed here.
