---
created: 2026-10-22
title: "\"GameLib will set one up\" CrossOver notice is false — first-run setup dies on a raw cxbottle ENOENT"
source: phase 51-19 live gates, fresh Mac with no CrossOver installed
area: steam-setup
files:
  - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
  - src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/games.ts
severity: major
platform: macos
ready: code
---

With CrossOver not installed, the install dialog's wine section shows
`gamelib:steam.install.noCrossoverEngine`: "No CrossOver installation was found. GameLib will set
one up when the install starts." (`WineSelector/index.tsx:264-266`, added in `245c271d4`,
2026-08-15). That promise is false. Nothing under `src/` downloads or installs CrossOver, and
every bottle path shells out to the hard-coded
`/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle` (`bottle.ts:64`).

Observed 2026-10-22 on the packaged debug bundle, installing Avernum 6 (206060):

- 19:44:17, bridge route: `provisionBridgeBottle: cxbottle create threw Error: spawn
  /Applications/CrossOver.app/.../cxbottle ENOENT`. The download queue then logged
  `Finished Installation of 206060` even though nothing was installed.
- Bottled-Steam guided setup: the operator saw the raw toast "Steam setup could not start: Failed
  to create CrossOver bottle "GameLibSteam": Error: spawn .../cxbottle ENOENT".

Neither path checks for CrossOver before it starts, and neither tells the user what to do.

Fix direction:
1. Make the notice tell the truth: CrossOver is required, with a link to codeweavers.com.
2. Check `existsSync(cxbottle)` before provisioning, on both the bridge and bottled-Steam paths.
   Show a "CrossOver is required" message there instead of the ENOENT.
3. Do not record a failed provisioning as `Finished Installation`.

Second defect from the same trigger, confirmed: the 19:44:17 bridge provisioning failure called
`markBridgeFailedThisSession(206060)` (`games.ts:198`, the `bridgeFailedThisSession` set). That
set feeds `resolveBridgeRoute`'s `failedThisSession` rule, which means route to the bottle with
reason `failed-this-session`. So the next Install press (19:45:12) silently went to bottled-Steam
guided setup. The operator confirmed they did NOT toggle "Use the Windows Steam client instead".
The bottled path needs the same missing CrossOver, so the fallback cannot succeed either, and the
flag only resets on a process restart.

Third defect, also confirmed live (20:00:07): the operator then installed CrossOver to
`~/Applications/CrossOver.app`, the per-user Applications folder that the CrossOver installer
offers. Engine detection (`getCrossover()`, `compatibility_layers.ts:308-321`) finds it through
`mdfind kMDItemCFBundleIdentifier = "com.codeweavers.CrossOver"`, so the wine selector shows a
valid engine. Bottle creation still spawns the hard-coded `/Applications/...` path (`bottle.ts:64`)
and fails with the same ENOENT. The user then sees "Reason: bridge-bottle-provision-failed",
which tells them nothing. The flag was set again, so the route flips to bottled Steam again.

4. A missing-CrossOver failure is a precondition failure, not a bridge failure. It must not call
   `markBridgeFailedThisSession`. Gate on CrossOver presence before routing.
5. Resolve `cxbottle` from the same CrossOver path `getCrossover()` / the selected engine uses,
   never a hard-coded `/Applications`.

## Closed

2026-10-24, quick 261024-cjq:

1. CrossOver location is resolved in one place (`steam/crossoverLocation.ts`): selected engine, then /Applications, then ~/Applications, then mdfind via `getCrossover()`. The hard-coded `/Applications/CrossOver.app` cxbottle path is gone from `bottle.ts`.
2. `provisionBottle` and `provisionBridgeBottle` check for cxbottle before any store write or spawn and return `errorCode: 'crossover-missing'` ("CrossOver is required...") instead of a raw ENOENT. The bottled-Steam setup dialog maps that code to the same message.
3. `install()` gates on `isCrossoverInstalled()` first inside the bottle-routed branch. A missing CrossOver never calls `markBridgeFailedThisSession`, so it never reroutes to bottled Steam; the next Install after installing CrossOver still takes the bridge route.
4. Setup-deferred installs (`deferredToSetup`) are logged as "deferred to setup" and are not added to the finished list; they no longer log "Finished Installation".
5. The install-dialog notice no longer promises GameLib will set CrossOver up; it says CrossOver is required and links to codeweavers.com. The stale `steam.install.noCrossoverEngine` key was removed from every non-en catalogue (key-presence invalidation) and the presence baseline re-recorded.

Deviation: a bottle that is already ready with CrossOver since uninstalled still short-circuits `done` in the provisioners (existing fast path unchanged).
