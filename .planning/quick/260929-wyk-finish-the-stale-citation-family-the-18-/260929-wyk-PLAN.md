---
phase: quick-260929-wyk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/humble/__tests__/keyTypePresentation.test.ts
  - src/backend/humble/__tests__/userAgent.test.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
autonomous: true
requirements:
  - IN-01

estimate:
  tokens: 52000
  raw_tokens: 26000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - Every `file.ts(x):NNN` citation sitting in COMMENT text is gone from all seven files — 17 of the 18, the family the source-side sibling deferred.
    - The one citation carried INSIDE an `it()` title survives untouched, because the ruling in `260929-wyk-SCOPE-DECISION.md` puts test-title stability above citation hygiene. Its count is pinned at exactly 1 so the exclusion cannot silently widen.
    - The set of test titles is byte-identical before and after, across BOTH jest projects — proving no `it`/`describe`/`test` name changed, which is the failure mode that would leave the suite green while it verified something different.
    - No non-comment content changed in any of the seven files. Proven by comparing comment-STRIPPED content pre and post, not by classifying diff-line prefixes — the CSS file's comment interiors are bare prose with no marker to classify on.
    - Every surviving citation names a stable anchor — an exported symbol for source targets, an `it`/`describe` title for test targets, a `jest.mock` specifier for module-level setup targets.
    - Backend (4 suites / 230 tests) and Frontend (4 suites / 209 tests) stay green at their measured baselines.
  artifacts:
    - src/backend/humble/__tests__/keyTypePresentation.test.ts
    - src/backend/humble/__tests__/userAgent.test.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
    - .planning/quick/260929-wyk-finish-the-stale-citation-family-the-18-/260929-wyk-SUMMARY.md
  key_links:
    - "The citation gate MUST stay scoped to COMMENT text and MUST keep the `\\.tsx?:` pattern. Two independent widenings would each make it permanently unsatisfiable: scoping it whole-file makes the deliberately-excluded `it()` title the only way to go green, and widening the pattern to admit `.css:NNN` drags in EIGHT out-of-scope citations in `index.css` that point at other stylesheets. Both are the `260929-k5e` shape — a gate that can only pass by editing something it was never meant to touch."
    - "`stripSourceComments` DOES neutralise `index.css` comment edits for the stylesheet gate — measured, not assumed: it strips `/* ... */` block comments first, and all four SANITY tests in `humbleKeysStylesheet.test.ts` run against INLINE fixtures, never the real file. The residual hazard is not the prose but the DELIMITERS: deleting or introducing a `*/` moves the strip boundary and silently changes what the gate scans. Gate 2C (strip-equivalence) is what catches that, and it is the reason the comment-only check compares stripped CONTENT rather than diff-line prefixes."
    - "One citation, `HumbleKeyRow:116` at `library.test.ts:3501`, uses a bare `Symbol:NNN` form with no file extension and is INVISIBLE to the `\\.tsx?:` pattern — it sits on the line directly above a citation the pattern does see. Fixing only the visible one leaves a stale pointer one line away from its own correction. Gate 2B exists solely for it."
---

<objective>
Finish the stale-citation family the source-side sibling (`260929-w93`, commit
`086bb8480`) started: convert the 17 remaining in-comment `file.ts(x):NNN`
citations — spread across six Humble test files and one stylesheet — to
symbol-anchored form.

Purpose: the sibling fixed 15 citations in five SOURCE files and explicitly
deferred everything under `__tests__/`. Three of the deferred ones point at the
exact same targets the sibling just re-anchored, which is the evidence that this
is one family and not two. Leaving them behind preserves the ambiguity the
sibling's work removed and leaves a mixed convention in adjacent files.

Output: comment-only edits to seven files. No logic change, no assertion change,
no test-title change, no behaviour change.

Note on shape: tracer-first decomposition does not apply here. There are no
layers to slice through — this is a single flat edit surface with a hard
"changed nothing that executes" constraint, so the plan is ordered
baseline → edit → prove-unchanged instead.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260929-wyk-finish-the-stale-citation-family-the-18-/260929-wyk-SCOPE-DECISION.md
@.planning/quick/260929-wyk-finish-the-stale-citation-family-the-18-/260929-wyk-CENSUS.txt
@.planning/quick/260929-w93-close-phase-43-in-01-and-the-wider-famil/260929-w93-PLAN.md
@.planning/quick/260929-w93-close-phase-43-in-01-and-the-wider-famil/260929-w93-SUMMARY.md
@src/backend/testUtils/stripSourceComments.ts
</context>

<the_binding_ruling>
`260929-wyk-SCOPE-DECISION.md` is a ruling, not a suggestion. Read it before
touching anything. Its operative content, restated so it cannot be missed:

`humbleKeysStylesheet.test.ts` carries ONE citation inside an `it()` title
string. Three of this task's constraints are mutually unsatisfiable there, and
the ruling resolves it in favour of title stability. **That site is OUT of edit
scope. Do not re-litigate it, and do not "just fix it while you are in there".**

Its consequence for the gates is load-bearing: the citation gate is scoped to
COMMENT text, and the excluded site's count is pinned at exactly 1 so the
exclusion cannot silently widen into cover for a missed comment site. A
whole-file gate would be permanently red — the `260929-k5e` shape.

The SUMMARY must name this exclusion WITH its reason. Omitting it silently is
what drew a warning on `260929-vmb`.
</the_binding_ruling>

<the_anchor_convention>
Four anchor forms. The first is the sibling's; the other three exist because
test files and stylesheets have targets the sibling never had to anchor.

**1. Target is a declaration in source → symbol plus bare path, no number.**
The in-repo precedent is the surviving comment at the top of `viewFilters.ts`,
which names a function and its bare file and has never needed correcting because
it carries nothing that can rot.

**2. Target is a test → quote the `it(...)` / `describe(...)` TITLE, plus bare
path.** Test files export nothing to anchor on, so the title is the only stable
handle they have.

*Justify this honestly, because it is weaker than form 1 and the weakness is
real.* A title is mutable; it is not rot-proof. The argument is about WHICH WAY
it rots. A line number rots on every unrelated edit above it, silently, and does
NOT rot when the cited test's meaning changes — so it is wrong exactly when you
would not think to check, and right exactly when the citation has quietly become
a lie. A title inverts both: it survives unrelated edits untouched, and it
changes precisely when the test's meaning changes — at which point the citing
comment SHOULD be revisited, and a grep for the old title fails loudly instead of
resolving to unrelated code. Rot-visible, not rot-proof. Claim no more than that.

