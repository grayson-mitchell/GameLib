---
phase: 86
fixed_at: 2026-11-23T00:00:00Z
review_path: .planning/phases/86-pure-leaf-services/86-REVIEW.md (plus 86-REVIEW-ROUND2.md for WR-64)
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 86: Code Review Fix Report

**Fixed at:** 2026-11-23
**Source review:** `.planning/phases/86-pure-leaf-services/86-REVIEW.md` and `86-REVIEW-ROUND2.md` (WR-64)
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (WR-01 WR-02 WR-03 WR-04 WR-21 WR-22 WR-61 WR-62 WR-63 WR-64)
- Fixed: 10
- Skipped: 0

CR-41, WR-41 and WR-42 were already fixed and were not touched. No IN-* item was touched.

Verification ran in the isolated worktree `/Users/graysonmitchell/Projects/GameLib/.claude/worktrees/phase-86-fix`
(branch `phase/86-review-fix`), not the main checkout. To build the `gamelib-shell` crate there, gitignored
placeholder files were created under `build/` and `src-tauri/binaries/` (the Tauri build script only checks they exist);
they are not in any commit.

## Fixed Issues

### WR-01: SlotOwner read cache can keep a stale key after a concurrent `set`

**Files modified:** `src-tauri/crates/gamelib-info/src/secrets.rs`, `src-tauri/crates/gamelib-info/tests/secrets.rs`
**Commit:** 1fe59191e
**Applied fix:** a successful write now bumps the slot epoch again (and clears the failure memo) before caching the
written value, so a read that began during the write cannot cache its older answer. New test
`a_read_that_overlaps_a_set_cannot_cache_the_older_key` interleaves one read inside one write with a gated source; it
fails without the fix (`left: "old", right: "new"`).
**Status:** fixed: requires human verification (concurrency logic; covered by a deterministic interleaving test).

### WR-02: ITAD price-cache `index` read-modify-write is not serialised

**Files modified:** `src-tauri/crates/gamelib-info/src/itad/cache.rs`, `src-tauri/crates/gamelib-info/tests/cache_view.rs`
**Commit:** af85c9090
**Applied fix:** a module-level `Mutex` (`write_lock`) held for the whole of `write_price_entry`, as `recent.rs` and
`overrides.rs` do. The lock is module-level because each op opens its own `CacheView`. New test
`concurrent_price_writes_for_different_keys_leave_every_entry_in_the_index` (8 threads x 25 keys) fails without the lock
(index held 38 of 200 keys) and passes with it.
**Status:** fixed: requires human verification.

### WR-03: values interpolated into request URLs without encoding

**Files modified:** `src-tauri/crates/gamelib-info/src/wiki/{mod,pcgw,agw,protondb,deck,gog_ctx}.rs`, `src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs`
**Commit:** 3f57a909f
**Applied fix:** new `is_numeric_id` helper. ProtonDB and Steam Deck answer `None` with no request for a Steam id that is
not all digits; the PCGW and AGW `wiki_text` step skips a page id that is not digits; the PCGW cargoquery GOG id and the
`gamesdb_release` / `gog_store_url` store and id go through `encode_uri_component`. Digit-only ids are unchanged, so every
86-06 golden still passes. Two new tests (`ids_that_are_not_digits_never_reach_a_request_url`,
`a_gog_id_and_a_store_name_are_encoded_into_their_urls`) fail without the change.

### WR-04: Synchronous Keychain read inside a guarded op cannot be cancelled by shutdown

**Files modified:** `src-tauri/crates/gamelib-info/src/{secrets,lib,steamgrid}.rs`, `src-tauri/crates/gamelib-info/src/itad/mod.rs`, `src-tauri/crates/gamelib-info/tests/secrets.rs`
**Commit:** 95badff10
**Applied fix:** took the review's primary option. `SlotOwner` (and `ItadKey`, `SgdbKey`) gained `get_async`, `set_async` and
`effective_async`, which run the `SecretSource` call on `tokio::task::spawn_blocking` behind a tokio `fetch_async` mutex and
share the cache and epoch logic with the blocking forms through `finish_read` / `finish_write`. `resolve_key`,
`key_status`, `set_key`, `stored_key`, `has_api_key` and `set_api_key` are now async and use them, so `guarded`'s `select!` can
see the shutdown token while the Keychain is parked. The blocking forms stay for the boot migration (its own bounded
thread). A read abandoned by shutdown finishes on its pool thread and is never cached. New test
`a_parked_keychain_call_does_not_hold_an_op_past_shutdown` parks the source for all four key ops and asserts
`<op>:shutdown` and a released registrant; it times out (fails) with the old synchronous call sites.
**Status:** fixed: requires human verification (async/shutdown behaviour; live Force Quit with a Keychain prompt open is not exercised).

### WR-21: Dev-vault file handling is racy and non-atomic

