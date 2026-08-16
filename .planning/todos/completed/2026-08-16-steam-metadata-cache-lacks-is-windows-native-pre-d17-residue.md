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

---

## Resolution — quick task 260816-hdg (2026-08-16)

**Shipped: read-boundary normalization, not a migration.** New dependency-free module
`src/backend/storeManagers/steam/metadataCapture.ts` exports one predicate,
`depotSignalCaptured(entry)`, true only when `platformsCaptured === true` AND
`is_windows_native !== undefined`. It is applied at exactly three depot-signal read
boundaries, so the false "captured" claim is cleared at the point of use rather than
rewritten on disk:

| Site | Effect |
|---|---|
| `library.ts` GameInfo seed | `steamPlatformsCaptured` now reports `false` for a residue entry |
| `installFormIpc.ts` verdict | `platformsCaptured: false` lets Phase 34.14's D-04 fail-open engage, so Windows is offered again |
| `games.ts` `getGameInfo()` self-heal gate | the existing refetch now fires for residue; the refetch writes `is_windows_native` unconditionally (`!!` coercion), so it converges after exactly one fetch per appId |

**Why neither of this todo's own "How to fix" options was taken.** Option 1 (cache version
bump) and option 2 (startup migration) both need a startup hook, and there is none in the
shipping runtime: `MigrationSystem.get().applyMigrations()` is wired ONLY into
`src/backend/main.ts:418`, inside Electron's `app.whenReady()`. The Tauri sidecar never runs
that block — `src/backend/sidecar/bootstrap.ts` replicates the `whenReady` inits one by one and
migrations are not among them. A `Migration` class would have been dead code. Normalizing at
the read boundary reaches both runtimes with no bootstrap change at all, and is idempotent.

**The "Do NOT" warning above was honoured.** `steamPlatformRow.ts` is byte-identical
(`git diff --exit-code` clean); `hasSteamWindowsDepot` keeps its `=== true` comparison. A source
gate in `metadataCapture.test.ts` now asserts, from the backend side, that the file still
contains `is_windows_native === true` and never `is_windows_native !== false` — so the
prohibition no longer depends on the frontend project's own gates being run.

**Deliberate non-changes, pinned by source assertions.** Three raw reads of `platformsCaptured`
survive on purpose, because they ask the MAC question rather than the DEPOT question and a
residue entry genuinely did capture its mac answer: `games.ts`
`isBottleEligibleFromPlatforms()`, `library.ts` `isBridgeAuthoritativeForInstallState()`, and
`games.ts` `ensurePlatformsCaptured()`'s `alreadyCaptured()`. Bottle/bridge routing for residue
entries is unchanged.

**Not closed by this work:** the mirror problem on the mac axis,
`.planning/todos/pending/2026-08-16-absent-is-mac-native-treated-as-no-mac-build-mirror-of-34-14.md`.
This task's non-changes deliberately preserve exactly the two gates that todo concerns.

**Accepted consequence:** `GameInfo.steamPlatformsCaptured`'s second consumer,
`src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:67`, hides its section for a
residue game until the self-heal refetch lands — benign, temporary, self-healing, and one fetch
away.
