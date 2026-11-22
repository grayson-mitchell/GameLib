---
phase: 85-store-host-config-and-versioned-migrations
plan: 14
subsystem: infra
tags: [typescript, rust, store, account-family, ownership, keyring, token-bearing, file-modes, mirror-cell]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-13 user-state flip and the family-flip pin pattern; 85-11 MirrorCell (one cell per file path) and the jest disk sink; 85-09 StoreHost open path and Durability by kind; 85-03 corpus redaction rules for steam:v1:/humble:v1: values"
provides:
  - "storeOwnership.json: families.account true (cache, user-state already true; settings false; no per-store override): steam_store/config, humble_store/config, gog_store/config, nile_store/config and legendary_store/config are Rust-owned under GAMELIB_STORE=rust"
  - "host.rs tighten_token_paths: the tightenTokenPaths port on the Rust open path (0600 file, 0700 dir, only when group/other bits are set, unix only, `store tighten failed: <key> <error kind>` on error) with host::tighten_* tests"
  - "accountFamily.test.ts (25 tests): account rows mirror-backed under rust and conf-backed under ts, the two steam_store names on one cell and one file, interleaved frames in call order, bytes equal to conf's, ciphertext-shaped and unknown keys byte-identical across a re-save"
  - "main.rs keyring_names_are_pinned and gamelib-store-cli cli_never_reads_home_or_keychain: FND-07's automated half"
affects: [85-15, 85-16, 85-17, 85-19, 85-20, 85-21]

plan_head_before: 4f9502662e12b4eab485f5b2a68eff360b8f4153
plan_head_after: a63ed76fd9ae7db89fbb60ed20f22ddfc11eb39e
commits: 2

actuals:
  tokens: 8800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "token-path tightening runs in StoreHost::open_inner for any row with token_bearing, before the engine reads the file, so the boot sweep (open_row) and the strict entry (open_cache) both tighten"
    - "one-cell proof without reaching into private fields: a frame sink that never answers keeps every write pending, so one TS name reading the other's write proves the shared MirrorCell (two cells would each hold only their own pending ops)"

key-files:
  created:
    - src/backend/stores/__tests__/accountFamily.test.ts
  modified:
    - src/common/types/ipc/storeOwnership.json
    - src-tauri/crates/gamelib-store/src/host.rs
    - src-tauri/src/main.rs
    - src-tauri/crates/gamelib-store-cli/tests/cli.rs
    - src-tauri/src/store_boot.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/stores/__tests__/storeOwnership.test.ts
    - src/backend/stores/__tests__/userStateFamily.test.ts
    - src/backend/stores/__tests__/cacheFamily.test.ts

key-decisions:
  - "store_backend.ts needed no change for the account flip: none of the five account stores passes `defaults` (MirrorBackedStore's no-op reset() loses nothing), all resolve to <userData>/<dir>/config.json (mirrorCellFor's path check passes), and the registry keys cells by path, so steamConfigStore and steamBottleConfigStore already share one cell"
  - "The tighten tests live in a `host::tighten_tests` module so the plan's `cargo test -p gamelib-store host::tighten` filter selects them (a test inside `host::tests` has the path `host::tests::tighten_*`, which that filter would not match). One of the four runs on every OS, so the Windows leg reports 1 passed rather than 0"
  - "tighten_token_paths reports failures on stderr (`eprintln!`) because gamelib-store has no logger and stays env- and Tauri-free; the line carries the store key and io::ErrorKind only, as the TS original carried the basename and message"
  - "keyring_names_are_pinned asserts literals, not the constants: a rename of KEYRING_SERVICE or a slot's account fails it even if every other test is updated in step"
  - "cli_never_reads_home_or_keychain proves `untouched` as bytes plus mtime of everything outside the profile; access times are not asserted (APFS and most Linux mounts update atime lazily, so an atime check would be a green that proves nothing)"

patterns-established:
  - "A token-bearing account fixture in a test uses `steam:v1:REDACTED` / `humble:v1:REDACTED` placeholders, the corpus redaction's own replacement, never a generated ciphertext"

requirements-completed: [FND-06, FND-07]

