---
phase: quick-261107-lum
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/gameEligibility.ts
  - src/backend/storeManagers/steam/bridge/bridgeRoute.ts
  - src/backend/storeManagers/steam/gameInstall.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/common/types/ipc/steam.ts
  - src/common/types/ipc/steamAuth.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  - src/frontend/state/SteamBridgeRouteNotice.ts
  - src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx
  - src/frontend/state/SteamBridgeSetup.ts
  - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
  - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
  - src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts
  - .planning/todos/pending/2026-11-07-console-mode-steam-platform-row.md
autonomous: false
requirements: [TODO-2026-11-07-forced-windows-steam-install-routes-to-bridge]

must_haves:
  truths:
    - "On macOS, installing a Mac-native Steam game with 'Windows' chosen (proven Windows depot) resolves the normal bridge verdict and, when that verdict is bridge, installs into its own GameLibSteamBridge-<appId> bottle via installBridgeGame"
    - "Bridge verdict precedence still applies to the forced install: failed-this-session, user-forced-bottle, drm-wrapped known-bad and win64-no-shim still land on bottled Steam; a non-DRM known-bad or scan-miss still routes to the bridge behind its notice"
    - "After a forced bridge install completes, launch() dispatches launchBridgeGame (Windows exe through the bridge), never steam://rungameid for the Mac build"
    - "Uninstalling a forced bridge install clears the persisted forced-Windows flag so a later install of the same title defaults to the Mac build again"
    - "The desktop install dialog's route line and Wine section reflect the forced-Windows route: with Windows chosen and a bridge verdict, the shared Wine selector is hidden"
    - "A route notice or bridge-setup fallback raised during a forced-Windows install replays the Windows choice; it never silently reinstalls the Mac build"
  artifacts:
    - path: "src/backend/storeManagers/steam/gameEligibility.ts"
      provides: "assembleBridgeRouteInput/bridgeRoute/checkBridgeRoute accept a per-call windowsBuildChosen option"
      contains: "windowsBuildChosen"
    - path: "src/backend/storeManagers/steam/gameInstall.ts"
      provides: "install() resolves the bridge route with the honoured forced-Windows choice; marks the forced flag on bridge success; notice/setup payloads carry the choice"
      contains: "windowsBuildChosen"
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "forced flag cleared on a confirmed-absent bridge uninstall"
    - path: "src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx"
      provides: "getSteamBridgeRoute re-requested with gating.forceWindowsViaBottle"
  key_links:
    - from: "gameInstall.ts install()"
      to: "gameEligibility.ts bridgeRoute(steamGame, { windowsBuildChosen })"
      via: "both resolveEligibilityBridgeRoute calls (initial + post-prescreen)"
      pattern: "resolveEligibilityBridgeRoute\\(steamGame, \\{"
    - from: "gameInstall.ts install() bridge branch"
      to: "gameSessionState.markForcedWindowsViaBottle"
      via: "on a completed (non-deferred, status done) forced install"
      pattern: "markForcedWindowsViaBottle"
    - from: "gameLaunch.ts launch()"
      to: "launchBridgeGame"
      via: "isBottleEligible (persisted forced flag) then findBridgeInstallBottle location check — existing code, now reachable"
      pattern: "findBridgeInstallBottle"
    - from: "SteamDialog/index.tsx"
      to: "getSteamBridgeRoute IPC 2nd arg"
      via: "useEffect deps [appName, gating.forceWindowsViaBottle]"
      pattern: "getSteamBridgeRoute\\(appName, "
---

## Scope verdict: fits a quick task (upper bound) — no scoped-down slice needed

