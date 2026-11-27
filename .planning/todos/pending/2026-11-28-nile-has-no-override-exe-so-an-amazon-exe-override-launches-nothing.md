---
created: 2026-11-28T05:35:00.000Z
title: "nile has no --override-exe, so an Amazon exe override launches nothing"
area: launch
files:
  - src/backend/storeManagers/nile/games.ts
severity: medium
platform: any
ready: code
found_by: "Live check of 88-HUMAN-UAT item 4 on the dev build, 2026-11-28 (Caravan SandWitch with a local known fix exeOverride)"
---

## Problem

With an exe override, an Amazon game does not start. `src/backend/storeManagers/nile/games.ts` (about line 381)
builds `--override-exe <exe>` from an alternative-exe launch, the game's own `targetExe` setting, or a known fix's
`exeOverride`. GameLib then runs:

    nile launch --override-exe CaravanSandWitch.exe --wine wine --wine-prefix shared amzn1.adg.product.1d092246-…

The bundled nile (`public/bin/arm64/darwin/nile/nile`) has no such option. `nile launch --help` lists only
`--bottle`, `--wine-prefix`, `--wine`, `--json`, `--no-wine`, `--wrapper` and the positional `id`. nile reads the
exe path as the game id and stops at once:

    INFO [CLI]:   Searching for /Users/…/Caravan SandWitch/CaravanSandWitch.exe
    ERROR [CLI]:  No game match

The launch ends straight away: the after script runs and play time is about zero. The code dates from quick
261029-mbl (2026-10-29), and the `targetExe` arm is older still. It is not new in 88.3.

## Idea

Find out how nile picks the exe, and decide between these:

- Launch the override exe ourselves under the game's Wine prefix and engine, the way a sideload launch does, and skip
  `nile launch` for that case.
- Add the option to nile, if a fork is acceptable.
- Leave the exe override out for nile: hide the per-game exe setting for Amazon, ignore a known fix's `exeOverride`
  for nile, and log that once.

Whichever is chosen, a test must assert that the nile argv never carries a flag that nile's own `--help` does not
list.

## Constraints to keep

- An exe override stays relative to the install folder and is resolved inside it (the known-fix shape check).
- The GOG and Epic paths (`--override-exe` is real there) are unchanged.
