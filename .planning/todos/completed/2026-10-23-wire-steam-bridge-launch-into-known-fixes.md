---
created: 2026-10-23
title: "Wire the Steam bridge launch path into known-fixes (installFixes + envVariables)"
source: /gsd-explore per-game compat fixes (2026-10-23), after spikes 030–033
area: steam-launch
files:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/launcher.ts
  - src/backend/knownFixes.ts
severity: medium
platform: any
ready: code
---

The Steam bridge launch (`steam/games.ts`, the `runWineCommand({ commandParts: [exePath],
gameSettings: bridgeBottleSettings, ... })` call) bypasses GameLib's known-fixes hook entirely:

- It never calls `prepareWineLaunch()` (`launcher.ts:793`), so `installFixes()`
  (`launcher.ts:993`: winetricks verbs, `runInPrefix`) never runs for Steam games.
- It never merges `getKnownFixesEnvVariables()` (`launcher.ts:1031`) into the launch environment.
- By contrast, `gog/games.ts:604/623`, `legendary/games.ts:927/970` and `nile/games.ts:351/371` do
  both.

So a `fixes/<appId>-steam.json` placed today is silently ignored for Steam titles. This is the first
step of the per-game compat-fixes architecture (`.planning/notes/per-game-compat-fixes-architecture.md`)
and needs no format change.

Done when:
- A Steam bridge launch applies `envVariables`, and runs `winetricks`/`runInPrefix` against the
  per-app bridge bottle (`GameLibSteamBridge-<appId>`), from a `fixes/<appId>-steam.json`.
- It is covered by a test alongside the existing `knownFixes.test.ts`.
- Check `storeMap['steam']` produces the expected `-steam` suffix. Also decide whether
  `downloadFixesFor()` should fetch Steam profiles from Heroic's feed at all. Per the note's trust
  rule, only the benign legacy keys would ever be honoured from it.

## Closed 2026-10-24: Steam bridge launch applies known-fixes

Quick 261024-tny wires the bridge launch into known-fixes. `storeMap.steam` is now `'steam'`, so
`readKnownFixes` reads `fixes/<appId>-steam.json` instead of the old `<appId>-undefined.json`. The
other `storeMap` consumers were kept behaviour-neutral for Steam: uninstall still deletes no fixes
file, and the GamesDB lookup still returns an empty Steam ID without a network call. A new
`applySteamBridgeKnownFixes` in `steam/bridgeKnownFixes.ts` runs from `fireBridgeWineLaunch`, before
the process monitor and the wine launch. It runs the winetricks verbs and `runInPrefix` entries
against the bridge bottle `GameLibSteamBridge-<appId>`. `Winetricks.install` and `runWithArgs` gained
a trailing explicit-`GameSettings` parameter so the bottle is targeted without a library lookup. The
fix `envVariables` travel as `enviromentOptions` on a per-launch copy of the bridge settings. Any
failure logs a Steam warning and the launch continues.

Decision D1: `downloadFixesFor` no longer fetches anything for Steam, so Heroic's feed can never
supply a Steam fixes file. GameLib's own fixes repo is tracked in
`2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md`.

Decision D2: winetricks verbs re-run on every launch, as they do for other stores. There is no
applied-fix ledger.

Not done: the applied-fix ledger, the complex keys (registry, dllOverrides, overlays,
shimFeatures), the local and bundled layers, and a live check on the Mac with a real fixes file.
