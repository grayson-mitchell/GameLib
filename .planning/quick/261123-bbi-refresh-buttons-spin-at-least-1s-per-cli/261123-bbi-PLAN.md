---
phase: quick-261123-bbi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/hooks/useMinimumSpin.ts
  - src/frontend/hooks/__tests__/useMinimumSpin.test.ts
  - src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/screens/WineManager/index.tsx
  - src/frontend/components/UI/ErrorComponent/index.tsx
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx
  - .planning/todos/pending/2026-11-22-refresh-button-gives-no-click-feedback.md
  - .planning/todos/completed/2026-11-22-refresh-button-gives-no-click-feedback.md
autonomous: true
requirements:
  - TODO-2026-11-22-refresh-button-gives-no-click-feedback

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Clicking Refresh on Humble Keys when the sync finishes at once still spins the button for about 1 s: the `spinning` class and the icon's `fa-spin` are present from the click until 1000 ms later, with `humble.syncing` never true (the todo's acceptance test)"
    - "Every refresh button spins for max(1 s from the click, end of the refresh): a refresh that outlasts 1 s spins until it ends and stops right then, with no extra tail"
    - "A busy period nobody clicked for (a background or per-runner Library refresh, a store-exit refresh, Humble's own post-redeem sync) spins exactly as long as it runs, as it does today, with no 1 s tail added"
    - "The 1 s minimum lives in one place: `MIN_SPIN_MS` and `useMinimumSpin` in src/frontend/hooks/useMinimumSpin.ts. No call site keeps its own timer"
    - "Each click restarts the 1 s window, and the hook's timer is cleared when the component unmounts"
    - "The Library header still shows exactly one sync spinner in every state: the hidden duplicate spinner's gate reads the composed value (busy OR click window), so it also stays hidden during the window"
    - "A button's disabled state still follows the real busy flag. The spin window is visual feedback only and blocks no click"
  artifacts:
    - path: src/frontend/hooks/useMinimumSpin.ts
      provides: "useMinimumSpin(active, minMs = MIN_SPIN_MS) returning { spinning, onClickStart }, and MIN_SPIN_MS = 1000"
      contains: "export function useMinimumSpin"
    - path: src/frontend/hooks/__tests__/useMinimumSpin.test.ts
      provides: "jsdom renderHook + jest fake-timer proof of the max(1 s, end of refresh) rule, window restart and unmount cleanup"
      contains: "261123-bbi"
    - path: src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
      provides: "Humble Keys acceptance: the spinning class lasts about 1 s after a click with syncing false"
      contains: "261123-bbi"
    - path: src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts
      provides: "source pin: the six known refresh buttons route their spin through useMinimumSpin"
      contains: "useMinimumSpin"
  key_links:
    - from: src/frontend/screens/Humble/Keys/index.tsx
      to: src/frontend/hooks/useMinimumSpin.ts
      via: "useMinimumSpin(!!humble?.syncing); the button's `spinning` class, the icon's `fa-spin` and onClick read the hook"
      pattern: "useMinimumSpin\\("
    - from: src/frontend/components/UI/Header/index.tsx
      to: src/frontend/hooks/useMinimumSpin.ts
      via: "refreshButtonSpinning is the hook's `spinning` over (refreshing || anyScopedRefresh); the hidden duplicate spinner's gate reads it"
      pattern: "spinning: refreshButtonSpinning"
    - from: src/frontend/screens/WineManager/index.tsx
      to: src/frontend/hooks/useMinimumSpin.ts
      via: "useMinimumSpin(refreshingWineVersions) drives the toolbar icon's fa-spin"
      pattern: "useMinimumSpin\\("
    - from: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
      to: src/frontend/hooks/useMinimumSpin.ts
      via: "useMinimumSpin(refreshing), declared before the early returns; the MUI Refresh icon gets fa-spin"
      pattern: "useMinimumSpin\\("
---

<objective>
Every refresh button in GameLib spins its icon for at least ~1 s after each click, and keeps
spinning for as long as the refresh is still running: spin = max(1 s from click, end of refresh).
One shared hook, `useMinimumSpin`, holds the rule. It is applied to Humble Keys (the acceptance
case, where a sync can return almost at once), the Library header, Wine Manager, the Apple wiki
rating refresh, and the two other refresh buttons found during planning: the game page's
wiki-info Retry and the error screen's Refresh Library.

Purpose: the operator clicked Refresh on Humble Keys and saw nothing happen (Phase 85 live gate
85-20, launches 1 and 6). An instant refresh must still visibly show that the click was received.

Output: `src/frontend/hooks/useMinimumSpin.ts` with its own jsdom test; six call sites wired to it;
a Humble Keys component test that proves the todo's acceptance case; a source pin over the six
sites; the source todo closed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-11-22-refresh-button-gives-no-click-feedback.md

Load `Skill("gamelib-conventions")` before writing a `<verify>` result or touching the todo. Its
prettier rule is followed below: every `<verify>` checks prettier over exactly the paths the task
wrote. The two `.planning/todos/` paths are prettier-ignored, so they are left out of the check on
purpose.

