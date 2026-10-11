---
status: complete
phase: 45
source: [45-06-SUMMARY.md, 45-07-SUMMARY.md, 45-08-SUMMARY.md, 45-11-SUMMARY.md, 45-LIVE-GATE.md]
started: 2026-10-10T19:15:38Z
updated: 2026-10-10T22:40:00Z
---

## Protocol

These twenty-seven items are the blocking macOS live gate for Phase 45 (D-21). Items 1-9 are
G1-G9 of `45-LIVE-GATE.md` (same numbering as the G-labels); item 10 is its D-15 log count;
items 11-13 are the carry-forward observations from the 45-08 and 45-06/07 SUMMARYs; items 14-27
are the fourteen `verification: backstop` truths from 45-06, 45-07 and 45-08, discharged by G9.
The contract holds the procedure, the pre-registered pass bars and the capture standard. Every
`result:` is filled only from the operator's observation (resume message), opens with a bare
status word (`pass`, `issue`, `skipped`, `blocked`), and names its launch ordinal and evidence
file. Nothing here was observed at authoring; every item is pending.

Human-judgment rows carried in: items 14-27 discharge 45-07's and 45-08's narrow-width,
`de`-locale and two-theme presentation rows; item 10 discharges 45-06's D-15 real-log
measurement; item 5 discharges 45-06's unattended half of the `gdiplus_winxp` D-17 check.

## Tests

### 1. G1 - Multi-verb Apply runs to completion with the tab mounted throughout (D-21)
expected: Three not-yet-installed verbs ticked and applied on a packaged release build each pass Queued, Installing, Installed in order with the bar reading Installing N of 3; no row vanishes, no region blanks, no group collapses and no row moves vertically at any of the six verb start/finish transitions (screen recording, 30 fps or better, frame-stepped); the bar ends 3 installed and the bottle's winetricks.log contains all three verbs.
result: issue - three attempts, all on the Alan Wake GPTK bottle (wine-7.7). Attempt 1 (launch 1, vcrun2010/xact/tahoma): bar read 3 selected then 3 installed, all three verbs in winetricks.log; but when the operator opened Show details the Settings dialog grew wider than the window, clipping row text at the left edge and Cancel remaining at the right (G1-launch1-shot3.png), so row transitions were unobservable and no recording was taken. Attempt 2 (launch 1, lucida/cjkfonts/liberation): 3 installed, log gained lucida/wenquanyi/liberation; the shell recording was lost by the assistant's stop command. Attempt 3 (launch 1, msxml6/sourcehansans/xinput): 3 installed, all three in winetricks.log, recorded (G1c-G2-launch1.mov, 10 min, display rate). Row states Queued -> Installing (spinner + phase word) -> Done/Installed and bar Installing N of M were seen on 2 s window captures in launches 3 and 4 (burst3-042.png, burst3-115.png). The 0 px frame-step claim in (c) was not made: no capture was frame-stepped and the attempt-1 overflow is itself a region clipped. Launch ordinal: 1 (attempts 1-3).

Evidence: screen recording, winetricks-before-G1.log, gamelib-launch-N.log. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G1.

### 2. G2 - Navigation mid-run neither warns nor cancels (D-18)
expected: During the second verb of the G1 run, switching to the Wine tab, leaving Settings and opening the game page shows no dialog, the game page main button reads "Installing Winetricks Packages", and returning to the Winetricks tab shows the bar, row states and Show details log rebuilt while the run continues to 3 installed.
result: pass - performed on attempt 3 of G1 (launch 1, run msxml6/sourcehansans/xinput, 09:4x local) during the second verb: operator reports no dialog, toast or confirmation on switching to the Wine tab and leaving Settings, the game page main button read Installing Winetricks Packages, and the run continued to 3 installed (backend log shows the three -q runs uninterrupted; winetricks.log gained all three). The rebuilt bar/row/log state on return was not described beyond done; nothing contrary was reported. Launch ordinal: 1.

Evidence: screen recording, gamelib-launch-N.log. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G2.

