---
phase: quick-261015-dlu
plan: 01
type: execute
wave: 1
depends_on: []
subsystem: webview/store-embed
tags:
  [
    store-embed,
    notice-row,
    css-grid,
    minmax,
    min-content,
    webkit,
    chromium,
    evidence,
    ui-spec,
    todos
  ]
requirements: [TODO-dlu-1, TODO-dlu-2, TODO-dlu-3]
autonomous: true
files_modified:
  # Certain — the fix and its pin
  - src/frontend/screens/WebView/index.css
  - src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
  # Certain — the evidence bundle (new directory, 15 files)
  - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/
  # Certain — the record this task closes
  - .planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md
  # CONDITIONAL — Task 3 reads it first and may leave it byte-unchanged (see Task 3)
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md

estimate:
  tokens: 22000
  raw_tokens: 22000
  tasks: 3
  confidence: low # sample_count=0, factor=1.0, applied=false (no calibration data on this machine; `gsd query estimate-calibration` is not reachable — the `gsd` on PATH is a different tool and `~/.claude/gsd-core/bin/gsd.cjs` does not exist)

must_haves:
  truths:
    - "`.WebView__embedContainer`'s single column has a zero floor, so the notice row's min-content can no longer inflate the track past the container's own content box (TODO-dlu-1)"
    - "One authoritative declaration carries the fix — the container-level one — so it covers every row in the grid (`StoreEmbedControls`, the timeout banner, `EpicLauncherBlockedNotice`), not only the banner; F2 and F3 are NOT also added (TODO-dlu-1)"
    - "A per-selector assertion goes red if that declaration is removed, and the red was OBSERVED before the CSS was written, not asserted afterwards (TODO-dlu-1)"
    - "`embedContainerGridRows.test.ts`, which parses this same container's track list, stays green — the new declaration does not disturb the row auto-placement pin (D-07/D-14)"
    - "The harness that measured this is in the repo with enough instructions to re-run it, and its README states its own limits — a static page, a transcribed MUI base, a hand-built DOM, not the running app (TODO-dlu-2)"
    - "The 261015-9qy Open observation no longer reads as an open hypothesis: it carries the measurement that refuted it and a pointer to the evidence, with its original text preserved (TODO-dlu-3)"
    - "The SUMMARY states plainly that nothing in this task was run in the real app, and that the 500px regime still clips once the message is exhausted"
  artifacts:
    - src/frontend/screens/WebView/index.css
    - src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/README.md
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/build-page.mjs
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/wkprobe.swift
    - .planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md
  key_links:
    - "`readSelectorBody` in `StoreEmbedTimeoutBanner.test.tsx` -> the `.WebView__embedContainer` rule body in `index.css` — the helper currently CANNOT reach that rule (measured; see Task 1), so this link has to be built before the new pin can exist"
    - "The comment written into `index.css` -> the exactly-once sabotage counts in the same test file — a comment that reproduces a counted declaration verbatim reds the suite (see Task 1's comment constraints)"
    - "The evidence README -> the status sentence Task 3 prepends to the todo's Open observation paragraph — the link is the only thing connecting the corrected record to the numbers behind it"
---

<objective>
Give `.WebView__embedContainer`'s implicit grid column a zero minimum, pin it, ship the harness
that measured it, and correct the record that still calls the cause an open hypothesis.

Purpose: quick task `261015-9qy` closed the store-embed clip todo by declaring a 900px minimum
window width, and left an explicitly **unmeasured** hypothesis behind — that `src/frontend/App.css`'s
`min-content 1fr` shell column was the real clip. The orchestrator has since MEASURED it in both
WebKit and Chromium against the shipped stylesheets. The App.css hypothesis is **refuted**. The
actual mechanism is one line lower down: `.WebView__embedContainer` declares `grid-template-rows`
but no `grid-template-columns`, so its single column is an implicit `auto` track whose minimum is
its items' min-content contribution — ~420px, set by the nowrap notice row. Below 420px of
available width the track overflows the container's own `width: 100%` box and the actions sit past
the window edge.

Output: one container-level declaration in `index.css` with a comment that records the mechanism
and the numbers; a per-selector pin with an observed-red arm; a 15-file evidence bundle under this
quick task's directory; a corrected Resolution in the closed todo; and a read-first determination
on UI-SPEC E3.

This task does NOT touch `App.css`, `NavShell`, or `tauri.conf.json`. The 900px floor stays. What
changes is how the row degrades BELOW that floor — which matters for any future floor change, and
for the 500px regime where the actions overflow again once the message has been squeezed to zero.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Read before editing:

@src/frontend/screens/WebView/index.css
@src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
@src/frontend/screens/WebView/__tests__/embedContainerGridRows.test.ts
@.planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md

Project skill — load before writing or editing any `verify` block, and before touching the
`*-UAT.md`-adjacent records in Task 3:

`Skill("gamelib-conventions")`

## The measurement — do NOT re-derive it

