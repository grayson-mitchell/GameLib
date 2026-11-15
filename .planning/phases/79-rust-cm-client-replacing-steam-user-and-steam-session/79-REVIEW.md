---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
reviewed: 2026-11-16
depth: standard
status: issues_found
fixed: [A/CR-01 7744eeb7f, C1/CR-01 63b3b470e]
files_reviewed: 112
diff_base: 048efa221^
findings:
  critical: 2
  warning: 21
  info: 23
  total: 46
slices: [A rust crate, B rust shell and build, C1 steam TS backend, C2 sidecar and frontend]
---

# Phase 79: Code Review Report

Scope is the 112 source files named in the phase SUMMARY key-files; Cargo.lock is excluded. The scope was too large for one reviewer, so it was reviewed in four parallel slices. Each slice report is reproduced below unchanged, so finding IDs are local to their slice (for example, A/CR-01 and C1/CR-01 are different findings).

**Secret handling and the sidecar exit contract are clean in all four slices.** No refresh token, password, guard code, key, SteamID or account name reaches a log, and every new timer is unref'd.

**The orchestrator checked both critical findings against the code:**
- **A/CR-01 is confirmed.** `close_conn` (session.rs:749) drops the kill watch sender without sending a value. A rebuild (session.rs:990) therefore makes in-flight `run_op` calls resolve `Replaced` at session.rs:405-406, and they skip the retry-once recovery. Only the eresult-34 path sends a value first.
- **C1/CR-01 is confirmed.** `RustCmSession.getClient()` (rustSession.ts:73) returns the most recently acquired lease. `getDepotClient` (depot/plan.ts:69) uses it, so a running install can pick up a concurrent Refresh's client and then get `leaseUnknown` once that Refresh releases.

## Fixes applied (2026-11-16, operator decision: fix both criticals before close)

- **A/CR-01 is fixed in 7744eeb7f.** A dropped kill sender now reads as `CmError::Closed`, which takes the retry-once recovery path. Logout sends `LeaseUnknown` explicitly, and shutdown sends `ShuttingDown`. Two new session tests fail on the old code. The crate's 279 tests, clippy and rustfmt are clean.
- **C1/CR-01 is fixed in 63b3b470e.** `getClient()` returns a live view (`cm/liveLeaseClient.ts`) that routes each call through a lease held at the time of the call. A new `user.rustEngine` test fails on the old code. The Steam backend suites pass, except the baseline `shimCoverage` and `shimGenerate`.
- **The 21 warnings and 23 info items are follow-up work.** They are tracked in `.planning/todos/pending/2026-11-16-phase-79-review-warnings.md`.


---

# Slice A


# Phase 79 (slice A): Code Review Report

**Reviewed:** 2026-11-16
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Reviewed the new Rust Steam CM client: the session and anonymous actors, the facade and dispatch, the steam-vent backend, Web-API sign-in, the Refresh pipeline, the Mac-owned helper path, the CLI, and the transient-retry change in `gamelib-depot/src/fetch.rs`. Secret hygiene holds up. No refresh token, password, guard code, depot key or request code reaches `diag`. `RefreshTokenSecret` redacts. The secret-bearing CLI ops are refused on argv. steam-vent's WARN/ERROR events forward only their static `message` field.

The main defect is in the session actor's kill channel. Every connection teardown (rebuild, logout, shutdown) makes ops already in flight return `replaced` at once. That bypasses the retry-once recovery that plan 79-11 added. Other problems:
- Refresh's overall deadline is shorter than the sum of its stage bounds.
- The licence list is frozen at logon.
- `tracing` diagnostics in two modules go nowhere.
- A live session can be leased to a caller presenting a different account's token.
- One malformed PICS buffer fails a whole batch.

## Critical Issues

### CR-01: Dropping the kill sender on any connection close makes every in-flight op report `replaced` and skip recovery

**File:** `src-tauri/crates/gamelib-steamcm/src/session.rs:405-407` (with `close_conn` at 749-762, `kill = None` at 758)
**Issue:** `run_op` races the op against `kill.wait_for(|k| k.is_some())`. `close_conn` sets `self.kill = None`, which drops the `watch::Sender`. A tokio `watch::Receiver::wait_for` returns `Err(RecvError)` as soon as the sender is dropped and the current value fails the predicate. The arm then returns `k.ok()...unwrap_or(OpFailure::Replaced)`, which is `Replaced`. `close_conn` runs from:
- `begin_rebuild`, after a failed probe, a failed canary, a sleep gap, or a LoggedOff that is not 34;
- `Logout`;
- `Shutdown`.

So every op still in flight on the old connection fails immediately with `kind: "replaced"`. It never reaches the `Recover` path, where the epoch check would have answered `Ok(true)` and retried the op once on the rebuilt connection.

Failure scenario: a depot install has several idempotent ops in flight at once (depot keys, request codes, PICS). One of them times out, the probe fails and a rebuild begins. Every other in-flight op returns `replaced`, a code meant to mean "another client took the session". Retry-once was the whole point of 79-11, and here those ops are failed instead of retried. The same happens on logout and shutdown: the ops report `replaced` rather than `leaseUnknown` or `shuttingDown`. The 79-11 tests do not catch this because FakeBackend ops resolve instantly, so no op is ever in flight when `close_conn` runs. Only the 34 test (`logged_off_34_is_terminal_with_no_reconnect`) exercises the kill arm, and it sends `Some(Replaced)` explicitly.
**Fix:** Only an explicit value should end the op. Treat a closed channel as "connection gone", which sends the op down the normal failure and recovery path:
```rust
k = kill.wait_for(|k| k.is_some()) => match k {
    Ok(v) => return Err(v.clone().unwrap_or(OpFailure::Replaced)),
    // Sender dropped by close_conn (rebuild/logout/shutdown): not a 34.
    Err(_) => CmError::Closed,
},
```
Then `classify(Closed, idempotent)` routes to `Recover`. On a rebuild the epoch differs, so the result is `Ok(true)` and the op retries. On logout or shutdown, `Recover` answers `LeaseUnknown` or `ShuttingDown`. For shutdown and logout you can also send an explicit value before dropping: `k.send(Some(OpFailure::ShuttingDown))` or `Some(OpFailure::LeaseUnknown)`. Add a test with a FakeBackend op delayed across a rebuild.

## Warnings

### WR-01: The 150 s Refresh deadline is shorter than its stage bounds, and on timeout the whole library is discarded

**File:** `src-tauri/crates/gamelib-steamcm/src/refresh/mod.rs:42,130-140`; `refresh/capture.rs:29,320,335`
**Issue:** `refresh_library` wraps the whole body in a 150 s `REFRESH_DEADLINE`. The stages inside it are bounded separately:
- collect: 60 s per attempt, up to the 120 s `COMMAND_DEADLINE` with retry;
- anonymous capture: 90 s;
- held-lease capture: 90 s, plus retry;
- enrichment: 20 s.