### 3. G3 - Cancel remaining finishes the in-flight verb and drops the rest (D-12)
expected: Pressing Cancel remaining during the first verb of a fresh three-verb run lets that verb reach Installed and appear in winetricks.log, while the other two never enter Installing, are not in winetricks.log and return to a selectable state; the bar ends with an installed count of 1 and no failed count.
result: issue - launch 2, run physx/d3dcompiler_47/d3dx11_43: Cancel remaining was rendered but DISABLED for the whole of the first verb (physx, 14 s) and only became enabled at the verb boundary, so the operator could not cancel while the first verb was Installing; pressed during the second verb instead. Cancel semantics then held: d3dcompiler_47 (in flight) finished and is in winetricks.log, d3dx11_43 never ran and returned to a tickable state, bar ended 2 installed with no failed count. The verb-1 stall reproduced in launch 1 (burst-light-26.png) and launch 2 (burst2-light-071..073) but NOT in launch 4 (burst6-119.png: spinner and enabled Cancel during verb 1), so it is intermittent. Candidate mechanism (code read): winetricksQueue.apply() returns a state snapshot taken before runLoop sets currentVerb, and the tab applies that snapshot on the IPC reply. Launch ordinal: 2.

Evidence: screen recording, winetricks-before-G3.log and after-run diff. Launch ordinal: record, with the first verb's measured duration. Criteria: 45-LIVE-GATE.md G3.

### 4. G4 - One induced failure continues the queue (D-12)
expected: With real verb A, the upstream test verb bad and real verb B ticked and applied, A and B reach Installed, bad reads "Install failed" with a Retry button, the bar ends exactly "2 installed · 1 failed", B starts after bad fails, and nothing is red before bad fails.
result: pass - attempt 1 (launch 1) ticked only vcrun2012 and bad, so it could not show the queue continuing (bar 1 installed · 1 failed; Retry present once Everything else was expanded). Attempt 2 (launch 2): vcrun2013 at 10:09:40, bad at 10:09:53 (winetricks exited with code 1), vcrun2019 at 10:09:56 - the queue continued; both real verbs in winetricks.log; bar read exactly 2 installed · 1 failed; bad row read Install failed with a Retry button; nothing red before bad failed. Show details could not be read for the red-line check because of the dialog overflow; the backend log shows the only error-kind line is winetricks exited with code 1 under -q bad. Title shown for bad: Fake verb that always returns false. Launch ordinal: 2.

Evidence: screen recording, gamelib-launch-N.log, winetricks diff. Launch ordinal: record, plus the title actually shown for bad. Criteria: 45-LIVE-GATE.md G4.

### 5. G5 - gdiplus_winxp installs unattended under -q (D-17 live arm)
expected: Searching gdiplus under Everything else, ticking gdiplus_winxp and applying leads to Installed with no zenity or other prompt window at any time and a gdiplus_winxp entry in winetricks.log; if zenity is not installed the pass rests on the positive outcome alone, and an observed prompt or failure is recorded with its log lines for a script-derived hidden-set rule.
result: pass - attempt 1 (launch 2) installed the WRONG verb: gdiplus and gdiplus_winxp share the title MS GDI+ and the row shows no verb id, so the operator ticked gdiplus. Attempt 2 (launch 2, search by id gdiplus_winxp): Installed, no zenity or other prompt at any time, winetricks.log gained gdiplus_winxp, backend log for the run has no manual-download or zenity text. zenity IS installed (/opt/homebrew/bin/zenity, preflight.log), so the absence is meaningful. Launch ordinal: 2.

Evidence: screen recording, command -v zenity output, gamelib-launch-N.log, winetricks diff. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G5.

