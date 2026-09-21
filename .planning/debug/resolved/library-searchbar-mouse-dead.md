---
slug: library-searchbar-mouse-dead
status: resolved
trigger: "Library SearchBar suggestions are MOUSE-DEAD until a Tab press — rows do not hover-highlight, and Tab on a highlighted row is what re-enables clicking. Operator believes it may already be fixed; the instrument (searchProbe.ts, armed via ::probe-on) is now in the shipped build and has never produced a result against the Library consumer. Settle by live measurement, not code reading — three prior code-read hypotheses on this surface were all wrong."
created: 2026-09-21
updated: 2026-09-21T00:00:00.000Z
source: .planning/todos/completed/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md (severity major, ready live-gate, unowned)
severity: major — a primary navigation affordance is unusable by mouse
---

# Debug: Library SearchBar suggestions are mouse-dead until a Tab press

## Symptoms

**Expected behavior.** Typing in the Library search bar shows a suggestions list; hovering a row
highlights it; clicking a row navigates to that game's page. No keyboard interaction required.

**Actual behavior.** Operator, verbatim (2026-08-30):

> after a search i have to move the mouse down into the search list and then move back up to the
> first item, the rows do not highlight automatically, I have to do the mouse move just roght and
> a row will be highlighted. I can't click then though, once i have a highlighted row i can press
> tab, and that then enables the mouse so it can now click on a selection. (if there is not row
> highlighted tab just tabs away from the search and i have to repeat from scratch).

Decomposed:

1. Type a query in the Library search bar; the suggestions list appears.
2. Hovering a row does **not** highlight it. Highlight is only obtainable by moving the pointer
   *down into* the list and then *back up* to the first item, and the gesture has to be "just
   right".
3. Even with a row highlighted, **clicking does nothing**.
4. Pressing **Tab** while a row is highlighted "enables the mouse" — clicking then works.
5. If **no** row is highlighted, Tab instead moves focus away from the search entirely and the
   sequence must restart from scratch.

**Error messages.** None. Completely silent — it reads as a dead list.

**Timeline.** Unknown, and **never known to have worked**. Reported 2026-08-30 during plan
`35-25`'s human gate, whose step 6 asked to confirm clicking a suggestion "still works normally";
the operator's response was *"this has always been flaky"*. That step disqualified its own
fixture — it measured against a baseline that was never normal. **Not** a regression from `35-25`:
commit `366e719bb`'s only change to `SearchBar/index.tsx` is a comment.

**Reproduction.** `pnpm tauri:dev` (never bare `tauri dev` — serves a stale bundle), then type a
partial game title into the search bar at the top of the Library screen.

## Critical context — DO NOT REPEAT THIS WORK

### This surface has produced THREE code-read hypotheses and ALL THREE were wrong

Recorded across `2026-08-24-winetricksinstall-send-channel-is-a-live-silent-no-op.md` (now in
`completed/`) and `SearchBar/index.tsx`'s own comment block:

1. **IPC transport** — "the frame never arrives". Refuted: 427 traced sends in one boot, the
   handler absent from all of them, because no frame was ever sent.
2. **`:focus-within` blur-unmount** — mousedown blurs the input, nothing takes focus in its
   place, `&:focus-within ul.autoComplete { display: block }` goes false, the `<ul>` unmounts and
   mouseup lands elsewhere. Refuted: the `onMouseDown={(e) => e.preventDefault()}` guard shipped
   (`af94c7ebe`), was verified present in the running bundle, and the button was **still dead**.
3. **`loadingInstalled` parent gate** — refuted when `35-25` measured the real mechanism.

**Every real advance on this surface came from a MEASUREMENT.** A fourth mechanism reasoned off
the source is the failure mode here, not the method.

### The winetricks fix is structurally inapplicable to this consumer

`35-25` (`366e719bb`) fixed the *winetricks* Install button: a parent (`Winetricks/index.tsx`)
`installing`/`loadingInstalled` state flip unmounted-and-remounted the whole `WinetricksSearchBar`
~4ms after `mousedown` and ~60ms before `mouseup`, so `mouseup` landed on an unrelated element and
no `click` was ever synthesized. Live-measured. **Focus was never lost** — `document.activeElement`
stayed on the `<input>` throughout, which is what ruled hypothesis 2 out *for that surface*.

