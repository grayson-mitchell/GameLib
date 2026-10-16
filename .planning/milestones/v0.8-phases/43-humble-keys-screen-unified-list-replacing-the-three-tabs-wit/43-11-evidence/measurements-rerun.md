# REQ-43-19 re-run measurements — 2026-09-11, session 20260911T062945Z

Build: HEAD 0d2ae9862 (carries 2c68c17fe gift gate, c690a117a divider+gogIcon)
Binary sha256: 1cd1e843f5e71d9bfcba70dbe22ee5d07a64aabcddec80d9b7eadde9c43e3f5a
DMG: GameLib_0.7.0_aarch64.dmg (101,411,459 bytes)
Window: CGWindowID 4428, 1280x800 pt, capture 2560x1600 px, SCALE 2.0000 exact
Sync: gamekeys=34 fetched=6/6 frozen=28 ok=6 schema_error=0 (18:34:04)

## Item 4 — row separator contrast (threshold: max channel delta >= 3)

capture-1-columns.png — DARK theme, background [26,28,33]
  7 separators, each full-width at 107/107 sampled columns
  peak seam [51,57,64] -> max channel delta 31          PASS
  (prior run same theme: seam [31,33,38]..[43,46,50], delta 11-19)

capture-2-top.png — LIGHT theme, background [237,239,244]
  7 separators, each full-width at 107/107 sampled columns
  peak seam [209,210,215] -> max channel delta 29       PASS
  (prior run same theme: seam [238,240,245], delta 2 -> FAIL)

  Predicted value check: color-mix(in srgb, currentColor 14%, transparent)
  with --text-default #20242c [32,36,44] over [237,239,244] computes
  [208,211,216]; measured [209,210,215]. Agreement within +/-1 confirms the
  new declaration is the one painting, not the old white fallback.

## Item 6 — store logo fill resolves through currentColor

capture-3-gog.png — LIGHT theme
  GOG glyph (Racine)            ink [57,59,64]
  Steam glyph (Paths & Danger)  ink [57,59,64]
  Steam glyph (Satellite Reign) ink [57,59,64]
  --text-secondary #393b41    = [57,59,65]
  All three match the token within +/-1.                PASS
  (prior run: GOG [33,36,43] = --text-default #20242c [32,36,44] -> FAIL)

  NOT a defect, recorded to close the question: the GOG glyph reads as a
  solid block because gog-logo.svg is a filled rounded square with "gog.com"
  knocked out, whereas Steam's is a disc with its mark knocked out. Different
  silhouettes, identical ink. Unchanged by this fix.

  Carried, out of scope: GOG glyph bbox measures 19.0 x 17.5 CSS px, not
  square (viewBox "0 0 34 31" + preserveAspectRatio in a 19.2 box).

## Item 2 — KEY column left-edge alignment (threshold: +/-2 CSS px)

capture-2-top.png, KEY-column content left edge by row:
  Hard West 2 (gift only)          934.0
  Asguaard (CLAIM + GIFT PAIR)     934.0
  Californium (override-pending)   934.0
  Crusader Kings III               934.0
  CryoFall (gift only)             934.0
  Darkest Dungeon                  934.0
  Dex (Revealed + Activate)        934.0
  -> spread 0.0 CSS px across 7 shapes

  "Key" header label left edge     1085.5  -> divergence 151.5 CSS px

  Scored FAIL against the contract's literal metric (header label left edge
  vs content left edge), NOT re-scored against content-to-content alignment
  after seeing the result. Cause is arithmetic, not noise: KEY column spans
  934->1254, centre 1094; a ~17px "Key" label centred there starts at 1085.5.
  This is the inherited `.App { text-align: center }` rule, the same defect
  that failed item 3 last run on the GAME column. Still an open `ready: human`
  todo. The column property itself passes at 0.0 spread.

  Scenario 2's Claim+Gift pair RENDERS (Asguaard: Activate + Gift on Humble
  side by side), so item 2 is no longer NOT ATTEMPTABLE.
