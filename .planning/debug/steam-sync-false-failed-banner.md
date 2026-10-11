---
status: awaiting_human_verify
trigger: "Steam sync-notice banner falsely shows \"failed\" during the post-sign-in CM reconnect window"
created: 2026-10-11T01:30:00Z
updated: 2026-10-11T03:10:00Z
source_todo: .planning/todos/pending/2026-10-10-steam-sync-notice-false-failure-after-signin-reconnect.md
---

## Current Focus

bug_class: Bohrbug (deterministic: the CM answers the same stored token with the same refusal; steam-user listener ordering is fixed).

reasoning_checkpoint:
  hypothesis: "The CM answered the refresh-token logon with AccessDenied, which steam-user treats as terminal (_disconnect(true) + emit('error'), no _enqueueLogonAttempt). connectSteamUserClient resolves on that same 'error', so ensureConnected()'s post-cold-connect grace listeners attach AFTER the event and can only time out (20002 ms), after which library.ts reports the generic client-not-ready failure. There is no reconnect window; the 'failed' banner is a true report of a terminal failure, mislabelled and delayed."
  confirming_evidence:
    - "steam-user 5.3.0 09-logon.js _handleLogOnResponse: only Fail/ServiceUnavailable/TryAnotherCM call _enqueueLogonAttempt; the default arm (AccessDenied) does _disconnect(true) + emit('error') and schedules nothing."
    - "user.ts: connectSteamUserClient's once('error') handler is what resolves the cold-connect promise (log: cold-connect path took 779ms); the grace window's listeners are installed after that await."
    - "gamelib.log: grace-window wait took 20002 ms with connected=false -- the setTimeout branch, zero loggedOn/error events in 20 s."
    - "RED test: with logOn firing AccessDenied, ensureConnected() was still pending after all microtasks flushed with no timer advanced (settled === undefined); GREEN after the fix."
  falsification_test: "If a reconnect WERE in flight, a loggedOn/error would arrive inside the 20 s window and connected would be true or the wait would end early; the log shows neither. Also: if steam-user scheduled a retry after AccessDenied, _handleLogOnResponse's default arm would call _enqueueLogonAttempt -- it does not."
  fix_rationale: "Remove the dead wait at its source (short-circuit when a terminal rejection is already on record for the CURRENT client) and carry the rejection to library.ts so the log/payload say what happened. Does not hide the failure: the todo's directions (route to 'syncing', retry/backoff before 'failed') would park the UI on a spinner for a failure that never resolves, which is what 34.15 D-06 exists to prevent."
  blind_spots: "(1) WHY Steam refused the token is inferred (revoked/expired -- D-21's presence-only probe cannot see it; the 2026-09-30 KB entry advised revoking the Steam session), not observed: no macOS access from this box. (2) The user-visible banner copy/Retry for this cause is unchanged; deciding what to show for a CM-refused token is a product decision (see Resolution.follow_up). (3) Not live-verified."
  candidate_causes:
    - "code: ensureConnected grace listeners attached after the terminal error (confirmed; the 20 s)."
    - "data/environment: the stored refresh token is no longer accepted by Steam (revoked/expired) -- most likely trigger of AccessDenied; inferred."
    - "code (ruled out, low probability): client-side logon regression -- logOn call unchanged since the 34.9 gate that fetched 378 games; 2ac72334c overrides do not touch the logon path; the CM decoded our message (it returned an EResult)."
  and_gate: "Yes, two conditions: the token is refused (data/environment, inferred) AND the code mishandles a refusal (dead 20 s wait + opaque reason, confirmed). Only the code half is fixable here; the data half is cleared by signing in again."

next_action: "Awaiting human verification on macOS (see Resolution.verification.human_verify): confirm the new log lines and run the sign-in-again check."

## Symptoms

DATA_START
expected: After clearing an expired Steam sign-in, the Library shows no Steam sync-failure banner while the CM client reconnects; the library refresh either waits for the reconnect or retries once the client is ready. If anything is shown, it is a 'syncing' state, not a terminal failure.
actual: 5-10 s after the LibrarySignInNotice row correctly disappears (F-49-R1-2 fix confirmed), with no further user action, the Library shows SteamSyncNotice in 'failed' mode: "Couldn't sync your Steam library" / "Try again, or check that Steam is reachable" with a Retry button. Steam is reachable; the session is mid-reconnect.
errors: |
  gamelib.log (macOS, 2026-10-10):
  13:30:01  SidecarKeyringSlotStore(steam-refresh-token).getToken(): keyring_get ok present=true len=493
  13:30:02  [WARNING] Steam client error, username unavailable: Error: AccessDenied
              at SteamUser._handleLogOnResponse (steam-user/components/09-logon.js:847)
  13:30:02  [Timing] SteamUser.ensureConnected: cold-connect path took 779ms
  13:30:22  [Timing] SteamUser.ensureConnected: grace-window wait took an additional 20002ms, connected=false
  13:30:22  [WARNING] Steam client not ready, skipping library refresh
