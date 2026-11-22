---
phase: 85-store-host-config-and-versioned-migrations
plan: 17
subsystem: infra
tags: [rust, typescript, store, native-router, store-policy, storeChanged, s1-protocol, preload, rev]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-16 store_native.rs, store_policy.rs, storeChannels.json, the fetch reply { values, rev? } and the snapshot '@rev'; 85-10/85-11 store_dispatch.rs, MirrorCell and the S1 protocol; 85-09 StoreHost and store_boot"
provides:
  - "storeSet, storeDelete, storeNew (native sends, slice store) and sidecar:store-set-checked (native invoke, slice store): resolved through the store table, policy-checked in Rust (reserved key, prototype segment, is_writable_store_field incl. steamConfigStore.refreshToken), applied through StoreHost with Origin::Renderer"
  - "The renderer push from Rust: a StoreHost listener emits storeChanged {store, key, value | deleted | invalidated, rev} per renderer name over the file, filtered by is_allowed_store_field (install_renderer_push, run_setup)"
  - "One ordered sidecar event stream: applied acks and changed {store, rev, key?, valueJson?} leave from a host listener in rev order; refused/flushed/no-op acks are posted behind earlier changes (StoreHost::post)"
  - "gamelib-store: StoreChange.value (Debug redacts it), Store::apply_reporting, StoreHost::post"
  - "Sidecar-internal channels store:ts-set, store:ts-set-checked, store:ts-delete, store:ts-new (shell-only); STORE_TS_* constants in sidecarTransport.ts"
  - "storeMirrorEvent schema widened for changed (discriminated union on op); MirrorCell folds an applied ack only when its rev is above baseRev"
  - "isRustOwnedStoreName (storeOwnership.ts): TS pushStoreChanged skips a store Rust owns under rust mode"
  - "StoreChangedPayload.rev and the preload lastRev guard (snapshot '@rev', fetch rev, applied pushes; buffered changes replayed only when newer than the read)"
affects: [85-19, 85-20, 85-21, 85-24]

plan_head_before: 2b1cf2d3b3466af21ce2217e6516f1d9cb2939a8
plan_head_after: c7234d13a1490e377c548e549d2d21f15c2b5aeb
commits: 6
commits_note: "git rev-list --count plan_head_before..plan_head_after is 6: another session committed three phase-84 commits (61cffefff, 349975ff0, 9b7215062) to main while this plan ran. This plan's own commits are 55a635ebc, dc0ce5d53 and c7234d13a (git log --grep 85-17), plus the docs commit."

actuals:
  tokens: 42227
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Everything the sidecar's mirror hears about a store leaves from the host's one dispatcher thread: changes are enqueued under each store's lock, and work that consumes no rev is posted to the same queue, so no answer can overtake a change"
    - "A change carries the value it wrote (StoreChange.value), so a listener forwarding it never reads a store a later write has already moved"
    - "One push source per store: Rust pushes for every store it owns; the sidecar's single push site returns early for those under rust mode"

key-files:
  created:
    - src/backend/stores/__tests__/rendererWrites.test.ts
  modified:
    - src-tauri/src/store_native.rs
    - src-tauri/src/store_dispatch.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/main.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/crates/gamelib-store/src/host.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/sidecarInternal.ts
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/sidecarTransport.ts
    - src/backend/sidecar/storeWriteHandlers.ts
    - src/backend/stores/mirrorCell.ts
    - src/backend/stores/storeOwnership.ts
    - src/preload/tauriTransport.ts
    - src/preload/__tests__/tauriTransport.test.ts
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
    - src/backend/sidecar/__tests__/skeletonFlows.test.ts
    - src/backend/sidecar/__tests__/storeLayer.test.ts
    - src/backend/stores/__tests__/cacheFamily.test.ts

