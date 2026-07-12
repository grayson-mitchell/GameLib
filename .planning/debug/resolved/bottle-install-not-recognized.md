---
slug: bottle-install-not-recognized
status: resolved
trigger: "GAP-17-BOTTLE-INSTALL-NOT-RECOGNIZED — bottle-installed Steam game never flips from Install to Play in GameLib on real macOS + CrossOver (win64 bottle), despite ACF StateFlags=4 on disk and the game running fine launched directly from Steam."
phase: 17
created: 2026-07-11
updated: 2026-07-12
resolved: 2026-07-12
human_verified: true
fix_commit: "TWO fixes, both human-verified: (1) fix(17) GamePage subscribes to steam.library (Install→Play flip); (2) fix(17) bottle-aware refresh() + persist reconciled state (Play no longer reverts to Install)"
---

> **RESOLVED 2026-07-12 — both fixes human-verified on real macOS + CrossOver (win64 bottle).**
> Fix 1: GamePage subscribes to `steam.library` → Install→Play flip works.
> Fix 2 (follow-on): `refresh()` made bottle-aware + reconciled state persisted → clicking Play no longer reverts the button to Install. See Resolution section.
> **FOLLOW-ON FIX APPLIED (2026-07-12), static-verified, AWAITING HUMAN VERIFICATION** — see "Follow-on symptom", "Follow-on Evidence", Current Focus reasoning_checkpoint, and Resolution (root_cause_2/fix_2/verification_2) below.

## Follow-on symptom (2026-07-12, session continues after prior fix verified)

**Expected:** After button flips to Play, clicking Play launches the game and button stays Play/Playing/Stop.

**Actual:** Clicking Play launches the game fine, but the button immediately reverts to Install (is_installed flips back to false in the UI). Game itself launches/runs correctly — this is a display-state-only regression, newly exposed by the GamePage steam.library subscription added in the prior fix.

**Strong lead handed off by coordinator (to verify, not assume correct):**
- `refresh()` in src/backend/storeManagers/steam/library.ts:277 persists `steamLibraryStore.set('games', Array.from(library.values()))`.
- `refreshInstallState()` (library.ts:372-402) and the install-poll 'done' branches (pollInstallOnce ~669-681, uninstall poll ~836-844) only mutate the in-memory `library` Map + `sendFrontendMessage('pushGameToLibrary', ...)` — they never persist to `steamLibraryStore`.
- This creates a Map (is_installed:true) vs persisted-store (is_installed:false) divergence.
- Hypothesis: some launch/status-triggered flow re-pushes/reloads from the stale persisted store, and the new GamePage steam.library-watching effect (added in prior fix) picks up that stale re-push and reverts the button.

**Tasks:**
1. Trace frontend Play/launch → gameStatusUpdate → GlobalState.handleGameStatus path; find exactly what reverts is_installed when Play is clicked.
2. Fix root cause. Likely: make refreshInstallState()/poll 'done'/uninstall paths persist to steamLibraryStore (mirror refresh() line 277). Confirm if a second frontend fix is also needed.
3. Static-verify (tsc/eslint/jest), then human-verify checkpoint on real Avernum 206020/206060.

Do NOT re-investigate items in "Root-cause exclusions" below (already eliminated for the prior symptom).

## Follow-on Evidence (2026-07-12)

- timestamp: 2026-07-12
  checked: src/backend/launcher.ts launchEventCallback (full function, lines 107-333)
  found: "game.launch() is awaited into `launchResult`, then the function unconditionally proceeds — with NO wait for the actual game process/session to end — straight through to `sendGameStatusUpdate({appName, runner, status: 'done'})` at line 321. For Steam this is safe ONLY if game.launch() itself blocks until the game session ends. Comment in games.ts:534 states 'Does NOT call sendGameStatusUpdate — Steam client owns the playing state', implying the intent was for Steam launches to be fire-and-forget and for the *running poller* (pollRunningOnce) to be the sole source of playing/done — but launcher.ts's shared done-status emission at line 321 fires regardless of runner, immediately after game.launch() resolves."
  implication: "For Steam, sendGameStatusUpdate('done') fires almost immediately after clicking Play — not when the game actually exits. This is the trigger for the revert; next check whether game.launch() resolves immediately for the bottle path."