### 6. G6 - GPTK environment banner is visible, calm and carries the version (D-16)
expected: On first opening the bottled game's Winetricks tab in a fresh launch the banner reads "Wine <version>, used by GameLib's macOS compatibility layer, is unsupported upstream. This is expected here and can be ignored.", the version matches the warning line in Show details and the bottle's wine --version, it is not red, has no dismiss control, and is still present after 60 seconds and after a run ends.
result: issue - on first opening the tab (launch 1, before any Apply) NO banner was shown and Show details read No output yet. Measured cause: the banner is fed by winetricks' own 'no longer supported upstream' warning, which the script emits from winetricks_wine_setup; list-all sets _W_wine_not_needed=1 (script line 5471) and skips that check, so a hand-run of winetricks list-all under the GPTK env printed only Executing cd (probe-listall-gptk.stderr). The banner appeared the moment the first -q install started (warning line at 09:07:25) with the exact copy 'Wine 7.7, used by GameLib's macOS compatibility layer, is unsupported upstream. This is expected here and can be ignored.', version 7.7 matching wine --version (wine-7.7, Game Porting Toolkit 1.1) and the warning line in Show details; info-styled not red (393B40 on D8DEE9 in nord-light, A6EDFD on 272F31 in midnightMirage); no dismiss control; still present after the run and after 60 s (G6-launch1-banner-after-G1-run.png). German copy on launch 4 also one line. Launch ordinal: 1 (banner evidence also 3, 4).

Evidence: window capture, Show details capture, wine --version output. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G6.

### 7. G7 - Light and dark theme spot-check with measured contrast (D-21)
expected: In nord-light and midnightMirage, with each cell reached, every text element (Installed, Install failed, Retry, Installing phase word, Apply enabled and disabled, banner text, header hover and focus text) measures at least 4.5:1 and every non-text indicator (checked and unchecked checkbox, icons, focus ring) at least 3:1, with tool, capture file, foreground, background and ratio recorded; any unreached cell is named NOT REACHED.
result: issue - nord-light fails: Apply enabled text 20242C on 30444A = 1.52:1 (crop-apply-light-4x.png; operator: 'way too dark'), Install failed text BF616A on EDEFF4 = 3.56:1, bar 1 failed BF616A on D8DEE9 = 3.03:1, unchecked checkbox border A8AEAF on EDEFF4 = 1.95:1, queued box 858F96 on EDEFF4 = 2.87:1, search placeholder A9A9A9 = 2.04:1, disabled/enabled Cancel and Apply borders A8AEAF = 1.66:1. midnightMirage fails: Apply enabled text CAF3FE on 8CFFFF = 1.01:1 (operator: white on light cyan), Install failed text and icon A62B2C on 080A0B = 2.84:1, bar 1 failed A62B2C on 272F31 = 1.95:1, disabled Apply border 1.36:1 [CORRECTED 2026-10-11, quick 261011-to5: re-reading burst6-007.png pixel by pixel, all four edges of the disabled Apply border are a 2-device-px run of A8AEAF on 272F31 = 6.07:1, PASS against 3:1; 3D4345 is the anti-aliased pixel of the 4px corner arc at (1939,1401), (2043,1401), (1939,1446), which the histogram rect caught instead of a straight edge; the nord-light control frame burst3-020.png agrees with its own reading]. All other cells pass (headers 11.5/11.6, hover text 7.58 light, focus ring 8.90/11.62, checked box 8.90/13.86, Installed 7.36/11.75, Installing word 9.74/15.26, banner 8.30/10.51, Retry 8.90/16.87). Hover fill unchanged in both themes (1.00:1, record-only). NOT REACHED: midnightMirage header hover text/fill (no frame caught the hovered header). Tool: steps/sample.swift colour histogram of window captures (screencapture -l), WCAG ratio via steps/contrast.sh; all values in terminal.log. Launch ordinals: 2 (light), 3 (light, dark), 4 (dark).

Evidence: window captures per theme, contrast tool output. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G7.

### 8. G8 - Tab visibility and the Tools card (D-03)
expected: The Winetricks tab is present on the ordinary bottled game (recorded first), absent on Game Defaults and absent on a CrossOver-bottle game, and that ordinary game's Wine tab Tools card shows only Winecfg and Run EXE with no Winetricks button; the CrossOver arm is blocked if no CrossOver game exists.
result: blocked - positive control pass: the Winetricks tab is present on Alan Wake; Game Defaults (global settings) has no Winetricks tab; Alan Wake's Wine tab Tools card shows only Winecfg and Run EXE with no Winetricks button. CrossOver arm blocked: no game on this Mac has a CrossOver wine version (CrossOver.app is installed but unused). Launch ordinal: 1.