**3. Target is module-level test setup (a mock, an import-ordering convention) →
name the `jest.mock('<specifier>', …)` call or the imported identifier, plus bare
path.** Two of the seventeen sites point at mocks, which have no title at all;
form 2 does not cover them and pretending it does would produce a vague anchor.

**4. Target is a CSS rule → name the class selector, plus bare path.**

In all four forms: drop the number entirely. Do NOT leave a "was previously at
line N" note — carrying the superseded number reintroduces the exact rot this
removes and fails gate 2A.
</the_anchor_convention>

<the_fork>
Inherited from the sibling unchanged. Classify EVERY citation from the citing
sentence's OWN WORDING before editing it.

**CASE A — the cited code MOVED.** The sentence describes something that still
exists, somewhere. Re-anchor per `<the_anchor_convention>`.

**CASE B — the cited code was REPLACED and no longer exists in that form.**
Re-pointing it would make it assert something FALSE about the present, which is
strictly worse than the stale pointer: a stale number announces its own rot on
inspection, a re-pointed historical claim does not. Fix: reword as history (past
tense, no live citation), or delete the clause.

**A number that is CORRECT today is still Case A and is still converted.** A
correct number is rot-in-waiting, and leaving some numbers while removing others
rebuilds the ambiguity this family exists to end. Gate 2A pins the surviving
comment-citation count at ZERO, so "still accurate" does not exempt a site.

**CASE B FINDING, STATED EXPLICITLY AS THE TASK REQUIRES: none found.** All
seventeen sites were classified during planning and every one is Case A — in
each, the cited thing still exists and has merely moved or drifted. The four
that were plausible Case B candidates were checked individually and all four
survive: the rejected-step copy still renders, the server-truth classification
still exists, the D-77 Undo gate still exists as a prop, and the Keys-waiting
selector still exists. **Re-check this yourself as you edit — planning
measurement is a starting point, not authority.** If you DO find a Case B site,
treat it as history and say so in the SUMMARY; if you confirm none, the SUMMARY
must say "no Case B site found" explicitly rather than staying silent.
</the_fork>

