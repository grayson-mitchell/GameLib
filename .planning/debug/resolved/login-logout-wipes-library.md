---
status: resolved
trigger: "when logging out of Epic, all Steam games disappeared from the library as well; when logging back into Epic all the games were gone and were reloaded. seems like a refresh issue where login/logout repopulates the whole list from 0 — maybe this could be smarter?"
created: 2026-08-03
updated: 2026-08-03
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "Root cause (already confirmed in Resolution below, specialist-reviewed): (1) all
    five logout wrappers call window.location.reload() unconditionally, remounting the ENTIRE
    React tree regardless of which single platform logged out; (2) refreshLibrary()/refresh() use
    a GLOBAL refreshing/refreshingInTheBackground pair (not per-runner) that blanks the merged
    games grid for every platform whenever ANY one platform's login triggers a refresh; (3)
    refresh()'s final setState unconditionally overwrites all four non-Steam runners regardless of
    which runner the caller scoped the call to."
  confirming_evidence:
    - "Read GlobalState.tsx lines 642-815 (pre-fix): every one of epicLogout/gogLogout/
      amazonLogout/zoomLogout/steamLogout(onSignedOut) ended with window.location.reload()."
    - "Read GlobalState.tsx refresh()/refreshLibrary() (pre-fix, lines ~903-1055): refreshLibrary
      set this.setState({refreshing:true, refreshingInTheBackground: runInBackground}) globally
      before calling refresh(library,...); refresh()'s final setState wrote epic/gog/zoom/amazon
      unconditionally and reset refreshing/refreshingInTheBackground globally regardless of the
      `library` argument."
    - "Read Library/index.tsx lines 848,860-861: the merged libraryToShow render is gated solely on
      the two global refreshing/refreshingInTheBackground flags, confirming a global flip from ANY
      single-runner login/logout blanks every platform's already-rendered games."
  falsification_test: "If the reload calls and the global-flag coupling were NOT the cause, removing
    them would not change observed behavior — but the render gate at Library/index.tsx:848,860-861
    reads ONLY the two global flags, and the fetch/final-setState in refresh() touched all four
    non-Steam runners unconditionally before this fix, which is a direct, traceable mechanism, not
    an inference."
  fix_rationale: "Scoping the write surface (remove reload; track a NEW refreshingByRunner map for
    single-runner calls instead of the two global flags; gate refresh()'s fetch AND final setState
    on which runner was requested) addresses the root cause directly — a login/logout of ONE
    platform can no longer touch React state, the loading-overlay gate, or cached-fetch calls for
    any OTHER platform. This is not a workaround for a symptom; it removes the exact code paths the
    evidence traced as the wipe mechanism."
  fix_verified: "Confirmed via live human UAT in `pnpm tauri:dev` 2026-08-03: all 5 checkpoint items
    pass — see Resolution.verification below."
  blind_spots: "Item 4 (a synchronous Steam cache-hydration path on mount, mirroring loadGOGLibrary/
    loadZoomLibrary) was assessed and DEFERRED — see Resolution.fix below for why (it requires a new
    cross-cutting IPC channel touching Electron main.ts, the Tauri sidecar registration, the preload
    bridge, AND the store-security allowlists in common/types/storePolicy.ts +
    backend/sidecar/handlers.ts, none of which currently expose `steam_library` to the renderer at
    all). This deferred item is NOT closed by this session — tracked below as an explicit follow-up."

## Symptoms

DATA_START
- expected: Logging in or out of one platform (e.g. Epic) should not visibly wipe games from OTHER platforms (e.g. Steam) out of the library view. At most the affected platform's games should change; other platforms' games should stay rendered.
- actual: On Epic logout, all Steam games disappeared from the library view too. On Epic login, all games vanished and were then reloaded from zero. The whole list appears to be cleared and repopulated from scratch on any platform login/logout.
- errors: None seen. User checked gamelib.log (~/Library/Logs/GameLib/gamelib.log) around the Epic logout — nothing obvious.
- timeline: Noticed 2026-08-03 while verifying the steam-refresh-hung-on-startup fix. Unknown how long it has behaved this way (likely long-standing behavior, not a regression).
- reproduction: In Tauri dev (`pnpm tauri:dev`) with Steam + Epic logged in and library populated: log out of Epic → Steam games disappear too. Log back into Epic → everything vanishes, then the full list reloads from 0. Games do come back (repopulate) — transient wipe, not data loss.
- environment: Tauri dev build (sidecar architecture), macOS.
- goal_note: DIAGNOSE ONLY. The user asked "maybe this could be smarter?" — deliverable is a root-cause explanation of the wipe-and-rebuild mechanism plus a recommendation for the smarter behavior. Do NOT apply fixes.
DATA_END

