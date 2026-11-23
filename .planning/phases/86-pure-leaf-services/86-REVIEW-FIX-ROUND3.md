---
phase: 86
fixed_at: 2026-11-23T00:00:00Z
review_path: .planning/phases/86-pure-leaf-services/86-REVIEW-ROUND3.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 86: Code Review Fix Report (Round 3)

**Fixed at:** 2026-11-23
**Source review:** `.planning/phases/86-pure-leaf-services/86-REVIEW-ROUND3.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-65 WR-66)
- Fixed: 2
- Skipped: 0

No IN-* item (IN-71 to IN-74) was touched, and nothing from `86-REVIEW.md` was touched.

Verification ran in the isolated worktree `/Users/graysonmitchell/Projects/GameLib/.claude/worktrees/agent-a8d6015e6866ee15a`
(branch `worktree-agent-a8d6015e6866ee15a`), not the main checkout. The worktree was created at `4e1af5463`, before the
round-3 review and the WR-04 async code existed, so it was first fast-forwarded to `main` (`e4271faac`). The
`gamelib-info` build needed no placeholder files under `build/` or `src-tauri/binaries/`, so none were created.

## Fixed Issues

### WR-65: the abandoned Keychain call holds no shutdown Registrant, so a cancelled `set_key` can be cut off mid-write

**Files modified:** `src-tauri/crates/gamelib-info/src/secrets.rs`, `src-tauri/crates/gamelib-info/tests/secrets.rs`
**Commit:** 6f9464397
**Applied fix:** `get_async` and `set_async` now make their Keychain call through a new private helper, `keychain_call`.
It registers an `info-keychain` shutdown registrant and moves it into the `spawn_blocking` closure, the same pattern
`spawn_sgdb_migration` uses, so the registrant lives exactly as long as the Keychain call really runs. When shutdown wins
`guarded`'s race, the op still answers `<op>:shutdown` at once and drops its `info` registrant, but the abandoned call
keeps the exit drain waiting for it within the one budget. Like the migration, the helper starts no new call once the
token is cancelled (answering `<op>:shutdown`). The four-op test
`a_parked_keychain_call_does_not_hold_an_op_past_shutdown` previously asserted `drain(500ms).is_empty()` while the source
was parked, which pinned the deviation in place. It now asserts:
- while the source is parked, `drain(200ms)` returns exactly `["info-keychain"]`, which also shows the op's `info`
  registrant is gone;
- after the source is released, `drain(2s)` is empty.

Against the pre-fix source the changed test fails (`left: [], right: ["info-keychain"]` for `info_itad_key_status`).
**Status:** fixed: requires human verification (shutdown behaviour; a live Force Quit with a Keychain prompt open is not
exercised).

### WR-66: `set_async` does not serialise writers, so two overlapping saves can leave the cache holding a value the Keychain does not

**Files modified:** `src-tauri/crates/gamelib-info/src/secrets.rs`, `src-tauri/crates/gamelib-info/tests/secrets.rs`
**Commit:** 589e5635b
**Applied fix:** before it invalidates, `set_async` now takes the slot's `fetch_async` lock, the one `get_async` already
used, and holds it through `finish_write`. Writes therefore land in the Keychain and update the cache in the same order.

Interaction with WR-65: a guard simply held in the async function would be released at the cancelled `await` while the
abandoned Keychain call kept running, so the next call on the slot could overlap it. To avoid that, `fetch_async` is now an
`Arc<tokio::sync::Mutex<()>>` taken with `lock_owned()`. `keychain_call` moves the owned guard into the blocking closure
next to the registrant and hands it back with the answer, so the caller still holds it through `finish_read` /
`finish_write`. On cancellation the guard is dropped only when the Keychain call returns. `get_async` uses the same path.

Deadlocks: none.
- Neither async form re-enters the lock.
- The only lock taken under it is the short `cache` std mutex.
- The blocking `get`/`set` use the separate `fetch` std mutex, so the two paths cannot deadlock. They also do not
  serialise against each other, as before this fix; only the boot migration uses the blocking forms.
- A waiter on the lock stays cancellable by shutdown (tokio's `lock` is cancel-safe, and `guarded`'s biased `select!`
  polls the token first).

New test `overlapping_async_sets_leave_the_cache_holding_what_the_keychain_holds` uses a source whose writes land first and
whose call then parks on a per-value gate:
1. Save A starts; its write lands and parks.
2. Save B starts.
3. The test releases B, then A.
4. It asserts the source holds "b" and `get_async` returns what the source holds.
5. It also asserts B never reached the source while A was still in it.

Without the fix the test fails deterministically (`left: Some("a"), right: Some("b")`, "the cache must hold what the
Keychain holds"). That was confirmed with the WR-65 commit in place and the WR-66 source change not yet applied.
**Status:** fixed: requires human verification (concurrency logic; covered by a deterministic interleaving test. No test
pins the guard surviving a cancelled op until the Keychain call returns.)

## Skipped Issues

None.

## Verification (ran in the worktree `agent-a8d6015e6866ee15a`, not the main checkout)

- `cargo test -p gamelib-info --features testing --test secrets`: 39 passed, 0 failed (38 before plus the new WR-66 test).
  Run 15 more times in a row: 15/15 green.
- `cargo test -p gamelib-info --features testing` (every unit and integration suite in the crate): all green, 0 failed.
- `cargo clippy -p gamelib-info --features testing --tests`: 0 warnings, 0 errors.
- `rustfmt --edition 2021 --check` over both changed files: clean.
- `gamelib-shell` was not rebuilt. The change is private to `SlotOwner` (no public signature changed), and
  `info_secrets.rs`'s `SecretSource` impl is untouched.
- No prettier check: only `.rs` files were written (plus this report, which is under the prettier-ignored `.planning/`).

---

_Fixed: 2026-11-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