## Working-tree rules (READ FIRST)

The main working tree has unrelated uncommitted changes from other work: `src/backend/cache.ts`,
`src/backend/__tests__/cache.test.ts`, `src/backend/storeManagers/gog/library.ts` and its test,
`src/backend/sidecar/handlers.ts`, `src/backend/sidecar/shellFilesFlowRegistration.ts` and its
test, `src-tauri/src/store_embed/controls.rs`, `.planning/state.json`, several `.planning/debug`,
`.planning/spikes` and `.planning/todos/completed` files, plus untracked files. Another session may
commit while you run. Therefore:

- Stage ONLY the paths you wrote, each by explicit path (`git add <path> <path> ...`). Never run
  `git add -A`, `git add .`, `git commit -a`, `git stash`, `git checkout -- <path>`, `git restore` or
  `git reset` on anything you did not write. Do not edit, format or revert any file outside
  `files_modified`.
- `.planning/todos/pending/2026-11-22-refresh-button-gives-no-click-feedback.md` (this task's own
  todo) also has an uncommitted change: the operator's 2026-11-23 correction (Humble Keys, not the
  Library header). It belongs to this todo. Carry it into the move in Task 3 and commit it there.
  Never revert it.
- A gsd-tools `commit` call sweeps every dirty `.planning/` file unless it is given `--files`. Use
  plain `git commit` after an explicit `git add`.
- `.husky/pre-commit` runs prettier on staged content. It is a backstop. The `<verify>` check is
  what keeps a file formatted.
- After the code changes, run `graphify update .` (AST-only, no API cost).

## Baselines measured at planning time (working tree, 2026-11-23)

- `pnpm exec jest --runTestsByPath` over the Humble Keys `index.test.tsx` (47 tests),
  `headerTourAnchors.test.tsx` (25), `uiState.test.ts` (9), `tier2Portal.test.ts` (28),
  `gamelibFixDisplay.test.ts` (9) and `gamePageTabs.test.ts` (8): 6 suites passed, 126 tests.
  None of these suites pins the lines this plan changes. `gamelibFixDisplay.test.ts` pins other
  AppleWikiInfo lines (two `<Rating`, the `showProton` / `showCrossover` / `showWine` gates), and
  `tier2Portal.test.ts` pins ErrorComponent's `.refreshIcon:hover` CSS. Leave both as they are.
- `pnpm exec eslint` over the seven existing source and test files this plan edits: 0 errors and 3
  warnings, all already there before this plan. They are 2 `no-floating-promises` in Header
  (lines 171 and 175) and 1 `exhaustive-deps` in Humble Keys (line 244). Each task's eslint gate
  allows exactly the warnings already in its own files, and no new ones.
- `pnpm -s codecheck`: exit 0. `pnpm -s find-deadcode`: `PASS (310 baselined knip findings ...)`.
  `pnpm -s planning-gates`: `12/12 planning gates passed.`
- `jest-environment-jsdom` 29.7.0 and `@testing-library/react` 14 (which exports `renderHook`) are
  installed. Opt-in jsdom tests use the `@jest-environment jsdom` docblock and import
  `frontend/testUtils/jsdomNoticeEnv` first, as `NativePortInfo.test.tsx` does. The Frontend
  project's default environment is still `node`, and the Humble Keys `index.test.tsx` harness is a
  node-env slot-based `react` mock. That is why the hook uses only `useState` and `useEffect`
  (see D-1 below).

## Refresh buttons found (census done at planning time)

In scope: these are refresh clicks with a refresh glyph.

| Site | Busy flag today | Spin today |
|---|---|---|
| Humble Keys, `src/frontend/screens/Humble/Keys/index.tsx` ~579 | `humble.syncing` (from state; `window.api.humbleSync()` is fire-and-forget) | button `spinning` class + icon `fa-spin` |
| Library header, `src/frontend/components/UI/Header/index.tsx` ~470 | `refreshing \|\| anyScopedRefresh` (named `refreshButtonSpinning`) | button `active` class + icon `fa-spin` |
| Wine Manager toolbar, `src/frontend/screens/WineManager/index.tsx` ~164 | `refreshingWineVersions` (uiState) | icon `fa-spin` |
| Apple wiki rating, `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` ~192 | local `refreshing` around `refreshWikiInfo` | none (MUI `Refresh` icon never spins) |
| Wiki-info Retry, `src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx` ~74 | local `refreshing` around `refreshWikiInfo` | none (MUI `Refresh` startIcon) |
| Error screen Refresh Library, `src/frontend/components/UI/ErrorComponent/index.tsx` ~20 | none read today; `useLibraryState` `refreshing` | hover-only CSS spin (`.refreshIcon:hover`) |

Out of scope, with the reason to record in the SUMMARY:
- SteamSyncNotice failed-mode "Try again": a text-only button with no refresh glyph to spin.
- EOS overlay "Check for updates": an update check, not a refresh, and its label already changes
  to "Checking for updates..." while it runs.
