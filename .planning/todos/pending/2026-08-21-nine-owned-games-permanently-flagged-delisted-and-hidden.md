---
created: 2026-08-21
title: "Nine owned, non-delisted games are permanently flagged is_delisted and hidden from the library"
area: steam
status: "OPEN -- BUT THE FILED CAUSE IS DISPROVEN (2026-08-22). The nine persistently return success:false from a cold curl, with a passing control, so this is NOT a transient blip and the prescribed retry+migration fix CANNOT work. Real defect is the filter policy (an owned, INSTALLED game is hidden by a store flag). Needs a product decision before planning -- see the CORRECTION section."
severity: major
files:
  - src/backend/storeManagers/steam/games.ts
resolves_phase: 37
planned_as: 37-03
---

## Symptom

Nine owned games carry `is_delisted: true` in `steam_metadata.json` despite not being delisted,
and are therefore hidden from the library by the default `showNonAvailable: 'off'` filter.
**One of them is currently INSTALLED.**

| appid | title | installed |
|---|---|---|
| 28050 | Deus Ex: Human Revolution | no |
| 43160 | Metro: Last Light Complete Edition | no |
| 91310 | **Dead Island** | **YES** |
| 205930 | Hitman: Sniper Challenge | no |
| 216390 | Fallen Enchantress | no |
| 218130 | Dungeonland | no |
| 223390 | Forge | no |
| 367540 | Starbound - Unstable | no |
| 700580 | Rust - Staging Branch | no |

## Cause

`fetchMetadataIfNeeded()` (`storeManagers/steam/games.ts`) treats a Steam Store response of
`{success: false}` as a **permanent** `is_delisted` verdict. The adjacent `!data` branch
explicitly guards against exactly this and does not set the flag. **Nothing retries once the
flag is set**, so a single transient store response hides an owned game forever.

## Status — this is a re-confirmation, not a new find

Recorded during the 2026-07-22 `uninstall-game-vanishes` debug session as one of two adjacent
bugs found and deliberately NOT fixed. That session noted it hid **9** games including installed
Dead Island. Re-measured live on **2026-08-21**: still exactly **9**, still including Dead
Island. It has not drifted and it has not self-corrected.

That session's own conclusion was that this bug "is user-visible and independent of the
rearchitecture — worth fixing on its own merits rather than waiting". Filing it as a todo so it
stops depending on a parked debug file for visibility.

## Distinct from the 22-game gap

This explains 9 of the 22 games missing from the rendered library (see the sibling todo). The
other ~13 — including Wasteland 3 and Len's Island — are `is_delisted: false` and are NOT
explained by this bug. **Fixing this will not close that one.**

## How to apply

Mirror the `!data` branch's guard: treat `{success:false}` as "unknown, retry later", not as a
verdict. Then add a one-off migration or a retry pass to clear flags already written, since
existing users carry the bad flag in their metadata store and no code path currently clears it.

## ⚠ CORRECTION 2026-08-22 — the "transient store response" cause is DISPROVEN. Do not fix as filed.

Measured before starting work, because the recorded cause was a code-read from 2026-07-22.

**All nine still return `success: false` from Steam's store API right now**, queried directly by
`curl` with 1.5 s spacing (so not a burst, not GameLib's throttle, not GameLib's code at all):

```
28050 False · 43160 False · 91310 False · 205930 False · 216390 False
218130 False · 223390 False · 367540 False · 700580 False
```

**Control, identical method / spacing / network path:**

```
49520 True Borderlands 2 · 259130 True Wasteland 1 · 8930 True Sid Meier's Civilization® V · 220 True Half-Life 2
```

So the API works and the nine are a stable population: **9 on 2026-07-22, the same 9 on
2026-08-21, the same 9 on 2026-08-22.** A "single transient store response" cannot produce a
result that is stable across a month and reproduces from a cold `curl`.

### What this means for the prescribed fix

The "How to apply" section below says: treat `{success:false}` as "unknown, retry later", then
add a migration to clear flags already written. **Both halves fail against this evidence.**

- A retry pass would re-fetch, get `success: false` again, and re-set the flag. It cannot clear
  these.
- A migration that cleared them would be writing a value the store contradicts.

`fetchMetadataIfNeeded`'s `entry?.success === false` branch (`games.ts:640-656`) is doing what it
says. It is genuinely distinguishing itself from the adjacent `!data` branch, and that
distinction is sound.

### The real defect is the FILTER POLICY, not the detection

`filterEngine.isNonAvailableGame` is `nonAvailableAppNames.includes(...) || (runner === 'steam' &&
!!is_delisted)`. With the default `showNonAvailable: 'off'`, **a store flag hides a game the user
owns** — and in one case a game the user has **INSTALLED**:

| appid | title | installed | store |
|---|---|---|---|
| 91310 | **Dead Island** | **YES** (`appmanifest_91310.acf` present) | `success: false` |

You cannot see or launch a game that is installed on your own disk. That is the user-visible
defect, and it is independent of whether the delisted verdict is accurate.

### Why these nine plausibly ARE absent from the store — INFERRED, not measured

Offered as a lead, not a finding. `appdetails` returns `success: false` for any app with no store
page, which covers at least three different situations, and the nine look like a mix:

- **Genuinely delisted products** — Deus Ex: Human Revolution, Metro: Last Light Complete Edition,
  Hitman: Sniper Challenge, Fallen Enchantress, Dungeonland, Forge, and Dead Island (superseded by
  Definitive Edition) are all titles that were withdrawn or replaced.
- **Beta/branch app entries that never had a store page at all** — `Starbound - Unstable` (367540)
  and `Rust - Staging Branch` (700580) are branch entries, not products. Calling these "delisted"
  is a category error; they were never listed.

**Do not act on this attribution without checking it.** The cheap discriminator is PICS/appinfo,
which GameLib already has authenticated access to: an app that still exists in appinfo but has no
store page is a different case from one Valve has removed. `steam-appinfo-no-mac-arch-signal`
records that appinfo carries no mac-arch data, but app *existence* and type (`game` vs `beta`)
are exactly what it is for.

### Open decision this now needs — NOT mine to make

The fix direction depends on a product call:

1. Never hide an **installed** game, whatever its store status. (Narrowest; fixes Dead Island;
   leaves 8 owned-but-uninstalled games hidden.)
2. Never hide an **owned** game by store status alone — demote `is_delisted` from a hiding filter
   to a badge. (Widest; arguably what a library for games you own should do.)
3. Keep hiding, but distinguish "delisted" from "no store page" via PICS so branch entries are
   classified correctly.

Re-titled in spirit: this is not "nine games are wrongly flagged", it is "a store-availability
flag is being used as a library-visibility filter for games the user owns".
