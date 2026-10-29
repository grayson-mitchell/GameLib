---
created: 2026-10-29
title: "The DRM bottle-stage wine session writes no wine log, so a stage hang leaves no wine trace"
area: steam-bridge
severity: medium
platform: macos
ready: code
source: "phase 56 live gate (56-26), launches 1 and 7, 2026-10-29"
---

## Problem

56-20's per-launch wine log (`<appId>-<n>.wine.log`) covers only the game launch. The stage `reg add` runs earlier in its own wine session with no appender, so both stage hangs (Grim Dawn launch 1, Ranch launch 7) left only `ps` captures and the SIDECAR timeout and `bottle processes at timeout:` lines. Launch 1 produced no wine log at all.

## Next

Route the stage session's output into a stage wine log (same dir, own suffix) so the winebus/IOHID fix plan has a trace; capture it before the timeout kills anything.

## Closed by 56-34

Closed by the 56-32 fix (`5028e07e7`, `6cdafa4a9`), live-verified by plan 56-34 (item S1, contract `56-33-LIVE-GATE.md`, 2026-10-29). Evidence: launch 1 (Grim Dawn, first Play on a fresh bottle) logged `stageDrmBottle: appId 219990 stage wine log <TRACEDIR>/219990-1793237324709.stage.wine.log`; the file exists, starts `[gamelib] stage session appId=219990 bottle=GameLibSteamBridge-219990`, and holds `[gamelib] stage attempt 0`. Launch 5 (Ranch, forced timeout) shows the same file with `[gamelib] stage attempt 0`, `[gamelib] stage attempt 1` and the `bottle processes at timeout:` listing, so a stage hang now leaves a wine trace.
