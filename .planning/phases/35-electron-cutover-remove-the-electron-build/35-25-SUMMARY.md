---
phase: 35-electron-cutover-remove-the-electron-build
plan: 25
subsystem: frontend
tags: [winetricks, searchbar, react-remount, pointer-events, requirement-amendment]

# Dependency graph
requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "34.6-16/17's onMouseDown preventDefault guard on SearchBar's suggestions <ul>, and the retracted :focus-within causal claim it left in-source"
provides:
  - "The winetricks Install button fires on a real mouse click, live-proven twice on a packaged-shape pnpm tauri:dev build"
  - "REQ-35-16's winetricks clause amended to a satisfiable, measured cause, with superseded wording preserved"
  - "A separately-filed, unowned defect record for the Library SearchBar consumer (commit 6d9584f75)"
affects: [35-28, 35-29]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capture a click-equivalent handler on mousedown instead of click when a parent's state flip can unmount/remount the target subtree inside the mousedown-to-click window"
    - "A live mouse gesture on a packaged-shape build is the closure signal when the project's jest environment has no DOM and cannot express a real pointer sequence"

key-files:
  created: []
  modified:
    - src/frontend/components/UI/SearchBar/index.tsx
    - src/frontend/components/UI/SearchBar/__tests__/suggestionFocusRace.test.tsx
    - src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Fixed at the WinetricksSearchBar layer (mousedown capture) rather than in the shared SearchBar primitive, because the measured cause was a Winetricks-specific parent remount, not a defect in SearchBar itself"
  - "Kept the 34.6-16/17 onMouseDown preventDefault guard and the WINETRICKS_DECLINED_GUARD early-return untouched, per the plan's explicit instruction not to re-touch mechanisms independently verified correct"
  - "Amended REQ-35-16's winetricks clause with superseded-wording-plus-dated-correction rather than silently rewording it, and scoped the correction explicitly to the winetricks consumer only, not the shared SearchBar component"
  - "Did not fix, re-file, or widen scope to the Library SearchBar defect surfaced in step 6 — operator explicitly directed 'proceed and file separately'; already filed as its own todo (commit 6d9584f75) before this task ran"

requirements-completed: [REQ-35-16]

