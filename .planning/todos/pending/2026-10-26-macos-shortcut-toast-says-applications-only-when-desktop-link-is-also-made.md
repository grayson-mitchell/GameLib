---
created: 2026-10-26
title: "macOS shortcut toast says \"Applications folder\" only when a Desktop link is also made"
source: open follow-up from quick 261026-clh / 261026-ctm (opt-in macOS Desktop shortcut, now a symlink to the Applications bundle)
area: shortcuts
files:
  - src/backend/shortcuts/ipc_handler.ts
  - src/backend/sidecar/shortcutsFlowRegistration.ts
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - public/locales/en/translation.json
severity: minor
platform: any
ready: code
---

On macOS, with "Add desktop shortcuts automatically" (`addDesktopShortcuts`) on, Add shortcut now
writes `~/Applications/<title>.app` **and** a `~/Desktop/<title>.app` symlink to it (261026-ctm).
The toast still uses `box.shortcuts.message-mac` — "Shortcuts were created on the Applications
folder" — and remove uses `box.shortcuts.message-remove-mac`, so neither mentions the Desktop.
Live-verified behaviour is otherwise correct (Avernum 6, 2026-10-26).

Both send sites pick the mac key by platform only: `src/backend/shortcuts/ipc_handler.ts:58-69`
(add) and `:91-103` (remove), and the shipped sidecar path
`src/backend/sidecar/shortcutsFlowRegistration.ts:225-234` (add) and `:278-289` (remove).

Implement:

- When `addDesktopShortcuts` is on (darwin), use a new key worded for both locations, e.g.
  "Shortcuts were created in the Applications folder and on the Desktop", plus a matching remove
  key. Keep the existing `-mac` keys for the toggle-off case.
- Remove: say what was actually removed — a Desktop link can exist with the toggle now off, so
  decide from what was on disk (`shortcutPathPresent`) rather than the current setting, or keep
  the wording location-neutral.
- New strings: find where GameLib-added keys live today (the `gamelib.*` catalogs used by the
  first-run welcome in 261026-b9r, all 49 locales) versus the inherited `translation.json`, and
  follow that convention. Run the i18n gates the welcome task ran.
- Unit-test the key choice for darwin toggle on/off at both send sites.

Verify: jest for both send sites, i18n gates, scoped `npx prettier --check` on the `.ts` paths
(locale JSON is prettier-ignored). Optional live glance on this Mac.
