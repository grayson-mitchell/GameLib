---
phase: 85-store-host-config-and-versioned-migrations
plan: 13
subsystem: infra
tags: [typescript, rust, store, user-state-family, ownership, boot-migration, mirror-cell, store-frames]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-12 cache family flip and the family-flip pattern (one flag, ownership read on both sides); 85-11 MirrorCell, dotPath.ts, jest disk sink; 85-10 store frames and the shell frame worker; 85-09 StoreHost and store boot; 85-03 corpus with older-version library files"
provides:
  - "storeOwnership.json: families.user-state true (cache already true, no per-store override): all 26 user-state rows of storeTable.json are Rust-owned under GAMELIB_STORE=rust; store/migrations stays excluded"
  - "userStateFamily.test.ts (64 tests): every user-state row mirror-backed under rust and conf-backed under ts, migrations conf-backed in both modes, the three absolute-cwd stores resolve to <userData>/store/<name>.json, store/timestamp set -> frame -> bytes with integer keys first and equal to conf's, download-manager queue survives a fresh StoreRoot"
  - "store_boot.rs proofs: open_all with the shipped ownership migrates an older steam_library before the sidecar spawns (migrated == 1, backup == stored bytes, migrated bytes == corpus-expected), every one of the 14 older user-state corpus files does the same, and ts mode opens, migrates and backs up nothing"
affects: [85-14, 85-15, 85-16, 85-17, 85-18, 85-19, 85-20, 85-21]

plan_head_before: f2d3b4cb931a32511c106e7f2df6a9cec57e21e2
plan_head_after: ff56fd3f66d6d48620d79bf8163b6f5805e7c8a4
commits: 2

actuals:
  tokens: 7100
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "a family flip is the one-line flag plus a pin move on every test that named the previous state (tauriShellSource, storeOwnership, store_boot, cacheFamily)"
    - "a boot-migration proof plants a corpus `migrate` file at the row's own path, runs open_all with Ownership::embedded(), and compares the file, the backup and BootReport against corpus-expected"

key-files:
  created:
    - src/backend/stores/__tests__/userStateFamily.test.ts
  modified:
    - src/common/types/ipc/storeOwnership.json
    - src-tauri/src/store_boot.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/stores/__tests__/cacheFamily.test.ts
    - src/backend/stores/__tests__/storeOwnership.test.ts

key-decisions:
  - "store_backend.ts needed no change: the three stores with an absolute cwd (game-overrides, mac-arch, runs-for-me) build it from deps.root.userData, so conf and the mirror resolve to the same <userData>/store/<name>.json, and none of the 26 user-state stores passes `defaults`, so MirrorBackedStore's no-op reset() loses nothing"
  - "Boot proofs use Ownership::embedded() (the shipped file) instead of a hand-built ownership, so the cargo tests fail if the flag is ever flipped back"
  - "The plan's behaviour line says migrated == 1 for the named test; a second test covers all 14 older corpus files so every chained user-state row (steam/gog/legendary/nile libraries, gog installed, sideload library, download-manager) is proven, not one"

patterns-established:
  - "The family flip's pins: grep for the previous family set in tauriShellSource.test.ts, storeOwnership.test.ts, store_boot.rs and cacheFamily.test.ts before committing the flag"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "Every user-state row (26) builds a mirror-backed store whose writes are frames naming that row under the default mode and a conf-backed store that sends no frame under GAMELIB_STORE=ts; store/migrations is conf-backed in both modes; the embedded ownership file flips exactly cache and user-state"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/userStateFamily.test.ts#the user-state family (26 user-state rows)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_boot::tests::the_embedded_ownership_file_parses_and_flips_only_the_cache_and_user_state_families"
        status: pass
      - kind: unit
        ref: "mutation run by hand: families.user-state false made 29 of 63 userStateFamily cases fail"
        status: pass
    human_judgment: false
  - id: D2
    description: "store/timestamp end to end: an integer-like app key set through the TS store is one set frame, and the bytes equal JSON.stringify(stampedView, undefined, tab) with integer keys first and equal the bytes conf writes for the same edits"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "userStateFamily.test.ts#store/timestamp end to end: TS set -> frame -> bytes"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-12 at boot: an older-version library is migrated by Rust before the sidecar spawns, with a backup equal to the stored bytes and migrated bytes equal to the TS oracle's; ts mode opens no user-state row"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_boot (store_boot_migrates_older_library_before_spawn, store_boot_migrates_every_older_user_state_corpus_file, store_boot_ts_mode_opens_no_user_state)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Queue state survives a restart: download-manager's queue written through frames is present when a fresh StoreRoot over the same user-data dir loads it"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "userStateFamily.test.ts#queue state survives a restart"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-21: user-state writes carry sync_all (Rust); library, queue and override files are rewritten by the shell on the operator's real profile"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "gamelib-store host.rs durability_follows_the_store_kind asserts store_cache/steam_library and the other user-state kinds write Durability::Synced (85-09); nothing in this plan changes the durability mapping"
        status: pass
    human_judgment: true
    rationale: "No automated test joins a real shell and a real sidecar over a populated profile with the user-state family on; that is the macOS live gate of 85-20, and a wrong write here costs user data rather than a cache."

