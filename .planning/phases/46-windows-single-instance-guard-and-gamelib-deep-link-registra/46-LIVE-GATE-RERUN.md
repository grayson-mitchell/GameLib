---
status: pending
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
plan: 46-07
supersedes: 46-LIVE-GATE.md (FAIL at Check 3, 2026-09-24)
build_sha: 5b6201e261ac39e6addfcc15028cb86bb74ed0d9
build_type: debug NSIS installer (`pnpm tauri build --debug --bundles nsis`)
built_at: 2026-09-24T07:35:41+12:00
operator: Grayson Mitchell
---

# Phase 46 Live Gate Re-run — REQ-46-10 (Windows single-instance guard + gamelib:// deep-link registration)

> **Nothing in this document may be filled in by an agent.** Every Observed cell holds only an
> operator-reported number, an operator-reported True/False value, or a console/registry line
> reported verbatim by a human running the commands below on a real Windows 11 machine. `_pending_`
> cells stay `_pending_` until a human reports a value.
>
> `46-LIVE-GATE.md` is the preserved record of the first run (the FAIL at Check 3) and is **not**
> edited by this file or by writing this file — it only receives an additions-only pointer once this
> re-run has a verdict.

## What changed since the first run

Plan 46-06 fixed the defect `46-LIVE-GATE.md` recorded at Check 3: it added `unminimize()` ahead of
`show()`/`set_focus()` at all three Windows raise sites (the pipe sentinel arm, the tray "show" menu
arm, and the tray left-click handler), added receipt and per-call ok/err logging to the sentinel arm
so this re-run can tell "sentinel never arrived" from "sentinel arrived but a call failed", and added
a defensive foreground-rights grant from the secondary to the owner-verified primary before the
secondary exits (the Windows-foreground-lock candidate carried forward from the first gate).

## Build under test

| Field | Value |
|---|---|
| Commit | `5b6201e26` (full: `5b6201e261ac39e6addfcc15028cb86bb74ed0d9`, 46-06 Task 2) |
| Representative of HEAD? | **Yes.** `git diff --stat 5b6201e26..HEAD -- src-tauri/ src/` is empty — no file under `src-tauri/` or `src/` changed since this build. Re-verified at 46-07 Task 1 time (2026-09-24), immediately before writing this file. |
| Setup .exe path | `src-tauri/target/debug/bundle/nsis/GameLib_0.7.0_x64-setup.exe` (absolute: `C:\Users\grays\Projects\GameLib\src-tauri\target\debug\bundle\nsis\GameLib_0.7.0_x64-setup.exe`) |
| Setup .exe size | 114,778,338 bytes (~109.5 MiB) |
| Setup .exe mtime | 2026-09-24 07:35:41 +1200 |
| `installer.nsi` path | `src-tauri/target/debug/nsis/x64/installer.nsi` |
| `installer.nsi` `Classes\gamelib` line count | **6** (`grep -cF 'Classes\gamelib' src-tauri/target/debug/nsis/x64/installer.nsi`, re-confirmed at Task 1 time) |
| `gamelib-shell.exe` sentinel literal | present, count 1 (`grep -caF 'received single-instance focus sentinel -- raising the main window' src-tauri/target/debug/gamelib-shell.exe`, re-confirmed at Task 1 time) |
| Machine | Windows 11 Home 10.0.26200 |
| `<appid>`/`<runner>` used | None — this re-run uses the side-effect-free `ping` route throughout, so no game is launched |

## Why this build, not a fresh one

Task 1's freshness check (`git diff --stat 5b6201e26..HEAD -- src-tauri/ src/`) returned empty — no
source file changed since the 46-06 build. Per the plan, no rebuild was needed; this is the same
setup .exe 46-06 produced, unrun until this re-gate.

---

## Helpers

Run this block ONCE in PowerShell window B before starting P0.

```powershell
Add-Type -Namespace GL -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();'

$exe = "$env:LOCALAPPDATA\GameLib\gamelib-shell.exe"

$sidecars = { (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*sidecar.js*' }).Count }

$shells = { (Get-Process gamelib-shell -ErrorAction SilentlyContinue).Count }
```

---

## P0 (precondition, install)