The Library consumer has no equivalent parent state flip and its rows are bare
`<li onClick={...}>` (`LibrarySearchBar/index.tsx`), so that fix cannot transfer. Symptom 4 here —
Tab is what re-enables the mouse — is a **focus-state** signature, which points back at the
`:focus-within` family that was correctly eliminated for winetricks. **Hypothesis only. Not
measured. Must not be treated as diagnosed.**

### The operator's "already fixed" belief is about a DIFFERENT surface (settled 2026-09-21)

Asked directly at the start of this session, the operator confirmed the drive that led them to
believe this was fixed was against the **Winetricks panel search**, not the Library bar.

That matches the record. The 2026-09-15 observation — *"typing 'pr' then search shows list. that
list seems responsive, selection changes on mouse move"* — is written up in the completed
`2026-08-26` todo, which states in as many words that it "narrows Half B toward the LIBRARY
consumer, **which was not exercised**". That drive also predated the probe commit by ~18 hours
(`grep SEARCHPROBE build/` returned nothing), so the probe produced no result and its "no badge is
itself a finding" rule did not arm.

Since Phase 44, Winetricks does not render into `SearchBar`'s `.autoComplete` overlay **at all** —
`WinetricksBrowse/` passes no `suggestionsListItems`. So no observation of the winetricks surface,
past or future, is evidence about this one.

### Phase 45 does not cover this

Phase 45 is the Winetricks UI redesign (0 plans, empty phase dir). It touches neither
`LibrarySearchBar` nor the shared `SearchBar` primitive, and Phase 44 already severed Winetricks
from the `.autoComplete` code path. This todo cannot be closed as redundant to it.

## The instrument — and it is IN the build this time

`src/frontend/components/UI/SearchBar/searchProbe.ts`, built by quick task `260915-lhm`
specifically for this todo. Default-OFF, opt-in, self-contained, produces no diagnosis.

- **Arming:** type the literal `::probe-on` into any GameLib search bar. Gate is
  `localStorage['gamelib.searchProbe'] === '1'`. No DevTools needed (console paste is unusable
  under Tauri on this project), no env var, no code edit.
- **Three independent arm-time proofs**, so "the probe saw nothing" is distinguishable from "the
  probe never ran": an on-screen badge (`SEARCHPROBE armed · g0 · 0 rec`, drawn onto
  `document.body` outside the React tree), a nonce-carrying durable localStorage record written at
  arm time before any interaction, and a `gamelib.log` line.
- **Verified present in the current build, 2026-09-21:** `grep SEARCHPROBE build/` hits three
  chunks (`build/assets/App-B3D3uICX.js` and two siblings). This is the condition that was absent
  on 2026-09-15 and is why that drive measured the app rather than the probe.
- **Drive script and sqlite retrieval commands:**
  `.planning/quick/260915-lhm-close-2026-08-24-winetricks-todo-narrow-/260915-lhm-PROBE-RETRIEVAL.md`

What it records per hovered row: whether `li:hover` matches under the pointer at all, the computed
background of the hovered row versus the surrounding `<ul>`, and the contrast ratio between them —
plus the `pointerdown`/`mousedown`/`mouseup`/`click` sequence and DOM mutation across that window.

**If the badge does not appear: STOP.** Do not proceed to "prove nothing happened". A missing badge
is itself a finding (the arm string never reached the input, or JS on this surface is not running)
and must be written up as a result, not silently retried until it appears.

## Rider — a second, untested half lives in this todo

The source todo also carries **Half A**, folded in verbatim from the 2026-08-26 winetricks todo per
Phase 44's D-16, because this file is its **only home**:

> "very painful, took hovering, typing in search multiple times until line highlighted and then
> needed the panel to 'react' and allow mouse move to move the highlight"

i.e. *typing needs repeated attempts before it filters usably*. **Never investigated on any
surface.** The probe was built for the pointer/highlight question, not the debounce question, so a
clean probe drive does **not** settle Half A.

Structural facts already recorded, so nobody re-derives them: `SearchBar` drives its input
**uncontrolled** — a native `'input'` listener attached in a `useEffect` with dependency array
`[input, value, onInputChanged]`, plus a second effect writing `value` back into
`input.current.value` whenever it changes externally. That pairing (uncontrolled input +
value-syncing effect + a parent re-rendering per keystroke) is **where to LOOK**, explicitly not a
diagnosis.

**Do not close this session or the todo on the mouse-dead half alone.** If the mouse-dead symptom
resolves, Half A must be spun out into its own todo *before* the source file moves to `completed/` —
closing on a title going false is how the winetricks `loadingInstalled` candidate was lost for
three weeks on this exact surface.