timeline: Found 2026-10-10 while live-verifying the F-49-R1-2 fix (commit 9f8453c72) on macOS. The banner path itself (34.15 D-07 exit path 1 of 4) and the D-19 suppression branch in resolveSteamSyncIndicator predate that; the race is likely reproducible on any launch where the Steam CM logon returns AccessDenied after a credential restore.
reproduction: On a machine with an expired Steam sign-in, sign in again (or restore the refresh token) so the sign-in probe publishes verdict=cleared; watch the Library for 5-30 s. The refresh-token read succeeds, the CM logon gets AccessDenied and cold-reconnects, a library refresh runs during the ~20 s grace window, and the 'failed' banner appears without user action.
DATA_END

## Suspected fix directions (from the todo -- verify, don't assume)

- Distinguish "CM reconnect in progress after a very recent credential refresh" from a terminal sync failure: a short grace/backoff before reporting 'failed' when the failure immediately follows a steam verdict=cleared / credential-restore event, or retry the refresh internally once the reconnect completes.
- Or (simpler): give resolveSteamSyncIndicator a "reconnecting" signal distinct from steamCredentialsMissing and route it to 'syncing' instead of 'failed'.

BOTH DIRECTIONS REJECTED -- see Eliminated and Evidence. They assume a reconnect is in flight; the evidence says none is.

## Files named by the todo

- src/frontend/screens/Library/librarySyncIndicator.ts
- src/frontend/screens/Library/components/SteamSyncNotice/index.tsx
- src/backend/storeManagers/steam/library.ts (the 'Steam client not ready, skipping library refresh' exit, ~line 943)
- src/backend/storeManagers/steam/user.ts (SteamUser.ensureConnected grace window)

## Evidence

- timestamp: 2026-10-11T01:45:00Z
  checked: node_modules/steam-user/components/09-logon.js _handleLogOnResponse (steam-user 5.3.0), the `default:` arm lines ~843-850
  found: Only Fail / ServiceUnavailable / TryAnotherCM call `_enqueueLogonAttempt()` (backoff retry). Every other EResult -- AccessDenied (15) included -- runs `_resetExponentialBackoff`, `this._disconnect(true)` and `this.emit('error', error)` and NOTHING else. `_disconnect(true)` ends the connection, nulls steamID and calls `_cleanupClosedConnection()` -> `_cancelReconnectTimers(true)`.
  implication: steam-user does NOT cold-reconnect after AccessDenied. The todo's "has to cold-reconnect ... ~20s reconnect window" premise is false for this log. After the 'error' event the client is dead until a new logOn().

- timestamp: 2026-10-11T01:50:00Z
  checked: src/backend/storeManagers/steam/user.ts ensureConnected() lines 262-312 vs connectSteamUserClient() lines 420-492
  found: connectSteamUserClient resolves its promise INSIDE its own `client.once('error')` handler (log: "Steam client error, username unavailable"). ensureConnected awaits that promise (cold-connect path took 779ms), sees `this.client?.steamID` is null, and only THEN calls `client.once('loggedOn')` / `client.once('error')` for the 20 s grace window. The AccessDenied 'error' already fired ~779ms earlier, so neither listener can ever trigger on it.
  implication: DEFECT. The grace window is blind to a logon that already ended in a terminal error. It always burns the full 20 s and returns false. Log confirms: grace wait = 20002 ms, i.e. the setTimeout branch, not an event. It affects every ensureConnected() caller (library refresh, depot.ts:745 install, installLocation.ts:261, games.ts:926), not just the banner.

- timestamp: 2026-10-11T01:55:00Z
  checked: gamelib.log excerpt (above) for any 'loggedOn' / second 'error' / further CM activity between 13:30:02 and 13:30:22
  found: None. The grace window resolved by its own 20 s timeout (20002 ms).
  implication: Nothing reconnected in those 20 s -- consistent with steam-user's terminal handling above. The failure is not self-resolving.

- timestamp: 2026-10-11T02:00:00Z
  checked: src/backend/storeManagers/steam/library.ts exit path 1 (~line 940) and src/frontend/state/GlobalState.tsx:1657 handleSteamSyncStatus
  found: The 'failed' payload carries only reason 'client-not-ready' for BOTH "could not connect" and "CM rejected the logon"; the renderer drops `reason` entirely (`({ status }) =>`). The warning line "Steam client not ready, skipping library refresh" is what made the todo author read this as a readiness race.
  implication: No signal in the pipeline distinguishes a terminal logon rejection from a transient not-ready. The misdiagnosis is a diagnosability defect as much as a UI one.