- Winetricks row "Retry": retries a component install, not a refresh.
- GameCard, EAC/BattlEye runtime, StoreSearch, SearchBar, EligibilityLoadingRow spinners: status
  spinners with no click.
- ConsoleMode, DownloadManager, LogSettings, WineVersionSelector `refreshing` flags: load states
  with no refresh button.

## Design decisions (Claude's discretion, documented, not locked)

- D-1 Hook shape: `useMinimumSpin(active: boolean, minMs = MIN_SPIN_MS)` returns
  `{ spinning, onClickStart }`. `MIN_SPIN_MS = 1000` is exported. The window is two `useState`
  counters, opened and closed. `onClickStart` increments opened with a functional updater. One
  `useEffect` keyed on `[opened, minMs]` does nothing while opened is 0. Otherwise it arms a
  `setTimeout(minMs)` that sets closed to that opened value, and returns a cleanup that clears the
  timer. `spinning = active || opened !== closed`. This form gives all of the following:
  - A click restarts the window, because the cleanup clears the old timer and a new one is armed.
  - Unmount clears the timer.
  - No `setState` runs synchronously inside the effect.
  - It works unchanged under the repo's node-env `react` mocks. The Humble Keys harness has
    slot-based `useState`/`useEffect`. `withStoreHooks`' `useRef` is not persistent, so a
    ref-held timer id would be lost there. The Header harness has `useState` returning `jest.fn()`.

  Use no `useRef` and no `useCallback`. `onClickStart` is a fresh closure on each render, which is
  harmless for `onClick`.
- D-2 The window starts on the click and on nothing else. A busy period without a click gets no
  tail, so background, per-runner and store-exit refreshes look exactly as they do today.
- D-3 `disabled` keeps following the real busy flag at every site. The window does not block a
  second click.
- D-4 The two MUI `Refresh` icons (AppleWikiInfo, WikiInfoEmptyState) spin with the same `fa-spin`
  class as every other refresh glyph. `@fortawesome/fontawesome-svg-core` 6.7.2 injects `.fa-spin`
  as a top-level rule at runtime (`autoAddCss` is never disabled in this repo), so the class
  applies to any element. This keeps a single spin class that the source pin can check everywhere.
- D-5 Humble Keys' fire-and-forget sync is kept. The busy flag stays `humble.syncing` from state.
  The click handler is not changed to await `humbleSync()`.