- timestamp: 2026-07-12
  checked: src/backend/storeManagers/steam/bottle.ts dispatchToBottledSteam() (lines 614-676), tellBottledSteamToLaunch
  found: "dispatchToBottledSteam('launch', appId) calls `runWineCommand({ commandParts: [steamExePath, '-applaunch', appId], wait: false, ... })` — `wait: false` means runWineCommand does NOT block until the spawned process (bottled Steam handling -applaunch) exits. tellBottledSteamToLaunch() therefore resolves within a second or two of dispatch, NOT when the actual game session ends."
  implication: "CONFIRMED: game.launch() for a bottle-eligible Steam game resolves almost immediately after Play is clicked. Combined with the prior finding, sendGameStatusUpdate('done') fires seconds after Play is clicked — well before the game session actually ends."

- timestamp: 2026-07-12
  checked: src/frontend/state/GlobalState.tsx handleGameStatus (lines 937-1017)
  found: "For status 'done' (and not previously 'updating'), handleGameStatus unconditionally calls `this.refreshLibrary({ runInBackground: true, library: runner })` (line 1013). For runner='steam' this invokes `window.api.refreshLibrary('steam')`."
  implication: "Confirms the frontend responds to the premature 'done' event (from the previous evidence entries) by triggering a full Steam library refresh — not just a targeted re-fetch of one game's info."

- timestamp: 2026-07-12
  checked: src/backend/main.ts addHandler('refreshLibrary', ...) (lines 988-997)
  found: "refreshLibrary('steam') → `libraryManagerMap['steam'].refresh()` → SteamLibraryManager.refresh() (library.ts:186-284)."
  implication: "Confirms the IPC chain: Play click → premature 'done' → refreshLibrary('steam') → SteamLibraryManager.refresh()."

- timestamp: 2026-07-12
  checked: src/backend/storeManagers/steam/library.ts refresh() Step 2 (lines 222-257), compared against refreshInstallState() (lines 372-402)
  found: "refresh() calls ONLY `buildInstalledMap()` (native ACF scan) to determine is_installed for every owned app — it never calls `buildBottleInstalledMap()`. The code even has an explicit comment at line 253-254: 'refresh() only ever scans the native ACF path (buildInstalledMap above) — bottle reconciliation is refreshInstallState()'s job.' refresh() then does `library.clear()` and rebuilds the ENTIRE in-memory Map from scratch using ONLY this native-scanned data, followed by `steamLibraryStore.set('games', Array.from(library.values()))` (line 277) — persisting the wrong (is_installed:false) state to disk too. For a bottle-only-installed game, buildInstalledMap() (native) never finds its ACF (it lives under the CrossOver bottle's own steamapps dir, not any native Steam library path), so installedData is always undefined → is_installed is forced to false and install is forced to {} for that game, clobbering whatever refreshInstallState()/pollInstallOnce had correctly set moments earlier."
  implication: "ROOT CAUSE FOUND. refresh()'s design assumption ('bottle reconciliation is refreshInstallState()'s job') was correct ONLY as long as refresh() itself never ran while a bottle-installed game's state mattered. But refresh() DOES run — via the launch-completion path traced above — and clobbers bottle install state with a native-only scan. This exactly explains why native Steam Windows/Linux installs never showed this symptom (buildInstalledMap DOES find those) while bottle-macOS installs revert every time Play is clicked."

- timestamp: 2026-07-12
  checked: Cross-check against coordinator's handed-off lead (steamLibraryStore persistence divergence in refreshInstallState()/pollInstallOnce/pollUninstallOnce)
  found: "The persistence-divergence lead is REAL as an independent latent bug (those three code paths do mutate the in-memory `library` Map + push to frontend but never call `steamLibraryStore.set(...)`, so a full app restart before the next refresh()/full-sync would read a stale persisted is_installed:false even though the in-memory session was correct) — CONFIRMED by re-reading library.ts:372-402, 668-682, 836-844: none of the three call steamLibraryStore.set. HOWEVER this is NOT the cause of the immediate Play-click revert: refresh() does not consult steamLibraryStore's is_installed field at all when rebuilding — it derives is_installed fresh from buildInstalledMap()/would-be buildBottleInstalledMap() every time, ignoring whatever was previously persisted. So even if the persistence gap were fixed first, refresh()'s native-only scan would still stomp the in-memory Map on every launch-completion event, and the button would still revert."
  implication: "The coordinator's suggested fix (persist in refreshInstallState()/poll paths) is a legitimate secondary fix for state-loss-across-restart, but ALONE it does NOT stop the Play→Install revert. The primary/necessary fix is making refresh() itself bottle-aware (mirror refreshInstallState()'s native-wins/bottle-fallback logic). Both will be applied: primary fix required to close this symptom; secondary fix applied opportunistically since it's low-risk, mirrors gog/library.ts's installedGamesStore.set-immediately-after-mutate pattern, and closes a real related gap surfaced during this same investigation."

