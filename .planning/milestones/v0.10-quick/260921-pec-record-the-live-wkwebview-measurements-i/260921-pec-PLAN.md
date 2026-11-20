---
phase: quick-260921-pec
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
  - .planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
  - .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md
autonomous: true
requirements: [QUICK-260921-PEC]

must_haves:
  truths:
    - "All three todos carry a dated `## Measured live under WKWebView` section that cites the evidence path `.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json` and states, in that todo's own words, the scope limit: the harness measured CSS cascade resolution and selector parsing in a real off-screen WKWebView against the app's 143 real stylesheets, NOT the running app's own webview instance, NOT its React tree, and NOT emotion's runtime-injected styles."
    - "The bare-`.Dialog` todo's claim is STRENGTHENED from two collapsed margins to FOUR on `.anticheatInfo`, with the reason the two consumer sites differ stated: the whole `margin` shorthand is invalid-at-computed-value-time so all four sides go to `0px`, while Winetricks keeps `16px` block margins only because its `margin-block: 1rem` is a separate declaration that survives independently."
    - "The bare-`.Dialog` todo explicitly warns that `elementsCarryingBareDialogClass: 2` in the evidence JSON is probe CONTAMINATION — the probe injected exactly two `.Dialog` wrappers as positive controls before counting — so a future reader cannot re-read the JSON and 'discover' that the class IS applied."
    - "`ready:` reads `code` on the bare-`.Dialog` todo, `live-gate` (unchanged, but NARROWED in the body) on the stray-paren todo, and `human` on the Steam-key-input todo — each with the REASON for the key's value or its non-movement written in that todo's readiness prose, not a bare key flip."
    - "`severity:` is UNMOVED on all three (`medium`, `minor`, `minor`) and `platform: any` is unmoved on all three; the three keys remain bare, lowercase and in the order `severity:` then `platform:` then `ready:` INSIDE the frontmatter block."
    - "All three todos remain in `.planning/todos/pending/` — none is closed, moved, or renamed, and `.planning/todos/completed/` gains no file."
    - "`git diff --quiet -- src/ src-tauri/` exits 0: no source file is touched by this task."
    - "`pnpm planning-gates` reports 11/11 passed, matching the baseline measured at HEAD `0188b54a9` before any edit."
  artifacts:
    - path: ".planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md"
      provides: "Measured four-side margin collapse, the contamination warning, and re-triage to ready: code"
      contains: "ready: code"
    - path: ".planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md"
      provides: "Measured one-rule error-recovery blast radius and the narrowed live gate"
      contains: "wkresults.json"
    - path: ".planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md"
      provides: "Measured byte-identity with a pristine input and re-triage to ready: human"
      contains: "ready: human"
  key_links:
    - from: ".planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md"
      to: ".planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json"
      via: "cited evidence path in the Measured live section"
      pattern: "260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults\\.json"
    - from: ".planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md"
      to: ".planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json"
      via: "cited evidence path in the Measured live section"
      pattern: "260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults\\.json"
---

<objective>
Fold the live WKWebView measurement into the three pending Dialog todos filed by quick
`260921-nub`, and re-triage their `ready:` keys to what is now actually known.

Purpose: all three todos currently reason from SOURCE INSPECTION and carry `ready: live-gate`
because the open question was "what does the browser actually do?". That question has now been
answered by a compiled Swift harness that loaded the app's Vite-served frontend into a real
off-screen `WKWebView` — the same engine GameLib ships — and evaluated a probe against it. Two of
the three no longer have anything left to measure, and one of the three is measurably WORSE than
its own todo claims. Leaving the files as they are means the next session re-runs a measurement
that already exists, and acts on a prediction (two margins) that the measurement contradicts
(four).

Output: three edited todo files. NOTHING ELSE. The evidence files are already in place and
committed; no source change is in scope.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

Binding from `CLAUDE.md` for this task — the todo-triage frontmatter convention:

- Every file in `.planning/todos/pending/` carries `severity:`, then `platform:`, then `ready:`,
  in that order.
- Values are matched **bare, lowercase and exact**. `ready: code`, never `ready: "code"`, never
  `ready: Code`.
- The `ready:` vocabulary is CLOSED: `code | live-gate | human | blocked`. Do not invent a value
  and do not widen the gate to admit one.
- `severity:` vocabulary is CLOSED: `critical | major | medium | minor`.

Files to edit (exactly these three, all under `.planning/todos/pending/`):

