---
status: awaiting_human_verify
trigger: "Phase 54 live gate item 11 (2026-10-28): shell kill -9 ~1 s into a wrapped Refresh; the authenticated logon completed 7 s AFTER stdin EOF while Mac Steam was back online, the refresh ran to completion, the wrap fired a late goonline, and the sidecar never exited (orphaned, PPID 1, alive 107 s later)."
created: 2026-10-28
updated: 2026-10-28
---

## Current Focus

hypothesis: CONFIRMED. Two compounding defects, one in steam-user's contract and two in user.ts.
next_action: (fix committed 95a89d8d3) human verification. Rebuild the sidecar (restart tauri:dev), re-run 54-LIVE-GATE item 11 and confirm: no `[Timing] SteamUser.loggedOn` after `[sidecar] stdin closed:`, no `Steam library sync complete` after it, `pgrep -f build/main/sidecar.js` empty within 10 s, Friends not signed out.

reasoning_checkpoint:
  hypothesis: "After stdin EOF, releaseForShutdown's client.logOff() ends the CM socket, but steam-user's _logonMsgTimeout (armed by _sendLogOn, never cleared by logOff) fires 5 s later and re-logs on with the saved refresh token via _enqueueLogonAttempt -> logOn(true). The new logon lands ~7 s after EOF with Mac Steam already back online. user.ts keeps it because the loggedOn handler ignores shuttingDown, and releaseForShutdown never called abandonPendingLogon. So the wrap waited, ran the refresh and fired a late goonline, and the kept, lease-less session (no idle timer) held the event loop forever."
  confirming_evidence:
    - "steam-user 5.3.0 source: _logonMsgTimeout is cleared only in _handleLogOnResponse; _disconnect/_cleanupClosedConnection never touch it; its handler calls _enqueueLogonAttempt regardless of autoRelogin."
    - "Real-library harness: logOff() 1 ms after ClientLogon -> 'Logon message timeout elapsed. Attempting relog.' at +5.0 s -> 'Firing queued login attempt' + second _doConnection at +6.0 s."
    - "Live timing matches: EOF 10:24:20 -> loggedOn 10:24:27 (5 s + 1 s backoff + ~1 s connect); the previous passing run logged on before the kill, so logOff hit a logged-on client with no pending timeout."
    - "user.ts: loggedOn handler only checks sessionGeneration; releaseForShutdown has no abandonPendingLogon call; refresh's bare ensureConnected arms no idle timer."
  falsification_test: "If clearing _logonMsgTimeout before logOff() still showed a second _doConnection in the harness, or a ClientLogon in flight could still produce loggedOn through a different retry path, the library half of the hypothesis is wrong."
  fix_rationale: "Clearing the logon-message timeout removes the only path by which a logOff()'d mid-logon client reconnects by itself, so no new ClientLogon is sent after shutdown (stops it at the source, not after the fact). Abandoning the pending logon in releaseForShutdown settles the wrap at EOF, so it goes online at once (its shutdown branch) and the refresh sees a 'shutting-down' refusal. The loggedOn shutdown check is a backstop for any logon that still lands. Together with the socket ended by logOff, no referenced handle survives."
  blind_spots: "A ClientLogon already sent and accepted by the CM before the socket closes: the CM may count it as a session briefly even though we never see loggedOn; cannot be cancelled client-side. Not observed live (live failure was the 5 s retry). Not exercised against a real CM in this session (hard limit: no GameLib/Steam launch); verified with the real steam-user library offline plus unit tests."

## Symptoms

expected: after stdin EOF (releaseForShutdown), no authenticated logon completes; the wrap settles without a refresh or a late goonline; the sidecar drains and exits.
actual: logon at 10:24:19 (`CM logon mode=authenticated reason=user-refresh wrap=toggled`); EOF 10:24:20 (`[sidecar] stdin closed ...`, `go-offline restore trigger=shutdown: firing goonline`); `[Timing] SteamUser.loggedOn` 10:24:27; `cold-connect path took 7935ms`; owned games fetched, sync complete; `go-offline wrap: firing goonline` 10:24:27; `online not confirmed within 10000ms, marker kept` 10:24:37 (false negative); sidecar orphaned with PPID 1, alive 107 s later.
errors: none (warning only: `online not confirmed within 10000ms, marker kept`)
reproduction: Mac, signed in, Mac Steam Logged On; press Refresh (wrapped authenticated logon); kill -9 the shell ~1 s later, before loggedOn.
started: Phase 54 (wrapped logon + releaseForShutdown). Previous gate run of the same scenario passed because loggedOn landed (~1 s) before the kill.

