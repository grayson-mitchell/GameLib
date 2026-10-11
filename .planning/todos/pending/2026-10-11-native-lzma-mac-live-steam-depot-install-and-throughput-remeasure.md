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

## Measured 2026-10-12 (item 2, codec half: done)

Decode of spike 023's real-bytes 1 MiB VZ chunk (`fixtures/real-vz-chunk.bin`, sha1
`2e461366…`) through the shipped code path (`decompressChunk()` + `loadLzmaModule()`, toggled by
`setNativeLzmaDecodeEnabledForTests`), 15 timed runs per arm after 3 warm-ups, both arm orders
twice, sha1 match on every arm, darwin-arm64:

| `lzma-native` binary loaded                                  | liblzma | native ms | pure-JS ms | speedup   |
| ------------------------------------------------------------ | ------- | --------- | ---------- | --------- |
| `prebuilds/darwin-arm64/node.napi.node` (the one SEA embeds) | 5.4.3   | 14.3-15.1 | 88.0-90.3  | 5.95-6.24x |
| `build/Release/lzma_native.node` (local source build)        | 5.2.3   | 32.4-34.5 | 81.3-83.5  | 2.42-2.52x |

- **The adapter costs nothing.** Raw `createStream('aloneDecoder')` on the 5.2.3 build with the
  size field already `0xFF×8` takes 32.7 ms, the same as through the adapter.
- **The spike-023 tension was the library version.** Spike 023's `node_modules` has no
  `build/Release`, so `node-gyp-build` loaded the 5.4.3 prebuild. The repo's `node_modules` on this
  Mac has a source build (dated 2026-08-23, origin unrecorded). `node-gyp-build` prefers it. The
  two prebuilds are byte-identical (sha1 `d7e21980…`). 5.4.3 also decodes the known-size+EOS
  header that 5.2.3 rejects, so `b79765af2` was needed only for that local source build.
  `lzma-native` is not in `pnpm-workspace.yaml`'s `onlyBuiltDependencies`, so a fresh install
  never produces `build/Release`.
- **What this means for item 1:** a `pnpm tauri:dev` install on this Mac runs the slower
  5.2.3 build. Only a SEA build (or deleting `node_modules/lzma-native/build/`) exercises the
  5.4.3 binary that ships.
- The engaged `logInfo` and the `NATIVE_LZMA_DECODE_ENABLED` doc comment in `lzmaLoader.ts`
  were corrected to these figures.

Still open: item 1 (live install, end-to-end throughput) and item 3. On 2026-10-12, native-ON
(`7255c2507`) was not yet an ancestor of `origin/main`, and `test.yml` runs only on pushes to
`main`/`stable` and on PRs, so there is no linux-x64 result to read yet.

## If a decode hang recurs

Capture full system state first (thermal, memory pressure, concurrent I/O, not just CPU load; that
is the only evidence the 2026-08-18 closure asked for), then follow the turn-off steps in
`lzmaLoader.ts`'s `NATIVE_LZMA_DECODE_ENABLED` doc comment. Turning native off is the lever for a
native-specific failure; it is not expected to cure a pool-timeout hang of the 2026-08-18 kind,
which reproduced with native off.

## Related

On win32 native does not engage at all (see
`2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded`).
