---
created: 2026-11-07T12:00:00.000Z
title: "Adopt noUncheckedIndexedAccess for the remaining buckets, one per quick task"
area: tooling
files:
  - meta/indexedAccessBaseline.json
  - meta/indexedAccessRatchet.cjs
severity: minor
platform: any
ready: code
---

## Problem

`noUncheckedIndexedAccess` is adopted for all of `src/backend/storeManagers/steam/`, tests included
(non-test in quick 261107-9lq, tests in quick 261108-d5p) and for all of `src/backend/storeManagers/gog/`, tests included (quick
261108-cut) and for all of `src/backend/storeManagers/legendary/`, tests included (quick
261108-d1z) and for all of `src/backend/humble/`, tests included (quick 261108-d3t) and for all of `src/backend/engine/`, tests included (quick 261108-ekv) and for all of `src/backend/__tests__/` (quick 261108-et2) and for `src/backend/wine` (quick 261108-esz) and for `src/backend/utils` (quick 261108-esz) and for `src/backend/utils.ts` (quick 261108-esz) and for `src/backend/testUtils` (quick 261108-esz) and for `src/backend/downloadmanager` (quick 261108-esz) and for `src/backend/knownFixesRegistry.ts` (quick 261108-esz) and for `src/backend/launcher.ts` (quick 261108-esz) and for `src/backend/knownFixOverlayArchive.ts` (quick 261108-esz) and for `src/backend/save_sync.ts` (quick 261108-esz) and for `src/backend/storeSearch` (quick 261108-esz) and for `src/backend/wiki_game_info` (quick 261108-esz) and for `src/backend/signInProbe` (quick 261108-esz) and for `src/backend/scanners` (quick 261108-esz) and for `src/backend/storeManagers/sideload` (quick 261108-esz) and for `src/backend/appshell` (quick 261108-esz) and for `src/backend/logger` (quick 261108-esz) and for `src/backend/platform` (quick 261108-esz). The ratchet `meta/indexedAccessRatchet.cjs` holds every other bucket at an equality
ceiling. Remaining sites (1437 in all), largest first, as committed in
`meta/indexedAccessBaseline.json`:

- `src/frontend/screens`: 351
- `meta`: 342
- `src/frontend/components`: 218
- `src/backend/sidecar`: 165
- `src/frontend/helpers`: 130
- `src/backend/tools`: 120
- `src/backend/shortcuts`: 52
- `src/frontend/state`: 30
- `src/common/winetricks`: 9
- `src/preload/__tests__`: 6
- `src/common/reportProblem.ts`: 4
- `src/preload/api`: 3
- `src/frontend/hooks`: 2
- `src/backend/steamgrid`: 1
- `src/backend/storeManagers/nile`: 1
- `src/common/knownFixOverlayCatalogue.ts`: 1
- `src/common/types`: 1
- `src/frontend/styles`: 1

Note: phases 63/65 grew `src/backend/scanners`, `src/backend/sidecar`,
`src/backend/testUtils` and `src/frontend/screens` after the baseline landed, and the baseline was
raised to match in quick 261108-cut. The drift sites were not fixed; they are candidates for their
own buckets. Phases 67/72 grew `meta`, `src/backend/scanners`, `src/backend/sidecar` and
`src/backend/testUtils` again; the baseline was raised to match in quick 261108-ekv, those sites likewise unfixed.

## Solution

Adopt one bucket per quick task: fix it to 0, add it to `ADOPTED_BUCKETS` in the ratchet, and
delete it from the baseline. Narrow each
site with an explicit check, early return/throw or default. Never a non-null `!`. When the
baseline is empty, move `noUncheckedIndexedAccess` into `tsconfig.json` and retire the ratchet,
its baseline, its test and the CI step.