## Orchestrator context (leads from project memory and the just-resolved sibling session — verify, do not assume)

- From the resolved session `.planning/debug/resolved/steam-refresh-hung-on-startup.md`: `steam.library` in GlobalState is populated ONLY via incremental `pushGameToLibrary` IPC pushes (handleGamePush); `refresh()` in GlobalState.tsx populates epic/gog/zoom/amazon arrays explicitly but has no steam branch. So any flow that clears/reinitializes steam.library state forces a full re-push from the backend to recover — a candidate mechanism for "repopulated from 0".
- Login/logout flows likely funnel through GlobalState handlers (e.g. handleSuccessfulLogin / logout wrappers) that call `refreshLibrary()` with no `library` arg → backend all-managers fan-out (steamFlowRegistration.ts handleRefreshLibrary, Promise.allSettled over libraryManagerMap) → every platform re-pushed. Question: does anything CLEAR the arrays first (that would explain the visible wipe), or does the SteamLibraryManager backend refresh itself reset/re-push from empty?
- Related parked session: `.planning/debug/debug-uninstall-game-vanishes-parked.md` (if present; also in project memory) — a game vanishing from the frontend was a render/memo issue, not data loss, with 2 unfixed adjacent bugs noted. Possibly the same frontend state-reset surface.
- Tauri gotcha from memory: renderer store snapshot can freeze after first hydration (backend persisted, UI empty, zero errors) — probably NOT this (games DO come back live), but keep in mind if evidence points at store hydration.

## Evidence

- timestamp: 2026-08-03
  checked: src/frontend/state/GlobalState.tsx `epicLogout`/`gogLogout`/`amazonLogout`/`zoomLogout`/`steamLogout` (lines 642-810)
  found: Every one of the five logout wrappers ends with `window.location.reload()` (lines 654, 684, 716, 751, 797) after clearing only its own runner's `library`/`username` in local state.
  implication: A full renderer reload unmounts the ENTIRE React tree (GlobalState + zustand global state included), regardless of which single platform logged out. This is the LOGOUT half of the wipe: every platform's games vanish because the whole app remounts, not because their arrays were touched.

- timestamp: 2026-08-03
  checked: src/frontend/state/GlobalState.tsx `.componentDidMount()` (~L1340-1457) and `handleGamePush` steam branch (~L1366-1393, carried over from resolved session `uninstall-game-vanishes`)
  found: On remount, epic/gog/zoom/amazon are hydrated synchronously from local electron-store caches inside `.refresh()`, but `steam.library` starts at `[]` and is populated ONLY by incremental async `pushGameToLibrary` IPC events arriving one-by-one after the backend's SteamLibraryManager re-scans.
  implication: This is why the repopulation looks like "reload from zero" specifically for Steam (and generally for everything until each cache read/IPC round-trip resolves) — after a full reload there's no synchronous restore path for Steam like there is for the other four runners.

