---
phase: 85-store-host-config-and-versioned-migrations
plan: 12
subsystem: infra
tags: [typescript, rust, store, cache-family, ownership, mirror-cell, store-frames, corrupt-cache]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-11 hardened MirrorCell, dotPath.ts, quit flush, jest disk sink; 85-10 MirrorRegistry, store frames and the shell's frame worker; 85-09 StoreHost and store boot; 85-03 corpus"
provides:
  - "storeOwnership.json: families.cache true, no per-store override (the 85-10 tracer's is gone): all 20 cache rows of storeTable.json are Rust-owned under GAMELIB_STORE=rust"
  - "store_dispatch.rs: RUNTIME_CACHE_NAMES (held equal to storePolicy.ts by a test) and owned_row, so a runtime store_cache/<name> frame is owned only when recognised and its family is flipped; anything else is refused not-owned and creates no file"
  - "storeOwnership.ts isRustOwned applies the same recognised-name rule to runtime caches"
  - "cacheFamily.test.ts (51 tests): every cache row mirror-backed under rust and conf-backed under ts, CacheStore.commit() as one replace frame with conf-identical bytes, startEmpty cells, storeNew over a flipped family"
  - "Rust proofs: every cache row opens at boot, a corrupt cache is copied aside / listed startEmpty / kept, and the first write over it lands only after the copy exists"
affects: [85-13, 85-14, 85-15, 85-16, 85-17, 85-18, 85-19, 85-20]

plan_head_before: d22e4609c4b3507d0ac0f8c7b5364a68c54a3b5f
plan_head_after: 9eb66a702a1f2fed217b83b75fdb911f12cb7944
commits: 4

actuals:
  tokens: 10500
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "an ownership decision has one gate on each side (TS isRustOwned, Rust owned_row) fed by one list that a test reads out of the other side's source, so the two cannot drift"
    - "a writer closure injected into StoreHost::with_writer observes ordering (here: the corrupt-copy exists at every store write)"

key-files:
  created:
    - src/backend/stores/__tests__/cacheFamily.test.ts
  modified:
    - src/common/types/ipc/storeOwnership.json
    - src/backend/stores/storeOwnership.ts
    - src/backend/stores/__tests__/storeOwnership.test.ts
    - src-tauri/src/store_boot.rs
    - src-tauri/src/store_dispatch.rs

key-decisions:
  - "CacheStore and the store facade needed no code change: the facade's store setter already sent one replace frame (MirrorBackedStore -> MirrorCell.replace) and cache.ts already reads the facade's readOnly, so flipping the flag is the whole change on the write path; the plan's cache.ts / store_backend.ts / storeWriteHandlers.ts entries are untouched"
  - "A runtime store_cache name is gated on RECOGNIZED_CACHE_STORE_NAMES on both sides, applied at the ownership decision, not at frame validation: the shared frame vectors still call store_cache/custom_cache shape-valid, and the shell answers it refused not-owned"
  - "The recognised runtime names (the four *_library caches and humble_library) are all user-state table rows, and a table row follows its own family, so the cache family reaches none of them: the runtime branch owns nothing today and is the gate a future runtime cache must pass"

