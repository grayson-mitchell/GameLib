---
phase: 21-steam-native-install
plan: 05
subsystem: steam-depot-download-streaming-loop
tags: [steam, depot-download, streaming, concurrency, security, tdd]

# Dependency graph
requires:
  - phase: 21-04
    provides: depot.ts DepotPlan/DepotPlanEntry/DepotPlanFile/DepotPlanChunk
      types (the enqueue-time contract this plan's streaming loop consumes)
  - phase: 21-01
    provides: depot/decompress.ts fetchChunk (cross-server retry, per-chunk
      SHA1 verify-then-trust)
provides:
  - depot.ts downloadDepotFiles(plan, opts) — streams every file across every
    depot to disk via positional fd.write at each chunk's declared offset,
    bounded file- and chunk-level concurrency, path containment, whole-file
    SHA1 verification, throttled DownloadManager progress, and AbortSignal
    cancel
  - CHUNK_CONCURRENCY/FILE_CONCURRENCY exported constants; PathTraversalError,
    DownloadDepotFilesOpts, DepotDownloadFailure, DepotDownloadResult types
affects: [21-06 (recovery/finalize calls writeAppManifest once this loop has
  written bytes to disk; will also need to fetch content-server hosts via
  client.getContentServers() and wire downloadSteamDepots + downloadDepotFiles
  + writeAppManifest together into the actual install flow)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Task-level TDD (RED test commit -> GREEN implementation commit, per task)
    - Real-tmpdir black-box fs testing (manifest.test.ts precedent) instead of
      mocking node:fs/promises — its exports are non-configurable getters
      under this project's ts-jest/CJS interop and cannot be reliably
      intercepted without breaking real I/O; only the network-dependent
      fetchChunk and the frontend IPC emit are mocked
    - Bounded worker-pool concurrency applied at TWO nested levels (file-level
      queue reusing the spike's proven pattern, chunk-level queue newly added
      to cap in-flight fetches per file) rather than nested Promise.all

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts

key-decisions:
  - "downloadDepotFiles is a SEPARATE exported function from
    downloadSteamDepots, not folded into it — it operates 'on top of' an
    already-built DepotPlan, has zero dependency on the authenticated
    SteamUser client (hosts are caller-supplied), and stays independently
    unit-testable without re-mocking the entire client/PICS/manifest chain
    that downloadSteamDepots's own tests already exercise. This also means
    the 6 existing 21-04 tests were untouched by this plan's changes (still
    6/6 green) — no regression risk to the plan-building half."
  - "Whole-file SHA1 mismatches and path-traversal rejections are collected
    into a failures[] array rather than thrown out of downloadDepotFiles —
    mirrors the spike's own 'collect failures, never swallow' pattern so one
    bad file does not abort the rest of a multi-depot, multi-file download"
  - "fetchChunk's host-rotation attemptSeed is derived per-FILE (job index in
    the flattened depots x files job list), matching spike 002's own
    per-file seed assignment (`chunk.attemptSeed = i % hosts.length`) to
    spread initial load across content servers"

patterns-established:
  - "Real-tmpdir + mock-only-the-network-boundary is now the second precedent
    (after 21-02 manifest.test.ts) for testing any future depot.ts fs-writing
    code — do not attempt to mock node:fs/promises in this codebase"

requirements-completed: [SNI-01, SNI-03]

# Metrics
duration: ~30min
completed: 2026-07-15
---

# Phase 21 Plan 05: Streaming Depot-Download Loop Summary

Implemented `downloadDepotFiles(plan, opts)` — the depot-download engine's core streaming loop, consuming Plan 04's `DepotPlan` and writing every file across every depot to disk via positional `fd.write` at each chunk's declared offset (never a whole-file `Buffer.alloc`), with bounded file- AND chunk-level concurrency, path containment, whole-file SHA1 verification, throttled `DownloadManager` progress, and prompt `AbortSignal` cancel. This is the MUST-VALIDATE streaming-to-disk fix that unblocks D-14's no-fallback-for-50GB requirement.

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-15
- **Tasks:** 2
- **Files modified:** 2 (depot.ts, depot.test.ts — no new files)

