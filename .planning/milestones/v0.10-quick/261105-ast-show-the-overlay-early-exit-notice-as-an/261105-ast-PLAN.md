---
phase: quick-261105-ast
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types/steam.ts
  - src/backend/storeManagers/steam/engine/engineState.ts
  - src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - public/locales/en/gamelib.json
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
autonomous: true
requirements: [QUICK-261105-ast]

must_haves:
  truths:
    - "A bridge launch with the overlay on whose game exits abnormally within 30 s shows an in-app toast (title 'Game closed soon after starting') in the SteamEngineLaunchNotice stack, not a native/in-app modal dialog"
    - "The toast body reads exactly: The game exited within 30 seconds with the Steam overlay on. If this is a crash and keeps happening, try turning the overlay off in this game's settings: Run > Steam overlay."
    - "The toast has an icon, title/body split, x dismiss and the 8 s auto-hide; its countdown starts only once GameLib is visible and focused"
    - "Detection logic, the logWarning [bridge-notice] line and the D-10 never-retries/never-changes-settings guarantee are unchanged; normal exits still show nothing"
    - "A page re-fetch never re-shows a dismissed exit toast; a newer exit (higher seq) does"
  artifacts:
    - path: "src/common/types/steam.ts"
      provides: "SteamEngineState.exitNotice field"
      contains: "exitNotice?:"
    - path: "src/backend/storeManagers/steam/engine/engineState.ts"
      provides: "publishOverlayExitNotice(appId) exported publisher"
      exports: ["publishOverlayExitNotice"]
    - path: "src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx"
      provides: "exit-notice slot rendered in the toast region"
      contains: "exitNotice"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts (maybeReportOverlayAbnormalExit)"
      to: "publishOverlayExitNotice"
      via: "direct call replacing showEngineDialog"
      pattern: "publishOverlayExitNotice\\(this\\.appId\\)"
    - from: "src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx"
      to: "state.exitNotice"
      via: "useSteamEngineState byAppId scan by seq"
      pattern: "\\.exitNotice"
---

<objective>
Move the Steam overlay early-exit notice ("Game closed soon after starting") from the
showEngineDialog modal into the in-app toast stack (SteamEngineLaunchNotice), and change the en
body to the operator's wording.

Purpose: the modal raises the main window and blocks; every other launch-time notice (engine
fallback, overlay unavailable) is already a non-blocking toast fed by the steamEngineStateChanged
push. This one should match.
Output: new `exitNotice` field + publisher on the backend, a third toast slot on the frontend,
updated en string and tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261104-vvz-build-the-toast-from-sketch-006/261104-vvz-SUMMARY.md

Load `Skill("gamelib-conventions")` before writing any `<verify>`-equivalent check (prettier rule).

<interfaces>
From src/common/types/steam.ts (~L276), inside `interface SteamEngineState`:
  launchNotice?: { reason: 'cx-missing' | 'cx-expired' | 'cx-broken'; seq: number } | null
  overlayNotice?: { step: 'steam-dylibs' | 'shim' | 'crossover-detect' | 'clone' | 'resign' | 'env'; seq: number } | null

From src/backend/storeManagers/steam/engine/engineState.ts:
  let launchNoticeSeq = 0            // L54, shared counter, reset at L71
  compute(...) returns {..., launchNotice, overlayNotice: null }   // ~L233
  const lastPublished: Map<appId, SteamEngineState>
  export function publishOverlayNotice(appId: string, step: OverlayStep): boolean
    // ~L371: rejects non-/^\d+$/ appId and unknown step, returns false with no base state,
    // publishes { ...base, overlayNotice: { step, seq: ++launchNoticeSeq } } inside try/catch
    // (logError + return false on throw). Does NOT update lastPublished.

From src/backend/storeManagers/steam/games.ts:
  L167 import { publishOverlayNotice } from './engine/engineState'
  L4225 private showEngineDialog(title, body, tag): notify() + app.raiseMainWindow() +
        showDialogBoxModalAuto + [engine-notice] ack logs. Other callers (L4290-4561) stay.
  ~L4771 private notifyOverlaySetupFailed(step, cause): logWarning, publishOverlayNotice,
        logInfo `SteamGame: appId ${id} overlay notice surface=in-app pushed=${pushed}`, notify({...})
        -- this is the pattern to copy.
  ~L5927 maybeReportOverlayAbnormalExit -> after logWarning(formatOverlayExitNoticeLine(...)),
        calls this.showEngineDialog(t('gamelib:steam.overlay.exit.title', ...),
        t('gamelib:steam.overlay.exit.body', ...), 'overlay-exit-abnormal').

