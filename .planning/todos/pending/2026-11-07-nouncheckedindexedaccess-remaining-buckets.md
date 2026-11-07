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

`noUncheckedIndexedAccess` is adopted for non-test code under `src/backend/storeManagers/steam/`
(quick 261107-9lq) and for all of `src/backend/storeManagers/gog/`, tests included (quick
261108-cut) and for all of `src/backend/storeManagers/legendary/`, tests included (quick
261108-d1z) and for all of `src/backend/humble/`, tests included (quick 261108-d3t). The ratchet `meta/indexedAccessRatchet.cjs` holds every other bucket at an equality
ceiling. Remaining sites (2121 in all), largest first, as committed in
`meta/indexedAccessBaseline.json`:

- `src/backend/storeManagers/steam (tests)`: 423
- `src/frontend/screens`: 351
- `meta`: 328
- `src/frontend/components`: 218
- `src/backend/sidecar`: 155
- `src/frontend/helpers`: 130
- `src/backend/__tests__`: 125
- `src/backend/tools`: 120
- `src/backend/shortcuts`: 52
- `src/backend/engine`: 45
- `src/frontend/state`: 30
- `src/backend/wine`: 24
- `src/backend/utils`: 15
- `src/backend/utils.ts`: 15
- `src/backend/testUtils`: 11
- `src/common/winetricks`: 9
- `src/backend/downloadmanager`: 8
- `src/backend/knownFixesRegistry.ts`: 7
- `src/backend/launcher.ts`: 6
- `src/backend/storeSearch`: 6
- `src/backend/wiki_game_info`: 6
- `src/preload/__tests__`: 6
- `src/backend/signInProbe`: 5
- `src/common/reportProblem.ts`: 4
- `src/backend/scanners`: 3
- `src/preload/api`: 3
- `src/backend/knownFixOverlayArchive.ts`: 2
- `src/backend/save_sync.ts`: 2
- `src/backend/storeManagers/sideload`: 2
- `src/frontend/hooks`: 2
- `src/backend/appshell`: 1
- `src/backend/logger`: 1
- `src/backend/platform`: 1
- `src/backend/steamgrid`: 1
- `src/backend/storeManagers/nile`: 1
- `src/common/knownFixOverlayCatalogue.ts`: 1
- `src/common/types`: 1
- `src/frontend/styles`: 1

Note: phases 63/65 grew `src/backend/engine`, `src/backend/scanners`, `src/backend/sidecar`,
`src/backend/testUtils` and `src/frontend/screens` after the baseline landed, and the baseline was
raised to match in quick 261108-cut. The drift sites were not fixed; they are candidates for their
own buckets.

## Solution

Adopt one bucket per quick task: fix it to 0, add it to `ADOPTED_BUCKETS` in the ratchet, and
delete it from the baseline. Suggested first: steam tests,
because they parse untrusted data. Narrow each
site with an explicit check, early return/throw or default. Never a non-null `!`. When the
baseline is empty, move `noUncheckedIndexedAccess` into `tsconfig.json` and retire the ratchet,
its baseline, its test and the CI step.
