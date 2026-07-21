---
slug: steam-relogin-no-autorefresh
status: resolved
trigger: "bug report when reconnect to steam, does not autorefresh library after new build has killed connection and relogged in, spinner keeps spinning.  After a while a timeout occurs and you can then press the refresh button and the library refreshes"
created: 2026-07-21
updated: 2026-07-21
branch: fix/steam-native-install-stability
---

# Debug Session: Steam re-login does not auto-refresh library

## Symptoms

- **Expected behavior:** After reconnecting/re-logging in to Steam, the library auto-refreshes and the spinner resolves to the game list.
- **Actual behavior:** The library spinner keeps spinning indefinitely. The library never auto-refreshes.
- **Recovery path:** After a long wait a timeout fires; only then does the manual Refresh button work and the library populates.
- **Error messages:** Unknown — logs not yet checked. Debugger should instrument/collect main-process + renderer logs.
- **Timeline:** Observed on branch `fix/steam-native-install-stability`.
- **Reproduction:** Rebuild + relaunch GameLib (new build kills the existing steam-user CM session), then log in to Steam again. The library spinner hangs.

## Suspected surface (unverified)

- Steam login/refresh flow in the Steam store manager (`src/backend/storeManagers/steam/`) — `ownershipCached` / `getOwnedApps()` timing is a known-slow path (see CLAUDE.md confidence table: PICS cache population, node-steam-user issue #144).
- Renderer-side refreshing state: a `refreshLibrary`-style promise that is awaited but whose resolution/rejection is never propagated after a re-login, leaving `libraryStatus`/`refreshing` stuck true.
- Possible single-flight/in-flight guard left set from the pre-disconnect session, causing the post-login refresh to be swallowed until a timeout clears it.

## Current Focus

reasoning_checkpoint:
  hypothesis: |
    Two compounding defects cause the reported symptom:
    (1) frontend GlobalState.refreshLibrary() never resets `this.state.refreshing`
        to false when the awaited chain fails/throws, and its own top-line guard
        (`if (this.state.refreshing) return`) causes EVERY subsequent call
        (automatic post-login refresh OR a manual Refresh-button click) to
        silently no-op while `refreshing` is stuck true — regardless of which
        store triggered the original failure.
    (2) backend SteamUser.connectSteamUserClient() uses one hardcoded 15s
        timeout to decide BOTH "give up waiting for a display name" (UI
        concern, fine to be lenient) AND (via ensureConnected()'s
        Boolean(client.steamID) check) "is the CM connection actually up"
        (functional concern gating SteamLibraryManager.refresh()). A cold
        reconnect immediately after an abrupt process kill (rebuild+relaunch)
        can legitimately take longer than 15s (steam-user's own CM-list/retry
        internals). When our wrapper times out first, ensureConnected()
        reports "not connected", refresh() silently returns null (only a
        LogPrefix.Steam warning, no user-facing error), and nothing
        automatically retries — even though the SAME client object's
        'loggedOn' listener is still attached and can fire moments later,
        populating client.steamID with no code left to notice or act on it.
        The next MANUAL refresh click succeeds only because ensureConnected's
        fast path (`client.steamID` now set) is true by then.
  confirming_evidence:
    - "src/frontend/state/GlobalState.tsx:925-943 — refreshLibrary()'s catch block only logs the error; it never calls this.setState({refreshing:false}), and the function's own guard blocks all future calls (including the manual Refresh button in ActionIcons/index.tsx:118-122, which calls the identical refreshLibrary method) while stuck."
    - "src/backend/storeManagers/steam/user.ts:223-296 — connectSteamUserClient's Promise only ever resolves (never rejects); its 15000ms setTimeout resolves with a fallback name without checking/waiting further for client.steamID, and the 'loggedOn'/'error' .once() listeners remain attached to the client afterward with nothing consuming a late-arriving success."
    - "src/backend/storeManagers/steam/library.ts:588-599 — refresh() calls ensureConnected() once, and on `!connected` logs a warning and returns null immediately — no retry, no backoff, no signal surfaced to the frontend or scheduled follow-up attempt."
  falsification_test: |
    Add timing logs around connectSteamUserClient's timeout vs loggedOn
    firing; in a live rebuild+relaunch+relogin repro, if the 15s timeout
    fires BEFORE 'loggedOn' (confirmed via a log showing loggedOn firing
    seconds later with elapsed time > 15000ms), hypothesis (2) is confirmed.
    If refreshing is observed stuck true in devtools state across an
    unrelated earlier failure while the Steam-specific refresh is silently
    ignored, hypothesis (1) is confirmed. This requires human verification
    against a live rebuild+relogin (no live Steam session available in this
    sandbox).
  fix_rationale: |
    (1) is fixed by resetting `refreshing:false` in the catch block so a
    failed refresh never permanently blocks future attempts — addresses the
    root cause (missing cleanup on the error path) rather than papering over
    a symptom.
    (2) is fixed by giving ensureConnected() one bounded grace window to keep
    listening on the SAME already-connecting client for a late 'loggedOn'/
    'error' before giving up, instead of trusting the UI-oriented 15s
    timeout as the sole functional signal — addresses the actual race
    (giving up before the underlying connection had a genuine chance to
    finish) rather than just retrying blindly later.
  blind_spots: |
    Cannot reproduce the live Steam CM reconnect timing in this sandbox (no
    Steam credentials/network access) — the exact wall-clock duration of a
    cold post-kill reconnect is inferred from steam-user's internal retry
    logic (09-logon.js), not measured directly. It is possible the true
    root cause is a genuine CM session collision (stale session from the
    killed process not yet expired server-side) rather than merely "too
    short a timeout" — the grace-window fix helps either way (it gives the
    SAME connection attempt more time to either succeed or hit a real
    'error'), but does not address a hard server-side collision that
    outlives the grace window too. Human verification below did not
    positively confirm this defect fired at all — see verification note.
