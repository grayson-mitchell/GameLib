---
phase: quick-261102-dma
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/preload/api/tauriWindowChrome.ts
  - src/preload/api/settings.ts
  - src/preload/api/misc.ts
  - src/frontend/state/GlobalState.tsx
  - src/preload/__tests__/framelessRuntime.test.ts
  - src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts
  - .planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md
autonomous: true
requirements: [TODO-2026-11-02-windows-controls-linger-after-frameless-off, REQ-34.1-03]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "On win32 and linux, switching Settings -> General -> Use frameless window OFF removes GameLib's own WindowControls from the tab bar straight away, with no restart, so only the native frame's buttons remain. Switching it back ON brings GameLib's set back."
    - "Every write of `framelessWindow` to the `default` app scope through the preload `setSetting` pushes the written boolean, synchronously, to every `window.api.handleFramelessChanged` subscriber. Other keys and game-scoped writes push nothing."
    - "GlobalState still seeds `isFrameless` once at mount from `window.api.isFrameless()`, and after that seed it follows every push, so the ContextProvider value that App.tsx's gate reads changes with the toggle."
    - "App.tsx is byte-unchanged. The macOS two-boolean gate keeps its exact shape: WindowControls never render on darwin in either state, and `macOverlayTitlebar` stays `isMac && isFrameless`, which now flips live with the toggle."
    - "A subscriber that throws cannot make `setSetting` throw and cannot stop the other subscribers from being called (setSetting stays total, WR-05)."
    - "The todo stays in pending/ with `severity: minor` / `platform: windows` / `ready: live-gate`. It records the cause, the fix commits, and the Windows live check, marked NOT yet run."
  artifacts:
    - path: "src/preload/api/tauriWindowChrome.ts"
      provides: "Frameless-change listener set: `tauriHandleFramelessChanged` (subscribe, returns unsubscribe) and `notifyFramelessChanged` (total, per-listener try/catch)"
      contains: "notifyFramelessChanged"
    - path: "src/preload/api/settings.ts"
      provides: "setSetting pushes the written boolean after applyFramelessDecorations, under the existing default/framelessWindow guard"
      contains: "notifyFramelessChanged(Boolean(value))"
    - path: "src/preload/api/misc.ts"
      provides: "`window.api.handleFramelessChanged` renderer surface"
      contains: "handleFramelessChanged"
    - path: "src/frontend/state/GlobalState.tsx"
      provides: "componentDidMount subscription that writes `isFrameless` from each push, after the mount-time seed"
      contains: "window.api.handleFramelessChanged("
    - path: "src/preload/__tests__/framelessRuntime.test.ts"
      provides: "F1-F7 behaviour tests of the push through the real setSetting"
      contains: "261102-dma"
    - path: "src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts"
      provides: "GlobalState wiring gate plus the App.tsx gate evaluated on win32/linux/darwin across the flip, with anti-vacuity self-tests"
      contains: "handleFramelessChanged"
  key_links:
    - from: "src/preload/api/settings.ts setSetting"
      to: "src/preload/api/tauriWindowChrome.ts notifyFramelessChanged"
      via: "called with Boolean(value) right after applyFramelessDecorations(Boolean(value)), inside the `appName === 'default' && key === 'framelessWindow'` guard"
      pattern: "notifyFramelessChanged\\(Boolean\\(value\\)\\)"
    - from: "src/preload/api/misc.ts handleFramelessChanged"
      to: "window.api (src/preload/api/index.ts spreads Misc; src/common/types/proxy-types.ts types it)"
      via: "export forwarding to tauriHandleFramelessChanged"
      pattern: "export const handleFramelessChanged"
    - from: "src/frontend/state/GlobalState.tsx componentDidMount"
      to: "src/frontend/App.tsx `showOverlayControls = isFrameless && !hasNativeOverlayControls && !isMac`"
      via: "this.setState({ isFrameless }) -> ContextProvider value `...this.state` -> useContext(ContextProvider) in Root"
      pattern: "handleFramelessChanged\\("
---

<objective>
Fix the Windows report of 2026-11-02 (todo
`.planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md`). Turning
"Use frameless window" off brings back the native Windows title bar, but GameLib's own
minimize/maximize/close buttons stay on the tab bar too, so the window shows two sets.

Confirmed cause (the planner read the code on 2026-11-02; this is the todo's suspected cause, now
confirmed):
- `src/frontend/App.tsx:84` renders `WindowControls` only when
  `showOverlayControls = isFrameless && !hasNativeOverlayControls && !isMac`. `isFrameless` comes
  from `useContext(ContextProvider)`. `WindowControls/index.tsx` has no frameless logic of its own.
