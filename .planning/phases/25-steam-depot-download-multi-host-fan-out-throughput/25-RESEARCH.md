# Phase 25: Steam depot download multi-host fan-out (throughput) - Research

**Researched:** 2026-07-19
**Domain:** Client-side CDN host-selection / concurrency scheduling for an in-process Steam depot downloader (TypeScript, Electron main process)
**Confidence:** HIGH

## Summary

This phase is a pure client-side scheduling fix inside code GameLib already owns and ships: `src/backend/storeManagers/steam/depot.ts`, `depot/hostHealth.ts`, and `depot/decompress.ts`. No new libraries, no new IPC surface, no protocol change. The root cause is fully diagnosed and code-confirmed by the resolved debug session `steam-install-slow-start` (Thread C, cycles 3-25) — this is **not** exploratory research, it is implementation research against an already-understood defect.

**The mechanism, read directly from source this session:** `HostHealthTracker.pickHost(hosts, seed, attemptIndex)` rotates its input array by `seed` and then **sorts by absolute composite score** (`healthy.sort((a,b) => compositeScore(b) - compositeScore(a))`). Sorting by an absolute score silently discards the rotation — once any host has a materially higher score than its peers (which happens almost immediately once `hostWeightedLoads` seeds a directory-based prior, cycle 5), `ordered[0]` is the *same* single top host regardless of what `seed` was. `attemptIndex` (the only dimension that changes which array slot is read) is a **per-chunk retry counter**, not a per-worker or per-file identifier — every worker's first attempt (`attemptIndex=0`) reads `ordered[0]`. Concurrency is real (`FILE_CONCURRENCY=8` files × `CHUNK_CONCURRENCY=4` chunks/file = up to 32 concurrent `fetchChunk` calls, confirmed in `depot.ts`), but every one of those ~32 calls independently converges on the identical host at attempt 0. With decode now clean (`err=0`, zstd fix landed), nothing ever fails, so nothing ever rotates past attempt 0. This matches the hardware telemetry exactly (`hosts=1`, `wl=17` in-flight, `avgMs~360`, 1.5-2.9 MiB/s) while `getContentServerHosts` had already returned 6 healthy candidates (`weightedLoads=6`) — the CDN directory is exonerated; the client never asked for more than one host at a time.

Two more design facts the planner must know: (1) each file gets its own `fileSeed` (sequential `0,1,2,...` per file, confirmed in `depot/reconcile.ts`), but this seed diversity is exactly the thing the absolute-score sort erases — it does NOT already provide cross-file fan-out; (2) within one file, all `CHUNK_CONCURRENCY` (4) concurrent chunk-workers share the *same* `fileSeed`, so even a per-file-only fix leaves 4-way convergence inside every file. The fix must therefore introduce a genuinely new dimension — an explicit worker/slot identity distinct from `attemptIndex` — that spreads attempt-0 selection across the top-N healthy hosts, while leaving `attemptIndex`'s failure-driven rotation, the unhealthy-bucket circuit breaker, `StallTracker`, and the cancel/abort signal path completely untouched.

**Primary recommendation:** Add a new, optional, additive parameter to `HostHealthTracker.pickHost` (e.g. `workerSlot: number`, defaulting to `0` when omitted so every existing call site/test is byte-for-byte unchanged) that, only at `attemptIndex === 0`, selects from the top-N healthy hosts by `workerSlot % N` instead of always `ordered[0]`; `attemptIndex > 0` keeps the exact current full-`ordered`-list rotation (so a failure still walks through every healthy-then-unhealthy host, unchanged). Thread a distinct `workerSlot` down from `depot.ts`'s two nested concurrency pools (the `FILE_CONCURRENCY` file-queue loop and the `CHUNK_CONCURRENCY` chunk-queue loop inside `downloadFileChunks`) so concurrently-running workers actually differ in the one dimension that matters.

## Candidate Requirements (no IDs minted yet — TBD by planner)

