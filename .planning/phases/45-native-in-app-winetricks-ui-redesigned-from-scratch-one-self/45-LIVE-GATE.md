---
status: pending
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 45-12
build_sha: b18e5221924e19edf253f9d8b814f52ad17ccdea
build_type: packaged release (`pnpm tauri build --bundles app`) - TO BE BUILT ON THE OPERATOR'S macOS MACHINE from build_sha; not yet built
built_at: "[RECORD - not yet built]"
resigned_at: "[RECORD - only if the blank-render defect reproduces]"
operator: [NAME]
authored: 2026-10-11
started: "[RECORD - UTC stamp of GATE LAUNCH 1]"
---

# Phase 45 Live Gate - D-21 (native Winetricks Settings tab)

> **Nothing in this document may be filled in by an agent.** Every number here is an
> observation made by a human at a real pointer in a real WKWebView. Blank slots are
> blank because they have not been measured, not because they were forgotten. The
> contract below (criteria, order, capture standard) was authored by an agent before any
> launch and is frozen by the commit that adds it; the Results section and the `[RECORD]`
> slots are the operator's. The agent that transcribes results (plan 45-12 Task 3) copies
> the operator's resume message, and never infers, rounds, or back-fills.

Authoring record: written on a Windows machine that cannot build or launch the macOS bundle
(GPTK banner is darwin-only, a wine bottle and the operator's real `gamelib.log` are required).
No gate item has been attempted. Author and runner are different parties (standing rule D-E of
`live-gate-contract-authoring.md`).

## Build under test

| Field | Value |
|---|---|
| Commit (`build_sha`) | `b18e5221924e19edf253f9d8b814f52ad17ccdea` (short `b18e52219`) - HEAD at authoring, branch `quick-261002-b63`. The operator may build from a later commit instead, provided `build_sha` above is edited to that commit BEFORE the empty-diff check below is run and recorded. |
| Representative of HEAD? | **Unproven until the operator runs the check.** Immediately before building, on the Mac: `BUILD_SHA=b18e5221924e19edf253f9d8b814f52ad17ccdea; git diff --name-only "$BUILD_SHA" HEAD -- src src-tauri package.json vite.config.ts` must print nothing. Paste the (empty) output here: `[RECORD]` |
| Build type | packaged **release**: `pnpm tauri build --bundles app`. NOT `tauri dev` (the dev shell serves from Vite and has its own teardown behaviour). Scoring against a dev build or a build whose `src/` differs from `build_sha` is prohibited by the plan. |
| Build status | **NOT YET BUILT.** `src-tauri/target/release/bundle/macos/GameLib.app` does not exist for this commit. |
| Before building | Quit any running `tauri dev` / Vite (`pgrep -fl 'tauri|vite|gamelib-shell'` must be empty). A live dev instance relaunches on commits and can consume fixtures. |
| Blank-render re-sign recipe | Phase 44 measured that a bundle built WITHOUT `APPLE_SIGNING_IDENTITY` in the environment renders a blank white window (linker ad-hoc signature, no entitlements, `Sealed Resources=none`). Fix: build with `APPLE_SIGNING_IDENTITY` set; if the window is still blank, `ditto` the bundle to a scratch path and re-sign with hardened runtime + `entitlements.plist` (`flags=0x10000(runtime)`, `com.apple.security.cs.allow-jit`), then gate THAT copy and record its path. Source of the recipe and its measured before/after table: `44-LIVE-GATE.md` "Why this bundle was re-signed". The unsigned original is left unmodified as the negative control. A blank-render episode is a build artefact, NOT a finding against Phase 45. |
| Bundle verified | `[RECORD]` - `gamelib-shell` and SEA `gamelib-sidecar` present under `Contents/MacOS`; `codesign -dv` identifier/flags; bundle opens past a blank window (record WebContent RSS or a window capture with non-zero stddev) |
| Bundle path actually launched | `[RECORD]` |
| Game / bottle used (G1-G7, G9) | `[RECORD]` name, runner, wine version, `WINEPREFIX` path |
| CrossOver game (G8) | `[RECORD]` or `NONE AVAILABLE` (then G8's CrossOver arm is `blocked`, never `pass`) |

## Pre-registered criteria

Written before any launch. They are not edited after the first launch. If a criterion turns
out to be wrong, the item is scored on the criterion as written, a todo records the contract
defect, and the correction is a new dated section - never an edit here.

**Scoring words** (the only ones used in 45-UAT.md `result:`): `pass`, `issue`, `skipped`,
`blocked`. `blocked` = a precondition could not be established (named); `skipped` = the operator
declined; neither is ever converted to `pass`. An attempt invalidated for a reason the contract
names as "not scorable" is recorded as an attempt and repeated, not scored.

**Item order** (state-mutating items last-to-first by evidence need - see Test 5 below):
G8 -> G6 -> G1+G2 -> G4 -> G3 -> G5 -> G7 -> G9 -> shell-side D-15 count.

**Launch plan.** Default: ONE launch (ordinal 1) covers every item. A crash, a forced quit, a
blank window or any relaunch starts the next ordinal; items already scored in an earlier launch
are not re-scored unless the relaunch is itself the thing being tested. Every UAT result cites
the launch ordinal.

**Verb budget.** Installed rows render no checkbox (UI-SPEC "Installed"), so an already-installed
verb cannot be ticked and cannot demonstrate an install. The run needs, not-yet-installed on the
bottle (absent from its `winetricks.log` at the moment it is chosen): G1 three; G4 two real
verbs; G3 three (one is consumed, two are cancelled and stay available for reuse); G5
`gdiplus_winxp`; G7 four (two per theme run, the second of each pair may be a quick settings
verb such as a `fontsmooth=` or `vd=` entry). Minimum 9 distinct installable verbs plus `bad`.
Suggested, UNVERIFIED against the operator's bottle: G1 `corefonts` (measured ~93 s on a GPTK
prefix in 44), `xact`, `d3dx9`. The operator confirms each against the baseline log and records
substitutions.

### G1 - multi-verb Apply runs to completion with the tab mounted throughout (D-21, D-11)

PASS iff all hold on the packaged build: (a) three verbs absent from the baseline
`winetricks.log` are ticked and the bar reads `3 selected`; (b) after Apply, every row passes
Queued -> Installing (spinner plus phase word) -> Installed in order, with the bar reading
`Installing N of 3 - <title>`; (c) at each of the six verb start/finish transitions and at run
end, no row disappears, no region blanks, no group collapses or re-expands, and no row above or
below the transitioning row moves vertically (0 px at frame-step resolution of a screen
recording of at least 30 fps); (d) the bar ends `3 installed`; (e) the bottle's `winetricks.log`
afterwards contains all three verbs. FAIL (`issue`): any violation of (b)-(e). NOT SCORABLE
(repeat with a substitute verb): a verb fails with an upstream download error (curl non-zero,
404/connection error visible in Show details and in the archived log) - the attempt is recorded,
both attempts are listed, and G1 is scored on the repeat.
Negative control for the observation method, done BEFORE the run: on camera, expand then
collapse one group and show that frame-stepping resolves the change; a method that cannot see
that cannot be used to claim "no flicker".

### G2 - navigation mid-run neither warns nor cancels (D-18)

Performed during the second verb of G1's run. PASS iff: (a) switching to the Wine tab shows no
dialog, toast or confirmation, and the run is not cancelled; (b) leaving Settings and opening the
game's page shows the main button reading `Installing Winetricks Packages` while the run is in
flight; (c) returning to Settings -> the game -> Winetricks shows the in-flight run rebuilt:
the bar reads the correct `Installing N of 3`, finished verbs read Installed, the in-flight verb
shows its Installing state, queued verbs are Queued, and `Show details` holds non-empty log
text; (d) the run continues to `3 installed`. FAIL: a warning/confirm dialog, a cancelled or
restarted run, a lost row state, or an empty rebuilt log while the backend log shows output.

### G3 - Cancel remaining mid-run (D-12, UI-SPEC interaction 6)

A fresh three-verb run, the first verb being slow enough to click during (measured >= 30 s;
record the duration). `Cancel remaining` pressed while the first verb is Installing. PASS iff:
the in-flight verb finishes and reads Installed (and is in `winetricks.log`); the other two verbs
never enter Installing, are not in `winetricks.log`, and return to a selectable state; the bar
ends with an installed count of 1 and no failed count; the control was disabled-but-rendered, not
hidden, whenever it was observed disabled. FAIL: the in-flight verb is killed, a cancelled verb
starts, or either cancelled verb is recorded as Installed or Install failed.

### G4 - one induced failure continues the queue (D-12)

Tick real verb A, then `bad` (found by searching `Fake verb` or `bad` under Everything else),
then real verb B; Apply. PASS iff: A and B reach Installed; `bad` reads `Install failed` with a
`Retry` button; the bar ends exactly `2 installed - 1 failed` (the separator is a CSS middle
dot); B started after `bad` failed (the queue continued); nothing is styled red before `bad`
fails; Show details holds a red/error line for `bad` only. FAIL: queue stops at `bad`, a wrong
bar summary, no Retry, or red before a real error. Retry is NOT pressed until G7 and G9 have
captured the failed row (pressing it clears the row); an optional record-only observation of
Retry (re-runs `bad` alone, row leaves the failed state the instant it starts) is made last.

### G5 - `gdiplus_winxp` installs unattended under `-q` (D-17 live arm)

Search `gdiplus` under Everything else, tick `gdiplus_winxp`, Apply. PASS iff: the row reaches
Installed with no zenity (or any other) prompt window at any time, and `winetricks.log` gains
`gdiplus_winxp`. If `zenity` is NOT installed on the Mac (`command -v zenity`, recorded in
preflight), the absence of a zenity window proves nothing (Test 4) - the criterion is then the
positive outcome alone: Installed, a `winetricks.log` entry, and no `w_download_manual` /
manual-download text in Show details. FAIL (`issue`): a prompt appears, the install hangs, or it
fails; the observed log lines are recorded and a todo proposes adding the verb to the hidden set
through a script-derived rule - never a hand-added verb list (D-17).

### G6 - GPTK environment banner (D-16)

On opening the bottled game's Winetricks tab (before any Apply in this launch): PASS iff a
persistent banner is visible above the list with the copy "Wine <version>, used by GameLib's
macOS compatibility layer, is unsupported upstream. This is expected here and can be ignored.";
<version> equals the version in winetricks' own warning line visible in Show details and the
bottle's `wine --version` major.minor (record all three); it is not red (its colours are not the
Install-failed danger colours; sampled in G7); it has no dismiss control and is still present
after 60 s of the tab being open and after a run ends. FAIL: absent on a GPTK bottle, red,
version missing or wrong, dismissible, or gone. `blocked`: the bottle's wine is not the GPTK
7.7 build (record `wine --version`).

