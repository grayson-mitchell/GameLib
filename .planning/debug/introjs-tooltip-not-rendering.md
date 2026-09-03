---
slug: introjs-tooltip-not-rendering
status: fix-applied-REFUTED-live
trigger: "intro.js tooltip renders nothing in both GameLib tours — no title, body, or Next/Back/Skip controls; dim overlay and highlight box do render. Intermittent and session-stateful across runs. Found during 34.12-07 live gate."
created: 2026-09-03
updated: 2026-09-03T08:06:14Z
source: 34.12-07 blocking manual verification (see 34.12-07-SUMMARY.md)
severity: blocking — Phase 34.12 cannot be marked verified
---

# Debug: intro.js tooltip renders nothing

## Symptoms

**Expected behavior.** Starting either tour shows an intro.js tooltip anchored to the
highlighted element: a title (where the step defines one), the step's body text, bullets, and
the Next / Back / Skip / Done buttons built from `Tour.tsx`'s `defaultOptions`.

**Actual behavior.** The dim overlay and the highlight box render correctly, but **no tooltip
appears at all** — no title, no body text, no controls. Operator, verbatim:

- *"tour starts, but all the tour is is the highlighter box... there is no description"*
- *"there are no next / back / skip buttons"*
- *"on settings tour there are no desciptions. On Library there are no descriptions"*

The tour is still driveable by **arrow keys** (intro.js `keyboardNavigation` defaults on and
nothing disables it), which is how 34.12-07 scored its twelve steps despite the defect.

**Error messages.** None. No dialog, no console error reported, no build error. The tour
completes cleanly and `endTour` fires normally.

**Timeline.** Unknown — **never known to have worked under Tauri.** No phase before 34.12-07
ever verified a tour *rendering* in this shell: 34.10 disabled the sidebar tour under D-13 and
34.12 rebuilt it against a jest project that is `testEnvironment: 'node'` with no jsdom. So
this may predate 34.12 entirely and have been invisible since the Electron→Tauri migration.
**Do not assume 34.12 introduced it.**

**Reproduction.** `pnpm tauri:dev` (never bare `tauri dev` — serves a stale bundle), then
Settings → "App Tour", or Library → the `?` help icon in the action-icons row.

## Critical context — DO NOT REPEAT THIS WORK

Two hypotheses were already tested against the live app during 34.12-07 and **both are
REFUTED**. Re-running either wastes an operator session.

### REFUTED 1 — "`introjs.css` never loads"

Genuinely plausible, because `Tour.scss` *independently* defines both visible effects:
`.introjs-helperLayer { box-shadow: 0 0 0 1000px rgba(0,0,0,.6) }` produces the dimming and
`.heroic-tour-highlight` produces the highlight border. So both symptoms survive with intro.js's
own stylesheet absent.

**Refuted by:** fetching the vite-transformed module —
`curl -s http://localhost:5173/src/frontend/components/Tour/Tour.tsx` emits
`import "/node_modules/intro.js/introjs.css"`, and that URL serves 200 with real CSS.

### REFUTED 2 — "`disableInteraction: true` or `position: 'right'` suppresses the tooltip"

These are the only structural differences between the two tours' `<Tour>` invocations:

```
NavShellTour:  <Tour … options={{ disableInteraction: true }} />   ← D-04
LibraryTour:   <Tour … />                                          ← no options
```

Two isolated one-line source probes were run against the live app, each diffed against a
byte-copy backup to prove single-line isolation, and both reverted:

- Probe 1: `disableInteraction: true` → `false`.
- Probe 2: `disableInteraction` restored to `true`; `position` forced to `'bottom'`.

**Refuted by:** `LibraryTour` **was not modified by either probe**, yet it rendered descriptions
during probe 1's run and none during probe 2's run. A component nobody touched changed
behaviour between runs, so the variable was never `disableInteraction` and never `position` —
both probes were reading run-to-run variance as a configuration effect.

## The actual signal: intermittent and session-stateful

Run-by-run, in the order observed on 2026-09-03, macOS arm64:

| run | config | observation |
|---|---|---|
| A | committed | nav tour: no descriptions. library tour: "just dims the screen". |
| B | committed | library tour auto-resumed at startup **with** descriptions, walked whole. Then nav tour: none. Then library redo: steps 1-2 element-less by design, game tile onward fine. |
| C | `disableInteraction:false` | library tour at startup: descriptions through step 3. Then nav tour: step 1 description, then it disappeared. |
| D | `position:'bottom'` | nav tour: none. library tour: none. |

**Candidate pattern, NOT established:** the *first* tour after app start renders tooltips and
later ones in the same session do not. Runs B and C fit. Run D is unconfirmed because nobody
checked whether a tour auto-resumed at startup before the nav tour was opened.

**A confound to control for:** `TourContext` persists the whole `tourState` — including
`activeTour` — to `localStorage['heroic-tour-state']` and restores it on boot, with nothing
resetting it. So killing the app mid-tour makes the *next* launch auto-resume that tour. Any
run that begins with an auto-resumed tour has already "spent" the first-tour-after-start slot.
**Record, for every run, whether a tour was already active at boot.**

## Environment / versions

- `intro.js` 7.2.0, `intro.js-react` 1.0.0 (peer `>=2.5.0` satisfied; `intro.js` has no deps)
- Tauri shell, WKWebView on macOS 15 (darwin 25.5.0), arm64
- `Tour.tsx` / `Tour.scss` are **untouched by phase 34.12** — last four commits are all upstream
  Heroic (`9c7f7fb51`, `b11b483c9`, `94716b0b0`, `741f317db`)
- Relevant DOM classes intro.js creates: `.introjs-tooltipReferenceLayer`, `.introjs-tooltip`,
  `.introjs-tooltiptext`, `.introjs-tooltipbuttons`, `.introjs-helperLayer`

## Investigation constraints (read before planning any step)

