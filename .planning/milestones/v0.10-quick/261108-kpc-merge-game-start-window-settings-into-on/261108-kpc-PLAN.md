---
phase: quick-261108-kpc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/ipc_contract.rs
  - src-tauri/src/store_embed.rs
  - src/common/types/sidecarTransport.ts
  - src/backend/platform/index.ts
  - src/backend/platform/__mocks__/index.ts
  - src/backend/platform/__tests__/mainWindowVisibility.test.ts
  - src/backend/dialog/dialog.ts
  - src/backend/dialog/__tests__/dialogRaisesHiddenWindow.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/config.ts
  - src/backend/protocol.ts
  - src/backend/__tests__/protocol.test.ts
  - src/backend/launcher.ts
  - src/backend/sidecar/steamFlowRegistration.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/sidecar/__tests__/appShellFlows.test.ts
  - src/common/gameStartWindow.ts
  - src/common/__tests__/gameStartWindow.test.ts
  - src/frontend/screens/Settings/components/GameStartWindow.tsx
  - src/frontend/screens/Settings/components/MinimizeOnGameLaunch.tsx
  - src/frontend/screens/Settings/components/HideWindowOnProtocolLaunch.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/components/__tests__/gameStartWindowSetting.test.ts
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  - src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx
  - public/locales/en/gamelib.json
  - meta/i18nGateScope.json
  - meta/i18nForkTouchedFiles.json
  - meta/__tests__/genI18nGateScope.test.ts
autonomous: true
requirements: [QUICK-261108-kpc]

must_haves:
  truths:
    - "General settings shows one 'When a game starts' select with Keep GameLib open / Hide GameLib for shortcut launches / Hide GameLib for every launch, with an (i) help icon on the label line; Advanced no longer shows the protocol toggle and General no longer shows the minimize toggle"
    - "Choosing an option writes exactly the two existing booleans (keep = both false; shortcut = hideWindowOnProtocolLaunch true + minimizeOnLaunch false; every = both true); existing configs display the option their booleans imply"
    - "A new install defaults to 'Hide GameLib for shortcut launches' (hideWindowOnProtocolLaunch true in config.ts and in the frontend fallback)"
    - "A gamelib://launch link that cold-starts GameLib hides the main window when the setting (or gui=false) asks; a link arriving at an already-running GameLib leaves the window alone unless the link carries gui=false"
    - "Picking 'every launch' actually hides GameLib when a game is launched in-app (non-Steam via launchEventCallback AND Steam via dispatchSteamLaunch), on macOS without a tray icon too; off macOS with the tray icon disabled the option is disabled and explained"
    - "Whenever GameLib hid its own window for a launch, any later dialog (in-app showDialog or native showMessageBox/showErrorBox) first brings the main window back"
  artifacts:
    - path: "src/common/gameStartWindow.ts"
      provides: "GameStartWindowMode type + mode<->boolean mapping, pure"
      exports: ["GameStartWindowMode", "gameStartWindowModeFromSettings", "settingsForGameStartWindowMode", "everyLaunchNeedsTray"]
    - path: "src/frontend/screens/Settings/components/GameStartWindow.tsx"
      provides: "the merged select"
    - path: "src/backend/platform/index.ts"
      provides: "app.hideMainWindow(), app.raiseMainWindowIfHiddenByGameLib(), dialog raise hooks"
      contains: "RUST_MAIN_WINDOW_HIDE"
    - path: "src-tauri/src/store_embed.rs"
      provides: "main_window_hide dispatch arm"
      contains: "RustInvokeChannel::MainWindowHide"
  key_links:
    - from: "src/backend/protocol.ts"
      to: "app.hideMainWindow"
      via: "cold-start / gui=false hide right before launch dispatch"
      pattern: "hideMainWindow\\("
    - from: "src/backend/dialog/dialog.ts"
      to: "app.raiseMainWindowIfHiddenByGameLib"
      via: "first statement of showDialogBoxModalAuto"
      pattern: "raiseMainWindowIfHiddenByGameLib\\("
    - from: "src/backend/sidecar/appShellFlowRegistration.ts"
      to: "markFrontendReady"
      via: "frontendReady handler"
      pattern: "markFrontendReady\\("
