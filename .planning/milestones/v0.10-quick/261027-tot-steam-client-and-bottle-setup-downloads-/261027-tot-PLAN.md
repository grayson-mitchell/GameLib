---
phase: quick-261027-tot
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types/steam.ts
  - src/common/types/ipc.ts
  - src/preload/api/steam.ts
  - src/backend/storeManagers/steam/setupDownloads.ts
  - src/backend/storeManagers/steam/__tests__/setupDownloads.test.ts
  - src/backend/storeManagers/steam/clientSetup.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts (only if a mock needs adjusting)
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts (only if a mock needs adjusting)
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/state/SteamSetupDownloads.ts
  - src/frontend/screens/DownloadManager/components/SetupDownloadItem/setupModel.ts
  - src/frontend/screens/DownloadManager/components/SetupDownloadItem/__tests__/setupModel.test.ts
  - src/frontend/screens/DownloadManager/components/SetupDownloadItem/index.tsx
  - src/frontend/screens/DownloadManager/components/SetupDownloadItem/index.css
  - src/frontend/screens/DownloadManager/index.tsx
  - src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts
  - public/locales/en/gamelib.json
  - public/locales/*/gamelib.json (48 non-en)
  - public/locales/*/gamelib.mt.json (48)
  - .planning/quick/261027-tot-steam-client-and-bottle-setup-downloads-/261027-tot-i18n-fill.json
  - .planning/todos/completed/2026-10-22-steam-client-setup-downloads-not-shown-in-downloads-progress.md
autonomous: true
requirements: [TODO-2026-10-22-steam-setup-downloads]

must_haves:
  truths:
    - "While guided native Steam-client setup downloads steam.dmg / SteamSetup.exe, the Downloads view shows a 'Setup' section row labelled 'Steam client installer' with bytes downloaded and a percent bar"
    - "While Steam-bottle provisioning downloads SteamSetup.exe, the Downloads view shows a row labelled 'Steam for CrossOver' with bytes downloaded and a percent bar"
    - "The setup row disappears when the payload download finishes or fails; it is never written to the Completed list"
    - "An install diverted to guided setup (bottle not provisioned, OR Steam client not installed / never launched) is not recorded in the download manager's finished list and raises no 'Installation Failed' dialog"
    - "The three new strings exist in en and all 48 non-en gamelib catalogs; the presence baseline is unchanged"
  artifacts:
    - path: "src/backend/storeManagers/steam/setupDownloads.ts"
      provides: "downloadSetupPayload(kind, {url, dest}) — wraps backend/utils downloadFile and emits steamSetupDownloadProgress"
      exports: ["downloadSetupPayload"]
    - path: "src/frontend/state/SteamSetupDownloads.ts"
      provides: "zustand store of in-flight setup downloads fed by handleSteamSetupDownloadProgress"
    - path: "src/frontend/screens/DownloadManager/components/SetupDownloadItem/index.tsx"
      provides: "one setup-download row (label, bytes, percent bar)"
  key_links:
    - from: "src/backend/storeManagers/steam/clientSetup.ts"
      to: "downloadSetupPayload('steam-client'"
      via: "replaces the bare downloadFile call in startGuidedClientInstall"
      pattern: "downloadSetupPayload\\('steam-client'"
    - from: "src/backend/storeManagers/steam/bottle.ts"
      to: "downloadSetupPayload('steam-bottle'"
      via: "replaces the bare downloadFile call in provisionBottle step (5)"
      pattern: "downloadSetupPayload\\('steam-bottle'"
    - from: "src/preload/api/steam.ts"
      to: "steamSetupDownloadProgress"
      via: "frontendListenerSlot export handleSteamSetupDownloadProgress (without it the push arrives at nobody — see the 'highest-risk omission' comment in that file)"
      pattern: "frontendListenerSlot\\('steamSetupDownloadProgress'\\)"
    - from: "src/frontend/screens/DownloadManager/index.tsx"
      to: "SetupDownloadItem"
      via: "renders a dmSection when the store holds >=1 running setup download"
      pattern: "SetupDownloadItem"