- D-6 Behavioural proof is placed where it is cheap and decisive. The hook gets a real-React jsdom
  test. Humble Keys (the acceptance case) gets a component test in its existing harness. The other
  five sites are pinned by a source census. The census pins the six known sites only. A new refresh
  button that skips the hook is not detected, and the test's docblock says so.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tracer: useMinimumSpin end-to-end through the Humble Keys refresh button</name>
  <files>src/frontend/hooks/useMinimumSpin.ts, src/frontend/hooks/__tests__/useMinimumSpin.test.ts, src/frontend/screens/Humble/Keys/index.tsx, src/frontend/screens/Humble/Keys/__tests__/index.test.tsx</files>
  <read_first>
    - .planning/todos/pending/2026-11-22-refresh-button-gives-no-click-feedback.md
    - src/frontend/hooks/useAwaited.ts (hook module and export style)
    - src/frontend/screens/Game/GamePage/components/__tests__/NativePortInfo.test.tsx lines 1-10 (jsdom docblock + `frontend/testUtils/jsdomNoticeEnv` first-import pattern)
    - src/frontend/screens/Humble/Keys/index.tsx lines 120-275 (hooks, then the `!humble?.isLoggedIn` early return at ~270) and 575-606 (the refresh button)
    - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx lines 183-330 (the slot-based `react` mock, `mockApi`, `mount()`, `rerender()`), 387-397 (`findByClassName`) and 470-485 (the main describe with its beforeEach)
  </read_first>
  <behavior>
    Hook (`useMinimumSpin.test.ts`, top-level describe named `useMinimumSpin (261123-bbi)`; jsdom + `renderHook` + `act` + `jest.useFakeTimers()`):
    - No click and active false: spinning is false.
    - Click while active stays false (the instant-completion case): spinning is true right after the click, still true at 999 ms, and false at 1000 ms.
    - Click, active true, then false at 300 ms: spinning stays true until 1000 ms and is false at 1000 ms.
    - Click with active true until 2500 ms: spinning is true at 1000 ms and 2499 ms, and false as soon as active turns false at 2500 ms. There is no extra tail.
    - Active true with no click (background refresh): spinning mirrors active exactly and is false the moment active turns false. There is no 1 s tail.
    - A second click at 600 ms restarts the window: spinning is true at 1599 ms and false at 1600 ms.
    - Unmount during the window clears the hook's timer: `jest.getTimerCount()` falls by one at unmount, and advancing past the window afterwards logs no `console.error`.
    - A custom `minMs` (250) is honoured: spinning is true at 249 ms and false at 250 ms.
    Humble Keys (`index.test.tsx`, a nested describe named `261123-bbi: refresh button minimum spin` inside the existing main describe, using `jest.useFakeTimers()` in its own beforeEach and `jest.useRealTimers()` in its own afterEach):
    - Acceptance: with `contextValue.humble.syncing` false throughout, the button found by className `humbleKeysRefreshButton` has no `spinning` token before the click. Calling its `onClick` prop calls `mockApi.humbleSync` once. After `rerender()` the button's className has the `spinning` token and its FontAwesomeIcon child's className has `fa-spin`. After 999 ms (then `rerender()`) both are still there. After 1 more ms (then `rerender()`) both are gone. The button's `disabled` prop stays false throughout (D-3).
    - A sync that outlasts the window: click, set `contextValue.humble.syncing = true`, `rerender()`, advance 1500 ms, `rerender()`: still spinning. Set syncing false and `rerender()`: not spinning.
    - Syncing true with no click: spinning while syncing, and not spinning on the first `rerender()` after it turns false.
  </behavior>
  <action>
    RED first. Write `src/frontend/hooks/__tests__/useMinimumSpin.test.ts` covering every hook bullet in the behavior block. Use the `@jest-environment jsdom` docblock. Import `frontend/testUtils/jsdomNoticeEnv` first, then `renderHook` and `act` from `@testing-library/react`. Drive `active` through `renderHook`'s `initialProps` and `rerender`. Wrap every `onClickStart()` call and every `jest.advanceTimersByTime` call in `act`. Add the docblock: it states the todo's rule, spin = max(1 s from click, end of refresh), and that this file is the behavioural proof for the hook. Add the Humble Keys nested describe to `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx` with the cases in the behavior block. Use the file's own `mount()`, `rerender()`, `findByClassName` and `contextValue`. The harness does not re-render on its own, so call `rerender()` after the click and after each timer advance. Say this in a short comment. Run both files and confirm they fail: the hook module does not exist yet, and the Humble button never spins with syncing false.

    GREEN. Create `src/frontend/hooks/useMinimumSpin.ts` exactly as D-1 describes. Export `MIN_SPIN_MS` (1000) and the named function `useMinimumSpin`. Import only `useState` and `useEffect` from `react`. Give it a docblock covering:
    - the rule;
    - why the window starts only on a click (D-2);
    - why only `useState`/`useEffect` are used (the node-env slot mocks and the non-persistent `withStoreHooks` `useRef`);
    - that each click restarts the window;
    - that unmount clears the timer;
    - that call sites keep `disabled` on the real busy flag (D-3).

    In `src/frontend/screens/Humble/Keys/index.tsx`, import `useMinimumSpin` from `frontend/hooks/useMinimumSpin`. Call it once, unconditionally, after the last existing `useEffect` and before the `!humble?.isLoggedIn` early return (Rules of Hooks), as `useMinimumSpin(!!humble?.syncing)`. Destructure `spinning` and `onClickStart` and rename them to local names that read clearly, for example `refreshSpinning` and `startRefreshSpin`. On the refresh button:
    - The `spinning` class key and the icon's `fa-spin` key both read the hook's spinning value instead of the raw `humble.syncing` flag.
    - `disabled` stays exactly as it is.
    - `onClick` calls the start function first, then `void window.api.humbleSync()` (still fire-and-forget, per D-5). The `void` keeps `no-floating-promises` quiet.

    Do not touch `showProgress`, the sync indicator, `humbleKeysSyncSpinner` or `index.css`. Re-run both test files until they are green. Commit with explicit paths, all four files only: `feat(quick-261123-bbi): Humble Keys refresh spins at least 1 s per click via useMinimumSpin`.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/frontend/hooks/__tests__/useMinimumSpin.test.ts src/frontend/screens/Humble/Keys/__tests__/index.test.tsx 2>&1 | grep -E '^Test(s| Suites):'   # HEAD: useMinimumSpin.test.ts absent, index.test.tsx 1 suite passed / 47 tests. EXPECT: 2 suites passed, >=58 tests, 0 failed</automated>
    <automated>pnpm exec jest --runTestsByPath src/frontend/hooks/__tests__/useMinimumSpin.test.ts src/frontend/screens/Humble/Keys/__tests__/index.test.tsx -t '261123-bbi' --verbose 2>&1 | grep -c '✓'   # [HEAD=0 EXPECT>=11 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/Humble/Keys/index.tsx | grep -c 'useMinimumSpin('   # [HEAD=0 EXPECT==1 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/Humble/Keys/index.tsx | grep -cE "(spinning|'fa-spin'): humble\.syncing"   # [HEAD=2 EXPECT==0 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/hooks/useMinimumSpin.ts | grep -cE 'useRef|useCallback'   # [HEAD=error:2 EXPECT==0 @73c354d89]</automated>
    <automated>pnpm exec eslint --max-warnings 1 src/frontend/hooks/useMinimumSpin.ts src/frontend/hooks/__tests__/useMinimumSpin.test.ts src/frontend/screens/Humble/Keys/index.tsx src/frontend/screens/Humble/Keys/__tests__/index.test.tsx   # HEAD: 1 pre-existing exhaustive-deps warning (Humble Keys index.tsx:244). EXPECT: exit 0</automated>
    <automated>pnpm -s codecheck   # HEAD exit 0. EXPECT exit 0</automated>
    <automated>npx prettier --check src/frontend/hooks/useMinimumSpin.ts src/frontend/hooks/__tests__/useMinimumSpin.test.ts src/frontend/screens/Humble/Keys/index.tsx src/frontend/screens/Humble/Keys/__tests__/index.test.tsx</automated>
  </verify>
  <done>`useMinimumSpin` exists, uses only useState/useEffect, and its jsdom test proves the max(1 s, end of refresh) rule, the click-only window, the restart and the unmount cleanup. On Humble Keys, a click with syncing false keeps the `spinning` class and the icon's `fa-spin` for exactly the 1000 ms window, then drops them. A sync that outlasts the window spins until it ends. `disabled` is unchanged. All 47 earlier Humble Keys tests still pass. Committed with four explicit paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Library header, Wine Manager and error-screen refresh buttons through useMinimumSpin, plus the call-site pin</name>
  <files>src/frontend/components/UI/Header/index.tsx, src/frontend/screens/WineManager/index.tsx, src/frontend/components/UI/ErrorComponent/index.tsx, src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts</files>
  <read_first>
    - src/frontend/hooks/useMinimumSpin.ts (from Task 1)
    - src/frontend/components/UI/Header/index.tsx lines 150-205 (state keys, `anyScopedRefresh`, `isSteamSyncing`, the quick 261030-qqh comment and `refreshButtonSpinning`) and 470-520 (the refresh button and the load-bearing JSX comment above the hidden duplicate spinner)
    - src/frontend/screens/WineManager/index.tsx lines 20-35 and 160-215
    - src/frontend/components/UI/ErrorComponent/index.tsx (whole file, ~70 lines) and src/frontend/components/UI/ErrorComponent/index.css lines 20-36 (the hover spin on `.refreshIcon`)
    - src/frontend/screens/Game/GamePage/__tests__/playClickedLatch.test.ts lines 1-12 and 47-52 (source-pin style with `stripSourceComments` from `backend/testUtils/stripSourceComments`)
  </read_first>
  <behavior>
    `minimumSpinCallSites.test.ts` (describe named `refresh buttons route their spin through useMinimumSpin (261123-bbi)`). It reads each site's source through `stripSourceComments` and checks, for each of Humble Keys, Header, WineManager and ErrorComponent:
    - it imports `useMinimumSpin` from `frontend/hooks/useMinimumSpin`;
    - it calls `useMinimumSpin(` exactly once;
    - the local name that `onClickStart` is destructured to (or `onClickStart` itself) is called somewhere in the file;
    - at least one `fa-spin` class key reads the hook's spinning value.

    Per-site checks:
    - Header: `spinning: refreshButtonSpinning` is present, `isSteamSyncing && !refreshButtonSpinning` is still present, and the old plain-const definition is gone.
    - Humble Keys and WineManager: the raw-flag spin keys are gone.
    - ErrorComponent: `fa-spin` is present and the `refreshIcon` class is kept.

    The forbidden patterns are exactly the negative grep patterns in this task's and Task 1's verify blocks. Copy them from there. The docblock says honestly that the census pins these known sites only, and that a new refresh button which skips the hook is not detected (D-6).
  </behavior>
  <action>
    RED first. Write `src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts` as a table of entries: path, the per-site forbidden patterns, and the per-site required patterns. Run it. The Humble Keys entry passes from Task 1. The Header, WineManager and ErrorComponent entries fail.

    GREEN, one site at a time:

    Header (`src/frontend/components/UI/Header/index.tsx`):
    - `refreshButtonSpinning` is today a plain `const` OR of `refreshing` and `anyScopedRefresh`. Replace it with one `useMinimumSpin` call over that same OR, destructuring `spinning` as `refreshButtonSpinning` and `onClickStart` as `startRefreshSpin`. Keeping the name `refreshButtonSpinning` is deliberate: the button's `active` class, the icon's `fa-spin` and the hidden duplicate spinner's gate all keep reading it. So the single-spinner invariant now also holds during the click window.
    - Keep the quick 261030-qqh comment and add one sentence: the value also covers the 1 s after a click (quick 261123-bbi).
    - In the load-bearing JSX comment above the hidden spinner, add one line to its state list: during the 1 s after a click, the BUTTON spins and this spinner is hidden.
    - Do not change `isSteamSyncing` or any of its three OR arms (that comment explains why).
    - In the button's `onClick`, call `startRefreshSpin()` first. Then make the existing `refreshLibrary` call with byte-identical arguments (`checkForUpdates: true`, `origin: 'action-icons-refresh-button'`), awaited or returned so no new floating-promise warning appears.
    - Keep `data-tour="library-refresh"` on the icon. `headerTourAnchors.test.tsx` pins it.

    WineManager (`src/frontend/screens/WineManager/index.tsx`):
    - Call `useMinimumSpin(refreshingWineVersions)` once, next to the existing `useUiState.keys` read.
    - The toolbar icon's `fa-spin` reads the hook's spinning value.
    - `onClick` calls the start function, then `refreshWineVersions(true)`.
    - The "Loading wine versions..." info box and the empty-list text keep reading the real `refreshingWineVersions`. Only the icon gets the window.

    ErrorComponent (`src/frontend/components/UI/ErrorComponent/index.tsx`):
    - Read `refreshing` with `useLibraryState((s) => s.refreshing)` and call `useMinimumSpin(refreshing)`.
    - The `faSyncAlt` icon's className becomes `refreshIcon` plus `fa-spin` while spinning. Use `classnames` as the other sites do. Keep `refreshIcon`, because `index.css` and `tier2Portal.test.ts` depend on it.
    - `onClick` calls the start function first, then the existing `refreshLibrary` call with identical arguments (`checkForUpdates: true`, `runInBackground: false`, `origin: 'error-component-retry'`).
    - Do not touch `index.css`. The existing hover spin stays.

    Re-run the census and the existing Header, uiState and tier2Portal suites until they are green. Commit with explicit paths, all four files only: `feat(quick-261123-bbi): Library header, Wine Manager and error-screen refresh spin at least 1 s per click`.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/state/__tests__/uiState.test.ts src/frontend/screens/Library/__tests__/tier2Portal.test.ts 2>&1 | grep -E '^Test(s| Suites):'   # HEAD: minimumSpinCallSites.test.ts absent, other 3 suites passed / 62 tests. EXPECT: 4 suites passed, >62 tests, 0 failed</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/components/UI/Header/index.tsx | grep -c 'spinning: refreshButtonSpinning'   # [HEAD=0 EXPECT==1 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/components/UI/Header/index.tsx | grep -c 'isSteamSyncing && !refreshButtonSpinning'   # [HEAD=1 EXPECT==1 @73c354d89 GUARD MUTATION: drop the !refreshButtonSpinning gate on the hidden steamSyncSpinner in Header/index.tsx (~line 511), which brings back two identical spinners]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/components/UI/Header/index.tsx | grep -cE 'const refreshButtonSpinning = refreshing \|\| anyScopedRefresh'   # [HEAD=1 EXPECT==0 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/WineManager/index.tsx | grep -cE "'fa-spin': refreshingWineVersions"   # [HEAD=1 EXPECT==0 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/components/UI/Header/index.tsx | grep -c 'useMinimumSpin('   # [HEAD=0 EXPECT==1 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/WineManager/index.tsx | grep -c 'useMinimumSpin('   # [HEAD=0 EXPECT==1 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/components/UI/ErrorComponent/index.tsx | grep -c 'useMinimumSpin('   # [HEAD=0 EXPECT==1 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/components/UI/ErrorComponent/index.tsx | grep -c 'fa-spin'   # [HEAD=0 EXPECT>=1 @73c354d89]</automated>
    <automated>pnpm exec eslint --max-warnings 2 src/frontend/components/UI/Header/index.tsx src/frontend/screens/WineManager/index.tsx src/frontend/components/UI/ErrorComponent/index.tsx src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts   # HEAD: 2 pre-existing no-floating-promises warnings (Header index.tsx:171,175). EXPECT: exit 0</automated>
    <automated>pnpm -s codecheck   # HEAD exit 0. EXPECT exit 0</automated>
    <automated>npx prettier --check src/frontend/components/UI/Header/index.tsx src/frontend/screens/WineManager/index.tsx src/frontend/components/UI/ErrorComponent/index.tsx src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts</automated>
  </verify>
  <done>The Library header, Wine Manager toolbar and error-screen Refresh Library icons each spin for max(1 s from click, end of refresh) through one `useMinimumSpin` call. The Header still shows exactly one sync spinner in every state, because the hidden duplicate's gate reads the composed `refreshButtonSpinning`. `isSteamSyncing` is untouched, `refreshLibrary` arguments are byte-identical, and the Wine list's loading state still follows the real flag. The census passes for Humble Keys, Header, WineManager and ErrorComponent. The existing Header, uiState and tier2Portal suites are green. Committed with four explicit paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Game-page wiki refresh and Retry buttons through useMinimumSpin; close the todo</name>
  <files>src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx, src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx, src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts, .planning/todos/pending/2026-11-22-refresh-button-gives-no-click-feedback.md, .planning/todos/completed/2026-11-22-refresh-button-gives-no-click-feedback.md</files>
  <read_first>
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx lines 1-100 (imports, the local `refreshing` state at ~26, the hooks that must precede the early returns at ~94-100, `onClickRefresh` at ~85) and 185-202 (the IconButton)
    - src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx lines 28-42 and 70-85
    - src/frontend/screens/Game/GamePage/components/__tests__/gamelibFixDisplay.test.ts lines 42-62 (AppleWikiInfo lines that are pinned and must not change)
    - src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts (from Task 2)
  </read_first>
  <behavior>
    - The census gains AppleWikiInfo and WikiInfoEmptyState entries, with the same four generic checks as Task 2 and `fa-spin` required on each.
    - For AppleWikiInfo, the census also checks that `useMinimumSpin(` appears in the source before the first `return null`, so the call stays above the early returns (Rules of Hooks).
    - The census now covers six sites and passes. `gamelibFixDisplay.test.ts` and `gamePageTabs.test.ts` stay green with unchanged test counts (9 and 8).
  </behavior>
  <action>
    RED first. Add the AppleWikiInfo and WikiInfoEmptyState entries to `src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts`, including the AppleWikiInfo ordering check from the behavior block. Run it and confirm that the two new entries fail.

    GREEN.

    AppleWikiInfo (`src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx`):
    - Directly after the existing `refreshing` useState, and so above both early returns, call `useMinimumSpin(refreshing)`. Destructure into local names such as `ratingSpinning` and `startRatingSpin`.
    - In `onClickRefresh`, keep `stopPropagation()` and `preventDefault()` first (they stop the parent CodeWeavers link). Then call the start function, then keep the existing `setRefreshing` / await / finally body unchanged.
    - The MUI `Refresh` icon inside the IconButton gets `fa-spin` while the hook says spinning (D-4). Use `classnames` or a conditional string.
    - The IconButton's `disabled` stays on `refreshing` (D-3).
    - Change nothing the `gamelibFixDisplay.test.ts` pins.

    WikiInfoEmptyState (`src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx`):
    - Call `useMinimumSpin(refreshing)` after the existing `refreshing` useState.
    - `onRetry` calls the start function first, then keeps its existing body.
    - The startIcon `Refresh` gets `fa-spin` while spinning.
    - `disabled` stays on `refreshing`.

    Re-run the census plus `gamelibFixDisplay.test.ts` and `gamePageTabs.test.ts` until they are green. Commit the three code and test paths explicitly: `feat(quick-261123-bbi): game-page wiki refresh and Retry spin at least 1 s per click`.

    Then close the todo:
    1. `git mv .planning/todos/pending/2026-11-22-refresh-button-gives-no-click-feedback.md .planning/todos/completed/`. The working-tree content moves with it, including the operator's uncommitted 2026-11-23 correction.
    2. In the moved file's frontmatter, add `resolved: 2026-11-23` and `resolution: quick 261123-bbi`.
    3. Append a `## Resolution` section covering:
       - the shared hook and its rule;
       - the six sites wired;
       - the out-of-scope list from this plan with each reason;
       - that disabled states still follow the real busy flag;
       - the three code commit SHAs;
       - that the Humble Keys acceptance case is proven by the `261123-bbi` component test, and a live look on the running app is optional (the todo is `ready: code`).
    4. `git add` both the old and the new todo path explicitly.
    5. Commit only those: `docs(quick-261123-bbi): close the refresh-button click-feedback todo`.

    Finally run `graphify update .`.
  </action>
  <verify>
    <automated>pnpm exec jest --runTestsByPath src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts src/frontend/screens/Game/GamePage/components/__tests__/gamelibFixDisplay.test.ts src/frontend/screens/Game/GamePage/__tests__/gamePageTabs.test.ts 2>&1 | grep -E '^Test(s| Suites):'   # HEAD: census covers 4 sites after Task 2; gamelibFixDisplay 9 + gamePageTabs 8 tests. EXPECT: 3 suites passed, 0 failed</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx | grep -c 'useMinimumSpin('   # [HEAD=0 EXPECT==1 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx | grep -c 'fa-spin'   # [HEAD=0 EXPECT>=1 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx | grep -c 'useMinimumSpin('   # [HEAD=0 EXPECT==1 @73c354d89]</automated>
    <automated>grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx | grep -c 'fa-spin'   # [HEAD=0 EXPECT>=1 @73c354d89]</automated>
    <automated>pnpm exec eslint --max-warnings 0 src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts   # HEAD: 0 warnings in the two components. EXPECT: exit 0</automated>
    <automated>pnpm -s codecheck   # HEAD exit 0. EXPECT exit 0</automated>
    <automated>npx prettier --check src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx src/frontend/screens/Game/GamePage/components/WikiInfoEmptyState.tsx src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts   # the two .planning/todos paths are prettier-ignored, so they are omitted on purpose</automated>
    <automated>grep -c '^resolution: quick 261123-bbi' .planning/todos/completed/2026-11-22-refresh-button-gives-no-click-feedback.md   # [HEAD=error:2 EXPECT==1 @73c354d89]</automated>
    <automated>test -e .planning/todos/pending/2026-11-22-refresh-button-gives-no-click-feedback.md; echo $?   # HEAD 0 (file in pending/). EXPECT 1 (moved)</automated>
    <automated>pnpm -s planning-gates 2>&1 | tail -1   # HEAD and EXPECT: "12/12 planning gates passed."</automated>
  </verify>
  <done>The AppleWikiInfo rating refresh and the WikiInfoEmptyState Retry icons spin for max(1 s from click, end of refresh). The hook sits above AppleWikiInfo's early returns, and `disabled` is unchanged. The census covers all six sites and passes. The pinned AppleWikiInfo lines are untouched. The todo is in `completed/` with `resolved`/`resolution` frontmatter and a Resolution section, the operator's correction is kept, and it is committed alone by explicit path. `graphify update .` has been run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Renderer-local presentational state only. No IPC argument, store field, setting, file or network call is added or changed. The existing `humbleSync`, `refreshLibrary`, `refreshWineVersions` and `refreshWikiInfo` calls keep their arguments byte-identical |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-bbi-01 | Denial of Service | `useMinimumSpin` timer | low | mitigate | One timer per hook instance. A re-click clears the previous one through the effect cleanup, and unmount clears it. Both are proven by the hook test (`jest.getTimerCount()` falls at unmount; restart case) |
