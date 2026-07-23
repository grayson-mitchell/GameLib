---
status: diagnosed
trigger: "Under the ELECTRON build (npm start, NOT Tauri), Steam library sync should still succeed exactly as before Phase 30. Actual: 'still boots, but trying to sync steam, and failing. gog games are still listed.' (Phase 30 UAT Test 9)"
created: 2026-07-23T00:00:00Z
updated: 2026-07-23T00:00:00Z
---

## Current Focus

hypothesis: "Phase 30 regressed the Electron Steam sync path" — FALSIFIED by git evidence.
Revised: Steam sync fails at SteamLibraryManager.refresh()'s dependency on an
authenticated steam-user CM connection (SteamUser.ensureConnected + refresh token),
which Phase 30 never touched. Most probable real cause = Electron-side Steam token
absent/expired/invalid (D-03 build-token divergence) OR a transient CM connection drop.
test: git diff of all Phase 30 commits over the Electron-loaded source surface.
expecting: if regression, a Steam sync/refresh/auth file would show a Phase 30 edit.
next_action: (for plan-phase --gaps) capture the actual runtime log line at sync time to
disambiguate the auth sub-cause; verify Electron OSCrypt Steam token validity.

## Symptoms

expected: `npm start` (Electron) — Steam library sync succeeds exactly as pre-Phase-30.
actual: App boots, GOG games list correctly, but Steam sync "fails" (no visible library sync).
errors: NONE captured by tester ("trying to sync steam, and failing" — no log/toast recorded).
reproduction: Phase 30 UAT Test 9. `npm start`, sign-in state, trigger Steam sync/refresh.
started: Reported during Phase 30 UAT 2026-07-23. Framed as a possible Phase 30 regression.

## Eliminated

- hypothesis: "Phase 30's checkGameUpdates extraction (f49797b1) broke the Steam sync path"
  evidence: The extraction is byte-equivalent to main.ts's original inline handler body
    (git show f49797b1 confirms verbatim move). WR-05 (061d395f) then ADDED per-runner
    try/catch isolation, making the loop MORE robust — a failing Steam runner is now
    swallowed+logged instead of rejecting the whole call. checkGameUpdates also does NOT
    perform the library sync; SteamLibraryManager.refresh() does.
  timestamp: 2026-07-23

- hypothesis: "Phase 30 sync-require gotcha — an unresolvable require in the new module crashes Steam sync"
  evidence: checkGameUpdates.ts and openDialog.ts use static top-level ESM `import`
    (import { autoUpdate, libraryManagerMap } from 'backend/storeManagers'), NOT a
    synchronous require(). The alias-import surface is identical to what main.ts already
    imports; no new circular dependency or literal-require introduced for the Electron build.
  timestamp: 2026-07-23

- hypothesis: "Phase 30 modified a Steam library/user/token/depot file under Electron"
  evidence: `git diff --stat f49797b1~1..HEAD -- src/backend/storeManagers/steam/` is EMPTY.
    No steam library.ts, games.ts, user.ts, tokenStore.ts, or depot.ts change. No preload
    change. The only Electron-loaded files Phase 30 touched are main.ts (two delegations),
    utils/checkGameUpdates.ts (new), utils/openDialog.ts (new). Every other changed file
    (dialogFlowRegistration.ts, installFlowRegistration.ts, sidecarRpc.ts, handlers.ts) is
    SIDECAR-ONLY (Tauri) and does not load under `npm start`.
  timestamp: 2026-07-23

## Evidence

- timestamp: 2026-07-23
  checked: git show f49797b1 (checkGameUpdates extraction) + 061d395f (WR-05) + 81f5303a (openDialog)
  found: main.ts diff = drop unused `autoUpdate` import + delegate two handlers to extracted
    functions. Bodies byte-identical. WR-05 wraps the per-runner loop in try/catch (strict robustness gain).
  implication: No behavioral change to Electron on the update-check path; and update-check is not the sync path.

- timestamp: 2026-07-23
  checked: git diff --stat f49797b1~1..HEAD over Electron-loaded source; steam manager dir; preload; token/user
  found: Zero changes to any Steam sync/refresh/auth/token/library file. All non-main Phase 30
    edits are Tauri sidecar modules not executed by the Electron build.
  implication: The Electron Steam sync path is code-identical to its pre-Phase-30 state. A true
    Phase 30 code regression to Steam sync is not possible via the changed files.

- timestamp: 2026-07-23
  checked: SteamLibraryManager.refresh() at src/backend/storeManagers/steam/library.ts:588-622
  found: refresh() FIRST calls `await SteamUser.ensureConnected()` + getClient(); if not
    connected / no steamID it logs "Steam client not ready, skipping library refresh" and
    returns null (silent no-op sync). If getUserOwnedApps throws it logs "Steam getUserOwnedApps
    failed" and serves the cached library (D-09 fallback).
  implication: "Sync steam failing" maps to this auth/connection gate. It depends on a live
    steam-user CM connection re-established from the persisted refresh token — a path Phase 30
    did not modify. GOG uses a separate token/credential path, so it lists fine (consistent).

- timestamp: 2026-07-23
  checked: UAT results differential — Test 2 (Tauri) vs Test 9 (Electron)
  found: Test 2 "Steam Library Populates Under Tauri" = PASS with "session already signed in
    to Steam". Test 9 "Electron Build Unregressed" = Steam sync fails. Tests 1-8 all exercised
    the Tauri build.
  implication: The signed-in session verified in UAT was the TAURI Keychain token. Per memory
    D-03, Electron authenticates against the OSCrypt electron-store token, a SEPARATE credential.
    The Electron-side Steam token may be absent/stale/expired (never signed in under Electron this
    session, wiped by earlier test-store clobbering, or refresh-token expiry), which would make
    ensureConnected() fail and refresh() no-op exactly as reported.

## Resolution

root_cause: |
  NOT a Phase 30 code regression. Git evidence proves Phase 30 modified ZERO files on the
  Electron Steam sync path — the only Electron-loaded changes are the byte-equivalent extraction
  of checkGameUpdates (made strictly more robust by WR-05) and openDialog; every other change is
  a Tauri sidecar module the Electron build never loads. Phase 30's "additive/reversible, no
  Electron regression" invariant HOLDS for the Steam sync path.

  The actual failure is at SteamLibraryManager.refresh() (steam/library.ts:588-599): it requires
  an authenticated steam-user CM connection via SteamUser.ensureConnected() re-established from the
  persisted refresh token. When that connection/auth is not available it logs "Steam client not
  ready, skipping library refresh" and returns null — the observed "sync fails" no-op. GOG lists
  fine because it uses an independent token path.

  Most probable underlying cause is the D-03 build-token divergence: UAT tests 1-8 ran under Tauri
  (Keychain token), so the verified sign-in was NOT the Electron OSCrypt token. The Electron-side
  Steam refresh token is likely absent/expired/invalid this session (or was wiped by the earlier
  real-store test clobbering, memory: tests-clobbering-real-steam-store), so ensureConnected()
  fails under Electron. A transient CM connection drop (steam-cm-drop family) is a secondary
  candidate. This is an auth/environment condition, NOT introduced by Phase 30 code.

  CONFIRMATION GAP: the tester captured no log. To pin the exact sub-cause, the runtime log at
  sync time is required — "Steam client not ready, skipping library refresh" => token/connection
  auth failure (re-login under Electron); "Steam getUserOwnedApps failed" => CM call/network;
  no Steam log at all => frontend sync not reaching the backend handler.

fix: "" # find_root_cause_only — deferred to plan-phase --gaps
verification: "" # not applied
files_changed: []
