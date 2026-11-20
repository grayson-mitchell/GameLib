---
phase: quick-261114-aqa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/WebView/storeExitRefresh.ts
  - src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts
  - src/backend/storeManagers/steam/authTrigger.ts
  - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
  - src/backend/storeManagers/steam/library/refresh.ts
  - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
autonomous: true
requirements: [QUICK-261114-aqa]

must_haves:
  truths:
    - "Entering the in-app Steam store while the hidden embed sits on a store.steampowered.com /app/ page does NOT arm the store-exit refresh (no `armed ... via=entry` line), so clicking Humble Keys (or any other nav) fires no Steam refresh"
    - "Navigating to a Steam /app/ page inside the store still arms (via=nav); cart/checkout still arm on entry and on nav; epic/gog/amazon arming is unchanged"
    - "A 'steam-store-exit' refresh whose go-offline wrap times out (Mac Steam did not log off) shows NO guided Go Offline dialog, issues no authenticated logon, keeps the cached library, emits steamSyncStatus idle, and logs one store-exit-specific line"
    - "Explicit Refresh, redeem-steam-key, steam-go-offline-retry and login refreshes still pass guidedAction 'refresh' and still escalate to the guided dialog"
  artifacts:
    - path: "src/frontend/screens/WebView/storeExitRefresh.ts"
      provides: "Per-via arming: Steam row arms /app/ only via='nav'"
      contains: "armsOnEntry"
    - path: "src/backend/storeManagers/steam/authTrigger.ts"
      provides: "Distinct non-escalating 'store-exit' logon grant for origin 'steam-store-exit'"
      contains: "'store-exit'"
    - path: "src/backend/storeManagers/steam/library/refresh.ts"
      provides: "store-exit grant acquires without guidedAction and quietly keeps cache on go-offline-required"
  key_links:
    - from: "src/backend/storeManagers/steam/authTrigger.ts noteRefreshTrigger"
      to: "src/backend/storeManagers/steam/library/refresh.ts refresh()"
      via: "consumeSteamRefreshLogonGrant() returning 'store-exit'"
      pattern: "store-exit"
    - from: "src/backend/storeManagers/steam/library/refresh.ts"
      to: "SteamUser.acquireAuthenticated (user.ts acquireInternal)"
      via: "omitting guidedAction => no steamGoOfflineRequired push (already-tested contract in authSessionLifecycle.test.ts 'a wrap refusal without a guidedAction pushes nothing')"
      pattern: "guidedAction"
---

<objective>
Stop the "Set Steam offline to continue" guided dialog from appearing when the user merely
leaves the in-app Steam Store (e.g. clicks Humble Keys in the Stores nav panel).

Root cause (operator logs): `armForUrl(..., 'entry', ...)` in `useStoreEmbedHost.ts:906` arms
from `startUrl`; the shared Steam embed is hidden (not closed) and sits on
`store.steampowered.com/app/1669000`, and `isSteamPurchaseIntentUrl` counts `/app/` as purchase
intent, so EVERY visit arms (`[steamStoreExitRefresh] armed host=store.steampowered.com via=entry`).
Each exit then dispatches `refreshLibrary` origin `steam-store-exit`, which
`authTrigger.ts` maps to the `'user-refresh'` logon grant; `library/refresh.ts` calls
`acquireAuthenticated({ reason: grant, guidedAction: 'refresh' })`; the Mac Steam go-offline
wrap (`macSteamOffline.ts withMacSteamOffline`, `MAC_STEAM_LOGOFF_WAIT_MS = 5000`) throws
`GuidedOfflineRequiredError('logoff-not-seen')`, and `user.ts acquireInternal` pushes
`steamGoOfflineRequired` because `guidedAction` was set.

Two fixes:
1. Frontend: Steam `/app/` pages arm only via in-store navigation (`via='nav'`), never on entry.
   cart/checkout still arm on entry. Other stores unchanged.
