---
slug: bottle-install-not-recognized
status: resolved
trigger: "GAP-17-BOTTLE-INSTALL-NOT-RECOGNIZED — bottle-installed Steam game never flips from Install to Play in GameLib on real macOS + CrossOver (win64 bottle), despite ACF StateFlags=4 on disk and the game running fine launched directly from Steam."
phase: 17
created: 2026-07-11
updated: 2026-07-12
resolved: 2026-07-12
human_verified: true
fix_commit: "GamePage subscribes to steam.library (see git log fix(17))"
---

> **RESOLVED 2026-07-12 — human-verified on real macOS + CrossOver (win64 bottle).**
> The button flips Install→Play after the fix. See Resolution section below.

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

- hypothesis: CONFIRMED and FIXED — see reasoning_checkpoint above.
- next_action: awaiting human verification on real macOS + CrossOver bottle (win64) — reinstall/re-check Avernum 4 (206020) or Avernum 6 (206060) and confirm the game-page button flips Install → Play after the ACF reaches StateFlags=4, both via focus-return and via navigate-away-and-back.

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
