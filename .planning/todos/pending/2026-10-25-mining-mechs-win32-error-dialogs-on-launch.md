---
created: 2026-10-25
title: "Mining Mechs shows a Win32 error dialog four times on launch through the bridge, then runs once clicked through"
source: 53-16 live session, operator report (item 22)
area: steam-bridge
files:
  - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md
  - public/fixes/1603180-steam.json
severity: minor
platform: macos
ready: live-gate
---

Operator, 53-16 session: Mining Mechs (1603180) raised a "Win32 error" dialog four times and ran
once each was clicked through. The bridge evidence is clean (HELLO, five distinct CALLs incl.
identity, census `verified`), and gamelib.log records no error for it, so the dialog text is the
missing fact. Next step: relaunch, capture the dialog text and the Wine stderr for the bottle
`GameLibSteamBridge-1603180`, and check whether it is a missing Windows runtime component (see
`2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`).

## 53-20 evidence (2026-10-25)

Reproduced in the 53-20 session: operator `1603180 - reached menu (with error messages)`. HELLO plus five distinct CALLs incl. identity, census verified; gamelib.log records no error; the bottle has no Unity Player.log; the dialog text was again not captured. Still needs the text and the Wine stderr.

## Cause and fix (2026-10-26)

The dialog text, captured with `CX_DEBUGMSG=+msgbox` on a direct CrossOver launch of the bottle,
is four variants of:

`Win32 function failed: HRESULT: 0x80070057 - Invalid parameter. Call: GR_D3D_Device->CheckMultisampleQualityLevels at line 1782 in file \Graphics_DisplayM.cpp`

(lines 1782, 1784, 1792 and 1794). It is the GameMaker v2024.14.4.268 D3D11 runner probing MSAA
support. CrossOver's D3DMetal backend returns `E_INVALIDARG` for those probes, and the runner shows
each failure as a message box and carries on. **It is not a bridge defect**, and it is not a missing
Windows runtime component. Same exe, same bottle, `CX_GRAPHICS_BACKEND` varied, 25 s each:

| backend         | message boxes | reached `DirectX11: Using hardware device` |
| --------------- | ------------- | ------------------------------------------ |
| d3dmetal (auto) | 1+ (4 total once clicked through) | yes |
| dxvk            | 0             | yes                                        |
| dxmt            | 0             | yes                                        |

(`CX_GRAPHICS_BACKEND=wine` is not accepted and falls back to d3dmetal.)

Fix: bundled tier-1 known-fix `public/fixes/1603180-steam.json` sets `CX_GRAPHICS_BACKEND=dxvk`
through `envVariables`, which `bridgeKnownFixes.ts` appends to the bridge launch's
`enviromentOptions`. No local or remote layer overrides it.

**Still open (live-gate):** launch through GameLib and confirm (a) no dialog, (b) the bridge is
still `verified` under DXVK (HELLO + identity CALLs), and (c) the game reaches the menu. The direct
launches above had no GameLib peer, so Steam init failed in them by design.

**Likely wider:** every GameMaker 2024 D3D11 title will hit the same probe under D3DMetal. If a
second one shows up, a generic rule (GameMaker runner detected → dxvk) beats per-app files.
