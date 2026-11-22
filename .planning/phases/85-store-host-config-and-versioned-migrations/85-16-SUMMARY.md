---
phase: 85-store-host-config-and-versioned-migrations
plan: 16
subsystem: infra
tags: [rust, typescript, store, native-router, store-policy, read-only-notice, rustinvoke, ipc]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-15 every family flipped and the GamesConfig/<app> area row; 85-18 the rustInvoke channel pattern and count pins; 85-09 StoreHost, store_boot and the store mode; 85-03 storePolicyVectors.json"
provides:
  - "src/common/types/ipc/storeChannels.json: the one renderer store policy file (storeAllowlist, writeDeniedFields, deniedCacheStores, recognizedCacheStoreNames, cacheStoreNamePattern, bootSetStores, lazyStores, readOnlyAreas {byKey, byPrefix, fallback}) read by storePolicy.ts, readOnlyStores.ts and store_policy.rs"
  - "src-tauri/src/store_policy.rs: is_safe_key_path, is_allowed_store_field, is_writable_store_field, filter_store_snapshot, area_for_store_key, is_plausible_cache_name; every storePolicyVectors.json row passes in cargo"
  - "src-tauri/src/store_native.rs: resolve_renderer_store, store_fetch (native sidecar:store-fetch), snapshot_blocking (sidecar_store_snapshot), read_only_notice (rustInvoke store_read_only_notice), the SidecarProxy ts forward"
  - "Wire shapes: fetch reply { values, rev? } (rev absent when the sidecar answered); rust-mode snapshot adds STORE_REV_KEY '@rev' -> { [store]: rev }; ts-mode snapshot is the sidecar's result unchanged"
  - "Sidecar-internal channels store:ts-fetch and store:ts-snapshot (shell-only); STORE_TS_FETCH_CHANNEL, STORE_REV_KEY, RUST_STORE_READ_ONLY_NOTICE in sidecarTransport.ts"
  - "Store::snapshot_with_rev (gamelib-store): entries and rev under one lock"
  - "nativeSeamPortComplete: whole-word flag scan and FLAG_EXEMPTIONS { store: 'Phase 85 D-01 rollback window; deleted by plan 85-21' }"
affects: [85-17, 85-19, 85-20, 85-21, 85-24]

plan_head_before: d029be2cf87fd5ca99e9207db91f9500b35f17d0
plan_head_after: 9c861466a2fe5793f371d3d68d3d9e98e0963c23
commits: 3
commits_note: "git rev-list --count plan_head_before..plan_head_after is 14: another session committed 11 phase-84 review fixes to main while this plan ran. This plan's own commits are 833f27f79, 1848addc1 and 9c861466a (git log --grep 85-16), plus the docs commit."

actuals:
  tokens: 20000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One JSON data file, two ports: TS and Rust both read storeChannels.json, and the same vectors run in jest and cargo; a hand-written Rust check of a JS regex is pinned to the file's pattern text"
    - "A native channel that must still reach a TS-owned file forwards to a renamed shell-only sidecar channel through a SidecarProxy trait (store_dispatch's SidecarState OnceLock in production, a recording fake in tests)"
    - "A reply that carries metadata beside a '*' store's arbitrary keys wraps the values ({ values, rev }); a snapshot keyed by store names takes a sibling key no store name can be ('@rev')"

key-files:
  created:
    - src/common/types/ipc/storeChannels.json
    - src-tauri/src/store_policy.rs
    - src-tauri/src/store_native.rs
  modified:
    - src/common/types/storePolicy.ts
    - src/backend/storeVersioning/readOnlyStores.ts
    - src/backend/sidecar/readOnlyStoresNotice.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/sidecarInternal.ts
    - src/common/types/ipc/rustInvoke.ts
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/preload/tauriTransport.ts
    - src-tauri/src/native_router.rs
    - src-tauri/src/relay_commands.rs
    - src-tauri/src/rust_dispatch.rs
    - src-tauri/src/store_dispatch.rs
    - src-tauri/src/main.rs
    - src-tauri/src/log_upload.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/crates/gamelib-store/src/host.rs
    - src/backend/__tests__/nativeSeamPortComplete.test.ts

