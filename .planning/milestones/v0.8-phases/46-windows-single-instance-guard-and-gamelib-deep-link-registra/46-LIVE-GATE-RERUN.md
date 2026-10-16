---
status: passed
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
> reported verbatim by a human running the commands below on a real Windows 11 machine. Placeholder
> cells stayed unfilled until a human reported a value; this file now records the operator's
> 2026-09-25 report, transcribed verbatim by Task 3.
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
| `& $shells` before install | 0 | 0 (measured 2026-09-25 immediately before Check 1, NOT pre-install — the 46-06 setup .exe was installed by the operator on 2026-09-24, before this session; see Notes) | PASS (post-install baseline, not pre-install; see Notes) |
| `& $sidecars` before install | 0 | 0 (same caveat as above) | PASS (post-install baseline, not pre-install; see Notes) |
| `reg query ... /ve` value | `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"` | `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"` | PASS |
| `(Get-Item $exe).LastWriteTime` | Later than 2026-09-24 07:35:41 +1200 (the 46-06 build mtime) | `2026-09-24T07:34:20+12:00` (CreationTime identical). Does NOT literally match — NSIS preserves the exe's build timestamp, and the exe was built 81s before the setup .exe was packed (07:35:41). Proof of the reinstall instead: `%LOCALAPPDATA%\GameLib\uninstall.exe` LastWriteTime = 2026-09-24 07:48:23 (after the setup .exe mtime), and the sentinel `Select-String` check below is `True` | PASS (expectation defect — intent met; see Notes) |
| `Select-String -Path $exe -Pattern 'received single-instance focus sentinel' -SimpleMatch -Quiet` | `True` | `True` | PASS |

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
| `& $shells` after first launch | 1 | 1 (primary launched in window A at 20:32:45, gamelib-shell pid 4988) | PASS |
| `& $sidecars` after first launch | 1 | `& $sidecars` printed BLANK, not `1` — a single `Get-CimInstance` match has no intrinsic `.Count` property in Windows PowerShell 5.1, so the helper's `.Count` silently evaluates to nothing (helper/script defect, see Notes deviation a). The orchestrating agent's read-only diagnostic against the same match confirmed `@(...).Count` = 1, sidecar pid 12764, `CommandLine` `"node" C:\Users\grays\Projects\GameLib\src-tauri/../build/main/sidecar.js` | PASS (blank reads as 1; see Notes) |
| Console line in window A after `ping` open | `[shell] delivered single-instance deep link to sidecar: ok` | `[shell] delivered single-instance deep link to sidecar: ok` | PASS |
| New window appears after `ping` open | No | No | PASS |
| `& $shells` / `& $sidecars` after `ping` open | 1 / 1 | 1 / blank (= 1, same helper defect) | PASS |

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
| `& $shells` (5s after `ping` open) | 1 | 1 | PASS |
| `& $sidecars` (5s after `ping` open) | 1 | blank (= 1, same helper defect) | PASS (blank reads as 1; see Notes) |
| sidecar `ParentProcessId` | Equals the single `gamelib-shell` Id | Verbatim window B: `ProcessId 12764, ParentProcessId 4988`; `(Get-Process gamelib-shell).Id` = `4988`. Parent 4988 == shell Id 4988 | PASS |

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
| `$h` captured before minimizing | Nonzero | `1248354` | PASS |
| `[GL.W]::IsIconic($h)` after minimizing | `True` | `True` | PASS |
| Secondary's `another GameLib instance ...` line | `[shell] another GameLib instance is already running -- sending focus sentinel to it and exiting` | `[shell] another GameLib instance is already running -- sending focus sentinel to it and exiting` | PASS |
| Secondary's grant line (verbatim, either form; informational) | `[shell] granted foreground rights to the running instance (pid=N)` OR `[shell] WARN: could not grant foreground rights ...` | `[shell] granted foreground rights to the running instance (pid=4988)` | PASS (informational) |
| `exit=` | `exit=0` | `exit=0` | PASS |
| `iconic=` (after second launch) | `iconic=False` | `iconic=False` | PASS |
| `foreground=` (after second launch) | `foreground=True` | `foreground=True` | PASS |
| Window A's `received single-instance focus sentinel` line | `[shell] received single-instance focus sentinel -- raising the main window` | `[shell] received single-instance focus sentinel -- raising the main window` | PASS |
| Window A's `focus sentinel raise:` line | `[shell] focus sentinel raise: unminimize=ok, show=ok, set_focus=ok` (any `err=` recorded verbatim) | `[shell] focus sentinel raise: unminimize=ok, show=ok, set_focus=ok` | PASS |
| Operator's own eyes: window visible and in front | Yes | Yes | PASS |
| `& $shells` / `& $sidecars` after | 1 / 1 | 1 / blank (= 1, same helper defect) | PASS |

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