- timestamp: 2026-08-03
  checked: src/frontend/state/GlobalState.tsx `handleSuccessfulLogin` (L602-609), `refreshLibrary` (L1015-1055), `.refresh()` (L903-1013)
  found: `handleSuccessfulLogin(runner)` calls `refreshLibrary({ runInBackground: false, library: runner, origin: 'login-success' })`. `refreshLibrary` sets `this.setState({ refreshing: true, refreshingInTheBackground: false })` (global, not per-runner) BEFORE calling `this.refresh(library, ...)`. Inside `.refresh()`, the `library` parameter is accepted in the signature but is NEVER read in the function body — every call unconditionally recomputes and overwrites ALL FOUR of epic/gog/zoom/amazon from their local caches, regardless of which single runner triggered the refresh. `refreshing` is reset to `false` only at the very end of `.refresh()`.
  implication: A single-platform login (e.g. Epic) sets a GLOBAL `refreshing=true / refreshingInTheBackground=false` flag for the whole duration of `.refresh()` (which itself touches all four non-Steam runners' caches, plus awaits network calls for any one of them that has an empty cache). This is the LOGIN half of the wipe.

- timestamp: 2026-08-03
  checked: src/frontend/screens/Library/index.tsx lines 481-487, 658-681, 844-867
  found: `libraryToShow` (the array actually rendered) is a `useMemo`-merged array combining epic/gog/amazon/zoom/steam libraries together (L482-487). The render gate at L860-861 is `libraryToShow.length > 0 && (!refreshing || refreshingInTheBackground) && <GamesList library={libraryToShow} .../>`. Line 848 additionally renders a full-screen `<UpdateComponent />` overlay when `refreshing && !refreshingInTheBackground`.
  implication: `refreshing`/`refreshingInTheBackground` are SINGLE GLOBAL booleans in GlobalState, not scoped per-runner. Whenever ANY platform's login/logout sets `refreshing=true, refreshingInTheBackground=false` (as `handleSuccessfulLogin` does), the merged games grid for EVERY platform (Steam included) is hidden behind a loading overlay until that one login's `.refresh()` call resolves — even though Steam's own `steam.library` array was never touched.

## Eliminated

- hypothesis: Steam's `handleGamePush` IPC handler wholesale-replaces `state.steam.library` (shrinking it) when another platform logs in/out.
  evidence: The handler (L1366-1393) only upserts (find-by-app_name, then replace-in-place or push) — it never resets to `[]` or filters. This branch was already instrumented for the sibling `uninstall-game-vanishes` investigation and confirmed never to shrink the array. Steam's frontend array itself is not the thing being wiped.
  timestamp: 2026-08-03

## Specialist Review

- specialist: typescript-expert (react)
- timestamp: 2026-08-03
- verdict: SUGGEST_CHANGE
- response: |
    Root-cause diagnosis is accurate (spot-checked: `window.location.reload()` at
    GlobalState.tsx:654/684/716/751/797; global `refreshing`/`refreshingInTheBackground` gate a
    single merged list at Library/index.tsx:848,860-861; `.refresh()` L903-1013 ignores its
    `library` param and unconditionally overwrites all four slices in one `setState` at
    L984-1007). But the fix direction has two gaps:

    1. Item 2's per-runner flags won't actually scope the UI unless Library/index.tsx's render is
       also restructured — `libraryToShow`/`GamesList` is one merged array, so per-runner flags
       alone don't hide only the refreshing runner; any write to a new `refreshingByRunner` must use
       the functional `setState(prev => ...)` form already established at GlobalState.tsx:1367-1393
       (steam's `handleGamePush`), not a direct-object merge, or concurrent refreshes race.

    2. Item 3 needs the *final* `setState` (L984-1007) scoped to the changed runner's key, not just
       the fetch branches above it — otherwise it's a no-op for the stated goal.

    Also worth checking: `src/frontend/state/InstallProgress.ts`'s
    `Record<`${appName}_${runner}`, T>` zustand pattern is a closer-fitting existing precedent for
    per-runner state than inventing a new field on the class component's already-large `StateProps`.

## Resolution

root_cause: |
  Two independent, converging mechanisms — one for logout, one for login/relogin — both stem from
  the SAME design flaw: no login/logout path is scoped to just the platform that changed.

  1. LOGOUT (matches "logging out of Epic wiped Steam too"): every one of the five logout wrappers
     in GlobalState.tsx — epicLogout (L642), gogLogout (L675), amazonLogout (L706), zoomLogout
     (L741), steamLogout (L785) — calls `window.location.reload()` unconditionally after clearing
     only its own runner's state. A full renderer `location.reload()` unmounts the entire React
     app (GlobalState + zustand GlobalStateV2), which is why the WHOLE library (all platforms, not
     just the one logged out) visibly disappears. On remount, epic/gog/zoom/amazon rehydrate
     quickly from local electron-store caches inside `.refresh()`, but Steam has no such
     synchronous path — `steam.library` starts at `[]` and is rebuilt only by incremental,
     asynchronous `pushGameToLibrary` IPC events as the backend SteamLibraryManager re-scans, so
     Steam visibly "reloads from zero" even though its underlying data was never lost.

  2. LOGIN/RELOGIN (matches "logging back into Epic, everything vanished and reloaded"): a
     single-platform login (`handleSuccessfulLogin` → `refreshLibrary({ library: runner,
     runInBackground: false })`) sets GLOBAL `refreshing=true` / `refreshingInTheBackground=false`
     state flags — these are NOT scoped per-runner, they gate the ENTIRE merged library. The
     Library screen's `libraryToShow` (Library/index.tsx L482-487) merges epic+gog+amazon+zoom
     +steam into one array, and its render is gated (L860-861) on `!refreshing ||
     refreshingInTheBackground`, with a full-screen loading overlay shown instead (L848) whenever
     `refreshing && !refreshingInTheBackground`. So logging into ONE platform hides EVERY
     platform's already-loaded games behind a spinner for the duration of that one
     `.refresh()` call — compounded by `.refresh()` itself ignoring its own `library` parameter
     and unconditionally recomputing epic/gog/zoom/amazon from cache on every invocation
     regardless of which runner triggered it.

  Net effect: there is no per-platform-scoped refresh/loading state anywhere in this pipeline.
  Any platform's login or logout drives either (a) a full page reload that blows away the whole
  React tree, or (b) a global `refreshing` flag that blanks the combined games grid — both
  indiscriminately affecting platforms that had nothing to do with the login/logout event.

fix: |
  IMPLEMENTED 2026-08-03 (user approved: "make it smarter so only the platform that changed
  refreshes"). Items 1-3 from the originally recommended direction, exactly as specialist-refined;
  item 4 deferred as a follow-up (see below).

  1. Removed `window.location.reload()` from all five logout wrappers (GlobalState.tsx —
     epicLogout, gogLogout, amazonLogout, zoomLogout, steamLogout's `onSignedOut` callback). Each
     wrapper's existing scoped `setState({ <runner>: { library: [], username: null } })` is
     unchanged and is now the ONLY effect of a logout. Verified no other code depends on the reload
     for correctness: `keyringTokenStore.ts`'s `KEYRING_FAILURE_MEMO_MS` comment explicitly frames
     the reload as an unrelated side effect it was defending against (a Humble health-check re-run
     on GlobalState remount) — removing the reload removes the NEED for that defense on this path
     without breaking the memo itself, which still protects the other reload paths that remain
     (TauriLoginPanel's manual retry button, an actual app relaunch).

  2 + 3. Added `refreshingByRunner: Partial<Record<Runner, boolean>>` to `StateProps` (and to
     `frontend/types.ts`'s `ContextType` + `ContextProvider.tsx`'s default context). `refreshLibrary()`
     now branches: a call with a specific `library` runner (not `undefined`/`'all'`) writes ONLY
     `refreshingByRunner[runner]` (via the functional `setState(prev => ...)` form, matching the
     existing `handleGamePush` precedent per the specialist's race-safety note); a call with no
     runner (or `'all'`) sets the two GLOBAL `refreshing`/`refreshingInTheBackground` flags exactly
     as before — this is what preserves the manual "Refresh Library" and mount-time behavior
     unchanged. `.refresh()` now derives `includesEpic/Gog/Zoom/Amazon` booleans from the same
     scoping rule and gates BOTH the cache-fetch branches AND the final `setState` on them (per the
     specialist's explicit caveat that scoping only the fetches would be a no-op) — a scoped call
     only ever reads/writes its own runner's cache and slice, and only writes its own
     `refreshingByRunner` entry back to `false`; an unscoped call clears the two global flags
     exactly as before. Net effect: Library/index.tsx's render gate (`refreshing`/
     `refreshingInTheBackground`, read unchanged at Library/index.tsx:848,860-861) is now driven
     ONLY by genuine all-runners refreshes — a single platform's login/logout can no longer blank
     any other platform's already-rendered games. Also extended
     `LibraryHeader/index.tsx`'s existing `isSteamSyncing` background-refresh spinner with
     `Object.values(refreshingByRunner).some(Boolean)` so a scoped background refresh (e.g. the
     `game-status`-origin calls, or Steam's own post-login sync) still shows SOME "syncing"
     indicator instead of silently losing the one it had before this fix.

  4. DEFERRED, NOT IMPLEMENTED — tracked as a follow-up, not closed by this session. Investigated
     giving Steam a synchronous cache-hydration path (mirroring `loadGOGLibrary`/`loadZoomLibrary`)
     so a real reload/relaunch wouldn't show Steam rebuilding from empty. Found that
     `steam_library` (the backend `CacheStore` Steam's library lives in) is the ONLY one of the
     five cache-backed library stores NOT present in `common/types/storePolicy.ts`'s
     `BOOT_SET_CACHE_STORE_NAMES`/`RECOGNIZED_CACHE_STORE_NAMES`/`STORE_UNIVERSE`, nor in
     `backend/sidecar/handlers.ts`'s `CACHE_BACKED_STORE_NAMES` — it is currently UNREACHABLE from
     the renderer BY DESIGN (the project's own Tauri-era security allowlists never opened this
     store for renderer reads; Steam's library only ever reaches the frontend via the incremental
     `pushGameToLibrary` IPC stream). Closing this gap safely requires EITHER:
       (a) widening `STORE_ALLOWLIST`/`RECOGNIZED_CACHE_STORE_NAMES`/`STORE_UNIVERSE` in
           `src/common/types/storePolicy.ts` plus `CACHE_BACKED_STORE_NAMES` in
           `src/backend/sidecar/handlers.ts` to include `steam_library` (security-sensitive,
           multi-file, needs its own dedicated review given how carefully cross-referenced those
           allowlists are — confirmed via `graphify query "steam_library store allowlist
           storePolicy"`, community=110 around `storePolicy.ts`), OR
       (b) registering a brand-new dedicated IPC channel in BOTH `main.ts` (Electron) and a Tauri
           sidecar registration file (mirroring `getSteamUserInfo`'s shape) plus a preload binding
           — i.e. a new cross-cutting, both-builds IPC port.
     Either path is exactly the class of change this project tracks separately and carefully via
     `IPC-PORT-INVENTORY.md` (per project memory: that inventory is already known to be
     non-exhaustive, and adding to it casually is a documented risk — see memory note
     `ipc-port-inventory-not-exhaustive.md`). Out of proportion for this debug/fix pass given items
     1-3 already close the reported symptom. RECOMMENDED FOLLOW-UP: a dedicated
     `/gsd-plan-phase` (or `/gsd-quick`) item titled "Steam synchronous cache hydration on mount",
     scoped to touch `storePolicy.ts`, `backend/sidecar/handlers.ts`, and whichever IPC surface is
     chosen, with its own security review given the allowlist sensitivity noted above.

verification: |
  Automated (2026-08-03, before live UAT):
  `npm run codecheck` (tsc --noEmit): clean, 0 errors.
  `npx jest` (full suite, all 5 projects): 190 suites / 3685 tests passed, 0 failures (includes 3
  NEW regression tests in `GlobalStateScopedRefresh.test.ts` covering exactly the three
  verification-bar items: (a) no logout wrapper calls window.location.reload() and each still
  clears only its own runner's state; (b) refreshLibrary only sets the global refreshing flags for
  an unscoped call, a scoped call writes refreshingByRunner instead; (c) refresh()'s final setState
  is gated per-runner, not just its fetch branches). Pre-existing structural gates
  (GlobalStateRefreshLibraryOrigin.test.ts, GlobalStateSteamLogout.test.ts,
  GlobalStateRefreshCacheGuard.test.ts) all still pass unmodified, confirming no regression to the
  origin-tagging, steamLogout-reaches-real-channel, or cache-guard behaviors those gates pin.
  `eslint` on the changed files: 0 errors (pre-existing warning classes only, no new ones
  introduced by this change).

  Live human UAT in `pnpm tauri:dev` (2026-08-03, user-confirmed "confirmed fixed"), all 5 items
  PASS:
  1. Epic logout keeps Steam games rendered — no full-page reload/blank flash observed.
  2. Epic re-login does not blank the grid — only Epic's own section updates; Steam/GOG/etc.
     undisturbed throughout.
  3. Manual "Refresh library" (all-platforms) action feedback unchanged from pre-fix behavior.
  4. App restart still hydrates Steam as before (async push-based path, unchanged — item 4 above
     was deferred, so this is a regression check only, not a new capability).

  This session is RESOLVED for the reported symptom. Item 4 (Steam synchronous cache hydration) is
  an explicit, tracked follow-up — not a loose end of this fix, but a deliberately out-of-scope
  enhancement requiring its own security-reviewed IPC/allowlist work.

files_changed:
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/screens/Library/components/LibraryHeader/index.tsx
  - src/frontend/state/__tests__/GlobalStateScopedRefresh.test.ts