No requirement IDs exist for Phase 25 in `.planning/REQUIREMENTS.md` yet (confirmed by grep this session — nearest precedent is `SNI-01..08`, Phase 21's naming convention: a short domain prefix + sequential number). Based on the ROADMAP goal + acceptance criteria, the planner should mint requirements covering roughly these distinct, independently-verifiable behaviors (suggested prefix: `FANOUT-` or continuing the `SNI-` series as `SNI-09`+ since this is a direct extension of the Phase 21 depot engine):

| Candidate | Behavior | Source |
|-----------|----------|--------|
| 1 | `pickHost`'s attempt-0 selection spreads concurrent chunk-fetch workers across the top-N healthy content-server hosts (not always the single top-scored host), while attempt>0 (failure-driven rotation) is unchanged | ROADMAP goal + Thread C fix direction |
| 2 | Fan-out applies at BOTH the per-file (`FILE_CONCURRENCY`) and per-chunk-within-a-file (`CHUNK_CONCURRENCY`) concurrency levels — a single large file must not still converge on one host | Code-level finding this session (Pitfall 2) — not explicit in ROADMAP prose but necessary to satisfy the acceptance criteria for real (large-file-dominated) installs |
| 3 | Existing host-health scoring, unhealthy-bucket circuit breaker, stall-aware retry (`StallTracker`), and cancel/abort semantics are unchanged and covered by regression tests | ROADMAP "must not regress" constraint |
| 4 | Before/after real-hardware throughput measurement recorded, showing sustained `hosts>1` in `chunk-stream stats` and materially higher `downSpeedMiBs` than the ~1.5-2.9 MiB/s baseline | ROADMAP Acceptance Criteria |
| 5 *(optional, separate)* | Dormant CDN-auth token machinery (`cdnAuth.ts`) excised without behavior change for real hosts | ROADMAP "optional bundled cleanup" — recommend its own requirement ID if scoped in, so it can be tracked/deferred independently of 1-4 |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Host fan-out / attempt-0 selection | Backend (Electron main, `depot/hostHealth.ts`) | — | Pure in-process scheduling logic; no IPC, no renderer involvement |
| Chunk-worker pool / concurrency | Backend (`depot.ts`, `downloadFileChunks`/`downloadDepotFiles`) | — | Same process, same module family as host selection |
| Host-health scoring/circuit-breaker | Backend (`depot/hostHealth.ts`) | — | Must NOT regress — locked invariant |
| Stall-aware retry / give-up | Backend (`depot/stallTracker.ts`) | — | Must NOT regress — locked invariant |
| Cancel/abort signal propagation | Backend (`depot.ts` + `depot/decompress.ts` fetchChunk) | — | Must NOT regress — locked invariant, recently hardware-verified (Thread A) |
| Progress/throughput display | Frontend (DownloadManager) | Backend (`chunk-stream stats` log + existing `progressUpdate` IPC) | No change needed — existing `downSpeedMiBs`/`hosts=` telemetry already surfaces the fix's effect; frontend is a pure consumer |
| Before/after throughput measurement | Human/QA (real hardware) | Backend (log line already emits everything needed) | No new instrumentation required — `chunk-stream stats` already reports `hosts=`, `downSpeedMiBs`, per-host `wl=`/`avgMs=`/`unhealthy` |
| Optional CDN-auth excision | Backend (`depot/cdnAuth.ts` + call sites in `depot.ts`/`decompress.ts`) | — | Isolated dormant subsystem; touches the same files as the fan-out fix only incidentally (both live in `decompress.ts`'s `fetchChunk`) |

## Standard Stack

### Core

No new libraries. This phase modifies existing first-party TypeScript modules only.

| Module | Role | Why it's the right place |
|--------|------|---------------------------|
| `src/backend/storeManagers/steam/depot/hostHealth.ts` | `HostHealthTracker.pickHost` — the exact function diagnosed as the bottleneck (`depot/hostHealth.ts:267`) | Already owns all host-selection logic; already has an established "optional additive parameter, default preserves old behavior" convention used by every prior cycle (weightedLoads, cdnAuth, hostMeta) |
| `src/backend/storeManagers/steam/depot.ts` | `downloadFileChunks` (per-file chunk-worker pool, `CHUNK_CONCURRENCY=4`) and `downloadDepotFiles` (cross-file worker pool, `FILE_CONCURRENCY=8`) | Owns both concurrency pools that need a distinct worker-identity threaded through to `pickHost` |
| `src/backend/storeManagers/steam/depot/decompress.ts` | `fetchChunk` — already calls `hostHealth.pickHost(hosts, seed, i)` at line ~853 | Only call site of `pickHost`; needs to pass the new worker-slot argument through |

### Supporting (unchanged, verify no regression)

| Module | Role | Must remain unchanged |
|--------|------|------------------------|
| `depot/stallTracker.ts` (`StallTracker`) | Run-wide forward-progress clock; lets a chunk that exhausts `CHUNK_FETCH_ATTEMPTS` be re-queued instead of failing the whole file, unless the run has genuinely stalled (`STALL_TIMEOUT_MS = 3min`) | Fan-out changes attempt-0 host selection only, not retry/give-up semantics |
| `decompress.ts` `fetchChunk`'s abort handling (`ChunkFetchAbortedError`, `signal?.aborted` checks at top of every attempt and mid-fetch) | Cancel must abandon in-flight attempts immediately, never recorded as a host failure | No proposed change touches this path; must be regression-tested explicitly |
| `decompress.ts` sha1 integrity gate (`decodeChunk`, `sha1(data) === chunk.sha`) | Security control (T-21-03) — a chunk that never verifies is never returned | Completely orthogonal to host selection; unaffected by fan-out |
| `depot/cdnAuth.ts` (`CdnAuthTokenCache`, `wantsCdnAuthToken`) | Dormant CDN-auth token machinery, gated on `usetokenauth`/`type==='CDN'` | Only relevant to the optional cleanup (see below); NOT required for the throughput fix itself |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Additive `workerSlot` param on `pickHost`, top-N%N selection at attempt 0 only | Rewrite `pickHost` to always weighted-round-robin every attempt (not just attempt 0) | Rejected direction for a *first* cut — changes attempt-1+ (failure-rotation) semantics too, increasing regression surface against the 15 existing `hostHealth.test.ts` cases and `depotPrimitives.test.ts`'s host-rotation assertions. A minimal change that only alters attempt-0 behavior is lower-risk and directly targets the diagnosed gap (attempt-0 concentration), not the already-correct failure-rotation path. |
| Deriving worker identity from existing `fileSeed`/queue position | Introduce a brand-new global atomic counter across both worker pools | `fileSeed` already exists and is unique per file (sequential); the missing piece is (a) a per-chunk-worker-slot index *within* a file (currently absent — all `CHUNK_CONCURRENCY` workers in one file share one `fileSeed`) and (b) making sure the composite-score sort doesn't erase whatever dimension is chosen. Recommend threading an explicit small-integer worker index (0..`workerCount-1`) from each `Array.from({length: workerCount}, async () => ...)` pool — trivial, no new state, mirrors the existing pattern where `hostHealth`/`stallTracker`/`cdnAuth` are already threaded as extra optional args through the same call chain. |
| Top-N = a fixed constant (e.g. 3) | Top-N = all healthy hosts | A large N spreads load onto hosts that are technically "healthy" but ranked low (e.g. barely above the 0.35 success-rate cutoff) — could reintroduce some of the throughput loss the original scoring was designed to prevent. A small N (e.g. min(3, healthy.length) or min(4, ...)) keeps fan-out to genuinely good hosts while still using more than 1. This constant should be a named, documented export (following this file's existing convention of exporting every tunable as a `const X = ...` with a rationale comment) so the planner/task author can tune it without hunting for a magic number. |

### Version verification

Not applicable — no new package installs. `steam-user@5.3.0`, `zstddec` (already a direct dependency since the cycle-17 zstd fix), and all Phase 21/23 depot infra are already installed and unchanged by this phase.

## Package Legitimacy Audit

**Not applicable.** This phase installs no new packages. No `slopcheck`/registry verification needed — 100% of the change is to already-audited, already-shipped first-party modules.

## Architecture Patterns

### System Architecture Diagram

```
SteamGame.install() (games.ts)
        │
        ▼
downloadSteamDepots(appId, opts)  [depot.ts]
        │
        ├─▶ buildDepotPlan()            (unchanged — manifest/plan building)
        │
        ├─▶ getContentServerHosts()     (unchanged — CM round-trip, returns
        │        │                       ~6 hosts + weightedLoads + hostMeta;
        │        │                       ALREADY confirmed healthy, 6 hosts)
        │        ▼
        └─▶ downloadDepotFiles(opts: {hosts, hostWeightedLoads, hostMeta, ...})
                 │
                 │  ONE HostHealthTracker + ONE StallTracker for the WHOLE run
                 │
                 ▼
            FILE_CONCURRENCY(8) worker pool  ◀── ADD: per-worker slot index (0..7)
                 │  (shared job queue, one job = one file)
                 ▼
            downloadSingleFile() ──▶ downloadFileChunks()
                                          │
                                          │  CHUNK_CONCURRENCY(4) worker pool ◀── ADD: per-worker
                                          │  (shared chunk queue, one file's chunks)   slot index (0..3)
                                          ▼
                                     fetchChunk(hosts, ..., hostHealth, ..., signal)
                                          │
                                          │  attempt loop (i = 0..CHUNK_FETCH_ATTEMPTS-1)
                                          ▼
                                     hostHealth.pickHost(hosts, seed, i[, workerSlot])
                                          │        ▲ TODAY: sorts by absolute composite
                                          │        │ score, erasing `seed`/any rotation —
                                          │        │ every worker's i=0 call converges on
                                          │        │ the SAME single top host.
                                          │        │ FIX: at i===0, pick from top-N healthy
                                          │        │ by (workerSlot % N) instead of [0].
                                          │        │ i>0 (retry) UNCHANGED — full ordered
                                          │        │ list, failure-driven rotation intact.
                                          ▼
                                     HTTP fetch → decode (decrypt+decompress+sha1)
                                          │
                                          ▼
                                     hostHealth.record(host, outcome, ms)  (unchanged)
                                     onAttempt(...) → aggregated into
                                     "[Timing] chunk-stream stats" log      (unchanged —
                                          │                                  already reports
                                          ▼                                  hosts=, downSpeedMiBs,
                                     emitProgress() → progressUpdate IPC     per-host wl=/avgMs=)
                                          │
                                          ▼
                                 DownloadManager UI (frontend, UNCHANGED)
```

### Recommended Project Structure

No new files needed. All changes land in existing files:

```
src/backend/storeManagers/steam/
├── depot.ts                    # thread worker-slot index through both concurrency pools
└── depot/
    ├── hostHealth.ts           # pickHost gains optional workerSlot dimension; add TOP_N_FANOUT const
    ├── decompress.ts           # fetchChunk passes workerSlot through to pickHost
    └── __tests__/ (sibling)    # hostHealth.test.ts + depotPrimitives.test.ts gain new-dimension coverage
```

### Pattern 1: Additive-optional-parameter (this codebase's established convention)

**What:** Every prior fix cycle in this exact file (`weightedLoads` ctor arg, `hostMeta`, `cdnAuth`, `signal`) added a new capability as an **optional trailing parameter** whose *omission* reproduces the exact prior behavior byte-for-byte, proven by a dedicated regression test.

**When to use:** For this fix — `pickHost(hosts, seed, attemptIndex, workerSlot?: number)` where `workerSlot` defaults to `0`.

**Example (existing precedent in this file, from `hostHealth.ts`):**
```typescript
// Source: src/backend/storeManagers/steam/depot/hostHealth.ts (read this session)
constructor(weightedLoads?: ReadonlyMap<string, number>) {
  this.weightedLoads = weightedLoads ?? new Map()
}
```
Follow this exact idiom for the new parameter — do not change `pickHost`'s existing 3-arg call sites without a default.

### Pattern 2: Top-N selection distinct from full-rotation retry

**What:** Split `pickHost`'s behavior by `attemptIndex`: `attemptIndex === 0` uses the new worker-slot dimension against a bounded top-N slice of the healthy bucket; `attemptIndex > 0` keeps reading `ordered[attemptIndex % ordered.length]` exactly as today.

**When to use:** This is the core fix. It isolates the change to exactly the diagnosed gap (attempt-0 concentration) without touching the failure-driven rotation path that 15+ existing tests already lock down.

**Example (illustrative, not prescriptive of exact code — planner/implementer should match this file's existing style):**
```typescript
// Illustrative sketch only — see hostHealth.ts's actual ordered-array
// construction (healthy/unhealthy sort) for the real integration point.
const N = Math.min(TOP_N_FANOUT, healthy.length)
if (attemptIndex === 0 && N > 1) {
  return healthy[workerSlot % N]
}
return ordered[attemptIndex % ordered.length]
```

### Pattern 3: Worker-slot threading through nested concurrency pools

**What:** Both `FILE_CONCURRENCY` (`downloadDepotFiles`) and `CHUNK_CONCURRENCY` (`downloadFileChunks`) build their pools via `Array.from({length: workerCount}, async () => { while (queue.length) {...} })` — the async arrow currently receives no index. `Array.from` DOES pass an index as the second callback arg (`(_, i) => ...`), already visible in this file's own `hosts.map((_, i) => ...)` idiom inside `pickHost`.

**When to use:** Capture that index once per pool at spawn time and pass it down as the new `workerSlot`. Two nested pools means two independent slot dimensions (file-level 0..7, chunk-level 0..3 per file) — the planner should decide whether to combine them (e.g. `fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot`) or keep the chunk-level slot as the dominant dimension (simpler, since a single file's chunks are the dominant driver of concurrent attempt-0 fan-out once file-level parallelism has already spread files across their own `fileSeed`s). Either choice must be justified by a fresh mental model — do NOT assume `fileSeed` alone already provides this (it does not, per the Summary's finding).

**Example:**
```typescript
// Existing idiom already in this file, hostHealth.ts:271:
const rotated = hosts.map((_, i) => hosts[(seed + i) % hosts.length])
// Array.from's own (_, i) second-arg is the same idiom depot.ts should use
// to derive a worker index for its two `Array.from({ length: workerCount }, ...)` pools.
```

### Anti-Patterns to Avoid

- **Changing `attemptIndex > 0` behavior:** Any modification to how `pickHost` resolves *retry* attempts risks the 15 hardening tests in `hostHealth.test.ts` (half-open circuit breaker, consecutive-failure demotion, unhealthy-never-excluded, prior fade) and the failure-rotation tests in `depotPrimitives.test.ts`. Keep retries on the existing full-ordered-list path.
- **Removing the unhealthy-bucket demotion or the `MAX_CONSECUTIVE_FAILURES`/`MIN_SUCCESS_RATE_FOR_HEALTHY` circuit breaker to "simplify" fan-out:** These are the actual defense against the *original* problem this module was built to solve (a 0%-success host getting equal attempts). Fan-out must select among the ALREADY-healthy bucket, never override the health classification.
- **Increasing `CHUNK_CONCURRENCY`/`FILE_CONCURRENCY` instead of fixing fan-out:** The debug session explicitly recorded (cycle 1-2) that these constants were deliberately left unchanged — raising them manufactures more *simultaneous requests to the same single host* under the current bug, making the problem worse, not better, until fan-out itself is fixed.
- **Treating this as a decode/correctness bug:** It explicitly is not (cycle 24-25 conclusively retired the `unknown_container` hypothesis). Do not reintroduce decode-path changes into this phase's scope.
- **Silent behavior change on omitted `workerSlot`:** Every existing `pickHost(hosts, seed, attemptIndex)` 3-arg call site (all of `hostHealth.test.ts`) must continue to produce identical output. Default `workerSlot` to a value that is a no-op relative to today (e.g. `0`, which — combined with top-N selection at N possibly being 1 for a small `hosts.length` — degrades gracefully to the current `ordered[0]` pick).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-host load distribution | A new bespoke load-balancer class/module | Extend the existing `HostHealthTracker.pickHost` in place | The scoring, circuit-breaker, and unhealthy-bucket logic this needs to compose with already lives there; a parallel selector would duplicate ~300 lines of hardened, tested logic and risk drifting out of sync |
| Throughput measurement/instrumentation | A new metrics/telemetry file or log format | The existing `chunk-stream stats` log line (`depot.ts`, `logChunkStreamStats`) | Already reports `hosts=`, `downSpeedMiBs`, per-host `wl=`/`avgMs=`/`unhealthy`/`type=` — exactly the fields the acceptance criteria's `grep` diagnostic already reads. No new diagnostic surface needed; verify the fix by confirming `hosts>1` appears sustained in this existing line |
| Worker identity / concurrency indexing | A new task-queue library or worker-pool abstraction | `Array.from`'s native `(_, i)` second callback argument, already used elsewhere in this exact file | This codebase's own established idiom; introducing a queue library here would be pure scope creep for what's a 1-line index capture |

**Key insight:** This module family (`depot.ts` + `depot/*.ts`) has an unusually well-documented, single-threaded history of exactly this class of fix (7+ debug cycles, each one an additive-optional-parameter change with a byte-for-byte-unchanged-when-omitted regression test). The fan-out fix should follow that exact template rather than introducing a new abstraction.

## Common Pitfalls

### Pitfall 1: Assuming `fileSeed` diversity already provides fan-out
**What goes wrong:** A planner might assume that because each file gets a distinct sequential `fileSeed` (confirmed in `depot/reconcile.ts:136`, `seed++`), attempt-0 selection across files is already spread out.
**Why it happens:** The rotation math (`hosts.map((_, i) => hosts[(seed + i) % hosts.length])`) LOOKS like it produces a different starting host per seed — but `pickHost` then sorts that rotated array by absolute composite score, which is seed-independent. Once scores differentiate (near-immediately, due to the weightedload prior), the sort produces the identical order regardless of `seed`.
**How to avoid:** Read `pickHost`'s full body (hostHealth.ts:267-291) before designing the fix — the rotation is cosmetic once real scores exist; the sort is what actually determines attempt-0 host, and it currently has zero worker/seed awareness.
**Warning signs:** A "fix" that only changes `fileSeed` derivation, or only changes the chunk-level `attemptSeed` computation in `depot.ts:928` (`fileSeed % hosts.length`), without touching `pickHost`'s sort/selection itself, will NOT change observed behavior on real hardware — it will regress to the identical single-host convergence, because the sort discards whatever seed diversity exists upstream.

### Pitfall 2: Within-file convergence surviving a cross-file-only fix
**What goes wrong:** A fix that only diversifies selection across `FILE_CONCURRENCY` (8 files) but not across `CHUNK_CONCURRENCY` (4 chunk-workers within one file) still leaves those 4 concurrent workers converging on one host per file — for a single large file (common for the biggest depot files, which dominate total bytes), this reproduces most of the original throughput cap.
**Why it happens:** `downloadFileChunks`'s chunk-worker pool (`Array.from({ length: workerCount }, ...)`, `workerCount = min(CHUNK_CONCURRENCY, queue.length)`) currently has all workers share the identical `fileSeed` parameter passed in from the caller.
**How to avoid:** Thread a distinct worker-slot index at BOTH concurrency levels — the file-level pool in `downloadDepotFiles` (depot.ts ~1586) and the chunk-level pool in `downloadFileChunks` (depot.ts ~920).
**Warning signs:** Post-fix hardware telemetry showing `hosts>1` in aggregate over a whole run, but per-file/per-window sampling (or a large single-file-dominated depot) still showing sustained single-host convergence.

### Pitfall 3: Regressing the failure-driven rotation or circuit breaker
**What goes wrong:** Broadening the fan-out logic to *every* attempt index (not just attempt 0) subtly changes what "rotate on failure" means — e.g. a chunk's attempt-1 retry might now land on a DIFFERENT top-N host than the pre-fix single-best-host escalation, which could interact unexpectedly with the unhealthy-bucket demotion timing (`MAX_CONSECUTIVE_FAILURES=5` is PER HOST, not per selection path).
**Why it happens:** It's tempting to unify "fan-out" and "failure rotation" into one mechanism since they both call the same function.
**How to avoid:** Gate the new top-N/worker-slot behavior strictly to `attemptIndex === 0`; leave `attemptIndex > 0` reading `ordered[attemptIndex % ordered.length]` exactly as today, so a chunk that fails against its fanned-out attempt-0 host still walks the SAME full-ordered escalation path (healthy-then-unhealthy, worst-scored last) that the 15 existing `hostHealth.test.ts` cases already assert.
**Warning signs:** Any existing `hostHealth.test.ts` or `depotPrimitives.test.ts` test failing after the change — these are the regression oracle; a green suite here is close to sufficient proof the retry/circuit-breaker semantics are untouched.

### Pitfall 4: Top-N too large, diluting fan-out onto marginal hosts
**What goes wrong:** Setting the fan-out width (top-N) equal to `hosts.length` effectively round-robins across ALL hosts including barely-healthy ones (success rate just above `MIN_SUCCESS_RATE_FOR_HEALTHY=0.35`), which could reduce aggregate throughput versus concentrating on the 2-3 genuinely best hosts (mirrors the real Steam client's documented near-exclusive preference for local low-weightedload caches, per this file's own cycle-5 comments).
**Why it happens:** "Spread across all healthy hosts" sounds more thorough than "spread across the top few."
**How to avoid:** Cap top-N at a small constant (e.g. 3-4, tunable, exported like every other constant in this file with a documented rationale) rather than using the full healthy-bucket size.
**Warning signs:** Post-fix throughput measurement showing `hosts>1` but average per-host `avgMs` degrading, or `downSpeedMiBs` improving less than expected — a sign attempt-0 load is being spread too thin onto mediocre hosts.

### Pitfall 5: Forgetting this is diagnosed, not exploratory
**What goes wrong:** Re-investigating whether the CDN directory under-serves hosts, or re-opening the decode-correctness thread, wasting phase budget on already-closed questions.
**Why it happens:** The debug file is 2289 lines across 27 cycles; without reading the resolution carefully it's easy to think more diagnosis is needed.
**How to avoid:** Treat cycles 24-25's findings as HIGH-confidence, code-and-hardware-confirmed facts (not hypotheses): CDN directory returns 6 healthy hosts; decode is clean (`err=0`); the gap is purely `pickHost`'s attempt-0 concentration. No new hardware capture or diagnostic logging is needed before implementing — the existing `chunk-stream stats` line is sufficient for the phase's own before/after acceptance measurement.
**Warning signs:** A plan that includes "add new diagnostic logging" or "investigate whether hosts=6 is reliable" as a task — this was already done and closed.

## Code Examples

### Existing `pickHost` call site (the one and only place to change the call)

```typescript
// Source: src/backend/storeManagers/steam/depot/decompress.ts (read this session, ~line 852)
const host = hostHealth
  ? hostHealth.pickHost(hosts, seed, i)
  : hosts[(seed + i) % hosts.length]
```
This is inside `fetchChunk`'s per-attempt loop (`for (let i = 0; i < attempts; i++)`). `fetchChunk` itself has no concept of "which concurrent worker is calling it" today — that identity must be threaded in as a new parameter from `downloadFileChunks`.

### Existing worker-pool construction (both levels use this exact idiom)

```typescript
// Source: src/backend/storeManagers/steam/depot.ts (read this session, ~line 920, chunk-level)
const workerCount = Math.min(CHUNK_CONCURRENCY, queue.length)
await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (queue.length) { /* ... */ }
  })
)
```
```typescript
// Source: src/backend/storeManagers/steam/depot.ts (read this session, ~line 1586, file-level)
const workerCount = Math.min(FILE_CONCURRENCY, queue.length)
await Promise.all(
  Array.from({ length: workerCount }, async () => {
    while (queue.length) { /* calls downloadSingleFile → downloadFileChunks */ }
  })
)
```
Both `Array.from` calls currently discard the native `(_, i)` index. Capturing `i` at each level and threading it down (as `fileWorkerSlot`/`chunkWorkerSlot`) is the mechanical core of the fix.

### Existing `chunk-stream stats` log line (verification tool, no change needed)

```typescript
// Source: src/backend/storeManagers/steam/depot.ts (read this session, ~line 1487)
logInfo(
  `[Timing] chunk-stream stats @${elapsedSec}s: percent=${percent}% ` +
    `downSpeedMiBs=${lastDownSpeed.toFixed(2)} diskSpeedMiBs=${lastDiskSpeed.toFixed(2)} ` +
    `totalAttempts=${totalAttempts} rotations=${totalRotations} timeouts=${totalTimeouts} ` +
    `hosts=${hostStats.size} worstHosts=[${worst}]`,
  LogPrefix.Steam
)
```
`hosts=${hostStats.size}` is exactly the acceptance-criteria diagnostic (`grep "chunk-stream stats" ... expect hosts>1`). No new logging is required; this line already aggregates per-host `a=`/`ok=`/`to=`/`err=`/`avgMs=`/`wl=`(weightedload)/`unhealthy`/`type=` every `STATS_LOG_EVERY_TICKS` (~15s).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Plain round-robin host selection (`hosts[(seed+i) % hosts.length]`) | `HostHealthTracker`-scored selection with weightedload prior | cycle 3 + cycle 5 of `steam-install-slow-start` | Solved the "dead host gets equal share" problem, but introduced this phase's bug: absolute-score sort erases rotation once scores differentiate |
| `unknown_container` decode-failure hypothesis for Thread C | Retired — decode confirmed clean after zstd fix (cycle 17) | cycle 24 | This phase's problem is 100% scheduling, not correctness; do not reopen decode work |
| Suspected CDN-directory under-provisioning | Confirmed NOT the cause — directory returns 6 healthy hosts every time | cycle 25 | Fix is entirely client-side; no server-side/API investigation needed |

**Deprecated/outdated:** None — this is the current, most-recent understanding as of 2026-07-19 (session resolved same day). No stale training-data risk here since every claim above was verified by reading the actual current source in this session.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Top-N fan-out width should be a small constant (3-4), not the full healthy-bucket size | Standard Stack / Common Pitfalls #4 | If wrong (e.g. real hardware shows more hosts needed for saturation), the constant is trivially tunable — low risk, but the exact number is a judgment call not verified against a real multi-host hardware capture in this research session |
| A2 | Combining file-level and chunk-level worker-slot indices via `fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot` (vs. using only the chunk-level slot) is the right granularity | Architecture Patterns / Pattern 3 | If the planner picks a coarser scheme (chunk-level slot only) fan-out could still be adequate since each file's own worker pool already gets `CHUNK_CONCURRENCY` distinct slots recycled per file — this is a design choice for the plan, not a verified requirement |
| A3 | The CDN-auth cleanup (`cdnAuth.ts` excision) is safe to defer/descope from this phase without risk to the fan-out fix | Optional Bundled Cleanup section below | If a future contributor conflates the two while editing `decompress.ts`'s `fetchChunk`, an incomplete/partial excision could interact with the new worker-slot parameter being added to the same function signature in the same phase — recommend the planner sequence cleanup AFTER the fan-out fix lands and is hardware-verified, as its own optional final task/plan |

**None of the core diagnostic claims (root cause, mechanism, hosts=6 confirmed healthy, decode clean) are assumptions** — they are `[VERIFIED: source read this session]` against `hostHealth.ts`, `depot.ts`, and `decompress.ts`, cross-confirmed against the resolved, hardware-corroborated debug session `.planning/debug/resolved/steam-install-slow-start.md` (cycles 24-25).

## Open Questions

1. **Exact top-N fan-out width**
   - What we know: The 6-host pool splits into 3 local SteamCache edges (weightedload 20-48) and 3 global CDN fallbacks (weightedload 130, deliberately deprioritized to mirror the real Steam client). Fan-out should stay within the "genuinely good" subset.
   - What's unclear: Whether N=2, N=3, or N=4 best matches real-hardware throughput ceiling for a typical 6-host pool — no fresh hardware capture of a fanned-out run exists yet (correctly so — the fix hasn't been implemented).
   - Recommendation: Make it a named exported constant (following this file's established pattern), default to `min(3, healthy.length)`, and require the phase's own before/after hardware measurement (already in Acceptance Criteria) to validate/tune it. Do not treat the exact number as load-bearing for correctness — only for throughput magnitude.

2. **Whether to combine file-level and chunk-level worker-slot dimensions, or use only one**
   - What we know: Both dimensions independently contribute to attempt-0 convergence (Pitfall 2). A fix must address the chunk-level dimension (largest single-file impact) at minimum.
   - What's unclear: Whether file-level diversity alone (spreading each file's uniform `fileSeed`-driven pick) is already "good enough" once the chunk-level dimension is fixed, or whether both need explicit combination.
   - Recommendation: Fix the chunk-level dimension first (inside `downloadFileChunks`, the smaller and clearer-cut of the two `Array.from` pools) and verify via hardware measurement; add file-level combination only if the single-file-dominated case (Pitfall 2's warning sign) still shows convergence.

3. **CDN-auth cleanup scope-in vs scope-out for this phase**
   - What we know: `cdnAuth.ts` is 611 lines, referenced ~68 times across `depot.ts`/`decompress.ts`, has its own test file (`cdnAuth.test.ts`) and fixture, and is proven dormant for real hosts (`usetokenauth` absent on every observed real host; the `type==='CDN'` gate widening was itself a cycle-level fix later found unnecessary in practice since those hosts are barely used).
   - What's unclear: Whether removing it in the same phase as the fan-out fix increases regression risk (both touch `fetchChunk`'s signature/body) enough to warrant a separate phase/plan.
   - Recommendation: See "Optional Bundled Cleanup Risk Assessment" below — treat as an optional LAST wave/plan within this phase, strictly after the fan-out fix's own full regression pass is green, or descope to its own future phase entirely. Either is defensible; the roadmap already frames it as "optional."

## Optional Bundled Cleanup Risk Assessment (CDN-auth excision)

**Scope:** `src/backend/storeManagers/steam/depot/cdnAuth.ts` (611 lines) plus every call site of `cdnAuth`/`CdnAuthTokenCache`/`wantsCdnAuthToken`/`usetokenauth` in `depot.ts` and `depot/decompress.ts` (~68 references confirmed via grep this session), plus its dedicated test file `__tests__/cdnAuth.test.ts` and fixture `__tests__/fixtures/cdnAuthSendFixture.ts`.

**Why it's dormant, not risky-to-keep:** Per `fetchChunk`'s own doc comment (verified this session), a token is fetched only when `wantsCdnAuthToken(meta)` is true (i.e. `usetokenauth === true` OR `type === 'CDN'`) AND a `cdnAuth` instance was supplied. Real-hardware captures across the entire debug session show `usetokenauth` absent on every observed host, and the `type==='CDN'` global fallback hosts (weightedload 130) receive negligible traffic even before this phase's fix (and will receive relatively LESS after fan-out favors the local low-weightedload hosts). It is not a security or correctness risk left in place — it is inert.

**Risk of removing it now (same phase as the fan-out fix):**
- Both changes touch `fetchChunk`'s parameter list and body in `decompress.ts` — sequencing them in the same phase/plan increases the chance of a conflated diff that's harder to bisect if either regresses.
- `cdnAuth.test.ts` has ~15+ dedicated test cases (token-fetch gating, 401/403 invalidation, per-host caching, timeout degradation) that would all need deletion/rewrite — a nontrivial, separate-from-throughput unit of work with its own tsc/lint/test pass, exactly as the roadmap itself flags ("needs its own tsc/test pass if included").
- No functional behavior changes for real-world hosts either way (dormant code produces the same observable output as no code) — so there is no urgency forcing it into this phase.

**Recommendation:** Descope to its own follow-up phase/quick-task, OR include only as a strictly-sequenced final wave/plan in this phase, gated behind the fan-out fix's own hardware-verified acceptance criteria passing first, with its own full `tsc`/`eslint`/`jest` gate. Do not interleave the two changes' edits to `fetchChunk`'s signature in the same commit/plan.

## Environment Availability

Not applicable — this phase has no new external tool/service/runtime dependencies. It modifies existing TypeScript running inside the existing Electron main process, tested via the project's existing `jest` suite, on the existing `steam-user` CM connection. Real-hardware throughput verification requires only what every prior cycle of this debug session already used: a real Steam account, a real depot install, and log access at `~/Library/Logs/gamelib/gamelib.log` (macOS/Apple Silicon, per Acceptance Criteria).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (project-wide; ts-jest/CJS interop per this codebase's established discipline) |
| Config file | `jest.config.*` at repo root (existing, unchanged) |
| Quick run command | `npm test -- --testPathPattern=steam/(hostHealth|depotPrimitives|depot)` |
| Full suite command | `npm run test:ci` (existing `jest --runInBand --silent`) |

### Phase Requirements -> Test Map

No requirement IDs exist yet for Phase 25 (see Candidate Requirements section above for minting guidance). Mapping by expected behavior instead:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|--------------------|--------------|
| `pickHost` with a `workerSlot` omitted reproduces byte-for-byte current output (no regression) | unit | `npm test -- --testPathPattern=hostHealth` | Existing test file (`hostHealth.test.ts`), needs new cases added |
| `pickHost` at `attemptIndex===0` with distinct `workerSlot` values returns different hosts among top-N when scores differ meaningfully | unit | `npm test -- --testPathPattern=hostHealth` | Existing file, net-new test |
| `pickHost` at `attemptIndex>0` (retry) is unaffected by `workerSlot` — full ordered-list rotation preserved | unit | `npm test -- --testPathPattern=hostHealth` | Existing file, net-new regression-guard test |
| Concurrent chunk-workers within one file (`downloadFileChunks`) issue attempt-0 requests to more than one host when hosts are healthy | unit (mocked fetch, assert distinct hostnames across concurrent calls) | `npm test -- --testPathPattern=depotPrimitives` | Existing file, net-new test — follow the file's existing `urlStr.split('/')[2]` host-extraction idiom (already used in the "rotates to a different host each attempt" test) |
| Cancel/abort during a fanned-out attempt still throws `ChunkFetchAbortedError` immediately, never recorded via `hostHealth.record` | unit (regression guard) | `npm test -- --testPathPattern=depotPrimitives` | Existing coverage (line ~1853) — MUST still pass unmodified after the change |
| Stall-aware retry (`StallTracker`) behavior unaffected by fan-out | unit (regression guard) | `npm test -- --testPathPattern=depot.test` | Existing coverage — re-run, expect zero diff in pass count |
| Full suite green, zero regressions | full | `npm run test:ci` | N/A (aggregate gate) |
| Real-hardware throughput improvement | manual (human-verify checkpoint) | `grep "chunk-stream stats" ~/Library/Logs/gamelib/gamelib.log \| tail -20` — expect sustained `hosts>1` and higher `downSpeedMiBs` vs. the ~1.5-2.9 MiB/s baseline recorded in the resolved debug session | N/A — this is the phase's own Acceptance Criteria, cannot be automated (depends on real Steam CDN edges and a real large depot) |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=steam/(hostHealth|depotPrimitives|depot)` (fast, scoped to touched modules)
- **Per wave merge:** `npm run test:ci` (full suite, matches this codebase's own established pre-land discipline — 85/85 suites / 1607+ tests green was the bar for the prior landed bundle)
- **Phase gate:** Full suite green + the manual real-hardware `chunk-stream stats` check before `/gsd:verify-work`

### Wave 0 Gaps

None — the test infrastructure (`hostHealth.test.ts`, `depotPrimitives.test.ts`, `depot.test.ts`) already exists, is comprehensive (15+ existing `HostHealthTracker` cases, dozens of `fetchChunk`/host-rotation cases), and follows a well-established regression-guard pattern this phase should extend rather than replace. No new test files or shared fixtures are required before implementation can begin.

## Security Domain

`security_enforcement` is absent from `.planning/config.json` — treated as enabled per protocol, but this phase has minimal security surface: it changes only which already-authenticated, already-verified CDN host a chunk request goes to, not what is requested, how it's decrypted, or how it's verified.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Unaffected — CDN chunk fetches are unauthenticated HTTP(S) GETs against public content-server edges, unchanged by this phase |
| V3 Session Management | No | Unaffected — no session/token logic touched (CDN-auth token cache, if excised, is a separate optional cleanup, not this phase's core change) |
| V4 Access Control | No | N/A |
| V5 Input Validation | No new surface | The `sha1(decompressed) === chunk.sha` integrity gate (T-21-03) and `resolveContainedPath` path-traversal guard (T-21-01) are both untouched by this phase — fan-out only changes host selection, never what's validated |
| V6 Cryptography | No | Depot decryption (`steamDecrypt`) is unchanged; fan-out selects among content-server hosts, all of which serve identically-encrypted chunks per the existing depot key |
| V14 Configuration/Misc | Marginal | Any new tunable constants (top-N fan-out width) should be named exports with rationale comments, matching this file's own existing convention — not hardcoded magic numbers |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| A malicious/compromised CDN edge serving tampered chunk bytes | Tampering | Already mitigated, unaffected by this phase — `sha1(decompressed) === chunk.sha` gate in `decodeChunk` rejects any chunk that doesn't match the manifest-provided hash, regardless of which host served it |
| Fan-out inadvertently sending more traffic to a *marginal* (not fully unhealthy) host, degrading overall reliability | (not a STRIDE security threat — a reliability/performance risk) | Cap top-N fan-out width to a small constant (Pitfall 4); the existing unhealthy-bucket circuit breaker is untouched and still excludes genuinely bad hosts from the fan-out set entirely |

## Sources

### Primary (HIGH confidence — read directly this session)
- `src/backend/storeManagers/steam/depot/hostHealth.ts` (full file read) — `HostHealthTracker`, `pickHost`, scoring/prior/circuit-breaker mechanics
- `src/backend/storeManagers/steam/depot.ts` (multiple sections read: L640-970, L1270-1345, L1340-1500, L1558-1633, L1912-2051) — `downloadFileChunks`, `downloadDepotFiles`, `downloadSteamDepots`, `getContentServerHosts`, `CHUNK_CONCURRENCY`/`FILE_CONCURRENCY` constants, `chunk-stream stats` logging
- `src/backend/storeManagers/steam/depot/decompress.ts` (L700-985 read) — `fetchChunk`'s attempt loop, `pickHost` call site, cancel/abort handling, cdnAuth gating
- `src/backend/storeManagers/steam/depot/stallTracker.ts` (full file read) — `StallTracker`, `STALL_TIMEOUT_MS`
- `src/backend/storeManagers/steam/depot/reconcile.ts` (grep-confirmed) — `fileSeed = seed++` sequential assignment
- `src/backend/storeManagers/steam/__tests__/hostHealth.test.ts` (test names read) — 15+ existing regression-guard cases
- `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts` (test names read) — host-rotation, cdnAuth-gating, cancel/abort test coverage
- `.planning/debug/resolved/steam-install-slow-start.md` (targeted grep across full 2289-line file, cycles 24-27 read in full) — the resolved, hardware-corroborated diagnosis of Thread C
- `.planning/ROADMAP.md` (Phase 25 section) — goal, acceptance criteria, locked fix direction
- `.planning/STATE.md` (Roadmap Evolution entry for Phase 25, added 2026-07-19)
- `.claude/skills/spike-findings-gamelib/SKILL.md` — confirms no overlap with this phase's scope (macOS bridge / ACF adoption spikes are unrelated to host fan-out)
- `.planning/config.json` — confirmed `workflow.nyquist_validation: true`, `security_enforcement` absent (treated enabled)
- `.planning/REQUIREMENTS.md` (grep) — confirmed no Phase 25 requirement IDs exist yet; SNI-01..08 (Phase 21) is the nearest precedent for ID-minting convention

### Secondary (MEDIUM confidence)
- graphify knowledge graph queries (`graphify query`, `graphify explain`) — used to orient before file reads per project convention; confirmed module locations and call relationships, cross-checked against direct source reads above

### Tertiary (LOW confidence)
- None — every claim in this document is either read directly from current source this session, or drawn from the resolved (hardware-corroborated) debug session. No unverified training-data claims were needed for this phase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all modules read directly this session
- Architecture: HIGH — mechanism traced end-to-end from `downloadSteamDepots` through `pickHost`, confirmed against real hardware telemetry in the resolved debug session
- Pitfalls: HIGH — every pitfall is either a direct code-reading finding (the score-sort erasing rotation, the shared `fileSeed` within a file) or an explicit lesson already recorded by the debug session's own cycle history
- Fan-out width (top-N) tuning: MEDIUM — the *mechanism* is HIGH confidence; the *exact constant* is a judgment call pending the phase's own hardware measurement (see Assumptions Log A1)

**Research date:** 2026-07-19
**Valid until:** No expiry risk from external drift (no third-party API/library surface) — re-verify only if `depot.ts`/`hostHealth.ts`/`decompress.ts` are modified by an unrelated phase before Phase 25 executes (check `git log` on these three files before planning if significant time has passed).
