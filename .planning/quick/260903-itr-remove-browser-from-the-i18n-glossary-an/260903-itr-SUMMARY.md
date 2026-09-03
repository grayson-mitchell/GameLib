---
phase: quick-260903-itr
plan: 01
subsystem: i18n
tags: [i18n, glossary, machine-translation, hardcoded-string-gate, todo-hygiene]

requires: []
provides:
  - "machineFillGamelib.ts's glossary source-presence check is now symmetric (case-sensitive) with its verbatim check"
  - "48 non-en gamelib.json locale catalogs + MT sidecars committed (landed by the coordinator as 3b3d813f2, not by this plan)"
  - "corrected coverage numbers on the owning todo (242 outstanding, 185 with a known fix, 57 undiagnosed)"
affects: [i18n, machine-fill-gamelib, hardcoded-string-gate]

tech-stack:
  added: []
  patterns:
    - "Root-cause fix over exemption widening: when a blocking gate's true blast radius (measured) exceeds a plan's predicted blast radius, prefer fixing the underlying asymmetry over adding more exemption surface to the gate."

key-files:
  created: []
  modified:
    - meta/machineFillGamelib.ts
    - meta/__tests__/machineFillGamelib.test.ts
    - .planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md
    - .planning/STATE.md

key-decisions:
  - "Rejected removing `Browser` from meta/i18nGlossary.json (the plan's original Task 1) after measuring it would flip the blocking hardcodedStringGate RED at 8 sites across 6 files, not the 1 site the plan predicted -- a declaration-scoped exemption marker exempts an entire top-level statement, which for 4 of those files is a whole React component, a materially wider gate hole than the coverage gap was worth."
  - "Fixed the root cause instead (option C, approved by the operator): made machineFillGamelib.ts's source-presence check symmetric with its verbatim check by dropping the case-insensitive flag, renaming containsTermLoose to containsTermSourcePresence. Browser stays in the glossary; no src/ file touched; hardcodedStringGate is untouched and green."
  - "Deferred: no attempt to also fix the same latent asymmetry for Mac/GE/Zoom beyond what containsTermSourcePresence already fixes generally -- the fix is fully general (it changes the check for all glossary terms, not just Browser), so no further follow-up is owed there."

requirements-completed: []

metrics:
  duration: "~40min (execution paused mid-Task-1 for an operator decision after the gate-blast-radius measurement; resumed after the coordinator's option-C directive and state hand-off)"
  completed: 2026-09-03
---

# Quick 260903-itr: Fix machineFillGamelib's glossary case asymmetry (revised from glossary-removal to root-cause fix) Summary

**Made `machineFillGamelib.ts`'s glossary source-presence check case-sensitive instead of removing `Browser` from the do-not-translate glossary, after measuring the glossary-removal route would have flipped a blocking gate red at 8 sites across 6 files.**

## Performance

- **Started:** mid-session (exact epoch not captured; began from `HEAD=ac4f7dda0`)
- **Completed:** 2026-09-03T02:11Z
- **Tasks:** Original plan's Task 1 replaced by the coordinator; Tasks 2 (locale commit), 3 (todo), 4 (this summary) executed
- **Commits by this plan:** 2 (`c198c1021`, `83b16c4d4`) + this metadata commit
- **Commit by the coordinator (outside this plan, cited here for the record):** `3b3d813f2`

## What happened, in order

1. **Ran the plan's Task 1 as written.** Recorded the baseline (`i18nGlossary`/`hardcodedStringGate`/`gamelibCatalogParity` all green, 348 tests), removed `Browser` from `meta/i18nGlossary.json` (28 → 27 terms, rationale updated), and re-ran the three consumer gates.
2. **`hardcodedStringGate` went RED at 8 sites across 6 files**, not the 1 site (`InstallModal/index.tsx:247-249`) the plan's `measured_facts` predicted as "the real risk":
   - `src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx:62`
   - `src/frontend/screens/Game/GamePage/index.tsx:173`
   - `src/frontend/screens/Library/components/GameCard/index.tsx:159`
   - `src/frontend/screens/Library/components/InstallModal/SideloadDialog/filters.ts:83`
   - `src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:290,296`
   - `src/frontend/screens/Library/components/InstallModal/index.tsx:247,249`

   All 8 are `InstallPlatform`-discriminant comparisons/labels/object fields, never rendered prose — but `meta/hardcodedStringGate.ts`'s `checkDeclarationExemptMarker` only exempts literals inside the ONE top-level statement carrying the marker comment. Four of the new sites sit inside large top-level React component functions (`GamePage`, `GameCard`, `SideloadDialog`'s render function); a marker there would exempt the entire component, not just the flagged literal — a materially wider hole in a blocking gate than the plan's own `T-itr-02` threat entry described.
