---
phase: quick-261026-clh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts
  - src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts
  - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
  - src/backend/sidecar/pathShim.ts
  - src/frontend/screens/Settings/components/Shortcuts.tsx
autonomous: true
requirements: [QUICK-261026-clh]

must_haves:
  truths:
    - "On macOS the Settings > Shortcuts screen shows the 'Add desktop shortcuts automatically' toggle"
    - "With addDesktopShortcuts on, install-time and menu Add shortcut place a <title>.app on ~/Desktop as well as (when Applications is requested) ~/Applications"
    - "With addDesktopShortcuts off, menu Add shortcut on macOS writes ~/Applications/<title>.app only; ~/Desktop is untouched"
    - "Remove shortcuts on macOS deletes both the ~/Applications and the ~/Desktop .app"
    - "The shortcut-exists check reports true when only the ~/Desktop .app exists, so the menu shows Remove"
  artifacts:
    - path: "src/backend/shortcuts/shortcuts/shortcuts.ts"
      provides: "darwin Desktop .app path in shortcutFiles, destination-parameterised generateMacOsApp, dual-copy add/remove"
      contains: "'Desktop'"
    - path: "src/frontend/screens/Settings/components/Shortcuts.tsx"
      provides: "Desktop toggle visible on darwin"
  key_links:
    - from: "src/backend/sidecar/shortcutsFlowRegistration.ts shortcutsExistOnDisk"
      to: "shortcutFiles() darwin branch"
      via: "existsSync(desktopFile) || existsSync(menuFile) -- unchanged code, correct once desktopFile is the real ~/Desktop path"
      pattern: "existsSync\\(desktopFile"
    - from: "addShortcuts darwin branch"
      to: "generateMacOsApp(gameInfo, destination)"
      via: "recordWrite per destination"
      pattern: "generateMacOsApp\\(gameInfo, "
---

<objective>
macOS opt-in Desktop shortcut for every store. Reuse the existing `addDesktopShortcuts` setting:
show its toggle on macOS, and when it is on, write a second copy of the generated `.app` to
`~/Desktop`. Removal and the exists check must handle both copies.

Purpose: Mac users can get Desktop shortcuts the way Linux and Windows users already can. Menu
add still leaves the Desktop alone unless the user has opted in.
Output: changes to shortcuts.ts with darwin tests, plus the toggle shown on darwin.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/261026-c7r-steam-desktop-applications-shortcuts-imp/261026-c7r-SUMMARY.md
@src/backend/shortcuts/shortcuts/shortcuts.ts
@src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts
@src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts
@src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts

<interfaces>
Current state, measured during planning:

shortcuts.ts
- `shortcutFiles(gameTitle): [desktopFile, menuFile]`. In the darwin branch,
  `menuFile = join(userHome, 'Applications', `${gameTitle}.app`)` and `desktopFile = menuFile`.
  The two values are deliberately collapsed today.
- `generateMacOsApp(gameInfo)` hardcodes `const appShortcut = shortcutFiles(gameInfo.title)[1]`
  under the comment "we don't add desktop shortcut". It builds Contents/{MacOS/run.sh,
  Resources/shortcut.icns, Info.plist} with sync fs, and the icon goes through
  `convertPngToICNS(app_name, gameInfo, resourcesFolder)`.
- `addShortcuts` darwin branch: `if (addStartMenuShortcuts || fromMenu) await generateMacOsApp(gameInfo)`.
  This call is NOT wrapped in the `recordWrite` failure collector that linux and win32 use.
- `removeShortcuts`: `if (desktopFile && !isMac)` unlinks the desktop file. Under `isMac` it
  `rm(menuFile, { recursive: true, force: true })`s the menu file and returns early.

Existence checks: both use `existsSync(desktopFile ?? '') || existsSync(menuFile ?? '')`.
One is in `src/backend/shortcuts/ipc_handler.ts` (Electron-era) and the shipped one is in
`src/backend/sidecar/shortcutsFlowRegistration.ts:135-137`. Neither needs a code change: once
`shortcutFiles` returns a distinct darwin Desktop path, both find a Desktop-only copy.

