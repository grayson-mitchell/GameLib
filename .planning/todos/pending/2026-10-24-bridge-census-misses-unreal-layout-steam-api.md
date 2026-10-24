---
created: 2026-10-24
title: "bridge-census has no Unreal-layout walk, so UE stub-plus-Shipping titles still read no-steam-api and count as covered"
source: quick 261024-uir live census re-run
area: steam-bridge
files:
  - meta/bridgeCensus.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
severity: major
platform: any
ready: code
---

After quick 261024-uir, three titles still classify `no-steam-api` with the detail "launch exe
imports no steam_api and none ships in the install tree": Ranch Simulator (1119730), Manor Lords
(1363080) and Abiotic Factor (427410). Each ships `steam_api64.dll` under
`Engine/Binaries/ThirdParty/Steamworks/Steamv*/Win64/`, depth 6, past the census's depth-4 walk.

The 261024-uir executor recorded this as "the census still matches live". That is wrong. The live
path has `findUnrealLayout` (`shimGenerate.ts:350`, used at ~1042; quick 261024-ir1). When a real
`Engine/` sits beside the launch exe, it adds the Steamworks ThirdParty directory to the dll walk
and scans `*/Binaries/Win64/*-Shipping.exe` first. That is how Manor Lords got its shim placed.
`meta/bridgeCensus.ts` has no Unreal handling at all (0 matches).

Because `no-steam-api` counts as covered, the post-uir headline "6 of 18 symbols covered"
still includes these three. Manor Lords is the title that crashes with the shim placed
(`2026-10-24-x64-shim-lacks-interface-versions-ue5-titles-request.md`).

Fix: mirror `findUnrealLayout` in the census driver, or extract it into a pure module both import,
which is the better option. The census's own docblock requires that it compose the live modules so
the two cannot diverge. Then let the Shipping exe be the importer and the ThirdParty dll be the
runtime dll, and add a fixture. Re-run the census; the three should leave `no-steam-api`.
