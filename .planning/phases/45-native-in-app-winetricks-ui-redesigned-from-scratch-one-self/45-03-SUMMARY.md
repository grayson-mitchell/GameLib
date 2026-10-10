---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 03
subsystem: i18n
tags: [i18next, locale-fill, winetricks, gamelib-json, cli-tooling]

# Dependency graph
requires:
  - phase: 44
    provides: "winetricksBrowse namespace and the 13 keys plan 45-03 freezes alongside its 41 new leaves"
provides:
  - "41 new English leaves under `winetricksBrowse` in `public/locales/en/gamelib.json`, frozen as the copy contract for the whole redesigned Winetricks tab"
  - "`applyFill.ts` + `README.md`: a validator-first, staged, no-network CLI tool for plans 45-09/45-10 to fill the 41 new keys across the 48 non-English locales"
  - "Measured fill target: 1968 red `lint-translations:gamelib` findings (41 keys x 48 locales), the known-accepted baseline plans 45-09/45-10 drive to zero"
affects: [45-09, 45-10, 45-11]

actuals:
  tokens: 5945
  tasks: 2
  commits: 2
  plan_head_before: eec761a6e552a0e71b0807ad686999f60bc1d9ca
  plan_head_after: e9dfb697e8c133f922002118d42b97e49615f6eb

tech-stack:
  added: []
  patterns:
    - "Staged-fill CLI pattern: validate every requested locale before writing any, refuse-all-or-nothing on any single locale's problem (mirrors machineFillGamelib.ts's BulkRunRefusedError shape)"
    - "Round-trip assertion before write: serialize -> parse -> re-serialize byte-identity check on both the catalog and the .mt.json manifest, for every write"
    - "Scope-prefixed required-key computation (SCOPE_PREFIX = 'winetricksBrowse.') to avoid treating the whole gamelib.json catalog as in-scope"

key-files:
  created:
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/applyFill.ts
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/README.md
  modified:
    - public/locales/en/gamelib.json

key-decisions:
  - "Left the 2 retired Phase-44 keys (needsGuiTag, installingRow) in place rather than removing them now -- removal is explicitly deferred to plan 45-11."
  - "applyFill.ts reimplements isPlainObject/flattenCatalog/readGlossary locally rather than exporting them from meta/machineFillGamelib.ts, since those are module-private there and widening that module's public surface was out of this plan's scope."
  - "mergeFill carries the prior gamelib.mt.json manifest's model/filledAt fields forward unchanged when applyFill.ts writes a human-staged fill -- documented in README.md as a known, stated inaccuracy rather than stamping a fake model name."

patterns-established:
  - "Staged-fill CLI pattern: one flat JSON staging file per locale at 45-i18n-fill/<locale>.json, validated key-by-key against requiredPluralKeys()-expanded plural groups before any write."

requirements-completed: [D-08, D-14, D-16, D-20]

coverage:
  - id: D1
    description: "public/locales/en/gamelib.json gains exactly the 41 new winetricksBrowse leaves from the plan's copy table (English values verbatim); the 13 frozen Phase-44 base keys (14 leaves, including the resultsHeading plural pair) are unchanged; translation.json is byte-identical to the parent commit"
    requirement: "D-20"
    verification:
      - kind: unit
        ref: "node probe counting winetricksBrowse leaves, diffing translation.json against HEAD^ (ad hoc, run during task 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Exactly 13 family sentences exist under winetricksBrowse.family (vcrun, dotnet, vbrun, d3dx, dxvk, physx, xactXinput, fonts, media, fontsmooth, videomemorysize, csmt, vd), family-level only, no per-verb keys"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "node probe counting winetricksBrowse.family.* keys against the plan's named list"
        status: pass
    human_judgment: false
  - id: D3
    description: "phaseDownloading/phaseInstalling interpolate {{percent}}, environment banner copy resolved, retired keys preserved -- English copy contract otherwise matches plan's table exactly"
    requirement: "D-14, D-16"
    verification:
      - kind: unit
        ref: "node probe asserting {{percent}} present in phaseDownloading/phaseInstalling; manual read of banner strings against plan prose"
        status: pass
    human_judgment: false
  - id: D4
    description: "applyFill.ts is a validator-first, staged, zero-network CLI tool: --self-test rejects a sabotaged {{count}}-stripped translation (exit 1), --check runs full validation without writing, and the tool makes no fetch/http/https/axios call and never calls createAnthropicTranslator or fillLocale"
    requirement: "D-20"
    verification:
      - kind: unit
        ref: "JEST_WORKER_ID=1 node meta/runTs.cjs ... applyFill.ts --self-test (exit 1 on sabotage); grep for fetch|axios|createAnthropicTranslator|fillLocale over applyFill.ts (count 0)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-10
