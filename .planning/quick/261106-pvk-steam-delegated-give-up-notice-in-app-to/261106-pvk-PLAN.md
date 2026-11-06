---
phase: quick-261106-pvk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types/steam.ts
  - src/common/types/ipc.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/gamedetails/dispatch.ts
  - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
  - src/preload/api/steam.ts
  - src/frontend/state/SteamRequestNotice.ts
  - src/frontend/state/__tests__/SteamRequestNotice.test.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
autonomous: true
requirements:
  - TODO-2026-11-06-steam-delegated-give-up-notice-is-system-toast-not-in-app

must_haves:
  truths:
    - "When Steam never starts a delegated install within ~2 min, the 'Make sure Steam is signed in' message appears as a toast in GameLib's own bottom-right notice stack, not as a system notification"
    - "When Steam never starts a delegated uninstall within ~2 min, the same happens with the uninstall wording"
    - "Neither give-up path calls notify() any more; every other notify() in library.ts (e.g. 'Game Uninstalled') is unchanged"
    - "The give-up toast's countdown stays frozen until GameLib is visible and focused, so a user who is in Steam still sees it on return"
    - "Cancel on a Steam-delegated install logs no '[ERROR] Aborting not possible' line; cancel of anything else still calls callAbortController exactly as before"
  artifacts:
    - path: "src/common/types/steam.ts"
      provides: "SteamRequestNoticePayload (appId, title, kind closed union, seq)"
      contains: "export interface SteamRequestNoticePayload"
    - path: "src/frontend/state/SteamRequestNotice.ts"
      provides: "zustand store holding the newest request notice + handleSteamRequestNoticeSignal"
      exports: ["useSteamRequestNotice", "handleSteamRequestNoticeSignal"]
    - path: "src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx"
      provides: "a fourth slot stream ('request') rendered through the existing renderSlot/renderNoticeSlot into NoticeStack"
      contains: "slotKey: 'request'"
  key_links:
    - from: "src/backend/storeManagers/steam/library.ts"
      to: "steamRequestNotice push"
      via: "sendFrontendMessage at both no-activity give-up branches"
      pattern: "sendFrontendMessage\\('steamRequestNotice'"
    - from: "src/frontend/state/GlobalState.tsx"
      to: "handleSteamRequestNoticeSignal"
      via: "window.api.handleSteamRequestNotice registration next to handleSteamEngineStateChanged"
      pattern: "handleSteamRequestNotice\\("
    - from: "src/backend/gamedetails/dispatch.ts"
      to: "isDelegatedInstallPolling"
      via: "kill() skips callAbortController only for runner steam + delegated poll"
      pattern: "isDelegatedInstallPolling\\("
---

<objective>
Fix todo `.planning/todos/pending/2026-11-06-steam-delegated-give-up-notice-is-system-toast-not-in-app.md`, both parts, in code.

1. The two 2-minute give-up messages (`gamelib:steam.install.notStarted`,
   `gamelib:steam.uninstall.notStarted`) move from the system `notify()` to GameLib's existing
   bottom-right in-app toast stack. In-app REPLACES `notify()` for these two paths only (locked).
2. Cancel on a Steam-delegated install stops logging
   `[ERROR] [Backend]: Aborting not possible. Could not find a matching abort controller for <appId>`.

Purpose: on the 261105-vfq live gate the system toast landed on another monitor and may not be
delivered at all in a packaged macOS build, so the user saw the status revert with no reason. The
Cancel ERROR fires on an expected path (a delegated install has no abort controller by design).

Output: a new one-way push `steamRequestNotice`, a small frontend store, a fourth slot stream in
`SteamEngineLaunchNotice` (which already renders its slots into `NoticeStack`), and a
delegated-install gate in `dispatch.kill()`.

The todo is NOT moved or closed by this plan and its `ready:` value is not edited; the live check
on a signed-out Mac Steam happens afterwards.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-06-steam-delegated-give-up-notice-is-system-toast-not-in-app.md
@.planning/quick/261105-vfq-recover-from-steam-install-and-uninstall/261105-vfq-SUMMARY.md
@.claude/skills/sketch-findings-gamelib/references/notices-and-toasts.md

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence (formatter-check rule)
and note the sidecar exit contract: this plan adds NO timer, watcher, socket or child handle in
the backend. The frontend countdown reuses the component's existing `setTimeout` pattern (renderer,
not sidecar).