### G7 - light and dark theme spot-check (D-21)

Themes: `nord-light` (light, where Phase 44 measured the worst failures) and `midnightMirage`
(dark, comparable to 44) - the operator may name a different dark theme before the first
measurement. Elements, each measured in BOTH themes from a window capture, with foreground,
background, ratio and the capture file recorded: unchecked checkbox, checked checkbox, Queued
row, Installing phase word, Installed badge, Install failed badge, Retry, Apply enabled, Apply
disabled, banner text, group-header hover, group-header keyboard focus. PASS iff every text
element is >= 4.5:1 and every non-text indicator (checkbox border/fill, icons, focus ring) is
>= 3:1, and every cell was reached. Group-header hover FILL contrast is record-only (44
recorded 1.18:1 as perceptible); hover/focus TEXT is held to 4.5:1. A cell that could not be
reached is named as NOT REACHED and the item is `blocked`, not `pass`. Any text below 4.5:1 is
`issue` with the measured ratio. Method: pixel sampling of the glyph's extreme frequent colour
(anti-aliased means understate failures), WCAG relative luminance; name the tool. The operator
describes what they see BEFORE any number is taken; measurements may confirm or contradict, and
both are recorded. Reaching Queued/Installing/Install failed/Installed needs a run per theme:
verbs [slow, `bad`, quick] in each theme.

