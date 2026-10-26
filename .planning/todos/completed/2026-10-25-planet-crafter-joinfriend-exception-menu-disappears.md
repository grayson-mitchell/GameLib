---
created: 2026-10-25
title: "Planet Crafter's SteamRichPresence.JoinFriend throws on every bridge launch and the menu disappeared three launches in a row"
source: 53-20 live session, operator report (item 39)
area: steam-bridge
files:
  - native/steam-bridge/generated/steam_api_shim.c
  - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md
severity: medium
platform: macos
ready: live-gate
---

Operator, 53-20: Planet Crafter (1284190) menu disappeared on 3 consecutive launches (seen once before; quitting and relaunching once cleared it in 53-16). The census still reads `verified` (HELLO plus `BIsDlcInstalled`).

Evidence: the two retained Unity logs (launches 3 and 4) both end in an exception raised by the game's own `SpaceCraft.SteamRichPresence.JoinFriend ()` through `SavedDataHandler.ParseConnectionString`: `FormatException` (launch 3) and `ArgumentOutOfRangeException ... String.Substring` (launch 4). In the shim, `ISteamFriends::GetFriendRichPresence` (slot 43) and `ISteamApps::GetLaunchQueryParam` (slot 21) are stubs returning an empty string. Hypothesis, unproven: the game parses an empty connect string. The link between the exception and the vanishing menu is also unproven.

Next step: relaunch with the bridge trace and find which call feeds `JoinFriend`; if it is one of the two stubs, answer it the way real Steam does when no join is pending (the game must be gated by a join callback or a non-empty value); do not reroute the title to bottled Steam.

## Resolution

Fixed 2026-10-26 by debug session `.planning/debug/resolved/planet-crafter-joinfriend-menu.md`. The hypothesis above was wrong: the game reads `ISteamApps::GetLaunchCommandLine`, whose shim stub never wrote the out-buffer, so uninitialized heap became the connect string. The generator (`meta/gen_vtables.ts`) now empties `char*` out-buffers in stubs. Live gate passed: menu stays, no JoinFriend exception, HELLO + clean Steam-init log.