## Accomplishments

- `downloadDepotFiles` streams every file to disk with `open(dest,'w')` + `ftruncate` pre-sizing + positional `fileHandle.write(data, 0, data.length, Number(chunk.offset))` per chunk — zero `Buffer.alloc(Number(file.size))` in the implementation (grep gate: 0 matches), so peak memory is `O(file-concurrency × chunk-concurrency × chunk size)` regardless of file/depot size
- Chunk fetches within a single file are bounded by an explicit `CHUNK_CONCURRENCY` (4) worker pool — a many-chunk (50) test file proved peak concurrent in-flight `fetchChunk` calls never exceeds the cap, while still exercising real parallelism (peak > 1)
- Every decrypted filename is containment-checked via `resolveContainedPath` (`resolve()` + `relative()`, never bare `path.join`) against the `common/{installdir}` root BEFORE any `fs` call — a `"../../evil.txt"` filename is rejected with zero filesystem writes (T-21-01)
- Whole-file SHA1 is verified by streaming the written bytes back through `createHash('sha1')` fed by a `ReadStream` (`sha1File`) — never a whole-file re-read into RAM; a mismatch is recorded as a `DepotDownloadFailure`, never silently accepted (T-21-03)
- Progress emits `sendFrontendMessage('progressUpdate', ...)` in the EXACT `InstallProgress` shape `library.ts`'s `pollInstallOnce()` already speaks (`appName`, `runner:'steam'`, `status:'installing'`, `progress.percent/bytes/downSpeed/eta`) — the `DownloadManager` UI needs zero changes (D-01/D-03). Percent denominator is the `DepotPlan`'s multi-depot SUMMED `totalBytes`, proven with a 2-depot test where a single 1-of-400-byte file yields `percent:1`, not `percent:100`
- Emits are throttled to ~1%/500ms (T-21-12) — a test with an artificially large `totalBytes` relative to actual bytes moved proves emits stay far fewer than chunks processed
- `AbortSignal` is checked before every chunk fetch and between files — an abort test proves the loop halts new `fetchChunk` calls (1 call observed vs. 5 chunks queued) and returns `{ outcome: 'cancelled' }` promptly (D-02)

## Task Commits

Both tasks were combined into a single TDD RED → GREEN pair since they share one cohesive function (`downloadDepotFiles`) and one test describe block, all specified in the plan's `<threat_model>`/`<verification>` as one integrated implementation unit:

1. **RED:** `51f3f437` (test) — 7 new tests fail against the pre-05 `depot.ts` (`downloadDepotFiles`/`CHUNK_CONCURRENCY` not yet exported); 6 existing 21-04 tests continue to pass, confirming no accidental coupling
2. **GREEN:** `aed0065a` (feat) — full `downloadDepotFiles` implementation; all 13 tests green (7 new + 6 existing), full steam suite 380/380, `tsc --noEmit` clean, eslint 0 errors (22 pre-existing-pattern warnings on jest-mock typing, no new error-level issues)

**Plan metadata:** (this commit) — `docs(21-05): complete streaming-download-loop plan`

## Files Modified

