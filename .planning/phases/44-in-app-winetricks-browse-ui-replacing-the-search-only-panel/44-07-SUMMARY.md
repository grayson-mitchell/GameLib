---
phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
plan: 07
subsystem: i18n-gate, planning-todos
tags: [i18n, meta, jest, gate-scope, todo-triage, winetricks]

requires:
  - phase: 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
    provides: "44-03/44-04's WinetricksBrowse/ and Row/ components; 44-05's deletion of WinetricksSearch/ and the hasInstalledData/isRevalidatingInstalled remount fix; 44-06's translation.json orphan removal"
provides:
  - "meta/i18nGateScope.json and meta/i18nForkTouchedFiles.json hand-mirrored to the phase's src/frontend additions/deletion, A-03/A-17/A0 gate tests green, generatedAt held constant on both artifacts"
  - "explicit disposition for src/frontend/components/UI/SearchBar/searchProbe.ts: excluded from the blocking scope, retained as declared unscanned debt"
  - "2026-08-26 Winetricks todo closed (completed/), Half A folded verbatim into the 2026-08-30 LibrarySearchBar todo first (D-15/D-16)"
  - "2026-09-15 remount todo closed (completed/) against plan 44-05's landed fix and both revert-to-red transcripts (D-17/D-18)"
affects: [44-08]

tech-stack:
  added: []
  patterns:
    - "Hand-edit the two i18n gate JSON artifacts directly rather than running pnpm gen-i18n-gate-scope, which regenerates BOTH files at once and would also pick up unrelated live drift (generatedAt bump, searchProbe.ts) — a targeted hand-edit keeps generatedAt and every unrelated entry byte-identical."
    - "Rename-line parsing for git diff --name-status must take the LAST tab-separated field (not the naive 2nd field) — 3-field R079/R100 rename lines otherwise attribute the change to the OLD path."
    - "Fold-before-close for todos with irreplaceable content: when closing a todo, grep it for any claim/lead that is not otherwise covered elsewhere, and paste it verbatim into its new home BEFORE the git mv, not after — D-16 required this ordering explicitly."

key-files:
  created: []
  modified:
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
    - .planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md
  moved:
    - "from: .planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md"
    - "to: .planning/todos/completed/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md"
    - "from: .planning/todos/pending/2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md"
    - "to: .planning/todos/completed/2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md"

key-decisions:
  - "searchProbe.ts (src/frontend/components/UI/SearchBar/searchProbe.ts) is explicitly EXCLUDED from meta/i18nGateScope.json (the blocking scope) and explicitly INCLUDED in meta/i18nForkTouchedFiles.json (routine fork-touched snapshot) and in DECLARED_UNSCANNED_DEBT. Read in full: it is a default-OFF, opt-in diagnostic harness (quick task 260915-lhm, marked SEARCHPROBE-REMOVE-ME) with zero t()/tGamelib() calls and zero translatable surface -- pure colour-contrast arithmetic and a keystroke-watching attach mechanism. It is not phase 44's own work, so it is not promoted into scope; it does appear in the live git diff against the fork's baseCommit, so it is correctly forkTouched; and because it has no i18n surface to scan, it is correctly declared debt rather than either scanned or silently dropped."
  - "DECLARED_UNSCANNED_DEBT count held at 42 (net zero): removed the WinetricksSearch/index.tsx entry (file deleted by plan 44-05), added the searchProbe.ts entry (per the decision above). Winetricks/index.tsx's own pre-existing debt entry was left untouched, as required."
  - "generatedAt held constant on both meta/i18nGateScope.json and meta/i18nForkTouchedFiles.json -- verified via git diff | grep -c '\"generatedAt\"' returning 0 on both files' commit."
  - "Corrected two pre-existing stale-number inconsistencies in meta/__tests__/genI18nGateScope.test.ts while updating the pinned counts to 172/214: A3's it() title said '213' while its assertion said .toBe(212); A4's it() title said '215 files' while its assertion said .toBe(212). Both title and assertion now consistently read 214."
  - "Half A of the 2026-08-26 Winetricks todo (the never-investigated 'typing needs repeated attempts before it filters usably' symptom) was folded verbatim -- operator quote, both structural facts, and the 'place to LOOK, not a diagnosis' caveat -- into the 2026-08-30 LibrarySearchBar todo BEFORE the 2026-08-26 todo was moved to completed/, per D-16's mandatory ordering."
  - "The 2026-09-15 remount todo's closure pasted both of plan 44-05's revert-to-red transcripts byte-for-byte (verified programmatically against 44-05-SUMMARY.md, not eyeballed) and explicitly marked the predicted installWrapper flicker as 'never observed' rather than claiming it was watched and fixed."
  - "Per this execution's explicit mandate, no gsd-sdk state/roadmap/requirements/commit invocations were made at any point (no state.*, roadmap.*, requirements.mark-complete, or query commit calls). .planning/STATE.md and .planning/ROADMAP.md are untouched -- verified byte-identical via git diff/git status showing no output for either path at completion. The orchestrator owns those updates, including marking REQ-44-14 and REQ-44-22 complete."

