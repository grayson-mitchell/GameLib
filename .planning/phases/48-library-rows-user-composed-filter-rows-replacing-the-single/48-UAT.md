---
status: testing
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
source: [48-04-SUMMARY.md, 48-05-SUMMARY.md, 48-06-SUMMARY.md, 48-07-SUMMARY.md, 48-VERIFICATION.md]
started: 2026-10-07T05:33:13Z
updated: 2026-10-07T05:45:00Z
---

## Current Test

number: 3
name: R7 migration legs A to D (leg A measured in Task 1; legs B, C, D owed to Task 2)
awaiting: Task 2 (operator at the desk)

## Protocol

gate_dir: /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/c52ae832-8616-4082-80cc-2ba456c6aac0/scratchpad/gate-48-08

`gate_dir` is a `mkdir -m 700` directory in this session's scratchpad. It holds the profile backup, the `profile-backup.sha256` file, screenshots, probe dumps, and the helper scripts (`gate-procs.sh`, `winlist.swift`, `p3-rearm.cjs`). It is never committed, because the evidence in it names real library titles and account state.

**Build used.** Task 1 (leg A): the dev shell, `pnpm tauri:dev` (the `GAMELIB_DEV_SECRET_VAULT=1` wrapper of `tauri:dev:run`), debug binary `src-tauri/target/debug/gamelib-shell`, HEAD `92c572a1da94148d9cd06a6c6849a9a3f779e381` on branch `quick-261002-b63`. That HEAD carries every 48-07 commit (the CR-01 fix is `d7d27c89b`). No source file was edited during the gate, so the dev shell did not rebuild between launches. Builds for later items are recorded against their evidence entries.

**Adopted bars (copied verbatim from 48-08-PLAN.md, `## Bars adopted`; stated so they are not mistaken for pre-existing contract).**

- No numeric contrast bar exists in `48-UI-SPEC.md` or `48-04-PLAN.md`, which say "legible over any artwork" and "a contrast claim, which needs pixel measurement". This plan adopts the WCAG 2.2 AA yardstick that `48-UI-SPEC.md`'s Color table already applies (`--danger` "3.55:1 ... under WCAG AA"): **>= 3:1 for the chevron glyph** (non-text UI, SC 1.4.11) and **>= 4.5:1 for divider-label text** (SC 1.4.3). A different bar needs the operator's say-so, recorded in `## Protocol`.
- "No layout hole" (item 1) is operationalised as: the gap where the deleted controls sat is within 2px of the modal inter-row gap in the same section.
- "Narrowest supported width" (item 6): no `minWidth` is declared (`git grep -n minWidth -- src-tauri` returned nothing at plan time, 2026-10-07). Use the narrowest width the macOS window can actually be dragged to, read from CGWindowList bounds and recorded in px. Also run at 1280px.
- **Item 4 sampling rule (C1-C4).** The rule is fixed before anything is measured, so that two runs measure the same pixels. The chevron's scrim is semi-transparent (UI-SPEC §Forward / back controls), so the ratio depends on the art behind it.
  - **C1, strip and window:** the window content is 1280px wide (CGWindowList bounds). The pick is the row the as-found profile hydrates to (Recently played). If that strip does not overflow at 1280px (`scrollWidth > clientWidth` is false), use the first FOCUS ROW panel entry, in panel order, whose strip does. Record the pick.
  - **C2, reference cards:** in the as-found theme, capture every card of that strip (at most 20, D-04) once, while the card lies fully inside the track and under neither control. Crop the card's art `img` rect from the capture (CSS px to capture px via the 43-LIVE-GATE known-scale recipe), and compute the crop's mean WCAG relative luminance with the scratchpad luminance script. The card with the highest mean is BRIGHT and the card with the lowest is DARK; a tie goes to the lower DOM index. Record runner:appName, DOM index and mean luminance for both in the evidence log. The ranking is taken once and the same two cards serve every theme. That fixed pair is what makes the themes comparable.
  - **C3, placement:** for the back control, set the track's `scrollLeft` from the devtools console so the reference card's left edge meets the track's visible left edge. For the forward control, set it so the card's right edge meets the visible right edge. Both controls must be enabled (no `disabled`) in that position. If the `scrollLeft` needed is clamped (the card is in the first or last visible page), or it leaves the control `disabled`, substitute the next card in the luminance rank (next-brightest or next-darkest) that can be placed. Log the substitution with both IDs.
  - **C4, pixels and ratio:** the glyph colour is the icon's computed `color`. Cross-check it against the modal pixel inside the icon's rect; the two must agree within 2 per sRGB channel, and both values are logged. The scrim pixels are every pixel inside the 36px circle that sits at least 2px in from the circle's edge and outside the icon's rect. The recorded ratio is the MINIMUM WCAG ratio between the glyph colour and any of those scrim pixels. Pass is a minimum >= 3:1 for every combination of 2 edges, 2 cards and every offered theme.