coverage:
  - id: D1
    description: "The account family is Rust-owned behind the flag: every one of the five account rows (all TS names, both steam_store names included) writes a frame naming its row under GAMELIB_STORE=rust and no frame under ts; the embedded ownership file flips exactly cache, user-state and account"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "src/backend/stores/__tests__/accountFamily.test.ts#the account family (5 account rows)"
        status: pass
      - kind: unit
        ref: "cargo test --bin gamelib-shell store_boot::tests::the_embedded_ownership_file_parses_and_flips_the_cache_user_state_and_account_families"
        status: pass
      - kind: unit
        ref: "mutation run by hand: families.account false made 12 of 25 accountFamily cases fail"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-11: steamConfigStore and steamBottleConfigStore are one cell over one file: each reads the other's write while it is still unanswered, interleaved writes (isLoggedIn, bottleName, provisioned, nested userData.*) are frames in call order, and the file equals JSON.stringify(stampedView, undefined, tab) and the bytes conf writes for the same edits"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "accountFamily.test.ts#steam_store/config: steamConfigStore and steamBottleConfigStore are one cell over one file (D-11)"
        status: pass
    human_judgment: false
  - id: D3
    description: "T-85-34: a token-bearing file 0644 in a 0755 directory is 0600 in 0700 after open; owner-only modes are left alone; a non-token row and a missing file are skipped; Windows is untouched"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-store --lib host::tighten (4 passed on macOS)"
        status: pass
      - kind: unit
        ref: "mutation run by hand: removing the tighten call in open_inner made 2 of 4 fail"
        status: pass
    human_judgment: false
  - id: D4
    description: "T-85-36: ciphertext-shaped values (steam:v1:/humble:v1:) and an unknown nested key in steam_store and humble_store configs survive a re-save byte-identical, through the TS mirror and through the Rust host"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "accountFamily.test.ts#older profiles: ciphertext and unknown keys survive a re-save untouched (T-85-36)"
        status: pass
      - kind: unit
        ref: "host::tighten_tests::tighten_open_then_a_write_keeps_ciphertext_and_unknown_keys_byte_identical"
        status: pass
    human_judgment: false
  - id: D5
    description: "FND-07 automated half (D-10, D-14): the keyring service and the five slot-to-account names are pinned in the shell suite that runs on all three CI legs; the store CLI on a FakeHome leaves everything outside its profile untouched; neither store crate depends on a keyring crate"
    requirement: FND-07
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell keyring_names_are_pinned"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-store-cli cli_never_reads_home_or_keychain"
        status: pass
      - kind: command
        ref: "cargo tree -p gamelib-store -p gamelib-store-cli | grep -c keyring == 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "SC3: a signed v0.10 to signed Phase 85 upgrade keeps every credential with no new Keychain prompt, and account configs are rewritten correctly on a real profile"
    requirement: FND-07
    verification: []
    human_judgment: true
    rationale: "Only the D-08 live gate (85-20, signed artifacts, macOS) can show no Keychain prompt and every sign-in surviving; the Windows and Linux live checks ride with Phase 99 (RET-02). This plan proves only that the store side moves and renames nothing the Keychain is keyed by."

duration: 10 min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 14: Account family flipped to the Rust owner Summary

**The five account configs (steam_store, humble_store, gog_store, nile_store, legendary_store) are now Rust-written behind `GAMELIB_STORE`: the shared Steam file is one cell under both TS names, token-bearing files are tightened to 0600/0700 when Rust opens them, older ciphertext and unknown keys round-trip byte-identical, and the Keychain's service and slot names are pinned on all three CI legs with no keyring reach from store code.**

## Performance

- **Duration:** about 10 min (2026-11-22T00:00Z to 00:10Z; most of it the plan-end gate runs)
- **Tasks:** 2 (one tracer, one auto)
- **Files modified:** 10 (1 created)

## Accomplishments

- **The flip.** `storeOwnership.json` is `families: {cache: true, user-state: true, account: true, settings: false}`, no per-store override. `store_backend.ts` did not change (see key decisions).
- **Tightening ported (T-85-34).** `tighten_token_paths` runs in `StoreHost::open_inner` for a `token_bearing` row, before the engine reads the file: an existing file with group or other bits becomes 0600 and its directory 0700. It does nothing on Windows and skips a missing file or directory. On error it logs `store tighten failed: <key> <ErrorKind>` and the open goes on. Four `host::tighten_*` tests cover it.
- **One cell, one file (D-11).** `accountFamily.test.ts` uses a frame sink that never answers. A write through `steamConfigStore` is read through `steamBottleConfigStore` straight away, and the other way round, including a nested `userData.username` and a delete. Six interleaved writes through the two names become six frames in call order. The file equals the tab-serialised stamped view and the bytes conf writes for the same edits.
- **Ciphertext and unknown keys (T-85-36).** A steam_store or humble_store config holding `steam:v1:REDACTED` / `humble:v1:REDACTED` placeholders and an unknown nested key re-saves with only the changed key different. That holds in TS through the mirror and in Rust through the host.
- **FND-07's automated half.** `keyring_names_are_pinned` asserts these literals: `KEYRING_SERVICE == "com.gamelib.launcher"`, the default slot, and each of the five slots mapping to the account with the same name. Seventeen other slot names are refused: a fixed list plus three near-misses (trailing space, NUL suffix, path suffix). It runs in `cargo test --bin gamelib-shell`, which `rust-test.yml` runs on windows-latest, macos-latest and ubuntu-latest (line 86, step at line 225). `cli_never_reads_home_or_keychain` runs the CLI with its environment cleared and only FakeHome's variables set, over a profile holding both token-bearing configs. It asserts exit 0, that every byte and mtime outside the profile is unchanged (a Keychain database path, appData userData copies of the account configs, a dotfile, a real-HOME sentinel), and that the profile's account configs are unchanged too. `cargo tree -p gamelib-store -p gamelib-store-cli | grep -c keyring` is 0.

