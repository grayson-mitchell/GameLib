---
status: resolved
trigger: "UAT 66.4 Windows Test 2: Desktop shortcut for Total War: PHARAOH DYNASTIES shows a folder icon and clicking it opens the Documents folder instead of launching the game"
created: 2026-11-13T23:20:00+13:00
updated: 2026-11-14T12:00:00+13:00
---

## Current Focus

hypothesis: CONFIRMED (two independent defects, AND-gate = yes). (1) Folder icon: the Steam record has no `install.executable`, so the win32 branch of addShortcuts never sets an icon, and a `.lnk` that targets explorer.exe with no icon inherits explorer.exe's own icon, which is the yellow folder. (2) Opens Documents: buildShortcutEnv builds the argument UNQUOTED (`explorer.exe gamelib://launch?appName=...&runner=...`); explorer.exe does not dispatch an unquoted `scheme://host?query` argument to the protocol handler, treats it as an unparseable path and falls back to opening the Documents folder.
test: DONE. Wrote .lnk files through the project's own writer (scratch copy of windowsShortcut.ts, same PowerShell script and env) into the scratchpad, opened them via ShellExecute (Start-Process), and observed (a) the shell-rendered icon, (b) whether a throwaway HKCU protocol handler was invoked, (c) which Explorer windows opened.
expecting: n/a (diagnose-only)
next_action: Return ROOT CAUSE FOUND to caller; plan-phase --gaps owns the fix.
bug_class: bohrbug (deterministic, 3/3 repeat)
reasoning_checkpoint: null
tdd_checkpoint: null

## Symptoms

expected: A Windows Desktop shortcut added for an installed game launches that game and carries the game's icon.
actual: "partial;  shortcut added then removed.  but the icon for total war: paraoh dynasties was a folder icon.  When I clicked on it, just took me to docs folder!"
errors: None. gamelib.log 2026-11-13 23:02:20-21 "Adding shortcuts for Total War: PHARAOH DYNASTIES", "Shortcut saved on C:\Users\grays\OneDrive\Desktop\Total War PHARAOH DYNASTIES.lnk", same for Start Menu; 23:03:22 both removed. Placement and removal are correct; the defect is the .lnk's target/arguments and icon.
reproduction: Test 2 in .planning/phases/66.4-backend-module-state-long-tail-census-flip-and-live-smokes/66.4-WINDOWS-UAT.md. `pnpm tauri:dev` dev build, Windows 11, Steam game 2951630.
started: Never worked. The explorer.exe wrapper has been in windowsShortcut.ts since its first commit (14745f7fa, 2026-10-05) and the commit message says "The Windows .lnk todo stays pending (ready: live-gate) for a live run". This UAT is the first live run.

## Eliminated

- hypothesis: gamelib:// protocol is not registered or is registered wrongly (missing "URL Protocol" value), so explorer falls back to Documents.
  evidence: HKCU\Software\Classes\gamelib and HKCR\gamelib both have `URL Protocol` (empty string), default "URL:com.gamelib.shell protocol", DefaultIcon, and shell\open\command = "C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1". gamelib-shell.exe exists at that path (Oct 29). Registration is well-formed. A throwaway protocol registered with the identical shape (glprobe) reproduces the Documents fallback and succeeds when the argument is quoted, so registration is not the variable.
  timestamp: 2026-11-13T23:23

- hypothesis: the `&` in the query string (shell/cmd metacharacter) is what breaks the argument.
  evidence: No shell is involved in either the writer (env vars to IShellLinkW) or the launch (CreateProcess from the .lnk). `glprobe://launch?appName=2951630` (no `&`) also falls back to Documents unquoted. The `?` is the trigger, not `&`.
  timestamp: 2026-11-13T23:23

