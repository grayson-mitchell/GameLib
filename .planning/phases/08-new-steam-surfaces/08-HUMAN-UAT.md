---
status: partial
phase: 08-new-steam-surfaces
source: [08-VERIFICATION.md]
started: 2026-07-04T00:00:00Z
updated: 2026-07-04T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Gap A re-UAT — Steam game with a broken/404 art URL in the Console grid
expected: The tile shows the greyed 'Artwork unavailable' GameLib placeholder instead of a blank tile. Games with no art URL show the branded 'No artwork' default. No blank tiles anywhere in the grid.
result: [pending]

### 2. Gap B re-UAT — Delisted Steam game absent from Console
expected: A known-delisted owned Steam game does not appear in the Console grid. If Steam's appdetails API is temporarily offline (no network), valid non-delisted games remain visible — a transient failure must not hide them.
result: [pending]

### 3. Gap C re-UAT — GameLib placeholder branding everywhere
expected: Any game tile that would previously show the Heroic Games Launcher default image now shows the GameLib-branded dark card. The greyed variant ('Artwork unavailable') is visually distinct from the default ('No artwork'). Includes the game-detail page (GamePicture), Library grid, Deals cards, and dialogs.
result: [pending]

### 4. Gap D re-UAT — Launch overlay dismisses on window blur, not 1500ms
expected: Activating an installed Steam game shows 'Launched in Steam'. The overlay persists until GameLib loses focus (the Steam client brings the game to the foreground). If the game never foregrounds, the overlay still dismisses within ~8s. The overlay no longer disappears prematurely at ~1.5s.
result: [pending]

### 5. Gap F re-UAT — Hide Owned hides across Epic/GOG/Amazon/Steam/Zoom
expected: On the Deals page, enabling 'Hide Owned' removes catalog products whose title matches a game owned in ANY of the five stores — not just GOG. The 'Hide Owned' checkbox is visible as long as the user owns any games, regardless of GOG login state. 'Wishlist Only' remains GOG-gated.
result: [pending]

### 6. Original UAT confirmed behaviors remain intact (regression check)
expected: Steam Store tab still loads store.steampowered.com in the WebView with no LoginWarning and last-URL persistence. Steam games appear in Console with the Steam chip. Launch and install handoffs still work.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
