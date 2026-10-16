# REQ-43-19 RUN 3 measurements — 2026-09-11, session 20260911T075450Z

Build: HEAD 3ccc6e689 (carries 2c68c17fe gift gate, c690a117a divider+gogIcon, e344f589d alignment)
Binary sha256: 50d3c940d9aa007325d60b31d85997bc121759d52505eb145c65c5a1b54c3211
DMG 101,415,126 bytes. Window CGWindowID 4705, 1280x800 pt, captures 2560x1600, SCALE 2.0000 exact.
Build command (contract §3 verbatim) exit 0. P1 empty. P4 hashes identical both sides.
Sync: gamekeys=34 fetched=6/6 frozen=28 ok=6 schema_error=0 (19:57:13) -- same 34 keys as runs 1 and 2.
Alignment fix confirmed present in the embedded renderer bundle (3/3 declarations) BEFORE measuring.

## Item 2 -- KEY column left-edge alignment (threshold +/-2 CSS px): PASS

capture-2-top.png, near-black theme, bg [8,10,11]:
  "Key" header label left edge   934.5
  KEY content, all 7 rows        934.0
  -> spread 0.5 CSS px                                   PASS
(run 2: header 1085.5 vs content 934.0, divergence 151.5 -> FAIL)

## Item 3 -- GAME column left-edge alignment (threshold +/-2 CSS px): FAIL

capture-2-top.png:
  "Game" header label left edge  335.5
  title left edges               341.0 Aksun Playtest
                                 341.0 Dredge
                                 340.0 Fabledom
                                 340.5 Persona 5 Royal
                                 341.0 Warhammer 40,000: Rogue Trader
                                 341.0 Settlement Survival
  -> title-to-title spread       1.0 CSS px   (run 1: 216.5)
  -> header-vs-titles            5.5 CSS px   EXCEEDS +/-2      FAIL

The CENTRING defect the operator's decision targeted is FIXED: titles now agree with each
other to 1.0 CSS px across lengths from "Dredge" to "Like a Dragon Gaiden: The Man Who
Erased His Name". What remains is a SEPARATE, much smaller offset that the 216.5 spread
was masking.

Ruled out before reporting:
 - NOT an antialiasing artifact: offset stable at 4.5-5.0 across ink thresholds 28/60/100/140.
 - NOT a systematic header-vs-row offset: TYPE header 220.0 vs row logo 220.0 (0.0);
   KEY header 934.5 vs content 934.0 (0.5). Only GAME diverges.
 - NOT a markup difference: header is three plain <span> grid items
   (Keys/index.tsx:634-638); the title is a plain <span> with no padding
   (HumbleKeyRow/index.tsx:729, .humbleKeyRowTitle Keys/index.css:344-350).
 - Confirmed visually in crop-game-column.png: every title sits exactly on the 341.0 rule
   while the header's "G" crosses left of it.

Cause NOT established. Both elements should resolve to the same grid track. Remaining
candidates need DOM inspection, which a release build cannot provide (devtools unavailable
by P2's own design). Recorded as measured-and-unexplained; NOT re-scored.

## Item 4 -- row separator contrast (threshold: max channel delta >= 3): PASS

capture-2-top.png  near-black bg [8,10,11]    seam [41,47,49]    DELTA 38   7 separators, 103/103
capture-3-gog.png  light bg [237,239,244]     seam [208,209,215] DELTA 30   103/103
Four distinct theme backgrounds have now passed across runs 2 and 3 (deltas 29, 30, 31, 38).

## Item 6 -- store logo fill resolves through currentColor: PASS

capture-3-gog.png, light theme, --text-secondary #393b41 = [57,59,65]:
  GOG glyph (Racine)          ink [57,59,64]   bbox 19.0 x 17.5 CSS px
  Steam (Darkest Dungeon)     ink [57,59,64]   bbox 19.0 x 19.0
  Steam (Satellite Reign)     ink [57,59,64]   bbox 19.0 x 19.0
  Steam (Dex)                 ink [57,59,64]   bbox 19.0 x 19.0
All four match the token within +/-1 and are identical to each other.   PASS

The bbox figures independently confirm the OPEN non-square-glyph todo
(2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md): GOG renders 19.0 x 17.5
against Steam's square 19.0 x 19.0, in the same 19.2 box.

## Item 3 -- ADDENDUM: no-logo and GOG row coverage (closes the sample-composition gap)

The six titles measured in capture-2-top.png were ALL logoed Steam rows, so on their own they
could not supersede run 1's no-logo sub-check. Measured a second sample from capture-3-gog.png
(light theme) to cover the missing shapes:

  CryoFall (steam logo)           340.5
  Darkest Dungeon (steam logo)    341.0
  Dex (steam logo)                341.0
  FRONTIERS (steam logo)          341.0
  Racine (GOG LOGO)               341.0
  Satellite Reign (steam logo)    341.0
  The Dragoness (steam logo)      340.5
  Alchemy VTT (NO-LOGO / "Other") 340.5
  Valiant: Resurrection (steam)   340.5
  -> spread 0.5 CSS px

Combined across both captures: 15 rows, two themes, three TYPE-cell shapes (Steam logo, GOG
logo, no-logo text label), title left edges 340.0-341.0, total spread 1.0 CSS px.

Run 1's item-3 sub-checks -- including the no-logo row sub-check -- are therefore superseded
WITH evidence covering the same shapes, not by inference. The header-vs-titles 5.5 offset is
unaffected by this addendum and remains the sole reason item 3 scores FAIL.