### G8 - visibility (D-03)

PASS iff all hold: the Winetricks tab is present on the ordinary bottled game (positive
control, recorded first); absent on Game Defaults; absent on a CrossOver-bottle game; on the
ordinary bottled game's Wine tab the Tools card shows exactly Winecfg and Run EXE and no
Winetricks button. `blocked` for the CrossOver arm if no CrossOver game exists.

### G9 - backstop visuals at the narrowest supported width and in `de`

Narrow arm: `tauri.conf.json` configures NO window minimum, so "narrowest supported" is
pre-registered as the Settings content area at 500 CSS px - the only floor the Settings screen
enforces (`GamesSettings/index.scss:36`, `section { min-width: 500px }`). The operator narrows
the window until the content area is 500 CSS px (or the OS stops them; record that width and use
it) and records window inner width and content width. `de` arm: switch the app language to
German; same width. G9 is scored per backstop id in 45-UAT.md items 14-27 and aggregates to: PASS
iff all fourteen pass; otherwise `issue` naming the failing ids. Backstop criteria:

| Id | Pass bar |
|---|---|
| E2-error | With the bottle opened normally, the tab renders and no environment-related error text, dialog or red element appears, and `gamelib.log` shows no unhandled exception for the environment report. Induced arm (optional, LAST, restored after): see Test 7 row. |
| E2-overflow | Banner text wraps to multiple lines and is never truncated, with all five tools missing (induced by running with a PATH lacking them) at the narrow width. `blocked` if the five-missing condition cannot be induced; record how far it got. |
| E2-long-text | The five-tool missing-dependencies string in `de` wraps inside the banner without clipping. Same induction and `blocked` rule. |
| E3-long-text | Suggested rows: long titles and publisher names ellipsis-truncate with a native `title` tooltip on the truncated element (hover and record the tooltip), at the narrow width. |
| E4-long-text | `de` group names truncate with the count badge and caret still visible and never wrap to a second header line. |
| E5-long-text | A 60-character query typed into Everything else wraps inside the panel and does not overflow horizontally. |
| E6-overflow | Row height stays fixed (56 px) and the status slot holds its width with the widest content (danger icon + `Install failed` + Retry) on screen at the narrow width; title and caption ellipsis with a tooltip. Needs a failed row on screen (Test 5). |
| E6-long-text | The title and the longest family sentence each stay on one line in the 56 px row with an ellipsis, with the longest family sentence and a 95-character upstream title. |
| E7-overflow | Everything-else rows (44 px) truncate the title with an ellipsis and a tooltip while the status slot keeps its fixed width, at the narrow width. |
| E7-long-text | While searching, a 95-character title plus its category tag fits one 44 px line with the ellipsis on the title and never on the tag. |
| E8-overflow | The in-flight bar text truncates with an ellipsis before it pushes `Cancel remaining` or Apply off the bar, with the longest title in flight at the narrow width. |
| E8-long-text | The same bar truncation holds in `de`. |
| E9-overflow | The log panel scrolls vertically within 160 px and long lines wrap with no horizontal scrollbar, with a 200-character line present. |
| E9-long-text | Same check as E9-overflow (the plan states them identically). |

