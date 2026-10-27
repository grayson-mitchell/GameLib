---
created: 2026-10-03T03:03:12.852Z
title: Library sorting is title-only — add a sort-field menu, with Playnite's sort list as the reference set
area: ui
severity: minor
platform: any
ready: live-gate
found_by: "Operator question during quick-261002-b63 (asked whether the library could sort by date purchased), 2026-10-03"
files:
  - src/frontend/screens/Library/index.tsx:489-501,864-883
  - src/frontend/components/UI/Header/index.tsx:234-263
  - src/backend/launcher.ts:155-156,302-308
  - src/frontend/helpers/electronStores.ts:190
  - src/common/types.ts:411
  - src/backend/storeManagers/steam/library.ts:1237

audit_acknowledged:
  milestone: v0.8
  at: 2026-10-16
---

## Problem

The Games library offers exactly two sort knobs, both `localStorage` booleans:

- `sortDescending` — title A–Z / Z–A, `localeCompare` with a leading `THE ` stripped from the
  upper-cased title (`Library/index.tsx:864-870`; state at `:489-493`), toggled at
  `Header/index.tsx:234-241`
- `sortInstalled` — regroups into installed → installing → not-installed
  (`Library/index.tsx:871-881`; state at `:497-501`), toggled at `Header/index.tsx:254-256`

That is the whole sort surface. The operator asked for **date purchased** and noted Playnite offers
far more. Playnite's sort-field list (verified below) is the reference set that was worked through,
not just the one field that prompted this.

## Decisions (operator, 2026-10-27)

All locked.

- **Slice 1 has two controls.** A sort-field + direction control replaces `sortDescending`, with
  fields **Name**, **Last played** and **Install size**. A SEPARATE group-by control replaces
  `sortInstalled`, with **None / Install status / Store**. Unknown values (never launched, not
  installed, unparseable size) sort LAST in both directions.
- **Last played is sourced per runner (operator, 2026-10-27, revised).**
  - **Non-Steam runners:** GameLib's own `tsStore` / `timestampStore` `lastPlayed` (ISO string).
    This is a GameLib fact, "last launched from GameLib".
  - **Steam:** `extra.steamLastPlayed` (Unix seconds, from `rtime_last_played`), which is Steam's
    own "last played anywhere". Steam launches never write `tsStore` (see Corrections), so this is
    the only source. `0` or `undefined` means never played and is an unknown value that sorts last.
  - The two meanings differ, and the operator accepted that knowingly. Normalise both to epoch ms
    before comparing. Do not also read `tsStore` for Steam, and do not add a `tsStore` write to
    `dispatchSteamLaunch`; both were considered and declined.
  - The label wording is an implementation detail, not locked.
- **Won't do: Playtime.** `tsStore` `totalPlayed` only counts GameLib launches, so it would show a
  false total for games played elsewhere. The operator rejected it.
- **Won't do: Date purchased / Date added.** Only GOG has a real ownership date
  (`GalaxyLibraryEntry.owned_since`). Epic and Amazon have none. Steam's only source is license
  `time_created`, which is a grant date, not a purchase date, and sits on the slow bulk PICS path;
  the operator declined that approximation. A "first seen by GameLib" stamp would be either a single
  sync date for the whole existing library or blank for 4 of 5 runners. The question that started
  this todo (sort by date purchased) is answered: it cannot be done faithfully across stores. The
  evidence is the inventory table below.
- **Deferred: Release date.** GOG and Epic only populate `extra.releaseDate` lazily, in
  `getExtraInfo()` (GOG: `gog/games.ts:100`, value read at `:123-136`; Epic: `getExtraInfo()` at
  `legendary/games.ts:299` calls `getExtraFromAPI()`, which sets it at `:191`), i.e. when a game
  page is opened. Amazon (nile) populates it at library refresh (`nile/library.ts:73,110`). Steam
  never sets it (no `releaseDate` anywhere under `storeManagers/steam/`). A sort on it would be
  mostly blank. It needs refresh-time metadata first, which is separate work.
- **Developer is not in slice 1.** The per-store fill rate of `GameInfo.developer`
  (`types.ts:252`; set at e.g. `gog/library.ts:1141`, `nile/library.ts:106`) is unmeasured.

### Purchase-date inventory, per store (measured 2026-10-03)

Line citations below were measured on 2026-10-03; those files are no longer in `files:`.

