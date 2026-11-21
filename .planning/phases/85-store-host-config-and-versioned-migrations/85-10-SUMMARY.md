---
phase: 85-store-host-config-and-versioned-migrations
plan: 10
subsystem: infra
tags: [rust, typescript, store, mirror-cell, store-frames, sidecar, tauri-shell, shutdown-contract]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-03 storeFrameVectors.json; 85-04 S1 protocol rules and the STORE_QUEUE_HIGH_WATER constant; 85-09 StoreHost::apply, store_boot (mode, ownership file, boot hand-off, drain)"
provides:
  - "The sidecar write path to the Rust owner: GameLibStore -> MirrorCell -> ordered kind:\"store\" stdout frame -> shell reader arm -> store-frames worker -> StoreHost -> disk, with applied/refused/flushed storeMirrorEvent acks back in apply order"
  - "store_dispatch.rs: validating frame parser (nine reason categories, shared vectors), the one store-frames worker, store registrant, high-water warning, wait_idle for the exit drain"
  - "TS mirror layer: MirrorCell/MirrorRegistry (one cell per file path), storeFrames (StoreFrame, sink, validateStoreFrame), storeOwnership (GAMELIB_STORE, ownership file, GAMELIB_STORE_BOOT)"
  - "GameLibStore as a facade over conf or the mirror cell; the tracer store store_cache/wikigameinfo is Rust-owned"
affects: [85-11, 85-12, 85-13, 85-14, 85-15, 85-16, 85-17, 85-19]

plan_head_before: 58cbe8c51b55bf4c47accaa329be1a4769638f44
plan_head_after: a7792454ab011c13cab754778df6d9553aac37b8
commits: 3

actuals:
  tokens: 28380
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "mirror cell: view = pending ops folded over base; the view is only held while something is pending; acks move an op onto base, a refusal re-folds"
    - "store frames on the single in-order stdout reader, never rustInvoke; reader arm validates and enqueues only; one worker applies"
    - "shared JSON vectors proven on both sides (storeFrameVectors.json) with the same nine reason categories checked in the same order"
    - "dispatcher takes its host, config, shutdown, event sink and log sink as parameters; the process-wide instance is a lazily built wrapper"

key-files:
  created:
    - src-tauri/src/store_dispatch.rs
    - src/backend/stores/mirrorCell.ts
    - src/backend/stores/storeFrames.ts
    - src/backend/stores/storeOwnership.ts
    - src/backend/stores/__tests__/storeWritePath.test.ts
  modified:
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/sidecarInternal.ts
    - src/common/types/ipc/storeOwnership.json
    - meta/genIpcContract.ts
    - src-tauri/src/ipc_contract.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/src/main.rs
    - src-tauri/src/store_boot.rs
    - src-tauri/crates/gamelib-store/src/host.rs
    - src/backend/store_backend.ts
    - src/backend/stores/storeRoot.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/storeWriteHandlers.ts
    - src/backend/testUtils/testStoreRoot.ts
    - src/backend/sidecar/__tests__/sidecarStdoutFramesOnly.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/storeBackendAccessors.test.ts

key-decisions:
  - "The ack is sent by the worker after every apply, including a no-op one (an unchanged value fires no StoreChange), so a mirror's pending op can never be stranded; a frame the shell rejects at parse is nacked when it names a readable seq and store (S1 rule 7)"
  - "Native and excluded rows are never writable from the sidecar: a frame for them is refused not-owned even though is_rust_owned counts native as owned"
  - "A Rust-owned store whose resolved TS path is not its table path under the user-data directory fails at construction, because the shell writes the table path and a mirror reading elsewhere would diverge silently"
  - "createStoreRoot defaults storeMode to ts (every store conf-owned); only the sidecar boot passes the resolved mode, so existing suites are untouched and a rust-mode root without a sink throws"
  - "baseRev is the highest rev seen (no handshake): this plan has one writer per store; the renderer-native writes of 85-17 add the load-time rev"

