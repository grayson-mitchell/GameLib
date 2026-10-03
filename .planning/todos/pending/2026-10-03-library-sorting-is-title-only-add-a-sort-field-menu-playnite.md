---
created: 2026-10-03T03:03:12.852Z
title: Library sorting is title-only — add a sort-field menu, with Playnite's sort list as the reference set
area: ui
severity: minor
platform: any
ready: human
found_by: "Operator question during quick-261002-b63 (asked whether the library could sort by date purchased), 2026-10-03"
files:
  - src/frontend/screens/Library/index.tsx:916-933
  - src/frontend/components/UI/Header/index.tsx:232
  - src/common/types.ts:184-195
  - src/common/types/gog.ts:281-289
  - src/backend/storeManagers/steam/depot.ts:496-526
---

## Problem

The Games library offers exactly two sort knobs, both `localStorage` booleans:

- `sortDescending` — title A–Z / Z–A, `localeCompare` with a leading `The ` stripped
  (`Library/index.tsx:916-922`), toggled at `Header/index.tsx:232`
- `sortInstalled` — regroups into installed → installing → not-installed
  (`Library/index.tsx:931-933`), toggled at `Header/index.tsx:252`

That is the whole sort surface. The operator asked for **date purchased** and noted Playnite offers
far more. Playnite's sort-field list is the reference set worth working through, not just the one
field that prompted this.

**Purchase date exists nowhere in the data model.** `ExtraInfo` (`types.ts:184-195`) carries only
`releaseDate`, `steamLastPlayed` and `steamPlaytimeMinutes`; `GameInfo` has no acquisition field at
all. So this is not a UI-only task for most candidate sort keys — each one needs its data source
established first.

## Data inventory, measured 2026-10-03

Purchase/acquisition date, per store:

| Store | Available? | Where |
| --- | --- | --- |
| GOG | **Yes, already fetched and discarded** | `GalaxyLibraryEntry.owned_since` + `date_created` (`types/gog.ts:286-287`). `GOGLibraryManager.refresh()` (`gog/library.ts:514`) already pulls this array and drops both fields when building `GameInfo`. Zero extra network calls. |
| Steam | Derivable, moderate work | `client.licenses[].time_created` joined to the package → `packageinfo.appids` expansion that `getOwnedSets()` (`steam/depot.ts:503-526`) already performs and then throws away. **It is the license-GRANT date, not purchase** — a Humble/bundle key, a family-share or a package re-grant all reset it. Sits on the known-slow bulk PICS path (node-steam-user #144, already behind `STEAM_PICS_BULK_TIMEOUT_MS`). |
| Epic | No | `GameMetadataInner.creationDate` (`types/legendary.ts:60`) looks like it but is **catalog-item** creation at Epic — identical for every user. Real purchase date is `grantDate` on Epic's entitlements, which `legendary list` does not surface. |
| Amazon (nile) | No | only `releaseDate` (`types/nile.ts:72`) |
| Sideloaded | No such concept | would need a fallback (file mtime, or an "added" stamp written at sideload time) |

Two traps to carry into any plan:

1. **`InstalledInfo.install_size` is a `string`** (`types.ts:384`), not a number — a size sort needs a
   parse, and an unparseable value must not sort as zero.
2. **Cross-store "Last Played" does not exist as a date.** `RecentGame` (`types.ts:630-637`) carries no
   timestamp, and `recent_games.ts` keeps an insertion-ordered list capped at **5** by default
   (`recent_games.ts:9,15,44`). Last-played is therefore Steam-only, via `extra.steamLastPlayed`.

## Playnite reference set — UNVERIFIED, verify before treating as a spec

Recorded from recollection, **not measured**. Verify against Playnite's own docs or source
(`Playnite.SDK` sort-field enum) before any of this is treated as a requirement list. Marked here
rather than omitted so the next session knows what to check, not what to trust:

Name · Platform · Library/Source · Categories · Last Played · Date Added · Date Modified ·
Release Date · Genres · Developers · Publishers · Tags · Series · Age Rating · Region · Play Count ·
Time Played · Completion Status · User Score · Critic Score · Community Score · Install Size ·
Installation Status · Favorite · Hidden · Features · Install Directory · Version

Cross-referenced against what GameLib has today: **title** (have), **installed status** (have),
**developer** (`GameInfo.developer`, have), **genres** (`extra.genres`, have), **release date**
(`extra.releaseDate`, partial coverage), **collections** (CategoriesManager, have), **favourite /
hidden** (GlobalState, have), **install size** (have but string-typed, see trap 1), **playtime /
last played** (Steam only). Everything else on the Playnite list — scores, completion status,
play count, series, age rating, region, features, date modified — has **no source in this codebase
at all** and would be new user-entered or new-API data, not a sort change.

## Solution

TBD, needs a design decision — hence `ready: human`. The open question is not how to sort but what to
do about **partial cross-store coverage**, since this is a unified library and a sort field that is
blank for three of five runners is worse than absent. Options to weigh:

- Label it **"Date added"**, not "Date purchased", and sort unknowns last. Calling it "purchased"
  when Steam supplies license-grant and three stores supply nothing is a shipped claim that is
  false for most of the library.
- Scope the control to the stores that have the field, and disable/hide it when the active store
  filter has no coverage.
- **GOG-only first slice** — the cheapest possible increment, one field already in the response —
  then decide separately whether Steam's license-date approximation is good enough to add.
- Replace the two boolean toggles with a real sort-field + direction control before adding fields,
  so each new key is one list entry rather than another `localStorage` boolean. Note `sortInstalled`
  is a *grouping*, not a sort key, and does not collapse into a single-field model without thought.

Whichever is chosen, show the date's provenance per game (tooltip or detail row) so an
approximation is visible rather than hidden.
