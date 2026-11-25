---
created: 2026-11-25T14:00:00.000Z
title: "isMacSonomaOrHigher compares the Darwin major to 14, so Ventura (Darwin 22) counts as Sonoma and gets the toolkit as its default wine"
area: launch
files:
  - src/backend/utils.ts:1616-1632 (isMacSonomaOrHigher: major >= 14 over os.release())
  - src/backend/utils.ts:1095-1116 (downloadDefaultWine picks Game-Porting-Toolkit when it answers true, Wine-Crossover when false)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/check_wine/expected/download-mac-darwin-22-toolkit/requests.json
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/check_wine/expected/download-mac-darwin-14-toolkit/requests.json
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/check_wine/expected/download-mac-darwin-13-crossover/requests.json
severity: medium
platform: any
ready: human
---

## Problem

Recorded by the 88.1-04 check_wine golden (D-20: kept as recorded, not fixed there). `isMacSonomaOrHigher` reads
`os.release()`, which on macOS is the Darwin version, and tests `major >= 14`. Darwin 14 is OS X 10.10; Sonoma is
Darwin 23. So Darwin 14 through 22 (Yosemite to Ventura) all answer "Sonoma or higher", and
`downloadDefaultWine` installs `Game-Porting-Toolkit` for a Ventura Mac instead of `Wine-Crossover`. Only Darwin 13
and lower pick the Crossover wine. The log line says "macOS is Sonoma or higher" for a Ventura machine.

The wine validity check shares the threshold ("for a macOS toolkit, Darwin is 14 or later" in `wineCore.ts`), so
the two agree with each other and are both off from the name.

## Solution

Needs a decision before it is code: the threshold the toolkit really needs (Sonoma is 23; the Game Porting Toolkit 2
needs Sonoma, an older one ran on Ventura). When decided, change the TS and the Rust port in one deliberate step,
recorded in the check_wine `deltas.json`, and add the Darwin 22 case's new answer to the golden.
