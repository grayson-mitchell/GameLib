---
status: pending
phase: 45
source: [45-06-SUMMARY.md, 45-07-SUMMARY.md, 45-08-SUMMARY.md, 45-11-SUMMARY.md, 45-LIVE-GATE.md]
started: 2026-10-10T19:15:38Z
updated: 2026-10-10T19:15:38Z
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
result: pending

Evidence: screen recording, winetricks-before-G1.log, gamelib-launch-N.log. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G1.

### 2. G2 - Navigation mid-run neither warns nor cancels (D-18)
expected: During the second verb of the G1 run, switching to the Wine tab, leaving Settings and opening the game page shows no dialog, the game page main button reads "Installing Winetricks Packages", and returning to the Winetricks tab shows the bar, row states and Show details log rebuilt while the run continues to 3 installed.
result: pending

Evidence: screen recording, gamelib-launch-N.log. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G2.

### 3. G3 - Cancel remaining finishes the in-flight verb and drops the rest (D-12)
expected: Pressing Cancel remaining during the first verb of a fresh three-verb run lets that verb reach Installed and appear in winetricks.log, while the other two never enter Installing, are not in winetricks.log and return to a selectable state; the bar ends with an installed count of 1 and no failed count.
result: pending

Evidence: screen recording, winetricks-before-G3.log and after-run diff. Launch ordinal: record, with the first verb's measured duration. Criteria: 45-LIVE-GATE.md G3.

### 4. G4 - One induced failure continues the queue (D-12)
expected: With real verb A, the upstream test verb bad and real verb B ticked and applied, A and B reach Installed, bad reads "Install failed" with a Retry button, the bar ends exactly "2 installed · 1 failed", B starts after bad fails, and nothing is red before bad fails.
result: pending

Evidence: screen recording, gamelib-launch-N.log, winetricks diff. Launch ordinal: record, plus the title actually shown for bad. Criteria: 45-LIVE-GATE.md G4.

### 5. G5 - gdiplus_winxp installs unattended under -q (D-17 live arm)
expected: Searching gdiplus under Everything else, ticking gdiplus_winxp and applying leads to Installed with no zenity or other prompt window at any time and a gdiplus_winxp entry in winetricks.log; if zenity is not installed the pass rests on the positive outcome alone, and an observed prompt or failure is recorded with its log lines for a script-derived hidden-set rule.
result: pending

Evidence: screen recording, command -v zenity output, gamelib-launch-N.log, winetricks diff. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G5.

### 6. G6 - GPTK environment banner is visible, calm and carries the version (D-16)
expected: On first opening the bottled game's Winetricks tab in a fresh launch the banner reads "Wine <version>, used by GameLib's macOS compatibility layer, is unsupported upstream. This is expected here and can be ignored.", the version matches the warning line in Show details and the bottle's wine --version, it is not red, has no dismiss control, and is still present after 60 seconds and after a run ends.
result: pending

Evidence: window capture, Show details capture, wine --version output. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G6.

### 7. G7 - Light and dark theme spot-check with measured contrast (D-21)
expected: In nord-light and midnightMirage, with each cell reached, every text element (Installed, Install failed, Retry, Installing phase word, Apply enabled and disabled, banner text, header hover and focus text) measures at least 4.5:1 and every non-text indicator (checked and unchecked checkbox, icons, focus ring) at least 3:1, with tool, capture file, foreground, background and ratio recorded; any unreached cell is named NOT REACHED.
result: pending

Evidence: window captures per theme, contrast tool output. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G7.

### 8. G8 - Tab visibility and the Tools card (D-03)
expected: The Winetricks tab is present on the ordinary bottled game (recorded first), absent on Game Defaults and absent on a CrossOver-bottle game, and that ordinary game's Wine tab Tools card shows only Winecfg and Run EXE with no Winetricks button; the CrossOver arm is blocked if no CrossOver game exists.
result: pending

