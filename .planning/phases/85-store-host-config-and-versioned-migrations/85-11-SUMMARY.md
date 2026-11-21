---
phase: 85-store-host-config-and-versioned-migrations
plan: 11
subsystem: infra
tags: [typescript, store, mirror-cell, dot-prop, s1-protocol, property-test, sidecar, quit-flush]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-10 MirrorCell/MirrorRegistry, store frames and the Rust worker; 85-09 StoreHost and store boot (GAMELIB_STORE_BOOT); 85-03 dotpath.json / keyorder.json oracle vectors; 85-04 S1 protocol rules"
provides:
  - "dotPath.ts: segments/getPath/hasPath/setPath/deletePath with dot-prop 6 semantics, proven on every dotpath.json and keyorder.json vector (the same ones Rust passes)"
  - "MirrorCell speaks the full S1 protocol: applied/refused/flushed acks, `changed` events from another origin (rev above baseRev, decoded through the frame contract), a lazily recomputed view, late cells that converge by re-applying state-assigning ops"
  - "MirrorRegistry.flushStores(timeoutMs): the quit barrier (one flush frame behind pending writes, never rejects, unref'd deadline); `quit` awaits it before handleExit"
  - "StoreRoot seeds its ReadOnlyStores aggregate from GAMELIB_STORE_BOOT (detail 'reported by the Rust store host')"
  - "testUtils/diskStoreSink.ts: the in-process stand-in for the Rust owner, now createTestStoreRoot's default frame sink (+ recordFrames option)"
  - "D-02 proven: with GAMELIB_STORE=ts a store file one version above its chain opens read-only and no write shape changes, deletes or backs up anything"
affects: [85-12, 85-13, 85-14, 85-15, 85-16, 85-17, 85-19]

plan_head_before: e761ad1f944d4d200d8f232df8e93d2b7640abf1
plan_head_after: ab648b57deb1c0cdeb803b4b367c6437661c5958
commits: 5

actuals:
  tokens: 28000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "dot paths live in one pure module (dotPath.ts) that both the mirror's local view and the jest disk sink run on; an own `__proto__` key is defined, never assigned"
    - "a `changed` event is decoded by the same validator the shell applies to a frame (validateStoreFrame), so a reserved key, a prototype path or non-JSON text is dropped with a reason word and never moves the cell's rev"
    - "property test of a protocol: seeded generator, a fake peer with persist-before-emit and a rev under one lock, per-step invariants, quiescence convergence, vacuity floors, and a mutant the checker must catch"

key-files:
  created:
    - src/backend/stores/dotPath.ts
    - src/backend/testUtils/diskStoreSink.ts
    - src/backend/stores/__tests__/dotPath.test.ts
    - src/backend/stores/__tests__/mirrorCell.test.ts
    - src/backend/stores/__tests__/storeOwnership.test.ts
    - src/backend/stores/__tests__/storeFallback.test.ts
    - src/backend/testUtils/__tests__/diskStoreSink.test.ts
  modified:
    - src/backend/stores/mirrorCell.ts
    - src/backend/stores/storeRoot.ts
    - src/backend/stores/storeOwnership.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/testUtils/testStoreRoot.ts
    - src/backend/__mocks__/store_backend.ts
    - src/backend/stores/__tests__/storeWritePath.test.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
    - meta/knip-baseline.txt

key-decisions:
  - "A `changed` event is applied to base only when its rev is above the cell's baseRev; a cell created late starts at rev 0 over whatever the file shows and converges because ops assign state (the load-time rev handshake stays with 85-17)"
  - "The quit flush sends one flush frame through a cell that still has an unanswered write: the shell's worker is one FIFO, so one barrier covers every store, and the named store is by construction one the shell owns"
  - "The wire schema of storeMirrorEvent is NOT widened for `changed` here: nothing emits it until 85-17, which owns the Rust emitter and the schema/fixture change together; the TS type and isStoreMirrorEvent already accept it"
  - "createTestStoreRoot defaults its frame sink to the disk sink but keeps storeMode ts, so existing suites are untouched; an explicit frameSink replaces the disk sink"

