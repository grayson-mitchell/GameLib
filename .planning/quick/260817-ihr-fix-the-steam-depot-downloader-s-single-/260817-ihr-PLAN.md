---
phase: quick-260817-ihr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/hostHealth.ts
  - src/backend/storeManagers/steam/__tests__/hostHealth.test.ts
  - src/backend/storeManagers/steam/depot/inflightLimiter.ts
  - src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts
  - src/backend/storeManagers/steam/depot.ts
  - .planning/debug/resolved/steam-install-slow-start.md
autonomous: true
requirements: [IHR-01, IHR-02, IHR-03]
must_haves:
  truths:
    - "A host demoted by a transient failure streak regains attempt-0 traffic and rejoins the healthy fan-out pool after one success, instead of staying frozen out for the rest of the run"
    - "A genuinely dead demoted host costs at most 1 in DEMOTED_PROBE_INTERVAL first attempts"
    - "Concurrent in-flight chunk requests are bounded by an explicit run-level budget rather than collapsing to FILE_CONCURRENCY when files are single-chunk"
    - "Every existing pickHost behavior (fan-out on attempt 0, failure rotation on attempt > 0, single-healthy-host fallback, empty-list throw) is unchanged"
    - "The resolved debug doc records the 2026-08-17 evidence that disproves the 'single-host fan-out' premise"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot/hostHealth.ts"
      provides: "Probe-based recovery for demoted hosts"
      contains: "DEMOTED_PROBE_INTERVAL"
    - path: "src/backend/storeManagers/steam/depot/inflightLimiter.ts"
      provides: "Run-scoped FIFO concurrency limiter for chunk fetches"
      exports: ["InflightLimiter"]
    - path: "src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts"
      provides: "Unit coverage for the limiter's cap, FIFO order, and release-on-throw"
  key_links:
    - from: "src/backend/storeManagers/steam/depot.ts"
      to: "src/backend/storeManagers/steam/depot/inflightLimiter.ts"
      via: "downloadDepotFiles creates one limiter per run; downloadFileChunks wraps each fetchChunk call"
      pattern: "limiter\\.run\\("
    - from: "src/backend/storeManagers/steam/depot/hostHealth.ts"
      to: "src/backend/storeManagers/steam/depot/decompress.ts"
      via: "fetchChunk calls pickHost(hosts, seed, i, workerSlot) — signature unchanged"
      pattern: "pickHost\\(hosts, seed, i, workerSlot\\)"
---

<objective>
Restore real Steam depot download throughput on the native install path.

**The task premise as filed is disproven by the stalled run's own log — read this before writing code.**

The described fix ("pickHost sends every attempt-0 chunk request to the single top-scored
host; fan out across the top-N healthy hosts") **already shipped** as Phase 25 (commit
`9923545e3`, 2026-07-19, ancestor of HEAD; see
`.planning/phases/25-steam-depot-download-multi-host-fan-out-throughput/`). `TOP_N_FANOUT`,
the `workerSlot` parameter, and the full `fileWorkerSlot * CHUNK_CONCURRENCY + chunkWorkerSlot`
wiring from `downloadDepotFiles` -> `downloadSingleFile` -> `downloadFileChunks` -> `fetchChunk`
are all present and working. Re-implementing them is a no-op.

The 2026-08-17 12:52:57 `chunk-stream stats` line from the stalled HUMANKIND run
(`~/Library/Logs/gamelib/gamelib.log`) shows fan-out functioning and shows two DIFFERENT
defects:

```
totalAttempts=16138 rotations=37 timeouts=33 hosts=5
cache2-akl-tpwr [a=5219 ok=5202 to=13 err=4  avgMs=1000 wl=27]
cache1-akl-edgx [a=2848 ok=2835 to=11 err=2  avgMs=770  wl=7   UNHEALTHY]
cache1-akl-tpwr [a=3079 ok=3072 to=7  err=0  avgMs=681  wl=25  UNHEALTHY]
steampipe.akamaized.net [a=2051 ok=2050 to=1 err=0 avgMs=1204 wl=130]
alibaba.cdn... [a=2941 ok=2940 to=1 err=0 avgMs=1514 wl=130]
```

