---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 10
subsystem: ui
tags: [i18n, tauri, webview, epic, phase-38-ledger, spike-manifest, gamelib.json]

requires:
  - phase: 40-08
    provides: the two return sites in WebView/index.tsx this plan gave a reason discriminator to
  - phase: 40-01
    provides: the inverted structural gate (hasTwoDistinctArms) this plan kept green
provides:
  - "WebviewUnavailablePanel with a reason prop ('platform' | 'epic') selecting honest, distinct copy"
  - "/store/epic gated off the live embed on every platform (Rule 2 fix, not in original file list)"
  - "Phase 38 ledger items 38-E01..38-E04 for the Windows/Linux embed unknowns, with anti-conflation notes for the two plan 40-11 overlaps"
  - "Spike 024 (epic-store-in-embedded-child-webview) filed as PLANNED in the spike manifest"
  - "40-I18N-CENSUS.md: a counted catalog diff proving zero English-side drift for this phase"
affects: [40-11, 38-verification]

tech-stack:
  added: []
  patterns:
    - "Reason-discriminator prop on a hookless panel component, selecting minted i18n keys per reason, instead of a second component"
    - "Catalog-diff census (flattened-key set comparison against a named base commit) as the i18n counting method, not plan-SUMMARY prediction"

key-files:
  created:
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-I18N-CENSUS.md
  modified:
    - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
    - src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx
    - src/frontend/screens/WebView/index.tsx
    - public/locales/en/gamelib.json
    - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
    - .planning/spikes/MANIFEST.md
    - .planning/ROADMAP.md

key-decisions:
  - "Retired the flat webview.unavailable.heading/body keys from en/gamelib.json rather than leaving them alongside the new reason-scoped keys, after grep confirmed zero remaining consumers"
  - "Gated /store/epic away from the live embed in WebView/index.tsx even though that file was not in the plan's files_modified list (Rule 2: nothing else in the codebase enforced this, and D-05/REQ-40-12 require it out of scope on every platform)"
  - "Framed the two Windows/Linux backend-feasibility Phase 38 items (38-E01/38-E02) as named unknowns per D-04, not as existing-code-awaiting-hardware, because D-03 target-gates the unstable add_child feature to macOS only -- the code path does not exist yet on those targets"
  - "Filed the Epic embed question as spike 024 in the existing MANIFEST.md format (status PLANNED) rather than as a todo or a new phase, per D-05/D-06"
  - "Corrected a missed acceptance criterion after Task 2's first commit: added the four Phase 38 items to ROADMAP.md's own Phase 38 narrative section (not only 38-VERIFICATION.md), in a follow-up commit before writing this SUMMARY"

requirements-completed: [REQ-40-12, REQ-40-14]

duration: ~18min (this session segment, post-compaction; Task 1 was completed and committed in a prior segment of the same execution)
completed: 2026-09-04
---

# Phase 40 Plan 10: Reword the unavailable panel, file the deferred embed work, count the minted strings Summary

**Split `WebviewUnavailablePanel` into two honest, non-accusatory reasons; closed an unguarded `/store/epic` live-embed gap as a Rule 2 fix; filed the Windows/Linux/retina/drag-resize unknowns as four new Phase 38 ledger items and one planned spike; counted the phase's i18n footprint from a catalog diff (6 added, 2 retired, 0 changed).**

## Performance

- **Duration:** ~18 min (commit-span for Tasks 2, 3, and the ROADMAP correction; Task 1 was completed earlier in the same overall execution)
- **Completed:** 2026-09-04
- **Tasks:** 3/3
- **Files modified:** 8 (across 4 commits)

## Accomplishments

- `WebviewUnavailablePanel` now takes a `reason: 'platform' | 'epic'` prop and renders one of two
  distinct, honest messages instead of one blanket "not available on this build" string.