The orchestrator already ran the investigation. These numbers are the input to this plan, not
something for an executor to reproduce. They come from a harness over the SHIPPED stylesheets
(`App.css`, the `NavShell`/`NavTabs`/`NavItem`/`WindowControls` scss compiled by sass,
`WebView/index.css`, `index.scss`, `themes.scss`), unmodified, plus a transcription of MUI 5.17.1's
`Tabs`/`Tab` base rules, with a DOM mirroring `NavShell/index.tsx` (5 real tabs) and the tier-2
rail and `WebView/index.tsx`'s `.WebView.WebView__embedContainer` holding `StoreEmbedTimeoutBanner`'s
exact markup and English strings. Fonts loaded (`fontsReady: loaded`). Arms are injected `<style>`
overrides measured in the same page. WebKit via a compiled WKWebView probe, Chromium via
chrome-headless-shell.

Numbers below are the WebKit ones. Chromium agrees to within 0.07px at every width (measured:
container column `419.65625px` WebKit vs `419.594px` Chromium at 600 and at 500).

| viewport | `.App` grid columns | `.content` width | embed container column | notice row width | message width | actions right edge | actions clipped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 900 shipped | 256px 634px | 634 | 634px | 634 | 370.08 | 874 | no |
| 700 shipped | 256px 434px | 434 | 434px | 434 | 170 | 674 | no |
| 600 shipped | 256px 334px | 334 | **419.66px** | **419.66** | 155.73 | **659.66** | **yes** |
| 500 shipped | 256px 234px | 234 | **419.66px** | **419.66** | 155.73 | **659.66** | **yes** |
| 600 F1 | 256px 334px | 334 | 334px | 334 | 70.08 | 574 | no |
| 600 F2 | same | 334 | 334px | 334 | 70.08 | 574 | no |
| 600 F3 | same | 334 | 334px | 334 | 70.08 | 574 | no |
| 500 F1/F2/F3 | 256px 234px | 234 | 234px | 234 | 0 | 503.92 | yes |

The seven arm names, exactly as the harness spells them: `shipped`, `content-min-width-0`,
`navbar-min-width-0`, `navbar-overflow-hidden`, `F1-container-minmax0`, `F2-row-min-width-0`,
`F3-row-overflow-hidden`.

- **F1** is the container-level fix: a zero-floor minmax column on `.WebView__embedContainer`.
- **F2** is `min-width: 0` on `.WebView__embedNoticeRow`. **F3** is `overflow: hidden` on the same.
  All three fix 600px identically. **F1 is the one this task ships** — it is the only one that fixes
  the track itself, so it covers every row in the grid rather than just the banner row.
- The three shell arms (`content-min-width-0`, `navbar-min-width-0`, `navbar-overflow-hidden`)
  changed **nothing** at any width — byte-identical to `shipped`. `.App`'s `scrollWidth` never
  exceeded its `clientWidth`, and the navbar's min-content is 757.8px but the grid never inflated
  to it. That is what refutes the 9qy hypothesis.
- At 500px **every** arm still clips: the message is already at 0, and the actions (187.92px) plus
  the icon and the row padding exceed the 234px available. That regime is the one the 900px floor
  exists for; this task does not and cannot close it with CSS.
- The probe's `.App` client width is the viewport minus 10px in every arm (590 at a 600px viewport),
  so the column sums are against 590, not 600. Mention this in the README — a reader checking
  `256 + 334` against `600` will otherwise think the numbers are wrong.

## Why the fix is one line, and where

`.WebView__embedContainer` (`index.css:76-81`) sets `display: grid` and `grid-template-rows` but no
`grid-template-columns`. A grid with no column template gets one implicit `auto` track. An `auto`
track's automatic minimum is its items' min-content contribution. `.WebView__embedNoticeRow` is a
flex row whose message carries `white-space: nowrap`, so its min-content is the un-wrapped string
plus both buttons plus the icon and padding — ~420px. `.WebView__embedSlot` already carries
`min-width: 0` for the D-24 geometry-oracle reason (`index.css:87`); this is the same shape of fix
one level up, at the track instead of the item.

## Measured facts about the test helper — read these before writing Task 1

`readSelectorBody` in `StoreEmbedTimeoutBanner.test.tsx:239-252` **cannot reach the container rule
as written**, and this is the single thing most likely to cost an executor a confusing failure:

- It first slices the stylesheet from the first occurrence of `.WebView__embedNoticeRow`, then
  looks for the requested selector inside that slice.
- Measured on the current file: the first `.WebView__embedNoticeRow` is at char 4764 (line 133),
  and `.WebView__embedContainer` occurs only at lines **76** and **118**. Within the sliced region,
  `region.indexOf('.WebView__embedContainer')` is **-1**, so the helper's own
  `expect(selectorIndex).toBeGreaterThan(-1)` fails before any assertion about the body runs.
- Line 118's occurrence is inside the comment block above `.WebView__embedNoticeRow` — so the
  selector name already appears in comment prose in this file, and Task 1 adds another such
  mention. Comment-stripping is therefore load-bearing, not hygiene.

`embedContainerGridRows.test.ts` already handles that correctly: its `stripCssComments` plus
`indexOf('.WebView__embedContainer {')` is the in-repo idiom to copy.

## Grounded commands, measured at planning time

