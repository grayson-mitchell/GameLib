---
created: 2026-10-09T21:30:00.000Z
title: 'Dismissed sign-in notice returns after relaunch although dismissedSignInNotices persisted (item 10d FAIL, F-49-R1-3)'
area: ui
severity: major
platform: any
ready: live-gate
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/frontend/state/GlobalState.tsx
  - src/common/signInDismissal.ts
  - src/frontend/screens/Library/librarySignInRows.ts
---

# Dismiss persists to disk but does not survive a relaunch

Run 1, item 10d FAIL (`49-LIVE-GATE.md` § Run 1, F-49-R1-3). After dismissing the Humble row in
launch 9, both `config.json` (`defaultSettings.dismissedSignInNotices`) and
`store/config.json` (`settings.dismissedSignInNotices`) read `["humble"]`, and still did after
launch 10 booted (no prune). Yet launch 10 rendered "Humble Bundle is not connected" with Sign in
and ×. `GlobalState.tsx:528` seeds state from `globalSettings?.dismissedSignInNotices`, where
`globalSettings = configStore.get_nodefault('settings')` is evaluated once at module load
(`:82`). Check whether that snapshot is taken before the store is hydrated under Tauri, whether
`normalizeSignInDismissals` / `parseSignInStore` accepts `humble`, and whether
`handleRearmSignInDismissals` prunes it in memory without writing. Add a boot test that seeds
the setting and asserts the row is absent.

## Fix (2026-10-09, inline quick fix)

`GlobalState.componentDidMount` now hydrates `dismissedSignInNotices` once from
`window.api.requestAppSettings()` (the backend's authoritative read), merging with the in-session
set through `normalizeSignInDismissals`, never calling `setSetting`. Same route the focusRow seed
takes (CR-01). Pinned by `GlobalStateSignInMount.test.ts` ("hydrates the dismissed set …"); the
two-writer count is unchanged. **Needs one live check on the Mac:** dismiss a not-connected row,
relaunch, row absent. Until then this stays `ready: live-gate`.
