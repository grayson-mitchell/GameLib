---
phase: quick-260915-lhm
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [QUICK-260915-lhm]
files_modified:
  - .planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md
  - .planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md
  - .planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md
  - src/frontend/components/UI/SearchBar/searchProbe.ts
  - src/frontend/components/UI/SearchBar/index.tsx
  - src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts
  - .planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md

must_haves:
  truths:
    - "`.planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md` no longer exists; the file lives in `completed/` with its full history intact and a dated 2026-09-15 closing section appended."
    - "The closing section states that the PARKED section's UNRESOLVED ANOMALY (the `Winetricks/index.tsx` `useEffect` probe that never fired) was made MOOT by a different measurement, and was never explained. A reader cannot come away believing it was answered."
    - "`2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md` is still in `pending/` with `status: OPEN`, and its title and body describe only Half A (search filtering) and the hover-highlight half of Half B."
    - "That file's `files:` list no longer names `Winetricks/WinetricksSearch.tsx` (a path that does not exist) and names `Winetricks/WinetricksSearch/index.tsx` instead."
    - "That file records the F-4 contrast hypothesis explicitly labelled as UNPROVEN, and its cross-reference to the 2026-08-24 todo points at `completed/`, not `pending/`."
    - "`pnpm planning-gates` reports 11/11 PASS: every file left in `pending/` still carries bare lowercase `severity:`/`platform:`/`ready:` in that order."
    - "An opt-in, default-OFF instrumentation harness exists that, in ONE operator drive of the Library search bar, records all six captures listed in `<probe_captures>` below."
    - "The harness can distinguish 'the probe saw nothing' from 'the probe never ran' by three independent means: an on-screen badge, a durable `armed` record written at arm time before any interaction, and a `gamelib.log` line."
    - "Arming requires no DevTools console, no env-var build plumbing and no code edit: typing `::probe-on` into any GameLib search bar arms it."
    - "With the harness unarmed (the default), `SearchBar` renders and behaves byte-identically to head: the existing `suggestionFocusRace.test.tsx` suite still passes unchanged."
    - "`pnpm lint` still reports production 1123 and tests 638 — the harness adds ZERO warnings to either scope."
    - "No fix for the Library defect is attempted, and `SearchBar/index.tsx`'s existing `ROOT CAUSE FOUND` comment block is not amended."
  artifacts:
    - path: ".planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md"
      provides: "The closed 2026-08-24 todo, full history preserved, with a dated closing section"
      contains: "RESOLVED 2026-09-15"
    - path: ".planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md"
      provides: "The narrowed, still-OPEN selection/search todo"
      contains: "status: OPEN"
    - path: "src/frontend/components/UI/SearchBar/searchProbe.ts"
      provides: "Self-contained, default-OFF live instrumentation for the SearchBar suggestions list"
      exports: ["attachSearchProbe", "parseRgb", "relativeLuminance", "contrastRatio"]
      min_lines: 200
    - path: "src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts"
      provides: "Unit pins for the DOM-free colour arithmetic the probe's contrast finding rests on"
    - path: ".planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md"
      provides: "Operator drive script + the exact sqlite retrieval commands for the probe log"
  key_links:
    - from: "src/frontend/components/UI/SearchBar/index.tsx"
      to: "src/frontend/components/UI/SearchBar/searchProbe.ts"
      via: "useEffect calling attachSearchProbe(ulRef.current, value)"
      pattern: "attachSearchProbe"
    - from: ".planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md"
      to: ".planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md"
      via: "cross-reference updated to the completed/ path"
      pattern: "todos/completed/2026-08-24-winetricksinstall"
    - from: ".planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md"
      to: "src/frontend/components/UI/SearchBar/searchProbe.ts"
      via: "the todo names the harness as the instrument for its own diagnosis"
      pattern: "searchProbe"
---

<objective>
Close one winetricks todo that is genuinely resolved, NARROW (not close) a second one that is
only half-shipped, and build the live instrument the third one has been waiting for.

Purpose: three todos describe one tangled history. Two of them are now saying things that are
false — the 2026-08-24 title asserts a LIVE SILENT NO-OP that Phase 35 Plan 25 demonstrably
fixed, and the 2026-08-26 body reads as fully open when half of it shipped in that same commit.
The third (2026-08-30, the Library SearchBar mouse-dead defect) is correctly open, correctly
undiagnosed, and explicitly asks for "the same live-measurement treatment `35-25` Task 1 gave
winetricks". This task supplies exactly that instrument and nothing more.

Output: one todo moved to `completed/`, one todo rewritten in place and still OPEN, one
removable instrumentation harness, and an operator drive script.

**THIS TASK PRODUCES NO DIAGNOSIS AND NO FIX.** Explicitly out of scope: any behavioural change
to `SearchBar`, any amendment to `SearchBar/index.tsx`'s existing `ROOT CAUSE FOUND` comment
block, and the winetricks browse-UI redesign.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

@.planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md
@.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md
@.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md

@src/frontend/components/UI/SearchBar/index.tsx
@src/frontend/components/UI/SearchBar/index.scss
@src/frontend/components/UI/LibrarySearchBar/index.tsx
@src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx
@src/frontend/components/UI/SearchBar/__tests__/suggestionFocusRace.test.tsx
@src/frontend/jest.config.js
</context>

<verified_at_planning_time>
Every anchor below was re-derived at `a88104f8c` during planning. If any disagrees with the tree
you have, STOP and report the discrepancy rather than working around it — a stale anchor is the
finding, not an obstacle. Do NOT re-derive the ones that agree.

