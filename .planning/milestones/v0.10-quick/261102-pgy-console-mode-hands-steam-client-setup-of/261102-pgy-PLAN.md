---
phase: quick-261102-pgy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/state/InstallGameModal.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
  - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
  - src/frontend/screens/ConsoleMode/index.tsx
  - src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts
  - public/locales/en/gamelib.json
  - src/frontend/state/SteamClientSetup.ts
  - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
  - src/common/types/ipc.ts
  - .planning/todos/pending/2026-11-02-console-mode-steam-client-setup-unreachable.md
  - .planning/todos/completed/2026-11-02-console-mode-steam-client-setup-unreachable.md
autonomous: true
requirements: [TODO-2026-11-02-console-mode-steam-client-setup-unreachable]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "In Console Mode, when the Steam quick-install pre-check lands on library-missing AND steamClientSetupRecheck reports needs-install or needs-launch with no error, the D-29 terminal card shows a second, gamepad-focusable action, 'Set up Steam in desktop mode', and the controller lands on it. The card's title and library-missing copy are unchanged."
    - "Activating that action (A button, Enter/Space, or a click) opens the useSteamClientSetup store with the game's appName and reason 'install' (needs-install) or 'launch-once' (needs-launch), and only then leaves /console via ConsoleMode's existing quit path (navigate('/')). The desktop SteamClientSetup dialog, mounted only in App.tsx's non-console branch, renders on its first render because the store is already open."
    - "A library-missing verdict whose recheck says the client is ready, carries an error, or rejects, and every library-full or ok verdict, gets exactly today's card: one always-active Dismiss chip and no hand-off action. library-full, ok, 0-library and appName-less probes never call the recheck."
    - "Dismissing a client-cause card (B, Escape, Backspace, A or a click on Dismiss), or the overlay unmounting any other way without the hand-off, closes the store the recheck's backend push opened under /console, so no stray desktop client-setup dialog appears when the user later leaves Console Mode."
    - "Non-Steam Console Mode installs and the desktop quick install behave exactly as before. The desktop library-missing gate and the Console Mode probe share ONE definition of the client-cause predicate."
    - "The todo moves to .planning/todos/completed/ and records the operator decision (Hand off to desktop, 2026-11-02; the console-native card and accept-the-copy options rejected), the fix commits, and the controller live gate still owed."
  artifacts:
    - path: "src/frontend/state/InstallGameModal.ts"
      provides: "Exported steamClientSetupCause(appName): the one client-cause predicate; steamClientSetupPending becomes its boolean view"
      contains: "steamClientSetupCause"
    - path: "src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts"
      provides: "probe verdict carries clientSetup; 'setupSteam' FocusKey and 'handoff' intent; handOffSteamClientSetupToDesktop; releaseUnclaimedSteamClientSetup"
      contains: "handOffSteamClientSetupToDesktop"
    - path: "src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx"
      provides: "The client-cause card's hand-off chip, its focus wiring, and the unclaimed-store release"
      contains: "onExitConsole"
    - path: "src/frontend/screens/ConsoleMode/index.tsx"
      provides: "InstallOverlay receives ConsoleMode's existing quit as onExitConsole"
      contains: "onExitConsole={quit}"
    - path: "src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts"
      provides: "Specs pinning the client-cause verdict, the non-client fall-throughs, the handoff intent, the store hand-off and release, and the overlay/ConsoleMode wiring gates"
      contains: "261102-pgy"
    - path: "public/locales/en/gamelib.json"
      provides: "consoleMode.steamClientSetupHandOff"
      contains: "steamClientSetupHandOff"
    - path: ".planning/todos/completed/2026-11-02-console-mode-steam-client-setup-unreachable.md"
      provides: "Decision and fix record"
      contains: "261102-pgy"
  key_links:
    - from: "consoleSteamTarget.ts probeSteamQuickInstallTarget (library-missing branch)"
      to: "InstallGameModal.ts steamClientSetupCause -> window.api.steamClientSetupRecheck -> backend ensureSteamClientReady (src/backend/storeManagers/steam/clientSetup.ts)"
      via: "verdict.clientSetup = 'install' | 'launch-once' only for needs-install / needs-launch with no error"
      pattern: "steamClientSetupCause"
    - from: "InstallOverlay/index.tsx hand-off chip (FocusKey 'setupSteam', intent 'handoff')"
      to: "handOffSteamClientSetupToDesktop -> useSteamClientSetup.open(appName, clientSetup) -> onExitConsole = ConsoleMode quit -> navigate('/') -> App.tsx non-console branch mounts SteamClientSetup with isOpen already true"
      via: "store opened BEFORE the route change; the overlay's unmount release is skipped once handed off"
      pattern: "handOffSteamClientSetupToDesktop"
    - from: "backend steamClientSetupRequired push (sent by the recheck itself)"
      to: "useSteamClientSetup opened under /console with nothing rendered"
      via: "releaseUnclaimedSteamClientSetup on overlay unmount when not handed off (Task 2)"
      pattern: "releaseUnclaimedSteamClientSetup"