If a 95-character upstream title or a 200-character log line does not occur naturally, the
operator records that the condition was not reached and the id is `blocked`; nothing is staged
inside the app bundle to manufacture it.

### Carry-forward observations (45-06/07/08 SUMMARY "Known, Accepted, Temporary State")

- **D-15 log count (45-06).** In the session's archived `gamelib-launch-N.log` files (including
  any `.old`), count lines matching `[ERROR]` and tagged `[Winetricks]` (the prefix text is
  `Winetricks`, `src/backend/logger/constants.ts:19`; match case-insensitively). Record: total,
  and how many are curl progress (meter header or meter rows) and how many contain `fixme:`;
  record `err:` separately as information. PASS iff the curl-progress count and the `fixme:`
  count are both 0. The roadmap's baseline (846 ERROR lines per session, 40 % noise) is not
  re-measurable on this build and is NOT a pass bar; it is quoted for context only. The
  absence is meaningful only if the session produced curl and fixme output (Test 4): record from
  Show details that Downloading meter lines and `fixme:` lines were seen during the session.
- **Duplicate log lines at a seed boundary (45-08).** During G2's remount, record whether any
  log line appears twice in Show details. Not a pass/fail bar: `pass` = observed and
  characterised (count, window), `issue` only if it exceeds a flush interval's worth of lines
  or repeats without a remount.
- **Lines between apply-accepted and run registration (45-08).** After G1's Apply, compare the
  first lines in the live Show details against the archived backend log for the same run; record
  any missing early lines and whether a remount (G2) recovers them. Known and accepted; recorded.
- **Dock sticky inside `.App .content` (45-08).** With the Everything-else group expanded and
  scrolled, the bar stays docked at the bottom of the visible area at both widths and in both
  themes. PASS iff it never scrolls away or overlaps the last row's status slot.

## Structural Reachability Review