---

<objective>
Merge the two "where does GameLib go when a game starts" settings into one General-settings select,
make "Hide GameLib for shortcut launches" the factory default, and make hiding ACTUALLY WORK in the
Tauri build without ever stranding a dialog behind a hidden window.

Purpose: today BOTH settings are dead in the Tauri build (see Planner findings). The merged control
must not ship an affordance it cannot honour, so this plan includes the minimal window plumbing.
Output: one Rust channel, platform helpers + dialog hook, backend behaviour changes, merged UI.
</objective>

<planner_findings>
Measured while planning (these change the premise of the task spec; the plan below accounts for them):

F1. `getMainWindow()` (src/backend/main_window.ts:22) returns the sidecar `fakeWindow`
    (src/backend/platform/index.ts ~L812-857) whose `show()`, `hide()`, `focus()` are no-ops and
    `isVisible()` always returns false. Consequences in the shipped Tauri build:
    - `minimizeOnLaunch` (launcher.ts:191 `mainWindow?.hide()`) does nothing.
    - handleProtocol's warm-path hide (protocol.ts ~L193, gated on `isVisible()`) never runs.
    - The not-installed path's `mainWindow.show()` (protocol.ts ~L245) does nothing.
    Do NOT wire fakeWindow.hide/show to the real window: `handleExit()` (backend/utils.ts) calls
    `mainWindow?.hide()` on quit and other callers rely on the no-ops. Add explicit `app.*` methods.
F2. `shouldHideWindowForProtocolArgs` has NO non-test caller (its Electron caller, main.ts, was
    deleted in 35-14). Cold-start suppression therefore does not exist today. The Tauri main window
    is created visible (tauri.conf.json has no `visible` key). Cold-start links arrive via
    `bootstrap.ts` `deliverStartupProtocolUrl(argv)` (Linux/Windows) and, on macOS, via
    `on_open_url` -> sidecar `handleProtocolUrl` — the same channel warm links use, so the sidecar
    needs a cold/warm signal (Task 2).
F3. `minimizeOnLaunch` only exists in launcher.ts (non-Steam). In-app Steam launches go through
    `dispatchSteamLaunch` (sidecar/steamFlowRegistration.ts ~L362) and never read it — "every launch"
    must hook there too.
F4. Existing Rust primitives: `main_window_raise` (unminimize + show + set_focus + macOS Critical
    Dock bounce) and `app_hide` (macOS `AppHandle::hide()`, no-op elsewhere). There is no
    "hide main window" channel and no `RunEvent::Reopen` handler, so a macOS `window.hide()` with no
    tray could not be restored from the Dock. Hence the new channel uses `AppHandle::hide()` on macOS
    (Cmd+H semantics: Dock click / activation / set_focus unhide it natively; the bridge-invite picker
    already handles the Cmd+H-hidden state) and `window.hide()` elsewhere (restored by tray Show or by
    relaunching, which sends the focus sentinel that shows + focuses the window).
F5. Consequence for the tray dependency: on macOS "every launch" works without a tray icon (Dock
    restores); off macOS keep the existing `noTrayIcon` gate and disable/explain the option.
F6. macOS LaunchServices activates the handler app when a gamelib:// URL is opened, so with the window
    left visible on a warm link (D4) GameLib may briefly come forward before the game window. Not
    addressed here (user decision: leave a visible window visible); noted for UAT.
F7. Frontend jest has no jsdom (src/frontend/jest.config.js); UI tests are source-text gates
    (trayIconVariantSetting.test.ts idiom). The mapping is therefore a pure common/ module tested
    behaviourally.
</planner_findings>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
Load Skill("gamelib-conventions") before writing any <verify> prettier step (rule 5) and before any
new spawn site (none expected).

<interfaces>
From src/backend/platform/index.ts (app object, ~L362-396):
  hide: (): void            -> fire-and-forget requestRustInvoke(RUST_APP_HIDE, []), warn on failure
  raiseMainWindow: (): void -> fire-and-forget requestRustInvoke(RUST_MAIN_WINDOW_RAISE, [])
  dialog.showMessageBox(windowOrOptions?, maybeOptions?) ~L491; dialog.showErrorBox(title?, content?) ~L477
