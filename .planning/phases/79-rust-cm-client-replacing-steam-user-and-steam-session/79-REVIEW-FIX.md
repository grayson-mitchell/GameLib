---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
fixed_at: 2026-11-16
review_path: .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-REVIEW.md
scope: all
iteration: 1
findings_in_scope: 45
fixed: 45
skipped: 0
status: all_fixed
extra_fixes: [QR → credentials → QR tab round-trip (c7bb124d3)]
follow_up_todos: [.planning/todos/pending/2026-11-16-remove-the-dead-guided-go-offline-dialog-chain.md]
---

# Phase 79: Code Review Fix Report

This report covers every finding left open by 79-REVIEW.md: 21 warnings and 23 info items, plus the slice C1 critical's follow-on and one extra bug. Both criticals were fixed before this run (7744eeb7f, 63b3b470e). Fixes were applied by one fixer per slice, one slice at a time; each slice report is reproduced below unchanged. Finding IDs are local to their slice.

| Pass | Findings | Result | Commits on main |
|---|---|---|---|
| A warnings (Rust crate) | A/WR-01..07 | 7/7 | 4f5855b0a..8fef8b6fe |
| B warnings (Rust shell) | B/WR-01..02 | 2/2 | 173cb4a1c, b7e83f9c0 |
| C1 warnings (Steam TS backend) | C1/WR-01..06 | 6/6 | 6791b7be7..7f224d976 |
| C2 warnings (sidecar + frontend) | C2/WR-01..06 | 6/6 | 694857f64..006a69396 |
| A+B info | A/IN-01..09, B/IN-01..06 | 15/15 | e420eda04..503e0a5b6, plus 2b4e8dae5 (A/IN-08, operator decision: accept and document) |
| C1+C2 info + QR bug | C1/IN-01..05, C2/IN-01..03, QR round-trip | 9/9 | b2425df75..c7bb124d3 |

C2/IN-03 was resolved by a tracking todo, not by removing the channel (the whole guided Go Offline chain is unreachable and its removal needs a keep-or-delete decision on the dormant Rust wrap).

**Still needs a live check** (no unit test can reach these): one boot, one QR sign-in and one credentials sign-in with phone approval. The dialog should close once, and exactly one Refresh should run. Also: a QR → credentials → QR switch shows a fresh code, the new Steam Guard error copy reads right, and a live sidecar kill shows the crash dialog after the reap. The fix entries marked "requires human verification" below are the ones these checks cover.


---

# Pass: A


# Phase 79 (slice A): Code Review Fix Report

**Fixed at:** 2026-11-16
**Source review:** .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-REVIEW.md, slice A, warnings A/WR-01 to A/WR-07
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (A/WR-01 to A/WR-07; A/CR-01 was already fixed in 7744eeb7f)
- Fixed: 7
- Skipped: 0

**Branch state:** the 7 commits are on `gsd-reviewfix/79-68521`, not on `main`. The fast-forward was refused because `main` gained 7 commits during the run (phase 80 docs and quick-261116-swr). None of those commits touch `src-tauri/`, so a rebase or merge should apply cleanly. The temp branch was kept for that merge.

**Verification, run on the final tree from `src-tauri/`:**
- `cargo test -p gamelib-steamcm`: 294 lib tests passed (3 ignored). The `golden` and other integration targets also passed.
- `cargo clippy -p gamelib-steamcm --all-targets -- -D warnings`: clean.
- `cargo fmt -p gamelib-steamcm --check`: clean.
- `cargo check -p gamelib-steamcm-cli`: clean.

Every commit was checked the same way before it was made. Every regression test below was run against the old code and failed there, except where a note says otherwise.

## Fixed Issues

### A/WR-01: The 150 s Refresh deadline is shorter than its stage bounds

**Files modified:** `src-tauri/crates/gamelib-steamcm/src/refresh/mod.rs`, `src-tauri/crates/gamelib-steamcm/src/refresh/capture.rs`
**Commit:** 90130e4ac
**Applied fix:**
- `capture_platforms_and_metacritic` now takes a `deadline`.
  - It reads in batches of `APP_BATCH_SIZE` (200).
  - Each read is bounded by `min(PICS_BULK_TIMEOUT, time left)`.
  - The held `run_op` is wrapped in an outer timeout, so its retry also ends by the deadline.
  - Batches answered before a failure or the deadline are kept, and the rest is reported as `failed`.
- `refresh_library` computes one deadline:
  - Capture runs until 5 s plus `ENRICH_STAGE_BUDGET` before it.
  - Enrichment gets `min(20 s, time until 5 s before it)`.
  - Only the owned-games step can still hit the hard timeout.

**Tests:**
- `refresh::tests::a_stalled_capture_keeps_the_library_inside_the_deadline`. It returned `{"kind":"timeout","ok":false}` on the old code.
- `capture::tests::reads_go_in_batches_and_answered_batches_survive_a_failure`. It was not run against the old code because the function signature changed. The old code sent one request for all 450 ids, so the batch-size assertion `[200, 200]` cannot hold there.
- `capture::tests::a_stalled_read_stops_at_the_deadline`. New behaviour, so there is no old-code equivalent.
- The 8 existing capture call sites in tests now pass a `far()` deadline.

**Status:** fixed: requires human verification. The budget split is a judgment call: capture is given priority up to the point where enrichment still gets its 20 s.

### A/WR-02: The licence list is captured once at logon and never updated

**Files modified:** `src-tauri/crates/gamelib-steamcm/src/backend.rs`, `src-tauri/crates/gamelib-steamcm/src/vent.rs`, `src-tauri/crates/gamelib-steamcm/src/session.rs`, `src-tauri/crates/gamelib-steamcm/src/fake.rs`
**Commit:** af5faee70
**Applied fix:**
- `Authed` gained a `license_updates` receiver.
  - In `connect_authed`, a forwarder task now keeps the `CMsgClientLicenseList` stream alive after the first list. It is registered with `VentConn`'s other tasks, so it is aborted along with them.
  - The actor selects on the receiver the same way it does `logged_off`, and each new list replaces `licenses`.
  - `install` sets the receiver and `close_conn` clears it.
- `Cmd::Licenses` no longer answers `Ok([])` when there is no connection:
  - during a rebuild it waits through a new `RecWaiter::Licenses`, which `finish_recovery` and `fail_recovery` both resolve;
  - with no connection and no recovery it returns `Replaced` or `Cm(Closed)`, matching `on_recover`.
- `FakeBackend` gained `send_license_list`.

**Tests (all failed on the old code):**
- `session::tests::a_licence_list_pushed_after_logon_replaces_the_cached_one`
- `session::tests::licences_during_a_rebuild_wait_for_the_new_connection` (old code returned `[]`)
- `session::tests::licences_with_no_connection_and_no_recovery_are_an_error` (old code returned `Ok([])`)

**Not unit-testable:** the real steam-vent forwarder in `vent.rs`. It needs a live CM connection, and the fake covers the actor side.

**Status:** fixed: requires human verification. A live check is worth doing: redeem a key, then Refresh inside the 60 s idle grace.

### A/WR-03: `tracing` diagnostics in owned_demos and macowned are silently dropped

**Files modified:** `src-tauri/crates/gamelib-steamcm/src/error.rs`, `src-tauri/crates/gamelib-steamcm/src/refresh/owned_demos.rs`, `src-tauri/crates/gamelib-steamcm/src/macowned.rs`
**Commit:** b7ff38617
**Applied fix:**
- All 6 `tracing::info!`/`warn!` calls now go through `crate::error::diag`. The messages are unchanged, and the `CmError` Debug they carry holds kinds only, no secrets.
- Added a test-only per-thread capture inside `diag` (`error::test_capture`), so tests can assert a line reached the sink. The production sink is first-call-wins and cannot be swapped per test.

**Tests (all failed on the old code):**
- `owned_demos::tests::a_demos_failure_reaches_the_diag_sink`
- `owned_demos::tests::a_demos_timeout_reaches_the_diag_sink`
- `macowned::tests::the_fallback_reason_reaches_the_diag_sink`

**Status:** fixed.

### A/WR-04: Acquiring with a different account's refresh token returns a lease on the old account

**Files modified:** `src-tauri/crates/gamelib-steamcm/src/session.rs`, `src-tauri/crates/gamelib-steamcm/src/webauth/mod.rs` (`jwt_sub` made `pub(crate)`)
**Commit:** c86cf832e
**Applied fix:**
- `on_acquire` compares the JWT `sub` of the stored token with the new one.
- When both can be read and they differ, it runs the sign-out path before logging on afresh:
  - bump `generation`;
  - clear leases and fail pending waiters with `NotSignedIn`;
  - kill in-flight ops with `LeaseUnknown`;
  - close the connection with cause `account-switch`.
- That path was pulled out of `Cmd::Logout` into `sign_out()`, which both now use.
- If either `sub` cannot be read, the old behaviour stays.
- The reviewer's other option, refusing the acquire, was not taken: a new token for another account means the user has switched.

**Tests:**
- `session::tests::acquire_with_another_accounts_token_relogs_on_and_fails_the_old_leases`. On the old code it got account A's steam_id.
- `session::tests::acquire_with_the_same_accounts_token_reuses_the_session`. This is a guard against needless re-logons and passes on both old and new code.

**Status:** fixed: requires human verification (session state logic).

### A/WR-05: A Web-API HTTP error without `x-eresult` (429/5xx) ends a sign-in

**Files modified:** `src-tauri/crates/gamelib-steamcm/src/webauth/mod.rs`
**Commit:** c0b065adb
**Applied fix:**
- In `call_inner`, a response with no `x-eresult` and a status of 429 or 5xx is now `WebAuthError::Network`. The poll loop already retries that until the flow deadline.
- A headerless 200 or other 4xx is still `Protocol("missing-x-eresult")`.
- A response that does carry `x-eresult` is still classified by the header. This is narrower than the reviewer's "any non-success status": if Steam sends an EResult, that EResult is kept.

**Tests (both failed on the old code):**
- `webauth::tests::headerless_429_and_5xx_are_network_errors`
- `webauth::tests::qr_poll_survives_a_headerless_429_and_503`

**Status:** fixed.

### A/WR-06: One malformed PICS buffer fails the whole product-info batch

**Files modified:** `src-tauri/crates/gamelib-steamcm/src/ops/pics.rs`
**Commit:** d1d283eb0
**Applied fix:**
- A buffer that `parse_app` or `packageinfo_to_json` rejects now gives an entry with `appinfo`/`packageinfo: null`, the same as the empty-buffer case from 79-33.
- Its id goes in `parseFailedApps`/`parseFailedPackages`. Both keys are emitted only when non-empty, so a clean reply keeps steam-user's exact shape and the parity goldens (`rust-results.json`, `expected.json`) are unchanged.
- One `diag` line records the counts.
- Transport errors still fail the batch.

**Tests:**
- `ops::pics::tests::a_malformed_buffer_fails_only_its_own_entry`. It replaces `parse_failure_propagates`, which pinned the old fatal behaviour.
- `ops::pics::tests::a_clean_batch_reports_no_parse_failures`

Both failed on the old code.

**Status:** fixed.

### A/WR-07: CDN server list is requested for cell 0, not the logon cell

**Files modified:** `src-tauri/crates/gamelib-steamcm/src/backend.rs`, `src-tauri/crates/gamelib-steamcm/src/vent.rs`, `src-tauri/crates/gamelib-steamcm/src/fake.rs`, `src-tauri/crates/gamelib-steamcm/src/ops/depot.rs`
**Commit:** 2b3e2e139
**Applied fix:**
- **Parity check:** the reviewer could not confirm the steam-user behaviour. It is confirmed against the patched copy at `node_modules/.pnpm_patches/steam-user@5.3.0`:
  - `components/cdn.js:34` sends `cell_id: this.cellID || 0`;
  - `components/09-logon.js:738` sets `this.cellID = body.cell_id`.
- Added `CmConn::cell_id()`, which defaults to 0.
- `VentConn` answers it from steam-vent's `Connection::cell_id()`, which the pinned rev fills from the logon response.
- `content_servers` passes it to `cdn_servers`.

**Test:** `ops::depot::tests::content_servers_asks_for_the_logon_cell`. On the old code the cell sent was 0 where 17 was expected.

**Status:** fixed.

## Notes for the orchestrator

- **Merge needed:** `main` does not have these commits yet; they are on `gsd-reviewfix/79-68521`. Fast-forward or rebase that branch onto `main` before running the slice B, C1 and C2 fixers.
- **graphify:** `graphify update .` was not run. It should run on `main` after the merge.
- **Untracked file:** this report is untracked in the main checkout, for the orchestrator to commit.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_


---

# Pass: B


# Phase 79 (slice B): Code Review Fix Report

**Source review:** 79-REVIEW.md, "# Slice B" → "## Warnings"
**Iteration:** 1
**Scope:** B/WR-01 and B/WR-02 only. The Slice B info items (IN-01..IN-06) are out of scope (`critical_warning`).

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### B/WR-01: T-79-104 helper-path guard is bypassed by `steamcm_refresh` and checks only the file name

**Files modified:** `src-tauri/src/steamcm_dispatch.rs`, `src-tauri/src/steampoll_dispatch.rs`
**Commit:** 173cb4a1c
**Status:** fixed

**Finding confirmed.** When the new refresh test ran against the old handler, it returned `macFallback / helper-failed` for `helperPath: "/bin/sh"`. This means the shell really spawned `/bin/sh` through `steamcm_refresh`.

**Applied fix:**
- One guard, `helper_path_ok`, now serves both channels. It keeps the old shape checks: absolute, no `..`, basename `steam-bridge-helper`. It also requires that `canonicalize(helperPath)` equals `canonicalize(bundled helper)`.
- The bundled path is resolved the way `appPaths.ts` resolves it: `<app root>/<public|build>/bin/<arch>/darwin/steam-bridge-helper`. That logic was factored out of `install_steampoll_host` into `bundled_bridge_helper_path(app)`, and `install_steamcm_host` stores the result in a `OnceLock`. If no bundled path is known (off macOS, or in unit tests), nothing passes.
- `rpc_steamcm_refresh` now parses its args and refuses a `macSteam` source whose `helperPath` is missing or fails the guard, returning `steamcm_refresh:bad-args`.
- Behaviour impact: `tryMacSteamRefresh` treats a thrown transport error as a fallback, so a refused refresh drops to the CM path. It does not fail the Refresh. `steamcm_mac_owned_apps` has no production caller.

**Tests added (`steamcm_dispatch::tests`):**
- `refresh_refuses_a_mac_steam_source_naming_anything_but_the_bundled_helper` covers `/bin/sh`, a planted `/tmp/x/steam-bridge-helper`, `""` and a missing `helperPath`. **It fails on the old code.**
- `mac_owned_apps_refuses_anything_but_the_bundled_helper_path` gained the planted `/tmp/x/steam-bridge-helper` case. **It fails on the old code**, which returned `fallback / helper-missing` instead of `bad-args`.
- `helper_path_must_resolve_to_the_bundled_helper_not_just_share_its_name` tests the pure function on real temp files: bundled passes, a planted same-name copy fails, no bundled path known fails, wrong name fails. It cannot compile on the old code because the function is new.

**Verification:** passed. `cargo test -p gamelib-shell` ran 472 tests and all passed.

### B/WR-02: On exit, the owed record is cleared on a detached open that may never run

**Files modified:** `src-tauri/src/steamcm_dispatch.rs`, `src-tauri/crates/gamelib-steamcm/src/wrap.rs` (test only)
**Commit:** b7e83f9c0
**Status:** fixed

**Finding confirmed.** `open_steam_url` is the only confirmation the `Shutdown` trigger gets: `restore_inner` has no `LogWatch` there and calls `clear_owed` on `true`.

**Applied fix:**
- I took the reviewer's first option. The open still runs on a worker thread, because `open_url` can block behind an OS dialog (D-UAT-19).
- `open_steam_url` now waits on a channel for up to `STEAM_URL_OPEN_BOUND` (2 s) and returns `true` only if the opener returned `Ok`. A failed or late open returns `false`, so the record is kept as `KeptProbeFailed` and the next boot retries it with a confirmed restore.
- `tauri-plugin-opener`'s `open_url` uses `open::that_detached`, which returns once `/usr/bin/open` is spawned. A spawned child survives the shell's exit, so waiting for `Ok` is enough.
- `ShellWrapHost` now holds an injected opener closure, built from the `AppHandle` in `ShellWrapHost::new`, instead of the `AppHandle` itself. This lets the tests drive it.
- The 2 s wait sits inside the existing 5 s `STEAMCM_SHUTDOWN_BOUND` on the exit path.

**Tests added:**
- These are in `steamcm_dispatch::tests`. I checked them against the old fire-and-forget semantics by using the same injected opener and returning `true` right after the spawn:
  - `open_steam_url_reports_true_only_after_the_open_was_issued`: **fails on the old semantics**.
  - `open_steam_url_reports_false_when_the_open_fails`: **fails on the old semantics**.
  - `open_steam_url_reports_false_when_the_open_outlasts_the_bound`: **fails on the old semantics**.
  - `open_steam_url_refuses_any_other_url_without_calling_the_opener`: guard check, passes on both.
- `wrap::tests::shutdown_restore_keeps_the_record_when_the_open_is_not_issued` (crate) pins the contract the shell fix relies on: on `Shutdown`, a not-issued open gives `KeptProbeFailed` and keeps the record. This was already the crate's behaviour but had no test, so it passes on the old code too. Supporting it needed one new field on the test `FakeHost`, `refuse_open`.
- **Not unit-testable:** the full exit path (`handle_exit` → `process::exit` racing the opener thread). It needs a real Tauri runtime and Mac Steam.

