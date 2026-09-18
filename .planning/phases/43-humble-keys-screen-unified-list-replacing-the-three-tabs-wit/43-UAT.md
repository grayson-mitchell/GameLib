---
status: complete
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
source:
  [
    43-01-SUMMARY.md,
    43-02-SUMMARY.md,
    43-03-SUMMARY.md,
    43-04-SUMMARY.md,
    43-05-SUMMARY.md,
    43-06-SUMMARY.md,
    43-07-SUMMARY.md,
    43-08-SUMMARY.md,
    43-09-SUMMARY.md,
    43-10-SUMMARY.md,
  ]
started: 2026-09-18T00:00:00Z
updated: 2026-09-18T14:11:08Z
---

<!--
SCOPE NOTE — read before interpreting a `pass` in this file.

This session deliberately does NOT re-ask the 28 geometry sub-checks already measured
PASS by `43-LIVE-GATE.md` across runs 1-3 (2026-09-11). Those carry pixel evidence;
re-eyeballing them here would replace a measurement with an impression.

This session covers what is NOT verified live anywhere:
  - the BEHAVIOUR of the unified list (search / sort / filter / empty states), which no
    live gate ever scored — the gate measured only resting geometry;
  - the three outstanding `ready: live-gate` items (tests 9, 10, 11), which need pixel
    measurement against a build carrying `7effab193`, not a user's visual judgement.

TWO SAFETY GUARDS INHERITED FROM `43-LIVE-GATE.md`, BINDING ON EVERY TEST BELOW:
  P10 — do NOT open `HumbleClaimWizard` (the "Claim"/"Activate"/"Finish activation"
        target). It can display a real, usable Humble redemption code. Every test below
        observes the resting row list. Button PRESENCE and LABEL are observable without
        clicking.
  P7  — do NOT click "Not the same game" or any ownership-override control to manufacture
        a test row. Those persist a permanent change to real Humble ownership data.
        If a shape is not already present from real prior use, the test is NOT ATTEMPTABLE.
-->

## Current Test

[testing complete -- 10 pass, 1 issue (test 8, see Gaps)]

## Tests

### 1. Cold start — Humble Keys screen loads populated
expected: Fresh launch, Humble Keys opens without an error state and lists your real keys (~34 rows). The old three tabs are gone.
result: pass

### 2. Unified list chrome is present
expected: One list, with — top to bottom — a title row carrying a search box, a controls row carrying a sort picker and a `Redeemable keys only` checkbox, a `TYPE` / `GAME` / `KEY` column-header row, then the rows.
result: pass

### 3. Search filters on title only
expected: Typing part of a game title narrows the list to matching rows. Typing a word that appears only in a key's junk gift/origin string (not in any title) matches nothing — search is title-only by design (D-43-10; 20 of 33 live keys carry polluted origin text).
result: pass

### 4. Sort picker
expected: Default sort is `Expiring soonest` (not `Most recent` — superseded by D-43-06). Switching to `Alphabetical` reorders the list A→Z by title.
result: pass

### 5. `Redeemable keys only` filter
expected: The checkbox is CHECKED by default (REQ-43-08 / D-43-09; `useState(true)` at `Humble/Keys/index.tsx:147`), so the list opens already narrowed to redeemable keys (`REDEEMABLE_ONLY_STATES` = `{UNPICKED, UNREVEALED}`). Unchecking it reveals the already-claimed/settled rows; re-checking narrows again.
result: pass
expectation_corrected: "This test was first authored as 'unchecked by default', derived from the ROADMAP goal prose's `Hide redeemed keys` checkbox rather than from REQ-43-08. The operator flagged it during the run. Code and requirement agree with each other and with the observed behaviour; the UAT expectation was the thing that was wrong, and no code change follows from this."

### 6. Empty and filtered-empty states
expected: A search string matching nothing shows a filtered-empty message with a `Clear filters` control; clicking it clears the search and restores the full list.
result: pass