@.planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
@.planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
@.planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md

Evidence already on disk and committed — read it, do not regenerate it:

@.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json
@.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/probe_wk.js

<measurement_context>
<!-- The executor gets the findings HERE so it does not have to re-derive them from raw JSON. -->

**Method.** `evidence/wkprobe.swift` (compiled) loaded `http://localhost:5173/` — the app's real
Vite-served frontend — into an off-screen `WKWebView` and evaluated `evidence/probe_wk.js` via
`callAsyncJavaScript`. The app booted properly in that harness: `styleSheetsAtLoad: 143`,
`bodyClass: midnightMirage`, `hasWindowApi: true`. Every probe carried a positive control.

**SCOPE LIMIT — this must be written into each todo, not glossed.** What was measured is CSS
cascade resolution and selector parsing in WebKit against the app's real stylesheets. It did NOT
use the running app's own webview instance, its React tree, or emotion's runtime-injected styles.
For the margin question (P1) and the input question (P3) that IS the question, and those two are
settled. For the stray-paren question (P2) it proves the rule never applies, but NOT the
user-visible consequence.

**P1 — `--dialog-margin-horizontal`:**

| element | as shipped | under a `.Dialog` ancestor (POSITIVE CONTROL) |
| --- | --- | --- |
| `.InstallModal__dialog > .anticheatInfo` | `0px` top/right/bottom/left | `16px` top, `32px` right, `0px` bottom, `32px` left |
| `.progressDialog.winetricksDialog .installWrapper` | `16px` block, `0px` inline | `16px` block, `32px` inline |

- `tokenAtRoot` and `tokenAtBody` both read `""` after a full 143-stylesheet boot — the token is
  declared nowhere reachable.
- `sanity_spaceMd` read `1em` through the same getter, so a blank reading means the token is
  undefined rather than the probe being broken.
- The measurement is STRONGER than the todo's current claim: `.anticheatInfo` loses **all four**
  margins, not two, because the whole `margin` shorthand is invalid at computed-value time.
  Winetricks keeps its block margins only because `margin-block: 1rem` is a separate declaration
  surviving independently.
- `elementsCarryingBareDialogClass: 2` in the JSON is probe CONTAMINATION, not a finding — the
  probe injected two `.Dialog` wrappers as positive controls before counting.

**P2 — the stray paren:**

- Injected the emotion-shaped pair plus a trailing sentinel rule: 3 rules in, `ruleCount: 2`.
  WebKit kept the well-formed rule and the sentinel and dropped the malformed one.
- The sentinel AFTER the bad rule still applied (`rgb(1, 2, 3)`), so error recovery consumes
  exactly one rule — the one-declaration blast radius is now measured, not argued.
- An element matching `:has(.logs-wrapper)` picked up the control rule's value
  (`maxHeightOnMatchingElement: "71%"`), proving the element WOULD have matched.
- `CSS.supports('selector(:has(.x))')` is `true`, so this is not an engine support gap, and
  `document.querySelector(':has(.logs-wrapper))')` throws `SyntaxError`.

**P3 — the Steam-key input:**

- Every painted property — `backgroundColor`, `color`, `borderTopWidth`/`Style`/`Color`,
  `borderRadius`, `paddingTop`, `paddingLeft`, `fontFamily`, `fontSize` — is byte-identical to a
  pristine `<input>` in a stylesheet-free iframe.
- Only `width` and `height` differ, and that is inherited/global box model (app-wide
  `box-sizing`, line-height), not a rule targeting the element.
- Method control passed: a `.Dialog__footer` probe read `display: flex`, so the method can detect
  styling where styling exists. The near-identity is a real finding, not an inert probe.
</measurement_context>

<baseline>
Measured at HEAD `0188b54a9` immediately before this plan was written, so a later red cannot be
waved off as pre-existing:

- `pnpm planning-gates` → `11/11 planning gates passed.`
- The frontmatter assertion used in every task below → 2 FAIL / 1 OK. The two FAILs are exactly
  the two files whose `ready:` must flip; the one OK is the stray-paren todo, whose keys must NOT
  move. That is this plan's negative control: a vacuous assertion would have read 3 OK now.
</baseline>
</context>

<scope_fence>
**The ONLY files this task may change are the three todos under `.planning/todos/pending/`**,
plus this task's own `260921-pec-PLAN.md` / `260921-pec-SUMMARY.md`.

**Forbidden, without exception:**