```powershell
# 1. Quit any running GameLib normally (tray icon, then Quit), then confirm nothing is running
& $shells
& $sidecars

# 2. Run the 46-06 setup .exe (interactive installer)
& "C:\Users\grays\Projects\GameLib\src-tauri\target\debug\bundle\nsis\GameLib_0.7.0_x64-setup.exe"

# 3. Confirm the registered protocol handler points at the current install
reg query "HKCU\Software\Classes\gamelib\shell\open\command" /ve

# 4. Confirm the reinstall replaced the old binary
(Get-Item $exe).LastWriteTime

# 5. Confirm the installed binary carries the 46-06 fix
Select-String -Path $exe -Pattern 'received single-instance focus sentinel' -SimpleMatch -Quiet
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `& $shells` before install | 0 | _pending_ | _pending_ |
| `& $sidecars` before install | 0 | _pending_ | _pending_ |
| `reg query ... /ve` value | `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"` | _pending_ | _pending_ |
| `(Get-Item $exe).LastWriteTime` | Later than 2026-09-24 07:35:41 +1200 (the 46-06 build mtime) | _pending_ | _pending_ |
| `Select-String -Path $exe -Pattern 'received single-instance focus sentinel' -SimpleMatch -Quiet` | `True` | _pending_ | _pending_ |

---

## Check 1 (warm ping re-confirm)

```powershell
# In PowerShell window A:
& "$env:LOCALAPPDATA\GameLib\gamelib-shell.exe"
# wait for the library to render, then in window B:

& $shells
& $sidecars
Start-Process 'gamelib://ping?phase=46&check=1'
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `& $shells` after first launch | 1 | _pending_ | _pending_ |
| `& $sidecars` after first launch | 1 | _pending_ | _pending_ |
| Console line in window A after `ping` open | `[shell] delivered single-instance deep link to sidecar: ok` | _pending_ | _pending_ |
| New window appears after `ping` open | No | _pending_ | _pending_ |
| `& $shells` / `& $sidecars` after `ping` open | 1 / 1 | _pending_ | _pending_ |

---

## Check 2 (process counts, 5s settle + parent/child confirmation)

```powershell
# 5 seconds after the ping open, in window B:
& $shells
& $sidecars
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*sidecar.js*' } | Select ProcessId,ParentProcessId
(Get-Process gamelib-shell).Id
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `& $shells` (5s after `ping` open) | 1 | _pending_ | _pending_ |
| `& $sidecars` (5s after `ping` open) | 1 | _pending_ | _pending_ |
| sidecar `ParentProcessId` | Equals the single `gamelib-shell` Id | _pending_ | _pending_ |

---

## Check 3a (bare second launch from a terminal)

```powershell
# In window B, capture the handle BEFORE minimizing (must be nonzero):
$h = (Get-Process gamelib-shell).MainWindowHandle
$h

# Minimize the GameLib window, then:
[GL.W]::IsIconic($h)

# Then run ONE line, so the terminal does not retake focus before sampling:
& $exe; "exit=$LASTEXITCODE"; Start-Sleep 2; "iconic=$([GL.W]::IsIconic($h))"; "foreground=$([GL.W]::GetForegroundWindow() -eq $h)"
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `$h` captured before minimizing | Nonzero | _pending_ | _pending_ |
| `[GL.W]::IsIconic($h)` after minimizing | `True` | _pending_ | _pending_ |
| Secondary's `another GameLib instance ...` line | `[shell] another GameLib instance is already running -- sending focus sentinel to it and exiting` | _pending_ | _pending_ |
| Secondary's grant line (verbatim, either form; informational) | `[shell] granted foreground rights to the running instance (pid=N)` OR `[shell] WARN: could not grant foreground rights ...` | _pending_ | _pending_ |
| `exit=` | `exit=0` | _pending_ | _pending_ |
| `iconic=` (after second launch) | `iconic=False` | _pending_ | _pending_ |
| `foreground=` (after second launch) | `foreground=True` | _pending_ | _pending_ |
| Window A's `received single-instance focus sentinel` line | `[shell] received single-instance focus sentinel -- raising the main window` | _pending_ | _pending_ |
| Window A's `focus sentinel raise:` line | `[shell] focus sentinel raise: unminimize=ok, show=ok, set_focus=ok` (any `err=` recorded verbatim) | _pending_ | _pending_ |
| Operator's own eyes: window visible and in front | Yes | _pending_ | _pending_ |
| `& $shells` / `& $sidecars` after | 1 / 1 | _pending_ | _pending_ |

---

## Check 3b (bare second launch from the Start menu, the real user path)

```powershell
# Minimize GameLib again and confirm:
[GL.W]::IsIconic($h)