- `npx jest src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx src/frontend/screens/WebView/__tests__/embedContainerGridRows.test.ts`
  — ran green at planning time: 2 suites, **15 tests** (banner 12, container 3), 0.473s. Both land
  in the `Frontend` jest project. After Task 1 this is **16 tests, 2 suites**.
- `pnpm codecheck`, `pnpm planning-gates` — both exercised at planning time; planning-gates reported
  **12/12**.
- `npx prettier --file-info` measured per path at planning time:
  `src/frontend/screens/WebView/index.css` reports `{ "ignored": false, "inferredParser": "css" }`;
  `.../StoreEmbedTimeoutBanner.test.tsx` reports `{ "ignored": false, "inferredParser": "typescript" }`.
  Every `.planning/` path reports `{ "ignored": true, "inferredParser": null }` — `.prettierignore`
  ignores `.planning` wholesale, so a `--check` over those paths matches zero files and exits 0
  regardless of their content. Tasks 2 and 3 therefore **omit** the check and say so, rather than
  carry a green that proves nothing.
- `grep -F 'E3 banner | overflow' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md | grep -F '900px' | grep -cF 'the actions may not clip'`
  returns **1** right now. Inherited from `261015-9qy`'s plan, which used the same shape.

Path form: every path in this plan is repo-root-relative and every `automated` command assumes
cwd at the checkout root. The one absolute path is the harness source in Task 2, written verbatim.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: give the embed container's column a zero floor, pinned per selector with an observed red</name>
  <files>src/frontend/screens/WebView/index.css, src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx</files>
  <read_first>
    `src/frontend/screens/WebView/index.css` lines 59-88 (the comment block, the container rule, the
    slot rule). `src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx`
    lines 202-295 (the whole `WebView/index.css new notice-row rules (D-07/D-14)` describe, including
    `readSelectorBody` and the existing string-copy sabotage arm).
    `src/frontend/screens/WebView/__tests__/embedContainerGridRows.test.ts` lines 22-41 (its
    `stripCssComments` and `declaration` helpers — the idiom to copy).
  </read_first>
  <behavior>
    - The `.WebView__embedContainer` rule body declares a column template whose track floor is zero
      (a minmax with a zero lower bound and a `1fr` upper bound). RED before the CSS is written.
    - A property declared on a DIFFERENT rule cannot satisfy that assertion — the extraction is
      scoped to the named selector's own body, as the three existing notice-row arms already are.
    - Comment prose naming the selector or quoting the declaration cannot satisfy it either — the
      extraction and the sabotage count both run over comment-stripped CSS.
    - Sabotage arm: with the declaration removed from an in-memory copy, the same extraction makes
      the assertion throw. Preceded by an exactly-once count so the removal cannot silently no-op.
    - The three existing per-selector arms (message, actions, icon) stay green, unchanged in intent.
    - `embedContainerGridRows.test.ts` stays green: it reads `grid-template-rows` off this same
      rule, and the new sibling declaration must not disturb its track parse or its negative control.
  </behavior>
  <action>
    Work in this order. The order is the point: the pin is written and observed red BEFORE the CSS
    exists, so the green at the end is a measurement rather than an assertion.

    **Step 1 — generalise `readSelectorBody`, minimally.** Give it an optional third parameter for
    the region start, defaulting to the literal it hardcodes today (`.WebView__embedNoticeRow`), so
    all three existing call sites keep their current behaviour with no diff. Then make the
    extraction comment-blind: strip CSS comments from the stylesheet before locating the region and
    the selector, using the same approach as `stripCssComments` in `embedContainerGridRows.test.ts`
    (a non-greedy block-comment replace). Anchor the selector match on the selector followed by its
    opening brace, as that file's `declaration` helper does, so a bare row selector cannot be
    satisfied by a `-message` or `-actions` rule and vice versa.

    Why both halves are needed, and do not skip either: measured on the current file, the helper's
    region slice starts at line 133 while the container rule is at line 76, so the container is
    unreachable (`indexOf` returns -1 inside the region) — that is the parameter. And this file
    already names `.WebView__embedContainer` in comment prose at line 118, with another such mention
    added in step 4 — that is the strip. Leave a short docstring on the helper recording both, in
    the voice of the existing `261015-9qy` docstring immediately above it.

    **Step 2 — add one `it(...)` to the existing describe block**, after the current per-selector
    test. Extract the `.WebView__embedContainer` body with the generalised helper (region start:
    the container selector itself) and assert it declares a column template whose lower bound is
    zero and whose upper bound is `1fr`. Use a whitespace-tolerant regex, not a fixed string —
    prettier is free to space the arguments inside the function. Add a cross-selector control in
    the same arm: the same extraction over `.WebView__embedSlot` must NOT satisfy the column
    assertion, which proves the scoping (that rule carries the `min-width: 0` this fix is a sibling
    of, and must not be read as the container's declaration).

    Then the sabotage arm, mirroring the shape of the existing one at lines 279-293 but with one
    correction: run BOTH the exactly-once count and the removal over the **comment-stripped** CSS,
    not the raw text. The existing ellipsis arm counts over raw CSS, which is why step 4 carries a
    constraint about comment text; counting over stripped text removes that fragility for the new
    arm. Assert exactly one occurrence, remove it from the in-memory copy only, re-extract, and
    assert the column assertion then throws. Nothing is ever written to disk by the sabotage.

    **Step 3 — run the two suites and OBSERVE THE RED.** The new arm must fail against the
    unmodified `index.css`. Copy the failing test name and the actual assertion message into the
    SUMMARY verbatim. Do not paraphrase it and do not proceed on an assumed red: a self-asserted
    red is the same defect as a self-asserted green, and all four executor green claims in Phase 50
    turned out to be false. If the arm passes before the CSS is written, stop — the assertion is
    matching something it should not (almost certainly comment prose), and the strip in step 1 is
    wrong.

    **Step 4 — add the declaration to `.WebView__embedContainer`** in
    `src/frontend/screens/WebView/index.css`: `grid-template-columns: minmax(0, 1fr);`, placed after
    `display: grid;` and before `grid-template-rows`. Exactly this one declaration. Do NOT also add
    F2 (`min-width: 0` on `.WebView__embedNoticeRow`) or F3 (`overflow: hidden` on the same): all
    three were measured to fix 600px identically, and shipping two of them leaves a future reader
    unable to tell which one is load-bearing. One authoritative declaration, at the track.

    **Step 5 — extend the comment block above the rule.** Append a third paragraph to the EXISTING
    block at lines 59-75 — that block already accreted a `Phase 40 Plan 08, D-24:` paragraph and a
    `Phase 50 (D-07/D-14, ...)` paragraph, so a new `Quick task 261015-dlu:` paragraph is the file's
    own demonstrated pattern. Do not open a second block and do not disturb the two existing
    paragraphs. Match the file's voice: backticked identifiers, `--` for em-dashes, no hex, no
    first person.

    The paragraph must say three things and no more: (a) that the column was implicit and `auto`, so
    its floor was the items' min-content contribution, set by the notice row's nowrap message;
    (b) the measured consequence at a 600px viewport — the track resolved to 419.66px against a
    334px content box, pushing the actions to a 659.66px right edge, and the fix brings the track to
    334px with the message shrinking to 70.08px; and (c) that the 500px regime still clips once the
    message reaches zero width, so this is a degrade fix below the 900px floor, not a replacement
    for it. Name `261015-dlu` and point at that quick task's `evidence/` directory for the WebKit
    and Chromium numbers.

    Two constraints on the comment text, both measured: do not write the string
    `text-overflow: ellipsis;` anywhere in it — the existing sabotage arm counts that literal over
    RAW CSS and asserts exactly one occurrence, so a second copy in a comment reds a currently-green
    pin. And describe the new declaration in prose rather than reproducing it as a copyable
    declaration line; the stripped-CSS count in step 2 makes that survivable either way, but a
    comment that quotes a counted declaration is the shape that has already bitten this repo.

    **Step 6 — rerun both suites green**, then run `pnpm codecheck` and the scoped prettier check.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx src/frontend/screens/WebView/__tests__/embedContainerGridRows.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/frontend/screens/WebView/index.css src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx</automated>
    <automated>node -e "const c=require('fs').readFileSync('src/frontend/screens/WebView/index.css','utf8').replace(/\/\*[\s\S]*?\*\//g,''); const i=c.indexOf('.WebView__embedContainer {'); const b=c.slice(i,c.indexOf('}',i)); if(!/grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/.test(b)) throw new Error('container column floor missing'); if(/min-width:\s*0/.test(c.slice(c.indexOf('.WebView__embedNoticeRow {'),c.indexOf('}',c.indexOf('.WebView__embedNoticeRow {'))))) throw new Error('F2 was also added — only the container-level fix ships'); console.log('ok')"</automated>
  </verify>
  <done>
    `npx jest` over the two suites reports **2 suites passed, 16 tests passed** (15 before this task,
    measured at planning time). `pnpm codecheck` exits 0. `npx prettier --check` over the two written
    paths exits 0 — both measured `{ "ignored": false }` at planning time, so this check is real.
    The last automated check exits 0, proving the declaration is in the container's own body after
    comment-stripping and that the notice-row rule did NOT also gain a zero inline minimum.

    The SUMMARY quotes the step-3 red verbatim: the failing test name and the actual assertion
    message, observed against the unmodified `index.css`. A SUMMARY without that quote means this
    task is not done, whatever the final green says.
  </done>
  <reversibility rating="reversible">One CSS declaration and one test arm; revert is a two-file `git revert` with no data, schema, or API consequence.</reversibility>
</task>

<task type="auto">
  <name>Task 2: land the harness in the repo as an evidence bundle with a README that states its limits</name>
  <files>.planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/ (15 files: build-page.mjs, wkprobe.swift, wk-{1280,900,800,700,600,500}.json, cr-{1280,900,800,700,600,500}.json, README.md)</files>
  <read_first>
    `.planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/`
    — the in-repo precedent for this shape (a `build-harness.mjs`, a `wkprobe.swift`, before/after
    JSON, and `run-webkit.sh`/`run-chromium.sh` runners). This task's `wkprobe.swift` is derived from
    that one. Read `48-13/run-webkit.sh` for the house voice on documenting a probe invocation: it
    states the macOS-only dependency, the fresh-temp-dir rule, and why a fake HOME does not isolate
    WebKit.
  </read_first>
  <action>
    Copy the harness out of the scratchpad into this quick task's `evidence/` directory. The source
    is the one absolute path in this plan, written verbatim:

    `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/ef1d23e9-2ca6-4c32-ab9f-efc5e6305f48/scratchpad/harness/`

    Copy exactly 14 files: `build-page.mjs`, `wkprobe.swift`, and the 12 results —
    `wk-1280.json`, `wk-900.json`, `wk-800.json`, `wk-700.json`, `wk-600.json`, `wk-500.json` and
    the matching `cr-*.json`. Do NOT copy `page.html`: it is 64,122 bytes of generated CSS, it is
    fully reproducible from `build-page.mjs`, and committing a generated artifact invites someone to
    edit it instead of the builder. Copy the files byte-for-byte; do not reformat, re-indent, or
    pretty-print the JSON — these are captured measurements, and a reformat makes a later diff
    against a re-run unreadable.

    Then write `README.md` in that directory. It must carry five things.

    **(a) What the harness is.** The shipped stylesheets unmodified — `App.css`, the
    `NavShell`/`NavTabs`/`NavItem`/`WindowControls` scss compiled by sass, `WebView/index.css`,
    `index.scss`, `themes.scss` — plus a transcription of MUI 5.17.1's `Tabs`/`Tab` base rules
    (emotion injects those at runtime, so a static page has to carry them), with a DOM mirroring
    `NavShell/index.tsx` (the 5 real tabs) and the tier-2 rail and `WebView/index.tsx`'s
    `.WebView.WebView__embedContainer` holding `StoreEmbedTimeoutBanner`'s exact markup and English
    strings. Note `fontsReady: loaded` in every capture — the measurement is not against a fallback
    font. Name the seven arms exactly as the builder spells them: `shipped`,
    `content-min-width-0`, `navbar-min-width-0`, `navbar-overflow-hidden`, `F1-container-minmax0`,
    `F2-row-min-width-0`, `F3-row-overflow-hidden`; each is an injected `<style>` override measured
    in the same page.

    **(b) How to re-run it.** Four steps, each a real command:
    compile the six scss inputs with the repo's own sass (`npx sass --no-source-map`, version 1.89.0
    on this machine) into one directory, using the flattened filenames the builder reads —
    `index.css` and `themes.css` from `src/frontend/index.scss` and `src/frontend/themes.scss`, and
    `src_frontend_components_UI_NavShell_index.scss.css`,
    `src_frontend_components_UI_NavShell_components_NavTabs_index.scss.css`,
    `src_frontend_components_UI_NavShell_components_NavItem_index.scss.css`,
    `src_frontend_components_UI_WindowControls_index.scss.css` from the matching `index.scss` under
    `src/frontend/components/UI/`; then `node build-page.mjs <repo> <compiled-css-dir> <out.html>`
    (`App.css` and `WebView/index.css` are read straight from the repo, not from the compiled dir);
    then `/usr/bin/swiftc -O -o wkprobe wkprobe.swift` and
    `./wkprobe page.html <width> 800 [timeoutSeconds]`, which prints `window.__resultsJSON` on
    stdout — that is the `wk-<w>.json` shape; then the Chromium arm with chrome-headless-shell at
    `--window-size=<width>,800 --dump-dom`, which yields `cr-<w>.json`. State that the probe is
    macOS-only (it needs `/usr/bin/swiftc` and WKWebView) and that the chrome-headless-shell used
    was the Playwright-cached binary at
    `~/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`
    — a machine-local path, not a repo dependency, so a re-runner may need to point at their own.

    **(c) The results table**, exactly as it appears in this plan's measurement section — the eight rows at
    1280/900/700/600/500 plus the F1/F2/F3 arms. Say the quoted numbers are WebKit's and that
    Chromium agrees to within 0.07px (container column `419.65625px` vs `419.594px`). Add the
    arithmetic note: the probe's `.App` client width is the viewport minus 10px in every arm, so the
    column sums are against 590 at a 600px viewport, not 600.

    **(d) What it concluded.** Two sentences, no more: the implicit `auto` column's min-content floor
    is the mechanism, and the three shell arms (`content-min-width-0`, `navbar-min-width-0`,
    `navbar-overflow-hidden`) changed nothing at any width, which is what refutes the `App.css`
    hypothesis `261015-9qy` left open. Record that at 500px every arm still clips once the message
    reaches zero width.

    **(e) Its limits, stated as plainly as the conclusions.** This is a static page with a
    transcribed MUI base and a hand-built DOM — it is not the running app, and no React, no router,
    no theme switch and no real MUI runtime participated. The 900px and 600px column figures come
    from the harness; the ORIGINAL clip that started this is from the Item 16 live-gate photographs
    (`item16-width600.png`, `item16-width900.png`), not from here. Nothing in this quick task was run
    in the real app, so nothing here observes a rendered ellipsis, a rendered clip, or the fix
    actually painting — that remains owed to a live gate.

    Hand-match the surrounding corpus for wrap, heading style and table shape: this path is
    prettier-ignored, so nothing mechanical will keep it consistent.
  </action>
  <verify>
    <automated>test "$(ls -1 .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/ | wc -l | tr -d ' ')" = "15" && test ! -e .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/page.html && echo ok</automated>
    <automated>for w in 1280 900 800 700 600 500; do for e in wk cr; do node -e "JSON.parse(require('fs').readFileSync('.planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/'+process.argv[1]+'-'+process.argv[2]+'.json','utf8'))" $e $w || exit 1; done; done; echo "12 json parse ok"</automated>
    <automated>node -e "const s=require('fs').readFileSync('.planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/README.md','utf8'); const need=['F1-container-minmax0','F2-row-min-width-0','F3-row-overflow-hidden','shipped','content-min-width-0','navbar-min-width-0','navbar-overflow-hidden','419.66','334','swiftc','chrome-headless-shell','sass','item16-width600.png','not the running app']; const miss=need.filter(t=>!s.includes(t)); if(miss.length) throw new Error('README missing: '+miss.join(', ')); console.log('ok')"</automated>
    <automated>! grep -rlE "graysonmitchell|/Users/|claude-501" .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/ && echo "no operator profile data in the bundle"</automated>
    <automated>pnpm planning-gates</automated>
  </verify>
  <done>
    `evidence/` holds exactly 15 entries and no `page.html`. All 12 JSON files parse. The README
    names all seven arm names, the two key measured figures (419.66 and 334), all three re-run
    toolchain commands, the Item 16 photograph it defers the original clip to, and the words that
    state it is not the running app. No file in the bundle contains the operator's username, an
    absolute `/Users/` path, or the `claude-501` session temp root — the chrome-headless-shell
    location must therefore be written in tilde form, and the harness's own source path must not be
    reproduced in the README. The word "scratchpad" in prose is fine and is deliberately NOT in that
    pattern: the risk is the username and the session path, not the noun, and a pattern that reds on
    ordinary prose would only invite someone to widen it. `pnpm planning-gates` reports 12/12 (the
    floor measured at planning time).

    No `prettier --check` is carried for this task, and that is deliberate, not an omission:
    `.prettierignore` ignores `.planning` wholesale, measured at planning time as
    `{ "ignored": true, "inferredParser": null }` for every path under it. A `--check` here would
    match zero files and exit 0 with byte-identical output whatever the content, which is a green
    that proves nothing. Consistency of the README rests on hand-matching the corpus instead.
  </done>