**Defect 1 — the circuit breaker is a one-way door (IHR-01).** Two local caches with
**99.5% and 99.8% lifetime success** are flagged `UNHEALTHY`. Only
`consecutiveFailures >= MAX_CONSECUTIVE_FAILURES` can do that at those success rates, so a
brief blip demoted them. `pickHost` fans attempt-0 across `healthy` **only**, so a demoted
host receives no further first attempts, therefore never records another success, therefore
never clears its streak. The "half-open circuit breaker" documented in `MutableHostStats`
("Resets to 0 on ANY success") is **unreachable in production** — it needs traffic it can
never get. Proof in the log: between the 12:39:30 and 12:52:57 stats lines the two demoted
hosts' counters are frozen byte-identical (`a=2848`, `a=3079`) while the three survivors kept
moving. The pool shrank from 5 hosts to 3, including the loss of `wl=7` — the directory's
own best-ranked host.

**Defect 2 — effective concurrency is 8, not 32 (IHR-02).** Little's Law on the same line:
16092 attempts / 1334 s = 12.06 attempts/sec, avgMs 692 -> **8.35 requests in flight**. That
is exactly `FILE_CONCURRENCY = 8`, not the intended `FILE_CONCURRENCY * CHUNK_CONCURRENCY = 32`.
Cause is visible in `downloadFileChunks`: `workerCount = Math.min(CHUNK_CONCURRENCY, queue.length)`.
HUMANKIND is **18,949 files** against roughly 16k chunks for 29% of the bytes, so the
overwhelming majority of files are **single-chunk** -> `workerCount = 1` -> the whole run
sustains only 8 concurrent HTTP requests. That is the real throughput cap, and it explains
2.32 MiB/s directly: 8 workers x (~198 KiB / 0.692 s) = ~2.3 MiB/s. Per-host success is
99.7% and `rotations=37` out of 16k — nothing is failing; we are simply not asking for
enough at once.

Purpose: fix the two evidenced defects and correct the written record so the next session
does not re-derive a disproven premise.
Output: recoverable host demotion, an explicit run-level in-flight budget, unit coverage for
both, and a correction appended to the resolved debug doc.

**Out of scope, unchanged, do not touch:** the no-progress watchdog, the
abort/DownloadManager cancellation path, `CdnAuthTokenCache`, and all StateFlags=4 /
execute-bit / chmod logic. Also do NOT alter `isUnhealthy`'s thresholds
(`MAX_CONSECUTIVE_FAILURES`, `MIN_SUCCESS_RATE_FOR_HEALTHY`, `MIN_SAMPLES_FOR_UNHEALTHY`) —
the fast-catch on a genuinely dead host (the historical alibaba 0/258 case) must survive;
this plan makes demotion *recoverable*, not *rarer*.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/resolved/steam-install-slow-start.md
@src/backend/storeManagers/steam/depot/hostHealth.ts
@src/backend/storeManagers/steam/__tests__/hostHealth.test.ts

Also relevant, read only the ranges you need:
- `src/backend/storeManagers/steam/depot.ts` L790-L815 (concurrency constants),
  L988-L1110 (`downloadFileChunks`), L1960-L2020 (`downloadDepotFiles` file-worker pool).
- `src/backend/storeManagers/steam/depot/decompress.ts` L830-L870 (`fetchChunk`'s
  `pickHost` call — signature must NOT change).

Project skill: `Skill("spike-findings-gamelib")` covers Steam native-install internals.
</context>

<interfaces>
Current contracts the executor builds against (already in the codebase — do not re-derive):

`src/backend/storeManagers/steam/depot/hostHealth.ts`
```typescript
export const MAX_CONSECUTIVE_FAILURES = 5
export const MIN_SAMPLES_FOR_UNHEALTHY = 5
export const MIN_SUCCESS_RATE_FOR_HEALTHY = 0.35
export const TOP_N_FANOUT = 3
export type HostAttemptOutcome = 'success' | 'timeout' | 'error'
export class HostHealthTracker {
  constructor(weightedLoads?: ReadonlyMap<string, number>)
  record(host: string, outcome: HostAttemptOutcome, ms: number): void
  pickHost(hosts: string[], seed: number, attemptIndex: number, workerSlot?: number): string
  snapshot(host: string): HostStatsSnapshot   // { ..., unhealthy: boolean }
}
```