- `src/backend/storeManagers/steam/depot.ts` — added `downloadDepotFiles`, `downloadSingleFile`, `downloadFileChunks`, `resolveContainedPath`, `sha1File`; exported `CHUNK_CONCURRENCY`/`FILE_CONCURRENCY` constants, `PathTraversalError` class, `DownloadDepotFilesOpts`/`DepotDownloadFailure`/`DepotDownloadResult` types
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` — added a `downloadDepotFiles` describe block (7 tests: positional-write proof, chunk-concurrency bound, path-traversal rejection, SHA1-mismatch failure, no-RAM-buffer grep gate, throttled multi-depot-summed progress, AbortSignal cancel); added `backend/utils` and `../depot/decompress`/`../../../ipc` mocks; fixed a pre-existing wrong-depth `'../../ipc'` → `'../../../ipc'` import path bug uncovered while wiring the new mock (see Deviations)

## Decisions Made

- `downloadDepotFiles` is architecturally independent from `downloadSteamDepots` (separate exported function, not a continuation of the same call) — see `key-decisions` above for the full rationale. This keeps the 21-04 plan-building tests completely unaffected by this plan's changes.
- Real-tmpdir testing (not mocked `node:fs/promises`) — following the exact precedent `manifest.test.ts` (21-02) established for the same underlying reason (non-configurable getter exports break under this project's ts-jest/CJS interop when mocked). Only `fetchChunk` (network) and `sendFrontendMessage` (frontend IPC side-effect) are mocked.
- `fetchChunk`'s `attemptSeed` host-rotation value is computed per-file (flattened job index modulo `hosts.length`), matching spike 002's own per-file seed assignment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed wrong-depth `'../../ipc'` import path in the RED test file**
- **Found during:** Task 1, first RED test run
- **Issue:** `depot.test.ts` lives one directory deeper (`__tests__/`) than `depot.ts` itself; copying `depot.ts`'s own `'../../ipc'` relative import into the test file resolved to the wrong module (`storeManagers/ipc` instead of `backend/ipc`), producing `Cannot find module '../../ipc'`.
- **Fix:** Corrected to `'../../../ipc'`, matching the exact import depth already used by the sibling `library.test.ts` in the same `__tests__/` directory.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- **Commit:** `51f3f437` (part of the RED commit, since this was caught before RED was confirmed)

**2. [Rule 3 - Blocking] Added a `backend/utils` mock to prevent pulling in the heavy `gog/library.ts` transitive chain**
- **Found during:** Task 1, GREEN implementation run
- **Issue:** `depot.ts`'s new `getFileSize` import from `backend/utils` pulls in `backend/utils.ts`'s full transitive chain (including `gog/library.ts` → `gog/e2eMock.ts`'s `addTestOnlyListener`), which the test file's minimal `../../../ipc` mock factory doesn't provide — `TypeError: addTestOnlyListener is not a function` at module load.
- **Fix:** Added `jest.mock('backend/utils', () => ({ getFileSize: jest.fn() }))`, following the identical established pattern in `library.test.ts` (same file, same import, same fix already proven there).
- **Files modified:** `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- **Commit:** `aed0065a` (part of GREEN, since RED was already confirmed failing for the correct reason — missing exports — before this mock was needed)

**3. [Rule 1 - Bug] Reworded 3 explanatory-prose comments that accidentally matched the plan's own "no unbounded Promise.all" grep gate**
- **Found during:** Task 1, GREEN implementation run (own test suite failure)
- **Issue:** `depot.ts`'s own doc comments explaining what NOT to do (`"...NOT an unbounded Promise.all(file.chunks.map(...))..."`) literally contained the code pattern being tested against — the acceptance-criteria grep `/Promise\.all\(\s*file\.chunks\.map/` matched the prose, not just code, causing a false-positive test failure.
- **Fix:** Reworded the 3 comments to describe the anti-pattern in prose (`"NOT an unbounded fan-out over every chunk in one go"`) without reproducing the literal code shape. No behavior or documentation-intent change.
- **Files modified:** `src/backend/storeManagers/steam/depot.ts`
- **Commit:** `aed0065a`