- `src/frontend/state/GlobalState.tsx:1891-1894` is the ONLY write of `isFrameless` after the
  initial `false` (line 534). It runs once in `componentDidMount`
  (`isFrameless: await window.api.isFrameless()`). Nothing writes it again.
- The toggle (`UseFramelessWindow.tsx` -> `useSetting` -> `useSettingsContext.setSetting` ->
  `window.api.setSetting`) reaches `src/preload/api/settings.ts:17-23`. That function sends the IPC
  and calls `applyFramelessDecorations(Boolean(value))`, which redraws the native frame live
  (`setDecorations(!frameless)` on Windows/Linux). It tells React nothing.
- Re-querying `window.api.isFrameless()` after the toggle would not be enough on its own.
  `tauriIsFrameless` reads `snapshotGet('configStore', 'settings')`, and that snapshot is patched
  only when the sidecar's STORE_CHANGED push comes back (`tauriTransport.ts:184-196`). A re-read
  straight after `setSetting` races that round trip. The fix therefore pushes the written value
  directly, the same way `applyFramelessDecorations` already receives it.
- So both directions are broken today: OFF leaves GameLib's buttons next to the native ones (the
  report), and ON removes the native frame but shows no GameLib buttons until a restart. On a
  restart all three boot paths (the `tauriAttach.ts` pre-paint, the post-hydration re-apply in
  `index.tsx:179` and the GlobalState mount read) agree, which is why a restart clears it. On
  Linux the gate is the same (`!isMac`), so the same fix applies. On macOS the gate already hides
  WindowControls in both states, but the `frameless`/`macOverlayTitlebar` classes (the 78px
  traffic-light reserve) were stale in the same way, and now follow the toggle too.

