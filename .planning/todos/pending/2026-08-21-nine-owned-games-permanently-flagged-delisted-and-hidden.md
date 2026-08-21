---
created: 2026-08-21
title: "Nine owned, non-delisted games are permanently flagged is_delisted and hidden from the library"
area: steam
status: OPEN
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