- Any edit under `src/` or `src-tauri/`. Every task below asserts
  `git diff --quiet -- src/ src-tauri/`. This task RECORDS three defects; it repairs none of
  them. Do not fix the stray paren. Do not declare the token. Do not style the input.
- Regenerating, re-running or editing anything under `evidence/`. It is already committed.
- Closing, moving or renaming any of the three todos. All three stay in `pending/`.
- Widening or editing `.planning/todos/todo-frontmatter-gate.py`. If it goes red, the todo's
  frontmatter is wrong, not the gate.
</scope_fence>

<tasks>

<task type="auto">
  <name>Task 1: Fold the measurement into the bare-.Dialog todo and re-triage it to ready: code</name>
  <files>.planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md</files>
  <action>
Edit this todo in place. Four changes, all in this one file.

1. **Frontmatter:** change `ready: live-gate` to `ready: code`. Leave `severity: medium` and
   `platform: any` exactly as they are, in their existing positions, so the key order stays
   `severity:` / `platform:` / `ready:`. Change nothing else in the frontmatter block.

2. **Correct the body's central claim from two collapsed margins to four.** The existing
   "Measured facts" section says both references "fall back to `0`", and the severity prose says
   "both margins collapse to `0`". That is now known to be an understatement for one of the two
   sites. Rewrite those statements to the measured truth: `.anticheatInfo` loses ALL FOUR margins
   (`0px` on every side) because the whole `margin` shorthand is invalid at computed-value time
   and the entire declaration is dropped — not just its horizontal components. State explicitly
   why the two consumer sites differ: `Winetricks/index.scss`'s `installWrapper` retains `16px`
   block margins because `margin-block: 1rem` is a SEPARATE declaration that survives the
   shorthand's invalidation independently, so only its inline margins collapse. Do NOT delete the
   existing "Why the gate stays green" section — `cssTokenSweep.test.ts`'s blind-spot B reasoning
   and its "must NOT be deleted to fix this" warning are untouched by this measurement and remain
   correct.

3. **Add a dated section headed exactly `## Measured live under WKWebView`** (put the date from
   `date +%Y-%m-%d` and the string `quick 260921-pec` on the heading line or the line directly
   beneath it). It must contain, in your own prose:
   - The evidence path, verbatim and complete:
     `.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json`
   - The method in one or two sentences: a compiled Swift harness loaded the app's Vite-served
     frontend into a real off-screen `WKWebView` (the engine GameLib ships) and evaluated a probe
     against it; the app booted properly there — 143 stylesheets, `bodyClass: midnightMirage`,
     `window.api` present.
   - The as-shipped vs positive-control margin numbers for both sites. A small table is fine.
   - That `tokenAtRoot` and `tokenAtBody` both read `""` after a full 143-stylesheet boot, and
     that `sanity_spaceMd` read `1em` through the SAME getter — so the blank reading means the
     token is undefined, not that the probe is broken.
   - **The scope limit, stated plainly:** this measured CSS cascade resolution in WebKit against
     the app's real stylesheets; it did NOT use the running app's own webview instance, its React
     tree, or emotion's runtime-injected styles. For THIS question that is sufficient, because the
     question is purely whether a custom property resolves through the cascade — say so, rather
     than leaving the reader to judge.
   - **A contamination warning** naming the JSON field `elementsCarryingBareDialogClass` and its
     value `2`: that number is an ARTIFACT of the probe, which injected exactly two `.Dialog`
     wrappers as positive controls BEFORE counting. It says nothing about the app. Word it so a
     future reader who opens the JSON directly cannot mistake it for evidence that the class IS
     applied.

4. **Rewrite the `ready:` half of the "Severity and readiness reasoning" section** to justify
   `code`. The reason: nothing is left to measure. The cascade behaviour is now known, so what
   remains is a DECISION about where the token should be declared (re-scope to a class that is
   actually applied, move it to `:root`, or repoint the two consumers) plus the edit itself —
   desk work, not a live gate. Keep `severity: medium` and say why it is unchanged: it is now
   MEASURED rather than inferred, and the blast radius is still bounded to two surfaces.