patterns-established:
  - "A store frame is rejected whole by category only (store frame rejected: <reason>); never a key or a value in a log line"
  - "Mirror reads return copies, and a pending op's value is copied on every apply, so nothing the cell holds is shared with a caller or between base and view"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "A TS set on store_cache/wikigameinfo reaches disk through the Rust owner with bytes equal to TS's own serialisation of the same ops (the 85-01 golden cache-ops-dotpath-intkey), events acked in order"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_frame_golden_ops_write_the_bytes_ts_wrote_and_are_acked_in_order"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/storeWritePath.test.ts#sends the golden cache-ops-dotpath-intkey ops as ordered frames and clears pending on each applied event"
        status: pass
    human_judgment: false
  - id: D2
    description: "The frame contract holds on both sides: every storeFrameVectors.json valid vector accepted, every invalid one rejected with exactly its reason (nine categories, the generated oversized frame is too-large)"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_frame_every_valid_vector_parses, store_frame_every_invalid_vector_is_rejected_with_exactly_its_reason"
        status: pass
      - kind: unit
        ref: "storeWritePath.test.ts#the shared storeFrameVectors contract (16 valid + 31 invalid + builder + nine categories)"
        status: pass
    human_judgment: false
  - id: D3
    description: "S1 protocol behaviours: refusals revert the mirror view, a failed persist is refused io and consumes no rev, flush is a real barrier, not-owned frames are refused, a rejected frame is nacked and logged by category only"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "store_frame_a_failed_persist_is_refused_io_consumes_no_rev_and_leaves_no_file, store_frame_the_queue_flush_is_answered_only_after_every_earlier_frame_is_applied, store_frame_for_a_store_rust_does_not_own_is_refused_not_owned_and_writes_nothing, store_frame_rejected_is_logged_by_category_only_and_nacked"
        status: pass
      - kind: unit
        ref: "storeWritePath.test.ts#refusals and the flush barrier"
        status: pass
    human_judgment: false
  - id: D4
    description: "Rust shutdown contract: a store registrant is held while frames are queued and released when empty; the queue never drops a frame; one high-water warning per crossing; store_boot::drain waits for the queue then in-flight applies; flush deadline timer is unref'd"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "store_frame_worker_holds_a_store_registrant_while_frames_are_queued_and_releases_it_when_empty, store_frame_queue_high_water_is_logged_once_per_crossing_and_never_drops_a_frame, store_boot::the_drain_is_idle_when_nothing_is_writing"
        status: pass
      - kind: integration
        ref: "pnpm smoke:sidecar; pnpm smoke:exit-check -- --mode eof (no Rust peer, exit latency 10 ms)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The two halves joined across the real process boundary: a live shell and sidecar, a real stdout pipe, and a quit with a store write in flight"
    verification: []
    human_judgment: true
    rationale: "The TS half (recording fake peer) and the Rust half (feeding frames into the worker) are each proven and meet at the shared vectors and golden bytes, but no automated test runs a real shell with a real sidecar; the macOS live gate of 85-20 is the place for it"

