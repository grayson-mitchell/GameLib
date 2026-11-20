---
phase: quick-260911-qds
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [REQ-43-19]
files_modified:
  - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md
  - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-11-evidence/
  - .planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md
  - .planning/todos/pending/2026-09-11-humble-key-row-separator-is-invisible-in-light-themes.md
  - .planning/todos/pending/2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md
  - .planning/todos/pending/2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md
  - .planning/todos/completed/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md
  - .planning/todos/completed/2026-09-11-humble-key-row-separator-is-invisible-in-light-themes.md
  - .planning/STATE.md

must_haves:
  truths:
    - "43-LIVE-GATE.md records TWO runs, and every scorecard row and narrative section states which run it belongs to."
    - "Items 2, 4 and 6 carry run-2 values AND their run-1 values, so the change is auditable without reading git history."
    - "The VERDICT line's numbers were counted from the post-edit table, not assumed from the run-1 delta."
    - "The document states plainly whether Phase 43 can close, and if not, names what still blocks it."
    - "Run-2 evidence survives /tmp deletion inside 43-11-evidence/, byte-identical to the session directory."
    - "No Humble redemption code lands anywhere in .planning/."
    - "The non-square-glyph finding survives the closure of the todo that currently carries it."
    - "STATE.md's prior stopped_at narrative is still present verbatim after the prepend."
  artifacts:
    - path: ".planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-11-evidence/measurements-rerun.md"
      provides: "The run-2 source of truth, preserved out of /tmp"
    - path: ".planning/todos/pending/2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md"
      provides: "The non-square + malformed GOG asset finding, re-homed before its current carrier closes"
      contains: "ready: code"
    - path: ".planning/todos/completed/2026-09-11-humble-key-row-separator-is-invisible-in-light-themes.md"
      provides: "Closed separator todo with its stated closure condition satisfied in one light and one dark theme"
  key_links:
    - from: "43-LIVE-GATE.md"
      to: "43-11-evidence/"
      via: "cited evidence paths in the run-2 build record"
      pattern: "43-11-evidence"
    - from: ".planning/todos/pending/2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md"
      to: "43-LIVE-GATE.md item 2"
      via: "second failure of the same .App text-align rule, now on the KEY column"
      pattern: "151\\.5"
---

<objective>
Transcribe the REQ-43-19 live-gate RE-RUN (session `20260911T062945Z`) into the phase record, close
the two todos it discharges, re-home the one finding that would otherwise be deleted by that
closure, and update the one todo that got worse.

Purpose: the run is already done. Every number exists in
`/tmp/gamelib-gate-20260911T062945Z/measurements-rerun.md`. `/tmp` does not survive a reboot and the
gate document cites those files, so the record is currently one `rm -rf` away from unverifiable.

Output: an updated `43-LIVE-GATE.md` recording two runs distinguishably, a preserved evidence
directory, two closed todos, one new todo, one updated todo, and a prepended `STATE.md` narrative.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@/tmp/gamelib-gate-20260911T062945Z/measurements-rerun.md
@.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md
@.planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md
@.planning/todos/pending/2026-09-11-humble-key-row-separator-is-invisible-in-light-themes.md
@.planning/todos/pending/2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md
</context>

<hard_rules>

**This is a RECORDS task.** Do NOT build, do NOT launch the app, do NOT re-measure, do NOT re-derive
any number. Every figure comes from `measurements-rerun.md` or from the run-provenance block in this
plan. If a figure you need is in neither, say so and stop — do not compute a plausible one.

**Do NOT use `gsd-sdk` to write `STATE.md` or `ROADMAP.md`.** The write-ban is standing: those calls
have repeatedly reverted frontmatter fields. Edit `STATE.md` directly.

**Do NOT run `graphify update .`** — it deletes `graphify-out/graph.html`, and this task changes no
code that the graph needs to track.

**Do NOT run `prettier --check`.** `.planning` is prettier-ignored at `.prettierignore:29` (verified
during planning). This plan touches nothing outside `.planning/`. If that changes, scope a prettier
run to the non-`.planning` file only.

**`git mv` + a large append in one commit defeats git's rename detection.** For each todo being
closed: commit the content edit FIRST, in `pending/`, then `git mv` ALONE in a second commit.

