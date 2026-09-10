---
status: resolved
trigger: "gog login is broken, log in successfully as interaction with gog login screens, but when flips back to the apps account screen does not regester as loged in"
created: 2026-09-11T10:00:00+12:00
updated: 2026-09-11T10:50:00+12:00
branch: fix/steam-native-install-stability
evidence_log: ~/Library/Logs/GameLib/gamelib.log
---

## Symptoms

expected: |
  After completing the GOG login web flow, the app returns to the Accounts screen and shows
  GOG as logged in (username present), and GOG games appear in the library.
actual: |
  The GOG login web flow completes successfully -- the login window captures the code and
  closes -- but the Accounts screen still shows GOG as NOT logged in.
errors: |
  From the operator's own live session at 2026-09-11 09:49-09:51 (dev build, sidecar.js from
  the working tree, NOT the packaged DMG):

    (09:49:53) [INFO]  [Gog]: Checking if login is valid
    (09:49:53) [ERROR] [Gog]: Unable to syncQueued playtime, userData not present
    (09:49:55) [ERROR] [Gog]: Error getting login information AxiosError: Request failed with status code 404
        at async GOGUser.getUserDetails (build/main/sidecar.js:2343:26)

  ...then again after the explicit in-app login:

    (09:51:22) [INFO]  [Gog]: Logging using GOG credentials
    (09:51:22) [INFO]  [Gog]: Login Successful
    (09:51:22) [INFO]  [Gog]: Checking if login is valid
    (09:51:23) [ERROR] [Gog]: Error getting login information AxiosError: Request failed with status code 404
        at async GOGUser.getUserDetails (build/main/sidecar.js:2343:26)
        at async GOGUser.login (build/main/sidecar.js:2306:29)
        at async dispatchInvoke (build/main/sidecar.js:441:20)
    (09:51:23) [INFO]  [Frontend]: [useTauriOAuthLogin] runner=gog phase=idle (login completed, library refresh triggered)
    (09:51:23) [INFO]  [Gog]: refreshLibrary complete runner=gog managers=1

  Note the OAuth capture leg is entirely healthy:
    [oauthLoginCapture] runner=gog nav host=login.gog.com
    [oauthLoginCapture] runner=gog nav host=embed.gog.com
    [oauthLoginCapture] runner=gog status=captured
  and gogdl reports `Login Successful`. Only the userData fetch fails.
timeline: |
  Pre-dates the current branch. The same `userData not present` signature was recorded on
  2026-09-10 against release build GameLib_0.7.0_aarch64.dmg during Phase 43's REQ-43-19
  live-gate setup, and filed as a pending todo the same day. Introduced by commit b0776ab8d
  (the "switch GOG user API off userData.json" migration), which shipped host `api.gog.com`
  where both upstream Heroic b1a87c958 and the originating todo prescribed `users.gog.com`.
reproduction: |
  1. Launch the app (dev or packaged).
  2. Accounts screen -> Log in to GOG.
  3. Complete the GOG web login; window captures and closes.
  4. Accounts screen still shows GOG logged out.
  Fires twice per session: once at boot-time credential reconciliation, once per explicit login.

## Current Focus

hypothesis: |
  `GOGUser.getUserDetails()` (src/backend/storeManagers/gog/user.ts:253) GETs
  `https://api.gog.com/users/{userId}`, which 404s. The `.catch()` swallows the error and
  returns undefined, so the `if (!response) return` guard exits BEFORE
  `configStore.set('userData', ...)`. `userData` is therefore never written, and every
  logged-in check downstream -- including whatever the Accounts screen reads -- sees no user.
  The correct host is `https://users.gog.com/users/{userId}`, per upstream Heroic b1a87c958.
test: |
  Two-part discriminator, both parts required:
  (a) HOST: replay the request with the live access_token from
      ~/Library/Application Support/GameLib/gog_store/auth.json against BOTH hosts.
      curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOK" \
        https://api.gog.com/users/$UID     -> expect 404
      curl -s ... https://users.gog.com/users/$UID | jq .username  -> expect 2xx + username
  (b) CONSUMER: prove the Accounts screen's logged-in signal actually derives from the
      `userData` key that this early-return skips. Read the frontend Accounts/login-tile
      source and trace what it reads. If it reads something else (e.g. isLoggedIn() /
      auth.json presence), the 404 is REAL but is NOT the cause of the UI symptom, and the
      defect is a second one downstream.