<findings>
Traced during planning (line numbers as of HEAD e4b4ec81b):

- Give-up sites in `src/backend/storeManagers/steam/library.ts`: install branch ~3640-3665
  (`entry.ticks - entry.delegatedSinceTick >= STEAM_REQUEST_NO_ACTIVITY_TICKS`, then
  `sendFrontendMessage('gameStatusUpdate', … 'done')`, then `notify({ title: library.get(appId)?.title ?? '', body: i18next.t('gamelib:steam.install.notStarted', …) })`,
  then `stopInstallPolling`). Uninstall branch ~4089-4112, same shape with
  `gamelib:steam.uninstall.notStarted`. `notify` stays imported: library.ts has other notify()
  calls (~1005, ~2748, ~3098, ~3258, ~3281, and the 'Game Uninstalled' path) that must not change.
- How the existing in-app notices reach the frontend: backend `engine/engineState.ts`
  `publisher(state)` -> `sendFrontendMessage('steamEngineStateChanged', state)`
  (`sidecar/steamAuthFlowRegistration.ts:393`) -> `FrontendMessages.steamEngineStateChanged`
  in `src/common/types/ipc.ts:832` -> preload `frontendListenerSlot('steamEngineStateChanged')`
  (`src/preload/api/steam.ts:34`) -> `GlobalState.tsx:1691` registers
  `handleSteamEngineStateChangedSignal` -> zustand `useSteamEngineState.byAppId` ->
  `SteamEngineLaunchNotice` reads `launchNotice` / `overlayNotice` / `exitNotice` (each `{seq}`),
  shows once per seq, renders slots via `renderNoticeSlot` into `AppNoticeStack`
  (`NoticeStack/index.tsx`, mounted once in `App.tsx`).
- Why NOT reuse the engine-state push for this: `publishOverlayNotice`/`publishOverlayExitNotice`
  re-push `lastPublished.get(appId)`, which exists only for Mac titles with a bridge install
  (`getSteamEngineState` returns null otherwise). A delegated install is any platform and the
  title is usually not installed, so there is no base state, and synthesising one would corrupt
  the game page's engine display state in `byAppId`. Hence a dedicated push channel. The slot
  still lives in the SAME component and region (no new toast component, no new positioned
  element) per the locked decision.
- Cancel ERROR source: `src/backend/gamedetails/dispatch.ts:150-153`
  `kill(appName, runner)` calls `callAbortController(appName)` unconditionally, then
  `getGame(appName).stop()`. `SteamGame.stop()` (`games.ts:6997`) itself does NOT call it on the
  delegated route (it returns after `cancelDelegatedInstall(this.appId)`), so the miss log comes
  from `kill()`. The log is emitted by `backend/utils/aborthandler/aborthandler.ts`
  `callAbortController` — DO NOT edit that file (its comment says the ERROR is deliberately kept
  for every caller that expects a registration).
- The two `utils.test.ts` pins (~219: the `callAbortController` fake that logs the miss; ~924:
  REQ-37-04 cases 1/2/2b on `installQueueElement` and `stopCurrentDownload` ordering) and
  `installStallWatchdog.ts:44` (the `hasAbortController` gate) are all on download-queue paths
  this plan does not touch. They must stay green; nothing in them is edited.
- `gameDetailsModules.test.ts:297` pins `kill('440','steam')` calling abort BEFORE stop. It must
  stay green unchanged (the new predicate mock returns falsy there).
- `dispatch.ts` header: must not import `electron`/`backend/ipc`/`../ipc`/`../launcher`/
  `main_window` DIRECTLY (`gameDetailsImportGate.test.ts`). Importing
  `../storeManagers/steam/library` is allowed and adds no new electron reach:
  `../storeManagers` (already imported) already imports `backend/storeManagers/steam/library`.
  `electronReachLedger.test.ts` must still pass.
</findings>

<interfaces>
From src/backend/storeManagers/steam/library.ts (existing):
- `export function cancelDelegatedInstall(appId: string): boolean` — `activePolls.get(appId)`;
  returns false unless `entry.delegatedToSteamClient`.
- `sendFrontendMessage` imported from `'../../ipc'`; `i18next` already imported.

From src/common/types/ipc.ts (FrontendMessages, ~line 830):
- `steamGoOfflineRequired: (payload: SteamGoOfflinePayload) => void`
- `steamEngineStateChanged: (payload: SteamEngineState) => void`

