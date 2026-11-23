---
phase: 86-pure-leaf-services
reviewed: 2026-11-23T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - meta/__tests__/releaseItadKey.test.ts
  - src-tauri/crates/gamelib-info/src/itad/cache.rs
  - src-tauri/crates/gamelib-info/src/itad/mod.rs
  - src-tauri/crates/gamelib-info/src/lib.rs
  - src-tauri/crates/gamelib-info/src/secrets.rs
  - src-tauri/crates/gamelib-info/src/steamgrid.rs
  - src-tauri/crates/gamelib-info/src/wiki/agw.rs
  - src-tauri/crates/gamelib-info/src/wiki/deck.rs
  - src-tauri/crates/gamelib-info/src/wiki/gog_ctx.rs
  - src-tauri/crates/gamelib-info/src/wiki/mod.rs
  - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs
  - src-tauri/crates/gamelib-info/src/wiki/protondb.rs
  - src-tauri/crates/gamelib-info/tests/cache_view.rs
  - src-tauri/crates/gamelib-info/tests/secrets.rs
  - src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs
  - src-tauri/src/info_dispatch.rs
  - src-tauri/src/info_secrets.rs
  - src/backend/__tests__/clearCacheWiki.test.ts
  - src/backend/info/__tests__/fixtureRedaction.test.ts
  - src/backend/storeManagers/legendary/user.ts
  - src/backend/utils.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
  necessity: 0
status: issues_found
---

# Phase 86: Code Review Report (Round 3, review-fix commits only)

**Reviewed:** 2026-11-23
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Scope was `git diff 876ca6bc5 6bee3d20b` (the ten review-fix commits). Verified by running, not by reading the fix
report: `cargo test -p gamelib-info --features testing --test secrets --test cache_view --test wiki_source_edges`
(all pass), the three jest suites (fixtureRedaction, releaseItadKey, clearCacheWiki: pass), and `tsc --noEmit` over
`src` (clean; `clearCacheWiki.test.ts` is in the tsconfig program, so the two `@ts-expect-error` assertions are real
compile-time checks).

Judgement per fix:

- WR-01 (epoch bump on write): correct. The interleaving test is not vacuous (without the bump the read that began
  after `invalidate` caches over the write). Covers the sync `get`/`set`; `finish_read`/`finish_write` are shared with
  the async forms.
- WR-02 (price-index lock): correct and complete. `write_price_entry` is the only index writer (`INDEX_KEY` has no other
  mutator in `itad/`), the lock is poison-tolerant, and no lock-order inversion exists (the lock is outermost, the
  `CacheView` locks are inner).
- WR-03 (URL ids): correct for the Steam and page ids; the ProtonDB and Deck callers only ever receive digit ids
  (`regexes::steam_id` is `[0-9]+`, gamesdb ids are numeric), so no real caller regresses. Two small leftovers are
  recorded as IN-73 and IN-74.
- WR-04 (async Keychain): the shutdown race now works and the four-op test is a real regression test, but the fix
  introduces two new problems (WR-65, WR-66).
- WR-21 (vault): items 1 and 2 are fixed as described and the `O_NOFOLLOW` / `create_new` / rename sequence is sound on
  Linux and macOS; Windows has no link defence but is no-op by design. Documentation and recovery edges are IN-72.
- WR-22: correct; one stale comment remains (IN-71).
- WR-61/62/63/64: correct. The `(?<![A-Za-z_])env!\(` lookbehind handles `option_env!` (caught by its own rule) and the
  multi-line `CARGO_MANIFEST_DIR` form; the floors sit under the measured 992 and 35; no rule false-positives on the
  committed tree.

## Warnings

### WR-65: the abandoned Keychain call holds no shutdown Registrant, so a cancelled `set_key` can be cut off mid-write