From src/common/types/sidecarTransport.ts:
  export const RUST_MAIN_WINDOW_RAISE = 'main_window_raise' as const   (~L273, doc comment above)
  channel list array containing RUST_APP_HIDE, RUST_MAIN_WINDOW_RAISE  (~L599)
From src-tauri/src/ipc_contract.rs: RustInvokeChannel::MainWindowRaise appears at ~L36 (enum),
  ~L84 (all-channels list), ~L132 (name->variant), ~L182 (variant->name); MainWindowRaiseArgs ~L659.
From src-tauri/src/store_embed.rs: `RustInvokeChannel::AppHide` arm ~L2256, `MainWindowRaise` arm ~L2274
  (uses app.get_webview_window(MAIN_WINDOW_LABEL)).
From src/frontend/components/UI/SelectField/index.tsx:
  props { htmlId, value, onChange(SelectChangeEvent), children, label?, labelHelp?: ReactNode, disabled? }
  labelHelp renders inside FieldLabel on the label line — use it for the InfoIcon.
From src/frontend/components/UI/InfoIcon: default export, prop `text`.
From src/common/types.ts: AppSettings has `hideWindowOnProtocolLaunch: boolean` (L162),
  `minimizeOnLaunch: boolean` (L165), `noTrayIcon`.
Pattern reference for a select setting + source-text gate: UseDarkTrayIcon.tsx +
  components/__tests__/trayIconVariantSetting.test.ts + src/common/trayIconVariant.ts.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Real main-window hide channel + raise-before-dialog hook</name>
  <files>src-tauri/src/ipc_contract.rs, src-tauri/src/store_embed.rs, src/common/types/sidecarTransport.ts, src/backend/platform/index.ts, src/backend/platform/__mocks__/index.ts, src/backend/platform/__tests__/mainWindowVisibility.test.ts, src/backend/dialog/dialog.ts, src/backend/dialog/__tests__/dialogRaisesHiddenWindow.test.ts, src/backend/__tests__/tauriShellSource.test.ts</files>
  <behavior>
    - app.hideMainWindow() invokes RUST_MAIN_WINDOW_HIDE once and sets the hidden-by-GameLib flag; a rejected invoke only warns (never throws)
    - app.raiseMainWindowIfHiddenByGameLib() invokes RUST_MAIN_WINDOW_RAISE only when the flag is set, then clears it; a second call is a no-op
    - app.raiseMainWindow() also clears the flag
    - dialog.showMessageBox and dialog.showErrorBox call raiseMainWindowIfHiddenByGameLib before forwarding
    - showDialogBoxModalAuto (both the event.sender branch and the sendFrontendMessage branch) raises first when the flag is set, and does not raise when it is not
  </behavior>
  <action>
Rust (fixes F1/F4): add channel `main_window_hide` by mirroring EVERY occurrence of
`main_window_raise` / `MainWindowRaise` in ipc_contract.rs (enum variant `MainWindowHide`, all-list,
name<->variant both directions, a `MainWindowHideArgs` unit struct with the same no-arg `from_args`)
plus any Rust unit test that enumerates channels. In store_embed.rs add a `RustInvokeChannel::MainWindowHide`
arm next to `MainWindowRaise`: `#[cfg(target_os = "macos")]` call `app.hide()` (AppHandle, Cmd+H
semantics — explain in a short comment why not window.hide(): no RunEvent::Reopen handler exists, so a
hidden NSWindow could not be restored from the Dock; activation and set_focus unhide a hidden app);
`#[cfg(not(target_os = "macos"))]` get the MAIN_WINDOW_LABEL webview window and `hide()` it, returning
`Err("main_window_hide:no-main-window")` if missing. Resolve `Ok(Value::Null)`. Same worker-thread
reasoning as the AppHide arm applies; reference it rather than repeating it.