# Debug Session: bottle-install-not-recognized

## Symptoms

**Expected behavior:**
After a confirmed-not-native Steam game is installed through the bottled Steam client, GameLib recognizes the install — the game-page primary button flips from **Install** to **Play**, and the game can be launched from GameLib.

**Actual behavior:**
The game installs successfully (ACF `StateFlags=4` on disk; the game launches fine directly from Steam), but GameLib never recognizes it. The game-page button stays on **Install**, never becomes **Play**, and the game cannot be launched from GameLib. The stale state persists across window focus changes and navigating away and back into the game page.

**Error messages:**
None surfaced in the UI. No error toast, no thrown exception observed by the user. Backend logs not yet inspected live.

**Timeline:**
First observed 2026-07-11 session-5 human UAT, on the fresh **win64** `GameLibSteam` bottle created after 17-15 (win10_64) shipped. 17-14 (the live install-completion reconcile fix: progress percent + `hasStatus` live `is_installed`) has **never actually executed on real hardware** — sessions 4-5 were previously blocked by GAP-17-CEF-RENDER, which 17-15 only just resolved. So this is the first real-hardware exercise of the 17-14 reconcile→frontend chain.

**Reproduction:**
On macOS with CrossOver 26.2 and a win64 `GameLibSteam` bottle:
1. Install a confirmed-not-native (Windows-only) Steam game through the guided bottle flow — reproduced with Avernum 4 (appId 206020) and Avernum 6 (appId 206060).
2. Let the bottled Steam client finish the install (ACF `appmanifest_<appId>.acf` reaches `StateFlags=4` under `drive_c/Program Files (x86)/Steam/steamapps`).
3. Return focus to GameLib / navigate away and back to the game page.
4. Observe: button remains **Install**; never flips to **Play**.

## Root-cause exclusions (already verified from the orchestrator — do NOT re-investigate these)

These were proven correct via static analysis + live filesystem inspection; treat as ELIMINATED:

- **Path resolution is correct.** Bottle is win64; Steam at `drive_c/Program Files (x86)/Steam`. `resolveBottleSteamRoot()` (bottle.ts:104) probes `Program Files (x86)/Steam` first via steam.exe existence → resolves correctly. `getBottleSteamappsDir()` → `.../Program Files (x86)/Steam/steamapps`.
- **ACF data is present and correct.** `appmanifest_206020.acf` (Avernum 4) and `appmanifest_206060.acf` (Avernum 6) both have `StateFlags = 4` (FullyInstalled) in the resolved steamapps dir.
- **Bottle scan returns the games.** A faithful replica of `buildBottleInstalledMap()` (library.ts:562) run against the real bottle returned BOTH appIds.
- **Games are in the library.** Both appIds are in the loaded `steam_library.json` cache with `is_installed: false`, and in `steam_metadata.json` as `is_mac_native:false, platformsCaptured:true` (confirmed-not-native → bottle-routed, reconcile-eligible).
- **Reconcile gate is satisfied.** `refreshInstallState()` (library.ts:372) gates bottle reconcile on `isMac && isBottleProvisioned()`; `isBottleProvisioned()` is a live cxbottle.conf existence check → true. (Note: the config-store `provisioned` flag is separately stuck `false` — GAP-17-PROVISIONED-FLAG-STUCK — but the reconcile does NOT read that flag, so it is NOT the cause here.)
- **Native map build can't abort the reconcile.** `buildInstalledMap()` → `getSteamLibraries()` (utils.ts:536) can't throw — it falls back to `['/usr/share/steam']`.
- **Frontend derivation is correct given the input.** `deriveInstallStatusKind()` (hasStatus.ts:28) returns `'installed'` when the `is_installed` prop is true and no active status entry exists; 17-14 added the `gameInfo → newGameInfo` live sync (hasStatus.ts:89).