patterns-established:
  - "Object spread is not safe over parsed JSON under the jest compile target (it compiled to Object.assign semantics and turned an own `__proto__` key into a prototype write): copy untrusted keys with defineProperty or use the freshly parsed object itself"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "TS dot paths match every dotpath.json and every keyorder.json vector (the oracle Rust also passes), through dotPath.ts, a MirrorCell and, for the dotted store cases, a GameLibStore over the tracer store; the golden cache-ops-dotpath-intkey ops leave a view byte-identical to the golden file Rust's store_frame test writes"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/dotPath.test.ts (86 tests)"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/storeWritePath.test.ts#a dotted set through the tracer store leaves the view the golden file the shell's store_frame test writes byte for byte"
        status: pass
    human_judgment: false
  - id: D2
    description: "The S1 protocol in the production MirrorCell: read-your-writes, one cell per file path, other-origin events in rev order with stale revs dropped, refusals, late cells, defensive decode of a changed payload, and 2,000 seeded random interleavings against a fake Rust peer that converge (with vacuity floors and a no-refusal mutant the checker catches)"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/mirrorCell.test.ts#the S1 property test against a fake Rust peer"
        status: pass
      - kind: unit
        ref: "mutation check run by hand: removing the stale-rev filter and making the view ignore pending were each caught by the suite (4 and 6 failures)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Durability parity at quit: the quit flow awaits flushStores(2000) before handleExit; the flush never rejects and its deadline timer is unref'd"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/appShellFlows.test.ts#85-11 quit (send) waits for the store flush (2 s budget) before it reaches handleExit()"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/mirrorCell.test.ts#flushStores: the quit barrier"
        status: pass
      - kind: integration
        ref: "pnpm smoke:sidecar"
        status: pass
    human_judgment: false
  - id: D4
    description: "Read-only state is synchronous: boot entries make a cell read-only at construction and reach the root's once-per-launch aggregate with the notice payload unchanged; resolveStoreMode, ownership and malformed GAMELIB_STORE_BOOT are covered"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "mirrorCell.test.ts#read-only stores the shell reported at boot; storeOwnership.test.ts (16 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-02: with GAMELIB_STORE=ts a store file one version above its chain opens read-only; set, delete, clear, replace and reset leave its bytes, mtimes and the directory listing unchanged"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/storeFallback.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Jest harness: real-store suites keep reading files back through the disk sink, whose bytes equal the golden file; the full Backend project still passes"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/testUtils/__tests__/diskStoreSink.test.ts; pnpm exec jest --selectProjects Backend (627 suites, 13,900 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A real shell and a real sidecar quitting with a store write in flight (the flush frame answered by the Rust worker across the real pipe)"
    verification: []
    human_judgment: true
    rationale: "The TS half runs against a fake peer and the Rust worker's flush barrier is proven in 85-10; no automated test joins them across a real process pair. That is the macOS live gate of 85-20."

duration: ~75min (start time was not recorded; estimated)
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 11: Hardened TS mirror, quit flush, D-02 fallback and the jest disk sink Summary

**The TS mirror now implements the whole S1 protocol on dot-prop 6 paths proven against the shared oracle vectors, passes a 2,000-interleaving randomized check against a fake Rust peer, flushes at quit, and carries Rust's read-only state into TS; the D-02 fallback is proven to refuse a newer file without touching it, and jest gets an in-process disk sink so real-store suites keep running.**

## Performance

- **Duration:** about 75 min (start time was not recorded; estimated)
- **Completed:** 2026-11-22
- **Tasks:** 3 (one tracer, one TDD, one auto)
- **Files modified:** 18 (7 created)

## Accomplishments