# In window B, run this and then use the Start menu WITHOUT clicking back into window B:
Start-Sleep 15; "iconic=$([GL.W]::IsIconic($h))"; "foreground=$([GL.W]::GetForegroundWindow() -eq $h)"; & $shells; & $sidecars
# Within the 15 seconds above, launch GameLib from the Start menu shortcut.
# A transient console window for the secondary may flash and close; that is expected for a debug build.
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `[GL.W]::IsIconic($h)` before the Start-menu launch | `True` | _pending_ | _pending_ |
| `iconic=` (after the Start-menu launch) | `iconic=False` | _pending_ | _pending_ |
| `foreground=` (after the Start-menu launch) | `foreground=True` | _pending_ | _pending_ |
| Window A's `received single-instance focus sentinel` line | `[shell] received single-instance focus sentinel -- raising the main window` | _pending_ | _pending_ |
| Window A's `focus sentinel raise:` line | all three `ok` | _pending_ | _pending_ |
| `& $shells` / `& $sidecars` after | 1 / 1 | _pending_ | _pending_ |

---

## Check 4 (two near-simultaneous cold launches)

```powershell
# 1. Quit GameLib normally, then confirm both counts are 0:
& $shells
& $sidecars

# 2. Launch twice in ONE line:
Start-Process $exe; Start-Process $exe

# 3. Wait 15 seconds, then:
& $shells
& $sidecars
(Get-Process gamelib-shell | Where-Object MainWindowHandle -ne 0).Count
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| Counts before the double-launch | 0 / 0 | _pending_ | _pending_ |
| `& $shells` 15s after double-launch | 1 | _pending_ | _pending_ |
| `& $sidecars` 15s after double-launch | 1 | _pending_ | _pending_ |
| Number of visible windows (`MainWindowHandle -ne 0` count) | 1 | _pending_ | _pending_ |

---

## Check 5 (force-killed primary does not block the next launch)

```powershell
# 1. OPERATOR force-kills the shell:
Stop-Process -Name gamelib-shell -Force

# 2. Record whether the sidecar survived (pre-existing, no job object; not a fail by itself):
& $sidecars

# 3. If nonzero, OPERATOR cleans it up and notes it:
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*sidecar.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# 4. Relaunch in window A:
& $exe

# 5. In window B, confirm counts, then confirm warm delivery still works:
& $shells
& $sidecars
Start-Process 'gamelib://ping?phase=46&check=5'
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `& $sidecars` survives the force-kill | Recorded either way; a surviving orphan is PRE-EXISTING (no job object) and does NOT fail this check | _pending_ | _pending_ |
| Relaunch starts a normal primary with a window | Yes | _pending_ | _pending_ |
| `& $shells` / `& $sidecars` after relaunch | 1 / 1 | _pending_ | _pending_ |
| Console line in window A after `ping` open, and window/count behavior | `[shell] delivered single-instance deep link to sidecar: ok`, no second window, counts stay 1 / 1 | _pending_ | _pending_ |

---

## Supplementary S1 (NON-GATING: tray left-click, which 46-06 also changed)

S1's result does NOT enter the verdict. A FAIL here files a todo instead of failing the gate.

```powershell
# Minimize GameLib, then re-capture the handle (the Check 5 relaunch created a new process):
$h = (Get-Process gamelib-shell).MainWindowHandle

# Left-click the tray icon, then:
[GL.W]::IsIconic($h)
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `[GL.W]::IsIconic($h)` after tray left-click | `False` | _pending_ | _pending_ |

---

## Verdict

`Verdict: _pending_`

Rule: `PASS` only if P0, Check 1, Check 2, Check 3a, Check 3b, Check 4 and Check 5 ALL match
Expected. The Check 5 orphan-sidecar observation, the informational grant line in Check 3a, and S1
do not by themselves fail it. Otherwise `FAIL (first failing: <check>)`.

---

## If any check FAILS

- Do NOT ship.
- Record the failing check's console output here, redacting no payload that the process itself did
  not log.
- Stop running the remaining checks.
- The operator decides between:
  1. fix-forward via `/gsd-plan-phase 46 --gaps`, or
  2. reverting the 46-04 override-removal commit (`607089433`) before any release, so Windows is
     unregistered again (D-05).
- The todo (`2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`) and ledger row
  `U-34.5-18` stay open either way.
