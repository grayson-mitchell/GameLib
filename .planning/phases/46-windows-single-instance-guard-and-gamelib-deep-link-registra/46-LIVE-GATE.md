---
status: in-progress
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
plan: 46-05
build_sha: 607089433ac79bff3b54cf99b0b6651898244565
build_type: debug NSIS installer (`pnpm tauri build --debug --bundles nsis`)
built_at: 2026-09-23T23:48:15+12:00
operator: [NAME]
started: 2026-09-23
---

# Phase 46 Live Gate — REQ-46-10 (Windows single-instance guard + gamelib:// deep-link registration)

> **Nothing in this document may be filled in by an agent.** Every Observed cell is a
> number, or a literal console/registry line, reported by a human running the commands
> below on a real Windows 11 machine. `_pending_` cells stay `_pending_` until a human
> reports a value. Task 3 (an agent) transcribes the operator's reported values verbatim
> into the Observed cells — it does not invent or infer them.

## Build under test

| Field | Value |
|---|---|
| Commit | `607089433` (full: `607089433ac79bff3b54cf99b0b6651898244565`) |
| Representative of HEAD? | **Yes.** `git diff --stat 607089433..HEAD -- src-tauri/ src/` is empty — no file under `src-tauri/` or `src/` changed since this build. Re-verified at 46-05 Task 1 time (2026-09-23), immediately before writing this file. |
| Setup .exe path | `src-tauri/target/debug/bundle/nsis/GameLib_0.7.0_x64-setup.exe` (absolute: `C:\Users\grays\Projects\GameLib\src-tauri\target\debug\bundle\nsis\GameLib_0.7.0_x64-setup.exe`) |
| Setup .exe size | 114,775,426 bytes (~109.5 MiB) |
| Setup .exe mtime | 2026-09-23 23:48:15 +1200 |
| `installer.nsi` path | `src-tauri/target/debug/nsis/x64/installer.nsi` |
| `installer.nsi` `Classes\gamelib` line count | **6** (`grep -cF 'Classes\gamelib' src-tauri/target/debug/nsis/x64/installer.nsi`, re-confirmed at Task 1 time) |
| Machine | Windows 11 Home 10.0.26200 |
| `<appid>` used for `launch` checks | [RECORD — a real installed or owned appName the operator picks] |
| `<runner>` used for `launch` checks | [RECORD — the runner for the chosen appid, e.g. `gog`, `legendary`, `nile`, `steam`] |

## Why this build, not a fresh one

Task 1's freshness check (`git diff --stat 607089433..HEAD -- src-tauri/ src/`) returned empty —
no source file changed since the 46-04 build. Per the plan, no rebuild was needed; this is the
same setup .exe 46-04 produced, unrun until this gate.

---

## P0 (precondition, install)

Run these BEFORE launching GameLib for the first time.

```powershell
# 1. Run the setup .exe (interactive installer)
& "C:\Users\grays\Projects\GameLib\src-tauri\target\debug\bundle\nsis\GameLib_0.7.0_x64-setup.exe"

# 2. Confirm the registered protocol handler points at the NEW install, not the stale Electron-era key
reg query "HKCU\Software\Classes\gamelib\shell\open\command" /ve

# 3. Confirm no GameLib process is running yet
Get-Process GameLib, gamelib-sidecar -ErrorAction SilentlyContinue
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `reg query ... /ve` value | Points at the NEW install path (NOT `C:\Program Files\GameLib\GameLib.exe`) with `"%1"` appended | _pending_ | _pending_ |
| `Get-Process GameLib, gamelib-sidecar` before launch | Zero rows (no output) | _pending_ | _pending_ |

---

## Check 1 (external open reaches the running instance)

```powershell
# 1. Launch GameLib from PowerShell by its installed exe path (shows [shell] console lines)
& "<installed-exe-path>"
# wait for the library to render, then in the SAME window:

# 2. Record counts
(Get-Process gamelib-sidecar).Count
(Get-Process GameLib).Count

# 3. In a SEPARATE PowerShell window, open the side-effect-free ping route (note the & in the URL)
Start-Process 'gamelib://ping?phase=46&check=1'

# 4. Re-check counts in the original window; confirm no new window appeared
(Get-Process gamelib-sidecar).Count
(Get-Process GameLib).Count

# 5. Open a real launch URL for the chosen <appid>/<runner>
Start-Process 'gamelib://launch?appName=<appid>&runner=<runner>'
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `gamelib-sidecar` count after first launch | 1 | _pending_ | _pending_ |
| `GameLib` count after first launch | 1 | _pending_ | _pending_ |
| Console line after `ping` open | `delivered single-instance deep link to sidecar: ok` | _pending_ | _pending_ |
| New window appears after `ping` open | No | _pending_ | _pending_ |
| `gamelib-sidecar` / `GameLib` counts after `ping` open | 1 / 1 | _pending_ | _pending_ |
| Behavior after `launch` open | Running instance reacts (launches the game, shows its page, or shows an error) — no second window | _pending_ | _pending_ |
| Console line after `launch` open | (record verbatim) | _pending_ | _pending_ |