**Safety guards P1 to P4.**

- **P1, one instance only.** Assert that the pid owning the measured window (CGWindowList `kCGWindowOwnerPID`) is the pid this gate launched, and that it is the frontmost process when captured. A launch can be absorbed by a cross-session orphan. The instance probe is `gate-procs.sh`: `pgrep -x gamelib-shell`, `pgrep -x GameLib`, and an anchored `/node .*build/main/sidecar\.js` match. The plan's looser `pgrep -fl 'GameLib|gamelib-shell|gamelib-sidecar'` also matches the command line of any shell that merely mentions those names (the orchestrator's monitor loop, `graphify-mcp`, a `log stream` filter), so it is not used as the zero-instance test. This is a declared deviation from the plan's wording, not from its intent.
- **P2, backup, taken first.** The gate run's first action after the precondition, before any read or launch. `mkdir -m 700 "$GATE_DIR/profile-backup"`, then `cp -p` of `~/Library/Application Support/GameLib/config.json` to `profile-backup/config.json` and `~/Library/Application Support/GameLib/store/config.json` to `profile-backup/store-config.json`. `profile-backup.sha256` holds the `shasum -a 256` lines of the two ORIGINAL absolute paths. Each copy was `cmp`ed against its original (exit 0 twice). P2 is taken once per gate and is replaced only by the operator-approved re-baseline in Task 2's precondition. `GameLib` and `gamelib` are one directory on this volume. P2 captured the CURRENT bytes, which already carried `focusRow` (see the Leg A entry for why).
- **P3, gate edits.** Every profile edit the GATE makes is a node script that changes only `settings.libraryTopSection`, `settings.focusRow`, `defaultSettings.libraryTopSection` and `defaultSettings.focusRow`, and only while no instance runs. In-app writes are not P3 edits and no script ever makes them: top-level `theme` in `store/config.json` from the in-app theme selector (items 4 and 7; written by `configStore.set('theme', ...)` at `src/frontend/state/GlobalState.tsx:564`); `settings.focusRow` from FOCUS ROW picks and clears (item 2, leg D, item 4's C1 pick); and `games.customCategories` from item 7's collection. P4 restores both files whole, so it reverts each of these, including the operator's as-found theme.
- **P4 (`P-RESTORE`), every exit path.** A named step that is safe to repeat. (a) Quit the instance this gate launched (Cmd-Q, or its recorded pid, never any other pid), then wait until `gate-procs.sh` prints nothing; an instance the gate did not launch is never touched, the gate halts and asks. (b) `cp -p` each backup copy over its original path. (c) `shasum -a 256 -c "$GATE_DIR/profile-backup.sha256"` must print `OK` for both files. (d) Append a `**P-RESTORE - <what it closes>**` evidence-log entry carrying the two `OK` lines. If (c) prints `FAILED`, repeat (b) and (c) once; if it still fails, halt the gate with the `FAILED` lines, launch nothing further, and leave the backup in place for a manual restore.
- **When P4 runs.** At the end of every R7 leg (A to D) and after item 2's final quit. At the end of every other app session; one session may serve several of items 1 and 4-7, but it ends in P4 before the next P3 edit or launch. On every stop, abort, failure or `issue` path, BEFORE the outcome is recorded and the task returns, including a leg A as-found mismatch, a launch or provenance failure, a P1 pid mismatch, the operator stopping, and a tool failing. As the last step of each task. The only launches not separated by P4 are the deliberate quit-then-relaunch pairs inside leg A, leg D and item 2, which measure persistence across a relaunch and end in P4 after their final quit.

**Per-item measurement methods.**

- Pixels: `screencapture -l <CGWindowID>` on the activated Space. `takeSnapshot` paints no scrollbars, so it is not used. The window id and bounds come from `winlist` (a compiled CGWindowList helper in `gate_dir`).
- Contrast: WCAG relative-luminance ratios computed from sampled sRGB pixels with a scratchpad script.
- Item 4's reference cards and pixels: the C1-C4 sampling rule above, verbatim.
- Geometry: DOM `getBoundingClientRect()` and `getComputedStyle()` probes from the dev build's devtools console. The dev shell opens devtools by itself (`open_devtools()` under `debug_assertions`), docked at the bottom of the window, which is why a dev-shell capture shows the console. Devtools does not exist in a release build, so every item that needs a DOM probe runs in the dev shell; item 2 is the one item the plan wants on a release build and is handled in Task 2.

## Tests

### 1. Settings -> General after the 48-06 deletions
expected: Settings -> General: neither removed control (`Library Top Section`, `Recent Games to Show`) renders, and the gap where they sat is within 2px of the modal inter-row gap.
result: pending

### 2. R1 persistence round trip with a collection pick
expected: R1: pick a collection in FOCUS ROW, quit, relaunch the built app: the same collection is the focus row and the strip header echoes it (D-12). Clear it, quit, relaunch: no strip, and the mirror `settings.focusRow` is `null`.
result: pending

### 3. R7 migration live gate, legs A to D
expected: Leg A (re-armed, not as-found), legacy `recently_played` and no `focusRow` key: Recently-played strip on the first launch (a one-time pop-in accepted), `settings.focusRow` written as `{ kind: 'view', value: 'recentlyPlayed' }`, and launch 2 shows the strip on first paint. Leg B, `favourites`: Favourites strip and `settings.focusRow = { kind: 'view', value: 'favourites' }`. Leg C, `disabled`: no strip and `focusRow: null` written. Leg D, clear after A, then relaunch: still no strip.
result: pending

### 4. Strip chevron contrast over real artwork, all offered themes
expected: Chevron contrast >= 3:1 at both edges, over the two C1-C4 reference cards (highest and lowest mean art luminance, IDs logged), in every offered theme; no overlap with the adjacent card corner or hover outline at 156px (D-01, D-05).
result: pending

### 5. Back and forward controls, true end of travel, controller focus
expected: The back control mounts once scrolled. The forward control is `disabled` at the end (`scrollLeft + clientWidth >= scrollWidth - 1`). Neither control renders when all cards fit. Controller focus past the last visible card leaves it fully inside the track (D-06, D-07).
result: pending

### 6. Narrowest window width and longest title
expected: At the narrowest draggable width and at 1280px, no title rect exceeds its card rect, and the longest title clips with no ellipsis or line-clamp (UI-SPEC E4 and E7). The strip stays one card tall with at most 20 cards (D-04).
result: pending

### 7. FOCUS ROW panel section
expected: FOCUS ROW is collapsed by default (D-08). A long collection name ellipsises with its full text in `title`. The divider labels read Views / Collections / Store / Runnability in that order, at >= 4.5:1 in every theme. No `gamelib:` text is visible.
result: pending

## Evidence log

Entries are bold paragraph lines. Times are UTC unless marked local; the machine's local clock is UTC+13.

**Precondition (Task 1, 2026-10-07T05:33Z).** `git log --oneline -20 | grep -c '48-07'` printed 9 (needs >= 1). Instance probe: no `gamelib-shell`, `GameLib` or sidecar process. The plan's looser `pgrep -fl` pattern printed four lines, none of them a GameLib instance: the executor's own shell, the orchestrator's monitor loop, two `graphify-mcp` processes and a `log stream` filter mentioning "GameLib". See P1 for why the anchored probe is used.

**P2 backup (taken first, 2026-10-07T05:33:13Z).** Copied with `cp -p`, `cmp` exit 0 for both. `shasum -a 256`: `config.json` 3140261ad7dbb3593f4178b0aea4541983338d8159288fd70c0b7f063f90f694 (3035 bytes, mtime 17:50 local); `store/config.json` 54a3460e337e9dc6e6839c8cf54e0df4d8ee19b70642a1b78a41e533d40eaf67 (4827 bytes, mtime 17:50 local). The `store/config.json` top-level `theme` in the backup is `zombie`; P4 restores it.

**As-found history of leg A's arm (operator ruling `re-arm`, 2026-10-07).** The as-found arm was consumed 2026-10-07 17:50:22 local by the operator's auto-relaunched dev instance (shell pid 1651, sidecar pid 1975), unmeasured; the profile was re-armed by a scripted P3 edit for this leg. No backup, capture or pid provenance exists for that incidental write, and no as-found reading is fabricated here. Read-only reads taken after P2 and before the P3 edit: `config.json` `defaultSettings.libraryTopSection` = `recently_played`, `defaultSettings.focusRow` = `{"kind":"view","value":"recentlyPlayed"}`; `store/config.json` `settings.libraryTopSection` = `recently_played`, `settings.focusRow` = `{"kind":"view","value":"recentlyPlayed"}`. So the plan's as-found precondition (no `focusRow` key in either file) did not hold, which is exactly what the ruling covers.

**Leg A (re-armed, not as-found), P3 edit.** `p3-rearm.cjs`, no instance running (probe empty). It deletes `focusRow` from `defaultSettings` in `config.json` and from `settings` in `store/config.json`, nothing else. Both files round-tripped through `JSON.stringify` byte-identically before the edit (indent 2 spaces and one tab), so the only diff is the key: `diff` against the backup shows `config.json` lines 17-20 removed (the four `focusRow` lines) and `store/config.json` the five `focusRow` lines plus the trailing comma on `maxRecentGames`. `libraryTopSection: "recently_played"` left in place in both. State at launch: legacy `recently_played`, no `focusRow` key, in both files.

**Leg A (re-armed, not as-found), launch 1.** `pnpm tauri:dev` at 05:33:51Z. Launched pids: shell 9085, sidecar 9141. P1: CGWindowList reports one window, id 58156, owner pid 9085 (`gamelib-shell`), 1280x800 at (116,65); `osascript` frontmost pid after activation was 9085. Provenance: sidecar 9141 has `HOME=/Users/graysonmitchell` and holds `~/Library/Application Support/gamelib/legendaryConfig/legendary/installed.json` open (the `gamelib` spelling of the same directory as the backed-up `GameLib/config.json`; one inode, two spellings). `config.json` is not held open between writes, so the open-file check proves the directory, and the mtime proves the files: `store/config.json` mtime moved to 18:34:00 local during this launch. Capture `legA-launch1.png` (2560x1600, so SCALE 2.0): the Library shows a header `Recently played` with a strip of cards (Bastion, Endless Sky, Humankind, Amnesia, Hero of the Kingdom, Phoenix); the forward control is visible at the right edge. No `gamelib:`-prefixed text visible. Disk read after launch 1: `store/config.json` `settings.focusRow` = `{"kind":"view","value":"recentlyPlayed"}`, `libraryTopSection` = `recently_played`; `config.json` `defaultSettings.focusRow` = the same. Verdict for launch 1: the hydration wrote `focusRow` on the first launch from a profile with the key absent (the CR-01 case), and the strip rendered. Not measured: whether the strip popped in after an initial empty frame (one capture, taken about 2 minutes after window creation; the 48-07 SUMMARY accepts a one-time pop-in).

**Leg A byte-identity finding.** After launch 1 the two files hash to 3140261a... (`config.json`) and 54a3460e... (`store/config.json`), identical to the P2 backup. So the app's first-launch write reproduced, byte for byte, the file contents the operator's 17:50 instance had left. That is consistent with the earlier unmeasured consumption having been the same hydration, and it means the P3 edit's only residue was the single key.

**Leg A (re-armed, not as-found), launch 2.** Quit launch 1 with Cmd-Q on pid 9085; probe empty. No P4 between the launches. Relaunch at 05:37:06Z: shell 10408, sidecar 10452. P1: one window, id 58188, owner pid 10408, 1280x800; frontmost pid 10408. `settings.focusRow` already on disk when the app started. Capture `legA-launch2.png`: `Recently played` header and the same strip. The two PNGs are byte-identical (`cmp` exit 0, 2109833 bytes). Caveat on "first paint": this capture was taken about 20 seconds after the launch command, so it proves the strip is present once the Library has loaded, not that it was present on the first painted frame. A first-paint claim needs a capture loop started at window creation; that is owed to Task 2 (leg D's relaunch can carry it).

**P-RESTORE - closes Task 1 leg A (re-armed, not as-found).** Quit launch 2 with Cmd-Q on pid 10408; `gate-procs.sh` printed nothing. Pre-restore `shasum` of both files already matched the backup. Then `cp -p` of both backup copies over the originals, and `shasum -a 256 -c "$GATE_DIR/profile-backup.sha256"`:
`/Users/graysonmitchell/Library/Application Support/GameLib/config.json: OK`
`/Users/graysonmitchell/Library/Application Support/GameLib/store/config.json: OK`

**Leg B (favourites), P3 edit and launch.** Started from the restored profile (`shasum -c` OK, no instance). `p3-set.cjs favourites` set `libraryTopSection` to `favourites` and deleted `focusRow` in `config.json` `defaultSettings` and `store/config.json` `settings`; the `diff` against the backup shows only those lines. Launch at 05:39:46Z: shell 11651, sidecar 11693, one window id 58215 owned by pid 11651, frontmost pid 11651, `gamelib-shell` count 1. Captures at window-appear (`legB-t0.png`), +10s and +30s. The t0 capture shows the `Loading` screen with no Library yet; t10 and t30 show the Library with a `Favourites` header and a one-card strip (Alan Wake) above the grid, with no `gamelib:`-prefixed text. Disk read after the launch: `store/config.json` `settings.focusRow` = `{"kind":"view","value":"favourites"}` and `config.json` `defaultSettings.focusRow` = the same. Leg B observed outcome: Favourites strip on first launch, `focusRow = { kind: 'view', value: 'favourites' }` written, as expected. The strip has one card, so it does not overflow; that is the real library, not a defect.

**P-RESTORE - closes leg B.** Cmd-Q on pid 11651, probe empty, backup copies `cp -p` over the originals, then `shasum -a 256 -c`:
`/Users/graysonmitchell/Library/Application Support/GameLib/config.json: OK`
`/Users/graysonmitchell/Library/Application Support/GameLib/store/config.json: OK`

**Leg C (disabled), P3 edit and launch.** `p3-set.cjs disabled` (same two files, same keys). Launch at 05:40:45Z: shell 12320, sidecar 12373, one window id 58247 owned by pid 12320, frontmost pid 12320, count 1. Captures t0, t10, t30 (`legC-*.png`). At t30 the Library shows the card grid starting directly under the tab bar: no header, no strip. Disk read after the launch: both files carry `libraryTopSection: "disabled"` and `focusRow: null` (the key present with value `null`, not absent). Leg C observed outcome: no strip, `focusRow: null` written, as expected.

**P-RESTORE - closes leg C.** Cmd-Q on pid 12320, probe empty; the files had diverged from the backup (the app's `focusRow: null` write), then `cp -p` of both backup copies and `shasum -a 256 -c`:
`/Users/graysonmitchell/Library/Application Support/GameLib/config.json: OK`
`/Users/graysonmitchell/Library/Application Support/GameLib/store/config.json: OK`

**Task 2 progress at the checkpoint.** Done: item 3 legs B and C (above), each ended in P4. Not yet run: item 3 leg D, which needs the operator to clear the focus row in the FOCUS ROW panel; item 2, which needs a collection pick and a quit and relaunch; and items 1 and 4 to 7, which need the devtools-console probes, the theme selector, a physical controller (item 5) and window dragging (item 6). Item 3's `result:` stays `pending` until leg D runs.

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

Task 1 (tracer) proved the rig end to end on leg A (re-armed, not as-found): backup, scripted re-arm, launch, window-pid and provenance checks, capture, disk read, relaunch, restore. Legs B and C of item 3 then ran with the same rig and each ended in P4. Item 3's `result:` stays `pending` until leg D runs in Task 2, together with items 1, 2 and 4 to 7.

## Gaps

None recorded yet. An `issue` result appends a YAML entry here, with `reported:` and `severity:`.