Their sum is well over 150 s. When the deadline fires, the result is `{ok:false, kind:"timeout"}`, and the owned games already collected are thrown away along with the metadata updates. The module's stated contract is "Never fails for a demos, capture or enrichment problem". Capture's own docs also say it is fail-soft.

Failure scenario: a large library on a first sync, with nothing captured yet. The capture PICS read goes out as one unbatched request for every id and stalls: 90 s anonymous, then up to 90 s held. Refresh times out and the library is not updated. Nothing is persisted, so the next Refresh scopes the same ids and fails the same way, every time.
**Fix:** Give capture and enrichment a share of the remaining budget, for example `deadline - now - margin`, and treat expiry as a soft stop: `failed: true` while the collected `apps` are kept. Alternatively, bound only the owned/collect step with the hard deadline. Also batch the capture read by `APP_BATCH_SIZE`, the way `fetch_demos` and `lookup_apps` do.

### WR-02: The licence list is captured once at logon and never updated

**File:** `src-tauri/crates/gamelib-steamcm/src/vent.rs:175-178`; `session.rs:600-608,749-762`; `facade.rs` `product_info`
**Issue:** `connect_authed` reads the first `CMsgClientLicenseList` and then drops the subscription. Steam pushes a new list after a key redeem or a purchase, but the actor's `licenses` field never sees it, so it stays as it was at logon until the next logon. Separately, `close_conn` clears `licenses`, and `Cmd::Licenses` answers `Ok(vec![])` while a rebuild is in progress (`conn` is `None`, the lease is still valid).

Failure scenario 1: the user redeems a key, then immediately runs Refresh or installs. This happens within the 60 s idle grace or while another lease is held, so the session is reused. `product_info` takes the package licence token from the stale list. The new package comes back with an empty buffer or `missingToken`, and the licensed demos stage misses it.

Failure scenario 2: during a rebuild, Refresh gets an empty licence list. The demos stage then returns no demos and reports success (`demos_failed: false`), not failure.
**Fix:** Keep the `CMsgClientLicenseList` stream alive in a forwarder task, the way `logged_off` is kept, and feed updates to the actor through an internal message. In `Cmd::Licenses`, wait on the recovery (or answer `Err(Cm(Closed))`) when `conn.is_none()`, rather than returning an empty list.

### WR-03: `tracing` diagnostics in owned_demos and macowned are silently dropped

**File:** `src-tauri/crates/gamelib-steamcm/src/refresh/owned_demos.rs:193,216,220`; `macowned.rs:279,285`; `vent.rs:487-521`
**Issue:** The only tracing subscriber in the whole `src-tauri` tree is `VentLogForwarder`. Its `enabled()` passes only `steam_vent*` targets at WARN or above. The crate's own `tracing::info!`/`warn!` calls therefore never reach any sink:
- "licensed demos lookup failed", with its cause;
- "licensed demos timed out";
- "mac-owned ok/fallback reason=…".

These are exactly the lines needed to diagnose a missing-demos report or a Mac-path fallback in the field.
**Fix:** Route these through `crate::error::diag(...)`, which is the crate's sink, carries no secrets, and is what every other module uses. Alternatively, widen the forwarder to the `gamelib_steamcm` target.

### WR-04: Acquiring with a different account's refresh token while a session is live returns a lease on the old account, and swaps credentials under it

**File:** `src-tauri/crates/gamelib-steamcm/src/session.rs:667-700`
**Issue:** `on_acquire` always overwrites `self.creds` with the new token. If a connection exists, it hands out a lease on that connection along with its `steam_id`, without checking that the token belongs to the same account. The `RefreshToken` subject is never compared with `self.steam_id`.

Failure scenario: account A's session is still inside its 60 s idle grace, or held by another lease. The user signs in as account B, and the app acquires with B's token before sending a logout. B's caller gets a lease on A's session, and owned apps, PICS and redeem all run as A. On the next rebuild, the actor silently logs on as B under leases that were granted for A.
**Fix:** Store the token's subject in `creds`, or compare tokens. If the account differs while connected, either refuse the acquire, or bump `generation` and close and re-logon, failing the existing leases (as `Logout` does).

### WR-05: A Web-API HTTP error without `x-eresult` (429/5xx) ends a QR or credentials sign-in instead of being retried

**File:** `src-tauri/crates/gamelib-steamcm/src/webauth/mod.rs:155-160,418-422`
**Issue:** `call_inner` ignores the HTTP status and requires `x-eresult`. A rate-limit 429 or a 502/503 from an edge without that header becomes `Protocol("missing-x-eresult")`. `qr_poll_loop` treats any `Protocol` error as terminal and sets `error/network`. Only `Network` and `Timeout` are retried.

Failure scenario: Steam rate-limits a poll during a QR sign-in. The flow dies with a network error while the user is still scanning the code, so they must restart sign-in.
**Fix:** Before reading the header, map `!status.is_success()` to a transient variant: `WebAuthError::Network`, or a new `Http(status)`. Keep polling on 429/5xx until the flow deadline.

### WR-06: One malformed PICS buffer fails the whole product-info batch

**File:** `src-tauri/crates/gamelib-steamcm/src/ops/pics.rs:322,337`
**Issue:** `parse_app(&a.buffer)?` and `packageinfo_to_json(...)?` abort the whole response on the first entry that fails to parse, including one over the 4 MiB / depth-64 limit. The empty-buffer case was already fixed for this reason (79-33). A malformed or oversized buffer has the same blast radius and is still fatal.

Failure scenario: a single app in a 200-app or full-library batch has a VDF the parser rejects. Three things fail with it:
- Refresh capture marks every scoped app `failed`;
- the demos stage fails entirely;
- the Mac-owned path falls back to CM (`PicsFailed`).
**Fix:** Parse each entry fail-soft. Emit `appinfo: null` (or `packageinfo: null`) and add the id to a `parseFailed` list. Keep the hard error only for transport failures.

### WR-07: CDN server list is requested for cell 0, not the logon cell

**File:** `src-tauri/crates/gamelib-steamcm/src/ops/depot.rs:80`
**Issue:** `cdn_servers(0, CDN_MAX_SERVERS)` always passes `cell_id = 0`. As far as I know, steam-user's `getContentServers` passes the client's `cellID` from the logon response; I could not confirm this, because `node_modules/steam-user` is no longer in the tree. With cell 0, the directory returns servers for its default region rather than the user's local one. A user far from that default may get distant CDN hosts and slow depot downloads.
**Fix:** Capture `cell_id` from the logon response in `connect_authed`, store it on `Authed`/`VentConn`, and pass it here. Confirm against the steam-user source recorded in `79-PARITY.md`.

## Info

