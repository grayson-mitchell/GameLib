---
quick_id: 260823-n5b
slug: refresh-humble-key-annotations-when-the-
description: Refresh Humble key annotations when the key set changes, so a newly-synced key is claimable without remounting
created: 2026-08-23
status: planned
source_todo: .planning/todos/pending/2026-08-23-humble-keys-annotations-stale-after-sync-claim-disabled.md
---

# Quick Task 260823-n5b — a newly-synced Humble key can't be claimed until you navigate away and back

## The defect

Operator-observed live during Phase 34.4.1 gate run 4: bought a game, synced, the new row appeared
but read **"Sync to enable claiming"**; syncing again changed nothing; navigating away and back
made **Claim** appear.

Backend was correct throughout — `gamekeys=31 keysCached=31` → `gamekeys=32 fetched=8/8 frozen=24
keysCached=32`. **The view was the stale part.**

## Root cause — already diagnosed, do not re-derive from the symptom

`src/frontend/screens/Humble/Keys/Waiting/index.tsx`

Claim is gated on `claimAction.keyindexResolved` (`HumbleKeyRow/index.tsx:242`), fed by
`keyindexResolved: annotation?.keyindexResolved ?? false` (`Waiting/index.tsx:167`).
`refreshAnnotations()` has **exactly three** call sites — the mount effect (`[]` deps),
`closeWizard()`, and the undo action — and **none fires on a sync**.

So a sync updates `humble.keys` via the `humbleKeysUpdated` push (new row renders) while
`annotations` stays the mount-time snapshot with no entry for the new key. `?? false` disables the
button. Remounting refetches, which is why navigating away and back "fixes" it.

**This is an incomplete fix of a defect already known on this exact map.** `Waiting/index.tsx:60-73`
records it being fixed once for *claim-flow mutations*; **sync is the other writer of `humble.keys`**
and was never covered. Two sources of truth, one refresh path.

## The hazard the naive fix hits — read before writing code

The obvious fix is "add deps to the mount effect". **That introduces a worse bug.** The effect is:

```ts
useEffect(() => {
  refreshAnnotations()
  return () => { mountedRef.current = false }   // <-- lifetime flag
}, [])
```

`mountedRef` is a component-lifetime flag (WR-02) that every `refreshAnnotations` call site checks
before `setState`. Adding dependencies makes the **cleanup run on every change**, permanently
setting `mountedRef.current = false` and silently killing all future annotation updates — the same
class of defect, made worse and harder to see.

**Split the two concerns instead:**

```ts
useEffect(() => {                     // lifecycle ONLY, stays []
  return () => { mountedRef.current = false }
}, [])

useEffect(() => {                     // fetch on mount AND on key-set change
  refreshAnnotations()
}, [keySetIdentity])
```

The second effect still runs on mount (first render), so there is no double-fetch and no lost
mount-time behaviour.

## Tasks

**T1 — derive a stable key-set identity.** A `useMemo` over `humble?.keys` producing a sorted join
of `${gamekey}:${machineName}` (the same composite the annotations map is keyed by — the existing
test fixtures use `'gk-1:mn-1'`).

- **Must NOT be the array reference**, which changes on every push and would refetch on every
  unrelated render.
- **Must NOT derive from `annotations` or `overrides`** — `refreshAnnotations` writes both, so a
  dependency on either is an infinite refetch loop.

**T2 — split the effects** as above. Lifecycle effect keeps `[]`; a new effect keyed on the identity
calls `refreshAnnotations()`.

**T3 — extend `Waiting/__tests__/index.test.tsx`** (do not create a new suite).

Required tests:
1. **The defect test** — mount with a key set, then rerender with an *additional* key, and assert
   annotations were refetched and the new row's `keyindexResolved` becomes true.
   **RED-PROOF REQUIRED:** with T2 reverted this test must FAIL. A test that only asserts the
   mount-time fetch happens passes against the broken code and is worthless.
2. **No refetch loop** — a rerender that does not change the key set must NOT refetch.
3. **`mountedRef` survives a key-set change** — after a change, a subsequent refresh still applies
   state. This is the hazard above; without this test the naive fix looks correct.

## Scope

Frontend only. **Do not** touch the backend sync path (measured correct during the live gate) or
`HumbleKeyRow`'s gate condition (`keyindexResolved` is the right predicate — it was being fed stale
data).

## Verification

`npx jest src/frontend/screens/Humble` · `npx tsc --noEmit` · eslint **severity 2 only** (the repo
carries many pre-existing warnings). No full `pnpm test` — it manufactures a different failure set
under load.

## Commit discipline

A concurrent session is actively committing; HEAD has moved repeatedly today, once mid-edit.
Re-verify the target files are clean immediately before editing. **Two unrelated renames are
staged** — every commit uses `git commit --only <paths>`. **Never** `git stash` / `git reset` /
`git stash pop`. Leave the dirty tracked `.pyc` under `.planning/phases/34.4.1-*/__pycache__/` alone.

## Related

Same family as **D-29-01** (Manage Accounts not self-refreshing after sign-in, closed 2026-08-23) —
identical "navigate away and back and it's correct" signature on a different surface. That fix was
in the login panel and does nothing here. Record, but do **not** fix, any other view found deriving
state from a mount-only fetch alongside a pushed store.
