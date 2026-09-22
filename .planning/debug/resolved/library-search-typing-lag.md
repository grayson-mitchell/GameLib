---
status: resolved
trigger: "Library search bar: typing needs repeated attempts before it filters usably (Half A, spun out of the mouse-dead debug session)"
created: 2026-09-21
updated: 2026-09-21T00:00:00.000Z
source_todo: .planning/todos/pending/2026-09-21-library-search-typing-needs-repeated-attempts-before-it-filters-usably.md
---

# Library search bar: typing needs repeated attempts before it filters usably

## Symptoms

**Expected behavior:** Typing a query into the Library search bar narrows the main Library grid
on the first pass — every keystroke lands in the input and the grid reflects the full typed
string.

**Actual behavior (operator's verbatim account, originally reported 2026-08-26 against the old
Winetricks search surface, carried forward because the mechanism it points at — `SearchBar`'s own
input plumbing — is shared and still live in `LibrarySearchBar`):**

> "very painful, took hovering, typing in search multiple times until line highlighted and then
> needed the panel to 'react' and allow mouse move to move the highlight"

Decomposed for the surviving surface: typing a query needs several attempts before the grid
narrows usably. This is the **debounce/responsiveness half** (Half A). The highlight/hover half
belonged to the `.autoComplete` dropdown, which was deleted in `2791529ff` and is closed as
never-diagnosed.

**Error messages:** None. No console error, no log line. Silent.

**Timeline:** Reported 2026-08-26. Never measured on the Library consumer — only ever observed on
the now-deleted Winetricks search surface. No known good state.

**Reproduction:** Type a multi-character query into the Library search bar and watch the grid.

## Scope note — what this is NOT

Not mooted by the mouse-dead session's fix. That session removed `SearchBar`'s `.autoComplete`
suggestions dropdown entirely (operator decision — search is modelled on Playnite: typing narrows
the main grid, list view already gives the row presentation the dropdown offered). The **input
itself survives** as filter chrome and still drives `LibraryContext.handleSearch` on every
keystroke. Half A is about that surviving input.

## Structural facts established at HEAD before this session opened (do not re-derive)

1. `SearchBar` (`src/frontend/components/UI/SearchBar/index.tsx:27-40`) drives its input
   **uncontrolled**: a native `'input'` listener attached in a `useEffect` with dependency array
   `[input, value, onInputChanged]`. That effect body unconditionally executes
   `element.value = value` (line 30) on **every** re-run, not just on mount — despite the
   in-file comment at lines 42-44 asserting "The effect above only runs on mount".
2. `LibrarySearchBar` (`src/frontend/components/UI/LibrarySearchBar/index.tsx:10-12`) defines
   `onInputChanged` inline, so its identity changes on **every** parent render, re-arming the
   effect in (1) on every render.
3. `LibraryContext.handleSearch` is a bare `setFilterText`
   (`src/frontend/screens/Library/index.tsx:1061`) — no debounce — and `filterText` drives an
   expensive per-keystroke fuzzy search/filter at `src/frontend/screens/Library/index.tsx:706-722`.
4. A second effect (`SearchBar/index.tsx:45-49`) writes `value` back into `input.current.value`
   whenever it differs.

**These are stated as the place to look, not as a diagnosis.** This project has a recorded history
of forming hypotheses about this exact `SearchBar` primitive purely from reading the source and
being wrong all three times (IPC transport, `:focus-within` blur-unmount, `loadingInstalled` gate
— see `.planning/debug/resolved/library-searchbar-mouse-dead.md` for the full record).

## Current Focus