| # | Anchor | Measured |
|---|--------|----------|
| V-1 | `git show --stat 366e719bb` | 3 files: `SearchBar/index.tsx` (+20, comment only), `WinetricksSearch/index.tsx` (+47, the fix), `__tests__/winetricksInstallMouseRace.test.tsx` (new, 262 lines). Dated 2026-08-30 21:01 +1200. |
| V-2 | `SearchBar/index.tsx:129-145` | Carries the `ROOT CAUSE FOUND (Phase 35 Plan 25, 2026-08-30 ...)` retraction — so the 2026-08-26 todo's item 4 ("correct the stale 'proven by measurement' comment") HAS shipped. |
| V-3 | `2026-08-26 ...temperamental...md:11` | Pins `src/frontend/components/UI/Winetricks/WinetricksSearch.tsx`. That path does not exist. The real path is `.../WinetricksSearch/index.tsx`. |
| V-4 | `2026-08-26 ...temperamental...md:6-8` | `severity: major` / `platform: any` / `ready: code`, already bare + lowercase + correctly ordered. |
| V-5 | `2026-08-26 ...temperamental...md:40` | Cross-references `.planning/todos/pending/2026-08-24-...` — a path Task 1 invalidates. |
| V-6 | `grep -- '--accent:' src/frontend/themes.scss` | **10** definitions, spanning `#e0ab40`, `#00ddff`, `#ff9af7` … down to `#30444a` (dark slate). `--background` has 11. F-4's contrast hypothesis is live. |
| V-7 | `SearchBar/index.scss:52-55` | `li:hover { background-color: var(--accent); color: var(--background) }`. Nothing else styles hover. |
| V-8 | `LibrarySearchBar/index.tsx` | Suggestions are bare `<li onClick={() => handleClick(game)}>`. **No `<button>`, no `onMouseDown`.** So `35-25`'s mousedown-capture fix structurally does not apply to this consumer. |
| V-9 | `pnpm planning-gates` | 11/11 PASS at head. This is the gate for Tasks 1–2. |
| V-10 | `pnpm lint` | production **1123** / `SRC_CEILING` 1124 (ONE free slot); tests **638** / `TESTS_CEILING` 638 (**ZERO** free). Both `PASS`. |
| V-11 | `src/frontend/jest.config.js` | `displayName: 'Frontend'` (capital F — `--selectProjects frontend` matches nothing and exits 0). `testEnvironment` inherits **node**; **no jsdom is installed**. `testMatch` accepts both `.test.ts` and `.test.tsx`. |
| V-12 | `suggestionFocusRace.test.tsx:38-46` | Mocks `react` with `useEffect: () => undefined` and `useRef: (i) => ({current: i})`, spreading `actual` for the rest. Consequence: a new `useEffect` in `SearchBar` is INERT under that suite, and a new `useRef` is safe — but **`useState` would reach the real hook with a null dispatcher and throw.** |
| V-13 | `eslint.config.mjs:11-12` | `recommendedTypeChecked`, NOT `strictTypeChecked`. So `strict-boolean-expressions` and `no-unnecessary-condition` are off; `restrict-template-expressions` is **on at warn** and `no-explicit-any` is at **error** in the production scope. |
| V-14 | `grep -rn 'import.meta' src/` | **Zero hits.** Jest runs `ts-jest` in CJS; `import.meta` would throw. **Do not gate the probe on `import.meta.env`.** |
| V-15 | `find ~/Library/WebKit/{gamelib-shell,com.gamelib.shell} -name localstorage.sqlite3` | Both trees exist, with **many** origin directories each. Trap 3 of `[[read-webkit-localstorage-sqlite-directly]]` is live: pick by `-wal` mtime. |
| V-16 | gate scripts grepping `winetricks` | `34.5/ported-channels-gate.py`, `34.2/currency-gate.py`, `34.4.1/seam-parity-sweep-gate.py`. **None reads a `todos/pending/` path.** Moving the file breaks no gate. |
| V-17 | filename cross-refs | ~14 planning docs name `2026-08-24-winetricksinstall-...md`; ~8 name `2026-08-26-winetricks-package-selection-...md`. Those are historical records; do not rewrite them. |
</verified_at_planning_time>

<tasks>

<task type="auto">
  <name>Task 1: Close the 2026-08-24 winetricks todo — moved, not deleted, with the anomaly preserved</name>
  <files>
    .planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md (removed)
    .planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md (created)
  </files>
  <action>
Append a dated closing section to the END of the existing file, then move it with plain `mv`.

**Order matters: edit FIRST, `mv` SECOND, `git add` THIRD.** Never `git mv` — this project has a
recorded incident where `git mv` committed HEAD content and silently dropped unstaged edits
(`[[git-mv-commits-head-content-not-your-unstaged-edits]]`). Plain `mv` + explicit `git add` of
both the old and new pathspecs is the sanctioned sequence.

Preserve every existing section verbatim. The RESOLVED → REOPENED → PARKED sequence is the
record of two disproven hypotheses and it is worth more than the closure is; do not compress,
summarise or delete any of it.

Append a section headed exactly `## RESOLVED 2026-09-15 — fixed by Phase 35 Plan 25` covering,
in this order:

1. **What the title asserted and why it is now false.** The title claims `winetricksInstall` is a
   LIVE SILENT NO-OP. It is not. Clicking Install with the mouse sends the frame and runs
   winetricks. A title that asserts a false thing is the test for closure.

2. **What resolved it.** Commit `366e719bb`, 2026-08-30 21:01 +1200, "fix(35-25): capture
   winetricks Install on mousedown to beat parent remount race". The mechanism, quoting the
   measurement not the theory: a parent (`Winetricks/index.tsx`) state flip on
   `installing`/`loadingInstalled` unmounted-and-remounted the whole `WinetricksSearchBar`
   — including the `<ul>` — as a single batch **~4ms after `mousedown` and ~60ms before
   `mouseup`**, so `mouseup` re-hit-tested onto the underlying progress dialog and no `click`
   was ever synthesized. `document.activeElement` stayed on the `<input>` throughout, which is
   what ruled out the `:focus-within` family for this surface. The fix captures install intent
   on `mousedown`, with `suppressNextClick` preventing double-invocation when a real `click`
   does land.

3. **Which of the PARKED section's two candidate owners it was.** The PARKED §"WHERE IT LIVES"
   named two: `Winetricks/index.tsx`'s `loadingInstalled` gate, or `WinetricksSearchBar`'s own
   state. It was the **parent**. State this explicitly — the PARKED section poses it as an open
   question and the closure should answer it.

4. **The live evidence, named.** Steps 3 and 5 of plan `35-25`'s blocking human gate PASSED with
   **real mouse-driven installs of `vcrun2005` and `vcrun2008` proven in `gamelib.log`** — two
   successes, by mouse, not one. Cite that this is recorded independently in
   `.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`,
   a file written to report a DIFFERENT defect, so it is not the fixing plan marking its own
   homework.

5. **The UNRESOLVED ANOMALY — under its own sub-heading, `### Still unexplained: the probe that
   never fired`.** The PARKED section recorded a `useEffect` probe added to `Winetricks/index.tsx`
   logging all six gating values that **never fired once** — zero lines — despite being inside the
   component, having no early return before it, carrying a dep array, and living in the SAME
   bundle chunk (`App-DENVkc7C.js`) as the row probe that demonstrably DID fire. PARKED said
   "anyone resuming should start by explaining it".
   **Nobody did. It was made MOOT by a different measurement, not answered.** `35-25` reached the
   cause via DOM-mutation timing instead, never needing that probe's output, so the contradiction
   was routed around rather than resolved. Say so in those terms. A reader must not come away
   believing the anomaly was explained. Note the one consequence that outlives the closure: until
   it IS explained, a silent `useEffect` probe in this codebase cannot be read as evidence that
   the state it watches did not change — see `[[getactivehandles-is-blind-to-js-timers]]` for the
   same shape (an instrument's silence mistaken for the system's silence).

6. **What survives closure.** The two instruments kept in the tree remain useful and are not
   removed by this closure: the `SearchBar` mousedown `preventDefault` guard (`af94c7ebe`) and
   the Rust `sidecar_send` trace (`cc99cbe93`, `GAMELIB_TRACE_SEND=1`).