key-decisions:
  - "The fetch reply is { values, rev? }, not the values with a rev sibling: a '*' store's (timestampStore, wikigameinfo, gogSyncStore) top-level keys are arbitrary strings, so a sibling could collide; the preload unwraps values and 85-17 reads rev. The snapshot keeps its store-name keys and adds '@rev', which no store name ([A-Za-z0-9_-]) can be, so its ts-mode result stays the sidecar's, unchanged"
  - "Per-row ownership inside the native handlers: under rust a store whose row Rust owns is read from StoreHost, a row Rust never opens (store/migrations, excluded, D-07) is forwarded to store:ts-fetch / store:ts-snapshot; under ts (or with no home directory) every read is forwarded"
  - "An unknown or denied store name (humble_library) is refused with the IPC invalid-args marker before anything opens. snapshotGet gates on the allow-list first, so a legitimate renderer never fetches such a name and the refusal cannot loop"
  - "fontsStore is allow-listed and in the lazy tier but no store backs it: it resolves with no row and reads as empty (rev 0) under rust, as the sidecar answered {}"
  - "Under rust mode TS still flushes its read-only aggregate for its per-store log lines (send is a no-op) and hands its entries to Rust; the notice orders Rust's stores first, then TS's, first (area, reason) wins; an empty merge pushes nothing but spends the once-per-process flag"
  - "The renderer-supplied store name in the refusal line and the read error kind go through shell_log_detail (stderr only), so gamelib.log carries category text only (shellLogCategoryOnly)"
  - "readOnlyAreas uses byPrefix: [{prefix, area}] (humble_ and GamesConfig/) instead of the plan's single humblePrefix, because 85-15 added the GamesConfig/ prefix row; storeUniverse is derived (boot ∪ lazy) on both sides rather than stored, so it cannot drift"

patterns-established:
  - "A native channel's manifest valid vectors must be answerable by NativeCtx::for_tests (no home, no sidecar) without the invalid-args marker; argument validation runs before any configuration check"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "Tracer: sidecar:store-fetch is a native channel (slice store) answered from StoreHost with the policy-filtered values and the store's rev; TS's handler is the shell-only store:ts-fetch; one owner per channel"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_native (fetch_reads_a_rust_owned_store_filtered_with_its_rev, the_handler_answers_end_to_end_through_the_native_ctx, resolves_renderer_names_through_the_table, bad_names_are_the_invalid_args_marker)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell native_ (router keys equal the generated sets; manifest valid/invalid vectors)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/nativeSeamPortComplete.test.ts; src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts; pnpm check:ipc-contract"
        status: pass
    human_judgment: false
  - id: D2
    description: "Research Pattern 4 / D-01: under GAMELIB_STORE=ts every fetch and the snapshot are forwarded to the sidecar's renamed internal channels and nothing is opened in Rust; a row Rust never opens is forwarded under rust too; the store slice flag has a named exemption expiring in 85-21 and the flag scan is whole-word"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_native (ts_mode_forwards_every_read_and_never_opens_a_file, a_row_rust_never_opens_is_forwarded_under_rust_mode, snapshot_under_ts_mode_is_the_sidecar_result_unchanged, snapshot_takes_a_boot_store_rust_does_not_open_from_the_sidecar)"
        status: pass
      - kind: unit
        ref: "src/backend/__tests__/nativeSeamPortComplete.test.ts#the flag exemptions name only the store slice / the flag scan matches the flag as a whole word only"
        status: pass
    human_judgment: false
  - id: D3
    description: "One policy source: storeChannels.json read by storePolicy.ts, readOnlyStores.ts and store_policy.rs; every read, write, keyPath, cacheName and area vector passes in jest and cargo; refreshToken never readable or writable"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_policy (13 tests: every vector group, refresh token, prototype names, filter, pattern pin, tiers, closed area set)"
        status: pass
      - kind: unit
        ref: "src/backend/stores/__tests__/storePolicyVectors.test.ts; src/common/types/__tests__/storePolicy.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The boot snapshot under rust: every bootSetStores store from StoreHost, filtered (no __internal__, no refreshToken), each with its rev under '@rev'; the preload skips '@rev' and unwraps the fetch's values so rev never becomes a field"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_native::tests::store_native_snapshot_reads_every_boot_store_filtered_with_its_rev"
        status: pass
      - kind: unit
        ref: "src/preload/__tests__/tauriTransport.test.ts (snapshot with '@rev'; lazy fetch reply { values, rev } leaves no rev/values field)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-12: the read-only notice raised by Rust once per launch with the unchanged ids-only payload, TS entries merged and deduped; frontendReady under rust calls store_read_only_notice with the TS aggregate's entries, under ts keeps the TS push"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_native (the_notice_merges_dedupes_and_is_sent_once, an_empty_notice_pushes_nothing_but_still_uses_the_one_shot, bad_notice_args_are_refused_and_do_not_spend_the_one_shot)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/appShellFlows.test.ts#85-16: under rust mode frontendReady x2 hands the TS entries to store_read_only_notice once and pushes no notice itself; Phase 68 D-05 ts-mode case unchanged"
        status: pass
    human_judgment: false
  - id: D6
    description: "A live app boot actually hydrates the renderer from the Rust snapshot and shows the read-only notice from Rust on a profile with a newer store"
    verification: []
    human_judgment: true
    rationale: "No test drives the real webview and sidecar together; the cargo and jest suites prove each side against fakes. The 85 live gate (85-HUMAN-UAT.md) is where a running app is observed."