## Record correction owed on fix

`SearchBar/index.tsx`'s comment (from `366e719bb`) asserts the `onMouseDown` `preventDefault()`
guard "is UNCHANGED and still correct... `LibrarySearchBar`'s shared consumption of this same
`<ul>` still depends on it." That framing is at least incomplete: the guard may be load-bearing,
but it is demonstrably **not sufficient** for the Library consumer, which is broken in the field. A
reader would reasonably conclude the Library path is healthy. Amend it when this is fixed.

## Current Focus

Session closed 2026-09-21. Nothing further pending on this file.

- hypothesis: N/A — resolved by operator product decision after live measurement, not by
  confirming any of the mechanism hypotheses above.
- test: N/A.
- expecting: N/A.
- next_action: none. See Resolution below; the source todo carries the full closing narrative
  under its own `## RESOLVED 2026-09-21` section, and Half A has its own new pending todo.

### reasoning_checkpoint (structured reasoning before the fix)

```yaml
reasoning_checkpoint:
  hypothesis: >
    Not a mechanism hypothesis. The live drive measured the headline "mouse-dead until Tab"
    claim FALSE (suggestion click worked first time on the GOG query that reproduced the
    surface), while independently confirming a real, different defect (hover rows do not
    highlight) and finding a new one (Steam never appears in suggestions because
    LibrarySearchBar never reads ContextProvider's steam: library). Given those three findings,
    the operator chose to remove the `.autoComplete` suggestions overlay entirely rather than
    fix the hover defect or wire in Steam.
  confirming_evidence:
    - "Live drive under pnpm tauri:dev, operator's real HOME, 2026-09-21: clicking a GOG
      suggestion row worked without any Tab press."
    - "Same drive: GOG suggestion rows did not highlight under the pointer (hover defect
      reproduced)."
    - "Same drive: a Steam query narrowed the main Library grid correctly (2 cards) but produced
      zero suggestion rows — matches LibrarySearchBar's suggestion-building useMemo, which reads
      epic/gog/sideloadedLibrary/amazon/zoom but never steam."
    - "Operator's explicit, stated product decision to remove the dropdown (Playnite model: grid
      narrows on typing, list view already gives row presentation), not a request to fix either
      defect."
  falsification_test: >
    If the operator had instead asked for a fix, the correct move would have been to diagnose
    the hover defect with a fresh probe drive and add `steam` to LibrarySearchBar's suggestion
    list — NOT to delete the surface. The removal is only the correct fix because the operator
    explicitly chose it as a product decision, not because either defect was diagnosed to a root
    cause.
  fix_rationale: >
    Deleting `.autoComplete` and its supporting code (SearchBar's <ul>, mousedown guard, scss
    rules, searchProbe.ts + its tests, LibrarySearchBar's suggestion-building path) is the
    minimal change that satisfies the operator's stated decision. It does not touch the
    surviving input/filter chrome, which Half A is about and which is spun into its own todo.
  blind_spots: >
    The hover defect and Steam-omission were never root-caused — only reproduced/found. If the
    operator ever wants the dropdown back, this session provides no diagnosis to resume from,
    only the fact that both defects existed. Half A (typing needs repeated attempts) was not
    tested at all during this drive and remains fully open on the surviving input.
```

## Evidence

- timestamp: 2026-09-21T03:34:26Z
  observation: The probe is present in the current build — `grep SEARCHPROBE build/` returns three
  chunks. On 2026-09-15 the same grep returned nothing, which fully explains why that drive
  produced no probe result.
  source: `grep -rl SEARCHPROBE build/`

- timestamp: 2026-09-21T03:34:26Z
  observation: No behavioural change has landed on this surface since the report. Every commit to
  `src/frontend/components/UI/SearchBar/` since `366e719bb` (comment-only there) is either the
  probe (`8efb96c02`) or prettier (`d8f535315`). `index.scss` still gates the list on
  `&:focus-within ul.autoComplete { display: block }` with `li:hover { background-color:
  var(--accent) }` intact; `index.tsx` still carries the `onMouseDown` `preventDefault()` guard.
  The Library consumer is live and unchanged: `Header/index.tsx:13` → `LibrarySearchBar` →
  `SearchBar` with bare `<li onClick>` suggestions.
  source: `git log --oneline -- src/frontend/components/UI/SearchBar/`

- timestamp: 2026-09-21T03:34:26Z
  observation: Operator confirmed the drive behind the "already fixed" belief was against the
  Winetricks panel search, not the Library bar — so it is not evidence about this surface.
  source: direct question at session start