Authoring-time review per `live-gate-contract-authoring.md` Section 2, all seven tests applied
to every item and precondition and to the capture instruction itself. Verdict key: **R**
reachable, **C** conditional (the condition is stated and is a preflight or in-run
confirmation), **I** impossible as first drafted (the contract was changed; the change is
stated), **-** test does not apply (stated why in the notes). The evidence column cites what was
read at authoring (Windows checkout of `build_sha`'s tree); nothing here was exercised live.

### Matrix

| Row | T1 origin | T2 concurrency | T3 emitter+sink | T4 absence | T5 interaction | T6 pre-state | T7 UI gesture | Notes |
|---|---|---|---|---|---|---|---|---|
| P0 packaged build, empty diff | - | - | - | R | R | C | - | N1 |
| P1 one instance, no dev shell | - | - | - | R | R | C | - | N2 |
| P2 ordinary bottled game, Wine tab shown | - | - | - | - | R | C | R | N3 |
| P3 CrossOver game | - | - | - | R | R | C | R | N3 |
| P4 verb budget + `winetricks.log` baseline | C | - | R | R | C | C | R | N4 |
| P5 zenity presence | - | - | - | C | R | C | - | N5 |
| P6 upstream download hosts | C | - | - | - | R | C | - | N6 |
| G1 multi-verb Apply | C | - | R | R | C | C | R | N4 N6 N7 |
| G2 navigation mid-run | - | C | R | R | R | R | R | N8 |
| G3 Cancel remaining | - | C | R | R | C | C | R | N9 |
| G4 induced failure `bad` | - | - | R | R | C | C | C | N10 |
| G5 `gdiplus_winxp` | C | - | R | C | R | C | R | N5 N6 |
| G6 GPTK banner | - | - | R | R | R | C | R | N11 |
| G7 theme spot-check | - | C | - | R | C | C | C | N12 |
| G8 visibility | - | - | - | R | R | C | R | N3 |
| G9 narrow + `de` | - | - | - | R | C | C | C | N13 |
| E2-error (backstop) | - | - | C | C | C | C | C | N14 |
| E2-overflow / E2-long-text | - | - | - | - | R | C | C | N15 |
| E3..E7 overflow and long-text (7 ids) | - | - | - | - | C | C | C | N13 N16 |
| E8-overflow / E8-long-text | - | - | - | - | R | C | R | N9 N13 |
| E9-overflow / E9-long-text | - | - | - | - | R | C | C | N13 N16 |
| D-15 log count | - | - | R | C | R | C | - | N17 |
| Carry-forward: dup lines, early lines, sticky dock | - | C | R | R | R | R | R | N8 N18 |
| Capture instruction (Section 3) | - | - | R | R | R | C | - | N19 |

### Evidence notes

- **N1 (P0).** `tauri.conf.json:2-5` productName `GameLib`, identifier `com.gamelib.shell`; the
  bundle does not yet exist for this commit. T6: an old `GameLib.app` from a previous phase can
  satisfy "a bundle exists". Confirm freshness: `strings` or `stat` the binary's mtime AFTER the
  build, and that the embedded renderer hash matches the new build (44 recorded `index-*.js`
  presence in the binary). The empty-diff command is in the Build table.
- **N2 (P1, F-34.4.2-15/-18).** Section 3 requires asserting zero pre-existing instances and
  recording the single PID. Command: `pgrep -x gamelib-shell` must print nothing before launch
  and exactly one PID after the window appears. Also `pgrep -fl 'tauri|vite'` empty.
- **N3 (P2, P3, G8; T6/T7).** The tab gate is `shouldShowWinetricksTab`
  (`WinetricksSettings/visibility.ts:7`) wired at `GamesSettings/index.tsx:109`, tab at `:175`,
  panel at `:227`. Absence on Game Defaults and on a CrossOver bottle is only informative if the
  tab is first seen present on the ordinary game (T4 positive control, recorded first). T6: a
  game with no `wineVersion` / runner set, or Windows, also hides the tab; the P2 preflight is
  "the Wine tab is visible for this game". A CrossOver game may not exist on the operator's Mac;
  then that arm is `blocked`, not `pass`, and the unit test `visibility.test.ts` is NOT
  evidence for it.
- **N4 (P4, G1; T3/T5/T6/T7).** The baseline source is `winetricks.log` in the prefix
  (`src/backend/tools/index.ts:969`, `join(winePrefix, 'winetricks.log')`), a plain file read.
  Copy it to the session dir before each item that installs (the per-item copy is the T5
  mitigation: G1's installs would otherwise make G4/G3 choose already-installed verbs). T7:
  UI-SPEC "Installed" renders no checkbox, so an installed verb cannot be ticked - the gesture
  is unperformable on a used verb, hence the budget in the criteria.
- **N5 (G5, P5; T4/T6).** Absence of a zenity window is only evidence if zenity exists to be
  shown. `command -v zenity` in preflight. D-16's missing-dependency list names zenity, so a
  missing-deps banner (`environmentBannerMissingDeps`) naming zenity is the in-app confirmation.
  The verb's `-q` behaviour is exactly what is under test; the D-17 derivation is
  `deriveNeedsGuiVerbs` (`src/common/winetricks/metadata.ts:96-115`) matching `w_download_manual`
  call lines only.
- **N6 (P6, G1, G5; T1).** Upstream verbs download from third-party hosts (Microsoft, archive
  mirrors) that can be dead or geo-blocked. A verb failing on a dead host is neither a product
  pass nor a product fail; the criteria therefore define NOT SCORABLE for G1 and record G5's
  observed failure with log lines. Preflight: network reachable from the Mac; `curl -sI` of
  nothing in particular is NOT used (no URL is known at authoring).
- **N7 (G1; T3).** Classifier routing at `src/backend/tools/index.ts:703-731`: `progress` lines are
  not logged anywhere, `noise` -> `logDebug`, `info` -> `logInfo`, `environment` -> `logWarning`,
  `error` -> `logError`, all with prefix `Winetricks` -> `gamelib.log` (sidecar sink). They never
  reach the tee'd terminal transcript (sidecar `logInfo` etc. are invisible there). Therefore
  every D-15 literal is demanded of the archived `gamelib-launch-N.log`, not `terminal.log`.
- **N8 (G2, carry-forward; T2/T7).** Concurrency: the only simultaneous actions are navigation
  and an in-flight backend run, both reachable (the Wine tab, the navbar and the game page
  are all outside the run). `winetricksQueue.ts:173` sends `status: 'winetricks'`;
  `MainButton.tsx:79-80` renders `label.winetricks` = "Installing Winetricks Packages"
  (`public/locales/en/gamepage.json:293`). T6: the `GamesSettings/index.tsx:124-129` guard
  returns to a valid tab if the Winetricks tab is hidden under the current render - fine for
  an ordinary game.
- **N9 (G3, E8; T2/T7).** `StickyBar/index.tsx:69,90` renders Cancel disabled-but-present
  between one verb's end and the next start; a click needs the in-flight window, hence a slow
  first verb (duration recorded). Not a concurrency impossibility (no modal).
- **N10 (G4; T7).** `bad` is visible: `isVisibleVerb` (`src/common/winetricks/visibility.ts`)
  hides only `apps`/`benchmarks` categories, ten launcher verbs and needs-GUI verbs, and its
  doc comment names `bad`/`good` as staying visible. The search text `Fake verb` is the
  upstream title as quoted by the plan and is UNVERIFIED here; searching `bad` finds it by verb
  id as well (the operator records the title actually shown). `Retry` is rendered by
  `Row/index.tsx:165` only for a failed row. Failed-row persistence across a later run is not
  proven: see N12, N13.
- **N11 (G6, D-16; T6).** The banner needs the backend environment store to hold an
  unsupported-wine entry for `runner:appName` (`winetricksEnvironment.ts:28-79`); it is fed by
  `recordUnsupportedWine` on the `environment` line (`tools/index.ts:718-724`) which the
  tab-open `list-all` run emits. The store is module-level, so it survives navigation within one
  sidecar life; G6 is therefore scored at first tab open of launch 1, before any Apply, so that
  a leftover entry from earlier cannot be mistaken for a fresh one (a relaunch resets it).
  GPTK-only: record `wine --version` for the bottle.
- **N12 (G7; T2/T5/T6/T7).** A theme switch lives outside the game's Settings screen; it
  unmounts the tab, which D-18 permits mid-run. States Queued/Installing/Install failed only
  exist during or after a run, so each theme needs its own run. T5: switching theme or starting
  a new run may clear a failed row (UI-SPEC: failed clears on retry start; whether a later run
  clears it is not stated) - that is why G7 uses a fresh `bad`-containing run in each theme and
  G9's E6 reuses the last of them. The theme names `nord-light` and `midnightMirage` are those
  used in 44 (`44-LIVE-GATE.md`).
- **N13 (G9, E3..E9; T5/T6/T7).** No Tauri window minimum is configured
  (`src-tauri/tauri.conf.json:12-21`: width 1280, height 800, resizable, no `minWidth`), so
  "narrowest supported" had no referent; it is defined above from `GamesSettings/index.scss:36`.
  T5: language change and window resize mutate presentation but do not touch the backend queue,
  so they do not destroy run evidence; theme/language order is G7 (en) before G9 (de) so that
  English captures are never taken after the switch. T6: a `de` catalogue may fall back to
  English for a key (49 locales were hand-filled in 45-i18n-fill); the operator records visible
  German text per element so an English fallback is not mistaken for a German pass.
- **N14 (E2-error; T3/T7).** The condition is "environment report cannot be computed (a `which`
  probe rejects, the script is unreadable)". There is no shipped control that induces it.
  The only live arm is a manual induction on the operator's machine (e.g. temporarily making
  the downloaded winetricks script unreadable: on macOS it is at
  `~/Library/Application Support/GameLib/tools/winetricks` per `src/backend/constants/paths.ts`
  `toolsPath = appFolder/tools` - the operator confirms the path with `ls`), restored
  afterwards, run LAST after every other item, and optional. Without it the id is scored on the
  non-induced arm only and the result line says so; the induced arm is never assumed.