## Prime suspects (investigate these — the break is in the LIVE reconcile→frontend chain)

1. **Focus trigger not firing / not reconciling.** `mainWindow.on('focus', () => refreshInstallState())` at `src/backend/main.ts:233`. Is the focus event firing on return to GameLib? Is `refreshInstallState()` actually invoked and completing? (Compounded by a known session-5 UX issue: window focus does not reliably move to/from the bottled Steam window.)
2. **In-memory `library` Map not hydrated at reconcile time.** `refreshInstallState()` iterates `library.entries()`. If that Map instance is empty/unpopulated when the reconcile runs (vs. the on-disk cache which IS populated), every game is skipped and no badge flips. Check when/how `library` is loaded and whether the reconcile sees the same populated instance.
3. **`pushGameToLibrary` → GamePage not applied.** Even if `refreshInstallState()` flips `is_installed` and calls `sendFrontendMessage('pushGameToLibrary', updated)` (library.ts:399), the GamePage's `gameInfo` prop / `GameContext` may not re-fetch, so `hasStatus` never sees `is_installed:true`. Trace `GlobalState.handleGameStatus`/`pushGameToLibrary` handling (state/GlobalState.tsx) → `GameContext.tsx` → `GamePage/index.tsx`.
4. **Bottle install poll `pollInstallOnce` 'done' path** (library.ts ~607+, `startInstallPolling({source:'bottle'})`). This is the OTHER live-completion path (independent of focus). Did the poll start for the bottle install? Does its `'installed'` branch fire `pushGameToLibrary` + `gameStatusUpdate {status:'done'}`? Was the poll ever started, or did it never launch for this install?

## Environment / artifacts to use

- Full gap write-up + exclusions: `.planning/phases/17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i/17-VALIDATION.md` (GAP-17-BOTTLE-INSTALL-NOT-RECOGNIZED section).
- Real bottle: `~/Library/Application Support/CrossOver/Bottles/GameLibSteam` (win64; games installed at appIds 206020, 206060).
- App config store: `~/Library/Application Support/gamelib/steam_store/config.json`, library cache `~/Library/Application Support/gamelib/store_cache/steam_library.json`.
- Relevant 17-14 tests: `src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts`, `src/backend/storeManagers/steam/__tests__/library.test.ts`.
- NOTE: this is a **live-only** bug — unit tests pass. Reproduction requires the running Electron app + the real bottle; instrument logs rather than relying on the suite.

## Current Focus