TS transport: add `export const RUST_MAIN_WINDOW_HIDE = 'main_window_hide' as const` with a doc comment
(callers: launch-time hide in protocol.ts, launcher.ts, steamFlowRegistration.ts) beside
RUST_MAIN_WINDOW_RAISE and add it to the channel list array. Update RUST_MAIN_WINDOW_RAISE's doc comment
("Caller: the bridge notice only ... Never called for unrelated dialogs") — it is now also called by the
raise-if-hidden hook. If tauriShellSource.test.ts pins channel parity/counts or the raise arm's text,
extend it for the new arm.

Platform (src/backend/platform/index.ts app object): add module-level `let mainWindowHiddenByGameLib = false`;
`hideMainWindow()` — fire-and-forget requestRustInvoke(RUST_MAIN_WINDOW_HIDE, []), set flag true, warn
on failure (same total-method shape as `hide`); `raiseMainWindowIfHiddenByGameLib()` — if flag, clear it
and call the existing raiseMainWindow body; make `raiseMainWindow()` clear the flag too. In
`dialog.showMessageBox` and `dialog.showErrorBox`, call `app.raiseMainWindowIfHiddenByGameLib()` as the
first statement (native dialogs parented to / shown under a hidden app would be invisible — covers the
URL-arg vetting confirm and not-installed prompt in protocol.ts plus askForceUninstall etc.). Add both new
members to `__mocks__/index.ts` as `jest.fn()`.

dialog.ts (per D5): first statement of showDialogBoxModalAuto calls `app.raiseMainWindowIfHiddenByGameLib()`
(import `app` from 'backend/platform'). Add a comment recording the scope decision: the sidecar cannot
observe real window visibility (fakeWindow.isVisible is a stub), and an unconditional raise would steal
focus from a running game and Dock-bounce (Critical attention) for every background dialog; so the hook
re-shows only a window GameLib itself hid for a launch. A window the user hid (tray / startInTray) is
out of scope and unchanged. notify() is untouched (OS notifications are visible regardless).