Evidence: window captures of each Settings screen. Launch ordinal: record. Criteria: 45-LIVE-GATE.md G8.

### 9. G9 - Backstop visuals at the narrowest width and in de (aggregate of items 14-27)
expected: At a 500 CSS px Settings content width and in German, all fourteen backstop items (14-27) pass; if any fails or is blocked this item reads issue or blocked and names the ids.
result: pending

Evidence: window captures at the recorded width, in en and de. Launch ordinal: record, with window inner width and content width. Criteria: 45-LIVE-GATE.md G9.

### 10. D-15 - No curl-progress or fixme line is logged at ERROR for the gate session
expected: Across every archived gamelib-launch-N.log (and any .old), the count of lines that are ERROR level, tagged Winetricks, and curl progress is 0 and the count that contain fixme: is 0, with the total ERROR-tagged Winetricks lines and the err: count recorded, and Show details confirmed during the session to have contained Downloading meter and fixme: lines so the absence is observable.
result: pending

Evidence: the four grep counts from the contract's capture step 4, per archive. Launch ordinals: all. Criteria: 45-LIVE-GATE.md carry-forward "D-15 log count". Carried from 45-06 (the 846-line / 40 percent baseline is context only, not a bar).

### 11. Carry-forward - Duplicate log lines at a seed boundary (45-08)
expected: During the G2 remount, any log line that appears twice in Show details is counted and located; this is recorded and characterised as within one flush interval, and it is an issue only if it exceeds that window or repeats without a remount.
result: pending

Evidence: Show details capture before and after the remount. Launch ordinal: record. Carried from 45-08 Known, Accepted, Temporary State.

### 12. Carry-forward - Early lines between apply-accepted and run registration (45-08)
expected: Comparing the first lines in the live Show details after G1's Apply with the archived backend log for the same run, any missing early lines are recorded together with whether a remount recovers them; this known and accepted drop is characterised, not scored as a defect unless lines are missing from run.log too.
result: pending

Evidence: Show details capture, gamelib-launch-N.log. Launch ordinal: record. Carried from 45-08 Known, Accepted, Temporary State.

### 13. Carry-forward - Sticky bar holds inside .App .content (45-08)
expected: With the Everything else group expanded and scrolled, the bar stays docked at the bottom of the visible area at the narrow width and the normal width and in both themes, never scrolling away or overlapping the last row's status slot.
result: pending

Evidence: window captures. Launch ordinal: record. Carried from 45-08 and 45-11 Next Phase Readiness.

### 14. E2-error - An environment-report failure never reaches the tab (45-06, backstop)
expected: With the bottle opened normally the tab renders with no environment-related error text, dialog or red element and gamelib.log shows no unhandled exception for the environment report; if the optional induced arm (unreadable winetricks script, restored afterwards, run last) is performed, the tab still renders either the catalog or the empty state and the condition is logged, not shown; the result line says which arm was run.
result: pending

Evidence: window capture, gamelib-launch-N.log. Launch ordinal: record. Backstop id E2-error (backend half), 45-06.

### 15. E2-overflow - Missing-dependencies banner wraps and never truncates at the narrow width (45-08, backstop)
expected: With all five tools missing (launch PATH lacking cabextract, 7z, unzip, curl and zenity) at the 500 CSS px content width, the banner text wraps onto multiple lines with no ellipsis and no clipping; blocked if the five-missing condition cannot be established.
result: pending

Evidence: window capture, PATH used for the launch. Launch ordinal: record (separate launch). Backstop id E2-overflow, 45-08.

### 16. E2-long-text - Five-tool missing-dependencies string wraps in de without clipping (45-08, backstop)
expected: In German, with all five tools missing, the missing-dependencies string wraps inside the banner without clipping or truncation; blocked if the condition cannot be established or the string is an English fallback.
result: pending

Evidence: window capture. Launch ordinal: record (same launch as item 15). Backstop id E2-long-text, 45-08.

