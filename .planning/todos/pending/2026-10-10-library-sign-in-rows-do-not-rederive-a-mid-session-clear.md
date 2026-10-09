---
created: 2026-10-09T21:30:00.000Z
title: 'Library sign-in rows do not re-derive a mid-session verdict=cleared until the screen remounts (F-49-R1-2)'
area: ui
severity: medium
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/frontend/screens/Library/LibrarySignInNotice/index.tsx
  - src/frontend/screens/Library/librarySignInRows.ts
  - src/frontend/state/GlobalState.tsx
---

# A cleared verdict reaches the Library only on remount

Run 1 (`49-LIVE-GATE.md` § Run 1, F-49-R1-2). Launch 9: `steam verdict=cleared` at 09:50:42
with an empty flag census, yet the Library rendered the Steam expired row ~70 s later; it vanished
after navigating to another tab and back. Launch 3 showed the same shape for Epic (confounded by
F-49-R1-1). `LibrarySignInNotice/index.tsx` says rows derive from context state on every render,
so the context's sign-in state is what is stale: check whether `signInProbeOutcomes` /
the persisted-flag read is refreshed when the `cleared` verdict arrives, or only at mount.