From src/backend/storeManagers/steam/__tests__/games.test.ts:
  L648 jest.mock('../engine/engineState', () => ({ recordLaunchDecision: jest.fn(), publishOverlayNotice: jest.fn() }))
  ~L14575 exitNotices(id) counts logWarning lines `appId=${id} reason=overlay-exit-abnormal`
  ~L14728 'D-10: game gone at 12 s with code 1 shows one notice and the toggle pointer' asserts
        showDialogBoxModalAuto called once with message 'gamelib:steam.overlay.exit.body'.

Frontend component (src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx) already has two
independent streams (engine `shown`/`lastSeq`, overlay `shownOverlay`/`lastOverlaySeq`), each with
its own pending ref, finish fn, hover state, remaining-budget ref, pausable auto-hide effect and
PHASE_FALLBACK_MS effect, and a shared non-hook `renderSlot({...})`. The overlay stream also has a
`waiting` latch (gameLibInFront(): visibilityState visible && hasFocus) that holds the countdown.
The test file uses a hand-rolled hook runtime (no jsdom) and an i18n mock returning defaultValue.

The 'overlay-exit-abnormal' string also appears in overlayNotice.ts formatOverlayExitNoticeLine and
its test -- that is the log line, which stays. Nothing else depends on the dialog tag.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend -- exitNotice field, publishOverlayExitNotice, swap the dialog for the push, new en body</name>
  <files>src/common/types/steam.ts, src/backend/storeManagers/steam/engine/engineState.ts, src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, public/locales/en/gamelib.json</files>
  <behavior>
    - engineState: after recordLaunchDecision, publishOverlayExitNotice('3205720') returns true and publishes { ...lastState, exitNotice: { seq: N } } with N from the SAME shared launchNoticeSeq counter (strictly rising across launchNotice/overlayNotice/exitNotice); a second call gets a higher seq; launchNotice/overlayNotice of the base are carried unchanged.
    - engineState: returns false and publishes nothing for no base state or a non-numeric appId; recordLaunchDecision's pushed state carries exitNotice: null.
    - games.test D-10 12 s/code 1 case: exitNotices(id) has length 1, publishOverlayExitNotice called once with id, showDialogBoxModalAuto NOT called, runWineCommand still called once. Existing normal-exit cases (length 0) also assert publishOverlayExitNotice not called.
  </behavior>
  <action>
    1. src/common/types/steam.ts: add to SteamEngineState, after overlayNotice, `exitNotice?: { seq: number } | null` with a doc comment: set only on the push from publishOverlayExitNotice (quick 261105-ast); renderer shows once per seq; the game has already exited.
    2. engineState.ts: in compute's returned object add `exitNotice: null` next to `overlayNotice: null`. Add and export `publishOverlayExitNotice(appId: string): boolean` directly after publishOverlayNotice, mirroring it exactly (appId regex guard, lastPublished base lookup, `{ ...base, exitNotice: { seq: ++launchNoticeSeq } }`, try/catch with logError `SteamEngine: overlay exit notice publisher failed: ...`, do not write lastPublished). Doc comment: never retries, never changes settings (D-10).
    3. games.ts: import publishOverlayExitNotice alongside publishOverlayNotice (L167). In maybeReportOverlayAbnormalExit keep everything up to and including the logWarning line; replace the showEngineDialog call with: `const pushed = publishOverlayExitNotice(this.appId)`; logInfo `SteamGame: appId ${this.appId} overlay exit notice surface=in-app pushed=${pushed}` (LogPrefix.Steam); then `notify({ title, body })` with the same two i18next.t calls (keys gamelib:steam.overlay.exit.title / .body) so a packaged build with GameLib in the background still gets an OS notification, as notifyOverlaySetupFailed does. Do NOT call app.raiseMainWindow and do NOT open a dialog. Update the body defaultValue to exactly: The game exited within 30 seconds with the Steam overlay on. If this is a crash and keeps happening, try turning the overlay off in this game's settings: Run > Steam overlay. (keep "Run > Steam overlay"; the override lives on the Run tab since 45f24f66f). Update the comment above the call site if it mentions a dialog. Leave showEngineDialog and its other callers untouched.
    4. public/locales/en/gamelib.json L692: set steam.overlay.exit.body to the identical string. Title unchanged. Non-en catalogs do not carry steam.overlay.exit.* (recorded as missing in meta/i18nCatalogPresenceBaseline.json), so there are no stale translations to handle and the baseline must NOT be edited.
    5. Tests: in engineState.test.ts add a `describe('publishOverlayExitNotice (261105-ast)')` next to the G4 block covering the behaviors above, and extend the recordLaunchDecision assertion to expect exitNotice null where the G4 test checks overlayNotice null. In games.test.ts add `publishOverlayExitNotice: jest.fn()` to the L648 engineState mock and its import list (~L124), then update the D-10 cases per the behavior list (rename the 12 s test to say "shows one in-app toast").
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayNotice.test.ts && npx tsc --noEmit && npx prettier --check src/common/types/steam.ts src/backend/storeManagers/steam/engine/engineState.ts src/backend/storeManagers/steam/engine/__tests__/engineState.test.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts && test "$(grep -c "If this is a crash and keeps happening, try turning the overlay off in this game's settings: Run > Steam overlay." public/locales/en/gamelib.json)" = 1 && test "$(grep -c "overlay-exit-abnormal'" src/backend/storeManagers/steam/games.ts)" = 0</automated>
    (public/locales/en/gamelib.json is prettier-ignored per `npx prettier --file-info`, so it is checked by the grep, not prettier.)
  </verify>
  <done>Abnormal early exit publishes exitNotice through steamEngineStateChanged plus an OS notification; no dialog, no window raise; en body and backend defaultValue carry the new wording; listed tests, tsc and scoped prettier pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Frontend -- render the exit notice as a third toast slot</name>
  <files>src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx, src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx</files>
  <behavior>
    - A state with exitNotice { seq } shows a role=status toast whose title is 'Game closed soon after starting' and body is the new en string, with its own dismiss.
    - Same seq after dismissal (re-fetch) does not re-show; a higher seq does.
    - Stacks with overlay and engine notices, each independently dismissible.
    - Countdown waits until GameLib is visible+focused, then auto-hides after 8 s; hover pauses it; listeners and timers removed on unmount.
    - exitNotice with a non-number seq renders nothing.
  </behavior>
  <action>
    Add a third independent stream to SteamEngineLaunchNotice mirroring the overlay stream: lastExitSeq ref, shownExit state ({ seq, phase }), pendingExit/shownExitRef refs, hoveredExit, remainingExit, its own `waitingExit` latch (do NOT share the overlay `waiting` state -- the two notices arrive at different times), finishExit, the newest-by-seq effect scanning `state.exitNotice` (require typeof seq === 'number'), the focus/visibilitychange latch effect, the pausable auto-hide effect and the PHASE_FALLBACK_MS effect. Decision (discretion): apply the frozen-until-front gating -- the dialog used to raise the main window and the toast no longer does, so GameLib may still be behind when it arrives; gating guarantees the user sees the full 8 s. Include shownExit in useSuppressStoreEmbedWhile and in the early `return null` check. Render via renderSlot with slotKey 'exit', overlay: true (shares the overlay styling hook; no SCSS change needed), icon faTriangleExclamation from @fortawesome/free-solid-svg-icons, title t('steam.overlay.exit.title', 'Game closed soon after starting'), body t('steam.overlay.exit.body', <the exact new en string from Task 1>). Place exitNode first in the region (newest-arrival, post-game notice above overlay and engine). Update the component header comment to mention the third notice. Strings go only through t() with defaultValue so meta/__tests__/hardcodedStringGate.test.ts stays green. Extend the test file with a `describe('overlay exit notice (261105-ast)')` covering the behavior list, reusing the existing hook-runtime helpers (dismiss/exit/focus helpers already used by the G4 block).
  </action>
  <verify>
    <automated>npx jest src/frontend/components/UI/SteamEngineLaunchNotice meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/i18nParserConfig.test.ts meta/__tests__/genI18nGateScope.test.ts && npx tsc --noEmit && npx prettier --check src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx && pnpm lint</automated>
  </verify>
  <done>The exit notice renders as a dismissible, auto-hiding, focus-gated toast in the same stack with the new wording; component tests, hardcoded-string and i18n gates, tsc, lint and scoped prettier pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> renderer push | steamEngineStateChanged payload is rendered in the toast |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ast-01 | Tampering | exitNotice payload | mitigate | payload carries only a numeric seq; renderer requires typeof seq === 'number' and renders only catalogue strings, never payload text |
