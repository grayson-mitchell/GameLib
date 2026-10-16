# Phase 25: Steam depot download multi-host fan-out (throughput) - Pattern Map

**Mapped:** 2026-07-19
**Files analyzed:** 4 (3 modified existing files + 1 modified existing test file; a 5th, `depotPrimitives.test.ts`, gets net-new cases; no wholly new files)
**Analogs found:** 4 / 4 — this phase is unusual: every file to modify already contains its own best analog (this exact function's own history of prior additive cycles), so "closest analog" = "this file's own established convention," read and excerpted below.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/backend/storeManagers/steam/depot/hostHealth.ts` (`pickHost`, `HostHealthTracker`) | service (scheduling/selection logic) | request-response (in-process, synchronous host selection) | Same file, `constructor(weightedLoads?)` (L212-214) and `pickHost` itself (L267-291) — the established "optional trailing param, default reproduces old behavior" idiom used for every prior cycle's addition to this exact function/class | exact (self-analog) |
| `src/backend/storeManagers/steam/depot.ts` (`downloadFileChunks` L878-1033, `downloadDepotFiles`'s file-pool L1562-1634) | service (concurrency-pool orchestration) | batch / event-driven (bounded worker pools draining a shared queue) | Same file — `downloadFileChunks`'s own trailing-optional-param chain (`onAttempt?`, `hostHealth?`, `cdnAuth?`, `hostMeta?`, `stallTracker?`) at L889-915, and the sibling file-level `Array.from({length: workerCount}, async () => {...})` pool at L1587 | exact (self-analog) |
| `src/backend/storeManagers/steam/depot/decompress.ts` (`fetchChunk` L785-941, `pickHost` call site L852-854) | service (network I/O + retry/decode) | streaming / request-response (per-attempt HTTP fetch + decode) | Same file — `fetchChunk`'s own trailing-optional-param list (`hostHealth?`, `cdnAuth?`, `hostMeta?`, `signal?`) at L807-833, each with a doc comment stating "Optional, additive: omitting it ... leaves ... unchanged" | exact (self-analog) |
| `src/backend/storeManagers/steam/__tests__/hostHealth.test.ts` | test (unit, regression-guard) | request-response (pure function assertions) | Same file's own "weightedload-aware selection (cycle 5)" nested `describe` block (L196-303) — the most recent prior additive-dimension cycle to this exact class, including its own "omitting X reproduces the exact prior cold-start order — no regression" test (L295-303) | exact (self-analog) |
| `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts` (net-new cases only, no new file) | test (unit, mocked-fetch integration) | request-response (mocked `global.fetch`, asserts requested hostnames) | Same file's `'retries on a SHA1 mismatch and rotates to a different host each attempt'` test (L341-374) — the `urlStr.split('/')[2]` host-extraction idiom, and the `'with a HostHealthTracker (cycle 3)'` nested describe (L449+) | exact (self-analog) |

## Pattern Assignments

### `src/backend/storeManagers/steam/depot/hostHealth.ts` (service, request-response)

**Analog:** this file's own prior additive cycles (constructor's `weightedLoads?` param, `pickHost`'s own doc comment convention)

**Imports pattern** (file has none beyond its own types — self-contained module, no external imports):
```typescript
// hostHealth.ts has zero import statements — pure, dependency-free TS.
// New code (TOP_N_FANOUT const, workerSlot logic) should stay dependency-free too.
```

**Established "optional additive constructor param" pattern** (L212-214):
```typescript
constructor(weightedLoads?: ReadonlyMap<string, number>) {
  this.weightedLoads = weightedLoads ?? new Map()
}
```

**Core pattern — the exact function to modify, `pickHost`** (L267-291):
```typescript
pickHost(hosts: string[], seed: number, attemptIndex: number): string {
  if (!hosts.length) {
    throw new Error('HostHealthTracker.pickHost: empty hosts list')
  }
  const rotated = hosts.map((_, i) => hosts[(seed + i) % hosts.length])

  const healthy: string[] = []
  const unhealthy: string[] = []
  for (const host of rotated) {
    ;(isUnhealthy(this.ensure(host)) ? unhealthy : healthy).push(host)
  }
  healthy.sort((a, b) => this.compositeScore(b) - this.compositeScore(a))
  unhealthy.sort((a, b) => this.compositeScore(b) - this.compositeScore(a))

  const ordered = [...healthy, ...unhealthy]
  return ordered[attemptIndex % ordered.length]
}
```
**Target signature per RESEARCH.md's locked direction:**
```typescript
pickHost(hosts: string[], seed: number, attemptIndex: number, workerSlot = 0): string {
  // ... unchanged rotation/healthy-unhealthy split/sort above ...
  const N = Math.min(TOP_N_FANOUT, healthy.length)
  if (attemptIndex === 0 && N > 1) {
    return healthy[workerSlot % N]
  }
  return ordered[attemptIndex % ordered.length]  // unchanged for attemptIndex > 0
}
```

**Established "exported tunable constant with rationale comment" pattern** — every existing constant in this file follows this exact shape (L78, L84, L91, L97, L110, L125); the new `TOP_N_FANOUT` constant MUST follow it too:
```typescript
/** A host with this many CONSECUTIVE failures is deprioritized immediately,
 *  regardless of total sample size -- catches a host like the observed
 *  alibaba edge (0/258) fast, without waiting for a large sample. */
export const MAX_CONSECUTIVE_FAILURES = 5
```

**Error handling pattern** (L268-270) — unchanged, only the empty-list guard exists; no new error paths are introduced by this fix:
```typescript
if (!hosts.length) {
  throw new Error('HostHealthTracker.pickHost: empty hosts list')
}
```

---

### `src/backend/storeManagers/steam/depot.ts` (service, batch/event-driven concurrency pools)

**Analog:** this file's own two sibling `Array.from({ length: workerCount }, async () => {...})` pools (chunk-level and file-level) — both already exist and are structurally identical; the fix mechanically mirrors one into the other.

**Existing chunk-level worker pool** (`downloadFileChunks`, L917-921 — the pool whose workers must gain a `chunkWorkerSlot` index):
```typescript
const queue = [...file.chunks]
const workerCount = Math.min(CHUNK_CONCURRENCY, queue.length)

await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      // ...
    }
  })
)
```
**Target — capture `Array.from`'s native `(_, i)` second arg** (already the exact idiom `hostHealth.ts` itself uses internally, L271: `hosts.map((_, i) => hosts[(seed + i) % hosts.length])`):
```typescript
await Promise.all(
  Array.from({ length: workerCount }, async (_, chunkWorkerSlot) => {
    while (queue.length) {
      // ... pass chunkWorkerSlot down into fetchChunk's new workerSlot param
    }
  })
)
```

**Existing file-level worker pool** (`downloadDepotFiles`, L1587-1634 — same shape, one nesting level up):
```typescript
await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      if (opts.signal?.aborted) return
      const job = queue.shift()!
      try {
        await downloadSingleFile(
          installRoot, job.depotId, job.key, opts.hosts, lzma,
          job.file, job.fileSeed, opts.signal,
          (disk, net) => { /* ... */ },
          pool.decode, onAttempt, hostHealth, opts.cdnAuth, opts.hostMeta, stallTracker
        )
      } catch (err) {
        failures.push({ file: job.file.filename, error: (err as Error).message })
      }
    }
  })
)
```

**Established "trailing optional param, threaded through the whole call chain unchanged" pattern** — this is the exact mechanism to extend for `workerSlot`. `downloadFileChunks`'s existing signature (L878-916) shows FIVE prior cycles doing exactly this:
```typescript
export async function downloadFileChunks(
  fd: FileHandle,
  depotId: string,
  key: Buffer,
  hosts: string[],
  lzma: LzmaModule,
  file: DepotPlanFile,
  fileSeed: number,
  signal: AbortSignal | undefined,
  onBytes: (diskBytes: number, netBytes: number) => void,
  decode?: DecodeFn,
  /** Debug/steam-install-slow-start (cycle 2): forwarded to every fetchChunk
   *  call so the caller can aggregate per-host attempt/timeout/error stats
   *  across the whole file — optional, additive, no behavior change. */
  onAttempt?: OnChunkAttempt,
  /** Debug/steam-install-slow-start (cycle 3): shared, per-DOWNLOAD-RUN
   *  health-aware host selector — see depot/hostHealth.ts. Optional,
   *  additive: omitting it (no existing caller/test does) leaves fetchChunk's
   *  plain round-robin selection unchanged. */
  hostHealth?: HostHealthTracker,
  cdnAuth?: CdnAuthTokenCache,
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>,
  stallTracker?: StallTracker
): Promise<void> {
```
New `workerSlot` param should append the same way, with the same doc-comment convention:
```typescript
// e.g. appended at the end of downloadFileChunks's own param list:
  /** Debug/steam-depot-fan-out (Phase 25): per-chunk-worker slot index within
   *  this file's own chunk pool (0..CHUNK_CONCURRENCY-1) — see
   *  depot/hostHealth.ts's pickHost. Optional, additive: omitting it (every
   *  pre-Phase-25 caller/test) defaults to 0, which — combined with pickHost's
   *  own default — reproduces the exact pre-fix ordered[0] pick. */
  chunkWorkerSlot?: number
```

**Constants to reference (unchanged, do not modify)** (L685, L687 area confirmed via grep):
```typescript
export const CHUNK_CONCURRENCY = 4
export const FILE_CONCURRENCY = 8
```

**Chunk-level `fetchChunk` call site inside the pool** (L939-961) — this is where `chunkWorkerSlot` must be threaded into the new `pickHost` call, alongside every other already-threaded optional param:
```typescript
const data = await fetchChunk(
  hosts,
  depotId,
  depotChunk,
  key,
  lzma,
  CHUNK_FETCH_ATTEMPTS,
  decode,
  (n) => { netBytes = n },
  onAttempt,
  hostHealth,
  cdnAuth,
  hostMeta,
  signal
  // Phase 25: append chunkWorkerSlot here, in the same trailing-optional-param slot style
)
```

---

### `src/backend/storeManagers/steam/depot/decompress.ts` (service, streaming/request-response)

**Analog:** this file's own `fetchChunk` signature — five prior cycles (`hostHealth`, `cdnAuth`, `hostMeta`, `signal`) already used this exact "trailing optional param + doc comment stating omission = byte-for-byte unchanged" idiom.

**Existing `pickHost` call site — the ONE place to change** (L852-854):
```typescript
const host = hostHealth
  ? hostHealth.pickHost(hosts, seed, i)
  : hosts[(seed + i) % hosts.length]
```
**Target:**
```typescript
const host = hostHealth
  ? hostHealth.pickHost(hosts, seed, i, workerSlot)
  : hosts[(seed + i) % hosts.length]
```

**Established doc-comment convention for a new trailing param** (verbatim style to copy, from the existing `signal?` param doc, L817-833):
```typescript
/** debug/steam-cancel-abort-thread-a: external cancellation signal — when
 *  it fires, fetchChunk abandons the in-flight attempt IMMEDIATELY
 *  ...
 *  Optional, additive: omitting it (every pre-existing caller/test)
 *  preserves the exact previous behavior — retries run to completion
 *  regardless of any external signal. ...
 */
signal?: AbortSignal
```
New `workerSlot` param (appended after `signal`, or wherever the phase's plan places it) should match this shape exactly — stating the mechanism, the "why," and the "omission = unchanged" guarantee.

**Full existing trailing-param list to append to** (L785-833 signature block):
```typescript
export async function fetchChunk(
  hosts: string[],
  depotId: string,
  chunk: DepotChunk,
  key: Buffer,
  lzma: LzmaModule,
  attempts = 4,
  decode: DecodeFn = (encrypted, decodeKey, expectedSha, cbOriginal) =>
    decodeChunk(encrypted, decodeKey, expectedSha, cbOriginal, lzma),
  onNetworkBytes?: (compressedBytes: number) => void,
  onAttempt?: OnChunkAttempt,
  hostHealth?: HostHealthTracker,
  cdnAuth?: CdnAuthTokenCache,
  hostMeta?: ReadonlyMap<string, ContentServerHostMeta>,
  signal?: AbortSignal
  // Phase 25: workerSlot appended here (or wherever the plan specifies),
  // defaulting so `hostHealth.pickHost(hosts, seed, i)` 3-arg cold callers
  // remain byte-for-byte unchanged — pickHost itself defaults workerSlot=0.
): Promise<Buffer> {
```

**Error handling pattern (unchanged, must not regress)** (L942-999) — the catch block's cancel-check-first-then-record-then-rotate structure; fan-out must never alter this:
```typescript
} catch (err) {
  lastErr = err as Error
  if (signal?.aborted) {
    throw new ChunkFetchAbortedError()
  }
  const timedOut = (err as { name?: string } | undefined)?.name === 'AbortError'
  const ms = Date.now() - attemptStart
  const outcome: ChunkAttemptOutcome = timedOut ? 'timeout' : 'error'
  hostHealth?.record(host, outcome, ms)
  const reason = attemptFailureReason(err, timedOut)
  onAttempt?.({ host, attempt: i, outcome, ms, message: lastErr?.message, reason })
  // ... decode-stage diagnostic logging, unchanged ...
}
```

---

### `src/backend/storeManagers/steam/__tests__/hostHealth.test.ts` (test, unit regression-guard)

**Analog:** this file's own "weightedload-aware selection (cycle 5)" describe block — the most recent prior cycle that added a new dimension to `pickHost` and had to prove both the new behavior AND full backward-compatibility.

**Imports pattern** (L10-17):
```typescript
import {
  HostHealthTracker,
  MAX_CONSECUTIVE_FAILURES,
  MIN_SAMPLES_FOR_UNHEALTHY,
  MIN_SUCCESS_RATE_FOR_HEALTHY,
  PRIOR_HALFLIFE_SAMPLES,
  priorScoreFromWeightedLoad
} from '../depot/hostHealth'
```
Phase 25 additions should import `TOP_N_FANOUT` (or whatever the new exported constant is named) alongside these.

**Core "byte-for-byte unchanged when omitted" regression test pattern** — copy this shape exactly for `workerSlot` (L22-36, the very first, foundational test in the file):
```typescript
it('cold start (no attempt history) preserves the plain seed-rotation order — identical to the pre-cycle-3 round-robin', () => {
  const tracker = new HostHealthTracker()

  // seed=0: original algorithm would pick hosts[0], hosts[1], hosts[2], hosts[3]
  expect(tracker.pickHost(hosts, 0, 0)).toBe('host-a')
  expect(tracker.pickHost(hosts, 0, 1)).toBe('host-b')
  expect(tracker.pickHost(hosts, 0, 2)).toBe('host-c')
  expect(tracker.pickHost(hosts, 0, 3)).toBe('host-d')
})
```

**Most recent precedent for "new dimension + explicit no-regression test"** — the exact template to follow for the new `workerSlot` dimension (L295-303):
```typescript
it('omitting weightedLoads entirely (every pre-cycle-5 caller) reproduces the exact cycle-3/4 neutral cold-start order — no regression', () => {
  const tracker = new HostHealthTracker()
  expect(tracker.pickHost(pool, 0, 0)).toBe('cache1-akl-edgx')
  expect(tracker.pickHost(pool, 0, 1)).toBe('cache1-akl-tpwr')
  expect(tracker.pickHost(pool, 0, 2)).toBe('cache2-akl-tpwr')
  expect(tracker.pickHost(pool, 0, 3)).toBe('alibaba-cdn')
})
```
New tests should mirror this exact "omit the new param → identical to prior behavior" shape, PLUS a new `describe('worker-slot-aware fan-out (Phase 25)', ...)` block (following the existing `describe('weightedload-aware selection (cycle 5)', ...)` nesting convention at L196) asserting:
1. At `attemptIndex===0`, distinct `workerSlot` values return different hosts among top-N when scores differ.
2. At `attemptIndex>0`, `workerSlot` has NO effect — full ordered-list rotation is identical regardless of `workerSlot` value (mirrors the "never excludes a host entirely" / "wraps back to front" regression-guard tests at L154-172).

---

### `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts` (test, mocked-fetch integration, net-new cases only)

**Analog:** this file's own `'retries on a SHA1 mismatch and rotates to a different host each attempt'` test and the `'with a HostHealthTracker (cycle 3)'` nested describe.

**Host-extraction-from-mocked-fetch idiom** (L341-374) — reused verbatim by every subsequent host-assertion test in this file (also at L462, L1377):
```typescript
it('retries on a SHA1 mismatch and rotates to a different host each attempt; throws after `attempts` and never returns unverified bytes', async () => {
  const data = Buffer.from('never verifies', 'utf8')
  const encrypted = await buildEncryptedChunkResponse(data)
  const requestedHosts: string[] = []

  global.fetch = jest.fn((url: unknown) => {
    const urlStr = String(url)
    const host = urlStr.split('/')[2]
    requestedHosts.push(host)
    return Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(
        encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength)
      )
    } as Response)
  }) as unknown as typeof fetch

  const chunk = {
    sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    cb_original: data.length
  }

  await expect(
    fetchChunk(hosts, depotId, chunk, key, lzma, 4)
  ).rejects.toThrow(/failed after 4 attempts/)

  expect(requestedHosts).toHaveLength(4)
  expect(new Set(requestedHosts).size).toBe(4)
}, 15000)
```

**New test to add (per RESEARCH.md's Phase Requirements -> Test Map):** "Concurrent chunk-workers within one file issue attempt-0 requests to more than one host when hosts are healthy" — follow this file's own `Promise.all` + `requestedHosts` capture idiom, asserting `new Set(requestedHosts at attempt 0 across concurrent calls).size > 1` when multiple `workerSlot`/`chunkWorkerSlot` values are exercised concurrently through `downloadFileChunks` (or via multiple direct `fetchChunk`/`pickHost` calls with distinct `workerSlot`s, whichever the plan's task grain prefers).

**Regression tests that MUST still pass unmodified** (existing coverage, do not touch):
- Cancel/abort test at ~L1853 (`'an external cancel is NEVER recorded via hostHealth.record or onAttempt'`)
- `'with a HostHealthTracker (cycle 3)'` describe block (L449+)

## Shared Patterns

### Additive-optional-parameter convention (applies to ALL three modified backend files)
**Source:** `src/backend/storeManagers/steam/depot/hostHealth.ts` L212-214 (constructor), `depot/decompress.ts` L807-833 (`fetchChunk` signature), `depot.ts` L889-915 (`downloadFileChunks` signature)
**Apply to:** Every new parameter added in this phase (`workerSlot` on `pickHost`, `chunkWorkerSlot`/`fileWorkerSlot` on `downloadFileChunks`/`downloadDepotFiles`/`downloadSingleFile`, and the corresponding new arg on `fetchChunk`)
```typescript
// The exact shape every prior cycle used and every new param must match:
/** <debug-thread/phase tag>: <what this param does and why>.
 *  Optional, additive: omitting it (every pre-<this-phase> caller/test)
 *  preserves the exact previous behavior — <describe the no-op default>. */
newParam?: SomeType
```

### `Array.from`'s native index-capture idiom (applies to both concurrency pools in depot.ts)
**Source:** `hostHealth.ts` L271 (`hosts.map((_, i) => hosts[(seed + i) % hosts.length])`) — the same idiom `depot.ts`'s two `Array.from({ length: workerCount }, async () => {...})` pools (L921, L1587) should adopt via their native `(_, i)` second callback arg.
**Apply to:** `downloadFileChunks`'s chunk-level pool and `downloadDepotFiles`'s file-level pool — both currently discard the index; Phase 25 must capture it.
```typescript
Array.from({ length: workerCount }, async (_, workerSlot) => {
  while (queue.length) { /* thread workerSlot down the call chain */ }
})
```

### Exported tunable constant with rationale comment (applies to the new `TOP_N_FANOUT` in hostHealth.ts)
**Source:** every existing constant in `hostHealth.ts` (`MAX_CONSECUTIVE_FAILURES` L78, `MIN_SAMPLES_FOR_UNHEALTHY` L84, `MIN_SUCCESS_RATE_FOR_HEALTHY` L91, `LATENCY_SCORE_DIVISOR_MS` L97, `WEIGHTEDLOAD_PRIOR_DIVISOR` L110, `PRIOR_HALFLIFE_SAMPLES` L125)
**Apply to:** the new fan-out width constant
```typescript
/** <rationale for the chosen small integer, e.g. "keeps fan-out to genuinely
 *  good hosts (see cycle-5's local-vs-CDN-fallback weightedload gap) while
 *  spreading attempt-0 load across more than one host">. */
export const TOP_N_FANOUT = 3
```

### Regression-guard test naming convention (applies to all new test cases)
**Source:** `hostHealth.test.ts`'s own titles — e.g. L295 `'omitting weightedLoads entirely (every pre-cycle-5 caller) reproduces the exact cycle-3/4 neutral cold-start order — no regression'`
**Apply to:** every new test asserting the omitted-param-preserves-old-behavior guarantee; name them `'omitting workerSlot ... reproduces the exact pre-Phase-25 ordered[0] pick — no regression'` in the same style.

## No Analog Found

None — every file in scope for this phase already exists and already contains its own precedent (this exact function/module's prior additive cycles). No new files are created; RESEARCH.md explicitly confirms "No new files needed."

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/` and `src/backend/storeManagers/steam/depot/` (including `__tests__/`) — the entire module family this phase touches; no broader codebase search was needed since RESEARCH.md already pinpointed every file and the files are self-analogous.
**Files scanned:** `hostHealth.ts` (full, 310 lines), `decompress.ts` (L700-985 targeted), `depot.ts` (L853-1013, L1234-1349, L1555-1634 targeted, plus grep for `CHUNK_CONCURRENCY`/`FILE_CONCURRENCY`/`Array.from` line numbers and `downloadSingleFile`'s signature), `hostHealth.test.ts` (L1-40 + grep of all `describe`/`it` titles), `depotPrimitives.test.ts` (L341-465 targeted + grep of all `describe`/`it` titles)
**Pattern extraction date:** 2026-07-19
