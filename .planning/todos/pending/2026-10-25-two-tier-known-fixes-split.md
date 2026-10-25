---
created: 2026-10-25
title: "Split known-fixes into tier 1 (simple, remote-allowed) and tier 2 (.profile.json, local + bundled)"
source: quick 261025-thk
area: steam-launch
files:
  - src/backend/knownFixes.ts
  - src/common/types.ts
  - src/backend/launcher.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - public/fixes/284100-steam.json
severity: minor
platform: any
ready: code
---

Implement decisions 1 and 6 of `.planning/notes/per-game-compat-fixes-architecture.md` (revised
2026-10-25). No new repo is needed for this; it is the code half that
`2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md` builds on.

Today one file (`<appName>-<store>.json`) holds both kinds of key. `readKnownFixesLayered` takes the
first layer with a file whole, and strips `TRUSTED_ONLY_KNOWN_FIX_KEYS` (a block-list) from the
remote layer.

Work:

1. **Two types, two readers.** Tier 1 keeps `KnowFixesInfo`'s Heroic keys plus `launchNotice`.
   Tier 2 gets its own type, read from `<appName>-<store>.profile.json`. Each tier resolves
   local → bundled → remote independently. Tier 2 never reads the remote layer at all.
2. **Allow-list on remote tier 1.** Replace the block-list with an allow-list of the tier-1 keys.
   Drop anything else with a warning. A tier-2 key found in a tier-1 file at any layer is a
   mistake; warn and ignore it there too, rather than honour it from the wrong file.
3. **Rename the bundled file.** `public/fixes/284100-steam.json` (Unclaimed World, `registry`) moves
   to `284100-steam.profile.json`.
4. **Callers.** `bridgeKnownFixes.ts` (`registry`) and `sharedRedistInstall.ts`
   (`steamSharedRedists`) read the tier-2 reader. `installFixes` / `getKnownFixesEnvVariables`
   read the tier-1 reader for every store.
5. **The Steam bridge applies tier-1 keys.** It applies only `registry` today: `steam/games.ts`
   bypasses `prepareWineLaunch()`, so `winetricks`, `runInPrefix` and `envVariables` never reach a
   Steam game. Wire them in, or tier 1 is inert for Steam.
6. **Tier 2 for other stores.** Profiles apply to every store's games (decision 1). This todo
   only needs the reader to be store-agnostic; applying `registry` etc. on the Epic/GOG/Amazon
   launch path can be a follow-up if it is not small.

Done-when: the two readers exist with tests for per-tier layering, the allow-list and the
misplaced-key warning; the 284100 profile still applies on a bridge launch; a Steam game picks up
`envVariables` from a tier-1 file.