- timestamp: 2026-10-11T02:05:00Z
  checked: .planning/phases/49-*/49-CONTEXT.md D-21, 49-LIVE-GATE.md Launch 9, .planning/debug/knowledge-base.md steam-token-survives-keychain
  found: D-21: the Steam sign-in probe reads the KEYRING ONLY and classifies present -> connected; it never opens a CM connection. So verdict=cleared proves the token is PRESENT (len=493), not ACCEPTED by Steam. KB entry (2026-09-30) advised the operator that revoking the Steam session was prudent after the orphaned-token finding; a revoked refresh token is rejected by the CM at logon.
  implication: The sequence "probe clears the expired row (presence), then the first CM logon is refused" is exactly what D-21 predicts for a server-dead token. Most likely cause of the AccessDenied is a revoked/expired refresh token, but that is INFERRED, not observed (no macOS access from this box).

- timestamp: 2026-10-11T02:08:00Z
  checked: git log of logOn call site + 2ac72334c (2026-10-05 dependency overrides)
  found: `client.logOn({ refreshToken })` and `new SteamUserLib({ enablePicsCache: false })` are unchanged since before the 34.9 live gate (2026-08-11), where the same token class logged on and fetched 378 games. The Oct-05 overrides bump protobufjs within ^7, steam-appticket 1->2 and adm-zip 0.5->0.6 -- none on the logon path; and an AccessDenied EResult means the CM decoded our logon message.
  implication: A client-side logon regression is unlikely (not excluded: no live logon on this box).

