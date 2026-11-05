---
spike: 067a
name: node-pipeline-stage-profile
type: standard
validates: "Given a real Civ V (8930) macOS depot install through today's unchanged Node pipeline, when fetch and decode are timed and CPU, RSS and pool state sampled each second, then we know whether the network or decoding limits throughput"
verdict: VALIDATED — network-bound, not decode-bound; the Rust speed premise is invalidated
related: [002, 023, 010, 067b, 067c]
tags: [steam, depot, download, throughput, decompress, lzma, rust-migration, benchmark, live]
---

# Spike 067a: Node depot pipeline stage profile

## What This Validates

Given a real Civ V (8930) macOS depot install through today's unchanged Node pipeline, when
fetch and decode are timed and CPU, RSS and pool state are sampled each second, then we know
whether the network or decoding limits throughput.

This is step 0 of sizing the second slice of the incremental Rust migration (Phase 63 is the
first slice: the executable scanners). If decoding were the limit, a Rust depot pipeline would
buy speed; if the network is, it can only buy CPU, memory and code removal.

## Research

Prior art carried forward, not re-measured:

- **002:** `lzma-native` decodes at 17.8 MB/s vs pure-JS LZMA's 8.1 MB/s (171/171 files).
- **Debug `humankind-depot-full-stall` / `decompressPool.ts` header (Aug 2026):** decode WAS the
  binding constraint when workers ran pure-JS LZMA (~5 MB/s per worker, ~500 ms per chunk).
  Spike 023 then put native `lzma-native` into the SEA's workers. Whether decode still binds
  after 023 was never measured; that is this spike's question.
- **Phase 25:** multi-host fan-out reached ~10 MiB/s (`hosts=3`).
- **`TARGET_INFLIGHT_CHUNKS = 32`** (`depot.ts`, quick 260817-ihr): a run-wide in-flight budget,
  enforced by `InflightLimiter`.

## How to Run

```sh
.planning/spikes/067a-node-pipeline-stage-profile/build.sh     # harness + the app's dev decode worker
# Quit Mac Steam first (a second signed-in session signs its Friends list out; Phase 54).
.planning/spikes/067a-node-pipeline-stage-profile/run.sh <label>
SPIKE_INFLIGHT=96 SPIKE_CORPUS_MB=0 .../run.sh <label>          # arm B: raise the in-flight budget
```

A Steam QR code opens in the browser; scan it with the Steam Mobile app. The refresh token
stays in memory. `run.sh` sets `HOME` to `state/home` (repo fake-HOME convention), so the
backend logger writes to `state/home/Library/Logs/GameLib/gamelib.log`, and wipes
`state/steamapps` so the reconciler cannot skip already-verified files.

## What to Expect

`runs/<label>/events.jsonl` (one sample per second plus milestones), `summary.json`,
`tree.sha1` (SHA1 of every installed file) and the run's `gamelib.log`. A sample of
**decrypted, still-compressed** chunks goes to `state/corpus/` for 067b; the depot key is used
in memory and never written.

## Observability

Harness wrappers, none of which change production behaviour:

- `DecompressPool.prototype.init` is wrapped to wrap the instance's `decode` (timing, in-flight
  count, corpus capture) and to keep a handle for `stats()` sampling.
- `globalThis.fetch` is wrapped for `/chunk/` URLs only (latency, bytes, in-flight count).
- `InflightLimiter.prototype.acquire` is wrapped only when `SPIKE_INFLIGHT` is set (arm B).
- `process.cpuUsage()` and `memoryUsage().rss` cover the main thread and every worker thread.
- `SteamUser` statics are swapped for the harness's own signed-in client (`patchSteamUser`).

## Investigation Trail

1. **node-run1 (no evidence kept beyond events):** QR expired after 30 s. `steam-session`'s
   default `loginTimeout` is 30000 ms; the harness's own 5-minute timer never fired. Raised to
   300 s.
2. **node-run1 again:** signed in, then `TypeError … reading 'logWarning'`. The backend logger
   needs `initHeadless()` before first use; the real sidecar calls it at boot. Added
   `initHeadless(true)` (true = do not archive the existing log). A no-sign-in reproduction
   with a fake client (`SPIKE_SMOKE=2`) confirmed the fix.