---

<objective>
Resolve `.planning/todos/pending/2026-11-02-console-mode-steam-client-setup-unreachable.md` with the
operator's locked decision (2026-11-02): **Hand off to desktop.** The two other options — a
console-native client-setup card, and accepting the corrected card copy — were rejected and must
not appear in this work.

Console Mode's Steam quick install currently shows the D-29 "library couldn't be found" card even
when the real cause is a missing or never-launched Steam client, because `SteamClientSetup` is
mounted only in `App.tsx`'s non-console branch. After this plan, the card detects the client
cause with the same backend recheck the desktop quick install uses (D-UAT-15, quick 261102-21x),
offers "Set up Steam in desktop mode", and on activation opens the store and leaves Console Mode
so the desktop D-10 (install) / D-11 (launch-once) dialog runs.

Purpose: a couch user with no Steam client gets a guided way forward instead of a dead-end card.
Output: the hand-off path, the stray-dialog release, one new en catalog key, specs, and the todo
moved to completed with the decision and fix recorded.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/todos/pending/2026-11-02-console-mode-steam-client-setup-unreachable.md
@src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
@src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
@src/frontend/state/SteamClientSetup.ts
@src/frontend/state/InstallGameModal.ts

Facts established while planning (re-check line numbers before editing; they are from HEAD c1fe7003e):

- `steamClientSetupRecheck(appId)` (`src/common/types/ipc.ts:414`) returns
  `{ status: 'ready' | 'needs-install' | 'needs-launch'; ready: boolean; error?: string }`. It is
  backed by `ensureSteamClientReady` (`src/backend/storeManagers/steam/clientSetup.ts:116`), which
  **sends the `steamClientSetupRequired` push itself** before returning needs-install (reason
  `install`) or needs-launch (reason `launch-once`). A non-numeric appId returns needs-install
  with `error` and sends no push.
- That push is subscribed once in `GlobalState.tsx` (which wraps BOTH App branches) via
  `handleSteamClientSetupRequiredSignal`, so calling the recheck under `/console` opens the
  `useSteamClientSetup` store with nothing rendered. Unless the overlay closes it, the desktop
  dialog pops up when the user later leaves Console Mode. Task 2 exists for this.
- Desktop (`src/frontend/state/InstallGameModal.ts:233`, module-private `steamClientSetupPending`)
  treats the client as the cause only for `ready === false && error === undefined && status in
  {needs-install, needs-launch}`, fail-open on rejection. Console Mode must use the same predicate.
- `useSteamClientSetup` is a module-global zustand store. `SteamClientSetup.tsx` is mounted
  permanently in the non-console branch, returns null while closed, and its reset effect runs on
  mount keyed on `[isOpen, appName, reason]`. A store opened before the route change is therefore
  rendered on the component's first render. `SteamClientSetup.waitingDialog.test.tsx` W0 (install →
  consent) and W1 (launch-once → waiting) already pin that first render, starting from an open store.
- ConsoleMode's exit path is `const quit = useCallback(() => navigate('/'), [navigate])`
  (`src/frontend/screens/ConsoleMode/index.tsx:241`). `InstallOverlay` is rendered at about line
  551 with `game` and `onDismiss` only, and nothing else imports it.
- The frontend jest project is `testEnvironment: 'node'` with no jsdom, and
  `InstallOverlay/index.tsx` imports `./index.scss`. The overlay cannot be rendered in a test.
  `consoleSteamTarget.test.ts` therefore tests the pure functions in `consoleSteamTarget.ts` and
  gates the overlay's wiring shape over `stripSourceComments` text. Every gate is a THROWING helper
  with a RED specimen derived from the real source (34.13 review C-08 idiom). Follow that idiom.
- Existing overlay gates that new code must keep green: D7 allows exactly ONE `\breason\b` in the
  comment-stripped `index.tsx`, so no new identifier, object key or string in `index.tsx` may be
  the bare word "reason". `clientSetupHandOff` and `clientSetup` are safe because word boundaries
  do not split camelCase. D3 allows zero `libraryPath`, D6 exactly one `install({`, and D2 allows no
  options door. B4 requires `resolveConsoleActionIntent` to destructure EXACTLY `{runner, focused}`,
  and A6 requires `verdict.degrade` to carry exactly `{reason, libraryPath}`, so the client cause
  must sit on the verdict, not inside `degrade`.
- i18n: console card strings use `tGamelib('gamelib:consoleMode.<key>', '<English default>')`,
  the `[key, default]` shape `hardcodedStringGate.ts` exempts. Quick 261102-21x added only the
  `public/locales/en/gamelib.json` entry and no other locale. `consoleMode` keys there are sorted
  alphabetically with 4-space indentation. `lint-translations:gamelib` is red at HEAD (2640 hard
  failures) and not in CI, so do not use it as a gate. CI runs `i18n-churn-guard`.
