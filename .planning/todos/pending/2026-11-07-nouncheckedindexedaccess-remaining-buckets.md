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
only (quick 261107-9lq). The ratchet `meta/indexedAccessRatchet.cjs` holds every other bucket at
an equality ceiling. Remaining sites (2298 in all), largest first, as committed in
`meta/indexedAccessBaseline.json`:

- `src/backend/storeManagers/steam (tests)`: 451
- `src/frontend/screens`: 335
- `meta`: 328
- `src/frontend/components`: 218
- `src/backend/humble`: 176
- `src/backend/sidecar`: 149
- `src/frontend/helpers`: 130
- `src/backend/__tests__`: 125
- `src/backend/tools`: 121
- `src/backend/shortcuts`: 52
- `src/backend/storeManagers/gog`: 34
- `src/frontend/state`: 30
- `src/backend/wine`: 24
- `src/backend/storeManagers/legendary`: 15
- `src/backend/utils`: 15
- `src/backend/utils.ts`: 15
- `src/common/winetricks`: 9
- `src/backend/downloadmanager`: 8
- `src/backend/knownFixesRegistry.ts`: 7
- `src/backend/wiki_game_info`: 7
- `src/backend/launcher.ts`: 6
- `src/backend/storeSearch`: 6
- `src/preload/__tests__`: 6
- `src/backend/signInProbe`: 5
- `src/common/reportProblem.ts`: 4
- `src/backend/testUtils`: 3
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

## Solution

Adopt one bucket per quick task: fix it to 0, add it to `ADOPTED_BUCKETS` in the ratchet, and
delete it from the baseline. Suggested first: steam tests, `storeManagers/gog`,
`storeManagers/legendary` and `backend/humble`, because they parse untrusted data. Narrow each
site with an explicit check, early return/throw or default. Never a non-null `!`. When the
baseline is empty, move `noUncheckedIndexedAccess` into `tsconfig.json` and retire the ratchet,
its baseline, its test and the CI step.