Evidence: window captures of each Settings screen. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G8.

### 9. G9 - Backstop visuals at the narrowest width and in de (aggregate of items 14-27)
expected: At a 500 CSS px Settings content width and in German, all fourteen backstop items (14-27) pass; if any fails or is blocked this item reads issue or blocked and names the ids.
result: issue - narrow arm blocked: the operator could not narrow the window by dragging (reported as not resizable), so no capture is at the 500 CSS px content width; every backstop was observed at the window's natural width only. de arm done (launch 4, language changed 11:20:24): group headers, bar, zero-result heading and banner all rendered in German. Aggregate: issue for E8-overflow (24), E9-overflow (26) and E9-long-text (27), which fail at the natural width; blocked for 15-23 and 25 (condition not established). Launch ordinal: 4 (narrow/de), 1 (overflow evidence).

Evidence: window captures at the recorded width, in en and de. Launch ordinal: record, with window inner width and content width. Criteria: 45-LIVE-GATE.md G9.

### 10. D-15 - No curl-progress or fixme line is logged at ERROR for the gate session
expected: Across every archived gamelib-launch-N.log (and any .old), the count of lines that are ERROR level, tagged Winetricks, and curl progress is 0 and the count that contain fixme: is 0, with the total ERROR-tagged Winetricks lines and the err: count recorded, and Show details confirmed during the session to have contained Downloading meter and fixme: lines so the absence is observable.
result: pass - across gamelib-launch-1..4.log and their .old archives: ERROR-level Winetricks lines total 0, curl-progress 0, fixme: 0, err: 0 in every file. The absence is observable: the same archives hold fixme: lines at DEBUG (240/189/15/6 per launch) and Downloading lines at INFO (10/12/0/0); curl meter rows are classified progress and never logged, by design. WARNING-tagged Winetricks lines 33/27/14/4. Launch ordinals: 1-4.

Evidence: the four grep counts from the contract's capture step 4, per archive. Launch ordinals: all. Criteria: 45-LIVE-GATE.md carry-forward "D-15 log count". Carried from 45-06 (the 846-line / 40 percent baseline is context only, not a bar).

### 11. Carry-forward - Duplicate log lines at a seed boundary (45-08)
expected: During the G2 remount, any log line that appears twice in Show details is counted and located; this is recorded and characterised as within one flush interval, and it is an issue only if it exceeds that window or repeats without a remount.
result: blocked - could not be observed: during the G2 remount Show details was unreadable because the log panel widened the Settings dialog beyond the window (G1-launch1-shot3.png). Launch ordinal: 1.

Evidence: Show details capture before and after the remount. Launch ordinal: record. Carried from 45-08 Known, Accepted, Temporary State.

### 12. Carry-forward - Early lines between apply-accepted and run registration (45-08)
expected: Comparing the first lines in the live Show details after G1's Apply with the archived backend log for the same run, any missing early lines are recorded together with whether a remount recovers them; this known and accepted drop is characterised, not scored as a defect unless lines are missing from run.log too.
result: blocked - could not be observed for the same reason as item 11 (Show details unreadable at the remount). Backend run.log comparison not attempted. Launch ordinal: 1.

Evidence: Show details capture, gamelib-launch-N.log. Launch ordinal: record. Carried from 45-08 Known, Accepted, Temporary State.

### 13. Carry-forward - Sticky bar holds inside .App .content (45-08)
expected: With the Everything else group expanded and scrolled, the bar stays docked at the bottom of the visible area at the narrow width and the normal width and in both themes, never scrolling away or overlapping the last row's status slot.
result: issue - at the natural width the bar stayed docked at the bottom of the visible area in both themes, but it overlaps content: in G1-launch1-shot4.png it sits over the MEDIA & CODECS header and in burst-light-26.png over the last visible row's Installed badge. Narrow width not reached. Launch ordinals: 1, 2.