### IN-01: Depot fetch failure message misreports the attempt count

**File:** `src-tauri/crates/gamelib-depot/src/fetch.rs:648,657`
**Issue:** Transport errors can now be retried for up to `TRANSIENT_BUDGET` (300 s), far beyond 8 attempts, but the message still says "failed after {self.attempts} attempts".
**Fix:** Report the real counter `i`, and say whether the outage budget was exhausted.

### IN-02: Transport errors early in a job never demote a dead host

**File:** `src-tauri/crates/gamelib-depot/src/fetch.rs:284,570-573`
**Issue:** `last_success` is initialised when the `Fetcher` is constructed. If the first fetch starts more than 10 s later, for example after a slow manifest request-code round trip, then every transport error until the first success is classed as an outage and not recorded in host health. A host that refuses connections keeps being picked at full weight until some other fetch succeeds. A chunk that fails with transport errors on every host also keeps retrying for as long as other chunks succeed, plus 300 s.
**Fix:** Use `Option<Instant>` for `last_success`, so there is no anchor before the first success, and record the outcome against host health when other hosts are reachable.

### IN-03: Unread `Done` sign-in flows keep the refresh token in memory indefinitely

**File:** `src-tauri/crates/gamelib-steamcm/src/webauth/mod.rs:452-466,469-483`
**Issue:** A `Done` flow is removed only when `status()` reads it. `cancel()` on a `Done` flow leaves it, and with it the token, in the map. A new `qr_start` removes an unread `Done` QR flow, which loses a completed sign-in.
**Fix:** Have `cancel()` remove terminal flows, and expire terminal flows after a short TTL.

### IN-04: A refresh token with an undecodable JWT `sub` reports `steamId: ""`

**File:** `src-tauri/crates/gamelib-steamcm/src/webauth/mod.rs:433`
**Issue:** `jwt_sub(&token).unwrap_or_default()` hands an empty SteamID to the app as a successful sign-in.
**Fix:** Set `Error { reason: Network/Protocol }`, or fall back to the `steamid` from `BeginAuthSessionViaCredentials` (it is available in `guard_ctx`).

### IN-05: The anonymous actor reports `Replaced` to connect waiters on an ordinary close

**File:** `src-tauri/crates/gamelib-steamcm/src/anon.rs:306-313`
**Issue:** `drop_conn` from `Close("logout"|"requested")` answers the pending connect waiters with `OpFailure::Replaced` (`kind: "replaced"`). That is the eresult-34 code, but nothing was replaced here.
**Fix:** Use `ShuttingDown`, or a dedicated `Closed`/`Cm(CmError::Closed)`.

### IN-06: Misplaced doc comment on `refresh_library`

**File:** `src-tauri/crates/gamelib-steamcm/src/facade.rs:660`
**Issue:** The doc comment "CLI-only: raw anonymous PICS buffers…" sits on `refresh_library`; it describes `capture_anon_pics`.
**Fix:** Move it to `capture_anon_pics` (line ~706).

### IN-07: A second `configure` updates `app_folder` but not the session's wrap

**File:** `src-tauri/crates/gamelib-steamcm/src/facade.rs` `configure_with`
**Issue:** `app_folder` is overwritten on every call, but the session (and its `RestoreOnlyWrap` with the first folder) is only built once. As a result, `wrap_restore_if_owed` and session shutdown could read different owed-record folders.
**Fix:** Make the first configure win for both values, or reject a differing folder.

### IN-08: SteamID is exposed on argv

**File:** `src-tauri/crates/gamelib-steamcm/src/macowned.rs:166-168`; `gamelib-steamcm-cli/src/main.rs:25-30`
**Issue:** The helper is spawned with `--expect-steamid <id64>`, and the CLI accepts `steamcm_owned_apps`, `steamcm_refresh` and `steamcm_mac_owned_apps` with a `steamId` on argv. Both are visible to other local users in `ps`. A SteamID is not a credential, but the review brief lists it as must-not-log.
**Fix:** Pass it through the environment or stdin to the helper, and add these ops to the CLI's argv refusal list if SteamIDs are treated as private.

### IN-09: `VentLogForwarder` takes the process-global tracing subscriber

**File:** `src-tauri/crates/gamelib-steamcm/src/vent.rs:516-521`
**Issue:** `steamcm_configure` installs it as the global default in the shell process. Any later `set_global_default` by another crate silently fails, and all non-steam-vent events are discarded (see WR-03).
**Fix:** Document this, or use a scoped dispatcher (`tracing::dispatcher::with_default`) only around the steam-vent tasks.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

# Slice B


# Phase 79 (slice B): Code Review Report

**Reviewed:** 2026-11-16
**Depth:** standard. main.rs, sidecar.rs and ipc_contract.rs were reviewed only as their phase diffs.
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The shell wiring is mostly mechanical and correct: the 28 channels agree across the enum, `ALL`, `from_name`, `name` and the dispatch match. Nothing in `steamcm_dispatch.rs` formats a token, password, guard code, key, SteamID or account name into a log line. The exit hook runs before `shutdown_child()`, and the shutdown is bounded. The CI `-p` list and the workspace members agree. The deny.toml waivers are reasoned correctly: the Marvin attack (RUSTSEC-2023-0071) needs a private-key decrypt, and the code never does one. The SEA shim and patch removals in `buildSidecarSea.ts` and `esbuildWorkerBundleShared.ts` are consistent.

There are two real defects:
1. The T-79-104 helper-path guard can be bypassed through `steamcm_refresh`.
2. On exit, the owed go-online "payment" is a detached fire-and-forget that clears the owed record before the URL is known to be opened.

Out of slice, noted for context only: removing the `openDiscordLink`/`openWikiLink` etc. entries from `RENDERER_CHANNELS` is in the diff range but comes from quick 261115-tk8, not Phase 79. It has no remaining callers.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: T-79-104 helper-path guard is bypassed by `steamcm_refresh` and checks only the file name

**File:** `src-tauri/src/steamcm_dispatch.rs:85-88` (with `:39-53`; `src-tauri/src/ipc_contract.rs:1640-1650`)

**Issue:**
- `rpc_steamcm_mac_owned_apps` refuses any `helperPath` that is not an absolute, non-climbing path named `steam-bridge-helper`. The stated reason (T-79-104) is "only the bundled helper's name may be spawned."
- `rpc_steamcm_refresh` accepts `source: {kind: "macSteam", helperPath, steamId}` and hands it straight to `gamelib_steamcm::dispatch`, with no path check.
- `refresh/mod.rs:202` then calls `mac_owned_apps(anon, Path::new(helper_path), …)`, and `macowned.rs:158` passes that to `Command::new(helper_path)`.
- So the same spawn is reachable with an arbitrary executable through the second channel. Example: `steamcm_refresh {source:{kind:"macSteam", helperPath:"/bin/sh", steamId:"1"}, …}` makes the shell spawn `/bin/sh`.
- Even on the guarded channel, the check pins only the basename. It does not pin the bundled location, so `/tmp/x/steam-bridge-helper` (an attacker-planted file) passes.

