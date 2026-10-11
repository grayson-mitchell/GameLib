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

## Live install 2026-10-12 (item 1: done)

Baldur's Gate II: Enhanced Edition (appId 257350), installed natively under `pnpm tauri:dev`
(vault mode) on darwin-arm64. The local 5.2.3 `build/` was moved aside first, so `node-gyp-build`
loaded the 5.4.3 prebuild, the same binary the SEA embeds. Two macOS depots (257352, 257354),
2465 files, 3,901,662,055 bytes on disk, buildid 23534562.

- **Engaged line: 10, not 1.** It is logged once per decode-worker isolate (module-scope memo per
  isolate), and the pool is `size=10`. Item 1's "exactly once per process" was wrong; the log
  line and the header comment in `lzmaLoader.ts` now say "once per isolate". Zero fallback or
  disabled warnings.
- **Completed and verified:** `percent=100%`, `StateFlags=4`, the badge flipped to installed,
  and `verifyMacArchGroundTruth` resolved `mac_arch '64'`. Zero `sha1_mismatch`, `size_mismatch`,
  `ChunkDecodeError` or `Data is corrupt` lines. `inline=false` throughout.
- **Throughput:** about 285 s from first bytes (10:15:20) to `percent=100%` (10:20:05), about
  13 MiB/s average. 5946 attempts, 97 timeouts, 99 rotations, 6 hosts.
- **Decode is not the bottleneck on this link.** `avgDecodeMs` was 17-26 against `avgNetMs`
  1166-2375. The pool showed 9-10 of 10 workers idle in every stats line.

**Item 2 end-to-end is effectively answered without a pure-JS reinstall.** At ~6x, pure-JS
decode would be roughly 100-150 ms per chunk. That is still about 10% of a ~1.2 s fetch, and
10 workers were almost always idle. On this connection a pure-JS run would finish in about the
same wall time, so the ~6x is a CPU and latency win, not a throughput one. A pure-JS reinstall
only becomes worth doing on a link fast enough to keep the pool busy. One caveat: the log does
not count VZ versus VSZa (zstd) chunks, so the LZMA share of `avgDecodeMs` is not separated
out.

## CI linux-x64 (item 3: done)

`workflow_dispatch` run [38176505164](https://github.com/grayson-mitchell/GameLib/actions/runs/38176505164)
of `test.yml` on `quick-261002-b63` at `e764ed9f9`, ubuntu-latest:
`PASS src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts (17.651 s)`.
The suite has no skip branch, and all three tests assert against a real, cold-built SEA binary:
`nativeWorkers === size` with `inlineFallback: false`, and a correct real-sized decode on the
native path. So native engages on every worker in a linux-x64 SEA, unlike win32. This was
reachable before the merge to `main` because `test.yml` also has a `workflow_dispatch` trigger.

The run itself ended red on four tests, none of them LZMA: `lintTranslations` and
`comparePresenceBaseline` (96 `library.tileSize.*` keys unfilled, from `fa3f581ce`, quick
261011-t4y), and `logSecretGate` (raw winetricks `stdout` logged at `src/backend/tools/index.ts:1160`,
from `3084aab25`). Both reproduce locally and both block this branch's merge to `main`.

## Resolution (2026-10-12)

All three items done. Native decode is correct on real depot bytes end to end on darwin-arm64
(BG2:EE), engages on linux-x64 in a real SEA, and decodes ~6x faster than pure-JS with the
shipped 5.4.3 prebuild. On the measured connection that speedup does not shorten an install,
because fetch dominates. The `lzmaLoader.ts` speedup clause and the once-per-isolate wording
were corrected in `4f8bc5539` and `3f421e41c`. Win32 stays tracked separately.

## If a decode hang recurs

Capture full system state first (thermal, memory pressure, concurrent I/O, not just CPU load; that
is the only evidence the 2026-08-18 closure asked for), then follow the turn-off steps in
`lzmaLoader.ts`'s `NATIVE_LZMA_DECODE_ENABLED` doc comment. Turning native off is the lever for a
native-specific failure; it is not expected to cure a pool-timeout hang of the 2026-08-18 kind,
which reproduced with native off.

## Related

On win32 native does not engage at all (see
`2026-10-11-win32-sea-native-lzma-falls-back-liblzma-dll-not-embedded`).