</task>

<task type="auto">
  <name>Task 3: correct the 261015-9qy record, and make a read-first determination on UI-SPEC E3</name>
  <files>.planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md, .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md (CONDITIONAL — see below)</files>
  <read_first>
    The todo's `## Resolution` section, lines 66-113 — and in particular the final paragraph, lines
    105-113, which opens `**Open observation, not acted on here:**` and ends `...could not be proven
    or regression-tested at desk in this quick task.`
    `50-UI-SPEC.md` lines 150-153 — the four `E3 banner` rows. Line 152 is the `overflow` row.
  </read_first>
  <action>
    **Part A — the todo's Open observation.** Insert ONE new sentence immediately ABOVE the existing
    `**Open observation, not acted on here:**` paragraph, as its own short paragraph with a bolded
    lead-in. It must say: quick task `261015-dlu` measured this hypothesis in both WebKit and
    Chromium against the shipped stylesheets; the `content-min-width-0`, `navbar-min-width-0` and
    `navbar-overflow-hidden` arms changed nothing at any width, so the `App.css` shell-column reading
    is refuted; and the mechanism is `.WebView__embedContainer`'s implicit `auto` grid column, whose
    min-content floor the notice row set to ~420px. Link the evidence README by relative path.

    Preserve the original paragraph's bytes exactly — do not rewrite it, do not re-wrap it, do not
    delete it, and do not change its `**Open observation, not acted on here:**` lead-in. It is the
    record of what `261015-9qy` honestly did not know at the time, and "not acted on here" stays
    true of `261015-9qy`. The new sentence sits above it and reclassifies it; it does not replace it.

    Do NOT edit `.planning/STATE.md` in this task. The quick orchestrator owns the STATE row and the
    narrative fields; a second writer there is how those fields get silently truncated.

    **Part B — UI-SPEC E3, conditional and read-first.** Read line 152 before deciding anything.
    Measured at planning time, that row's statement names the 900px minimum, the `minWidth` key on
    the `main`-labelled entry of `app.windows` in `src-tauri/tauri.conf.json`, quick task
    `261015-9qy`, and the behavioural criterion — the message may ellipsise, the actions may not
    clip. It does **not** name the notice row's own CSS as the degrade mechanism, and it does not
    name any mechanism at all: it states a behaviour at a declared test point, which is what a UI
    spec row should do.

    If that is still what the row says when you read it, **leave the file byte-unchanged** and
    record the determination in the SUMMARY: name the line number, quote the clause that makes it
    accurate, and say explicitly that no edit was warranted. "I read it and it was already correct"
    is a result, and it is the expected one here.

    Only if the row DOES name the row's own CSS as the degrade mechanism may it be edited, and then
    the only permitted edit is appending a clause that names the container-level column fix. The
    900px test point and the `src-tauri/tauri.conf.json` reference must survive verbatim. Do not
    restate the mechanism in the spec, do not touch the `long-text` row at line 153, and do not
    touch the E1/E2/E4/E5/E6 rows.
  </action>
  <verify>
    <automated>node -e "const f='.planning/todos/completed/2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md'; const s=require('fs').readFileSync(f,'utf8'); const keep=['**Open observation, not acted on here:**','min-content 1fr','unmeasured hypothesis','could not be proven or regression-tested at desk in this quick task.']; const lost=keep.filter(t=>!s.includes(t)); if(lost.length) throw new Error('original paragraph damaged, missing: '+lost.join(' | ')); const add=['261015-dlu','evidence/README.md','.WebView__embedContainer']; const miss=add.filter(t=>!s.includes(t)); if(miss.length) throw new Error('status sentence missing: '+miss.join(', ')); const i=s.indexOf('261015-dlu'), j=s.indexOf('**Open observation, not acted on here:**'); if(!(i<j)) throw new Error('the new sentence must sit ABOVE the original paragraph'); console.log('ok')"</automated>
    <automated>grep -F 'E3 banner | overflow' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md | grep -F '900px' | grep -F 'src-tauri/tauri.conf.json' | grep -cF 'the actions may not clip'</automated>
    <automated>test "$(grep -c '^| E3 banner' .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md)" = "4" && echo "E3 row count intact"</automated>
    <automated>pnpm planning-gates</automated>
  </verify>
  <done>
    The todo's Resolution carries the new status sentence ABOVE the original Open observation
    paragraph, with that paragraph's four distinctive strings still present — the first automated
    check fails on either a damaged original or a missing/misplaced addition, so it is not a green
    that proves nothing.

    The E3 overflow invariant grep returns 1 (it returned 1 at planning time, before any edit, so
    this check is an invariant and holds on both branches of Part B). The `^| E3 banner` row count
    is 4, so no E3 row was added, split, or dropped. `pnpm planning-gates` reports 12/12.

    The SUMMARY records the Part B determination explicitly — either "left byte-unchanged, line 152
    already states the behaviour at a declared test point and names no mechanism", or the appended
    clause and why the row's prior text required it. A SUMMARY that is silent on Part B means this
    task is not done: an ordered disclosure going silent is one of the four false green claims
    Phase 50 produced.

    No `prettier --check` is carried, for the same measured reason as Task 2: both paths are under
    `.planning`, which `.prettierignore` ignores wholesale, so the check would match zero files.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