3. **Per the plan's own instruction** ("If you cannot make the gate pass cleanly by the plan's prescribed route, HALT and report the gate output verbatim rather than improvising a workaround or weakening the gate"), halted and reported the verbatim gate output plus four options (A: per-file scoped helper markers, B: shared constant refactor, C: fix the root-cause matcher asymmetry, D: rejected as non-viable) to the coordinator/operator.
4. **The operator approved option C.** The coordinator, while I was halted, also: restored `meta/i18nGlossary.json` to its HEAD state (`git show HEAD:... >` file — `Browser` back at 28 terms), committed the 96 locale paths itself as `3b3d813f2` with measured figures (48 x 209 = 10032; 9790 filled; 242 outstanding), and handed back control with revised instructions.
5. **Re-verified the tree state** matched the coordinator's claims: `HEAD=3b3d813f2`, glossary byte-identical to its pre-edit HEAD form (28 terms, `Browser` present), nothing staged, working tree carrying only the two untracked `.planning/` dirs that are not this plan's concern.
6. **Executed the revised Task 1:** in `meta/machineFillGamelib.ts`, dropped the `'i'` flag from the regex in what was `containsTermLoose`, renamed it `containsTermSourcePresence`, and rewrote its comment to state the new symmetric semantic and why the old asymmetry was wrong. Added a RED/GREEN test pair to `machineFillGamelib.test.ts`'s `glossary preservation` block: a common-noun case (`validateTranslation('Open in browser', 'Ouvrir dans le navigateur', ['Browser'])` → `[]`) that failed before the fix (confirmed RED, shown below) and passes after, plus a brand-still-enforced case confirming a translation that localises the capitalised `Browser` brand term is still rejected. The two pre-existing `Steam` glossary tests were confirmed unchanged and still passing throughout.
7. **Independently re-measured the blast radius** against the committed glossary (28 terms) and English catalog (215 total keys, 209 translatable): exactly 4 keys change behaviour (`login.logoutFailedMessage`, `webview.unavailable.body`, `webview.unavailable.next-step`, `webview.unavailable.open-in-browser`), zero collateral — matching the coordinator's cited figures.
8. Ran all four required gates; all green, `hardcodedStringGate` unchanged (`Browser` still exempts it, no `src/` file touched). Committed `meta/machineFillGamelib.ts` + `meta/__tests__/machineFillGamelib.test.ts` alone as `c198c1021`.
9. **Task 2 was already done by the coordinator** (`3b3d813f2`) — skipped entirely per instruction, no work performed, no commit made by this plan for it.
10. **Task 3:** rewrote the owning todo in place (frontmatter `title`/`blocked_by`/`files` plus a new "2026-09-03 update" body section and corrections to the stale "What the gap actually is" / API-key-blocker sections), using exactly the coordinator's measured figures (209/242/185/57, worst offenders et 37/fi 17/hu 11/hr 6/sl 5/sv 5/sk 4/ta 1). The `**Sole owner:**` sentinel line is preserved byte-identical (verified: `count: 1` in the file, unique under `.planning/todos/`). `status: pending` preserved. Committed alone as `83b16c4d4`.
11. This SUMMARY + a `.planning/STATE.md` row (appended via the prepared-index technique, disturbing no other line) are committed together as this plan's closure commit, with `.planning/ROADMAP.md` deliberately excluded (owned by a concurrent session).

## Gate results, verbatim