Write prose, not a diff-dump. The todo must read as one coherent document afterwards, not as an
original with a bolt-on appendix contradicting its own opening paragraphs — which is why change 2
is a rewrite of the existing claims rather than an addendum.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && F=.planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md && git diff --quiet -- src/ src-tauri/ && [ "$(awk 'NR==1 && $0=="---" {inb=1; next} inb && $0=="---" {exit} inb' "$F" | grep -E '^(severity|platform|ready): [a-z-]+$' | tr '\n' '|')" = "severity: medium|platform: any|ready: code|" ] && grep -q '^## Measured live under WKWebView' "$F" && grep -qF '.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json' "$F" && grep -qF 'elementsCarryingBareDialogClass' "$F" && grep -qF 'margin-block' "$F" && echo PASS</automated>
  </verify>
  <done>
`ready: code` is the only frontmatter change; the body claims four collapsed margins on
`.anticheatInfo` and explains why Winetricks differs; a dated `## Measured live under WKWebView`
section cites the full evidence path, states the scope limit, and warns that
`elementsCarryingBareDialogClass: 2` is probe contamination; the readiness prose justifies `code`
and the severity prose justifies keeping `medium`. `src/` and `src-tauri/` are untouched.
  </done>
</task>

<task type="auto">
  <name>Task 2: Narrow the stray-paren todo's live gate and re-triage the Steam-key input to ready: human</name>
  <files>.planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md, .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md</files>
  <action>
Two files, both edited in place. Neither gets a source fix.

**File A — `2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md`:**

Frontmatter does NOT change. `severity: minor`, `platform: any`, `ready: live-gate` all stay
exactly as they are. This is the one file whose keys must not move, and a no-op here is a
deliberate outcome, not an oversight.

Add a dated section headed exactly `## Measured live under WKWebView` (date from
`date +%Y-%m-%d`, plus the string `quick 260921-pec`), citing the evidence path
`.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json`
and recording:

- The emotion-shaped pair plus a trailing sentinel rule was injected: 3 rules in, `ruleCount: 2`
  out. WebKit kept the well-formed rule and the sentinel and dropped the malformed one.
- The sentinel AFTER the malformed rule still applied (`rgb(1, 2, 3)`), so error recovery consumes
  EXACTLY ONE RULE. The todo's existing "blast radius is one declaration" claim was reasoned from
  source; it is now measured. Say which it was and which it now is.
- An element matching `:has(.logs-wrapper)` picked up a control rule's value
  (`maxHeightOnMatchingElement: "71%"`), so the element WOULD have matched had the selector
  parsed.
- `CSS.supports('selector(:has(.x))')` is `true` — this is not an engine support gap — and
  `document.querySelector(':has(.logs-wrapper))')` throws `SyntaxError`.
- **The scope limit, and here it bites:** this measured selector parsing and CSS error recovery in
  WebKit against the app's real stylesheets. It did NOT use the running app's own webview
  instance, its React tree, or emotion's runtime-injected styles. It therefore proves the rule
  NEVER APPLIES, but says nothing about the USER-VISIBLE consequence. Write that distinction
  explicitly — it is the whole reason this todo keeps its live gate while its two siblings lose
  theirs.

Then rewrite the `live-gate` half of the "Severity and readiness reasoning" section to NARROW the
gate rather than remove it. The existing text says the first step is "to look at the rendered
Settings-log dialog on a short viewport and decide whether the intended 80% cap is correct". The
mechanism half of that is now settled and should be dropped from the gate's scope; what remains is
one question only: does the Settings log dialog actually overflow on a short window? State that
the gate has narrowed and say what was removed from it. Keep `severity: minor` and say why the
measurement does not move it: the "`25em` is ~400px, the cap does not bind except on a short
window" reasoning is about layout on real viewports, which this harness did not and could not
measure.

Leave the co-located `LogSettings/index.css:52` `dialog .logs-wrapper` second finding and the
`git log -S` provenance line intact — neither was probed.

**File B — `2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md`:**

Frontmatter: change `ready: live-gate` to `ready: human`. Leave `severity: minor` and
`platform: any` untouched and in place, preserving the `severity:` / `platform:` / `ready:` order.

Add a dated section headed exactly `## Measured live under WKWebView` (same date and
`quick 260921-pec` string), citing the same full evidence path, and recording:

- Every painted property of the app's input — `backgroundColor`, `color`, `borderTopWidth`,
  `borderTopStyle`, `borderTopColor`, `borderRadius`, `paddingTop`, `paddingLeft`, `fontFamily`,
  `fontSize` — is byte-identical to a pristine `<input>` rendered in a stylesheet-free iframe.
  Quote a couple of the concrete values (e.g. `borderTopStyle: inset`,
  `borderTopColor: rgb(128, 128, 128)`, `fontSize: 11px`) so the finding is checkable without
  reopening the JSON.