- timestamp: 2026-10-11T02:30:00Z
  checked: 2026-08-11 34.9 live-gate log (.planning/phases/34.9-*/evidence/live-gate-20260811/gamelib-launch-1.log lines 22-34)
  found: A different error ("LogonSessionReplaced", from a REPLACED client's once('error')) is logged by the same "username unavailable" handler while a newer client then logs on and fetches 378 games.
  implication: The 'error' handler can fire for a client that is no longer the current one. Recording a rejection must therefore be scoped to the current client, or a stale error would poison (or erase) the real attempt's verdict. Encoded as guards + tests.

- timestamp: 2026-10-11T02:50:00Z
  checked: RED/GREEN + mutation runs (see Resolution.verification)
  found: RED before the fix (ensureConnected pending with no timer advanced; getLogonFailure missing). GREEN after. Three manual mutants at the fix sites all killed.
  implication: The tests assert the root cause (a rejection already on record short-circuits the dead wait), not the symptom.

## Eliminated

- hypothesis: "A library refresh fires inside a ~20 s CM cold-reconnect window and the failure is a benign, self-resolving reconnect race (the todo's hypothesis; first hypothesis of this session)."
  evidence: steam-user schedules no reconnect after AccessDenied (_handleLogOnResponse default arm: _disconnect(true) + emit('error'), no _enqueueLogonAttempt). The 20 s window saw zero further events (20002 ms = the timeout). The window itself is an artifact of listeners attached after the terminal error. Both todo fix directions (retry/backoff before reporting 'failed'; route a 'reconnecting' signal to 'syncing') would therefore either replay the same denial or park the UI on a spinner for a failure that never resolves -- the exact "spins forever" defect 34.15 D-06 was written to kill.
  timestamp: 2026-10-11T02:00:00Z

- hypothesis: "A client-side logon regression (dependency override 2ac72334c, or a changed logOn call) makes the CM refuse a valid token."
  evidence: logOn/constructor call sites unchanged since the 34.9 gate; the overrides do not touch the logon path; the CM returned a decoded EResult. Not excluded by live test (no macOS access), so it is the discriminating branch of the human-verify check: a FRESH token refused too would reopen this.
  timestamp: 2026-10-11T02:08:00Z

## Resolution

root_cause: "Not a reconnect race. Steam's CM refused the stored-refresh-token logon with AccessDenied, which steam-user treats as terminal (disconnects, emits 'error', schedules no retry). ensureConnected() attached its grace-window listeners only after that 'error' had already fired, so it could only wait out the full 20 s and return false; library.ts then reported the generic 'client-not-ready' failure, which the renderer shows as the 'check that Steam is reachable' banner with Retry. The banner is a true report of a failure that does not self-resolve. Likely reason for the refusal (inferred, unverified): the token in the keychain is no longer accepted by Steam (revoked/expired) while D-21's keyring-only probe can only see that it is PRESENT, so verdict=cleared removes the sign-in row first."
fix: "(1) user.ts: record the terminal 'error' per client (logonFailure, reset per attempt, current-client-only), expose SteamUser.getLogonFailure() (message + eresult), and make ensureConnected() return false immediately when a rejection is on record instead of waiting 20 s on listeners that cannot fire. The grace window stays for its real case (connect's 15 s guard resolving before any event). (2) library.ts exit path 1: log 'Steam rejected the stored-credential logon (...)' and emit reason 'logon-rejected' (new SteamSyncFailureReason member in common/types/ipc.ts) when a rejection is on record; otherwise unchanged ('client-not-ready'). D-07's four-exit-path contract and D-19's resolver are untouched. The todo's two directions were rejected (see Eliminated)."
decision_record: "Chose NOT to route this to 'syncing' or add a backoff/retry: there is no benign reconnect to wait for, and either would hide a terminal failure behind a never-resolving spinner. Chose NOT to latch credentialsMissing / call noteSignedOut('steam') on a CM refusal, nor to add reason-specific banner copy: that changes cross-store sign-in semantics (Phase 49 D-21 keyring-only probe, D-19 suppression, accounts tile, i18n gate) and needs the live check below to know the token is actually dead; it is not destructive but widens scope beyond the sync banner, so it is recorded as follow_up for the operator."
follow_up: "If a fresh sign-in on macOS makes the sync succeed (token was dead): the missing piece is that a CM-refused token never reaches the sign-in surface. Candidate design: on getLogonFailure() after ensureConnected() false, latch steam credentialsMissing and bump the Steam sign-in epoch (noteSignedOut-style fence) so the in-flight presence probe's later 'cleared' verdict goes stale; the existing D-19 branch then suppresses the generic banner and LibrarySignInNotice shows 'Your Steam sign-in expired'. Also clear the latch on a successful cold-connect logon (today only the canary fast path and finishAuth clear it). If a FRESH token is also refused: the logon path itself is broken and this is a new bug (re-open with the new log)."
verification:
  target_test: { result: pass, detail: "user.test.ts 'terminal CM logon rejection' x3 + 'cannot erase the current rejection' x1; library.test.ts exit path 1 x2 (logon-rejected / client-not-ready). RED confirmed first: ensureConnected still pending with no timer advanced; getLogonFailure not a function." }
  mutation_check: { result: skipped, reason_if_skipped: "no Stryker configured; substituted three manual mutants at the fix sites, all killed: (a) short-circuit return removed -> 2 tests red; (b) write-side 'this.client === client' guard replaced with true -> 1 test red; (c) library reason forced to 'client-not-ready' -> 1 test red. Originals restored byte-for-byte (diff -q).", mutant_killed: true }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, detail: "Diff is additive (+66 user.ts, +16/-3 library.ts, +4 ipc.ts). The one behavior-skipping line (early return before the grace window) is justified by the RCA: the listeners it skips cannot observe an already-fired event." }
  adjacent_tests: { result: pass, suites_run: ["src/backend/storeManagers/steam", "src/frontend/screens/Library", "src/frontend/state/__tests__/steamSyncStatusWiring.test.ts", "src/backend/sidecar"], detail: "20 suites fail on this Windows box, 19 of them in the recorded Windows baseline; the 20th (sidecarRejectionGuard) passes in isolation (EPERM log-rename flake under parallel load). library.test.ts's 4 failures are the 3 dual-install pollUninstallOnce + 1 locateMachOBinary Windows cases, none touch refresh()/ensureConnected. pnpm codecheck (tsc x2) exit 0. lintScoped: production PASS, tests PASS at the exact 638-warning ceiling (my first draft added 4 unbound-method warnings in library.test.ts; reworked to jest.mocked(SteamUser).x). prettier --check clean on all 5 written paths (file-info: none ignored)." }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, detail: "Mutant (a) is the revert of the fix site: the RED symptom (ensureConnected pending on the grace timer) returns; restoring the file makes it green." }
  human_verify: { result: pending, how: "On macOS launch with the same keychain state: gamelib.log should show 'Steam: the CM rejected the stored-credential logon (AccessDenied) ...' and 'Steam rejected the stored-credential logon (AccessDenied), skipping library refresh' with NO 20002ms grace-window line, i.e. the banner decision lands ~1 s after the keyring read instead of ~21 s. Then the discriminating check: sign out and sign back in via QR; if the sync then succeeds the stored token was dead (root-cause half 2 confirmed) and follow_up applies; if AccessDenied repeats on a fresh token, report it -- that is a different bug." }
  guardrail_verdict: accepted
  live_confirmation: "Not performed. This box cannot reach the macOS CM/keychain state; confirmation happens at the operator's next macOS launch, as the orchestrator brief anticipated."
files_changed:
  - src/backend/storeManagers/steam/user.ts
  - src/backend/storeManagers/steam/library.ts
  - src/common/types/ipc.ts
  - src/backend/storeManagers/steam/__tests__/user.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
commits:
  - 331988302 fix(steam): stop ensureConnected() waiting out the grace window after a terminal CM logon rejection
  - b08c6c2ec fix(steam): name a CM-rejected logon 'logon-rejected' on sync exit path 1, not a readiness race