key-decisions:
  - "Every sidecar-bound store event comes from the StoreHost dispatcher thread: the worker no longer writes an applied ack for a change (a host listener does, in rev order), and its refused/flushed/no-op answers are posted behind earlier changes. Without this a worker-written applied could reach the mirror after a later renderer changed and fold an older value over a newer one"
  - "A no-op sidecar frame consumes no rev, so it is acked with the rev it saw; MirrorCell folds an applied op only when the ack's rev is above baseRev, otherwise the op is already in base"
  - "StoreChange carries the written value (an Arc<Json>; Debug prints <value>) instead of listeners re-reading the store, which a later write may already have moved"
  - "The store_dispatch dispatcher is built at configure (not on the first frame) so its listener hears a renderer write made before any sidecar frame"
  - "Writes forward per row like reads: under GAMELIB_STORE=ts every write is forwarded unchanged and unchecked (TS's own guards decide, D-01); under rust an unknown store is refused in Rust and a row TS still owns is forwarded"
  - "Renderer pushes go to every renderer name over the file (steamConfigStore and steamBottleConfigStore both hear steam_store/config), each through its own allow-list; a clear or replace is an invalidated push with no value"
  - "The preload does not resync on a rev gap: a change to a field the renderer cannot read is never pushed, so gaps are normal (S1 rule 10 would refetch on every token write)"
  - "sidecar:store-set-checked runs on a blocking thread and the sends on the store slice worker, so a set-checked is not ordered against an earlier storeSet; this matches the existing native/sidecar boundary (sends and invokes were never ordered against each other)"

patterns-established:
  - "A Rust test that needs both store listeners builds a host with install_renderer_push and a store_dispatch::Dispatcher, then waits on StoreHost::post to know every queued event was delivered"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "Tracer: a renderer storeSet on a Rust-owned store is persisted in the TS byte layout and announced once to each side: one storeChanged {store, key, value, rev} and one storeMirrorEvent changed {store, rev, key, valueJson}; TS readers see it through the changed event"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_native::tests::store_native_tracer_a_renderer_set_is_persisted_and_announced_once_to_each_side"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/rendererWrites.test.ts#a changed set moves a Rust-owned store so GameLibStore.get returns the renderer value"
        status: pass
    human_judgment: false
  - id: D2
    description: "The write choke point in Rust (T-85-43): refreshToken, prototype segments, __internal__, non-writable fields, denied/unknown stores and a store no file backs are refused and write nothing; set-checked is true only once on disk and false for a denied field, unsafe key path, read-only or evicted store; storeNew opens only a recognised cache, ignores options and refuses other names"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_native (a_renderer_write_the_policy_refuses_writes_nothing_and_announces_nothing, set_checked_is_true_only_once_on_disk_and_false_for_every_refusal, store_new_opens_a_recognised_cache_lazily_and_ignores_options, store_delete_removes_the_key_and_pushes_deleted_with_its_rev)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell native_ (manifest valid/invalid vectors for the four channels; router keys equal the generated sets)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The renderer push from Rust is filtered per renderer name by is_allowed_store_field (T-85-44); bulk changes invalidate with no value; a native store pushes nothing"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_native::tests::store_native_pushes_follow_each_renderer_name_policy_and_bulk_changes_invalidate"
        status: pass
    human_judgment: false
  - id: D4
    description: "One ordered sidecar event stream: changed events for renderer/Rust-origin changes, applied acks in rev order, a no-op ack after the change it raced, flushed after every earlier applied; the mirror never folds a no-op ack over a newer change"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_frame (a_change_from_another_origin_reaches_the_sidecar_as_changed, acks_and_changes_leave_in_rev_order_and_a_no_op_ack_after_the_change_it_raced, the_queue_flush_is_answered_only_after_every_earlier_frame_is_applied)"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-store host (post_runs_after_every_change_queued_before_it_and_inline_without_a_listener, a_change_carries_what_it_wrote_even_when_a_later_write_moved_the_store, apply_reporting_tells_a_change_from_a_no_op)"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/rendererWrites.test.ts#a no-op ack after a newer renderer change does not fold the older value back (mutation-checked: fails with the old rule)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-01 flag window: under GAMELIB_STORE=ts each of the four handlers forwards unchanged to its store:ts-* channel and Rust pushes nothing; under rust TS pushes nothing for a Rust-owned store and still pushes for one TS owns (mutation-checked)"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_native::tests::store_native_ts_mode_forwards_each_write_handler_to_its_ts_channel_and_rust_pushes_nothing"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/rendererWrites.test.ts#the sidecar pushes storeChanged only for stores Rust does not own"
        status: pass
    human_judgment: false
  - id: D6
    description: "Pitfall 8: the preload drops a push whose rev is not above what the store's snapshot reflects (boot snapshot '@rev', fetch rev, applied pushes); rev-less pushes keep today's path; buffered changes replay only when newer; a stale invalidation starts no re-fetch (mutation-checked)"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/preload/__tests__/tauriTransport.test.ts (the five 85-17 cases, incl. 'a push with rev 5 after a fetch at rev 7 is dropped; a push with rev 8 is applied')"
        status: pass
    human_judgment: false
  - id: D7
    description: "A live app: renderer settings writes land on disk through Rust, the UI and the sidecar both see them, and no push is applied twice or out of order"
    verification: []
    human_judgment: true
    rationale: "No test drives the real webview, shell and sidecar together; each side is proven against fakes. The phase's live gate (85-HUMAN-UAT.md) is where a running app is observed."

duration: 42min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 17: Renderer store writes and storeChanged served by Rust Summary

**The renderer's four store write channels are native Rust channels behind the shared policy, applied through StoreHost; Rust is the only renderer pusher for the stores it owns, every event to the sidecar's mirror leaves from one ordered host queue, and the preload drops a stale push by rev**

## Performance

- **Duration:** 42 min
- **Started:** 2026-11-22T01:28:39Z
- **Completed:** 2026-11-22T02:11:08Z
- **Tasks:** 3
- **Files modified:** 22 (1 created)

## Accomplishments

- `storeSet`, `storeDelete` and `storeNew` are native sends on a new `store` slice worker, and `sidecar:store-set-checked` is a native invoke. Rust resolves the renderer name through the store table, refuses an unknown or denied store, the `__internal__` namespace, a prototype segment and any field `is_writable_store_field` refuses (including `steamConfigStore.refreshToken`), then applies the write with `Origin::Renderer`. Refusals are logged by category, with the store name on stderr only.
- The renderer push moved to Rust. A `StoreHost` listener emits `storeChanged {store, key, value | deleted | invalidated, rev}` for every change of a store the renderer reads, whoever made it. It sends one push per renderer name over the file, each filtered by that name's allow-list. TS's `pushStoreChanged` now returns early for a store Rust owns under `rust` mode, so each store has exactly one push source.
- Everything the sidecar's mirror hears now leaves from the host's single dispatcher thread, in order. A change the sidecar made is acked `applied` by a host listener. A renderer or Rust change is sent as `changed {store, rev, key?, valueJson?}`. The worker's own answers (`refused`, `flushed`, a no-op `applied`) are posted to the same queue behind earlier changes. `MirrorCell` folds an `applied` op only when its rev is above `baseRev`.
- `gamelib-store` gained what this needed: `StoreChange.value` (redacted from `Debug`), `Store::apply_reporting` (change versus no-op) and `StoreHost::post`.
- Under `GAMELIB_STORE=ts`, all four handlers forward unchanged to the renamed shell-only `store:ts-*` channels, and TS still does its own pushing, as before.
- The preload keeps a `lastRev` per store, taken from the boot snapshot's `'@rev'`, each fetch's `rev` and every applied push. It drops a push that is not newer before applying it, buffering it or re-fetching, and replays a change that arrived during a fetch, or during the boot snapshot, only when it is newer than the read.