**Files modified:** `src-tauri/src/info_secrets.rs`
**Commit:** a28705392
**Applied fix:** items 1 and 2 fixed in code. Reads open with `O_NOFOLLOW`; writes go to a sibling temp file created with
`create_new` + `O_NOFOLLOW` + mode `0600`, `sync_all`'d and `rename`d over the vault (a planted link at the vault path is
replaced, not followed; no truncate-in-place window); the `0600` re-assertion now opens with `O_NOFOLLOW` and chmods
through the handle; a vault that does not parse makes a write refuse with `corrupt` instead of rebuilding from one slot
(a read still treats it as empty, as TS did). Tests: the old "corrupt vault repairs on next write" test now asserts the
refusal and that the file is untouched; new tests for a link planted after `create` (never read or written through) and
for no temp file left behind.
Item 3 (cross-process lost update with the TS sidecar vault) is NOT fixed in code: the TS vault does an unlocked
read-modify-write, so no Rust-side lock would be honoured. Recorded as a known limit in the module doc ("the two writers
must not save at the same moment"; dev-only), which is the review's own alternative.
**Status:** fixed: requires human verification (item 3 documented, not eliminated).

### WR-22: `getGameMetadataOverride` bound tighter than the crate's

**Files modified:** `src-tauri/src/info_dispatch.rs`
**Commit:** bf8d257a8
**Applied fix:** dropped the local 256 constant and reused `gamelib_info::recent::APP_NAME_MAX_UTF16` (1024), the bound
`info_overrides_set` / `info_overrides_get` and `parse_remove_recent` already use. The parser test now accepts 256, 257 and
1024 units and rejects 1025 (and 513 astral characters); the over-bound secret in the "validate first" test grew to stay over
the new bound.

### WR-61: fixtureRedaction scan floor is stale

**Files modified:** `src/backend/info/__tests__/fixtureRedaction.test.ts`
**Commit:** d4e9f140f (shared with WR-62, one file)
**Applied fix:** `FILE_FLOOR` 189 -> 900 (tree measured at 992 files). New test asserts every one of the eight slices
contributes at least one file across `golden`/`recorded`/`state`, and that each of the six `recorded/<slice>` directories
contributes (where tokens and headers live).

### WR-62: fixtureRedaction rules cover fewer secret shapes than the recorder redacted

**Files modified:** `src/backend/info/__tests__/fixtureRedaction.test.ts`
**Commit:** d4e9f140f
**Applied fix:** added rules for `Cookie`/`Set-Cookie` values (must be `REDACTED`), `x-api-key` and `api[_-]?key` fields, the
`access_token`/`refresh_token`/`id_token` fields, and `token`/`apikey`/`api_key`/token query parameters, each with a planted-value
self-test; header comment rewritten to list exactly what is covered and to say a secret under another name is not seen. The new
rules produce no false positive across the 992 committed fixtures.

### WR-63: the "crate bakes nothing" assertion scans 3 of about 25 crate source files

**Files modified:** `meta/__tests__/releaseItadKey.test.ts`
**Commit:** 417dd183b
**Applied fix:** walks every `.rs` under `src-tauri/crates/gamelib-info/src` with `walkStripped` (35 files) with a floor of
30, and applies the `option_env!` / `env!` / `env::var("` / `ITAD_API_KEY` bans to each. The review's claim that the
`[^_]env!\(` shape already excludes `env!("CARGO_MANIFEST_DIR")` was wrong for the multi-line uses in `runner_caps.rs` and
`itad/coverage.rs` (a leading space matches `[^_]`); the ban now uses `(?<![A-Za-z_])env!\((?!\s*"CARGO_MANIFEST_DIR")`.
Added a self-test that plants each violation and the allowed `CARGO_MANIFEST_DIR` form.

### WR-64: `requestRustInvoke` still optional on `ClearCacheDeps` and absent from `LegendaryUserDeps`

**Files modified:** `src/backend/utils.ts`, `src/backend/storeManagers/legendary/user.ts`, `src/backend/__tests__/clearCacheWiki.test.ts`
**Commit:** a85189b85
**Applied fix:** `ClearCacheDeps extends DialogBoxDeps, RustInvokeDeps` (required), `canClearWikiCache` deleted and
`clearCache` calls `clearWikiGameInfoCache` unconditionally, `LegendaryUserDeps` extends `RustInvokeDeps`. Every production
construction already supplied the transport (codecheck passes unchanged). The "no Rust transport" test was removed and
replaced by two `@ts-expect-error` assertions that a `ClearCacheDeps` / `LegendaryUserDeps` without the member does not
compile, so the omission is caught by `pnpm codecheck`. The existing 86-27 `runnerAuthFlows.test.ts` pass-through assertions
still cover the wiring.

## Skipped Issues

None.

## Verification (ran in the worktree `phase-86-fix`, not the main checkout)

- `cargo test -p gamelib-info -p gamelib-info-cli`: 406 passed, 0 failed.
- `cargo test -p gamelib-shell --bin gamelib-shell`: 815 passed, 0 failed, 2 ignored.
- `cargo fmt -p gamelib-info -- --check`: clean. `cargo fmt -p gamelib-shell -- --check`: only pre-existing diffs in
  `src/ipc_contract.rs` (not touched). `cargo clippy` shows no warning in any file changed here.
- jest (fixtureRedaction, releaseItadKey, clearCacheWiki, `src/backend/info`, `src/backend/sidecar`, `infoPortComplete`,
  `infoShimSchedule`, gog/legendary/nile store managers): 154 suites passed, 1 skipped; 3689 tests passed.
- `pnpm -s codecheck`: exit 0.
- `pnpm boundaries`: no dependency violations (1387 modules).
- `pnpm lint`: exit 1, ONE error, pre-existing and in a file this work did not touch:
  `src/common/types/ipc/wineTools.ts:6:3 'WineInstallation' is defined but never used` (Phase 87 wine change). 831 warnings, none new
  from the changed files.
- `pnpm backend-di-ceilings`: FAIL, pre-existing and unrelated: `shrank: lower src/backend/engine/__tests__/crossoverLocation.test.ts
  to 2 in this commit (jestMock baseline says 3)` (Phase 87 `feat(87-26)` shrank the mock count without lowering the baseline).
- `npx prettier --check` over every TS path written: clean.

---

_Fixed: 2026-11-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