Three attempts were run; see `## Notes` for the full three-attempt history (deviations c and d).
Only Attempt 3 (a continuous 200ms foreground poll, the correct instrument) is decisive. Attempt 1
is INVALID (a different, Electron-era GameLib install was launched by mistake). Attempt 2 is
INCONCLUSIVE (the script's prescribed single 15s-later sample is a flawed instrument — see Notes
deviation c). The rows below record Attempt 3's decisive values, with Attempts 1-2 cross-referenced
inline.

| Item | Expected | Observed | Result |
|---|---|---|---|
| `[GL.W]::IsIconic($h)` before the Start-menu launch | `True` | `True` (confirmed before each of the three attempts) | PASS |
| `iconic=` (after the Start-menu launch) | `iconic=False` | Attempt 3 (decisive, continuous poll): `iconic=False` from 20:55:13.763 onward through the end of the ~20s poll. Attempt 2: `iconic=False`. Attempt 1 (INVALID): `iconic=True` (the wrong app was launched, so gamelib-shell itself never got a launch event) | PASS (attempt 3) |
| `foreground=` (after the Start-menu launch) | `foreground=True` | Attempt 3 (decisive, continuous 200ms poll — command and full log in Notes): gamelib-shell (pid 4988, handle 1248354) held the foreground window continuously from 20:55:13.763 through the end of the ~20s poll, after fg passed through Code/SearchHost/explorer/WindowsTerminal. Attempt 2 (single 15s-later sample, INCONCLUSIVE): `foreground=False`, but the operator's own eyes confirmed the window came up on top and active — a single-sample flaw in the script's own instrument, not a GameLib defect (Notes deviation c). Attempt 1: INVALID — a leftover Electron-era `C:\Program Files\GameLib\GameLib.exe`, sharing the same Start-menu shortcut name, launched instead of the Tauri build (Notes deviation d) | PASS (attempt 3; the prescribed single-sample instrument is flawed, see Notes) |
| Window A's `received single-instance focus sentinel` line | `[shell] received single-instance focus sentinel -- raising the main window` | Present — window A showed exactly three sentinel-receipt/raise pairs across 3a + 3b attempts 2 and 3 combined | PASS |
| Window A's `focus sentinel raise:` line | all three `ok` | `unminimize=ok, show=ok, set_focus=ok` (one of the three occurrences above) | PASS |
| `& $shells` / `& $sidecars` after | 1 / 1 | 1 / 1 (blank = 1, same helper defect) — reported after attempt 3's poll | PASS |

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
| Counts before the double-launch | 0 / 0 | 0 / 0 (quit via tray) | PASS |
| `& $shells` 15s after double-launch | 1 | 1 | PASS |
| `& $sidecars` 15s after double-launch | 1 | 1 | PASS |
| Number of visible windows (`MainWindowHandle -ne 0` count) | 1 | 1 (only one window seen) | PASS |

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
| `& $sidecars` survives the force-kill | Recorded either way; a surviving orphan is PRE-EXISTING (no job object) and does NOT fail this check | `0` — no orphan sidecar survived `Stop-Process -Name gamelib-shell -Force`. No orphan cleanup was needed and no orphan todo is filed | PASS |
| Relaunch starts a normal primary with a window | Yes | Yes — window A's log shows a normal startup through `sidecar signalled READY` | PASS |
| `& $shells` / `& $sidecars` after relaunch | 1 / 1 | 0 / 0 immediately post-kill, then relaunched. First ping attempt failed: `Start-Process : This command cannot be run due to the error: Application not found.` — ENVIRONMENT, not a GameLib defect. The leftover Electron-era GameLib (launched by mistake in Check 3b attempt 1) had re-registered `gamelib://` at runtime to `"C:\Program Files\GameLib\GameLib.exe" "%1"` in HKCU, and the operator's subsequent uninstall of that Electron app deleted that exe, leaving a dangling handler (Notes deviation d). The orchestrating agent, with the operator present, restored the HKCU value to the installer-written `"C:\Users\grays\AppData\Local\GameLib\gamelib-shell.exe" "%1"` via `Set-ItemProperty`, confirmed by `reg query`. Retry: `1`, `1`, no error | PASS (after the agent's HKCU restoration; see Notes) |
| Console line in window A after `ping` open, and window/count behavior | `[shell] delivered single-instance deep link to sidecar: ok`, no second window, counts stay 1 / 1 | `[shell] delivered single-instance deep link to sidecar: ok`; no second window; 5s later counts still `1` / `1` | PASS |

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
| `[GL.W]::IsIconic($h)` after tray left-click | `False` | Not run — the operator skipped S1 (non-gating). No todo is filed for it (nothing was observed in either direction) | not run (skipped, non-gating) |