patterns-established:
  - "To flip a family in a jest test, mutate the imported ownership JSON object for the length of the case and restore it in afterEach (isRustOwned reads it at call time)"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "Under the default mode every cache row (20, including both pci_ids registrations and store/wine-downloader-info) builds a mirror-backed store whose writes are frames naming that row; under GAMELIB_STORE=ts the same stores are conf-backed and send no frame; Rust's embedded ownership file flips exactly the cache family"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/cacheFamily.test.ts#the cache family (20 cache rows); storeOwnership.test.ts"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_boot (the_embedded_ownership_file_parses_and_flips_only_the_cache_family, open_all_opens_every_cache_row_under_the_cache_family_and_leaves_every_other_family)"
        status: pass
      - kind: unit
        ref: "mutation run by hand: families.cache false made 23 of 46 cacheFamily cases fail"
        status: pass
    human_judgment: false
  - id: D2
    description: "CacheStore.commit() after in-memory edits that remove a key is exactly one replace frame whose valueJson lacks the removed key, and the bytes on disk equal JSON.stringify(stampedView, undefined, tab) and equal what the conf owner writes for the same edits"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cacheFamily.test.ts#CacheStore.commit() on a Rust-owned cache"
        status: pass
    human_judgment: false
  - id: D3
    description: "T-85-30: a runtime store_cache name is owned only when recognised (TS and Rust agree, RUNTIME_CACHE_NAMES is read out of storePolicy.ts by a test); an unrecognised name, a pattern failure and a path escape are refused not-owned and create no file; a library cache is not reached by the cache family"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_frame (store_frame_runtime_cache_names_equal_the_recognised_names_of_store_policy_ts, store_frame_owned_row_follows_the_cache_family_and_refuses_unrecognised_runtime_names, store_frame_under_the_cache_family_applies_to_a_cache_and_refuses_the_rest_not_owned)"
        status: pass
      - kind: unit
        ref: "storeOwnership.test.ts#refuses a runtime store_cache name the store policy does not recognise; cacheFamily.test.ts#runtime cache stores built by storeNew"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-18 for caches: a corrupt cache is copied aside byte for byte as <name>.corrupt.<stamp>.json at boot, GAMELIB_STORE_BOOT lists it in startEmpty, the TS cell starts empty and writable (and empty over a readable file when the shell says so), and the first write replaces the original only after the copy exists"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test: store_boot::open_all_copies_a_corrupt_cache_aside_lists_it_start_empty_and_keeps_the_original; store_dispatch::store_frame_the_first_write_over_a_corrupt_cache_lands_only_after_its_copy_exists"
        status: pass
      - kind: unit
        ref: "cacheFamily.test.ts#a cache the shell could not read (D-18, GAMELIB_STORE_BOOT startEmpty)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-21: cache writes carry no sync_all; the read-only notice payload is unchanged"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "gamelib-store host test asserting store_cache/steam_metadata writes Durability::Unsynced (85-09); nothing in this plan touches the notice payload"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real shell and a real sidecar with the cache family flipped: boot opens the cache files, the sidecar mirrors them, a library refresh writes through frames and the files read back as before"
    verification: []
    human_judgment: true
    rationale: "The TS half runs against the in-process disk sink and the Rust half against a fake sidecar; no automated test joins them across a real process pair. That is the macOS live gate of 85-20."

duration: ~90min (start time was not recorded; estimated)
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 12: Cache family flipped to the Rust owner Summary

**The whole cache family (20 rows) is now Rust-written behind `GAMELIB_STORE`: the ownership flag is the only switch, `CacheStore.commit()` is one `replace` frame with the bytes conf writes, runtime cache names are gated by one drift-tested list on both sides, and a corrupt cache continues empty only after its byte copy exists.**

## Performance

- **Duration:** about 90 min (start time was not recorded; estimated)
- **Completed:** 2026-11-22
- **Tasks:** 2 (one tracer, one TDD)
- **Files modified:** 6 (1 created)

## Accomplishments