reasoning_checkpoint:
  hypothesis: "Both of SearchBar's DOM-sync effects were `useEffect` (a passive effect, deferred
    by React to a task after commit, not synchronous with it). Any render triggered by a keystroke
    queues a write of `element.value = value` (that render's closed-over, now-already-stale
    string) for later. If a further native 'input' event fires in the gap between that render's
    commit and its effect flush — still routed to the not-yet-replaced listener from the PRIOR
    effect run — it advances the DOM natively ahead of `value`. When the deferred effect finally
    flushes, its unconditional (effect 1) or guarded-but-late (effect 2) write stomps the DOM back
    to the stale value, silently erasing the character the user just typed. This is exactly the
    'typing needs repeated attempts before it filters usably' symptom: the user sees their
    keystroke vanish and has to retype it."
  confirming_evidence:
    - "A hand-rolled hook-host harness (useRef/useEffect/useLayoutEffect/useCallback shims,
      documented as a substitute for jsdom in searchBarTypingRace.test.ts's header) invoked the
      REAL, unmodified SearchBar function directly and reproduced the exact rollback
      deterministically: mount -> keystroke 'a' -> render (commit, effect queued but NOT flushed)
      -> keystroke 'ab' lands on the still-attached mount-time listener -> flush the deferred
      effect -> DOM reverts to 'a'. Test passed (proved the mechanism) against the pre-fix source."
    - "A negative control in the same harness showed NO rollback when render+flush happen
      back-to-back with no gap for an interleaved event — isolating the deferred-flush gap as the
      necessary condition, not some unrelated artifact of the harness."
    - "Reverted the useEffect->useLayoutEffect fix locally (git stash) and re-ran the primary
      regression test: it went RED (received 'a', expected 'ab'), confirming the test actually
      exercises the defect against real shipped code, not just against an idealized model."
    - "Re-applied the fix: same test goes GREEN. Full frontend jest project (168 suites / 2813
      tests) still green; pnpm lint at exactly 638/638 warnings (0 errors, ceiling documented as
      zero-headroom) with the new test file contributing 0 new warnings; pnpm codecheck clean."
  falsification_test: "If flushing the deferred effect with a value that matches the current DOM
    content (no interleaved event in the gap) still rolled back the DOM, or if switching both
    effects to useLayoutEffect still allowed the rollback under the same interleaving, the
    hypothesis would be wrong. Both were tested directly (negative control, and the
    fix-verification test before/after the source change) and neither falsifying outcome occurred."
  fix_rationale: "useLayoutEffect runs synchronously as part of the same commit that produced it —
    there is no task boundary for a browser-dispatched native event to land in between commit and
    the DOM-sync write. This removes the race at its source (the async gap) rather than papering
    over a symptom (e.g. debouncing the search, which would slow down filtering but not stop
    characters from visually vanishing while typing)."
  blind_spots: "This is a hook-host substitute for a real DOM/React renderer (jsdom and
    react-test-renderer are both absent from node_modules — confirmed, not assumed; see the test
    file's header). It proves the mechanism is real and deterministic GIVEN that
    commit-then-later-native-event interleaving, but it does not prove that interleaving actually
    occurs at real human typing speed against the shipped app on the operator's Mac, nor rule out
    a second, independent contributor (e.g. the Library screen's own expensive per-keystroke
    filter at Library/index.tsx:706-722 causing additional visible lag even once the rollback is
    fixed). Needs the live fallback (searchProbe.ts opt-in probe, or a manual `pnpm tauri:dev`
    drive) to close that gap — flagged explicitly in the human-verify checkpoint below."

hypothesis: CONFIRMED — see reasoning_checkpoint above and Resolution below.
test: n/a — fix applied, self-verified, and confirmed live on the operator's Mac 2026-09-21.
expecting: n/a
next_action: none — session closed.

## Available instrumentation

- Pre-existing opt-in live probe from `8efb96c02` (`searchProbe.ts`), armed by typing `::probe-on`
  into any search bar. Default-OFF. Live fallback if the jest reproduction comes back negative.
- `pnpm tauri:dev` drive on the operator's real Mac (the `ready: live-gate` path the todo
  specifies).

## Evidence