2. Backend: origin `steam-store-exit` yields a DISTINCT logon grant `'store-exit'`. `refresh()`
   acquires for it WITHOUT `guidedAction`, so a go-offline-required refusal never reaches the
   dialog; it logs one clear line, restores the cached library and emits idle.

Output: 3 source files + 3 test files changed, two commits.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@src/frontend/screens/WebView/storeExitRefresh.ts
@src/backend/storeManagers/steam/authTrigger.ts
@src/backend/storeManagers/steam/library/refresh.ts (lines 1-120 are the only part touched)

<interfaces>
From src/frontend/screens/WebView/storeExitRefresh.ts (current):
- `export function isSteamPurchaseIntentUrl(url: string): boolean` — true for https
  store.steampowered.com / checkout.steampowered.com paths `/app/...`, `/cart`, `/cart/...`,
  `/checkout`, `/checkout/...`.
- `interface StoreExitRow { targets; origin: string; isPurchaseIntentUrl: (url: string) => boolean }`
- `export const STORE_EXIT_ROWS` (frozen; keys steam/epic/gog/amazon; steam origin `'steam-store-exit'`).
- `export function isPurchaseIntentUrlFor(storeKey: string, url: string): boolean`
- `export function armForUrl(storeKey, url, armed, via: 'entry' | 'nav', log): boolean` — logs
  `[${storeKey}StoreExitRefresh] armed host=${hostname} via=${via}` once per unarmed->armed.
- Callers (do NOT edit): `useStoreEmbedHost.ts:261` passes `'nav'` (every nav event / nav call
  result); `useStoreEmbedHost.ts:906` passes `'entry'` with `startUrlRef.current` on store entry.

From src/backend/storeManagers/steam/authTrigger.ts (current):
- `type SteamRefreshLogonGrant = 'user-refresh' | 'login'` (not exported)
- `const ORIGIN_TO_TRIGGER` has `'steam-store-exit': 'user-refresh'` (comment there mentions a
  2-minute throttle that no longer exists — see note in Task 2).
- `const LOGON_GRANTING_TRIGGERS = ['user-refresh', 'login']`
- `export function mapRefreshOriginToTrigger(origin?: string | null): SteamAuthTrigger`
- `createSteamAuthTrigger().noteRefreshTrigger(runner, origin)` sets
  `pendingRefreshLogonGrant = trigger` when trigger is user-refresh/login and runner is
  steam-inclusive; `consumeSteamRefreshLogonGrant(): SteamRefreshLogonGrant | null`.

From src/backend/storeManagers/steam/userTypes.ts (do NOT edit):
- `AuthSessionReason = 'user-refresh' | 'login' | 'user-install' | 'prescreen' | 'redeem' | ...`
- `interface AcquireAuthenticatedOpts { reason: AuthSessionReason; guidedAction?: SteamGoOfflineAction; appName?; installPath?; forceWindowsViaBottle? }`

From src/backend/storeManagers/steam/user.ts acquireInternal (do NOT edit): pushes
`steamGoOfflineRequired` ONLY when `reason === 'go-offline-required' && opts.guidedAction`.
Already covered by authSessionLifecycle.test.ts "a wrap refusal without a guidedAction pushes
nothing". `wrappedConnectNow` already logs a generic
`[Steam] CM logon skipped: Mac Steam did not go offline (...)` warning for every caller.

From src/backend/storeManagers/steam/library/refresh.ts `refresh(deps)`:
- line 32: `const grant = deps.steamSession.authTrigger.consumeSteamRefreshLogonGrant()`
- line ~50: `deps.steamUser.acquireAuthenticated({ reason: grant, guidedAction: 'refresh' })`
- on `lease.reason === 'go-offline-required'`: logInfo "waiting on the guided Go Offline step",
  `await restoreLocalSteamLibrary(deps)`, `sendFrontendMessage('steamSyncStatus', { status: 'idle' })`, return null.