---

## Check 2 (process counts, 5s settle + parent/child confirmation)

```powershell
# Wait 5 seconds after each open above, then:
(Get-Process gamelib-sidecar).Count
(Get-Process GameLib).Count
Get-CimInstance Win32_Process -Filter "Name='gamelib-sidecar.exe'" | Select ProcessId,ParentProcessId
Get-CimInstance Win32_Process -Filter "Name='GameLib.exe'" | Select ProcessId,ParentProcessId
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `gamelib-sidecar` count (5s after `ping` open) | 1 | _pending_ | _pending_ |
| `GameLib` count (5s after `ping` open) | 1 | _pending_ | _pending_ |
| `gamelib-sidecar` count (5s after `launch` open) | 1 | _pending_ | _pending_ |
| `GameLib` count (5s after `launch` open) | 1 | _pending_ | _pending_ |
| `gamelib-sidecar.exe` ParentProcessId | Equals the single `GameLib.exe` ProcessId | _pending_ | _pending_ |

---

## Check 3 (bare second launch focuses)

```powershell
# 1. Minimize the GameLib window.
# 2. From a SECOND PowerShell window, run the installed exe again with no arguments:
& "<installed-exe-path>"
$LASTEXITCODE
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| Console line from the second launch | `another GameLib instance is already running -- sending focus sentinel to it and exiting` | _pending_ | _pending_ |
| `$LASTEXITCODE` of the second launch | 0 | _pending_ | _pending_ |
| Existing window | Restored and focused | _pending_ | _pending_ |
| `gamelib-sidecar` / `GameLib` counts after | 1 / 1 | _pending_ | _pending_ |

---

## Check 4 (two near-simultaneous cold launches)

```powershell
# 1. Quit GameLib normally. Confirm both counts are 0:
Get-Process GameLib, gamelib-sidecar -ErrorAction SilentlyContinue

# 2. Launch twice in ONE line:
$exe='<installed-exe-path>'; Start-Process $exe; Start-Process $exe

# 3. Wait 15 seconds, then:
(Get-Process gamelib-sidecar).Count
(Get-Process GameLib).Count
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| Counts before the double-launch | 0 / 0 | _pending_ | _pending_ |
| `gamelib-sidecar` count 15s after double-launch | 1 | _pending_ | _pending_ |
| `GameLib` count 15s after double-launch | 1 | _pending_ | _pending_ |
| Number of visible windows | 1 | _pending_ | _pending_ |

---

## Check 5 (killed primary does not block)

```powershell
# 1. Force-kill the shell
Stop-Process -Name GameLib -Force

# 2. Record whether the sidecar survived (pre-existing, non-phase-46 behavior; not a fail by itself)
Get-Process gamelib-sidecar -ErrorAction SilentlyContinue

# 3. If it survived, clean it up and note it:
Stop-Process -Name gamelib-sidecar -Force  # only if step 2 showed a surviving process

# 4. Relaunch GameLib as a normal primary
& "<installed-exe-path>"

# 5. Confirm counts, then confirm warm delivery still works
(Get-Process gamelib-sidecar).Count
(Get-Process GameLib).Count
Start-Process 'gamelib://launch?appName=<appid>'
```

| Item | Expected | Observed | Result |
|---|---|---|---|
| `gamelib-sidecar` survives the force-kill | Recorded either way; a surviving orphan is PRE-EXISTING (no job object) and does NOT fail this check | _pending_ | _pending_ |
| Relaunch starts a normal primary with a window | Yes | _pending_ | _pending_ |
| Counts after relaunch | 1 / 1 | _pending_ | _pending_ |
| Follow-up `launch` open after relaunch | Delivered warm (no second window, running instance reacts) | _pending_ | _pending_ |

---

## Verdict

`Verdict: _pending_`

(Set to `PASS` only if P0 and Checks 1-5 all match Expected. Check 5's pre-existing
orphan-sidecar observation does not by itself fail the gate. Otherwise:
`FAIL (first failing: <check>)`.)

---

## If any check FAILS

- Do NOT ship.
- Record the failing check's console output here, redacting no payload that the process
  itself did not log.
- Stop running the remaining checks.
- The operator decides between:
  1. fix-forward via `/gsd-plan-phase 46 --gaps`, or
  2. reverting the 46-04 override-removal commit (`607089433`) before any release, so
     Windows is unregistered again (D-05).
- The todo (`2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`) and
  ledger row `U-34.5-18` stay open either way.