## Eliminated

## Evidence

- timestamp: 2026-10-28
  checked: ~/Library/Logs/GameLib/gamelib.log lines 67-84
  found: EOF at 10:24:20, loggedOn at 10:24:27. steam-user 'debug' events are not logged, so the CM-level sequence is not directly visible.
  implication: 7 s gap between logOff and loggedOn needs a mechanism; a plain slow connect continuing would not explain it if logOff ended the connection.

- timestamp: 2026-10-28
  checked: steam-user 5.3.0 source (09-logon.js logOn/_doConnection/_sendLogOn/_disconnect/_enqueueLogonAttempt, 02-connection.js _cleanupClosedConnection/_cancelReconnectTimers)
  found: _sendLogOn() arms `this._logonMsgTimeout = setTimeout(() => { this._disconnect(true); this._enqueueLogonAttempt() }, 5000)`. It is cleared ONLY in _handleLogOnResponse. Neither logOff()/_disconnect() nor _cleanupClosedConnection() clears it. _enqueueLogonAttempt -> 1 s backoff -> logOn(true) (saved details incl. refresh token) -> _initProperties deletes _connectionClosed -> fresh full connect. autoRelogin:false does not gate this path.
  implication: a logOff() after ClientLogon is sent but before the response re-logs on by itself ~6 s later.