**Verification:** passed. `cargo test -p gamelib-shell` ran 472 tests and all passed. `cargo test -p gamelib-steamcm` ran 295 tests and all passed (3 ignored).

## Verification (both fixes, run from src-tauri/)

| Check | Result |
|-------|--------|
| `cargo test -p gamelib-shell` | 472 passed, 0 failed, 2 ignored |
| `cargo test -p gamelib-steamcm` | 295 + 2 + 1 passed, 0 failed |
| `cargo clippy -p gamelib-steamcm --all-targets -- -D warnings` | clean |
| `cargo clippy -p gamelib-shell --all-targets -- -D warnings` | Fails on the existing baseline only, in files these fixes did not touch: devtools.rs, humble_open.rs, invite_picker.rs, single_instance.rs and others. Zero diagnostics in `steamcm_dispatch.rs` or `steampoll_dispatch.rs`. |
| CI clippy ratchet (`cargo clippy --workspace --all-targets --message-format=json` + `meta/clippyRatchet.cjs`) | PASS (darwin, toolchain 1.99.1), with every ceiling unchanged |
| `cargo fmt -p gamelib-steamcm --check` | clean |
| `rustfmt --edition 2021 --check` on the two touched shell files | clean |

`cargo fmt -p gamelib-shell` is **not** clean on the baseline: running it reformats about 26 untouched shell files. So I checked format only on the touched shell files, and reverted the unrelated reformatting before committing.

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_


---

# Pass: C1


# Phase 79: Code Review Fix Report (slice C1 warnings)

**Fixed at:** 2026-11-16
**Source review:** .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-REVIEW.md (section "# Slice C1", "## Warnings")
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (C1/WR-01 to C1/WR-06; C1/CR-01 was already fixed in 63b3b470e)
- Fixed: 6
- Skipped: 0

All commits are on `main` (fast-forwarded from b7e83f9c0). Every new regression test was run against the pre-fix source and fails there, except where noted as a guard against over-correction.

**Verification for the whole run:** `pnpm tsc --noEmit` is clean. eslint shows 0 errors on the touched files (the remaining warnings were already there). `npx prettier --check` is clean over every touched path. `jest src/backend src/frontend/screens/Login` fails only in suites that fail on the base commit b7e83f9c0 too: shimCoverage, shimGenerate, tauriShellSource, flowRegistrationCensus, ipcDomainCensus and epicOfflineMode. `dxvkInstallRemove` failed once under full-suite load and passes on its own (25/25).

## Fixed Issues

### C1/WR-01: The Rust Refresh snapshots install state before a call of up to 150 s, then overwrites the library with that stale snapshot

**Files modified:** `src/backend/storeManagers/steam/library/rustRefresh.ts`, `src/backend/storeManagers/steam/__tests__/library.rustRefresh.test.ts`, `src/backend/storeManagers/steam/__tests__/library.refresh.rust.test.ts`, `src/backend/sidecar/__tests__/skeletonFlows.test.ts`
**Commits:** 6791b7be7 (fix), 4be0dc613 (sidecar test follow-up)
**Applied fix:**
- After the op, `applyRustRefreshResult` re-reads the ACF install state. The read is split out as `readInstallState`, shared with `buildRustRefreshInputs`.
- It then compares each app's install inputs between the snapshot and now: native, bottle and bridge entries, incomplete membership, and the resume breadcrumb taken from the live library just before `clear()`, with no await in between.
- Only apps whose inputs changed get their `is_installed`/`install` rebuilt. The rebuild uses the same rules as `assemble.rs`, through the existing `isBridgeAuthoritativeForInstallState`, `installPlatformForSource` and `installVersionField`. Apps that did not change keep Rust's fields.
- If the re-read fails, the snapshot is kept and the Refresh does not fail. The Mac Steam path gets the same overlay.
- The re-read adds a second `steampoll_status` round trip. The sidecar skeleton read-flow test now answers it; without that, it hung at apply.

**Tests added:** five `applyRustRefreshResult` cases:
- install finished during the op (fails on old code);
- uninstall during the op (fails on old code);
- breadcrumb from an install started during the op (fails on old code);
- unchanged app keeps Rust's fields (guard);
- re-read failure keeps the snapshot (guard).

There is also one end-to-end `refresh()` case, where the first scan is empty and the second is installed (fails on old code).
**Verification:** passed. Library suites 159/159, skeletonFlows 17/17. Status `fixed: requires human verification`, because this is state-merge logic.

### C1/WR-02: Signing out during sign-in finalisation brings the signed-out account back

**Files modified:** `src/backend/storeManagers/steam/userSignIn.ts`, `src/backend/storeManagers/steam/userSignInState.ts`, `src/backend/storeManagers/steam/__tests__/userSignIn.rustEngine.test.ts`
**Commit:** 1c3a7c0dc
**Applied fix:**
- `finalizeRustSignIn` checks that its slot is still the live session, both before and after `setToken`.
- If the slot was superseded, it clears the token it just stored, commits nothing and throws `SignInSupersededError`.
- The commit (`isLoggedIn`, `credentialsMissing`, `noteSignInSucceeded`) runs synchronously right after that check.
- After the commit, only a real sign-out skips the `userData` write. `SteamSignInState` gains `getSignOutCount()`, which `resetSignInState()` bumps. A newer sign-in attempt that drops the slot (the window's QR restart) does not undo an account that is already signed in.

**Deviation from the review's sketch:** the review fences on slot identity everywhere. I fenced on slot identity before the commit and on the sign-out count after it. Otherwise a QR restart landing during the persona logon would leave `isLoggedIn=true` with no `userData`.
**Tests added:**
- sign-out while the token is being written: the token is cleared after `setToken`, there is no `isLoggedIn`, no persona logon and no `userData` (fails on old code);
- sign-out during the persona logon: no `userData` (fails on old code);
- newer attempt after the commit still writes `userData` (guard).

**Verification:** passed. Status `fixed: requires human verification` (concurrency logic).

### C1/WR-03: One failed status read permanently fails the sign-in and orphans a live Rust flow

**Files modified:** `src/backend/storeManagers/steam/userSignIn.ts`, `src/backend/storeManagers/steam/userSignInState.ts`, `src/backend/storeManagers/steam/__tests__/userSignIn.rustEngine.test.ts`
**Commit:** 45c629950
**Applied fix:**
- A rejected `steamcm_signin_status` read now reads as `waiting`.
- A per-slot `readFailures` counter is reset by any successful read.
- After 3 consecutive failures (`STATUS_READ_FAILURE_LIMIT`), the Rust flow is cancelled with `fireAndForgetCancel` and the read returns `{status:'error', reason:'statusReadFailed'}`.
- The warning log now carries the failure count. It still logs no secrets.

**Tests added:** four cases, all of which fail on old code:
- QR: one failure, then done finishes the sign-in;
- non-consecutive failures never give up;
- credential poll gives up after 3 in a row and cancels the flow;
- guard-submit wait rides out one failure.

**Verification:** passed.

### C1/WR-06: `pollQRLogin` and `pollCredentialLogin` block on the whole persona logon, so overlapping 2 s polls each finish the sign-in

**Files modified:** `src/backend/storeManagers/steam/userSignIn.ts`, `src/backend/storeManagers/steam/__tests__/userSignIn.rustEngine.test.ts`
**Commit:** da637a021
**Applied fix:**
- The polls no longer await finalize. On `done`/`finalizing`, a poll sets the session state to `{status:'done'}` (no username) and returns at once. This only happens while the state is still `waiting`, so an overlapping poll cannot erase a username that has already been recorded.
- `finalizeInBackground` starts the memoised finalize. Only the caller that created it records the outcome (`done`+username or `error`) when it settles, and only while the slot is still the live session.
- A later poll returns the username. This is the "done without username, keep polling" contract the window already implements.
- `rustWaitSettle`'s state writes are fenced the same way. The guard-submit and credential-start calls still await finalize, because they are single calls and not interval polls.
- The frontend interval guard is left to slice C2 (C2/WR-01).

**Tests added:** four new cases:
- three overlapping QR polls during a pending persona logon all return `{status:'done'}` with one acquire, and a later poll carries the username;
- the same for the credential poll;
- a failed finalisation turns the next poll into `error`;
- a finalize that settles after a newer attempt leaves the new attempt's state alone.

Three of these fail on old code by timing out, and the fourth fails on its result. Four existing tests were updated to the new contract: first poll `{done}`, then a flush, then the username.
**Verification:** passed. userSignIn 24/24, steamAuthFlows and the Login screen suites 282/282. Status `fixed: requires human verification`: the poll contract changed, so one live sign-in run (QR and credential with phone approval) should confirm the window dismisses once and starts one Refresh.

### C1/WR-04: Store enrichment snapshots the metadata entry before the network fetch and writes it back without checking

**Files modified:** `src/backend/storeManagers/steam/gameMetadata.ts`, `src/backend/storeManagers/steam/__tests__/gameMetadata.rust.test.ts`
**Commit:** 6092bc6eb
**Applied fix:**
- `enrichOnce` takes a JSON snapshot of the entry before `steamcm_store_enrich`.
- Under `withPlatformCaptureLock`, it writes the entry, the library entry and the push only if the store still matches the snapshot.
- A stale merge is re-run once on the fresh entry and the live library entry (`ENRICH_ATTEMPTS = 2`). If the entry is still stale, nothing is written and a warning is logged.
- I used a JSON snapshot and not `structuredClone` + `isDeepStrictEqual`. Under jest the clone comes from another realm, so the deep-equal check never matched. Store entries are persisted JSON, so the text form is a faithful copy.

**Tests added:**
- a Refresh capture written during the fetch is not clobbered, and the merge is re-run on the captured entry;
- an entry that keeps changing gives up without writing;
- the check and the write run inside the lock.

All three fail on old code.
**Verification:** passed. gameMetadata and metadataCapture 39/39.

### C1/WR-05: Verifying an ambiguous redeem can report success for a key that did not redeem

**Files modified:** `src/backend/storeManagers/steam/cm/SteamCmClient.ts`, `src/backend/storeManagers/steam/cm/RustCmClient.ts`, `src/backend/storeManagers/steam/cm/liveLeaseClient.ts`, `src/backend/storeManagers/steam/rustSession.ts`, `src/backend/storeManagers/steam/userRedeem.ts`, `src/backend/storeManagers/steam/depot/plan.ts`, `src/backend/storeManagers/steam/__tests__/userRedeem.rustEngine.test.ts`, `src/backend/storeManagers/steam/__tests__/user.rustEngine.test.ts`, `src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts`
**Commit:** 7f224d976
**Applied fix:**
- `SteamCmClient.licenses` is now `SteamCmLicense[] | null`, where null means unknown. `buildClient` sets null when `steamcm_licenses` fails and logs the failure kind. `liveLeaseClient` returns null with no lease.
- `redeemOnce`: an ambiguous redeem whose pre-redeem list is unknown fails at once with `redeem-failed`. It does not take a verification lease.
- `verifyAmbiguousRedeem`: if the verification lease's list is unknown, the redeem fails.
- `getOwnedSets` (depot plan) throws "the Steam licence list could not be read" and no longer reads the list as owning nothing. `withPlanBuildRetry` retries it like any other plan-build failure.

**Tests added:**
- ambiguous redeem with an unknown pre-redeem list: error and a single acquire (fails on old code);
- verification lease with an unknown list: error (guard);
- `acquireAuthenticated` with a failed licence read gives `licenses === null` (fails on old code);
- `buildDepotRefs` with null licences rejects as unreadable (fails on old code).

**Verification:** passed. Steam and sidecar suites green apart from the baseline failures listed above.

## Notes for the caller

- **For slice C2 (frontend), connected to WR-02 and WR-06:**
  - The window's 110 s QR auto-refresh timer is not cleared when a poll returns `done` without a username.
  - If that timer fires during finalisation (an approval late in the session plus a slow persona logon), `startQRLogin` drops the slot. The backend still completes the sign-in once the token is committed; only a drop during the token write itself discards it.
  - The problem is that the window is then polling the new flow, so it never sees the old sign-in's username.
  - The fix is a frontend change: clear `qrRefreshTimerRef` on the first `done`.
- **WR-01 cost:** the Refresh now does one more ACF scan and one more `steampoll_status` read after the op. That is milliseconds, the same order as the pre-79 sync.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_


---

# Pass: C2


# Phase 79: Code Review Fix Report (slice C2 warnings)

**Fixed at:** 2026-11-16
**Source review:** .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-REVIEW.md (section "# Slice C2", "## Warnings")
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (C2/WR-01 to C2/WR-06)
- Fixed: 6
- Skipped: 0
- The C1 handoff item (clear the 110 s QR auto-refresh timer on the first `done`) is fixed under C2/WR-05.

All commits are on `main`. The branch was rebased onto e5aef0712, which includes phase-80 commits that landed during the run, and then fast-forwarded. Each new regression test was run against the pre-fix source and fails there, except the cases marked "guard", which protect against over-correction.

**Verification for the whole run (after the rebase):**
- `pnpm tsc --noEmit` is clean.
- eslint shows 0 errors on every touched file. The 3 warnings in SteamLogin/index.tsx were already there.
- `npx prettier --check` is clean over every touched path.
- `pnpm build:sidecar` succeeded, and `pnpm smoke:sidecar` passes: READY written, exit 0 on stdin EOF.
- `jest src/backend src/frontend` fails only in suites that also fail on base:
  - the six known baseline suites: shimCoverage, shimGenerate, tauriShellSource, flowRegistrationCensus, ipcDomainCensus, epicOfflineMode;
  - themeTokens, which I confirmed fails on main.
  - sharedRedistInstall failed once under full-suite load and passes on its own (62/62).
- The meta suites callbackRegistryHost, gamelibCatalogParity, genI18nGateScope, lintTranslations and steamLineCeiling also fail on main e5aef0712 without these commits.
- hardcodedStringGate passes (see the C2/WR-02 follow-up below).
- No Rust was changed, so no cargo, clippy or rustfmt run was needed.

## Fixed Issues

### C2/WR-01: Guard-code retry restarts the credential poll after an await without a mounted/active check

**Files modified:** `src/frontend/screens/Login/components/SteamLogin/index.tsx`, `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx` (new)
**Commit:** 694857f64
**Applied fix:**
- Each credential attempt now has a counter, `credAttemptRef`. It is bumped by:
  - a new credential submit;
  - Back to Credentials;
  - a tab change;
  - unmount.
- `handleGuardSubmit` and `handleCredentialSubmit` capture the counter before their await. They restart the poll or move the step only if the attempt is still live. A `done` still signs in, because the backend is already signed in at that point.
- The credential poll has a generation, `credPollGenRef`, which `clearCredPollInterval` bumps. A tick that resolves after its interval was cleared drops its result. This adds the frontend interval guard that C1/WR-06 deferred to this slice: overlapping ticks that both see the username now sign in once.

**Tests added:** a new jsdom suite that renders the real component with fake timers. Its cases:
- a guard rejection after the dialog closed leaks no poll (fails on old code);
- a guard rejection after switching to QR starts no credential poll (fails on old code);
- a `guard_required` start after the dialog closed starts no poll (fails on old code);
- overlapping credential ticks call `steamLogin` once (fails on old code);
- a wrong code with the dialog open still resumes the poll (guard; UAT 79-A item 7).

**Verification:** passed. Status `fixed: requires human verification`, because this is UI state logic. A live check is to close the dialog mid-submit and confirm that no `steamPollCredential` traffic continues.

### C2/WR-02: "Incorrect code" plus a poll restart for every guard failure, including a dead flow

**Files modified:** `src/backend/storeManagers/steam/userSignIn.ts`, `src/common/types/ipc/steamAuth.ts`, `src/frontend/screens/Login/components/SteamLogin/index.tsx`, `src/backend/storeManagers/steam/__tests__/userSignIn.rustEngine.test.ts`, `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx`, `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginGuardRetry.test.ts` (deleted), `meta/i18nGateAllowlist.json`
**Commits:** 2afb3c2f5 (fix), 293cfe719 (i18n allowlist follow-up)
**Applied fix:**
- `submitSteamGuardCode` now returns `{status:'error', reason}`, where `reason` is one of:
  - `wrongCode`: EResult 65 (email) or 88 (authenticator mismatch). The review named only 65, but 88 is Steam's wrong-TOTP result.
  - `failed`: a transport error or a Rust rejection. The flow is unchanged, so another submit can work.
  - `expired`: there is no session, Rust returned `unknownFlow`, or `rustWaitSettle` ended in error.
- The IPC return type now carries the reason.
- The window keeps the code input and resumes the poll only for `wrongCode` and `failed`. Each has its own message, so a transport failure no longer says "Incorrect code".
- `expired` goes back to `credentials-1` with "This Steam sign-in expired or was declined. Sign in again to get a new code." The username and password stay filled in.
- A credential poll that reports `error` now does the same. It used to stop silently and leave a code input over a dead flow, which is the second half of the review's failure scenario.
- `steamLoginGuardRetry.test.ts` was a source gate on the old else-branch shape. It is replaced by the behavioural jsdom case for UAT 79-A item 7.

**Follow-up:** SteamLogin is deferred D-17 i18n debt with a measured literal count. The two new messages took the count from 29 to 31, which the hardcoded-string gate read as a stale exemption. I updated `expectedCount` and its reason, as quick task 260822-elw did for its three strings.

**Tests added:**
- Backend:
  - an EResult 88 is `wrongCode`;
  - `unknownFlow` is `expired`;
  - a network kind is `failed`;
  - a rejected rustInvoke is `failed`;
  - a settle error is `expired`;
  - no session is `expired`.

  All six fail on old code. The existing EResult 65 test now asserts `reason: 'wrongCode'`.
- Frontend:
  - `failed` keeps the input without saying the code is wrong (fails on old code);
  - `expired` returns to the form and stops polling (fails on old code);
  - a poll `error` returns to the form (fails on old code);
  - `wrongCode` resumes the poll (guard).

**Verification:** passed. Status `fixed: requires human verification`. The new copy and the return to the credentials form should get one live look.

### C2/WR-03: A signed-out CM failure during a depot install is reported to the crate as a network error

**Files modified:** `src/backend/sidecar/depotHostRegistration.ts`, `src/backend/sidecar/__tests__/depotHostRegistration.rust.test.ts`
**Commit:** 50d3424d9
**Applied fix:**
- `depotManifestRequestCode` now maps `steamcmKind: 'leaseUnknown'` to `{unavailable: 'not_signed_in'}`. `timeout` and `network` still pass through.
- I fixed this on the TS side because it is the translation layer that owns the reply allow-list. The Rust side already turns `{unavailable:'not_signed_in'}` into `transient:not_signed_in` (`depot_dispatch.rs:319` test), and `fetch.rs:396` turns that into `ErrorKind::NotSignedIn`. No Rust change was needed.
- Caveat: Rust also returns `leaseUnknown` for a lease that was released while the user is still signed in. After C1/CR-01 an install holds its own lease, so this should not happen. If it does, the job now offers "sign in" where it used to offer a network retry.

**Tests added:** `leaseUnknown` maps to `not_signed_in`. This fails on old code. The `it.each` now covers only timeout and network.
**Verification:** passed (8/8).

### C2/WR-04: `steamcm_configure` is fire-and-forget and one-shot

**Files modified:** `src/backend/sidecar/steamCmConfigGate.ts` (new), `src/backend/sidecar/bootstrap.ts`, `src/backend/sidecar/__tests__/steamCmConfigGate.test.ts` (new), `src/backend/sidecar/__tests__/helpers/sidecarHarness.ts`, `src/backend/sidecar/__tests__/testContainment.test.ts`, `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts`
**Commit:** 80f4eacae
**Applied fix:** I took the review's first option.
- The `host-services` step wraps the host transport in a configure gate, so every consumer gets it.
- A session-dependent `steamcm_*` channel awaits `ensure()` before it is sent. That covers `session_*`, `depot_key`, `licenses`, `manifest_request_code`, `refresh`, `wrap_restore_if_owed` and the rest.
- `ensure()`:
  - shares one configure attempt between concurrent callers;
  - remembers a success;
  - forgets a failure, so the next gated op retries.
- `steamcm_signin_*`, `steamcm_store_*` and `steamcm_anon_*` do not need the actor, so they pass straight through. A slow configure never delays a sign-in.
- `configureSteamCm` now resolves to a boolean, sends its frame synchronously, and turns a synchronous throw into `false`.
- The boot step's first attempt is `gate.ensure()`. The boot restore, which is gated, therefore retries a failed boot configure before it asks Rust.
- No timer is created; retries happen only on demand (sidecar exit contract, `smoke:sidecar` green).
- I also reworded the stale "configuring is harmless" comment (part of C2/IN-01).

**Test harness:** `bootFresh` now answers the boot `steamcm_configure` with success, as the shell does. Without that, the gated `steamcm_refresh` in skeletonFlows stalled.
- It takes `answerSteamCmConfigure: false` for cases that drive configure themselves.
- `rustInvokeChannel` opts out to keep its exact frame counts.
- The new suite is classified in `testContainment`.

**Not done:** the review's second option, a distinct Rust `notConfigured` refusal. With the gate, a still-failing configure means Rust answers its existing refusal, and the warning line names the retry. Adding the refusal would change the Rust contract, so I left it as a possible follow-up.

**Tests added:**
- seven gate unit cases:
  - an op waits for a pending configure;
  - a failed configure is retried by the next op;
  - the restore after a failed boot configure retries it first;
  - concurrent callers share one attempt;
  - a rejecting configure counts as a failure;
  - an op is still sent when the retry fails;
  - ungated channels never wait;
- the channel classifier;
- one boot-level case. It boots the sidecar, fails the boot configure, sees the restore retry configure before `steamcm_wrap_restore_if_owed`, and then sees a later `steamcm_session_status` go out with no further configure. This case fails against the old bootstrap.

**Verification:** passed. Sidecar and Steam suites are green apart from the baseline failures. Status `fixed: requires human verification`. One live boot should be checked: Refresh, sign-in and the macOS owed restore behave as before, and the log shows one `steamcm_configure`.

### C2/WR-05: A stale QR poll can redraw a dead challenge over a freshly restarted flow (plus the C1 handoff)

**Files modified:** `src/frontend/screens/Login/components/SteamLogin/index.tsx`, `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx`
**Commit:** a55c8be05
**Applied fix:**
- `qrPollGenRef` is bumped by `clearPollInterval`, which runs on every restart, tab change and unmount.
- `startQRFlow` captures the generation after it clears the old poll.
- Both the poll tick and the `steamStartQR` continuation drop their result if the generation changed. As a result:
  - a stale poll cannot redraw the cancelled flow's rotated challenge;
  - overlapping ticks that both see the username sign in once;
  - an auto-refresh start that resolves after a switch to the credentials tab starts no QR poll.
- **C1 handoff:** a `done` without a username now clears `qrRefreshTimerRef`. The 110 s auto-refresh can no longer restart an approved flow while finalisation runs. If finalisation fails, the next poll returns `error`, `startQRFlow` restarts the flow, and that re-arms the timer.

**Tests added:**
- a poll in flight across the 110 s refresh resolves with the old flow's rotated code, and the new code stays drawn (fails on old code);
- an approved flow is not restarted past 110 s and later signs in with the username (fails on old code);
- overlapping QR ticks sign in once (fails on old code);
- a QR start resolving after a tab change starts no poll (fails on old code).

**Verification:** passed (13/13 in the lifecycle suite, 53/53 across the SteamLogin tests). Status `fixed: requires human verification`. C1/WR-06 asked for one live QR sign-in, and that same run covers this fix.

### C2/WR-06: The "swallows a rejection" tests cannot fail

**Files modified:** `src/backend/sidecar/__tests__/bootstrap.steamcm.test.ts`
**Commit:** 006a69396
**Applied fix:**
- `load()` now also returns `logWarning` from the same isolated registry that bootstrap loads. Before, a top-level import would have read a different mock instance.
- The configure cases await `configureSteamCm`: a rejection resolves `false` and logs a `steamcm_configure failed` warning. A new case does the same for a synchronous transport throw.
- The restore case flushes the loop, then asserts the `steamcm_wrap_restore_if_owed failed` warning and that no `unhandledRejection` fired.

**Shown failing against a broken implementation:** I removed `configureSteamCm`'s rejection handler and the restore's `.catch` from bootstrap.ts, then ran both versions of the tests.
- The three new cases fail on their assertions, and the other five pass.
- The old file against the same broken implementation never failed on an assertion. The stray rejection crashed the jest worker ("Test suite failed to run", 0 tests), and that failure is not tied to any test.

I then restored bootstrap.ts.
**Verification:** passed (8/8).

## Notes for the caller

- Phase-80 commits landed on `main` during the run, so the branch was rebased onto e5aef0712 before the fast-forward. The phase-80 fixer's worktree and recovery file were not touched.
- Possible follow-ups, not done here:
  - a Rust `notConfigured` refusal (C2/WR-04, option 2);
  - cancelling the backend sign-in flow when the dialog closes. A poll that is mid-flight at close and returns `done` without a username still starts the backend finalisation, but the window no longer sees the result.
- Pre-existing and out of scope: switching from the QR tab to credentials and back leaves `step` at `qr-active`, so the QR flow does not restart on return. The mount effect only starts it from `step === 'tab'`.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_


---

# Pass: INFO-AB


# Phase 79 (slices A and B, info items): Code Review Fix Report

**Source review:** 79-REVIEW.md, "# Slice A" → "## Info" (A/IN-01..09) and "# Slice B" → "## Info" (B/IN-01..06)
**Iteration:** 1

**Summary:**
- Findings in scope: 15
- Fixed: 14 (A/IN-06 and A/IN-09 are doc-only and share one commit)
- Skipped: 0 (A/IN-08 resolved by operator decision: option 1, accept and document, 2b4e8dae5)
- None of the 15 had been resolved or made obsolete by the earlier A, B, C1 and C2 warning fixes. Each was checked against the current code first.

**Branch state:** all 13 commits are on `main` (e420eda04..503e0a5b6). They were made in a worktree, rebased onto `main` after the phase-80 Part C commits landed, then fast-forwarded. The temp branch, the worktree and the recovery sentinel are removed. No unrelated `.planning/` file was staged.

**Old-code check:** where a test checks a function that is new or has a new signature, I ran it against the old *semantics* instead (old line reinstated in the new code). Each entry says which.

## Fixed Issues

### A/IN-01: Depot fetch failure message misreports the attempt count
**Commit:** e420eda04 · **Files:** `gamelib-depot/src/fetch.rs`, `gamelib-depot/tests/fetch.rs`
**Change:** the message now reports the real counter `i`, and adds "(outage budget exhausted)" when the transport-error budget is what ran out. The "failed after N attempts" phrase is kept; `depotErrors.ts` deliberately does not match on it.
**Tests:**
- `outage_exhaustion_reports_the_real_attempt_count`: fails on the old code ("reported 3 attempts").
- `http_exhaustion_does_not_claim_an_outage`: a guard; it passes on both.
**Verification:** passed.

### A/IN-02: Transport errors early in a job never demote a dead host
**Commit:** 45110b742 · **Files:** `gamelib-depot/src/fetch.rs`, `gamelib-depot/tests/fetch.rs`
**Change:**
- `last_success` is now `Mutex<Option<Instant>>`. It is set when the first fetch starts, not when the Fetcher is built.
- I did not use the reviewer's plain "no anchor before the first success". That would treat every transport error before a first success as a host fault, so an outage at the very start of a job would demote every host. Starting the clock at the first fetch fixes the slow-request-code case and keeps the outage rule.
- Test hooks added: `with_outage_quiet` and a read-only `host_stats`.
- Not changed: a chunk that fails on every host keeps retrying while other chunks succeed. That is the intended job-wide progress anchor, and transport errors are rarely chunk-specific.
**Tests:**
- `errors_before_any_success_still_demote_a_dead_host_after_a_late_start`: fails with the old construction-time anchor reinstated.
- `a_long_outage_after_fetching_began_demotes_no_host`: a guard for the outage rule.
**Verification:** passed.

### A/IN-03: Unread `Done` sign-in flows keep the refresh token in memory indefinitely
**Commit:** 6125af6ec · **Files:** `gamelib-steamcm/src/webauth/mod.rs`, `webauth/credentials.rs`
**Change:**
- `cancel()` drops an ended flow at once. A live flow still reports `cancelled` once.
- A new QR or credentials start replaces only *live* flows of its kind (`Flows::replace_live`). An unread `done` is no longer lost.
- An ended flow nobody reads is dropped after `Timing::terminal_ttl`, which is 60 s in production. This covers `done`, `error` and `cancelled`. The expiry runs at the tail of the flow's own task, so `cancel`/`cancel_all` aborting the task also stops it. A read via `status()` aborts the pending expiry.
**Tests:** these 4 tests all fail with the old cancel, replace and no-expiry behaviour reinstated:
- `cancel_on_a_done_flow_drops_it_and_its_token`
- `a_new_qr_start_keeps_an_unread_done_flow`
- `an_unread_done_flow_expires_after_the_ttl`
- `an_unread_cancelled_flow_expires_after_the_ttl`
**Verification:** passed. **Status:** fixed: requires human verification. This is flow-state logic, and the 60 s TTL is a judgment call. The frontend polls every 2 s.

### A/IN-04: A refresh token with an undecodable JWT `sub` reports `steamId: ""`
**Commit:** 7d0586f8e · **Files:** `webauth/mod.rs`, `webauth/credentials.rs`
**Change:**
- A credentials flow falls back to the SteamID from `BeginAuthSessionViaCredentials` (`guard_ctx`).
- A QR flow has no such SteamID. It ends with `error/network` and one diag line; the token is never logged.
**Tests:** both fail on the old `unwrap_or_default()` line:
- `qr_token_without_a_readable_sub_is_an_error_not_an_empty_steam_id`
- `unreadable_sub_falls_back_to_the_begin_steam_id`
**Verification:** passed.

### A/IN-05: The anonymous actor reports `Replaced` to connect waiters on an ordinary close
**Commit:** 279abf4da · **File:** `gamelib-steamcm/src/anon.rs`
**Change:** a requested close now answers the pending connect waiters with `Cm(CmError::Closed)`, which the TS side sees as kind `network`. Shutdown still answers `ShuttingDown`. No TS code branches on `replaced` for anonymous reads.
**Test:** `close_during_connect_answers_waiters_closed_not_replaced` fails on the old code.
**Verification:** passed.

### A/IN-06: Misplaced doc comment on `refresh_library` (doc only)
**Commit:** 7f807a67f (shared with A/IN-09) · **File:** `facade.rs`
**Change:** the comment moved to `capture_anon_pics`, and `refresh_library` got its own. No test.

### A/IN-07: A second `configure` updates `app_folder` but not the session's wrap
**Commit:** 93b56aa62 · **File:** `facade.rs`
**Change:**
- The first configure now wins for the folder as well as the session.
- A later call with a different folder logs one diag line and is ignored. The folder itself is not logged.
- The C2/WR-04 configure retry is unaffected, because a failed configure (missing host) returns before `configure_with`.
**Test:** `the_first_configure_wins_for_the_app_folder_too` fails with the old overwrite reinstated.
**Verification:** passed.

### A/IN-09: `VentLogForwarder` takes the process-global tracing subscriber (doc only)
**Commit:** 7f807a67f · **Files:** `vent.rs`, `facade.rs`
**Change:** I documented it rather than switching to a scoped dispatcher. `with_default` is thread-local, and steam-vent spawns its own tokio tasks, which would then lose the forwarding.
- The doc states what the global subscriber costs: a later `set_global_default` fails, and every event that is not a steam_vent WARN+ event is dropped.
- It also states why that is safe today: grep shows no other workspace code emits `tracing` events since A/WR-03.
- No test.

### B/IN-01: Secret-bearing arg structs derive `Debug`
**Commit:** 1645ab6d5 · **Files:** `meta/genIpcContract.ts`, `src/common/types/ipc/rustInvoke.ts`, `src-tauri/src/ipc_contract.rs` (regenerated), `meta/__tests__/genIpcContract.test.ts`, `src-tauri/src/steamcm_dispatch.rs`
**Change:**
- The generator takes a new leaf meta key, `x-secret: true`. A struct with such a field gets `#[derive(Clone, …)]` plus a hand-written `Debug` that prints `<redacted>` for that field.
- Marked fields:
  - `key`
  - `refreshToken`
  - `accountName` and `password`
  - the guard `code`
  - **also `KeyringSetArgs.secret`**: the same defect on the keyring channel, outside the review's list.
**Tests:**
- Three generator jest cases.
- Shell test `secret_bearing_args_debug_redacts_the_secret`. It fails against the old generated `ipc_contract.rs`: it printed the refresh token.
**Verification:** passed. `pnpm check:ipc-contract` is up to date.

### B/IN-02: Crash path runs the steamcm shutdown before reaping and the dialog
**Commit:** a152a9caa · **File:** `src-tauri/src/sidecar.rs`
**Change:** a new pure `sidecar_eof_teardown` sets the order:
- On a crash: reap the tree, run the steamcm close on its own thread, then show the dialog.
- On an intentional shutdown: run the close in line, as before.
- `surface_dead_sidecar` became `show_dead_sidecar_dialog`; the reap moved into the teardown.
- Known overlap: if the user picks Restart or Quit within 5 s, the Exit hook's bounded shutdown can run alongside the background close. Both are bounded, and a second `pay_owed` finds no owed record, or at worst sends `steam://open/goonline` twice.
**Tests:**
- `crash_teardown_reaps_then_shows_the_dialog_without_waiting_for_steamcm`: fails with the old ordering reinstated ("waited 401 ms").
- `shutdown_teardown_runs_the_steamcm_close_in_line`.
**Verification:** passed. **Status:** fixed: requires human verification. The real crash path needs a live sidecar kill.

### B/IN-03: A skipped shutdown is logged as `TimedOut`
**Commit:** 2be7ead56 · **Files:** `facade.rs`, `src-tauri/src/steamcm_dispatch.rs`, `gamelib-steamcm-cli/src/main.rs`
**Change:**
- `facade::shutdown_all` now returns `Result<RestoreOutcome, String>`.
- The shell logs a refusal as `Refused (steamcm:nested-runtime)`; the CLI prints it on stderr.
**Tests:**
- Crate test `shutdown_all_inside_a_runtime_is_refused_not_timed_out`.
- Shell test `a_refused_shutdown_is_logged_as_refused_not_timed_out`.
- Both are new-signature tests: under the old mapping the refusal is indistinguishable from a timeout.
**Verification:** passed.

### B/IN-04: `connection_log_path` resolves relative to the CWD when `HOME` is unset
**Commit:** 179ac05b7 · **Files:** `gamelib-steamcm/src/wrap.rs`, `src-tauri/src/steamcm_dispatch.rs`, `gamelib-steamcm-cli/src/main.rs`
**Change:**
- New `wrap::default_connection_log_path()`. It uses `std::env::home_dir()`, which reads `HOME` and then the password database; on 1.99 it is not deprecated.
- It falls back to `/nonexistent-home/...` when there is no absolute home, so the probe fails as a missing file.
- The CLI's own `WrapHost` had the same pattern and uses it too.
**Test:** `connection_log_path_is_absolute_without_a_usable_home`. It covers `None`, an empty home and a relative home. It is a pure-function test: the old code's `PathBuf::new().join(..)` is the relative path it rules out.
**Verification:** passed.

### B/IN-05: `runSteamcmCliSync` has no timeout
**Commit:** 503e0a5b6 · **Files:** `meta/gamelibSteamcmCli.ts`, `meta/__tests__/gamelibSteamcmCli.test.ts`
**Change:**
- The call now has a 120 s bound (`STEAMCM_CLI_TIMEOUT_MS`, overridable per call) and is killed with SIGKILL.
- The error names the signal, and the profile is still disposed in `finally`.
- The spawn still goes through `createFakeHomeProfile`, and the fakeHomeIsolation gate passes.
**Test:** `kills a CLI that outlives the timeout`. It uses a stub CLI that sleeps, under a temp `CARGO_TARGET_DIR`, and is skipped on win32. Without the bound, it hung for the stub's full 30 s and then failed.
**Verification:** passed.

### B/IN-06: `STEAMCM_SECRET_OPS` hand mirror without a parity test; `parseSteamcmNdjson` dead
**Commit:** 21f9c15fe · **Files:** `meta/gamelibSteamcmCli.ts`, `meta/__tests__/gamelibSteamcmCli.test.ts`
**Change:**
- A new jest test reads `SECRET_OPS` from `gamelib-steamcm-cli/src/main.rs` and compares it with the TS list.
- `parseSteamcmNdjson`, `SteamcmNdjsonReply` and their test are deleted.
**Test:** `STEAMCM_SECRET_OPS matches SECRET_OPS in the Rust CLI`. It fails when one op is dropped from the TS list.
**Verification:** passed.

## Skipped Issues

### A/IN-08: SteamID is exposed on argv

**Resolved 2026-11-16 by operator decision: option 1 (accept and document), commit 2b4e8dae5.** SteamID64 is public and not a credential, so argv may carry it. It must never reach a log. The rule is recorded at both argv sites (`macowned.rs` helper spawn, CLI `SECRET_OPS` doc).
**Files:** `gamelib-steamcm/src/macowned.rs` (`run_helper`: `--steam-owned-apps --expect-steamid <id64>`); `gamelib-steamcm-cli/src/main.rs` (`SECRET_OPS`)
**Reason:** this needs a product and design decision. A SteamID is not a credential, but the review brief treats it as must-not-log. Fixing the helper half also means changing the separately built `steam-bridge-helper` binary's argument contract, not just this crate.

**Options:**
1. **Accept it and document it.** Treat a SteamID64 as public: it appears in every Steam profile URL. Record in the threat model that argv may carry it, but logs may not.
2. **Helper over stdin or env.** Pass the SteamID on the helper's stdin, or in an env var such as `GAMELIB_EXPECT_STEAMID`, in place of the `--expect-steamid` flag.
   - stdin is better: another user can read a process's environment on some platforms but not its stdin.
   - It needs a coordinated change to the helper's argument parsing and a rebuild of `build-steam-bridge`.
   - The current helper is pinned, so it needs a transition: accept both forms for one release.
3. **CLI only.** Add `steamcm_owned_apps`, `steamcm_refresh` and `steamcm_mac_owned_apps` to `SECRET_OPS`, so they run only via `--ndjson`. Add the same ops to `STEAMCM_SECRET_OPS`; the new B/IN-06 parity test would enforce this.
   - It is cheap.
   - But `pnpm steamcm-capture-fixtures` and any single-shot callers of those ops would need to move to stdin.

Options 2 and 3 are independent. Option 3 is a small follow-up once the operator decides SteamIDs are private.

## Verification (final tree, rebased onto main, run from src-tauri/ unless noted)

| Check | Result |
|-------|--------|
| `cargo test -p gamelib-steamcm` | 305 lib tests passed (3 ignored), and the integration targets passed |
| `cargo test -p gamelib-depot` | all targets passed (`tests/fetch.rs` has 21) |
| `cargo test -p gamelib-shell` | 481 passed, 2 ignored |
| `cargo clippy -p gamelib-steamcm -p gamelib-steamcm-cli -p gamelib-depot --all-targets -- -D warnings` | clean |
| CI clippy ratchet (`cargo +1.99.1 clippy --workspace --all-targets --message-format=json` + `node ../meta/clippyRatchet.cjs`) | PASS (darwin, 1.99.1), every ceiling unchanged, zero diagnostics in touched files |
| `rustfmt --edition 2021 --check` on every touched Rust file | clean, with two exceptions. `sidecar.rs` has 7 pre-existing drift hunks, the same count as on the base commit and none in my lines. `ipc_contract.rs` is generated. `cargo fmt --check` for the three crates is clean. |
| `pnpm tsc --noEmit` (repo root) | clean |
| jest: genIpcContract, rustInvokeSchemas, gamelibSteamcmCli, steamCmPortComplete, fakeHomeIsolation | 5 suites, 180 tests passed |
| `pnpm check:ipc-contract` | up to date |
| `npx prettier --check` on the five touched TS files | clean |
| `graphify update .` | run on `main` after landing |

**Worktree notes:**
- The shell build script needed the gitignored sidecar resource and `build/`. I copied the binary into the worktree and symlinked `build/`, and both were removed with the worktree.
- Builds shared the main checkout's `CARGO_TARGET_DIR`.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_


---

# Pass: INFO-C


# Phase 79: Code Review Fix Report (slice C1/C2 info items)

**Fixed at:** 2026-11-16
**Source review:** .planning/phases/79-rust-cm-client-replacing-steam-user-and-steam-session/79-REVIEW.md ("# Slice C1" and "# Slice C2", "## Info")
**Iteration:** 1

**Summary:**
- Findings in scope: 9. That is C1/IN-01 to C1/IN-05, C2/IN-01 to C2/IN-03, and the QR round-trip bug.
- Fixed: 9. C2/IN-03 took the review's second option, a tracking todo, and did not remove the channel; the reason is below.
- Skipped: 0

All commits are on `main`. Main moved during the run (phase-80 and A/IN-08 commits), so I rebased onto 1ee6107a0 with no conflicts and fast-forwarded main to c7bb124d3. The temp branch and worktree are deleted. I did not touch the phase-80 worktrees. I ran `graphify update .` after landing.

**Verification for the whole run (after the rebase):**
- `pnpm tsc --noEmit`: clean.
- eslint: 0 errors on every touched file. All warnings were already there.
- `npx prettier --check` over every touched path: clean. The new todo `.md` is prettier-ignored (`--file-info`).
- `pnpm build:sidecar` and `pnpm smoke:sidecar`: PASS (READY written, exit 0 on stdin EOF).
- `pnpm check:ipc-contract`: up to date. No channel was added or removed.
- `pnpm planning-gates`: the todo frontmatter gate passes. The STATE.md field-anchor gate fails, but that failure was already there; I did not touch STATE.md.
- Affected suites after the rebase: 1174/1174 pass. They are steam cm, user.rustEngine, userSignIn.rustEngine, library.macSteamRefresh, games, gameMetadata.rust, steamAuthFlows, downloadmanager and the Login screens. `meta/__tests__/hardcodedStringGate` passes (176/176).
- `jest src/backend src/frontend`: every failing suite either also fails on base or passes on its own.
  - The 7 known baseline failures: shimCoverage, shimGenerate, tauriShellSource, flowRegistrationCensus, ipcDomainCensus, epicOfflineMode, themeTokens.
  - `moduleStateCensus` and `sidecarShutdownFlagSource` also fail on base 503e0a5b6, which I checked in a separate detached worktree (same 5 failing tests). `sidecarShutdownFlagSource` is a source gate on `src-tauri/src/sidecar.rs`, which this run did not touch.
  - `outboundHttpRegistry` and `dxvkInstallRemove` failed only under full-suite load. Both pass on their own.

## Fixed Issues

### C1/IN-01: `getUserOwnedApps` has no production caller and silently drops `filterAppids`

**Files modified:** `src/backend/storeManagers/steam/cm/SteamCmClient.ts`, `src/backend/storeManagers/steam/cm/__tests__/RustCmClient.test.ts`
**Commit:** b2425df75
**Applied fix:**
- I dropped `filterAppids` from the interface's options. The Rust `steamcm_owned_apps` op has no app filter.
- A doc comment records that the method has no production caller and is kept as the TS face of the op that the golden parity test drives.
- I did not remove the method itself. That would have meant rewiring the golden parity test, `liveLeaseClient` and two Refresh test harnesses, and the op parity coverage is worth keeping.

**Test:** a `@ts-expect-error` call with `filterAppids`. tsc fails if the option comes back; I confirmed this against the old interface (TS2578).
**Verification:** passed.

### C1/IN-02: `logout()` closes the anonymous session twice

**Files modified:** `src/backend/storeManagers/steam/user.ts`, `src/backend/storeManagers/steam/__tests__/user.rustEngine.test.ts`
**Commit:** 4fd21d141
**Applied fix:**
- I removed the second `RUST_STEAMCM_ANON_CLOSE` invoke and its import.
- **Why this is safe:** the boot's `anonymousClient` is `createAnonymousClient` on the same `requestRustInvoke` (`bootstrap.ts:1666`). Its `close('logout')` already sends `steamcm_anon_close {reason:'logout'}`. Nothing awaited the second close's result.
- A comment at the remaining close names it as the only one.

**Test:** the logout test now wires the real anonymous client on the recording transport and asserts exactly one `steamcm_anon_close {reason:'logout'}` frame. It fails on the old code, which sends two.
**Verification:** passed.

### C1/IN-03: `tryMacSteamRefresh` does not match its contract

**Files modified:** `src/backend/storeManagers/steam/library/rustRefresh.ts`, `src/backend/storeManagers/steam/__tests__/library.macSteamRefresh.test.ts`
**Commit:** f8bb85e06
**Applied fix:** I corrected the doc instead of changing the behaviour, for two reasons.
- An apply failure means Mac Steam's owned set arrived and the library write failed. Falling back would pay for a signed-in CM logon (the thing the Mac path exists to avoid) and then fail on the same write. It stays a sync failure, as on the CM path.
- The bridge launch-target backfill needs a token-bearing PICS read on a signed-in lease, and this path holds none by design. The doc now says it is skipped and that `resolveBridgeLaunchExe` resolves a missing target at launch (anonymous PICS, then the open session).

**Correction to the review:** it says `GAMELIB_STEAM_MAC_PATH` is off by default. It is on by default (`macSteamPathFlag.ts`: anything but `off`), so this path is the primary macOS Refresh.
**Test:** a guard case: an apply failure rejects `refresh()`, emits `sync-failed` and acquires no lease. It pins the documented contract and passes on both old and new code.
**Verification:** passed.

### C1/IN-04: The exit-contract test does not check `unref`

**Files modified:** `src/backend/storeManagers/steam/__tests__/userSignIn.rustEngine.test.ts`
**Commit:** 60de81f0c
**Applied fix:**
- The test now wraps each fake `setTimeout` handle's `unref` in a `jest.fn` that still calls the original.
- It asserts that every 1 s wait (at least 2) was unref'd exactly once, then restores the spy.
- This is test-only. It is safe because the wrapper delegates to the fake timer's own `unref`, and `getTimerCount()` still reaches 0.

**Test:** with `handle.unref?.()` commented out of `sleepUnref`, the test fails; with the line in place, it passes.
**Verification:** passed (30/30).

### C1/IN-05: Comments still describe steam-user behaviour

**Files modified:** `src/backend/storeManagers/steam/user.ts`, `src/backend/storeManagers/steam/userRedeem.ts`, `src/backend/storeManagers/steam/userTypes.ts`, `src/backend/storeManagers/steam/depot/plan.ts`
**Commit:** faab11779
**Applied fix:** I rewrote the comments against the Rust session.
- `getLogonFailure`: the Rust `logon-rejected` refusal is not retried.
- `ensureConnected`: a connected session is checked without a lease; a closed one is opened and released at once, so the idle close applies.
- `acquireAuthenticated`: there is no go-offline wrap (the production wrap is `RestoreOnlyWrap` or `NoWrap`, which never refuse), and the session closes 60 s (`IDLE_GRACE`) after the last release.
- `redeemKey`: `RustCmClient` keeps the reject-on-non-OK shape.
- The credential-refusal EResult list now names Steam's EResult numbers, which match the Rust `CREDENTIAL_REFUSAL_ERESULTS` list.
- `plan.ts`: the retry and depot-key-error comments.

`getDepotClient`'s error text changed from "steam-user client" to "Rust CM lease client". I checked that its classification is unchanged:
- it still matches `depotHostRegistration`'s `/no authenticated/`;
- it still does not match `depotErrors`' `no authenticated Steam CM connection`.

Historical "the former steam-user shape" notes elsewhere are accurate and were left alone.
**Test:** none; these are comments only.
**Verification:** passed (steam suites green apart from the baseline).

### C2/IN-01: Stale comments now contradict the Phase 79 ownership model

**Files modified:** `src/backend/sidecar/steamAuthFlowRegistration.ts`, `src/backend/sidecar/bootstrap.ts`
**Commit:** 9f5d31ed7
**Applied fix:**
- `steamGoOfflineRetry` only reads Mac Steam's state and arms nothing.
- `mac-steam-online-restore`: a sidecar kill -9 closes the sidecar's stdout, so the shell's `on_sidecar_eof_drop_steamcm` pays the owed go-online. Only a shell kill -9 relies on the boot call alone.
- The third item ("configuring is harmless") was already reworded by C2/WR-04 (80f4eacae), so there was nothing left to change.

**Test:** none; these are comments only.
**Verification:** passed.

### C2/IN-02: `getSteamInstallSize`'s `deps` is optional but required for any result

**Files modified:** `src/backend/storeManagers/steam/gameRequirements.ts`, `src/backend/downloadmanager/downloadqueue.ts`, `src/backend/sidecar/steamAuthFlowRegistration.ts`, `src/backend/sidecar/__tests__/steamAuthFlows.test.ts`, `src/backend/storeManagers/steam/__tests__/gameMetadata.rust.test.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
**Commit:** dea857160
**Applied fix:**
- The signature is now `getSteamInstallSize(deps: RustInvokeDeps, appId: unknown, gameInfo?: GameInfo)`.
- The dead `if (deps)` branch is gone, and the doc no longer describes the removed HTML parse.
- Both production callers (the download queue and the IPC handler) pass `deps` first. The IPC channel's arguments are unchanged.

**Tests:**
- a `@ts-expect-error` deps-less call in `gameMetadata.rust.test`, which fails tsc against the old signature;
- the `games.test` installed and bad-appId cases now assert that the transport is never reached;
- the `steamAuthFlows` delegation assertion is updated to the new argument order.

**Verification:** passed. The sidecar build and smoke pass.

### C2/IN-03: `steamGoOfflineCancel` is a kept no-op channel with a live caller

**Files modified:** `src/backend/sidecar/steamAuthFlowRegistration.ts`, `.planning/todos/pending/2026-11-16-remove-the-dead-guided-go-offline-dialog-chain.md` (new)
**Commit:** ef6362f0c
**Applied fix:** I took the review's second option, a todo that tracks the removal, and did not remove the channel.
- The Rust production wrap never refuses a logon, so the whole guided Go Offline chain is unreachable. That chain is:
  - the `go-offline-required` lease reason;
  - the `steamGoOfflineRequired` push;
  - `SteamGoOfflineNotice` and its store;
  - the `steamGoOfflineRetry` and `steamGoOfflineCancel` channels.
- Removing only the Cancel channel would leave the dialog half-plumbed.
- Removing all of it touches the shell's IPC allow-list (`src-tauri/src/ipc_contract.rs`), the zod schemas, preload, the frontend, `meta/knip-baseline.txt` and two census suites that are already red on main. In those suites a regression could not be told apart from the existing failures.
- It also needs a keep-or-delete decision about the dormant Rust `LogonWrap`/`WrapRefused`.

The todo (`severity: minor`, `platform: any`, `ready: human`) records the scope and the "done when" condition. The handler comment names the todo and no longer says Rust owns a go-offline wrap.
**Test:** none; this is a comment and a todo.
**Verification:** passed. The todo frontmatter gate passes, and `check:ipc-contract` is unchanged.

### EXTRA (C2 fixer report): QR → credentials → QR leaves `step` at `qr-active`, so the QR flow does not restart

**Files modified:** `src/frontend/screens/Login/components/SteamLogin/index.tsx`, `src/frontend/screens/Login/components/SteamLogin/__tests__/steamLoginPollLifecycle.test.tsx`
**Commit:** c7bb124d3 (the last commit)
**Applied fix:**
- On a switch to the QR tab, `handleTabChange` now clears the drawn challenge and sets `step` back to `'tab'`, so the existing QR effect starts a fresh flow.
- `clearPollInterval` has already bumped `qrPollGenRef`, so with the C2/WR-05 generation guard a start or tick from the old flow cannot draw over the new code.
- The same change also fixes credentials-2 → QR, which used to show an endless spinner, and credentials-2 → QR → credentials, which used to show the Steam Guard input for a dead attempt.

**Tests:** three new jsdom cases, all of which fail on the old code:
- the round-trip starts a second flow, draws `qr-B`, polls it, and signs in on its approval;
- the Steam Guard step → QR starts a fresh flow;
- an auto-refresh start that was in flight before the round-trip cannot draw over the fresh flow's code.

**Verification:** passed (Login suites 236/236, hardcodedStringGate 176/176). Status `fixed: requires human verification`, because this is UI state logic. One live look at a QR → credentials → QR switch should show a new code.

---

_Fixed: 2026-11-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