The fix: add a frameless-change push in the preload, fire it from `setSetting` with the written
boolean, expose it as `window.api.handleFramelessChanged`, and subscribe to it in GlobalState after
the mount-time seed. App.tsx is not touched, so the macOS two-boolean gate and its comment block
stay exactly as they are (pinned by `appShellLayout.test.ts`'s "App.tsx D-06 reversal" describe).

Purpose: one set of window buttons, the right one, in both toggle directions, with no restart.
Output: the push channel and the GlobalState subscription, two test files (a preload behaviour test
and a frontend chain gate), and the todo re-triaged to `ready: live-gate` for the Windows live
check.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md
@src/preload/api/settings.ts
@src/preload/api/tauriWindowChrome.ts

Load `Skill("gamelib-conventions")` before Task 3 (todo triage frontmatter) and before writing any
`<verify>` run (the scoped `npx prettier --check`, with a `--file-info` probe for ignored paths).
`graphify-out/graph.json` exists: orient with `graphify query` before raw browsing, and never read
`graphify-out/GRAPH_REPORT.md` or `graph.json`. After Task 2, run `graphify update .` (not a gate).

CONCURRENCY (hard rule): another session has uncommitted work in
`src/backend/storeManagers/steam/games.ts`, its `__tests__/games.test.ts` and
`__tests__/macArchKnownFixRouting.test.ts`, plus untracked `.planning/debug/*`,
`.planning/milestone.lock` and `.planning/quick/261102-dkw-*/`. Stage ONLY the files this plan
writes, each by explicit path (`git add <path> <path>`). Never `git add -A`, `git add .`,
`git add -u`, `git commit -a`, `git stash` or `git checkout -- <file>` (the husky post-checkout
hook runs `pnpm install`; to revert a file use `git show HEAD:<path> > <path>`). The todo file is
currently UNTRACKED; Task 3's commit adds it.

WINDOWS-LOCAL JEST: about 40 suites fail on this box regardless of the change, and CI is
ubuntu-only. Run only the targeted suites named in each `<verify>`. One known Windows-only failure
lives inside `appShellLayout.test.ts` ("scroll-container migration, per file: ...GamesList...",
a backslash-path artefact), so that file is run with `-t "D-06 reversal"`, which selects the 5
macOS-gate tests and passes today.

Grounded facts (the planner checked these on this Windows box, 2026-11-02):
- `src/preload/api/settings.ts` is 46 lines; `setSetting` is lines 17-23.
- `src/preload/api/tauriWindowChrome.ts` is 402 lines. `warn(label, error)` is at line 27.
  `tauriIsFrameless` and its doc comment are at lines 98-108. The maximize listener set (the shape
  to copy) is at lines 201-266. `applyFramelessDecorations` is at lines 285-323. The module header
  requires every export to be TOTAL (never throws).
- `src/preload/api/misc.ts` imports from `./tauriWindowChrome` at lines 2-16 and exports
  `isFrameless` at line 41 and `handleFullscreen` at lines 69-70. It makes no module-scope calls
  into `../tauriTransport`, so `framelessRuntime.test.ts`'s existing `jest.mock('../tauriTransport')`
  factory is enough to import it (`storeApi.test.ts` and `gamepadActionRouting.test.ts` already
  import misc.ts).
- `window.api`'s type is `typeof import('../../preload/api').default`
  (`src/common/types/proxy-types.ts:1`), and `src/preload/api/index.ts` spreads `* as Misc`, so a
  new misc export is typed on `window.api` with no declaration edit.
- `src/frontend/state/GlobalState.tsx` is 2220 lines. `async componentDidMount() {` is at line 1562.
  The `isFullscreen`/`isFrameless` seed is at lines 1891-1894 and the `window.api.handleFullscreen(`
  registration at lines 1895-1899. The Provider at line 2117 passes `value={{ ...this.state, ... }}`.
  GlobalState.tsx cannot be imported under the node-environment frontend jest (it reads
  `window.localStorage` at module scope), so its wiring is pinned by source gates; see
  `GlobalStateSavedZoomWiring.test.ts` for the idiom (readFileSync + `stripSourceComments` + a
  balanced-brace extractor + a SELF-TEST block).
- ESLint baseline: `settings.ts`, `misc.ts`, `tauriWindowChrome.ts` and `framelessRuntime.test.ts`
  have 0 problems. `GlobalState.tsx` has exactly 16 pre-existing warnings, 0 errors. The new code
  must not add one.
- `framelessRuntime.test.ts` is 475 lines. Its top-level `beforeEach` (line 146) sets the platform
  to `'Win32'` (line 159) and re-establishes the `mockWindow` promises. `setWebviewPlatform` takes
  `'MacIntel' | 'Win32' | 'Linux x86_64'`. The `setSetting wrapper (REQ-34.1-03)` describe is at
  lines 413-475.
- `node meta/findDeadcode.cjs`, `python .planning/todos/todo-frontmatter-gate.py` and
  `python meta/runPlanningGates.py` all run on this box. The planning gates show one baseline FAIL,
  `.planning\state-sdk-field-anchor-gate.py`, and every other gate passes.
- The only writer of `framelessWindow` is the renderer `setSetting` path. The backend only seeds
  the default (`src/backend/config.ts:387`).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Push the frameless setting from setSetting to GlobalState, end to end (preload push, window.api surface, GlobalState subscription)</name>
  <files>src/preload/api/tauriWindowChrome.ts, src/preload/api/settings.ts, src/preload/api/misc.ts, src/frontend/state/GlobalState.tsx, src/preload/__tests__/framelessRuntime.test.ts</files>
  <read_first>src/preload/api/settings.ts (whole file); src/preload/api/tauriWindowChrome.ts (lines 1-35, 98-108, 201-283, 285-323); src/preload/api/misc.ts (lines 1-75); src/frontend/state/GlobalState.tsx (lines 1885-1900 only); src/preload/__tests__/framelessRuntime.test.ts (lines 36-90, 140-170, 405-475)</read_first>
  <behavior>
    Add a new describe, `frameless change push (quick 261102-dma)`, at the end of
    `src/preload/__tests__/framelessRuntime.test.ts`. Subscribe through the real renderer surface
    (`handleFramelessChanged`, imported from `../api/misc`) and drive the real `setSetting` from
    `../api/settings`. Keep every returned unsubscribe in an array and drain it in an `afterEach`,
    because the listener set is module state that outlives a single test.
    - F1 (`it.each` over `'Win32'` and `'Linux x86_64'`): `setWebviewPlatform(p)`, subscribe a
      `jest.fn()`, call `setSetting({ appName: 'default', key: 'framelessWindow', value: false })`.
      With NO await or flush between the call and the assertion, the listener has been called
      exactly once, with `false`, and `mockWindow.setDecorations` was called with `true` (the
      native frame and the React push agree).
    - F2: on `'Win32'`, `value: true` reaches the listener as `true`, and `setDecorations` gets
      `false`.
    - F3: on `'MacIntel'`, `value: false` reaches the listener as `false`, and `setTitleBarStyle`
      gets `'visible'`. The push does not depend on the platform, because macOS needs it for the
      `macOverlayTitlebar` class.
    - F4: `setSetting({ appName: 'default', key: 'language', value: 'en' })` and
      `setSetting({ appName: 'some-game', key: 'framelessWindow', value: true })` call the listener
      zero times.
    - F5: after calling the returned unsubscribe, a further framelessWindow write calls that
      listener zero times.
    - F6: register a listener that throws, then a second `jest.fn()` listener, with
      `jest.spyOn(console, 'warn').mockImplementation(() => {})`. `setSetting(...)` with
      framelessWindow `false` does not throw, the second listener is called with `false`,
      `mockedTauriSend` was called with `'setSetting'`, and the warn spy saw a first argument that
      contains `framelessChangeListener`.
    - F7: the malformed calls `setSetting(undefined)` and `setSetting(null)` (cast as the existing
      WR-05 test does) do not throw and call the listener zero times.
    RED first: write F1-F7 before any production edit and run the Preload command from `<verify>`.
    It must fail (`handleFramelessChanged` is not yet exported from misc.ts). Commit only the test
    file: `git add src/preload/__tests__/framelessRuntime.test.ts`, then
    `test(quick-261102-dma): pin the frameless change push from setSetting`.
  </behavior>
  <action>
GREEN, in this order, then commit the four production files by explicit path as
`fix(quick-261102-dma): refresh isFrameless live when the frameless setting changes`.

1. `src/preload/api/tauriWindowChrome.ts`. Add a frameless-change listener set next to the maximize
   one, after `__resetMaximizeWatcherForTests`, and copy that block's shape. Use a type alias
   `FramelessChangeListener = (frameless: boolean) => void` and a module-level `Set`. Export
   `tauriHandleFramelessChanged(listener): () => void`, which adds the listener and returns an
   unsubscribe that deletes it. Export `notifyFramelessChanged(frameless: boolean): void`, which
   iterates a COPY of the set (`[...set]`) and wraps each call in try/catch that calls
   `warn('framelessChangeListener', error)`. Both functions are total, as the module header
   requires. Do not de-dupe: the toggle always changes the value, `useSettingsContext.setSetting`
   already returns early on a no-change write, and a repeated `setState` with the same boolean is
   harmless. Add a doc comment on the block. It should say: the toggle applies live (gap G2), but
   `isFrameless` in React was seeded once at mount and never refreshed, which left GameLib's
   WindowControls next to the native frame on Windows (quick 261102-dma). The push carries the
   WRITTEN value, because the settings snapshot `tauriIsFrameless` reads is only patched when the
   sidecar's STORE_CHANGED push comes back, so a re-read straight after the toggle would race it.
   Also add one sentence to `tauriIsFrameless`'s existing doc comment: it is still the boot-time
   read, and live changes after boot arrive through `tauriHandleFramelessChanged`. Do not touch
   the function body (windowChrome.test.ts pins that it never calls the Window API). Do not touch
   `applyFramelessDecorations`.

2. `src/preload/api/settings.ts`. Import `notifyFramelessChanged` alongside
   `applyFramelessDecorations`. Inside the existing `appName === 'default' && key ===
   'framelessWindow'` guard, call `notifyFramelessChanged(Boolean(value))` right after
   `applyFramelessDecorations(Boolean(value))`. Keep the order: IPC send first, then the
   decoration, then the push. The push fires even if `setDecorations` later rejects, because
   `isFrameless` reports the SETTING, not the window's decoration state (`tauriIsFrameless`'s
   documented contract). Extend the D-05 comment above `setSetting` with one sentence naming the
   push and quick 261102-dma. Do not re-export `notifyFramelessChanged` from settings.ts or
   misc.ts. Only `setSetting` may fire it, so `window.api` gets the subscribe side only.

