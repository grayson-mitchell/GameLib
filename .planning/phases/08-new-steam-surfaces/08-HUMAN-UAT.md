---
status: complete
phase: 08-new-steam-surfaces
source: [08-VERIFICATION.md]
started: 2026-07-04T00:00:00Z
updated: 2026-07-04T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Gap A re-UAT — Steam game with a broken/404 art URL in the Console grid
expected: The tile shows the greyed 'Artwork unavailable' GameLib placeholder instead of a blank tile. Games with no art URL show the branded 'No artwork' default. No blank tiles anywhere in the grid.
result: pass
observations: "No blank tiles confirmed. Enhancement request: on the 'artwork unavailable' placeholder, show the GameLib icon ABOVE the text, rendered in greyscale."

### 2. Gap B re-UAT — Delisted Steam game absent from Console
expected: A known-delisted owned Steam game does not appear in the Console grid. If Steam's appdetails API is temporarily offline (no network), valid non-delisted games remain visible — a transient failure must not hide them.
result: pass

### 3. Gap C re-UAT — GameLib placeholder branding everywhere
expected: Any game tile that would previously show the Heroic Games Launcher default image now shows the GameLib-branded dark card. The greyed variant ('Artwork unavailable') is visually distinct from the default ('No artwork'). Includes the game-detail page (GamePicture), Library grid, Deals cards, and dialogs.
result: pass

### 4. Gap D re-UAT — Launch overlay dismisses on window blur, not 1500ms
expected: Activating an installed Steam game shows 'Launched in Steam'. The overlay persists until GameLib loses focus (the Steam client brings the game to the foreground). If the game never foregrounds, the overlay still dismisses within ~8s. The overlay no longer disappears prematurely at ~1.5s.
result: issue
reported: "no, this seems worse than the original... before you saw 'Launched in Steam' for ~1.5 sec... now it's 0 sec, I do not get to see 'Launched in Steam' at all now"
severity: major
regression: true

### 5. Gap F re-UAT — Hide Owned hides across Epic/GOG/Amazon/Steam/Zoom
expected: On the Deals page, enabling 'Hide Owned' removes catalog products whose title matches a game owned in ANY of the five stores — not just GOG. The 'Hide Owned' checkbox is visible as long as the user owns any games, regardless of GOG login state. 'Wishlist Only' remains GOG-gated.
result: pass

### 6. Original UAT confirmed behaviors remain intact (regression check)
expected: Steam Store tab still loads store.steampowered.com in the WebView with no LoginWarning and last-URL persistence. Steam games appear in Console with the Steam chip. Launch and install handoffs still work.
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "The 'artwork unavailable' placeholder should show the GameLib icon above the text, rendered in greyscale."
  status: enhancement
  reason: "User request (test 1): Gap A fix confirmed (no blank tiles), but wants the greyed placeholder to display the GameLib icon above the text, in greyscale."
  severity: cosmetic
  test: 1
  artifacts: []
  missing: []
  class: branding-enhancement

- truth: "The Console launch overlay for Steam should show 'Launched in Steam' long enough to be seen, then stay until the game foregrounds."
  status: failed
  reason: "User reported (test 4): REGRESSION from Gap D fix. The blur-based dismiss fires immediately when steam:// launches (GameLib loses focus instantly), so the overlay shows for ~0s — 'Launched in Steam' is never visible at all. Worse than the original 1500ms timer."
  severity: major
  test: 4
  regression: true
  artifacts:
    - path: "src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx"
      issue: "Steam branch dismisses on window blur, which fires the instant steam:// handoff steals focus — 0s visible"
  missing:
    - "Add a minimum-visible floor (e.g. show for >=1.5s) before allowing blur-based dismiss, OR ignore the immediate blur from the steam:// handoff and only dismiss on a later foreground loss, with the ~8s max-timeout safety net retained"
  class: bug-regression