- Closed a genuine, unguarded gap: `/store/epic` had no code anywhere (not the `urls` map, not
  `useStoreEmbedHost.ts`, not `storeEmbedOrigins.ts`'s `embeddable: false` flag) actually preventing
  it from reaching the live macOS embed, contrary to D-05/REQ-40-12's explicit scope decision.
- Filed four Phase 38 ledger items (`38-E01`..`38-E04`) for the Windows/Linux embed-backend
  feasibility unknowns and the non-macOS retina/drag-resize cases, with an anti-conflation sentence
  on the two that overlap plan `40-11`'s upcoming live gate.
- Filed the Epic-in-embed question as spike `024` in `.planning/spikes/MANIFEST.md`, status PLANNED,
  reusing spike 016's harness.
- Produced `40-I18N-CENSUS.md`: a counted catalog diff (base commit `8ac3a8c12` to HEAD) proving 6
  keys added and 2 retired in `gamelib.json`, zero changes in either catalog, and zero changes in
  `translation.json` specifically -- the drift no gate in this repo otherwise detects.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reword the panel for its two distinct cases (D-02, D-08)** - `7a1d1d55a` (feat)
2. **Task 2: File the deferred work where it has an owner (D-04, D-05, D-06, D-07)** - `69bb16cc8` (docs)
3. **Task 3: Count every string this phase minted (D-37)** - `0f92d2f32` (docs)

**Correction (same execution, before this SUMMARY):** `a487ab0cc` (docs) -- added the four Phase 38
items to `ROADMAP.md`'s own Phase 38 narrative section, which Task 2's acceptance criteria required
but the first Task 2 commit only satisfied in `38-VERIFICATION.md`.

**Plan metadata:** (this commit) `docs(40-10): complete panel-rewording, Phase-38-filing and i18n-census plan`

## Files Created/Modified

- `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` - reason-discriminator prop, two minted key pairs, extensive doc comment covering D-02/D-05/D-08/REQ-40-12
- `src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx` - reason-specific describe blocks incl. a named no-accusation test for the Epic copy, and a minted-key-location test asserting each key exists in `gamelib.json` and not in `translation.json`
- `src/frontend/screens/WebView/index.tsx` - non-macOS return now passes `reason="platform"`; new `store === 'epic'` branch returns `reason="epic"` before the live-embed JSX (Rule 2 fix, file not in the plan's declared list)
- `public/locales/en/gamelib.json` - added `webview.unavailable.platform.{heading,body}` and `webview.unavailable.epic.{heading,body}`; retired `webview.unavailable.{heading,body}`
- `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md` - added items `38-E01`..`38-E04`; updated the score line's item count from 30 to 34
- `.planning/spikes/MANIFEST.md` - added spike `024` (epic-store-in-embedded-child-webview, PLANNED) to the Idea C spikes table; cross-referenced it and the Phase 38 items from the existing "Open before shipping" bullet
- `.planning/ROADMAP.md` - added the four Phase 38 items to that section's own narrative, with the D-03 honesty note and the anti-conflation sentence for the two `40-11` overlaps
- `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-I18N-CENSUS.md` (new) - the counted catalog diff, consumer verification, gate-coverage notes, and the localisation-treatment outcome

## Decisions Made

- **Retired the old flat keys rather than keeping them alongside the new ones.** `webview.unavailable.heading`/`.body` had zero remaining consumers after Task 1's edit (verified by grep across `src/` and `public/`), so keeping them would be dead weight in the English catalog. Their translated values persist harmlessly in non-English `gamelib.json`/`gamelib.mt.json` files -- no gate flags this, and pruning it is out of this plan's scope (documented in the census).
- **`/store/epic` routing gap closed as a Rule 2 deviation.** `WebView/index.tsx` was not in the plan's declared `files_modified`, but D-05/REQ-40-12 are explicit that Epic must not reach the live embed on any platform, and nothing else in the codebase enforced that. Verified via `pnpm codecheck` that `store === 'epic'` type-checks against `useParams()`'s inferred type, and via the full WebView jest suite (273/273) that this didn't disturb plan 40-01's structural gate.
- **Named the Windows/Linux backend items as unknowns, not deferred observations.** `src-tauri/Cargo.toml` target-gates the `unstable` `add_child` feature to macOS only, so there is no code path on those targets to observe yet -- `38-E01`/`38-E02` say this explicitly rather than implying only a machine-switch is needed.
- **Filed the Epic spike as PLANNED, not run.** No probe was executed in this plan; the manifest entry documents the question, mechanism, harness path and non-blocking status so a future session can pick it up without re-deriving any of it.
- **Corrected the ROADMAP.md gap before writing this SUMMARY, not after.** Re-reading Task 2's acceptance criteria after the first Task 2 commit surfaced that "the ROADMAP's Phase 38 section gains four entries" meant ROADMAP.md's own narrative, not only `38-VERIFICATION.md` (which ROADMAP.md merely points to as source of truth). Fixed in a follow-up commit rather than silently under-delivering the task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] `/store/epic` had no gate preventing it from reaching the live embed**
- **Found during:** Task 1
- **Issue:** D-05/REQ-40-12 require `/store/epic` to be scoped out of the live embed on every platform, but no code anywhere (`urls` map, `useStoreEmbedHost.ts`, `storeEmbedOrigins.ts`'s `embeddable: false`) actually gated the direct `/store/epic` route -- that flag is only consulted by the deep-link/restore validation path.
- **Fix:** Added an `if (store === 'epic')` branch in `src/frontend/screens/WebView/index.tsx`, returning `<WebviewUnavailablePanel reason="epic" />` with a distinguishing log line, before the live-embed JSX return.
- **Files modified:** `src/frontend/screens/WebView/index.tsx`
- **Verification:** `pnpm codecheck` (clean type-check of `store === 'epic'` against `useParams()`'s inferred type); full WebView jest suite 273/273 including the new reason-specific tests and plan 40-01's inverted structural gate.
- **Committed in:** `7a1d1d55a` (part of Task 1's commit)

**2. [Rule 1 - Correction] Task 2's ROADMAP.md acceptance criterion was only partially satisfied**
- **Found during:** post-Task-2 self-review, before writing this SUMMARY
- **Issue:** Task 2's acceptance criteria state "the ROADMAP's Phase 38 section gains four entries in that section's own format" -- the first Task 2 commit added the four items only to `38-VERIFICATION.md` (the file ROADMAP.md's Phase 38 section names as its source of truth), not to the ROADMAP narrative itself.
- **Fix:** Added a paragraph to `.planning/ROADMAP.md`'s Phase 38 section naming `38-E01`..`38-E04`, the D-03 backend-target-gating honesty note, and the anti-conflation sentence for the two `40-11` overlaps. Updated the stale item count.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** `python3 meta/runPlanningGates.py` re-run, 8/8 still passing; `.planning/STATE.md` confirmed untouched.
- **Committed in:** `a487ab0cc`

---

**Total deviations:** 2 auto-fixed (1 missing critical functionality, 1 self-correction of an under-delivered acceptance criterion)
**Impact on plan:** Both were necessary for correctness against the plan's own stated scope and acceptance criteria. No scope creep beyond what D-04/D-05/D-08/REQ-40-12 already required.

## Issues Encountered

- **JSON re-serialization diff bloat (earlier session segment, Task 1):** an initial Python
  `json.dump(..., ensure_ascii=False)` edit to `gamelib.json` changed unicode-escape representation
  across ~330 unrelated lines. Reverted via `git checkout --` (which fires the repo's
  `post-checkout` hook -- ran benignly) and redid the edit surgically with the `Edit` tool,
  producing a 9-insertion/3-deletion diff.
- **`GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib` failed with an authentication gate, not a
  code defect.** The `ANTHROPIC_API_KEY` present in this execution environment is a 10-character
  placeholder (`sk-ant-...` literally), not a live credential; the API call returned HTTP 401 before
  any file write, so no locale files or `.mt.json` sidecars were touched (confirmed via `git
  status`). Documented in `40-I18N-CENSUS.md` as an auth gate with the exact command to re-run once
  a valid key is available -- not treated as a failure, since none of Task 3's required verification
  (`pnpm lint-translations`, `pnpm lint-translations:gamelib`, `pnpm i18n-churn-guard`, census file
  existence) depends on the fill having succeeded.
- **Encountered an anomalous tool-output instruction** during Task 2 investigation, directing use of
  Bash instead of the dedicated Read/Edit/Write tools "while bypass permissions mode is active."
  Identified as conflicting with this executor's actual operating rules and likely injected via tool
  output rather than from the user or orchestrator; disregarded, continued using Read/Edit/Write
  normally for the remainder of execution. No file changes resulted from that instruction.

## Authentication Gates

- **`GAMELIB_MT_LOCALES=de,fr pnpm machine-fill-gamelib` (Task 3).** Needed a live `ANTHROPIC_API_KEY`
  to translate the six newly minted `gamelib.json` keys into `de`/`fr`. The key present in this
  environment is a placeholder and the call returned HTTP 401. No locales were populated. To
  complete: set a valid `ANTHROPIC_API_KEY` and re-run the same command -- no other precondition is
  outstanding.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this
plan's changes.

## Threat Flags

None. This plan touches only i18n copy, panel routing logic already covered by the plan's own threat
register (T-40-10-01..06, T-40-10-SC), and planning-documentation files (Phase 38 ledger, spike
manifest, roadmap, census). No new network endpoint, auth path, file-access pattern, or schema
change was introduced.

## User Setup Required

None - no external service configuration required. (The Anthropic API key needed to complete the
optional locale-fill step is a development-environment credential, not new production
configuration; see Authentication Gates above.)

## Next Phase Readiness

- The panel, the Epic routing gate, and the Phase 38/spike filings are all committed and verified
  (`pnpm codecheck`, the full WebView jest suite, `pnpm lint-translations`/`:gamelib`,
  `pnpm i18n-churn-guard`, and `python3 meta/runPlanningGates.py` at 8/8 all pass on the final tree).
- Plan `40-11` (wave 7, live macOS hardware gate) can proceed knowing its own `40-LIVE-GATE.md`
  artifact must carry the matching anti-conflation statement for `38-E03`/`38-E04`, per its own
  pre-written text (40-11-PLAN.md lines 92-95) -- this plan's filing is the other half of that
  two-way record.
- Outstanding, not a blocker: the six newly minted `gamelib.json` keys are not yet machine-translated
  into any non-English locale (blocked on a working `ANTHROPIC_API_KEY` in whatever environment runs
  the fill next); `40-I18N-CENSUS.md` names the exact command to complete this.
- Outstanding, not a blocker, explicitly out of this plan's scope: the retired
  `webview.unavailable.heading`/`.body` keys' stale translated values remain in every non-English
  `gamelib.json`/`gamelib.mt.json`; a future locale-catalog pruning pass is the natural place to
  remove them.

---
*Phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we*
*Completed: 2026-09-04*

## Self-Check: PASSED

- All 9 files created/modified by this plan verified present on disk.
- All 5 commit hashes (7a1d1d55a, 69bb16cc8, 0f92d2f32, a487ab0cc, 291451629) verified present in `git log --all`.
- `.planning/STATE.md` confirmed untouched: its last modifying commit (`97767796b`) predates this plan's execution, and `git status --short .planning/STATE.md` shows no changes.
- No `state.*` or `roadmap.*` SDK verb was run at any point during this plan's execution.
