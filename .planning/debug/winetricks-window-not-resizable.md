---
status: awaiting_human_verify
trigger: "DATA_START Winetricks settings window not resizable by dragging on macOS, yet captures show three distinct widths DATA_END"
created: 2026-10-12
updated: 2026-10-12
---

## Current Focus

hypothesis: CONFIRMED (premise refuted) -- the OS window IS drag-resizable; the surface the operator called "the window" is the in-page MUI Settings dialog, whose width is content-driven and does not follow the window edge
test: measure the NSWindow's own opaque rect in every gate capture of launch 4
expecting: if the NSWindow were not resizable, every capture would show 1280x800pt; it does not
next_action: none for code. Optional operator re-check of a live drag on a current build (hh5/jj1 floor releases landed after the gate); see Resolution.verification

## Symptoms

- expected: window drag-resizable on macOS (`src-tauri/tauri.conf.json:20` has `"resizable": true`)
- actual: operator could not drag-resize it (Phase 45 live gate 45-12, launch 4, 2026-10-10); gate captures show three distinct window widths across launches 3-4
- errors: none
- timeline: found at the Phase 45 live gate; unknown whether it ever worked
- reproduction: live drag on macOS only; evidence `/tmp/gamelib-gate-45-20261010T194049Z/terminal.log` (may be gone)
- source todo: `.planning/todos/pending/2026-10-11-winetricks-settings-window-not-resizable-by-drag-on-macos.md`
- scope: check WebviewWindowBuilder resizable/min/max size, decorations, any set_size/set_resizable in `src-tauri/src`. Fix if a defect is found; if not reproducible without a live drag, say so plainly.

## Eliminated

- hypothesis: a code or config constraint makes the main NSWindow non-resizable (resizable=false, min/max size equal, decorations stripped)
  evidence: `src-tauri/tauri.conf.json` main window is `resizable: true`, `titleBarStyle: Visible`, no minWidth/minHeight/maxWidth/maxHeight. `grep` for set_resizable/set_min_size/set_max_size/min_inner_size/setResizable/setMinSize/setMaxSize over `src-tauri/src`, `src/preload`, `src/frontend`, `src/backend`, `src/common` finds none. Only `.inner_size()` calls in `main.rs` are on the pristine Epic login window (900x700, 464x592 branch), not main. `setDecorations` is unreachable on macOS (`tauriWindowChrome.ts:292-315` uses `setTitleBarStyle` only, traffic lights present in both states). The capture frames themselves show a decorated window with traffic lights.
  timestamp: 2026-10-12
- hypothesis: the Settings UI is a separately built Tauri window with its own (non-resizable) builder
  evidence: the only `WebviewWindowBuilder::new` sites in `main.rs` are the pristine login window, two hidden `visible(false)` Humble helper windows, and the Epic login branch. There is no Settings window. `SettingsModal/index.tsx:55` renders an MUI Dialog with `className='InstallModal__dialog'` inside the `main` webview.
  timestamp: 2026-10-12
- hypothesis: "three distinct widths" are three distinct OS window widths
  evidence: capture PNG widths 2784, 2696 (launch 3) and 2862, 2774 (launch 4) are shadow-margin artifacts for two of them. `screencapture -l` includes the window shadow, whose margin is 112 px per side for an active window and 68 px for an inactive one. Measuring the fully opaque rect: 2784x1824 and 2696x1736 are BOTH a 2560x1600 px (1280x800 pt) window; 2862x1824 and 2774x1736 are BOTH 2638x1600 px (1319x800 pt). Two real widths, not three.
  timestamp: 2026-10-12

## Evidence

- timestamp: 2026-10-12
  checked: `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/capabilities/default.json`
  found: single window `main`, 1280x800, `resizable: true`, `titleBarStyle: Visible`, `hiddenTitle: true`. No size/resizable mutation of `main` anywhere in Rust. The capability grants `core:window:allow-maximize/toggle-maximize/unmaximize/set-fullscreen/set-decorations/set-title-bar-style` but no `set-resizable`, `set-size`, `set-min-size` or `set-max-size`, so the renderer could not have locked the window either.
  implication: nothing in the shipped code can make the NSWindow non-resizable.