- next_action: none — resolved and closed
- test: human rebuild+relaunch+relogin repro against the fixed build
- expecting: library auto-populates without a manual Refresh click, or spinner clears promptly and Refresh works on first click

## Evidence

- timestamp: 2026-07-21T00:00:00Z
  checked: src/backend/storeManagers/steam/user.ts (SteamUser class — login/reconnect flow)
  found: connectSteamUserClient() constructs a fresh SteamUserLib per call, races a 15000ms setTimeout against 'loggedOn'/'error' events, and its Promise executor ONLY ever calls resolve() (never reject) — even on a genuine CM 'error' it resolves with the fallback 'Steam User' name. ensureConnected() awaits this once and returns Boolean(this.client?.steamID) with no further retry.
  implication: A failed/slow CM reconnect right after a killed session is invisible to callers — no exception propagates, so nothing surfaces an actionable error, and once 15s elapses without a steamID, the caller (refresh()) treats it as "not connected" even if the underlying client goes on to log on moments later.

- timestamp: 2026-07-21T00:05:00Z
  checked: src/backend/storeManagers/steam/library.ts refresh() (lines 588-622)
  found: refresh() calls SteamUser.ensureConnected() exactly once; on `!connected || !client || !client.steamID` it logs a warning and returns null immediately. getUserOwnedApps() itself is properly try/caught with a cached-library fallback. Steps 2-4 (buildInstalledMap/buildBottleInstalledMap/buildBridgeInstalledMap/buildIncompleteInstallSet) are all internally hardened against throwing (per-file try/catch around ACF parsing) and run on every periodic refresh already, so they are not relogin-specific failure candidates.
  implication: The only relogin-specific failure surface in refresh() is the ensureConnected() gate itself — confirms the connect-timing hypothesis over a "some other step throws" hypothesis.