- **dotPath.ts.** `segments`, `getPath`, `hasPath`, `setPath`, `deletePath` with dot-prop 6 semantics: escaped dots, the three prototype segments refuse the whole path, canonical array indices, a non-object on the way down becomes `{}`, delete never prunes. With dot notation off an own `__proto__` key is defined, never assigned. All 35 `dotpath.json` and 14 `keyorder.json` cases pass three ways: `dotPath.ts` directly, a `MirrorCell` (dot cases) and a `GameLibStore` over the tracer store (dotted key-order cases). The four golden ops leave a view byte-identical to the golden file Rust's `store_frame_golden_ops_*` test writes.
- **MirrorCell, full S1.** `applied` moves the oldest pending op onto base (view untouched), an out-of-order ack or a `refused` event invalidates the cached view, which is rebuilt lazily from base plus pending. A `changed` event (no `originSeq`) is applied to base when its rev is above `baseRev`, dropped otherwise; it is decoded the way a frame names a write (`key`+`valueJson` set, `key` delete, `valueJson` replace, neither clear) and checked by `validateStoreFrame`, so a reserved key, a prototype path, non-JSON text or a non-object `replace` is dropped with a reason word and does not move the rev. A late cell starts at rev 0 over the file and converges, because ops assign state.
- **Property test.** `mirrorCell.test.ts` ports `sim.mjs`'s generator: 2,000 seeded interleavings of sidecar writes through two `GameLibStore` names, shell applies with injected persist failures (refused `io`, no rev), renderer-origin `changed` events, late cell creation and repeated events, against a fake peer that persists before it emits and numbers revs under one lock. After every step: read-your-writes per key against an independent oracle of unacked ops, visibility through both names, and (for a cell born at rev 0) base equal to the peer's history at its rev; at quiescence nothing pending and both views equal the peer. Vacuity floors (changed events applied, refusals, late cells, redeliveries, conflicts) and a peer that never reports a refusal, which the checker must catch.
- **Quit flush.** `MirrorRegistry.flushStores(timeoutMs)` sends one `flush` frame behind pending writes and resolves on `flushed`; a deadline or a refusal costs one stderr line, and it never rejects. The `quit` send handler awaits `flushStores(2000)` before `handleExit()`, through a new `storeMirrors` dependency slice wired from the boot's store root.
- **Boot read-only.** `createStoreRoot` records each `GAMELIB_STORE_BOOT` read-only entry in the root's `ReadOnlyStores` (storeKey, `<name>.json`, reason, `reported by the Rust store host`), so the once-per-launch notice (payload unchanged) lists stores Rust found read-only; a store the TS engine also marks is recorded once. The cell's own `readOnly` flag was already set from the same env at construction (85-10) and is now tested.
- **D-02.** `storeFallback.test.ts`: with `GAMELIB_STORE=ts`, a cache and a user-state store file stamped one above their chain open read-only, and set, nested set, delete, clear, whole-store replace and reset leave every file's bytes and mtime and the directory listing unchanged; reopening by a second store and a second root never resets it; a file at the current version stays writable.
- **Jest harness.** `diskStoreSink.ts` applies each frame to an in-memory copy of the store's file, writes `JSON.stringify(stamped, undefined, '\t')` (version envelope added where absent, kept in place where present; settings documents two-space, no envelope) and answers at once with `applied`/`flushed`/`refused`. `createTestStoreRoot` uses it by default (explicit `frameSink` replaces it) and takes `recordFrames`. The jest `store_backend` mock now takes the facade's own constructor options. The golden ops written through it equal the golden file's bytes.

## Task Commits

1. **Task 1: Tracer, dot paths proven on the shared vectors and wired into the mirror** - `54dcc6a2f` (feat)
2. **Task 2: Full S1 protocol in MirrorCell, boot read-only seeding, the property test** - `6f5bccc44` (feat)
3. **Task 3: Quit flush, D-02 fallback proof, jest disk sink and mock, plan-end gates** - `ab648b57d` (feat)

`commits: 5` in the frontmatter is the measured `git rev-list --count plan_head_before..HEAD`; two of the five (`0cdd99268`, `7b671bade`, both `docs(84)`) were made by another session on main while this plan ran. The plan's own commits are the three above.

**Plan metadata:** recorded in the docs(85-11) commit that follows this file.

## Verification

Run at the last commit: jest `dotPath`, `mirrorCell`, `storeOwnership`, `storeFallback`, `storeWritePath`, `diskStoreSink`, `library.realstore`, `crossover_index`, `wiki_game_info`, `src/backend/stores` (15 suites, 447 tests at Task 2; 32 suites, 644 tests with the real-store and appShellFlows suites at Task 3), `src/backend/sidecar` + `src/backend/__tests__` (220 suites, 5,539 tests) and the full Backend project (627 suites, 13,900 tests); `pnpm codecheck`, `pnpm lint` (production and tests PASS), `pnpm find-deadcode` (311 baselined; one obsolete baseline line removed), `pnpm backend-di-ceilings`, `pnpm planning-gates` (12/12), `pnpm smoke:sidecar`; prettier `--check` over every written TS path (`meta/knip-baseline.txt` has no parser). Acceptance greps: `dotpath.json` in dotPath.test.ts 4, `reported by the Rust store host` in storeRoot.ts 1, `interleav` in mirrorCell.test.ts 6, `flushStores` in appShellFlowRegistration.ts 3, `diskStoreSink` in testStoreRoot.ts 2; 2,000 interleavings run and all converge.

Tracer gate: automated-only `<verify>` re-run and passed (`⚡ Tracer verified end-to-end — expanding`), no checkpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `quit` needed a new dependency slice, which touched two more test files and the handler wiring**
- **Found during:** Task 3
- **Issue:** `AppShellFlowDeps` has no path to the boot's store root; the plan's `files_modified` names only `appShellFlowRegistration.ts`.
- **Fix:** a required `storeMirrors: Pick<MirrorRegistry, 'flushStores'>` slice, wired in `handlers.ts` from `deps.services.storeRoot.mirrors`; `directDeps()` in `appShellFlows.test.ts` and the census registration in `runnerSliceRegistration.test.ts` provide it; one new test pins "waits for the flush before handleExit".
- **Files modified:** `src/backend/sidecar/handlers.ts`, `src/backend/sidecar/__tests__/appShellFlows.test.ts`, `src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts`
- **Commit:** `ab648b57d`