duration: ~8 min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 13: User-state family flipped to the Rust owner Summary

**The user-state family (26 rows: libraries, download queue, play history, overrides, mac-arch, runs-for-me, the Humble and Steam notice stores) is now Rust-written behind `GAMELIB_STORE`: one flag, byte parity proven for `store/timestamp` with integer keys first, older libraries migrated by `open_all` with a byte-exact backup before the sidecar spawns, and the queue surviving a restart.**

## Performance

- **Duration:** about 8 min (wall clock, 2026-11-21T23:49Z to 23:56Z; most of it the full gate runs)
- **Tasks:** 2 (one tracer, one TDD)
- **Files modified:** 6 (1 created)

## Accomplishments

- **The flip.** `storeOwnership.json` is `families: {cache: true, user-state: true, account: false, settings: false}`, no per-store override. Nothing in `store_backend.ts` had to change (see key decisions): conf and the mirror already resolve the same path for every user-state store, including the three with an absolute `<userData>/store` cwd, and none of them seeds `defaults`.
- **Every row both ways.** `userStateFamily.test.ts` builds every store through `createStores` and, for each of the 26 `family: user-state` rows, shows a write is a frame naming that row (file at `<userData>/<key>.json`) under the default mode, and no frame (conf writes the file) under `GAMELIB_STORE=ts`. `store/migrations` writes through conf with no frame in both modes and `isRustOwned` is false for it in both. With `families.user-state` set back to false by hand, 29 of 63 cases fail.
- **Tracer: `store/timestamp`.** Four `set` calls (two integer-like app keys, two string keys, mixed order) are four `set` frames with `JSON.stringify(value)` as `valueJson`; the file starts `{\n\t"7": ...,\n\t"1245620": ...`, equals `JSON.stringify(parsedDocument, undefined, '\t')` and equals the bytes the conf owner writes for the same edits.
- **Boot migration (D-12).** `store_boot_migrates_older_library_before_spawn`: with the shipped ownership, a v1 `steam_library` corpus file planted at `store_cache/steam_library.json` gives `opened 1, migrated 1, adopted 0, deferred 0`, the file holds the corpus-expected (TS oracle) bytes, exactly one `steam_library.v1.<stamp>.bak.json` sits beside it and equals the stored bytes, and `GAMELIB_STORE_BOOT` has nothing to report. `store_boot_migrates_every_older_user_state_corpus_file` runs all 14 older user-state corpus files (7 chained rows) the same way. `open_all` is at `main.rs:1859`, `spawn_sidecar_state` at `:1884`, so the TS mirror only loads current-version data.
- **ts mode.** `store_boot_ts_mode_opens_no_user_state` plants an older or baseline file for all 26 rows, opens with `StoreMode::Ts`, and sees zero opened, zero migrated, every file byte-identical and no new file in the tree; the same profile opened in rust mode opens 26+ and migrates 7+.
- **Queue survival.** `download-manager`'s `queue` set through frames is read back by a second `createStores` over a second `StoreRoot` on the same directory, and is in the file.

## Task Commits