## Task Commits

1. **Task 1 (tracer): flip the account family, tightening on open, accountFamily.test.ts, pins moved** - `8708c1f8e` (feat)
2. **Task 2: keyring names pinned, CLI FakeHome-only proof, no keyring dependency, plan-end gates** - `a63ed76fd` (test)

`commits: 2` in the frontmatter is the measured `git rev-list --count plan_head_before..HEAD`.

**Plan metadata:** recorded in the docs(85-14) commit that follows this file.

## Verification

At the last code commit:
- **Jest:** `pnpm exec jest src/backend src/common` passed 651 suites (3 skipped) and 14653 tests. The account-touching suites (`src/backend/stores`, `storeManagers/{steam,legendary,nile,gog}`, `src/backend/humble`) passed 246 suites and 6179 tests. `accountFamily.test.ts` passed 25.
- **Rust tests:** `cargo test -p gamelib-store` (137 lib tests plus the integration binaries) and `--lib host::tighten` (4 passed) were green. `cargo test --bin gamelib-shell` passed 646 with 0 failed, `keyring_` passed 34, and `cargo test -p gamelib-store-cli` passed 9.
- **Rust lint and format:** `cargo clippy -D warnings` passed for gamelib-store and gamelib-store-cli. `cargo fmt --check` passed for both crates, and `rustfmt --check src/store_boot.rs` passed. `rustfmt --check src/main.rs` shows diffs only in generated `ipc_contract.rs` and the existing `store_embed/controls.rs`, and main.rs has none.
- **Gates:** `pnpm smoke:sidecar` PASS. `pnpm codecheck` exit 0. `pnpm lint` exit 0 (0 errors). `pnpm find-deadcode` PASS (311 baselined). `pnpm planning-gates` 12/12. `npx prettier --check` passed over every TS/JSON path written, and none is prettier-ignored.
- **Acceptance:** `grep -c '"account": true'` storeOwnership.json = 1. `fn keyring_names_are_pinned` = 1. `fn cli_never_reads_home_or_keychain` = 1.

Tracer gate: the `<verify>` is automated-only, so it was re-run and passed. The tracer was verified end to end before expanding, with no checkpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Five tests pinned the two-family ownership state**
- **Found during:** Task 1
- **Issue:** these tests all failed by design once the account flag flipped, the same class 85-12 and 85-13 hit:
  - `tauriShellSource.test.ts` ("flips only the cache and user-state families")
  - `storeOwnership.test.ts` ("reads the committed ownership file")
  - `store_boot.rs`'s embedded-ownership test
  - `userStateFamily.test.ts` (account false, and the owned-row predicate)
  - `cacheFamily.test.ts` (the owned-row predicate)
- **Fix:** moved the pins to the three-family state. The Rust test is renamed `the_embedded_ownership_file_parses_and_flips_the_cache_user_state_and_account_families`.
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`, `src/backend/stores/__tests__/storeOwnership.test.ts`, `src/backend/stores/__tests__/userStateFamily.test.ts`, `src/backend/stores/__tests__/cacheFamily.test.ts`, `src-tauri/src/store_boot.rs`
- **Commit:** `8708c1f8e`

### Implementation choices the plan left open

- The `host::tighten_*` tests sit in their own `host::tighten_tests` module so the plan's filter selects them (see key decisions).
- A Rust-side ciphertext test was added beside the TS one, so T-85-36 is proven on both writers and not only on the jest disk sink that stands in for the shell.

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** test pins only. No production code beyond the plan's files changed.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. The tightening only narrows file modes, and the new tests run on FakeHome with synthetic values. No token value, ciphertext or real Keychain content was read, printed or committed.

## Next Phase Readiness

Ready for 85-15 (the settings family). The settings flip moves the same pins again: `tauriShellSource`, `storeOwnership`, `store_boot`, `userStateFamily`, `cacheFamily` and now `accountFamily` ("is flipped by the family flag alone ... before settings" asserts `settings: false`).

## Self-Check: PASSED

- FOUND: src/backend/stores/__tests__/accountFamily.test.ts
- FOUND: 8708c1f8e (ancestor of HEAD)
- FOUND: a63ed76fd (ancestor of HEAD)