- **N15 (E2-overflow/long-text; T7).** Five missing tools requires launching with a PATH that
  lacks `cabextract`, `7z`, `unzip`, `curl`, `zenity`; the shipped UI offers no control for that.
  `checkDependencies` raises the missing-deps record only on macOS (`tools/index.ts` around
  `:1044`). The induction is a launch-environment change (PATH), done in a separate launch with
  its own ordinal, and is `blocked` if it cannot be established; it does not share a launch
  with the items that need the dependencies (T5: it would make G1/G5 fail for the wrong reason).
- **N16 (E3..E7, E9; T6/T7).** A 95-character upstream title and a 200-character log line are
  properties of upstream data and wine output; they are used if they occur and the id is
  `blocked` if they do not (criteria). Nothing is edited inside the bundle to fabricate them.
- **N17 (D-15; T4/T5).** The ERROR-absence is falsifiable only if a regression would write an
  ERROR line: yes, `logError` is the `error`-kind branch (`tools/index.ts:726`) and a
  mis-routed curl/fixme line would carry `[ERROR]` and `[Winetricks]`. It also needs curl and
  fixme output to exist in the session - recorded from Show details. T5: the count is taken
  across ALL launches' archives, including the first-pass `.old` (log rotation renames the
  prior log on the next launch's first write, `log_writer.ts:72-74`).