```yaml
reasoning_checkpoint:
  hypothesis: "FOLLOW-ON (2026-07-12): Clicking Play on a bottle-installed Steam game reverts is_installed to false because game.launch() for the bottle path (dispatchToBottledSteam with wait:false) resolves almost immediately (does not wait for the actual game session), causing launcher.ts's launchEventCallback to emit sendGameStatusUpdate({status:'done'}) within seconds of clicking Play. The frontend's handleGameStatus treats 'done' as game-exited and unconditionally calls refreshLibrary({library:'steam'}), which invokes SteamLibraryManager.refresh(). refresh() rebuilds the ENTIRE in-memory library Map from a fresh Steam CM owned-games fetch merged with buildInstalledMap() — which ONLY scans NATIVE Steam library ACF paths, never the CrossOver bottle's own steamapps dir (unlike refreshInstallState(), which correctly falls back to buildBottleInstalledMap() when native finds nothing). For a bottle-only-installed game this makes installedData undefined, forcing is_installed:false and install:{} for that game — clobbering the correct state that refreshInstallState()/pollInstallOnce had just set — and persisting this wrong state to steamLibraryStore too. GamePage (fixed in the prior session to subscribe to steam.library) then correctly-per-its-own-logic refetches and surfaces the now-corrupted is_installed:false, reverting the button to Install."
  confirming_evidence:
    - "src/backend/storeManagers/steam/bottle.ts dispatchToBottledSteam(): runWineCommand({..., wait:false}) for the 'launch' verb — confirmed non-blocking, resolves without waiting for the actual game session."
    - "src/backend/launcher.ts launchEventCallback lines 234-325: after `await command` (game.launch()) resolves, execution falls through unconditionally to `sendGameStatusUpdate({status:'done'})` at line 321 — no runner-specific skip for Steam despite games.ts:534's comment that Steam 'owns the playing state'."
    - "src/frontend/state/GlobalState.tsx handleGameStatus lines 992-1016: status 'done' (not from 'updating') unconditionally calls `this.refreshLibrary({runInBackground:true, library:runner})`."
    - "src/backend/main.ts addHandler('refreshLibrary', ...) lines 988-997: routes to `libraryManagerMap['steam'].refresh()`."
    - "src/backend/storeManagers/steam/library.ts refresh() lines 222-257: uses ONLY buildInstalledMap() (native), with an explicit comment (line 253-254) that bottle reconciliation is intentionally left to refreshInstallState() — an assumption violated by this launch-completion call path. Confirmed by direct comparison with refreshInstallState() (lines 372-402), which DOES consult buildBottleInstalledMap() as a native-first fallback."
  falsification_test: "If refresh() is made bottle-aware (native-wins, bottle-fallback, gated on isMac && isBottleProvisioned() — mirroring refreshInstallState()) and the Play-click revert STILL occurs, this hypothesis is wrong and the break is elsewhere (e.g. a race between refresh() and the poller, or a second overwrite path). Verified indirectly via unit test: call refresh() with a bottle-only-installed game's ACF present only under the bottle root and assert is_installed stays true post-refresh; also assert it was false before the fix (red/green)."
  fix_rationale: "Root cause is refresh()'s install-state derivation being blind to bottle installs, invoked via a real, reachable, frequently-hit call path (every game launch's premature 'done' event) — not a rare edge case. The fix makes refresh() consult buildBottleInstalledMap() as a native-first fallback, exactly mirroring the already-correct, already-tested logic in refreshInstallState(). This closes the root cause directly without touching the frontend (GamePage's steam.library subscription is correct and does not need to change — it was correctly surfacing genuinely-corrupted backend data) and without touching the launcher.ts/GlobalState 'done'-triggers-refresh design (out of scope, affects all runners, high blast radius for a narrow bug)."
  blind_spots: "Cannot execute against real macOS + CrossOver hardware in this session — verification is via a live-code-path trace plus a new unit test against buildInstalledMap()/buildBottleInstalledMap() semantics, not an actual Play-button click. Also: the coordinator's persistence-divergence lead (refreshInstallState()/pollInstallOnce/pollUninstallOnce never call steamLibraryStore.set) is a real, independent bug (state lost across app restart) — fixed opportunistically alongside the primary fix since it's low-risk and was surfaced in this same investigation, but it does NOT by itself resolve the Play-click revert (refresh() ignores the persisted store's is_installed field entirely when rebuilding, so persistence alone changes nothing here)."
```

---

**PRIOR SESSION reasoning_checkpoint (for the Install→Play flip bug, already fixed and human-verified — kept for history):**

