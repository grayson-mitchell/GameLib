---
created: 2026-10-08T00:00:00.000Z
title: "Native LZMA decode works in a real SEA binary but ships switched off — operator decides: re-enable (revise the 2026-08-18 decision) or delete the dormant path"
area: steam
severity: medium
platform: any
ready: human
found_by: "quick-261008-jvw, measuring the native path for the first time since the kill switch (successor of 2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo)"
files:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts:97
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
  - .planning/debug/resolved/sea-native-lzma-real-chunk-decode-hang.md
---

## Decision needed

`NATIVE_LZMA_DECODE_ENABLED` is `false` under a standing operator decision (2026-08-18: no flip
without a fresh recurrence and fresh diagnostics). That precondition cannot be manufactured, so the
only ways forward are an explicit operator REVISION of that decision (re-enable), or deleting the
dormant native path. Nothing else will change the state, and dormant code rots.

## Evidence (quick 261008-jvw, 2026-10-08)

On a cold-built SEA binary with the switch locally forced on: 20/20 direct self-test runs at
`nativeWorkers:2`, `decode=ok match=true`, plus the native jest test passing. The full table, the
limits (synthetic 64 KiB chunk, darwin-arm64 only, one machine, speedup not re-measured) and the
spike-023 vs `b79765af2` tension are in the `## Resolution (2026-10-08)` section of
`.planning/todos/completed/2026-10-05-native-lzma-depot-decode-is-switched-off-with-no-tracking-todo.md`.
Raw captures: `.planning/quick/261008-jvw-measure-native-lzma-decode-in-a-real-sea/measurement/`.

## Recommendation

Re-enable via a dedicated follow-up, contingent on the operator revising the 2026-08-18 decision:
criterion 1 (root cause) is met only by its letter, criterion 2 is met by today's run, and
criterion 3 is NOT met (flip the constant AND change test 1's `nativeWorkers` assertion from 0 to
the pool size in the same commit, then run a live Steam depot install on the Mac and re-measure
native vs pure-JS throughput). If the operator will not revise the decision this milestone, delete
the native path instead: `lzmaNativeBinding.ts`, the native adapter and kill switch in
`lzmaLoader.ts`, the node-gyp-build alias and SEA asset embedding in `meta/buildSidecarSea.ts` /
`meta/esbuildWorkerBundleShared.ts`, the `lzma-native` dependency, and their tests.