**4. [Rule 1 - Bug] Widened `sha1File`'s stream-data callback parameter type from `Buffer` to `string | Buffer`**
- **Found during:** Task 1, `tsc --noEmit` verification
- **Issue:** `ReadStream`'s `'data'` event handler type is `(chunk: string | Buffer) => void`; annotating the callback parameter as `Buffer`-only produced a `tsc` type error (parameter type incompatible with the real `Readable` event signature).
- **Fix:** Widened the parameter type to `string | Buffer` — `crypto.Hash.update()` already accepts both, so no runtime behavior changed.
- **Files modified:** `src/backend/storeManagers/steam/depot.ts`
- **Commit:** `aed0065a`

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug). All caught and resolved during the plan's own TDD/verification cycle before either commit; no behavior change, no scope creep.

## TDD Gate Compliance

RED confirmed with fail-fast discipline: the `test(21-05): ...` commit (`51f3f437`) shows 7 new tests genuinely failing (`downloadDepotFiles`/`CHUNK_CONCURRENCY` not exported yet) while all 6 pre-existing 21-04 tests continued to pass — proving the RED failures were caused by the missing new implementation, not a broken test harness or an accidentally-already-passing assertion. GREEN (`aed0065a`) brings all 13 tests to green in one implementation pass. No REFACTOR commit was needed — no post-GREEN cleanup was required beyond the deviations already folded into the GREEN commit itself.

## Issues Encountered

None beyond the deviations documented above (all resolved inline, well within the 3-attempt auto-fix budget per issue).

## User Setup Required

None — no external service configuration required. This plan is pure backend engine code with no new dependencies, no new IPC channels, no new UI surface.

## Known Stubs

None — `downloadDepotFiles` is a fully-implemented streaming engine with no placeholder/mock data paths in production code. The only remaining gap (by design, deferred to Plan 06 per the plan's own scope) is that nothing yet CALLS `downloadDepotFiles` end-to-end from the actual install flow — `client.getContentServers()` host resolution and `writeAppManifest` finalization are Plan 06's job, matching 21-04's own established front-half/back-half split.

## Threat Flags

None — every new surface this plan introduces (positional file writes, path containment, whole-file SHA1, progress IPC emit, AbortSignal consumption) is exactly the surface enumerated in the plan's own `<threat_model>` (T-21-01, T-21-02, T-21-03, T-21-12), and each `mitigate` disposition is implemented and tested as designed. No new network endpoints, auth paths, or schema changes were introduced beyond what the threat model already covers.

## Next Phase Readiness

- `downloadDepotFiles(plan, opts)` is ready to be called with a real `DepotPlan` from `downloadSteamDepots` (21-04) and a real `hosts` array — Plan 06 (recovery/finalize) must: (1) call `client.getContentServers()` to resolve `hosts` before invoking `downloadDepotFiles`, (2) call `writeAppManifest` (21-02) with the `DepotPlanEntry[]` data once `downloadDepotFiles` reports `outcome:'completed'` with no failures, and (3) wire `SteamGame.stop()` (currently a no-op per 21-04's own note) to actually call `callAbortController(appId)` so a queue-cancel reaches this loop's `AbortSignal`
- The `opts.signal` field on `DownloadSteamDepotsOpts` (21-04) still isn't consumed by `downloadSteamDepots` itself — only `downloadDepotFiles`'s own `opts.signal` is wired. This is expected: `downloadSteamDepots`'s own work (PICS/manifest fetch) isn't itself abortable in this plan's scope; only the chunk-download loop is (matches D-02's stated scope: "V1 exposes cancel only" for the download phase).
- `failures: DepotDownloadFailure[]` is returned but not yet surfaced as a user-facing error in the DownloadManager — Plan 06 or a later plan should decide how a partial-failure result (some files OK, some failed) maps to the DM queue's `error`/`done` status.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/depot.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- FOUND: `.planning/phases/21-steam-native-install/21-05-SUMMARY.md`
- FOUND commit `51f3f437` (test: RED)
- FOUND commit `aed0065a` (feat: GREEN)
- FOUND: `downloadDepotFiles` exported from `depot.ts` (grep confirms 1 match)
