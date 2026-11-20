---
phase: 66
status: issues_found
depth: standard
diff_base: a247fdb7f
reviewed: 2026-11-10
counts: { critical: 0, warning: 7, info: 3 }
scope_note: Priority 1–2 files (bootstrap.ts, process/*, backendDiCeilings.cjs, CI wiring, sidecarHarness.ts, testUtils) read in full; migrated test suites (priority 3) NOT reviewed.
---

# Phase 66 Code Review

## Bootstrap questions
- **Step order preserved**: `buildBootSteps()` matches old `init()` (a247fdb7f) call order; `runBootSteps` fails loudly on drift from `BOOT_STEP_NAMES`.
- **No second init path**: `src/sidecar/index.ts` calls `init()` once → `bootSidecar` latch. Once-guard deletion loses nothing production relied on.
- **Latch** set before steps run; a throwing step leaves boot half-done and non-retryable — same as the old uncaught throw in `init()` (see IN-01).

## Warnings

### WR-01: `run()` can hang forever after a timeout kill
`src/backend/process/runner.ts:146-149, 183, 206-207` — on timeout only `child.kill('SIGKILL')`, then waits for `'close'`, which waits for stdio EOF. A grandchild holding the pipes (wrapper script, wine launcher) means `'close'` never fires and the D-10 timeout bound is defeated. **Fix:** resolve on `'exit'` (or a short grace after kill) once timed out.

### WR-02: Output capture can splice discontinuous output after truncation
`src/backend/process/runner.ts:151-162` — after a large chunk is dropped, a later small chunk can still fit under `maxBytes` and be appended, producing stdout with a silently missing middle. **Fix:** once `truncated` for a stream, stop appending to it.

### WR-03: win32 `killPid` always reports success; `runSync` has no output cap
`src/backend/process/runner.ts:84-94` — `taskkill` result ignored (`return true`); `spawnSync` uses Node's 1 MiB default `maxBuffer` → ENOBUFS kill surfaced only as `error`. **Fix:** return `r.code === 0`; pass explicit `maxBuffer`.

### WR-04: Ratchet can be raised by editing a shard
`meta/backendDiCeilings.cjs:390-486` — gate compares code to committed JSON only; raising a baseline or adding a `sanctioned` entry (any file, any kind) in the same PR passes. "Shrink-only" relies on human JSON diff review. **Fix:** in CI compare against `origin/main` shards; hard-code allowed paths per sanctioned kind.

### WR-05: child_process ban has easy bypasses
`meta/backendDiCeilings.cjs:201-246` — only literal `'child_process'`/`'node:child_process'` counted; misses computed requires, `createRequire`, `execa`/`cross-spawn`/`node-pty`/`shelljs`, `worker_threads`. `runner-no-npm` only restricts `process/`. **Fix:** depcruise rule forbidding npm spawn packages outside `process/`.

### WR-06: jest.mock counting misses sibling APIs
`meta/backendDiCeilings.cjs:248-264` — `jest.doMock`, `unstable_mockModule`, `setMock`, destructured `mock` not counted; converting `mock`→`doMock` looks like shrinkage. **Fix:** count all module-mock methods.

### WR-07: `removeLegacyZoomData` step bypasses `ctx.paths.userData`
`src/backend/sidecar/bootstrap.ts:1414`, `sidecarHarness.ts:110-118` — step reads `platformApi.app.getPath('userData')`, not `ctx.paths.userData`, so the harness's "userData under fake HOME" claim depends on jest containment, not the context. **Fix:** use `ctx.paths.userData`.

## Info

### IN-01: Latch can't distinguish failed-midway from completed boot
`bootstrap.ts:800-806` — optionally record `bootFailed` and include it in the second-boot error.

### IN-02: Census floors and skip list are loose
`backendDiCeilings.cjs:51-59, 268-281` — `SKIP_DIRS` matches at any depth; symlinks skipped; floors (240/955) ≈ half of measured, so a half-scanned tree passes. **Fix:** floors ≈ 90%, anchor skip dirs.

### IN-03: Malformed `--shard` file throws uncaught
`backendDiCeilings.cjs:574` — wrap `JSON.parse`, push to `failures`.

## Checked and sound
`createClock` (unref'd; `keepAlive` needs reason), `unrefChild` (child + 3 stdio), `spawnLongLived` teardown identity guard, `runner-is-a-leaf`/`runner-no-npm` depcruise rules, `realRunner.ts` (fake-HOME by default, justified real-profile arm, `openDetached` blocked).