---

<objective>
Action the pending todo `.planning/todos/pending/2026-10-22-steam-client-setup-downloads-not-shown-in-downloads-progress.md`:
first-run Steam setup payload downloads become visible in the Downloads view, and an install
diverted to guided setup is never recorded as `finished`. Close the todo.

Purpose: on a fresh machine the app looks idle in Downloads while a large Valve installer fetch runs.
Output: a setup-download progress push + frontend row, the client-not-ready deferral, 3 localised
strings in 49 catalogs, the todo moved to `completed/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-10-22-steam-client-setup-downloads-not-shown-in-downloads-progress.md

Load `Skill("gamelib-conventions")` before writing any `<verify>` (prettier rule) and before touching
the sidecar (exit contract). You are in the git worktree
`/Users/graysonmitchell/Projects/GameLib/.claude/worktrees/quick-261027-tot` (branch quick/261027-tot).
Run every command there. Never touch the main checkout: another session is executing Phase 54 there.

## Facts measured at plan time (2026-10-27, HEAD 061c9bd38)

**How the Downloads view gets rows today.** `src/frontend/screens/DownloadManager/index.tsx` builds
its rows only from the DM queue: `getDMQueueInformation()` plus the `changedDMQueueInformation` push
(`DMQueueElement[]`). The hero (`components/DownloadHero`) gets byte progress per game from
`hasProgress(appName, runner)`, which reads the zustand store in `src/frontend/state/InstallProgress.ts`.
That store is fed by the `progressUpdate` push keyed `${appName}_${runner}`. Every row resolves
`getGameInfo(appName, runner)` and library art. A setup payload has no queue element, no GameInfo and
no runner game. The one queue precedent for non-game work (`gog-redist`, `gog/redist.ts`,
`downloadqueue.ts:409`) needs a fake library entry and a `getGame().install()` special case. That is
too heavy here, and it would put setup through the queue's pause, resume and stall-watchdog semantics,
which it does not support.

**Chosen design (smallest; no parallel queue).** Add one push channel, `steamSetupDownloadProgress`,
plus a small zustand store that mirrors `InstallProgress.ts`. The Downloads page renders a "Setup"
section with the same `dmSection` markup it already uses for "Up Next" and "Completed". It only
appears while a setup payload is downloading. Setup work stays out of the queue and the finished
list. Push channels need no sidecar/Rust registration
(`src/backend/sidecar/downloadQueueFlowRegistration.ts:48-58`; `electronStub.pushFrontendMessage` is
channel-agnostic). They need only the `FrontendMessages` type entry in `src/common/types/ipc.ts`
(`steamBottleSetupRequired` is at :767) and a `frontendListenerSlot` export in
`src/preload/api/steam.ts`.

**The two payload downloads (the only `downloadFile` calls in steam/):**
- `clientSetup.ts:205` `startGuidedClientInstall()`: `downloadFile({ url: installerUrl, dest: destPath })`. The URL is steam.dmg on macOS and SteamSetup.exe on Windows. Linux opens a link and downloads nothing. The call sits behind `if (!existsSync(destPath))`, so a cached installer downloads nothing and correctly shows no row.
- `bottle.ts:919` `provisionBottle()` step (5): `downloadFile({ url: STEAM_SETUP_EXE_URL, dest: steamSetupExePath })`, behind the same existsSync cache guard. CrossOver itself is never downloaded by the app; the user installs it from the codeweavers link. So the CrossOver-labelled row is "Steam for CrossOver", the Steam payload going into the CrossOver bottle.
- `downloadFile` (`src/backend/utils.ts:1621`) accepts `progressCallback(bytes, speed, percentage, writingSpeed)` and already throttles it to 1/s. It does not report total size, so the row shows bytes downloaded plus percent. Do not modify `downloadFile`.

**Goal (2) status: half already fixed.** Quick 261024-cjq (`0194f89ad`, 2026-10-24) made the
bottle-not-provisioned diversion (`games.ts:1311-1323`) return `{ status: 'done', deferredToSetup: true }`.
`downloadqueue.ts:171-175` now skips `addToFinished` for it, and `processNotification` logs
"deferred to setup". The todo's 2026-10-22 log predates that fix. **Still open:**
`runNativeDepotDownload` (`games.ts:2116`, gate at ~2131-2147) handles `ensureSteamClientReady()`
returning `ready: false` (status `needs-install` or `needs-launch`, with `steamClientSetupRequired`
already emitted) by returning `{ status: 'error', error: 'Steam client not ready…' }`. The queue then
records that diverted install as finished with status error, and `installQueueElement`
(`downloadmanager/utils.ts:258-260`) raises an error dialog over the guided-setup consent UI.
`ensureSteamClientReady` also returns `needs-install` WITH an `error` string for a non-numeric appId
(T-21-05). That case is a real error and must stay one.

**Callers that treat `status === 'done'` as success** and therefore must pass a deferred result
through untouched, before any success-only side effect:
- the bottle-native branch (`games.ts:~1344` `installBottleNative` → `markForcedWindowsViaBottle`)
- `installBridgeGame` (`games.ts:~1664-1672`, `downloadResult.status !== 'done'` → `markBridgeFailedThisSession`, then shim placement)
- any other `installDepotDownload(` call site (`games.ts:1518`, `:1560`)
Grep `installDepotDownload(` and `installBottleNative(` to enumerate them. Do not rely on these line numbers alone.

**i18n gates.** `public/locales/en/gamelib.json` uses 4-space indent with sorted keys; `downloadManager`
is at :71. Adding en keys without filling all 48 non-en catalogs turns `pnpm lint-translations:gamelib`
red. The completed todo `2026-10-26-localise-cancel-download-dialog-keys.md` forbids hiding the gap by
regenerating `meta/i18nCatalogPresenceBaseline.json`. Follow the fill-record procedure of quick
261027-thn (`.planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-PLAN.md`
Task 2, and `261027-thn-i18n-fill.json` for the record's shape). `meta/i18nGlossary.json` pins
`Steam` and `CrossOver` as do-not-translate.

**Prettier visibility (re-check with `npx prettier --file-info` before relying on it):** `src/**` is
seen. `public/locales/**` and `.planning/**` are ignored.

**Jest has no displayName per project.** Select suites by path. The frontend project has no jsdom
(`downloadManagerLayout.test.ts` header), so React rendering is not unit-testable here. Pure logic
lives in a `*Model.ts` file, mirroring `components/DownloadHero/heroModel.ts`, and layout uses
source-text gates.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend: setup-download progress push, wired into both payload fetches; client-not-ready installs are deferred, not failed</name>
  <files>src/common/types/steam.ts, src/common/types/ipc.ts, src/preload/api/steam.ts, src/backend/storeManagers/steam/setupDownloads.ts, src/backend/storeManagers/steam/__tests__/setupDownloads.test.ts, src/backend/storeManagers/steam/clientSetup.ts, src/backend/storeManagers/steam/bottle.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts (+ clientSetup.test.ts / bottle.test.ts only if a mock must change)</files>
  <read_first>
    - src/backend/storeManagers/steam/clientSetup.ts (whole file, 245 lines)
    - src/backend/storeManagers/steam/bottle.ts lines 905-935 only
    - src/backend/storeManagers/steam/games.ts lines 2116-2150 plus every `installDepotDownload(` / `installBottleNative(` call site (grep)
    - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts lines 1-100 (mock layout)
    - src/backend/storeManagers/steam/__tests__/games.test.ts around 3960-4010 (opt-in ON non-bottle install test, the model for the new deferral tests)
  </read_first>
  <behavior>
    - setupDownloads: downloadSetupPayload('steam-client', {url, dest}) emits {kind:'steam-client', state:'running', bytes:0, percent:0} first. Each progressCallback(bytes,_,percentage) emits {state:'running', bytes, percent: percentage}. It emits {state:'done', bytes: lastBytes, percent:100} once on resolve.
    - setupDownloads: when downloadFile rejects, it emits {state:'error', ...} once and rethrows the SAME error, so callers' existing catch/return-error paths are unchanged.
    - setupDownloads: url and dest are never in the emitted payload.
    - games: ensureSteamClientReady → {status:'needs-install', ready:false} (no error) makes install() resolve {status:'done', deferredToSetup:true}, and downloadSteamDepots is not called. Same for 'needs-launch'.
    - games: ensureSteamClientReady → {status:'needs-install', ready:false, error:'Invalid appId…'} still resolves {status:'error'} (T-21-05 unchanged).
    - games: a deferred result on the bridge route does NOT call markBridgeFailedThisSession or resolveBridgeLaunchExe. On the bottle-native route it does NOT call markForcedWindowsViaBottle. Write one test per route that the existing harness can reach. If a route's harness cannot reach it cheaply, say so in the SUMMARY rather than skipping silently.
  </behavior>
  <action>
1. Types. In `src/common/types/steam.ts` export `SteamSetupDownloadKind = 'steam-client' | 'steam-bottle'` and `SteamSetupDownloadProgress { kind: SteamSetupDownloadKind; state: 'running' | 'done' | 'error'; bytes: number; percent: number }`. In `src/common/types/ipc.ts` `FrontendMessages`, next to `steamBottleSetupRequired`, add `steamSetupDownloadProgress: (payload: SteamSetupDownloadProgress) => void`, with a one-line comment naming this quick task. In `src/preload/api/steam.ts` add `export const handleSteamSetupDownloadProgress = frontendListenerSlot('steamSetupDownloadProgress')`. The comment should say it is a one-way push and that omitting it fails silently (cite the existing 'highest-risk omission' note).

2. Write `__tests__/setupDownloads.test.ts` first (RED). Mock `backend/utils` (`downloadFile: jest.fn()`, capture `progressCallback`), `../../../ipc` (`sendFrontendMessage`) and `backend/logger`, the same way clientSetup.test.ts does. Then create `src/backend/storeManagers/steam/setupDownloads.ts` exporting `async function downloadSetupPayload(kind: SteamSetupDownloadKind, opts: { url: string; dest: string }): Promise<void>`. It calls `downloadFile({ url, dest, progressCallback })` from `backend/utils` and emits through `sendFrontendMessage('steamSetupDownloadProgress', …)` per the behavior list. `downloadFile` already throttles to 1/s, so add no timer or throttle of your own. That keeps the sidecar exit contract trivially intact: no new handle, and the in-flight work is user-consented, not boot-time. Round `percent` to an integer and clamp it to 0..100.

3. Wire. In `clientSetup.ts` replace `await downloadFile({ url: installerUrl, dest: destPath })` with `await downloadSetupPayload('steam-client', { url: installerUrl, dest: destPath })`. Drop `downloadFile` from that file's `backend/utils` import if it becomes unused. In `bottle.ts` step (5) replace the `downloadFile` call with `downloadSetupPayload('steam-bottle', { url: STEAM_SETUP_EXE_URL, dest: steamSetupExePath })`. Keep the existsSync cache guards and the existing catch blocks byte-for-byte. clientSetup.test.ts and bottle.test.ts mock `backend/utils`, so `downloadFile` stays mocked through the new module. bottle.test.ts does not mock ipc. If the real `backend/ipc` import breaks or pollutes that suite, add `jest.mock('../setupDownloads', …)` that delegates to the mocked downloadFile, or mock `../../../ipc`. Choose the narrower option and state which in the SUMMARY. Existing assertions on `mockedDownloadFile` (called / not called / with url+dest) must keep passing; use `expect.objectContaining` only where the new `progressCallback` key breaks an exact-args match.

4. Deferral (RED tests in games.test.ts first). In `runNativeDepotDownload`, where `!clientReady.ready` returns the status `error`, branch first. When `clientReady.error` is undefined and `clientReady.status` is `needs-install` or `needs-launch`, log at info: `SteamGame: appId X Steam client not ready (<status>) — guided setup requested, deferring install`. Then return `{ status: 'done', deferredToSetup: true }`. `ensureSteamClientReady` already sent `steamClientSetupRequired`, so do not send it again. Every other `!ready` case keeps the existing error return. Then, at each caller that treats `status === 'done'` as success (enumerate them by grep, per the context facts), return a result carrying `deferredToSetup: true` unchanged before any success-only side effect. In `installBridgeGame` this means before the `status !== 'done'` check and the shim placement, and the bridge is NOT marked failed: a missing Steam client is a precondition, the same reasoning 261024-cjq applied to missing CrossOver. `downloadqueue.ts` and `downloadmanager/utils.ts` already handle `deferredToSetup`. Do not edit them.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/.claude/worktrees/quick-261027-tot && pnpm jest src/backend/storeManagers/steam/__tests__/setupDownloads.test.ts src/backend/storeManagers/steam/__tests__/clientSetup.test.ts src/backend/storeManagers/steam/__tests__/bottle.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/downloadmanager src/preload --silent && pnpm codecheck && test "$(grep -v '^\s*//' src/backend/storeManagers/steam/clientSetup.ts src/backend/storeManagers/steam/bottle.ts | grep -c 'downloadFile({')" = 0 && echo T1-OK</automated>
    Formatter: run `npx prettier --file-info` on each written `src/` path and confirm `"ignored": false`. Then `npx prettier --check src/common/types/steam.ts src/common/types/ipc.ts src/preload/api/steam.ts src/backend/storeManagers/steam/setupDownloads.ts src/backend/storeManagers/steam/__tests__/setupDownloads.test.ts src/backend/storeManagers/steam/clientSetup.ts src/backend/storeManagers/steam/bottle.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts`, plus any test file you edited. Note that `src/preload/.prettierrc` sets printWidth 120 for steam.ts, so scope to that path and do not reformat it under root rules. Also `npx eslint` over the same paths.
  </verify>
  <done>New suite green; clientSetup/bottle/games/downloadmanager/preload suites green; codecheck clean; no bare `downloadFile({` remains in clientSetup.ts or bottle.ts; a client-not-ready install resolves `{status:'done', deferredToSetup:true}` with no bridge-failure or forced-bottle side effect; an invalid appId still errors. Commit with explicit paths: `feat(quick-261027-tot): setup-download progress push; client-not-ready installs defer instead of failing`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Frontend: "Setup" section with a byte-progress row per in-flight setup download, plus en strings</name>
  <files>src/frontend/screens/DownloadManager/components/SetupDownloadItem/setupModel.ts, src/frontend/screens/DownloadManager/components/SetupDownloadItem/__tests__/setupModel.test.ts, src/frontend/state/SteamSetupDownloads.ts, src/frontend/screens/DownloadManager/components/SetupDownloadItem/index.tsx, src/frontend/screens/DownloadManager/components/SetupDownloadItem/index.css, src/frontend/screens/DownloadManager/index.tsx, src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts, public/locales/en/gamelib.json</files>
  <read_first>
    - src/frontend/state/InstallProgress.ts (store pattern: module-load window.api subscription)
    - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts and its __tests__ (pure-model pattern)
    - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx lines 60-75 (bar markup: role=progressbar, aria-value*)
    - src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts (whole file: its gates bind the page and component sources)
    - src/frontend/screens/DownloadManager/index.css (dmSection classes and tokens)
  </read_first>
  <behavior>
    - applySetupDownloadEvent({}, {kind:'steam-client', state:'running', bytes:5, percent:10}) → has key 'steam-client' with that payload.
    - A running event for an existing kind replaces it. A 'done' or 'error' event deletes that kind. A 'done' event for an absent kind is a no-op that returns an equal map.
    - setupRowsInOrder(map) returns only 'running' rows, with 'steam-client' before 'steam-bottle'.
    - Layout gate: index.tsx renders `<SetupDownloadItem` inside a `dmSection`. SetupDownloadItem/index.tsx and index.css do not match SECOND_BAR_PATTERN (`LinearProgress|downloadBar`). index.css does not match DIVIDER_TOKEN_PATTERN.
  </behavior>
  <action>
1. RED, then GREEN. `setupModel.ts` is pure, with no React and no window. It exports `type SetupDownloadMap = Partial<Record<SteamSetupDownloadKind, SteamSetupDownloadProgress>>`, `applySetupDownloadEvent(map, payload): SetupDownloadMap` (returns a new object) and `setupRowsInOrder(map): SteamSetupDownloadProgress[]`. Test it in `__tests__/setupModel.test.ts` per the behavior list.

2. `src/frontend/state/SteamSetupDownloads.ts` mirrors `InstallProgress.ts`. It is a zustand `create<SetupDownloadMap>()(() => ({}))` store, subscribed at module load with `window.api.handleSteamSetupDownloadProgress((e, payload) => set(applySetupDownloadEvent(get(), payload), true))`. It exports `useSteamSetupDownloads()` returning `setupRowsInOrder(...)` via `useShallow`. Accepted limitation, stated in the SUMMARY: rows exist only for pushes received after this module loaded. `downloadFile` re-emits every second while running, so a late-mounted view fills in within about 1s.

3. `SetupDownloadItem/index.tsx` takes `{ row: SteamSetupDownloadProgress }`. Render the label with literal `t()` calls, never a computed key, because the i18next parser cannot extract dynamic keys: kind `steam-client` → `tGamelib('gamelib:downloadManager.setup.steamClient', 'Steam client installer')`, kind `steam-bottle` → `tGamelib('gamelib:downloadManager.setup.steamBottle', 'Steam for CrossOver')`. Then render the progress text `${size(row.bytes)} · ${row.percent}%`, with `size` from `frontend/helpers`. Then a bar that copies the hero's accessible shape: `role="progressbar"`, `aria-valuemin={0}`, `aria-valuemax={100}`, `aria-valuenow={row.percent}`, and `aria-label` set to the row label. Use new classes `setupDownloadItem`, `setupDownloadItem__bar` and `setupDownloadItem__barFill`, never `downloadBar`. In `index.css` style them with the same theme tokens `DownloadHero/index.css` uses for its bar. Do not use `var(--divider` and do not use url() art.

4. In `DownloadManager/index.tsx`, `const setupRows = useSteamSetupDownloads()`. Directly after `<DownloadHero …/>` and before the Up Next section, render `{setupRows.length > 0 && <section className="dmSection">…}`. The header is `tGamelib('gamelib:downloadManager.setup.title', 'Setup')` with the same `dmSection__count` span. The list is `dmSection__list` containing `<SetupDownloadItem key={row.kind} row={row} />`. Do not touch the queue/finished logic; setup rows never enter `finishedElem`. Extend `downloadManagerLayout.test.ts` with the gates in the behavior list, each with the file's SANITY-counter-test convention where the existing gates have one.

5. en strings. Add `downloadManager.setup.{steamBottle,steamClient,title}` to `public/locales/en/gamelib.json` in sorted position, 4-space indent, with values exactly as the defaults above. Then run `pnpm i18n` and `pnpm i18n-churn-guard`. The en gamelib.json diff must be exactly those 3 keys; revert any other parser churn with `git checkout -- <path>` for paths outside your 3 keys. Do NOT touch `meta/i18nCatalogPresenceBaseline.json`. Task 3 fills the 48 locales, so `lint-translations:gamelib` is expected red between these two tasks. Do not commit Task 2 alone if your hook runs lint-translations; otherwise commit it now.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/.claude/worktrees/quick-261027-tot && pnpm jest src/frontend/screens/DownloadManager src/frontend/state --silent && pnpm codecheck && pnpm i18n-churn-guard && node -e "const g=require('./public/locales/en/gamelib.json').downloadManager.setup;if(g.title!=='Setup'||g.steamClient!=='Steam client installer'||g.steamBottle!=='Steam for CrossOver'||Object.keys(g).length!==3)process.exit(1)" && git diff --quiet -- meta/i18nCatalogPresenceBaseline.json && echo T2-OK</automated>
    Formatter: `npx prettier --file-info` on each written path. `public/locales/en/gamelib.json` is expected `"ignored": true`; leave it out of the check and say so. Then `npx prettier --check` over the 7 written `src/` paths, and `npx eslint` over the .ts/.tsx ones.
    Operator live gate (the executor CANNOT run this; record it in the SUMMARY as pending, not passed): on a Mac with no Steam.app and no `~/Library/Application Support/gamelib/steam/redist/steam.dmg` cached (or the equivalent `steamSupportPath/redist`), restart `pnpm tauri dev` (memory: dev does not rebuild the sidecar), press Install on a Steam title, consent to guided setup, open Downloads. Expect a "Setup" section with a "Steam client installer" row whose bytes and percent advance, and which disappears when the dmg opens. Expect no Completed entry and no "Installation Failed" toast for the title. Repeat for a bottle-eligible title on a Mac with CrossOver and no provisioned bottle: the row is labelled "Steam for CrossOver".
  </verify>
  <done>Model tests green; layout gates green, including the new ones; codecheck clean; churn guard green; en has exactly the 3 new keys; baseline untouched; the live gate is written down as an operator item.</done>
</task>

<task type="auto">
  <name>Task 3: Localise the 3 setup keys into 48 catalogs, close the todo, commit</name>
  <files>.planning/quick/261027-tot-steam-client-and-bottle-setup-downloads-/261027-tot-i18n-fill.json, public/locales/*/gamelib.json (48 non-en), public/locales/*/gamelib.mt.json (48), .planning/todos/completed/2026-10-22-steam-client-setup-downloads-not-shown-in-downloads-progress.md</files>
  <read_first>
    - .planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-PLAN.md Task 1 + Task 2 (fill-record authoring + apply procedure, validateTranslation use, sabotage control, mt.json listing)
    - .planning/quick/261027-thn-localise-the-7-downloadmanager-canceldia/261027-thn-i18n-fill.json first ~20 lines (shape)
    - meta/i18nGlossary.json (Steam and CrossOver are do-not-translate)
  </read_first>
  <action>
Author `261027-tot-i18n-fill.json` in the 261027-thn shape: `en` plus 48 locales × the 3 keys `downloadManager.setup.title`, `downloadManager.setup.steamClient` and `downloadManager.setup.steamBottle`, which is 144 pairs. Keep `Steam` and `CrossOver` literal in every locale (glossary). "Setup" means a first-run setup or installation step, not settings. Validate every pair with the real `validateTranslation()` and run one sabotage control, as 261027-thn did: a value that drops the pinned `Steam` term must be rejected. Apply the pairs to the 48 `gamelib.json` files and list the 3 keys in each `gamelib.mt.json`, following 261027-thn Task 2's procedure. The presence baseline must come out byte-identical to HEAD, because the keys never entered it.

Close the todo. `git mv` it to `.planning/todos/completed/` and append `## Closed 2026-10-27 (quick 261027-tot)` with these points. Setup payload downloads (steam-client, and steam-bottle labelled "Steam for CrossOver") now push `steamSetupDownloadProgress` and render in a Downloads "Setup" section with bytes and percent. The bottle-not-provisioned `finished` entry quoted in the todo was already fixed by 261024-cjq (`0194f89ad`, after the 2026-10-22 log). This task closed the remaining client-not-installed / never-launched diversion, which used to be recorded as a finished error. The visible row is still an operator live gate. Then commit Tasks 2 and 3 (and Task 1 if not yet committed) with explicit paths only, never `git add .`. The message ends with the Co-Authored-By attribution line.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/.claude/worktrees/quick-261027-tot && pnpm jest meta/__tests__/lintTranslations.test.ts meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts meta/__tests__/i18nGlossary.test.ts --silent && pnpm lint-translations:gamelib && pnpm i18n-churn-guard && pnpm planning-gates && git diff --quiet HEAD -- meta/i18nCatalogPresenceBaseline.json && test "$(grep -l '"steamBottle"' public/locales/*/gamelib.json | wc -l | tr -d ' ')" = 49 && test "$(grep -l 'downloadManager.setup.steamClient' public/locales/*/gamelib.mt.json | wc -l | tr -d ' ')" = 48 && test ! -e .planning/todos/pending/2026-10-22-steam-client-setup-downloads-not-shown-in-downloads-progress.md && grep -q 'Closed 2026-10-27 (quick 261027-tot)' .planning/todos/completed/2026-10-22-steam-client-setup-downloads-not-shown-in-downloads-progress.md && test -z "$(git status --porcelain -- public/locales meta src)" && echo T3-OK</automated>
    Formatter: confirm with `npx prettier --file-info` that `public/locales/de/gamelib.json`, `public/locales/de/gamelib.mt.json`, the fill record and the completed todo all report `"ignored": true`. If they do, omit the check and say so in the SUMMARY; check any that report `"ignored": false` with a scoped `npx prettier --check <path>`.
  </verify>
  <done>144/144 pairs validated, the sabotage control was rejected, and the 48 catalogs plus 48 mt manifests carry the keys. The lint-translations:gamelib, churn-guard, glossary, parity and planning-gates checks are green, and the baseline is unchanged. The todo is in completed/ with its Closed section. Everything is committed with explicit paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CDN → sidecar | Valve installer bytes fetched over HTTPS (unchanged URLs) |
| sidecar → renderer | new one-way `steamSetupDownloadProgress` push |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tot-01 | Tampering | clientSetup.ts / bottle.ts payload URLs | mitigate | URLs and the HTTPS-only constants (T-21-20, T-17-02) are passed through unchanged; downloadSetupPayload takes the url from the caller and adds no URL logic |
| T-tot-02 | Information disclosure | steamSetupDownloadProgress payload | mitigate | payload is {kind,state,bytes,percent} only; url/dest/home paths are never emitted (asserted in setupDownloads.test.ts) |
| T-tot-03 | Denial of service | sidecar exit contract | accept | no timer/watcher/socket is created; progress rides downloadFile's existing 1s throttle; the fetch is user-consented, not boot-time |
| T-tot-04 | Repudiation | diverted installs | mitigate | client-not-ready diversion logs an explicit "deferring install" line and no longer writes a misleading finished-error entry |
</threat_model>

<verification>
- Task 1, 2 and 3 automated blocks all print their OK token.
- `git log --oneline -3` shows the quick-261027-tot commits on branch quick/261027-tot only.
- Operator live gate (Task 2) recorded as pending in the SUMMARY.
</verification>

<success_criteria>
- Setup payload downloads emit progress, and the Downloads view renders them as labelled rows with bytes and percent.
- Diverted installs (bottle or client not ready) never reach the finished list or the failure dialog.
- 3 strings × 49 catalogs, baseline unchanged, i18n gates green.
- Todo moved to completed with a Closed section.
</success_criteria>

<output>
Create `.planning/quick/261027-tot-steam-client-and-bottle-setup-downloads-/261027-tot-SUMMARY.md` when done.
</output>
