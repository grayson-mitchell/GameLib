# Phase 85: Spikes (Wave 0)

Measured and model-checked before the plans that freeze the mirror, the boot sweep and the durability policy.
Source: plan 85-04. Spike code is throwaway and lives under `.planning/spikes/`; no store value, account name or
token from the operator profile appears in any output here.

| Spike | Question | Where |
|-------|----------|-------|
| S1 | Does the mirror/rebase protocol converge and keep read-your-writes? | `.planning/spikes/092-store-mirror-protocol/` |
| S2 | Windows rename over an open handle | deferred to CI, see below |
| S3 | Frame throughput and queue high-water for a 600 KB `set` burst | `.planning/spikes/093-store-boot-durability-costs/` |
| S4 | Boot parse-and-classify time of every store file and `GamesConfig/*.json` | same |
| S5 | `sync_all` cost per write on macOS | same |

## S1 — mirror protocol

Spike: `.planning/spikes/092-store-mirror-protocol/` (README.md, `sim.mjs`). Verdict: **VALIDATED, no counterexample.**

`node sim.mjs --runs 10000 --seed 85` ran 10,000 random traces (2-20 ops each, 9,995 distinct interleavings) over a
model of one Rust-owned file, a sidecar mirror cell with pending ops, two TS names over the one file, a renderer
writing straight to Rust, late-created cells, snapshots racing pushes, and injected persist failures. Every run
converged to Rust's state and kept read-your-writes; seeds 1, 2, 3, 7 and 2026 at 10,000 runs each also held. A fixed
trace (renderer `set a=1` reaching Rust before the sidecar's earlier-sent `set a=2`) converged to a=2 with the
sidecar reading a=2 at every step. `--selftest` shows each rule below is load-bearing: removing it yields a
counterexample.

### Protocol rules 85-10 (sidecar mirror, Rust store channels) and 85-17 (renderer-native writes) must implement

1. **persist before emit.** Rust computes the next state, persists it atomically, and only then commits the rev
   and emits. A failed persist rolls back, consumes no rev, emits no event (S1 `emit-first` mutant diverges: observers
   keep a rev Rust later reuses for a different op).
2. **rev under the lock.** One writer assigns `rev` for every write, whether it came from a sidecar frame or a
   renderer-native write; revs are gapless per store file.
3. **One FIFO dispatcher.** Sidecar frames are applied in arrival order and events leave in rev order to the sidecar
   and to the renderer. `rustInvoke` is unordered (Pitfall 7), so frames use the stdout reader's in-order arm.
4. **Idempotent state-assigning ops.** `set(k, v)`, `delete(k)`, `clear`, `replace(obj)` (what `CacheStore.commit()`
   sends). Never a delta such as increment or merge-patch.
5. **A MirrorCell per file path, not per TS instance.** Two TS names over one file (`steamConfigStore` and
   `steamBottleConfigStore`) and ad hoc `new Store(...)` over an existing path share one cell (S1 `per-instance`
   mutant loses read-your-writes across names).
6. **originSeq acks.** A sidecar frame carries `seq`; the event Rust emits for it carries `originSeq`. The mirror
   removes exactly that pending op and recomputes `view = pending folded over base`. Reads and `has` use `view`.
7. **nack on failed persist.** Rust answers a sidecar frame whose persist failed with `{nack, originSeq}` in the same
   ordered queue; the mirror drops the pending op (the view reverts to base) and logs/reports the failure. Without
   it the op is stranded in `pending` and the mirror shows a value Rust never stored (S1 `no-nack` mutant).
8. **Mirror rev rule.** On an event: `rev <= baseRev` means already reflected (cell created late) and is dropped;
   otherwise require `rev == baseRev + 1` (a gap is a protocol bug to surface, not to paper over), apply to `base`.
   A new cell loads Rust's state and rev atomically (under the lock) so it never needs events from before its load.
9. **Push rev filter on the renderer.** Add `rev` to `StoreChangedPayload` and to snapshot/fetch results. The renderer
   drops a push with `rev <= lastRev` and a snapshot with `rev <= lastRev`; buffered pushes during a fetch are
   replayed only if `rev > snapshot.rev` (the existing `changesDuringFetch` mechanism plus a rev test).
10. **Gapless push stream.** In the model a gap never occurs (check G holds in every run). In production the
    renderer should still treat `rev != lastRev + 1` after the filter as "resync": drop `hydrated` and re-fetch,
    rather than apply across a gap. This is a defensive rule beyond what the model exercises.

## S2 — Windows rename (deferred to CI)

Rename over a destination another handle holds open (Pitfall 10) is not measurable on this machine (macOS only).
It is measured by gamelib-store's `atomic::windows` test on the CI Windows leg in plan 85-19, using the same
non-`FILE_SHARE_DELETE` handle `gamelib-log` already pins in `writer.rs` (`mod windows`). Until that leg runs,
the design keeps the bounded retry-with-backoff and the direct-write fallback of Pitfall 10, and copies the
previous bytes aside before a user-state fallback truncates.

## S3 — frame throughput

Spike: `.planning/spikes/093-store-boot-durability-costs/` (`bench`, binary `frames`). A child process writes
newline-delimited JSON frames, each with a ~600 KB `valueJson` string (~695 KB on the wire); a reader parses each
line into `serde_json::Value` and queues it on an unbounded channel drained by a worker. Burst of 50 frames, median
of 5 bursts, Apple Silicon macOS 27.0.1 (second full run within 1 percent):

| Worker cost per frame | Burst | Frames/s | MB/s | Queue high-water |
|---|---|---|---|---|
| re-parse `valueJson` only | 0.105 s | 474 | 338 | 27 |
| parse + atomic write, no `sync_all` | 0.146 s | 343 | 245 | 34 |
| parse + atomic write + `sync_all` | 0.346 s | 144.5 | 103 | 43 (max 44) |

The reader is never the bottleneck. The worst case measured, a 50-frame burst of 600 KB frames with a `sync_all`
per frame, peaks at a queue depth of 44 and drains in 0.35 s. Pitfall 7's rule (unbounded queue, never drop a store
write, counted high-water log line) is safe at this rate: the queue cannot grow unbounded under any realistic burst.