```yaml
reasoning_checkpoint:
  hypothesis: "GamePage (src/frontend/screens/Game/GamePage/index.tsx) never re-fetches its local `gameInfo` state for the steam runner because (a) it never destructures `steam` from useContext(ContextProvider) at all, and (b) the sole effect that refetches gameInfo via getGameInfo() (line 207-218) has dependency array [status, gog.library, epic.library, isMoving] — omitting steam.library entirely. Backend correctly updates the in-memory `library` Map and correctly pushes 'pushGameToLibrary' IPC events that DO update GlobalState's `steam.library` context array (GlobalState.tsx:1199-1216 handles runner==='steam' correctly). But since GamePage never watches that context slice, its local `gameInfo` state (initialized once from `location.state.gameInfo` at mount, GamePage/index.tsx:114) never refreshes, so hasStatus()'s `newGameInfo`/`is_installed` stays pinned at the value captured when the page first mounted — the button never flips to Play, and it stays stuck even after navigating away and back because React Router keeps the /gamepage/:runner/:appName route component mounted across re-navigations to the same route (no remount), so the useState initializer never re-runs."
  confirming_evidence:
    - "GamePage/index.tsx:98-99 destructures only { epic, gog, gameUpdates, platform, showDialogModal, connectivity } from ContextProvider — steam is never referenced anywhere else in the file except gameInfo.runner === 'steam' string comparisons (lines 234, 637, 641)."
    - "GamePage/index.tsx:207-218 the only effect that calls setGameInfo(await getGameInfo(appName, runner)) has deps [status, gog.library, epic.library, isMoving] — steam.library is absent, so a steam-runner pushGameToLibrary event never triggers this refetch."
    - "GlobalState.tsx:1163-1218 handleGamePush IS correctly wired: for args.runner === 'steam' it updates prevState.steam.library with the pushed GameInfo (matched by app_name) — so the context itself is NOT stale; only GamePage's consumption of it is missing."
    - "SteamGame.getGameInfo() (games.ts:176-195) reads directly from the same in-memory `library` Map (state.ts singleton) that refreshInstallState()/pollInstallOnce() write to — so a fresh getGameInfo(appName,'steam') IPC call at any time after the ACF flip would return is_installed:true. The data path backend-side is entirely correct; only the frontend refetch trigger is missing."
    - "hasStatus.ts:89-93 syncs its internal newGameInfo state to whatever `gameInfo` prop it's given (this was the 17-14 GAP-17-BOTTLE-INSTALL-DONE-DESYNC fix) — but it is fed by GamePage's `gameInfo` state, which is exactly the value proven stale above. hasStatus is downstream and behaving correctly given its (stale) input."
  falsification_test: "If steam.library IS being watched/consumed correctly by GamePage already, then adding `steam` to the destructured context and to the effect's dependency array should be a no-op with no observable behavior change, and the bug would have to lie elsewhere (e.g. in ContextProvider's memoization dropping the steam field). Confirmed by grep: no occurrence of `steam.library` or `steam,` in GamePage/index.tsx prior to fix — dependency is unambiguously absent, not just unused."
  fix_rationale: "Root cause is a missing reactive dependency, not a backend/data issue (all 4 prime-suspect backend paths — focus trigger, library Map hydration, pushGameToLibrary emission, bottle poll — were independently confirmed correct/firing). The fix adds `steam` to GamePage's destructured context and to the gameInfo-refresh effect's dependency array, mirroring the existing gog.library/epic.library pattern already used for those runners. This directly closes the reactive gap without touching any backend reconcile/poll logic, which was already correct."
  blind_spots: "Cannot execute on real macOS + CrossOver hardware in this session — verification is via static/code-path tracing (module singleton for `library` Map, IPC wiring, React effect dependency arrays), not a live repro. Also have not verified whether GameCard/Library-list components have the same class of bug (they use a different code path per grep and were not in the reported repro scope, which was specifically the game-page primary button) — worth a quick grep pass after the fix to rule out siblings of this bug in other steam-runner-aware components."
```

- hypothesis: PRIOR SYMPTOM (Install→Play flip) — CONFIRMED and FIXED, human-verified 2026-07-12.
- hypothesis: FOLLOW-ON SYMPTOM (Play→Install revert) — CONFIRMED and FIXED. refresh()'s native-only buildInstalledMap() was invoked via the premature launch-'done' event and clobbered bottle install state; now bottle-aware. See reasoning_checkpoint and Resolution (root_cause_2/fix_2) for full detail.
- next_action: AWAITING HUMAN VERIFICATION on real macOS + CrossOver bottle (win64) — click Play on Avernum 206020 or 206060 and confirm the button stays Play/Playing (does NOT revert to Install). Static verification (tsc, eslint, jest — 4 new regression tests + full existing suite) all green; see Resolution.verification_2.

## Evidence

- timestamp: 2026-07-11
  checked: src/backend/storeManagers/steam/library.ts refreshInstallState(), pollInstallOnce(), startInstallPolling(), state.ts library Map singleton
  found: All 4 prime-suspect backend paths are correct — focus handler at main.ts:233 calls refreshInstallState(); library Map (state.ts:8) is a single module-level singleton imported consistently by both library.ts and games.ts; refreshInstallState() and pollInstallOnce() both call sendFrontendMessage('pushGameToLibrary', updated) with is_installed:true and correct install.platform via installPlatformForSource('bottle') → always 'Windows'; startInstallPolling(appId, {source:'bottle'}) IS invoked from SteamGame.install() (games.ts:398) on the bottle-eligible path.
  implication: The backend reconcile→emit chain is not the break. Investigation must be frontend-side.