duration: 31min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 16: Renderer store reads served by Rust Summary

**The renderer's store fetch and boot snapshot are answered from the Rust StoreHost through one policy file (storeChannels.json) that TS and Rust both read and both test on the shared vectors, each result carrying the store's rev, with a per-row forward to renamed shell-only TS channels for GAMELIB_STORE=ts, and the read-only notice raised by Rust once per launch**

## Performance

- **Duration:** 31 min
- **Started:** 2026-11-22T00:53:49Z
- **Completed:** 2026-11-22T01:24:08Z
- **Tasks:** 3
- **Files modified:** 35 (3 created)

## Accomplishments

- `sidecar:store-fetch` is a native channel (slice `store`). `store_native.rs` resolves the renderer name through the store table's `tsNames` (or `store_cache/<name>`), refuses an unknown or denied name with the invalid-args marker, reads the Rust-owned file from `StoreHost` and answers `{ values, rev }` through `filter_store_snapshot`.
- `sidecar_store_snapshot` builds the boot set from `StoreHost` under `rust`, each store filtered, with the revs under `'@rev'`. Under `ts` it returns the sidecar's `store:ts-snapshot` result unchanged.
- One policy file: `storeChannels.json` holds what `storePolicy.ts` used to declare. `storePolicy.ts`, `readOnlyStores.ts` and `store_policy.rs` all read it, and every `storePolicyVectors.json` row passes in jest and in cargo.
- The read-only notice is raised by Rust: `store_read_only_notice` merges TS's entries with the host's, maps them to areas, de-duplicates them and pushes `readOnlyStoresNotice` once per process with the same payload as before.
- `nativeSeamPortComplete` now scans for the flag as a whole word and carries one named exemption (the store slice, until 85-21). The TS handlers are renamed to `store:ts-fetch` and `store:ts-snapshot`, which are shell-only.

## Task Commits

1. **Task 1 (tracer): sidecar:store-fetch answered natively from StoreHost with rev** - `833f27f79` (feat). The tracer was verified end to end with its automated `<verify>` (ipc contract, the two jest gates, the `store_native` and `native_` cargo filters, scoped rustfmt, prettier and codecheck) before Task 2 started.
2. **Task 2: one policy file for TS and Rust, and the boot snapshot built from StoreHost** - `1848addc1` (feat)
3. **Task 3: the read-only notice raised by Rust, and the plan-end gates** - `9c861466a` (feat)

**Plan metadata:** the docs commit that carries this file, STATE.md, ROADMAP.md and deferred-items.md.

## Files Created/Modified

See the frontmatter `key-files`. The three new files are `storeChannels.json` (the policy data), `store_policy.rs` (the port and its vector tests) and `store_native.rs` (the fetch, snapshot and notice handlers, 16 tests). `gamelib-store`'s `host.rs` gained `Store::snapshot_with_rev`, so a rev always names the state it was read with.

## Decisions Made

See `key-decisions`. One of them changes a wire shape. The fetch reply is `{ values, rev? }`, so `tauriTransport.ts` unwraps `values` (a deviation, below). Plan 85-17's stale-push guard reads `rev` from there and from `'@rev'` in the snapshot.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug avoided] A `rev` beside the values would have become a store field in the renderer**
- **Found during:** Task 1
- **Issue:** the renderer replaces a store's snapshot with the fetch result (`snapshot[store] = {...result}`). A `rev` key in that result would have become a readable field of every store, and for a `'*'` store it could collide with a real key.
- **Fix:** the fetch reply wraps the values (`{ values, rev? }`) and the preload unwraps them. The snapshot carries the revs under `'@rev'`, which no store name can be, and the preload skips that key. `tauriTransport.ts` and its tests were changed, although the plan did not list them.
- **Files modified:** `src/preload/tauriTransport.ts`, `src/preload/__tests__/tauriTransport.test.ts`, `src/common/types/sidecarTransport.ts` (`STORE_REV_KEY`)
- **Committed in:** `833f27f79`, `1848addc1`