## S4 — boot sweep

Spike: same dir, binary `sweep`. Operator profile, read-only (run against a copy and against the live directory,
same result; counts and timings only, no names or values): 106 live JSON files totalling 2,351,989 bytes: 50 store-kind
files plus `config.json` (2,331,126 bytes) and 56 `GamesConfig/*.json` (20,863 bytes). Backups excluded. Read + ordered
parse + one serialization of all of them, five runs: **min 6.66 ms, median 6.77 ms, max 12.84 ms** (the max is the
first, cold read; against a freshly written copy: min 7.38, median 8.15, max 19.62). Median split: read 0.99,
parse 4.17, serialize 1.00 ms. All 106 files parsed as JSON objects. Per file about 64 microseconds warm.

This overturns the A3 worry about sweep cost: the eager sweep of A4 (including `GamesConfig/*`) costs milliseconds on
this profile. It is cheap enough to run synchronously before the sidecar spawn, with a cap as a safety net.

## S5 — sync_all cost

Spike: same dir, binary `sync`. 200 atomic writes per row (temp, write, optional `sync_all`, rename) on the internal
APFS SSD; on macOS Rust's `sync_all` is `F_FULLFSYNC`; the parent directory is not synced. Two runs:

| File | `sync_all` | Median | p95 |
|------|-----------|--------|-----|
| 1 KB | no | 0.09 to 0.15 ms | 0.18 to 0.28 ms |
| 1 KB | yes | 4.00 to 4.04 ms | 4.27 to 4.32 ms |
| 600 KB | no | 0.14 to 0.16 ms | 0.23 ms |
| 600 KB | yes | 3.96 to 4.16 ms | 4.75 to 4.84 ms |

`sync_all` is a flat ~4 ms per write at both sizes (about 26x to 40x an unsynced write). The 600 KB median is far below
50 ms, so no caveat is needed on that line. Assumption A7 ("too slow for high-frequency cache sets") is refined: it
is cheap per write (4 ms) but triples burst time for 50 large cache sets (0.146 s to 0.346 s), for no gain on data
that is rebuilt from its source.

## Constants

85-09 and 85-10 adopt these; each carries its measurement.

| Constant | Value | Rule | Measurement |
|---|---|---|---|
| `BOOT_SWEEP_MAX_FILES` | **10000** | at least 20x the measured file count, rounded up to a power of ten | 106 files measured; 20 x 106 = 2,120; next power of ten is 10,000 |
| `BOOT_SWEEP_MAX_MS` | **2000** | at least 10x the median sweep time and never below 2000 | median 6.77 ms; 10x = 68 ms; floor 2000 ms applies. A full 10,000-file sweep extrapolates to about 0.65 s warm, inside the cap |
| `STORE_QUEUE_HIGH_WATER` | **256** frames | the level at which a counted warning is logged; at least 4x the measured burst high-water | burst high-water 44 (worst case, `sync_all` per frame); 4 x 44 = 176; rounded up to 256 |

Notes for 85-09 and 85-10:

- `BOOT_SWEEP_MAX_FILES`/`_MS` are bounds, not targets. When either trips, stop sweeping, leave the remaining files
  to be opened and migrated on first touch (lazy), and log one counted line; never block boot past the cap (Rust
  shutdown contract: bound boot work).
- `STORE_QUEUE_HIGH_WATER` is in frames. The measured 600 KB frame is the worst case; 256 of them is about 175 MB
  queued. The warning is a counted log line only: the queue stays unbounded and a store write is never dropped
  (Pitfall 7). 85-10 may add a queued-bytes figure to the same line.

### Durability policy (D-21) — confirmed

D-21 is decided and the measurement supports it: **`sync_all` before the rename for user-state, settings and account
stores; no `sync_all` for caches.**

- Cost on the record: about **4 ms per write at both 1 KB and 600 KB** on this Mac (median 3.96 to 4.16 ms, p95 under
  5 ms), against about 0.1 to 0.15 ms unsynced. Far below the 50 ms line at which the plan asked for a caveat.
- User-state, settings and accounts are small, written rarely, and not reconstructible, so 4 ms per write is
  negligible and buys crash durability (the `.tmp` + rename is then never a zero-length file after power loss).
- Caches (`store_cache/*`, library and metadata snapshots) are rebuilt from their source, are written in bursts of
  large frames, and gain nothing from fsync: skipping it keeps a 50 x 600 KB burst at 0.146 s instead of 0.346 s.
- A writer that coalesces a burst into one persisted write pays the 4 ms once, which makes the user-state cost
  irrelevant even for rapid sets.
- Not measured: Windows NTFS and Linux ext4 (macOS only here). The policy is per kind, not per platform, so it does
  not change; re-time on CI if a platform shows an outlier.