## Task Commits

1. **Task 1 (tracer): renderer storeSet end to end** - `55a635ebc` (feat). The tracer's automated `<verify>` (ipc contract, the three jest gates, the `store_native` and `native_` cargo filters, scoped rustfmt, prettier, codecheck) was re-run and passed before Task 2 started (end-of-phase mode, automated-only verify, so no checkpoint).
2. **Task 2: set-checked, delete and new natively, the ts proxy, TS pushes off for Rust-owned stores** - `dc0ce5d53` (feat)
3. **Task 3: the preload rev guard and the plan-end gates** - `c7234d13a` (feat)

**Plan metadata:** the docs commit that carries this file, STATE.md, ROADMAP.md, REQUIREMENTS.md and deferred-items.md.

## Files Created/Modified

See the frontmatter `key-files`. `rendererWrites.test.ts` is new: it covers `changed` events reaching TS readers, the no-op ack rule and the one-push-source rule. Most of the Rust is in `store_native.rs` (handlers, policy, renderer push) and `store_dispatch.rs` (mirror events, posted answers).

## Decisions Made

See `key-decisions`. The one that shapes later plans is that the sidecar event stream is ordered by the host's queue. Any future Rust code that answers the sidecar about a store must post through `StoreHost::post`, not write to the pipe directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The worker's applied ack could overtake a renderer change**
- **Found during:** Task 1
- **Issue:** the plan has the worker keep acking sidecar frames while a host listener sends `changed`. Those are two threads writing to one pipe. An `applied` for rev N could reach the mirror after a renderer's `changed` for rev N+1, and the mirror would fold the older value over the newer one. A no-op frame (no rev consumed) has the same race.
- **Fix:** the host listener sends the `applied` for a sidecar-origin change, and the worker posts its non-change answers to the host queue (`StoreHost::post`). The worker tells a change from a no-op with `Store::apply_reporting`, and `MirrorCell` folds an ack only above `baseRev`.
- **Files modified:** `gamelib-store/src/host.rs`, `store_dispatch.rs`, `mirrorCell.ts`
- **Verification:** `store_frame_acks_and_changes_leave_in_rev_order_...`, the gamelib-store post test, and the jest no-op case. The jest case fails under the old fold rule (checked by hand).
- **Committed in:** `55a635ebc`

**2. [Rule 3 - Blocking] gamelib-store changes the plan did not list**
- **Found during:** Task 1
- **Issue:** `StoreChange` held no value. A listener that re-reads the store can see a later write, so a push for rev N could carry rev N+1's value, or none if a delete followed.
- **Fix:** `StoreChange.value: Option<Arc<Json>>` (built only when something listens, `Debug` prints `<value>`), plus `apply_reporting` and `post` as above. One existing host test literal gained the field.
- **Committed in:** `55a635ebc`

**3. [Rule 3 - Blocking] Files and counts a new native channel touches**
- **Found during:** Tasks 1-2
- **Issue:** each channel needed typing in `native.ts` (census 290 to 294), its zod key renamed in `sidecarInternal.ts` with fixtures, and the generated contract. The suites that drove the old TS handlers by their renderer names (`skeletonFlows`, `storeLayer`, `cacheFamily`) now drive the shell-only names. They still prove TS's own guards, which are live under `ts` mode.
- **Committed in:** `55a635ebc`, `dc0ce5d53`

**4. [Rule 2 - Correctness] storeSet's ts forward landed with the tracer**
- **Found during:** Task 1
- **Issue:** the plan puts the ts-mode forwarding in Task 2. Renaming the TS handler in Task 1 without it would have dropped every `storeSet` under `GAMELIB_STORE=ts` between the two commits.
- **Fix:** the forward is part of `apply_renderer_write` from Task 1. Task 2 added the other three handlers.
- **Committed in:** `55a635ebc`