Evidence: window captures. Launch ordinal: record. Carried from 45-08 and 45-11 Next Phase Readiness.

### 14. E2-error - An environment-report failure never reaches the tab (45-06, backstop)
expected: With the bottle opened normally the tab renders with no environment-related error text, dialog or red element and gamelib.log shows no unhandled exception for the environment report; if the optional induced arm (unreadable winetricks script, restored afterwards, run last) is performed, the tab still renders either the catalog or the empty state and the condition is logged, not shown; the result line says which arm was run.
result: pass - non-induced arm only: the bottle opened normally in every launch, the tab rendered the catalog, no environment-related error text, dialog or red element appeared, and the four archived logs contain no unhandled exception or dependency-check failure for the environment report (grep count 0). Induced arm not performed. Launch ordinals: 1-4.

Evidence: window capture, gamelib-launch-N.log. Launch ordinal: record. Backstop id E2-error (backend half), 45-06.

### 15. E2-overflow - Missing-dependencies banner wraps and never truncates at the narrow width (45-08, backstop)
expected: With all five tools missing (launch PATH lacking cabextract, 7z, unzip, curl and zenity) at the 500 CSS px content width, the banner text wraps onto multiple lines with no ellipsis and no clipping; blocked if the five-missing condition cannot be established.
result: blocked - the five-missing condition was not induced (no PATH-stripped launch); all five tools present in every launch. Launch ordinal: none.

Evidence: window capture, PATH used for the launch. Launch ordinal: record (separate launch). Backstop id E2-overflow, 45-08.

### 16. E2-long-text - Five-tool missing-dependencies string wraps in de without clipping (45-08, backstop)
expected: In German, with all five tools missing, the missing-dependencies string wraps inside the banner without clipping or truncation; blocked if the condition cannot be established or the string is an English fallback.
result: blocked - same as item 15; the de missing-dependencies string was never rendered.

Evidence: window capture. Launch ordinal: record (same launch as item 15). Backstop id E2-long-text, 45-08.

### 17. E3-long-text - Suggested rows ellipsis-truncate with a native tooltip (45-07, backstop)
expected: At the narrow width, long titles and publisher names in Suggested rows end in an ellipsis, a native title tooltip appears on the truncated element when hovered (tooltip text recorded), and the row stays one fixed 56 px height.
result: blocked - narrow width not established. At the natural width Suggested rows did ellipsis-truncate title and publisher (burst6-007.png: 'MS d3dx9_??.dll from DirectX 9 redistributa…', 'Microsoft · 20…'); the native tooltip on the truncated element was not hovered. Launch ordinal: 4.

Evidence: window capture, tooltip text. Launch ordinal: record. Backstop id E3-long-text, 45-07.

### 18. E4-long-text - Translated group names truncate with count badge and caret still visible (45-07, backstop)
expected: In German, a group name longer than the English truncates while the count badge and caret remain visible and the header never wraps to a second line.
result: blocked - narrow width not established. In de at the natural width the headers DIRECTX UND GRAFIK, SCHRIFTARTEN, MEDIEN UND CODECS, WINE-EINSTELLUNGEN, ALLES ANDERE each stayed on one line with badge and caret visible (burst6-140.png). Launch ordinal: 4.

Evidence: window capture in de. Launch ordinal: record. Backstop id E4-long-text, 45-07.

### 19. E5-long-text - A 60-character search query wraps inside the panel (45-07, backstop)
expected: Typing a 60-character query that matches nothing into Everything else shows the zero-result heading wrapping within the panel with no horizontal overflow at the narrow width.
result: blocked - narrow width not established and the operator's query was 34 characters, not 60; the de zero-result heading rendered on one line inside the panel with a Suche zurücksetzen button (burst6-140.png). Launch ordinal: 4.

Evidence: window capture, the query typed. Launch ordinal: record. Backstop id E5-long-text, 45-07.