- Only `width` and `height` differ, and that difference comes from inherited/global box model
  (app-wide `box-sizing`, line-height), NOT from any rule targeting this element. Do not let this
  read as "two properties are styled".
- The method control passed: a `.Dialog__footer` probe read `display: flex` through the same
  method, so the method CAN detect styling where styling exists. The near-identity is a real
  finding, not an inert probe.
- **The scope limit:** cascade resolution in WebKit against the app's real stylesheets; not the
  running app's own webview instance, not its React tree, not emotion's runtime-injected styles.
  For THIS question that is sufficient — the question was whether any rule in the app's
  stylesheets paints this input, and the answer is no — so say so rather than leaving it hanging.

Then rewrite the readiness half of "Severity and readiness reasoning" to justify `human`. The
reason: nothing is left to MEASURE — the input is confirmed unstyled against 143 real stylesheets.
What is left is a DESIGN DECISION about whether this dialog's input should be styled at all and,
if so, to what; that needs a person, not a live run and not an edit. Keep `severity: minor` and
say why: still cosmetic only, now confirmed rather than inferred.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && git diff --quiet -- src/ src-tauri/ && A=.planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md && B=.planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md && [ "$(awk 'NR==1 && $0=="---" {inb=1; next} inb && $0=="---" {exit} inb' "$A" | grep -E '^(severity|platform|ready): [a-z-]+$' | tr '\n' '|')" = "severity: minor|platform: any|ready: live-gate|" ] && [ "$(awk 'NR==1 && $0=="---" {inb=1; next} inb && $0=="---" {exit} inb' "$B" | grep -E '^(severity|platform|ready): [a-z-]+$' | tr '\n' '|')" = "severity: minor|platform: any|ready: human|" ] && for F in "$A" "$B"; do grep -q '^## Measured live under WKWebView' "$F" && grep -qF '.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json' "$F" || exit 1; done && grep -qF 'ruleCount' "$A" && grep -qF 'Dialog__footer' "$B" && echo PASS</automated>
  </verify>
  <done>
The stray-paren todo keeps `severity: minor` / `platform: any` / `ready: live-gate` byte-identical
in frontmatter, gains the measured one-rule error-recovery finding, and its readiness prose states
that the gate has NARROWED to the overflow-on-a-short-window question. The Steam-key todo reads
`ready: human` with `severity: minor` unmoved, records the byte-identity finding plus the
`.Dialog__footer` method control, and justifies `human` as a design decision. Both cite the full
evidence path and state the scope limit. `src/` and `src-tauri/` are untouched.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove the gates, the scope fence and the triage vocabulary across all three files</name>
  <files>(no files modified — verification only)</files>
  <action>
Modify nothing. Run the whole-task assertions and record each command's output verbatim in the
SUMMARY, including the numbers, not a paraphrase.

1. **Scope fence.** `git diff --quiet -- src/ src-tauri/` must exit 0. Then confirm the working
   tree's changed set is only the three todos plus this task's own planning files:
   `git status --porcelain` — every line must be under
   `.planning/todos/pending/` or `.planning/quick/260921-pec-.../`. Anything else means the fence
   was breached; stop and report rather than reverting silently.

2. **All three todos are still pending.** Each of the three paths still exists under
   `.planning/todos/pending/`, and `git status --porcelain .planning/todos/completed/` prints
   nothing — no file was moved or added there.

3. **Frontmatter triage vocabulary, scoped to the frontmatter block.** Run the three-file
   assertion in the verify below. It extracts ONLY the text between the file's opening `---` and
   the next `---`, then requires the joined triage lines to equal the expected string exactly.
   This is deliberately stronger than a whole-file `grep -qx`: these bodies now DISCUSS
   `ready: live-gate` in prose, and an unscoped grep would be satisfied by that prose — this repo
   has a recorded "prose satisfies the gate that names it" failure mode and the previous cycle hit
   exactly it. The exact-string comparison also pins ORDER (`severity:` then `platform:` then
   `ready:`) and bareness (the `[a-z-]+$` anchor rejects `"code"` and `Code`), which the value
   vocabulary alone does not.

4. **`pnpm planning-gates`** must print `11/11 planning gates passed.` — the same count measured
   at HEAD `0188b54a9` before any edit. `.planning/todos/todo-frontmatter-gate.py` inside that run
   is what enforces the `ready:` vocabulary; if it goes red, the fix is the todo's frontmatter, NOT
   the gate. Do not edit the gate under any circumstance.

