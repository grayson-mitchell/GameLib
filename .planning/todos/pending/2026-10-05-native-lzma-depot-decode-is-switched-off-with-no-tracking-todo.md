---
created: 2026-10-05T00:00:00.000Z
title: "Phase 23.1 native LZMA decode is disabled by a hardcoded kill switch — the speedup does not ship and only a debug doc records it"
area: steam
severity: medium
platform: any
ready: live-gate
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 23.1"
files:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts:97
  - .planning/debug/sea-native-lzma-real-chunk-decode-hang.md
---

## Problem

`NATIVE_LZMA_DECODE_ENABLED = false` (`lzmaLoader.ts:97`) turns native decode off because real-sized
chunks hang; the native-path test is `test.skip`. Phase 23.1's speedup therefore does not ship. This
was recorded only in `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md`, with no pending todo,
so nothing tracks re-enabling it. The native adapter and `lzmaNativeBinding` are dormant code.

Latent, in the dormant path: the temp `.node` file is not removed if `process.dlopen` throws.

## Failure scenario

No live failure (the JS path is used). The cost is a phase whose headline result is silently not
in the product, and dormant code that will rot.

## Suggested fix

Decide: root-cause the real-chunk hang and re-enable (needs a live run against real depots), or
delete the native path. If kept, clean up the temp `.node` file on `dlopen` failure.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