1. **Task 1 (tracer): flip user-state, prove store/timestamp end to end, TS fallback, excluded migrations store** - `93adc2bf9` (feat)
2. **Task 2: boot migration of older user-state files, queue survival, plan-end gates** - `ff56fd3f6` (test)

`commits: 2` in the frontmatter is the measured `git rev-list --count plan_head_before..HEAD`.

**Plan metadata:** recorded in the docs(85-13) commit that follows this file.

## Verification

At the last code commit: `pnpm exec jest src/backend src/common` (650 suites passed, 3 skipped, 14628 tests passed); the plan's user-state suites (56 suites, 1569 tests); `cargo test --bin gamelib-shell` (645 passed, 0 failed) and `store_boot` (19); `rustfmt --edition 2021 --check src/store_boot.rs`; `pnpm smoke:sidecar` PASS; `pnpm codecheck`; `pnpm lint` (exit 0, 0 errors); `pnpm find-deadcode` PASS (311 baselined); `pnpm backend-di-ceilings` PASS; `pnpm planning-gates` 12/12; prettier `--check` over every written TS path (none prettier-ignored). Acceptance: `grep -c '"user-state": true'` storeOwnership.json = 1; `store_boot_migrates_older_library_before_spawn` appears in store_boot.rs; userStateFamily.test.ts iterates every user-state row and asserts `store/migrations` stays conf-backed.

Tracer gate: automated-only `<verify>` re-run and passed (tracer verified end-to-end, expanding), no checkpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Four tests pinned the cache-only ownership state**
- **Found during:** Task 1
- **Issue:** `tauriShellSource.test.ts` ("the ownership file flips only the cache family"), `storeOwnership.test.ts` ("reads the committed ownership file"), `store_boot.rs`'s embedded-ownership test, and `cacheFamily.test.ts` ("owns exactly the cache rows" and the `storeNew` "stays conf-backed while the family is not Rust's" case, which relied on the file having user-state false) failed by design once the family flipped. 85-12 hit the same class.
- **Fix:** pins moved to the two-family state (the `storeNew` conf-backed case now sets `families['user-state'] = false` for its length, restored in `afterEach`).
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`, `src/backend/stores/__tests__/storeOwnership.test.ts`, `src/backend/stores/__tests__/cacheFamily.test.ts`, `src-tauri/src/store_boot.rs`
- **Commit:** `93adc2bf9`

### Implementation choices the plan left open

- The plan allows touching `store_backend.ts` only if the absolute-cwd resolution differs between conf and mirror; it does not (the three stores join `deps.root.userData`), so the file is unchanged.
- The plan's D-11 list names the humble user-state stores loosely; the test iterates the table's 26 `family: user-state` rows instead and spot-checks 19 named keys.
- The plan's "Backend suites ... " gate list was run as written and the whole `src/backend src/common` jest run was added, since other suites construct user-state stores.
- The older-library cargo tests use `Ownership::embedded()` rather than a hand-built ownership so they fail if the flag moves.

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** none on the plan's goal.

## Known Stubs

None.

## Authentication Gates

None.

## Threat Flags

None. T-85-32 (byte parity proven by the timestamp test and the corpus oracle test from 85-03; sync_all per write unchanged from 85-09; backups before every non-identity migration; the ts fallback reads the same bytes at the same versions) and T-85-33 (backup byte-compared in every boot-migration test; `store boot:` summary counts `migrated`) are in place.

## Issues Encountered

- D5 above: no automated test runs a real shell against a real sidecar over a populated profile with user-state on; `smoke:sidecar` covers boot and exit with no Rust peer. That is 85-20's macOS live gate, and it matters more here than for the caches because these files are user data.
- A migrated library's key order and bytes are the TS oracle's by the corpus test; this plan adds the boot path (the host, not `open_file` directly) to that proof.

## Next Phase Readiness

Ready for 85-14. The family-flip pattern held a second time: flag plus pins. The account and settings families remain false; the `changed` wire event schema and the late-cell rev handshake are still 85-17's.

## Self-Check: PASSED

Created file exists (`src/backend/stores/__tests__/userStateFamily.test.ts`); commits `93adc2bf9` and `ff56fd3f6` are on HEAD.
