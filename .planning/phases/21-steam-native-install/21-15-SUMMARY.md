---
phase: 21-steam-native-install
plan: 15
subsystem: infra
tags: [worker_threads, lzma, decompression, performance, electron-vite, steam]

# Dependency graph
requires:
  - phase: 21-steam-native-install
    provides: "depot chunk fetch/decrypt/decompress/verify pipeline (fetchChunk, decompressChunk, sha1) and the streaming downloadDepotFiles loop this plan re-wires"
provides:
  - "decodeChunk: the extracted, single-sourced CPU section (decrypt -> decompress -> sha1/size integrity gate) of a chunk fetch, injectable into fetchChunk via a DecodeFn param"
  - "DecompressPool: a bounded worker_threads pool (min(cores,8)) with transferable ArrayBuffers, per-task timeout+terminate+replace recovery, and transparent inline fallback"
  - "decompressWorker.ts: the worker_threads entry point, built by electron-vite alongside main.js in both dev and packaged builds"
  - "downloadDepotFiles now decodes chunks off the Electron main thread by default"
affects: [steam-native-install, performance, download-manager]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected-decoder pattern: fetchChunk takes an optional DecodeFn (default = inline decodeChunk) so a worker pool can be swapped in without touching the network/retry loop"
    - "Explicit ready-handshake for worker_threads spawn-success detection (not the generic 'online' event, which fires before a bad entry path's module-not-found error surfaces)"
    - "allWorkers tracking set (superset of the currently-active worker set) so shutdown() can terminate+await every worker ever spawned, including ones removed on the failure path or racing an in-flight replacement"

key-files:
  created:
    - src/backend/storeManagers/steam/depot/decompressPool.ts
    - src/backend/storeManagers/steam/depot/decompressWorker.ts
    - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
    - src/backend/storeManagers/steam/__tests__/fixtures/poolTestWorker.js
  modified:
    - src/backend/storeManagers/steam/depot/decompress.ts
    - src/backend/storeManagers/steam/depot.ts
    - electron.vite.config.ts

key-decisions:
  - "decompressWorker.ts sends an explicit {type:'ready'} handshake after its module graph loads; DecompressPool's spawnWorker() keys off this message (not worker_threads' 'online' event) since 'online' fires BEFORE a bad/missing entry-path's module-not-found error surfaces — using 'online' alone made init()/replaceWorker() misidentify an about-to-fail worker as successfully spawned"
  - "DecompressPool tracks 'allWorkers' (every worker ever spawned) separately from 'workers' (currently active) so shutdown() terminates+awaits workers already removed on the failure path, not just the live set"
  - "shutdown() sets a shuttingDown flag FIRST and awaits any in-flight replaceWorker() spawn before its final terminate sweep, closing a race where a replacement worker finishing spawn concurrently with shutdown() would otherwise never be tracked/terminated"
  - "Pool-integration tests (concurrency, throw-isolation, timeout-recovery, fallback) run against a plain-CommonJS test fixture (fixtures/poolTestWorker.js) that mirrors decompressWorker.ts's wire protocol and decode algorithm, because a real worker_threads.Worker loads its own module graph via Node's native loader and cannot parse the project's TypeScript source directly under ts-jest; production build wiring is verified separately via electron-vite build + a spawn-online + real-decode smoke test against the actual built output"

requirements-completed: [SNI-01, SNI-03]

# Metrics
duration: 45min
completed: 2026-07-16
---

# Phase 21 Plan 15: LZMA Depot Decompression Worker Pool Summary