**2. [Rule 1 - Bug] Object spread over parsed JSON turned an own `__proto__` key into a prototype write**
- **Found during:** Task 2 (T-85-27 test)
- **Issue:** under the jest compile target `{ ...parsed }` has `Object.assign` semantics; a `replace` change or value whose JSON carried `"__proto__"` lost that key and re-parented the copy. The same hazard existed in 85-10's `applyOp` for `replace` (`Object.assign(doc, value)`).
- **Fix:** `replace` defines own properties with `defineProperty`; a decoded `replace` uses the freshly parsed object itself. Pinned by the "never lets a value reach the prototype chain" case.
- **Commit:** `6f5bccc44`

**3. [Rule 3 - Blocking] The knip ratchet failed on a stale baseline line**
- **Found during:** Task 3
- **Issue:** the mock no longer imports `common/types/typed_store` (its type now comes from the facade), so the baselined `unlisted | src/backend/__mocks__/store_backend.ts | common` finding disappeared and the ratchet demands the line be removed in the same commit.
- **Fix:** removed that one line from `meta/knip-baseline.txt`.
- **Commit:** `ab648b57d`

### Implementation choices the plan left open

- The plan asks to replace the minimal dot-path helpers "in mirrorCell.ts and store_backend.ts"; `store_backend.ts` had none (its mirror-backed owner delegates to the cell), so only `mirrorCell.ts` changed there.
- The `changed` event's discriminator is `op: 'changed'` with the store op inferred from which of `key`/`valueJson` are present (the shape 85-17 will emit: `{op:'changed', store, rev, key, valueJson}`); `StoreMirrorEvent` became one interface with optional `originSeq`/`key`/`valueJson`. The strict wire schema in `sidecarInternal.ts` was left alone (see the decision above).
- The property test reaches the cell through two real `GameLibStore` instances rather than raw cells, so it also exercises the facade and the one-cell-per-path rule; a late cell replays events its file already reflects (the production behaviour), where the model dropped them as `rev <= baseRev`, and the invariants are adjusted accordingly: the per-key prefix check applies only to a cell born at rev 0, convergence to all.
- Task 1's `mirrorCell.ts` change is only the dot-path replacement; the protocol changes landed in Task 2's commit (the file was split for the two commits).
- Added `familyOf` to `storeOwnership.ts` (used by the disk sink to pick the settings two-space format) and `testUtils/__tests__/diskStoreSink.test.ts`, which the plan did not list.
- The MirrorCell refuses a path with an empty segment (`a..b`, `a.`) before it reaches the view, because the shared frame contract (`key-path`) does; conf accepted them. The four `dotpath.json` vectors that do this are asserted as "frame refuses, view unchanged" in the MirrorCell run and pass `dotPath.ts` directly.

**Total deviations:** 3 auto-fixed (1 Rule 1, 2 Rule 3) plus the choices above. **Impact:** none on the plan's goal.

## Known Stubs

None.

## Authentication Gates

None.

## Threat Flags

None. Mitigations in the plan's register are in place and tested: T-85-27 (events applied in rev order only, stale revs ignored, values parsed with `JSON.parse` through `dotPath.ts`, own `__proto__` keys defined not assigned), T-85-28 (`flushStores` bounded by an unref'd 2 s timer, resolves with a warning), T-85-29 (`readStoreBootEnv` defensive parse, one stderr line, only store keys and the two reason words accepted).

## Issues Encountered

- **Pre-existing, not fixed (out of scope):** `setPath` on an array fills with explicit `null` up to the index, in `dotPath.ts` exactly as in Rust's `dotpath.rs`, so a store key such as `list.4294967294` would allocate billions of elements on both sides. conf (dot-prop) made a sparse array. The key is renderer- or code-supplied, not remote, but a cap agreed on both sides is worth a todo.
- D7 above: no automated test runs a real shell against a real sidecar; `smoke:sidecar` covers boot and exit with no Rust peer.
- The wire schema for `storeMirrorEvent` still admits only `applied`/`refused`/`flushed`; 85-17 must widen it (with its fixture and `genIpcContract.ts`) when it adds the Rust emitter for `changed`.

## Next Phase Readiness

Ready for 85-12. Family flips can now rely on the mirror being indistinguishable from conf for readers, on `createTestStoreRoot` serving a Rust-owned store from disk under jest, and on `quit` waiting for in-flight store writes. 85-17 owns the load-time rev handshake for late cells and the `changed` wire schema.

## Self-Check: PASSED

Created files exist (`dotPath.ts`, `diskStoreSink.ts`, `dotPath.test.ts`, `mirrorCell.test.ts`, `storeOwnership.test.ts`, `storeFallback.test.ts`, `diskStoreSink.test.ts`); commits `54dcc6a2f`, `6f5bccc44` and `ab648b57d` are on HEAD.