- timestamp: 2026-09-21T00:00:00.000Z
  checked: `node_modules` for jsdom / jest-environment-jsdom / react-test-renderer /
    happy-dom / linkedom / domino, and `src/frontend/jest.config.js`'s `testEnvironment` and
    docstring.
  found: None of these packages are installed anywhere in `node_modules` (confirmed via
    `find node_modules -maxdepth 2 -iname <pkg>` returning nothing for each, after an earlier
    `ls ... | head -1 && echo present` false-positive caused by shell pipe exit-code masking was
    caught and re-checked). `jest.config.js` deliberately inherits the root `testEnvironment:
    'node'` and its docstring documents this as an intentional no-DOM-tooling decision. Established
    codebase convention for testing components without a DOM: mock `react` hooks and invoke
    function components as plain JS functions directly (precedent: `HumbleOriginInfo.test.tsx`,
    `WinetricksBrowse.test.tsx`).
  implication: The debug file's literally-specified "RTL/jest reproduction... firing rapid
    successive native `input` events" cannot be built as originally worded without adding a new
    npm dependency, which needs a human package-legitimacy checkpoint and is out of scope for an
    autonomous fix. Built a substitute: a hand-rolled hook-host harness (see next entry) that
    invokes the real component directly while faithfully modeling React's documented
    commit-vs-effect-flush timing contract, rather than theorizing from source alone.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: Built `src/frontend/components/UI/SearchBar/__tests__/searchBarTypingRace.test.ts` — a
    hook-host harness (`useRef`/`useEffect`/`useLayoutEffect`/`useCallback` shims via
    `jest.mock('react', ...)`) that invokes the REAL, unmodified `SearchBar` function directly,
    with passive effects deferred behind a `setImmediate` (models React's real task-boundary
    deferral) and layout effects run synchronously within the same `render()` call (models
    React's real layout-effect timing).
  found: Against the pre-fix source (`useEffect` for both DOM-sync effects), the primary test
    failed exactly as hypothesized: mount -> keystroke 'a' -> render (commit, effect queued but
    not yet flushed) -> keystroke 'ab' lands on the still-attached, not-yet-replaced listener ->
    flushing the deferred effect stomped `fakeInput.value` back to `'a'` — the already-typed 'b'
    was silently erased. A negative-control test (no gap between commit and flush) showed no
    rollback, isolating the deferred-flush gap as the necessary condition.
  implication: The race is real, deterministic, and reproducible directly against shipped
    component code (not just theorized from reading it) given the modeled interleaving. This
    confirms the mechanism described in Current Focus's reasoning_checkpoint.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: Harness correctness — an early version used a module-level singleton `const host =
    createHookHost()` shared across both `it()` blocks.
  found: The second test's ref-attach logic silently no-opped because `ref.current` was
    non-null (leftover from the first test's fake input), so the fake input was never wired up in
    the second test and its assertions were passing for the wrong reason.
  implication: Harness bug, not a SearchBar finding. Fixed by reassigning `host` fresh in
    `beforeEach`. Documented in the test file's own comments as a pitfall for future readers,
    per the "green-check-proving-nothing" pattern this project explicitly watches for.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: Applied the fix (`useEffect` -> `useLayoutEffect` for both of `SearchBar`'s DOM-sync
    effects, `src/frontend/components/UI/SearchBar/index.tsx`), then re-ran the primary
    regression test.
  found: Test goes GREEN — `fakeInput.value` ends at `'ab'`, no rollback, with the same modeled
    interleaving that broke the pre-fix source.
  implication: Fix addresses the confirmed mechanism directly (removes the async task boundary
    the race depends on), not a downstream symptom.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: Mandated revert-and-confirm-red verification — `git stash push -- 
    src/frontend/components/UI/SearchBar/index.tsx` (isolating just that one file's change) then
    re-ran the new regression test, then `git stash pop`.
  found: With the fix stashed (source back to `useEffect`), the primary regression test failed
    (received `'a'`, expected `'ab'`). Restoring the fix (`stash pop`) made it pass again.
  implication: The regression test genuinely exercises the defect's presence/absence in real
    shipped code — it is not an artifact of the harness or a tautology.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: Full verification sweep after the fix — `pnpm codecheck` (`tsc --noEmit`), `npx eslint
    --ext .ts,.tsx` on both changed/added files, the full frontend jest project, and `pnpm lint`
    (both ceilings).
  found: `codecheck` clean. ESLint clean on both files (after fixing an
    `@typescript-eslint/no-unnecessary-type-assertion` error and removing an unnecessary
    `SearchBarProps = any` cast + its now-unused eslint-disable comment from the test file — the
    real `SearchBar` call typechecks fine with no cast at all). Full frontend jest suite: 168/168
    suites, 2813/2813 tests passing. `pnpm lint` tests-ceiling: exactly 638/638 warnings, 0 errors
    (re-measured, not assumed — this ceiling is documented as zero-headroom) — the new test file
    contributes 0 additional warnings.
  implication: No regressions introduced; the tests ceiling was re-verified at its exact
    documented value rather than assumed unchanged.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: Orchestrator re-verified the session manager's four headline claims independently rather
    than accepting them, given this repo's "green check proving nothing" history. Reverted the
    source file to HEAD with `git show HEAD:<path> >` (deliberately NOT `git stash`, which disturbs
    concurrent sessions), re-ran the regression test, restored from a scratchpad copy; then ran
    `pnpm lint` capturing its exit code to a file rather than through a pipe, and the full frontend
    project.
  found: Primary test RED without the fix (`Expected "ab", Received "a"`) and GREEN with it, while
    the negative control stayed GREEN in BOTH directions — so it is not a test that any edit to the
    file reddens. `pnpm lint` exit 0 with the tests ceiling at exactly 638/638. Frontend project
    168/168 suites, 2813/2813 tests.
  implication: All four claims hold as stated.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: The session manager's claim that "jsdom/RTL are absent from node_modules".
  found: Overstated in one direction. `@testing-library/react@14.3.1` IS installed and IS in
    package.json (line 145), along with `@testing-library/dom`, `/jest-dom` and `/user-event`. What
    is genuinely absent is `jsdom` and `jest-environment-jsdom`, and `src/frontend/jest.config.js`
    lines 4-14 document the no-DOM-tooling choice as a standing project decision whose reversal
    needs a human package-legitimacy checkpoint.
  implication: The operative conclusion is unchanged — an RTL-over-jsdom reproduction was not
    buildable here without a new dependency, because RTL without jsdom has no DOM to render into.
    Recorded because "RTL is absent" would mislead the next reader into thinking component tests
    are unsupported, when eight files already import RTL.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: Fidelity of the hook-host harness to real React, specifically whether the modelled
    two-keystroke sequence maps 1:1 onto the shipped app.
  found: The harness is slightly OPTIMISTIC about the severity of the pre-fix defect. Real React
    flushes pending passive effects at the START of the next render (`performConcurrentWorkOnRoot`
    calls `flushPassiveEffects()` before beginning work), not only on its own scheduler callback.
    So in the exact sequence modelled, the shipped app would roll the DOM back to 'a' and then the
    FOLLOWING commit's effect would restore 'ab' — a visible flicker, with permanent character loss
    only when a further keystroke lands inside that rolled-back window during sustained typing. The
    harness stops one render short, so it scores a transient rollback as a permanent one.
  implication: Does not invalidate the fix — `useLayoutEffect` removes the deferral window outright,
    which is correct against both the transient and the permanent form. It IS the reason the
    `ready: live-gate` marker on the source todo was load-bearing rather than ceremony, and why the
    live confirmation below is the evidence that actually closes this, not the harness.

- timestamp: 2026-09-21T00:00:00.000Z
  checked: LIVE GATE (the `ready: live-gate` step the source todo required). Operator ran
    `pnpm tauri:dev` on their Mac, went to the Library screen and typed a multi-character query
    into the search bar at normal speed.
  found: Operator's verbatim report — "typed in search query no issues, flickering, letter
    disapperaring, etc." i.e. no characters vanished, no flicker, no retyping needed, and no
    separate grid-lag complaint raised.
  implication: Closes the one blind spot the harness could not reach. The symptom reported
    2026-08-26 is gone on the live surface. Note what this does NOT establish: the live run was
    conducted only WITH the fix applied, so it confirms the fixed state is good but is not itself a
    before/after measurement — the before/after evidence is the harness's revert-and-confirm-red.

## Eliminated

(none — the first and only hypothesis formed from direct harness measurement was confirmed; no
competing hypothesis was tested and disproven in this session)

## Resolution

root_cause: `SearchBar` (src/frontend/components/UI/SearchBar/index.tsx) drove its uncontrolled
  input via two `useEffect`s (passive effects, deferred by React to a task after commit). Because
  `LibrarySearchBar` passes a freshly-identitied `onInputChanged` and a changed `value` on every
  keystroke (structural facts #2/#3 in this file), both effects re-armed on every render. A native
  'input' event landing in the gap between a render's commit and that render's deferred effect
  flush — still routed to the prior, not-yet-replaced listener — advanced the DOM natively ahead
  of the committed `value`. When the deferred effect then flushed, it wrote the stale, closed-over
  `value` back into the DOM, silently erasing the character the user had just typed. This is the
  mechanism behind "typing needs repeated attempts before it filters usably": the user's keystroke
  visibly vanishes and has to be retyped.
fix: Changed both of SearchBar's DOM-sync effects from `useEffect` to `useLayoutEffect`
  (src/frontend/components/UI/SearchBar/index.tsx). `useLayoutEffect` runs synchronously as part
  of the same commit, so there is no task boundary for a native browser event to land in between
  commit and the DOM-sync write — removing the race at its source.
verification: Reproduced the race deterministically against the real, unmodified `SearchBar`
  via a hand-rolled hook-host harness (jsdom absent from this repo by standing decision; RTL is
  installed but has no DOM to render into — see Evidence for the correction). Regression test
  confirmed RED against the pre-fix source and GREEN against the fix, twice: once by the session
  manager via `git stash`, and once independently by the orchestrator via
  `git show HEAD:<path>`, with the negative control staying GREEN in both directions. Full frontend
  jest suite (168/168 suites, 2813/2813 tests), `pnpm lint` (exit 0, tests ceiling at exactly
  638/638 warnings, 0 errors, re-measured), and `pnpm codecheck` all clean. CONFIRMED LIVE
  2026-09-21 by the operator on their Mac via `pnpm tauri:dev` — typing a multi-character query
  into the Library search bar showed no vanishing characters and no flicker. The harness's one
  known fidelity gap (it models the rollback as permanent where real React would self-correct it
  into a flicker) is recorded in Evidence and is why the live gate, not the harness, is what closes
  this session.
files_changed:
  - src/frontend/components/UI/SearchBar/index.tsx
  - src/frontend/components/UI/SearchBar/__tests__/searchBarTypingRace.test.ts (new)