duration: ~55min (start time was not recorded; estimated from the previous plan's commit)
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 10: Sidecar store write path to the Rust owner, proven on one store Summary

**Ordered `kind:"store"` frames carry a TS mirror's writes to one shell worker that applies them through StoreHost and acks each in apply order; `store_cache/wikigameinfo` is Rust-owned end to end with Rust writing the same bytes TS wrote, and GameLibStore is now a facade over conf or the mirror cell.**

## Performance

- **Duration:** about 55 min (start time was not recorded; estimated)
- **Completed:** 2026-11-22
- **Tasks:** 3 (one tracer, one TDD, one auto)
- **Files modified:** 24 (5 created)

## Accomplishments

- **Rust side.** `store_dispatch.rs`: `parse_store_frame` validates a frame in the same order as the TS `validateStoreFrame` and returns one of nine reason categories (never a key or a value); the reader arm in `sidecar.rs` only validates and enqueues; one `store-frames` worker applies in arrival order with `Origin::Sidecar{seq}` and answers `applied`, `refused` (`read-only|evicted|rejected|io|not-owned`) or `flushed` as a `storeMirrorEvent` send frame, in apply order. The worker holds a `store` registrant while frames are queued, the queue is unbounded and never drops, and crossing `STORE_QUEUE_HIGH_WATER` (256) logs one counted warning per crossing. `store_boot::drain` waits for the queue and then in-flight applies inside the drain bound.
- **TS side.** `MirrorCell` loads a file once, serves every read from memory, applies a write to its own view at once and sends one frame; `applied` moves the op onto base, `refused` drops it and the view reverts to base plus what is still pending; `flush(timeoutMs)` resolves on `flushed` with an unref'd deadline. `MirrorRegistry` gives one cell per resolved file path (S1 rule 5). `storeOwnership.ts` reads `GAMELIB_STORE`, `storeOwnership.json` and the store table with the same rules as `store_boot.rs`, and parses `GAMELIB_STORE_BOOT` defensively.
- **GameLibStore** keeps its name, constructor and members (`get set has delete clear reset store size path readOnly`, iteration) and is a facade: conf-owned exactly as before, or a window onto the mirror cell when the ownership file moved the store. The sidecar boot passes the resolved mode and the rpc's `storeFrameSink` (frames share the stdout writer, held in order until the output is attached).
- **Tracer.** `storeOwnership.json` moves only `store_cache/wikigameinfo`. The golden `cache-ops-dotpath-intkey` ops, replayed as frames into the worker, write a file byte-identical to the TS-produced expected file, with four `applied` events at revs 1-4 in order.
- Both sides run `storeFrameVectors.json` (16 valid, 31 invalid, the generated oversized frame, all nine categories); the TS builder is also checked to produce only frames the vectors' rules accept.

## Task Commits

1. **Task 1: Tracer, one TS set reaches disk through the Rust owner** - `5aca95cd1` (feat)
2. **Task 2: Frame vectors on both sides, refusals, flush barrier, registrant, high-water, drain** - `6f3502cab` (feat)
3. **Task 3: stdout-frames-only gate, storeMirrorEvent routing test, plan-end gates** - `a7792454a` (feat)

**Plan metadata:** recorded in the docs(85-10) commit that follows this file.

## Verification

All run at the last commit: `pnpm check:ipc-contract`; jest `storeWritePath` (67 tests), `sidecarStdoutFramesOnly`, `storeKinds`, ipc schema suites and the full Backend project (622 suites, 13,764 tests); `cargo test --bin gamelib-shell` (631 passed, 15 `store_frame`, 14 `store_boot`) and `cargo test -p gamelib-store`; `rustfmt --check` on `store_dispatch.rs`, `store_boot.rs`, `sidecar.rs` (not `main.rs`, which also pulls the generated files that are not rustfmt-clean on main); prettier `--file-info` then `--check` over every written TS/JSON path; `pnpm codecheck`, `pnpm lint` (production and tests PASS), `pnpm find-deadcode` (312 baselined), `pnpm backend-di-ceilings`, `pnpm planning-gates` (12/12); `pnpm smoke:sidecar` and `pnpm smoke:exit-check -- --mode eof` (exit latency 10 ms). Acceptance greps: `STORE_FRAME_KIND = 'store'` 1, `store_dispatch::enqueue` in sidecar.rs 1, ownership override 1, `storeFrameVectors.json` in store_dispatch.rs 1, `storeFrameVectors` in the jest test, `STORE_QUEUE_HIGH_WATER` in store_dispatch.rs, `STORE_MIRROR_EVENT_CHANNEL` in storeWriteHandlers.ts.

`⚡ Tracer verified end-to-end — expanding` (automated-only `<verify>`, `end-of-phase` mode: re-run and passed, no checkpoint).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The inbound `storeMirrorEvent` channel needed a schema, and the constants needed the generator**
- **Found during:** Task 1
- **Issue:** the sidecar's validator drops a `send` for a channel with no schema, and the plan's "run `pnpm gen:ipc-contract` so ipc_contract.rs carries both" needs the constants listed in `meta/genIpcContract.ts`; neither file is in `files_modified`.
- **Fix:** `storeMirrorEvent` strict schema (+ `shell` caller) in `sidecarInternal.ts`, its fixture in `sidecarInternal.test.ts` (channel count 15 -> 16), both constants added to the generator; `ipc_contract.rs` regenerated.
- **Files modified:** `src/common/types/ipc/sidecarInternal.ts`, `src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts`, `meta/genIpcContract.ts`
- **Commit:** `5aca95cd1`

**2. [Rule 3 - Blocking] Tests that asserted the pre-plan state**
- **Found during:** Task 1 (full Backend run)
- **Issue:** `tauriShellSource.test.ts` asserted `storeOwnership.json` `stores == {}`; `storeBackendAccessors.test.ts` asserted a *subclass* of GameLibStore observes conf's constructor-time defaults write, which no longer holds because conf now lives inside the conf-backed owner; `store_boot.rs`'s embedded-ownership test asserted nothing is flipped; `moduleStateCensus` flagged a module-level `Map` in `storeOwnership.ts`.
- **Fix:** the two ownership tests now assert exactly the one tracer override; the accessor test asserts defaults still reach disk and that a subclass setter observes a store replacement (the read-only guard being live during the defaults merge is `storeBackendVersioning`'s case, which passes); the `Map` became a `find`.
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`, `src/backend/__tests__/storeBackendAccessors.test.ts`, `src-tauri/src/store_boot.rs`, `src/backend/stores/storeOwnership.ts`
- **Commit:** `5aca95cd1`

**3. [Rule 2 - Missing critical] A rejected frame is nacked, and a Rust-owned store at the wrong path is refused**
- **Found during:** Task 1
- **Issue:** (a) without an answer a frame the shell rejects at parse would leave its pending op in the mirror forever (the S1 `no-nack` mutant). (b) the shell writes the table path under its user-data directory; a TS store resolved anywhere else would read a different file from the one Rust writes.
- **Fix:** (a) a rejected frame that carries a readable `seq` and store is answered `refused`/`rejected`; one without is only logged. (b) `GameLibStore` throws at construction when a Rust-owned store's resolved path is not `<userData>/<store key>.json`.
- **Commit:** `5aca95cd1`

### Implementation choices the plan left open

- `parse_store_frame` hand-parses the `serde_json::Value` instead of deriving `Deserialize` with `deny_unknown_fields`: the vectors need nine distinct categories checked in a fixed order (a serde error says only "invalid"). The unknown-field rule is an explicit check.
- The queue is `Mutex<VecDeque>` plus condvars rather than a `std` mpsc: the high-water depth and the idle wait (`wait_idle`, the drain) need the depth and an in-flight flag.
- The `storeMirrorEvent` handler was registered in Task 1 (in `registerStoreWriteHandlers`, the one store-layer registration site) rather than Task 3, so the tracer had a real ack path; Task 3 added its routing and malformed-payload tests.
- Task 1 already carried the `flush` op and the registrant (both are part of the worker's contract); Task 2's commit added the high-water warning, the drain extension and the vector/refusal/barrier tests, so Task 2 was not a literal red-then-green split.
- `runtime_cache_row` in `gamelib-store`'s `host.rs` is now `pub` (one word) so the dispatcher can decide ownership of an unlisted `store_cache/<name>` frame with the same row the host would open it with.

**Total deviations:** 3 auto-fixed (2 Rule 3, 1 Rule 2) plus the choices above. **Impact:** none on the plan's goal; the extra files were required by the generator, validator and census tests.

## Known Stubs

None.

## Authentication Gates

None.

## Threat Flags

None: the stdout store frames and the `storeMirrorEvent` channel are the two trust boundaries already in the plan's threat model (T-85-23 to T-85-26); no other network, auth or file surface was added.

## Issues Encountered

- One live gap is recorded as D5 above: no automated test runs a real shell against a real sidecar. `smoke:sidecar` and `smoke:exit-check` run the sidecar with no Rust peer (frames go to an unread stdout, no handle left open), which is what the plan asked of Task 3.
- `pnpm` re-ran its install prepare step once during `codecheck` (`Packages: -168`, then `Done`); the lockfile and tracked files are unchanged.

## Next Phase Readiness

Ready for 85-11: `dotPath.ts` replaces the minimal `segmentsOf/getPath/setPath/deletePath` in `mirrorCell.ts` (marked as the seam), and a family flip is now a one-line change in `storeOwnership.json` per store or family. The load-time `rev` handshake for late-created cells is left to the renderer-native write plan (85-17); until then `baseRev` is the highest rev seen.

## Self-Check: PASSED

- Created files present: `src-tauri/src/store_dispatch.rs`, `src/backend/stores/mirrorCell.ts`, `storeFrames.ts`, `storeOwnership.ts`, `src/backend/stores/__tests__/storeWritePath.test.ts`.
- Commits present on `main`: `5aca95cd1`, `6f3502cab`, `a7792454a` (`git rev-list --count 58cbe8c51..HEAD` = 3 at the last task commit).
- Acceptance criteria and plan-level verification re-run after the last commit (see Verification): all pass.
