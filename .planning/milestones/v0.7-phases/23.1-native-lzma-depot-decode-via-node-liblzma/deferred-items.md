# Deferred items — Phase 23.1

## `depot.finalize.test.ts` — JS heap OOM, unrelated to this phase's scope

**Found during:** 23.1-04, `pnpm test` full-suite verification (Task 2).

**Symptom:** `src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts`
crashes the jest worker process with `FATAL ERROR: Ineffective mark-compacts
near heap limit Allocation failed - JavaScript heap out of memory`. Reproduces
identically when run in complete isolation (`npx jest --runInBand
depot.finalize.test.ts`), including with `NODE_OPTIONS=--max-old-space-size=4096`
explicitly set — not a full-suite memory-pressure artifact.

**Why out of scope for this plan:** `depot.finalize.test.ts` has zero import
overlap with any file this plan touches (`decompress.ts`, `decompressPool.ts`,
`decompressWorker.ts`, `lzmaLoader.ts`, `lzma-native.d.ts`) — its own imports
are `../user`, `../depot/select`, and depot-finalization helpers, none of
which route through the LZMA decode path. Confirmed via `pnpm test --
decompressPool.test.ts` (37/37 pass) and `pnpm codecheck` (clean) that this
plan's own scope is fully green.

**Action:** Not fixed — out of scope per the SCOPE BOUNDARY rule (pre-existing
defect in a file this plan does not modify). Flagging for a future
debug/quick task to investigate `depot.finalize.test.ts`'s own fixture/mock
setup for an unbounded allocation (e.g. an unmocked real filesystem walk, a
runaway retry loop, or a large buffer built without a size cap).