7. **What this closure does NOT close.** Name both survivors explicitly, with paths:
   - `2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md` — Half A
     (search filtering) and the hover-highlight half of Half B are untouched by `366e719bb`.
   - `2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md` — a
     different consumer of the same primitive, failing for a different reason (`LibrarySearchBar`
     passes bare `<li onClick>` with no `<button>` and no `onMouseDown`, so `35-25`'s fix is
     structurally inapplicable there), plus the record correction it says is owed on
     `SearchBar/index.tsx`'s comment.

Leave the frontmatter's `status:` field as `OPEN`. Do NOT set `resolves_phase:` — the file's own
Notes section says twice that it must not be auto-closed by a phase, and it is being closed by
hand here. `completed/` is exempt from the triage-vocabulary gate (the gate's own docstring states
this is deliberate), so the frontmatter needs no other change.
  </action>
  <verify>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib &&
test ! -e .planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md &&
test -e .planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md &&
N=.planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md &&
grep -q '## RESOLVED 2026-09-15' "$N" &&
grep -q '366e719bb' "$N" &&
grep -q 'vcrun2005' "$N" && grep -q 'vcrun2008' "$N" &&
grep -q '### Still unexplained: the probe that never fired' "$N" &&
grep -q 'PARKED 2026-08-25' "$N" &&
grep -q 'REOPENED 2026-08-25' "$N" &&
grep -q 'RESOLVED 2026-08-25 (plan 34.6-16)' "$N" &&
! grep -q 'resolves_phase' "$N" &&
echo TASK1_STRUCTURE_OK
    </automated>
    <automated>
# Anti-vacuity: the closure must NOT read as if the anomaly were answered.
cd /Users/graysonmitchell/Projects/GameLib &&
N=.planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md &&
grep -qi 'moot' "$N" &&
grep -qiE 'never (answered|explained)|not answered|nobody did' "$N" &&
echo ANOMALY_PRESERVED_OK
    </automated>
    <automated>
# The file must GROW, not be rewritten. head is 394 lines; the append must keep every one.
cd /Users/graysonmitchell/Projects/GameLib &&
OLD=$(git show HEAD:.planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md | wc -l | tr -d ' ') &&
NEW=$(wc -l < .planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md | tr -d ' ') &&
echo "old=$OLD new=$NEW" &&
test "$NEW" -gt "$OLD" &&
echo NO_HISTORY_LOST_OK
    </automated>
  </verify>
  <done>
The 2026-08-24 todo is in `completed/`, strictly longer than its `HEAD` version, carries a dated
`## RESOLVED 2026-09-15` section naming `366e719bb` and the two real installs, and carries a
`### Still unexplained` sub-section that a reader cannot mistake for an explanation. `pending/`
no longer holds it. No `git mv` was used.
  </done>
</task>

<task type="auto">
  <name>Task 2: Narrow the 2026-08-26 selection todo to what actually remains — keep it OPEN</name>
  <files>.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md</files>
  <action>
Rewrite this file in place. It stays in `pending/` with `status: OPEN`. **Closing it would bury
Half A, which as far as the record shows has never been investigated at all.**

**Keep the filename unchanged.** ~8 planning documents reference it by name (V-17): the 34.6
live gate, `35-10-SUMMARY.md`, `34.18-CONTEXT.md`, `43-CONTEXT.md`, the `260826-s2f` quick
SUMMARY and the `260905-upz` staleness audit. Renaming it would strand all of them silently.
Add a one-line note in the body saying the filename is deliberately retained despite the title
change, and why — otherwise the next reader will "tidy" it.

**Frontmatter changes:**
- `title:` — rewrite to describe ONLY what remains. It must no longer say "an Install click
  before that silently does nothing", because that half shipped. Something of the shape:
  `"UX FIX (NARROWED 2026-09-15): the Winetricks search box needs repeated typing before it
  filters usably, and suggestion rows do not highlight under the pointer — the Install-click
  half shipped in 366e719bb"`.
- `files:` — **fix the stale pin (V-3)**: replace
  `src/frontend/components/UI/Winetricks/WinetricksSearch.tsx` with
  `src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx`. Add
  `src/frontend/components/UI/SearchBar/index.scss` (the hover rule lives there, not in the TSX)
  and `src/frontend/components/UI/SearchBar/searchProbe.ts` (the instrument Task 3 builds).
- `severity:` — keep `major`. The search half is still a first-use-hostile interaction on a
  shipped panel.
- `platform:` — keep `any`.
- `ready:` — **change `code` → `live-gate`, and justify it in the body.** This is an honest
  change, not bookkeeping: both remaining halves are characterised only by operator prose from a
  live drive, and this project has already had THREE hypotheses about this surface formed by code
  reading and all three were wrong. `ready: code` would advertise the file as desk-pickup-able
  when the first honest step is a measurement on this Mac. Per `CLAUDE.md`, `live-gate` means
  "needs a live app run on this Mac to verify" — that is exactly the state.
- Keep `status: OPEN`. Do NOT add `resolves_phase:`.
- Keep all three triage keys **bare, lowercase, exact**, with `platform:` immediately after
  `severity:` and `ready:` immediately after `platform:`.

**Body — replace wholesale with the following structure:**

1. `## Status — NARROWED 2026-09-15`. A table or short list splitting the original four items
   into SHIPPED vs REMAINS, each with its evidence:
   - Half B, "Install fires on first click" — **SHIPPED** by `366e719bb` (35-25). Mechanism: a
     parent remount racing the `mousedown`→`mouseup` pair; fixed by capturing intent on
     `mousedown`. Live-proven by two real installs (`vcrun2005`, `vcrun2008`) in `gamelib.log`.
   - Item 4, "correct the stale 'proven by measurement' comment in `SearchBar/index.tsx`" —
     **SHIPPED**. That comment now carries a `ROOT CAUSE FOUND (Phase 35 Plan 25 ...)` retraction
     at `SearchBar/index.tsx:129-145` (V-2).
   - Half B, "the highlight must track the mouse without the panel needing to react first" —
     **REMAINS**.
   - Half A, "typing should filter to a usable result set on the first attempt" — **REMAINS**,
     and note plainly that **no investigation of it is recorded anywhere**. It is not that Half A
     was tried and failed; it was never opened.