- **N18 (carry-forward).** Duplicate/early-line observations need a remount during a run (G2)
  and Show details open; they ride on G1+G2 and add no extra state-changing step.
- **N19 (capture instruction).** Packaged `.app` launched from Finder has no terminal stdout, so
  the standard's `tee -a` transcript requires launching the inner binary
  (`GameLib.app/Contents/MacOS/gamelib-shell`) from a terminal. That differs from a Finder
  launch in env and cwd; if the bundle only renders when launched via `open`, record that and
  use `open` plus the `gamelib.log` archive as the only sink (the transcript then carries no
  `[shell]` lines and nothing in this contract demands one). `[shell]` lines are not scored by
  any item; the scored literals are all sidecar lines in `gamelib.log`.

### Pairing pass (Test 5)

Reduction applied: every state-mutating requirement against every evidence-bearing one, not the
full cross product. State-mutating (M = 9): G1 installs, G3 installs one / cancels two, G4
installs two and fails one, G5 installs one, G7 theme switches (x2) and two more runs, G9 window
resize, G9 language switch, any relaunch, Retry. Evidence-bearing (N = 8): G1 row-state
recording, G4 failed row on screen, G6 fresh banner, G7 captures, G9 captures (needs failed
row), baseline `winetricks.log`, `terminal.log`, `gamelib.log`. 72 pairs considered.