- **The flip.** `storeOwnership.json` is `families.cache: true` with an empty `stores` map; the 85-10 tracer override is gone because the family covers `store_cache/wikigameinfo`. Nothing in `cache.ts`, `store_backend.ts` or `storeWriteHandlers.ts` had to change: 85-10/85-11's facade already routes a `store` assignment to `MirrorCell.replace` (one frame), `CacheStore` already reads the facade's `readOnly`, and the ad hoc `new Store({cwd:'store_cache', name})` in the write path already lands on the root's one cell per file path.
- **Every cache row proven both ways.** `cacheFamily.test.ts` builds every store through `createStores` and, for each of the 20 `family: cache` rows, shows a write is a frame naming that row under the default mode and sends no frame (conf writes the file) under `GAMELIB_STORE=ts`. With `families.cache` set back to false by hand, 23 of 46 cases fail.
- **commit() parity.** `crossover_index`: two sets, then `use_in_memory`, a delete, a set and `commit()` produce exactly one `replace` frame (key absent from its `valueJson`); the file bytes equal `JSON.stringify(stampedView, undefined, '\t')` and equal the bytes the conf owner writes for the same edits (fake timers pin the `Date()` timestamps).
- **Runtime caches, both sides.** `store_dispatch.rs` gets `RUNTIME_CACHE_NAMES` and `owned_row` (the handler's ownership decision): a runtime `store_cache/<name>` is owned only when the name is recognised and the cache family is on; a table row follows its own family. A cargo test reads `storePolicy.ts` and asserts the list equals `BOOT_SET_CACHE_STORE_NAMES` followed by `DENIED_CACHE_STORES`, that `RECOGNIZED_CACHE_STORE_NAMES` is exactly those two spreads, and that the name pattern text is unchanged. `isRustOwned` in `storeOwnership.ts` applies the same rule (with a `recognizedRuntimeCaches` seam like the existing `ownership` one). `store_cache/custom_cache` stays shape-valid (the shared vectors say so) but is answered `refused: not-owned` and no file appears.
- **Corrupt caches (D-18).** Rust: boot over a profile holding the corpus's corrupt cache copies it aside byte for byte, lists it in `startEmpty` (and only there) and leaves the original; a second boot keeps it empty with the copies bounded; through the dispatcher, a writer that checks the directory at every store write sees the copy before the first write lands, and the original then holds only the new entry. TS: a cell over a corrupt file listed in `GAMELIB_STORE_BOOT.startEmpty` is empty and writable, sends nothing until the first write, and replaces the file through the sink; a cell over a readable file the shell listed as `startEmpty` is empty too (the shell's verdict decides).
- **Boot sweep.** `open_all` over a profile holding the real corpus file of every cache row that has one (and a baseline file for the rest) opens all 20 cache rows, none read-only or start-empty, and leaves a user-state file in the same directory alone.

## Task Commits

1. **Task 1 (tracer): flip the cache family and prove crossover_index end to end** - `1d7c3c2aa` (feat)
2. **Task 2: runtime cache stores on both sides, the corrupt-cache path end to end, plan-end gates** - `9eb66a702` (feat)

`commits: 4` in the frontmatter is the measured `git rev-list --count plan_head_before..HEAD`; two of the four (`7dc3d632b`, `db7a41e1f`, both `quick-261122-gzp`) were made by another session on main while this plan ran. The plan's own commits are the two above. The ledger base was recorded just before the first commit, after `d22e4609c` landed from another session.

**Plan metadata:** recorded in the docs(85-12) commit that follows this file.

## Verification

Run at the last code commit: `pnpm exec jest --runTestsByPath` cacheFamily + storeLayer (2 suites, 93 tests); jest `crossover_index`, `wiki_game_info`, `storeSearch`, `utils/systeminfo`, `stores` and `storeLayer` (36 suites, 716 tests); `cargo test --bin gamelib-shell store_boot` (16) and `store_frame` (19), and the whole shell binary (637 passed, 0 failed); `rustfmt --edition 2021 --check` over `store_boot.rs` and `store_dispatch.rs`; `pnpm smoke:sidecar` PASS; `pnpm codecheck`; `pnpm lint` (exit 0); `pnpm find-deadcode` (311 baselined, PASS); `pnpm backend-di-ceilings` PASS; `pnpm planning-gates` 12/12; prettier `--check` over every written TS path (none prettier-ignored). Acceptance: `grep -c '"cache": true'` storeOwnership.json = 1, `grep -c wikigameinfo` = 0, `RUNTIME_CACHE_NAMES` in store_dispatch.rs = 8, cacheFamily.test.ts titles its suite with the cache row count (20).