| T-ast-02 | Denial of Service | publishOverlayExitNotice | mitigate | appId regex guard, try/catch returning false; launch/exit path never throws because of the notice |
| T-ast-03 | Repudiation | exit notice delivery | accept | logWarning [bridge-notice] line plus logInfo pushed= line record each notice; no PII |
</threat_model>

<verification>
- Both task verify blocks green.
- `git diff --stat` touches only the files in files_modified.
- Commit with explicit paths only (`git add <each path>`); the working tree has unrelated dirty and untracked files that must not be staged.
</verification>

<success_criteria>
- No showDialogBoxModalAuto / raiseMainWindow on the overlay early-exit path.
- Toast shows the exact operator wording in en.
- meta/i18nCatalogPresenceBaseline.json unchanged.
</success_criteria>

<output>
Create `.planning/quick/261105-ast-show-the-overlay-early-exit-notice-as-an/261105-ast-SUMMARY.md` when done.
In the summary's operator notes (not a blocking task): live check needs a restarted `pnpm tauri:dev`
(tauri dev does not rebuild the sidecar; confirm sidecar.js mtime), then launch a bridged game with
the overlay on and quit it within 30 s; expect the toast, no dialog. `tauri dev` delivers no system
notification, so the OS-notification half is only observable in a packaged build.
</output>