If any assertion fails, fix the TODO and re-run. Do not weaken an assertion to reach green.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && rc=0; git diff --quiet -- src/ src-tauri/ || { echo "FAIL scope fence: src/ or src-tauri/ modified"; rc=1; }; [ -z "$(git status --porcelain .planning/todos/completed/)" ] || { echo "FAIL a todo was moved into completed/"; rc=1; }; for spec in ".planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md|severity: medium|platform: any|ready: code|" ".planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md|severity: minor|platform: any|ready: live-gate|" ".planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md|severity: minor|platform: any|ready: human|"; do f="${spec%%|*}"; want="${spec#*|}"; got=$(awk 'NR==1 && $0=="---" {inb=1; next} inb && $0=="---" {exit} inb' "$f" | grep -E '^(severity|platform|ready): [a-z-]+$' | tr '\n' '|'); if [ "$got" != "$want" ]; then echo "FAIL $f"; echo "  want: $want"; echo "  got : $got"; rc=1; fi; grep -q '^## Measured live under WKWebView' "$f" || { echo "FAIL no Measured live section: $f"; rc=1; }; grep -qF '.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/evidence/wkresults.json' "$f" || { echo "FAIL no evidence path: $f"; rc=1; }; done; [ $rc -eq 0 ] && pnpm planning-gates 2>&1 | tail -3 | grep -q '11/11 planning gates passed' && echo PASS</automated>
  </verify>
  <done>
`git diff --quiet -- src/ src-tauri/` exits 0 and the working tree's changed set is only the three
todos plus this task's planning files. All three todos are still in `pending/` and
`completed/` gained nothing. The frontmatter-scoped assertion passes for all three files (pinning
value, bareness and key order), each file carries a `## Measured live under WKWebView` section
citing the full evidence path, and `pnpm planning-gates` prints `11/11 planning gates passed.`
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none) | Docs-only edit to three planning files. No executable path, no input parsing, no new dependency, no network, no credential, no file under `src/` or `src-tauri/` is read at runtime by anything this task changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260921-pec-01 | Tampering | `src/`, `src-tauri/` | mitigate | Scope fence in `<scope_fence>`; every task's verify asserts `git diff --quiet -- src/ src-tauri/`. |
| T-260921-pec-02 | Repudiation | The three todos' evidentiary claims | mitigate | Every new claim cites the committed evidence path; the contamination warning and the scope limit are required content, so a future reader cannot mistake probe artifacts or out-of-scope surfaces for findings. |
| T-260921-pec-03 | Tampering | `.planning/todos/todo-frontmatter-gate.py` | mitigate | Editing or widening the gate is forbidden in `<scope_fence>`; Task 3 re-runs `pnpm planning-gates` and requires the unchanged 11/11 count. |
| T-260921-pec-SC | Tampering | npm/pip/cargo installs | mitigate | Not applicable — this task installs nothing. No `package.json`, lockfile or manifest is touched. |
</threat_model>

<verification>
1. `git diff --quiet -- src/ src-tauri/` exits 0.
2. `git status --porcelain .planning/todos/completed/` prints nothing.
3. The frontmatter-scoped triage assertion passes for all three files, pinning value, bareness and
   key order inside the frontmatter block only.
4. All three files carry `## Measured live under WKWebView` and the full evidence path.
5. `pnpm planning-gates` prints `11/11 planning gates passed.` (baseline at `0188b54a9`: 11/11).
</verification>

<success_criteria>
- Three todo files edited; no other file in the repo changed except this task's PLAN/SUMMARY.
- `ready:` reads `code` / `live-gate` / `human` across the three files respectively, each with its
  reason — or its reason for NOT moving — written into the body prose.
- `severity:` and `platform:` unmoved on all three.
- The bare-`.Dialog` todo claims FOUR collapsed margins on `.anticheatInfo`, explains the
  Winetricks difference via `margin-block`, and warns that
  `elementsCarryingBareDialogClass: 2` is probe contamination.
- Each todo states the harness's scope limit in its own words.
- All three todos remain in `.planning/todos/pending/`.
- `pnpm planning-gates` green at 11/11.
</success_criteria>

<output>
Create `.planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/260921-pec-SUMMARY.md`
when done, recording each verification command's verbatim output (numbers, not paraphrase).
</output>
