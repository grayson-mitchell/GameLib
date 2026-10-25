# Quick 261025-kax: Avernum 6 init-only bridge verification Summary

The x86 shim now reports game-side SteamAPI_Init over CONTROL slot 5, the helper logs it as GINIT, and the census counts HELLO + GINIT success for init-only import rows. Avernum 6 (206060) scores verified, which makes the census 10 of 18 (majority: yes).

## Commits
- 3005da721 feat: shim reports game init over CONTROL slot 5, helper logs GINIT
- 93177fdd3 feat: census verifies init-only import rows on HELLO + GINIT success

## Live run (Task 3)
Operator, verbatim: "ok, game loaded, played around a bit in menu screen then quit"

- cmp of the bottle's steam_api.dll against public/bin/arm64/darwin/steam_api.dll: identical (no output from cmp). Both 290304 bytes. The run used the new shim.
- placeShimForGame log line: `placeShimForGame: overwrote steam_api.dll for appId 206060 at ".../GameLibSteamBridge-206060/drive_c/Program Files (x86)/Steam/steamapps/common/Avernum 6/steam_api.dll" (2 imported symbol(s) covered)`
- Helper lines (gamelib.log, 14:49):
  - `bridge helper [206060]: [2026-10-25T01:49:02Z] HELLO  shim attached appid=206060`
  - `bridge helper [206060]: [2026-10-25T01:49:02Z] GINIT  fn=SteamAPI_Init ret=1 ok=1 session=1`
  - Helper also logged the real `SteamAPI_Init(): Loaded ... steamclient.dylib OK.` and `INIT SteamAPI ready (single InitFlat call, real appid=206060)`.
  - No CALL or NOVER lines (init-only title; none expected).
- Census: `| 206060 | Avernum 6 | Avernum 6 | x86 | bridge | yes | verified |  |`
- Majority line: `10 of 18 Steamworks-using rows verified (majority: yes)`

Verdict: 206060 verified under the strict criterion (HELLO + GINIT with ok=1 session=1). Mac Steam In-Game was not cited. No reroute to bottled Steam.

## Deviations
None. Docs commit (SUMMARY/STATE/PLAN) left to the orchestrator.
