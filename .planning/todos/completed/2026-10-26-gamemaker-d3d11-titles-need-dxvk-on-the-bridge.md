---
created: 2026-10-26
title: "GameMaker D3D11 titles show MSAA-probe error dialogs under D3DMetal; pick DXVK for them generically"
source: Mining Mechs (1603180) fix, completed todo 2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/storeManagers/steam/games.ts
  - public/fixes/1603180-steam.json
severity: minor
platform: any
ready: code
---

Mining Mechs (1603180) showed four `Win32 function failed: HRESULT: 0x80070057 - Invalid parameter`
dialogs on launch. The GameMaker v2024 D3D11 runner calls
`GR_D3D_Device->CheckMultisampleQualityLevels` (`Graphics_DisplayM.cpp` lines 1782/1784/1792/1794) to
probe MSAA support, CrossOver's D3DMetal backend returns `E_INVALIDARG`, and the runner shows each
failure as a message box. DXVK and DXMT both start it cleanly. It was fixed per-app with the bundled
tier-1 known-fix `public/fixes/1603180-steam.json` (`CX_GRAPHICS_BACKEND=dxvk`), and the live gate
passed through GameLib with the bridge still verified.

The probe is in the runner, not the game, so every GameMaker D3D11 title routed to the bridge
will probably show the same dialogs. A file per app finds them one at a time, after a user has
already seen the dialogs.

**Proposal:** at bridge launch, detect the GameMaker runner and default `CX_GRAPHICS_BACKEND=dxvk`,
with an explicit known-fix `envVariables` entry and the user's own env still taking precedence.
Detection candidates, cheapest first: `data.win` next to the launch exe; `GameMaker` /
`GMS2-Runner` strings in the exe. The hook point is `applySteamBridgeKnownFixes`
(`bridgeKnownFixes.ts:112`, called from `games.ts:3274`), which already builds the bridge launch's
`enviromentOptions`.

Before building it, confirm the cause on a second GameMaker title. One example does not show that
the whole runner family is affected: older GMS2 runners may not run the probe, and DXVK may hurt
titles D3DMetal handles fine. Once the generic rule exists, delete `1603180-steam.json` or keep it
as a regression pin, and say which in the commit.

## Second-title attempts (2026-10-28)

Neither candidate tested the cause:

- **Undertale (391540):** GMS 1.4 (D3D9), and Steam lists a native macOS build
  (`is_mac_native: true` in GameLib's metadata cache), so `isBottleEligibleFromPlatforms`
  (`games.ts:2501`) never routes it to the bridge.
- **Fields of Mistria (2142790):** no longer a GameMaker build. The installed exe (PE32+, 13.9 MB)
  has no `data.win`, no YoYo/GameMaker strings and no `d3d11.dll` import. It is a Rust build on SDL3
  (debug paths name a `fabricator` crate whose VM appears to run the original game's scripts), and
  `Maybe.toml` carries a `[release.macos]` section.

What this changes for the rule: a title's GameMaker reputation is not enough, since studios move
engines. Detection should need **both** `data.win` next to the launch exe **and** a `d3d11.dll`
import in it. Neither candidate matches, so neither would have been switched.

Only Windows-only titles matter here. A GameMaker title with a native Mac build never reaches
the bridge, and that excludes most well-known ones (DELTARUNE, Katana ZERO, Loop Hero, Chicory,
Hyper Light Drifter, Hotline Miami, Undertale). The second confirmation still needs a Windows-only
GMS2+ title that has been checked to still ship `data.win` before anyone buys it.

## Done: narrow generic rule (quick 261028-k7l, 2026-10-28)

The "runner >= 2024.x" check was not buildable: the runner version is not in the files. Mining Mechs'
exe version resource is `1.0.0.0`, and `data.win` GEN8 says IDE `2.0.0.0`. v2024.14.4.268 came from
the runtime log. The exe does carry the failing call site, so the rule uses that instead. A bridge
launch on CrossOver gets `CX_GRAPHICS_BACKEND=dxvk` when all three hold: `data.win` sits next to the
launch exe, the exe's PE import table names `d3d11.dll`, and the exe contains the string
`GR_D3D_Device->CheckMultisampleQualityLevels`. Your own env and a tier-1 known-fix both win over it.
Commits `d8f897c21` (PE import reader), `677d55746` (detector), `985c2a950` (wiring).

Offline check on the real exes: Mining Mechs matches on all three signals, and Fields of Mistria
matches on none.

**Live gate passed (2026-10-28):** dev build of main at `985c2a950` (sidecar rebuilt 21:14), with
`public/fixes/1603180-steam.json` moved aside so only the generic rule could act. gamelib.log
21:26:51: `Steam 1603180: known-fix env applied: CX_GRAPHICS_BACKEND=dxvk (GameMaker D3D11 runner
default: data.win + d3d11.dll import + CheckMultisampleQualityLevels probe)`. The bridge stayed
verified: `HELLO shim attached`, `GINIT … ok=1`, and the game made `BLoggedOn`, `GetSteamID`,
`BIsSubscribedApp` and `GetPersonaName` calls itself. DXVK rewrote `Mining Mechs_d3d11.log`
(swapchain created). Operator: "game launched no errors".

**Pin:** `public/fixes/1603180-steam.json` is kept as a regression pin, restored unchanged after
the gate. It still holds the measurement, and it stays in force if the detector ever stops matching.

**Not covered:** a second GameMaker title. The rule is narrow on purpose: it fires only for runners
that contain the probe. Whether older GMS2 runners also need DXVK is still unmeasured.
