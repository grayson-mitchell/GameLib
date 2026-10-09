---
created: 2026-10-09T21:30:00.000Z
title: 'Not-connected sign-in row renders black text on a dark banner in nord_light (F-49-R1-6)'
area: ui
severity: minor
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/frontend/screens/Library/LibrarySignInNotice/index.scss
---

# nord_light: black text on a dark banner

Run 1, item 10b operator judgment (`49-LIVE-GATE.md` § Run 1, F-49-R1-6). On `nord_light` the
"<Store> is not connected" row's text is black on a dark banner and illegible. `midnightMirage`,
`gruvbox_dark` and `dracula` were judged pass. Check which token the row's background and text
use; see memory notes on `--border-color` and surface tokens being invisible in several themes.
