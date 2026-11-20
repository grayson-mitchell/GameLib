---
phase: quick-261105-vfq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/screens/DownloadManager/components/SteamManagedItem/index.tsx
  - src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx
  - src/frontend/screens/DownloadManager/components/SteamManagedItem/__tests__/SteamManagedItemView.test.tsx
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
autonomous: true
requirements: [TODO-2026-11-05-steam-uninstall-silently-dropped-when-signed-out]

must_haves:
  truths:
    - "A steam://install (or InstallApp-ok) request that Steam never picks up stops showing Installing after 2 minutes with no activity: the game goes back to Not installed, a notice says Steam didn't start the install and to make sure Steam is signed in, and a log line names the appId, the action and the timeout"
    - "A steam://uninstall request that Steam never picks up stops showing Uninstalling after 2 minutes with no activity: the game stays Installed, a notice says Steam didn't start the uninstall and to make sure Steam is signed in, and a log line names the appId, the action and the timeout"
    - "Any activity inside the 2-minute window (install: a manifest in any library, including a downloading/staging one; uninstall: StateFlags 0x800, bit 4 cleared, or manifest gone) disarms the timeout, and the poll then behaves exactly as today (MANIFEST_GONE_TICKS, MAX_TICKS)"
    - "A Steam-owned install appears in Downloads > Managed by Steam from the moment the request is sent, not only after the first downloading tick"
    - "Clicking Cancel on that row stops GameLib's poll and reverts the game to Not installed immediately, without touching Steam"
  artifacts:
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "STEAM_REQUEST_NO_ACTIVITY_TICKS timeout in both polls, cancelDelegatedInstall(appId), managedBySteam status at delegated poll registration"
      contains: "STEAM_REQUEST_NO_ACTIVITY_TICKS"
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "SteamGame.stop() branch that cancels a delegated install poll"
      contains: "cancelDelegatedInstall"
    - path: "src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx"
      provides: "Pure view with an enabled Cancel wired to onCancel"
    - path: "public/locales/en/gamelib.json"
      provides: "steam.install.notStarted, steam.uninstall.notStarted, downloadManager.steamManaged.note, downloadManager.steamManaged.cancelHint"
  key_links:
    - from: "SteamManagedItem/index.tsx"
      to: "backend kill -> SteamGame.stop()"
      via: "window.api.kill(row.appName, 'steam')"
      pattern: "window\\.api\\.kill\\("
    - from: "src/backend/storeManagers/steam/games.ts stop()"
      to: "library.ts cancelDelegatedInstall"
      via: "direct call before the bridge-record branch"
      pattern: "cancelDelegatedInstall\\(this\\.appId\\)"
---

<objective>
Recover from steam://install and steam://uninstall requests that a signed-out Mac Steam silently
drops. Add a 2-minute no-activity timeout to the delegated install poll and the uninstall poll that
reverts the state and shows a notice, and make Cancel on a Steam-owned install actually stop
GameLib's poll.

Purpose: today a dropped request leaves the game on Installing (up to the 600-tick, ~30 min
delegated window) or Uninstalling, and the only Cancel for a Steam-owned install is a disabled
button, so the operator had to restart GameLib (261105-ord gate item 6b).
Output: backend timeout + cancel in library.ts/games.ts with jest coverage, an enabled Cancel on the
Downloads "Managed by Steam" row, four new en keys in the `gamelib` namespace.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/261105-vfq-recover-from-steam-install-and-uninstall/261105-vfq-CONTEXT.md
@.planning/todos/pending/2026-11-05-steam-uninstall-silently-dropped-when-signed-out.md

Load `Skill("gamelib-conventions")` before starting: the sidecar exit contract and the `<verify>`
prettier rule both apply.

## Scouting findings (planner, 2026-11-05)

