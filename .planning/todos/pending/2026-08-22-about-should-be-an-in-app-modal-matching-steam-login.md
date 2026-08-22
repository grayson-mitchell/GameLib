---
created: 2026-08-22T22:15:00.000Z
title: "About opens a bare OS window — should be an in-app animated modal matching the Steam login overlay"
area: frontend
severity: low
found_by: "Operator, during 34.1 UAT item 8b live run, 2026-08-22 (the run that PASSED the entry point)"
source: ".planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-HUMAN-UAT.md item 8b"
files:
  - src/preload/api/tauriChildWindows.ts
  - src/preload/api/helpers.ts
  - public/about.html
  - src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
  - src/backend/utils.ts
---

## Problem

The About window works — 34.1 UAT item 8b passed live on 2026-08-22, opening from
Settings → About, refocusing on a second click, and showing `0.7.0`. It just looks nothing like
the rest of the app.

It is a **separate OS window**: `tauriShowAboutWindow` (`tauriChildWindows.ts:139`) constructs a
420×380 non-resizable `WebviewWindow` loading the static, first-party `public/about.html`
(1909 bytes), with the version passed as a `?v=` query param. That file carries its own
hand-rolled `<style>` block with hardcoded colours (`background: #1a1a1a`, `color: #e6e6e6`) —
it does not participate in the app's theming at all, and cannot: it is deliberately
capability-free and loads no bundle.

Meanwhile every other modal surface in the app is an in-app MUI `Dialog` with a 500ms Slide.

## Wanted

Make About an **in-app modal following the Steam login overlay pattern** — the same treatment
Humble got in quick task `260821-iri`:

- MUI `Dialog` via the shared primitive, `transitionDuration={500}` with a Slide
  (`components/UI/Dialog/components/Dialog.tsx:119`, pinned by
  `dialogWindowChrome.test.ts:85`).
- The behind-content crossfade at `screens/Login/index.scss:51-57`:
  `transform 500ms cubic-bezier(0, 0, 0.2, 1)` + matching `opacity`, deliberately equal to the
  Dialog's own exit duration so the overlay's Slide has a full 500ms of mounted time.
- Themed via `var(--*)` tokens, not the hardcoded `#1a1a1a` / `#e6e6e6` the static page uses.
  Hardcoded colours are a re-litigated bug in this repo — see `Skill("sketch-findings-gamelib")`
  multi-theme survival rules.

## Five things this drags with it — decide them, do not discover them

1. **`public/about.html` and `tauriShowAboutWindow` become dead.** If the modal fully replaces
   the OS window, both should be DELETED, not left orphaned. That is a decision to make
   explicitly — this repo has a standing problem with fully-implemented unreachable code, which
   is the exact defect that produced the About entry point in the first place
   (`.planning/todos/completed/2026-08-22-about-window-is-unreachable-under-tauri.md`).

2. **Electron diverges unless it is handled too.** `helpers.ts:17` routes `showAboutWindow()` to
   `tauriShowAboutWindow()` under Tauri and to the IPC listener under Electron, which lands at
   `utils.ts:243`. An in-app Dialog is shell-agnostic and would bypass BOTH — likely a
   simplification (one surface, both shells), but it means `utils.ts:243`, the
   `showAboutWindow` IPC channel, and `tray_icon.ts:124`'s tray item all need a disposition.
   Note the Electron tray item would then point at a window that no longer exists.

3. **UAT item 8b's sub-observation (b) becomes meaningless.** It currently reads "clicking About
   a second time REFOCUSES the same window rather than opening a second one" — a real property of
   `WebviewWindow.getByLabel('about')`. A Dialog has no second-window concept. If this lands,
   rewrite the item; do not leave a passed observation whose subject no longer exists.

4. **The capability posture changes.** The About window is currently fail-closed by window label
   (`src-tauri/capabilities/default.json` scopes `"windows": ["main"]`), so it has ZERO Tauri
   command access — that isolation is why `about.html` takes its version via query param instead
   of IPC. In-app, it inherits `main`'s capabilities. Practical impact is nil (it renders a
   version string), but state it rather than silently dropping an isolation boundary.

5. **`ABOUT_VERSION_TIMEOUT_MS` (1s) can probably go.** The bounded `getHeroicVersion()` race
   at `tauriChildWindows.ts:145-165` exists because a wedged sidecar made the About menu item
   appear to do nothing for up to a minute BEFORE the window was constructed. An in-app Dialog
   renders immediately and can fill the version in asynchronously, so the race has no job. Confirm
   before deleting.

## Not a regression

The current behaviour is correct and passing. This is a polish/consistency item, raised in the
same breath as the pass. `severity: low`.