- Baselines measured at HEAD on this Windows box: the four jest suites named in the verify blocks
  pass (103 + 14 tests). ESLint over every code path this plan touches reports 0 errors and 0
  warnings. Prettier is clean on all code paths. `python meta/runPlanningGates.py` FAILs only
  `state-sdk-field-anchor-gate.py`. `node meta/findDeadcode.cjs` exits 0. ~40 unrelated suites
  fail locally (operator memory), so run only targeted suites.
- `npx prettier --file-info` reports `public/locales/en/gamelib.json` and both todo paths as
  `{ "ignored": true, "inferredParser": null }`. A `--check` over them would be vacuous, so it is
  omitted for those paths and replaced by a file-info probe. All `src/` paths report
  `"ignored": false` (typescript) and are checked for real.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): client-cause card hands Steam client setup off to desktop mode, end to end</name>
  <files>src/frontend/state/InstallGameModal.ts, src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts, src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx, src/frontend/screens/ConsoleMode/index.tsx, src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts</files>
  <behavior>
    Write these specs first in `consoleSteamTarget.test.ts` and watch the new ones fail. Name each `it` with a `261102-pgy` tag. Extend `stubWindowApi` with a `steamClientSetupRecheck` override that defaults to `jest.fn().mockResolvedValue({ status: 'ready', ready: true })`, so every existing spec keeps its meaning.
    - A10: one library, `validPath: false`, recheck resolves `{ status: 'needs-install', ready: false }`, probe called with '570': the verdict `toEqual`s `{ ok: false, degrade: { reason: 'library-missing', libraryPath: targets[0].path }, clientSetup: 'install' }`, and the recheck was called exactly once, with '570'.
    - A11: the same with `{ status: 'needs-launch', ready: false }` gives `clientSetup: 'launch-once'`.
    - A12 (non-client causes keep today's card): for each of a `{ status: 'ready', ready: true }` recheck, a `{ status: 'needs-install', ready: false, error: 'Invalid appId' }` recheck, and a rejected recheck, the verdict is still not ok, still `library-missing`, and `not.toHaveProperty('clientSetup')`. The probe never rejects.
    - A13 (no extra round-trip): library-full (`free` below the floor), an ok disk, 0 libraries, and a library-missing probe called with NO appName all leave the recheck mock uncalled, and none of those verdicts has `clientSetup`.
    - B5: `resolveConsoleActionIntent({ runner: 'steam', focused: 'setupSteam' })` is 'handoff'. For every runner in NON_STEAM_RUNNERS, `focused: 'setupSteam'` is 'none'. Re-word B2's description to name the hand-off key as the one exception; its four-key list and assertions stay as they are. B4 still passes untouched.
    - H1: after resetting the real store with `useSteamClientSetup.setState({ isOpen: false, appName: undefined, reason: undefined })`, `handOffSteamClientSetupToDesktop('570', 'install', exitConsole)` leaves the store `{ isOpen: true, appName: '570', reason: 'install' }`, and `exitConsole` was called exactly once. `exitConsole` is a `jest.fn` whose implementation snapshots `useSteamClientSetup.getState()`; assert that the snapshot was already open with '570'/'install'. This pins open-before-navigation.
    - H2: the same for 'launch-once'.
    - D9, through a new throwing helper `assertClientSetupHandOffWired(source)` over the stripped overlay. The source must match `/handOffSteamClientSetupToDesktop\(\s*game\.app_name,\s*clientSetupHandOff,\s*onExitConsole\s*\)/`. It must match `/\{\s*clientSetupHandOff\s*&&\s*\(/` (the chip renders only when the hand-off is offered). It must contain `'gamelib:consoleMode.steamClientSetupHandOff'`. `setClientSetupHandOff(` must appear exactly once, matching `/setClientSetupHandOff\(\s*verdict\.clientSetup\s*\?\?\s*null\s*\)/` (only the verdict writes the state). `useSteamClientSetup` must appear zero times (the overlay reaches the store only through tested helpers). D9 passes on the real source. D9-RED-a: the real source with the conditional opener replaced by a bare `{(` throws. D9-RED-b: the real source with the hand-off call replaced by `useSteamClientSetup.getState().open(game.app_name, clientSetupHandOff)` throws.
    - D10, through a throwing helper `assertConsoleExitWired(source)` over the stripped `src/frontend/screens/ConsoleMode/index.tsx`. The source must contain `const quit = useCallback(() => navigate('/'), [navigate])` and `onExitConsole={quit}`. D10-RED: the real source with `onExitConsole={quit}` replaced by `onExitConsole={() => undefined}` throws.
    - Every existing spec (A1-A9, B1-B4, C*, D1-D8 and their REDs) still passes. D7 in particular must still count exactly one `reason`.
  </behavior>
  <action>
Implements the locked operator decision "Hand off to desktop" (2026-11-02). Do not build a console-native client-setup surface, and do not change the existing card copy.

1. `src/frontend/state/InstallGameModal.ts`: add an exported async function `steamClientSetupCause(appName: string): Promise<'install' | 'launch-once' | undefined>`. It calls `window.api.steamClientSetupRecheck(appName)` and returns `'install'` for needs-install and `'launch-once'` for needs-launch, but only when `ready === false` and `error === undefined`. It returns `undefined` for anything else and for a rejection, and it never throws. Re-express the module-private `steamClientSetupPending` as `(await steamClientSetupCause(appName)) !== undefined`, so desktop and Console Mode share one predicate. Group U (U1-U8) must pass unchanged. Rewrite the helper's doc comment. It is no longer "module-private on purpose": the predicate is exported because Console Mode's probe consumes it. The literals mirror the reason values `ensureSteamClientReady` pushes (`clientSetup.ts`), and the store's `open()` type-checks them at the hand-off call site. Keep the fail-open wording.

2. `src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts`:
   - Export `type ConsoleClientSetupHandOff = NonNullable<Awaited<ReturnType<typeof steamClientSetupCause>>>`. Derive it; never re-declare the union.
   - Widen the not-ok arm of `ConsoleSteamVerdict` with an optional `clientSetup?: ConsoleClientSetupHandOff`.
   - In `probeSteamQuickInstallTarget`, after `evaluateQuickInstallTarget` gives a not-ok `library-missing` verdict AND `appName` is defined, await `steamClientSetupCause(appName)`. If it returns a value, return the verdict spread with `clientSetup` set. Otherwise return the verdict unchanged, so the key is absent and not set to undefined. No other branch calls the recheck.
   - Add `'setupSteam'` to `ConsoleFocusKey`.
   - In `resolveConsoleActionIntent`, the Steam branch returns `'handoff'` when `focused === 'setupSteam'` and `'dismiss'` otherwise. Widen the return type with `'handoff'`. Keep the destructure exactly `{ runner, focused }` (B4). Non-Steam logic is unchanged, and an unknown key still falls to `'none'`. Update the doc comment: the Steam branch still renders no install control on any path. A dismisses unless focus sits on the client-cause card's hand-off chip, which is itself a way out (to desktop mode).
   - Add an exported `handOffSteamClientSetupToDesktop(appName: string, clientSetup: ConsoleClientSetupHandOff, exitConsole: () => void): void`. It calls `useSteamClientSetup.getState().open(appName, clientSetup)` FIRST and `exitConsole()` SECOND. Its doc comment explains the order. The store is module-global. The desktop `SteamClientSetup` mounts with App.tsx's non-console branch after the route change and renders from an already-open store on its first render (W0/W1 in `SteamClientSetup.waitingDialog.test.tsx`), so opening first leaves no window in which the desktop branch renders with the store closed. The explicit open also makes the hand-off independent of when the backend push lands. Import `useSteamClientSetup` from `frontend/state/SteamClientSetup`.
   - Rewrite the module doc comment's second paragraph (currently "It also does NOT run the D-UAT-15 client-setup recheck…"). It now says the library-missing branch DOES run the shared recheck. On a client cause, the card offers a hand-off to desktop mode, where `SteamClientSetup` is mounted (operator decision 2026-11-02, todo `2026-11-02-console-mode-steam-client-setup-unreachable`). The recheck's own push opens the store under `/console` with nothing rendered, which is why the overlay releases a store it did not hand off (Task 2). Keep the D-29 "no options door" paragraph as it is.

3. `src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx`:
   - Add a required prop `onExitConsole: () => void`.
   - Add state `clientSetupHandOff` (`ConsoleClientSetupHandOff | null`, initially null) and a `setupSteamButtonRef`.
   - In the Steam probe `.then` not-ok branch, alongside `setSteamBlocked(verdict.degrade)`, call `setClientSetupHandOff(verdict.clientSetup ?? null)`. That is the only write (D9). When `verdict.clientSetup` is set, also call `setFocused('setupSteam')`, so the controller lands on the remedy. This matches ConfirmDialog's confirm-first default and the overlay's own Install-first default. The cancelled early-return and the ok branch are unchanged.
   - `visibleRows`: when `game.runner === 'steam'` and `clientSetupHandOff` is set, the rows are exactly `['cancel', 'setupSteam']`, primary action last as in the non-Steam `['cancel', 'install']`. Otherwise the rows are unchanged. Add both values to the memo deps.
   - Generalize the ArrowLeft/ArrowRight button-row branch to toggle between the LAST TWO `visibleRows` when `focused` is one of them. For the non-Steam rows that is exactly today's cancel/install toggle.
   - Map `'setupSteam'` to `setupSteamButtonRef` in the focus effect.
   - Guard the D-29 "land on Dismiss" effect with `!clientSetupHandOff` and add that to its deps. Without the guard it runs after the focus effect in the same commit and steals focus back to Dismiss.
   - Add a `handOff` function that returns early if `clientSetupHandOff` is null, and otherwise calls `handOffSteamClientSetupToDesktop(game.app_name, clientSetupHandOff, onExitConsole)`.
   - Route intent `'handoff'` to `handOff()` in BOTH the gamepad A handler and the Enter/Space keydown branch. Add `handOff` to both `handlersRef` objects.
   - In the steamBlocked card's button row, the Dismiss chip gets `className={classNames('consoleChip', { active: !clientSetupHandOff || focused === 'cancel' })}` (the no-hand-off card stays one always-active chip) and `onMouseEnter`/`onFocus` set `'cancel'`. After Dismiss, render the hand-off chip inside `{clientSetupHandOff && (...)}`: a `button` with `ref={setupSteamButtonRef}`, `classNames('consoleChip', { active: focused === 'setupSteam' })`, `onClick={handOff}`, `onMouseEnter`/`onFocus` setting `'setupSteam'`, and label `tGamelib('gamelib:consoleMode.steamClientSetupHandOff', 'Set up Steam in desktop mode')`.
   - Update the D-29 card's JSX comment. "no new FocusKey" becomes: the client-cause card adds only the `setupSteam` hand-off chip, whose sole effect is leaving for desktop setup. There is still no platform, wine or path row, no install control, and no options door.
   - Do not write the bare word "reason" anywhere in this file's code or strings (D7). Do not interpolate any path (D3).

4. `src/frontend/screens/ConsoleMode/index.tsx`: pass `onExitConsole={quit}` to `<InstallOverlay ... />`. Reuse the existing `quit`, the one definition of "leave Console Mode", and do not add a second navigate call.

5. Commits: `test(quick-261102-pgy): …` for the RED specs, then `feat(quick-261102-pgy): …` for the implementation. End each with the Co-Authored-By trailer from the session's attribution reminder.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts src/frontend/state/__tests__/InstallGameModal.test.ts src/frontend/state/__tests__/SteamClientSetup.test.ts src/frontend/screens/Game/GamePage/components/__tests__/SteamClientSetup.waitingDialog.test.tsx && npx tsc --noEmit && npx eslint --max-warnings 0 src/frontend/state/InstallGameModal.ts src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx src/frontend/screens/ConsoleMode/index.tsx src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts && grep -q '261102-pgy' src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts && npx prettier --check src/frontend/state/InstallGameModal.ts src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx src/frontend/screens/ConsoleMode/index.tsx src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts   # end-to-end as far as this node-only jest project reaches: probe verdict -> intent -> store hand-off -> exit callback (pure specs), overlay and ConsoleMode wiring (stripped-source gates), the prop chain (tsc). The visible TV render with a real controller is the live gate recorded in Task 3. All five paths report "ignored": false, so the prettier check is real.</automated>
  </verify>
  <done>A10-A13, B5, H1-H2, D9 (+2 REDs) and D10 (+RED) pass and were seen failing before the implementation. Every pre-existing spec in the four suites still passes, including D7 (one `reason`), D3, D6, A6 and B4. `tsc` exits 0. ESLint reports 0 errors and 0 warnings over the five paths, and prettier is clean on them. A `test(...)` and a `feat(...)` commit, both scoped `quick-261102-pgy`, exist.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: a dismissed client-cause card leaves no stray desktop dialog; catalog the new string</name>
  <files>src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts, src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx, src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts, public/locales/en/gamelib.json</files>
  <behavior>
    Write these first. Tag each with `261102-pgy`.
    - H3: with the real store, `releaseUnclaimedSteamClientSetup('570')` closes it when it is open for '570' (`isOpen` false afterwards). It leaves a store open for '999' open and untouched (appName and reason unchanged). On a closed store it is a no-op.
    - D11, through a throwing helper `assertUnclaimedSetupReleased(source)` over the stripped overlay. `/releaseUnclaimedSteamClientSetup\(\s*game\.app_name\s*\)/g` must match exactly 2 times (the in-flight cancelled branch and the effect cleanup). `!handedOffRef.current` must be present (the cleanup guard). `handedOffRef.current = true` must appear textually BEFORE the `handOffSteamClientSetupToDesktop(` call. D11 passes on the real source. D11-RED-a: the real source with `handedOffRef.current = true` removed throws. D11-RED-b: the real source with one release call renamed to a non-matching identifier throws.
    - I1: the en catalog value `consoleMode.steamClientSetupHandOff` (read from `public/locales/en/gamelib.json` with `readFileSync` + `JSON.parse`) is byte-identical to the overlay's in-code default. Extract the default from the RAW `index.tsx` with a regex on `'gamelib:consoleMode.steamClientSetupHandOff',\s*'([^']+)'`, and require the match to be non-null so the spec cannot pass vacuously.
    - D9 and D10 from Task 1 still pass, so does every earlier spec, and the H1 ordering snapshot still holds.
  </behavior>
  <action>
Closes the stray-dialog half of the todo's "Why not" paragraph. The recheck's own backend push opens the store under `/console`. If the user dismisses the card instead of handing off, that store must not survive into desktop mode.

1. `consoleSteamTarget.ts`: add an exported `releaseUnclaimedSteamClientSetup(appName: string): void`. It reads `useSteamClientSetup.getState()` and calls `close()` only when `isOpen` is true and the store's `appName` equals the argument, so it never closes a setup session some other flow opened for a different game. The doc comment names the cause: `ensureSteamClientReady` pushes `steamClientSetupRequired` while answering the probe's recheck, and nothing under `/console` renders `SteamClientSetup`.

2. `index.tsx`:
   - Add `handedOffRef = useRef(false)`.
   - In `handOff`, set `handedOffRef.current = true` immediately before the `handOffSteamClientSetupToDesktop(...)` call. Navigation unmounts this overlay, so the flag must be set before the cleanup can observe it.
   - In the Steam probe effect, declare a local `let clientSetupSeen = false` beside `cancelled`.
   - In the `.then`, replace the bare cancelled early-return with a block. When the verdict is not ok and carries `clientSetup`, the block calls `releaseUnclaimedSteamClientSetup(game.app_name)` and then returns. That case is the overlay unmounting while the recheck was in flight, after its push may have opened the store.
   - On the not-ok path, set `clientSetupSeen = true` when `verdict.clientSetup` is set.
   - In the effect cleanup, after the existing `cancelled`/timer lines, call `releaseUnclaimedSteamClientSetup(game.app_name)` when `clientSetupSeen && !handedOffRef.current`.
   - This one unmount site covers every exit path: B, Escape, Backspace, A on Dismiss, a click on Dismiss, and the global console toggle in `gamepad.ts`. The `onDismiss` call sites stay as they are. The existing `react-hooks/exhaustive-deps` disable on the deps line stays. Reading `handedOffRef.current` in cleanup is lint-clean because the file assigns `.current` itself.
   - Keep D7 (no bare "reason") and D3 (no path).

3. `public/locales/en/gamelib.json`: add `"steamClientSetupHandOff": "Set up Steam in desktop mode"` under `consoleMode`, in its alphabetical slot. That slot is after `sortDescending` and before `steamInstallBlockedTitle`. Match the file's 4-space indentation and trailing-comma layout by hand, because prettier ignores this path. Add no other locale, following the 261102-21x precedent.

4. Commits: `test(quick-261102-pgy): …` then `fix(quick-261102-pgy): …`, each ending with the Co-Authored-By trailer.
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend --runTestsByPath src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts src/frontend/state/__tests__/InstallGameModal.test.ts src/frontend/state/__tests__/SteamClientSetup.test.ts src/frontend/screens/Game/GamePage/components/__tests__/SteamClientSetup.waitingDialog.test.tsx && npx tsc --noEmit && npx eslint --max-warnings 0 src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts && node -e "JSON.parse(require('fs').readFileSync('public/locales/en/gamelib.json','utf8'))" && node meta/runTs.cjs --bundle --platform=node --target=node21 meta/i18nCatalogChurnGuard.ts && node meta/findDeadcode.cjs && npx prettier --check src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts && npx prettier --file-info public/locales/en/gamelib.json | grep -Eq '"ignored":[[:space:]]*true'   # prettier: gamelib.json is under public/locales/, which --file-info reports ignored (inferredParser null), so --check over it would be vacuous and is omitted; the JSON parse plus spec I1 prove the catalog entry. The three src/ paths are checked for real. findDeadcode covers every export added in Tasks 1-2.</automated>
  </verify>
  <done>H3, D11 (+2 REDs) and I1 pass and were seen failing first. All Task 1 specs and every pre-existing spec still pass. `tsc` exits 0, and ESLint reports 0 errors and 0 warnings on the three paths. The catalog parses, and `i18n-churn-guard` and `findDeadcode` both exit 0. Prettier is clean on the three `src/` paths. `test(...)` and `fix(...)` commits scoped `quick-261102-pgy` exist.</done>
</task>

<task type="auto">
  <name>Task 3: correct the "opened only by the backend push" comments and move the todo to completed with the decision and fix</name>
  <files>src/frontend/state/SteamClientSetup.ts, src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx, src/common/types/ipc.ts, .planning/todos/pending/2026-11-02-console-mode-steam-client-setup-unreachable.md, .planning/todos/completed/2026-11-02-console-mode-steam-client-setup-unreachable.md</files>
  <action>
1. Comment-only edits. Their claims become false or incomplete after Tasks 1-2.
   - `src/frontend/state/SteamClientSetup.ts`, around lines 17-24: the store is opened by the backend `steamClientSetupRequired` push (GlobalState.tsx) OR by Console Mode's hand-off (`handOffSteamClientSetupToDesktop`, `consoleSteamTarget.ts`). The hand-off reopens it with the appName and reason the backend's own recheck just reported. The decision stays backend-owned and is still never made by a frontend eligibility check. Add one sentence on `releaseUnclaimedSteamClientSetup`: under `/console` nothing renders the store, so the overlay closes a push-opened session it did not hand off.
   - `src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx`, around lines 20-23: the matching header sentence. It is opened by the global store, which the backend push or the Console Mode hand-off opens.
   - `src/common/types/ipc.ts`, around lines 410-413: the `steamClientSetupRecheck` comment gains the second caller. Console Mode's `probeSteamQuickInstallTarget` calls it once on the same library-missing verdict (quick 261102-pgy), and its card hands setup off to desktop mode.
   - No code changes in these three files.

2. Move the todo with `git mv .planning/todos/pending/2026-11-02-console-mode-steam-client-setup-unreachable.md .planning/todos/completed/2026-11-02-console-mode-steam-client-setup-unreachable.md`. Follow the shape of the neighbouring completed todo `2026-11-02-d-uat-19-delegated-steam-install-without-client.md`, then edit the moved file:
   - Frontmatter keeps `severity: minor`, `platform: any`, and sets `ready: live-gate`, in that order, bare and lowercase. Append to `files:` the paths `src/frontend/state/InstallGameModal.ts`, `src/frontend/screens/ConsoleMode/index.tsx`, `src/frontend/state/SteamClientSetup.ts` and `public/locales/en/gamelib.json`.
   - Replace the "Decision needed (options, none chosen):" list with a `## Decision (operator, 2026-11-02)` section. Chosen: hand off to desktop mode. Rejected: the console-native client-setup card and accepting the corrected copy. Keep the original body above it as history.
   - Add `## Fix (quick 261102-pgy, 2026-11-02) — awaiting a controller live run` with one bullet per fix commit, using short hashes from `git log`: Task 1's `feat` commit, the last to touch `src/frontend/screens/ConsoleMode/index.tsx`, and Task 2's `fix` commit, the last to touch `public/locales/en/gamelib.json`. Say what each changed: the shared `steamClientSetupCause` predicate, the verdict's `clientSetup`, the `setupSteam` chip with `handoff` intent, open-then-`quit`, and the unclaimed-store release plus catalog key.
   - Add a `Not changed:` line. The card title and library-missing copy are unchanged. Non-client library-missing, library-full and non-Steam installs are unchanged. No other locale gained the key.
   - Add a `Tests:` line naming the spec ids and suites.
   - Add a `Live gate (any OS, controller):` paragraph. With the Steam client absent (D-10) or installed but never launched (D-11), enter Console Mode and press A on an uninstalled Steam game. The card shows "Set up Steam in desktop mode" with focus on it. Press A: GameLib leaves Console Mode and the consent dialog (D-10) or the "Waiting for Steam" dialog (D-11) is open. Repeat and press B instead: the card closes, and leaving Console Mode shows no client-setup dialog.
   - No log excerpts and no 15+ digit numbers.

3. Commit `docs(quick-261102-pgy): …` with the Co-Authored-By trailer. Do not touch `.planning/STATE.md`; the orchestrator owns it.
  </action>
  <verify>
    <automated>F=.planning/todos/completed/2026-11-02-console-mode-steam-client-setup-unreachable.md && test -e $F && ! test -e .planning/todos/pending/2026-11-02-console-mode-steam-client-setup-unreachable.md && test "$(awk '/^---$/{n++;next} n==1' $F | grep -A2 '^severity:' | tr '\n' '|')" = "severity: minor|platform: any|ready: live-gate|" && grep -q '^## Decision (operator, 2026-11-02)$' $F && grep -q '^## Fix (quick 261102-pgy' $F && H1=$(git log -1 --format=%h -- src/frontend/screens/ConsoleMode/index.tsx) && test -n "$H1" && S1=$(git log -1 --format=%s "$H1") && echo "$S1" | grep -q '261102-pgy' && grep -q "$H1" $F && H2=$(git log -1 --format=%h -- public/locales/en/gamelib.json) && test -n "$H2" && S2=$(git log -1 --format=%s "$H2") && echo "$S2" | grep -q '261102-pgy' && grep -q "$H2" $F && grep -q 'Live gate' $F && ! grep -En '[0-9]{15,}' $F && grep -q 'handOffSteamClientSetupToDesktop' src/frontend/state/SteamClientSetup.ts && grep -q '261102-pgy' src/common/types/ipc.ts && npx jest --selectProjects Frontend --runTestsByPath src/frontend/state/__tests__/SteamClientSetup.test.ts src/frontend/screens/Game/GamePage/components/__tests__/SteamClientSetup.waitingDialog.test.tsx && npx prettier --check src/frontend/state/SteamClientSetup.ts src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx src/common/types/ipc.ts && PG=$(mktemp) && { python meta/runPlanningGates.py > "$PG" 2>&1; true; } && grep -q '^\[PASS\]' "$PG" && ! grep '^\[FAIL\]' "$PG" | grep -v 'state-sdk-field-anchor-gate.py' && npx prettier --file-info $F | grep -Eq '"ignored":[[:space:]]*true'   # prettier: the todo is under .planning/, which --file-info reports ignored (inferredParser null), so --check over it would be vacuous and is omitted. The file-info probe proves the omission is legitimate. The three src/ paths are checked for real. `pnpm planning-gates` is replaced by `python meta/runPlanningGates.py` because python3 is the Microsoft Store stub on this box. The only tolerated FAIL is the pre-existing state-sdk-field-anchor-gate.py.</automated>
  </verify>
  <done>The todo lives only in `completed/`, reads `severity: minor` / `platform: any` / `ready: live-gate`, and records the decision, both fix hashes and the controller live gate. The three comments name the Console Mode hand-off. The SteamClientSetup suites pass, prettier is clean on the three `src/` paths, and planning gates show no FAIL beyond the baseline `state-sdk-field-anchor-gate.py`. A `docs(...)` commit scoped `quick-261102-pgy` exists.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar IPC (`steamClientSetupRecheck`) | `game.app_name` comes from renderer state. `ensureSteamClientReady` guards it server-side with `/^\d+$/` (T-21-05). |
| backend push -> renderer store | `steamClientSetupRequired` opens `useSteamClientSetup` from either App branch. Only the non-console branch renders it. |
| Console Mode -> desktop route | The hand-off opens the store and calls ConsoleMode's `quit` (`navigate('/')`). No new route and no URL built from input. |
| planning artifact -> public repo | The completed todo is committed to a public fork. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pgy-01 | Tampering | appId sent to `steamClientSetupRecheck` from Console Mode | low | mitigate | The server-side numeric guard is unchanged. A guarded rejection returns `error` and sends no push. `steamClientSetupCause` maps any `error` to `undefined`, so the user gets today's card (spec A12), never an action backed by a bad id. |
| T-pgy-02 | Denial of Service | D-29 silent failure: the hand-off opens a store nothing renders | medium | mitigate | The store opens BEFORE `quit()` (H1 snapshot). The desktop `SteamClientSetup` mounts after the route change and renders from an already-open store on its first render (W0/W1). The hand-off chip renders only when the verdict carries `clientSetup` (D9). |
| T-pgy-03 | Spoofing | A stray desktop client-setup dialog appears long after the user dismissed the console card | medium | mitigate | `releaseUnclaimedSteamClientSetup(game.app_name)` runs on overlay unmount when not handed off, and in the in-flight cancelled branch (D11). It closes only a session for the same appName (H3). |
| T-pgy-04 | Denial of Service | push/reply ordering skew: the push lands after the overlay's cleanup already ran | low | accept | The cleanup can run before the push only if the overlay unmounts inside the gap between the sidecar's push frame and its reply frame. The push is written first, and in the in-flight case the cancelled branch releases after the reply. Residual: a dialog the user can cancel. |
| T-pgy-05 | Information Disclosure | filesystem path on a TV screen | low | mitigate | The new chip interpolates nothing, and D3 (zero `libraryPath` in the overlay) stays green. |
| T-pgy-06 | Elevation of Privilege | unintended download after the hand-off | low | mitigate | The `reason` passes through unchanged. `install` opens D-10's explicit consent step before anything downloads, and `launch-once` resumes the install the user just asked for, as on desktop D-11. Cancel install stops the poll (C-17). |
| T-pgy-07 | Information Disclosure | completed todo text | low | mitigate | No logs, no user paths, no 15+ digit ids; Task 3's verify greps for 15+ digit numbers. |
| T-pgy-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or added. Any install the executor reaches for is out of scope and must stop the plan. |
</threat_model>

<verification>
- The four targeted Frontend suites pass: `consoleSteamTarget.test.ts`, `InstallGameModal.test.ts`, `SteamClientSetup.test.ts` and `SteamClientSetup.waitingDialog.test.tsx`. Do not run the full jest suite as a gate on this box, where ~40 suites fail independently.
- `npx tsc --noEmit` exits 0. ESLint reports 0 errors and 0 warnings over every touched `src/` path, and prettier is clean on all of them. `node meta/findDeadcode.cjs` and `i18n-churn-guard` exit 0. Planning gates show only the baseline FAIL.
- After the code tasks, run `graphify update .`. It is local only, because `graphify-out/` is gitignored.
- CI's Meta-project `hardcodedStringGate.test.ts` covers the new `tGamelib` key/default tuple. It takes ~260s locally, so it is not a per-task gate here. The chip uses the same exempt shape as the card's existing title.
</verification>

<success_criteria>
- A client-cause library-missing card in Console Mode offers "Set up Steam in desktop mode", focused by default. Activating it lands the user in desktop mode with the D-10 or D-11 dialog open for that game.
- Every non-client library-missing card, every library-full card and the non-Steam flow are unchanged, and the desktop quick install's D-UAT-15 behaviour is unchanged.
- No stray client-setup dialog appears after a dismissed console card.
- The todo is in `completed/` with the operator decision, the fix commits and the controller live gate recorded.
</success_criteria>

<output>
Create `.planning/quick/261102-pgy-console-mode-hands-steam-client-setup-of/261102-pgy-SUMMARY.md` when done
</output>