**Pre-verified facts — cite these, do not re-derive them:**
- `resolveKeyScenario`'s final statement is `return 'claim-and-gift'` at
  `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:277`. Confirmed during planning.
- `isGiftableSpare` is imported at `:19` and gates the `'gift-only'` branch at `:256`.
- `src/frontend/assets/gog-logo.svg` carries `class="gogIcon"` on the ROOT `<svg>` whose viewBox is
  `0 0 32 32` (square), and `viewBox="0 0 34 31"` + `preserveAspectRatio="xMidYMax meet"` on the
  inner `<symbol>`. The non-squareness comes from the SYMBOL, not the root. It also carries
  `className="cls-1"` on its path. Confirmed during planning by reading the asset.
- `.planning` is prettier-ignored (`.prettierignore:29`).

</hard_rules>

<run_provenance>

Everything below is given. Transcribe it; do not attempt to reproduce it.

- Session dir: `/tmp/gamelib-gate-20260911T062945Z`
- Evidence files: `capture-1-columns.png` (dark theme), `capture-2-top.png` (light, list top),
  `capture-3-gog.png` (light, Racine/GOG row), `measurements-rerun.md`, `p1-precondition.log`,
  `gamelib-launch-1.log`, `gamelib-launch-1.old.log`, `terminal.log`
- Build command, contract §3 verbatim, **exit 0**:
  `pnpm exec vite build && pnpm build:sidecar-sea && pnpm build:decompress-worker-dev && pnpm exec tauri build`
- HEAD `0d2ae9862`; carries `2c68c17fe` (gift gate) and `c690a117a` (divider fallback + scoped gogIcon)
- P1 satisfied — `pgrep` empty before launch, `p1-precondition.log`
- P2 release build, no `--debug`
- P3 `.app` recovered from the DMG; `bundle/macos/` confirmed emptied by tauri's own cleanup step
- P4 binary sha256 `1cd1e843f5e71d9bfcba70dbe22ee5d07a64aabcddec80d9b7eadde9c43e3f5a`, identical on
  both sides. Launch 1 showed exactly 1 instance
- P5 `Humble sync finished: gamekeys=34 fetched=6/6 frozen=28 ok=6 schema_error=0`
- Window CGWindowID 4428, 1280x800 pt, capture 2560x1600 px, scale 2.0000 exact
- DMG `GameLib_0.7.0_aarch64.dmg` (101,411,459 bytes)

The provenance says NOTHING about a post-quit `pgrep` or a closing inventory for run 2. Do not
invent either. See Task 2's instruction on how to record their absence.

</run_provenance>

<tasks>

<task type="auto">
  <name>Task 1: Preserve run-2 evidence and run the P11 redaction scan</name>
  <files>.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-11-evidence/</files>
  <action>
Create `43-11-evidence/` (verified free during planning — `43-10-evidence/` is taken, `43-11-` is not)
and copy in all eight run-2 evidence files from `/tmp/gamelib-gate-20260911T062945Z`:
`capture-1-columns.png`, `capture-2-top.png`, `capture-3-gog.png`, `measurements-rerun.md`,
`p1-precondition.log`, `gamelib-launch-1.log`, `gamelib-launch-1.old.log`, `terminal.log`.
Do NOT copy `GameLib.app/`.

Prove the copy is faithful with `shasum -a 256` on both sides and a diff of the two digest lists.
A copy that is merely "the same size" is not a proof.

