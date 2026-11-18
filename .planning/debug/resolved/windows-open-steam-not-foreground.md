---
status: resolved
trigger: 'Windows: "Open Steam" on the adoption note does not bring Steam to the front (todo .planning/todos/pending/2026-11-19-windows-open-steam-from-adoption-note-not-foreground.md)'
created: 2026-11-19
updated: 2026-11-19
---

## Symptoms

- **Expected:** Pressing "Open Steam" on the adoption note ("Sign in to Steam to finish setup") brings Steam's window (sign-in screen, or main window when signed in) to the foreground, as it does on macOS (Phase 81 live gate item 3).
- **Actual:** On Windows 11 (Phase 81 live gate item 10 (e), `81-HUMAN-UAT.md`, 2026-11-19) Steam's window does not come forward. The handler does run: gamelib.log shows `SteamGame: opening Steam from the adoption note` 15 times between 06:41:08 and 06:41:39. Everything else in the item behaved (the note cleared only after sign-in, 06:42:32, `adoption appId 250320 adopted (log)`).
- **Errors:** None logged.
- **Timeline:** Found in the first Windows live gate of Phase 81; never seen to work on Windows.
- **Reproduction:** Windows 11, Steam running but signed out, a game (250320) pending adoption, so the note shows. Put GameLib in front of Steam and press "Open Steam".

## Context

- `openSteamForAdoption` (`src/backend/storeManagers/steam/adoptionStatus.ts:195`) only calls `openExternal('steam://open/main')`, from the Node sidecar.
- Unverified hypothesis (from the todo): the URL reaches the running `steam.exe`, but Windows' foreground lock (`SetForegroundWindow` rules) stops Steam taking focus because the request came from a background process (the sidecar), not the foreground app. Possible fixes: `AllowSetForegroundWindow` for Steam's pid before the open, or raising Steam's window from the Rust/Tauri shell, which owns the foreground window.
- The orchestrator is on the operator's Windows 11 box, so local measurements (e.g. running `steam://open/main` from a terminal, or from a background process) can be done in-session. Steam must be running for this.

## Current Focus

status_note: root cause confirmed; fix applied and self-verified; waiting for the operator's live signed-out click
hypothesis: Steam does not act on `steam://open/main` while it is at the sign-in screen (it defers the command line until login finishes), so there is nothing to bring forward; the Windows foreground lock is NOT the cause
reasoning_checkpoint:
  hypothesis: "On Windows, 'Open Steam' (shown only when Steam is signed out) sends steam://open/main, which a signed-out Steam holds until login completes; the sign-in window is never raised because nothing asks for it."
  confirming_evidence:
    - "Steam console_log.txt logs `ExecCommandLine ... steam://open/main` + `ExecuteSteamURL` for every command line it executes. None between 06:41:08-06:41:39 (15 GameLib presses, Steam signed out since 06:30:04); exactly one at 06:42:41, one second after login completed. No GameLib action at 06:42:41 (gamelib.log)."
    - "AdoptionNote.tsx shows 'Open Steam' only when steamSignedIn === false, i.e. exactly the signed-out state."
    - "Signed in, the same URL raises Steam in <0.5 s from foreground and background origins, even minimized (standin.ps1 arms)."
    - "Steam's visible window is owned by steamwebhelper (SDL_app), so the pid-based AllowSetForegroundWindow idea targets the wrong process."
  falsification_test: "With Steam at the sign-in screen, run steam://open/main from a terminal and read Steam's console_log.txt: if an ExecCommandLine appears at once and the sign-in window comes forward, the deferral hypothesis is wrong. Needs the operator to sign Steam out (not done here: it is their live account)."
  fix_rationale: "Raise Steam's own top-level window directly from the Rust shell (the foreground process at click time) via a new Windows-only `steam_window_raise` rustInvoke channel, called by openSteamForAdoption on win32 before the unchanged steam://open/main open (which still starts Steam when it is not running and shows the main window when it is in the tray)."
  blind_spots: "Not measured: the signed-out sign-in window itself (class/title/visibility; selection is by owning exe steam.exe/steamwebhelper.exe + visible + unowned + not tool window + titled, not by class or title); SetForegroundWindow under a truly armed lock from the real WebView2-hosting shell (my harness control showed the lock does not block this harness, so it cannot discriminate)."
  candidate_causes:
    - "code: openSteamForAdoption only sends a URL a signed-out Steam defers (confirmed)"
    - "environment: Windows foreground lock blocks Steam's raise (refuted signed-in; unmeasurable signed-out here, but Steam never even executed the URL, so the lock cannot be what stopped it)"
    - "data: stale steamSignedIn making the button show while Steam is signed in (not the case: the log shows Steam at the login screen)"
  and_gate: "no: one cause (nothing raises the sign-in window) sufficed; the lock only matters after the URL executes, which it did not."