- timestamp: 2026-09-21T00:00:00.000Z
  observation: Live drive under `pnpm tauri:dev`, operator's real HOME, measured the headline
  claim FALSE. On the GOG query that reproduced the suggestions surface at all, clicking a row
  worked first time — no Tab press required, no highlight-then-Tab sequence needed. The
  2026-08-30 symptom as decomposed (steps 3-5: click does nothing, Tab enables it, no-highlight
  Tab escapes focus) did not reproduce.
  implication: All three prior code-read hypotheses (IPC transport, `:focus-within` blur-unmount,
  `loadingInstalled` gate) remain correctly eliminated, but now for the additional reason that
  the symptom they were trying to explain does not currently exist as described. No fourth
  mechanism hypothesis was needed.
  source: operator checkpoint response, 2026-09-21 live drive

- timestamp: 2026-09-21T00:00:00.000Z
  observation: The hover-highlight defect (decomposed step 2: rows do not highlight under the
  pointer) DID reproduce on the same GOG query. This is a real, live-confirmed defect —
  independent of the mouse-dead headline claim, which was false.
  implication: Half B of the original symptom (highlight) is real; the mouse-dead-until-Tab
  framing (steps 3-5) was not. This was never root-caused — see Resolution below.
  source: operator checkpoint response, 2026-09-21 live drive

- timestamp: 2026-09-21T00:00:00.000Z
  observation: A NEW defect was found and independently corroborated: `LibrarySearchBar`'s
  suggestion-building `list` useMemo read `epic`/`gog`/`sideloadedLibrary`/`amazon`/`zoom` off
  `ContextProvider` but never `steam`, so Steam titles never appeared as suggestions even though
  `ContextProvider` exposes a `steam:` library alongside the others. Live-confirmed: the
  operator's Steam query narrowed the main Library grid correctly (2 game cards, clickable) while
  producing zero suggestion rows.
  implication: A second, previously-undiscovered defect on this surface, distinct from the
  hover defect and the false headline claim.
  source: code read of `LibrarySearchBar/index.tsx` (pre-removal) cross-checked against the
  operator's live Steam-query drive result

- timestamp: 2026-09-21T00:00:00.000Z
  observation: Given the three findings above, the operator made an explicit product decision to
  remove the entire `.autoComplete` suggestions dropdown from `SearchBar`/`LibrarySearchBar`
  rather than fix either defect — reasoning that the search UX is modelled on Playnite (typing
  narrows the main grid; list view already gives row-like presentation), and that the operator
  had not been aware the dropdown existed as a distinct feature. Verbatim: "I think this feature
  is superceeded."
  implication: Root cause of the ORIGINAL ticket does not need to be found — the surface it was
  filed against is being removed by decision, not by fix. Both defects transition from
  "eliminated" candidates to "orphaned by removal" — see Resolution.
  source: operator checkpoint response, 2026-09-21

- timestamp: 2026-09-21T00:00:00.000Z
  observation: Removal executed and independently verified against the repo (not taken on faith
  from the relayed line numbers): `SearchBar/index.tsx`'s `.autoComplete` `<ul>`, its
  `suggestionsListItems` prop, its `onMouseDown` preventDefault guard, and the probe wiring were
  deleted; `SearchBar/index.scss`'s `.autoComplete` rules and the `&:focus-within ul.autoComplete`
  display toggle were deleted (the sibling `&:focus-within { box-shadow }` input-chrome rule was
  confirmed to style the input itself, not the dropdown, and was kept); `LibrarySearchBar/index.tsx`
  was rewritten down to a thin wrapper around `SearchBar` driving `LibraryContext.handleSearch`;
  `searchProbe.ts`, `searchProbeContrast.test.ts`, and `suggestionFocusRace.test.tsx` were deleted
  outright. `pnpm codecheck`, `pnpm lint`, and the full Frontend + Meta jest projects were run
  clean afterward (Frontend: 167 suites / 2655 tests; Meta: 38/39 suites, the one expected
  transient i18n-gate failure resolved by committing — see below).
  source: direct Read/Edit verification of each file plus `pnpm codecheck`/`pnpm lint`/jest runs
  this session

## Eliminated

- hypothesis: IPC transport — the frame never arrives
  refuted_by: 427 traced sends in one boot with the handler absent from all of them; no frame was
  ever sent. (Recorded in the completed 2026-08-24 todo.)

