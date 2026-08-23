---
created: 2026-08-23
source: 34.4.1 gap cycle 3, live gate run 4 (operator finding, not a D-29 item)
status: pending
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
