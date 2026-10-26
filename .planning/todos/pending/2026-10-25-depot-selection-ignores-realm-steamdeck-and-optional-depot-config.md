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
