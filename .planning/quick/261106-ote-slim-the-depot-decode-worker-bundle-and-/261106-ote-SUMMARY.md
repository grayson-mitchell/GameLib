---
phase: quick-261106-ote
plan: 01
status: complete
subsystem: steam-depot-download
tags: [decompress, worker_threads, memory, perf]
requirements: [TODO-2026-11-05-slim-decode-worker]
key-files:
  created:
    - src/backend/storeManagers/steam/depot/chunkDecode.ts
    - src/backend/storeManagers/steam/depot/lzmaLoaderCore.ts
  modified:
    - src/backend/storeManagers/steam/depot/decompress.ts
    - src/backend/storeManagers/steam/depot/lzmaLoader.ts
    - src/backend/storeManagers/steam/depot/decompressWorker.ts
    - src/backend/storeManagers/steam/depot/decompressPool.ts
    - src/backend/storeManagers/steam/__tests__/decompressWorkerRealBuild.test.ts
    - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
commits: [b8f015a08, db95a4373, 0528027ac, 7655f4d44, b0af46618]
---

# Quick 261106-ote: Slim the depot decode worker and shrink its pool

Worker bundle 14,243,004 -> 278,516 bytes; idle pool RSS 2,668 -> 290 MiB at 16 workers; default pool is now min(cpus, 4) when native.

## What changed

- `chunkDecode.ts` (leaf): decodeChunk, decompressChunk, sha1, ChunkDecodeError, LzmaModule moved verbatim from `decompress.ts`. Imports only node:crypto, ./crypto, dynamic node:zlib / zstddec. `decompress.ts` re-exports decodeChunk/decompressChunk/sha1/LzmaModule so every importer (including 067b node-bench.ts) is unchanged.
- `lzmaLoaderCore.ts` (git mv of old lzmaLoader): logger-free, injectable `setLzmaLoaderLogSink` with buffering until a sink exists. New thin `lzmaLoader.ts` wires the sink to backend/logger and re-exports the API (decompressPool.test.ts isolateModules logger assertions pass unedited).
- `decompressWorker.ts`: imports only chunkDecode + lzmaLoaderCore; no backend/logger, no initLogger. Buffered log entries ride on the `ready` message (`logs`), later ones as `{type:'log'}`.
- `decompressPool.ts`: forwards worker logs to logInfo/logWarning (shape-validated); `decompressPoolSizeFor(cpus, allNative)`; unpinned pool starts at min(cpus,4) and grows to min(cpus,16) only if a spawned worker is non-native; growth failure keeps the base pool; env override / opts.size pin.

## Measurements

| Check | Result |
|---|---|
| `build/main/decompressWorker.js` | 14,243,004 B -> 278,516 B |
| 067a RSS after init, pool 1 / 4 / 16 | 160 / 186 / 290 MiB (was 342 / 817 / 2,668) |
| 067a default pool (no override) | size 4, nativeWorkers 4, 185 MiB |
| 067b bench `PASSES=1` | 0 sha1 mismatches across all rows (978 chunks) |
| jest: decompressWorkerRealBuild, decompressPool, depot, depotPrimitives | 381 passed |
| jest: lzmaNativeSeaRealBuild (cold SEA build) | 3/3 passed, native engaged on every worker |
| `pnpm codecheck` | exit 0 |
| `pnpm lint` | 0 errors (1124 pre-existing warnings) |
| `pnpm find-deadcode` | OK (45 / 0, no baseline edits) |
| scoped `prettier --check` | passes on every src path written |
| `pnpm planning-gates` | 12/12 pass |

## Deviations from Plan

1. **[Rule 1 - Bug] Log forwarder crashed the process when the logger is uninitialized.** Found by lzmaNativeSeaRealBuild.test.ts (all 3 tests timed out): the sidecar `decompress-pool` self-test never boots backend/logger, so `logInfo` threw inside a worker 'message' handler (uncaught exception). `forwardWorkerLog` now try/catches and falls back to `console.error`. Commit 0528027ac.
2. **[Plan variance] `resetLzmaLoaderForTests()` keeps the installed sink** (plan said clear sink and buffer). Clearing the sink after the wrapper installed it once at module load broke decompressPool.test.ts logger assertions; it now clears only the buffer.
3. **[Rule 1] Slimming commit shipped one lint error and two dead exports** (unneeded `as string[]` casts, exported `LzmaLogLevel`/`LzmaLogSink`, a `LzmaDecoderKind` re-export nobody imports); fixed in db95a4373 / 7655f4d44, not left in baseline.
4. The bundle-text assertion for `src/backend/logger` / `node_modules/steam-user` worked as planned (dev bundle keeps path comments).
5. `jest.spyOn(os, 'cpus')` needed a `require('node:os')` handle (an `import * as` namespace copy would not be seen by the pool); no test-only `cpus` opt was added.
6. The `pnpm planning-gates`-clean todo move landed in b0af46618; the todo's Resolution section carries the numbers above.

## Not done

- Live native install via 067a `run.sh` (throughput at network ceiling, peak RSS) is left as the todo's optional follow-up; not run desk-side.

## Self-Check: PASSED

Files exist (chunkDecode.ts, lzmaLoaderCore.ts, completed todo); commits b8f015a08, db95a4373, 0528027ac, 7655f4d44, b0af46618 in `git log`; pending todo removed.
