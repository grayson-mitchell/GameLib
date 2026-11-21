---
status: pending
phase: 100-game-page-without-the-menu
source: [100-CONTEXT.md D-01 D-02 D-03 D-04 D-07 D-08 D-09 D-10 D-11 D-12 D-13 D-14 D-15 D-16 D-17 D-19 D-20 D-21]
authored_by: 100-10
started: 2026-11-22
updated: 2026-11-22
---

This is the live contract for Phase 100: the game page with the ⋮ menu deleted, every action now sitting next to the
fact it changes. Plans 100-01 to 100-09 are proven by unit tests and source gates, but theme legibility (D-15) and how
real installed games behave across stores (D-16) can only be checked in the running app. It was authored by plan 100-10
and is run by the operator through /gsd-verify-work, never marked pass by its author. Every item names the decision it
checks in parentheses at the end of its `expected:` line, so a failed item maps straight back to a D-ID.

Items 1 to 3 are the D-15 theme walk (midnight, dracula, gruvbox). Items 4 to 11 and 14 are the D-16 store walk (Steam,
Epic or GOG, sideloaded, not installed). Items 12, 13 and 15 to 18 cover the left card, categories, the Logs tab and the
settings additions. Human-judgment checks recorded in the 100-01 to 100-09 SUMMARYs (Enter in the category popover, title
row alignment, footer play time lines, pencil reveal, busy pulses, inline Retry failures, fact-row layout, Sync now
anchoring, Wine versus native row sets, Locate link placement, the library card's Logs entry) are folded into the items
below.

Items 19 and 20 were added by gap-closure plan 100-14 for the two gaps in 100-VERIFICATION.md (CR-01 and CR-02).

## Launch recipe

1. Launch only with `pnpm tauri:dev`, never `tauri:dev:run` (it skips the dev-vault flag, so Keychain prompts every
   launch).
2. Gap-closure plan 100-11 changed the Rust shell (`src-tauri/src/main.rs`), so start `pnpm tauri:dev` fresh after
   pulling it (the shell rebuilds on start). The sidecar needs no rebuild.
3. Switch themes in the app's theme settings (midnight is midnightMirage, dracula, gruvbox is gruvbox_dark). Items 1 to 3
   are run once per theme; the other items can run in any one theme.
4. The network stays on. Nothing here needs it off.

## Games to have ready

1. An installed Steam game.
2. An installed Epic or GOG game, with cloud saves and a changelog if possible.
3. A sideloaded game.
4. A not-installed Epic or GOG game.
5. A game you have played before, for play time (one Steam and one non-Steam if you can).
6. Linux is optional, for the EOS overlay item (18). On macOS mark item 18 `skipped`.
7. An installed Steam game with no version (a bridge install on macOS, or a Steam build id of 0).
8. An Epic or GOG game large enough that copying it takes over a minute, plus a destination folder with room for it.

## Tests

### 1. Midnight theme: left card and links
expected: In midnight, the left card heart is an outline when off and a filled --fav colour when on, the title row with the heart sits aligned with and without an art logo, the category chips are outlined, and Hide, Edit details and the store link are readable (D-15)
result: pending

### 2. Dracula theme: switches, heart and danger zone
expected: In dracula, the switch track on and off and its knob are distinguishable, the heart colour is visible, and the danger zone text and border are legible — the known risk theme (D-15)
result: pending

### 3. Gruvbox theme: the same set
expected: In gruvbox, the same set reads clearly — heart, outlined chips, Hide, Edit details, store link, switch track and knob, danger zone — and the native-port hint and Humble key origin notes keep their contrast where a game shows them (D-15, D-06)
result: pending

### 4. No ⋮ menu; the footer is only status, primary button, launch option and ⚙
expected: There is no ⋮ anywhere on the game page; the footer holds only the status line, the primary button (Install, Play, Update, Pause or Stop), the launch option and ⚙ (D-01)
result: pending

### 5. Steam game Install tab
expected: On an installed Steam game the Location row (path ellipsised, rows aligned) shows Open but no Move… or Wrong folder?, Version offers Verify but no Update, the danger zone shows Uninstall… and Remove all copies…, both ask for confirmation and both read disabled with a reason tooltip while the game is playing (D-16, D-13)
result: pending

### 6. Epic or GOG Move…
expected: Move… asks for confirmation then opens the folder picker; during the move the button reads "Moving…" with the in-row pulse while the footer shows the percent; Verify, Modify…, Wrong folder? and Uninstall… are disabled with "Wait for the move to finish" tooltips and Open stays live (D-10, D-11)
result: pending

### 7. Epic or GOG Version, Size and Engine
expected: Verify starts with no yes/no dialog and reads "Verifying…"; Update appears only where the store supports updates; What's new opens the changelog; Modify… opens the modify dialog; a forced Verify or Move failure (if one can be provoked) shows red text with Retry in the row; the Engine row shows Open prefix on non-Windows and the Wine and native games show different row sets (D-13, D-19, D-12)
result: pending

### 8. Epic or GOG Cloud saves
expected: Cloud saves reads Auto-sync on or Manual; Sync now ▾ opens its menu anchored under the button with four commands; force commands ask before running; a provoked sync failure shows red text with Retry and a forced Retry asks again; Open saves folder works; Auto-sync saves is a switch under Library & integration; ⚙ → Cloud Saves Sync no longer has the quick-sync-menu toggle (D-03, D-21)
result: pending

### 9. Sideloaded game
expected: A sideloaded game has no Verify and no Move; its Edit details opens the install modal; Uninstall… asks for confirmation (D-16)
result: pending

### 10. Not-installed game
expected: A not-installed game shows Download size, Install size and Platforms facts; the "Already installed elsewhere?" link sits under the facts and opens Locate; the footer Install ▾ offers Locate existing installation… (non-Steam) or Install with options… (Steam); only the Show in Steam switch shows (D-16, D-20)
result: pending

### 11. Switch rows
expected: Shortcuts, Show in Steam and (macOS, non-native game) Runs for me flip only after the backend answers, pulse in-row with "Adding…" or "Removing…" while pending, the shortcut label matches the OS, and a failure (if one can be provoked) shows red text with Retry (D-01, D-12)
result: pending

### 12. Categories
expected: In the + Category popover, New category… with Enter creates and assigns it and the popover stays open; retyping an existing name shows "That category already exists" and wipes nothing; × on a chip removes it; the library card's right-click still opens the Categories modal (D-08, D-09)
result: pending

### 13. Left card: Hide, Edit details pencil and store badge
expected: Hide hides the game and a notice with Unhide appears and Unhide restores it; the Edit details pencil over the art reveals on hover and on keyboard focus and a click opens the edit dialog; the store badge on an Epic or GOG or Steam game opens that store's page in-app while a sideloaded game's badge stays plain (D-01)
result: pending

### 14. Play time in the footer
expected: An idle, played game's status line reads "Played … · last played …" for a Steam and a non-Steam game with dates in the tooltip; the line is hidden while a long action runs and a never-played game shows none (D-17)
result: pending

### 15. ⚙ Logs tab
expected: A Logs tab follows Advanced with a session picker, Copy log and Show log file in folder; Advanced → Diagnostics "Open the Logs tab" switches to it; right-clicking a library card and choosing Logs opens ⚙ on the Logs tab (D-02, D-07)
result: pending

### 16. ⚙ Wine tab prefix button
expected: On a non-Windows game the Wine prefix field's folder button opens the prefix in the file manager (D-02)
result: pending

### 17. Right panel tabs
expected: The right panel tabs read Install, Achievements, Ratings, Requirements without clipping at the default window size (scrolling sideways if narrower); the Apple compatibility block is on Ratings on macOS and the Install tab holds only the new rows (D-04)
result: pending

### 18. Linux only: EOS overlay switch
expected: On Linux an installed Epic game's ⚙ → Run → Launch has an EOS overlay switch that installs on first enable after a confirmation; on macOS mark this item skipped (D-02)
result: pending

### 19. Steam game with no version: Verify still shows
expected: On an installed Steam game that has no version (a bridge install, or a Steam build id of 0), the Install tab shows a Version row reading Unknown with no "up to date" claim, Verify sits on it, and Verify starts with no yes/no dialog and reads "Verifying…" (D-14, D-13)
result: pending

### 20. A Move longer than 60 seconds
expected: On an Epic or GOG game whose copy takes over 60 seconds, Move… keeps reading "Moving…" past the one-minute mark while the footer shows the percent; no "Move failed" text and no Retry appear while it runs; Move… and Wrong folder? stay disabled with "Wait for the move to finish"; and when the copy ends, the Location row shows the new path with no failure text (D-10, D-11, D-12)
result: pending