Tracer gate: automated-only `<verify>` re-run and passed (`⚡ Tracer verified end-to-end — expanding`), no checkpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The embedded-ownership tests of 85-09/85-10/85-11 pinned the tracer-only state**
- **Found during:** Task 1
- **Issue:** `store_boot.rs`'s `the_embedded_ownership_file_parses_and_flips_only_the_tracer_store` and `storeOwnership.test.ts`'s "reads the committed ownership file" asserted `stores == {wikigameinfo}` and no family flipped; flipping the family makes them fail by design.
- **Fix:** rewritten to assert exactly the cache family is on, `stores` is empty and the other three families are off (Rust: every row's ownership equals `native or cache`).
- **Files modified:** `src-tauri/src/store_boot.rs`, `src/backend/stores/__tests__/storeOwnership.test.ts`
- **Commit:** `1d7c3c2aa`

**2. [Rule 3 - Blocking] `storeOwnership.test.ts` pinned `brand_new_cache` as Rust-owned**
- **Found during:** Task 2
- **Issue:** the 85-11 case "treats a runtime store_cache name the table does not list as a cache-family store" expects any pattern-valid runtime name to be owned; the plan's recognised-name rule (T-85-30) makes that false.
- **Fix:** the case now uses a recognised name through the new `recognizedRuntimeCaches` seam, and a second case pins the refusal of an unrecognised one.
- **Files modified:** `src/backend/stores/__tests__/storeOwnership.test.ts`, `src/backend/stores/storeOwnership.ts` (not in the plan's `files_modified`)
- **Commit:** `9eb66a702`

### Implementation choices the plan left open

- The plan's `files_modified` lists `cache.ts`, `store_backend.ts` and `storeWriteHandlers.ts`; none needed a change (see Accomplishments), so none was touched. `storeOwnership.ts` and the two Rust test modules' ownership tests were touched instead.
- The plan's behaviour line "is_rust_owned for `store_cache/<recognized name>` ... returns true" cannot hold for today's recognised names: all five are `user-state` table rows, and a row follows its own family. The recognised-name rule is therefore implemented as `owned_row` / `isRustOwned`'s runtime branch, tested with a synthetic recognised name (`fresh_runtime_cache`) on the Rust side and the `recognizedRuntimeCaches` seam on the TS side, and the shipped list is tested to be the policy's and to be wholly table rows.
- The plan says "storeNew ... constructs a mirror-backed store sharing the registry's cell". Under the shipped file every recognised name is user-state, so the test flips the user-state family on the imported ownership object for the length of the case (restored in `afterEach`) to prove the path; a companion case shows the same construction stays conf-backed while the family is off.
- "The shell tests" in the plan-end gates were read as `cargo test --bin gamelib-shell store_boot`, `store_frame` and, as a bonus, the whole shell binary.
- The new Rust cases that guard the plan's behaviours carry a `store_frame_` prefix so the plan's own `cargo test ... store_frame` filter runs them.

**Total deviations:** 2 auto-fixed (both Rule 3) plus the choices above. **Impact:** none on the plan's goal.

## Known Stubs

None.

## Authentication Gates

None.

## Threat Flags

None. Mitigations in the plan's register are in place and tested: T-85-30 (recognised-name list plus `CACHE_STORE_NAME_PATTERN` on both sides, drift-tested; unrecognised names refused `not-owned` with no file; `open_cache` keeps its plain-file-name check, untouched), T-85-31 (a corrupt cache continues empty only after its byte copy exists, proven through the dispatcher).

## Issues Encountered

- **Pre-existing, not fixed (out of scope):** in `CacheStore`'s in-memory mode `set` writes a literal `__timestamp.<key>` map key while the file holds timestamps nested under `__timestamp`, so after `commit()` an entry written in the batch has a top-level `__timestamp.<key>` key that dot-path reads (`get`) do not find and `get()` returns the fallback for it. conf behaved identically (the cache-family test pins byte parity with it), so the flip does not change it.
- D6 above: no automated test runs a real shell against a real sidecar with the cache family on; `smoke:sidecar` covers boot and exit with no Rust peer. That is 85-20's macOS live gate.
- The wire schema for `storeMirrorEvent` still admits only `applied`/`refused`/`flushed`, and the late-cell rev handshake is still open: both stay with 85-17.

## Next Phase Readiness

Ready for 85-13. The family-flip pattern is now proven once: a family flag in `storeOwnership.json`, the table row's family deciding ownership on both sides, the disk sink standing in for the shell under jest. The user-state family's recognised library caches (`*_library`) are the first stores whose runtime-name gate and table row both matter; 85-18 (`version_gate`) and 85-17 are untouched by this plan.

## Self-Check: PASSED

Created file exists (`src/backend/stores/__tests__/cacheFamily.test.ts`); commits `1d7c3c2aa` and `9eb66a702` are on HEAD.