# Metrics
duration: ~15min (Task 4 only; continuation from a prior executor's Tasks 1-3)
completed: 2026-08-30
---

# Phase 35 Plan 25: Fix the winetricks mouse-dead Install button and amend REQ-35-16 Summary

**The winetricks Install button was mouse-dead because a parent state flip (`installing`/`loadingInstalled`) unmounted and remounted the whole `WinetricksSearchBar` subtree between `mousedown` and `mouseup`; fixed by capturing the Install action on `mousedown` instead of `click`, live-proven on a real mouse click twice, and REQ-35-16's unsatisfiable "named layer" wording is now amended to the measured cause.**

## Performance

- **Duration:** ~15 min for this continuation (Task 4 only)
- **Completed:** 2026-08-30
- **Tasks:** 4 (1 measurement-only, 1 fix+test, 1 blocking human gate, 1 requirements amendment)
- **Files modified:** 4 (3 in Task 2, 1 in Task 4)

## Continuation Context

This plan was executed across two sessions. A prior executor completed Tasks 1-3 and stopped at
Task 3's blocking human checkpoint. This session verified those commits, received the human's
gate result, and executed Task 4.

**Verified prior commits present:**
- `366e719bb` — `fix(35-25): capture winetricks Install on mousedown to beat parent remount race` (Task 2)
- `6d9584f75` — `docs(35-25): file the Library SearchBar mouse-dead defect surfaced by step 6` (filed by the orchestrator during the Task 3 checkpoint, not by this plan's own tasks)

## Task Commits

1. **Task 1: Identify the unmount — measure it, do not infer it** — measurement-only, no commit (per acceptance criteria: no source file modified).
2. **Task 2: Fix the identified cause and pin it with a regression test** — `366e719bb` (fix)
3. **Task 3: Prove the Install button works by MOUSE on a real build** — blocking human checkpoint, no commit (live gesture, no file modified).
4. **Task 4: Amend REQ-35-16 so its winetricks clause is satisfiable against the real cause** — `766ad63b5` (docs)

**Plan metadata:** (this commit, produced by the state-update step below)

## Task 1: Measured Finding

Hypothesis (a) — a React unmount of the suggestions subtree — was RULED IN. The other four
hypotheses were RULED OUT, each with the specific observation that decided it:

| Hypothesis | Verdict | Deciding observation |
|---|---|---|
| (a) React unmount of the list subtree | **RULED IN** | MutationObserver on the Winetricks panel's parent recorded the entire `WinetricksSearchBar` subtree removed and a fresh instance mounted roughly 4ms after `mousedown`, roughly 60ms before `mouseup` — driven by `Winetricks/index.tsx`'s `installing`/`loadingInstalled` state flip re-rendering a different child tree in that window. |
| (b) CSS `display: none` via `:focus-within` losing (the already-disproven shape) | RULED OUT | `document.activeElement` never moved off the `<input>` across the full `pointerdown` -> `mouseup` sequence — focus was never lost, so the `:focus-within` mechanism cannot be the cause. Re-checked live per the plan's instruction, not assumed away. |
| (c) `ul.autoComplete:empty` firing because `searchResults` emptied | RULED OUT | `searchResults` was non-empty and unchanged at the moment of the click; the `<ul>` computed `display: block` throughout the observed window. |
| (d) `declined === true`, so the click lands and `install()` early-returns silently | RULED OUT | The click never reached `install()` at all — no `winetricksInstall` handler invocation, no log line, and (per the remount finding) the original button element no longer existed in the DOM at `mouseup`, which is a stronger and different failure mode than a silent early return on a live element. |
| (e) A remount of the whole Winetricks panel from a parent state change | Superseded by (a) | The remount is real but scoped to the `WinetricksSearchBar` subtree, not the whole panel — (a) names the precise scope. |

## Task 2: Fix

**File changed:** `src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx` — the Install
button's action is captured on `onMouseDown` rather than waiting for `onClick`, so the handler
fires before the parent's state-driven remount can tear down the element. `SearchBar/index.tsx`'s
existing `onMouseDown={(e) => e.preventDefault()}` guard on the `<ul>` and its **RETRACTED**
causal-claim comment were both preserved, and the comment block was extended to record the new
measured cause alongside the old retracted one (grep-verified: `onMouseDown` guard, `RETRACTED`
paragraph, and `WINETRICKS_DECLINED_GUARD` early-return in `Winetricks/index.tsx` all still
present, unchanged in mechanism).

**Regression pin:** `src/frontend/components/UI/SearchBar/__tests__/suggestionFocusRace.test.tsx`
extended with an assertion on the mousedown-capture handler wiring shape. Per the plan's own
`<interfaces>` constraint, this project's jest environment has no DOM (no jsdom, no
react-test-renderer), so the pin proves handler wiring and conditional-render predicates on the
returned element graph — it cannot and does not claim to prove a rendered pointer sequence. The
test's own header states this and names Task 3's live gesture as the real proof.

`pnpm test --selectProjects Frontend` and `pnpm codecheck` both passed per Task 2's own
acceptance criteria.

## Task 3: Live Gate Result

Driven by the human operator on a real `pnpm tauri:dev` build, independently corroborated by the
orchestrator against `~/Library/Logs/GameLib/gamelib.log`:

| Step | What | Verdict | Evidence |
|---|---|---|---|
| 4 | First mouse click on an Install suggestion | **WORKED** | `(21:12:27) [Backend]: [GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall` -> `(21:12:28) [Winetricks]: Running .../winetricks -q vcrun2005`, real `vcredist_x86.EXE` download. |
| 6 | Second mouse click, different component, same session | **WORKED** | Second handler hit at `(21:13:59) ... winetricksInstall` -> `winetricks -q vcrun2008`, ~90s after step 4, ruling out a first-click-only artefact. |
| 7 (renumbered from the plan's step 6/7 pair by the operator's own account; the plan's step 6/7 are collapsed to one Library regression check in the record above) | Library search bar regression check | **DID NOT WORK** | Confirmed **not** a regression from this plan: `366e719bb`'s only change to `SearchBar/index.tsx` is a comment; every behavioural edit in that commit is inside `Winetricks/WinetricksSearch/index.tsx`. |

**Operator decision, given verbatim:** "proceed and file separately."

**Disposition of the step-6/7 DID-NOT-WORK result:** The plan's literal gate text says any
DID-NOT-WORK stops Task 4. That gate's stated rationale — "a second disproven theory would be
worse than an open finding" — is about the *winetricks* theory, and steps 4 and 6 proved that
theory correct with two real installs. The Library check was measuring against a baseline that
was never healthy (the operator's own account: "this has always been flaky" / broken), so it
disqualified its own fixture rather than detecting a regression. The operator explicitly
overrode the literal gate and directed the executor to proceed to Task 4. The Library SearchBar
defect was filed as its own todo before this task ran:
`.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`
(commit `6d9584f75`). It is not re-filed, not fixed, and not folded into this plan's scope.

## Record Correction Owed (not fixed here, noted per the operator's instruction)

Commit `366e719bb` added a comment in `SearchBar/index.tsx` asserting the 34.6-16/17
`onMouseDown` `preventDefault()` guard "is UNCHANGED and still correct... `LibrarySearchBar`'s
shared consumption of this same `<ul>` still depends on it." That framing is at least
**incomplete**: the guard may well be load-bearing for the Library consumer, but it is
demonstrably **not sufficient** — that consumer is broken in the field (step 6/7 above). The
filed todo (`6d9584f75`) already carries this correction note in full; it is recorded here as
well so the plan's own SUMMARY does not repeat the incomplete framing without qualification. No
source comment was edited to fix this in-plan — that edit belongs to whoever picks up the filed
todo, since editing `SearchBar/index.tsx`'s comment without also fixing (or at minimum properly
diagnosing) the Library defect would leave the comment correcting itself into a different,
still-incomplete claim.

## Task 4: REQ-35-16 Amendment

`.planning/REQUIREMENTS.md`'s `REQ-35-16` bullet, winetricks clause only, amended:

- The original "attributed to a named layer (sidecar registration, Rust dispatch, or frontend
  emit)" wording is kept verbatim and marked `**[SUPERSEDED WORDING — see 2026-08-30 correction
  below]**` in place, rather than deleted or silently reworded.
- A dated correction is appended stating: all three named layers were re-measured correct; the
  channel already worked end-to-end under keyboard activation before this plan; the real,
  measured cause is the renderer remount Task 1 found, named precisely (component, timing window,
  and the `document.activeElement` observation that ruled out `:focus-within`); the fix commit
  (`366e719bb`); and the Task 3 live mouse gesture as the closure signal, explicitly because this
  project's test environment cannot express a real pointer sequence.
- The correction explicitly states its scope limit: it closes the winetricks consumer of the
  shared `SearchBar` component only, names the Library consumer's DID-NOT-WORK result and its
  disposition, and says plainly that this correction does not certify the shared `SearchBar`
  primitive itself as sound.
- The `openDialog` and `installed.json` watcher clauses of `REQ-35-16`, and the requirement's
  `[ ]` checkbox state, are untouched — `git diff --stat .planning/REQUIREMENTS.md` shows exactly
  1 line changed, confined to the winetricks sentence; `grep -c 'attributed to a named layer'
  .planning/REQUIREMENTS.md` returns 1 (preserved).

REQ-35-16's checkbox stays `[ ]` (not flipped to complete) — the `openDialog` clause (plan
`35-07`, code-complete but not discharged per the Current Position record) and the
`installed.json` watcher clause (plan `35-10`, PARTIAL) are not confirmed complete, and
reconciling REQ-35-16's overall status against evidence is plan `35-28`'s (records hygiene)
scope, not this plan's.

## Deviations from Plan

None beyond the checkpoint-resolution steps already described above (which are the plan's own
designed flow for a blocking human gate, not a deviation). No Rule 1-4 auto-fixes were needed in
this continuation session.

## Known Stubs

None introduced by this plan.

## Threat Flags

None — this plan touches only pre-existing renderer click-handling and requirement-document text;
no new network endpoint, auth path, file-access pattern, or schema change at a trust boundary was
introduced.

## Issues Encountered

None in this session. The Library SearchBar DID-NOT-WORK result at Task 3 step 6/7 was
anticipated as a possible outcome by the plan's own instructions and handled per the operator's
explicit override, not treated as a blocking issue for this plan's completion.

## User Setup Required

None.

## Next Phase Readiness

- REQ-35-16's winetricks clause is now satisfiable and closed; the requirement's overall
  completion status (pending the `openDialog` and `installed.json` clauses) is owned by plan
  `35-28`.
- The Library SearchBar defect is tracked, unowned, and explicitly excluded from Phase 35's
  gap-closure scope fence per its own todo file — it will not auto-close when Phase 35 completes.
- Plan `35-28` (records hygiene) still owns reconciling `completed_plans` for `35-21`/`35-22`/
  `35-23` per the prior executor's deferred-items.md note; this plan's own bump (`393 -> 394`)
  is applied correctly below and does not touch that pre-existing lag.

---
*Phase: 35-electron-cutover-remove-the-electron-build*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: `src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx`
- FOUND: `src/frontend/components/UI/SearchBar/index.tsx`
- FOUND: `src/frontend/components/UI/SearchBar/__tests__/suggestionFocusRace.test.tsx`
- FOUND: `.planning/REQUIREMENTS.md`
- FOUND: `.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`
- FOUND commit: `366e719bb` (Task 2)
- FOUND commit: `6d9584f75` (Library defect filing, pre-existing before Task 4)
- FOUND commit: `766ad63b5` (Task 4)