`src/backend/storeManagers/steam/depot.ts`
```typescript
export const CHUNK_CONCURRENCY = 4
export const FILE_CONCURRENCY = 8
export const CHUNK_FETCH_ATTEMPTS = 8
export async function downloadFileChunks(
  fd, depotId, key, hosts, lzma, file, fileSeed, signal, onBytes,
  decode?, onAttempt?, hostHealth?, cdnAuth?, hostMeta?, stallTracker?,
  fileWorkerSlot: number = 0
): Promise<void>
```
`downloadSingleFile` forwards the same tail arguments and ends with `modeCounters`.
`depot.test.ts` asserts `fetchChunk` argument **positions** (see its comments near L1487 and
L2311) — append new parameters at the END of any signature and update those comments/indices
if you shift anything.
</interfaces>

<constraints>
- NEVER run `git stash` (or `git stash pop`) in this repo — a prior executor stranded a
  concurrent session's work twice this way. Leave unrelated working-tree changes alone; the
  untracked `.planning/spikes/003-*/snapshot-*.acf` files are not yours.
- Do not change `pickHost`'s public signature or `fetchChunk`'s call site in `decompress.ts`.
- Do not weaken any existing test to make a new one pass. If an existing expectation must
  change, say so explicitly in the SUMMARY with the reason.
</constraints>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Make host demotion recoverable via a bounded probe (IHR-01)</name>
  <files>src/backend/storeManagers/steam/depot/hostHealth.ts, src/backend/storeManagers/steam/__tests__/hostHealth.test.ts</files>
  <behavior>
    - A host demoted by a MAX_CONSECUTIVE_FAILURES streak receives at least one attempt-0
      probe pick within DEMOTED_PROBE_INTERVAL consecutive attempt-0 calls.
    - After that probe is recorded as a success, the host's streak clears and it appears in
      the normal top-N fan-out again on the next attempt-0 call.
    - Over DEMOTED_PROBE_INTERVAL consecutive attempt-0 calls, at most ONE pick goes to a
      demoted host (a dead host stays cheap).
    - With every host healthy, the attempt-0 pick sequence is identical to today's
      (healthy[workerSlot % N]) — no probe fires when there is nothing to probe.
    - attemptIndex > 0 selection is byte-identical to today regardless of probe state.
    - One healthy host and zero demoted hosts: unchanged, no crash. Empty hosts list still
      throws /empty hosts list/.
  </behavior>
  <action>
Add probe-based recovery to `HostHealthTracker.pickHost` so a demoted host can earn its way
back. Do NOT touch `isUnhealthy`, `score`, the sorting, or the unhealthy thresholds.

1. Export `DEMOTED_PROBE_INTERVAL = 32` with a doc comment that cites the 2026-08-17
   HUMANKIND evidence (two hosts at 99.5%/99.8% success frozen `UNHEALTHY` with byte-frozen
   counters across two stats lines 13 minutes apart) and states the cost bound: at most 1 in
   32 first attempts is spent on a demoted host, i.e. under 3.2% of attempt-0 traffic, while
   a recovering host rejoins after a single success. 32 is chosen as roughly one probe per
   full sweep of the 32-slot worker pool.
2. Add a private monotonic counter incremented once per `pickHost` call with
   `attemptIndex === 0` (do not increment on retries — retries already rotate through the
   full ordered list including demoted hosts).
3. After the existing `healthy` / `unhealthy` split and sort, and BEFORE the existing
   `TOP_N_FANOUT` fan-out return, add the probe branch: when `attemptIndex === 0`,
   `unhealthy.length > 0`, and the pre-increment counter is a multiple of
   `DEMOTED_PROBE_INTERVAL`, return `unhealthy[0]` (the best-scoring demoted host). Every
   other case falls through to the existing code path completely unchanged.