From src/preload/api/steam.ts:
- `export const handleSteamEngineStateChanged = frontendListenerSlot('steamEngineStateChanged')`

From src/frontend/state/SteamEngineState.ts (pattern to mirror):
- `handleSteamEngineStateChangedSignal(_e: IpcRendererEvent, state)` validates
  `/^[0-9]{1,10}$/` on appId before writing the store.

From src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx:
- streams `shown` / `shownOverlay` / `shownExit`, each with seq ref, hovered state, remaining ref,
  pending ref, finish fn, auto-hide effect, `useNoticePhaseFallback`, and a `renderSlot({...})`
  call; the exit stream also has the `waitingExit` + `gameLibInFront()` latch. Returns a fragment
  `{exitNode}{overlayNode}{engineNode}`.
- `useSuppressStoreEmbedWhile(shown !== null || shownOverlay !== null || shownExit !== null)`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — push the give-up notice in-app and stop the delegated Cancel ERROR</name>
  <files>src/common/types/steam.ts, src/common/types/ipc.ts, src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, src/backend/gamedetails/dispatch.ts, src/backend/gamedetails/__tests__/gameDetailsModules.test.ts</files>
  <behavior>
    - PVK-1 (rewrite of existing D1, library.test.ts ~6991): at the install no-activity give-up, `sendFrontendMessage` is called once with `'steamRequestNotice'` and `{ appId: '730', title: expect.any(String), kind: 'install-not-started', seq: expect.any(Number) }`; the `gameStatusUpdate` done still fires exactly once; `notify` is NOT called at any point; the `~2 min` logWarning still fires.
    - PVK-2 (rewrite of the uninstall no-activity test, ~7885-7920): at tick 41 `sendFrontendMessage('steamRequestNotice', { appId: '730', title: 'CS:GO', kind: 'uninstall-not-started', seq: number })` fires once and `notify` is never called; nothing fires at tick 21 or 39.
    - PVK-3: two give-ups in one session carry strictly increasing `seq`.
    - VFQ-6 (unchanged) still sees `notify({ title: 'CS:GO', body: 'Game Uninstalled' })` exactly once and no `steamRequestNotice`.
    - PVK-4 (library.test.ts): `isDelegatedInstallPolling('730')` is true for a poll started with `delegatedToSteamClient: true`, false for a bare poll, false with no poll, and false after `cancelDelegatedInstall('730')`.
    - PVK-5 (gameDetailsModules.test.ts): with the predicate mocked true, `kill('203160','steam')` does NOT call `callAbortController` and DOES call `getGame('203160').stop()` and returns its result.
    - PVK-6: with the predicate mocked true, `kill('x','legendary')` still calls `callAbortController('x')` (the gate is steam-only and the predicate is not consulted for other runners).
    - The existing REQ-34.2-01 kill-order test (~297) stays green without edits.
  </behavior>
  <action>
    Types: in `src/common/types/steam.ts` add `export interface SteamRequestNoticePayload { appId: string; title: string; kind: 'install-not-started' | 'uninstall-not-started'; seq: number }` with a one-line doc comment (quick 261106-pvk: Steam never picked up a delegated request; renderer maps `kind` to catalogue strings, shows once per seq). In `src/common/types/ipc.ts` FrontendMessages, next to `steamEngineStateChanged`, add `steamRequestNotice: (payload: SteamRequestNoticePayload) => void` with a short comment, importing the type the same way the neighbouring Steam payload types are imported.

    library.ts: add a module-level `let steamRequestNoticeSeq = 0`. In BOTH no-activity give-up branches replace the `notify({...})` call with `sendFrontendMessage('steamRequestNotice', { appId, title: library.get(appId)?.title ?? '', kind: 'install-not-started' | 'uninstall-not-started', seq: ++steamRequestNoticeSeq })`. Keep the logWarning, the `gameStatusUpdate` done and the stop call, in the same order. Remove the now-unused `i18next.t('gamelib:steam.install.notStarted'…)` / `…uninstall.notStarted` calls from library.ts (the keys move to the frontend in Task 3 and stay in gamelib.json). Update the comments at both sites (the uninstall one mentions "an honest toast") to say the notice now goes to the in-app stack because the system notification can land on another monitor or not be delivered (quick 261106-pvk). Do not touch any other notify() call. Add `export function isDelegatedInstallPolling(appId: string): boolean` next to `cancelDelegatedInstall`, returning `activePolls.get(appId)?.delegatedToSteamClient === true`, with a doc comment naming its one caller (dispatch.kill). No new timer or handle (sidecar exit contract).

    dispatch.ts `kill()`: import `isDelegatedInstallPolling` from `'../storeManagers/steam/library'`. Call `callAbortController(appName)` unless `runner === 'steam' && isDelegatedInstallPolling(appName)`; check `runner` first so the predicate is never evaluated for other runners. Keep the abort-before-stop order and `return libraryManagerMap[runner].getGame(appName).stop()`. Comment: a Steam-owned install has no abort controller by design; `SteamGame.stop()` -> `cancelDelegatedInstall` ends it, and calling `callAbortController` would log a false ERROR (quick 261106-pvk). This is the narrowest fix: `aborthandler.ts`, `downloadqueue.ts`, `downloadmanager/utils.ts` and `installStallWatchdog.ts` are NOT edited, and the ERROR is unchanged for every non-delegated cancel.

    Tests: in library.test.ts rewrite D1 and the uninstall no-activity test as PVK-1/PVK-2 (keep their test names' meaning, add "in-app notice, no notify()"), add PVK-3 and PVK-4 beside VFQ-4, using the file's existing helpers (`doneCalls()`, `g9oLogger()`, `startInstallPolling`, `startUninstallPolling`, fake timers). In gameDetailsModules.test.ts add `jest.mock('backend/storeManagers/steam/library', () => ({ isDelegatedInstallPolling: (...a: [string]) => isDelegatedInstallPollingMock(...a) }))` with a `const isDelegatedInstallPollingMock = jest.fn()` declared above it (mirror the `callAbortControllerMock` pattern; `resetMocks: true` leaves it returning undefined, which keeps the existing kill test green), then PVK-5 and PVK-6. Write the tests first and confirm PVK-1/2/4/5 fail before implementing.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/gamedetails src/backend/downloadmanager/__tests__/utils.test.ts src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts src/backend/utils/aborthandler src/backend/sidecar/__tests__/electronReachLedger.test.ts src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts && pnpm codecheck && for f in src/common/types/steam.ts src/common/types/ipc.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/gamedetails/dispatch.ts src/backend/gamedetails/__tests__/gameDetailsModules.test.ts; do npx prettier --file-info "$f"; done && npx prettier --check src/common/types/steam.ts src/common/types/ipc.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/gamedetails/dispatch.ts src/backend/gamedetails/__tests__/gameDetailsModules.test.ts && test "$(grep -v '^\s*//' src/backend/storeManagers/steam/library.ts | grep -c 'notStarted')" = 0</automated>
    `--file-info` takes one path per call; every path above must report `"ignored": false` (all six are TypeScript under prettier).
  </verify>
  <done>Both give-up branches push `steamRequestNotice` and never call notify(); `isDelegatedInstallPolling` exported; `kill()` skips the abort lookup only for a delegated Steam install; PVK-1..6 pass; utils.test.ts, installStallWatchdog, aborthandler, electronReachLedger and the existing kill-order test pass unedited; codecheck clean; scoped prettier check passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Frontend plumbing — preload slot, request-notice store, GlobalState listener</name>
  <files>src/preload/api/steam.ts, src/frontend/state/SteamRequestNotice.ts, src/frontend/state/__tests__/SteamRequestNotice.test.ts, src/frontend/state/GlobalState.tsx</files>
  <behavior>
    - A valid payload (`appId` matching `/^[0-9]{1,10}$/`, `kind` in the closed union, numeric `seq`, string `title`) sets `useSteamRequestNotice.getState().latest` to it.
    - A payload with a non-numeric appId, an unknown `kind`, a non-number `seq`, or a null payload is ignored (store unchanged) — T-pvk-01.
    - A later payload with a lower or equal seq than the stored one does not replace it.
  </behavior>
  <action>
    Preload: in `src/preload/api/steam.ts`, directly under `handleSteamEngineStateChanged`, add `export const handleSteamRequestNotice = frontendListenerSlot('steamRequestNotice')` with a one-line comment (quick 261106-pvk: one-way push, library.ts no-activity give-up). Mind `src/preload/.prettierrc` (printWidth 120) — format with prettier, do not hand-wrap.

    Store: create `src/frontend/state/SteamRequestNotice.ts` mirroring `SteamEngineState.ts`: a zustand store `useSteamRequestNotice` with `latest: SteamRequestNoticePayload | null` and `set(payload)`; plus a standalone `handleSteamRequestNoticeSignal(_e: IpcRendererEvent, payload: SteamRequestNoticePayload): void` that validates as in the behavior block and writes only when `payload.seq` exceeds the stored seq. Header comment: written only from the backend push; the frontend never derives it; consumed by SteamEngineLaunchNotice's request slot.

    GlobalState.tsx: next to `window.api.handleSteamEngineStateChanged(handleSteamEngineStateChangedSignal)` (~1691) register `window.api.handleSteamRequestNotice(handleSteamRequestNoticeSignal)` with a short comment, and import the handler beside the `SteamEngineState` import (~73). Follow however that block handles listener cleanup for its neighbours (if they collect unsubscribe functions, do the same).

    Test: `src/frontend/state/__tests__/SteamRequestNotice.test.ts`, modelled on `SteamEngineState.test.ts` in the same folder; reset the store in `beforeEach`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/state/__tests__/SteamRequestNotice.test.ts src/frontend/state/__tests__/SteamEngineState.test.ts && pnpm codecheck && for f in src/preload/api/steam.ts src/frontend/state/SteamRequestNotice.ts src/frontend/state/__tests__/SteamRequestNotice.test.ts src/frontend/state/GlobalState.tsx; do npx prettier --file-info "$f"; done && npx prettier --check src/preload/api/steam.ts src/frontend/state/SteamRequestNotice.ts src/frontend/state/__tests__/SteamRequestNotice.test.ts src/frontend/state/GlobalState.tsx</automated>
    All four paths must report `"ignored": false` from `--file-info`.
  </verify>
  <done>`window.api.handleSteamRequestNotice` exists and is typed from FrontendMessages; GlobalState feeds the store; invalid payloads are dropped; tests pass; codecheck and scoped prettier check pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Render the give-up notice as a fourth slot in the existing toast stack</name>
  <files>src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx, src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json</files>
  <behavior>
    - With the request store holding `{ appId: '203160', title: '7 Days to Die', kind: 'install-not-started', seq: 1 }`, the component renders a role=status slot whose text is `7 Days to Die Steam didn't start the install. Make sure Steam is signed in, then try again.`
    - `kind: 'uninstall-not-started'` renders the uninstall sentence.
    - An empty `title` renders the fallback title `Steam`.
    - It shows once per seq: dismiss -> leaving -> collapsing -> gone, a re-render with the same seq does not re-show it, a higher seq does.
    - While GameLib is not visible+focused the countdown is frozen (`--waiting` modifier, no auto-hide after 8s); after a focus event it auto-hides after 8s.
    - Store-embed suppression is true while the request slot is shown.
    - All existing SteamEngineLaunchNotice tests stay green (add the request-store mock returning `latest: null` so they are unaffected).
  </behavior>
  <action>
    Per the locked decision, reuse the existing stack: add a fourth stream inside `SteamEngineLaunchNotice` — NOT a new toast component and NOT a new positioned element. Read `useSteamRequestNotice((s) => s.latest)`. Model the stream exactly on the exit-notice stream (it is the closest analog: once per seq, `waiting` latch on `gameLibInFront()` with focus/visibilitychange listeners, pausable auto-hide with a remaining-budget ref, pending replacement promoted on finish, `useNoticePhaseFallback`). State: `ShownRequest { kind, title, seq, phase }`. Add `shownRequest !== null` to the `useSuppressStoreEmbedWhile` condition and to the early `return null` guard. Declare all new hooks unconditionally after the existing ones so the test's index-based hook runtime keeps existing indices stable.

    Render via the existing `renderSlot` helper with `slotKey: 'request'`, `overlay: false`, `paused: hoveredRequest`, `waiting: waitingRequest`, icon `faRightToBracket` (sign-in glyph, add it to the free-solid import), title `shownRequest.title || t('steam.requestNotice.fallbackTitle', 'Steam')`, body `kind === 'install-not-started' ? t('steam.install.notStarted', "Steam didn't start the install. Make sure Steam is signed in, then try again.") : t('steam.uninstall.notStarted', "Steam didn't start the uninstall. Make sure Steam is signed in, then try again.")` — the existing keys, unchanged text. Only closed `kind` values map to strings (T-pvk-01). Put `{requestNode}` first in the returned fragment (top of the Steam group), keeping `{exitNode}{overlayNode}{engineNode}` order after it. Extend the component's header comment with a quick 261106-pvk line. No CSS change is needed (variant-A surface comes from NoticeStack; `--waiting` already exists).

    Test: in the component test add `let requestState: unknown = null` and `jest.mock('frontend/state/SteamRequestNotice', () => ({ useSteamRequestNotice: (sel) => sel({ latest: requestState }) }))`, reset `requestState = null` in `beforeEach`, then cover the behavior block using the file's existing `render`, `text`, `find`, `focusListeners`/`env` helpers and fake timers.

    i18n: add only `steam.requestNotice.fallbackTitle: "Steam"` to `public/locales/en/gamelib.json` (inside the existing `steam` object, alphabetical position). Run `pnpm i18n` and confirm it does not drop `steam.install.notStarted` / `steam.uninstall.notStarted` (now referenced from the frontend). Run `pnpm lint-translations:gamelib`; if it reports new en-only pairs, run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`, confirm with `git diff --stat meta/i18nCatalogPresenceBaseline.json` and a diff read that it adds only `steam.requestNotice.fallbackTitle` pairs, then re-run to exit 0. If the baseline did not need regenerating, leave it untouched.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/components/UI/SteamEngineLaunchNotice src/frontend/components/UI/NoticeStack && pnpm codecheck && npx eslint src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx && pnpm i18n && pnpm i18n-churn-guard && pnpm lint-translations:gamelib && for f in src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx public/locales/en/gamelib.json meta/i18nCatalogPresenceBaseline.json; do npx prettier --file-info "$f"; done && npx prettier --check src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx</automated>
    `public/locales/en/gamelib.json` is prettier-ignored (`"ignored": true`), so it is deliberately NOT in the `--check` list. If `meta/i18nCatalogPresenceBaseline.json` was rewritten and `--file-info` reports `"ignored": false`, append it to the `--check` list; if it was not touched, drop it from both lists.
  </verify>
  <done>The give-up notice renders as a variant-A toast in the one NoticeStack region with the existing key text, frozen until GameLib is in front, once per seq; existing notice tests pass; i18n gates exit 0; scoped prettier check passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> renderer push | `steamRequestNotice` payload crosses the IPC boundary into the renderer store |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pvk-01 | Tampering | handleSteamRequestNoticeSignal / request slot | mitigate | Validate appId `/^[0-9]{1,10}$/`, closed `kind` union, numeric seq; the body is always a catalogue string chosen by `kind`, never payload text. `title` renders as a React text node (no HTML injection). |
| T-pvk-02 | Repudiation | dispatch.kill delegated gate | mitigate | The gate is `runner === 'steam' && isDelegatedInstallPolling(appName)` only; `cancelDelegatedInstall` keeps its existing logInfo line, so a delegated Cancel is still logged, just not as a false ERROR. PVK-6 pins that other runners still abort. |
| T-pvk-03 | Denial of service | sidecar exit contract | accept | No new backend timer/handle; the give-up is tick-counted in the existing unref'd poll interval. |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/gamedetails src/backend/downloadmanager src/backend/utils/aborthandler src/frontend/state src/frontend/components/UI/SteamEngineLaunchNotice src/frontend/components/UI/NoticeStack` passes.
- `grep -n "steamRequestNotice" src/backend/storeManagers/steam/library.ts` shows exactly two `sendFrontendMessage` sites; neither give-up branch contains `notify(`.
- `pnpm codecheck` clean.
- The todo file is unchanged and still in `.planning/todos/pending/` (`git status` shows no change to it).
</verification>

<success_criteria>
- Install and uninstall no-activity give-ups surface in the in-app bottom-right stack, not via notify().
- A delegated-install Cancel logs no `Aborting not possible` ERROR; every other cancel path is unchanged.
- No new toast component, no new positioned element, no backend timer.
- Live check (signed-out Mac Steam, `pnpm tauri:dev`, GameLib on the same monitor) is still owed and recorded in the SUMMARY as owed; the todo keeps its current frontmatter.
</success_criteria>

<output>
Create `.planning/quick/261106-pvk-steam-delegated-give-up-notice-in-app-to/261106-pvk-SUMMARY.md` when done.
</output>