- timestamp: 2026-10-12
  checked: how the Winetricks UI is hosted (`WinetricksSettings/index.tsx` -> `GamesSettings` -> `SettingsModal`)
  found: Winetricks is a tab of the per-game Settings MUI Dialog, rendered inside the `main` webview. The Dialog paper uses `.InstallModal__dialog { width: 700px; max-width: 80vw; min-width: fit-content }` (`Library/components/InstallModal/index.scss:1-5`). `min-width: fit-content` beats `max-width` (CSS 2.1 10.4), so the paper's width is set by its content and ignores the window edge.
  implication: the "window" the operator sees and the NSWindow are two different things. The paper can be wider than the NSWindow.

- timestamp: 2026-10-12
  checked: all 1010 files in `/tmp/gamelib-gate-45-20261010T194049Z/` still present; burst6-* frames (launch 4, window-id captures via `steps/cap.sh`: `screencapture -l <CGWindowID>`), measured by an alpha-opaque bounding box
  found: launch 4 NSWindow opaque width over time (NZDT, file mtime): 11:18:06 1280 pt (burst6-001..067, height 800 throughout) -> 11:21:00 696 pt (burst6-068) -> 11:21:02 87 pt (burst6-069, held through burst6-094, ~64 s) -> 11:22:08 1234 pt (burst6-095) -> 1319 pt (burst6-098 onward, final). 11:21:00 NZDT is 22:21:00Z, inside the G9 step window (burst start 22:18:06Z, operator "g9 done" 22:25:28Z). Height never changes: a horizontal edge drag.
  implication: the NSWindow WAS drag-resized, narrower than 100 pt, then widened beyond its default. This directly contradicts "not resizable". The rig does not resize (no set bounds/size/AXSize in `steps/`), so the resize was the operator's drag.

- timestamp: 2026-10-12
  checked: burst6-068.png (696 pt window) and burst6-080.png (87 pt window)
  found: in both, the Settings paper still fills the whole window width as blank row bands. Row text is left-aligned and status text right-aligned inside a paper that is wider than the viewport and centred, so the visible slice is the text-free middle. The paper did not narrow with the window.
  implication: to the operator the thing they were dragging (the Settings "window") did not narrow. That is the observed "could not narrow it". It is the same defect as the 45-12 G1 finding ("NSWindow did not resize; dialog overflowed", viewport 1470x923 logged before, `terminal.log` line 34) and the sibling todo about content-driven dialog width.

- timestamp: 2026-10-12
  checked: git history of `WinetricksSettings/index.scss`
  found: `682a20ac7` (261011-hh5, "stop the tab widening the Settings dialog past the window") adds `.InstallModal__dialog:has(.WinetricksSettings) { min-width: 0 }`; `70fde4672` (261011-jj1) releases the GamesSettings 500px section floor for the Winetricks groups. Both landed AFTER the 2026-10-10 gate, and both sibling todos (dialog width overflow, rigid width floors) are already out of `todos/pending`.
  implication: the gate ran against a build that still had the `fit-content` floor; the current tree no longer does for the Winetricks tab.

## Resolution

root_cause: No defect in OS-window resizability. The Phase 45 gate observation conflated two surfaces. The main NSWindow (1280x800, `resizable: true`, no min/max, no constraint anywhere) was drag-resized by the operator during G9 step 2 from 1280 pt to 87 pt and back out to 1319 pt (measured from the launch-4 capture frames). What did not follow the window edge was the in-page MUI Settings dialog, whose paper had `min-width: fit-content` (`InstallModal/index.scss:4`) and so was sized by its content (long catalog titles, German captions) and overflowed the narrowed window. The "three distinct widths" are two real widths (1280 pt and 1319 pt) plus shadow-margin variants (112 px active vs 68 px inactive per side) and transient mid-drag frames. The overflow defect is the same one already fixed in 682a20ac7 (hh5) and 70fde4672 (jj1).
fix: none -- no code change warranted. The todo's premise (window not resizable) is refuted; the real defect was already fixed after the gate.
verification: evidence-only. Not re-verified with a live drag: a drag cannot be run safely from this agent. Residual operator check, optional: on a current build open Settings -> Winetricks and drag the window edge to ~640 pt; the paper should now shrink to `max-width: 80vw` instead of overflowing.
files_changed: []