ASVS level 1; block on `high`. This task crosses **no new trust boundary**. It ships one CSS layout
declaration, one source-text test arm, and four planning documents. No untrusted input reaches any
of them, no parser is added, no network or IPC surface is touched, no capability is granted, and no
dependency is installed.

| Boundary | Description |
| --- | --- |
| scratchpad -> git-tracked repo | Task 2 copies 14 files out of a session scratchpad into a committed directory. This is the one boundary that moves data into the repo, and it is the only row below with a `mitigate` disposition. |
| (none other) | The `.WebView__embedContainer` declaration is layout-only; the renderer already owns that stylesheet, and a grid track minimum carries no authority. No `S`, `R`, `D` or `E` threat has a component to attach to in this change set. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
| --- | --- | --- | --- | --- | --- |
| T-dlu-01 | Information disclosure | the 14 harness files Task 2 copies out of the session scratchpad | medium | mitigate | This repo has twice written genuine local session data into scratchpad captures (`260912-e6k`, `260913-901`, the second time despite a written threat-model entry saying to delete them), so a scratchpad-to-repo copy is the one real risk here. Measured at planning time: no file among the 12 JSON captures, `build-page.mjs` or `wkprobe.swift` contains the operator's username, an absolute `/Users/` path or a `claude-501` session path — the captures carry only `ua`, `fontsReady` and per-arm geometry. Task 2's fourth automated check re-runs that scan over the landed bundle, including the new README, and fails the task on any hit; the README is required to write the chrome-headless-shell location in tilde form and to omit the harness's own source path for exactly this reason. The pattern deliberately does not include the bare word "scratchpad": the risk is the username and the session path, and a gate that reds on ordinary prose invites widening, which this repo's conventions forbid. |
| T-dlu-02 | Tampering | `src/frontend/screens/WebView/index.css`, `.WebView__embedContainer` rule | low | accept | A grid column minimum is layout, not authority: nothing downstream makes a trust decision on it. Accepted rather than mitigated because there is nothing to mitigate — but it is not unguarded: Task 1's per-selector pin reds if the declaration is removed, `embedContainerGridRows.test.ts` reds if the track list or the slot's row placement drifts, and `prettier --check` catches a whole-file reformat. The one real correctness hazard, a stale embed rect for the D-24 geometry oracle, cannot arise: the slot already carries `min-width: 0` and the fix shrinks the track toward the container rather than growing it, so `useStoreEmbedHost`'s observed rect gets smaller, never larger than its box. |
| T-dlu-03 | Repudiation | the `261015-9qy` Resolution paragraph Task 3 edits | low | accept | Overwriting a prior task's honest record of its own uncertainty would destroy the audit trail of what was known when. Accepted as a risk of editing records at all, and bounded structurally: Task 3 forbids rewriting the paragraph, and its first automated check asserts four distinctive strings from the original text are still present and that the new sentence sits above rather than inside it. |
| T-dlu-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package-manager install task exists in this plan, so the package-legitimacy gate has nothing to score. Every command runs an already-installed binary — `npx jest`, `npx prettier`, `pnpm codecheck`, `pnpm planning-gates`, `node`, `grep` — and all five were exercised at planning time. The re-run instructions Task 2 writes into the README name `npx sass`, `/usr/bin/swiftc` and a Playwright-cached `chrome-headless-shell`, but they are documentation of a past run, not commands this plan executes. If any task turns out to need an install, stop and run the package-legitimacy gate first: these checkpoints are never auto-approvable, whatever `workflow.auto_advance` says. |
</threat_model>

