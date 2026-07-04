---
status: testing
phase: 08-new-steam-surfaces
source: [08-VERIFICATION.md]
started: 2026-07-04T00:00:00Z
updated: 2026-07-04T04:25:00Z
---

## Current Test

[re-test wave complete — Gap D overlay fixed (test 9 pass); simple-fullscreen prototype rejected (test 11), native fullscreen retained + flash documented as known macOS limitation. Remaining test-8 delisted-game work tracked as Phase 08.1.]

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

<!-- Re-test wave: fixes from quick task 260704-mig (commits a2a7e032 + 1d7426c1) -->

### 7. Gap D re-fix — Steam launch overlay minimum-visible floor
expected: Activating an installed Steam game shows 'Launched in Steam' for at least ~1.5s (readable, no 0s flash), then dismisses when GameLib loses focus. Still auto-dismisses within ~8s if the game never foregrounds. No indefinite 'Launching' hang.
result: issue
reported: "transition is good (does not go to desktop and then to game — goes direct to game), however no longer getting the transition in gamelib (message + spinner)"
severity: minor
analysis: "First re-fix (a2a7e032) was wrong: it REMEMBERED the spurious blur that shell.openExternal('steam://') fires when spinning up the protocol handler and dismissed at the 1.5s floor. User clarified GameLib actually keeps focus for several seconds until the game foregrounds — so the overlay should stay the whole time. Real fix (8f0862f5): ignore any blur during a startup window and only dismiss on a blur AFTER it (the game genuinely taking focus). See test 9 for re-test."
superseded_by: 9

### 9. Gap D re-fix (v2) — overlay stays until the game takes focus
expected: Activating an installed Steam game shows 'Launched in Steam' + spinner immediately, and it STAYS visible for the whole several-second launch while GameLib holds focus, then disappears exactly when the game takes the foreground. No 0s flash, no missing message, no indefinite hang (8s safety ceiling). Requires a rebuild with commit 8f0862f5.
result: pass

### 10. Silent Steam handoff — no desktop-Space flash in Console mode
expected: Launch an installed Steam game FROM CONSOLE MODE (macOS native fullscreen). No 'view of the desktop' detour between GameLib and the game — Steam is no longer brought to the foreground (activate:false), so GameLib stays in its fullscreen Space and the only transition is directly to the game's own window. Console-mode swipe/Space controls are unchanged (still native fullscreen). Also sanity-check a Library launch still starts the game normally. Requires a rebuild with commit a6e3c645.
result: issue
reported: "same behavior"
severity: minor
analysis: "activate:false did NOT remove the desktop-Space flash. Conclusion: the flash is not caused (only) by Steam being foregrounded — it's macOS leaving GameLib's native-fullscreen Space when the GAME window appears on a different Space, which we cannot control from Electron (the game is a separate process that activates itself). Confirms the earlier binary tradeoff: native fullscreen Space (swipe-able) inherently costs the exit animation; the only flash-free option is simple fullscreen (loses the swipe-able Space). activate:false is harmless (arguably cleaner — Steam no longer steals focus; test 9 still passed) but did not achieve its goal → decide keep vs revert."

### 8. Test 1 enhancement — GameLib icon on artwork placeholders
expected: A Steam game with unavailable art in the Console grid shows the GameLib icon ABOVE the text, rendered in greyscale ('Artwork unavailable' variant). A game using the default 'No artwork' placeholder shows the same icon in full color. Icon sits above the wordmark, layout looks balanced.
result: issue
reported: "for the 'no artwork', no reason why this should not be greyed out as well. Also this is not the correct error message — 'Game no longer available' is actually the issue. So in that case the install option should not be available."
severity: major
analysis: "Icon-above-text layout is fine, but the two-variant model (full-color 'No artwork' vs greyed 'Artwork unavailable') doesn't map to a real user-meaningful state. The games showing these placeholders are DELISTED / no longer available on Steam. Desired: (a) greyed placeholder in this case too, (b) message should read 'Game no longer available', (c) install option must NOT be offered for a no-longer-available game. Overlaps Gap B (delisted filtering) — needs a scope decision: hide delisted vs show-as-unavailable-with-install-disabled, and WHERE (Library vs Console)."

## Summary

total: 11
passed: 6
issues: 4
pending: 0
skipped: 0
blocked: 0

note: Tests 7-10 are the 260704-mig re-test wave. Test 7 (first Gap D re-fix) failed — superseded by test 9 (corrected fix, commit 8f0862f5). Investigating test-7 root cause revealed the real Console-mode desktop-flash cause = macOS native-fullscreen Space switch on Steam activation; addressed by test 10 (activate:false, commit a6e3c645). Pending re-test on a rebuild: 8 (placeholder icon), 9 (overlay message), 10 (silent handoff).

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

## Tests (continued)

### 11. Simple-fullscreen prototype — flash vs swipe tradeoff (macOS)
expected: In Console mode on macOS, launching a Steam game has NO desktop-Space flash; Console mode is no longer its own swipe-able Space. Evaluate the tradeoff vs native fullscreen. Watch for window-chrome regressions. Requires rebuild with commit c314269c.
result: issue
reported: "simple fullscreen also broke Console-mode highlight navigation (could click but not move highlight between games — patched in 2237817e). Decision: REVERT to native fullscreen and document the flash as a known macOS limitation."
severity: minor
resolution: "Reverted simple-fullscreen prototype (c314269c + 2237817e backed out). Native fullscreen retained (swipe controls intact). Desktop-Space flash on Console launch accepted as a known macOS limitation — recorded in STATE.md Deferred Items. activate:false handoff KEPT."