3. **node-run1 a third time (`runs/node-run1-failed-nolog`):** an error outcome after 91 s and no
   chunks, but no reason: the GameLib dev app started mid-run and rotated `gamelib.log`, taking
   the harness's lines with it. Added `run.sh` with an isolated `HOME`.
4. **node-run2 (`runs/node-run2-failed-picscache`):** log stops after `getOwnedSets`, error at
   90 s. Cause: the harness built its client with `enablePicsCache: true`; production uses
   `enablePicsCache: false, autoRelogin: false` (`user.ts`). With the cache on, steam-user
   fetches PICS for the whole library at logon and the plan's Civ V DLC lookup
   (`fetchDlcInfos`, a timed-out step that is not retried) times out behind it. Matched
   production's options, waited for the `licenses` event (`getOwnedSets` reads
   `client.licenses`), and added a 3 s flush before exit so a failure keeps its reason.
5. **node-run3 (arm A, production budget 32):** complete install, `status: done`, StateFlags=4.
6. **node-run4-inflight96 (arm B, budget 96):** complete install, identical tree.

## Results

| | Arm A: budget 32 (`node-run3`) | Arm B: budget 96 (`node-run4-inflight96`) |
|---|---|---|
| Outcome | done, 10,897 files, StateFlags=4 | done, **identical tree** (`3ab11760…`) |
| Downloaded / written | 5,294 MiB → 7,359 MiB, 320 s | same, 308 s |
| Download speed, whole run / steady | 16.5 / **18.3 MiB/s** | 17.2 / **18.4 MiB/s** |
| Requests in flight (avg) | 31.3 | 49.2 |
| Fetch latency per chunk | 534 ms | 780 ms |
| Decode time per chunk | **3 ms** | 3 ms |
| Decode pool | 16 native workers, never saturated, queue 0 | same |
| CPU | 1.09 cores (of 30) | 1.08 |
| Peak RSS | 2.75 GB | 2.79 GB |
| Fetch errors / timeouts | 0 | 57 |

**Verdict: network-bound.** Little's Law fits arm A exactly: 31.3 in flight ÷ 0.534 s = 58.6
chunks/s × 0.31 MiB average compressed chunk = 18.3 MiB/s, the measured steady rate. Arm B then
separates concurrency from bandwidth: 57% more requests in flight raised per-chunk latency by
the same proportion and left throughput flat, with timeouts appearing. The path from this
machine to Steam's CDN carries about 18–19 MiB/s (~155 Mbps) and both arms saturate it.

**Decode is no longer a constraint.** With 023's native workers, a chunk decodes in 3 ms. The
16-worker pool could decode roughly 16 ÷ 0.003 s × 0.43 MiB ≈ 2.2 GiB/s of output, about 125× this
connection. The August finding (decode-bound at ~500 ms per chunk) was a pure-JS-LZMA effect
that 023 removed.

**What this means for the Rust migration:** on this connection a Rust depot pipeline cannot be
faster; the ceiling is the network. Its possible wins are CPU (~1 core today; small), memory
(2.75 GB peak RSS is large and unexplained, measured with the harness wrappers present) and
deleting the ~1,060 lines that exist only to load `lzma-native` in the SEA plus the 800-line
worker pool. The depot slice of the migration has to be justified on those, not on speed.

### Surprises

- **Civ V's chunks are mostly the old PK zip container:** the 978-chunk corpus (300 MiB) is 917
  zip and 61 LZMA, no zstd. 067b's corpus under-represents LZMA and zstd.
- **Raising the in-flight budget is not free:** 96 produced 57 timeouts and no gain. Do not
  raise `TARGET_INFLIGHT_CHUNKS` on this evidence.
- **Effective concurrency topped out at ~49, not 96:** 32 file workers, most files single-chunk,
  cannot supply more concurrent requests. Not a factor here since bandwidth binds first.
- **Mac Steam's own client** logged ~25 MB/s (~198 Mbps) in spike 047's runs, a different game
  and day. Not comparable enough to call a gap, but a same-game, same-hour Steam-client run
  would show whether host choice (e.g. `alibaba.cdn` among the worst hosts) costs anything.
- **2.75 GB peak RSS** at ~1 core of work is the largest number on the table and has no
  explanation yet.