4. Gate the probe on there being a real alternative: if `healthy.length === 0` the existing
   `ordered` fallback already serves demoted hosts, so the probe branch must not double up —
   require `healthy.length > 0` to take the probe branch.
5. Update `pickHost`'s doc comment to record that the "half-open circuit breaker" described
   on `MutableHostStats.consecutiveFailures` was unreachable in production before this change
   (a demoted host got no attempt-0 traffic, so it could never record the success that would
   clear its streak) and that the probe is what makes it real.

Write the tests in `hostHealth.test.ts` FIRST, in a new `describe` block alongside the
existing Phase 25 fan-out block, covering every bullet in `<behavior>`. For the
"unchanged when all healthy" and "attemptIndex > 0 unchanged" cases assert explicit expected
host names (not a comparison against another call of the code under test), so the assertions
fail against a naive implementation that probes unconditionally. Confirm the new tests FAIL
before the implementation lands, then make them pass.
  </action>
  <verify>
    <automated>pnpm test -- src/backend/storeManagers/steam/__tests__/hostHealth.test.ts src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts</automated>
  </verify>
  <done>All existing hostHealth and depotPrimitives tests still pass unmodified; new probe tests pass; `DEMOTED_PROBE_INTERVAL` is exported and referenced by the tests; `pickHost`'s signature is unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Replace the accidental 8-request ceiling with an explicit in-flight budget (IHR-02)</name>
  <files>src/backend/storeManagers/steam/depot/inflightLimiter.ts, src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts, src/backend/storeManagers/steam/depot.ts</files>
  <behavior>
    - InflightLimiter(max) runs at most `max` tasks concurrently; task max+1 does not start
      until one of the first `max` settles.
    - Queued tasks start in FIFO order.
    - A task that throws still releases its slot (the next queued task runs) and the
      rejection propagates to the caller unchanged.
    - A task that resolves returns its value to the caller unchanged.
    - max <= 0 or a non-finite max is rejected at construction rather than deadlocking.
    - depot.ts: with a single-chunk file, the run still issues concurrent requests across
      files up to the run budget rather than being capped at the file-pool size.
  </behavior>
  <action>
Fix the real throughput cap: `downloadFileChunks` derives
`workerCount = Math.min(CHUNK_CONCURRENCY, queue.length)`, so a single-chunk file runs ONE
request, and with 18,949 mostly-single-chunk files the whole run sustains only
`FILE_CONCURRENCY = 8` in-flight requests (Little's Law on the 2026-08-17 log: 12.06
attempts/sec x 0.692 s = 8.35). Raising the file pool alone would let a multi-chunk file
explode to `32 x 4 = 128` in flight, so the budget must be explicit.

1. New module `src/backend/storeManagers/steam/depot/inflightLimiter.ts` exporting
   `class InflightLimiter` with `constructor(max: number)` and
   `run<T>(fn: () => Promise<T>): Promise<T>`. FIFO queue, counter released in a `finally`
   so a throwing task cannot leak a slot. Throw on a non-positive or non-finite `max`.
   No new dependencies — plain promises, no timers.
   Doc comment: one limiter per download RUN (same discipline as `HostHealthTracker` and
   `StallTracker` — never a module-level singleton, so one run cannot throttle another and
   tests cannot leak state).
2. In `depot.ts`: export `TARGET_INFLIGHT_CHUNKS = 32` (the concurrency the pre-existing
   `FILE_CONCURRENCY * CHUNK_CONCURRENCY` design always intended and never achieved) and
   raise `FILE_CONCURRENCY` from 8 to 32. Leave `CHUNK_CONCURRENCY = 4` and
   `CHUNK_FETCH_ATTEMPTS = 8` alone. Update the constants' doc comments to state that the
   real bound is now the limiter, not the product of the two pool sizes, and cite this
   evidence.