3. `src/preload/api/misc.ts`. Add `tauriHandleFramelessChanged` to the `./tauriWindowChrome`
   import list. Directly after `export const isFrameless = () => tauriIsFrameless()` (line 41),
   add `export const handleFramelessChanged = (listener: (isFrameless: boolean) => void): (() =>
   void) => tauriHandleFramelessChanged(listener)`. There is no fake `IpcRendererEvent` first
   argument: this channel has no Electron precedent to stay in parity with. Add a short comment
   that names `GlobalState.tsx` as its consumer.

4. `src/frontend/state/GlobalState.tsx`, in `componentDidMount`. Directly after the
   `window.api.handleFullscreen(...)` registration (lines 1895-1899), and so AFTER the
   `isFrameless: await window.api.isFrameless()` seed, add
   `window.api.handleFramelessChanged((isFrameless: boolean) => this.setState({ isFrameless }))`.
   prettier may wrap it. Registering after the seed means a push can never be overwritten by an
   older seed value. Keep the seed exactly as it is. Do not store the unsubscribe. GlobalState
   lives for the whole app, and the `handleFullscreen` registration next to it does the same.
   Add one short comment naming quick 261102-dma and the cause, in a single line or two. Edit
   nothing else in this 2220-line file.

Do NOT edit `src/frontend/App.tsx`. Its gate already keys on the context `isFrameless`, and its
two-boolean macOS gate and comment block must stay byte-identical.
  </action>
  <verify>
    <automated>npx jest --selectProjects Preload --runTestsByPath src/preload/__tests__/framelessRuntime.test.ts src/preload/__tests__/windowChrome.test.ts && npx tsc --noEmit && npx eslint --max-warnings 0 src/preload/api/tauriWindowChrome.ts src/preload/api/settings.ts src/preload/api/misc.ts src/preload/__tests__/framelessRuntime.test.ts && test "$(npx eslint -f json src/frontend/state/GlobalState.tsx 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.reduce((a,r)=>a+r.warningCount+r.errorCount,0))})")" = 16 && grep -v '^\s*//' src/frontend/state/GlobalState.tsx | grep -q 'window.api.handleFramelessChanged(' && grep -v '^\s*//' src/preload/api/settings.ts | grep -q 'notifyFramelessChanged(Boolean(value))' && node meta/findDeadcode.cjs && git diff --quiet -- src/frontend/App.tsx && npx prettier --check src/preload/api/tauriWindowChrome.ts src/preload/api/settings.ts src/preload/api/misc.ts src/frontend/state/GlobalState.tsx src/preload/__tests__/framelessRuntime.test.ts</automated>
  </verify>
  <done>F1-F7 pass, and they were observed failing before the production edit. Every existing test in framelessRuntime.test.ts and windowChrome.test.ts still passes. `tsc` exits 0, which also proves `window.api.handleFramelessChanged` is typed through misc.ts. ESLint reports 0 problems on the three preload sources and the test file, and GlobalState.tsx stays at exactly 16 warnings. `findDeadcode` exits 0. App.tsx has no diff. Prettier is clean on all five paths (all five report `"ignored": false`). There are two commits, `test(quick-261102-dma)` and then `fix(quick-261102-dma)`, and each staged only its own files by explicit path.</done>