**5. [Rule 3 - Blocking] knip: two constants lost their last user**
- **Found during:** Task 3 (`pnpm find-deadcode`)
- **Issue:** `STORE_SET_CHANNEL` and `STORE_DELETE_CHANNEL` were used only by the renamed TS handlers.
- **Fix:** the preload now sends through those constants instead of string literals.
- **Committed in:** `c7234d13a`

**6. [Plan detail] The boot-snapshot replay**
- The plan's guard covers fetches. The boot snapshot had the same race with no buffer at all: a push that arrived while it was in flight was overwritten. It now buffers like a fetch and replays only newer changes. Covered by the snapshot test.

---

**Total deviations:** 6 (1 bug, 3 blocking, 1 correctness, 1 plan detail). **Impact:** the scope is unchanged. Without item 1, the plan's "in rev order from the one dispatcher" truth would not hold.

## Issues Encountered

- **Not built: the load-time rev handshake for a late mirror cell.** 85-11 handed it to 85-17, but the plan's tasks and must-haves never name it. Built properly, it is a protocol change of its own: a new frame op in the shared frame vectors and a `loaded` event. A cell created after boot still converges, because every op assigns state, but it can briefly read a value the file has already superseded. Recorded in `deferred-items.md`.
- `outboundHttpRegistry.test.ts` (a WebSocket upgrade case) failed once in the full `src/backend` run and passes alone. This plan did not touch it; recorded in `deferred-items.md`.
- Another session committed three phase-84 commits to `main` during this plan. Only this plan's paths were staged. rustfmt was scoped to the files written, because `rustfmt --check src/main.rs` also walks the generated `ipc_contract.rs` and `store_embed/controls.rs`; `main.rs`'s own hunk is clean.

## Verification

Run at the last code commit (`c7234d13a`), all passing:

- `npx jest src/backend src/common`: 654 suites, 14,714 tests.
- `pnpm exec jest --selectProjects Preload Frontend`: 395 suites, 6,874 tests (Preload re-run after the last edit: 213).
- `cargo test --bin gamelib-shell`: 702 passed. `cargo test -p gamelib-store`: 145 passed in the lib.
- `pnpm check:ipc-contract`, `pnpm smoke:sidecar` and `pnpm codecheck` all passed.
- `pnpm lint`: production PASS, tests PASS.
- `pnpm find-deadcode`: PASS (311 baselined).
- `pnpm backend-di-ceilings`: PASS. `pnpm planning-gates`: 12/12.
- prettier `--check` passed over every written TS/JSON path. `ipcSchemaSnapshot.json` is prettier-ignored (generated) and was left out of the check.

Acceptance greps:

| Check | Expected | Result |
| --- | --- | --- |
| `storeSet:` keys in `sidecarInternal.ts` | 0 | 0 |
| `store:ts-set` in `storeWriteHandlers.ts` | ≥ 1 | 2 |
| `"slice": "store"` in `nativeChannels.json` | ≥ 5 | 5 |
| `storeDelete\|storeNew:` keys | 0 | 0 |
| `rev?: number` in `sidecarTransport.ts` | ≥ 1 | 1 |

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-85-43: the write policy is enforced in Rust and tested with the refreshToken, prototype, reserved and unknown-store cases. T-85-44: every push is filtered per renderer name, and invalidations carry no value. T-85-45: revs are assigned under the store lock, events go through one dispatcher queue, and the preload guard sits on top of `changesDuringFetch`.

## User Setup Required

None.

## Next Phase Readiness

- The whole renderer store surface (fetch, snapshot, set, set-checked, delete, new, storeChanged) is native under the default mode. 85-21 deletes `GAMELIB_STORE`, the ts forwards in `store_native.rs`, the four `store:ts-*` handlers and the `FLAG_EXEMPTIONS` entry.
- The late-cell handshake is open; see Issues Encountered.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*

## Self-Check: PASSED
