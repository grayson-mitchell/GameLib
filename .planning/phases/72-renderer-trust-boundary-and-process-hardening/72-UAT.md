---
status: partial
phase: 72-renderer-trust-boundary-and-process-hardening
source: [72-03-PLAN.md, 72-07-PLAN.md, 72-10-PLAN.md, 72-12-PLAN.md]
---

# Phase 72 UAT: Renderer trust boundary and process hardening

## How to run

- Launch with `pnpm tauri:dev`, never `tauri:dev:run` (it skips the dev-vault flag and Keychain prompts every launch).
- `tauri dev` builds the sidecar only at startup: restart dev after backend changes.
- Items 6 and 7 need the operator's Windows PC and a build that includes 72-12 (Job Object). That code compiles on Windows: Rust test run 42952556201 on 847c0849f (2026-11-11) passed its windows-latest leg (72-HUMAN-UAT item 3).

## Tests

### 1. Normal quit raises no dialog

expected: (D-03) Cmd+Q, tray Quit and the red X each exit GameLib without any "GameLib stopped working" dialog and leave no sidecar process behind.
result: pass — verified at the 72-10 checkpoint on 2026-11-08

### 2. Killed sidecar raises the Restart/Quit dialog

expected: (D-01, D-02, D-05) `kill -9` of the sidecar shows "GameLib stopped working" exactly once; Quit exits the app with no sidecar left; Restart relaunches the shell and a fresh sidecar.
result: pass — verified at the 72-10 checkpoint on 2026-11-08. Restart relaunched the process and sidecar under `tauri dev`; the UI after restart was blank only because dev tears down Vite, so the packaged-build half is unverified (todo 2026-11-08-verify-dead-sidecar-restart-in-packaged-build).

### 3. Live boot after the capability trim

expected: (D-10) `pnpm tauri:dev` boots with no ACL denials or unhandled rejections in the console, and changelog links open in the default browser.
result: pass — verified at the 72-07 checkpoint on 2026-11-08

### 4. Router navigation and locale switching

expected: (D-19) Navigation works on react-router 7 and switching locale loads translations through i18next-http-backend 4.
result: pass — verified at the 72-07 checkpoint on 2026-11-08

### 5. Dependabot security updates enabled

expected: (D-17) Repo settings have Dependabot security updates enabled.
result: pass — verified at the 72-03 checkpoint on 2026-11-08 (`gh api repos/grayson-mitchell/GameLib/automated-security-fixes` returned enabled:true)

### 6. Windows: normal quit reaps the sidecar tree

expected: (D-20) Launch GameLib, start a legendary or gogdl operation (or a game), quit the app, and Task Manager shows no legendary.exe, gogdl.exe, nile, powershell.exe or game child left running.
result: pending (operator's Windows PC)

### 7. Windows: ending the shell reaps the sidecar tree

expected: (D-20) With the same children running, end the GameLib shell process from Task Manager and the same children die with it (the kill-on-close Job Object fires on shell crash).
result: pending (operator's Windows PC)