**Moved Steam native-install chunk decompression (decrypt -> LZMA/zlib decompress -> sha1 verify) off the Electron main thread onto a bounded worker_threads pool, closing UAT gap D-UAT-03, with a fully transparent inline fallback and verified production build wiring.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-07-16T21:00:00+12:00 (approx)
- **Completed:** 2026-07-16T22:28:40+12:00
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- Extracted the CPU section of `fetchChunk` (decrypt -> decompress -> sha1/size integrity gate) into a standalone, exported `decodeChunk` function, single-sourcing the T-21-03 integrity gate regardless of where decode runs
- Built `DecompressPool`: spawns `min(os.cpus().length, 8)` workers, dispatches with transferable ArrayBuffers (the depot key is copied per-message, never transferred, since it's reused across every chunk), enforces a per-task timeout that terminates + replaces a stalled worker, and falls back transparently to inline main-thread decode if the pool cannot initialize
- Wired the pool into `downloadDepotFiles`: constructs, inits, and shuts down the pool around the existing streaming download loop, threading `pool.decode` through `downloadSingleFile` -> `downloadFileChunks` -> `fetchChunk` with zero changes to the cross-server retry loop, memory-bound streaming, containment checks, or whole-file SHA1 verify
- Verified the worker resolves in a real electron-vite production build (not just ts-jest): `build/main/decompressWorker.js` is emitted alongside `build/main/main.js`, and a real `worker_threads.Worker` spawned from the built file comes online and correctly decodes a real VZ (LZMA) fixture chunk end-to-end
- Found and fixed a genuine worker_threads correctness bug during pool testing (not just a test artifact): `'online'` fires before a bad entry path's module-not-found error surfaces, and a fire-and-forget `replaceWorker()` could race `shutdown()` and orphan a worker — both fixed with an explicit ready-handshake and a `shuttingDown` flag + in-flight-replacement tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract decodeChunk + build the worker entry and build wiring** - `e0b214ab` (feat)
2. **Task 2: Build the DecompressPool (bounded fan-out, transferables, timeout+recover, fallback)** - `f59d59aa` (feat)
3. **Task 3: Wire the pool into downloadDepotFiles + verify the worker loads in a production build** - `60bacfda` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/backend/storeManagers/steam/depot/decompress.ts` - extracted `decodeChunk` (decrypt -> decompress -> sha1/size gate) out of `fetchChunk`; `fetchChunk` now delegates to an injected `DecodeFn` param defaulting to inline `decodeChunk`
- `src/backend/storeManagers/steam/depot/decompressWorker.ts` - new worker_threads entry: `handleDecodeMessage` runs `decodeChunk` and returns a decompressed ArrayBuffer or a stringified error; the `parentPort` listener posts success responses with a transfer list and sends an explicit `{type:'ready'}` handshake once its module graph has loaded
- `src/backend/storeManagers/steam/depot/decompressPool.ts` - new `DecompressPool` class: bounded worker fan-out, transferable dispatch, per-task timeout+terminate+replace, inline fallback, and full worker lifecycle tracking (`allWorkers`, in-flight replacement awaiting) so `shutdown()` never leaks a worker
- `src/backend/storeManagers/steam/depot.ts` - `downloadDepotFiles` constructs/inits/shuts down a `DecompressPool` around the existing streaming download loop; `decode` threaded through `downloadSingleFile` and `downloadFileChunks`
- `electron.vite.config.ts` - `main.build.rollupOptions.input` changed from a bare string to an object map (`{ main, decompressWorker }`) so electron-vite emits `build/main/decompressWorker.js` alongside `build/main/main.js` in both dev and packaged builds
- `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` - new suite: `decodeChunk` round-trip (VZ+PK)/integrity/malformed-buffer tests, worker message-handler tests, and `DecompressPool` integration tests (round-trip, 20-way concurrency, throw-isolation, timeout-recovery, fallback) — 13 tests, all passing
- `src/backend/storeManagers/steam/__tests__/fixtures/poolTestWorker.js` - plain-CommonJS test-only worker fixture mirroring `decompressWorker.ts`'s wire protocol, used because a real `worker_threads.Worker` cannot load TypeScript source directly under ts-jest

## Decisions Made

- **Ready-handshake over `'online'` for spawn-success detection:** `worker_threads`' `'online'` event fires as soon as the worker's JS environment starts — BEFORE a bad/missing entry-path's module-not-found error surfaces. Relying on `'online'` alone made `init()`/`replaceWorker()` treat an about-to-fail worker as successfully spawned, causing the pool's fallback test to intermittently fail and, worse, causing an infinite respawn loop in one debugging session when a persistently-bad path kept "succeeding" then immediately erroring. Fixed by having `decompressWorker.ts` post an explicit `{type:'ready'}` message only after its own module graph has fully resolved; `DecompressPool.spawnWorker()` now keys off that message instead.
- **`allWorkers` tracking separate from the active `workers` set:** a worker removed from `workers` after a timeout/error still holds a live parent-side handle until its own `terminate()` promise settles. `shutdown()` now terminates+awaits every worker the pool ever spawned (via `allWorkers`), not just the currently-active set, so no worker is ever left un-awaited.
- **`shuttingDown` flag + in-flight-replacement awaiting:** `replaceWorker()` is fired-and-forgotten from the failure-handling path. If `shutdown()` runs while a replacement is mid-spawn, the replacement could finish AFTER `shutdown()`'s snapshot of `allWorkers`, orphaning a live worker. `shutdown()` now sets `shuttingDown = true` first and awaits all in-flight `replaceWorker()` promises before its final terminate sweep; `replaceWorker()` itself also checks the flag post-spawn and self-terminates rather than onboarding into a dead pool.
- **Pool-integration tests use a plain-JS fixture, not the real `.ts` worker:** `worker_threads.Worker` loads its own module graph via Node's native loader, which cannot parse TypeScript directly (ts-jest only transforms code running inside the jest process itself). `fixtures/poolTestWorker.js` duplicates `decompressWorker.ts`'s wire protocol and decode algorithm in plain CommonJS so pool mechanics (concurrency, throw-isolation, timeout-recovery, fallback) can be exercised against a real OS thread in Jest. Production build wiring is verified separately (Task 3) via `electron-vite build` + a spawn-online + real-VZ-decode smoke script run directly against the actual built `build/main/decompressWorker.js`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Worker-spawn success falsely signaled by `'online'` before a module-not-found error surfaces**
- **Found during:** Task 2 (writing the `DecompressPool` fallback test — a deliberately-invalid `workerPath`)
- **Issue:** `new Worker(badPath)` fires `'online'` before Node's module resolver raises the `Cannot find module` error a fraction of a second later. `spawnWorker()` originally resolved on `'online'`, so `init()` believed a doomed worker had spawned successfully; when it then failed, `handleWorkerFailure`'s `replaceWorker()` spawned another worker at the SAME bad path, which ALSO "succeeded" on `'online'` before failing — an infinite respawn loop that pegged CPU and hung the jest process indefinitely (confirmed via isolated raw-Node repro showing `'online'` fires before `'error'` for a missing entry file).
- **Fix:** Added an explicit `{type:'ready'}` handshake message in `decompressWorker.ts`, sent only after the module's own require graph has resolved (i.e., after the real message listener is registered). `DecompressPool.spawnWorker()` now resolves on that message instead of `'online'`, making success detection deterministic rather than timing-dependent.
- **Files modified:** `src/backend/storeManagers/steam/depot/decompressWorker.ts`, `src/backend/storeManagers/steam/depot/decompressPool.ts`, `src/backend/storeManagers/steam/__tests__/fixtures/poolTestWorker.js`
- **Verification:** All 13 `decompressPool.test.ts` tests pass; the fallback and timeout-recovery tests (which previously triggered the loop) now pass deterministically across repeated runs with the jest process exiting cleanly.
- **Committed in:** `f59d59aa` (Task 2 commit)

**2. [Rule 1 - Bug] `shutdown()` could leak a worker racing an in-flight `replaceWorker()`**
- **Found during:** Task 2 (debugging a persistent "jest did not exit" hang in the timeout+replace test even after the `'online'`/ready-handshake fix)
- **Issue:** `handleWorkerFailure` calls `replaceWorker()` fire-and-forget. If `shutdown()` runs while that replacement is still mid-spawn, `shutdown()`'s snapshot of `allWorkers` (or the prior `workers`-only sweep) would not include the not-yet-onboarded replacement, which then finishes spawning and gets pushed into the pool's live worker set AFTER `shutdown()` has already returned — an orphaned, never-terminated worker (confirmed by isolated active-handle-count debugging showing exactly one MessagePort surviving `shutdown()` in the timeout+replace scenario).
- **Fix:** Added a `shuttingDown` flag set at the start of `shutdown()`, plus an `inFlightReplacements` set tracking every `replaceWorker()` promise. `shutdown()` awaits all in-flight replacements before its final terminate sweep; `replaceWorker()` also checks `shuttingDown` after its own spawn resolves and self-terminates rather than onboarding if the pool is already tearing down.
- **Files modified:** `src/backend/storeManagers/steam/depot/decompressPool.ts`
- **Verification:** The "worker that hangs past the per-task timeout" test now leaves zero active handles after `shutdown()` (confirmed via `process._getActiveHandles()` instrumentation, since removed); the full `decompressPool.test.ts` suite and the full steam suite (462 tests) both exit cleanly across repeated runs with no `--forceExit` needed.
- **Committed in:** `f59d59aa` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs discovered and fixed during the plan's own test-writing, not scope creep)
**Impact on plan:** Both fixes are correctness requirements for the pool's own LOCKED behaviors (fallback-on-init-failure, timeout-terminate-replace) explicitly specified in the plan — without them, the pool's core safety guarantees would not actually hold in a real failure scenario (a persistently-bad worker path, or a shutdown racing a recovery-in-progress). No scope creep; no plan-specified functionality was skipped or altered.

## Issues Encountered

The plan's literal Task 3 verify command (`node -e "...new Worker('build/main/decompressWorker.js')..."`) throws `ERR_WORKER_PATH` on this environment's Node version (v26.2.0) because a bare relative path without a `./` prefix is rejected — `new Worker('./build/main/decompressWorker.js')` (with the prefix) works correctly and was used for the actual verification. This is a Node version/environment detail, not a code defect; no source files needed changing.

## User Setup Required

None — no external service configuration required. The `lzma` package (already a dependency) and Node built-ins (`worker_threads`, `node:crypto`, `node:zlib`, `node:os`) are the only runtime dependencies; no new packages were installed.

## Next Phase Readiness

- The worker pool is code-complete, unit-tested (13 pool/decode tests + full 462-test steam suite green), and verified to load and decode correctly from a real electron-vite production build output.
- **Not yet validated:** the plan's own `<verification>` section explicitly defers the real-world throughput claim ("a real large-game native install shows the UI stays responsive... and completes materially faster") to hardware UAT — this remains a manual verification item alongside the rest of Phase 21's outstanding `21-UAT.md` hardware checks (native `.acf` adoption, hard-DRM launch, cancel-recovery, bottled Steam adoption, client-setup flows).
- **Residual asar risk (acknowledged per plan, not resolved here):** `electron-vite build` output under `build/main/` is not the packaged artifact; `electron-builder.yml` packs the app into `app.asar`, and `worker_threads.Worker` resolving a `.js` path inside an asar archive can behave differently from loose output. This plan's build verification proves the bundle is emitted and loads from LOOSE `build/main/` output, not from inside a packaged `app.asar`. If the worker path fails to resolve inside a real packaged app, `decompressWorker.js`'s build output would need adding to `asarUnpack` in `electron-builder.yml` — flagged as a known residual to validate during packaged QA (`yarn dist:*` / CI), not blocking this plan's completion.
- Phase 21 remains gated on the 11 hardware UAT items in `21-UAT.md` before the milestone's core promise can be considered fully verified; this plan closes the D-UAT-03 performance gap specifically.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-16*

## Self-Check: PASSED

All 8 created/modified source files verified present on disk; all 3 task commit hashes (`e0b214ab`, `f59d59aa`, `60bacfda`) verified present in git history.