The practical impact is limited, because the sidecar is already a same-user process that can spawn on its own. But the control the threat model claims does not exist.

**Fix:** Validate in one place and apply it to both channels. Better still, compare against the shell's own resolved bundled path rather than a basename:
```rust
fn bundled_helper_ok(p: &str, app: &AppHandle) -> bool {
    let want = /* resolved resource path of steam-bridge-helper */;
    std::fs::canonicalize(p).ok().as_deref() == std::fs::canonicalize(want).ok().as_deref()
}
// rpc_steamcm_refresh:
let a = SteamcmRefreshArgs::from_args(args)?;
if a.source.kind == SteamcmRefreshArgsSourceKind::MacSteam {
    match a.source.helper_path.as_deref() {
        Some(p) if bundled_helper_ok(p, app) => {}
        _ => return Err("steamcm_refresh:bad-args".into()),
    }
}
```
This needs `app` threaded into the arm in `rust_dispatch.rs`. Add a test that drives `rpc_steamcm_refresh` with `/bin/sh`.

### WR-02: On exit, the owed record is cleared on a detached open that may never run

**File:** `src-tauri/src/steamcm_dispatch.rs:173-189`, `src-tauri/src/main.rs:749-750`

**Issue:**
1. `ShellWrapHost::open_steam_url` spawns a detached `std::thread` to call `opener().open_url` and returns `true` at once.
2. For `RestoreTrigger::Shutdown`, `wrap::restore_inner` (wrap.rs:398-403) has no `LogWatch`. It therefore calls `clear_owed(app_folder)` and returns `Restored` as soon as `open_steam_url` returns `true`.
3. On the exit path (`handle_exit` → `steamcm_exit_shutdown`), the main thread then returns to Tauri, which calls `process::exit`. The worker thread may not have spawned `/usr/bin/open` by then.
4. Any `open_url` error happens only after `true` was already reported, and it is merely logged.

**Failure scenario:**
1. GameLib boots while Mac Steam is not running, so the boot restore returns `KeptNotRunning` and keeps the record.
2. The user opens Steam, then quits GameLib.
3. The exit restore clears `owed` and logs `Restored`, but the process dies before (or while) the URL is opened.
4. Steam stays offline (Friends shows offline), and the record that would have retried at the next boot is gone.

**Fix:** Make the open synchronous with a short bound inside the host (the D-UAT-19 dialog-blocking concern applies to the worker thread, not here). Alternatively, return `true` only after the opener call succeeded:
```rust
let (tx, rx) = std::sync::mpsc::channel();
std::thread::spawn(move || { let _ = tx.send(app.opener().open_url(url, None::<&str>).is_ok()); });
rx.recv_timeout(Duration::from_secs(2)).unwrap_or(false)
```
Alternatively, do not `clear_owed` on the `Shutdown` trigger until confirmation, and leave the record for the next boot's confirmed restore.

## Info

### IN-01: Secret-bearing arg structs derive `Debug`

**File:** `src-tauri/src/ipc_contract.rs:1602, 1660, 1754, 1768`

**Issue:** `SteamcmRedeemKeyArgs.key`, `SteamcmSessionAcquireArgs.refresh_token`, `SteamcmSigninCredentialsStartArgs.{account_name,password}` and `SteamcmSigninGuardSubmitArgs.code` all `#[derive(Debug)]`. Nothing formats them today. But the first `{:?}`, `dbg!` or `expect` on a containing type writes a refresh token or password to the shell log (T-28-04). The shell test that scans for secret logging cannot catch a `Debug` derive.

**Fix:** Have the generator emit a manual redacting `Debug` for these four structs. Alternatively, wrap the fields in a `Redacted<String>` newtype.

### IN-02: Crash path runs the steamcm shutdown before reaping the dead sidecar and showing the dialog

**File:** `src-tauri/src/sidecar.rs:666-672`

**Issue:** `on_sidecar_eof_drop_steamcm()` (bounded at 5 s) runs before `on_sidecar_eof` → `surface_dead_sidecar` → `reap_dead_sidecar_tree`. On an unexpected sidecar death, the orphaned process group stays alive and the user sees no dialog for up to 5 s while the CM session logs off.

**Fix:** Either surface and reap first and then shut steamcm down, or run `on_sidecar_eof_drop_steamcm` on its own thread. The `Exit` path already performs its own bounded shutdown.

### IN-03: A skipped shutdown is logged as `TimedOut`

**File:** `src-tauri/src/steamcm_dispatch.rs:287-291` (via `facade.rs:750-752`)

**Issue:** `shutdown_all` maps `block_on_guarded`'s `Err("steamcm:nested-runtime")` to `RestoreOutcome::TimedOut`. If `handle_exit` or the reader thread is ever entered from inside a tokio context, no logoff or restore runs at all, yet the log says `steamcm shutdown (exit): TimedOut`, which is indistinguishable from a slow Steam. The shell test (`eof_and_exit_hooks_return_within_bound_when_unconfigured`) runs on a plain thread, so it cannot detect this.

**Fix:** Return a `Result` or a distinct outcome (`Refused`) from `shutdown_all`, and log it as such.

### IN-04: `connection_log_path` resolves relative to the CWD when `HOME` is unset

**File:** `src-tauri/src/steamcm_dispatch.rs:207-212`

**Issue:** `unwrap_or_default()` gives `""`, so the probe reads `./Library/Application Support/Steam/logs/connection_log.txt`. That breaks the "Logged On" fallback check without any notice.

**Fix:** Fall back to `dirs::home_dir()`, or return a path that cannot exist so the probe fails explicitly.

### IN-05: `runSteamcmCliSync` has no timeout

**File:** `meta/gamelibSteamcmCli.ts:103-107`

**Issue:** `spawnSync` is called without a `timeout`. A stalled anonymous CM connection in `pnpm steamcm-capture-fixtures` hangs the tool indefinitely, and the fake-HOME profile is never disposed.

**Fix:** Add `timeout: 120_000, killSignal: 'SIGKILL'` and include `r.signal` in the error.

### IN-06: `STEAMCM_SECRET_OPS` is a hand mirror without a parity test, and `parseSteamcmNdjson` is dead

**File:** `meta/gamelibSteamcmCli.ts:31-36, 85-90`

**Issue:**
- The TS list mirrors the CLI's `SECRET_OPS` (`gamelib-steamcm-cli/src/main.rs:25-30`) only by comment. A new Rust secret op added without the TS update would be put on argv, where `ps` can see it, before the CLI refuses it with exit 64.
- `parseSteamcmNdjson` has had no caller since the stdin runners were removed in 79-42 (only its own test uses it).