Then run the **P11 redaction scan** over everything copied in. Humble redemption codes are
dash-separated alphanumeric groups. Use at least these two patterns over the text files:

  grep -nEI '[A-Za-z0-9]{4,7}-[A-Za-z0-9]{4,7}-[A-Za-z0-9]{4,7}' <evidence>/*.log <evidence>/*.md
  grep -nEI '[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}' <evidence>/*.log <evidence>/*.md

Report EVERY match and why each is benign — a scan whose output you do not enumerate is not a scan.
Expect UUID-shaped machine/session identifiers and hyphenated build strings; these are benign.
Anything that is actually key-shaped and account-bearing must be redacted in the copied file (and
the redaction noted), not left in place.

The three PNGs cannot be grepped. Justify them structurally instead: P10 forbids opening
`HumbleClaimWizard`, and `revealedKey` (`HumbleClaimWizard/index.tsx:91,244`) is the ONLY surface
that renders a code — the resting row list never does. Then confirm by eye, using the Read tool on
each PNG, that no wizard is open in any of the three captures, and record that you looked. Structural
argument plus visual confirmation; neither alone.

Note for the record (observation, NOT an action item here): run 1's `43-10-evidence/` contains only
logs and text — its `capture-*.png` files were never preserved, even though run 1's own deviation 1
says its measurements are "re-verifiable by anyone from `capture-*.png`". Run 2 does not repeat that.
  </action>
  <verify>
    <automated>test -d .planning/phases/43-*/43-11-evidence && ls .planning/phases/43-*/43-11-evidence | wc -l | grep -qx '       8' || ls .planning/phases/43-*/43-11-evidence</automated>
    <automated>cd /tmp/gamelib-gate-20260911T062945Z && shasum -a 256 capture-*.png *.log measurements-rerun.md | awk '{print $1}' | sort > /tmp/claude-501/src.sha; cd "$OLDPWD"/.planning/phases/43-*/43-11-evidence && shasum -a 256 * | awk '{print $1}' | sort > /tmp/claude-501/dst.sha; diff /tmp/claude-501/src.sha /tmp/claude-501/dst.sha && echo COPY-FAITHFUL</automated>
  </verify>
  <done>
Eight files present in `43-11-evidence/`, sha256 lists identical to the session directory, redaction
scan output enumerated match-by-match with a benign-or-redacted disposition for each, and all three
PNGs visually confirmed free of an open claim wizard.
  </done>
</task>

<task type="auto">
  <name>Task 2: Re-score 43-LIVE-GATE.md for run 2 and recount the verdict</name>
  <files>.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-LIVE-GATE.md</files>
  <action>
The document currently records ONE run. After this task it records TWO, and every row and section
must say which. Section line numbers from planning: `## Verdict` at 323, the item-3 note at 368,
`## Declared deviations from this document's own protocol` at 390, `## Contract defects found BY
this run` at 406.

**2a. Add a run column.** The scorecard table's columns are
`Item | Sub-check | Launch ordinal | Raw measurement | Threshold | Result`. Insert a new FIRST column
`Run`. Every existing data row gets `1`. New rows get `2`. Rename the section heading to make the
two-run structure obvious (e.g. `## Verdict — run 1 (20260911T043842Z) and run 2 (20260911T062945Z)`),
and retitle `## Contract defects found BY this run` to name run 1 explicitly, since a run-2 defect is
being appended below it.

**2b. Supersede, do not overwrite.** Three sub-checks change. For each, KEEP the run-1 row with its
run-1 raw measurement verbatim and change only its `Result` cell to
`SUPERSEDED by run 2 (was <prior result>)`. Then add a run-2 row carrying the new numbers. Using the
literal string `SUPERSEDED` puts those rows in their own census bucket so they cannot be
double-counted — that matters for step 2d.

| Sub-check | Run-1 result (now SUPERSEDED) | Run-2 row to add |
|---|---|---|
| Item 4, separator present between rows | **FAIL** (light theme only) | **PASS** — light `[237,239,244]` bg, peak seam `[209,210,215]`, max channel delta **29**; dark `[26,28,33]` bg, peak seam `[51,57,64]`, delta **31**; 7 separators per capture, each full-width at 107/107 sampled columns. Run 1: light delta **2** (FAIL), dark delta 11–19. |
| Item 6, icon colour, light theme | **FAIL** (GOG; Steam passes) | **PASS** — GOG glyph ink `[57,59,64]`, matching `--text-secondary` `#393b41` = `[57,59,65]` within ±1, and pixel-identical to both sampled Steam glyphs (`[57,59,64]`). Run 1: GOG `[33,36,43]` (= `--text-default`), FAIL. |
| Item 2, KEY width, shape: side-by-side pair | NOT ATTEMPTABLE | **FAIL** — see 2c. |

Also record run 4's predicted-value corroboration from `measurements-rerun.md`:
`color-mix(in srgb, currentColor 14%, transparent)` with `--text-default #20242c` over `[237,239,244]`
computes `[208,211,216]`; measured `[209,210,215]`. Agreement within ±1 proves the NEW declaration is
painting, not the old white fallback. This is what makes item 4's PASS attributable to the fix rather
than to a theme change.