**Baseline, before any edit (Browser still in glossary, 348 tests):**
```
PASS Meta meta/__tests__/i18nGlossary.test.ts
PASS Meta meta/__tests__/gamelibCatalogParity.test.ts
PASS Meta meta/__tests__/hardcodedStringGate.test.ts (15.914 s)
Test Suites: 3 passed, 3 total
Tests:       348 passed, 348 total
```

**After removing `Browser` from the glossary (the abandoned Task 1 attempt):**
```
PASS Meta meta/__tests__/i18nGlossary.test.ts
PASS Meta meta/__tests__/gamelibCatalogParity.test.ts
FAIL Meta meta/__tests__/hardcodedStringGate.test.ts (15.713 s)
  src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx:62:27  argument  "Browser"
  src/frontend/screens/Game/GamePage/index.tsx:173:56  argument  "Browser"
  src/frontend/screens/Library/components/GameCard/index.tsx:159:55  argument  "Browser"
  src/frontend/screens/Library/components/InstallModal/SideloadDialog/filters.ts:83:10  argument  "Browser"
  src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:290:43  argument  "Browser"
  src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:296:21  argument  "Browser"
  src/frontend/screens/Library/components/InstallModal/index.tsx:247:13  object-property  "Browser"
  src/frontend/screens/Library/components/InstallModal/index.tsx:249:14  object-property  "Browser"
  Scanned 164 file(s), found 8 violation(s), 2080 candidate(s) considered.
Test Suites: 1 failed, 2 passed, 3 total
Tests:       2 failed, 346 passed, 348 total
```

**New common-noun test, RED before the matcher fix (proof of non-vacuity):**
```
● glossary preservation › validateTranslation accepts a genuine translation of the common noun "browser" (not the glossed brand)
  expect(received).toEqual(expected)
  - Array []
  + Array [ "translation drops or alters glossary term \"Browser\" present in the source -- glossary terms must survive verbatim" ]
Tests:       1 failed, 34 skipped, 5 passed, 40 total
```

**Final gate run, all four suites, after the containsTermSourcePresence fix (revised Task 1 committed):**
```
PASS Meta meta/__tests__/i18nGlossary.test.ts
PASS Meta meta/__tests__/machineFillGamelib.test.ts
PASS Meta meta/__tests__/gamelibCatalogParity.test.ts
PASS Meta meta/__tests__/hardcodedStringGate.test.ts (16.798 s)
Test Suites: 4 passed, 4 total
Tests:       388 passed, 388 total
```

`pnpm codecheck` (`tsc --noEmit`): clean, no output, exit 0.

## Measured counts (do not propagate the plan's original unverified figures)

- **Task 2 (already committed by the coordinator, `3b3d813f2`):** 48 locales x 209 translatable English keys = 10032; **9790 filled**, **242 outstanding**; 0 interpolation-placeholder mismatches; 2749 brand-term occurrences preserved, 0 dropped. This supersedes the plan brief's 9783 figure — the coordinator's commit states the brief's arithmetic was wrong, the plan's own re-derivation (9783) was also short by 7; the correct measured figure is **9790**.
- **Task 1 (this plan, `c198c1021`):** blast radius of the `containsTermLoose` → `containsTermSourcePresence` fix, independently re-derived against the committed glossary (28 terms) and English catalog (215 total keys / 209 translatable): **exactly 4 keys change behaviour**, **zero collateral** across the other 27 terms. Matches the coordinator's cited figures exactly.
- **Task 3 (this plan, `83b16c4d4`):** todo corrected to 209 translatable keys (up from 204), 242 outstanding, 185 attributable to the now-fixed Browser matcher bug, 57 undiagnosed with worst offenders named (et 37, fi 17, hu 11, hr 6, sl 5, sv 5, sk 4, ta 1).

## Task Commits

1. **Task 1 (revised — root-cause fix, not glossary removal):** `c198c1021` (fix) — `meta/machineFillGamelib.ts`, `meta/__tests__/machineFillGamelib.test.ts`
2. **Task 2 (already done by the coordinator, not this plan):** `3b3d813f2` (feat) — `public/locales/*/gamelib.json`, `public/locales/*/gamelib.mt.json` (48 locales, 96 paths)
3. **Task 3:** `83b16c4d4` (docs) — `.planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`
4. **Task 4 (this commit):** SUMMARY + STATE.md row, `.planning/ROADMAP.md` excluded