<verification>
Run from the checkout root, after all three tasks:

- `npx jest src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx src/frontend/screens/WebView/__tests__/embedContainerGridRows.test.ts`
  — expect 2 suites passed, 16 tests passed. Planning-time baseline on the unmodified tree was 2
  suites, 15 tests, so a report of 15 means the new arm never landed and a report of 17+ means
  something beyond this plan was added.
- `pnpm codecheck` — exit 0.
- `npx prettier --check src/frontend/screens/WebView/index.css src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx`
  — exit 0. These are the only two written paths prettier actually sees; both measured
  `{ "ignored": false }` at planning time. Every other path this plan writes is under `.planning`,
  which `.prettierignore` ignores wholesale, so no further check is carried and none should be
  invented.
- `pnpm planning-gates` — 12/12.
- The three per-task automated checks in Tasks 2 and 3 (bundle shape, README content, profile-data
  scan, record integrity, E3 invariant, E3 row count).

Not verified by anything here, and the SUMMARY must say so rather than implying otherwise: jest
performs no layout in this project, so nothing in this task observes the fixed row rendering. The
fix is measured in two engines against the shipped stylesheets in a static harness, and that is
all. Whether `.WebView__embedContainer` paints the shrunken message in the running app on macOS is
owed to a live gate — and if no live gate runs this session, that is a `ready: live-gate` todo with
`severity: minor`, `platform: macos`, carried bare and lowercase in that key order.
</verification>