2. `## What remains — Half A: the search box`. Carry the operator's verbatim 2026-08-26 quote
   forward ("very painful, took hovering, typing in search multiple times until line highlighted
   and then needed the panel to 'react' and allow mouse move to move the highlight"). Note the
   two structural facts a future investigator gets for free and should not re-derive:
   `WinetricksSearchBar` has **no debounce at all** — its `useEffect` filters synchronously on
   every keystroke with `search.length < 2` as the only gate — and `SearchBar` drives its input
   **uncontrolled**, via a native `'input'` listener attached in a `useEffect` whose dep array is
   `[input, value, onInputChanged]`, with a second effect writing `value` back into
   `input.current.value`. That pairing (uncontrolled input + a value-syncing effect + a parent
   that re-renders per keystroke) is where a "needs several attempts" symptom would live if it is
   a code defect rather than a rendering-latency one. **State that as the place to LOOK, not as a
   diagnosis** — nothing here has been measured.

3. `## What remains — Half B: rows do not highlight under the pointer`. Cross-reference
   `2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`: the operator
   reports the identical non-highlighting symptom on the **Library** consumer of the same
   primitive. One instrument should settle both, and that instrument is Task 3's.

4. `## An explicitly UNPROVEN lead: this may be a CONTRAST defect, not a pointer defect`.
   Record F-4 with its provenance and its status. The 2026-08-24 todo's PARKED item 6 said
   verbatim: *"The row not visibly highlighting on hover is unexplained but may simply be
   `var(--accent)` being low-contrast in this theme — it was NOT treated as evidence."*
   Add the measurement taken at planning time (V-6/V-7): the only hover styling anywhere is
   `SearchBar/index.scss:52-55` — `li:hover { background-color: var(--accent); color:
   var(--background) }` — and `--accent` has **10** per-theme definitions in
   `src/frontend/themes.scss` ranging from vivid (`#e0ab40`, `#00ddff`, `#ff9af7`) to `#30444a`,
   a dark slate that would be near-invisible as a highlight over a dark `--input-background`.
   **Then state the consequence sharply:** if this is contrast, the row IS highlighting and the
   pointer IS reaching it, and every hypothesis about pointer-events, overlays and hit-testing is
   chasing a bug that does not exist. If it is not contrast, that whole family is back in play.
   These are different bugs with different fixes, and **this is the cheapest observation that
   partitions the space** — which is precisely what the 2026-08-24 todo said about it on
   2026-08-25, before it was set aside and never taken.
   Mark it `UNPROVEN`. Do not write it as the likely answer; two confident answers about this
   surface have already been wrong.

5. `## The instrument`. Point at `src/frontend/components/UI/SearchBar/searchProbe.ts` and
   `.planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md`.
   State what it measures for THIS todo specifically: whether `li:hover` matches under the
   pointer, the computed background of the hovered row versus the surrounding `<ul>`, and the
   contrast ratio between them. One drive answers §4.

6. `## Why this file is not closed`, and the filename note from above.

7. Update the cross-reference at old line 40 (V-5) to
   `.planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md`.
   Keep the substance of the old "Consistency with what was already measured" paragraph only if
   it still holds — most of its (A)/(B) transport narrowing was overturned and should NOT be
   carried forward as if live. Prefer a one-line pointer to the closed file over reproducing a
   refuted analysis.

8. Keep the closing `## Notes` statement that 34.6 is verified `passed` and must not auto-close
   this file.
  </action>
  <verify>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib &&
F=.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md &&
test -e "$F" &&
grep -q '^status: OPEN$' "$F" &&
grep -q '^severity: major$' "$F" &&
grep -q '^platform: any$' "$F" &&
grep -q '^ready: live-gate$' "$F" &&
! grep -q '^ready: code$' "$F" &&
! grep -q 'resolves_phase' "$F" &&
echo FRONTMATTER_OK
    </automated>
    <automated>
# Key order inside the frontmatter block only: severity, then platform, then ready, adjacent.
cd /Users/graysonmitchell/Projects/GameLib &&
F=.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md &&
awk '/^---$/{n++; next} n==1' "$F" | grep -nE '^(severity|platform|ready):' | tr '\n' ' ' &&
echo &&
test "$(awk '/^---$/{n++; next} n==1' "$F" | grep -cE '^(severity|platform|ready):')" -eq 3 &&
awk '/^---$/{n++; next} n==1' "$F" | grep -E '^(severity|platform|ready):' | cut -d: -f1 | tr '\n' ',' | grep -qx 'severity,platform,ready,' &&
echo KEY_ORDER_OK
    </automated>
    <automated>
# The stale pin is gone, the real path is in, and the cross-ref follows the moved file.
cd /Users/graysonmitchell/Projects/GameLib &&
F=.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md &&
! grep -q 'Winetricks/WinetricksSearch\.tsx' "$F" &&
grep -q 'Winetricks/WinetricksSearch/index\.tsx' "$F" &&
grep -q 'todos/completed/2026-08-24-winetricksinstall' "$F" &&
! grep -q 'todos/pending/2026-08-24-winetricksinstall' "$F" &&
echo PINS_OK
    </automated>
    <automated>
# Every path named in the `files:` list must actually exist. A pin that names nothing is the
# defect this task was filed to fix; do not reintroduce it.
cd /Users/graysonmitchell/Projects/GameLib &&
F=.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md &&
MISSING=0 &&
for p in $(awk '/^---$/{n++; next} n==1 && /^  - /{print $2}' "$F"); do
  if [ ! -e "$p" ]; then echo "MISSING PIN: $p"; MISSING=1; fi
done &&
test "$MISSING" -eq 0 &&
echo ALL_PINS_RESOLVE_OK
    </automated>
    <automated>
# Substance: both remaining halves, the shipped halves, and the UNPROVEN contrast lead are named.
cd /Users/graysonmitchell/Projects/GameLib &&
F=.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md &&
grep -q 'NARROWED 2026-09-15' "$F" &&
grep -q '366e719bb' "$F" &&
grep -qi 'unproven' "$F" &&
grep -q -- '--accent' "$F" &&
grep -q '#30444a' "$F" &&
grep -q '2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press' "$F" &&
grep -q 'searchProbe' "$F" &&
echo SUBSTANCE_OK
    </automated>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates
    </automated>
  </verify>
  <done>
The 2026-08-26 todo is still in `pending/`, still `status: OPEN`, retitled to describe only the
remaining work, `ready: live-gate` with the change justified in the body, `files:` pins all
resolve on disk, the cross-reference follows the Task 1 move, and the F-4 contrast hypothesis is
recorded and labelled UNPROVEN. `pnpm planning-gates` is 11/11.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Build the opt-in live instrumentation harness for the Library SearchBar defect</name>
  <files>
    src/frontend/components/UI/SearchBar/searchProbe.ts (new)
    src/frontend/components/UI/SearchBar/index.tsx (3-line call site)
    src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts (new)
    .planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md (new)
  </files>

  <behavior>
Unit-testable surface only (the DOM half cannot be tested — V-11: this jest project runs in
`node` with **no jsdom installed**, so the probe's pure colour arithmetic is extracted
deliberately so that the one number capable of misleading the diagnosis is pinned).

`searchProbeContrast.test.ts` (`.ts`, no JSX, no `document`, no `window`):
- `parseRgb('rgb(0, 0, 0)')` → `{ r: 0, g: 0, b: 0, a: 1 }`
- `parseRgb('rgba(224, 171, 64, 0.5)')` → `{ r: 224, g: 171, b: 64, a: 0.5 }`
- `parseRgb('rgba(0, 0, 0, 0)')` → parses, with `a === 0` (transparent is a VALUE, not a failure —
  a transparent hover background is itself a finding and must not be swallowed as a parse error)
- `parseRgb('color(display-p3 1 0 0)')` → `null`, and `parseRgb('')` → `null`
- `contrastRatio('rgb(0,0,0)', 'rgb(255,255,255)')` → `21` (to 2dp) — the WCAG anchor
- `contrastRatio('rgb(48,68,74)', 'rgb(48,68,74)')` → `1` — identical colours
- `contrastRatio` returns `null` when either side fails to parse, and never throws
- **Non-vacuity anchor:** the two anchors above must disagree — assert
  `contrastRatio(black, white) !== contrastRatio(x, x)`, so a `contrastRatio` stubbed to a
  constant fails this suite instead of passing it.
  </behavior>

  <action>
Build a self-contained, **default-OFF**, trivially-removable instrument. It produces no
diagnosis. Its only job is to make ONE operator drive of the Library search bar sufficient to
partition the hypothesis space in `<probe_captures>`.

### Design constraints — each is derived from a measured fact, not a preference

- **No `import.meta.env` (V-14).** Zero `import.meta` occurrences exist in `src/`, and `ts-jest`
  runs CJS where it throws. A build-flag gate is also operator-hostile: it requires a rebuild to
  toggle.
- **No `useState` in `SearchBar` (V-12).** The pinned `suggestionFocusRace.test.tsx` mocks `react`
  with only `useRef`/`useEffect`/`useCallback` stubbed and `actual` spread for everything else —
  a real `useState` would hit a null dispatcher and throw. `useRef` + `useEffect` only.
- **No new `.tsx` under `__tests__/` (V-10 + the `eslint.config.mjs` glob trap).** The test
  override matches `**/__tests__/**/*.ts` with **no `.tsx`**, so a `.tsx` test is linted under
  production rules while counting against the **zero-headroom** tests ceiling. Write the test as
  `.ts`.
- **Zero new lint warnings (V-10).** Production has ONE free slot, tests have ZERO. Under
  `recommendedTypeChecked` (V-13) the live traps are `no-explicit-any` (**error** — the gate
  currently sits at 0 errors, so one `any` fails outright) and `restrict-template-expressions`
  (warn — every non-string interpolation fires). **Wrap every template interpolation in
  `String(...)`.** No `any`, no `!` non-null assertions, no `async` without `await`.
- **Renderer only.** No IPC channel is added, no preload surface changes, no Rust changes.

### Arming — one gate, two ways to reach it

The single gate is `localStorage.getItem('gamelib.searchProbe') === '1'`.

1. **Operator path, needing nothing:** typing `::probe-on` into any GameLib search bar sets the
   key and arms immediately; `::probe-off` clears the key, removes the badge and detaches every
   listener. This works because `SearchBar` already hands the probe its `value` prop on every
   keystroke. Tauri DevTools console paste is unusable on this project
   (`[[tauri-devtools-console-paste-unusable]]`), so a console-based arming path would not exist
   in practice.
2. **Executor path:** write the key directly into the WebKit `localstorage.sqlite3` **with the
   app closed**, per `[[read-webkit-localstorage-sqlite-directly]]`. Document it in the retrieval
   doc; do not rely on it for the operator drive.

Both funnel through one key, so there is ONE gate to reason about, not two.

### Sink design — and why the "did it run?" question gets three answers

`[[sidecar-send-channels-fail-silently]]`, `[[sidecar-console-and-logger-are-invisible]]` and the
2026-08-24 history all converge on one lesson: **a diagnostic whose silence is ambiguous wastes
more time than no diagnostic.** The 427-send trace only worked because the probe was proven live
by other channels BEFORE its silence was trusted, and the still-unexplained anomaly Task 1
preserves is precisely a probe whose silence could not be interpreted.

So the probe proves it ran **three independent ways**, all of them before any interaction occurs:

1. **An on-screen badge** — a fixed-position element appended to `document.body` directly (not
   through React, so the component tree is untouched), reading
   `SEARCHPROBE armed · g{gesture} · {n} rec` and updating on every record. Absent badge = never
   ran. Present badge with `0 rec` = ran and saw nothing. That is the distinction, made visible
   without any tooling.
2. **A durable `armed` record** written to `localStorage` synchronously at arm time, carrying a
   random session nonce, `location.href` and an ISO timestamp — readable from the sqlite file
   afterwards even if the badge were somehow suppressed.
3. **One `window.api.logInfo('[searchprobe] ARMED nonce=…')` line**, so `gamelib.log` also
   records the arming. This is send-kind and therefore **secondary by construction: its silence
   proves nothing** and must be labelled that way in the source comment. Its presence, however,
   is free confirmation.

**Primary durable store:** `localStorage['gamelib.searchProbe.log']`, a JSON array of records,
rewritten on each append. Cap it (≈1500 records); on overflow drop the OLDEST and increment a
`dropped` counter in `localStorage['gamelib.searchProbe.meta']`, and surface `TRUNC` in the badge.
**Never drop silently** — an undisclosed truncation is a records defect
(`[[records-census-audit-index]]`).

**Secondary:** one compact SUMMARY line per completed gesture via `window.api.logInfo`, so
`gamelib.log` carries a human-skimmable trace. Per-frame samples go ONLY to `localStorage` — do
not flood the log.

### Attachment

A single `useEffect` in `SearchBar/index.tsx`, adding a `useRef<HTMLUListElement>(null)` on the
existing `<ul className="autoComplete">`:

```
const ulRef = useRef<HTMLUListElement>(null)
useEffect(() => attachSearchProbe(ulRef.current, value), [value])
```

`attachSearchProbe` returns a teardown function (or `undefined` when unarmed). Adding `ref` does
not change the rendered element graph, so `findAutoComplete()` in the pinned suite still resolves
by `className`. Do not add or rename any prop, and **do not touch the existing comment block at
`index.tsx:89-145`** — it is out of scope (F-5) and amending it would assert a cause nobody has.

All listeners are delegated on the `<ul>` in the **capture** phase plus a small number on
`document`, so **no consumer file changes** — `LibrarySearchBar`, `WinetricksSearchBar` and every
other `SearchBar` consumer are untouched. Label each record's `surface` by walking up from the
`<ul>`: `[data-tour="library-search"]` → `library`, otherwise the nearest ancestor with a
`class`/`data-testid` worth naming, else `unknown`.

<probe_captures>
Every one of these must be present in a single drive's log. This list is the acceptance contract.

**C-1 — does the hover rule apply at all? (the cheapest partition; F-4)**
Delegated `pointerover`/`pointermove` (throttled to one record per row-enter) records, for the
`<li>` under the pointer:
  - `matchesHover`: `li.matches(':hover')` — does the engine consider it hovered?
  - `liBg`: `getComputedStyle(li).backgroundColor`, `liFg`: `getComputedStyle(li).color`
  - `ulBg`: `getComputedStyle(ul).backgroundColor` — the surround to compare against
  - `accentRaw` / `backgroundRaw`: `getComputedStyle(document.documentElement)
    .getPropertyValue('--accent' | '--background')`, trimmed
  - `contrastHighlightVsSurround`: `contrastRatio(liBg, ulBg)` — **this is the number that
    decides F-4.** Near `1.0` with `matchesHover === true` means the highlight is applying and
    invisible: a CONTRAST defect, and every pointer-events / overlay hypothesis is chasing a bug
    that does not exist.
  - `contrastTextVsBg`: `contrastRatio(liFg, liBg)` — readability of the hovered row
  - `liPointerEvents` / `ulPointerEvents`: computed `pointer-events` on both
  Record the raw colour strings **alongside** every ratio so the arithmetic can be recomputed by
  hand and never has to be taken on trust.

**C-2 — the full pointer sequence on the row**
`pointerdown`, `mousedown`, `mouseup`, `click` captured on the `<ul>`, PLUS `mouseup` and `click`
captured on `document` recording their ACTUAL target. The document-level pair is what shows a
`mouseup` landing somewhere else — the exact winetricks signature — and distinguishes "no mouseup
fired" from "mouseup fired elsewhere". Without it, both read as silence.

**C-3 — `document.activeElement` across the mousedown→mouseup window**
A `requestAnimationFrame` sampler armed on `mousedown`, stopping at `mouseup + 100ms` or a hard
600ms cap, whichever is first. Each sample: `t` (ms since mousedown), a descriptor of
`document.activeElement`, whether the owning `.SearchBar` still matches `:focus-within`, the
`<ul>`'s computed `display`, and whether the `<ul>` is still `isConnected`. Always cancel the rAF
in the teardown.

**C-4 — hit-testing at the pointer during mousedown**
Inside the `mousedown` record: `document.elementFromPoint(e.clientX, e.clientY)` described, a
boolean for whether it is the `<li>` or a descendant of it, AND the top 5 of
`document.elementsFromPoint(...)`. The stack is what names an overlay directly instead of
inferring one from an I-beam cursor.

**C-5 — row mount/unmount across the window**
A `MutationObserver` with `childList` on the `<ul>` **and** on `ul.parentElement` — the second is
required to see the `<ul>` ITSELF being removed, which is what happened on the winetricks
surface. Each record: added/removed counts, whether the removed node was the `<ul>`, and `t`
relative to the most recent `mousedown`. This is what confirms whether the `35-25` mechanism is
also present here or is absent.

**C-6 — what Tab actually changes**
A `document` `keydown` capture listener for `key === 'Tab'` emits `tab-before`, then
`tab-after-raf` (next frame) and `tab-after-50ms`, each carrying the same field set as C-3 plus
`defaultPrevented`. The operator reports Tab is what "enables the mouse" and **nothing in the
record explains this** — before/after on the same fields is the minimum that could.
</probe_captures>

### Removal contract

Put a `SEARCHPROBE-REMOVE-ME` marker in a header comment in `searchProbe.ts` **and** on the
call-site effect in `index.tsx`, stating the removal recipe in two steps: delete
`searchProbe.ts` + its test, delete the `ulRef`/`useEffect` pair and the `ref=` attribute. Grepping
that marker must return every site that has to go. This is temporary instrumentation and must not
quietly become permanent.

### Also write the retrieval doc

`.planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md`,
containing:
- **The operator drive script**, numbered, one pass, matching the 2026-08-30 repro: launch
  `pnpm tauri:dev`; type `::probe-on` in the Library search bar and **confirm the badge appears**
  (if it does not, stop — the probe never ran, and nothing after this is evidence); clear;
  type a real query; move the pointer down into the list and back up to the first row exactly as
  the repro describes; attempt a click; press Tab; attempt a click again; then **quit the app**
  (WebKit flushes localStorage on teardown).
- **The retrieval commands**, with all three traps from
  `[[read-webkit-localstorage-sqlite-directly]]` spelled out: `WebsiteData/LocalStorage/` is an
  empty decoy (the real path is
  `WebsiteData/Default/<hash>/<hash>/LocalStorage/localstorage.sqlite3`); values are **UTF-16LE
  BLOBs** so `cast(value as text)` stops at the first NUL and `hex(value)` +
  `unhexlify(...).decode('utf-16-le')` is required; and **many origins hold the same key** —
  V-15 confirms both `~/Library/WebKit/gamelib-shell` (dev, `http://localhost:5173`) and
  `~/Library/WebKit/com.gamelib.shell` (packaged, `tauri://localhost`) currently contain multiple
  origin dirs, so select by `-wal` mtime and confirm the nonce matches the one in `gamelib.log`.
- **A "how to read the result" table** mapping each C-1..C-6 outcome to the hypothesis it kills.
  At minimum: `matchesHover=true` + `contrastHighlightVsSurround ≈ 1` ⇒ contrast defect, pointer
  hypotheses dead; `matchesHover=false` + `elementsFromPoint` top element not the row ⇒ overlay;
  `mousedown` present + document-level `mouseup` on a different target + a C-5 removal between
  them ⇒ the `35-25` remount mechanism is present here too; Tab flipping `activeElement` or
  `:focus-within` between `tab-before` and `tab-after` ⇒ the focus-state family is live for this
  consumer after all.
- **An explicit negative-control line:** if the badge shows `0 rec` after a full drive, the probe
  RAN and saw nothing, which is itself a hard finding about event delivery — not a failed run to
  be repeated.
  </action>

  <verify>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck
    </automated>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib &&
npx jest --selectProjects Frontend --passWithNoTests src/frontend/components/UI/SearchBar 2>&1 | tail -12
    </automated>
    <automated>
# RED-proof the non-vacuity anchor: the pinned SearchBar suite must still pass UNCHANGED, i.e.
# the probe is genuinely inert when unarmed. `git diff --stat` on that test file must be empty.
cd /Users/graysonmitchell/Projects/GameLib &&
test -z "$(git diff --stat -- src/frontend/components/UI/SearchBar/__tests__/suggestionFocusRace.test.tsx)" &&
echo PINNED_SUITE_UNTOUCHED_OK
    </automated>
    <automated>
# All six captures are implemented, not just described. Strip comment lines first: a grep that
# counts its own documentation is self-satisfying (see [[raw-source-gate-is-satisfied-by-the-
# prose-that-names-it]]). This filters `//` and `*` comment lines before counting.
cd /Users/graysonmitchell/Projects/GameLib &&
S=src/frontend/components/UI/SearchBar/searchProbe.ts &&
CODE=$(grep -vE "^\s*(//|/\*|\*)" "$S") &&
for tok in "matches(':hover')" 'elementsFromPoint' 'elementFromPoint' 'MutationObserver' \
           'requestAnimationFrame' 'activeElement' "'Tab'" 'pointerover' 'mousedown' \
           'mouseup' 'getPropertyValue' 'contrastRatio'; do
  printf '%-26s %s\n' "$tok" "$(printf '%s\n' "$CODE" | grep -cF "$tok")"
  printf '%s\n' "$CODE" | grep -qF "$tok" || { echo "MISSING IN CODE (not just comments): $tok"; exit 1; }
done &&
echo ALL_SIX_CAPTURES_IMPLEMENTED_OK
    </automated>
    <automated>
# Default-OFF, single gate, three proofs-of-life, removal marker.
cd /Users/graysonmitchell/Projects/GameLib &&
S=src/frontend/components/UI/SearchBar/searchProbe.ts &&
CODE=$(grep -vE "^\s*(//|/\*|\*)" "$S") &&
printf '%s\n' "$CODE" | grep -qF "gamelib.searchProbe" &&
printf '%s\n' "$CODE" | grep -qF "::probe-on" &&
printf '%s\n' "$CODE" | grep -qF "::probe-off" &&
printf '%s\n' "$CODE" | grep -qF "logInfo" &&
test "$(grep -rlF 'SEARCHPROBE-REMOVE-ME' src/ | wc -l | tr -d ' ')" -ge 2 &&
echo GATE_AND_REMOVAL_OK
    </automated>
    <automated>
# Out-of-scope guard: no behavioural change to SearchBar beyond the ref + effect, and the
# ROOT CAUSE FOUND comment block is untouched.
cd /Users/graysonmitchell/Projects/GameLib &&
grep -q 'ROOT CAUSE FOUND (Phase 35 Plan 25' src/frontend/components/UI/SearchBar/index.tsx &&
test -z "$(git diff -- src/frontend/components/UI/SearchBar/index.scss)" &&
test -z "$(git diff -- src/frontend/components/UI/LibrarySearchBar/index.tsx)" &&
test -z "$(git diff -- src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx)" &&
ADDED=$(git diff -U0 -- src/frontend/components/UI/SearchBar/index.tsx | grep -c '^+[^+]') &&
echo "searchbar added lines: $ADDED" &&
test "$ADDED" -le 25 &&
echo SCOPE_FENCE_OK
    </automated>
    <automated>
# LINT IS THE REAL RISK: production has ONE free slot, tests have ZERO (V-10). Assert the two
# COUNTS numerically, never the exit code — at zero headroom the margin is one warning.
# Never pipe to tail/head: capture to a file so the exit status is real.
cd /Users/graysonmitchell/Projects/GameLib &&
pnpm lint > /tmp/lhm-lint.txt 2>&1; LINT_EXIT=$? &&
grep -E 'problems \(' /tmp/lhm-lint.txt &&
test "$(grep -cE '^✖ 1123 problems \(0 errors, 1123 warnings\)$' /tmp/lhm-lint.txt)" -eq 1 &&
test "$(grep -cE '^✖ 638 problems \(0 errors, 638 warnings\)$' /tmp/lhm-lint.txt)" -eq 1 &&
test "$LINT_EXIT" -eq 0 &&
echo LINT_DELTA_ZERO_OK
    </automated>
    <automated>
cd /Users/graysonmitchell/Projects/GameLib &&
test -e .planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md &&
D=.planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md &&
grep -q 'localstorage.sqlite3' "$D" &&
grep -q 'utf-16-le' "$D" &&
grep -q -- '-wal' "$D" &&
grep -q '::probe-on' "$D" &&
grep -qi 'badge' "$D" &&
grep -qiE '0 rec|zero record' "$D" &&
echo RETRIEVAL_DOC_OK
    </automated>
  </verify>

  <done>
`pnpm codecheck` is clean. The new `.ts` unit suite passes with its non-vacuity anchor, and the
pre-existing `suggestionFocusRace.test.tsx` passes with a zero-byte diff. `pnpm lint` reports
exactly 1123 / 638 — zero new warnings in either scope. All six captures are present in
comment-stripped source. Arming is default-OFF behind one `localStorage` key reachable by typing
`::probe-on`, with three independent proofs that the probe ran. `SEARCHPROBE-REMOVE-ME` appears in
at least two files. `index.scss`, `LibrarySearchBar` and `WinetricksSearch` are byte-unchanged and
the `ROOT CAUSE FOUND` comment is intact. The retrieval doc carries the drive script, all three
sqlite traps, and the negative-control reading.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer DOM → `localStorage` | The probe copies live DOM content (suggestion row text = the user's game titles) into a persistent, on-disk, unencrypted WebKit sqlite file. |
| renderer → `gamelib.log` via `logInfo` | Per-gesture summary lines are written to a log the user may attach to a bug report. |
| temporary instrumentation → shipped binary | `searchProbe.ts` lives in `src/frontend/`; nothing structurally stops it reaching a release bundle. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-LHM-01 | Information Disclosure | `localStorage['gamelib.searchProbe.log']` | mitigate | Record row **length and index**, plus at most a 24-char truncated label, never the full `<li>` text. Nothing in C-1..C-6 needs the title; the diagnosis turns on geometry, computed style and event timing. The retrieval doc instructs deleting both `gamelib.searchProbe*` keys after the drive. |
| T-LHM-02 | Information Disclosure | `gamelib.log` summary lines | mitigate | The `logInfo` line carries counts, timings and the nonce only — no row text, no `location.href` beyond origin. |
| T-LHM-03 | Tampering | temporary probe reaching a release build | mitigate | Default-OFF behind an explicit `localStorage` opt-in, so an unarmed probe attaches nothing; `SEARCHPROBE-REMOVE-ME` markers in ≥2 files make the removal set greppable; the narrowed 2026-08-26 todo names the file so its removal is owned. |
| T-LHM-04 | Denial of Service | unbounded `localStorage` growth during a long drive | mitigate | Hard cap ≈1500 records with oldest-first eviction, and the eviction count is surfaced in both the badge (`TRUNC`) and a `meta` key — never dropped silently. |
| T-LHM-05 | Denial of Service | rAF sampler left running | mitigate | The C-3 sampler is bounded by `mouseup + 100ms` or a hard 600ms cap, and cancelled unconditionally in the `useEffect` teardown. |
| T-LHM-06 | Repudiation | "the probe saw nothing" vs "the probe never ran" | mitigate | Three independent arm-time proofs (on-screen badge, durable `armed` record with nonce, `gamelib.log` line). This is the exact ambiguity that left the 2026-08-24 anomaly unexplained; the `logInfo` leg is documented in-source as secondary, because its silence proves nothing. |
| T-LHM-07 | Tampering | `git mv` dropping unstaged edits on the Task 1 move | mitigate | Plain `mv` only; commit-time verification asserts the **staged blob** contains `RESOLVED 2026-09-15`, per `[[git-mv-commits-head-content-not-your-unstaged-edits]]`. |
| T-LHM-08 | Tampering | absorbing a concurrent session's uncommitted work | mitigate | Explicit pathspec commits only. No `git add -A`, no `git add .`, no `gsd-sdk query commit` (it stages the entire tree — `[[gsd-sdk-commit-stages-entire-tree]]`), no `git stash`. |
| T-LHM-SC | Tampering | npm/pip/cargo installs | mitigate | **No package installs of any kind.** The harness uses only DOM APIs and the existing `window.api` surface. The package-legitimacy gate is not engaged because no install task exists. |
</threat_model>

<verification>
Run at the end, from the repo root, in this order:

1. `pnpm planning-gates` — must print `11/11 planning gates passed.` (V-9 baseline). This is THE
   gate for Tasks 1–2.
2. `pnpm codecheck` — must exit 0.
3. `npx jest --selectProjects Frontend --passWithNoTests src/frontend/components/UI/SearchBar` —
   note the capital `F`; `--selectProjects frontend` matches nothing and exits 0 (V-11,
   `[[jest-selectprojects-is-case-sensitive-and-exits-zero]]`).
4. `pnpm lint > /tmp/lhm-lint.txt 2>&1` then assert **both** counts numerically: production
   `1123`, tests `638`. Do NOT score this on exit code alone — tests sit at the ceiling with zero
   headroom, and an exit-code-only check passes right up until it does not.

**`pnpm test:ci` is RED at head for unrelated reasons and is NOT a gate for this task.** Do not
run it and do not interpret its output as a result of this work.

**Never pipe a gate to `tail` or `head`** — `[[piping-a-build-to-tail-masks-its-exit-code.md]]`:
the pipeline reports `tail`'s status, so a failure reads as exit 0 and a stale artifact then
"proves" the fix broke something. Redirect to a file and grep the file.

**If a verify command above fails against the tree you have, first check whether the anchor
rotted** rather than assuming the work is wrong — `[[a-plans-verify-blocks-rot-against-its-own-baseline-sha]]`
records four false reds from exactly this. The lint counts in particular are measured at
`a88104f8c` and a concurrent session is committing to this branch.
</verification>

<commit_protocol>
**A concurrent session is committing to this branch right now.** The working tree at planning
time already carried unrelated untracked paths (`.claude/skills/archify/`, `skills-lock.json`,
`.planning/quick/260912-d84-.../`, spike-024 artefacts) and one unrelated modified file.

Therefore:

- **Explicit pathspecs only.** Never `git add -A`, never `git add .`, never `git commit -a`.
- **Never `gsd-sdk query commit`** — it stages the entire tree
  (`[[gsd-sdk-commit-stages-entire-tree]]`).
- **Never `git stash`** — it strands the concurrent session
  (`[[executor-git-stash-strands-concurrent-session]]`).
- **Never `git mv`** (T-LHM-07).
- Before each commit, run `git status --porcelain` and confirm the staged set is EXACTLY the
  files this plan declares. If anything else is staged, unstage it by pathspec.

Suggested two commits:

```
# Commit 1 — the todos (after Tasks 1 and 2)
git add .planning/todos/pending/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md \
        .planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md \
        .planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md
# assert the STAGED blob carries the edit, not HEAD's content (T-LHM-07):
git show ":.planning/todos/completed/2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md" \
  | grep -c 'RESOLVED 2026-09-15'   # must be >= 1
git diff --cached --stat
git commit -m "docs(quick-260915-lhm): close the 2026-08-24 winetricks todo, narrow the 2026-08-26 one"

# Commit 2 — the harness (after Task 3)
git add src/frontend/components/UI/SearchBar/searchProbe.ts \
        src/frontend/components/UI/SearchBar/index.tsx \
        src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts \
        .planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md
git diff --cached --stat
git commit -m "chore(quick-260915-lhm): add opt-in live probe for the Library SearchBar mouse-dead defect"
```

`git status --porcelain` showing `R100` or `RM` for the moved todo is the `git mv` tell — if you
see it, verify the staged blob explicitly before committing (the assertion above does this).

End every commit message with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```
</commit_protocol>

<success_criteria>
- [ ] `pending/2026-08-24-winetricksinstall-...md` is gone; `completed/` holds it, strictly longer
      than its `HEAD` version, with a `## RESOLVED 2026-09-15` section naming `366e719bb`, the
      parent-remount mechanism, and the two live installs.
- [ ] That closing section carries `### Still unexplained: the probe that never fired` and states
      the anomaly was made MOOT, not answered.
- [ ] `2026-08-26-...temperamental...md` is still in `pending/`, still `status: OPEN`, retitled to
      cover only Half A and the hover-highlight half of Half B.
- [ ] Its `files:` pins all resolve on disk; `WinetricksSearch.tsx` is gone,
      `WinetricksSearch/index.tsx` is in.
- [ ] Its `ready:` is `live-gate`, changed honestly and justified in the body.
- [ ] Its cross-reference to the 2026-08-24 todo points at `completed/`.
- [ ] The F-4 contrast hypothesis is recorded there and explicitly labelled UNPROVEN.
- [ ] `pnpm planning-gates` → 11/11.
- [ ] `searchProbe.ts` exists, is default-OFF, and implements all of C-1..C-6 in
      comment-stripped source.
- [ ] Three independent arm-time proofs of life exist (badge, durable record, log line), with the
      `logInfo` leg documented in-source as secondary.
- [ ] `SEARCHPROBE-REMOVE-ME` appears in ≥2 files and names the full removal set.
- [ ] `pnpm codecheck` clean; `pnpm lint` exactly 1123 / 638.
- [ ] `suggestionFocusRace.test.tsx` passes with a zero-byte diff.
- [ ] `index.scss`, `LibrarySearchBar/index.tsx` and `WinetricksSearch/index.tsx` are byte-unchanged;
      `SearchBar/index.tsx`'s `ROOT CAUSE FOUND` comment is intact; no fix was attempted.
- [ ] `260915-lhm-PROBE-RETRIEVAL.md` carries the one-pass drive script, all three sqlite traps,
      the reading table, and the `0 rec` negative-control note.
- [ ] Commits used explicit pathspecs; no `git add -A`, no `gsd-sdk query commit`, no `git mv`,
      no `git stash`; no unrelated path was staged.
</success_criteria>

<output>
Create `.planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-SUMMARY.md`
when done.

The SUMMARY must record, beyond the usual:
- the measured `pnpm lint` counts AFTER the change (not "unchanged" — the two numbers), because
  the tests scope has zero headroom and a future reader needs the actual figure;
- that Task 3 produced an INSTRUMENT and no diagnosis, so nobody mistakes the harness landing for
  the Library defect being understood;
- that the 2026-08-24 anomaly remains unexplained, with the file path where it is now recorded.
</output>
