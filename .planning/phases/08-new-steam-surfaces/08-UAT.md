---
status: diagnosed
phase: 08-new-steam-surfaces
source:
  - 08-01-SUMMARY.md
  - 08-02-SUMMARY.md
started: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Steam Store tab appears in sidebar
expected: Stores submenu shows a "Steam Store" item after Amazon Luna (before Zoom), styled like the other store sub-items (text-only, no icon).
result: pass

### 2. Steam storefront browses in the WebView
expected: Clicking "Steam Store" opens store.steampowered.com inside GameLib's WebView with the normal webview controls (back/forward/reload/open-in-browser). NO login-warning dialog appears (unlike Epic/GOG/Amazon). Navigate to a game page, switch away, then return to the Steam Store tab — it resumes at the last page you were on (last-URL persistence). A Steam web login, if you do one, persists.
result: pass

### 3. Steam games appear in Console mode
expected: Open Console Mode (sidebar → Console Mode). Your owned Steam games appear in the grid alongside Epic/GOG/Amazon games — ALL owned Steam games, not just installed ones.
result: issue
reported: "yes, but there are UX errors: (1) some games show the Heroic Games Launcher default placeholder image — that image + text should be GameLib branding, plus a 'greyed' variant to signify art could not be found; these particular games are no longer available on Steam (delisted) and should NOT show in Console at all. (2) some games show 'blank' / no art at all — this should never happen, should fall back to the placeholder in (1); these games DO exist on Steam, so the artwork is failing to load for an unknown reason."
severity: major

### 4. Steam filter chip in Console mode
expected: In the Console top bar, a "Steam" filter chip appears (only when you own Steam games), sitting after the Amazon chip and before "Other". Selecting it filters the grid to Steam games only; deselecting/"All" restores the full list.
result: pass

### 5. Launch an installed Steam game from Console
expected: Focus an INSTALLED Steam game in the Console grid and activate it (Enter / A button / click). An overlay shows "Launched in Steam" with a green idle-style spinner, then auto-dismisses after ~1.5 seconds. The Steam client receives the handoff and launches the game. There is NO indefinite "Launching…" state, and no hold-to-cancel / BackHint for Steam.
result: pass
observations: "(1) The overlay auto-dismisses ~1.5s too early from a UX standpoint — 'Launched in Steam' looks great but disappears, then GameLib backgrounds on macOS for a couple seconds before the game loads; user wants the overlay to persist until the game actually starts (e.g. dismiss on window blur rather than a fixed 1500ms timer). (2) If the Steam game needs an update, there is NO feedback in GameLib — it says 'Launched in Steam' and dismisses, but the user has to open Steam to see it is updating."

### 6. Install handoff for a not-installed Steam game
expected: Focus a NOT-installed Steam game and activate it. A minimal overlay appears showing "Opening Steam to install…" and the game title only — no platform/wine/path fields and no Install/Cancel buttons. It auto-dismisses after ~1.5 seconds and hands off to the Steam client to install. Pressing Escape dismisses it immediately.
result: pass
observations: "Core handoff works. Reinforces the delisted-games gap (test 3): delisted games should not be listed here either — activating one would fire an install handoff to Steam that cannot succeed."

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

note: All 4 ROADMAP success criteria PASS. The gaps below are follow-on polish/enhancements and one artwork bug — none block Phase 8's stated contract.

## Gaps

- truth: "Delisted Steam games (no longer available on Steam) should not appear in the Console grid (nor be install-activatable)."
  status: failed
  reason: "User reported (tests 3 + 6): games showing the default placeholder are all delisted/unavailable on Steam and should be filtered out of Console entirely — both the grid display and the install handoff (activating a delisted game would fire a steam://install that cannot succeed)."
  severity: major
  test: 3
  artifacts: []
  missing: []
  class: behavior-change

- truth: "The fallback/placeholder game art should be GameLib-branded (not the Heroic Games Launcher default image + text), and should have a distinct 'greyed' variant signifying art could not be found."
  status: failed
  reason: "User reported: some games display the Heroic default placeholder image and text; wants a GameLib image + updated text, plus a greyed 'art not found' variant."
  severity: cosmetic
  test: 3
  artifacts: []
  missing: []
  class: branding-enhancement

- truth: "Steam games that DO exist on Steam should load their store artwork in the Console grid (and at minimum fall back to the placeholder, never blank)."
  status: failed
  reason: "User reported: some Steam games that exist on Steam show blank / no art at all; artwork is failing to load for an unknown reason."
  severity: major
  test: 3
  artifacts: []
  missing: []
  class: bug

- truth: "The Console launch overlay for Steam should stay visible until the game actually starts (dismiss on window blur / foreground loss) rather than a fixed ~1500ms timer that disappears before the game loads."
  status: failed
  reason: "User observation (test 5): overlay disappears ~1.5s too early; GameLib backgrounds on macOS for a couple seconds before the game loads, leaving a confusing gap."
  severity: minor
  test: 5
  artifacts: []
  missing: []
  class: enhancement

- truth: "When a Steam game needs an update before launch, GameLib should give the user feedback (rather than showing 'Launched in Steam' and dismissing while Steam silently updates)."
  status: deferred
  reason: "User observation (test 5): no update feedback in GameLib; user must open Steam to discover the game is updating. DEFERRED to backlog (post-v1.1) — new capability, and Steam does not report update state back to GameLib, so this needs its own design. NOT part of Phase 8 gap closure."
  severity: minor
  test: 5
  artifacts: []
  missing: []
  class: enhancement-limitation