expecting: |
  (a) api.gog.com 404s, users.gog.com returns 200 with a `username`.
  (b) The Accounts screen's GOG logged-in state traces back to configStore `userData`.
  If (a) holds but (b) does NOT, this hypothesis is FALSIFIED as the cause of the reported
  UI symptom -- fix the host anyway, but keep the session open for the real cause.
next_action: |
  Fix applied and self-verified (host repointed, regression test added, full gog suite green,
  typecheck clean, live curl replay confirms both legs). Awaiting operator confirmation of a
  live in-app GOG login -- see CHECKPOINT REACHED in this session's return. On "confirmed
  fixed": close the related todo and archive this session. On a report that the Accounts
  screen still shows GOG logged out: reopen investigation, do not assume the fix is wrong
  without new evidence first.

reasoning_checkpoint:
  hypothesis: |
    GOGUser.getUserDetails() (src/backend/storeManagers/gog/user.ts:253) GETs
    https://api.gog.com/users/{userId}, which 404s for a real account. The .catch() swallows
    the error, the `if (!response) return` guard exits before configStore.set('userData', ...),
    so userData.username is never written. The Accounts screen's GOG tile reads
    isGogLoggedIn = Boolean(gog.username), and gog.username is sourced (constructor + gogLogin
    setState) from gogConfigStore.get_nodefault('userData.username') / the login() response's
    .data?.username -- both of which trace directly through getUserDetails()'s early return.
    The correct host is users.gog.com, per upstream Heroic b1a87c958 and the completed todo
    that originally prescribed it.
  confirming_evidence:
    - "Live curl replay against the operator's real access_token (from gog_store/auth.json):
       api.gog.com/users/{user_id} -> HTTP 404 (body: {error, error_description}).
       users.gog.com/users/{user_id} -> HTTP 200, body includes username: 'soreluel'."
    - "src/frontend/screens/Login/index.tsx:91,153,304 -- isGogLoggedIn is Boolean(gog.username),
       passed straight to Runner's isLoggedIn prop for the GOG tile. Not isLoggedIn() /
       auth.json presence -- directly username."
    - "src/frontend/state/GlobalState.tsx:393-396 (constructor) sources gog.username from
       gogConfigStore.get_nodefault('userData.username'); :830-838 (gogLogin) sources it from
       response.data?.username, where response is window.api.authGOG()'s result, which is
       GOGUser.login()'s return -- data: userDetails, the exact value getUserDetails() returns
       undefined for on the early-return path."
    - "Operator's log: login() itself reports status='done' (the OAuth/gogdl leg is healthy)
       even though getUserDetails() silently returned undefined inside it -- explains why the
       login flow 'completes' from gogdl's perspective while the tile never flips."
  falsification_test: |
    If the Accounts screen's GOG tile read something other than gog.username (e.g. a direct
    isLoggedIn()/auth.json check), the 404 would be real but NOT the cause of the reported UI
    symptom. Traced the full path from Runner's isLoggedIn prop back through GlobalState's
    constructor and gogLogin setState to configStore userData -- no such alternate path exists
    for GOG (unlike Steam/Humble, which do have decoupled isLoggedIn signals per the D-02/D-16
    comment at Login/index.tsx:112-118). Confirmed, not falsified.
  fix_rationale: |
    Repointing the host is the root-cause fix, not a symptom patch: the early-return-on-404
    behavior, the userData projection, and the frontend's Boolean(username) tile logic are all
    working exactly as designed -- the single wrong input is the URL string. No other code path
    needs to change.
  blind_spots: |
    Have not yet driven a live end-to-end app run post-fix (dev sidecar rebuild + real login) --
    only a live curl replay of the isolated HTTP call. galaxyUserId/userId sourcing verified by
    reading the code (sourced from resolved credentials, never the response body per the
    T-Q34-01 comment at user.ts:270-273) but not re-confirmed via a live run since that part of
    the code is unchanged by this fix. Also: auth.json's outer object key
    (46899977096215655) does NOT match its own user_id field (54283569140944678) -- used the
    field value (matches the real GOG account, confirmed by username=soreluel) for the curl
    replay per the code's own resolved.user_id read, but the key/field mismatch itself looks
    like a possible separate, pre-existing oddity worth a follow-up look (not blocking this fix
    since getUserDetails() reads resolved.user_id, never the outer key).

