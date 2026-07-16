---
phase: 21-steam-native-install
reviewed: 2026-07-16T10:49:33Z
depth: standard
scope: gap-closure (21-15 worker-thread decompress pool, 21-16 waiting-for-restart UX)
files_reviewed: 9
files_reviewed_list:
  - electron.vite.config.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/decompress.ts
  - src/backend/storeManagers/steam/depot/decompressPool.ts
  - src/backend/storeManagers/steam/depot/decompressWorker.ts
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/library.ts
  - src/frontend/hooks/constants.ts
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 21: Code Review Report (gap closure 21-15 / 21-16)

**Reviewed:** 2026-07-16T10:49:33Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

> Scope: only the Phase 21 gap-closure changes (worker-thread decompress pool + waiting-for-restart UX). The rest of Phase 21 was reviewed in the prior 28-file pass; this file was regenerated for the gap-closure re-review per the workflow's `review_path`.

## Summary

The four scope concerns were each traced end-to-end:

- **sha1 integrity gate off-thread:** SOUND. `decodeChunk` (decompress.ts:88) is the single source of the `sha1(data) === expectedSha` and `length === cbOriginal` gates, and it runs identically inline and inside the worker (`handleDecodeMessage` → `decodeChunk`). Neither path can return unverified bytes; tests decompressPool.test.ts:105/121 lock this.
- **Transferable-buffer correctness:** SOUND. The encrypted chunk is copied into a fresh `ArrayBuffer` (`toOwnArrayBuffer`) before transfer, so the caller's buffer is never detached; the decryption key is copied and NEVER placed in the transfer list (decompressPool.ts:287 transfers only `encryptedArrayBuffer`); the worker slices its result to a fresh bounded `ArrayBuffer` before posting back and never posts the key back.
- **Timeout / worker-replacement races & shutdown leak-safety:** the idempotent `handleWorkerFailure` guard (`workers.includes`), the pending-delete-before-terminate ordering, the `allWorkers` sweep, and the `inFlightReplacements` await in `shutdown()` are correctly reasoned — no double-settle, no double-replacement, no worker-count growth, no leak across the normal `downloadDepotFiles` `finally { shutdown() }`. One residual gap in the *queued* (not dispatched) path is WR-01.
- **Build wiring:** CORRECT. `electron.vite.config.ts:42-50` emits `decompressWorker.js` as a second named rollup entry co-located with `main.js` in `build/main/`, matching `resolveWorkerPath()`'s `path.join(__dirname, 'decompressWorker.js')` for both dev and packaged output.
- **Status-context plumbing:** REACHABLE and tested. `pollInstallOnce` emits `context: 'steam-waiting-for-restart'` for StateFlags exactly 1026 (library.ts:1012-1020; `readAcfState` classifies 1026 as `state:'downloading'`) → `handleGameStatus` re-pushes (no early-return, context differs — GlobalState.tsx:960) → `hasStatus` maps `context` → `statusContext` (hasStatus.ts:116) → both `getStatusLabel` (constants.ts:32) and `GameStatus.getInstallLabel` (GameStatus.tsx:93) render the passive hint. Backend branch covered by library.test.ts:1746/1767.
- **Depot-selection logging (select.ts):** CLEAN. Every log line emits only app/depot ids, manifest gids, sizes, and os/arch/language/branch strings — no decryption key, token, or SteamID64/LastOwner. The two `logWarning` sites in depot.ts (326, 923) carry only appIds and a finalize error object.

No BLOCKER-class defects (no data-loss, secret leak, injection, or common-path crash). Two robustness gaps in the worker pool and three minor items follow.

## Warnings

### WR-01: Queued decode tasks can orphan (permanent install hang) when the pool drains to zero live workers

**File:** `src/backend/storeManagers/steam/depot/decompressPool.ts:322-339` (queue path), `242-250` (`releaseWorker`), `219-240` (`replaceWorker`)

**Issue:** The queue is load-bearing and routinely non-empty: `downloadDepotFiles` runs up to `FILE_CONCURRENCY` (8) files × `CHUNK_CONCURRENCY` (4) = **up to 32 concurrent `decode()` calls against a pool of at most `min(cpus, 8)` workers**, so 24+ tasks sit in `this.queue` on an 8-core host (and nearly all of them on a 1-core VM, where `size` resolves to 1).