1. **The DevTools console INPUT is dead in this build.** Paste fails and Enter does not submit.
   Any step of the form "open DevTools and run `…`" is not executable. The console **output**
   panel reads fine.
2. **Therefore: instrument, don't interrogate.** Add a temporary `console.warn` in `Tour.tsx`
   reporting whether `.introjs-tooltipReferenceLayer` / `.introjs-tooltip` exist in the DOM
   after `start()`, plus `getBoundingClientRect()`, `getComputedStyle` display/visibility/
   opacity/z-index, and `parentElement`. Have the operator read it from the output panel.
3. **No jsdom, no browser automation in this repo.** Nothing here can be proven by jest.
   Every verification step needs the operator at the keyboard.
4. **Vary exactly ONE thing per run**, and record whether a tour auto-resumed at boot.
5. **Do not mark this fixed on a green suite.** The suite was green throughout while the tour
   was completely unusable.

## Current Focus

**CLEANUP CYCLE (2026-09-03T08:06Z) — OPERATOR ELECTED TO SKIP FURTHER LIVE VERIFICATION.**

The v3 diagnostic confirmation run never captured any observation: the last relaunch died
before the tour could be exercised because vite re-optimized `intro.js` mid-session, forcing a
page reload — the exact condition previously flagged (this file's prior cycle) as capable of
leaving the v3 one-time prototype patch (`v3Patched` module-level guard, reset by a full reload
but not by an HMR update) inconsistent. The operator directed that this session close out as
cleanup + honest record-keeping, NOT as a verified fix. **There is no live evidence for or
against the fix in this cycle.**

Actions taken this cycle:
1. Reverted both diagnostics (v2 MutationObserver timeline, v3 prototype monkey-patch) out of
   `Tour.tsx`, using the current file plus the recorded backups
   (`Tour.tsx.orig-backup`/`.v2-backup`/`.v3-backup` in scratchpad) as the reference for exactly
   what each diagnostic layer added, so only the fix (`useMemo`'d `defaultOptions` and
   `mergedOptions`) remained. Removed the now-unused `import introJsFactory from 'intro.js'`
   (only consumer was the v3 patch function) along with it.
2. Confirmed via `grep -rn "TOUR-DEBUG\|MutationObserver\|patchIntroJsForDiagnostics\|
   introJsFactory\|v3Patched"` across `Tour/`, `NavShellTour/`, `LibraryTour.tsx`,
   `TourContext.tsx` — zero matches. No diagnostic code remains in any production file.
3. Diffed `NavShellTour/index.tsx`, `LibraryTour.tsx`, `TourContext.tsx` against their
   `.orig-backup` copies: all three only ever carried the fix (`useMemo`/`useCallback`
   additions) — no diagnostics were ever added to these three files, so no revert was needed
   for them.
4. Re-checked the two test-file `jest.mock('react', ...)` `useMemo` passthroughs
   (`NavShellTour.test.tsx`, `libraryTourAnchors.test.tsx`): both are required by the real fix
   (NavShellTour/LibraryTour now build their `steps` array inside `useMemo`, and these tests
   invoke the components as plain functions with no React dispatcher installed, so the real
   `useMemo` would throw) — NOT by the removed diagnostics. Both mocks' own comments already
   correctly attributed the need to the `useMemo` fix, not to diagnostic code. Kept as-is.
5. Re-ran gates against the post-revert tree (this is the correct order — the prior cycle's
   green run was against INSTRUMENTED code, not this final shape):
   - `npx tsc --noEmit -p tsconfig.json` — exit 0.
   - `npx eslint` on all six touched files — 0 errors, 5 pre-existing-pattern warnings
     (`import-x/no-named-as-default-member` on `React.useMemo`/`React.useEffect` call syntax,
     `@typescript-eslint/no-unsafe-assignment`/`no-unsafe-return` on the `options` prop — none
     new, none touching the fix logic, same class of warning the codebase already carries
     elsewhere).
   - `npx jest -c src/frontend/jest.config.js` — **141/141 suites, 2184/2184 tests pass.**
   - `pnpm exec prettier --check` on all six touched files — all pass, no formatting drift.
6. `git status --short` after cleanup: exactly the six intended files modified
   (`Tour.tsx`, `NavShellTour/index.tsx`, `LibraryTour.tsx`, `TourContext.tsx`,
   `NavShellTour.test.tsx`, `libraryTourAnchors.test.tsx`) plus the two pre-existing untracked
   items (this debug file, `.planning/phases/40-*`). Nothing staged; nothing committed.

**What this cycle does NOT establish:** whether the fix actually stops the tooltip-blanking
churn in the live app. A green jest suite is not evidence here (no jsdom in this jest project,
no browser automation in this repo — the suite was green throughout the entire time the tour
was completely unusable, per this file's original investigation constraints). The v3
prototype-patch confirmation run described in the reasoning_checkpoint below was never
completed. **Live verification remains OUTSTANDING.**

reasoning_checkpoint:
  hypothesis: "componentDidUpdate in intro.js-react's Steps component (node_modules/intro.js-react/dist/esm/components/Steps/index.mjs)
    guards configureIntroJs()+renderSteps() on `prevProps.options !== options` and
    `prevProps.steps !== steps` (both reference equality). Tour.tsx builds
    `options={{ ...defaultOptions, ...options }}` fresh every render (defaultOptions itself
    rebuilt every render from t()), and NavShellTour/LibraryTour build their `steps` arrays
    fresh every render via array-literal spreads. Because both guards are structurally
    always-true, EVERY render of a mounted <Tour> re-runs configureIntroJs()+renderSteps(),
    which calls setOptions()+goToStepNumber() and re-enters intro.js's debounced
    show-step/reuse-branch path (the `_showElement` reuse branch documented in Evidence,
    2026-09-03, 'read node_modules/intro.js/intro.js'), resetting tooltip opacity to 0 and
    rescheduling the 350ms restore. Any render cadence faster than ~350ms (matches the
    observed ~260ms churn) permanently starves the restore."
  confirming_evidence:
    - "Direct source read of node_modules/intro.js-react/dist/esm/components/Steps/index.mjs
      componentDidUpdate: reference-equality guards on props.options and props.steps,
      confirmed this cycle via graphify-oriented read (not yet live-confirmed against v3
      call-stack capture)."
    - "Direct source read of src/frontend/components/Tour/Tour.tsx line 228-231: `options={{
      ...defaultOptions, ...options }}` is an inline object literal in the JSX, defaultOptions
      is a plain const rebuilt every render body execution — no memoization anywhere in this
      file prior to this fix."
    - "Direct source read of NavShellTour/index.tsx line 146: `const steps = [...baseSteps,
      ...remainingSteps]` rebuilt every render; LibraryTour.tsx line 131: `const steps =
      [...introSteps, ...gameCardStep, ...uiSteps, ...finalStep]` same pattern. Neither wrapped
      in useMemo prior to this fix."
    - "Prior cycle's Evidence entry (2026-09-03, 'confirmed componentDidUpdate's guard') already
      established the render-churn mechanism is real and frequent via TourContext's unmemoized
      value forcing every useTour() consumer to re-render on any tour state change — this cycle
      adds the missing link: the options/steps reference-identity guards mean ANY such re-render
      (not just context-driven ones) re-enters the show-step path, which is the piece that was
      previously unconfirmed."
  falsification_test: "v3's prototype-patch diagnostic (already in place, unmodified by this
    fix) should show goToStepNumber/refresh calls at ~260ms spacing with stacks pointing through
    intro.js-react's renderSteps/componentDidUpdate BEFORE the fix, and should show ZERO such
    calls after a tour's initial start+goToStepNumber pair once the fix is applied (mounted
    <Tour> should not re-invoke these methods on ordinary re-renders post-fix). If v3 still
    shows periodic calls after the fix, the hypothesis is wrong or incomplete — likely meaning
    either TourContext's value is still unstable in some path this read missed, or another
    unmemoized object is passed as `options`/`steps` from a caller not yet inspected."
  fix_rationale: "The fix targets the root cause (unstable reference identity feeding
    componentDidUpdate's guards) rather than the symptom (tooltip opacity/churn itself). Once
    options and steps have stable identities across renders that don't actually change their
    logical content, componentDidUpdate's guards correctly no-op on unrelated re-renders, so
    intro.js's own internal state machine (start() + one goToStepNumber() call at tour start,
    matching the 'structural double-call' already documented in Evidence) is left alone to
    complete its single 350ms restore without being re-triggered by React churn."
  blind_spots: "Not yet confirmed live that the ~260ms churn's actual driver is componentDidUpdate
    specifically (as opposed to, e.g., a genuine window resize handler still uncaught, or a
    second module instance of intro.js) — the coordinator's relay and this read together make
    it high-confidence but this is source reading, not yet a live capture with v3 stacks
    attributing the calls to componentDidUpdate/renderSteps by name. Also unconfirmed: what
    specifically drives the FREQUENCY of Tour's own re-renders (TourContext's unmemoized value
    is the leading candidate per prior Evidence, and is fixed as part of (c) below, but this
    cycle did not trace every possible re-render source such as ContextProvider's own update
    frequency) — this fix removes the SENSITIVITY to re-render frequency (the guards become
    correct) rather than removing every possible cause of re-renders, which is the more robust
    fix regardless of how many re-render sources exist."

hypothesis: SUPERSEDED this cycle by the reasoning_checkpoint above — the ~260ms churn's root
      cause is the always-true reference-identity guards in intro.js-react's
      `Steps.componentDidUpdate` (`prevProps.options !== options`, `prevProps.steps !== steps`),
      fed by fresh object/array literals rebuilt on every render in `Tour.tsx`, `NavShellTour`,
      and `LibraryTour`, amplified by `TourContext`'s unmemoized provider value forcing frequent
      re-renders of every mounted `<Tour>`. This explains the mechanism traced in the prior
      cycle's Evidence (`jt`/`_showElement` reuse-branch churn) without needing to further
      isolate WHICH intro.js public method is invoked or from where — any React re-render of a
      mounted `<Tour>` re-enters the show-step path, unconditionally, given these guards.
test: FIX APPLIED this cycle (not yet live-verified) across four files — `useMemo`/`useCallback`
      added to stabilize the reference identities that fed the always-true guards:
      1. `src/frontend/components/Tour/Tour.tsx` — `defaultOptions` and the merged
         `{...defaultOptions, ...options}` object are now both `React.useMemo`'d
         (deps `[t]` and `[defaultOptions, options]` respectively); `<Steps options={...}>`
         now receives the memoized `mergedOptions` instead of an inline literal.
      2. `src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx` — the `steps`
         array construction (`baseSteps`/`remainingSteps`) is wrapped in `useMemo` (deps
         `[t, isWin, position]`); the `options={{ disableInteraction: true }}` inline literal
         is replaced with a module-level constant `NAV_TOUR_OPTIONS` (never changes identity).
      3. `src/frontend/screens/Library/components/LibraryTour.tsx` — the `steps` array
         construction is wrapped in `useMemo` (deps `[t, hasGames]`).
      4. `src/frontend/state/TourContext.tsx` — `startTour`/`endTour`/`resetTour` wrapped in
         `useCallback` (empty deps — already used the functional setState form, no closure over
         `tourState`); `isTourActive`/`hasTourCompleted` wrapped in `useCallback` (deps
         `[tourState]` — these read state directly); the provider's context `value` wrapped in
         `useMemo` (deps on all six values above), so the value object's identity now only
         changes when `tourState` itself actually changes.
      Two test files needed a matching update because they invoke the components as plain
      functions with no React dispatcher installed (documented pattern, `src/frontend/
      jest.config.js`): `NavShellTour.test.tsx` and `libraryTourAnchors.test.tsx` both added a
      `useMemo: <T,>(factory: () => T) => factory()` passthrough to their existing partial
      `jest.mock('react', ...)` (these tests assert structural step content, not memoization
      behaviour, so a passthrough is sufficient and correct).
      Self-verification performed (does NOT prove the live fix — see constraint 4): `npx tsc
      --noEmit -p tsconfig.json` exits 0 across the whole project; `npx eslint` on all six
      touched files reports 0 errors (pre-existing style warnings only, none new, none
      touching the fix logic); full `npx jest -c src/frontend/jest.config.js` run: 141/141
      suites, 2184/2184 tests pass (no regressions). v2 and v3 diagnostics in `Tour.tsx` are
      UNCHANGED and still active per constraint 3 — full byte-copy backups of the pre-fix
      Tour.tsx exist at
      `/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/410cba63-6b06-4140-a113-36943662a43b/scratchpad/Tour.tsx.v3-backup`
      (this cycle's pre-fix baseline, v2+v3 diagnostics, no fix), plus prior
      `Tour.tsx.v2-backup` and `Tour.tsx.orig-backup`. `NavShellTour/index.tsx.orig-backup`,
      `LibraryTour.tsx.orig-backup`, `TourContext.tsx.orig-backup` also saved this cycle
      (pre-fix state of the other three files, none previously backed up).
expecting: operator round should show (a) `[TOUR-DEBUG-V2]` timeline for both nav-tour and
      library-tour with `finalOpacity=1` and a timeline that does NOT show repeated
      helperLayer/tooltipReferenceLayer STYLE mutations every ~260ms after the initial
      start — i.e. the churn pattern disappears entirely; (b) `[TOUR-DEBUG-V3]` should show
      the initial `start()` + `goToStepNumber()` pair at tour-start time (expected, structural,
      not a bug) but NO further `refresh`/`goToStepNumber`/`nextStep`/`previousStep` calls
      firing on a ~260ms cadence while the tour sits idle on a step. If v3 still shows periodic
      calls after this fix, that falsifies "React re-render churn via these specific
      components" as the (sole) driver — see reasoning_checkpoint.blind_spots for what to check
      next (another unmemoized prop source, a second intro.js module instance, or a genuine
      window resize).
next_action: operator does a full teardown + relaunch of `pnpm tauri:dev` (sweep the orphaned
      node sidecar by PATH first — established Tauri gotcha; Vite HMR may not cleanly apply
      this many changed files/hooks). Reproduce both tours in the SAME session: (1) let an
      auto-resumed tour play out if one resumes at boot (or leave one active before relaunch to
      force an auto-resume — this is the case that reproduced most reliably in prior cycles);
      (2) manually start the OTHER tour (or restart the same one) later in the session. For
      EACH tour run, report VERBATIM: the `[TOUR-DEBUG-V2]` line (`finalOpacity=` value +
      full `timeline=` array) and every `[TOUR-DEBUG-V3]` line observed (method name + abs
      timestamp + stack), plus whether a tooltip with title/body/Next/Back/Skip controls was
      VISIBLE on screen (the actual user-facing symptom, not just finalOpacity). Also report
      whether a tour auto-resumed at boot. Do NOT revert Tour.tsx/NavShellTour/LibraryTour/
      TourContext diagnostics or fix code until this report is reviewed.

## Evidence

- timestamp: 2026-09-03 — twelve nav anchors all highlight their intended element (12/12,
  arrow-driven). The anchors and the highlight path are CORRECT; only the tooltip surface is
  broken. Source: 34.12-07-SUMMARY.md Task 2.
- timestamp: 2026-09-03 — `introjs.css` is imported and served 200 through the vite dev server.
- timestamp: 2026-09-03 — behaviour differs between runs for an UNMODIFIED component
  (`LibraryTour`), establishing run-to-run variance rather than a config dependency.
- timestamp: 2026-09-03 — arrow-key navigation works throughout, so intro.js's state machine is
  running normally; `endTour`/`oncomplete` fire and the tour closes cleanly.
- timestamp: 2026-09-03 — read `intro.js-react` v1.0.0's `Steps` component source
  (`node_modules/intro.js-react/dist/esm/components/Steps/index.mjs`). It creates exactly ONE
  `introJs()` instance per mounted `<Steps>` in the constructor and reuses it across every
  `start()`/`exit()` cycle for that component's lifetime. `componentDidUpdate` re-runs
  `configureIntroJs()` (which calls `introJs.setOptions()`) whenever `prevProps.options !==
  options` by reference — and `Tour.tsx` builds `options={{ ...defaultOptions, ...options }}`
  as a fresh object literal on every render, so ANY re-render of a mounted `<Tour>` re-triggers
  `setOptions()`, including while a tour is actively displayed.
- timestamp: 2026-09-03 — read `TourContext.tsx`. `TourProvider`'s context `value={{...}}` is a
  new object literal on every render with no `useMemo`, so every `useTour()` consumer (every
  mounted `<Tour>`, i.e. both `LibraryTour` and `NavShellTour`) re-renders whenever ANY tour
  state changes anywhere in the app — confirming the mechanism above is real and frequent, not
  hypothetical.
- timestamp: 2026-09-03 — built an OFFLINE jsdom harness (outside this repo's jest project, in
  scratchpad, using the actual `node_modules/intro.js/intro.module.js` v7.2.0 bundle) to test
  three theories without spending an operator session:
  1. Repeated `setOptions()` calls with identical values while a tour is visible (simulating
     the unmemoized-context re-render thrash above) — tooltip title/text/buttons content
     SURVIVED unchanged. REFUTES "setOptions() thrash alone blanks the tooltip."
  2. Reusing the SAME `introJs()` instance across a full start→exit→start cycle (simulating
     re-opening the same mounted `<Tour>` a second time in one session) — second `start()`
     rendered tooltip title/text/buttons correctly. REFUTES "same-instance reuse alone blanks
     the tooltip," at least for this minimal two-step config.
  3. Racing `exit()` and a second `start()` with no `await` between them (simulating two state
     updates batched in the same tick) — tooltip content still rendered, but
     `.introjs-helperLayer` node count went from 1 to 2 (a leaked/duplicated layer). This is a
     real DOM-accumulation defect but does NOT by itself reproduce "zero tooltip content," so
     it is a candidate contributing factor, not a standalone explanation.
  **Conclusion: the config-thrash and instance-reuse theories are the most likely REAL
  mechanisms (both are structurally present in this codebase, unlike the two hypotheses
  refuted on hardware) but the isolated jsdom harness could not reproduce the exact "zero
  tooltip content" symptom with a trivial two-step fixture. Live DOM evidence from the actual
  app is required next — see Current Focus.**
- timestamp: 2026-09-03 — checked `Tour.scss` for a CSS explanation (opacity/visibility/
  display zeroing) — found none scoped to `.introjs-tooltip`/`.introjs-tooltiptext`/
  `.introjs-tooltipbuttons`. Found `body:has(.disableAnimations) * { transition: none
  !important; ... }` in `App.css` (an accessibility "disable animations" toggle), which could
  interfere with any transition-driven async step inside intro.js's `_showElement`, but this
  toggle defaults to `false` (`configStore.get('disableAnimations', false)`) and nothing in the
  session evidence suggests it was enabled. LOW-PRIORITY candidate; cheap for the operator to
  rule out by checking Settings → Accessibility during the next run.

- timestamp: 2026-09-03 — OPERATOR RUN (checkpoint response, this cycle) with v1 diagnostic:
  auto-resumed-at-boot tour (`library-tour`, line 1) sampled `.introjs-tooltip` at
  `opacity:0` 500ms after activation; a manually-started `library-tour` later in the SAME
  session (line 2) sampled `opacity:1`. Everything else identical and healthy in both: same
  452x252 tooltip size, same `innerHTMLLen:1945`, `tooltipNodeCount=1`, `helperLayerCount=1`
  (no duplicate/leaked layers at sample time), all child elements (title/text/buttons)
  `opacity:1`/`visibility:visible`. This is DIRECT, unambiguous evidence for possibility (d):
  tooltip present/sized/positioned/populated correctly, but its OWN opacity never (yet)
  reached 1 in the broken case. REFUTES never-in-DOM, zero-size, and off-screen/under-another-
  layer as the mechanism.
- timestamp: 2026-09-03 — read `node_modules/intro.js/intro.js` (v7.2.0, pretty-printed to
  scratchpad for line-addressable reading) around the `_showElement`-equivalent function
  (internally `Q`/`$`, called only from `_nextStep`/`_previousStep`/`goToStepNumber`, i.e. on
  step navigation). It branches on whether `.introjs-helperLayer` AND
  `.introjs-tooltipReferenceLayer` ALREADY exist in the DOM:
  - **Reuse branch** (both exist — i.e. showing a step while the tour is already up, or a
    stale layer wasn't cleaned up): sets `.introjs-tooltip.style.opacity="0"` and
    `display="none"` immediately, synchronously; clears any PRIOR pending
    `n._lastShowElementTimer`; schedules a NEW `setTimeout(..., 350)` that sets the new
    content (innerHTML of title/text/bullets/progress) and restores
    `opacity="1"`/`display="block"`. **This is a debounced restore**: if `_showElement` is
    invoked again before 350ms elapses, the pending restore is cancelled and rescheduled from
    zero, so opacity stays at 0 for as long as re-triggering keeps happening faster than every
    350ms.
  - **Fresh-creation branch** (neither exists yet — true first paint): builds brand-new
    helperLayer/tooltipReferenceLayer/tooltip DOM and appends them; the helperLayer fades in
    via a separate 10ms opacity helper (`F()`), but the **tooltip element itself gets no
    opacity manipulation in this branch** — it is appended at whatever the CSS default is.
  - **Correction to a fact relayed into this cycle's checkpoint**: the "10ms" timeout the
    coordinator found by grepping for `opacity:r` belongs to `F()`, the generic
    fade-in-a-newly-appended-element helper used for the HELPER LAYER (highlight box) on
    first creation — NOT the tooltip's own opacity restore. The tooltip's opacity restore is
    the 350ms one described above. This distinction matters for interpreting future
    timeline evidence — do not go looking for a 10ms tooltip transition, it doesn't exist.
- timestamp: 2026-09-03 — read `node_modules/intro.js-react/dist/esm/components/Steps/index.mjs`
  v1.0.0's `renderSteps()`: on every mount/re-render where `enabled && steps.length>0 &&
  !this.isVisible`, it calls `this.introJs.start(); this.isVisible = true;
  this.introJs.goToStepNumber(initialStep + 1)` — TWO synchronous, back-to-back navigation
  calls on EVERY tour start (not something introduced by re-render churn; this happens
  identically whether the tour auto-resumes or is manually started). The first call
  (`start()`) takes the fresh-creation branch (no layers exist yet); the second
  (`goToStepNumber`), synchronously following, finds the layers `start()` just created and
  takes the REUSE branch — meaning the very first thing that happens to a newly-created
  tooltip element is `opacity="0"` followed by a single scheduled 350ms restore. This
  structural double-call is present on every tour start (not itself evidence of the bug), but
  establishes that EVERY tour goes through the debounced-restore code path at least once, so a
  single external re-trigger during that ~350ms window is enough to blank the tooltip for
  however long the re-triggering continues.
- timestamp: 2026-09-03 — confirmed `componentDidUpdate`'s guard
  (`if (enabled && steps.length>0 && !this.isVisible)`) means merely calling
  `configureIntroJs()`/`setOptions()` again while a tour is ALREADY visible does **not**, by
  itself, call `start()`/`goToStepNumber()` again — so the previously-documented
  unmemoized-context/fresh-options re-render churn does NOT obviously re-invoke the
  debounce-clearing code path through this route alone. Two OTHER candidate re-trigger sources
  found by reading further: (1) `intro.js` binds a `window resize` listener
  (`g.on(window,"resize",At,n,!0)`) whose handler chain (`At`→`jt`) was not fully traced this
  cycle — if it calls back into `_setHelperLayerPosition`/`_showElement`, window resize events
  during Tauri's boot-time window-state restoration would be a churn source independent of the
  React context theory; (2) `exit()` (`Et()`) removes `.introjs-tooltipReferenceLayer`
  (and therefore the tooltip) **immediately/synchronously** but fades `.introjs-helperLayer`
  out over its OWN separate 500ms timer before removing it — so restarting the SAME tour
  within 500ms of finishing it could transiently produce a duplicate helperLayer (old one
  still fading, new one just created), which would explain intermittency tied to how quickly a
  user/auto-resume re-triggers a tour, independent of the context-churn theory. **Neither (1)
  nor (2) is confirmed — both are plausible alternative or contributing mechanisms to the
  context-churn theory, not yet distinguished from it.** The v2 diagnostic (see Current Focus)
  is designed to discriminate all of these at once via a live mutation timeline.

- timestamp: 2026-09-03 (this cycle) — ran `graphify query` first (per repo policy) for
  "what updates on an interval near the nav bar/downloads/progress" and "what calls
  useTour/consumes TourContext" before any raw grep/read. Confirmed via graph + direct read
  that `useTour()`'s only consumers are `Tour()`, `TourButton()`, and `LibraryTour()` (plus
  `NavShellTour`, found by extension) — no other component subscribes to `TourContext`.
- timestamp: 2026-09-03 — grepped all of `src/frontend` and `src/backend` for `setInterval`.
  None run on anything near a ~260ms cadence: `LogSettings` 1000ms (Settings-screen-local,
  not mounted during a nav-tour), `ProgressHeader` `SAMPLE_INTERVAL_MS`=1000ms
  (DownloadManager-screen-local), `SteamClientSetup`/`SteamBottleSetup` 3000ms (game-detail-
  screen-local), Steam install/uninstall polling (`library.ts` `startInstallPolling`/
  `startUninstallPolling`) 3000ms default (also requires an active install/uninstall in
  flight). `DownloadsRing` (the nav-bar component the coordinator specifically flagged) has
  **no interval at all** — it is purely event-driven via `window.api.handleDMQueueInformation`
  push callbacks and a one-shot `getDMQueueInformation()` on mount. **This eliminates the
  polling/DownloadsRing theory as the direct driver** (no code path in that component runs on
  any timer, let alone one near 260ms).
- timestamp: 2026-09-03 — re-confirmed via source read that `Tour.tsx`'s
  `isActive = enabled || isTourActive(tourId)` does NOT create a real double-activation bug
  for the two existing call sites: `NavShellTour` passes `enabled={isTourActive(NAV_TOUR_ID)}`
  and `LibraryTour` passes `enabled={isTourActive(LIBRARY_TOUR_ID)}` — both already equal to
  their own `isTourActive` check, so `enabled || isTourActive(tourId)` is a no-op redundancy
  for both current callers, not a live simultaneous-activation vector, GIVEN `tourState.
  activeTour` is a single string (only one tourId can satisfy `isTourActive` globally at once).
  The "second Tour instance with tooltipExists=true already" capture from the prior cycle's
  checkpoint is more likely explained by a STALE singleton DOM node surviving from the
  previous tour's `exit()` (already-documented eliminated-adjacent theory: `exit()` removes
  `.introjs-tooltipReferenceLayer` synchronously but fades `.introjs-helperLayer` out over its
  own separate 500ms timer) than by two tours genuinely running concurrently — this is now a
  LOWER-priority theory than it looked in the prior checkpoint, since the `enabled ||`
  short-circuit itself isn't structurally live for the two real callers. NOT fully eliminated
  (a timing race between `endTour`'s state update and the next tour's `start` is still
  possible), but de-prioritized relative to the public-method-call theory below.
- timestamp: 2026-09-03 — pretty-printed `node_modules/intro.js/intro.js` v7.2.0 already
  existed in scratchpad from the prior cycle; read it further this cycle specifically for
  what function touches `.introjs-helperLayer` + `.introjs-tooltipReferenceLayer` WITHOUT
  touching the tooltip (the exact pattern V2's periodic entries show). Found function `jt(t,e)`
  (source, verbatim structure): reads `t._currentStep`, looks up
  `.introjs-tooltipReferenceLayer` / `.introjs-helperLayer` / `.introjs-disableInteraction` via
  plain `document.querySelector` (NOT instance-scoped — a latent multi-instance hazard in
  intro.js itself, independent of this bug), repositions all three via `I(t,r,el)`, optionally
  rebuilds `_introItems`/bullets if `e` (forceRebuild) is truthy, repositions the arrow, and
  returns — it never references or touches the tooltip's `opacity`/`display` styles. This is
  the ONLY function in the bundle matching V2's observed "helperLayer+refLayer only" mutation
  signature. `jt` has exactly two call sites, confirmed via full-file grep for `jt(`:
  `IntroJs.prototype.refresh(t){ return jt(this,t),this }` (the public API) and
  `function At(t){ jt(t) }`, where `At` is bound via
  `g.on(window,"resize",At,n,!0)` — traced `g.on` to its definition and confirmed it is a thin
  wrapper that ultimately calls `t.addEventListener(e,a,o)`, i.e. a literal
  `window.addEventListener("resize", At, true)`. **Both call sites are now excluded**: grepped
  all of `src/frontend`/`src/backend` for `.refresh(` and any direct `introJs`/`intro.js`
  import outside `Tour.tsx` — GameLib code never calls `.refresh()` on any instance; and V2's
  own independent `window.addEventListener('resize', ...)` listener (registered in the SAME
  effect, same document, same target) recorded ZERO `RESIZE` entries in every capture to date,
  and a real `resize` event dispatched on `window` would fire BOTH listeners regardless of
  their `capture` flag difference (capture vs. bubble is immaterial for listeners on the event
  TARGET itself). **Conclusion: the churn is real, reproducible, and traced to one specific
  ~15-line function in a well-understood library, but neither of that function's two known
  call sites explains who is calling it. Something is invoking one of intro.js's OTHER public
  navigation methods (`goToStepNumber`/`nextStep`/`previousStep`, all of which route through
  the FULL `_showElement`, not `jt` directly — meaning if one of THESE is the actual trigger,
  the reuse branch would ALSO re-touch the tooltip every cycle, which V2 says it does NOT after
  +839ms) OR `refresh()` is being called from a code path this cycle failed to find OR a
  window `resize` event is somehow not visible to V2's own listener (e.g. dispatched on a
  DIFFERENT `window` object — Tauri/WKWebView multi-webview edge case — worth checking if
  GameLib ever runs multiple webview contexts sharing one visual window). This is exactly the
  ambiguity v3's prototype-patch-with-stack-trace diagnostic (see Current Focus) is built to
  resolve: it will show the caller's identity directly rather than requiring further inference
  from indirect DOM evidence.**
- timestamp: 2026-09-03 — confirmed via `npx tsc --noEmit -p tsconfig.json` (exit 0, no
  Tour.tsx errors) that `intro.js` ships its own type declarations
  (`node_modules/intro.js/src/index.d.ts`, `"types": "src/index.d.ts"` in its `package.json`)
  exposing a default-exported factory function, so `import introJsFactory from 'intro.js'`
  alongside the existing `intro.js-react` import in `Tour.tsx` type-checks cleanly and does not
  require new type-only dependencies.

## Eliminated

- hypothesis: "`introjs.css` is not loaded, and Tour.scss alone produces the dim + highlight"
  reason: vite-transformed `Tour.tsx` emits the import; the CSS URL serves 200.
- hypothesis: "`disableInteraction: true` (D-04) suppresses the tooltip"
  reason: unmodified `LibraryTour` also varied between runs; probe reverted.
- hypothesis: "`position: 'right'` (a vertical-sidebar leftover) prevents placement"
  reason: same run-to-run variance observed with `position` forced to `'bottom'`; probe reverted.
- hypothesis: "LibraryTour's first two steps highlight nothing because their selectors are dead"
  reason: NOT a defect — steps 1-2 carry no `element` key by design (centred welcome steps);
  observed behaviour matches source exactly.

## Resolution

root_cause: CONFIRMED CHAIN (mechanism-level, via source reading — see Evidence; NOT yet
  live-confirmed against a v3 stack-trace capture, which never completed — see Current Focus).
  `intro.js-react`'s `Steps.componentDidUpdate`
  (node_modules/intro.js-react/dist/esm/components/Steps/index.mjs) compares `props.options`
  and `props.steps` BY REFERENCE. `Tour.tsx` built the merged options object as a fresh literal
  every render (`{...defaultOptions, ...options}`, with `defaultOptions` itself rebuilt every
  render from `t()`), and `NavShellTour`/`LibraryTour` built their `steps` arrays fresh every
  render via array-literal spreads. Because both guards were therefore always-true, every render
  of a mounted `<Tour>` re-entered intro.js's show-step path via `configureIntroJs()` →
  `setOptions()`/`goToStepNumber()`, which reset the tooltip's debounced 350ms opacity restore
  before it could complete. The measured re-trigger cadence (~260ms: deltas 350, 277, 266, 267,
  233, 248, 218, 217ms) was consistently SHORTER than the 350ms restore delay, so the restore
  was cancelled indefinitely and the tooltip stayed permanently transparent (opacity:0).
  `TourContext`'s unmemoized provider value amplified this by re-rendering every mounted
  `<Tour>` on any tour-state change anywhere in the app.

  **CORRECTION TO PRESERVE IN THE RECORD:** an earlier relay in this debug session incorrectly
  attributed the churn to `renderSteps()` being called unconditionally. `renderSteps()` is
  actually guarded by `!isVisible` internally (see Evidence, "confirmed `componentDidUpdate`'s
  guard") and is therefore NOT the re-entry path for an already-visible tour. The actual
  re-entry path is `configureIntroJs()` → `setOptions()` (and, on step-count/enabled changes,
  `goToStepNumber()`), triggered by the always-true reference comparisons in
  `componentDidUpdate`'s first `if` branch. A future reader should not repeat the
  `renderSteps()`-unconditional attribution.
fix: Stabilized reference identity at every point that fed the always-true guards, across four
  production files:
  1. `src/frontend/components/Tour/Tour.tsx` — `defaultOptions` and the merged
     `{...defaultOptions, ...options}` object are wrapped in `React.useMemo` (deps `[t]` and
     `[defaultOptions, options]` respectively); `<Steps options={...}>` receives the memoized
     `mergedOptions` instead of an inline literal.
  2. `src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx` — the `steps`
     array construction is wrapped in `useMemo` (deps `[t, isWin, position]`); the
     `options={{ disableInteraction: true }}` inline literal is replaced with a module-level
     constant `NAV_TOUR_OPTIONS` (never changes identity).
  3. `src/frontend/screens/Library/components/LibraryTour.tsx` — the `steps` array
     construction is wrapped in `useMemo` (deps `[t, hasGames]`).
  4. `src/frontend/state/TourContext.tsx` — `startTour`/`endTour`/`resetTour` wrapped in
     `useCallback` (empty deps); `isTourActive`/`hasTourCompleted` wrapped in `useCallback`
     (deps `[tourState]`); the provider's context `value` wrapped in `useMemo` (deps on all six
     values above).

  The two test-file mock edits (`NavShellTour.test.tsx`, `libraryTourAnchors.test.tsx`, both
  adding a `useMemo: <T,>(factory: () => T) => factory()` passthrough to their existing partial
  `jest.mock('react', ...)`) were RE-CHECKED this cleanup cycle and SURVIVED: they are required
  by the real fix (NavShellTour/LibraryTour build their `steps` arrays inside `useMemo`, and
  these tests invoke the components as plain functions with no React dispatcher installed, so
  the real `useMemo` would throw), not by the since-removed diagnostics. No revert needed for
  these two files.

  Two temporary diagnostics (v2: a `MutationObserver` timeline in `Tour.tsx`; v3: a
  module-prototype monkey-patch of `intro.js`'s navigation methods with call-stack logging,
  also in `Tour.tsx`) were added during investigation and have been FULLY REVERTED this cleanup
  cycle. `Tour.tsx` now carries only the memoization fix — no `MutationObserver`, no
  `console.warn`/`[TOUR-DEBUG]` strings, no monkey-patched prototype methods, no unused imports
  (the diagnostic-only `import introJsFactory from 'intro.js'` was removed with it). Confirmed
  by `grep -rn "TOUR-DEBUG\|MutationObserver\|patchIntroJsForDiagnostics\|introJsFactory\|
  v3Patched"` across all four production files: zero matches.
verification: OUTSTANDING — NO LIVE VERIFICATION WAS PERFORMED. The operator elected to skip
  the v3 diagnostic confirmation run after a failed relaunch attempt: vite re-optimized
  `intro.js` mid-session, forcing a page reload before any observation was captured — the exact
  condition previously flagged in this file as capable of leaving the v3 one-time prototype
  patch inconsistent (the `v3Patched` module-level guard survives HMR updates but not a full
  reload, so a mid-session reload could silently produce a no-op re-patch or a stale patched
  reference; this was never actually observed, because no observation was captured at all before
  cleanup began). There is therefore NO live evidence for or against the fix.

  This cleanup cycle re-ran self-verification against the POST-REVERT tree (the prior cycle's
  green run was against instrumented code, not this final production shape):
  `npx tsc --noEmit -p tsconfig.json` exits 0; `npx eslint` on all six touched files reports 0
  errors (5 pre-existing-pattern warnings, none new); `npx jest -c src/frontend/jest.config.js`
  — 141/141 suites, 2184/2184 tests pass, no regressions; `pnpm exec prettier --check` on all six
  touched files — all pass. **None of this constitutes evidence the fix resolves the live
  symptom.** This repo's frontend jest project is `testEnvironment: 'node'` (no jsdom), and there
  is no browser-automation runner here — the suite was green throughout the entire period the
  tour was completely unusable in the live app (see this file's original investigation
  constraints, point 5: "Do not mark this fixed on a green suite"). A live operator relaunch of
  `pnpm tauri:dev`, reproducing both tours in one session per the prior `next_action`, is still
  required before this can be marked resolved.
files_changed:
  - src/frontend/components/Tour/Tour.tsx
  - src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/state/TourContext.tsx
  - src/frontend/components/UI/NavShell/__tests__/NavShellTour.test.tsx
  - src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx


## LIVE VERIFICATION 2026-09-03 — THE FIX DOES NOT WORK

Run: commit f8b432b7e (memoization fix, all diagnostics reverted), clean `pnpm tauri:dev`
launch. Crucially the vite log shows NO dep re-optimisation and NO forced reload this time, so
the confound that spoiled the previous attempt did not recur — this run is trustworthy.

**Operator, verbatim: "did not work, both tours broken".** Both LibraryTour and NavShellTour
still show dim overlay + highlight box and no tooltip.

### What this refutes

The commit's stated root cause is REFUTED AS A COMPLETE EXPLANATION. Closing the always-true
reference guards in `intro.js-react`'s `Steps.componentDidUpdate` does NOT restore the tooltip.
The memoizations are still correct in themselves (the reference-identity problem was real and
is genuinely fixed), but they are NOT sufficient, and may not be the operative cause at all.

The measured facts from the earlier timeline REMAIN TRUE and are not in question:
  - tooltip enters the DOM correctly sized/positioned/populated, container at opacity 0
  - a broken run showed opacity=1 at +359ms, knocked to 0 at +839ms, then churn every ~260ms
  - deltas 350/277/266/267/233/248/218/217, all below intro.js's 350ms restore delay
What is now open is WHAT DRIVES that churn. `componentDidUpdate`'s reference guards were an
inference about the driver, never a measurement of it.

### Live candidates, NONE verified — do not act on these without measuring

1. `t` from `useTranslation()` is not reference-stable across renders. Every memo in the fix
   depends on `t` (`[t]`, `[t, isWin, position]`), so an unstable `t` would defeat ALL of them
   simultaneously and reproduce the exact prior behaviour. This is the cheapest to test and the
   best fit for "the fix changed nothing".
2. The churn driver is not `componentDidUpdate` at all, and the whole reference-identity chain
   was a plausible but incorrect inference from source reading.
3. A second independent cause exists alongside the reference issue.

### The single discriminating measurement to run next

Reinstate ONLY the v2 MutationObserver timeline (not v3) and answer one question:
**is the ~260ms churn still present after the fix?**
  - churn GONE but tooltip still blank -> the reference-identity chain was right and there is a
    SECOND, independent cause. Stop looking at re-renders.
  - churn STILL PRESENT -> the memoizations did not stop the driver; instrument `t`'s identity
    and the render cause directly (log a render counter + `t === prevT` per render).
Do not attempt another fix before this question is answered. Three inferential fixes have now
been proposed in this session and two are refuted; the only steps that produced real progress
were measurements.

### Process note for whoever continues

This is the second time in this session that a confident source-derived mechanism failed live.
The pattern to avoid: a chain that is verifiable in source (the guards ARE always-true, that
part is fact) can still be the wrong explanation for the observed symptom, because being real
is not the same as being operative. Measure the driver, do not infer it.