**2c. Item 2, scored the hard way.** The Claim+Gift pair now RENDERS (Asguaard row: `Activate` +
`Gift on Humble` side by side), so the sub-check is no longer NOT ATTEMPTABLE. The run-2 row's raw
measurement must state BOTH facts:
  - KEY-column CONTENT left edge is **934.0 CSS px** across all 7 sampled shapes (Hard West 2,
    Asguaard, Californium, Crusader Kings III, CryoFall, Darkest Dungeon, Dex), **spread 0.0**;
  - the `"Key"` HEADER label's left edge is **1085.5**, a **151.5 CSS px** divergence.

Result: **FAIL**, against the contract's literal metric (header label left edge vs content left edge).
**Do NOT re-score it against the friendlier content-to-content metric.** Changing the ruler after
seeing the result is exactly what run 1 refused to do when it scored item 3, and the record has to
stay consistent across the two runs. State that refusal in the row or the note, so a later reader
cannot mistake it for an oversight.

Extend the existing `### Note on item 3's two FAIL rows — the metric failed, the property did not` to
cover item 2 as well (retitle it to name both items). Include the arithmetic proving the divergence is
centring, not drift: the KEY column spans 934.0→1254.0, centre **1094.0**; a ~17 CSS px `"Key"` label
centred there starts at **1085.5**, which is what was measured. One inherited rule
(`.App { text-align: center }`, `src/frontend/App.css:24`), two columns, two runs.

**2d. Recount the verdict — do not assume a delta.** Add run-2 build-record rows for what the
provenance actually evidences, mirroring run 1's build-record row set: build command + exit status
(exit 0); `.app` recovered from DMG + binary sha256 `1cd1e843…3f5a` identical on both sides;
`pgrep` count before first launch (0, `p1-precondition.log`); `pgrep` count while running (1).
Run 1 also carried a post-quit `pgrep` row and a closing-inventory row; the run-2 provenance
evidences NEITHER, so record them as `NOT RECORDED (run 2)` rather than inventing a PASS or silently
omitting the rows.

Then COUNT the table as edited:

    awk '/^## Verdict/,/^### Note on item/' <doc> | grep '^| ' \
      | awk -F'|' '{print $(NF-1)}' | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn

Exclude the header row and every `SUPERSEDED …` bucket from the effective count. PASS + FAIL = scored;
everything else is unscored and must be itemised by disposition, as run 1's verdict line already does.

Cross-check only — the table wins if it disagrees: the pre-edit census was 25 data rows = 14 PASS /
4 FAIL / 4 NOT ATTEMPTABLE / 1 NOT OBSERVED / 1 INCONCLUSIVE / 1 NOT PERFORMED, which reproduces the
existing `14 PASS / 4 FAIL across 18 scored`. Two FAIL→PASS flips, one NOT ATTEMPTABLE→FAIL flip and
four run-2 build PASSes predict **20 PASS / 3 FAIL across 23 scored**, 6 unscored (3 NOT ATTEMPTABLE,
1 NOT OBSERVED, 1 INCONCLUSIVE, 1 NOT PERFORMED), plus 2 NOT RECORDED. **If your count differs, your
count is the answer** — report the discrepancy and say which row caused it. Do not bend the table to
match this paragraph.

**2e. State closure plainly.** Write whether Phase 43 can close. On the predicted numbers it cannot:
three FAIL rows remain — item 3 × 2 (GAME column) and item 2 × 1 (KEY column) — and all three are the
same inherited `.App { text-align: center }` rule, which is an open `ready: human` todo (a design
decision, not a defect with an obvious fix). Name that as the specific blocker. Do not declare a
clean pass unless the table genuinely supports one.

**2f. Append four run-2 deviations**, numbered 5–8 continuing from the existing four, under a
sub-heading that scopes them to run 2 (the existing 1–4 belong to run 1 and must stay scoped to it):

5. **P5's sync came from the app's automatic startup sync**, not the refresh control the contract
   names. The contract's acceptance test — the `Humble sync finished:` log line plus a non-empty
   list — is satisfied, and the intent (a real in-app sync rather than a CLI fake) is met.