</task>

<task type="auto">
  <name>Task 2: Pin the chain in the frontend: GlobalState writes isFrameless from the push, and App.tsx's gate then hides WindowControls on win32 and linux (never shown on darwin)</name>
  <files>src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts</files>
  <read_first>src/frontend/state/__tests__/GlobalStateSavedZoomWiring.test.ts (whole file, the idiom to copy); src/frontend/App.tsx (lines 41-90 and 150 only); src/frontend/state/GlobalState.tsx (lines 1888-1905 and 2115-2120 only, as Task 1 left them)</read_first>
  <action>
Create `src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts`. It is a source-text gate,
because neither GlobalState.tsx nor App.tsx's `Root` can be imported or rendered under this node
jest (no jsdom; GlobalState reads `window.localStorage` at module scope; `Root` is not exported
and needs a router). Copy the idiom of `GlobalStateSavedZoomWiring.test.ts`: `readFileSync` +
`stripSourceComments` (from `backend/testUtils/stripSourceComments`) + a balanced-brace extractor
(copy `extractBalanced` verbatim). Start with a header docstring. It names the todo, quick
261102-dma and the cause. It says that the real push is proven behaviourally by
`src/preload/__tests__/framelessRuntime.test.ts` F1-F7, and that this file pins the remaining two
links of the chain. It also states what the file cannot see: it does not render, and it does not
evaluate `navigator.windowControlsOverlay`.

Write the matchers as named pure functions over a source string that return a violations list, the
way `focusRowWiringViolations` does, so the SELF-TEST block can run the same functions on synthetic
fixtures.

Describe A, GlobalState wiring. Read GlobalState.tsx and strip its comments. Extract the
`async componentDidMount()` body with `extractBalanced`. Check all of the following:
- (A1) The body still contains the seed `isFrameless: await window.api.isFrameless()`.
- (A2) The body contains a `window.api.handleFramelessChanged(` call, and that call's index is
  GREATER than the seed's index.
- (A3) The call's argument is an arrow function. Capture its single parameter name P (an optional
  `: boolean` annotation is allowed). Its body contains `this.setState(` with either `isFrameless:
  P`, or the shorthand `{ isFrameless }` when P is `isFrameless`. A constant such as
  `isFrameless: true` is a violation.