- timestamp: 2026-07-11
  checked: src/frontend/state/GlobalState.tsx handleGamePush handler (line 1163-1218), src/preload/api/library.ts, src/common/types/ipc.ts
  found: window.api.handleGamePush is correctly wired to the 'pushGameToLibrary' IPC channel; for args.runner === 'steam' it correctly finds-or-pushes into prevState.steam.library and calls setState. Context itself (ContextProvider.tsx:34 exposes `steam: {...}`) is updated correctly.
  implication: GlobalState/context layer is NOT stale. The break must be in a consumer that fails to observe steam.library changes.

- timestamp: 2026-07-11
  checked: src/frontend/screens/Game/GamePage/index.tsx (full file, lines 85-320 in detail)
  found: Line 98-99 destructures only { epic, gog, gameUpdates, platform, showDialogModal, connectivity } from ContextProvider — `steam` is never pulled from context. Line 114 `const [gameInfo, setGameInfo] = useState(locationGameInfo)` seeds local state once from route location.state at mount. The only effect that refetches gameInfo from the backend (line 207-218, `getGameInfo(appName, runner)` → `setGameInfo(newInfo)`) has dependency array `[status, gog.library, epic.library, isMoving]` — steam.library is absent.
  implication: ROOT CAUSE FOUND. GamePage never re-renders with fresh steam gameInfo after a backend-side is_installed flip, for either the focus-reconcile path or the bottle-poll-completion path — both correctly push to context, but GamePage doesn't listen. hasStatus (downstream) is proven correct-given-its-input (17-14 fix), so the break is exactly here.

- timestamp: 2026-07-11
  checked: src/backend/storeManagers/steam/games.ts getGameInfo() (line 176-195)
  found: Reads directly from the same `library` Map singleton (`library.get(this.appId)`) that refreshInstallState/pollInstallOnce write to — no caching layer or staleness between the Map write and a getGameInfo() IPC call at any later time.
  implication: Confirms the fix (adding steam.library as an effect dependency, triggering a getGameInfo refetch) will retrieve correct fresh data once wired — no additional backend change needed.

## Eliminated

(see "Root-cause exclusions" above — path resolution, ACF data, bottle scan, library membership, reconcile gate, native-map-throw, frontend derivation)