6. **The contract's `osascript`/System Events call for window bounds is unusable** — this re-confirms
   run 1's contract defect 2. CoreGraphics `CGWindowListCopyWindowInfo` via JXA was used instead.
   Record this specifically: the JXA bridge requires `ObjC.castRefToObject(...)`; calling `.count`
   directly on the raw CFArrayRef returns `undefined`, which silently produces an EMPTY result set
   rather than an error. Three successive enumeration attempts reported "no windows" for *every
   application on the machine* before the cast was corrected. **A zero from that probe is not
   evidence of absence.**
7. **Captures were taken by window ID (`screencapture -l 4428`) and SUCCEEDED with the window on
   another Space** — directly contradicting run 1's recorded defect 4, which states that a window on
   an inactive Space has no readable backing store. Record the contradiction explicitly. Do NOT
   silently drop or overwrite run 1's finding, and do NOT assert which condition decides it: this run
   did not isolate that variable. Leave run 1's defect 4 text intact and add a pointer to this
   deviation beside it.
8. **Item 6's measurement used the in-app search box** to bring the Racine row on screen. Searching
   filters the existing list, it does not manufacture a shape, so this stays within P7.

**2g. Append the new contract defect** under a run-2-scoped sub-heading of the defects section:

**`claim-and-gift` is the fall-through default of `resolveKeyScenario`** —
`src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:277`, the function's final
statement. Any row not matching `pick` / `expired` / `settled` / `override-undo` / `override-pending`
/ `gift-only` / `login-and-claim` receives that label whether or not a claim button renders.

Proven live: the Alchemy VTT row (`generic` platform, UNREVEALED, not owned elsewhere) renders ONLY a
gift button yet classifies as `claim-and-gift`. It is not `gift-only` either, because that branch
requires `isGiftableSpare` (`ownedElsewhere && UNREVEALED`, gated at `:256`).

Consequence: **P6's shape inventory cannot test item 2.** The contract asks whether at least one row
"exhibits `claim-and-gift`" and uses the answer to decide whether the pair is measurable — but the
label is the default, so it reports present even when no pair exists anywhere. This is the same family
as the four already recorded: the Structural Reachability Review verified that the *subjects* of
measurement were reachable, never that a measurement *distinguishes* anything. Note that item 2 was
ultimately scored from direct pixel observation of the Asguaard row, **not** from the P6 tally.
  </action>
  <verify>
    <automated>D=$(ls .planning/phases/43-*/43-LIVE-GATE.md); awk '/^## Verdict/,/^### Note on item/' "$D" | grep '^| ' | awk -F'|' '{print $(NF-1)}' | sed 's/^ *//;s/ *$//' | sort | uniq -c | sort -rn</automated>
    <automated>D=$(ls .planning/phases/43-*/43-LIVE-GATE.md); for s in '33,36,43' 'delta \*\*2\*\*' '151.5' '934.0' '1085.5' '1094.0' '\[57,59,64\]' '\[209,210,215\]' '\[51,57,64\]' 'SUPERSEDED' 'castRefToObject' 'index.tsx:277' '43-11-evidence' '1cd1e843'; do printf '%-24s %s\n' "$s" "$(grep -c -- "$s" "$D")"; done</automated>
    <automated>D=$(ls .planning/phases/43-*/43-LIVE-GATE.md); grep -n 'VERDICT' "$D"</automated>
  </verify>
  <done>
Every probe in the second verify command returns a non-zero count (run-1 priors `33,36,43` and
`delta **2**` still present, run-2 values present, `SUPERSEDED` present). The census output is
enumerated in the summary, the VERDICT line's numbers equal that census with SUPERSEDED excluded,
and the document states in prose whether Phase 43 closes and what blocks it if not.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close two todos, file one, update one, prepend STATE.md</name>
  <files>.planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md, .planning/todos/pending/2026-09-11-humble-key-row-separator-is-invisible-in-light-themes.md, .planning/todos/pending/2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md, .planning/todos/pending/2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md, .planning/STATE.md</files>
  <action>
**Order matters: file the NEW todo (3c) BEFORE moving the fill todo (3a).** The fill todo is one of
only two carriers of the non-square-glyph finding and the other is already in `completed/`. Closing it
first, even briefly, leaves the finding homeless.