**Delegated install poll** (`src/backend/storeManagers/steam/library.ts`):
- `activePolls` entry type ~L2100-2205; constants at ~L2212-2226: `GRACE_TICKS = 20`,
  `MAX_TICKS = 7200`, `DELEGATED_NO_MANIFEST_TICKS = 600` (~30 min), `MANIFEST_GONE_TICKS = 10`.
- `startInstallPolling` (~L3383). An existing entry goes through an upgrade branch (~L3448) that
  sets `delegatedToSteamClient = true` on an already-ticking poll. A new entry is built at ~L3535,
  and the `setInterval` callback at ~L3555 ends with the `entry.delegatedToSteamClient` stop block
  (~L3625-3651). That block's "no manifest after N ticks" stop is the drop detector to replace:
  it sends `gameStatusUpdate {done}` and calls `stopInstallPolling`, but has no notice.
- `pollInstallOnce` (~L2922) sets `poll.seenDownloading = true` on every `'downloading'`
  readAcfState result. readAcfState scans every registered library, and `'downloading'` covers
  both Steam's download and staging phases (bit 4 unset, BytesToDownload/BytesToStage). An
  `'installed'` result completes and stops the poll. So `seenDownloading` is exactly the D-Detection
  install activity signal ("an appmanifest appears in any registered library, or a
  downloading/staging entry appears"). No `steamapps/downloading/<appId>` directory probe exists in
  the codebase, and none is added: the ACF read already covers it, and a per-tick extra fs probe
  would break the existsSync-count assertions in the existing D1-D3 tests.
- `managedBySteam: true` is stamped on `gameStatusUpdate` only inside the `'downloading'` branch
  (~L3085). A dropped request never produces a downloading tick, so it never gets a Downloads row
  (`steamManagedRows` filters on `managedBySteam === true`).
- Callers with `delegatedToSteamClient: true`: only `games.ts` ~L2099 (InstallApp `ok`) and ~L2132
  (`steam://install` fallback). Both get the timeout. That is correct: an accepted InstallApp with
  no activity is also a drop.
- The timer is already `unref?.()`'d (~L3698). The timeout is tick-count based inside the existing
  interval, so no new handle is created (sidecar exit contract half 1 holds; no new in-flight work,
  so half 2 holds).

**Uninstall poll**: `startUninstallPolling` (~L3957) is called only from `games.ts` ~L6413
(native `steam://uninstall`). Its entry is `{ timer, ticks, seenUninstalling }`.
`pollUninstallOnce` (~L3770) sets `seenUninstalling` on `'downloading'` (bit 4 clear) or
`StateFlags & 0x800`, and completes on `'absent'`. That matches the D-Detection uninstall activity
signal exactly. The no-activity stop already exists: `!entry.seenUninstalling && entry.ticks >=
GRACE_TICKS` (20 ticks, about 60 s) sends `done` plus a notice with key `notify.uninstallNotConfirmed`
(that key is in the upstream-owned `translation.json`). The gate's "stuck" observation was 48 s,
inside that 60 s window. So the uninstall change is the window (60 s to 2 min, per D-Timeout) and
the copy (sign-in hint, per D-After-a-drop). The badge already stays installed because
`gameStatusUpdate {done}` makes the frontend re-derive from `is_installed`, and D-02 means it was
never flipped.

**Why Cancel did not stop the poll**: no enabled Cancel reaches the backend for a Steam install.
- `MainButton.tsx:69` disables the install/cancel button for `runner === 'steam' && is.installing`
  (D-07).
- `GameCard/index.tsx:287` renders a disabled spinner for a Steam install, and its context-menu
  Cancel is `show: ... && !isSteam` (~L448).
- `SteamManagedItem/index.tsx` renders Pause and Cancel with `disabled` and no onClick.
- `handleStopInstallation` -> `window.api.cancelDownload` acts only on the DownloadManager queue,
  and a `steam://install` hand-off's queue element finishes at dispatch, so there is nothing to
  cancel there.
- The only reachable route is ConsoleMode's `sendKill` -> IPC `kill` (`gameDetailsFlowRegistration.ts:218`)
  -> `gamedetails/dispatch.ts:150 kill()` -> `callAbortController(appName)` +
  `SteamGame.stop()` (`games.ts` ~L6995). `stop()` handles only `nativeInstallsInFlight` (GameLib's
  own depot run) and `bridgeLaunchBottles`. It never touches `activePolls`, so even that route left
  the poll running.
- Fix: add a `stop()` branch that calls a new `cancelDelegatedInstall(appId)`, and enable the
  Downloads row's Cancel to call `window.api.kill(appName, 'steam')`. This also makes ConsoleMode's
  existing cancel work.

**Uninstall Cancel**: not offered. `GameCard/index.tsx:250` renders a disabled icon while
uninstalling, and GamePage has no uninstall cancel. Per Claude's Discretion it is not wired.

**Notice path**: `notify({ title, body })` from `../../dialog/dialog` (already imported in
library.ts). The body comes from `i18next.t('gamelib:<key>', '<en fallback>', vars)`, following
`gamelib:steam.uninstall.copySurvives` (~L3880). The library.test.ts `i18next` mock returns the
fallback, and `notify` is mocked (imported at test L58).

**i18n conventions**: new keys go in the fork-owned `gamelib` namespace with the `gamelib:`
prefix. `pnpm i18n-churn-guard` forbids any change to upstream catalogs such as `translation.json`,
so do NOT edit `notify.uninstallNotConfirmed`. `i18next-parser.config.js` sets `locales: ['en']`,
`sort: true`, `indentation: 4` and `keepRemoved: true`. Recent quicks (261105-ord, 261105-gy5)
added en keys only and left non-en catalogs to separate localise quicks. If
`pnpm lint-translations:gamelib` reports new en-only pairs, regenerate the presence baseline with
`LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` and confirm the diff adds only
this task's keys. `public/locales/**` is prettier-ignored (`--file-info` -> `"ignored": true`), so
hand-match the 4-space, sorted layout.

<interfaces>
From library.ts (existing):
- `export function startInstallPolling(appId: string, intervalMsOrOptions: number | PollOptions = 3000): void`
- `export function stopInstallPolling(appId: string): void` (clears interval, deletes entry, stops monitor; sends NO status)
- `export function startUninstallPolling(appId: string, intervalMsOrOptions: number | PollOptions = 3000): void`
- `export function stopUninstallPolling(appId: string): void`
- `sendFrontendMessage('gameStatusUpdate', { appName, runner: 'steam', status, managedBySteam? })`
- `notify({ title: string, body: string })`; `library.get(appId)?.title`
- `logWarning(msg, LogPrefix.Steam)`, `logInfo(msg, LogPrefix.Steam)`

New (this plan):
- `export function cancelDelegatedInstall(appId: string): boolean` returns true when it stopped a delegated poll

Frontend:
- `window.api.kill: (appName: string, runner: Runner) => Promise<void>` (src/common/types/ipc.ts:200)
- `GameStatus` has `managedBySteam?: boolean` (src/common/types.ts:389)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Delegated install no-activity timeout, early Managed-by-Steam flag, and Cancel in the backend</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, public/locales/en/gamelib.json</files>
  <behavior>
    Add these to the `quick 261024-exo: delegatedToSteamClient poll lifecycle` block in library.test.ts (~L6972, fake timers, interval 10). Reuse `delegatedAcf` / `doneCalls`.
    - D1 (rewrite the existing test; it asserts the 600-tick window): no manifest ever. After 39 ticks, no `done` and no notify. By tick 41, exactly one `done`, `notify` called once with `{ title: <library title or ''>, body: expect.stringContaining('signed in') }`, a `logWarning` whose text contains `'730'`, `'install'` and `'2 min'` (or the tick count), and no further existsSync calls after the stop.
    - D5: the manifest is `'downloading'` (`delegatedAcf('1026')`) from tick 1 for 60 ticks. No `done`, no notify, the poll is still ticking (existsSync count grows).
    - D6: right after `startInstallPolling('730', { intervalMs: 10, delegatedToSteamClient: true })` and before any timer advance, `sendFrontendMessage` has been called with `gameStatusUpdate` `{ appName: '730', runner: 'steam', status: 'installing', managedBySteam: true }`.
    - D7: a bare poll is started with `isNativeInstallInFlight` mocked true so the grace window does not stop it, and advanced 30 ticks. It is then upgraded with `{ delegatedToSteamClient: true }`. That emits the managedBySteam status, and no `done` arrives until 40 ticks after the upgrade: none at upgrade+39, one by upgrade+41.
    - D8: on a delegated poll, `cancelDelegatedInstall('730')` returns true. It sends one `done` synchronously, and the poll no longer ticks. A second call returns false. On a non-delegated poll it returns false and leaves the poll registered. With no poll at all it returns false.
    - games.test.ts (next to the `SteamGame.stop()` describe ~L2266): with `jest.spyOn(libraryModule, 'cancelDelegatedInstall').mockReturnValue(true)` and no native-in-flight/bridge record, `await new SteamGame(APP_ID).stop()` calls it with APP_ID and does not log the "Steam owns process lifecycle" no-op warning. With `mockReturnValue(false)`, behaviour is unchanged: the existing no-op warning path runs.
  </behavior>
  <action>
    In library.ts, replace `DELEGATED_NO_MANIFEST_TICKS = 600` with `STEAM_REQUEST_NO_ACTIVITY_TICKS = 40` (about 2 min at 3 000 ms, per D-Timeout). Rewrite its comment block to say this is the no-activity window after GameLib sends a steam://install / InstallApp / steam://uninstall request (quick 261105-vfq). Say that activity disarms it, that MAX_TICKS stays the ceiling, and that it is tick-counted inside the existing unref'd interval (no new handle). Remove the 600-tick rationale.

    Add `delegatedSinceTick: number` to the activePolls entry type, with a docstring: the tick at which the poll became delegated, so the window counts from the request, not from an older bare poll. Set it to 0 in the new-entry literal. In the upgrade branch, where `delegatedToSteamClient` flips to true, set `existingEntry.delegatedSinceTick = existingEntry.ticks`.

    Add a module-private helper `markManagedBySteam(appId)`. It sends `gameStatusUpdate { appName, runner: 'steam', status: 'installing', managedBySteam: true }`, and its comment explains it lists the request in Downloads before Steam shows activity, so Cancel is reachable. Call it after `activePolls.set` for a new entry with `delegatedToSteamClient` true, and in the upgrade branch right after the flip.

    In the interval's delegated block, replace the "no manifest after N ticks" condition with `!entry.seenDownloading && entry.ticks - entry.delegatedSinceTick >= STEAM_REQUEST_NO_ACTIVITY_TICKS`. Keep the existing `seenDownloading && absentTicksSinceSeen >= MANIFEST_GONE_TICKS` branch unchanged. For the no-activity case only (per D-After-a-drop):
    - log `logWarning` with exactly this shape: `Steam: Steam did not start the install for appId ${appId} — no activity within ${STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks (~2 min) of the request; reverting to not installed (quick 261105-vfq)`
    - send `gameStatusUpdate {done}`
    - call `notify({ title: library.get(appId)?.title ?? '', body: i18next.t('gamelib:steam.install.notStarted', "Steam didn't start the install. Make sure Steam is signed in, then try again.") })`
    - call `stopInstallPolling(appId)`
    The manifest-gone branch keeps today's log and no notice.

    Add `export function cancelDelegatedInstall(appId: string): boolean` next to `stopInstallPolling`, with a JSDoc citing CONTEXT D-Cancel. If there is no entry, or `!entry.delegatedToSteamClient`, return false. Otherwise:
    - log `logInfo` with `Steam: Cancel stops GameLib's wait for the Steam-owned install of appId ${appId}; nothing is cancelled inside Steam (quick 261105-vfq)`
    - call `stopInstallPolling(appId)`
    - send `gameStatusUpdate {done}`
    - return true
    No notice: the user asked for it. Update the `startInstallPolling` JSDoc "Stops automatically when" bullet for delegated polls to describe the no-activity window and Cancel.

    In games.ts, add `cancelDelegatedInstall` to the existing `from './library'` import (~L81-97). In `SteamGame.stop()` (~L6995), right after the `nativeInstallsInFlight` branch returns, add: `if (cancelDelegatedInstall(this.appId)) return`. Comment it as the delegated-install cancel route (IPC `kill` -> dispatch.kill -> stop(); quick 261105-vfq). Do not change any other stop() branch.

    In public/locales/en/gamelib.json, add `steam.install.notStarted` = "Steam didn't start the install. Make sure Steam is signed in, then try again." in sorted position inside the existing `steam.install` object, with 4-space indent.

    Do not add a sign-in pre-check (D-Detection). Do not touch the InstallApp route, the D-UAT-13 hold, depot downloads, or bottle/bridge sources.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && npx prettier --file-info src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && grep -v '^\s*//' src/backend/storeManagers/steam/library.ts | grep -c DELEGATED_NO_MANIFEST_TICKS | grep -qx 0</automated>
    public/locales/en/gamelib.json is prettier-ignored (`--file-info` reports `"ignored": true`), so it is omitted from the check. Its layout is hand-matched (sorted, 4-space).
  </verify>
  <done>D1 (rewritten) and D5-D8 plus the games.test stop() cases pass, along with every existing test in both files. DELEGATED_NO_MANIFEST_TICKS no longer appears in code. A delegated poll emits managedBySteam at registration, stops with a notice after 40 no-activity ticks, and `kill` on a Steam-owned install stops its poll immediately.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Uninstall poll uses the 2-minute no-activity window and the sign-in notice</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, public/locales/en/gamelib.json</files>
  <behavior>
    - Update the existing grace test in `startUninstallPolling() idempotency and stopUninstallPolling()` (~L7740-7795, interval 10, StateFlags '4' manifest). After 21 ticks there is no `done` and no notify (the 60 s grace is gone). By tick 41 there is exactly one `done`, `notify` with `{ title: 'CS:GO', body: expect.stringContaining('uninstall') }`, and the body contains 'signed in'. There is a `logWarning` containing `'730'`, `'uninstall'` and `'~2 min'`, there is still no `pushGameToLibrary` with `is_installed: false`, and the poll stops ticking.
    - New: the manifest has StateFlags '2052' (4 | 0x800, actively uninstalling) for 60 ticks. No `done`, no notify, and the poll is still registered (activity disarmed the window).
    - New: the manifest is present at '4' for 5 ticks, then absent. The existing completion path runs (`pushGameToLibrary` with is_installed false, the "Game Uninstalled" notify), and the no-activity notice never fires.
  </behavior>
  <action>
    In `startUninstallPolling`'s interval (~L4017), change the no-activity condition from `entry.ticks >= GRACE_TICKS` to `entry.ticks >= STEAM_REQUEST_NO_ACTIVITY_TICKS` (per D-Timeout, the same constant as Task 1). Leave `GRACE_TICKS` in use for the non-delegated install path.

    Replace that branch's log with `Steam: Steam did not start the uninstall for appId ${appId} — no activity within ${STEAM_REQUEST_NO_ACTIVITY_TICKS} ticks (~2 min) of the request; keeping it installed (quick 261105-vfq)`. Replace the notify body key `notify.uninstallNotConfirmed` (upstream translation.json, which must not be edited) with `i18next.t('gamelib:steam.uninstall.notStarted', "Steam didn't start the uninstall. Make sure Steam is signed in, then try again.")`.

    Keep the `done` status, the stop, and the D-02 "badge never flips on a timeout" behaviour. Update the surrounding comment (keep the debug/wazhack-uninstall-reverts history in one sentence) and the `startUninstallPolling` JSDoc "Stops automatically when" bullet to say no-activity window of about 2 min (quick 261105-vfq). The activity rules in `pollUninstallOnce` are unchanged, because they already match D-Detection.

    In public/locales/en/gamelib.json, add `steam.uninstall.notStarted` with that copy, in sorted position inside the existing `steam.uninstall` object.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts && npx prettier --file-info src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts && grep -v '^\s*//' src/backend/storeManagers/steam/library.ts | grep -c "notify.uninstallNotConfirmed" | grep -qx 0</automated>
    public/locales/en/gamelib.json is prettier-ignored and omitted from the check (hand-matched).
  </verify>
  <done>The uninstall grace test is updated to 40 ticks and the two new uninstall tests pass. library.ts no longer references `notify.uninstallNotConfirmed`, and the en catalog carries `steam.uninstall.notStarted`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Enable Cancel on the Downloads "Managed by Steam" row, then run the i18n gates and full checks</name>
  <files>src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx, src/frontend/screens/DownloadManager/components/SteamManagedItem/index.tsx, src/frontend/screens/DownloadManager/components/SteamManagedItem/__tests__/SteamManagedItemView.test.tsx, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json</files>
  <behavior>
    The view test follows `src/frontend/screens/Settings/components/__tests__/SteamExperimentalInstallApp.test.tsx`: call the view as a function and walk the element tree. Mock `react-router-dom`'s `Link` to an inert stand-in if its import fails under this jest config.
    - The Cancel button has `disabled` falsy, its `title` is the cancelHint copy, and its `onClick` invokes the `onCancel` prop exactly once.
    - The Pause button is still `disabled` and its title is the new note copy ("Managed by Steam. Pause it in Steam.").
    - The footer note renders the new note copy, not the old "Pause or cancel it in Steam." text.
  </behavior>
  <action>
    Move the JSX of `SteamManagedItem` into a new pure `SteamManagedItemView.tsx` with no CSS import, so jest can load it. It exports `SteamManagedItemView({ appName, title, percent, bytes, t, onCancel })`, where `t` has the shape `(key: string, fallback: string) => string`.

    The view uses two new keys:
    - `gamelib:downloadManager.steamManaged.note` = "Managed by Steam. Pause it in Steam." for the footer note and the Pause button title.
    - `gamelib:downloadManager.steamManaged.cancelHint` = "Stops GameLib waiting for Steam. Anything Steam has already started keeps going in Steam." for the Cancel button title.
    Cancel loses `disabled` and gets `onClick={onCancel}`. Pause stays disabled. Leave the old `steamManaged.unavailable` key in the catalog untouched (`keepRemoved: true`). A new key avoids staling existing translations of the old text.

    `index.tsx` keeps the CSS import, the context, `hasProgress` and title lookup. It renders the view with `onCancel={() => void window.api.kill(row.appName, 'steam')}` (per D-Cancel: immediate, no dialog, nothing sent to Steam). Update the file's header comment: Cancel stops GameLib's poll via `kill` -> `SteamGame.stop()` -> `cancelDelegatedInstall` (quick 261105-vfq), and Pause is still Steam's.

    Add both keys in sorted position inside `downloadManager.steamManaged` in public/locales/en/gamelib.json.

    Then run the i18n gates:
    1. Run `pnpm i18n`, then `git diff --stat public/locales`. Expect only `public/locales/en/gamelib.json`. If the parser reformatted or added anything other than this plan's four keys, reconcile so the hand-written entries equal the parser output.
    2. Run `pnpm i18n-churn-guard`.
    3. Run `pnpm lint-translations:gamelib`. If it reports new en-only pairs for the four keys, run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`, confirm the baseline diff adds only pairs for `steam.install.notStarted`, `steam.uninstall.notStarted`, `downloadManager.steamManaged.note` and `downloadManager.steamManaged.cancelHint`, and re-run it to exit 0.
    Non-en translations are not part of this task. That matches recent quicks, which leave them to a localise quick.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/DownloadManager/components/SteamManagedItem src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && pnpm codecheck && npx eslint src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/frontend/screens/DownloadManager/components/SteamManagedItem/index.tsx src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx src/frontend/screens/DownloadManager/components/SteamManagedItem/__tests__/SteamManagedItemView.test.tsx && pnpm i18n && pnpm i18n-churn-guard && pnpm lint-translations:gamelib && npx prettier --file-info src/frontend/screens/DownloadManager/components/SteamManagedItem/index.tsx src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx src/frontend/screens/DownloadManager/components/SteamManagedItem/__tests__/SteamManagedItemView.test.tsx meta/i18nCatalogPresenceBaseline.json && npx prettier --check src/frontend/screens/DownloadManager/components/SteamManagedItem/index.tsx src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx src/frontend/screens/DownloadManager/components/SteamManagedItem/__tests__/SteamManagedItemView.test.tsx</automated>
    If meta/i18nCatalogPresenceBaseline.json was rewritten and `--file-info` reports it `"ignored": false`, append it to the `prettier --check` list. If it was not touched, drop it from both lists. public/locales/en/gamelib.json is prettier-ignored and omitted.
  </verify>
  <done>The Downloads "Managed by Steam" row shows an enabled Cancel that calls `window.api.kill(appName, 'steam')`. The view test passes. codecheck, eslint on every touched file, `pnpm i18n` (no diff beyond the four en keys), i18n-churn-guard, lint-translations:gamelib and scoped prettier all exit 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar IPC `kill` | existing invoke; appName is a renderer-supplied string |
| Steam client -> ACF files on disk | poll reads Steam-written manifests (existing, unchanged) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vfq-01 | Tampering | `cancelDelegatedInstall` via `kill` | accept | It only stops GameLib's own in-memory poll for an appId that already has a delegated entry (Map lookup; unknown appId returns false). It never spawns, writes files or talks to Steam. The `kill` IPC already exists and reaches `stop()` today. |
| T-vfq-02 | Denial of Service | sidecar exit contract | mitigate | The timeout is a tick count inside the existing `unref?.()`'d interval. No new timer, watcher, socket or in-flight request is added. |
| T-vfq-03 | Repudiation | dropped-request diagnosis | mitigate | Each timeout logs appId, action and window ("~2 min"), and Cancel logs that nothing was cancelled in Steam, so live-gate logs show what happened. |
</threat_model>

<verification>
- All jest suites named above pass, including the rewritten D1 and the updated uninstall grace test.
- `pnpm codecheck` exits 0. eslint on the touched files exits 0. `pnpm i18n` produces no diff beyond the four en keys. `pnpm i18n-churn-guard` and `pnpm lint-translations:gamelib` exit 0.
- Scoped `npx prettier --check` passes on every non-ignored written path.
- Live check (operator, not the executor): the todo's `ready: live-gate` stays until a signed-out Mac Steam run shows (a) Installing reverting with the notice about 2 min after steam://install, (b) Uninstalling reverting to Installed with the notice, and (c) Downloads > Managed by Steam > Cancel clearing a stuck delegated install at once. Todo closure is the orchestrator's job.
</verification>

<success_criteria>
- Dropped install: reverts to Not installed with the sign-in notice and a log line after 40 no-activity ticks.
- Dropped uninstall: reverts to Installed with the sign-in notice and a log line after 40 no-activity ticks.
- Activity inside the window disarms the timeout, and behaviour after that is unchanged.
- Cancel on a Steam-owned install stops the poll and reverts immediately. It is reachable from the moment the request is sent.
</success_criteria>

<output>
Create `.planning/quick/261105-vfq-recover-from-steam-install-and-uninstall/261105-vfq-SUMMARY.md` when done
</output>