## Evidence

- timestamp: 2026-09-11T09:51:23+12:00
  source: ~/Library/Logs/GameLib/gamelib.log (operator's own live session, dev build)
  finding: |
    gogdl auth succeeds (`Login Successful`) and the OAuth capture leg is clean, but
    getUserDetails 404s immediately afterward. The failure is isolated to the userData
    fetch -- not to the login flow, the webview, the cookie jar, or the code exchange.

- timestamp: 2026-09-11T10:00:00+12:00
  source: src/backend/storeManagers/gog/user.ts:253 (read at HEAD, working tree)
  finding: |
    Host is still `https://api.gog.com/users/${encodeURIComponent(userId)}`. The pending
    todo's prescribed fix has NOT been shipped -- verified by reading the line, not by
    trusting the todo.

- timestamp: 2026-09-11T10:00:00+12:00
  source: .planning/todos/pending/2026-09-10-gog-getuserdetails-404s-on-api-gog-com-upstream-uses-users-gog-com.md
  finding: |
    Pre-existing todo describing this exact symptom on the packaged build, with the host
    substitution traced to commit b0776ab8d and the correct host evidenced from upstream
    Heroic b1a87c958. Flags that existing tests mock the HTTP layer and cannot catch a
    wrong host. Also asks whether `galaxyUserId` remains sourceable after a host change.

- timestamp: 2026-09-11T10:20:00+12:00
  source: |
    Live curl replay using the operator's real access_token from
    ~/Library/Application Support/GameLib/gog_store/auth.json (token used strictly in-memory,
    never written to any file/artifact).
  finding: |
    Discriminator (a) HOST, both legs run: `GET https://api.gog.com/users/{user_id}` ->
    HTTP 404, body `{error, error_description}`. `GET https://users.gog.com/users/{user_id}`
    -> HTTP 200, body includes `username: "soreluel"` plus id/avatar/settings/etc. Confirms
    the hypothesis's host claim directly against the live account, not inference.

- timestamp: 2026-09-11T10:25:00+12:00
  source: |
    src/frontend/screens/Login/index.tsx:91,105-121,153,304 and
    src/frontend/state/GlobalState.tsx:86-91,393-396,830-838,1844-1850
  finding: |
    Discriminator (b) CONSUMER, traced end to end. Runner's `isLoggedIn` prop for the GOG
    tile is fed `isGogLoggedIn`, which is `Boolean(gog.username)` (set in a useState
    initializer and re-derived in a useEffect keyed on `gog.username`) -- NOT a separate
    isLoggedIn()/auth.json signal (contrast: Steam and Humble DO have decoupled isLoggedIn
    flags per the D-02/D-16 comment at index.tsx:112-118, but GOG does not).
    `gog.username` itself is sourced in GlobalState's constructor from
    `gogConfigStore.get_nodefault('userData.username')`, and updated by `gogLogin()`'s
    `setState({ gog: { username: response.data?.username } })`, where `response` is
    `window.api.authGOG()`'s return -- `GOGUser.login()`'s `{ status: 'done', data:
    userDetails }`, and `userDetails` is exactly the value `getUserDetails()` returns
    `undefined` for on its early-return-on-404 path. CONFIRMED, not falsified: the 404 is
    the direct, sole cause of the reported UI symptom for GOG.

- timestamp: 2026-09-11T10:27:00+12:00
  source: .planning/debug/resolved/gog-login-ui-never-updates.md, cross-checked against tonight's log
  finding: |
    Ruled out explicitly. That bug's signature was a frozen renderer store snapshot under
    Tauri leaving the Library empty/spinner-stuck. Tonight's log shows
    `refreshLibrary complete runner=gog managers=1` -- the renderer snapshot is live and the
    library refresh mechanism completes normally. The two bugs are unrelated; today's is
    isolated to `gog.username` never being populated because the upstream fetch 404s.

- timestamp: 2026-09-11T10:28:00+12:00
  source: src/backend/storeManagers/gog/user.ts:270-273 (T-Q34-01 comment) and :279
  finding: |
    `galaxyUserId` and `userId` in the persisted `UserData` are both sourced from
    `userId` (the resolved credentials' `user_id`), never from `response.data` --
    `const data: UserData = { userId, username, galaxyUserId: userId }`. A host change only
    affects where `username` comes from; `galaxyUserId`/`userId` sourcing is unaffected and
    remains sourceable after the fix. Confirms the todo's open sub-question by reading the
    code, not by assuming.

- timestamp: 2026-09-11T10:00:00+12:00
  source: .planning/debug/resolved/gog-login-ui-never-updates.md
  finding: |
    A PRIOR resolved session with a similar surface symptom ("Accounts stays on logging into
    gog") but a DIFFERENT root cause -- a frozen renderer store snapshot under Tauri
    (Phase 29 D-06). Distinguishing signature: that bug left the Library spinner unresolved
    and no games present; today's log shows `refreshLibrary complete runner=gog managers=1`.
    Do not conflate the two. Rule it in or out explicitly rather than assuming.

- timestamp: 2026-09-11T10:45:03+12:00
  source: |
    Operator's independent live verification: rebuilt dev sidecar bundle grep, fresh in-app
    GOG login in ~/Library/Logs/GameLib/gamelib.log (10:44:35-10:45:03), Accounts screen
    observation, and an independent re-run of the gog user.test.ts suite.
  finding: |
    All three items of the verification standard confirmed live, not inferred: (i) the
    rebuilt sidecar bundle contains no `api.gog.com/users/` string, only `users.gog.com`;
    (ii) a fresh GOG login logs `Saved username to config file` (the userData write that
    never fired pre-fix) with zero 404s, and the Accounts screen now shows GOG logged in;
    (iii) 14/14 tests pass in an operator-run, non-cached re-execution of the suite. Session
    CONFIRMED FIXED by the operator.

## Eliminated

- hypothesis: The GOG OAuth webview / cookie capture leg is failing.
  evidence: |
    Log shows `[oauthLoginCapture] runner=gog status=captured` followed by gogdl
    `Login Successful`. The code exchange completes and credentials are written.

## Resolution

root_cause: |
  `GOGUser.getUserDetails()` (src/backend/storeManagers/gog/user.ts:253) fetches
  `https://api.gog.com/users/{userId}`, which does not exist and 404s for every account
  (confirmed live). The `.catch()` + `if (!response) return` guard silently swallows the
  failure, so `configStore.userData` (and its `username`) is never written. The Accounts
  screen's GOG tile logged-in state is `Boolean(gog.username)`, and `gog.username` is sourced
  from exactly that `userData.username` value (constructor) or from `getUserDetails()`'s
  return (post-login `setState`) -- both starve when the fetch 404s, so the tile never flips
  to logged in even though the underlying gogdl OAuth/credential exchange succeeds. The
  correct host, per upstream Heroic b1a87c958 and the originating todo, is `users.gog.com`.
fix: |
  Repointed `GOGUser.getUserDetails()`'s fetch from `https://api.gog.com/users/{userId}` to
  `https://users.gog.com/users/{userId}` (src/backend/storeManagers/gog/user.ts:254),
  matching upstream Heroic b1a87c958. Updated three comments/log-message strings in the same
  file that named the old host, and the one doc comment in common/types/gog.ts that described
  where `UserData` is assembled from. Retargeted the two existing test assertions
  (user.test.ts) that pinned the (wrong) `api.gog.com` URL, and added a new dedicated
  regression describe block that pins the literal `users.gog.com` host string independent of
  the mocked response body's shape -- directly addressing the todo's point that HTTP-layer
  mocks are structurally blind to a wrong host. `galaxyUserId`/`userId` sourcing (from
  resolved credentials, never the response body) is untouched by this change -- confirmed by
  reading user.ts:270-279, not assumed.
verification: |
  Self-verified (see Evidence):
  - Live curl replay against the operator's real access_token: api.gog.com 404s,
    users.gog.com returns 200 with a `username` field (item (i) of the verification standard).
  - `pnpm jest src/backend/storeManagers/gog` -- 5 suites, 44 tests, all green, including the
    new host-pinning regression test.
  - `npx tsc --noEmit -p .` -- clean, no new errors.
  - Traced (b) the Accounts screen's isGogLoggedIn -> gog.username -> configStore.userData
    chain and (iii) library.ts:183-186's `userData not present` guard -- both read the exact
    `userData` key getUserDetails() now successfully writes, so both are expected to clear
    post-fix.
  NOT YET verified: a live end-to-end app run (item (ii) of the verification standard --
  Accounts screen actually showing GOG logged in after a real login, and item (iii) actually
  observed absent from a fresh gamelib.log after a real login). This agent cannot drive the
  Tauri GUI -- requesting operator confirmation via checkpoint below rather than declaring
  this resolved on inference.
files_changed:
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/gog/__tests__/user.test.ts
  - src/common/types/gog.ts

live_verification: |
  Operator ran the checkpoint's requested live app cycle and confirmed all three items of the
  verification standard, independently of this agent:
  (i) Rebuilt dev sidecar (10:44) confirmed to bake in the host fix --
      `grep -o 'https://[a-z.]*gog.com/users/' build/main/sidecar.js` returns only
      `presence.gog.com` and `users.gog.com`; no `api.gog.com/users/` remains in the bundle.
  (ii) Fresh in-app GOG login at 10:45:01-03 in ~/Library/Logs/GameLib/gamelib.log shows
      `Saved username to config file` immediately after `Checking if login is valid` -- the
      userData write that never happened before this fix -- followed by
      `refreshLibrary complete runner=gog managers=1`. Zero 404s anywhere in the post-fix log.
      Boot-time reconciliation also now succeeds (`Saved username to config file` at 10:44:35).
      Operator additionally confirms the Accounts screen itself now shows GOG as logged in.
  (iii) Operator independently re-ran `src/backend/storeManagers/gog/__tests__/user.test.ts`:
      14/14 pass.
  All three items of the todo's and this session's verification standard are now met by a live
  run, not inference alone.
known_non_blockers: |
  RESOLVED -- prediction below was tested and held. Original observation: at BOOT (10:44:35)
  the log emitted `Unable to syncQueued playtime, userData not present` in the same second as,
  but BEFORE, `Saved username to config file` -- an ordering artifact where
  `syncQueuedPlaytime()` (library.ts:183, reading `configStore.get_nodefault('userData')`) ran
  ahead of `getUserDetails()` resolving. It did NOT recur after the fresh in-app login
  (10:45:01-03). It was recorded as a PREDICTION that it would self-resolve on the next boot
  once `userData` was persisted.

  VERIFIED 2026-09-11 11:13 by a full app restart (dev tree stopped, orphaned sidecar/vite
  swept, `pnpm tauri:dev` relaunched). Fresh boot log ~/Library/Logs/GameLib/gamelib.log,
  boot marker 11:13:37:
    grep -c 'userData not present' -> 0
    grep -c '404'                  -> 0
    (11:13:37) [Gog]: Checking if login is valid
    (11:13:40) [Gog]: Saved username to config file
    (11:13:40) [Gog]: GOG presence set
  The warning does not fire when `gog_store/config.json` already holds `userData` at process
  start, which it now does. No code change was needed or made for this residual.

  METHOD NOTE for future live gates: the log DOES rotate on boot (gamelib.log -> .old), but
  macOS REUSED the inode, so an inode-change watcher reported no rotation and would have
  timed out against a boot that had already happened. Detect a new boot by the
  `[bootstrap] appRoot resolved` line's timestamp, not by inode or mtime.

## Related

- todo (closed): .planning/todos/completed/2026-09-10-gog-getuserdetails-404s-on-api-gog-com-upstream-uses-users-gog-com.md
- prior session (different cause, similar surface): .planning/debug/resolved/gog-login-ui-never-updates.md
- suspect commit: b0776ab8d (shipped api.gog.com)
- upstream reference: Heroic b1a87c958 (uses users.gog.com)