## Files Created/Modified

- `meta/machineFillGamelib.ts` — `containsTermLoose` renamed `containsTermSourcePresence`, `'i'` regex flag dropped, comment rewritten to state the symmetric semantic and the historical asymmetry it fixes
- `meta/__tests__/machineFillGamelib.test.ts` — two new tests in `glossary preservation`: common-noun acceptance (was RED, proof of non-vacuity), brand-term-still-enforced
- `.planning/todos/pending/2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md` — frontmatter (`title`, `blocked_by`, `files`) and body corrected for 2026-09-03 reality; `**Sole owner:**` sentinel and `status: pending` preserved byte-identical/unchanged
- `.planning/STATE.md` — one row appended at EOF via the prepared-index technique (base built from `git show HEAD:`, then `git update-index --cacheinfo`), disturbing no other line

**Not modified by this plan (confirmed):** `meta/i18nGlossary.json` (restored by the coordinator to its HEAD state, `Browser` still present, 28 terms — verified byte-identical to `git show HEAD:` both before and after this plan's Task 1), `public/locales/en/gamelib.json`, `.planning/ROADMAP.md`.

## Deviations from Plan

### Task 1 replaced entirely (not an auto-fix deviation — an operator-approved architectural change, Rule 4)

**Plan's original Task 1:** remove `Browser` from `meta/i18nGlossary.json`.
**What actually happened:** measured that this flipped `hardcodedStringGate` (a blocking gate) red at 8 sites across 6 files rather than the plan's predicted 1 site. Per the plan's own instruction to halt rather than improvise past its prescribed route, reported the verbatim gate output and four options to the coordinator. The operator approved fixing the root cause in `machineFillGamelib.ts` instead (dropping the case-insensitive flag on the glossary source-presence check) — `Browser` stays in the glossary, permanently, and is recorded as intentionally kept in the corrected todo.
- **Files modified:** `meta/machineFillGamelib.ts`, `meta/__tests__/machineFillGamelib.test.ts` (in place of the planned `meta/i18nGlossary.json` edit)
- **Commit:** `c198c1021`

### Task 2 executed by the coordinator, not this plan

No work performed by this plan for Task 2; the coordinator committed it directly (`3b3d813f2`) while this plan was halted awaiting the Task 1 decision. Verified the commit's shape and content matched its own message (96 paths, 48+48 split, `en` absent) before proceeding.

No other deviations. Tasks 3 and 4 executed as planned, with numbers corrected to the coordinator's measured figures rather than the plan brief's.

## Deferred / Follow-up Work

1. **Owed:** a `pnpm machine-fill-gamelib` re-run to collect the 185 fills the matcher fix unblocks (fix stops future rejections; it does not retroactively fill anything already skipped). Tracked by the corrected todo, which remains `status: pending`.
2. **Owed:** separate investigation of the 57 undiagnosed outstanding fills (et 37, fi 17, hu 11, hr 6, sl 5, sv 5, sk 4, ta 1). Tracked by the same todo.
3. **Not owed / no further action:** unlike the original plan's Task 1 (which would have deferred a `containsTermLoose` case-sensitivity fix as future work), this plan's revised Task 1 IS that fix, applied now and fully generally (it changes the check for all 27 remaining glossary terms symmetrically, not just `Browser`), so there is no remaining latent asymmetry for `Mac`, `GE`, or `Zoom` to track separately.

## Known Stubs

None — no UI components, no empty-value stubs introduced by this plan.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. `meta/i18nGlossary.json` was read but not modified by this plan; `hardcodedStringGate` was proven unaffected (green, unchanged) rather than weakened.

## Next Phase Readiness

The owning todo (`2026-09-02-46-locales-have-zero-gamelib-json-fork-string-coverage.md`) remains `status: pending`, now accurately describing a 242-outstanding gap (down from a nominal 10032 as originally filed) with a clear, actionable next step (re-run `pnpm machine-fill-gamelib` to collect 185 of them) and a named, bounded remainder (57, across 8+ locales) for separate investigation. No blockers introduced by this plan.

---
*Quick task: 260903-itr*
*Completed: 2026-09-03*