<success_criteria>
- `.WebView__embedContainer` declares a column template with a zero lower bound and a `1fr` upper
  bound, as its single authoritative fix; `.WebView__embedNoticeRow` gained neither a zero inline
  minimum nor hidden overflow, so exactly one of the three measured fixes ships.
- The comment above that rule names `261015-dlu`, the implicit-`auto`-column mechanism and the
  notice row's nowrap min-content, the measured 600px figures (419.66px track against a 334px box,
  334px and a 70.08px message after the fix), and the surviving 500px regime — appended as a third
  paragraph to the existing block, with the two existing paragraphs untouched.
- `StoreEmbedTimeoutBanner.test.tsx` pins that declaration PER SELECTOR through a comment-blind
  extraction, with a cross-selector control against `.WebView__embedSlot` and a sabotage arm whose
  exactly-once count runs over comment-stripped CSS; the three pre-existing per-selector arms are
  unchanged in intent and still green.
- The SUMMARY quotes the observed RED — failing test name and actual assertion message, against the
  unmodified `index.css` — verbatim.
- `embedContainerGridRows.test.ts` is green and unedited: the new sibling declaration did not
  disturb its track parse, its auto-placement assertions, or its negative control.
- `evidence/` holds exactly 15 entries: `build-page.mjs`, `wkprobe.swift`, 12 result JSON files and
  a `README.md`. No `page.html`. No operator username, absolute `/Users/` path or scratchpad path in
  any of them.
- The README states what the harness is (shipped stylesheets, transcribed MUI 5.17.1 base, hand-built
  DOM, `fontsReady: loaded`, all seven arm names verbatim), how to re-run it (sass, `build-page.mjs`,
  `swiftc` + `wkprobe`, chrome-headless-shell), the results table with the Chromium agreement and the
  590-vs-600 arithmetic note, the conclusion, and its limits — explicitly that it is not the running
  app, that the original clip comes from the Item 16 photographs rather than from the harness, and
  that nothing in this task ran in the real app.
- The closed todo's Resolution reclassifies the Open observation as measured and refuted, with a link
  to the evidence README, and with the original paragraph's text preserved byte-for-byte below it.
- UI-SPEC E3's overflow row still names 900px, `src-tauri/tauri.conf.json` and the ellipsise/no-clip
  clause; the file has 4 `E3 banner` rows; and the SUMMARY records the read-first determination
  either way.
- `App.css`, `NavShell`, `tauri.conf.json` and `.planning/STATE.md` are untouched by these tasks.
</success_criteria>

<output>
Create `.planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/261015-dlu-SUMMARY.md` when done.
</output>