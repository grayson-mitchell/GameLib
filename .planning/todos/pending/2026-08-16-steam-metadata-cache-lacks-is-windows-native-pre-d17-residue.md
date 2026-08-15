---
created: 2026-08-16T11:22:00.000Z
title: "Existing steam_metadata caches carry platformsCaptured:true with NO is_windows_native — pre-D-17 residue the 34.14 fail-open deliberately does not rescue"
area: steam
severity: medium
found_by: "Phase 34.14 D-08 UAT, Run 1 setup (cache survey, 2026-08-16)"
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/installFormIpc.ts
---

## Problem

A survey of the real on-disk cache
(`~/Library/Application Support/GameLib/store_cache/steam_metadata.json`, 380 entries) taken
before Phase 34.14's UAT found:

- **370 entries** have `platformsCaptured: true`
- **0 entries** have `is_windows_native` at all

That combination is the worst possible input to the install-form platform row:

- `platformsCaptured: true` → the depot signal reads as **captured**, so D-04's fail-open
  correctly does **not** engage (fail-open is only for "not fetched yet").
- `is_windows_native` absent → `hasSteamWindowsDepot()` returns `false`
  (`steamPlatformRow.ts:51-55`, `=== true` comparison).

Net effect: for every one of those 370 games, the row concludes **"this game has no Windows
build"** with full confidence, and omits Windows from the platform selector. That is exactly the
false conclusion Phase 34.14 exists to prevent — but the phase's fail-open cannot help here,
because the cache is asserting the signal WAS captured.

## Why it happens

The current write path is correct: `games.ts:647` computes
`is_windows_native = !!data.platforms?.windows` and `games.ts:704` persists it to
`steamMetadataStore` alongside `platformsCaptured: true`. Both are written in the same object.

So these entries are **residue from an older build** that wrote `platformsCaptured` without
`is_windows_native` (pre-D-17). There is no cache version stamp and no migration, so stale
entries are trusted indefinitely.

Confirmed by forcing a refetch during UAT Run 1: deleting Terraria's entry (`105600`) and letting
the app re-fetch produced a correct entry with `is_windows_native: true`. The code is right; the
persisted data is stale.

## Impact

Any existing user upgrading into the 34.14 build keeps a cache where most games silently lose the
Windows option in the install form, with no pending state and no fail-open to catch it — the
phase's headline fix appears to work in a fresh-fetch test and does nothing for the installed
base.

## How to fix

Pick one:

1. **Cache version bump** — stamp a schema version on `steamMetadataStore` and invalidate entries
   written before `is_windows_native` existed. Cleanest.
2. **Targeted migration** — on startup, treat `platformsCaptured: true && is_windows_native ===
   undefined` as "not actually captured" and clear `platformsCaptured` for those entries so the
   existing 34.14 fail-open engages and a refetch repopulates them.

Option 2 reuses machinery this phase already shipped and needs no new fetch logic.

**Do NOT** fix this by loosening `hasSteamWindowsDepot`'s `=== true` comparison to
`!== false`. That inverted comparison is the `treatsAbsentAsAvailable` saboteur which three
shipped gates in `steamPlatformRow.test.ts` exist specifically to reject.