| Store | Available? | Where |
| --- | --- | --- |
| GOG | **Yes, already fetched and discarded** | `GalaxyLibraryEntry.owned_since` + `date_created` (`types/gog.ts:286-287`). `GOGLibraryManager.refresh()` (`gog/library.ts:514`) already pulls this array and drops both fields when building `GameInfo`. Zero extra network calls. |
| Steam | Derivable, moderate work | `client.licenses[].time_created` joined to the package → `packageinfo.appids` expansion that `getOwnedSets()` (`steam/depot.ts:503-526`) already performs and then throws away. **It is the license-GRANT date, not purchase** — a Humble/bundle key, a family-share or a package re-grant all reset it. Sits on the known-slow bulk PICS path (node-steam-user #144, already behind `STEAM_PICS_BULK_TIMEOUT_MS`). |
| Epic | No | `GameMetadataInner.creationDate` (`types/legendary.ts:60`) looks like it but is **catalog-item** creation at Epic — identical for every user. Real purchase date is `grantDate` on Epic's entitlements, which `legendary list` does not surface. |
| Amazon (nile) | No | only `releaseDate` (`types/nile.ts:72`) |
| Sideloaded | No such concept | would need a fallback (file mtime, or an "added" stamp written at sideload time) |

## Corrections to the 2026-10-03 version

- **Old trap 2 said cross-store last played does not exist. That was wrong for the non-Steam
  runners.** Heroic's `tsStore` (`backend/constants/key_value_stores.ts:7`, store name `timestamp`)
  records `firstPlayed` / `lastPlayed` / `totalPlayed` per appName in `launchEventCallback`
  (`launcher.ts:113`; `firstPlayed` at `:155-156`, `lastPlayed` and `totalPlayed` at `:302-308`),
  for Epic, GOG, Amazon, Zoom and sideloaded games. The frontend reads it via `timestampStore`
  (`frontend/helpers/electronStores.ts:190`; used at `Game/TimeContainer/index.tsx:21`). It only
  covers launches through GameLib.
- **Steam launches bypass `tsStore` (measured 2026-10-27). Resolved: Steam uses
  `extra.steamLastPlayed`, as recorded under Decisions.** The original "tsStore only" decision was
  made on the false premise that Steam launches write `tsStore`. The measurement that overturned it:
  Steam launches do NOT pass through `launchEventCallback`, so nothing writes `tsStore` for them.
  `protocol.ts:206-217` routes `runner === 'steam'` to `dispatchSteamLaunch`
  (`steam/launchDispatch.ts:43`), which calls `game.launch()` and `addRecentGame()` and never
  touches `tsStore`; a grep for `tsStore|timestampStore` under `src/backend/storeManagers/` and
  `src/backend/sidecar/` finds only the store registration. `Game/TimeContainer/index.tsx:64-67`
  says the same: "GamerLib never records local timestamps for Steam titles". Under "tsStore only",
  Last played would have been blank for every Steam game. The operator weighed three options: a
  `tsStore` write in `dispatchSteamLaunch`, Steam's own `steamLastPlayed`, or leaving Steam blank.
  They chose `steamLastPlayed`.
- The old "release date (partial coverage)" understated the gap. See Deferred above.
- **Trap 1 stands:** `InstalledInfo.install_size` is a `string` (`types.ts:411`), not a number — a
  size sort needs a parse, and an unparseable value must not sort as zero; it sorts last.

## Playnite reference set (VERIFIED 2026-10-27)

Source: `source/PlayniteSDK/Models/FilterPreset.cs` on JosefNemec/Playnite master, fetched via
`gh api`. This replaces the 2026-10-03 UNVERIFIED recollection.

`SortOrder` has 31 members, in this order: Name, Platforms, Library, Categories, LastActivity,
Genres, ReleaseDate, Developers, Publishers, Tags, Series, AgeRatings, Version, Regions, Source,
PlayCount, Playtime, CompletionStatus, UserScore, CriticScore, CommunityScore, Added, Modified,
IsInstalled, Hidden, Favorite, InstallDirectory, Features, InstallSize, RecentActivity, RomList.

`SortOrderDirection` is Ascending / Descending.

There is a SEPARATE `GroupableField` enum: None, Platform, Library, Category, LastActivity, Genre,
ReleaseYear, Developer, Publisher, Tag, Series, AgeRating, Region, Source, PlayTime,
CompletionStatus, UserScore, CriticScore, CommunityScore, Added, Modified, Feature,
InstallationStatus, Name, InstallDrive, InstallSize, RecentActivity. This sort/group split is the
model adopted for `sortInstalled`.

Playnite's `Added` is the date a game was added to Playnite, not a purchase date.

### Triage of all 31 `SortOrder` members

| Disposition | Members |
| --- | --- |
| Slice 1 | Name; LastActivity and RecentActivity → "Last played"; InstallSize; IsInstalled and Library → group-by (Install status, Store) |
| Won't do | Playtime, Added, PlayCount (for now) |
| Deferred | ReleaseDate, Developers |
| Skip, no data source | Publishers (no publisher field on `GameInfo`; the `publisher?` at `types.ts:882` belongs to an unrelated media type), Series, AgeRatings, Version, Regions, CompletionStatus, UserScore, CriticScore, CommunityScore, Modified, Features |
| Skip, not meaningful for GameLib | Platforms (all PC), Source (= Library for us), RomList, InstallDirectory, Hidden (a filter) |
| Skip, multi-value, better as filter facets | Categories, Genres, Tags |
| Optional | Favorite (cheap but not chosen) |

## Solution

Slice 1 as decided above:

- A sort-field + direction control (Name / Last played / Install size) replaces the
  `sortDescending` boolean, so each future key is one list entry rather than another `localStorage`
  boolean.
- A separate group-by control (None / Install status / Store) replaces `sortInstalled`.
  `sortInstalled` is a *grouping*, not a sort key, and does not collapse into a single-field model;
  the sort/group split matches Playnite's `SortOrder` / `GroupableField` design.
- Unknown values sort last in both directions: never launched, not installed, unparseable
  `install_size` string.
- Persist the choices in `localStorage` like today's toggles (default approach, not locked).
- Resolve the Steam Last-played consequence under Corrections before shipping that field.

## Status (2026-10-27): slice 1 implemented, live gate open

Quick task 261027-jjz built slice 1 (`librarySort.ts`, `useNonSteamLastPlayed.ts`, the Header
sort/group controls, and 12 strings in all 49 catalogs). Its code-review fixes are in commits
`e99bf4175`..`cd31cb0fa`. Desk checks pass. These live checks remain before this todo moves to
`completed/`:

1. Sort by Last played, launch a GOG or Epic game, quit, and confirm it moves to the top without a
   restart. This exercises the new `storeOnChanged` signal (review WR-05).
2. With Last played saved, cold-start the app. The grid should show A-Z for at most one round-trip,
   then reorder once (WR-02).
3. Group by Store and by Install status. Confirm the order matches today's
   installed → installing → not installed behaviour.