**Fix:** Add a jest test that reads the Rust source, or a CLI `--list-secret-ops`, and compares the two lists. Delete `parseSteamcmNdjson` and its test.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

# Slice C1


# Phase 79: Code Review Report (slice C1)

**Reviewed:** 2026-11-16
**Depth:** standard (with targeted cross-file tracing into rustSession.ts, depotRust/install.ts, the frontend SteamLogin poller and the gamelib-steamcm facade where a listed file's behaviour depended on them)
**Files Reviewed:** 40
**Status:** issues_found

## Summary

The secret-handling discipline holds up. No refresh token, password, guard code, product key,
SteamID or account name reaches a log line in the reviewed files. Error logging is restricted to
`err.name`, `kind` and `eresult`. The Rust sign-in `reason` is a closed enum
(`FlowErrorReason`). Every new timer in scope is unref'd (`sleepUnref`, and the bounded 200-iteration
wait), and nothing in scope starts work at import or boot.

The defects are in the concurrency model. Under steam-user there was one client object, so
"whichever client `getClient()` returns" did not matter. Under per-lease Rust clients it does
(CR-01). Several Phase 79 rewrites also moved a read earlier or made a call block where it used to
return at once. Each of those moves widens a lost-update or duplicate-completion window that the
old ordering kept closed (WR-01, WR-04, WR-06).

## Critical Issues

### CR-01: `getClient()` hands out the most recently acquired lease, not the caller's, so an install can end up on a lease that a concurrent Refresh releases

**File:** `src/backend/storeManagers/steam/user.ts:150-152` (delegates to `rustSession.ts:73-77`); consumed by `src/backend/storeManagers/steam/depot/plan.ts:69-79` (`getDepotClient`) and through it by `depotRust/install.ts:184` and `:378`, `depotRust/secondary.ts:76,165,257`, `depotRust/updateEstimate.ts:108` and `depot/sharedRedist.ts:279`

**Issue:** `RustCmSession.getClient()` returns the last entry of a `Map<leaseId, client>`, meaning the most recently acquired lease that is still live. Every depot consumer gets its client through `getDepotClient(steamUser)` → `getClient()`. It does not use the `lease.client` from its own `acquireAuthenticated`. Each `RustCmClient` is bound to one `leaseId`. The Rust facade answers ops on a released lease with `{ok:false, kind:'leaseUnknown'}` (`gamelib-steamcm` refresh/mod.rs:158 and the `signed()` path).

Failure scenario:
1. The user starts an install, which acquires lease 1.
2. A store-exit or explicit Refresh acquires lease 2 (`refresh.ts:61`).
3. The install's `rustInstall` calls `getDepotClient()` at `install.ts:184` and `:378` and receives lease 2's client. It captures that client in `requestCodeRefresher(...)` for the whole depot job, which can run for hours.
4. The Refresh finishes and calls `release()` (`refresh.ts:133`). Rust drops lease 2.
5. The next manifest request-code refresh or content-server call from the install fails with `leaseUnknown`, and the download fails.

`withPlanBuildRetry` hides this for plan steps only, because it calls `getDepotClient()` again on each attempt. Clients captured once for a whole job are not covered. Under steam-user every lease shared one client, so this is new in Phase 79.

**Fix:** Thread the caller's own lease client through, and stop resolving a client from global state:
```ts
// depotRust entry points / downloadSharedRedistDepots already hold `lease`:
const client = lease.client            // not getDepotClient(opts.steamUser)
// withPlanBuildRetry(client, ...) and requestCodeRefresher(client, ...)
```
If a fallback for the `acquireOpenAuthenticated` path must stay, make `getClient()` return a client whose lease the caller provably holds. Better still, remove `getClient()` from `DepotSteamUser` so the compiler forces every site onto its lease.

## Warnings

### WR-01: The Rust Refresh snapshots install state before a call of up to 150 s, then overwrites the library and store with that stale snapshot (regression)

**File:** `src/backend/storeManagers/steam/library/rustRefresh.ts:78-117` (snapshot), `:147-165` (apply)

**Issue:** `buildRustRefreshInputs` builds the installed, bottle, bridge and incomplete maps and `previousGames` before `steamcm_refresh`, which does owned apps, PICS capture and store enrichment (up to the 150 s deadline). `applyRustRefreshResult` then runs `library.clear()`, replaces every entry with Rust's games (derived from the old snapshot), and persists them with `steamLibraryStore.set('games', …)`. The pre-79 `syncOwnedLibrary` built `installedMap`, the incomplete set and the resume breadcrumbs immediately before `library.clear()` (old refresh.ts:284-356), after the slow CM work. That kept the window to milliseconds.

Failure scenarios, all inside one Refresh:
- An install finishes, or `refreshInstallState` flips a game to installed. The Refresh reverts the game to not installed and persists that.
- An uninstall completes. The game comes back as installed with a dead `install_path`, and Play fails.
- An install starts and writes `steamResumeTargetSteamappsDir`/`steamResumeInstalldir`. The breadcrumb is not in `previousGames`, so Resume Install becomes a bare Install. This is the D-UAT-09 symptom the old code fixed explicitly.

The next window-focus reconcile repairs only the first two cases.

**Fix:** Re-read install state after the Rust call returns, under `withPlatformCaptureLock`, and overlay it onto `result.games` before the swap. Re-apply breadcrumbs from the live `library` as it stands just before `clear()`. Alternatively, split the op so Rust returns owned and metadata data and TS builds install fields at apply time, as the old code did.

### WR-02: Signing out during sign-in finalisation brings the signed-out account back

**File:** `src/backend/storeManagers/steam/userSignIn.ts:158-179`, `:38-76`; interacts with `src/backend/storeManagers/steam/user.ts:299-339`

**Issue:** `finalizeRustSignIn` has no sign-out fence. It awaits `setToken`, then sets `isLoggedIn=true`, clears `credentialsMissing`, calls `noteSignInSucceeded`, and later (in `resolveProfile`) writes `userData`. `logout()` bumps `sessionGeneration` and calls `resetSignInState()`, but nothing in finalize checks either one.