**2. [Rule 3 - Blocking] The tracer needed the policy port before Task 2**
- **Found during:** Task 1
- **Issue:** Task 1 must return a policy-filtered snapshot, but the plan creates `store_policy.rs` and `storeChannels.json` in Task 2.
- **Fix:** both were created in Task 1, including the cargo vector tests. Task 2 then moved the TS side onto the JSON. Between the two commits the data briefly existed twice, as the TS literals and as the JSON.
- **Committed in:** `833f27f79`

**3. [Rule 3 - Blocking] Files the plan did not list**
- **Found during:** Tasks 1-3
- **Issue:** a new native channel needs its typing in `native.ts` (the ipcDomainCensus test e). The census total went from 289 to 290, the `sidecarInternal` fixture table and channel list changed, and `NativeCtx` gained `store_reads`, which `log_upload.rs`'s test rig builds. A new rustInvoke op needs its schema in `rustInvoke.ts` and the counts 122 to 123 in `rustInvokeSchemas.test.ts` and `tauriShellSource.test.ts` (plus the arm ledger). `store_dispatch.rs`'s drift test parsed `storePolicy.ts` text, so it was re-pinned to `storeChannels.json`. `runnerSliceRegistration.test.ts` builds AppShellFlowDeps, so it needed `storeMode`.
- **Fix:** each was updated in the commit that needed it. The snapshot channel's tests (`skeletonFlows`, `steamAuthFlows`, `storeLayer`, `rendererAllowList`) follow the rename.
- **Committed in:** all three

**4. [Rule 3 - Blocking] genIpcContract takes no length keywords**
- **Found during:** Task 3
- **Issue:** `z.string().min/max` and `z.array().max` in the `store_read_only_notice` schema made `gen:ipc-contract` fail (`unsupported JSON Schema keyword "minLength"`).
- **Fix:** the schema is strict on shape and on the reason enum. Rust bounds the key length (1 to 256) and the entry count (at most 1024), with tests.
- **Committed in:** `9c861466a`

**5. [Rule 2 - Privacy] Renderer text out of gamelib.log**
- **Found during:** Task 2 (the `shellLogCategoryOnly` gate)
- **Issue:** the snapshot's read-error line interpolated an error, and the fetch refusal echoed a renderer-supplied name.
- **Fix:** both lines go through `shell_log_detail`, so the detail reaches stderr only.
- **Committed in:** `1848addc1`

**6. [Plan detail] readOnlyAreas shape and storeUniverse**
- The JSON has `byPrefix: [{prefix, area}]` (`store_cache/humble_` and `GamesConfig/`) in place of the plan's single `humblePrefix`, because 85-15 added the `GamesConfig/` prefix. `storeUniverse` is derived on both sides (boot ∪ lazy) and is not stored.

---

**Total deviations:** 6 (1 bug avoided, 3 blocking, 1 privacy, 1 plan-detail). **Impact on plan:** the scope is unchanged. Each blocking item is something the plan's own gates (ipc contract, census and count tests, `shellLogCategoryOnly`, the generator) would have refused.

## Issues Encountered

- `pnpm find-deadcode` reports one new knip finding, `meta/harvestStoreCorpus.ts` `PASTE_PLACEHOLDER_PREFIX`. Another session introduced it in `d029be2cf` (85-02 fix) while this plan ran. This plan never touched that file. It is recorded in `deferred-items.md`. Every other plan-end gate passes: codecheck, lint (production PASS, tests PASS), backend-di-ceilings, planning-gates (12/12), check:ipc-contract, the full `cargo test --bin gamelib-shell` (687 passed), `npx jest src/backend src/common` (14689 passed), the store, sidecar and preload suites, and smoke:sidecar.
- Another session committed phase-84 fixes to the same `main` (`main.rs`, `gamelib-log`) during this plan. Only this plan's hunks were staged. `rustfmt --check src/main.rs` also walks the generated `ipc_contract.rs` and the pre-existing `store_embed/controls.rs`, so rustfmt was scoped to the files this plan wrote.

## Known Stubs

None.

## Threat Flags

None. The new surface (a native renderer channel and a rustInvoke op) is the plan's own T-85-40/41/42: names are resolved only through the table and the policy, every result is filtered, and both sides run the same vectors.

## User Setup Required

None.

## Next Phase Readiness

- 85-17 can build the write choke point on `store_policy.rs` (`is_writable_store_field` and `is_safe_key_path` are already ported and vector-tested) and the stale-push guard on `rev`: the fetch reply's `rev` and the snapshot's `'@rev'` map.
- 85-21 deletes `GAMELIB_STORE`, the ts forward in `store_native.rs`, the renamed TS handlers and the `FLAG_EXEMPTIONS` entry.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*

## Self-Check: PASSED