**File:** `src-tauri/crates/gamelib-info/src/secrets.rs:289-307` (also `get_async` 224-241)
**Issue:** Before WR-04 the whole op, Keychain call included, ran under `guarded`'s `info` registrant, so the exit drain
waited for an in-flight Keychain write. Now `set_async` hands the write to `tokio::task::spawn_blocking` with nothing
registered. When shutdown wins the `select!`, `guarded` returns `<op>:shutdown` and drops its registrant (the new test
asserts exactly this: `ctx.shutdown.drain(500ms).is_empty()` while the source is still parked), but the blocking closure
keeps running on a pool thread that nothing waits for. The process exits through the 5 s budget and can terminate that
thread mid-`set_password`/`delete`. The Rust shutdown contract in CLAUDE.md is "hold a `gamelib_core::shutdown::global()`
Registrant for in-flight work", and this crate's own `spawn_sgdb_migration` already does it correctly (the registrant is
moved into the `spawn_blocking` closure so it lives as long as the work, and the wait is abandoned after the bound). The
renderer is also told the write failed (`shutdown`) when it may in fact land afterwards. The shell's `KeyringSecretSource::set`
has no timeout (only `get` is bounded by `bounded_keyring_read`), so a write behind an open Keychain prompt is exactly the
case where this matters. Impact is low (an interrupted `SecItemAdd`/`SecItemDelete` is atomic at the OS level, and at
shutdown the renderer is gone), but it deviates from the stated contract and the test now codifies the deviation.
**Fix:** register once per call and move the registrant into the blocking closure, as the migration does:
```rust
let registrant = ctx.shutdown.register("info-keychain");
let outcome = tokio::task::spawn_blocking(move || {
    let _registrant = registrant; // held until the Keychain call really returns
    if value.is_empty() { source.delete(slot) } else { source.set(slot, &value) }
})
.await
.unwrap_or_else(|_| Err("unavailable".to_string()));
```
Do the same in `get_async` if reads should also be drained. Then change the new test to assert the registrant is released
only after the source is released (or after the drain budget), not immediately.

### WR-66: `set_async` does not serialise writers, so two overlapping saves can leave the cache holding a value the Keychain does not