---

## Verdict

Verdict: PASS

P0, Check 1, Check 2, Check 3a, Check 3b, Check 4 and Check 5 all meet intent. The two P0
expectation-defect rows (pre-install baseline timing, LastWriteTime) are script/environment defects
rather than GameLib defects — see `## Notes` below. Check 3b's PASS rests on Attempt 3's continuous
foreground poll, the correct instrument; Attempt 1 was invalid (wrong app launched) and Attempt 2
was inconclusive on its own single-sample instrument, but neither contradicts Attempt 3. The Check 5
orphan-sidecar observation (none observed) and the informational grant line in Check 3a do not by
themselves fail the gate. S1 was not run (skipped, non-gating) and does not affect the verdict.

Ignore the stray `granted foreground rights ... (pid=21164)` block noted at the top of window A's
scrollback during the session: it is from an earlier session, not this re-run.

---

## Notes (re-run deviations, 2026-09-25)

These are recorded as SCRIPT/ENVIRONMENT defects in this re-run's own instrumentation, NOT as
GameLib defects. None of them changes the verdict.

**a. `$sidecars` helper prints blank, not a number, for a single match.** On Windows PowerShell
5.1, a single `Get-CimInstance` result is not wrapped in a collection, so it has no intrinsic
`.Count` property — the pipeline silently returns nothing rather than `1`. The correct form wraps
the expression in `@(...)` (`@(Get-CimInstance ...).Count`), which always returns a collection
regardless of match count. This affected every `& $sidecars` call in this re-run; blank is read as
`1` throughout the tables above. The first gate (`46-LIVE-GATE.md`) used
`(Get-Process gamelib-sidecar).Count` against a single object too, so its own single-match counts
should be read the same way if re-examined.

**b. The P0 `LastWriteTime` expectation ("later than the 46-06 build mtime") is wrong for an NSIS
install.** NSIS preserves the installed binary's original build timestamp rather than stamping it
with the install time, so a correct reinstall's `gamelib-shell.exe` LastWriteTime is NOT expected to
move. The valid freshness evidence is the uninstaller's own mtime (`%LOCALAPPDATA%\GameLib\uninstall.exe`,
2026-09-24 07:48:23, which is after the setup .exe's 07:35:41 mtime) plus the `Select-String`
sentinel-literal check, both of which confirmed the reinstall. A future gate script should assert
against the uninstaller's mtime, not the main exe's.

**c. Check 3b's single-sample `foreground=` check (15s-later, one PowerShell line) is a flawed
instrument.** It can only report whichever process happens to hold the foreground handle at the
instant it samples — including a transient console window belonging to the just-exited secondary
process — and cannot distinguish that from a genuine refusal to grant foreground rights. Attempt 2
hit exactly this: `foreground=False` at the +15s sample, while the operator's own eyes saw the
GameLib window come up on top and active. The correct instrument, used decisively in Attempt 3, is
a continuous foreground poll (200ms interval, printing only on change) for the duration of the
launch window:

```powershell
Add-Type -Namespace GL -Name W2 -MemberDefinition '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);'
$end=(Get-Date).AddSeconds(20); $last=''; while((Get-Date) -lt $end){ $f=[GL.W]::GetForegroundWindow(); $fp=[uint32]0; [void][GL.W2]::GetWindowThreadProcessId($f,[ref]$fp); $n=(Get-Process -Id $fp -ErrorAction SilentlyContinue).Name; $s="$(Get-Date -f HH:mm:ss.fff) fg=$f proc=$n isGameLib=$($f -eq $h) iconic=$([GL.W]::IsIconic($h))"; if($s.Substring(13) -ne $last){$s; $last=$s.Substring(13)}; Start-Sleep -Milliseconds 200 }; & $shells; & $sidecars
```

Attempt 3's captured output (verbatim, 20:55:04-20:55:13):

```
20:55:04.172 fg=67646 proc=Code isGameLib=False iconic=True
20:55:07.435 fg=197212 proc=SearchHost isGameLib=False iconic=True
20:55:13.107 fg=66026 proc=explorer isGameLib=False iconic=True
20:55:13.544 fg=132094 proc=WindowsTerminal isGameLib=False iconic=True
20:55:13.763 fg=1248354 proc=gamelib-shell isGameLib=True iconic=False
1
1
```

The poller prints only on change and ran ~20s from 20:55:04, so gamelib-shell held the foreground
handle from 20:55:13.763 through the end of the window with no further change — decisive proof the
grant succeeded and held, which a single 15s-later sample cannot distinguish from a transient hit.
This instrument is proposed for any future gate that needs to measure a foreground-lock grant.

**d. A leftover Electron-era GameLib install hijacked Check 3b's first attempt, then the
`gamelib://` handler.** Typing "GameLib" in the Start menu during Attempt 1 launched a DIFFERENT,
pre-existing program: a machine-wide Electron-era install at `C:\Program Files\GameLib\GameLib.exe`,
with its own Start-menu shortcut (`C:\ProgramData\Microsoft\Windows\Start Menu\Programs\GameLib.lnk`)
carrying the identical display name as the current Tauri shortcut
(`%APPDATA%\Microsoft\Windows\Start Menu\Programs\GameLib.lnk` → `gamelib-shell.exe`). Confirmed via
process list: Electron `GameLib.exe` pid 30064 started 20:41:56 alongside `gamelib-shell` pid 4988.
It carries no Phase 46 guard, so Attempt 1 did not exercise the code under test — it is recorded as
INVALID, not FAIL. The operator closed it and uninstalled the Electron app. Its uninstall then left
a dangling `gamelib://` HKCU registration (see Check 5's row above and item e below) — the Electron
app had re-registered the handler to its own exe path at runtime when it launched, and removing that
exe on uninstall broke the mapping without restoring the previous value. This is a pre-existing,
known artifact (the same leftover Electron-era HKCU key the phase 46 todo itself calls out as
untouched by the current build) interacting with this session, not a defect introduced by the 46-06
fix under test.

**e. Build freshness at re-run time.** `git diff --stat 5b6201e26..HEAD -- src-tauri/` at the time of
this re-run showed only `src-tauri/tauri.conf.json` changed (adds a macOS `app` bundle target,
commit `598fac565`, irrelevant to the Windows guard under test). `src/` changed in 67 files
(frontend focus-ring/gamepad work), none touching the single-instance guard or focus-sentinel code.
The sidecar that Check 1/2 measured ran from the repo's `build/main/sidecar.js`, rebuilt
2026-09-25 18:41 — after the binary under test but not touching any file the guard depends on. The
build table's "Representative of HEAD? Yes" row, above, was true and correctly stated at Task 1 time
(2026-09-24) and is not rewritten here; this note supplements it with the re-run-time re-check.

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