**3a. Close the store-logo `currentColor` todo** —
`.planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md`.
Set `status: RESOLVED`. Append a dated resolution section citing the measured numbers and the session
directory `/tmp/gamelib-gate-20260911T062945Z` → preserved at `43-11-evidence/`:
  - Item 6 light theme PASS. GOG glyph ink `[57,59,64]` vs `--text-secondary #393b41` = `[57,59,65]`,
    within ±1; pixel-identical to both sampled Steam glyphs.
  - This satisfies the closure condition the todo itself states ("re-measures GOG glyph pixel colour
    against `--text-secondary` in light theme … confirms it now matches within antialiasing
    tolerance, the same way Steam already does").
  - The scoped fix from quick `260911-p6s` (`.humbleKeyRowStoreLogo .gogIcon { fill: currentColor }`)
    is what closed it; `_colors.scss:101` and `GamePage/index.css:619` remain deliberately untouched.
  - **Record that the "reversed" / solid-block appearance is NOT a defect.** `gog-logo.svg` is a
    filled rounded square with "gog.com" knocked out; Steam's is a disc with its mark knocked out. The
    silhouettes differ, the ink is identical. Investigated and dismissed, so nobody re-opens it.
  - Point at the new todo from 3c for the geometry finding this todo is handing off.

**3b. Close the light-theme separator todo** —
`.planning/todos/pending/2026-09-11-humble-key-row-separator-is-invisible-in-light-themes.md`.
Set `status: RESOLVED`. Append a dated resolution citing:
  - Light `[237,239,244]` bg, seam `[209,210,215]`, delta **29** (was **2**). Dark `[26,28,33]` bg,
    seam `[51,57,64]`, delta **31** (was 11–19). Threshold ≥3/255. 7 separators per capture, each
    full-width at 107/107 sampled columns.
  - This is exactly the closure condition the todo states: ≥3/255 in at least one light AND one dark
    theme.
  - The `color-mix(in srgb, currentColor 14%, transparent)` predicted value `[208,211,216]` vs
    measured `[209,210,215]` confirms the NEW declaration is painting, not the old white fallback —
    so the PASS is attributable to the fix.
  - Session `/tmp/gamelib-gate-20260911T062945Z`, preserved at `43-11-evidence/`.

For BOTH: content edit committed in `pending/` first, then `git mv` to `.planning/todos/completed/`
ALONE in a second commit. Rename detection depends on it.

**3c. File the new todo** at
`.planning/todos/pending/2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md`.

This is VERIFIED NECESSARY: the finding currently lives only in the already-closed
`.planning/todos/completed/2026-09-08-humble-key-row-store-icon-geometry-unverified-live.md` and in
the fill todo being closed in 3a. Closing 3a without filing this deletes it.

Frontmatter per CLAUDE.md, bare lowercase exact values, `severity` → `platform` → `ready` in that
order and in those positions:

    severity: minor
    platform: any
    ready: code

Body must carry:
  - The measured geometry: GOG glyph bbox **19.0 × 17.5 CSS px** against a 19.2 box and Steam's
    **19.0 × 19.0**. Cause: the inner `<symbol>`'s `viewBox="0 0 34 31"` plus
    `preserveAspectRatio="xMidYMax meet"` → 19.2 × 31/34 = 17.5. Note that the ROOT `<svg>`'s viewBox
    is `0 0 32 32` and IS square — the non-squareness is the symbol's, which is the non-obvious part.
  - The other known malformations carried across: a `<symbol>` nested INSIDE the `<use>` element that
    references it; React's `className="cls-1"` instead of SVG's `class=` on its path (a static SVG
    file, not JSX). Both appear inert today; neither has been proven inert.
  - `files:` must name `src/frontend/assets/gog-logo.svg` (verified to exist during planning). Do not
    guess the path.
  - Provenance: measured at REQ-43-19 item 5, run 1; re-confirmed as carried/out-of-scope in run 2's
    `measurements-rerun.md`. Explicitly note it is a geometry finding, NOT the colour defect, which is
    closed.

**3d. UPDATE — do not close — the centre-alignment todo** at
`.planning/todos/pending/2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md`.
It stays `status: OPEN` and `ready: human`. Append that the same inherited
`.App { text-align: center }` rule (`src/frontend/App.css:24`) has now failed the gate's literal
metric a SECOND time — on the KEY column (item 2, divergence **151.5 CSS px**, run 2), having failed
on GAME (item 3, spread 216.5, run 1). **One rule, two columns, two runs.**

Include the arithmetic showing the divergence is centring and not drift: the KEY column spans
**934.0 → 1254.0**, centre **1094.0**; a ~17 CSS px `"Key"` label centred there starts at **1085.5**,
which is what was measured. Note that the column property itself PASSES at spread 0.0 across all 7
sampled shapes — so, as with GAME, the metric failed and the property did not, and the same
either-the-alignment-is-wrong-or-the-metric-is-wrong decision now governs two columns instead of one.
Do not decide it here; that is what `ready: human` means.

**3e. PREPEND `STATE.md`'s `stopped_at`.** The prior value is PRESERVED VERBATIM — a replace silently
truncates, which has already cost ~29.7k characters of narrative once in this repo.

`stopped_at` is a **single-line, single-quoted YAML scalar** (the field starts at `.planning/STATE.md:6`).
The frontmatter gate now REJECTS `|-` and `>-` block scalars, so it must stay single-line and
single-quoted. Every apostrophe in your new text must be doubled (`''`).

Implement as a splice, not a rewrite: insert the new narrative immediately after the opening `'` of
the value, leaving the entire existing value trailing behind it untouched. Do this with a script, not
by hand-retyping the line.

New narrative should cover: run 2 of the REQ-43-19 live gate (HEAD `0d2ae9862`, binary sha256
`1cd1e843…3f5a`, session `20260911T062945Z`, evidence preserved at `43-11-evidence/`); the two
FAIL→PASS flips with their numbers (separator delta 2→29 light / 31 dark; GOG glyph
`[33,36,43]`→`[57,59,64]`); item 2 becoming ATTEMPTABLE and being scored FAIL against the literal
metric rather than re-scored against the friendlier one; the recounted verdict exactly as Task 2's
census produced it; that **Phase 43 still does not close** and precisely what blocks it; the new
contract defect (`claim-and-gift` is the fall-through default, so P6 cannot test item 2); and the
JXA/`ObjC.castRefToObject` trap — a probe that returns zero for every application on the machine is
not evidence of absence.

Verification after the write, all three required:
  1. `grep -c "Completed 43-10 Tasks 2 and 3"` on STATE.md returns ≥1 — the prior value's opening text
     survives.
  2. Byte accounting: capture `awk 'NR==6' .planning/STATE.md | wc -c` BEFORE and AFTER. The delta must
     equal the length of the inserted string exactly. An approximate match is a failure.
  3. Quoting is balanced — `pnpm planning-gates` must stay 10/10, which is what parses this frontmatter.

**3f. Gates.** Run `pnpm planning-gates` and report the count (expect 10/10). No build, no app run, no
`prettier --check` (`.planning` is prettier-ignored). If the todo-frontmatter gate fails, fix the
TODO's frontmatter — never widen the gate's vocabulary to admit what failed.
  </action>
  <verify>
    <automated>pnpm planning-gates 2>&1 | tail -20</automated>
    <automated>ls .planning/todos/completed/ | grep -E 'store-logo-fill-currentcolor|separator-is-invisible'</automated>
    <automated>ls .planning/todos/pending/ | grep -qE 'store-logo-fill-currentcolor|separator-is-invisible' && echo 'ERROR: still in pending' || echo 'OK: moved out of pending'</automated>
    <automated>T=.planning/todos/pending/2026-09-11-gog-logo-svg-renders-non-square-and-is-malformed.md; test -f "$T" && sed -n '1,14p' "$T" | grep -nE '^(severity: minor|platform: any|ready: code)$'</automated>
    <automated>grep -c 'ready: human' .planning/todos/pending/2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md; grep -c '151.5' .planning/todos/pending/2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md; grep -c 'status: OPEN' .planning/todos/pending/2026-09-11-humble-keys-game-titles-are-centre-aligned-by-inherited-app-rule.md</automated>
    <automated>grep -c 'Completed 43-10 Tasks 2 and 3' .planning/STATE.md; awk 'NR==6' .planning/STATE.md | wc -c</automated>
    <human-check>
Read the final record before it is committed. Three things need a human eye, not a grep:
(a) the VERDICT line's numbers match the census output quoted in the summary, and the closure
statement names item 3 (GAME) and item 2 (KEY) as the specific blockers;
(b) run-2 deviation 7 contradicts run-1 defect 4 about off-Space captures — run 1's original text
must still be there, unedited, with neither run asserted to be the correct one;
(c) STATE.md's new `stopped_at` opening is followed by the prior narrative, intact.
If any of the three is wrong, fix it before committing rather than filing a follow-up todo.
    </human-check>
  </verify>
  <done>
`pnpm planning-gates` reports 10/10. Both closed todos appear in `completed/` and in neither case in
`pending/`. The new GOG-asset todo exists with `severity: minor` / `platform: any` / `ready: code`
adjacent and in that order, bare and lowercase. The centre-alignment todo is still `status: OPEN`,
still `ready: human`, and now contains `151.5`. `STATE.md` still contains the prior narrative's
opening text, the line-6 byte delta equals the inserted length exactly, and the frontmatter parses.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| live Humble session log/screenshot → committed `.planning/` | Run-2 evidence is captured from a real signed-in Humble session; anything copied in is published to the repo permanently |
| `/tmp` session dir → phase record | Source of truth lives outside version control and is cited by a committed document |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-43-01 | Information disclosure | `terminal.log`, `gamelib-launch-1*.log`, `capture-*.png` copied into `43-11-evidence/` | mitigate | Task 1's P11 scan: two dash-group regexes over all text evidence with every match enumerated and dispositioned; PNGs cleared structurally (`revealedKey` renders only inside `HumbleClaimWizard`, which P10 forbade opening) AND by reading each capture |
| T-43-02 | Tampering | `.planning/STATE.md` `stopped_at` | mitigate | Splice-insert after the opening quote, never a `replace`; verified by prior-text grep plus an exact line-6 byte-delta accounting, not by eyeballing |
| T-43-03 | Repudiation | `43-LIVE-GATE.md` run-1 findings | mitigate | Run-1 rows are marked `SUPERSEDED (was …)` and keep their raw measurements; run-1 defect 4 is left intact beside the contradicting run-2 deviation 7 |
| T-43-04 | Information disclosure | Git history | accept | No credential or token is handled by this task; the only sensitive class is redemption codes, covered by T-43-01 |
| T-43-SC | Tampering | npm/pip/cargo installs | n/a | No package is installed by this plan |
</threat_model>

<verification>

- `pnpm planning-gates` → 10/10.
- NO build, NO app run, NO re-measurement. If any instruction here seems to require one, that is a
  defect in this plan — report it rather than running a build.
- NO `prettier --check`: `.planning` is prettier-ignored (`.prettierignore:29`, verified in planning)
  and this plan touches nothing outside `.planning/`.
- Commits: plain `git` with explicit pathspecs. Do NOT use `gsd-sdk query commit` — it stages the
  entire tree and this branch has unrelated untracked work (`.claude/skills/archify/`,
  `skills-lock.json`) that must not be absorbed.
- Todo closures are two commits each: content edit in `pending/`, then `git mv` alone.

</verification>

<success_criteria>

1. `43-LIVE-GATE.md` distinguishes run 1 from run 2 on every scorecard row and in every narrative
   section, with run-1 values for items 2/4/6 still readable in the document itself.
2. The VERDICT line's numbers were produced by counting the post-edit table (census command output
   quoted in the summary), with `SUPERSEDED` rows excluded, and the document says plainly whether
   Phase 43 closes and what blocks it.
3. `43-11-evidence/` holds all eight run-2 files, sha256-identical to the session directory.
4. The P11 scan's every match is enumerated with a benign-or-redacted disposition; all three PNGs
   confirmed wizard-free.
5. Two todos in `completed/` at `status: RESOLVED`, each citing measured numbers and the session dir.
6. The non-square-glyph finding exists in `pending/` under correct triage frontmatter BEFORE the
   fill todo moves.
7. The centre-alignment todo is still OPEN at `ready: human`, now recording two columns across two
   runs with the 934.0/1254.0/1094.0/1085.5 arithmetic.
8. `STATE.md`'s prior `stopped_at` text is present verbatim and `pnpm planning-gates` is 10/10.

</success_criteria>

<output>
Create `.planning/quick/260911-qds-transcribe-the-req-43-19-live-gate-re-ru/260911-qds-SUMMARY.md` when done.

The summary MUST quote, verbatim: the post-edit verdict census output, the P11 scan's matches with
dispositions, and the `STATE.md` line-6 byte delta with the inserted-string length beside it.
</output>