### 7. KEY column shows per-row scenarios, not per-tab membership
expected: Different rows show different KEY-column content, driven by that row's own state — a waiting key shows `Claim`/`Activate` and `Gift a friend` side by side; a spare shows only the gift control; a confidently-owned key shows NO button; a fuzzy match shows `Not the same game` plus bold `Likely owned on Steam (…)`. OBSERVE ONLY — do not click any of these (P10/P7).
result: pass

### 8. `gog_keyless` row (Racine) claim path
expected: The Racine row shows exactly ONE button reading `Claim on Humble` — no `GOG` in the label, no external-link icon. Clicking it opens GameLib's own embedded store browser at the Humble keys page (not your system browser, and not a code-reveal wizard).
result: issue
reported: "oh that is broken, button is unresponsive, I thought clicking on button what I would be testing is auto update to gog library. we did failed test this few days back."
severity: major

### 9. `GAME` column header alignment after `7effab193` — MEASURED, not eyeballed
expected: The `GAME` header label's left edge sits within ±2 CSS px of the row titles' left edge. This is the one surviving `**FAIL**` in `43-LIVE-GATE.md` (header 335.5 vs titles 340.0–341.0, divergence 5.5). `quick-260912-d84` pinned the shared `column-gap` to `--space-md-fixed`, predicting a +4.89px correction — never re-measured. Needs a fresh release build (devtools is unreachable in release, so this is screenshot + known-scale measurement per the gate protocol).
result: pass
measured: |
  Build under test: HEAD `63e140d03`, `gamelib-shell` sha256 `8edbf95e…d382d` (DMG-recovered,
  hash-verified against `target/release/`). Fix confirmed present in `build/renderer` BEFORE
  measuring. Window 1280x800 pt at device origin (232,130), SCALE 2.0 exact (screen capture
  2940x1912; `System Events` reports the window at 116,65 / 1280x800 pt).

  `Game` header label left edge  **340.0 CSS px**
  six row titles                **340.0, 340.5, 341.0, 341.0, 340.0, 340.0 CSS px**
  header-vs-titles divergence   **max 1.0 CSS px**   threshold +/-2   -> PASS

  Run 3 measured 335.5 vs 340.0-341.0 = 5.5 divergence (FAIL). The header moved right by
  **4.5 CSS px**; `quick-260912-d84` predicted **4.89**. Direction and magnitude both confirm
  the pinned `column-gap: var(--space-md-fixed)` is what moved it.

  NOT an antialiasing artifact: re-scored at ink thresholds 28/60/100/140, the header reads
  340.0/340.0/340.5/340.5 and the titles 340.0-341.5 -- divergence stays <=1.5 at every
  threshold. (Same threshold-sweep discipline run 3 used.)

  TOOL VALIDATED BY NEGATIVE CONTROL, not trusted blind: the same pure-Python PNG reader and
  leftmost-ink scanner were first run against run 3's own committed evidence
  (`43-12-evidence/capture-2-top.png`) and reproduced run 3's published numbers exactly --
  header 335.5, titles 340.0/341.0/341.0/340.0/340.5/341.0. A tool that could not reproduce the
  old FAIL would not be trusted to certify the new PASS.

  Band identity confirmed visually, not assumed from geometry: the 340.0 band was cropped and
  read as the literal word "Game" sitting above "Asguaard" (`crop-game-header.png`).
evidence: /private/tmp/.../gate-run4-20260918T133700Z/ (run4-capture-1.png, crop-game-header.png, test9-threshold-stability.txt)