`app.getPath('desktop')` in the sidecar (`pathShim.ts`) switches on `platform`, which is imported
from 'process' when the module loads. A test that overrides `process.platform` to darwin on a
Linux CI host would therefore get the Linux XDG arm. Use `join(userHome, 'Desktop')` for darwin
instead. It is deterministic and equals pathShim's own darwin arm.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: darwin Desktop .app (add, remove, exists) with tests</name>
  <files>src/backend/shortcuts/shortcuts/shortcuts.ts, src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts, src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts, src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts, src/backend/sidecar/pathShim.ts</files>
  <behavior>
    New `describe('addShortcuts on darwin (261026-clh)')` in addShortcutsOutcome.test.ts. Copy the
    Steam darwin block's setup: `overrideProcessPlatform('darwin')`, save/set/restore
    `GAMELIB_SHELL_EXE`, and in afterEach `rmSync` BOTH `shortcutFiles(title)[0]` and `[1]`.
    - addDesktopShortcuts false, addStartMenuShortcuts false, fromMenu true: `[1]/Contents/MacOS/run.sh` exists and `[0]` does not.
    - addDesktopShortcuts true, fromMenu true: both `.app` exist and each has a run.sh with the same gamelib:// URL.
    - addDesktopShortcuts true, addStartMenuShortcuts false, no fromMenu (install add): only `[0]` exists.
    - addDesktopShortcuts false, addStartMenuShortcuts false, no fromMenu: neither exists, resolves.
    - addDesktopShortcuts true, `~/Desktop` pre-created as a regular FILE so the mkdir fails: rejects with a message containing `[0]`, and `[1]` is still written. Clean up the file in this test.
    - `shortcutFiles('X')` on darwin: `[0]` equals `join(homedir(), 'Desktop', 'X.app')`, `[1]` equals `join(homedir(), 'Applications', 'X.app')`, and they differ.
    removeShortcutsOutcome.test.ts, darwin describe: extend the existing test (or add one) so it creates BOTH `.app` trees with a run.sh inside. After `removeShortcuts`, both are gone and `mockLogError` was not called. Add a case where only the Desktop copy exists: it is removed and nothing is logged.
    shortcutsExistsFallback.test.ts: add a darwin case. Override `process.platform` to darwin using the overrideProcessPlatform helper pattern from addShortcutsOutcome.test.ts and restore it in afterEach. Use `mockedExistsSync.mockImplementation(p => p === shortcutFiles('Real Game')[0])`. The `shortcutsExists` handler resolves true.
  </behavior>
  <action>
    RED first: write the behavior tests above and run them. They must fail against the current code because darwin desktopFile === menuFile. Then implement in shortcuts.ts:

    1. In the `shortcutFiles` darwin branch, set `desktopFile = join(userHome, 'Desktop', `${gameTitle}.app`)`. Do not use `app.getPath('desktop')`; the interfaces block explains the pathShim platform capture. `menuFile` is unchanged.

    2. Change `generateMacOsApp(gameInfo: GameInfo, appShortcut: string)` to take its destination and delete the internal `shortcutFiles(...)[1]` line along with its stale comment. Every derived path (macOSFolder, resourcesFolder, plistFile, the icns dest) is built from the parameter. The Desktop copy comes from generating twice, not from copying the bundle. Reasons: each write gets its own failure record, there is no recursive-copy code path, and the icon conversion is cheap. Note this choice in a one-line comment.

    3. darwin branch of `addShortcuts`, replacing the bare call:
       `if (addStartMenuShortcuts || fromMenu) await recordWrite(menuFile, () => generateMacOsApp(gameInfo, menuFile))`
       `if (addDesktopShortcuts) await recordWrite(desktopFile, () => generateMacOsApp(gameInfo, desktopFile))`
       The Desktop condition must NOT include `|| fromMenu`, per the locked decision. Above it, add a two-line comment: unlike linux/win32, darwin menu add never touches ~/Desktop unless the user opted in, so a Mac Desktop stays clean by default. Wrapping the Applications write in recordWrite is deliberate. A Desktop failure must not stop the Applications copy, and failures are reported together, the same as on linux/win32. An install with the toggle on and addStartMenuShortcuts off writes the Desktop copy only, which is correct.

    4. `removeShortcuts`: under `isMac`, remove both `desktopFile` and `menuFile`, each with `removeFile(file, () => rm(file, { recursive: true, force: true }), ...)`. Use the messages 'Desktop shortcut removed' and 'Applications shortcut removed'. Keep the non-mac `unlink` paths exactly as they are, and keep the never-reject contract from the docblock.

    5. Update the stale comments: the `case 'desktop':` comment in pathShim.ts (it says darwin never reaches it; state that shortcutFiles' darwin branch uses `join(userHome,'Desktop')` directly), the shortcutsExistsFallback.test.ts premise test at ~line 168-183, and the addShortcuts docblock. The premise test currently asserts `desktopFile` toEqual `menuFile` on darwin, which turns red on a Mac host after this change. Make it assert not.toEqual on every platform and rewrite its comment.

    6. The existing Steam darwin test in addShortcutsOutcome.test.ts (defaultSettings has addDesktopShortcuts: true) will now also write a Desktop copy. Extend its afterEach to also rmSync `shortcutFiles(steamGameInfo.title)[0]`.

    ipc_handler.ts and sidecar/shortcutsFlowRegistration.ts need no edit (see interfaces). Do not touch their toast strings either. No new i18n keys. Nothing here spawns a child process.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/shortcuts src/backend/sidecar/__tests__/shortcutsFlows && npx tsc --noEmit -p . && npx prettier --check src/backend/shortcuts/shortcuts/shortcuts.ts src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts src/backend/sidecar/pathShim.ts</automated>
  </verify>
  <done>All new darwin cases pass, and the existing linux/win32/Steam cases still pass. tsc is clean. Prettier is clean on the five paths, which `--file-info` confirmed are not ignored. On darwin, `shortcutFiles` returns distinct Desktop and Applications `.app` paths.</done>
</task>

<task type="auto">
  <name>Task 2: show the Desktop toggle on macOS</name>
  <files>src/frontend/screens/Settings/components/Shortcuts.tsx</files>
  <action>
    In Shortcuts.tsx, show the `shortcutsToDesktop` ToggleSwitch on darwin too. The simplest form: remove `supportsDesktopShortcut` and render the toggle unconditionally, because GameLib only targets linux, win32 and darwin. If any of `isWin`/`isLinux` becomes unused after that, remove it too; they are still used by `menuShortcutsLabel`. Keep the existing `setting.adddesktopshortcuts` key and default text, with no new i18n keys. Planning found no existing Shortcuts settings test (`src/frontend/screens/Settings/components/__tests__/` has none), so per the instruction no frontend test is added.

    After both tasks, run `graphify update .`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx tsc --noEmit -p . && npx eslint src/frontend/screens/Settings/components/Shortcuts.tsx && npx prettier --check src/frontend/screens/Settings/components/Shortcuts.tsx</automated>
  </verify>
  <done>The toggle renders regardless of platform. tsc, eslint (0 errors) and prettier are clean on the file.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game title -> filesystem path | A store-supplied title becomes a `.app` path component under ~/Desktop |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-clh-01 | Tampering | shortcutFiles darwin Desktop path | mitigate | The title already passes through `sanitize-filename` before both darwin paths are built, so a title cannot escape ~/Desktop. The new path reuses the same sanitized `gameTitle`. |
| T-clh-02 | Tampering | run.sh in the Desktop copy | mitigate | It is produced by the same `generateMacOsApp` template, with encodeURIComponent plus quoting (T-34.5-C6-17), so no second template exists. |
| T-clh-03 | Denial of service | removeShortcuts recursive rm on ~/Desktop/<title>.app | accept | The path is fixed and sanitized, and it is the same `rm -rf` semantics already used for ~/Applications. |
</threat_model>

<verification>
- `npx jest src/backend/shortcuts` is green, including the darwin cases on a non-darwin host (they override process.platform).
- Operator live check on this Mac: restart `pnpm tauri:dev` and check the sidecar.js mtime. In Settings > Shortcuts, toggle "Add desktop shortcuts automatically" on. Add shortcut on a game: `.app` files appear on both ~/Desktop and ~/Applications. Remove shortcuts: both are gone. Toggle off, then Add: the Applications copy only.
</verification>

<success_criteria>
The macOS Desktop shortcut is opt-in through the existing toggle. Menu add with the toggle off is unchanged (Applications only). Removal and the exists check cover both copies.
</success_criteria>

<output>
Create `.planning/quick/261026-clh-macos-opt-in-desktop-shortcut-via-adddes/261026-clh-SUMMARY.md` when done
</output>
