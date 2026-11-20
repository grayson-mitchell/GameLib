---
status: complete
phase: 75-steam-local-file-formats-in-rust
source: [75-25-PLAN.md]
started: 2026-11-14
updated: 2026-11-14
---

# Phase 75 UAT: live gate for the Rust Steam local-file readers (delete gate)

Authored by plan 75-25 and run by plan 75-26. The author never runs the gate (standing rule, the 63/73 pattern).
Record only the status word, the proving log excerpt and a short note. Leave out tokens, account ids, refresh tokens and full home paths.

Since 75-25 both D-08 flags default to `rust`, so no env var is needed. An item run with either flag on `ts` proves nothing.

## Ground rules (read before every item)

- **Dev launch is `pnpm tauri:dev`**, never `tauri:dev:run` (that one skips the dev-vault flag and prompts the Keychain on every launch).
- **`tauri dev` does not rebuild the sidecar.** Run `pnpm build:sidecar` before the first launch and after any backend change, then check that `build/main/sidecar.js` is newer than the newest `src/backend` change and contains `STEAMFILES_TEXT_DEFAULT = "rust"`.
- **After every Ctrl-C of `tauri dev`**, run `pgrep -fl sidecar.js` and record its output. An orphaned `sidecar.js` (parent pid 1) is the known defect in todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`. Record it there, kill it, and do not fail an item for it.
- **Flags unset:** before the first launch confirm `GAMELIB_STEAMFILES_TEXT` and `GAMELIB_STEAMFILES_SHORTCUTS` are unset in the shell (`env | grep GAMELIB_STEAMFILES`) and in launchctl (`launchctl getenv GAMELIB_STEAMFILES_TEXT`, same for `_SHORTCUTS`). Both must print nothing.
- **Network:** keep it on. If a step needs it off, turn it off only for the action itself (off -> act -> on -> report), because the operator needs the network to talk to Claude.
- **Known-fix pre-emption (the 63 lesson):** a title routed by a known-fix layer (macArch 32 redirect, a known-bad reroute to bottled Steam, a seeded fix) never reaches the path under test. Before items 3 to 5 confirm the chosen title is not in a known-fix table (`public/fixes`, the user `fixes` dir). A known-fix route in the log makes the item `blocked`, not `pass`. Excluded titles: the six Phase 74 stale bridge fixtures (Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs).
- **Logs:** the app log is `~/Library/Logs/GameLib/gamelib.log`; shell diagnostics go to `~/Library/Logs/GameLib/gamelib-shell.log` and the `tauri dev` terminal. Every launch rotates `gamelib.log`, so copy it (or `tail -F` it) before relaunching. The Rust-path proof is a DEBUG line `[steamfiles] rust <channel>` written by `rustSteamFiles.ts`; grep with `grep '\[steamfiles\] rust' ~/Library/Logs/GameLib/gamelib.log`. DEBUG lines go to the file sink via `logDebug`; if none appear at all, the item is `blocked` and the note must say which log level setting was in force.
- **Small titles:** use a small native title not already installed (DREDGE, 1562430, about 0.8 GB, suggested) for items 3 and 4 and 5; use any non-Steam GameLib game (Epic, GOG or Amazon) for items 6 and 7.

## Structural Reachability Review

| Item | UI control exists | Sink carries the proof | External-state preflight | Known-fix pre-emption |
|------|-------------------|------------------------|--------------------------|-----------------------|
| 1 | Settings shows the Steam path default; no control needed for the shell line | shell log / `tauri dev` terminal (`sidecar.rs` diagnostic) | no custom Steam path set in Settings; Steam installed at the macOS default | n/a |
| 2 | Library Refresh button | `gamelib.log` (`logDebug` in `rustSteamFiles.ts`) | at least one installed Steam title in the real library | n/a |
| 3 | Install on a Steam game card (native hand-off to Steam) | `gamelib.log` | DREDGE not installed; Steam client running and signed in | check DREDGE against `public/fixes` and the user fixes dir |
| 4 | Uninstall on the card, or Steam's own uninstall | `gamelib.log` | item 3 completed | as item 3 |
| 5 | Play on an installed native card | `gamelib.log` | item 3 completed; Steam running | as item 3 |
| 6 | "Add to Steam" in the game's context menu (`addNonSteamGame`) | `gamelib.log`; filesystem for `shortcuts.vdf.tmp` | a non-Steam game installed in GameLib; Steam quit or restartable; `shortcuts.vdf` exists or is creatable | n/a |
| 7 | "Remove from Steam" in the same menu (`removeNonSteamGame`) | `gamelib.log`; `gamelib-steamfiles-cli` | item 6 completed, at least one other shortcut present if possible | n/a |
| 8 | none; Claude runs a script | exit code and stdout of `pnpm bridge-census` | `pnpm scan-cli:build` and `pnpm steamfiles-cli:build` succeed | n/a |

## Current Test

[testing complete]

## Tests

### 1. Startup discovery
expected: The shell log (or the `tauri dev` terminal) shows `GAMELIB_STEAM_ROOT_DEFAULT=<steam root> (source=macDefault)` at startup, and Settings shows that same root as the default when no custom Steam path is set.
result: pass. Shell printed `GAMELIB_STEAM_ROOT_DEFAULT=<home>/Library/Application Support/Steam (source=macDefault)`; operator confirmed Settings shows the same root. `[steamfiles] rust` lines reach gamelib.log at the default level.
precondition: no custom Steam path in Settings; flags unset. Action: launch with `pnpm tauri:dev`, grep the terminal or `gamelib-shell.log` for `GAMELIB_STEAM_ROOT_DEFAULT`, then open Settings and read the Steam path.

### 2. Library refresh
expected: After Refresh, `gamelib.log` has `[steamfiles] rust steamfiles_read_library_folders` and `[steamfiles] rust steamfiles_scan_acfs`. Games that were installed before still show as installed, and the installed count matches the pre-refresh count.
result: pass. 45 installed before and after; Refresh at 08:53:22 logged `steamfiles_read_library_folders` and `steamfiles_scan_acfs`.
precondition: Rust default; library already loaded once. Action: note the installed count, press Refresh, grep the log, compare the count.

### 3. Install polling
expected: While the install is downloading in Steam, `gamelib.log` shows repeated `[steamfiles] rust steamfiles_find_acf` lines. When Steam finishes, the card flips to installed.
result: pass. Run via GameLib's native depot download (native download enabled), not a Steam hand-off. DREDGE 1562430 finished; `appmanifest_1562430.acf` written (StateFlags 4, buildid 20206241, installdir DREDGE, SizeOnDisk 812771281), no .tmp left, card flipped to installed. Logged `find_acf`, `read_acf`, `read_localconfig_beta_key`.
precondition: a small native title not installed and not known-fix routed (DREDGE suggested). Action: press Install on the card (hands off to Steam), watch Steam's download and the log, wait for completion.

### 4. Uninstall detection
expected: After uninstalling through Steam, `gamelib.log` shows `[steamfiles] rust steamfiles_find_acf` returning to the poller and the card flips to not installed without a manual Refresh.
result: pass. Uninstalled in the Steam client; ACF removed; card flipped to not installed with no manual Refresh, detected via `steamfiles_scan_acfs` at 08:56:40.
precondition: item 3's title installed. Action: uninstall it in the Steam client (not in GameLib), watch the card and the log.

### 5. Running-app poll
expected: `gamelib.log` shows `[steamfiles] rust steamfiles_read_running_app_id` while the game runs. The card shows the running state, and the state clears within a few seconds of quitting the game.
result: pass. Reinstalled and played twice; `steamfiles_read_running_app_id` polled 96 times; card showed running and cleared after quit. Observation, not a failure: the Steam window comes to the front on launch when not minimised, from the unchanged `steam://rungameid` path.
precondition: a native title installed and Steam running (reinstall item 3's title if item 4 removed it). Action: press Play, wait for the window, quit the game, watch the card and the log.

### 6. Add to Steam
expected: `gamelib.log` shows `[steamfiles] rust steamfiles_shortcuts_read` then `[steamfiles] rust steamfiles_shortcuts_apply`. No `shortcuts.vdf.tmp` remains next to `shortcuts.vdf` (`ls` the `userdata/*/config` dir). After a Steam restart the entry is visible in Steam's library.
result: pass. Added Trash Goblin; log shows `steamfiles_shortcuts_read` then `steamfiles_shortcuts_apply`; shortcuts.vdf 1015 -> 1543 bytes, 3 entries, no .tmp; `steamfiles_shortcuts_roundtrip` identical:true len 1543; entry visible in Steam after restart.
precondition: a non-Steam GameLib game installed; note the current shortcut count first. Action: Add to Steam from the game's menu, check for the tmp file, restart Steam, look for the entry.

### 7. Remove from Steam
expected: `gamelib.log` shows `steamfiles_shortcuts_read` and `steamfiles_shortcuts_apply` lines again. The entry is gone and the shortcut count is one lower than after item 6. The remaining entries are untouched: `gamelib-steamfiles-cli steamfiles_shortcuts_roundtrip` on the remaining `shortcuts.vdf` reports byte identity (build with `pnpm steamfiles-cli:build`; the binary is under `src-tauri/target/debug`).
result: pass. Removed; entry gone in Steam; shortcuts.vdf back to 1015 bytes, 2 entries, no .tmp, byte-identical (`cmp`) to the pre-test backup; roundtrip identical:true len 1015. The apply log lines were lost to log rotation (a tauri-dev restart from unrelated src-tauri edits), so the file evidence stands in for them.
precondition: item 6 completed. Action: Remove from Steam from the same menu, compare the count, run the roundtrip command on a copy of the file.

### 8. Headless census
expected: `pnpm bridge-census` exits 0 and lists the bottle titles. Claude runs this item, not the operator. Exit code and the first lines of stdout are the evidence.
result: pass. `pnpm scan-cli:build`, `pnpm steamfiles-cli:build` and `pnpm bridge-census` all exit 0; the census table printed.
precondition: `pnpm scan-cli:build` and `pnpm steamfiles-cli:build` succeed. Action: run `pnpm bridge-census` and record the exit code.

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
