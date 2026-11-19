---
status: complete
phase: 64-ui-to-edit-themes
source: [64-01-SUMMARY.md .. 64-09-SUMMARY.md, 64-UI-SPEC.md, 64-VALIDATION.md]
started: 2026-11-18
updated: 2026-11-19T09:29:37.743Z
---

## Scope

THEME-01 (create and edit custom themes in the app) and THEME-02 (the 10 built-in themes never change).
jsdom has no CSS engine, layout, hover or paint, so everything here is what the automated gate cannot see:
the real WKWebView painting a custom theme app-wide, the gallery and editor on three built-in themes, RTL,
narrow widths, and the Nord Light thumbnail against the real Nord Light buttons.

## Launch recipe

1. Run `pnpm build:sidecar`, then check that the sidecar bundle (`build/main/sidecar.js`) has an mtime newer than
   the Plan 03 commit. `tauri dev` does not rebuild the sidecar, and Plan 03 changed the sidecar and the IPC.
2. Launch with `pnpm tauri:dev` (never `tauri:dev:run`). The Rust relay allow-list (`ipc_contract.rs`) changed in
   Plan 03, so the shell recompiles on this launch; the first start is slow.
3. The old theme dropdown (`#theme_selector`) is gone. Pick a theme by clicking its card in Settings, Appearance,
   or from the Web Inspector console with `window.setTheme('<key>')`. Built-in keys: `midnightMirage`,
   `gruvbox_dark`, `dracula`, `nord-light`. Cards also carry `[data-theme-key="<key>"]`.
4. Where an item says "both titlebar styles", repeat it once with the frameless titlebar setting on and once off.

## Current Test

[testing complete]

## Tests

### 1. Gallery replaces the dropdown
expected: Settings, Appearance shows a Built-in group (10 thumbnails, each with a lock cue) and a Your themes group, and clicking any card applies that theme immediately.
result: pass

### 2. Three-theme survival
expected: On midnightMirage, gruvbox_dark and dracula the gallery and the editor chrome stay readable, and Dracula's thumbnail shows its navbar lighter than its body.
result: pass

### 3. Duplicate Nord Light
expected: Duplicate on the Nord Light card opens the editor, "Nord Light copy" appears under Your themes, and the app theme does not change.
result: pass

### 4. Draft isolation
expected: Editing Body background and Accent changes only the editor preview until Save theme is pressed; the rest of the app keeps its current look.
result: pass

### 5. Apply and save
expected: After applying the copy and editing, Save theme reads "Saved and applied"; MUI dialogs, genre tags and context menus keep Nord Light's styling, the Library header band follows Body background and the focus ring follows Accent.
result: pass

### 6. Nord Light truthfulness
expected: The copy's thumbnail success button matches the real success button (#81a1c1); note whether the selected tier-1 tab label (painted with --accent by Nord Light) differs from the thumbnail's active tab label.
result: pass

### 7. Restart persists
expected: Quit GameLib and relaunch with `pnpm tauri:dev`; the copy is still listed under Your themes and still the active theme.
result: pass

### 8. Unsaved changes
expected: With an edit pending, Back and a tier-1 tab click each show "Unsaved changes"; Keep editing stays in the editor, Discard leaves without saving, and Save theme saves then leaves.
result: pass

### 9. Contrast warning
expected: Setting Border close to Body background shows "Border vs body N:1, needs 3:1" under both rows, and Save theme still works.
result: pass

### 10. Gradient
expected: In Advanced, setting --gradient-body-background to a linear-gradient applies it to the preview, and a url() value is refused with the gradient error.
result: pass

### 11. Delete the active copy
expected: The Delete confirmation names Nord Light as the fallback, and after Delete theme the app is on Nord Light.
result: pass

### 12. RTL
expected: With the app language switched to Arabic or Persian, the gallery action rows and the editor panes mirror correctly.
result: pass

### 13. Narrow window
expected: At the minimum window width the editor stacks with the preview first and stays usable; check with both titlebar styles.
result: pass

### 14. Long name
expected: Renaming a copy to a 60-character name makes the card truncate with an ellipsis, and the Rename and Delete dialogs wrap the name without clipping.
result: pass

### 15. Theme cap
expected: With 50 custom themes the grid stays usable, and Duplicate shows the limit dialog with Close message focused.
result: skipped
reason: "Operator: skip - you can run that as an automated test, I am not creating 40 themes. The limit-dialog half is covered by ThemeGalleryCustom.test.tsx ('refuses Duplicate at the cap with the limit dialog and adds nothing') and customThemesState.test.ts ('refuses at the limit and writes nothing'), both passing 2026-11-19; grid usability at 50 themes is visual and stays unchecked."

### 16. Card action row, tooltips and Rename selection
expected: Hover and keyboard focus show a tooltip on each card action icon, and the Rename dialog opens with the current name pre-selected and the input still focused despite the gamepad tab presses fired on dialog mount.
result: pass

### 17. Header Rename and notice stacking
expected: The editor header Rename icon renames the open theme and looks right on three themes and in RTL, and a notice raised by Save theme sits bottom right and stacks with the other toasts without covering the prompt's Save theme focus ring.
result: pass

## Summary

total: 17
passed: 16
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[none yet]