patterns-established:
  - "Byte-for-byte transcript verification via a small Python script comparing extracted fenced code blocks between the closure note and its source SUMMARY, rather than a visual diff -- catches transcription drift a human read-through would miss."

requirements-completed: []

duration: ~35min (this session, continuing a prior session that completed Task 1's investigation)
completed: 2026-09-16
---

# Phase 44 Plan 07: Mirror the i18n gate artifacts and close three Winetricks todos Summary

**Hand-mirrored `WinetricksBrowse`'s two new components and `WinetricksSearch`'s deletion into both i18n gate JSON artifacts (170→172 scope, 212→214 fork-touched) with `generatedAt` held constant, gave `searchProbe.ts` an explicit debt disposition rather than silently sweeping it in, then folded and closed all three todos in the phase's blast radius in the D-16-mandated fold-before-close order.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 4 (`meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`, `meta/__tests__/genI18nGateScope.test.ts`, the 2026-08-30 todo)
- **Files moved (git mv, filenames unchanged):** 2 (the 2026-08-26 and 2026-09-15 todos, `pending/` → `completed/`)
- **Duration:** ~35 min this session (Task 1's derivation work and commit `575dac452` were completed in a prior session of the same execution)

## Accomplishments

- `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json` now match a freshly derived git diff against the fork's baseline: the two new `WinetricksBrowse/` files are in scope (scanned) and the deleted `WinetricksSearch/index.tsx` is gone from every artifact, with `generatedAt` unchanged on both files and zero use of the disallowed `pnpm gen-i18n-gate-scope` regeneration path.
- `searchProbe.ts` was investigated (read in full) and given an explicit, documented disposition — forkTouched-but-debt, not scope — rather than being silently absorbed or silently ignored.
- All three todos named in the phase's blast radius are resolved: Half A of the 2026-08-26 todo survives (folded verbatim into the 2026-08-30 todo before the source closed), the 2026-08-26 todo is closed with an honest per-half note, and the 2026-09-15 remount todo is closed with both removed gates named and both of plan 44-05's revert-to-red transcripts pasted verbatim.

## Task Commits

Each task was committed atomically, staging only the files it touched (never `git add -A`/`.`, never a `gsd-sdk query commit` full-tree stage):

1. **Task 1: Mirror the i18n gate artifacts (D-17-adjacent, REQ-44-22)** — `575dac452` (`fix(44-07): mirror phase 44's Winetricks Browse files into the i18n gate scope`) — completed in the prior session of this same execution.
2. **Task 2: Fold Half A into the 2026-08-30 todo (D-16), then close the 2026-08-26 todo (D-15)** — `f988aa002` (`docs(44-07): fold Half A into 2026-08-30 todo, then close 2026-08-26 todo (D-15/D-16)`)
3. **Task 3: Close the 2026-09-15 remount todo against plan 44-05's landed proof (D-17/D-18)** — `843258778` (`docs(44-07): close the 2026-09-15 remount todo against plan 44-05's landed fix (D-17/D-18)`)

**Plan metadata:** this SUMMARY.md, committed separately below (`.planning/STATE.md` and `.planning/ROADMAP.md` are explicitly NOT touched or committed by this execution — see "Explicit scope exclusions" below).

## Files Created/Modified

- `meta/i18nGateScope.json` — hand-curated blocking-gate scope; added `WinetricksBrowse/Row/index.tsx` and `WinetricksBrowse/index.tsx`; 170 → 172 files; `generatedAt` unchanged.
- `meta/i18nForkTouchedFiles.json` — routine fork-touched snapshot; added the same two `WinetricksBrowse/` files plus `SearchBar/searchProbe.ts`, removed `WinetricksSearch/index.tsx`; 212 → 214 files; `generatedAt` unchanged.
- `meta/__tests__/genI18nGateScope.test.ts` — `DECLARED_UNSCANNED_DEBT` swapped `WinetricksSearch/index.tsx` for `searchProbe.ts` (count held at 42); A0/A2/A3/A4 titles and assertions updated to the new 172/214 counts, correcting two pre-existing stale-number mismatches (A3, A4) in the process; two dated provenance paragraphs added documenting the derivation and the debt-set rationale.
- `.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md` — new `## Inherited from the 2026-08-26 Winetricks todo` section: the operator's verbatim Half A account, both structural facts (`WinetricksSearchBar` had no debounce; `SearchBar` drives its input uncontrolled), the "place to LOOK, not as a diagnosis" caveat carried across intact, and a pointer to the origin file.
- `.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md` → `.planning/todos/completed/` (same filename) — new `## RESOLVED 2026-09-16 (Phase 44, D-15/D-16)` section: per-half resolution (Half B install already shipped in `366e719bb`; the remaining highlight/filtering halves are moot because `WinetricksBrowse` never renders into `SearchBar`'s `.autoComplete` overlay), the operator-decision-against-recommendation noted honestly, and a pointer to Half A's new home.
- `.planning/todos/pending/2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md` → `.planning/todos/completed/` (same filename) — new `## RESOLVED 2026-09-16 (Phase 44, plan 44-05, D-17/D-18)` section: both removed gates named (outer `!loadingInstalled` at old `:156`, inner `!installing` at old `:158`), the `hasInstalledData`/`isRevalidatingInstalled` decoupling described, both of `44-05-SUMMARY.md`'s revert-to-red transcripts pasted verbatim (verified byte-identical programmatically), and the predicted flicker marked "never observed."

## Decisions Made

See `key-decisions` in the frontmatter above for the full list. The two load-bearing ones:

1. **`searchProbe.ts` disposition** — excluded from `i18nGateScope.json`, included in `i18nForkTouchedFiles.json` and `DECLARED_UNSCANNED_DEBT`. It is a temporary (`SEARCHPROBE-REMOVE-ME`-marked), default-OFF diagnostic with zero translatable surface, and it is not this phase's own work — it merely happens to postdate the fork baseline, which is what makes it forkTouched.
2. **Fold-before-close ordering (D-16)** — Half A of the 2026-08-26 todo was folded into the 2026-08-30 todo in a separate edit, staged, and confirmed present in the working tree *before* the 2026-08-26 todo's own closure note was written and the `git mv` was run. This ordering matters because `git mv` commits HEAD content — editing after the move risks the edit landing only in the working tree, unstaged.

## Deviations from Plan

None — plan executed exactly as written. Both `git mv` operations were followed by an explicit staged-blob check (`git diff --cached` / `git show :<path>` and a byte-for-byte Python comparison for the transcripts) per the plan's own T-44-23 mitigation, and both moves showed rename statuses (`R087` for the 2026-08-26 todo; the 2026-09-15 todo's move was large enough — 221 insertions / 87 deletions — that git recorded it as an Add+Delete pair rather than a detected rename, which does not affect correctness since both the staged content and the final file location were verified directly).

## Explicit scope exclusions (per this execution's mandate)

- No `gsd-sdk query state.*`, `roadmap.*`, `phase.complete`, or `query commit` invocation was made at any point in this execution. All three task commits used plain `git add <specific paths> && git commit`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were not read for modification and are confirmed untouched: `git status --short .planning/STATE.md .planning/ROADMAP.md` and `git diff --stat HEAD -- .planning/STATE.md .planning/ROADMAP.md` both produce no output at completion of this plan.
- `requirements-completed` is left empty in this SUMMARY's frontmatter and `requirements.mark-complete` was never invoked, even though the plan's frontmatter lists `REQ-44-14` and `REQ-44-22` — marking those complete is the orchestrator's responsibility, per this execution's explicit instructions.

## Known Stubs

None. This plan touched only meta gate artifacts, a meta test file, and three planning todos — no UI/data-wiring surface was created or modified.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change was introduced. The plan's own threat register (T-44-21 through T-44-24, T-44-SC) covers exactly the surfaces this plan touched (gate-artifact tampering, stale test titles, `git mv` content loss, and closing a todo on an unsupported claim); all four mitigations were applied as specified — see "Deviations from Plan" above and the byte-for-byte transcript verification described there.

## Verification Run (this session)

```
npx jest --selectProjects Meta --passWithNoTests --silent genI18nGateScope
  → 1 suite, 1 skipped / 26 passed / 27 total

npx jest --selectProjects Meta --passWithNoTests --silent
  → 39 suites passed, 39 total; 1 skipped / 1075 passed / 1076 total; exit 0

pnpm lint-translations && pnpm lint-translations:gamelib
  → lint-translations[gamelib,gamepage,login,translation]: 7450 findings, 0 hard failures
  → lint-translations[gamelib]: 0 findings, 0 hard failures

pnpm lint
  → production: 1122 problems (0 errors, 1122 warnings) — PASS (ceiling 1124, 2 slots free, unchanged)
  → tests: 638 problems (0 errors, 638 warnings) — PASS (ceiling 638, 0 slack, unchanged)
  → exit 0

pnpm codecheck
  → tsc --noEmit, no output, exit 0

pnpm planning-gates
  → 11/11 planning gates passed, exit 0 (run twice, once after each todo task)

git status --porcelain .planning/todos/
  → only a pre-existing, unrelated modification to
    .planning/todos/completed/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md
    present at session start, not touched by this plan
```

`pnpm gen-i18n-gate-scope` was never run, per the plan's explicit instruction (regeneration cascades one failure into five). `pnpm test:ci` was not gated on, per the plan's explicit instruction.

## Self-Check

```
FOUND: meta/i18nGateScope.json (modified, committed in 575dac452)
FOUND: meta/i18nForkTouchedFiles.json (modified, committed in 575dac452)
FOUND: meta/__tests__/genI18nGateScope.test.ts (modified, committed in 575dac452)
FOUND: .planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md (modified, committed in f988aa002)
FOUND: .planning/todos/completed/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md (moved+modified, committed in f988aa002)
MISSING (expected -- moved): .planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md
FOUND: .planning/todos/completed/2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md (moved+modified, committed in 843258778)
MISSING (expected -- moved): .planning/todos/pending/2026-09-15-winetricks-installwrapper-remounts-on-install-completion-via-loadinginstalled.md
FOUND commit: 575dac452 (Task 1)
FOUND commit: f988aa002 (Task 2)
FOUND commit: 843258778 (Task 3)
CONFIRMED: .planning/STATE.md untouched (no diff, no status entry)
CONFIRMED: .planning/ROADMAP.md untouched (no diff, no status entry)
```

## Self-Check: PASSED