Test helpers in src/backend/storeManagers/steam/__tests__/library.refresh.test.ts:
`noteRefreshTrigger(runner, origin)` (line 72), `consumeSteamRefreshLogonGrant()` (line 78),
the shared beforeEach arms a grant via `noteRefreshTrigger('steam', 'action-icons-refresh-button')`
(line 314), `refuse(reason)` helper inside the 34.15 D-07 describe (line 688),
`steamSyncEmits()`, existing test "a granted Refresh asks for the guided Go Offline step" (~line 870).
</interfaces>
</context>

<hard_rules>
These apply to every task. Violating any of them is a failed plan.

- Commit by explicit path only: `git add <file> <file> ...` then `git commit`. NEVER
  `gsd-sdk query commit` (it sweeps all dirty .planning files), NEVER `git add -A`, `git add .`,
  or `git commit -a`.
- The working tree carries unrelated uncommitted work that must NOT be staged or modified:
  `src/backend/humble/*`, `src/backend/humble/__tests__/*`,
  `.planning/debug/humble-reveal-redeem-broken.md`, `public/locales/en/gamelib.json`,
  `.planning/spikes/*`, `.planning/todos/completed/2026-11-01-*`,
  `.planning/debug/resolved/cold-start-link-not-installed.md`,
  `Schedule I Free Sample.dxvk-cache`, other untracked `.planning/quick/*` and `.planning/phases/*`
  files, AND the other dirty Steam files seen at planning time (another session is active):
  `src/backend/storeManagers/steam/__tests__/games.test.ts`, `depot/finalizeAcf.ts`,
  `gameInstallDepot.ts`, `gameLaunch.ts`, `gameUninstall.ts`, `library/manifestFlags.ts`,
  `library/runningPoll.ts`, `macSteamAdoption.ts`, `queueHeadRevalidation.ts`,
  `steamLaunchedDeps.ts`, `steamProcesses.ts`. Before each commit run
  `git diff --cached --name-only` and confirm it lists ONLY this task's files.
- No i18n changes. If the fix seems to need a `public/locales/en/gamelib.json` string, STOP and
  report instead. Log lines only — no new user-facing strings.
- Do NOT edit `user.ts`, `userTypes.ts`, `macSteamOffline.ts`, `useStoreEmbedHost.ts` or
  `index.tsx`; the fix lives entirely in the six files in `files_modified`.
- Commit message trailers, exactly (blank line before them):
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013cjweCyZ5QbQUAe3MNBZjH
- Run `graphify update .` after the code changes (after Task 2).
- Do NOT commit PLAN/SUMMARY/STATE files — the orchestrator does that.