- (A4) The class `render`'s `<ContextProvider.Provider` `value={{` object contains `...this.state`,
  so the state field the handler writes is the context field App.tsx reads.

Describe B, App.tsx gate across the flip. Read App.tsx and strip its comments. Then:
- (B1) Extract the names destructured from `useContext(ContextProvider)` in `Root` and require
  `isFrameless` among them.
- (B2) Extract `const isMac = (...)` up to the end of the line. It must match
  `platform === '<literal>'`. Capture the literal and expect `'darwin'`.
- (B3) Extract `const showOverlayControls = (...)` up to the end of the line. Split it on `&&` and
  trim each conjunct. Every conjunct must match `^!?[A-Za-z_$][\w$]*$`, otherwise THROW an
  "unsupported gate shape" error, so a reshaped gate fails loudly instead of passing vacuously.
- (B4) Require the JSX `{showOverlayControls && <WindowControls />}`, whitespace-tolerant.

Write a tiny evaluator, `evaluateConjunction(conjuncts, env)`. It returns true only when every
conjunct holds, where a `!id` conjunct means `!env[id]`. It throws if an identifier is missing
from env.

Build env per platform as `{ isFrameless, hasNativeOverlayControls: false, isMac: platform ===
<captured literal> }`. Add a one-line comment saying `hasNativeOverlayControls` is the
Chromium-only `navigator.windowControlsOverlay?.visible`, which is not visible in a Tauri webview.

Then assert the flip sequence. For each of `'win32'` and `'linux'` (`it.each`): with
`isFrameless: true` the gate is true (GameLib's set shows while frameless is on), after flipping
to `false` it is false (the report), and after flipping back to `true` it is true again (the
todo's Verify, the other direction). For `'darwin'`: the gate is false with both `true` and
`false`. That is the D-06 reversal, still holding.

Describe SELF-TEST (anti-vacuity). Run the same functions on synthetic fixtures:
- (S1) A pre-fix componentDidMount, with the seed and `handleFullscreen` only, convicts A2.
- (S2) A registration placed BEFORE the seed convicts A2.
- (S3) `window.api.handleFramelessChanged(() => this.setState({ isFrameless: true }))` convicts A3.
- (S4) A Provider whose value lacks `...this.state` convicts A4.
- (S5) The gate fixture `!hasNativeOverlayControls && !isMac`, with the isFrameless conjunct
  dropped, evaluates TRUE on win32 after the flip to `false`. This shows the flip assertion above
  could fail.
- (S6) `isFrameless || !isMac` makes the B3 parser throw.

Keep the self-tests in the same file, as the precedent files do.

Commit by explicit path: `git add src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts`,
then `test(quick-261102-dma): pin isFrameless refresh through GlobalState into the WindowControls gate`.
Then run `graphify update .` (not a gate; do not stage `graphify-out/`).
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runTestsByPath src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts src/frontend/state/__tests__/GlobalStateSavedZoomWiring.test.ts src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts && npx jest --selectProjects Frontend --runTestsByPath src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts -t "D-06 reversal" && npx tsc --noEmit && npx eslint --max-warnings 0 src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts && git diff --quiet -- src/frontend/App.tsx && npx prettier --check src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts</automated>
  </verify>
  <done>Describes A, B and SELF-TEST all pass. B's flip sequence covers win32 and linux in both directions, and darwin stays false in both states. S1-S6 each prove that a matcher can convict. The two neighbouring GlobalState wiring gates still pass, and the 5 "D-06 reversal" macOS-gate tests in appShellLayout.test.ts still pass. `tsc` exits 0, ESLint reports 0 problems on the new file, App.tsx has no diff, and prettier is clean on the new file (`"ignored": false`). The `test(quick-261102-dma)` commit contains only that file.</done>
</task>

<task type="auto">
  <name>Task 3: Record the cause and the fix on the todo, and re-triage it to ready: live-gate for the Windows live check (it stays pending)</name>
  <files>.planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md</files>
  <read_first>.planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md (whole file, 48 lines); .planning/todos/completed/2026-11-02-d-uat-18-client-setup-banner-done-cancels-auto-continue.md (its "## Code landed (quick 261102-4tf)" section only, as the shape precedent)</read_first>
  <action>
Repo precedent: quick 261102-4tf (commit 9c95b18cb) kept the D-UAT-18 todo in `pending/`, changed
it to `ready: live-gate`, and added a "Code landed" section with an operator live-check list. The
todo moved to `completed/` only later, in 84f3e4da5, after the Windows re-run passed. This todo's
own "## Verify" section asks for a live check on the Windows box. So it STAYS in `pending/`. Do
not move it to `completed/`.

Frontmatter. Keep `created`, `title`, `source` and `area`. Extend `files:` with
`src/preload/api/settings.ts`, `src/preload/api/misc.ts`,
`src/preload/__tests__/framelessRuntime.test.ts` and
`src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts`. Keep the existing five
entries. Keep `severity: minor` and `platform: windows`. Change `ready: code` to `ready: live-gate`.
The three keys stay bare, lowercase and in that order (gamelib-conventions todo rule).

Body. Rename the heading "## Likely cause (not yet confirmed)" to "## Cause (confirmed from the
code, quick 261102-dma)". Under it, replace the "not yet confirmed" framing and the "Check first"
paragraph with the confirmed chain, using the facts in this plan's `<objective>`:
- `App.tsx:84`'s gate reads the context `isFrameless`.
- `GlobalState.tsx` sets it once at mount and never again.
- The preload `setSetting` redrew the native frame live but told React nothing.
- A snapshot re-read would race the sidecar's STORE_CHANGED push, which is why the fix pushes the
  written value.
- Both directions were broken (OFF: two sets; ON: no GameLib set until a restart).
- A restart cleared it.
Keep the "## Fix direction" section, and add one line under it saying it was followed as written.

Append "## Code landed (quick 261102-dma)". List every `quick-261102-dma` commit hash that touched
`src/` (get them with `git log --format='%h %s' --grep=quick-261102-dma -- src`). Add one bullet
each for:
- the push and where it fires (settings.ts, inside the default/framelessWindow guard, after
  `applyFramelessDecorations`);
- the `window.api.handleFramelessChanged` surface;
- the GlobalState subscription, registered after the mount-time seed;
- the two tests (F1-F7 in framelessRuntime.test.ts; the chain gate in
  GlobalStateFramelessRefresh.test.ts);
- App.tsx not being touched, so the macOS two-boolean gate is unchanged;
- the macOS side effect: the `frameless`/`macOverlayTitlebar` classes, and with them the 78px
  traffic-light reserve, now follow the toggle live too;
- Linux using the same `!isMac` gate, covered by the jest flip rows but not live-checked (no Linux
  box).

Then add an operator live-check paragraph that opens with "Operator live gate (NOT yet run; this
todo stays pending until it passes)." Use a GameLib build that contains the fix commits, on the
Windows box. It covers three checks:
- Toggle Use frameless window OFF: exactly one set of buttons, the native one, and no restart.
- Toggle it back ON: GameLib's set returns on the tab bar, the native frame goes away, and no
  restart is needed.