- hypothesis: "Focus trigger not firing / not reconciling" (prime suspect #1) as the SOLE cause
  evidence: main.ts:233 focus handler and refreshInstallState() are correctly wired and would correctly emit pushGameToLibrary if focus fires. Even granting the known session-5 UX issue (focus not reliably transferring to/from the bottled Steam window), the deeper bug is that GamePage would not observe the update even if focus DID fire and reconcile ran to completion — proven by the missing steam.library dependency. This is the dominant/necessary cause; the focus-transfer UX issue (if real) is at most a compounding factor, not the root cause.
  timestamp: 2026-07-11

- hypothesis: "In-memory library Map not hydrated at reconcile time" (prime suspect #2)
  evidence: state.ts:8 defines `library` as a single module-level singleton Map, imported via consistent relative path (`./state`) by both library.ts and games.ts — no risk of duplicate module instances within the same Electron main process. init() populates it from steamLibraryStore cache before any reconcile could run.
  timestamp: 2026-07-11

- hypothesis: "Bottle install poll pollInstallOnce 'done' path never fires" (prime suspect #4)
  evidence: startInstallPolling(this.appId, {source:'bottle'}) is called synchronously inside SteamGame.install()'s bottle-eligible branch (games.ts:398), immediately after tellBottledSteamToInstall() resolves — it is unconditional on that path, not dependent on any user follow-up action. pollInstallOnce's 'installed' branch (library.ts:668-700) correctly updates library.set() and sends pushGameToLibrary + gameStatusUpdate {status:'done'}. This path is correct; it was prime suspect #3 (pushGameToLibrary → GamePage not applied) that was confirmed instead.
  timestamp: 2026-07-11

## Resolution

root_cause: "src/frontend/screens/Game/GamePage/index.tsx never subscribes to `steam.library` from ContextProvider and its gameInfo-refresh effect (line 207-218) omits `steam.library` from its dependency array (unlike gog.library/epic.library, which ARE included). Backend correctly reconciles ACF state and pushes updated GameInfo via `pushGameToLibrary` (both via the focus-triggered refreshInstallState() reconcile and via the bottle install poller's 'done' completion), and GlobalState.tsx correctly folds that push into context.steam.library — but GamePage's local `gameInfo` state (seeded once from route location.state at mount) is never refetched in response, so hasStatus() keeps deriving 'notInstalled' forever. Because React Router keeps the /gamepage/:runner/:appName route component mounted across re-navigations to the same route, the useState initializer never re-runs either, so 'navigate away and back' does not self-heal it."
fix: "Added `steam` to GamePage's useContext(ContextProvider) destructure (index.tsx:98-105) and added `steam.library` to the dependency array of the gameInfo-refresh effect (index.tsx:207-219, was `[status, gog.library, epic.library, isMoving]`, now `[status, gog.library, epic.library, steam.library, isMoving]`). Mirrors the existing gog.library/epic.library pattern already used for those runners. No backend change was needed — refreshInstallState(), pollInstallOnce(), the library Map singleton, and pushGameToLibrary/GlobalState wiring were all already correct."
verification: "Static verification only (live-only bug, no macOS+CrossOver hardware in this session): (1) npx tsc --noEmit -p tsconfig.json — exit 0, no type errors. (2) npx eslint src/frontend/screens/Game/GamePage/index.tsx — 12 pre-existing warnings (0 errors), none new/related to `steam` or the touched dependency array. (3) npx jest src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts — 6/6 passed (downstream consumer unaffected, confirms hasStatus behaves correctly once fed live gameInfo). (4) npx jest src/backend/storeManagers/steam/__tests__/library.test.ts — 79/79 passed (backend untouched, confirms no regression). Requires human verification on the real bottle to confirm the button actually flips Install→Play end to end."
files_changed:
  - src/frontend/screens/Game/GamePage/index.tsx

---

**FOLLOW-ON root cause / fix (2026-07-12, Play→Install revert):**

root_cause_2: "SteamLibraryManager.refresh() (src/backend/storeManagers/steam/library.ts) derives is_installed for every owned game using ONLY buildInstalledMap() (native ACF scan) — never buildBottleInstalledMap(). This function is invoked on every game-launch completion: game.launch() for a bottle-eligible Steam game resolves almost immediately (dispatchToBottledSteam uses wait:false, not waiting for the actual game session), so launcher.ts's launchEventCallback emits a premature sendGameStatusUpdate({status:'done'}) seconds after Play is clicked; GlobalState.handleGameStatus treats 'done' as game-exited and unconditionally calls refreshLibrary({library:'steam'}) -> SteamLibraryManager.refresh(). For a bottle-only-installed game, the native-only scan finds nothing, forcing is_installed:false and persisting that wrong state to steamLibraryStore, which the (correctly-fixed) GamePage then faithfully surfaces as a reverted Install button."
fix_2: "Made refresh() bottle-aware: added a bottleInstalledMap (built via buildBottleInstalledMap(), gated on isMac && isBottleProvisioned() exactly like refreshInstallState()) and changed each app's installedData derivation to nativeInstalledData ?? bottleInstalledData (native always wins when present), with install.platform derived via installPlatformForSource(source) instead of the hardcoded 'native'. This mirrors refreshInstallState()'s already-correct/already-tested reconciliation logic exactly. Secondary fix (opportunistic, low-risk): added steamLibraryStore.set('games', Array.from(library.values())) immediately after each library.set() mutation in refreshInstallState(), pollInstallOnce()'s 'installed' branch, and pollUninstallOnce()'s 'absent' branch, mirroring gog/library.ts's installedGamesStore.set-immediately-after-mutate pattern — closes a related state-loss-across-app-restart gap surfaced during this investigation (not itself the cause of the Play-click revert, since refresh() never consulted the persisted store's is_installed field)."
verification_2: "(1) Added unit test(s) in src/backend/storeManagers/steam/__tests__/library.test.ts: refresh() with a game installed ONLY under the bottle root (mocked isBottleProvisioned=true, buildBottleInstalledMap returning the appId, buildInstalledMap returning empty) — asserts is_installed:true and install.platform:'Windows' post-refresh (previously would have been false — confirmed red before the fix, green after). (2) npx tsc --noEmit — exit 0. (3) npx eslint on touched files — 0 new errors. (4) full jest suite for src/backend/storeManagers/steam/ — all green. Requires human verification: click Play on Avernum 206020/206060 on the real bottle and confirm the button stays Play (or shows Playing/Stop) and does not revert to Install."
files_changed_2:
  - src/backend/storeManagers/steam/library.ts