Flagged and resolved:
1. {G1 installs} x {later items' baseline `winetricks.log`}: per-item baseline copy plus the
   verb budget.
2. {G3 cancel} x {G3's own evidence}: in-flight verb must be slow; duration recorded.
3. {G4 failed row} x {G3, G5, G7 later runs, Retry}: a later run or Retry may clear the failed
   row; G7 and E6 therefore use a fresh `bad`-containing run, and Retry is pressed last.
4. {relaunch} x {`terminal.log`, `gamelib.log`}: `tee -a` plus per-launch archive before the
   next launch's first write (Section 3); relaunch x {G6 fresh banner}: banner scored at first
   tab open of launch 1.
5. {G7 theme switch} x {G9 English captures}: G7 (and every English capture) before the `de`
   switch.
6. {PATH-stripped launch for E2-overflow} x {G1/G5 dependency behaviour}: separate launch,
   last.
7. {induced unreadable script for E2-error} x {everything}: run last, restored, optional.
8. {bottle wine/GPTK state} x {G6}: G6 before any install.

Not flagged: window resize x run evidence; language switch x run evidence (frontend-only).

### Tally for this contract (T-34.4.2-42 clause)

Structural impossibilities found and corrected at authoring: 3 (no window minimum referent for
"narrowest supported"; CrossOver arm may have no fixture; zenity absence unobservable when
zenity is missing). Unresolved requirement interactions at authoring: 0 as written; N14 and
N15 are conditional inductions explicitly allowed to end `blocked`. Tests 6 and 7 have caught
nothing in a prior run; this is their second use.

## Evidence capture standard (Section 3, mandatory)

All commands run on the Mac. `GATE_BIN` is the inner binary of the bundle under test.

```bash
# 0. Preflight - ONCE, before the first launch
git rev-parse HEAD
BUILD_SHA=b18e5221924e19edf253f9d8b814f52ad17ccdea
git diff --name-only "$BUILD_SHA" HEAD -- src src-tauri package.json vite.config.ts
pgrep -fl 'tauri|vite|gamelib-shell'
command -v zenity cabextract 7z unzip curl
GATE_DIR=/tmp/gamelib-gate-45-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$GATE_DIR"
echo "$GATE_DIR"
cp "$HOME/Library/Logs/GameLib/gamelib.log.old" "$GATE_DIR/gamelib-pre-session.log.old"
cp "$WINEPREFIX/winetricks.log" "$GATE_DIR/winetricks-baseline.log"
```

```bash
# 1. EACH launch (N = 1, 2, ...) - delimiter, single-instance assertion, appended transcript
N=1
echo "=== GATE LAUNCH ${N} - $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee -a "$GATE_DIR/terminal.log"
pgrep -x gamelib-shell | tee -a "$GATE_DIR/terminal.log"    # must print NOTHING before launch
"$GATE_BIN" 2>&1 | tee -a "$GATE_DIR/terminal.log"          # tee -a, never bare tee, never >
# after the window appears, in a second terminal:
pgrep -x gamelib-shell | tee -a "$GATE_DIR/terminal.log"    # exactly ONE pid; else ABORT the launch
```

```bash
# 2. After EACH launch, BEFORE the next launch's first write rotates the log
cp "$HOME/Library/Logs/GameLib/gamelib.log" "$GATE_DIR/gamelib-launch-${N}.log"
cp "$HOME/Library/Logs/GameLib/gamelib.log.old" "$GATE_DIR/gamelib-launch-${N}.old" 2>/dev/null
pgrep -x gamelib-shell | tee -a "$GATE_DIR/terminal.log"    # teardown PID record
```

```bash
# 3. Before every installing item (G1, G3, G4, G5, G7 runs)
cp "$WINEPREFIX/winetricks.log" "$GATE_DIR/winetricks-before-<ITEM>.log"
# After it: diff to prove what the run added
diff "$GATE_DIR/winetricks-before-<ITEM>.log" "$WINEPREFIX/winetricks.log"
```

```bash
# 4. D-15 count (shell side, after the last launch), per archive
grep -ci '[[]ERROR[]].*[[]Winetricks[]]' "$GATE_DIR"/gamelib-launch-*.log
grep -i '[[]ERROR[]].*[[]Winetricks[]]' "$GATE_DIR"/gamelib-launch-*.log | grep -ci 'fixme:'
grep -i '[[]ERROR[]].*[[]Winetricks[]]' "$GATE_DIR"/gamelib-launch-*.log | grep -ciE 'Total|Dload|Xferd|--:--:--'
grep -i '[[]ERROR[]].*[[]Winetricks[]]' "$GATE_DIR"/gamelib-launch-*.log | grep -ci 'err:'
```

```bash
# 5. Closing inventory, while the evidence still exists
grep -n '^=== GATE LAUNCH' "$GATE_DIR/terminal.log"
ls -la "$GATE_DIR"/
wc -l "$GATE_DIR"/*
```

- The delimiter text is exactly `=== GATE LAUNCH <N> - <UTC ISO8601> ===` (grep with
  `grep -n '^=== GATE LAUNCH'`).
- Screen recordings and window captures (G1, G7, G9) are saved INTO `$GATE_DIR` and named with
  their item and launch ordinal.
- Captures stay in the scratch session dir (T-45-32). Only counts, ratios and redacted excerpts
  (home paths replaced with `~`) enter planning files.
- If the pgrep count is ever not 1, the launch is ABORTED and its evidence is not scorable.

## Evidence inventory

`[RECORD - closing ls -la and wc -l output of the session directory]`

## Results

Left blank deliberately. The operator's resume message (item observations and launch ordinals)
is transcribed into `45-UAT.md` `result:` lines by plan 45-12 Task 3; this section then records
the score per G-item and the final status.

| Item | Launch ordinal | Observation (operator) | Score |
|---|---|---|---|
| G1 | [RECORD] | [RECORD] | [RECORD] |
| G2 | [RECORD] | [RECORD] | [RECORD] |
| G3 | [RECORD] | [RECORD] | [RECORD] |
| G4 | [RECORD] | [RECORD] | [RECORD] |
| G5 | [RECORD] | [RECORD] | [RECORD] |
| G6 | [RECORD] | [RECORD] | [RECORD] |
| G7 | [RECORD] | [RECORD] | [RECORD] |
| G8 | [RECORD] | [RECORD] | [RECORD] |
| G9 | [RECORD] | [RECORD] | [RECORD] |
| D-15 count | [RECORD] | [RECORD] | [RECORD] |

**Overall status:** `pending` until Task 3 sets `passed` or `failed` in the frontmatter.