- timestamp: 2026-10-28
  checked: scratch harness (scratchpad/harness/repro.js) driving the REAL steam-user 5.3.0, _doConnection/_send stubbed, dataDirectory null, no network
  found: |
    after-sendlogon: ClientLogon sent at +101ms, logOff() at +102ms (connection.end called, _logonMsgTimeout still pending), +5103ms "Logon message timeout elapsed. Attempting relog.", +6104ms "Firing queued login attempt", +6105ms _doConnection called a 2nd time.
    during-connect (connection object exists, ClientLogon not yet sent): logOff() ends it; no second _doConnection in 7.5 s. Effective.
    same-tick (logOff() before logOn's process.nextTick body runs): connect proceeds (_initProperties deletes _connectionClosed). Ineffective, but unreachable from releaseForShutdown: stdin EOF is an I/O callback and cannot run between logOn() and its nextTick.
  implication: CONFIRMED mechanism for the live 7 s gap: EOF 10:24:20 + 5 s logon-message timeout + 1 s backoff + ~1 s connect/logon = loggedOn 10:24:27.

- timestamp: 2026-10-28
  checked: user.ts connectSteamUserClient loggedOn handler, releaseForShutdown
  found: loggedOn checks only `opts.generation !== this.sessionGeneration`, never `shuttingDown`, so the relogged client is kept, settle() runs and the wrap proceeds to the refresh. releaseForShutdown does not call abandonPendingLogon, so the wrap stays blocked on the logon (up to AUTH_LOGON_BOUND_MS) instead of settling. A bare ensureConnected() takes no lease, so no idle timer ever logs the kept session off -> its CM socket + heartbeat hold the loop forever (orphan).
  implication: caller's app-side hypothesis confirmed; caller's library-side hypothesis ("logOff while connecting does nothing") is refined: logOff DOES end the socket in the live window; the library's own logon-message timeout reconnects.

- timestamp: 2026-10-28
  checked: falsification test, real library (scratchpad/harness/repro.js after-sendlogon-fixed, drain.js)
  found: clearTimeout(_logonMsgTimeout) then logOff() -> no second _doConnection in 7.5 s. Process drain: with the fix it exits 53 ms after the abort. Without it, it stays up 6056 ms even with the network stubbed; live, the reconnect then holds it forever.
  implication: hypothesis survives its falsification test; clearing that one timer is sufficient on the library side.

- timestamp: 2026-10-28
  checked: red/green of new authSessionLifecycle tests against HEAD user.ts
  found: with HEAD user.ts the two shutdown-mid-connect tests FAIL (the first hangs to jest's 5 s timeout: the wrap never settles, i.e. the live hang); the post-logon regression guard passes on both. With the fix all 40 pass.
  implication: tests reproduce the defect and pin the fix.

## Resolution

root_cause: |
  Two compounding defects.
  (1) steam-user 5.3.0: `logOff()` while an authenticated logon is between ClientLogon and its response does end the socket, but does NOT clear `_logonMsgTimeout` (armed by `_sendLogOn`, cleared only in `_handleLogOnResponse`). 5 s later it fires `_disconnect(true)` + `_enqueueLogonAttempt()`, which after a 1 s backoff calls `logOn(true)` with the saved refresh token: a fresh connect and logon, outside the go-offline wrap, that `autoRelogin: false` does not gate. In the live run this landed at 10:24:27, 7 s after EOF, with Mac Steam already back online.
  (2) user.ts: `releaseForShutdown` never called `abandonPendingLogon`, so the wrap kept waiting on the logon instead of settling at EOF; and the `loggedOn` handler checked only `sessionGeneration`, not `shuttingDown`, so the late logon was KEPT. The wrap then ran the refresh, fired a late goonline (whose confirm was a false negative because Steam was already online), and the kept session, which held no lease and so had no idle timer, kept its CM socket and heartbeat referenced forever. The sidecar was orphaned.
  The caller's hypothesis was right on the app side. On the library side it needed refining: logOff() is not a no-op mid-connect. It is defeated by the library's own logon-message retry. The same-tick case (logOff before logOn's nextTick body) is a true no-op but cannot be reached from stdin EOF.
fix: |
  - New `src/backend/storeManagers/steam/steamUserLogonAbort.ts`: `abortSteamUserLogon(client)` clears steam-user's internal `_logonMsgTimeout`, the one internal touched, isolated and commented, and then calls the public `logOff()`. The timer is cleared first, so it is gone even if logOff throws.
  - user.ts: used at every site that can hit a mid-connect client: the replace-old-client site, the 35 s bound, `abandon` (logout and shutdown), and the loggedOn reject branch.
  - `releaseForShutdown` calls `this.abandonPendingLogon?.()` before closing the client and before the restore. That aborts the in-flight logon, so no new ClientLogon is ever sent, and settles the wrap at once. The wrap then takes its existing shutdown branch (goonline immediately, unref'd confirm polling) and runs no refresh.
  - `loggedOn` backstop: if `shuttingDown`, the client is aborted and dropped before the `[Timing]` line, with a new warning `[Steam] CM logon landed after the shutdown release, logged off at once`.
  - `wrappedConnectNow` returns `'shutting-down'` after the wrap when shut down, so callers get the right refusal.
  ACHIEVED: the logon is stopped BEFORE a new ClientLogon is sent (the library's retry is cancelled), not merely dropped after it lands. The loggedOn drop is only a backstop.
  NOT CHANGED: every Section 5 scored literal (CM logon mode=..., CM session closed ..., go-offline ...) is byte-identical; no new logOn site (Rule A/K green).
  RESIDUAL RISK: a ClientLogon that was ALREADY sent before EOF may be accepted by the CM in the milliseconds before the socket close reaches it. That is a CM-side session we never see and cannot cancel client-side. It could touch Mac Steam's Friends in that window, but it can no longer be kept, retried or held open. Separately, an ANONYMOUS connect in flight at EOF is not aborted by releaseAnonymousForShutdown (only the cached client is closed). Its loggedOn handler already logs off under shuttingDown, so it is bounded and harmless to Friends, but it can delay drain by one connect. Out of scope here.
verification: |
  - Real steam-user 5.3.0 harness and jest (steamUserLogonAbort.test.ts): a bare logOff() after ClientLogon produces a 2nd connect (control, the live defect); abort produces none and leaves 0 timers.
  - authSessionLifecycle.test.ts: 3 new tests (EOF mid-connect: wrap settles with 'shutting-down' with no timer advance, logOff before restore, library retry cancelled, 0 timers left, late loggedOn logged off and not kept, no [Timing] line, no further wrap or logOn; backstop-only late loggedOn; EOF after logon still logs `CM session closed mode=authenticated cause=disconnected`). RED against HEAD user.ts, GREEN with the fix.
  - `npx jest src/backend/storeManagers/steam src/backend/__tests__/steamAuthSessionPolicy.test.ts src/backend/sidecar`: 151/154 suites pass; the 3 failures (installFlows, runnerSliceRegistration, testContainment; 4 tests) fail identically with the change stashed.
  - `pnpm codecheck` exit 0; `npx prettier --check` on the 4 changed TS files clean (debug .md is prettier-ignored).
  - `pnpm smoke:sidecar` NOT run, although the owed-goonline marker is absent: the gate spawns the sidecar against the REAL profile, so it would rotate ~/Library/Logs/GameLib/gamelib.log (the item-11 evidence) and write the real GameLib App Support dir. It also never reaches a logon, so it cannot exercise this path.
  - Not live-verified against a real CM (hard limit). Pending: live gate item 11 re-run.
files_changed:
  - src/backend/storeManagers/steam/steamUserLogonAbort.ts
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/steam/__tests__/steamUserLogonAbort.test.ts
  - src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts
