---
phase: quick-260817-pkx
plan: 01
subsystem: infra
tags: [node-sea, worker_threads, esbuild, steam-depot, decompresspool, sidecar]

# Dependency graph
requires:
  - phase: quick-260817-ihr
    provides: "DECOMPRESS_POOL_MAX_WORKERS 8->16 fan-out cap raise (was inert until this fix)"
provides:
  - "A packaged macOS SEA sidecar that spawns real worker_threads for depot chunk decode instead of silently falling back to inline single-thread decode"
  - "A build-time SEA asset embedding mechanism (meta/buildSidecarSea.ts's bundleWorkerForSea/buildSeaConfig) reusable for any future worker-script-in-SEA-binary need"
  - "A runtime self-test entry (GAMELIB_SIDECAR_SELFTEST=decompress-pool) that proves worker_threads engagement in a packaged binary without a real game install"
affects: [phase-23-plan-23-10, steam-native-install-throughput, sea-sidecar-packaging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SEA asset embedding for worker_threads scripts: a second self-contained esbuild bundle registered in sea-config.json's `assets` map, read at runtime via node:sea.getAsset() and spawned with `new Worker(source, {eval:true})` — avoids the companion-file/externalBin/__dirname problem entirely for any future SEA-packaged worker script."
    - "Guarded node:sea require mirrored from humbleFlowRegistration.ts's isPackagedSidecar() — try/catch, fail-safe default, no top-level import."

key-files:
  created:
    - src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts
  modified:
    - meta/buildSidecarSea.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - src/backend/storeManagers/steam/depot/decompressPool.ts
    - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
    - src/sidecar/index.ts

key-decisions:
  - "Embed the worker bundle as a Node SEA asset (sea-config.json assets map) rather than shipping a companion file next to the binary — avoids Tauri externalBin/bundle-resources plumbing, per-triple copy steps, and __dirname/process.execPath divergence across OSes."
  - "Cache resolveWorkerSpec()'s result per-pool-instance so a multi-MB SEA asset string is read from node:sea.getAsset() at most once per process, not on every replaceWorker() recovery."
  - "Delete the build-time 'accepted throughput regression' warning and its runtime-log counterpart; add a source-scan test proving the deleted text cannot silently return."

patterns-established:
  - "Pattern 1: A build script producing multiple esbuild bundles for one SEA blob factors the shared flag list into a private helper (seaEsbuildFlags) so the two bundles' argv are diffed by a test rather than re-listed and risking silent drift."

requirements-completed: [PKX-01, PKX-02, PKX-03]

# Metrics
duration: ~21min
completed: 2026-08-17
---

# Quick Task 260817-pkx: SEA Sidecar Decompress-Worker Fix Summary

**Embedded decompressPool.ts's worker_threads script as a Node SEA asset so the packaged macOS sidecar binary actually spawns real workers for depot chunk decode, proven live on the compiled `gamelib-sidecar-aarch64-apple-darwin` binary — `inlineFallback:false`, 2 live idle workers, and a VZ/LZMA decode round trip through a worker isolate.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-17T06:30:00Z (approx, first commit 2026-08-17T06:30:58Z / 18:30:58+12:00)
- **Completed:** 2026-08-17T06:51:28Z
- **Tasks:** 3/3 completed
- **Files modified:** 5 modified, 1 created

## Accomplishments

- `meta/buildSidecarSea.ts` now produces a SECOND, fully self-contained esbuild bundle of `decompressWorker.ts` and embeds it into the SEA blob as a named `sea-config.json` asset (`decompressWorker.js`), instead of relying on a companion file the packaged binary never shipped.
- `decompressPool.ts`'s `resolveWorkerSpec()` reads that asset back at runtime via `node:sea.getAsset()` inside a packaged SEA binary and spawns it with `new Worker(source, { eval: true })`; the dev/Electron `__dirname`-relative path is unchanged and every pre-existing pool test still passes untouched (worker-path-override tests continue to win).
- A new `decompressPoolSelfTest.ts` + `GAMELIB_SIDECAR_SELFTEST=decompress-pool` entry guard in `src/sidecar/index.ts` lets the compiled binary itself prove worker engagement without a real game install.
- **LIVE-VERIFIED on the rebuilt macOS SEA binary** (not just jest): exit code 0, `inlineFallback:false`, `size:2`/`idle:2`, and a successful VZ/LZMA decode round trip through a real worker isolate.
- Deleted the misleading "accepted throughput regression" build-time warning and its runtime-log counterpart, both of which described a fallback that is now a genuine defect in a packaged binary — replaced with an accurate defect-reporting message and a source-scan test proving the old text cannot silently return.

## Task Commits

1. **Task 1: Embed the decompress worker bundle into the SEA blob as an asset** - `87841a030` (feat)
2. **Task 2: Resolve the worker from the SEA asset at runtime + add a packaged-binary self-test** - `c9c311d5c` (feat)
3. **Task 3: Live gate — prove workers spawn in the rebuilt macOS SEA binary** - no code commit (verification-only task; see LIVE GATE EVIDENCE below)

**Plan metadata:** pending (orchestrator commits SUMMARY.md/STATE.md/ROADMAP.md separately per this executor's constraints)

## Files Created/Modified

- `meta/buildSidecarSea.ts` - Adds `buildWorkerEsbuildArgv()`, `bundleWorkerForSea()`, `buildSeaConfig()` (with the `decompressWorker.js` asset entry), factors the shared flag list into `seaEsbuildFlags()`, wires `bundleWorkerForSea()` into `main()`, and replaces the deleted Pitfall-1 build-time warning with an accurate log line.
- `meta/__tests__/buildSidecarSea.test.ts` - Flag-parity (diffed, not re-listed), asset-wiring, and comment-stripped source-scan guard tests for the above, including a test proving the source-scan matcher can actually fail against the old warning text.
- `src/backend/storeManagers/steam/depot/decompressPool.ts` - `resolveWorkerSpec()` replaces `resolveWorkerPath()`; caches its result; `spawnWorker()`/`init()`/`replaceWorker()` all switch to spec-based resolution; `init()`'s fallback log line now correctly describes a packaged-SEA-binary fallback as a defect.
- `src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts` **(new)** - `runDecompressPoolSelfTest()`: synthetic 64KB VZ/LZMA round trip proving live worker engagement; never logs the key/ciphertext/decoded bytes (T-21-15-02 discipline).
- `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` - Four new `resolveWorkerSpec()` tests (source-kind under `isSea()=true`, path-kind under `isSea()=false`, override-wins regression guard, exact asset-key assertion) via `jest.doMock('node:sea', ...)` + `jest.isolateModules`.
- `src/sidecar/index.ts` - Adds the `GAMELIB_SIDECAR_SELFTEST=decompress-pool` static-import entry branch; the RPC loop (`init()`) does not start in self-test mode.

## Decisions Made

- SEA asset embedding chosen over a companion file specifically because it eliminates three separate per-platform failure surfaces at once (Tauri `externalBin` entry, release-matrix per-triple copy step, `__dirname`/`process.execPath` resolution) rather than fixing them individually.
- `resolveWorkerSpec()`'s result is cached per pool instance (not re-read from `node:sea.getAsset()` on every `replaceWorker()` recovery) since the asset never changes within a process and can be multi-MB.
- Followed the plan's fallback contingency in spirit (a tmpdir-write fallback was documented as available if `{eval:true}` proved unusable) but it was **not needed** — the live gate passed on the first rebuild with the `eval` approach.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected two stale `eslint-disable-next-line` rule names in newly-written code**
- **Found during:** Task 2 (`decompressPool.ts`'s `resolveWorkerSpec()`, `decompressPool.test.ts`'s `jest.isolateModules` blocks)
- **Issue:** The plan instructed mirroring `humbleFlowRegistration.ts`'s `isPackagedSidecar()` guard shape "including its eslint-disable-next-line comment" verbatim. That reference implementation's comment names `@typescript-eslint/no-var-requires`, but the project's current eslint config actually reports `@typescript-eslint/no-require-imports` for a bare `require()` call — the old rule name is a no-op disable directive, and using it verbatim produced 5 real lint errors across the files this task touched (plus an "unused eslint-disable directive" warning on each).
- **Fix:** Changed the disable-directive rule name to `@typescript-eslint/no-require-imports` in `decompressPool.ts` and the four `jest.isolateModules` blocks in `decompressPool.test.ts`; also repositioned the directive comment in `decompressPool.ts` to sit immediately before the `require()` line (a multi-line explanatory comment above it meant `eslint-disable-next-line` was disabling the wrong line).
- **Files modified:** `src/backend/storeManagers/steam/depot/decompressPool.ts`, `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`
- **Verification:** `npx eslint` clean on both files after the fix.
- **Committed in:** `c9c311d5c` (Task 2 commit)

**2. [Rule 1 - Bug] Switched `decompressPoolSelfTest.ts`'s `lzma` import from `require()` to the project's typed static import**
- **Found during:** Task 2 (writing `decompressPoolSelfTest.ts`)
- **Issue:** The plan's fixture-lifting instruction implicitly suggested requiring `lzma`, but the project already ships a proper `declare module 'lzma'` type declaration (`src/common/typedefs/lzma.d.ts`) and every other consumer (including the test file this module lifts fixtures from) uses `import * as lzma from 'lzma'`. A `require()` here would have been an unnecessary, un-typed deviation from house style.
- **Fix:** Used `import * as lzma from 'lzma'`, matching `decompressPool.test.ts`'s own `compressAsync()` fixture exactly.
- **Files modified:** `src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts`
- **Verification:** `npx tsc --noEmit` clean; `npx eslint` clean on this file.
- **Committed in:** `c9c311d5c` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bug fixes to keep newly-authored code lint/type-clean)
**Impact on plan:** Both fixes are scoped entirely to code this task authored. No scope creep — the pre-existing stale-rule-name issue in `humbleFlowRegistration.ts` itself (the file this task's code mirrors) was left untouched and is logged in `deferred-items.md` instead.

## Issues Encountered

- **Executor error, self-corrected:** mid-Task-1, a `git diff` inspection step (used to distinguish this task's own uncommitted work from unrelated leftover uncommitted work in the working tree) was mistakenly run as `git stash` instead — a destructive-git-prohibition violation. Recovered immediately: `git stash list` confirmed only one stash existed (created moments earlier, matching the current HEAD's commit message, with no evidence of a concurrent session's work underneath it), and `git stash pop` restored all uncommitted changes intact before any further edits were made. No work was lost; verified via `git diff --stat` and a grep for the newly-added symbols immediately after the pop.
- **Observed but out of scope:** running the self-test entry (`GAMELIB_SIDECAR_SELFTEST=decompress-pool`) still prints a few lines from `backend/sidecar/bootstrap.ts`'s module-scope side effects before the `SELFTEST` lines (a `downloadQueueFlowRegistration` boot message and one `{"id":...,"kind":"rustInvoke","channel":"tray_set_icon",...}` JSON line) — this is inherent to `src/sidecar/index.ts`'s pre-existing "thin, unconditional entry" design (importing `backend/sidecar/bootstrap` always executes its module scope, regardless of whether `init()` itself is called) and predates this task. It does not affect the self-test's own PASS/FAIL signal (the `SELFTEST`-prefixed lines and exit code are unaffected), but is noted here since a future consumer of this self-test's stdout should be aware the output is not perfectly clean.

## LIVE GATE EVIDENCE (Task 3, authoritative — not jest-only)

### Build output (`pnpm build:sidecar-sea`)

```
[build:sidecar-sea] decompress worker bundled and embedded as SEA asset "decompressWorker.js" -- consumed at runtime by DecompressPool via node:sea.getAsset().
[build:sidecar-sea] Resolved target triple: aarch64-apple-darwin (native build)
SEA sidecar arch verified: arm64 (aarch64-apple-darwin)
SEA sidecar compiled -> src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin
```

The new "embedded as SEA asset" log line printed as expected; the deleted Pitfall-1 inline-fallback warning did **not** print.

### Self-test run (`GAMELIB_SIDECAR_SELFTEST=decompress-pool ./src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`), literal stdout/stderr

```
(node:67295) [DEP0005] DeprecationWarning: Buffer() is deprecated due to security and usability issues. Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.
(Use `gamelib-sidecar-aarch64-apple-darwin --trace-deprecation ...` to show where the warning was created)
[downloadQueueFlowRegistration] boot-time download-queue auto-resume is deliberately disabled (D-05) — logger not yet initialized in this process, falling back to console
{"id":"23479fcb-2551-4fc6-9eea-0ed2b7ab1f82","kind":"rustInvoke","channel":"tray_set_icon","args":[{"dark":true}]}
(node:67295) [DEP0005] DeprecationWarning: Buffer() is deprecated due to security and usability issues. Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.
(Use `gamelib-sidecar-aarch64-apple-darwin --trace-deprecation ...` to show where the warning was created)
SELFTEST pool={"size":2,"busy":0,"idle":2,"queued":0,"inlineFallback":false}
(node:67295) [DEP0005] DeprecationWarning: Buffer() is deprecated due to security and usability issues. Please use the Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() methods instead.
(Use `gamelib-sidecar-aarch64-apple-darwin --trace-deprecation ...` to show where the warning was created)
SELFTEST decode=ok bytes=65536 match=true
```

**Exit code: 0**

PASS criteria, all four met:
- exit code 0 ✓
- `SELFTEST pool=` JSON: `"inlineFallback":false`, `"size":2`, `"idle":2` ✓
- `SELFTEST decode=ok ... match=true` ✓ (proves the round trip AND that `lzma` loaded inside the worker isolate)
- no `DecompressPool: worker_threads pool failed to initialize` warning printed ✓

### Regression sweep (`npx jest src/backend/storeManagers/steam/`)

```
Test Suites: 1 failed, 33 passed, 34 total
Tests:       1229 passed, 1229 total
```

The single failure, `depot.finalize.test.ts`, crashed with:
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```
This is the documented, pre-existing JavaScript heap OOM — crash signature confirmed to match exactly (same "Ineffective mark-compacts near heap limit" fatal error). Not caused by, or related to, this task's changes.

## KNOWN GAPS

- **Windows (`x86_64-pc-windows-msvc`) and Linux (`x86_64-unknown-linux-gnu`) release matrix legs are UNVERIFIED.** This was executed on a single-platform macOS dev machine with no CI run performed. The SEA-asset mechanism ships no companion file and does no path resolution, so it has no per-OS surface of its own — but "no obvious per-OS surface" is not evidence. The first Windows/Linux release build must be checked for the same `SELFTEST pool=`/`decode=ok match=true` signature before this fix is considered closed on those platforms.
- **Per-worker decode speed is still bounded by the pure-JS `lzma` package (~5 MB/s single-threaded).** This fix restores parallelism (up to `min(cores, 16)`, per the earlier `DECOMPRESS_POOL_MAX_WORKERS` fix) — it does not make each individual decode faster. A native/WASM LZMA decoder replacement remains a separately-scoped, larger follow-up, deliberately out of this task's blast radius.
- **This fix retroactively re-activates `DECOMPRESS_POOL_MAX_WORKERS` (8->16, quick task 260817-ihr)**, which was provably inert on the packaged binary until now (the pool never engaged at all).
- **A real HUMANKIND install has NOT been re-run.** The end-user throughput claim (Steam's ~5min vs. the previously-observed ~1.5h) is unproven at the install level until a live HUMANKIND (or similarly large-depot title) install is re-run against this rebuilt binary. The self-test proves the mechanism works; it does not measure end-to-end install throughput.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 23 plan 23-10 (paused mid-task per `wip: phase 23 plan 23-10 paused at Task 1/3` commit `d704942f3`) can now resume with a genuinely engaged worker pool on the packaged binary — the throughput fix it was validating was blocked on exactly this defect.
- A real HUMANKIND (or equivalent large-depot) live install re-run is the natural next verification step to confirm end-to-end throughput improvement, separate from this task's synthetic self-test proof.
- Windows/Linux release-matrix verification remains open (see KNOWN GAPS) and should be checked at the next cross-platform release build.

---
*Phase: quick-260817-pkx*
*Completed: 2026-08-17*

## Self-Check: PASSED

All claimed files verified present on disk (`meta/buildSidecarSea.ts`,
`meta/__tests__/buildSidecarSea.test.ts`, `src/backend/storeManagers/steam/depot/decompressPool.ts`,
`src/backend/storeManagers/steam/depot/decompressPoolSelfTest.ts`, `src/sidecar/index.ts`,
`src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`, this SUMMARY, `deferred-items.md`,
and the rebuilt `src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`). Both task commits
(`87841a030`, `c9c311d5c`) verified present in `git log`.