- hypothesis: the PowerShell/IShellLinkW writer mangles the target or arguments.
  evidence: Read back the written .lnk with WScript.Shell: TargetPath=[C:\Windows\explorer.exe], Arguments=[gamelib://launch?appName=2951630&runner=steam]. Exactly what buildShortcutEnv emitted; no mangling.
  timestamp: 2026-11-13T23:21

- hypothesis: this is a 66.4 regression (the 66.2/66.3/66.4 refactors changed the writer).
  evidence: `git show 14745f7fa:.../windowsShortcut.ts` (2026-10-05) already has the identical isUrl -> explorer.exe branch, the identical unquoted `[details.target, details.args].filter(Boolean).join(' ')`, and `GAMELIB_LNK_ICON: details.icon ?? ''`. Later commits (a92897514 IShellLinkW, 361e614e6 runner, 7d033f284 platform delegate) did not touch these lines. The win32 icon logic in shortcuts.ts is also unchanged in meaning. Pre-existing, first exposed by this live gate.
  timestamp: 2026-11-13T23:27

## Evidence

- timestamp: 2026-11-13T23:20
  checked: %APPDATA%\GameLib\store_cache\steam_library.json entry for app_name 2951630
  found: runner "steam", install = { install_path: "C:\Program Files (x86)\Steam\steamapps\common\Total War PHARAOH DYNASTIES", install_size, platform: "Windows" }. There is NO `executable` key. (InstalledInfo declares `executable: string` as required in src/common/types.ts:422, but the Steam record never sets it.)
  implication: In shortcuts.ts win32 arm, `let executable = gameInfo.install.executable` is undefined, so `if (executable) {...}` is skipped and `shortcutOptions.icon`/`iconIndex` are never set. buildShortcutEnv then emits GAMELIB_LNK_ICON = '' and the C# helper skips SetIconLocation (`if (!string.IsNullOrEmpty(icon))`).

- timestamp: 2026-11-13T23:21
  checked: Ran the project's writer (scratch copy of windowsShortcut.ts, same WRITE_SHORTCUT_SCRIPT, same powershell argv) with details = { target: 'gamelib://launch?appName=2951630&runner=steam' } and no icon, into <scratchpad>\lnk\repro-noicon.lnk; read back with WScript.Shell and rendered the shell icon via SHGetFileInfo.
  found: TargetPath=[C:\Windows\explorer.exe]; Arguments=[gamelib://launch?appName=2951630&runner=steam]; IconLocation=[,0]. Rendered icon (repro-noicon.png) is the yellow Windows folder with a shortcut arrow overlay: exactly what the operator saw.
  implication: Defect 1 reproduced. With no explicit icon the shell uses the target exe's embedded icon, and explorer.exe's first icon is the folder. The folder icon is a SYMPTOM OF THE EXPLORER WRAPPER plus the missing icon, not an icon-file problem.

- timestamp: 2026-11-13T23:21
  checked: Same writer, same target, but icon = "C:\Program Files (x86)\Steam\steamapps\common\Total War PHARAOH DYNASTIES\Pharaoh.exe" (exists on this box).
  found: IconLocation=[...\Pharaoh.exe,0]; rendered icon is the gold Total War compass. The icon pathway of the writer works when an icon is supplied.
  implication: Fix for defect 1 only needs to supply an icon source for Steam games; the writer needs no change for icons.

- timestamp: 2026-11-13T23:22
  checked: Registered a throwaway protocol HKCU\Software\Classes\glprobe (URL Protocol, shell\open\command = powershell -File handler.ps1 "%1", handler appends the received URL to a file), wrote a .lnk through the project's writer with target `glprobe://launch?appName=2951630&runner=steam` (so explorer.exe + the same unquoted argument), opened it with Start-Process (ShellExecute, same as a double-click), and listed Explorer windows before/after via Shell.Application.
  found: Handler NOT invoked ("HANDLER HIT: none"). A new Explorer window opened at `Documents | file:///C:/Users/grays/OneDrive/Documents`. Matches the operator's "took me to docs folder" (the OneDrive-redirected Documents).
  implication: Defect 2 reproduced with a harmless protocol (the real gamelib:// handler was never invoked, so no game or app was launched). explorer.exe given the unquoted URL does not dispatch it.

- timestamp: 2026-11-13T23:23
  checked: A/B variants of the .lnk arguments, same throwaway protocol, 6 launches total (full table below).
  found: |
    explorer.exe + `glprobe://launch` (unquoted, no `?`)                                   -> handler HIT, no Documents window
    explorer.exe + `glprobe://launch?appName=2951630` (unquoted, `?`, no `&`)              -> NO hit, Documents window
    explorer.exe + `glprobe://launch/?appName=2951630&runner=steam` (unquoted)             -> NO hit, Documents window
    explorer.exe + `glprobe://launch?appName=2951630&runner=steam` (unquoted, = current)   -> NO hit, Documents window (3/3 runs)
    explorer.exe + `"glprobe://launch?appName=2951630&runner=steam"` (QUOTED)              -> handler HIT, no Documents window (3/3 runs); handler received `glprobe://launch/?appName=2951630&runner=steam`
    rundll32.exe + `url.dll,FileProtocolHandler glprobe://launch?appName=2951630&runner=steam` -> handler HIT, no Documents window
  implication: The single variable that flips the outcome is quoting the URL argument (the unquoted `?` form is what breaks). Quoting is sufficient with explorer.exe. rundll32 url.dll,FileProtocolHandler also works. The exact internal reason explorer treats the unquoted `?` token differently was not determined (explorer's own command-line parsing); the A/B is the evidence, repeated 3/3.

- timestamp: 2026-11-13T23:27
  checked: src/backend/protocol.ts parseHeroicUrl/handleProtocol.
  found: Dispatch uses `new URL(arg)`, `url.hostname === 'launch'` and `searchParams`. The `launch/` trailing slash that the shell adds on dispatch is harmless.
  implication: A quoted-argument fix reaches handleLaunch unchanged.

- timestamp: 2026-11-13T23:27
  checked: src/backend/shortcuts/__tests__/windowsShortcut.test.ts:133-143
  found: The unit test pins `GAMELIB_LNK_ARGS` toBe(url) (unquoted) and `GAMELIB_LNK_TARGET` toBe('D:\\WINDOWS\\explorer.exe'). It asserts the wrong behaviour as expected.
  implication: Fix must change that expectation. The unit test never exercised explorer's actual parsing, so it could not have caught this ("no gate existed for this class": needs a live or Windows-only check).

- timestamp: 2026-11-13T23:27
  checked: scope of defect 2 across stores.
  found: `launchWithProtocol` = `gamelib://launch?appName=${app_name}&runner=${runner}` for every store; all contain `?`. So defect 2 affects every Windows shortcut (GOG, Epic, Amazon, sideload, Steam, Humble), not just Steam. Defect 1 is Steam specific on this path (GOG sets executable via getExecutable; Epic/sideload carry install.executable); other stores that lack `install.executable` would show the folder icon too.
  implication: Epic/GOG shortcuts written by the same code are also broken on click; the operator only noticed it on Steam because that was the game tested.

- timestamp: 2026-11-13T23:28
  checked: Icon sources available for a Steam game on this box.
  found: `Pharaoh.exe` in the install folder (what Steam's own shortcut icon is derived from); `C:\Program Files (x86)\Steam\steam\games\<clienticon-hash>.ico` files exist (Steam's cached client icons, hash comes from appinfo common.clienticon); `Steam\appcache\librarycache\2951630\` holds only jpg/png artwork (not usable as a .lnk icon). getIcon() (utils.ts) downloads art_square as .jpg, which an .lnk cannot use as an icon.
  implication: Reasonable icon sources for a Steam game: the resolved Windows launch exe (launchTarget / install dir scan), the Steam clienticon .ico, or as a last resort the GameLib exe (deps.paths.exe) so it is at least not a folder.

- timestamp: 2026-11-13T23:28
  checked: Cleanup of experiments.
  found: HKCU\Software\Classes\glprobe removed (Test-Path = False); all Explorer windows opened by the probes were closed (0 left); only scratchpad files created; real Desktop never touched; the real gamelib:// handler was never invoked; no source file edited.
  implication: No residue on the operator's machine.

## Resolution

root_cause: |
  Two independent defects in the win32 arm of addShortcuts / buildShortcutEnv (AND-gate: yes, each alone produces a bad shortcut).
  (1) FOLDER ICON. A Steam record has no `install.executable` (steam_library.json install = {install_path, install_size, platform}), so shortcuts.ts never sets `shortcutOptions.icon`; GAMELIB_LNK_ICON is '' and SetIconLocation is skipped. The .lnk's target is C:\Windows\explorer.exe, whose embedded icon is the yellow folder, so the shortcut renders as a folder.
  (2) OPENS DOCUMENTS. buildShortcutEnv turns the `gamelib://launch?appName=2951630&runner=steam` target into explorer.exe with the URL as an UNQUOTED argument. Measured: explorer.exe does not dispatch an unquoted `scheme://host?query` argument to the registered protocol handler (the handler is never invoked); it falls back to opening the Documents folder (here the OneDrive-redirected one). The same URL wrapped in double quotes is dispatched to the handler 3/3, and `rundll32.exe url.dll,FileProtocolHandler <url>` also works. The gamelib:// registration itself is correct.
  Origin: pre-existing since 14745f7fa (2026-10-05); not a 66.4 regression; first live run of an ready:live-gate todo.
fix: "66.4-24: quoted gamelib:// argument to explorer.exe (42ed64679) and a Windows shortcut icon resolver: store exe, install-dir scan, then GameLib shell (d46639af5)"
verification: "66.4-25: real Windows .lnk readback and opt-in dispatch probe (14fb16a92); 66.4-WINDOWS-UAT item 7 pass 2026-11-14 for Total War PHARAOH DYNASTIES (Steam) and Our Free World Demo (Epic)"
oracle_type: n/a
files_changed: [src/backend/shortcuts/shortcuts/windowsShortcut.ts, src/backend/shortcuts/shortcuts/shortcuts.ts]