### 20. E6-overflow - Row height and status slot hold with the widest content (45-07, backstop)
expected: At the narrow width with a failed row on screen (danger icon, Install failed and Retry), the row stays 56 px high, the status slot keeps its width, and the title and caption ellipsis with a native tooltip.
result: blocked - narrow width not established. A failed row (danger icon + Install failed + Retry) was on screen at the natural width in both themes with its status slot intact (burst2-light-016.png, burst3-125.png). Launch ordinals: 2, 3.

Evidence: window capture of the failed row from the fresh bad-containing run. Launch ordinal: record. Backstop id E6-overflow, 45-07.

### 21. E6-long-text - Title and family sentence each stay on one line (45-07, backstop)
expected: With the longest family sentence and a 95-character upstream title on screen, each stays on a single line inside the 56 px row with an ellipsis; blocked if no such title occurs.
result: blocked - no 95-character upstream title occurred and the narrow width was not established.

Evidence: window capture. Launch ordinal: record. Backstop id E6-long-text, 45-07.

### 22. E7-overflow - Everything-else rows truncate while the status slot keeps its width (45-07, backstop)
expected: At the narrow width, 44 px Everything-else rows truncate the title with an ellipsis and a native tooltip while the status slot keeps its fixed width.
result: blocked - narrow width not established.

Evidence: window capture. Launch ordinal: record. Backstop id E7-overflow, 45-07.

### 23. E7-long-text - A 95-character title plus category tag fits one 44 px line (45-07, backstop)
expected: While searching, a 95-character title plus its category tag fits one 44 px line with the ellipsis on the title and never on the tag; blocked if no such title occurs.
result: blocked - no 95-character title occurred and the narrow width was not established.

Evidence: window capture while searching. Launch ordinal: record. Backstop id E7-long-text, 45-07.

### 24. E8-overflow - In-flight bar text truncates before it pushes the controls (45-08, backstop)
expected: With the longest available title in flight at the narrow width, the bar text ends in an ellipsis and both Cancel remaining and Apply stay on the bar.
result: issue - at the natural width the bar did not truncate: with Show details open the dialog widened past the window and Cancel remaining was clipped to 'Cancel rem' (G1-launch1-shot3.png, launch 1). Narrow width not reached.

Evidence: window capture during a run. Launch ordinal: record. Backstop id E8-overflow, 45-08.

### 25. E8-long-text - The same bar truncation holds in de (45-08, backstop)
expected: In German with a run in flight, the bar text truncates with an ellipsis and Cancel remaining and Apply stay on the bar.
result: blocked - narrow width not established; in de at the natural width the bar read Installiere 1 von 2 · MS d3dx9_29.dll with Verbleibende abbrechen fully visible (burst6-119.png). Launch ordinal: 4.

Evidence: window capture during a run in de. Launch ordinal: record. Backstop id E8-long-text, 45-08.

### 26. E9-overflow - The log panel scrolls within 160 px and long lines wrap (45-08, backstop)
expected: With Show details open and a 200-character line present, the panel is 160 px high, scrolls vertically, long lines wrap, and no horizontal scrollbar appears; blocked if no such line occurs.
result: issue - long log lines did not wrap: Show details lines ran off the right edge and widened the Settings dialog beyond the window (G1-launch1-shot3.png, launch 1). The panel's CSS has white-space: pre-wrap and overflow-wrap: anywhere, so the width constraint is lost above the panel. Observed with a line far shorter than 200 characters.

Evidence: window capture of the open panel. Launch ordinal: record. Backstop id E9-overflow, 45-08.

### 27. E9-long-text - Same check as E9-overflow (45-08, backstop)
expected: The 45-08 plan states this row identically to E9-overflow; the observation is recorded again at the narrow width and in German, with the same pass bar (160 px, vertical scroll, wrapped lines, no horizontal scrollbar).
result: issue - same defect as item 26, observed at the natural width in en; the narrow + de arm was not reached.

Evidence: window capture at the narrow width in de. Launch ordinal: record. Backstop id E9-long-text, 45-08.
