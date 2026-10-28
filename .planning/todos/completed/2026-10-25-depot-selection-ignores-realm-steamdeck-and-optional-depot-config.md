---
created: 2026-10-25
title: "Depot selection installs optional: 1 DLC depots; unverified whether real Steam does by default (Witcher EE 20902, Oblivion GOTY 22333)"
source: quick 261025-srj library-wide manifest scan (2026-10-25)
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/select.ts
severity: minor
platform: any
ready: blocked
resolved: 2026-10-29
resolution: "no change: depot-level optional is a legacy systemdefined marker; Steam installs owned DLC by default; selecting 20902/22333 matches Steam (quick 261029-ge1)"
---

`selectAllDepots` in `src/backend/storeManagers/steam/depot/select.ts` deliberately does not
filter on `optional` (see the header comment). So GameLib may select optional DLC depots that the
real Steam client only installs when they are enabled in the game's properties.

Resolved by quick 261026-p02: `select.ts` now drops depots whose `config.realm` excludes
`steamglobal` (Once Human 2139463) and depots with `config.steamdeck` set (ASKA 1898302). Both are
covered by tests in `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts`.

Remaining evidence from the library-wide manifest scan of 2026-10-25:

- **The Witcher EE (20900)** depot 20902 and **Oblivion GOTY (22330)** depot 22333 are
  `optional: 1` DLC depots that GameLib selects.

Open question: should `optional` be excluded by default? Steam likely installs optional DLC depots
only when they are enabled in the game's properties. That is likely behaviour, unverified; check
against a native Steam install of one of these titles before changing the default.

Blocked because the deciding check needs a native Steam install of Witcher EE (20900) or Oblivion
GOTY (22330), which is not to hand on this machine.

## Resolution (2026-10-29, quick 261029-ge1): do not exclude `optional`. Current selection matches Steam

No code change. This was settled from public appinfo and Valve's documentation, not from a native
Steam install. No natively installed app on the operator's Windows box (C: and D: libraries) has an
`optional` depot, so a direct observation of an installed ACF was not available.

- **What the two depots are.** 20902 is "The Witcher: Director's Cut DLC" and 22333 is "Oblivion
  Game of the Year DLC" (Shivering Isles and Knights of the Nine). Each carries `optional: "1"`,
  `systemdefined: "1"` and a `dlcappid` equal to its own depot id. This is the edition-defining
  content of the edition the user bought.
- **`optional` is a legacy marker.** Of 12 more titles scanned anonymously (ARK, Fallout 4, MH:W,
  Skyrim SE, Witcher 3, Cyberpunk, Far Cry 5, Civ V, Civ VI, EU4, HoI4, Stellaris), only Civ V 8930
  carries it (29 depots, 28 of them DLC). These are 2008-2010 titles configured by Valve
  (`systemdefined`).
- **Valve's documented default.** Owned DLC "installs the content when the user installs the
  game" (https://partner.steamgames.com/doc/store/application/dlc). The opt-out is a per-DLC
  setting, "Disable Steam automatically downloading this DLC".
- **That opt-out has a different PICS form, and these two do not carry it.** Dota 2 570's
  tick-to-install DLC (313250 Workshop Tools, 401530 OpenGL, 476580 Vulkan) carry
  `config.optionaldlc: <dlcappid>` on the depot, and 313250 and 401530 carry
  `extended.optionaldlc: "1"` on the DLC app. Neither 20902/22333 nor their DLC apps have either key.
- **The asymmetry favours keeping it.** Excluding `optional` would install Oblivion GOTY without
  its GOTY content. Unowned DLC is already kept out by the package-ownership gate in `select.ts`.

Follow-up for the real opt-in mechanism, which `select.ts` does not filter:
`.planning/todos/pending/2026-10-29-depot-selection-installs-config-optionaldlc-opt-in-dlc.md`.