- Optionally, on the Mac: toggling still shows only the traffic lights, and the leading gap
  appears only in the frameless (overlay) state.
End with: record the result here, then move this todo to `.planning/todos/completed/`.

Match the wrap (about 100 columns) and the plain style of the existing file. `.planning` is
prettier-ignored, so nothing formats it for you. Write no machine-specific absolute paths.

Commit by explicit path (the file is untracked, so this adds it):
`git add .planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md`, then
`docs(quick-261102-dma): record the frameless refresh fix and re-triage to live-gate`.
  </action>
  <verify>
    <automated>T=.planning/todos/pending/2026-11-02-windows-controls-linger-after-frameless-off.md && python .planning/todos/todo-frontmatter-gate.py && test "$(awk '/^---$/{n++;next} n==1' $T | grep -A2 '^severity:' | tr '\n' '|')" = "severity: minor|platform: windows|ready: live-gate|" && awk '/^---$/{n++;next} n==1' $T | grep -q 'GlobalStateFramelessRefresh.test.ts' && awk '/^---$/{n++;next} n==1' $T | grep -q 'src/preload/api/settings.ts' && grep -q '^## Code landed (quick 261102-dma)$' $T && grep -q '^## Cause (confirmed from the code, quick 261102-dma)$' $T && test "$(git log --format=%h --grep=quick-261102-dma -- src | wc -l)" -ge 3 && test -z "$(git log --format=%h --grep=quick-261102-dma -- src | while read H; do grep -q "$H" $T || echo "$H"; done)" && grep -q 'NOT yet run' $T && ! test -e .planning/todos/completed/2026-11-02-windows-controls-linger-after-frameless-off.md && git ls-files --error-unmatch $T > /dev/null && PG=$(mktemp) && { python meta/runPlanningGates.py > "$PG" 2>&1; true; } && grep -q '^\[PASS\]' "$PG" && ! grep '^\[FAIL\]' "$PG" | grep -v 'state-sdk-field-anchor-gate.py' && npx prettier --file-info $T | grep -Eq '"ignored":[[:space:]]*true'   # prettier: the todo is under .planning/, which --file-info reports ignored (inferredParser null), so --check over it would be vacuous and is omitted; the probe proves the omission is legitimate. `pnpm planning-gates` is replaced by `python meta/runPlanningGates.py` (python3 is the Microsoft Store stub on this box). The only tolerated FAIL is the pre-existing STATE.md field-anchor gate.</automated>
  </verify>
  <done>The todo is committed and stays in pending/ with `severity: minor` / `platform: windows` / `ready: live-gate`. It records the confirmed cause, every `quick-261102-dma` commit that touched src/ (at least 3: test, fix, test), the macOS and Linux notes, and the Windows live check in both directions, marked NOT yet run. The todo frontmatter gate passes, and the planning gates show no FAIL beyond the baseline `state-sdk-field-anchor-gate.py`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer settings write -> app window chrome | `window.api.setSetting` is reachable from untyped renderer code. Only a `default`-scope `framelessWindow` write may change window chrome or the React frameless state. |