test: operator rebuilds (`pnpm tauri:dev`), signs Steam out (or restarts it to the sign-in window), puts GameLib in front, presses Open Steam
expecting: Open Steam brings the sign-in window forward on Windows; macOS/Linux unchanged
next_action: none (resolved; operator confirmed fixed 2026-11-19)

## Evidence

- timestamp: 2026-11-19
  checked: path of the open from the sidecar to the OS (src-tauri/src/sidecar.rs:620-649, relay_commands.rs:228)
  found: sidecar `openExternal` frame -> Rust shell worker thread -> `app.opener().open_url(url)` (tauri-plugin-opener, ShellExecute on Windows). Fire-and-forget; no response frame; no foreground handling anywhere in the open path. The Rust shell (gamelib-shell) is the foreground process when the user clicks "Open Steam" in the GameLib window.
  implication: the open is issued by the foreground process, not by a background process, so "request came from the sidecar" is not literally the mechanism; the question is whether Steam's already-running UI process (steamwebhelper, which owns the SDL_app window) is allowed to take foreground when a short-lived second steam.exe forwards the URL.
- timestamp: 2026-11-19
  checked: local Windows state with scratchpad win32.ps1
  found: Steam is running; its visible main window is hwnd=920618, class SDL_app, title "Steam", owned by steamwebhelper pid 30804 (NOT steam.exe pid 17332, which owns only hidden/vgui windows). Foreground is VS Code.
  implication: any "raise Steam" fix must target the steamwebhelper-owned SDL_app window, not steam.exe's pid. `AllowSetForegroundWindow(steam.exe pid)` would be the wrong pid.
- timestamp: 2026-11-19
  checked: foreground-lock hypothesis, signed-in Steam, lock armed (fresh synthetic F15 input 150 ms before the open; ForegroundLockTimeout=200000 default; idle 0.16 s), scratchpad standin.ps1 (a WinForms "GL-STANDIN" window made foreground, then `Start-Process steam://open/main`), polling GetForegroundWindow every 50 ms
  found: arm fg (foreground process issues the open, as the Rust shell does) -> Steam SDL_app window (hwnd 920618, steamwebhelper pid 30804) foreground in 0.19 s. arm bg (separate hidden background powershell issues the open, as a sidecar-origin open would) -> foreground in 0.44 s. Same two arms with Steam minimized first (iconic=True) -> foreground in 0.21 s / 0.44 s, window restored. Control arm (no open) -> Steam never foreground.
  implication: with Steam signed in, steam://open/main raises Steam from a foreground OR a background origin, even minimized, with the lock armed. The foreground-lock hypothesis from the todo is REFUTED for the signed-in state.