### 17. E3-long-text - Suggested rows ellipsis-truncate with a native tooltip (45-07, backstop)
expected: At the narrow width, long titles and publisher names in Suggested rows end in an ellipsis, a native title tooltip appears on the truncated element when hovered (tooltip text recorded), and the row stays one fixed 56 px height.
result: pending

Evidence: window capture, tooltip text. Launch ordinal: record. Backstop id E3-long-text, 45-07.

### 18. E4-long-text - Translated group names truncate with count badge and caret still visible (45-07, backstop)
expected: In German, a group name longer than the English truncates while the count badge and caret remain visible and the header never wraps to a second line.
result: pending

Evidence: window capture in de. Launch ordinal: record. Backstop id E4-long-text, 45-07.

### 19. E5-long-text - A 60-character search query wraps inside the panel (45-07, backstop)
expected: Typing a 60-character query that matches nothing into Everything else shows the zero-result heading wrapping within the panel with no horizontal overflow at the narrow width.
result: pending

Evidence: window capture, the query typed. Launch ordinal: record. Backstop id E5-long-text, 45-07.

### 20. E6-overflow - Row height and status slot hold with the widest content (45-07, backstop)
expected: At the narrow width with a failed row on screen (danger icon, Install failed and Retry), the row stays 56 px high, the status slot keeps its width, and the title and caption ellipsis with a native tooltip.
result: pending

Evidence: window capture of the failed row from the fresh bad-containing run. Launch ordinal: record. Backstop id E6-overflow, 45-07.

### 21. E6-long-text - Title and family sentence each stay on one line (45-07, backstop)
expected: With the longest family sentence and a 95-character upstream title on screen, each stays on a single line inside the 56 px row with an ellipsis; blocked if no such title occurs.
result: pending

Evidence: window capture. Launch ordinal: record. Backstop id E6-long-text, 45-07.

### 22. E7-overflow - Everything-else rows truncate while the status slot keeps its width (45-07, backstop)
expected: At the narrow width, 44 px Everything-else rows truncate the title with an ellipsis and a native tooltip while the status slot keeps its fixed width.
result: pending

Evidence: window capture. Launch ordinal: record. Backstop id E7-overflow, 45-07.

### 23. E7-long-text - A 95-character title plus category tag fits one 44 px line (45-07, backstop)
expected: While searching, a 95-character title plus its category tag fits one 44 px line with the ellipsis on the title and never on the tag; blocked if no such title occurs.
result: pending

Evidence: window capture while searching. Launch ordinal: record. Backstop id E7-long-text, 45-07.

### 24. E8-overflow - In-flight bar text truncates before it pushes the controls (45-08, backstop)
expected: With the longest available title in flight at the narrow width, the bar text ends in an ellipsis and both Cancel remaining and Apply stay on the bar.
result: pending

Evidence: window capture during a run. Launch ordinal: record. Backstop id E8-overflow, 45-08.

### 25. E8-long-text - The same bar truncation holds in de (45-08, backstop)
expected: In German with a run in flight, the bar text truncates with an ellipsis and Cancel remaining and Apply stay on the bar.
result: pending

Evidence: window capture during a run in de. Launch ordinal: record. Backstop id E8-long-text, 45-08.

### 26. E9-overflow - The log panel scrolls within 160 px and long lines wrap (45-08, backstop)
expected: With Show details open and a 200-character line present, the panel is 160 px high, scrolls vertically, long lines wrap, and no horizontal scrollbar appears; blocked if no such line occurs.
result: pending

Evidence: window capture of the open panel. Launch ordinal: record. Backstop id E9-overflow, 45-08.

### 27. E9-long-text - Same check as E9-overflow (45-08, backstop)
expected: The 45-08 plan states this row identically to E9-overflow; the observation is recorded again at the narrow width and in German, with the same pass bar (160 px, vertical scroll, wrapped lines, no horizontal scrollbar).
result: pending

Evidence: window capture at the narrow width in de. Launch ordinal: record. Backstop id E9-long-text, 45-08.
