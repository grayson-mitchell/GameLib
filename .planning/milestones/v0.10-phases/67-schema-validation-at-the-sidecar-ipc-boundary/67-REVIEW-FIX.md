---
phase: 67
fixed_at: 2026-11-08
review_path: .planning/phases/67-schema-validation-at-the-sidecar-ipc-boundary/67-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 67: Code Review Fix Report

CR-01 and WR-01 were fixed earlier by the orchestrator (commits `0fc56f5c2` and `3f7ead3b9`) and are not part of this report's counts. This pass covers WR-02..WR-05.

## Fixed Issues

### WR-02: Unsanitised channel name in rejection log / wire error

**Commit:** aeb17f743
**Files:** `src/backend/sidecar/ipcValidation.ts`, `src/backend/sidecar/__tests__/ipcValidation.test.ts`
**Fix:** `sanitiseChannel` (slice 64, `/[^\x21-\x7e ]/g` to `?`, mirroring Rust `echo_channel`) is applied to the verdict channel on the `no_schema` path, so the log line and the `IPC_INVALID_ARGS` wire payload both carry the sanitised value.
**Tests:** forged-newline channel and 10k-char channel each give one bounded, single-line log entry and a bounded wire error.

### WR-03: Oversized log messages dropped; rejection logging unthrottled

**Commit:** 8c3c12201
**Files:** `src/common/types/ipc/logger.ts`, `src/backend/logger/sanitizeRendererLogMessage.ts`, `src/backend/sidecar/ipcValidation.ts`, plus tests (`ipcSchemas/logger.test.ts`, `sanitizeRendererLogMessage.test.ts`, `ipcValidation.test.ts`)
**Fix:** (a) Logger channel schemas no longer bound length (union shape kept). Truncation lives in `sanitizeRendererLogMessage` (the single trust-boundary sanitiser used by the `logError`/`logInfo` flow handlers): text capped at 64 KiB with a `...[truncated N bytes]` marker, arrays at 256 entries plus a marker entry. (b) `logRejection` throttles per `kind:channel`: first 5 per 60 s window, then suppressed, with one `suppressed=N` line when the next window opens. Counter against `Date.now()` (injectable via `resetIpcRejectionThrottle(clock)`), no timer, tracked channels capped at 256 with oldest-first eviction.
**Tests:** oversized logError/logInfo now VALID; truncation and array-cap tests; throttle window/suppressed-line test with injected clock; tracked-map bound test.

### WR-04: Strict WineInstallation on persisted-config callers

**Commit:** be8096199
**Files:** `src/common/types/ipc/schemaTypes.ts`, `ipcSchemas/steamAuth.test.ts`, `ipcSchemas/wineTools.test.ts`
**Fix:** `z.looseObject`, `bin`/`name`/`type` still required, `lib`/`lib32`/`wineserver` `.nullish()`. Cast `as unknown as z.ZodType<WineInstallation, WineInstallation>` (the settings.ts `configArg` pattern) was needed, since zod's loose-object index signature broke five call sites under `tsc`.
**Tests:** extra key and null lib fields now valid; bad `type` and missing `bin` still invalid.

### WR-05: Generated from_args rejects null for optional positionals

**Commit:** 238715da1
**Files:** `meta/genIpcContract.ts`, `src/common/types/ipc/rustInvoke.ts`, `src-tauri/src/ipc_contract.rs` (regenerated), `src-tauri/src/main.rs`, `meta/__tests__/genIpcContract.test.ts`
**Fix:** optional positionals now emit `args.get(i).filter(|v| !v.is_null()).map(...)`. Keyring `slot` is `z.string().nullish().meta({ title: 'slot' })` and the header comment was corrected. Only the four keyring arg structs changed in the generated file.
**Tests:** generator test for a `.nullish()` positional; Rust test `keyring_slot_null_reads_as_the_default_slot` in the existing `main.rs` test module (also dropped the stale "null is bad-args" comment on the absent-slot test).

## Deviations

- WR-03 truncation is in `sanitizeRendererLogMessage` (already the shared trust-boundary function both flow handlers call) rather than in `logger/ipc_handler.ts`, which is Electron-only and not on the sidecar path. The object arm (`{name,message,stack}`) is not truncated; it is bounded only by the 10 MiB frame limit.
- WR-03 adds an exported test seam `resetIpcRejectionThrottle`.
- WR-04: the 67-19 Rust allow-list / generated contract does not embed this schema; `check:ipc-contract` is unaffected.

## Verification

`pnpm codecheck`, `pnpm check:ipc-contract`, `cargo test --bin gamelib-shell` (430 passed) and prettier --check on touched paths are clean. Jest over `src/backend/sidecar`, `src/backend/logger`, `src/common`, `src/preload`, `meta/__tests__`: only the known pre-existing failures remain (genI18nGateScope A-17, logSecretGate x2, x86CallbackWineHarness).

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