<measured_facts>
Measured against the working tree at HEAD (`a4e9edbba`, clean apart from this
task's own untracked planning directory) during planning on 2026-09-29.
**Re-measure before relying on any of it — the tree is the authority.**

<!-- planner-discipline-allow: viewFilters.ts:62 -->
<!-- planner-discipline-allow: classify.ts:409 -->
<!-- planner-discipline-allow: HumbleKeyRow/index.tsx:116 -->
<!-- planner-discipline-allow: HumbleKeyRow:116 -->
<!-- planner-discipline-allow: index.tsx:556 -->
<!-- planner-discipline-allow: keyTypePresentation.ts:89 -->
<!-- planner-discipline-allow: library.ts:258 -->
<!--
  The literals above are this task's subject matter; the plan cannot name what
  must be removed without spelling it. They are allowlisted because gates 2A and
  2B grep the seven SOURCE files and never this plan. The executor must not copy
  any of them into a source comment.
-->

**Census re-derived at HEAD: 18 citations across 7 files** (not 8 — the census
file's own file tally lists seven paths). 17 in scope, 1 excluded by the ruling.

| # | citing site | cites | resolved target at HEAD | verdict | case |
|---|---|---|---|---|---|
| 1 | `keyTypePresentation.test.ts:275` | the key-type allowlist in `classify.ts` | `KNOWN_GAME_KEY_TYPES` declaration | accurate | A |
| 2 | `userAgent.test.ts:5` | `userAgent.ts` | `standardBrowserUserAgent` | accurate | A |
| 3 | `userAgent.test.ts:29` | `userAgent.ts` | the UA template string | accurate | A |
| 4 | `userAgent.test.ts:31` | `userAgent.ts` | the platform-extraction regex | accurate | A |
| 5 | `library.test.ts:2861` | server-truth classification in `classify.ts` | comment/raw-tpk region, NOT the flag | **stale** | A |
| 6 | `library.test.ts:3501` | the D-77 Undo gate, **bare `Symbol:NNN` form** | — | **stale** | A |
| 7 | `library.test.ts:3502` | the D-77 Undo gate in `HumbleKeyRow` | docblock prose, not the prop | **stale** | A |
| 8 | `Keys/index.css:187` | a NavShell theme-token census test | that `it(...)` still exists | accurate | A |
| 9 | `Keys/index.css:188` | a NavShell SANITY test | that `it(...)` still exists | accurate | A |
| 10 | `HumbleKeyRow/__tests__/index.test.tsx:14` | an import-after-mocks convention | lands on the explaining comment; the import is 2 lines below | near-miss | A |
| 11 | `HumbleKeyRow/__tests__/index.test.tsx:23` | the `react-i18next` `t` mock | range covers the comment + the mock | accurate | A |
| 12 | `HumbleKeyRow/__tests__/index.test.tsx:1087` | the Keys-waiting selector | inside the D-53 docblock, not the selector | **stale** | A |
| 13 | `HumbleKeyRow/__tests__/index.test.tsx:1105` | the settle-merge in `library.ts` | exact hit on the merge expression | **accurate** | A |
| 14 | `HumbleKeyRow/__tests__/index.test.tsx:1267` | the `gog_keyless` presentation entry | lands on the QT comment above it | near-miss | A |
| 15 | `HumbleClaimWizard/__tests__/index.test.tsx:747` | the terminal rejected-step copy | **not there** — the copy is ~40 lines lower | **stale** | A |
| 16 | `humbleKeysStylesheet.test.ts:29` | a NavShell theme-token census test | that `it(...)` still exists | accurate | A |
| 17 | `humbleKeysStylesheet.test.ts:32` | a NavShell SANITY test | that `it(...)` still exists | accurate | A |
| — | `humbleKeysStylesheet.test.ts:101` | **IN-TITLE — EXCLUDED BY RULING** | — | — | — |
| 18 | `humbleKeysStylesheet.test.ts:342` | a `HumbleKeyRow` scenario test | lands inside a test BODY | near-miss | A |

**Anchor targets resolved during planning** (re-derive each with `grep -n`; these
are a starting point, and rows 13/15 in particular were resolved by reading the
code, so confirm before writing):

| referent | anchor to write | lives in |
|---|---|---|
| the key-type allowlist | `KNOWN_GAME_KEY_TYPES` | `classify.ts` |
| the standard UA builder | `standardBrowserUserAgent` | `userAgent.ts` |
| the settle-merge carrying `ownedElsewhere`/`matchConfidence` forward | the merge inside `fetchAndCommitOrder` — **verify the enclosing function yourself**, the merge is ~90 lines below its declaration | `library.ts` |
| the `gog_keyless` presentation entry | the `gog_keyless` entry in `KEY_TYPE_PRESENTATIONS` | `keyTypePresentation.ts` |
| the Keys-waiting selector | `selectKeysWaiting` | `viewFilters.ts` |
| the D-77 Undo affordance prop | `settleAction` | `HumbleKeyRow/index.tsx` |
| the terminal rejected-step copy | the `humbleClaimWizardRejectedNote` paragraph | `HumbleClaimWizard/index.tsx` |
| the import-after-mocks convention | the `import HumbleClaimWizard from '../index'` below the mocks | `HumbleClaimWizard/__tests__/index.test.tsx` |
| the dual-call-shape `t` mock | the `jest.mock('react-i18next', …)` call | `HumbleClaimWizard/__tests__/index.test.tsx` |
| the scenario-resolution tests | the `describe` titled `'HumbleKeyRow KEY-column scenario resolution (D-43-17, Phase 43 plan 06)'` — **confirm whether a narrower `it` title is the truer anchor** | `HumbleKeyRow/__tests__/index.test.tsx` |
| the NavShell census / SANITY tests | their `it(...)` titles, ALREADY quoted verbatim beside all four citing sites | `themeTokens.test.ts`, `appShellLayout.test.ts` |

That last row matters: rows 8, 9, 16 and 17 already quote the target's `it()`
title on the line beneath the citation. For those four the work is to DELETE the
`path:NNN` line and keep the quoted title, not to invent an anchor.

**`stripSourceComments` verdict — measured, not assumed.** The helper strips
`/* … */` block comments FIRST, then drops whole lines beginning with a comment
marker. CSS comments are `/* … */`, so `index.css` comment prose is stripped
before any assertion sees it. Confirmed numerically: the comment-stripped
`index.css` contains ZERO citations while the raw file contains two. Separately
confirmed by reading all four SANITY tests in `humbleKeysStylesheet.test.ts`
(lines 154-206): every one asserts against an INLINE fixture string, never the
real file. So a comment edit to `index.css` cannot move any assertion.

The residual hazard is the DELIMITERS, not the prose: delete or introduce a `*/`
and the strip boundary moves, silently changing what the gate scans. Gate 2C
catches exactly this.

**Prettier visibility, measured per path** (`npx prettier --file-info`, one path
per invocation — the flag rejects multiple files). Matched space-tolerantly;
prettier emits a space after each colon and inside the braces.

| path | ignored | parser |
|---|---|---|
| `keyTypePresentation.test.ts` | false | typescript |
| `userAgent.test.ts` | false | typescript |
| `library.test.ts` | false | typescript |
| `Keys/index.css` | false | **css** |
| `HumbleKeyRow/__tests__/index.test.tsx` | false | typescript |
| `HumbleClaimWizard/__tests__/index.test.tsx` | false | typescript |
| `humbleKeysStylesheet.test.ts` | false | typescript |

All seven are prettier-VISIBLE, so `--check` is real assurance here, not the
vacuous green the project convention warns about.

**Jest baselines, measured in isolated runs at HEAD:**

| project | pattern | suites | tests | titles | unique |
|---|---|---|---|---|---|
| `Backend` | `humble/__tests__/(library\|keyTypePresentation\|userAgent)` | 4 | 230 | 230 | 230 |
| `Frontend` | `screens/Humble/Keys` | 4 | 209 | 209 | 209 |

The Backend pattern pulls in `library.realstore.test.ts` alongside the three
edited files — that is fine and deliberate, it is a superset. The Frontend
pattern covers all three edited frontend test files PLUS the stylesheet gate
that reads `index.css`, which is the suite most likely to notice a CSS comment
edit. Every title in both projects is unique, so a sorted-list comparison in
gate 3A is exact rather than approximate.
</measured_facts>

<out_of_scope_disclosure>
**`index.css` carries EIGHT further citations that this task does NOT touch.**
Found while re-deriving the census with a widened pattern. They point at other
STYLESHEETS, not at TypeScript — three at the app-level stylesheet, and one each
at five component stylesheets.

They are the same defect class. They are out of scope because this task's
mandate is the `file.ts(x):NNN` family, and because sweeping them would put
edits in five unrelated comment regions of a file whose in-scope work is two
lines — making the diff materially harder to audit against the "changed nothing
that executes" constraint that is the whole point here.

**This is why gate 2A's pattern must stay `\.tsx?:` and must NOT be "tidied" into
`\.(tsx?|css):`.** Widening it makes the gate count those eight and go
permanently red for reasons outside the task. Along with the whole-file-vs-
comment-scope trap from the ruling, that is two independent ways to render this
gate unsatisfiable. Both are recorded in `must_haves.key_links`.

The SUMMARY must record these eight as deliberately deferred with this reason,
not omitted — the `260929-vmb` disclosure standard.
</out_of_scope_disclosure>

<red_gates>
Measured RED at HEAD during planning, so a green afterwards is informative rather
than vacuous. What each printed:

- **Gate 2A (citation truth, comment-scoped).** Printed a per-file table and
  `TOTAL=18  NONCOMMENT=1`. Per-file totals: 1, 3, 2, 2, 5, 1, 4. Every file's
  non-comment count was 0 except `humbleKeysStylesheet.test.ts`, whose single
  non-comment hit the gate located and printed as the `it("no no-fallback
  var(--divider) is introduced …")` line — i.e. the site the ruling excludes,
  and nothing else. Target: `TOTAL=1  NONCOMMENT=1`.
- **Gate 2B (bare `Symbol:NNN`).** Printed one hit — `library.test.ts:3501`,
  the line reading `// so the existing …Row:116 Undo gate (redeemedAt !== null)
  keeps`. Target: 0. This form has no file extension, so gate 2A's pattern is
  blind to it; it sits one line above a citation 2A DOES see.
- **Gate 2C (comment-only, strip-equivalence).** Cannot be RED at HEAD by
  construction — with no edits, stripped-pre equals stripped-post trivially. So
  it was VALIDATED INSTEAD, in a throwaway git repo containing one CSS file with
  a bare-prose block-comment interior and one TS file, four arms:

  | arm | edit | wanted | got |
  |---|---|---|---|
  | 1 | comment-only, both files, incl. a bare-prose CSS interior line | PASS | **PASS** |
  | 2 | smuggled one-line code change (`color: red` → `blue`) | FAIL | **FAIL** |
  | 3 | deleted a closing `*/`, moving the strip boundary | FAIL | **FAIL** |
  | 4 | citation folded into a trailing `//` on a code line | FAIL | **FAIL** |

  Arm 3 is the delimiter hazard, caught. Arm 4 is the documented limitation,
  confirmed by measurement rather than assumed — which is why task 2's action
  forbids that shape.

  Also measured, because gate 2C's rationale asserts it: **the sibling's
  prefix-classifying form FALSE-FAILS on this file set**, in two independent
  ways. Run against arm 1's comment-only CSS edit it reported `2` non-comment
  changed lines, misclassifying the single-star `/*` opener — its allowlist
  carries `/\*\*` and `\*/` but not a bare `/\*`. Run against an edit touching
  ONLY a bare-prose interior line it again reported `2`, misclassifying both
  sides of that line, which carries no comment marker at all. The
  strip-equivalence form passed both correctly. This is the measured reason
  gate 2C does not reuse the sibling's shape; it is not a stylistic preference.
- **Gate 3A (title-set identity).** Baseline captured and counted at HEAD: 230
  Backend titles, 209 Frontend titles, all unique within each project.
- **Prettier.** Baseline at HEAD over all seven paths: exit 0.

**The zsh pathspec trap, inherited and still live.** zsh does NOT word-split
unquoted parameter expansions, so `git diff -- $PATHS` passes ONE pathspec
containing spaces and matches no file — reporting a false clean. Every git
invocation below writes its paths LITERALLY. Do not "tidy" them into a variable.
</red_gates>

<tasks>

<task type="auto">
  <name>Task 1: Capture the pre-edit baseline — title sets, counts, census — BEFORE touching any file</name>

  <files>(no source files written — writes only to the scratchpad)</files>

  <read_first>
Read `260929-wyk-SCOPE-DECISION.md` in full first. It is a ruling and it dictates
the shape of gate 2A.

This task MUST complete before any edit in task 2. The title-identity gate is a
pre/post comparison and there is no way to reconstruct a "before" once the files
are edited — `git stash` would work but adds a failure mode with no upside.
  </read_first>

  <action>
Write nothing to `src/`. This task only measures.

Capture three things into the session scratchpad directory:

1. The sorted list of every test title jest reports for the Backend project,
   scoped to the pattern in `<measured_facts>`. Take it from jest's own JSON
   output, reading the composed `describe > it` name for every assertion result.
   Do NOT hand-roll a regex title extractor: titles here span multiple lines,
   mix quote styles, and include parameterised forms, so a regex would
   under-match — and an under-matching title extractor fails in the PASSING
   direction, which is the one failure mode this gate exists to prevent.
2. The same for the Frontend project, scoped to its pattern.
3. The re-derived citation census across the seven files.

Cross-check the counts against the planning baselines recorded in
`<measured_facts>` — Backend 4 suites / 230 tests, Frontend 4 suites / 209
tests, census total 18. A mismatch does not necessarily mean something is wrong
(another session may have landed work), but it DOES mean you must re-derive the
site table in `<measured_facts>` yourself rather than trusting it, and say so in
the SUMMARY.

Run each jest invocation as its OWN shell command. Chaining a jest run onto
another command with `&&` has returned pre-write results on this repo.
  </action>

  <verify>
    <automated>
# Gate 1A — Backend baseline captured, counted, and scoped.
# The trailing "Ran all test suites matching /.../i." line is asserted because a
# bare positional path alongside --selectProjects is SILENTLY DROPPED, in which
# case jest sweeps the whole project and the line reads "Ran all test suites."
# instead. --selectProjects is CASE-SENSITIVE: `Backend`, not `backend`.
cd /Users/graysonmitchell/Projects/GameLib && \
S="${SCRATCHPAD:-/tmp}" && mkdir -p "$S" && \
OUT=$(npx jest --selectProjects Backend \
  --testPathPattern 'humble/__tests__/(library|keyTypePresentation|userAgent)' \
  --json --outputFile "$S/be-before.json" 2>&1) && \
printf '%s\n' "$OUT" | grep -q 'Ran all test suites matching' && \
node -e 'const r=require(process.argv[1]);const t=r.testResults.flatMap(s=>s.assertionResults.map(a=>a.fullName)).sort();require("fs").writeFileSync(process.argv[2],t.join("\n")+"\n");console.log("suites="+r.numTotalTestSuites+" tests="+r.numTotalTests+" titles="+t.length)' \
  "$S/be-before.json" "$S/be-titles-before.txt" && \
[ "$(wc -l < "$S/be-titles-before.txt" | tr -d ' ')" -gt 0 ]
    </automated>
    <automated>
# Gate 1B — Frontend baseline. Own invocation, nothing chained before it.
cd /Users/graysonmitchell/Projects/GameLib && \
S="${SCRATCHPAD:-/tmp}" && \
OUT=$(npx jest --selectProjects Frontend \
  --testPathPattern 'screens/Humble/Keys' \
  --json --outputFile "$S/fe-before.json" 2>&1) && \
printf '%s\n' "$OUT" | grep -q 'Ran all test suites matching' && \
node -e 'const r=require(process.argv[1]);const t=r.testResults.flatMap(s=>s.assertionResults.map(a=>a.fullName)).sort();require("fs").writeFileSync(process.argv[2],t.join("\n")+"\n");console.log("suites="+r.numTotalTestSuites+" tests="+r.numTotalTests+" titles="+t.length)' \
  "$S/fe-before.json" "$S/fe-titles-before.txt" && \
[ "$(wc -l < "$S/fe-titles-before.txt" | tr -d ' ')" -gt 0 ]
    </automated>
    <automated>
# Gate 1C — census re-derived and RED, proving there is work to do. Pattern is
# `\.tsx?:` deliberately; see <out_of_scope_disclosure> for why widening it to
# admit `.css:NNN` makes gate 2A permanently unsatisfiable.
cd /Users/graysonmitchell/Projects/GameLib && \
N=$(grep -ohE '[A-Za-z0-9_/.-]+\.tsx?:[0-9]+' \
  src/backend/humble/__tests__/keyTypePresentation.test.ts \
  src/backend/humble/__tests__/userAgent.test.ts \
  src/backend/humble/__tests__/library.test.ts \
  src/frontend/screens/Humble/Keys/index.css \
  src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts \
  | wc -l | tr -d ' ') && \
printf 'census at start: %s (planning measured 18)\n' "$N" && \
[ "$N" -gt 1 ]
    </automated>
  </verify>

  <done>
Both title baselines exist in the scratchpad as sorted, non-empty files, each
produced by a run whose trailing line proves the path filter applied. The
starting census is recorded and is greater than 1, so the later gates measure a
real change. No file under `src/` was modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Re-anchor all 17 in-comment citations across the seven files</name>

  <files>src/backend/humble/__tests__/keyTypePresentation.test.ts, src/backend/humble/__tests__/userAgent.test.ts, src/backend/humble/__tests__/library.test.ts, src/frontend/screens/Humble/Keys/index.css, src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx, src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx, src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts</files>

  <read_first>
Re-derive the census yourself and read BOTH ends of every hit — the citing
sentence AND the cited target — before editing it. The site table in
`<measured_facts>` is a starting point that was measured at `a4e9edbba`; the tree
is the authority.

Four sites need real judgement rather than a lookup, and each is called out in
the table:

- The settle-merge referent. The citing sentence claims a specific pair of
  fields is carried forward through settle and never cleared. Confirm that is
  still what the code does before naming it, and derive the ENCLOSING function
  yourself — the merge sits roughly 90 lines below its function's declaration,
  so the nearest declaration above it is not obviously the right anchor.
- The terminal rejected-step referent. The cited copy key appears at THREE
  places in that component. Determine from the citing sentence which one is the
  terminal rejected step, and anchor on the surrounding class name rather than
  on the copy key, which is not unique.
- The scenario-resolution referent. The cited range lands inside a test BODY,
  not on a title. Scan upward for the enclosing block and decide whether the
  `describe` title or a narrower parameterised `it` title is the truer anchor.
- The import-after-mocks referent. The cited line is the explaining comment, not
  the import it explains. Anchor on the import, per form 3 of the convention.

Four other sites need almost no work: the two in `index.css` and the two in
`humbleKeysStylesheet.test.ts` already quote their target's `it()` title on the
following line. There, delete the citation line and keep the quoted title.
  </read_first>

  <action>
Comment-only edits across all seven files. For every citation that is NOT the
site excluded by the ruling, replace the line-number pointer with an anchor per
`<the_anchor_convention>`, choosing the form that matches what the target
actually is. Drop the number entirely.

Also fix the bare `Symbol:NNN` citation in the backend library test — the one
with no file extension, on the line directly above a citation that DOES carry
one. Both lines describe the same D-77 Undo gate and both must end up anchored
on the same prop name. Fixing only the extension-bearing one would leave a stale
pointer one line away from its own correction, and gate 2A cannot see it; gate
2B exists for precisely this.

Use the SAME anchor wording everywhere a referent is cited more than once, so a
future reader greps one phrase and finds every site.

**Hard constraints — these are test files, and this is the whole risk:**

- Do NOT touch an `it`, `describe` or `test` title, an `expect(...)`, a fixture
  value, a mock implementation, an import, or any declaration. An edit that
  silently changes what a test verifies is worse than every stale citation in
  this task combined, because the suite stays green while proving something
  different.
- Do NOT edit the site the ruling excludes, and do not edit around it in a way
  that changes its line content.
- Keep every citation on its OWN comment line. Do not fold one into a trailing
  comment on a code line. The shipped comment stripper has a documented
  limitation — it does not remove trailing `//` comments from code lines — so
  gate 2C, which mirrors it, cannot distinguish a trailing-comment edit from a
  code change and would fail you for a legitimate edit.
- In the stylesheet, do not add, remove or relocate a `*/`. The comment
  delimiters set the boundary the stylesheet gate's stripper uses; moving one
  changes what that gate scans without changing any prose it reports on.
- Do NOT edit any CITED file to match the comments. The code is correct; only
  the comments describing it are wrong. None of the cited-into files is in
  `<files>`.
- Do NOT retain a superseded number anywhere, in prose or as a parenthetical.
- Preserve every surrounding explanation intact. These comments carry decision
  IDs and measured findings; you are replacing pointers, not compressing prose.
- Leave the eight stylesheet-to-stylesheet citations in the CSS file alone. They
  are disclosed in `<out_of_scope_disclosure>` and are deliberately deferred.
- Hand-wrap prose to match the surrounding corpus. Prettier does not reflow
  comment text, so `--check` passes either way; the wrap is house style the
  formatter cannot enforce for you.
  </action>

  <verify>
    <automated>
# Gate 2A — CITATION TRUTH, COMMENT-SCOPED per the SCOPE-DECISION ruling.
# Counts citations in the WHOLE file and in the file with comments stripped
# (mirroring src/backend/testUtils/stripSourceComments.ts: block comments first,
# then whole lines beginning with a comment marker). Requires TOTAL == NONCOMMENT
# == 1, and locates that 1 so the exclusion cannot silently widen into cover for
# a missed comment site.
#
# TWO widenings would each make this gate UNSATISFIABLE, both recorded in
# must_haves.key_links. Do not apply either:
#   - scoping it whole-file: the only way to green is editing the it() title the
#     ruling forbids touching.
#   - widening `\.tsx?:` to `\.(tsx?|css):`: drags in 8 out-of-scope citations.
# Measured RED at HEAD: TOTAL=18 NONCOMMENT=1.
cd /Users/graysonmitchell/Projects/GameLib && \
PAT='[A-Za-z0-9_/.-]+\.tsx?:[0-9]+' && \
strip() { perl -0777 -pe 's{/\*.*?\*/}{}gs' "$1" | grep -vE '^[[:space:]]*(//|\*|/\*)'; } && \
TOTAL=0; NONC=0 && \
for f in \
  src/backend/humble/__tests__/keyTypePresentation.test.ts \
  src/backend/humble/__tests__/userAgent.test.ts \
  src/backend/humble/__tests__/library.test.ts \
  src/frontend/screens/Humble/Keys/index.css \
  src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts ; do \
  t=$(grep -ohE "$PAT" "$f" | wc -l | tr -d ' '); \
  n=$(strip "$f" | grep -ohE "$PAT" | wc -l | tr -d ' '); \
  TOTAL=$((TOTAL + t)); NONC=$((NONC + n)); \
  printf '%-90s total=%2s noncomment=%s\n' "$f" "$t" "$n"; \
done && \
printf '\nTOTAL=%s NONCOMMENT=%s (want 1 and 1; was 18 and 1 at HEAD)\n' "$TOTAL" "$NONC" && \
LOC=$(strip src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts | grep -cE "$PAT") && \
printf 'excluded in-title citations located in humbleKeysStylesheet.test.ts: %s (want exactly 1)\n' "$LOC" && \
[ "$NONC" -eq 1 ] && [ "$LOC" -eq 1 ] && [ "$TOTAL" -eq 1 ]
    </automated>
    <automated>
# Gate 2B — the bare `Symbol:NNN` citation, which has no file extension and is
# INVISIBLE to gate 2A's pattern. Measured RED at HEAD: 1 hit at library.test.ts
# line 3501, one line above a citation 2A does see.
cd /Users/graysonmitchell/Projects/GameLib && \
N=$(grep -cE '\bHumbleKeyRow:[0-9]+' src/backend/humble/__tests__/library.test.ts || true) && \
printf 'bare Symbol:NNN citations: %s (want 0, was 1 at HEAD)\n' "$N" && \
{ [ "$N" -eq 0 ] || { grep -nE '\bHumbleKeyRow:[0-9]+' src/backend/humble/__tests__/library.test.ts; exit 1; }; }
    </automated>
    <automated>
# Gate 2C — COMMENT-ONLY, by STRIP-EQUIVALENCE rather than diff-line prefixes.
#
# Why not the sibling's prefix-classifying form -- MEASURED, two independent
# false-fail mechanisms, both reproduced in a throwaway repo during planning:
#   (a) `index.css`'s block-comment interiors are BARE PROSE with no leading
#       marker, so a prefix filter classifies them as code. An edit touching
#       only such a line scored 2 non-comment changed lines.
#   (b) its allowlist carries `/\*\*` and `\*/` but not a bare `/\*`, so a
#       single-star CSS comment OPENER is also misclassified. Scored 2 as well.
# Comparing comment-STRIPPED content instead passed both correctly, works for
# CSS and TS alike, and additionally catches the delimiter hazard a prefix
# filter cannot see: deleting or adding a `*/` moves the strip boundary, which
# shows up here as changed stripped content (validation arm 3).
#
# Honest limitation, stated rather than implied: this mirrors the shipped
# stripper, which does NOT remove trailing `//` comments from code lines. A
# citation folded into a trailing comment would read here as a code change. Task
# 2's action forbids that shape for exactly this reason.
#
# Run BEFORE the task commit. If you already committed, pin to your SHA:
# replace `HEAD:` with `<sha>^:` and `git diff --` with `git diff <sha>^..<sha> --`.
# No relative HEAD~N anchor is used: this repo runs parallel sessions and
# worktrees, so HEAD~1 can name another session's commit. The bare `git diff`
# here is deliberate and NOT vacuous-on-commit: the empty-diff guard below FAILS
# rather than passes when there is nothing to measure.
#
# The preflight loop exists because `git show` later runs inside a process
# substitution -- a non-final pipeline stage, whose failure status would be
# swallowed. The preflight captures that status in its own statement first, so a
# broken `git show` halts instead of reading clean.
cd /Users/graysonmitchell/Projects/GameLib && \
strip() { perl -0777 -pe 's{/\*.*?\*/}{}gs' | grep -vE '^[[:space:]]*(//|\*|/\*)'; } && \
DIFF=$(git diff -U0 -- \
  src/backend/humble/__tests__/keyTypePresentation.test.ts \
  src/backend/humble/__tests__/userAgent.test.ts \
  src/backend/humble/__tests__/library.test.ts \
  src/frontend/screens/Humble/Keys/index.css \
  src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts) \
  || { printf 'git diff FAILED -- gate measured nothing\n'; exit 1; } && \
{ [ -n "$DIFF" ] || { printf 'EMPTY DIFF -- nothing written, or already committed (see note above)\n'; exit 1; }; } && \
for f in \
  src/backend/humble/__tests__/keyTypePresentation.test.ts \
  src/backend/humble/__tests__/userAgent.test.ts \
  src/backend/humble/__tests__/library.test.ts \
  src/frontend/screens/Humble/Keys/index.css \
  src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts ; do \
  git show "HEAD:$f" > /dev/null \
    || { printf 'git show FAILED for %s -- gate would have measured nothing\n' "$f"; exit 1; }; \
done && \
fail=0 && \
for f in \
  src/backend/humble/__tests__/keyTypePresentation.test.ts \
  src/backend/humble/__tests__/userAgent.test.ts \
  src/backend/humble/__tests__/library.test.ts \
  src/frontend/screens/Humble/Keys/index.css \
  src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts ; do \
  if ! diff <(git show "HEAD:$f" | strip) <(strip < "$f") > /dev/null; then \
    printf 'NON-COMMENT CHANGE in %s:\n' "$f"; \
    diff <(git show "HEAD:$f" | strip) <(strip < "$f") | head -20; fail=1; \
  fi; \
done && \
[ "$fail" -eq 0 ] && printf 'all 7 files: comment-stripped content byte-identical to HEAD\n'
    </automated>
    <automated>
# Gate 2D — FORMATTER. All seven paths measured prettier-VISIBLE during planning
# (six typescript, one css; "ignored": false for every one), so this is real
# assurance, not the vacuous green the project convention warns about. Scoped to
# the seven exact paths, never a bare `.` -- src/preload/.prettierrc sets
# printWidth 120 against the root's 80, so directory scope changes the answer.
cd /Users/graysonmitchell/Projects/GameLib && \
npx prettier --check \
  src/backend/humble/__tests__/keyTypePresentation.test.ts \
  src/backend/humble/__tests__/userAgent.test.ts \
  src/backend/humble/__tests__/library.test.ts \
  src/frontend/screens/Humble/Keys/index.css \
  src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx \
  src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
    </automated>
  </verify>

  <done>
Exactly one `file.ts(x):NNN` citation survives across the seven files — the
in-title site the ruling excludes — and the gate proves it is that one and not a
missed comment. The bare `Symbol:NNN` form is gone. Every file's comment-stripped
content is byte-identical to HEAD, so nothing that executes changed. All seven
paths pass a scoped, non-vacuous formatter check.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove the test-title set is byte-identical and both projects are green</name>

  <files>(no files written — verification only)</files>

  <precondition>
Task 1's baseline files exist in the scratchpad (`be-titles-before.txt` and
`fe-titles-before.txt`), and task 2's edits are on disk. If either baseline is
missing, STOP: it cannot be reconstructed after the edits, and re-running task 1
now would capture a post-edit "baseline" that makes gate 3A vacuously green.
  </precondition>

  <read_first>
This task writes nothing. Run each command as its OWN shell invocation, after
task 2's edits are already on disk.

This is not stylistic. Chaining a jest run onto a file write with `&&` has
returned results for the PRE-write file on this repo — observed three times, once
putting a silently undercounted suite total into a committed summary that a
later task had to correct. Treat any count taken that way as unmeasured.
  </read_first>

  <action>
The seven edited files span BOTH jest projects. Run each project scoped to the
pattern in `<measured_facts>`, capture the composed test titles again, and diff
the sorted lists against task 1's baselines.

The title diff is the gate that matters most here, and it is why this task is
separate from a plain "the suite is still green" check. A green suite proves
nothing about whether an `it` title was edited: rename a test and the suite stays
green while CI reports, `--testNamePattern` filters, and every planning artifact
quoting that name all silently point at something else. The comment-only check in
gate 2C would also miss it if the rename landed on a line that also changed a
comment.

Record the observed suite and test counts for BOTH projects in the SUMMARY. If
they differ from the baselines, do NOT assume the comment edit caused it — a
comment edit cannot change behaviour. Re-measure by holding the tree constant and
varying nothing else before attributing anything.

Note for context, not action: `pnpm lint` and `pnpm test:ci` are known-red at
HEAD on this repo for unrelated unowned debt. Neither is in this task's scope nor
caused by this change. Do not attempt to fix them here.
  </action>

  <verify>
    <automated>
# Gate 3A — BACKEND: title set byte-identical, suite green, filter proven applied.
# Baseline at HEAD: 4 suites / 230 tests / 230 titles, all unique (so a sorted
# list comparison is exact, not approximate).
# Titles come from jest's own composed `describe > it` names, NOT a regex: titles
# here span lines and mix quote styles, and a regex extractor that under-matches
# fails in the PASSING direction.
cd /Users/graysonmitchell/Projects/GameLib && \
S="${SCRATCHPAD:-/tmp}" && \
[ -s "$S/be-titles-before.txt" ] || { printf 'BASELINE MISSING -- task 1 did not run first; gate cannot measure\n'; exit 1; } && \
OUT=$(npx jest --selectProjects Backend \
  --testPathPattern 'humble/__tests__/(library|keyTypePresentation|userAgent)' \
  --json --outputFile "$S/be-after.json" 2>&1) && \
printf '%s\n' "$OUT" | grep -q 'Ran all test suites matching' && \
printf '%s\n' "$OUT" | grep -qE 'Tests:[[:space:]]+[0-9]+ passed' && \
node -e 'const r=require(process.argv[1]);const t=r.testResults.flatMap(s=>s.assertionResults.map(a=>a.fullName)).sort();require("fs").writeFileSync(process.argv[2],t.join("\n")+"\n");console.log("suites="+r.numTotalTestSuites+" tests="+r.numTotalTests+" titles="+t.length)' \
  "$S/be-after.json" "$S/be-titles-after.txt" && \
diff "$S/be-titles-before.txt" "$S/be-titles-after.txt" \
  || { printf 'TEST TITLES CHANGED in Backend -- a test was renamed. This is the failure this task exists to prevent.\n'; exit 1; } && \
printf 'Backend: title set byte-identical (%s titles)\n' "$(wc -l < "$S/be-titles-after.txt" | tr -d ' ')" && \
printf '%s\n' "$OUT" | tail -5
    </automated>
    <automated>
# Gate 3B — FRONTEND: same, own invocation. Baseline at HEAD: 4 suites / 209
# tests / 209 titles. This pattern covers all three edited frontend test files
# PLUS humbleKeysStylesheet.test.ts, the source-text gate that reads index.css --
# the suite most likely to notice a stylesheet comment edit, and the reason a
# broken `*/` delimiter cannot slip through unnoticed.
cd /Users/graysonmitchell/Projects/GameLib && \
S="${SCRATCHPAD:-/tmp}" && \
[ -s "$S/fe-titles-before.txt" ] || { printf 'BASELINE MISSING -- task 1 did not run first; gate cannot measure\n'; exit 1; } && \
OUT=$(npx jest --selectProjects Frontend \
  --testPathPattern 'screens/Humble/Keys' \
  --json --outputFile "$S/fe-after.json" 2>&1) && \
printf '%s\n' "$OUT" | grep -q 'Ran all test suites matching' && \
printf '%s\n' "$OUT" | grep -qE 'Tests:[[:space:]]+[0-9]+ passed' && \
node -e 'const r=require(process.argv[1]);const t=r.testResults.flatMap(s=>s.assertionResults.map(a=>a.fullName)).sort();require("fs").writeFileSync(process.argv[2],t.join("\n")+"\n");console.log("suites="+r.numTotalTestSuites+" tests="+r.numTotalTests+" titles="+t.length)' \
  "$S/fe-after.json" "$S/fe-titles-after.txt" && \
diff "$S/fe-titles-before.txt" "$S/fe-titles-after.txt" \
  || { printf 'TEST TITLES CHANGED in Frontend -- a test was renamed. This is the failure this task exists to prevent.\n'; exit 1; } && \
printf 'Frontend: title set byte-identical (%s titles)\n' "$(wc -l < "$S/fe-titles-after.txt" | tr -d ' ')" && \
printf '%s\n' "$OUT" | tail -5
    </automated>
  </verify>

  <done>
Both scoped runs are green with non-zero test counts; each trailing line reads
"Ran all test suites matching /.../i." proving the filter applied rather than the
run silently sweeping the whole project; and both sorted title lists are
byte-identical to the pre-edit baselines. Suite and test counts for both projects
are recorded in the SUMMARY.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

**None. There is no trust boundary and no data flow in comment prose.**

This is stated plainly rather than dressed up, because inventing STRIDE rows for
a comment edit would be security theatre rather than analysis. This plan edits
block-comment and line-comment text in six TypeScript test files and one CSS
file. It adds no code path, no input handling, no I/O, no dependency, no network
or filesystem access, and no privilege transition. Nothing in the diff is
reachable by any actor, trusted or otherwise: comment text in the TypeScript
files is stripped at build time, and CSS comment text is inert.

## STRIDE Threat Register

Not applicable. Against the configured ASVS level 1 with a blocking threshold of
`high`, this plan contributes zero threats at any severity, so the register is
empty by measurement rather than by omission.

No package-manager install occurs, so the package-legitimacy gate does not arm
and no `T-*-SC` row is filed.

The genuine risk here is a CORRECTNESS risk, not a security one, and it is
handled by the task gates rather than by a mitigation row. Two specific shapes:

1. **A silently altered test.** These are test files; an edit that changes an
   `it`/`describe` title, an assertion or a fixture leaves the suite green while
   it verifies something different. Gates 2C (comment-stripped content identical
   to HEAD) and 3A/3B (sorted title lists byte-identical to a pre-edit baseline)
   close this from two independent directions.
2. **A confident false statement about current code.** Re-pointing a citation
   whose subject was REPLACED rather than moved asserts something false about the
   present, which is worse than the stale pointer it replaces. `<the_fork>`
   requires per-site classification; planning found no Case B site and the
   executor must confirm or contradict that in the SUMMARY.
</threat_model>

<verification>
Run from the repo root.

1. Baselines captured BEFORE any edit — task 1 gates 1A/1B/1C. Two non-empty
   sorted title files plus a starting census > 1. Order is load-bearing: the
   title baseline cannot be reconstructed afterwards.
2. Citation truth, comment-scoped — task 2 gate 2A. `TOTAL == NONCOMMENT == 1`,
   with that 1 located in `humbleKeysStylesheet.test.ts`. Measured RED at HEAD
   (`TOTAL=18 NONCOMMENT=1`), so a green is informative.
3. Bare `Symbol:NNN` form — task 2 gate 2B. Zero hits. Measured RED at HEAD (1).
4. Comment-only by strip-equivalence — task 2 gate 2C. Comment-stripped content
   byte-identical to HEAD for all seven files, with an empty-diff guard so it
   cannot pass by measuring nothing.
5. Formatter — task 2 gate 2D. `prettier --check` over the seven exact paths, all
   confirmed prettier-visible (six typescript, one css).
6. Title-set identity and suites green — task 3 gates 3A/3B. Backend 4/230,
   Frontend 4/209, both with a trailing "Ran all test suites matching" line and a
   byte-identical sorted title list.

Out of scope and expected to remain untouched: the in-title citation at
`humbleKeysStylesheet.test.ts` (excluded by ruling); the eight
stylesheet-to-stylesheet citations in `Keys/index.css` (disclosed in
`<out_of_scope_disclosure>`); every file cited but not edited; and the known-red
`pnpm lint` / `pnpm test:ci` gates.
</verification>

<success_criteria>
- All 17 in-comment citations across the seven files are re-anchored; the 18th
  survives untouched by ruling, and the gate proves the survivor is that one.
- Every citation is classified Case A or Case B from the citing sentence's own
  wording, and the classification is recorded in the SUMMARY — including an
  explicit statement of whether any Case B site was found.
- The set of test titles is byte-identical before and after in both jest
  projects.
- No non-comment content changed in any of the seven files.
- Both jest projects green at their measured baselines.
- The SUMMARY discloses both deliberate exclusions with their reasons.
</success_criteria>

<output>
Create `.planning/quick/260929-wyk-finish-the-stale-citation-family-the-18-/260929-wyk-SUMMARY.md` when done.

Record in it:
- The census re-derived at execution time and whether it differed from the 18
  measured at planning.
- The Case A / Case B verdict for every citation with a one-line justification
  from the citing sentence's wording — especially the four judgement calls named
  in task 2's `<read_first>`. **Say explicitly whether any Case B site was
  found.** Planning found none; if you agree, say "no Case B site found" rather
  than staying silent, because silence is indistinguishable from not having
  looked.
- Which citations were already ACCURATE and were converted anyway, with the
  rationale: a correct number is rot-in-waiting, and a mixed convention rebuilds
  the ambiguity this family exists to end.
- **EXCLUSION 1, with its reason:** the one citation carried inside an `it()`
  title in `humbleKeysStylesheet.test.ts` was deliberately NOT edited, per
  `260929-wyk-SCOPE-DECISION.md`. Title stability outranks citation hygiene
  because a title is the test's identity — what `--testNamePattern` filters on
  and what CI reports name — and renaming a test is a decision that deserves its
  own blast-radius check, not absorption into a comment sweep.
- **EXCLUSION 2, with its reason:** `Keys/index.css` carries eight further
  citations pointing at OTHER STYLESHEETS. Same defect class, deliberately
  deferred: outside the `file.ts(x):NNN` mandate, and sweeping them would scatter
  edits through five unrelated comment regions of a file whose in-scope work is
  two lines, making the diff materially harder to audit against the
  changed-nothing-that-executes constraint. Note that gate 2A's pattern must stay
  `\.tsx?:` for this reason.
- The anchor convention used for test-file targets (the `it`/`describe` title,
  or the `jest.mock` specifier for module-level setup) and its honest
  justification: a title is mutable and therefore rot-VISIBLE, not rot-proof — it
  changes when the test's meaning changes, which is exactly when the citation
  should be revisited, and a grep for the old title fails loudly instead of
  resolving to unrelated code.
- The measured finding that `stripSourceComments` neutralises `index.css`
  comment prose for the stylesheet gate, and that all four of that gate's SANITY
  tests run against inline fixtures rather than the real file — so the residual
  hazard was the `*/` delimiters, not the prose.
- The observed suite/test counts and the title-diff result for both jest
  projects.
</output>