- timestamp: 2026-11-19
  checked: Steam client logs (C:\Program Files (x86)\Steam\logs\console_log.txt, bootstrap_log.txt) and gamelib.log (%LOCALAPPDATA%\GameLib\logs\gamelib.log) for the gate window
  found: Steam restarted at 06:30:04 and sat at the sign-in screen until login finished (`System startup time: 756.30 seconds`, logon at ~06:42:36-40). Steam logs every command line it executes as `ExecCommandLine: ... steam://open/main` + `ExecuteSteamURL`. During the 15 presses (gamelib.log 06:41:08-06:41:39) Steam logged NONE. At 06:42:41, one second after login completed, it logged `ExecCommandLine steam.exe` and ONE `ExecCommandLine steam.exe -- steam://open/main` + `ExecuteSteamURL`. No further GameLib presses are in gamelib.log after 06:41:39. (Later entries 06:54:40, 06:59:xx are this session's measurements.)
  implication: the URL reaches Steam but the signed-out client holds command lines until login completes (15 presses collapsed to one deferred execution). So `steam://open/main` cannot raise the sign-in window; the sign-in window must be raised directly. This is the cause of the gate failure, not the foreground lock.
- timestamp: 2026-11-19
  checked: which process owns Steam's visible window on Windows
  found: the visible "Steam" window (class SDL_app) belongs to steamwebhelper (pid 30804), not steam.exe (pid 17332); steam.exe owns only hidden/vgui/GL dummy windows.
  implication: any fix that targets the steam.exe pid (AllowSetForegroundWindow(steam pid), the todo's idea) targets the wrong process; select by owning exe name (steam.exe / steamwebhelper.exe in the Steam dir) and class SDL_app instead.
- timestamp: 2026-11-19
  checked: what Steam's real sign-in window looks like (monitor.ps1 while Steam, found not running at 07:09, was started from the shell by me at ~07:10 and auto-logged in; startup 14.2 s per console_log)
  found: the sign-in window is class SDL_app, title "Sign in to Steam", owner steamwebhelper.exe, visible=True, owner(window)=none, WS_EX_TOOLWINDOW=False; it disappeared at 15.6 s when the main "Steam" SDL_app window (same shape) appeared. The only other Steam windows with a title were a hidden tool/owned "Menu" popup and hidden IME/GL dummies.
  implication: the selector (visible + unowned + not tool + titled + exe steam.exe|steamwebhelper.exe) matches the sign-in window and the main window and excludes the noise windows.
- timestamp: 2026-11-19
  checked: the real Rust function (steam_window.rs, `cargo test live_steam_window -- --ignored --nocapture`, the same exe code the shell runs) against live Steam
  found: during the sign-in phase it picked the "Sign in to Steam" hwnd and returned raised; later with the main window minimized (iconic=True, VS Code foreground) it restored it and Steam became the foreground window (iconic=False, foreground=True).
  implication: the Win32 glue (EnumWindows, owner/tool/title/exe filters, ShowWindow(SW_RESTORE), SetForegroundWindow) works on a real Steam window in both states. NOT proven: the full click path through the WebView2-hosting shell, and a Steam left signed-out by a sign-out (see Resolution.verification).
- timestamp: 2026-11-19
  checked: gates for the change
  found: cargo test --bin gamelib-shell 479 passed 0 failed 4 ignored (9 new steam_window tests incl. 1 ignored live); pnpm check:ipc-contract up to date; clippy ratchet (pinned 1.99.1): no diagnostics in steam_window.rs, the ratchet fails only on a pre-existing dead_code in crates/gamelib-depot/tests/post.rs (LAUNCHER, ceiling 5 found 6); jest: openSteamForAdoption 5/5 (4 new; mutants "never raise" and "raise on every platform" each killed 2), tauriShellSource, rustInvokeSchemas (pins bumped 117->118), rustInvokeChannel, rustChannelAllowlist, steamPollChannelParity, genIpcContract all pass; tsc clean; eslint clean on touched TS; prettier --check clean (5 TS paths, none prettier-ignored). Pre-existing, unrelated: adoptionStatus.test.ts "a valid appId reaches the game..." fails identically on pristine HEAD (stash-verified); settingsFlows.test.ts flakes on EPERM log rename (Windows).
  implication: no regression found; the remaining unknown is the operator's live signed-out click.

## Eliminated

- hypothesis: Windows foreground lock (SetForegroundWindow rules) stops steam.exe taking focus because the open came from the background sidecar
  evidence: steam://open/main raised Steam in <0.5 s from both a foreground-process origin and a hidden background-process origin, signed in, Steam visible-behind and minimized, lock armed by fresh input. Also the open is issued by gamelib-shell (the foreground process), not by the sidecar.
  timestamp: 2026-11-19

## Resolution

root_cause: Open Steam is shown only while Steam is signed out, and a signed-out Windows Steam does not execute `steam://open/main` until login completes (it logged no ExecCommandLine for the 15 presses at the sign-in window, then one deferred execution one second after login). The URL therefore cannot raise the sign-in window, and nothing else in the Open Steam path raised it. The Windows foreground lock from the todo's hypothesis is not the cause (signed in, the URL raises Steam from foreground and background origins, even minimized).
fix: new Windows-only rustInvoke channel `steam_window_raise` (src-tauri/src/steam_window.rs): the shell, which is the foreground process at the click, picks the topmost visible, unowned, non-tool, titled top-level window owned by steam.exe or steamwebhelper.exe, restores it if minimized and calls SetForegroundWindow. `openSteamForAdoption` calls it first on win32 (a failure or `false` only logs), then still opens `steam://open/main` (starts Steam when it is not running, shows the tray-hidden main window). macOS/Linux call path unchanged (no raise).
verification: self-verified (see Evidence): unit tests for the pick and the Node order/failure/platform behaviour with mutation checks, real-Win32 live test against the live sign-in window and a minimized main window. operator confirmed fixed 2026-11-19 on Windows 11: with the rebuilt shell (`pnpm tauri:dev`) and Steam at its sign-in screen, "Open Steam" brought the sign-in window to the front.
files_changed:
  - src-tauri/src/steam_window.rs (new)
  - src-tauri/src/main.rs
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/ipc_contract.rs (generated: pnpm gen:ipc-contract)
  - src/common/types/sidecarTransport.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/backend/storeManagers/steam/adoptionStatus.ts
  - src/backend/storeManagers/steam/__tests__/adoptionStatus.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
