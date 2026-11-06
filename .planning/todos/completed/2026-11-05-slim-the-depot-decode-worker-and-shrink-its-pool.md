---
created: 2026-11-05T19:09:22.064Z
title: "Depot decode-worker pool holds ~2.5 GB RSS before any work: slim the worker bundle and shrink the pool"
area: steam-depot-download
files:
  - src/backend/storeManagers/steam/depot/decompressWorker.ts (imports ./decompress, ./lzmaLoader, backend/logger)
  - src/backend/storeManagers/steam/depot/decompress.ts (decoder lives beside fetchChunk; imports ./cdnAuth, ./hostHealth, ./inflightLimiter, backend/logger)
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts (imports backend/logger)
  - src/backend/storeManagers/steam/depot/decompressPool.ts (DECOMPRESS_POOL_MAX_WORKERS = 16, min(cpus, 16))
  - src/backend/storeManagers/steam/depot.ts (pool created ~2960, shut down ~3802, per downloadDepotFiles run)
  - meta/esbuildWorkerBundleShared.ts (shared worker entry for the dev bundle and the SEA asset)
severity: medium
platform: any
ready: code
---

## Problem

Found by spikes 067a/067b (2026-11-06, `.planning/spikes/067a-*`, `067b-*`). A native Steam
depot install peaked at **2.75 GB RSS** while doing about one core of work. Nearly all of it is
the decode-worker pool, sitting idle:

| Pool size | RSS after `DecompressPool.init()`, no work done |
|---|---|
| 1 | 342 MiB |
| 4 | 817 MiB |
| 16 | 2,668 MiB |

About **160 MiB per idle worker.** Two causes, both in Node:

1. **The worker bundle is 14 MB** (`build/main/decompressWorker.js`). The worker needs AES,
   zlib, `lzma-native` and zstd, but its imports pull in most of the backend: steam-user enums
   and protobufs, `@discordjs/rest`, axios, ajv, conf and more. The chain runs through
   `backend/logger` (imported by `decompressWorker.ts`, `decompress.ts` and `lzmaLoader.ts`) and
   through `decompress.ts` itself, which holds the decoder next to `fetchChunk` and its CDN
   imports (`./cdnAuth`, `./hostHealth`, `./inflightLimiter`). The packaged SEA builds the same
   entry (`meta/esbuildWorkerBundleShared.ts`), so shipped builds pay this too.
2. **The pool is far larger than the work.** It spawns `min(cpus, 16)` workers; 16 on any
   machine with 16+ cores. 067a measured decode at 3 ms per chunk against 534 ms per download,
   about **0.2 workers busy on average** (58 chunks/s × 3 ms) at 18 MiB/s. The pool was never
   saturated and its queue never grew, at the production in-flight budget of 32 or at 96.

The cost lasts only while an install runs: the pool is created per `downloadDepotFiles` run and
shut down after it. On a typical 8–10-core machine it is about 1.3–1.6 GB.

## Solution

Both halves, in this order:

1. **Slim worker entry.** Move `decodeChunk`/`decompressChunk` (and `ChunkDecodeError`) out of
   `decompress.ts` into a leaf module that imports only `node:crypto`, `./crypto`, `node:zlib`,
   `zstddec` and the LZMA module. Have the worker report problems to the parent over
   `postMessage` instead of importing `backend/logger`. Check `lzmaLoader.ts`'s logger use the
   same way. Target: a worker bundle well under 1 MB and per-worker RSS in the tens of MiB.
2. **Smaller pool.** Cap well below 16 (e.g. 4), or start at 1–2 and grow only while the queue
   is non-empty. Keep `GAMELIB_DECOMPRESS_POOL_SIZE` working as the diagnostic override.
   Caution from the August `humankind-depot-full-stall` debug: when workers ran **pure-JS**
   LZMA (~500 ms per chunk), a 4-worker pool was ~2.4× slower. That no longer applies with
   native workers (3 ms per chunk), but if `inlineFallback` or a pure-JS worker is ever active,
   a small pool would bind again; size from `nativeWorkers`, not a constant alone.

Not a reason to port the pipeline to Rust: 067b found Rust decodes at the same 177 MiB/s with
~38% less decode CPU (~8% of the pipeline's total), and the memory is fixable here.

## Verify

- RSS probe, desk-runnable, no sign-in: build 067a's harness
  (`.planning/spikes/067a-node-pipeline-stage-profile/build.sh`) and run it with `SPIKE_SMOKE=1`
  and `GAMELIB_DECOMPRESS_POOL_SIZE` set to 1, 4 and 16. It prints `rssAfterInitMiB`. Compare
  against the table above.
- Worker bundle size: `ls -la build/main/decompressWorker.js` after
  `pnpm build:decompress-worker-dev`.
- Decode correctness: the existing depot/decompress jest suites, plus 067b's bench
  (`PASSES=1 node .planning/spikes/067b-chunk-decode-bench/state/build/node-bench.js`), which
  checks every chunk's SHA1.
- Optional live check (would make this `ready: live-gate` if required): one native install with
  067a's `run.sh`, confirming throughput stays at the network ceiling and peak RSS drops.

## Resolution

Closed by quick task 261106-ote (2026-11-06), commits b8f015a08, db95a4373,
0528027ac and 7655f4d44.

- **Worker bundle:** `build/main/decompressWorker.js` went from 14,243,004
  bytes to 278,516 bytes. The decoder moved to a leaf `chunkDecode.ts`, the
  LZMA loader split into a logger-free `lzmaLoaderCore.ts`, and the worker's
  once-per-worker decoder log line now reaches the parent over `postMessage`
  (the parent logs it). `decompressWorkerRealBuild.test.ts` guards the size
  (under 1 MiB) and that `backend/logger` and `steam-user` stay out of it.
- **Pool size:** an unpinned pool starts at `min(cpus, 4)` and grows to
  `min(cpus, 16)` only when a spawned worker reports a non-native decoder.
  `GAMELIB_DECOMPRESS_POOL_SIZE` and `opts.size` pin it exactly.
- **RSS after `DecompressPool.init()` (067a smoke harness):**

  | Pool size | Before | After |
  |---|---|---|
  | 1 | 342 MiB | 160 MiB |
  | 4 | 817 MiB | 186 MiB |
  | 16 | 2,668 MiB | 290 MiB |
  | default (4 here) | 2,668 MiB at 16 | 185 MiB |

- **Decode correctness:** 067b's bench (`PASSES=1`) reports 0 sha1 mismatches
  across all 978 chunks, and `lzmaNativeSeaRealBuild.test.ts` passes against a
  cold SEA build (native engaged on every worker).
- **Found on the way:** the pool's worker-log forwarder threw when
  `backend/logger` was uninitialized (the sidecar self-test never boots it),
  crashing the process from a worker message handler. It now falls back to
  stderr.

Optional follow-up: one live native install via 067a's `run.sh` to confirm
throughput stays at the network ceiling and peak RSS drops.