tsc baseline procedure (used by both tasks): BEFORE editing, run
`npx tsc --noEmit -p . 2>&1 | grep -E '^src/.*error TS' | grep -v '^src/backend/storeManagers/steam/bridge/drm/' | sort > "$SCRATCH/tsc-before.txt"`
(SCRATCH = /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/08b32de7-19c4-4d5f-b9c5-9ac84e9f2d51/scratchpad).
After each task, write the same filtered output to `tsc-after.txt` and require
`comm -13 tsc-before.txt tsc-after.txt` to be empty (no new errors). Pre-existing errors under
`bridge/drm/*` and any from the concurrent session's dirty files are ignored; any error whose
path is one of this plan's six files is a failure regardless.
</hard_rules>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Steam /app/ arms only on in-store navigation, not on entry</name>
  <files>src/frontend/screens/WebView/storeExitRefresh.ts, src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts</files>
  <behavior>
    - armForUrl('steam', 'https://store.steampowered.com/app/1669000/', false, 'entry', log) returns false and log is not called
    - armForUrl('steam', 'https://store.steampowered.com/app/1669000/', false, 'nav', log) returns true and logs `[steamStoreExitRefresh] armed host=store.steampowered.com via=nav`
    - armForUrl('steam', url, false, 'entry', log) returns true (logs via=entry) for https://store.steampowered.com/cart, https://store.steampowered.com/cart/, https://store.steampowered.com/checkout/?x=1 and https://checkout.steampowered.com/checkout/
    - already-armed passthrough unchanged: armForUrl('steam', '/app/ url', true, 'entry', log) returns true without logging (an arm earned by nav survives)
    - epic/gog/amazon unchanged: it.each over representative arming URLs (amazon https://gaming.amazon.com, gog https://www.gog.com/en/game/foo, epic https://store.epicgames.com/en-US/p/x) arms identically via 'entry' AND via 'nav'
    - isSteamPurchaseIntentUrl('https://store.steampowered.com/app/1/') is still true and isPurchaseIntentUrlFor('steam', app url) still true (the nav classifier is unchanged)
  </behavior>
  <action>
    First take the tsc baseline (see hard_rules). Then, RED: add the behavior cases above to the existing `describe('armForUrl (quick 261102-s32)')` block in storeExitRefresh.test.ts (do not delete existing cases; the existing "logs hostname only" case already uses 'nav' for an /app/ URL and must keep passing). Run jest and confirm the steam /app/ entry case fails.

    GREEN, in storeExitRefresh.ts:
    - Add a new exported pure classifier `isSteamCheckoutIntentUrl(url: string): boolean` — same https + STEAM_STORE_HOSTS checks as `isSteamPurchaseIntentUrl`, but only `/cart`, `/cart/...`, `/checkout`, `/checkout/...`. Refactor so `isSteamPurchaseIntentUrl` reuses it (app OR checkout) rather than duplicating the path list.
    - Add an optional field to `StoreExitRow`: `armsOnEntry?: (url: string) => boolean`, with a doc comment: when present, entry-arming uses it instead of `isPurchaseIntentUrl`; absent means entry and nav share the classifier.
    - Set `armsOnEntry: isSteamCheckoutIntentUrl` on the steam row ONLY. Leave epic/gog/amazon rows untouched (no field), so their behavior is byte-identical.
    - In `armForUrl`, choose the classifier by `via`: for 'entry' use `row.armsOnEntry ?? row.isPurchaseIntentUrl`, for 'nav' use `row.isPurchaseIntentUrl` (equivalently keep `isPurchaseIntentUrlFor` for nav). Keep the `if (armed) return true` short-circuit first and the existing log format exactly.
    - Update the `armForUrl` doc comment: entry-arming exists because the embed is hidden not closed (261102-s32), but a Steam /app/ page is a browsing page the hidden embed parks on, so arming from it on entry turned every Steam store visit into an authenticated refresh (quick 261114-aqa); Steam /app/ arms only on in-store navigation.
    - Do NOT add any time throttle: the existing comment in `runStoreExitRefresh` records that 261030-qqh REMOVED the 2-minute throttle and the existing test "back-to-back exits each refresh once the previous one has settled (no time throttle)" pins that. The task description's "keep the 2-minute throttle" means leave the throttle/in-flight behavior as it is — it is unchanged.

    Commit (explicit paths): `git add src/frontend/screens/WebView/storeExitRefresh.ts src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts`, check `git diff --cached --name-only`, then commit `fix(261114-aqa): Steam /app/ pages arm the store-exit refresh only on in-store navigation` with the two trailers.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx && npx eslint src/frontend/screens/WebView/storeExitRefresh.ts src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts && npx prettier --file-info src/frontend/screens/WebView/storeExitRefresh.ts src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts && npx prettier --check src/frontend/screens/WebView/storeExitRefresh.ts src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts && npx tsc --noEmit -p . 2>&1 | grep -E '^src/.*error TS' | grep -v '^src/backend/storeManagers/steam/bridge/drm/' | sort > /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/08b32de7-19c4-4d5f-b9c5-9ac84e9f2d51/scratchpad/tsc-after.txt; comm -13 /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/08b32de7-19c4-4d5f-b9c5-9ac84e9f2d51/scratchpad/tsc-before.txt /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/08b32de7-19c4-4d5f-b9c5-9ac84e9f2d51/scratchpad/tsc-after.txt | (! grep .)</automated>
    Prettier note: `--file-info` was checked at planning time and both paths report `"ignored": false`, so the `--check` is meaningful. Frontend-only task: no `pnpm build:sidecar` needed.
  </verify>
  <done>Steam /app/ URL does not arm on entry but arms on nav; cart/checkout arm on entry; epic/gog/amazon identical on both vias; all storeExitRefresh and useStoreEmbedHost tests green; no new tsc errors; eslint and scoped prettier clean; one commit containing exactly the two files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 'steam-store-exit' gets a distinct non-escalating 'store-exit' logon grant</name>
  <files>src/backend/storeManagers/steam/authTrigger.ts, src/backend/storeManagers/steam/__tests__/authTrigger.test.ts, src/backend/storeManagers/steam/library/refresh.ts, src/backend/storeManagers/steam/__tests__/library.refresh.test.ts</files>
  <behavior>
    authTrigger.test.ts:
    - mapRefreshOriginToTrigger('steam-store-exit') still returns 'user-refresh' (keyring gate semantics unchanged; existing test at line ~129 stays)
    - new exported mapRefreshOriginToLogonGrant: 'steam-store-exit' -> 'store-exit'; 'action-icons-refresh-button', 'redeem-steam-key', 'steam-go-offline-retry', 'steam-sync-notice-retry', 'clear-cache' -> 'user-refresh'; 'login-success', 'steam-login' -> 'login'; 'game-status', 'nav-tabs-games-tab', 'mount', undefined, null, '__proto__', 'constructor' -> null
    - noteRefreshTrigger('steam', 'steam-store-exit') then consumeSteamRefreshLogonGrant() returns 'store-exit' (and a second consume returns null); isSteamAuthUnlocked() is true and currentTriggerLabel() is 'user-refresh'
    - noteRefreshTrigger('gog', 'steam-store-exit') arms no grant (non-Steam runner stays a no-op)
    - noteRefreshTrigger('steam', 'action-icons-refresh-button') still yields 'user-refresh'
    library.refresh.test.ts:
    - store-exit grant, wrap refusal: after consuming the shared beforeEach grant, noteRefreshTrigger('steam', 'steam-store-exit'), mock acquireAuthenticated -> { ok: false, reason: 'go-offline-required' }; refresh() resolves null; acquireAuthenticated called exactly once with { reason: 'user-refresh' } and NO guidedAction key (assert toHaveBeenCalledWith({ reason: 'user-refresh' }) and that the call arg has no 'guidedAction' property); steamSyncEmits() equals [{ status: 'idle' }]; cached library preserved (seedCache() then library.size unchanged); sendFrontendMessage never called with 'steamGoOfflineRequired'; logInfo called exactly once with a message containing 'store-exit' and 'cached library'
    - store-exit grant, success: with a fake client the refresh syncs normally (acquireAuthenticated called with { reason: 'user-refresh' }, no guidedAction)
    - explicit Refresh unchanged: existing "a granted Refresh asks for the guided Go Offline step" still passes with { reason: 'user-refresh', guidedAction: 'refresh' }; add a sibling asserting redeem-steam-key and steam-go-offline-retry origins also pass guidedAction 'refresh'
  </behavior>
  <action>
    RED first: add the behavior cases to authTrigger.test.ts (new `describe('mapRefreshOriginToLogonGrant / store-exit grant (quick 261114-aqa)')`) and library.refresh.test.ts (new `describe('store-exit grant never escalates to the guided Go Offline step (quick 261114-aqa)')` placed near the 34.15 D-07 / "a granted Refresh asks..." tests, reusing `noteRefreshTrigger`, `consumeSteamRefreshLogonGrant`, `steamSyncEmits`, `seedCache`, `makeFakeClient`, `steamUser`, `sendFrontendMessage` as those neighbours do; check how the file mocks `backend/logger` and assert on that mock's `logInfo`). Run jest; confirm the new cases fail.

    GREEN, authTrigger.ts:
    - Export the grant type and widen it: `export type SteamRefreshLogonGrant = 'user-refresh' | 'login' | 'store-exit'`, doc-commented: 'store-exit' is an INFERRED, automatic refresh (leaving the in-app Steam store) — it may log on if Mac Steam goes offline by itself, but must never escalate to the guided Go Offline step.
    - Add a frozen allowlist `INFERRED_REFRESH_ORIGINS: ReadonlySet<string> = new Set(['steam-store-exit'])` (a Set, so no prototype-chain lookup issue) with a comment naming quick 261114-aqa and the root cause.
    - Add `export function mapRefreshOriginToLogonGrant(origin?: string | null): SteamRefreshLogonGrant | null`: trigger = mapRefreshOriginToTrigger(origin); if trigger is not in LOGON_GRANTING_TRIGGERS return null; if trigger === 'user-refresh' and origin is in INFERRED_REFRESH_ORIGINS return 'store-exit'; else return trigger.
    - In `noteRefreshTrigger`, keep `noteSteamAuthTrigger(trigger)` as-is, and replace the current grant `if` with `const grant = mapRefreshOriginToLogonGrant(origin); if (grant) pendingRefreshLogonGrant = grant`. Keep the steam-inclusive runner guard first.
    - Keep `ORIGIN_TO_TRIGGER['steam-store-exit'] = 'user-refresh'` (the keyring trigger/label stays deliberate) but rewrite its comment: deliberate for the keyring gate; its logon grant is the non-escalating 'store-exit' (see INFERRED_REFRESH_ORIGINS); drop the stale "2-minute throttle" wording (the throttle was removed in 261030-qqh; the renderer gates on sign-in, nav arming and in-flight).
    - Update `consumeSteamRefreshLogonGrant` doc in the interface to mention the three values.

    GREEN, library/refresh.ts `refresh()`:
    - Map the grant to the acquire options: for 'store-exit' call `deps.steamUser.acquireAuthenticated({ reason: 'user-refresh' })` with NO guidedAction (user.ts then never pushes `steamGoOfflineRequired`); for 'user-refresh'/'login' keep `{ reason: grant, guidedAction: 'refresh' }` exactly. Keep it a typed branch (e.g. `const inferred = grant === 'store-exit'`), not string-matching on any origin.
    - In the `lease.reason === 'go-offline-required'` branch, when `inferred`, log exactly one line via logInfo (LogPrefix.Steam): `Steam: store-exit refresh skipped — Mac Steam did not go offline automatically; keeping the cached library (no guided Go Offline step, no logon)`; otherwise keep the existing "waiting on the guided Go Offline step" line. Both paths then `await restoreLocalSteamLibrary(deps)`, emit `steamSyncStatus` idle and return null, as today. (user.ts's generic `[Steam] CM logon skipped...` warning still fires from wrappedConnectNow; that is the shared connect-layer line and is not touched.)
    - Other refusal reasons (client-not-ready, logon-rejected, ...) keep today's failed-banner behavior for every grant.

    Then: `pnpm build:sidecar`; `graphify update .`. Commit (explicit paths): `git add` the four files, check `git diff --cached --name-only` lists exactly them, commit `fix(261114-aqa): inferred Steam store-exit refresh never escalates to the guided Go Offline dialog` with the two trailers.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/authTrigger.test.ts src/backend/storeManagers/steam/__tests__/library.refresh.test.ts src/backend/storeManagers/steam/__tests__/authSessionLifecycle.test.ts src/backend/storeManagers/steam/__tests__/macSteamOfflineWrap.test.ts src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts && npx eslint src/backend/storeManagers/steam/authTrigger.ts src/backend/storeManagers/steam/__tests__/authTrigger.test.ts src/backend/storeManagers/steam/library/refresh.ts src/backend/storeManagers/steam/__tests__/library.refresh.test.ts && npx prettier --file-info src/backend/storeManagers/steam/authTrigger.ts src/backend/storeManagers/steam/__tests__/authTrigger.test.ts src/backend/storeManagers/steam/library/refresh.ts src/backend/storeManagers/steam/__tests__/library.refresh.test.ts && npx prettier --check src/backend/storeManagers/steam/authTrigger.ts src/backend/storeManagers/steam/__tests__/authTrigger.test.ts src/backend/storeManagers/steam/library/refresh.ts src/backend/storeManagers/steam/__tests__/library.refresh.test.ts && pnpm build:sidecar && npx tsc --noEmit -p . 2>&1 | grep -E '^src/.*error TS' | grep -v '^src/backend/storeManagers/steam/bridge/drm/' | sort > /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/08b32de7-19c4-4d5f-b9c5-9ac84e9f2d51/scratchpad/tsc-after.txt; comm -13 /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/08b32de7-19c4-4d5f-b9c5-9ac84e9f2d51/scratchpad/tsc-before.txt /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/08b32de7-19c4-4d5f-b9c5-9ac84e9f2d51/scratchpad/tsc-after.txt | (! grep .)</automated>
    Also grep that no other module consumed the old two-value grant shape: `grep -rn "consumeSteamRefreshLogonGrant\|SteamRefreshLogonGrant" src --include='*.ts' | grep -v __tests__` should list only authTrigger.ts and library/refresh.ts. Prettier note: `--file-info` was checked at planning time and all four paths report `"ignored": false`.
  </verify>
  <done>'steam-store-exit' maps to the 'store-exit' grant (keyring trigger still 'user-refresh'); a store-exit refresh whose wrap refuses shows no dialog, issues no logon, keeps the cache, emits idle and logs one store-exit line; explicit Refresh / redeem / go-offline-retry / login still pass guidedAction 'refresh'; all listed suites green; sidecar builds; no new tsc errors; eslint and scoped prettier clean; graphify updated; one commit with exactly the four files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar `refreshLibrary(runner, origin)` | origin is a renderer-supplied string that selects keyring/logon privilege |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-aqa-01 | Elevation of Privilege | authTrigger.mapRefreshOriginToLogonGrant | mitigate | Grant derives only from the existing own-property-guarded ORIGIN_TO_TRIGGER allowlist plus a Set allowlist; unknown/'__proto__'/'constructor' origins return null (tested). The change only DOWNGRADES one origin's escalation. |
| T-aqa-02 | Elevation of Privilege | noteRefreshTrigger runner guard | mitigate | Steam-inclusive runner check stays first; test that a 'gog' runner with 'steam-store-exit' arms no grant. |
| T-aqa-03 | Denial of Service | store-exit refresh silently skipped | accept | Cached library is restored and idle emitted; explicit Refresh still escalates, so the user always has a path to a full sync. |
</threat_model>

<verification>
- All five jest suites listed in Task 2's verify pass together (covers both tasks).
- `git log -2 --stat` shows two commits touching exactly the six planned files.
- `git status --short` still shows the unrelated dirty files (humble, gamelib.json, spikes, other steam files) unstaged and unmodified by this plan.
</verification>

<success_criteria>
- Leaving the Steam store after merely entering it (embed parked on an /app/ page) produces no `armed ... via=entry` line and no Steam refresh.
- Any store-exit Steam refresh that cannot get Mac Steam offline automatically never shows the "Set Steam offline to continue" dialog.
- Explicit Refresh, redeem-steam-key, Go Offline retry and login keep today's dialog behavior.
- No i18n, user.ts, macSteamOffline.ts or useStoreEmbedHost.ts changes.
</success_criteria>

<output>
Create `.planning/quick/261114-aqa-stop-set-steam-offline-dialog-when-leavi/261114-aqa-SUMMARY.md` when done (do not commit it).
</output>