| preload push -> React state | Subscribers run inside `setSetting`'s call stack. A subscriber fault must not escape into the settings write path. |
| planning artifact -> public repo | The todo is committed to a public fork. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dma-01 | Denial of Service | `notifyFramelessChanged` called from `setSetting` | medium | mitigate | Each listener runs in its own try/catch and logs through `warn('framelessChangeListener', ...)`. It iterates a copy of the set. The IPC send goes out before the push. F6 proves a throwing listener neither throws out of `setSetting` nor starves the next listener, and F7 proves malformed calls stay total (WR-05). |
| T-dma-02 | Tampering | game-scoped or other-key writes flipping app chrome state | low | mitigate | The push sits inside the existing `appName === 'default' && key === 'framelessWindow'` guard. F4 proves other keys and game-scoped writes push nothing. |
| T-dma-03 | Spoofing | renderer code firing a frameless push without a setting write | low | mitigate | `notifyFramelessChanged` is not re-exported through misc.ts or settings.ts, so `window.api` exposes only the subscribe side. Only `setSetting` fires it. |
| T-dma-04 | Information Disclosure | todo committed to the public repo | low | accept | The todo carries code paths, commit hashes and UI behaviour only. It has no profile data and no machine-specific absolute paths (Task 3 action). |
| T-dma-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs no package. No package-manager command appears in any task. |
</threat_model>

<verification>
- Preload: `npx jest --selectProjects Preload --runTestsByPath src/preload/__tests__/framelessRuntime.test.ts src/preload/__tests__/windowChrome.test.ts` is green, and F1-F7 were observed red first.
- Frontend: `npx jest --selectProjects Frontend --runTestsByPath src/frontend/state/__tests__/GlobalStateFramelessRefresh.test.ts` is green, and `appShellLayout.test.ts -t "D-06 reversal"` is still green.
- `npx tsc --noEmit` exits 0. `node meta/findDeadcode.cjs` exits 0. ESLint adds no problem to any touched file, and GlobalState.tsx stays at 16.
- `git diff --quiet -- src/frontend/App.tsx` exits 0 across the whole plan.
- `git status --porcelain` afterwards still shows the other session's files (`src/backend/storeManagers/steam/...`, `.planning/debug/...`, `.planning/milestone.lock`, `.planning/quick/261102-dkw-...`) exactly as they were: unstaged, and in no `quick-261102-dma` commit.
- The Windows live check is recorded on the todo as NOT yet run. It is the operator's step, and nothing in this plan claims it.
</verification>

<success_criteria>
- Flipping "Use frameless window" off on win32/linux removes GameLib's WindowControls without a restart, and flipping it on restores them. This is proven in jest across the chain: the setSetting push (behavioural), the GlobalState write (source gate), and App.tsx's gate evaluated over the flip. It is pending the operator's live Windows check.
- The macOS two-boolean gate in App.tsx is untouched and its pinned tests still pass.
- Four commits, all carrying `quick-261102-dma` (test, fix, test, docs), each staging only its own files by explicit path.
- The todo is re-triaged to `ready: live-gate` and stays pending until the Windows live check passes.
</success_criteria>

<output>
Create `.planning/quick/261102-dma-refresh-isframeless-when-the-frameless-w/261102-dma-SUMMARY.md` when done.
</output>
