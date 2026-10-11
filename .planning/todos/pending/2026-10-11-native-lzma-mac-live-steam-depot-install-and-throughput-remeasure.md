---
created: 2026-10-11T00:00:00.000Z
title: "Native LZMA decode is back ON: run a live Steam depot install on the Mac and re-measure native vs pure-JS throughput"
area: steam
severity: medium
platform: macos
ready: human
found_by: "quick-261011-mza, re-enabling native LZMA decode on the operator's 2026-10-11 decision (\"re-enable it, I'll do the Mac install after\")"
files:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts:97
  - src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts
  - .planning/todos/completed/2026-10-08-native-lzma-decode-reenable-or-delete-needs-operator-decision.md
---

## What is owed

`NATIVE_LZMA_DECODE_ENABLED` is `true` as of quick 261011-mza. The only evidence for native so far
is the self-test's synthetic 64 KiB VZ chunk on darwin-arm64 (20/20, 2026-10-08). Needs the
operator's own Steam sign-in and Mac, so it cannot be done from code.

1. **Live Steam depot install, end to end, on the Mac with the native-ON build.** `gamelib.log`
   should carry `lzmaLoader: native lzma-native decoder engaged for Steam VZ depot chunk decode`
   exactly once per process, and the install must complete and verify.
2. **Native vs pure-JS throughput on the same depot.** Pure-JS inside a SEA build is only reachable
   by a local, uncommitted flip of the constant plus a rebuild. This settles the spike-023 vs
   `b79765af2` tension (is the ~5.8-6.6x figure real through the post-`b79765af2` adapter?). When
   measured, correct the speedup clause in the engaged `logInfo` in `lzmaLoader.ts`.
3. **Not Mac-specific:** read CI's first ubuntu-latest result for `lzmaNativeSeaRealBuild.test.ts`
   with native ON (the first linux-x64 real-SEA native run), and record it.

## If a decode hang recurs

Capture full system state first (thermal, memory pressure, concurrent I/O, not just CPU load; that
is the only evidence the 2026-08-18 closure asked for), then follow the turn-off steps in
`lzmaLoader.ts`'s `NATIVE_LZMA_DECODE_ENABLED` doc comment. Turning native off is the lever for a
native-specific failure; it is not expected to cure a pool-timeout hang of the 2026-08-18 kind,
which reproduced with native off.

## Related

On win32 native does not engage at all (see
`2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded`).