3. Thread an optional `limiter?: InflightLimiter` from `downloadDepotFiles` (construct ONE
   per run, `new InflightLimiter(TARGET_INFLIGHT_CHUNKS)`, next to where the run's
   `HostHealthTracker` is constructed) through `downloadSingleFile` into
   `downloadFileChunks`. Append it at the END of each signature so existing positional
   argument expectations in `depot.test.ts` (see its comments near L1487 and L2311) are not
   shifted; if any index does shift, update those comments and assertions and call it out in
   the SUMMARY.
4. In `downloadFileChunks`, wrap ONLY the `fetchChunk(...)` call:
   `limiter ? await limiter.run(() => fetchChunk(...)) : await fetchChunk(...)`. Do not wrap
   the decode, the `fd.write`, or the stall-tracker calls — the budget is a NETWORK budget.
   Omitting the limiter (every existing test/caller) must leave behavior byte-for-byte
   unchanged.
5. Do not change abort handling: the existing `signal?.aborted` checks stay exactly where
   they are, and a queued-but-not-started task must still see the aborted signal on the
   `if (signal?.aborted) return` check it already passes through.

Write `inflightLimiter.test.ts` FIRST covering every `<behavior>` bullet (use resolvable
deferred promises to hold slots open; assert on start ORDER and peak concurrency, not on
wall-clock timing). Then implement, then wire depot.ts.
  </action>
  <verify>
    <automated>pnpm test -- src/backend/storeManagers/steam/__tests__/inflightLimiter.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts && pnpm codecheck</automated>
  </verify>
  <done>Limiter module + tests exist and pass; `TARGET_INFLIGHT_CHUNKS` is exported and used exactly once per run; `FILE_CONCURRENCY` is 32; every existing depot test passes without weakening; `tsc --noEmit` is clean.</done>
</task>

<task type="auto">
  <name>Task 3: Correct the written record in the resolved debug doc (IHR-03)</name>
  <files>.planning/debug/resolved/steam-install-slow-start.md</files>
  <action>
Append a dated section titled `## 2026-08-17 follow-up — the Thread C "fan-out never
implemented" lead is CLOSED, and what the stall actually was`. It must state, with the log
evidence quoted inline:

1. Thread C's fan-out fix DID ship — Phase 25, commit `9923545e3`, ancestor of HEAD. Anyone
   reading Thread C's "never implemented" note is reading a stale lead. Say this in the first
   sentence so a future session cannot re-plan it.
2. Quote the 12:52:57 `chunk-stream stats` line. Note the five-way attempt distribution
   (5219 / 2848 / 3079 / 2051 / 2941) as direct proof fan-out works, and per-host success of
   ~99.7% with `rotations=37` out of 16,138 as proof nothing was failing.
3. Record Defect 1 (fixed in this task): two hosts at 99.5%/99.8% success flagged
   `UNHEALTHY` and byte-frozen (`a=2848`, `a=3079` identical across the 12:39:30 and 12:52:57
   lines) — demotion was a one-way door because attempt-0 fan-out drew from `healthy` only.
   Name `DEMOTED_PROBE_INTERVAL` as the fix.
4. Record Defect 2 (fixed in this task): Little's Law gives 8.35 in-flight against an
   intended 32; cause is `workerCount = Math.min(CHUNK_CONCURRENCY, queue.length)` with
   18,949 mostly-single-chunk files. Name `TARGET_INFLIGHT_CHUNKS` / `InflightLimiter` as
   the fix.
5. Record the ONE thing this task did NOT fix, as an open lead for a future debug session:
   during the 12:39:30 -> 12:52:57 stall window only **46 attempts** were issued in 806 s and
   `timeouts` moved only 31 -> 33. `CHUNK_FETCH_TIMEOUT_MS` is 15 s and its `clearTimeout`
   sits in the `finally` AFTER `res.arrayBuffer()`, so it bounds headers AND body — 8 wedged
   workers would have produced hundreds of timeouts, not two. Therefore the workers were
   **not blocked inside `fetchChunk` at all**. Suspects to check first: the `DecompressPool`
   worker-thread queue and `fd.write`. Explicitly state that the no-progress watchdog behaved
   correctly (aborted at 804 s > the 8-minute bound, ACF fell back to StateFlags 1026, no
   false 4) and is not implicated.