This is not a phase-sized change, for one structural reason: **launch and uninstall already
route by LOCATION, not eligibility.** `launch()` (gameLaunch.ts:109-145) enters its Windows
block on `isBottleEligible()` (platform OR the persisted D-17 `forcedWindowsViaBottle` flag) and
then dispatches `launchBridgeGame()` when `findBridgeInstallBottle(appId)` finds the manifest in a
bridge bottle. `uninstall()` (gameUninstall.ts:66) checks `findBridgeInstallBottle` first. The
library scan already labels a bridge copy as platform `'Windows'`. So **no new persisted per-game
route record is needed**: reusing the existing `forcedWindowsViaBottle` flag (meaning "the user
chose the Windows build on a Mac-native title") makes launch, `isNative()`, settings and save-sync
consistent, and the bridge bottle's manifest decides WHERE. What is needed is: (1) the per-install
route input, (2) mark/clear of the flag on the bridge path, (3) replaying the choice through the
two deferral surfaces, (4) the dialog's verdict. ~17 files, most of them one-to-five-line edits.

## Design calls (recorded so the executor does not re-litigate them)

- **DC-1: per-call option, never the persisted flag, feeds the route input.** WHY the D-17 pin
  exists (bridgeRoute.ts header, gameEligibility.ts:99-104): a *persisted* forced flag belongs to
  an install that already committed bits to the shared `GameLibSteam` bottle; feeding it to the
  resolver would resolve a route into a `GameLibSteamBridge` bottle that install never wrote a byte
  into. A per-install *request* has written nothing anywhere yet, so it is a different input. The
  51-REVIEW WR-08 guard in install() (`hasBottledSteamCopy` keeps the bottled path when GameLibSteam
  already holds bits) still covers the "bits already in GameLibSteam" case. So:
  `assembleBridgeRouteInput(steamGame, options?: { windowsBuildChosen?: boolean })` ORs
  `options?.windowsBuildChosen === true` into `platformsBottleEligible`. `resolveBridgeRoute` and
  `BridgeRouteInput` are NOT changed (no new field, so the `/forced/i` fixture pin and the pure
  resolver's row table are untouched). The persisted flag is still never read inside
  `assembleBridgeRouteInput` (metadataCapture.test.ts:238 pin holds).
- **DC-2: reuse `forcedWindowsViaBottle`, mark it on bridge success too.** Same discipline as
  D-17 (34.13-14): mark only when THIS install was forced AND it completed (`status === 'done'`
  and not `deferredToSetup`). Without the mark, a forced bridge install of a Mac-native title would
  report `isNative() === true` and `launch()` would open `steam://rungameid` (the Mac build).
- **DC-3: clear the flag on a confirmed-absent bridge uninstall** (library.ts pollUninstallOnce),
  mirroring the existing bottle-scoped clear. Otherwise a stale flag would make every later
  install of that title go Windows without asking.
- **DC-4: the dialog re-requests the verdict for the platform choice.** `getSteamBridgeRoute`
  gains an optional 2nd arg `windowsBuildChosen`; backend honours it only under the same triple
  gate as install() (`=== true` AND `isMac` AND persisted `is_windows_native === true`). The
  SteamDialog effect passes `gating.forceWindowsViaBottle` and depends on it. This is smaller than
  widening `SteamBottleEligibilityVerdict` and keeps `resolveBridgeRouteLine` the sole
  interpreter. With no 2nd arg, `getBridgeRouteVerdict` derives the choice from LOCATION
  (`isForcedWindowsViaBottle && findBridgeInstallBottle(appId) !== null`) so the GamePage /
  report-problem route display is honest for an installed forced bridge game.
- **DC-5: replay the choice through deferrals.** `steamBridgeRouteNotice` and the install-side
  `steamBridgeSetupRequired` payloads gain optional `forceWindowsViaBottle?: true` (included only
  when true, so existing exact-payload assertions stay green); their frontend retries pass it as
  `installSteamGame`'s 4th arg — the 54-REVIEW CR-01 precedent `SteamGoOfflineNotice` already uses.
  Without this, a forced install that hits a notice (now reachable) would retry WITHOUT the choice
  and install the Mac build.
- **DC-6: accepted, not fixed here** (pre-existing, same as every Windows-only bridge title): a
  bridge launch that fails this session falls back to bottled Steam even though no GameLibSteam
  copy exists; an app crash mid-bridge-install leaves the flag unmarked (D-17's mark-on-success
  discipline). Do not widen launch() to "any bridge manifest wins" — a Mac-native title can hold a
  native copy too.
- **Out of scope (do not build):** the Console Mode Platform row. Its D13 gate stays; only its
  comment/describe text changes (premise now false) and a follow-up todo is filed.

<objective>
Route a forced-Windows Steam install of a Mac-native game through the native bridge verdict
(own `GameLibSteamBridge-<appId>` bottle) instead of always landing on the shared bottled Windows
Steam client, and keep launch/uninstall/dialog consistent with that route.

Purpose: bottled Steam must shrink to the verdict's own narrow fallback (user memory: known-bad ≠
reroute to bottled; only DRM may justify it). The user's "install the Windows version" choice was
the last path that bypassed the bridge verdict entirely.
Output: backend routing + persistence, IPC verdict variant, dialog/notice/setup replay, follow-up
todo for the Console Platform row.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-11-07-forced-windows-steam-install-routes-to-bridge.md
@./CLAUDE.md
Skill("gamelib-conventions") — the `<verify>` prettier rule and the todo frontmatter rule apply.
Skill("spike-findings-gamelib") — macOS native Steam bridge section, for the live gate only.

<interfaces>
From src/backend/storeManagers/steam/gameEligibility.ts (current):
  export function isBottleEligibleFromPlatforms(steamGame): boolean        // :46 mac_arch '32' || is_mac_native === false
  export function isForcedWindowsViaBottle(steamGame): boolean             // :77 isMac && meta.forcedWindowsViaBottle === true
  export function isBottleEligible(steamGame): boolean                     // :84 platforms || forced
  export function assembleBridgeRouteInput(steamGame): BridgeRouteInput    // :106 SOLE assembler; sole bridgeAllowlist.has call site
  export function bridgeRoute(steamGame): SteamBridgeRouteVerdict          // :130
  export async function checkBridgeRoute(steamGame): Promise<...>          // :134 ensurePlatformsCaptured then bridgeRoute
  export function isBridgeEligible(steamGame): boolean                     // :141

From src/backend/storeManagers/steam/gameInstall.ts install() (:120):
  overrideRequested = args.steamForceWindowsViaBottle === true             // :175
  forceWindowsViaBottle = overrideRequested && isMac && windowsDepotVerdict === true   // :187
  routeThroughBottle = forceWindowsViaBottle || isBottleEligible(steamGame) // :206
  let bridgeRoute = resolveEligibilityBridgeRoute(steamGame)               // initial resolve
  ... WR-08 hasBottledSteamCopy demotion; prescreen then `bridgeRoute = resolveEligibilityBridgeRoute(steamGame)` (re-resolve)
  crossoverMissing && route !== 'bridge' -> crossoverRequiredError
  noticeRequired -> sendFrontendMessage('steamBridgeRouteNotice', {appName, reason, knownBadReason, missingSymbols, route, userRoute}); return deferred
  route === 'bridge' -> `return steamGame.installBridgeGame(args)`         // :346
  else installBottleNative + markForcedWindowsViaBottle on forced success  // :377-385
  steamBridgeSetupRequired sends at :926 (inside provisionBridgeBottleForInstall(steamGame, bridgeBottleName, signal?) — no args in scope), :1054, :1124, :1178 (inside installBridgeGameLeased(steamGame, args, ...))

From src/backend/storeManagers/steam/gameSessionState.ts:
  export function markForcedWindowsViaBottle(appId: string): void   // read-modify-write, refuses to fabricate
  export function clearForcedWindowsViaBottle(appId: string): void  // early-returns when unset

From src/backend/storeManagers/steam/library.ts pollUninstallOnce 'absent' branch (~:3864):
  if (source === 'bottle') { clearForcedWindowsViaBottle(appId) }

From src/backend/storeManagers/steam/games.ts:
  export async function getBridgeRouteVerdict(appId: unknown): Promise<SteamBridgeRouteVerdict>  // ~:1283, numeric guard, then game.checkBridgeRoute(), fills installedIn
  SteamGame.checkBridgeRoute(): Promise<SteamBridgeRouteVerdict>   // :775 delegating stub

IPC:
  src/common/types/ipc/steamAuth.ts:74  getSteamBridgeRoute: (appId: string) => Promise<SteamBridgeRouteVerdict>
  src/backend/sidecar/steamAuthFlowRegistration.ts:366  ipcMain.handle('getSteamBridgeRoute', (_e, ...args) => getBridgeRouteVerdict(args[0]))
  src/preload/api/steam.ts:30  makeHandlerInvoker('getSteamBridgeRoute') — forwards args as an array, no change needed
  src/common/types/ipc/steam.ts:43 steamBridgeSetupRequired payload; :71 steamBridgeRouteNotice payload

Frontend:
  installSteamGame(appName, gameInfo, path = '', forceWindowsViaBottle = false)   // state/InstallGameModal.ts:134
  SteamDialog/index.tsx:270-290 useEffect fetching window.api.getSteamBridgeRoute(appName), deps [appName]
  SteamDialog gating.forceWindowsViaBottle (steamSectionGating.ts:276: isMac && !bottleRequired && effectivePlatform === 'Windows')
  SteamBridgeRouteNotice.tsx:143 `await installSteamGame(appName, info)`
  SteamBridgeSetup.tsx:101 `await installSteamGame(appName, gameInfo)` (the !is_installed branch)
  Precedent: state/SteamGoOfflineNotice.ts carries forceWindowsViaBottle?: boolean and SteamGoOfflineNotice.tsx:97 replays it.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — forced-Windows install resolves the bridge verdict, persists on success, carries the choice through deferrals</name>
  <files>src/backend/storeManagers/steam/gameEligibility.ts, src/backend/storeManagers/steam/bridge/bridgeRoute.ts, src/backend/storeManagers/steam/gameInstall.ts, src/common/types/ipc/steam.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    In games.test.ts's `SteamGame.install() — D-17 Windows-via-bottle override (34.13-06)` block (:7960) — fixture `{platformsCaptured:true, is_mac_native:true, is_windows_native:true}`, isMac true:
    - F1 (rewrite expectation): override + no seed + no verdict -> route resolves pending-scan -> prescreen runs -> `installBridgeGame` called exactly once, `installBottleNative` not called. Rename to say "routes through the bridge verdict (quick 261107-lum)".
    - F2 (rewrite): un-provisioned GameLibSteam bottle (`isBottleReady` false) no longer blocks — bridge route still dispatches installBridgeGame; no `steamBottleSetupRequired`.
    - F9 (invert): allowlisted + override -> installBridgeGame (reason seed); replace the "structurally unreachable" comment with the 261107-lum rationale.
    - NEW: override + persisted verdict `userRoute: 'bottle'` -> installBottleNative (user-forced-bottle) and, on its done result, markForcedWindowsViaBottle called (old D-17 bottled path still reachable as the verdict's own fallback).
    - NEW: override + `bridgeAllowlist.knownBadReason` 'drm-wrapped' acknowledged -> bottle (DRM is the one known-bad that reroutes); override + 'does-not-run' -> bridge (with notice if unacknowledged).
    - NEW: override + bridge route + installBridgeGame resolving `{status:'done'}` -> markForcedWindowsViaBottle(appId) called once; resolving `{status:'error'}` or `{status:'done', deferredToSetup:true}` -> not called.
    - NEW: override + noticeRequired (e.g. unacknowledged scan-miss) -> `steamBridgeRouteNotice` payload includes `forceWindowsViaBottle: true`; the same notice WITHOUT the override has no `forceWindowsViaBottle` key (exact-payload toEqual).
    - NEW: override rejected (is_windows_native false/absent, or non-mac) -> unchanged from F4/F5/F6 (no bridge, no mark) — keep those tests green as-is.
    - NEW: override + CrossOver missing + bridge route -> installBridgeGame still dispatched (CrossOver gate only blocks non-bridge routes).
    - F8 / B-series (no override) must stay byte-identical — a Mac-native title without the override still never enters the bridge.
  </behavior>
  <action>
    1. gameEligibility.ts (per DC-1): give `assembleBridgeRouteInput`, `bridgeRoute` and `checkBridgeRoute` an optional trailing `options?: { windowsBuildChosen?: boolean }` and thread it through. In `assembleBridgeRouteInput` set `platformsBottleEligible: isBottleEligibleFromPlatforms(steamGame) || options?.windowsBuildChosen === true`. Do NOT read the persisted flag there and do NOT add a second `bridgeAllowlist.has` call (metadataCapture.test.ts:230/:238 source pins). Rewrite the D-17 pin doc comment above it: the persisted verdict is still never read; a per-call, not-yet-committed Windows-build choice is a different input because it has written no bytes anywhere, and install()'s WR-08 `hasBottledSteamCopy` guard covers a title whose bits already live in GameLibSteam. `isBridgeEligible`, `isBottleEligible`, `isNative` keep their current signatures (no option).
    2. bridgeRoute.ts: doc-comment only — amend the header's D-17 pin paragraph and the `platformsBottleEligible` field doc to say the assembler may OR in an explicit per-install Windows-build choice (quick 261107-lum), never the persisted verdict. CRITICAL: the source pin at bridgeRoute.test.ts:592 fails on the literal token `forcedWindowsViaBottle` and on `steamMetadataStore` anywhere in this file, comments included — describe it in words ("the persisted D-17 forced verdict"), never write either token. No code change in this file.
    3. gameInstall.ts install(): pass `{ windowsBuildChosen: forceWindowsViaBottle }` to BOTH `resolveEligibilityBridgeRoute(steamGame, …)` calls (initial and post-prescreen re-resolve). Replace `return steamGame.installBridgeGame(args)` with: await the result; if `forceWindowsViaBottle && result.status === 'done' && !result.deferredToSetup` call `markForcedWindowsViaBottle(steamGame.appId)` (DC-2); return the result. Add a one-line logInfo when a forced install takes the bridge route so the live gate can grep it (e.g. "forced-Windows install of appId X routed by the bridge verdict: <route>/<reason>"). In the `steamBridgeRouteNotice` send, spread `...(forceWindowsViaBottle ? { forceWindowsViaBottle: true as const } : {})` (DC-5). For the four install-side `steamBridgeSetupRequired` sends: in `installBridgeGameLeased` (args in scope) spread `...(args.steamForceWindowsViaBottle === true ? { forceWindowsViaBottle: true as const } : {})`; for `provisionBridgeBottleForInstall` (:818, no args) add an optional trailing parameter `opts?: { forceWindowsViaBottle?: boolean }` after `signal`, pass it from `installBridgeGame`'s call site, and spread it the same way. Replaying the raw request is safe: the backend re-applies the triple gate on retry. Update the stale comment above the bottled terminal (:368-376) to say forced installs now reach it only as the verdict's own fallback.
    4. src/common/types/ipc/steam.ts: add `forceWindowsViaBottle?: true` (with a one-line quick-261107-lum comment) to the `steamBridgeRouteNotice` and `steamBridgeSetupRequired` payload types.
    5. games.test.ts: implement the behavior list above. Use the block's existing helpers (`argsWith`, `spyOnAllTerminals`, `assertExactlyOneRoute`) — if `assertExactlyOneRoute` has no bridge label, check how `spyOnAllTerminals` names installBridgeGame and assert on that spy directly. Mock `prescreenBridgeDepots` / `SteamUser.acquireAuthenticated` the way the existing pending-scan prescreen tests in this file do (grep `prescreen` in games.test.ts) rather than inventing new mocks.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts && pnpm codecheck && npx eslint src/backend/storeManagers/steam/gameEligibility.ts src/backend/storeManagers/steam/bridge/bridgeRoute.ts src/backend/storeManagers/steam/gameInstall.ts src/common/types/ipc/steam.ts src/backend/storeManagers/steam/__tests__/games.test.ts && for p in src/backend/storeManagers/steam/gameEligibility.ts src/backend/storeManagers/steam/bridge/bridgeRoute.ts src/backend/storeManagers/steam/gameInstall.ts src/common/types/ipc/steam.ts src/backend/storeManagers/steam/__tests__/games.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check src/backend/storeManagers/steam/gameEligibility.ts src/backend/storeManagers/steam/bridge/bridgeRoute.ts src/backend/storeManagers/steam/gameInstall.ts src/common/types/ipc/steam.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
  </verify>
  <done>Forced-Windows install of a Mac-native title on macOS dispatches installBridgeGame whenever the composed verdict is bridge, keeps every bottle row (failed-this-session, user-forced-bottle, drm-wrapped, win64-no-shim, WR-08), persists forcedWindowsViaBottle only on a completed forced install of either route, and carries the choice on notice/setup payloads. All three suites, codecheck, eslint and scoped prettier green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Backend — launch/uninstall consistency and the IPC verdict variant</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/games.ts, src/backend/sidecar/steamAuthFlowRegistration.ts, src/common/types/ipc/steamAuth.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    - library.test.ts: a confirmed-absent `pollUninstallOnce(appId, 'bridge')` calls clearForcedWindowsViaBottle(appId) (extend the existing spy test near :7411; keep the 'bottle' assertion and keep 'native' NOT clearing).
    - games.test.ts (D-17 durability block, :8385, `forcedMeta()` fixture): launch() with forcedWindowsViaBottle true AND `findBridgeInstallBottle` returning `GameLibSteamBridge-<appId>` -> launchBridgeGame called, shell.openExternal not called (the Mac `rungameid` path is not taken). If an equivalent test already exists, cite it in the SUMMARY instead of duplicating.
    - games.test.ts getBridgeRouteVerdict: (a) `getBridgeRouteVerdict(appId)` for a Mac-native unforced title -> route 'not-eligible' (unchanged); (b) `getBridgeRouteVerdict(appId, true)` with is_windows_native true on mac -> a bridge verdict (e.g. pending-scan or seed); (c) same with is_windows_native false/absent, or non-mac, or a non-boolean 2nd arg (`'true'`, 1) -> 'not-eligible' (fail closed, triple gate); (d) no 2nd arg + forcedWindowsViaBottle persisted + findBridgeInstallBottle non-null -> bridge verdict with installedIn 'bridge'.
  </behavior>
  <action>
    1. library.ts pollUninstallOnce 'absent' branch (~:3864): widen the guard to `source === 'bottle' || source === 'bridge'` (DC-3) and extend the comment: a forced-Windows install can now live in a bridge bottle (quick 261107-lum), and a stale flag would make the next install of a Mac-native title go Windows silently. Keep it BEFORE the `if (existing)` guard as today. Update the D-17 reversibility doc on `clearForcedWindowsViaBottle` in gameSessionState.ts ONLY if it states the clear is bottle-only (comment edit; if you edit that file add it to the prettier/eslint list).
    2. games.ts `getBridgeRouteVerdict(appId: unknown, windowsBuildChosen?: unknown)` (DC-4): after the numeric guard, compute `const explicit = windowsBuildChosen === true && isMac && steamMetadataStore.get(appId)?.is_windows_native === true` (read is_windows_native AFTER checkBridgeRoute's ensurePlatformsCaptured has run, so call order matters: capture first via `game.checkBridgeRoute(...)`'s own await, or call `ensurePlatformsCaptured` via the existing SteamGame stub before computing). Location default when the arg is absent: `isForcedWindowsViaBottle(game) && findBridgeInstallBottle(appId) !== null`. Pass `{ windowsBuildChosen: explicit || locationDefault }` into `game.checkBridgeRoute(...)`; extend the `SteamGame.checkBridgeRoute` stub (:775) with the same optional options param. Keep installedIn logic unchanged. Doc the triple gate and why a non-boolean is ignored (untrusted renderer arg).
    3. steamAuthFlowRegistration.ts:366: forward `args[1]` uncast — `getBridgeRouteVerdict(args[0], args[1])`; update the adjacent comment. steamAuth.ts:74: `getSteamBridgeRoute: (appId: string, windowsBuildChosen?: boolean) => Promise<SteamBridgeRouteVerdict>`. preload needs no change (array forwarding); confirm src/preload/__tests__/steamInstallFormApi.test.ts still passes.
    4. Do NOT change gameLaunch.ts or gameUninstall.ts: both already route by location once the flag is marked (Task 1). If a test proves otherwise, fix the minimal location check and say so in the SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/installFormIpc.test.ts src/backend/storeManagers/steam/__tests__/removeCopies.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/preload/__tests__/steamInstallFormApi.test.ts && pnpm codecheck && npx eslint src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/sidecar/steamAuthFlowRegistration.ts src/common/types/ipc/steamAuth.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && for p in src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/sidecar/steamAuthFlowRegistration.ts src/common/types/ipc/steamAuth.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/sidecar/steamAuthFlowRegistration.ts src/common/types/ipc/steamAuth.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && pnpm smoke:sidecar</automated>
  </verify>
  <done>Forced bridge installs launch through the bridge (test-proven), the flag clears on a confirmed bridge uninstall, and getSteamBridgeRoute(appId, true) returns the forced-Windows bridge verdict under the triple gate while the 1-arg form is unchanged except for location-anchored installed forced games. smoke:sidecar green (the sidecar registration file is touched).</done>
</task>

<task type="auto">
  <name>Task 3: Frontend — dialog verdict follows the platform choice; notice/setup retries replay it; Console comment + follow-up todo</name>
  <files>src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx, src/frontend/state/SteamBridgeRouteNotice.ts, src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx, src/frontend/state/SteamBridgeSetup.ts, src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx, src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx, src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts, .planning/todos/pending/2026-11-07-console-mode-steam-platform-row.md</files>
  <action>
    1. SteamDialog/index.tsx (DC-4): in the bridge-verdict effect (:270-290) call `window.api.getSteamBridgeRoute(appName, gating.forceWindowsViaBottle)` and add `gating.forceWindowsViaBottle` to the deps. Clear the stale verdict at the start of each request (`setBridgeVerdict(undefined)`) so a platform flip never briefly shows the previous route's line/Wine visibility; keep the `bridgeRouteCancelled` name (steamDialogSource.test.ts locates Effect B by the FIRST `let cancelled = false`). Update the Plan 16 / quick 261107-li0 comments: with Windows chosen on a dual-build title the verdict is now the forced-Windows bridge verdict, so `resolveBridgeOwnsEngine` hides the shared Wine selector when it is native. Nothing else in the dialog changes — `resolveBridgeRouteLine` stays the sole interpreter. Run the existing SteamDialog source/gating tests and fix any `getSteamBridgeRoute` call-shape assertion to the 2-arg form.
    2. state/SteamBridgeRouteNotice.ts: add `forceWindowsViaBottle?: true` to the payload and `forceWindowsViaBottle: boolean` (default false) to state; set it in `open`, reset in `close`. SteamBridgeRouteNotice.tsx: read it from the store and call `installSteamGame(appName, info, '', forceWindowsViaBottle)` (DC-5); update the :97-103 comment to cite 54-REVIEW CR-01's replay precedent.
    3. state/SteamBridgeSetup.ts: add `forceWindowsViaBottle?: boolean` to `open`'s opts and state (default false, reset on close); make sure the IPC signal handler that calls `open` forwards the payload's `forceWindowsViaBottle`. SteamBridgeSetup.tsx: in the `!gameInfo.is_installed` fallback pass it as the 4th arg (`installSteamGame(appName, gameInfo, '', forceWindowsViaBottle)`). The launch-side branch is unchanged. Extend src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts and SteamBridgeSetup.test.ts: open with the flag -> state carries true; close -> false; open without -> false.
    4. ConsoleMode/InstallOverlay/index.tsx :84-92 comment and the consoleSteamTarget.test.ts describe title at :1209: the premise ("a forced-Windows dual-build install is not-eligible for the bridge…") is now false. Rewrite both to say: since quick 261107-lum a forced-Windows install resolves the bridge verdict; Console still offers no Platform row for Steam until the follow-up todo `2026-11-07-console-mode-steam-platform-row.md` builds it. Do NOT change any assertion, RED test, or `showPlatform`/`hasWine` code.
    5. Create `.planning/todos/pending/2026-11-07-console-mode-steam-platform-row.md` with frontmatter in this order: `created`, `title`, `area: steam`, `severity: minor`, `platform: macos`, `ready: code` (bare, lowercase — per gamelib-conventions; run `pnpm planning-gates`). Body: build the Console Mode Platform row (macOS default, Windows alternative) for dual-build Steam games with no Wine row, passing `forceWindowsViaBottle` into `installSteamGame`; then lift the D13 gate. Cite quick 261107-lum as the unblock.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/Library/components/InstallModal src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts src/frontend/state/__tests__/SteamBridgeSetup.test.ts src/frontend/screens/Game/GamePage/components/__tests__ src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts && pnpm codecheck && pnpm planning-gates && npx eslint src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/frontend/state/SteamBridgeRouteNotice.ts src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx src/frontend/state/SteamBridgeSetup.ts src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts && for p in src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/frontend/state/SteamBridgeRouteNotice.ts src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx src/frontend/state/SteamBridgeSetup.ts src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $p"; done && npx prettier --check src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/frontend/state/SteamBridgeRouteNotice.ts src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx src/frontend/state/SteamBridgeSetup.ts src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts</automated>
    The new `.planning/todos/pending/…` file is prettier-ignored (`.planning`), so no prettier check is claimed for it; `pnpm planning-gates` is its real gate.
  </verify>
  <done>Dialog re-requests the verdict when the platform choice flips and hides the shared Wine selector on a forced-Windows bridge verdict; route-notice and bridge-setup retries replay the Windows choice; Console D13 assertions untouched with corrected rationale text; follow-up todo filed and planning-gates green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Live gate on the operator's Mac — forced Windows on a dual-build title lands on the bridge and launches clean</name>
  <what-built>Forced-Windows Steam installs of Mac-native games now resolve the bridge verdict (own GameLibSteamBridge-&lt;appId&gt; bottle), persist the forced flag, launch through the bridge, and clear the flag on uninstall; the install dialog reflects the route.</what-built>
  <action>No code. Executor completes the pre-step below, then hands the remaining steps to the operator and waits.</action>
  <done>Operator approves steps 1-5 with the appId and bridge-verdict evidence recorded in the SUMMARY.</done>
  <how-to-verify>
    Pre-step (executor, before handing over): `pnpm build:sidecar-sea` is NOT required for `pnpm tauri:dev`, but `tauri dev` does not rebuild the sidecar — restart dev and confirm the sidecar.js mtime is newer than this task's last backend commit (user memory). Launch with `pnpm tauri:dev` (never `tauri:dev:run`). Pick a dual-build Steam title the operator owns that is NOT on the drm-wrapped known-bad list and not CEG (a small Unity title is ideal); record its appId in the SUMMARY.
    1. Open the title's install dialog, Platform = macOS: no route line, shared Wine section hidden (unchanged).
    2. Switch Platform to Windows: the route line shows "Native Steam bridge" and the shared Wine selector is hidden (quick 261107-li0 behaviour now reached). If the verdict is bottled (DRM/x64-no-shim), the line says so and Wine stays — record which.
    3. Install. Expected log line (Steam log): the new "forced-Windows install of appId … routed by the bridge verdict" line, then installBridgeGame. Confirm the bottle exists: `ls ~/"Library/Application Support/CrossOver/Bottles" | grep GameLibSteamBridge-<appId>` (or the built-in engine's bottle root if Phase 59 put it there — the per-game name is what matters) and that `GameLibSteam`'s steamapps has NO `appmanifest_<appId>.acf`.
    4. Press Play. Must launch the Windows exe through the bridge (log: launchBridgeGame, not `steam://rungameid`). Verified bar is STRICT (memory: bridge-verified-criterion-is-strict): HELLO plus a clean game Steam-init log; for non-Unity, a game-originated bridge call; "In-Game" status alone does NOT count.
    5. Uninstall. Then reopen the install dialog: Platform defaults back to macOS (the forced flag cleared) and a plain Install would take the Mac path.
    6. Optional, if a drm-wrapped known-bad dual-build title is to hand: forcing Windows routes to bottled Steam behind the known-bad notice, and "Use bottled Steam" in that notice installs the WINDOWS build (not the Mac one) — proves the replay.
  </how-to-verify>
  <resume-signal>Type "approved" with the appId and the verdict evidence, or describe what diverged (which step, which log line).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar IPC (`getSteamBridgeRoute` 2nd arg) | untrusted value that now influences a routing read |
| renderer -> sidecar IPC (`install` args `steamForceWindowsViaBottle`, replayed from notice/setup payloads) | untrusted boolean that selects which build is installed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lum-01 | Tampering | getBridgeRouteVerdict 2nd arg | mitigate | honoured only when `=== true` AND isMac AND persisted `is_windows_native === true`; any other value ignored; appId numeric guard unchanged |
| T-lum-02 | Tampering | install() replay of forceWindowsViaBottle from a notice/setup payload | mitigate | the backend re-applies install()'s existing triple gate on every call; the payload only replays the user's own request |
| T-lum-03 | Elevation | persisted forcedWindowsViaBottle reaching the route resolver | mitigate | assembleBridgeRouteInput never reads the persisted flag (existing source pin metadataCapture.test.ts:238 stays green); only the per-call option or a location-anchored default (bridge bottle proven to hold the manifest) is used |
| T-lum-04 | Denial of service | stale forced flag after bridge uninstall silently forcing Windows builds | mitigate | clear on confirmed-absent bridge uninstall (Task 2) |
</threat_model>

<verification>
- Backend: games, metadataCapture, bridgeRoute, library, installFormIpc, removeCopies, flowRegistrationCensus suites green.
- Frontend: InstallModal, route-notice/bridge-setup state, GamePage components, consoleSteamTarget suites green; D13 assertions unchanged (`git diff` of consoleSteamTarget.test.ts touches only the describe string).
- `pnpm codecheck`, eslint on every touched src file, scoped prettier after `--file-info`, `pnpm planning-gates`, `pnpm smoke:sidecar`.
- `grep -n "forcedWindowsViaBottle\|steamMetadataStore" src/backend/storeManagers/steam/bridge/bridgeRoute.ts` returns nothing.
- Live gate (Task 4) approved.
</verification>

<success_criteria>
- A forced-Windows install of a Mac-native Steam title on macOS gets its own GameLibSteamBridge-&lt;appId&gt; bottle whenever the bridge verdict says bridge; bottled Steam is reached only through the verdict's own bottle rows.
- That install launches through the bridge and meets the strict verified bar; uninstall restores the Mac default.
- The desktop dialog shows the actual route for the chosen platform.
- Do not move the source todo `2026-11-07-forced-windows-steam-install-routes-to-bridge.md` to completed until Task 4 is approved.
</success_criteria>

<output>
Create `.planning/quick/261107-lum-route-forced-windows-steam-installs-of-m/261107-lum-SUMMARY.md` when done.
</output>
