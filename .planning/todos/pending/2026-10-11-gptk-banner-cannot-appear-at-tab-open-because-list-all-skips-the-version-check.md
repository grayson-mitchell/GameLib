---
created: 2026-10-10T22:49:00.000Z
title: GPTK environment banner (D-16) cannot appear at tab open - winetricks list-all never emits the unsupported-wine warning
area: winetricks
severity: medium
platform: macos
ready: code
found_by: "Phase 45 live gate 45-12 G6 (launch 1), 2026-10-10"
files:
  - src/backend/tools/index.ts
  - src/backend/tools/winetricksEnvironment.ts
  - src/backend/tools/winetricksOutputClassifier.ts
---

## Observation (operator, launch 1)

On first opening Alan Wake's Winetricks tab there was no banner and Show details read
`No output yet`. The banner appeared the moment the first `-q` install started (09:07:25 local)
with the correct copy, version 7.7, info styling, no dismiss control, and persisted afterwards.

## Measured cause

`recordUnsupportedWine` is fed only by classifying winetricks' own line
`warning: Your version of wine 7.7 is no longer supported upstream` (`UNSUPPORTED_WINE_RE`). That
line is printed by `winetricks_wine_setup`, but the script sets `export _W_wine_not_needed=1` for
every `list*` command except `list-installed` (script line 5471) and `winetricks_wine_setup` returns
before the version check (line 5119). A hand-run `winetricks list-all` under the same GPTK env
printed exactly one stderr line, `Executing cd ...`
(`/tmp/gamelib-gate-45-20261010T194049Z/probe-listall-gptk.stderr`).

So the tab-open `list-all` can never feed the banner; D-16's "visible on opening the tab" is
unreachable on this build. Options: derive the report from `wine --version` (the bottle's wine
binary is already known at `tools/index.ts` `wineBin`) at `list-all` time, or run a cheap
wine-touching winetricks command once per bottle open. The 45-LIVE-GATE.md contract note N11 and
G6's criterion assumed the opposite; the criterion stands as written and G6 is scored `issue`.