Tests: mainWindowVisibility.test.ts exercises the real platform module with requestRustInvoke mocked (follow
openExternalBackground.test.ts for how that file mocks the transport); dialogRaisesHiddenWindow.test.ts uses
the platform mock. Write them first (RED), then implement.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && cargo test --manifest-path src-tauri/Cargo.toml ipc_contract 2>&1 | tail -5 && npx jest src/backend/platform src/backend/dialog src/backend/__tests__/tauriShellSource.test.ts 2>&1 | tail -8 && npx prettier --file-info src/common/types/sidecarTransport.ts && npx prettier --check src/common/types/sidecarTransport.ts src/backend/platform/index.ts src/backend/platform/__mocks__/index.ts src/backend/platform/__tests__/mainWindowVisibility.test.ts src/backend/dialog/dialog.ts src/backend/dialog/__tests__/dialogRaisesHiddenWindow.test.ts src/backend/__tests__/tauriShellSource.test.ts</automated>
  </verify>
  <done>Rust compiles with the new arm and its contract tests pass; new jest tests pass; prettier clean on every TS path written (Rust files are rustfmt territory — run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` only if the repo already passes it, otherwise match surrounding style).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Launch-time behaviour — default, cold/warm link, every-launch, re-show paths</name>
  <files>src/backend/config.ts, src/backend/protocol.ts, src/backend/__tests__/protocol.test.ts, src/backend/launcher.ts, src/backend/sidecar/steamFlowRegistration.ts, src/backend/sidecar/appShellFlowRegistration.ts, src/backend/sidecar/__tests__/appShellFlows.test.ts</files>
  <behavior>
    - cold-start link (frontendReady not yet seen) + hideWindowOnProtocolLaunch true -> app.hideMainWindow called once before dispatch (Steam and non-Steam branches)
    - cold-start link + gui=false + setting false -> hidden
    - warm link (after markFrontendReady and past the cold window) + setting true + no gui param -> hideMainWindow NOT called (D4: an already-running GameLib is left as it is)
    - warm link + gui=false -> hidden (gui=false semantics unchanged)
    - declined URL-arg confirmation -> no hide, no launch
    - not-installed + user picks Install while hidden-for-this-launch or isCLINoGui -> app.raiseMainWindow called
    - minimizeOnLaunch true -> launcher hides via app.hideMainWindow (macOS always; elsewhere only when !noTrayIcon); in-app Steam launch through the sidecar launch handler hides under the same gate
  </behavior>
  <action>
config.ts L389: factory default `hideWindowOnProtocolLaunch: true` (per D3; no migration — first run already persists defaults, existing configs keep their saved value).

protocol.ts (per D4, fixes F1/F2):
- Add `let frontendReadySeen = false` and export `markFrontendReady()`; add a const `COLD_START_WINDOW_SECONDS = 15`. A link is cold-start when `!frontendReadySeen || process.uptime() < COLD_START_WINDOW_SECONDS`. Comment why both: Linux/Windows cold links arrive via deliverStartupProtocolUrl before the renderer exists; macOS cold links arrive through on_open_url -> handleProtocolUrl, the same channel as warm links, measured firing in the same second as setup (main.rs ~L1023), so the renderer-ready signal is the discriminator and uptime is the guard against a race where frontendReady wins.
- Replace `hideForThisLaunch` with: `urlRequestsNoGui(url) || (isColdStart && settings.hideWindowOnProtocolLaunch === true)`. Keep the hide at its current position (after arg vetting and confirmation, immediately before dispatch) so the vetting confirm and not-installed prompt always run while the window is still visible; replace the `getMainWindow()?.isVisible()` + `mainWindow.hide()` block with `app.hideMainWindow()` (import `app` from 'backend/platform' if not already) and a logInfo naming cold-start vs gui=false.
- Not-installed branch: replace `mainWindow.show()` with `app.raiseMainWindow()` (fakeWindow.show is a no-op — F1).
- Delete the dead `shouldHideWindowForProtocolArgs` export (F2) and its tests; its doc comment's intent now lives in the cold-start comment above. grep `shouldHideWindowForProtocolArgs` across src/ meta/ to confirm zero remaining references.

appShellFlowRegistration.ts: in the `frontendReady` handler, call `markFrontendReady()` (import from 'backend/protocol') right after `logInfo('Frontend Ready', ...)`. appShellFlows.test.ts overrides `handleProtocol` in a backend/protocol mock — add `markFrontendReady: jest.fn()` to that mock and one assertion that frontendReady calls it. Keep the existing "handleProtocol not called" assertion green.

launcher.ts L156/L190-193 (fixes F1, per D2): replace `mainWindow?.hide()` with `app.hideMainWindow()` under `minimizeOnLaunch && (isMac || !noTrayIcon)` (F5; import isMac from 'backend/constants/environment' or wherever launcher already gets platform flags). Remove the now-unused `mainWindow` local only if nothing else in the function uses it.

steamFlowRegistration.ts ~L362 (F3): in the `launchHandedToClient` branch, before `dispatchSteamLaunch`, read GlobalConfig settings and call `app.hideMainWindow()` under the same gate. Do NOT add it inside dispatchSteamLaunch itself — protocol.ts also calls that and owns its own (shortcut) decision.

protocol.test.ts: rewrite the hide tests (L303-390) around `app.hideMainWindow` from the platform mock instead of a fake window's hide; drive cold/warm via `markFrontendReady()` plus `jest.spyOn(process, 'uptime')`. Reset module state between tests (jest.isolateModules or an exported test-only reset is NOT allowed — prefer isolateModules).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/protocol.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/__tests__/launcher_launchSingleFlight.test.ts src/backend/__tests__/launcher.engineStep.test.ts src/backend/sidecar/__tests__/steamFlow 2>&1 | tail -8 && npx prettier --check src/backend/config.ts src/backend/protocol.ts src/backend/__tests__/protocol.test.ts src/backend/launcher.ts src/backend/sidecar/steamFlowRegistration.ts src/backend/sidecar/appShellFlowRegistration.ts src/backend/sidecar/__tests__/appShellFlows.test.ts</automated>
  </verify>
  <done>All listed suites pass; no remaining reference to shouldHideWindowForProtocolArgs or to getMainWindow()?.hide()/show()/isVisible() in protocol.ts or launcher.ts; config default is true.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Merged "When a game starts" select, mapping module, i18n + manifests</name>
  <files>src/common/gameStartWindow.ts, src/common/__tests__/gameStartWindow.test.ts, src/frontend/screens/Settings/components/GameStartWindow.tsx, src/frontend/screens/Settings/components/MinimizeOnGameLaunch.tsx, src/frontend/screens/Settings/components/HideWindowOnProtocolLaunch.tsx, src/frontend/screens/Settings/components/index.ts, src/frontend/screens/Settings/components/__tests__/gameStartWindowSetting.test.ts, src/frontend/screens/Settings/sections/GeneralSettings/index.tsx, src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx, public/locales/en/gamelib.json, meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json, meta/__tests__/genI18nGateScope.test.ts</files>
  <behavior>
    - gameStartWindowModeFromSettings({minimizeOnLaunch:true, hideWindowOnProtocolLaunch:false}) -> 'every'; (true,true) -> 'every'; (false,true) -> 'shortcut'; (false,false) -> 'keep'
    - settingsForGameStartWindowMode('keep'|'shortcut'|'every') returns the D2 boolean pairs exactly; round-trips for all three modes
    - everyLaunchNeedsTray(platform, noTrayIcon) is true only when platform !== 'darwin' && noTrayIcon
    - displayed mode when everyLaunchNeedsTray is true and stored mode is 'every' = what actually happens: 'shortcut' if hideWindowOnProtocolLaunch else 'keep' (exported as displayedGameStartWindowMode)
    - source gate: GameStartWindow.tsx uses SelectField with labelHelp InfoIcon, reads both keys via useSetting with hideWindowOnProtocolLaunch fallback true and minimizeOnLaunch fallback false, writes via settingsForGameStartWindowMode, uses only gamelib: t() keys whose fallbacks equal gamelib.json; GeneralSettings renders GameStartWindow and neither section references the two removed components
  </behavior>
  <action>
src/common/gameStartWindow.ts (pure, no React; mirrors src/common/trayIconVariant.ts shape): `GameStartWindowMode = 'keep' | 'shortcut' | 'every'`, `gameStartWindowModes` ordered array, `isGameStartWindowMode`, `gameStartWindowModeFromSettings`, `settingsForGameStartWindowMode`, `everyLaunchNeedsTray`, `displayedGameStartWindowMode`. Per D2 no new settings key and no migration.

GameStartWindow.tsx (per D1): SelectField htmlId "gameStartWindow", label t('gamelib:settings.gameStartWindow.label','When a game starts'), labelHelp = InfoIcon with t('gamelib:settings.gameStartWindow.help', "Shortcut launches are gamelib:// links, such as the ones 'Add games to Steam' creates, and desktop or Applications shortcuts. GameLib reappears whenever a launch needs your attention."). MenuItems in order keep/shortcut/every with labels 'Keep GameLib open' / 'Hide GameLib for shortcut launches' / 'Hide GameLib for every launch'. Literal t() calls only (parser extracts literals — same note as UseDarkTrayIcon). Read platform from ContextProvider and `noTrayIcon` via useSetting; when everyLaunchNeedsTray, render the 'every' MenuItem `disabled` and append the explanation via a separate key t('gamelib:settings.gameStartWindow.everyNeedsTray','Hide GameLib for every launch (turn on the tray icon to use this)') used as that item's label instead. onChange: validate with isGameStartWindowMode, then call both setters from the two useSetting hooks with settingsForGameStartWindowMode(next). Fallbacks: hideWindowOnProtocolLaunch true (D3), minimizeOnLaunch false.

Delete MinimizeOnGameLaunch.tsx and HideWindowOnProtocolLaunch.tsx; update components/index.ts exports (add GameStartWindow alphabetically); GeneralSettings renders `<GameStartWindow />` where MinimizeOnGameLaunch was; AdvancedSettings drops HideWindowOnProtocolLaunch. Leave the old `setting.minimize-on-launch` / `setting.hide-window-on-protocol-launch` / `help.hide-window-on-protocol-launch` keys in translation.json untouched (upstream catalog; only remove if lint-translations flags them).

i18n (D6): add the four keys under `settings.gameStartWindow` in public/locales/en/gamelib.json, alphabetical within `settings`; run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib` to regenerate the presence baseline and commit whatever file it writes. Manifests: in meta/i18nGateScope.json and meta/i18nForkTouchedFiles.json remove the two deleted component paths and add src/frontend/screens/Settings/components/GameStartWindow.tsx, keeping each `files` list sorted; adjust the hardcoded A0-A4 counts in meta/__tests__/genI18nGateScope.test.ts (net -1 per list) with a dated note, per quick 261108-ioc precedent. The A-17 anti-rot failure is pre-existing on main — ignore it, but confirm the failure count did not grow.

Tests: gameStartWindow.test.ts behavioural; gameStartWindowSetting.test.ts source-text gate using stripSourceComments, modelled on trayIconVariantSetting.test.ts but reading public/locales/en/gamelib.json for fallback equality.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/common/__tests__/gameStartWindow.test.ts src/frontend/screens/Settings meta/__tests__/genI18nGateScope.test.ts 2>&1 | tail -12 && pnpm lint-translations:gamelib 2>&1 | tail -5 && npx prettier --file-info public/locales/en/gamelib.json meta/i18nGateScope.json && npx prettier --check src/common/gameStartWindow.ts src/common/__tests__/gameStartWindow.test.ts src/frontend/screens/Settings/components/GameStartWindow.tsx src/frontend/screens/Settings/components/index.ts src/frontend/screens/Settings/components/__tests__/gameStartWindowSetting.test.ts src/frontend/screens/Settings/sections/GeneralSettings/index.tsx src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx meta/__tests__/genI18nGateScope.test.ts</automated>
  </verify>
  <done>New tests pass; Settings suites pass; genI18nGateScope shows only the pre-existing A-17 failure; lint-translations:gamelib reports 0 hard failures; prettier clean on every non-ignored path written (add the JSON files to the check only if --file-info says they are not ignored).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| web page / Steam shortcut -> gamelib:// URL | attacker-authored link reaches handleProtocol |
| sidecar -> Rust shell | requestRustInvoke channel set |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kpc-01 | Spoofing/Tampering | protocol.ts arg vetting confirm | mitigate | hide stays AFTER confirmUrlLaunchParameters, and showMessageBox raises a GameLib-hidden window first, so the confirm can never be shown into a hidden window and auto-declined/missed |
| T-kpc-02 | Denial of service (UX) | link-triggered hide | mitigate | warm links no longer hide without gui=false; every dialog re-shows a GameLib-hidden window; macOS uses app hide (Dock restores), other platforms keep tray/focus-sentinel restore |
| T-kpc-03 | Elevation | new Rust channel main_window_hide | accept | takes no args (no injection surface), only hides GameLib's own window |
</threat_model>

<verification>
- pnpm codecheck
- pnpm lint (0 errors)
- pnpm lint-translations:gamelib (0 hard failures)
- scoped jest from each task's verify
- cargo test --manifest-path src-tauri/Cargo.toml ipc_contract
- graphify update .
- Note for the operator (UAT, not automated): restart `pnpm tauri:dev` (sidecar is not rebuilt by tauri dev), then (1) quit GameLib, click a Steam 'Add games to Steam' shortcut -> game starts, GameLib window does not stay up; (2) with GameLib open, click the same shortcut -> GameLib window stays as it was; (3) set 'every launch', launch from the library -> GameLib hides, Dock click restores it; (4) force a launch error while hidden -> GameLib comes back showing the dialog.
</verification>

<success_criteria>
- One "When a game starts" select in General with (i) help; both old toggles gone
- New installs default to shortcut-hide; existing configs map onto the implied option
- Cold-start link hides; warm link without gui=false does not; gui=false unchanged
- "Every launch" hides for in-app Steam and non-Steam launches (tray-gated off macOS, disabled+explained in UI)
- No dialog is ever rendered into a window GameLib hid
</success_criteria>

<output>
Create `.planning/quick/261108-kpc-merge-game-start-window-settings-into-on/261108-kpc-SUMMARY.md` when done
</output>