Queued tasks are drained only by `releaseWorker()` (called on task completion or a *successful* `replaceWorker()`). There is no timeout on a queued task — the per-task timer is armed only in `dispatch()` once a worker is assigned — and `decode()`'s inline-fallback check (`this.workers.length === 0`, line 318) applies only to *newly arriving* calls; it never re-routes tasks already in `this.queue`. So if the pool reaches `workers.length === 0` while `queue.length > 0` **and** `replaceWorker()` spawns keep failing (EMFILE / ENOMEM / transient worker-entry load failure — the same resource exhaustion that kills workers en masse), the queued task promises never settle. `downloadSingleFile` awaits them forever: the install hangs with the UI stuck on "Installing…", no error, no completion, no `finalizeToSteam`. Worst on low-core hosts (pool size 1), where a single failed replacement after one timeout strands the entire remaining queue.

**Fix:** When the pool can no longer serve queued work, drain it inline instead of leaking it:
```ts
private async replaceWorker(): Promise<void> {
  if (this.inlineFallback || this.shuttingDown) return
  try {
    const worker = await this.spawnWorker(this.resolveWorkerPath())
    if (this.shuttingDown) { await worker.terminate().catch(() => undefined); return }
    this.workers.push(worker)
    this.releaseWorker(worker)
  } catch {
    if (this.workers.length === 0) this.drainQueueInline() // don't strand queued tasks
  }
}

private drainQueueInline(): void {
  for (const t of this.queue.splice(0)) {
    this.inlineDecode(t.encrypted, t.key, t.expectedSha, t.cbOriginal).then(t.resolve, t.reject)
  }
}
```

### WR-02: Silent pool capacity collapse — replacement failures are swallowed with no log

**File:** `src/backend/storeManagers/steam/depot/decompressPool.ts:235-239`

**Issue:** `replaceWorker()`'s failure is caught by a bare `catch {}` with no log, so the pool can quietly degrade 8 → 0 workers with zero output. This is the pool introduced specifically to fix UAT-reported slowness (D-UAT-03); a silent capacity collapse (and the WR-01 hang it precedes) leaves an operator investigating a hung/slow install with nothing to correlate — the opposite of the observability intent behind the sibling 21-16 logging work.

**Fix:** Log at warn level when a replacement fails / the pool hits zero workers:
```ts
} catch (err) {
  logWarning(
    ['DecompressPool: worker replacement failed; pool now at', `${this.workers.length} worker(s)`,
     (err as Error)?.message ?? ''],
    LogPrefix.Steam
  )
}
```

## Info

### IN-01: `os.cpus()` returning an empty array silently disables the pool

**File:** `src/backend/storeManagers/steam/depot/decompressPool.ts:96`

**Issue:** `this.size = opts.size ?? Math.min(os.cpus().length, 8)`. Some sandboxed/containerized hosts return `os.cpus() === []`, yielding `size === 0`. `init()` spawns zero workers (no error, so `inlineFallback` stays `false`), and every `decode()` runs inline on the main thread. Behavior stays correct, but the off-main-thread optimization silently no-ops with no log on exactly the low-resource hosts most likely to need it.

**Fix:** `this.size = opts.size ?? Math.max(1, Math.min(os.cpus().length || 1, 8))` and/or log the chosen size.

### IN-02: Redundant double-copy of the depot key per dispatched chunk

**File:** `src/backend/storeManagers/steam/depot/decompressPool.ts:277`

**Issue:** `toOwnArrayBuffer(Buffer.from(task.key))` copies the key twice (`Buffer.from` allocates+copies, then `.slice()` copies again). Correct and safe (key is never transferred), just wasteful per chunk. `toOwnArrayBuffer(task.key)` alone already yields an independent, non-transferred `ArrayBuffer`.

**Fix:** `const keyArrayBuffer = toOwnArrayBuffer(task.key)`.

### IN-03: worker_threads-from-asar loading should be verified against the packaged build

**File:** `electron.vite.config.ts:42-50`, `src/backend/storeManagers/steam/depot/decompressPool.ts:101-103`

**Issue:** Build wiring is correct, but the residual risk is runtime-only: `new Worker(<path inside app.asar>)` plus its dynamic `import('lzma')` (and WASM asset) must load from the packaged asar, not just the unpacked dev `build/`. Static review cannot confirm this; on failure the pool falls back inline (graceful, but the fix no-ops silently).

**Fix:** Add a packaged-build smoke test / startup log asserting `init()` produced live workers (not an inline fallback); `asarUnpack` the `lzma` WASM asset if the packaged worker cannot load it.

---

_Reviewed: 2026-07-16T10:49:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
