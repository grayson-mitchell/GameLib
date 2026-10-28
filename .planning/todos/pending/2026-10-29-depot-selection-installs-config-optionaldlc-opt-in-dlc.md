---
created: 2026-10-29
title: "Depot selection does not honour config.optionaldlc, so owned opt-in DLC (e.g. Dota 2 Workshop Tools, 5.9 GB) may install where Steam leaves it unticked"
source: quick 261029-ge1 (closing the `optional: 1` depot todo)
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
  - src/backend/storeManagers/steam/__tests__/fixtures/appinfo-64bit.json
severity: minor
platform: any
ready: blocked
---

`selectAllDepots` in `src/backend/storeManagers/steam/depot/select.ts` decides by ownership plus the
per-depot config filters (`oslist`, `osarch`, `language`, `realm`, `steamdeck`). It does not look at
`config.optionaldlc`.

`config.optionaldlc` is how PICS represents the Steamworks per-DLC setting "Disable Steam
automatically downloading this DLC" (https://partner.steamgames.com/doc/store/application/dlc).
Steam then lists the DLC with an unticked box in Properties → DLC, and installs it only when the
user ticks it. Evidence from Dota 2 570 (anonymous `getProductInfo`, 2026-10-29, and the checked-in
fixture `__tests__/fixtures/appinfo-64bit.json`):

| depot  | `config.optionaldlc` / `dlcappid` | DLC app                         | `extended.optionaldlc` |
| ------ | --------------------------------- | ------------------------------- | ---------------------- |
| 381450 | 313250                            | Dota 2 Workshop Tools DLC       | `"1"`                  |
| 401531 | 401530                            | Dota 2 - OpenGL support for Win | `"1"`                  |
| 401535 | 476580                            | Dota 2 - Vulkan support         | absent                 |
| 401536 | 476580                            | Dota 2 - Vulkan support         | absent                 |

Depot 381450 is 5.9 GB. If the account's owned package set includes this free DLC, GameLib installs
it while Steam would not.

This is a different flag from the legacy depot-level `optional: 1` (Witcher EE 20902, Oblivion GOTY
22333). That flag marks edition content Steam installs by default and must keep being selected. See
`.planning/todos/completed/2026-10-25-depot-selection-ignores-realm-steamdeck-and-optional-depot-config.md`.

**Blocked on:** whether free opt-in DLC is in the account's owned set (`packageinfo.depotids` /
owned apps) **before** the user opts in. If Steam grants the package only when the box is ticked,
the ownership gate already excludes these depots and there is no defect. This needs a signed-in
`getUserOwnedApps()` / owned-package check on an account that owns Dota 2 and has never ticked
the Workshop Tools DLC.

**If it is a defect, the fix has a trap.** The D-02 source census at
`src/backend/storeManagers/steam/__tests__/depot.test.ts:1763` fails if `select.ts` (comments
stripped) matches `/eresult|essential|required|optional/i`. That census exists to stop an
essentiality classification at selection time. A `config.optionaldlc` filter is a per-depot config
filter like `realm`/`steamdeck`, not that, but it would still trip the regex. Narrow the census
deliberately, for example by excluding the exact `optionaldlc` key, and keep its RED-specimen test
passing. Do not delete the census. The fix also needs a way to honour a user's explicit opt-in
later, since an always-off filter would make the DLC uninstallable.
