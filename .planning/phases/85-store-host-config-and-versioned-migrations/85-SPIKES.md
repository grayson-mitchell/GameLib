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
