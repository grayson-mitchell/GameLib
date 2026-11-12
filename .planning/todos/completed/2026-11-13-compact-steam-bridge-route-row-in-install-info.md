---
created: 2026-11-13T00:00:00.000Z
title: 'Compact the Steam bridge route row in Install info (short description + issue badge with tooltip, not a raw symbol dump)'
area: ui
files:
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx (bridgeLine row ~257-300; missingSymbols span ~281)
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx (same missingSymbols <p> ~777)
  - public/locales/en/gamelib.json (steam.bridge.route.* ~624-640)
severity: minor
platform: any
ready: code
---

## Problem

The Install info "Steam route" row for the native Steam bridge carries far too much text. When
the bridge scan finds Steam calls it does not cover, the row prints every missing symbol inline
via `steam.bridge.route.missingSymbols` (`Not covered: {{symbols}}`, joined with `, `). For Core
Keeper that is dozens of entries — `GameNetworkingSockets_Kill`,
`SteamAPI_ISteamNetworkingUtils_SetAppID`, `SteamAPI_MatchMakingKeyValuePair_t_Construct`,
`SteamAPI_SteamDatagramHostedAddress_*`, `SteamAPI_servernetadr_t_*`, ... — and it swamps the
panel. The reason text in front of it (e.g. "The bridge does not cover every Steam call this game
makes") is also long for an at-a-glance row.

Operator's words: "that is way too much text".

## Solution

1. **First column — shorter description.** Replace the long route + reason sentence with a short
   label (e.g. "Native Steam bridge" / "Bottled Steam client", plus at most a few-word qualifier).
   The full reason sentence can move into the tooltip below.
2. **Second column — issue badge with tooltip.** When there is an issue (`missingSymbols.length >
   0`, or a known-bad / scan-miss reason), show a small warning badge instead of the inline list
   (e.g. a warning icon + "N calls not covered"). Hovering it shows a tooltip with the full reason
   and the missing-symbol list (consider capping it, e.g. first ~10 + "and N more").
   No issue → no badge.

Apply the same treatment to the install dialog's bridge box (`SteamDialog/index.tsx`), which
prints the same unbounded `Not covered:` paragraph. The setup / routeNotice strings that embed
`{{symbols}}` (`steam.bridge.setup.missingSymbols`, `steam.bridge.routeNotice.scanMiss`) have the
same unbounded-list shape — check them while here.

New strings go in `public/locales/en/gamelib.json` (prettier-ignored; hand-match the file's
formatting). Verify visually on the game page for Core Keeper (long list) and a clean-scan game
(no badge).