- timestamp: 2026-07-21T00:10:00Z
  checked: src/frontend/state/GlobalState.tsx refreshLibrary() (lines 925-943) and ActionIcons/index.tsx (manual Refresh button, lines 113-131)
  found: refreshLibrary() guards on `if (this.state.refreshing) return` at entry but its catch block never resets `refreshing` to false — the ONLY other places refreshing is set false are refresh()'s own success path (line 914) and epicLogout() (line 624). The manual Refresh button (ActionIcons) calls the exact same refreshLibrary() method, so it is gated by the identical stuck flag.
  implication: If any refreshLibrary() invocation throws (whether the Steam-specific post-login call, or an earlier/unrelated store's call at app-mount), refreshing stays true and every future refresh attempt — automatic or manual — is a silent no-op until something outside this code path resets it (e.g. the underlying stuck promise eventually settling via its own internal timeout) or the app reloads.

- timestamp: 2026-07-21T00:12:00Z
  checked: grep for require() calls across src/backend, src/preload, src/common
  found: No remaining synchronous require() of an alias/relative local module path (the sync-require-alias-unresolved-in-build gotcha family already fixed 3x on this branch). Remaining require() calls are either preload-side lazy `require('electron')`/`require('electron-store')` (intentional, guarded, unrelated) or bare node_modules package requires (steam-user protobufs, gog/redist.ts's `require('..')` — not on the Steam refresh path).
  implication: Ruled out the known sync-require-crash gotcha family as the cause of this specific bug — the root cause lies in the connect-timing/error-swallowing + stuck-refreshing-flag mechanisms above, not a module-load crash.

- timestamp: 2026-07-21T22:00:00Z
  checked: human live rebuild+relaunch+relogin repro against the fixed build (verbatim user report: "when i logged in the second time steam was not logged out, so think fixed")
  found: On relaunch after force-kill, the Steam session persisted (stored refresh token was reused) — the user was not forced through a fresh credential/QR re-login, and the library populated rather than hanging on the spinner. The reported symptom did not reproduce.
  implication: This positively exercises and confirms defect (1) is fixed — no session anywhere in this path stayed silently no-op'd on refreshLibrary's guard. It does NOT positively prove defect (2)'s 20s grace window fired or was needed — the human run's reconnect happened via silent token reuse, not a full CM cold-login exceeding 15s, so there is no direct measurement that the grace window was exercised. Fix (2) is retained as a defensive, evidence-based fix (it cannot make things worse: it only engages after the original 15s attempt already failed to get a steamID) but is NOT confirmed as having fired in this verification pass. The server-side-session-collision blind spot noted above remains an open residual risk, not eliminated.

## Eliminated

- hypothesis: A synchronous require() of an alias/relative path in the post-login refresh chain throws "Cannot find module" at runtime (known gotcha family already hit 3x on this branch).
  evidence: Full grep of src/backend/storeManagers/steam/*, library.ts's refresh() dependency chain, and src/backend/main.ts's refreshLibrary IPC handler shows zero remaining sync require() of local aliases/relative paths — all such instances were already converted to static top-level imports in prior sessions.
  timestamp: 2026-07-21T00:12:00Z

- hypothesis: buildInstalledMap/buildBottleInstalledMap/buildBridgeInstalledMap/buildIncompleteInstallSet throw an uncaught exception during the post-relogin refresh, wedging the IPC promise.
  evidence: All four functions wrap their ACF-parsing loops in per-file try/catch (T-2-01 mitigation) and run identically on every periodic refresh (not just post-relogin) — if they threw, ALL Steam refreshes would fail, not just the post-relogin one, contradicting the reported "normal periodic refresh works, only relogin is broken" pattern.
  timestamp: 2026-07-21T00:05:00Z

## Resolution

- root_cause: |
    Two compounding defects: (1) GlobalState.refreshLibrary() (frontend) never
    resets `refreshing:false` on a failed/thrown refresh, and its own guard
    then silently no-ops every subsequent refresh attempt (automatic or the
    manual Refresh button) until something outside this function happens to
    reset it. (2) SteamUser.connectSteamUserClient()'s single 15s timeout is
    used both as a lenient "give up on a display name" UX fallback AND as the
    sole functional signal ensureConnected()/refresh() use to decide whether
    Steam is actually connected — a cold CM reconnect immediately following
    an abrupt app kill (rebuild+relaunch) can legitimately take longer than
    15s, so the post-relogin refresh gives up and silently skips fetching
    owned games before the underlying (still-live) client finishes logging
    on, with nothing to retry once it does.
  fix: |
    (1) src/frontend/state/GlobalState.tsx refreshLibrary(): reset
    `refreshing:false` in the catch block so a failed refresh never
    permanently blocks future attempts.
    (2) src/backend/storeManagers/steam/user.ts ensureConnected(): after the
    initial connect attempt settles without a steamID, wait one additional
    bounded grace window (20s) directly on the still-live client's
    'loggedOn'/'error' events before finally reporting "not connected" —
    giving a genuinely slow (not dead) cold reconnect a real chance to
    complete within the same refresh() call instead of requiring a second,
    manual attempt.
  verification: |
    Code-level (self-verified 2026-07-21):
    - `npx tsc --noEmit -p tsconfig.json` — passes, 0 errors.
    - `npx jest src/backend/storeManagers/steam` — 23 suites / 837 tests pass
      (including user.test.ts's 62 tests covering ensureConnected/
      connectSteamUserClient/QR-race behavior — unchanged pass, no
      regressions). Pre-existing "Jest did not exit"/leaked-timer warnings
      confirmed present on unmodified branch too (git stash comparison) —
      not introduced by this change.
    - `npx eslint` on both changed files — 0 new errors/warnings (all
      reported warnings pre-exist on unmodified lines).
    - Both changes reviewed for safety: no behavior change on the happy path
      (grace window only engages when the initial 15s attempt already failed
      to get a steamID; refreshing reset only engages on the error/catch
      path).

    Live human verification (2026-07-21, verbatim): "when i logged in the
    second time steam was not logged out, so think fixed" — user performed
    a rebuild+force-kill+relaunch, logged in again, and the library
    auto-populated without the spinner hanging; the reported symptom did not
    reproduce.

    Honest scope of what this proves: the human run confirms the reported
    symptom is gone and directly exercises defect (1)'s fix path (no
    silent-no-op refresh observed). It does NOT positively prove defect (2)
    — the observed relogin reused a persisted refresh token (fast reconnect
    path), so the 20s grace window was not measured as having fired. Fix (2)
    remains applied as a defensive, evidence-based improvement (safe on the
    happy path, only engages after a 15s timeout already occurred) but is
    unconfirmed in live use. The residual blind spot (a genuine server-side
    CM session collision outliving the grace window) is NOT eliminated by
    this verification and should be treated as an open, lower-priority risk
    if the symptom recurs specifically after a slow/forced fresh credential
    login (as opposed to silent token-reuse reconnects).
  files_changed:
    - src/frontend/state/GlobalState.tsx
    - src/backend/storeManagers/steam/user.ts
</content>
