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
