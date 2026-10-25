---
created: 2026-10-25
title: "Depot selection ignores config.realm, config.steamdeck and optional, so GameLib downloads depots real Steam skips (Once Human: ~129 GB extra)"
source: quick 261025-srj library-wide manifest scan (2026-10-25)
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/select.ts
severity: major
platform: any
ready: code
---

`selectAllDepots` in `src/backend/storeManagers/steam/depot/select.ts` filters on `config.oslist`
(~L186), `config.osarch` (~L195) and `config.language` (~L204). It has no handling for
`config.realm` or `config.steamdeck`, and its ~L8 comment says it deliberately does not filter on
`dlcappid` / `optional` / `systemdefined`. So GameLib selects depots that the real Steam client
does not install for an ordinary desktop user.

Evidence from the library-wide manifest scan of 2026-10-25 (385 games, manifests only, English,
windows plus macos for Mac-native titles):

- **Once Human (2139460)** selects both 2139461 (`realm: steamglobal`, 128.72 GB) and 2139463
  (`realm: steamchina`, 128.71 GB). That is about 129 GB of extra download plus 77 cross-depot
  collisions between the two.
- **ASKA (1898300)** selects 1898302 (`oslist windows,linux`, `steamdeck: 1`) alongside 1898301.
- **The Witcher EE (20900)** depot 20902 and **Oblivion GOTY (22330)** depot 22333 are
  `optional: 1` DLC depots that GameLib selects.

Open question: should `optional` be excluded by default? Steam likely installs optional DLC depots
only when they are enabled in the game's properties. That is likely behaviour, unverified; check
against a native Steam install of one of these titles before changing the default.

The scan data (`results.json`, `rows.json` in the session scratchpad) was ephemeral and was not
kept; re-run a selection against the same appids to reproduce.

Fix direction: add `config.realm` handling (keep `steamglobal`, drop `steamchina`) and
`config.steamdeck` handling (drop for desktop installs) in `select.ts`, with tests built from the
Once Human and ASKA depot configs. Decide the `optional` policy after the native-Steam check above.