### 10. GOG logo squareness and colour — MEASURED, both themes
expected: Per the owning todo's OWN Surface-1 contract — NOT square. The GOG mark keeps its 34:31 brand aspect (~19.2 x 17.5 CSS px in a 19.2px box, ~0.85px gap above and below) and sits vertically centred beside the Steam mark rather than visibly lower; its ink matches `--text-secondary` in both a light and a dark theme, same as the Steam glyph. Owed by `2026-09-12-gog-logo-live-remeasure-humble-keys-and-gamepage-owed.md`, which also owes GamePage (surface 2) and the Login runner tile (surface 3).
result: pass
expectation_corrected: "First authored as 'renders square (19.0 x 19.0)', taken from run 3's incidental bbox note. The owning todo explicitly expects the OPPOSITE — 19.2 x 17.5, aspect preserved, because distorting a brand mark to square would be the defect, not the fix. Corrected before scoring, so the measurement below is scored against the real contract."
measured: |
  Two arms, same running instance (PID 10859, no relaunch -- P9 not triggered), window 1280x800 pt
  at device origin (232,130), SCALE 2.0.

  ASPECT (the todo's Surface-1 claim: 34:31 preserved, ~19.2 x 17.5 in a 19.2px box)
    light theme: GOG ink bbox **19.0 x 17.5 CSS** -- the predicted value, exactly.
    dark theme (midnightMirage): GOG ink bbox 19.0 x 18.0; the 0.5 delta is threshold direction
    (light ink on dark bg grows under a fixed ink threshold, dark ink on light shrinks).
    Steam for comparison: 19.0 x 19.0 (dark), 18.5 x 19.0 (light). PASS.

  COLOUR -- scored by three-way identity inside each capture, against an in-capture
  `--text-secondary` reference rather than a statically-guessed token value:
    dark : GOG glyph = Steam glyph = `Game` header label = **(181,235,251)**;
           titles (`--text-default`) = (210,242,252). Distinct, so the reference is not vacuous.
    light: GOG glyph = Steam glyph = `Game` header label = **(57,59,64) = #393b41**;
           titles = (33,36,43). #393b41 is the same `--text-secondary` value runs 1-3 recorded
           for the light theme.
    `.humbleKeysColumnHeader` is declared `color: var(--text-secondary)` (index.css:695), which is
    what makes it a valid in-capture reference for the same token the logo rule uses. PASS in
    BOTH themes -- the `fill: currentColor` escape holds for the GOG mark.

  CENTRING -- residual recorded, NOT rounded away:
    measured against each glyph's own row-top separator (separators located at device y 551/717/
    883/1049, pitch 166 dev = 83 CSS).
      light: Steam ink top 15.5 CSS below row top; GOG ink top 17.5. A perfectly centred GOG
             would sit 0.85 lower than Steam's, i.e. 16.35 -- so the mark is **~1.15 CSS px low**.
      dark : same computation gives **~0.65 CSS px low**.
    Direction is consistent across both themes. Inside the gate's standing +/-2 CSS px tolerance,
    so PASS, but it is NOT the symmetric "~0.85px above and ~0.85px below" the todo predicted
    (measured light: ~1.7 above / ~0.2 below).
    ASSUMPTION THIS RESTS ON, stated because it is the weak link: the 19.2px box top is INFERRED
    from Steam's ink filling its box. That is the same icon-BOX-vs-glyph-INK inference that made
    run 3 score item 5 INCONCLUSIVE rather than PASS. Treat the ~1px residual as indicative, not
    adjudicated.
    Qualitative check the todo actually asks for ("not visibly lower than the Steam mark"):
    satisfied -- side-by-side crop at identical offsets below each row top
    (`crop-icon-centring-light.png`) shows a ~1px difference, not the bottom-flush defect the fix
    targeted.

  NOT COVERED BY THIS RUN, and the owning todo stays open for it: the todo's Surface 2 (GamePage
  store-icon row) and Surface 3 (Login runner tile, where the prediction is "nothing changed at
  all"). Both are other screens; neither was visited. Do not read this PASS as closing that todo.
evidence: run4-capture-1.png (dark), run4-capture-3-light.png (light), crop-icons-steam-vs-gog.png, crop-icons-gog.png, crop-icon-centring-light.png

### 11. Title wrap, sort-label placement, owned-badge contrast — MEASURED
expected: The three CSS fixes from `d7a333320` / `a2c670f2a` hold live: long titles wrap inside the `GAME` track rather than overflowing, the sort label sits left of its select with breathing room around the controls row, and the owned badge clears the contrast threshold. Owed by `2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md` (`status: OPEN`, currently misfiled in `todos/completed/`).
result: pass
measured: |
  CORRECTION FIRST -- this test's expectation was wrong on 2 of 3 items, and the todo had already
  adjudicated all 3. Read before trusting the pass:
    - I wrote "long titles wrap inside the GAME track". The todo's item 1 is the opposite and a
      different element: the `Humble Keys` **h4 screen title** must render on ONE line and not
      yield to the SearchBar (`flex-shrink: 0`, `white-space: nowrap`).
    - I wrote "the sort label sits left of its select". That is correct NOW, but only because
      `260911-ue4` (`a2c670f2a`) deliberately FLIPPED it after the original fix shipped it on the
      right. The todo's original claim was RIGHT-of-select, measured PASS, then reversed on
      operator instruction.
    - All three items were already measured PASS on 2026-09-11 and written into the todo body.
      The file's `status: OPEN` frontmatter is STALE against its own body, which is why it reads
      as outstanding work in an index scan. That staleness is the finding here, not a defect.

  INDEPENDENT RE-MEASURE TAKEN ANYWAY (item 3, the only one with a numeric threshold):
    `Likely owned on Steam` badge, light theme, Valiant: Resurrection row --
      ink  **#425231**  bg **#eceff3**  -> **7.33 : 1**
    versus 7.34:1 measured on 2026-09-11 and 7.35:1 predicted, against a 4.5:1 AA floor. Pre-fix
    the raw `--status-success` token measured 1.46:1. Reproduced to within antialiasing on a
    different build, a different day and a different measuring tool. PASS.
  Items 1 and 2 re-confirmed from the same capture: `Humble Keys` renders on one line beside the
  search box, and `Sort` sits left of the select, vertically centred.

  RESIDUE THE TODO CARRIES THAT THIS RUN DID NOT TOUCH:
    - `260911-umj`'s 34px claim for **Settings, InstallModal and the Library header** is still the
      executing agent's own figure; only Humble Keys has ever been independently re-measured.
    - `SelectField/index.css:17`'s `box-shadow: 0px 4px 4px rgba(0,0,0,0.25)` still ships; the
      height shrank but the heavy drop shadow from the original "large and clunky" report did not.
      That is an open operator decision, not a defect.
evidence: run4-capture-3-light.png, crop-light-bottom.png, test11-badge-contrast-light.txt

## Summary

total: 11
passed: 10
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Clicking `Claim on Humble` on the `gog_keyless` (Racine) row opens GameLib's embedded store browser at https://www.humblebundle.com/home/keys"
  status: failed
  reason: "User reported: oh that is broken, button is unresponsive, I thought clicking on button what I would be testing is auto update to gog library. we did failed test this few days back."
  severity: major
  test: 8
  root_cause: |
    LEAD, NOT ADJUDICATED -- this is a static read, no live instrumentation was run.
    `openHumbleKeysEmbed()` (HumbleKeyRow/index.tsx:304-321) is a SECOND, ad-hoc
    `storeEmbedOpen` call site that bypasses `useStoreEmbedHost` entirely, and it does the
    exact two things that hook's own header comment forbids in writing:
      - it computes bounds from `document.querySelector('.App .content')` -- "a parent
        element's box" -- and falls back to `window.innerWidth/innerHeight`. The hook says:
        "There is no fallback rect anywhere in this file: ... computing a rect from
        `window.innerWidth/innerHeight`, a CSS custom property, or a parent element's box
        would be a second writer wearing a disguise" (useStoreEmbedHost.ts:17-22), and names
        itself "the ONE `storeEmbedSetBounds` call site in the entire renderer (T-40-08-03)".
      - it opens an embed with NO host route mounted and NO slot, so nothing afterwards sizes,
        shows, or scroll-syncs the webview it just created.
    Most likely presentations, both of which look identical to "unresponsive" from the chair:
    the embed opens offscreen/zero-or-tiny-sized (spike 024 has a captured instance of a
    squeezed 58px embed), or it opens behind the route that is still mounted.
  artifacts:
    - path: "src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:304-321"
      issue: "second storeEmbedOpen call site; bounds from a parent element's box plus a viewport fallback, both forbidden by useStoreEmbedHost's stated contract"
    - path: "src/frontend/screens/WebView/useStoreEmbedHost.ts:17-22,215-233"
      issue: "declares itself the single writer; the Humble Keys button is the second writer"
  missing:
    - "Route the gog_keyless claim through the Phase 40 host route (the same path the /store/* routes take) instead of calling storeEmbedOpen directly from a row"
    - "OR: give the call site a slot + host lifecycle of its own, and stop it fabricating bounds"
    - "Either way: the fire-and-forget `void` at HumbleKeyRow:320 must at minimum log its resolved {status,error} -- the sibling call site in useStoreEmbedHost DOES catch and log (logNavCallFailure), this one discards it"
  debug_session: ""
  silence_is_not_evidence: |
    The operator saw no log line, and I confirmed `gamelib.log` has nothing after 06:50:41.
    That is NOT evidence the click failed to fire, and must not be cited as such:
      - the `[WebView] store/wiki route ...` lines seen earlier come from the store ROUTE, which
        this button never enters -- so their absence is expected either way;
      - the sidecar's own failure path is `console.warn` (storeEmbedFlowRegistration.ts:313), and
        this repo has already recorded that the sidecar's console and logger are invisible;
      - the Rust arm's failure path is `eprintln!("[shell] ...")`, which goes to a stderr nobody
        is reading in a Finder-launched packaged .app.
    Settling this needs a `tauri:dev` run with devtools (unreachable in the release build this
    UAT used -- `debug_assertions`), instrumenting whether the handler fires at all and what
    `storeEmbedOpen` resolves to.
  note: |
    TWO SEPARATE THINGS IN ONE RESPONSE — do not let the second bury the first.
    (a) THE DEFECT: the button does not respond to a click. That is this gap.
    (b) AN EXPECTATION MISMATCH -- and the premise I first wrote here was WRONG.
        The operator expected the click to auto-add the game to their GOG library.
        I first recorded that plan 43-03 had "MEASURED that this is not available"
        and that auto-add "rests on a measured no". CORRECTED 2026-09-18, in the
        same session, after the operator stated they have NOT linked GOG in Humble:
          - 43-03 measured ONE thing: Humble's `/humbler/redeemkey` answered a
            single live `gog_keyless` entitlement (Racine) with `success=false`.
            The body parsed; it is a server POLICY denial, not a client fault.
          - 43-03's OWN residual unknown 3 names the account link as an unresolved
            alternative explanation, and says the link status "was never
            independently confirmed as the *cause* of the rejection".
          - The operator has now confirmed the link is ABSENT. Humble delivers a
            keyless GOG entitlement by GRANTING it to a LINKED GOG account -- with
            no link there is no grantee, which explains `success=false` without any
            policy against API-driven keyless redemption.
        So candidate A is NOT measured-dead. It was measured with a precondition
        UNSATISFIED. That is not proof it works either -- the server's 32-character
        reason is still unreadable behind the C5 redaction wall -- it means the
        experiment did not test what its verdict claims it tested.
        CONSEQUENCE, ACTIONED 2026-09-18 in this same session:
        `43-PROBE-D-43-11.md` now carries a superseding block under its
        "VERDICT and mapping used" heading restating candidate A as UNTESTED
        rather than rejected, and its residual unknown 3 records the operator's
        ABSENT answer. The original verdict text is preserved verbatim, not
        rewritten. Candidate B remains shipped; only its justification changed.
        RE-TEST COST -- CORRECTED 2026-09-18, same session: an earlier draft here
        said the Racine sample was "consumed and unrepeatable" and that a newly
        acquired entitlement was needed. FALSE -- repeated from 43-03's residual
        unknown 4 without checking it. Measured live: Racine is `UNREVEALED` in
        `humble_library.json` and has NO `revealedAt` record in
        `humble_revealed.json` (only a `__timestamp` bookkeeping entry). Quick task
        `260911-ftc` fixed the stranding defect the day after 43-03 filed it. The
        entitlement IS available. What is NOT available is the in-app path: 43-09
        rewired `gog_keyless` to the embedded browser, so re-running candidate A
        needs a probe harness against `revealKey()`, as 43-03 itself used.