| T-bbi-02 | Denial of Service | repeated refresh clicks | low | accept | The window disables nothing (D-3), so click-to-IPC behaviour is exactly today's. Humble's sync cooldown and the existing `disabled` busy gates still apply |
| T-bbi-03 | Repudiation / misleading UI | spin outliving the work | low | accept | The tail is at most `MIN_SPIN_MS` (1 s) and only after an explicit click. Busy periods with no click get no tail (D-2, tested) |
| T-bbi-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed. `@testing-library/react` 14 and `jest-environment-jsdom` 29.7.0 are already devDependencies used by existing tests |
</threat_model>

<verification>
- All three tasks' `<verify>` blocks pass.
- Full touched-suite run: `pnpm exec jest --runTestsByPath src/frontend/hooks/__tests__/useMinimumSpin.test.ts src/frontend/hooks/__tests__/minimumSpinCallSites.test.ts src/frontend/screens/Humble/Keys/__tests__/index.test.tsx src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/state/__tests__/uiState.test.ts src/frontend/screens/Library/__tests__/tier2Portal.test.ts src/frontend/screens/Game/GamePage/components/__tests__/gamelibFixDisplay.test.ts src/frontend/screens/Game/GamePage/__tests__/gamePageTabs.test.ts`. Expect 8 suites passed and 0 failed. At HEAD it was 6 suites and 126 tests.
- `pnpm -s codecheck` exit 0. `pnpm -s find-deadcode` prints `PASS`, with no finding that is new against `meta/knip-baseline.txt`.
- `git log --name-only` over this plan's four commits (pin them by SHA, because another session may commit in between) shows only `files_modified` paths. None of the pre-existing dirty files (`src/backend/cache.ts`, gog `library.ts`, the sidecar handlers, `store_embed/controls.rs`, `.planning/state.json`, ...) appears in any commit.
</verification>