status: complete
---

# Phase 45 Plan 03: Winetricks Tab English Copy Freeze + Validator-First Fill Tool Summary

**Froze 41 new English leaves under `winetricksBrowse` in `gamelib.json` and built a staged, validator-first, zero-network CLI (`applyFill.ts`) that plans 45-09/45-10 will use to fill those keys across 48 locales.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-10T05:20:00Z (approx. — plan-start epoch was not separately captured across a mid-session compaction boundary; estimated from the first task commit's timestamp minus setup/orientation time)
- **Completed:** 2026-10-10T05:34:28Z
- **Tasks:** 2/2 completed
- **Files modified:** 3

## Accomplishments

- Added 41 new English leaves to `winetricksBrowse` in `public/locales/en/gamelib.json`, deep-sorted the touched subtree with a comparator mirroring i18next-parser's `makeDefaultSort`, preserved the 2 retired Phase-44 keys for plan 45-11 to remove, and left `translation.json` byte-identical to the parent commit.
- Built `.planning/phases/45-.../45-i18n-fill/applyFill.ts` (409 lines) and its `README.md` (85 lines): a staged, per-locale, validator-first fill tool that refuses to write anything if any requested locale fails validation, asserts byte-identical round-trips on both the catalog and the `.mt.json` manifest before writing, and makes zero network calls — verified via `grep` for `fetch`/`http(s)`/`axios`/`createAnthropicTranslator`/`fillLocale` returning a count of 0.
- Measured and recorded the fill target for plans 45-09/45-10: `pnpm lint-translations:gamelib` currently reports 1968 findings (41 new keys x 48 locales), the known-accepted red baseline this phase's later fill plans drive to zero.

## Task Commits

Each task was committed atomically:

1. **Task 1: Freeze Winetricks tab English copy contract** - `373e85b33` (feat)
2. **Task 2: Build validator-first staged-fill tool for the 48 locales** - `e9dfb697e` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `public/locales/en/gamelib.json` - 41 new `winetricksBrowse.*` English leaves added; existing 13 frozen base keys (14 leaves) preserved; subtree re-sorted
- `.planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/applyFill.ts` - new CLI: validates staged per-locale fills against `requiredPluralKeys`-expanded required-key sets, round-trip-asserts, refuses all writes on any single-locale problem, writes `gamelib.json` + `gamelib.mt.json` per locale when clean
- `.planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/README.md` - documents invocation, staging file shape, the plural rule, the refuse-all-or-nothing rule, the round-trip rule, and the no-network-call guarantee

## Decisions Made

- Left the 2 retired Phase-44 keys (`needsGuiTag`, `installingRow`) in `gamelib.json` rather than removing them now; removal is explicitly deferred to plan 45-11 per the plan's own instruction.
- `applyFill.ts` locally reimplements `isPlainObject`/`flattenCatalog`/glossary-reading rather than exporting them from `meta/machineFillGamelib.ts`, since those helpers are module-private there and widening that module's exported surface was out of this plan's scope.
- `mergeFill` is allowed to carry the prior `gamelib.mt.json` manifest's `model`/`filledAt` fields forward unchanged when `applyFill.ts` performs a human-staged write — documented explicitly in `README.md` as a known, stated inaccuracy, rather than stamping a fabricated model name or timestamp onto a non-MT-sourced fill.

## Deviations from Plan

### Auto-fixed Issues (caught and fixed during authoring, before any commit)

**1. [Rule 1 - Bug] `computeRequiredKeys` initially scanned the whole `gamelib.json` catalog, not just `winetricksBrowse`**
- **Found during:** Task 2, first dry run of `applyFill.ts --locales de --check`
- **Issue:** The required-key loop iterated `Object.keys(englishFlat)` unfiltered, where `englishFlat` is a flatten of the *entire* catalog — so it reported dozens of unrelated keys (`box.protocol.launch.accept`, `gamepage.steamShortcut.failed`, `tour.library.welcome.intro2`, etc.) as "missing," not just the 41 `winetricksBrowse.*` keys the plan scopes this tool to.
- **Fix:** Added a `SCOPE_PREFIX = 'winetricksBrowse.'` constant and a `startsWith` guard inside the loop, with an explanatory comment. Re-running `--check` now reports exactly the 41 expected keys.
- **Files modified:** `applyFill.ts` (pre-commit; folded into the task 2 commit, not a separate commit)
- **Verification:** `JEST_WORKER_ID=1 node meta/runTs.cjs ... applyFill.ts --locales de --check` output matches the plan's 41-row copy table exactly.
- **Committed in:** `e9dfb697e` (part of task 2 commit)

**2. [Rule 1 - Bug] `readStaged()` initially used `__dirname`, which resolves to an esbuild tmpdir under `meta/runTs.cjs`, not the real source location**
- **Found during:** Task 2, code review while authoring `readStaged()` (caught before ever running the tool, immediately after reading `meta/runTs.cjs` in full as required reading)
- **Issue:** `meta/runTs.cjs` bundles the entry file via esbuild into a single-file output inside a fresh `fs.mkdtempSync(os.tmpdir())` directory before running it. `__dirname` inside that bundled output resolves to the tmpdir, not `45-i18n-fill/` — so `readStaged()` would always have read from (or failed to find) the wrong directory, silently treating every locale as "nothing staged."
- **Fix:** Replaced `__dirname`-relative resolution with a `process.cwd()`-relative `STAGING_DIR` constant (matching every other path in the file and the plan's own documented repo-root invocation convention), with an in-code comment recording the hazard so a future reader does not "fix" it back to `__dirname`.
- **Files modified:** `applyFill.ts` (pre-commit; folded into the task 2 commit)
- **Verification:** Confirmed by reading `meta/runTs.cjs`'s `mkdtempSync`/bundling logic; no live run was needed to catch this, since it was identified at authoring time.
- **Committed in:** `e9dfb697e` (part of task 2 commit)

### Documentation-only discrepancy (not a code defect — recorded for traceability)

**3. The plan's own `<fails_when>`/acceptance-criteria text expects 54 total `winetricksBrowse` leaves ("13 frozen + 41 new"); the correct, internally-consistent result is 55.**
- **Found during:** Task 1 verification
- **Explanation:** "13 frozen" is a *base-name* count (matching `45-UI-SPEC.md`'s own "11 reused as-is + 2 retired = 13" base-name accounting), but one of those 13 base names — `resultsHeading` — expands to 2 leaves (`_one`/`_other`), making the true frozen *leaf* count 14, not 13. 14 frozen leaves + 41 new leaves = 55, which is what the file now measures and what is consistent with the plan's own 41-row copy table (which counts every `_one`/`_other` pair as a separate row).
- **Resolution:** No code change was needed or made — the plan's automated verify script only `console.log`s the leaf count and never asserts a specific number, so nothing enforced the incorrect 54 figure. Every other programmatic assertion in the plan's verify blocks (required-key presence, family count = 13, no `category.*` key, `{{percent}}` presence, `translation.json` unchanged, sort order) passed cleanly against the produced 55-leaf result.
- **Impact:** None on correctness. Recorded here so a future reader of `45-03-PLAN.md` is not confused by the 54-vs-55 mismatch.

---

**Total deviations:** 2 auto-fixed (both Rule 1, both caught and fixed before commit during Task 2 authoring) + 1 documentation-only discrepancy (no fix needed).
**Impact on plan:** Both auto-fixes were necessary for `applyFill.ts` to function correctly for its stated purpose (scoping to `winetricksBrowse`; resolving staging paths correctly under the `runTs.cjs` bundler). No scope creep — both stayed entirely within the plan's declared `files_modified`.

## Issues Encountered

None beyond the two auto-fixed issues documented above, both caught and resolved during development before either task was committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 45-09/45-10 can now stage per-locale JSON fills at `45-i18n-fill/<locale>.json` and run `applyFill.ts --locales <codes>` to validate and write them, with the 1968-finding `lint-translations:gamelib` baseline as their measurable fill target.
- Plan 45-11 can remove the 2 retired keys (`needsGuiTag`, `installingRow`) now that the full copy contract they were retired alongside is frozen.
- `requirements.ready-ids` reports all four of this plan's requirement IDs (D-08, D-14, D-16, D-20) as still `blocked` rather than `ready` — they are shared with other plans in this phase (e.g. D-16 also appears in plan 45-01's frontmatter) and are not yet eligible for `requirements.mark-complete`. No requirement checkboxes were marked complete in this plan's execution; that remains for whichever later plan the requirements tool determines is the one to close them out on.

## Self-Check: PASSED

- FOUND: `public/locales/en/gamelib.json`
- FOUND: `.planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/applyFill.ts`
- FOUND: `.planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/README.md`
- FOUND: commit `373e85b33` (task 1)
- FOUND: commit `e9dfb697e` (task 2)