Failure scenario: a sign-out (or the sign-in window's own 110 s QR restart via `dropPreviousForRust`, which nulls the slot) lands while finalize is awaiting `setToken` or the persona logon.
- `logout()` runs `clearToken()` and deletes `isLoggedIn` and `userData`.
- Finalize then resumes and writes `isLoggedIn=true` and `userData` for an account the user just signed out of.
- If `setToken` lands after `clearToken`, the keyring holds the token again.
- If it lands before, `isLoggedIn` is true with no token. The next acquire then latches `credentialsMissing`.

The persona acquire is fenced (`rustSession.ts:166`), but the store writes are not.

**Fix:** Capture a sign-in token or generation at the start of finalize, and check it after every await:
```ts
const stillCurrent = () => deps.steamSession.signIn.getSession() === slot
await deps.tokenStore.current().setToken(done.refreshToken)
if (!stillCurrent()) { await deps.tokenStore.current().clearToken(); throw new Error('sign-in superseded') }
deps.stores.steam.configStore.set('isLoggedIn', true)
...
// in resolveProfile, skip the userData write when !stillCurrent()
```

### WR-03: One failed status read permanently fails the sign-in and orphans a live Rust flow

**File:** `src/backend/storeManagers/steam/userSignIn.ts:137-144` (and its consumers at `:204-208`, `:283-286`, `:369-373`)

**Issue:** `readFlowStatus` maps any rejection of `steamcm_signin_status` to `{status:'error'}`. A rejection here can be the generic 60 s rustInvoke timeout (this channel is bounded) or a transient transport hiccup. The callers then:
- latch `setQrSessionState({status:'error'})` or `setCredSessionState({status:'error'})`;
- return `error`, so the frontend stops polling (credential path) or throws the QR away;
- never cancel the Rust flow.

If the user had already approved on the phone, Rust completes the flow and holds a refresh token that nobody collects. The user is told sign-in failed and has to start again. For the credential path, that means re-typing the password and getting a second phone prompt.

**Fix:** Treat a transport failure as `waiting`, bounded by a small consecutive-failure counter. Only after N failures latch `error` and call `fireAndForgetCancel(deps, slot.flowId)`:
```ts
} catch (err) {
  if (slot.finalize) return { status: 'finalizing' }
  slot.readFailures = (slot.readFailures ?? 0) + 1
  if (slot.readFailures < 3) return { status: 'waiting' }
  fireAndForgetCancel(deps, slot.flowId)
  return { status: 'error' }
}
```

### WR-04: Store enrichment snapshots the metadata entry before the network fetch and writes it back without checking, clobbering concurrent Refresh and capture writes (regression)

**File:** `src/backend/storeManagers/steam/gameMetadata.ts:19-36`

**Issue:** `enrichViaRust` reads `cached` before `steamcm_store_enrich`, which includes the HTTP fetch, and then writes `steamMetadataStore.set(appId, entry)` with no check. The pre-79 code read `existing`/`existingMeta` after the fetch. The Rust Refresh protects its own writes against exactly this interleaving (T-79-127, `rustRefresh.ts:130-137`, with `withPlatformCaptureLock`). The enrichment writer takes no lock and does no stale check, so the protection only covers one direction.

Failure scenario: enrichment for app X starts with a cold entry. A Refresh's PICS capture then writes X's `platformsCaptured`, `is_windows_native` and `mac_arch`. Enrichment completes and `set`s an entry merged from the pre-capture snapshot, which throws away the captured platform flags. A third writer also exists: lazy per-game capture.

**Fix:** Run the read-compare-write under the same lock:
```ts
await deps.steamLaunchRuntime.platformCapture.withPlatformCaptureLock(async () => {
  if (!isDeepStrictEqual(deps.stores.steam.steamMetadataStore.get(appId) ?? null, cached)) {
    // stale: re-run the merge on the fresh entry, or skip and let the next enrich retry
    return
  }
  deps.stores.steam.steamMetadataStore.set(appId, entry)
  ...
})
```

### WR-05: Verifying an ambiguous redeem can report success for a key that did not redeem

**File:** `src/backend/storeManagers/steam/userRedeem.ts:60`, `:146-149`; root cause in `src/backend/storeManagers/steam/rustSession.ts:193`

**Issue:** The pre-redeem snapshot is `packageIds(client.licenses)`. `buildClient` sets `licenses = l.ok ? l.result : []`, so a failed `steamcm_licenses` on the redeem lease gives an empty licence list that cannot be told apart from "owns nothing".

Failure scenario: the licence fetch on the redeem lease fails. `before` is then an empty set. The redeem goes `ambiguous`. `verifyAmbiguousRedeem` acquires a fresh lease whose licences load correctly. Every package the account owns now counts as "added", so the code logs `outcome=success` and returns success with a bogus `packageList`, whatever happened to the key. The user is told an invalid or duplicate key worked.

The same empty fallback also makes `plan.ts` `getOwnedSets` see no owned depots, which produces a misleading "not owned" install failure.

**Fix:** Keep the licences as `null` when they are unknown (`licenses: l.ok ? l.result : null`, or fail `buildClient`). In `redeemOnce`, take an ambiguous result with an unknown `before` straight to `failure`:
```ts
if (e?.steamcmKind === 'ambiguous') return client.licenses == null ? failureResult : before
```

### WR-06: `pollQRLogin` and `pollCredentialLogin` now block on the whole persona logon, so the frontend's overlapping 2 s polls each finish the sign-in

**File:** `src/backend/storeManagers/steam/userSignIn.ts:270-282`, `:359-367`; consumer `src/frontend/screens/Login/components/SteamLogin/index.tsx:152-170`, `:199-224`

**Issue:** The poll now awaits `finalizeRustSignIn`, which includes `resolveProfile`: a cold signed-in CM logon (Rust `LOGON_BOUND` 35 s) plus `getPersonas` (5 s). Overlapping polls return `finalizing` and await the same memoised promise. The frontend polls with `setInterval(async …, 2000)`, which does not wait for the previous call, so a finalize of several seconds leaves several polls in flight. They all resolve `{status:'done', username}` together, and each one runs `clearPollInterval()`, `await steamLogin(...)` and `finishSignIn()`.

`steamLogin` calls `resetRunnerLibrary('steam')` and fires `refreshLibrary({library:'steam', …})`, so one sign-in triggers N resets and N concurrent Steam Refreshes. Those Refreshes also hit the lease-attribution problem in CR-01 and the snapshot race in WR-01.

The frontend was written for the old contract. Its comments describe it: "QR approved but username not yet populated … keep polling", which is a `done` without `username` returned at once while the profile resolves in the background. Exactly one later poll then carried the username.

**Fix:** Do not await finalize inside the poll. Start it, and report `done` without a username until it settles:
```ts
if (r.status === 'done' || r.status === 'finalizing') {
  void finalizeRustSignIn(deps, slot, r).then(
    (username) => signInState.setQrSessionState({ status: 'done', username }),
    () => signInState.setQrSessionState({ status: 'error' })
  )
  return { status: 'done' } // frontend keeps polling until username is present
}
```
Apply the same change to `pollCredentialLogin`. A frontend in-flight guard on the interval would also help, but the backend contract change caused the regression.

## Info

### IN-01: `getUserOwnedApps` has no production caller and silently drops `filterAppids`

**File:** `src/backend/storeManagers/steam/cm/RustCmClient.ts:151-164`, `src/backend/storeManagers/steam/cm/SteamCmClient.ts:43-50`
**Issue:** Nothing in `src/` calls `getUserOwnedApps` (Refresh goes through `steamcm_refresh`). The interface still advertises `filterAppids`, and the implementation ignores it. A future caller would get the full owned set back without being told.
**Fix:** Remove the method from `SteamCmClient`/`RustCmClient`, or forward `filterAppids`.

### IN-02: `logout()` closes the anonymous session twice

**File:** `src/backend/storeManagers/steam/user.ts:306` and `:318-320`
**Issue:** `this.deps.anonymousClient.close('logout')` already sends `steamcm_anon_close {reason:'logout'}`, and the `try` block sends it a second time. The duplicate is harmless but redundant. If `steamcm_session_logout` rejects, the second close is skipped and gets logged as a "logout failed".
**Fix:** Drop the second `RUST_STEAMCM_ANON_CLOSE` invoke.

### IN-03: `tryMacSteamRefresh` does not match its contract

**File:** `src/backend/storeManagers/steam/library/rustRefresh.ts:283-330`
**Issue:** The docstring says every failure is a fallback, but an apply failure calls `syncFailed`, which throws out of `refresh()`. The Mac path also discards `bridgeAppIds` (`:300`), so the bridge launch-target backfill the CM path runs (`:238-249`) never happens there. This is low impact while `GAMELIB_STEAM_MAC_PATH` stays off by default.
**Fix:** Return `{kind:'fallback'}` on an apply failure, or correct the doc. Either run the backfill or record why it is skipped.

### IN-04: The exit-contract test does not check `unref`

**File:** `src/backend/storeManagers/steam/__tests__/userSignIn.rustEngine.test.ts:218-235`
**Issue:** The test named "polls every second on unref timers" spies on `global.setTimeout` and asserts it was called. It never checks that `.unref()` was called on the returned handle, so removing `handle.unref?.()` from `sleepUnref` (userSignIn.ts:97-102) would still pass.
**Fix:** Wrap the returned handle (`jest.spyOn(global,'setTimeout').mockImplementation(...)` returning an object with a `jest.fn()` `unref`) and assert that `unref` was called.

### IN-05: Comments still describe steam-user behaviour

**File:** `src/backend/storeManagers/steam/user.ts:157-181` and `:186-189`, `src/backend/storeManagers/steam/userRedeem.ts:12-16` and `:78-83`, `src/backend/storeManagers/steam/userTypes.ts:56-58`, `src/backend/storeManagers/steam/depot/plan.ts:72-76` (error text "no authenticated steam-user client")
**Issue:** These comments cite `node_modules/steam-user` sources, "steam-user schedules no retry", and "through the go-offline wrap". Both packages were removed in this phase and CLAUDE.md says there is no go-offline wrap. The comments now misstate the behaviour they describe.
**Fix:** Rewrite them against the Rust session's semantics.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

# Slice C2


# Phase 79 (slice C2): Code Review Report

**Reviewed:** 2026-11-16
**Depth:** standard (phase diff only for bootstrap.ts, sidecarTransport.ts and the large test files)
**Files Reviewed:** 27
**Status:** issues_found

## Summary

No secret leaks found in this slice. The refresh token, password, guard code, SteamID and account
name never reach a log line in the changed code. `depotHostRegistration` logs the error name only,
and the boot configure/restore log `String(error)` from a Rust reply that carries no args.
The sidecar exit contract holds: the new timers in `requestRustInvoke` are still `unref()`'d, and the
18 new unbounded channels add only Map entries and promises, which do not hold the event loop.
No new timer, watcher or handle is created at boot.

The defects are in four areas:
- the Steam Guard retry path in the login dialog;
- the classification of a signed-out CM failure during a depot install;
- the one-shot, unretried `steamcm_configure`, which every signed-in op silently depends on;
- two vacuous "swallows a rejection" tests.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Guard-code retry restarts the credential poll after an await without a mounted/active check, leaking an interval past dialog close

**File:** `src/frontend/screens/Login/components/SteamLogin/index.tsx:322-334` (same pattern pre-exists at 290-305)
**Issue:** `handleGuardSubmit` awaits `steamSubmitGuard`. That call can take a long time, because the backend `rustWaitSettle` keeps polling the Rust flow. The function then calls `startCredPoll()` unconditionally on the error branch. The dialog's close button stays enabled the whole time (`showCloseButton`, `onClose={closeWindow}`, lines 743-749).
**Failure scenario:**
1. The user types a wrong code and closes the dialog while the submit is in flight.
2. The mount effect's cleanup (line 246) has already run, so the new 2 s interval from `startCredPoll` is never cleared.
3. The interval polls `steamPollCredential` for the life of the renderer.
4. If the user later approves on the phone, the leaked poll calls `steamLogin(...)`, and the account is signed in after the user dismissed the sign-in.

The same leak happens if the user switches to the QR tab mid-submit (`handleTabChange` clears the poll before the restart). A credential poll then runs beside the QR poll, and both can call `steamLogin`.
**Fix:** Track liveness in a ref and restart only when the dialog is still mounted and on the credentials step:
```tsx
const mountedRef = useRef(true)
useEffect(() => () => { mountedRef.current = false }, [])
...
} else {
  if (mountedRef.current && activeTabRef.current === 'credentials') startCredPoll()
  showError(...)
}
```
Apply the same guard to `handleCredentialSubmit` at line 305.

### WR-02: "Incorrect code" plus a poll restart for every guard failure, including a dead flow

**File:** `src/frontend/screens/Login/components/SteamLogin/index.tsx:331-337` (backend: `src/backend/storeManagers/steam/userSignIn.ts:377-411`)
**Issue:** `submitSteamGuardCode` returns `{status:'error'}` in four cases:
- a wrong code (EResult 65), where the flow stays in guardRequired;
- no active session;
- a rustInvoke rejection;
- a `rustWaitSettle` failure, which also sets `credSessionState='error'`.

The new branch treats every one as a retryable wrong code. It restarts the poll and says "Incorrect code".
**Failure scenario:** The Rust flow expires or is denied on the phone while the user types. The submit returns error, and the UI says "Incorrect code" and restarts the poll. The poll's first tick sees `credSessionState === 'error'` and stops silently. The user re-enters a correct code against a dead flow and gets "Incorrect code" again, with no hint to go back and restart.
**Fix:** Return a discriminated result from `submitSteamGuardCode`, for example `{status:'error', retryable: r.eresult === 65}`. Restart the poll and show "Incorrect code" only when `retryable`. Otherwise show "Sign-in expired, start again" and return to `credentials-1`.

### WR-03: A signed-out CM failure during a depot install is reported to the crate as a network error

**File:** `src/backend/sidecar/depotHostRegistration.ts:94-102`
**Issue:** The new allow-list returns `{unavailable: 'leaseUnknown'}` before the `not_signed_in` regex runs. On the Rust side, `Refusal::NotSignedIn` maps to `OpFailure::LeaseUnknown` (`src-tauri/crates/gamelib-steamcm/src/session.rs:737`, also 987). The depot crate recognises only `not_signed_in` (`src-tauri/crates/gamelib-depot/src/fetch.rs:396`) and maps every other reason to `ErrorKind::Network`.
**Failure scenario:** The user signs out, or the session fails recovery, while an install needs a fresh manifest request code. Before this phase this produced `not_signed_in`, and the job surfaced the "sign in" action. Now the job fails as a transient network error. The user retries forever without being told to sign in.
**Fix:**
```ts
if (kind === 'leaseUnknown') return { unavailable: 'not_signed_in' }
if (kind === 'timeout' || kind === 'network') return { unavailable: kind }
```
Alternatively, teach `fetch.rs` that `leaseUnknown` means NotSignedIn. Update `depotHostRegistration.rust.test.ts:96-105` to match.

### WR-04: `steamcm_configure` is fire-and-forget and one-shot; a failure or slow answer silently disables every signed-in op and the owed go-online restore for the whole boot

**File:** `src/backend/sidecar/bootstrap.ts:1397-1414, 2779-2790`
**Issue:** The Rust session actor is spawned only inside `configure` (`facade.rs:159-164`). Until configure succeeds, `session_acquire` returns `client-not-ready` and `wrap_restore_if_owed` returns `NotOwed` because `app_folder` is None (`facade.rs:174-176, 489-495`). Boot sends configure once and never retries. A rejection is downgraded to `logWarning`. On macOS, configure can fail with `steamcm:wrap-host-missing`, and it can also time out at the 60 s generic cap. In both cases nothing re-arms it.

Only the boot restore waits on `state.steamCmConfigured`. The IPC handlers are registered in `register-handlers`, before `steamcm-configure`. Since each rustInvoke runs on its own shell thread, a renderer-initiated sign-in, Refresh or redeem dispatched near boot can reach Rust before configure has run.
**Failure scenario:**
1. Configure fails once (host-missing ordering bug, or a slow first `block_on_guarded`).
2. Every Refresh, depot key and install returns `client-not-ready` for the rest of the app session.
3. The owed Mac Steam go-online from a previous crash is reported as `NotOwed` and never paid, so Mac Steam stays offline.

The only trace is one warning line.
**Fix:**
- Expose `steamCmConfigured` (or a `ensureSteamCmConfigured()` that retries on failure) through the services. Have `rustSession`, `RustCmClient` and the restore await it before any session op.
- Alternatively, have the Rust facade lazily self-configure from a path the shell already knows. Rust should also return a distinct `notConfigured` refusal instead of `client-not-ready` / `NotOwed`, so the failure is visible.

### WR-05: A stale QR poll can redraw a dead challenge over a freshly restarted flow

**File:** `src/frontend/screens/Login/components/SteamLogin/index.tsx:199-202, 218-230`
**Issue:** `clearPollInterval()` does not cancel a poll callback that is already awaiting `steamPollQR()`. When the 110 s refresh timer (or the error branch) restarts the flow, `startQRFlow` sets `challengeUrl` to null and then to the new flow's URL. The old in-flight poll then resolves and runs `setChallengeUrl(current => nextQrChallengeUrl(current, poll))`. Its `challengeUrl` was rotated from the old slot (`userSignIn.ts:290-295`) and differs from `current`, so it replaces the new flow's code.
**Failure scenario:** The challenge rotates about every 22 s and the auto-refresh fires at 110 s (5 x 22), so a rotation landing in the same poll as the restart is realistic. The user is shown a code for a cancelled flow, and the scan does nothing until the next rotation of the new flow.
**Fix:** Stamp each flow with a generation ref. In the poll callback, drop the result if the generation changed:
```tsx
const gen = ++qrGenRef.current
pollIntervalRef.current = setInterval(async () => {
  const poll = await window.api.steamPollQR()
  if (gen !== qrGenRef.current) return
  ...
```

### WR-06: The "swallows a rejection" tests cannot fail

**File:** `src/backend/sidecar/__tests__/bootstrap.steamcm.test.ts:44-49, 92-99`
**Issue:** `expect(() => configureSteamCm({...bad})).not.toThrow()` checks only that a promise-returning function does not throw synchronously, which is always true. The returned promise is never awaited, and `logWarning` is never asserted. If the `.then(_, onRejected)` were removed, the test would still pass: the unhandled rejection surfaces after the test, or never. The same applies to `restoreOwedMacSteamOnlineAtBoot`.
**Fix:**
```ts
await expect(configureSteamCm({ appFolder: '/app', requestRustInvoke: bad })).resolves.toBeUndefined()
expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('steamcm_configure failed'), expect.anything())
```
For the restore, flush with `setImmediate` and assert `logWarning` was called.

## Info

### IN-01: Stale comments now contradict the Phase 79 ownership model

**File:** `src/backend/sidecar/steamAuthFlowRegistration.ts:379-381`, `src/backend/sidecar/bootstrap.ts:2795-2797, 2783`
**Issue:**
- `steamGoOfflineRetry` says it "arms the one-shot guided restore". Nothing in the sidecar arms anything any more (see the comment at 415-417).
- `mac-steam-online-restore` says "kill -9 of the sidecar is covered ONLY here". A sidecar kill -9 now closes the sidecar's stdout, which fires the shell's `on_sidecar_eof_drop_steamcm` hook. Only a shell kill is boot-only.
- `steamcm-configure` says "configuring is harmless". Configure is in fact mandatory: it spawns the session actor (see WR-04).

**Fix:** Reword the three comments.

### IN-02: `getSteamInstallSize`'s `deps` is optional but required for any result

**File:** `src/backend/sidecar/steamAuthFlowRegistration.ts:256`, `src/backend/downloadmanager/downloadqueue.ts:334-338` (callee `src/backend/storeManagers/steam/gameRequirements.ts:34-90`)
**Issue:** The axios fallback is gone. Without `deps`, the function returns `'?? MB'` for every uninstalled title. A future caller that omits it type-checks and silently degrades.
**Fix:** Make `deps: RustInvokeDeps` a required parameter. Reorder it before `gameInfo`, or pass an options object.

### IN-03: `steamGoOfflineCancel` is a kept no-op channel with a live caller

**File:** `src/backend/sidecar/steamAuthFlowRegistration.ts:415-418`
**Issue:** `SteamGoOfflineNotice.tsx:52` still calls it, and its error handler logs a "54 steamGoOfflineCancel failed" line. The channel is dead plumbing kept "so the dialog's channel contract is unchanged". Nothing records when it can be removed.
**Fix:** Remove the renderer call and the channel together, or add a todo that tracks the removal.

---

_Reviewed: 2026-11-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