6. Note that `CdnAuthTokenCache: empty token field` warnings in the same log remain the
   already-confirmed phantom and were not touched.

Do not edit or re-litigate any existing section of the doc — append only.
  </action>
  <verify>
    <automated>grep -v '^#' .planning/debug/resolved/steam-install-slow-start.md | grep -c "DEMOTED_PROBE_INTERVAL\|TARGET_INFLIGHT_CHUNKS\|9923545e3"</automated>
  </verify>
  <done>The appended section exists, names both fixes by identifier, cites commit 9923545e3, quotes the 12:52:57 stats line, and files the "46 attempts in 806 s with only 2 timeouts" stall as an explicit open lead pointing away from fetchChunk.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib -> Steam CDN hosts | Untrusted remote hosts chosen by `pickHost`; response bytes are already SHA1-verified downstream by the existing decode path (unchanged here) |
| Local process -> local disk | `fd.write` of decoded chunk bytes (unchanged here) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-IHR-01 | Denial of Service | `InflightLimiter` / raised `FILE_CONCURRENCY` | mitigate | The limiter caps run-wide in-flight requests at `TARGET_INFLIGHT_CHUNKS = 32` — the same number the existing `FILE_CONCURRENCY * CHUNK_CONCURRENCY` design already intended. Raising `FILE_CONCURRENCY` alone (no limiter) is explicitly rejected because it would permit 128 in flight. |
| T-IHR-02 | Denial of Service | `DEMOTED_PROBE_INTERVAL` probe branch | mitigate | Probe is bounded to at most 1 in 32 attempt-0 picks and only fires when a healthy alternative exists, so a genuinely dead host can never absorb meaningful traffic. Covered by a dedicated unit test. |
| T-IHR-03 | Tampering | npm/pip/cargo installs | mitigate | No new dependencies are introduced by this plan. `InflightLimiter` is plain promises. If the executor finds itself reaching for a package, STOP and escalate — a legitimacy gate would be required first. |
| T-IHR-04 | Tampering | Chunk bytes from a probed (previously demoted) host | accept | Probe changes only WHICH host is asked; the existing per-chunk SHA1 verification in the decode path is untouched and rejects corrupt bytes identically regardless of source host. |
</threat_model>

<verification>
1. `pnpm test -- src/backend/storeManagers/steam/` — full Steam suite green, with no existing
   expectation weakened or deleted.
2. `pnpm codecheck` — clean.
3. `pnpm lint` — clean (CI lint runs as a separate workflow from the tsc gate; a green
   `codecheck` says nothing about lint).
4. `grep -n "TOP_N_FANOUT\|workerSlot" src/backend/storeManagers/steam/depot/decompress.ts` —
   `fetchChunk`'s `pickHost` call site is unchanged.
5. Confirm untouched by `git diff --stat`: the watchdog, the abort/DownloadManager path,
   `depot/cdnAuth.ts`, and anything under the StateFlags/chmod logic.
</verification>

<success_criteria>
- A demoted host provably recovers within `DEMOTED_PROBE_INTERVAL` attempt-0 picks plus one
  success, proven by a unit test that fails against the current implementation.
- Run-wide in-flight chunk requests are governed by one explicit `TARGET_INFLIGHT_CHUNKS`
  budget instead of emerging accidentally from file-pool size.
- Zero changes to `pickHost`'s signature, `fetchChunk`'s call site, the watchdog, the abort
  path, `CdnAuthTokenCache`, or StateFlags/chmod logic.
- `.planning/debug/resolved/steam-install-slow-start.md` can no longer send a future session
  after the already-shipped fan-out fix.
- Live-hardware validation is NOT part of this task's verification — it happens in phase 23
  plan 23-10 Task 1 (Gate 2 clean re-run) once this lands. Note in the SUMMARY that Task 2
  raises real network concurrency roughly 4x, so that gate is now load-bearing for this
  change too.
</success_criteria>

<output>
Create `.planning/quick/260817-ihr-fix-the-steam-depot-downloader-s-single-/260817-ihr-SUMMARY.md` when done.
</output>
</content>
</invoke>