**File:** `src-tauri/crates/gamelib-info/src/secrets.rs:289-307`, `309-327`
**Issue:** `get_async` takes `fetch_async`; `set_async` takes nothing. Two overlapping `set_async` calls (renderer retry
or double save while the first is parked behind a Keychain prompt, which is now plausible because the write no longer
blocks the op) each `invalidate()` and each `spawn_blocking` a write. The writes land in the Keychain in one order and the
two tasks are woken and run `finish_write` in whichever order the scheduler picks; the two orders are independent. If the
Keychain ends as "B" (B landed last) but `finish_write` for B ran before A's, the cache is left at "A" with `failed =
None`, and every read for the rest of the session returns A while the stored key is B (the stale value is also what
`stored_key`/`effective_async` hand to a request). The WR-01 epoch fix covers read-vs-write races only; it does not order
write-vs-write. The sync `set` had the same hole across threads, but WR-04 widens the window by turning each write into
a separate, independently scheduled pool task.
**Fix:** serialise writers with the lock the readers already use, so write order equals cache order:
```rust
async fn set_async(&self, ctx: &InfoCtx, op: &str, value: &str) -> Result<(), String> {
    let Some(source) = ctx.secrets.clone() else { return Err(format!("{op}:no-secret-source")); };
    let _writing = self.fetch_async.lock().await; // one Keychain call per slot at a time
    self.invalidate();
    // ... spawn_blocking as before ...
}
```
(The lock is released on cancellation, and a waiter is itself cancellable by the shutdown token.) Add a test with a gated
source that starts two `set_async` calls and releases them in reverse order, asserting `get_async` returns the value the
source holds.

## Info

### IN-71: `native.ts` still documents the old 256-unit bound for `getGameMetadataOverride`

**File:** `src/common/types/ipc/native.ts:69`
**Issue:** WR-22 raised the bound to `APP_NAME_MAX_UTF16` (1024) in `info_dispatch.rs`, but the channel's comment still reads
"The appName is 1 to 256 UTF-16 units." (The other 256-unit comments in that file describe different channels and are right.)
**Fix:** change to "1 to 1024 UTF-16 units".

### IN-72: the dev-vault doc overstates link handling, and a vault that fails to parse can never recover

**File:** `src-tauri/src/info_secrets.rs:20-24` (module doc), `info_secrets.rs:244-262` (`write_slot`), `write_owner_only`
**Issue:** The module doc says "a link planted at the vault path is replaced, not followed". In practice a write never
reaches the rename with a link at the path: `write_slot` calls `read_map_strict` first, whose `O_NOFOLLOW` open fails with
`read-failed`, so the write refuses (the new test asserts `is_err`, not replacement). The behaviour is safe but it is a
persistent write refusal, not a replacement; the doc and the test name disagree with it. Related edges of the new strictness:
(a) a zero-length or half-written vault (for example the sidecar's unlocked in-place write caught mid-way, or a file left by
the previous truncate-then-write code) is `corrupt` and every write then fails with `secret-corrupt` until someone deletes
the file by hand, with no hint in the error; (b) a crash between the temp file's creation and the `rename` leaves a
`.gamelib-dev-secret-vault.json.<pid>.<n>.tmp` holding plaintext credentials (mode 0600) in the shared temp directory, and
nothing sweeps them; (c) the temp file is fsynced but its directory is not.
**Fix:** correct the doc to say a link makes reads and writes refuse; treat a zero-length file as an empty store (or name the
file path category in the log line); sweep `.gamelib-dev-secret-vault.json.*.tmp` of the same pid prefix on `create`.

### IN-73: three of the new tests assert less than their names claim

**File:** `src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs:690-693`, `src-tauri/src/info_secrets.rs` (`a_vault_write_is_atomic_and_leaves_no_temporary_file`), `src-tauri/crates/gamelib-info/tests/secrets.rs:807-864`
**Issue:** (a) The Apple Gaming Wiki half of `ids_that_are_not_digits_never_reach_a_request_url` only asserts that no
`action=parse` URL exists; it has no positive control (no assertion that the `list=search` request was made, and no outcome
assertion as the PCGW half has), so a future change that stops reaching `wiki_text` for any reason keeps it green. (b) The
"atomic" vault test only proves no temp file is left behind; it does not exercise the rename-over path with a reader
(nothing would fail if `write_owner_only` went back to truncate-in-place). (c) The WR-04 shutdown test covers `key_status`,
`has_key` and the two setters, but not `effective_async` (the `search`/`deals` request path through `resolve_key`), which is
the call that actually sits before the first network `await` in the hot ops.
**Fix:** add `assert_eq!(urls(&agw_run).len(), 1)` and the outcome assertion; assert in the vault test that the inode (or
`mtime`) changes per write and that an open read handle taken before a write still parses; add an `info_itad_search` row to
the shutdown test using the `Stuck` source.

### IN-74: PCGW cargoquery GOG id is encoded but still not validated as digits

**File:** `src-tauri/crates/gamelib-info/src/wiki/pcgw.rs:185-188`
**Issue:** WR-03 made every other id in this change digits-only (`is_numeric_id`), but the GOG id in
`Infobox_game.GOGcom_ID HOLDS {id}` only goes through `encode_uri_component`. Encoding keeps the URL structure intact but the
id is decoded server-side into the Cargo `where` clause, so a caller-supplied `1 OR 1=1` still alters the query (read-only
public wiki, so the impact is a wrong lookup, not data exposure). A GOG product id is digits, so requiring it costs nothing
and matches the ProtonDB/Deck/page-id handling.
**Fix:** `if let Some(id) = gog_id.filter(|id| is_numeric_id(id)) { ... }` and fall through to the title search otherwise.

---

_Reviewed: 2026-11-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