- hypothesis: `:focus-within` blur-unmount, as the cause on the WINETRICKS surface
  refuted_by: the `preventDefault` guard shipped in `af94c7ebe`, was verified present in the
  running bundle, and the button stayed dead; `35-25` later measured `document.activeElement`
  staying on the `<input>` throughout. NOTE: eliminated **for winetricks only** — it has never
  been tested against the Library consumer, whose symptom 4 is a focus-state signature.

- hypothesis: `Winetricks/index.tsx`'s `loadingInstalled` gate
  refuted_by: `35-25` measured the actual mechanism (an `installing` remount). Winetricks-specific
  and structurally inapplicable here.

## Resolution

root_cause: >
  There is no single root cause, because the headline claim this session was opened to diagnose
  ("mouse-dead until Tab") was measured FALSE on the 2026-09-21 live drive — the fourth
  measurement attempt on this surface, and the first to actually reproduce it. What the drive
  found instead were two real, independent, NEVER-ROOT-CAUSED defects on the `.autoComplete`
  suggestions dropdown (rows don't hover-highlight; Steam is omitted from suggestions entirely
  because `LibrarySearchBar` never reads the `steam:` library off `ContextProvider`), plus one
  correctly-standing decision by the operator to remove the dropdown surface outright rather
  than diagnose or fix either defect.

fix: >
  Not a fix in the mechanism sense — a removal, per explicit operator product decision. Deleted:
  `SearchBar/index.tsx`'s `.autoComplete` `<ul>` (including its `onMouseDown` preventDefault
  guard and its ~100-line FOCUS RACE investigation-history comment), the `suggestionsListItems`
  prop, the `searchProbe.ts` instrumentation wiring; `SearchBar/index.scss`'s `.autoComplete`
  rules and the `&:focus-within ul.autoComplete { display: block }` toggle (the sibling
  `&:focus-within { box-shadow }` input-chrome rule was kept — verified it styles the input, not
  the dropdown); `LibrarySearchBar/index.tsx`'s entire suggestion-building path
  (`handleClick`/`navigate`, `fixFilter`, `normalizeTitle`, the `list` useMemo,
  `RUNNER_TO_STORE`), rewritten to a thin wrapper driving `LibraryContext.handleSearch`;
  `searchProbe.ts`, `searchProbeContrast.test.ts`, `suggestionFocusRace.test.tsx` deleted
  outright. `meta/__tests__/genI18nGateScope.test.ts` and `meta/i18nForkTouchedFiles.json` were
  hand-edited (not regenerated) to drop the deleted `searchProbe.ts` entry from the i18n gate's
  committed fork-touched-files artifact (214 -> 213 files; unscanned debt 42 -> 41; blocking
  scope unchanged at 172).

verification: >
  `pnpm codecheck` clean (zero tsc errors). `pnpm lint` clean at the existing ceiling (638
  warnings, unchanged — the two deleted test files carried zero lint warnings of their own).
  Full Frontend jest project: 167 suites / 2655 tests, all passing. Full Meta jest project: 38/39
  suites passing pre-commit, with the one failure (`genI18nGateScope.test.ts`'s A-17 ANTI-ROT
  test) diagnosed as an expected, transient artifact of comparing against uncommitted HEAD — to
  be re-verified green immediately after this session's commit lands. The original symptom
  itself was verified via the operator's live drive, not a code-level regression test: the
  mouse-dead claim did not reproduce, and the surface it was reported against no longer exists to
  regress.
  Hover defect and Steam-omission: explicitly NOT verified as fixed — they were never diagnosed,
  and the surface carrying them was removed rather than repaired. This is stated plainly, not
  implied: no claim is made that either was measured to a root cause or repaired.

files_changed:
  - src/frontend/components/UI/SearchBar/index.tsx
  - src/frontend/components/UI/SearchBar/index.scss
  - src/frontend/components/UI/LibrarySearchBar/index.tsx
  - src/frontend/components/UI/SearchBar/searchProbe.ts (deleted)
  - src/frontend/components/UI/SearchBar/__tests__/searchProbeContrast.test.ts (deleted)
  - src/frontend/components/UI/SearchBar/__tests__/suggestionFocusRace.test.tsx (deleted)
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nForkTouchedFiles.json
  - .planning/todos/completed/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md (moved from pending/, RESOLVED section appended)
  - .planning/todos/pending/2026-09-21-library-search-typing-needs-repeated-attempts-before-it-filters-usably.md (new — Half A spin-out)