<success_criteria>
- Humble Keys acceptance: with the sync returning at once (`humble.syncing` never true), a Refresh click keeps the `spinning` class and the icon's `fa-spin` for 1000 ms, proven by the `261123-bbi` component test.
- All six refresh buttons spin for max(1 s from click, end of refresh) through the single `useMinimumSpin` hook. A busy period nobody clicked for spins exactly as it does today.
- The Library header shows exactly one sync spinner in every state. Disabled states are unchanged.
- The todo is closed in `completed/` with a Resolution, and the operator's correction is kept.
- Code and docs are committed separately by explicit path. No unrelated dirty file is staged.

## Source coverage audit

| Source | Item | Covered by |
|---|---|---|
| GOAL (todo) | every refresh click spins at least ~1 s and keeps spinning while running | Task 1 (hook), Tasks 1-3 (sites) |
| GOAL (todo) | one shared hook or helper, minimum in one place | Task 1 (`MIN_SPIN_MS`, `useMinimumSpin`) |
| GOAL (todo) | acceptance: Humble Keys instant sync visibly spins ~1 s | Task 1 (component test) |
| GOAL (todo) | Library header (`action-icons-refresh-button`) | Task 2 |
| GOAL (todo) | Wine Manager | Task 2 |
| GOAL (todo) | Apple wiki info `onClickRefresh` | Task 3 |
| GOAL (todo) | "any others found" | Task 2 (ErrorComponent), Task 3 (WikiInfoEmptyState); exclusions with reasons in `<context>` |
| ORCHESTRATOR | hook unit test with jest fake timers, plus Humble Keys component test | Task 1 |
| ORCHESTRATOR | the hidden duplicate spinner keyed on `!refreshButtonSpinning` stays correct | Task 2 (name kept and composed; gate grep + census) |
| ORCHESTRATOR | stage only own files | `<context>` working-tree rules, every task's commit step, `<verification>` |
| CONVENTION | `npx prettier --check` over exact written paths | every `<verify>` |
</success_criteria>

<output>
Create `.planning/quick/261123-bbi-refresh-buttons-spin-at-least-1s-per-cli/261123-bbi-SUMMARY.md` when done. It records the four commit SHAs, the six wired sites, the out-of-scope list with reasons, and the measured suite counts before and after.
</output>
