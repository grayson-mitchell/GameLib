---
phase: 19-crossover-compatibility-index-macos
plan: 02
subsystem: backend
tags: [crossover-index, name-matching, measurement-harness, macos, fast-xml-parser, jest]

# Dependency graph
requires:
  - phase: 16-crossover-compatibility-rating-codeweavers
    provides: "slugify()/naiveSlugify() in codeweavers/utils.ts — the anti-pattern boundary this plan deliberately does not reuse (D-20)"
provides:
  - "src/backend/crossover_index/normalize.ts — the CrossOver matching key (normalize()) + its three named candidate variants + the NAME_MATCHING_SHIPS gate verdict (now true)"
  - "meta/measureCrossoverMatching.ts — re-runnable, self-contained measurement harness that fetches the live .tie dump, scores three separately-denominated samples, evaluates the D-02 gate, and writes a dated Markdown report"
  - "A live-measured D-02 verdict: PASS (candidate C, wrongHitRate 0.81%, hitRate 85.37% on the 123-pair ground-truth set)"
affects: ["19-05 (runtime lookup consumes NAME_MATCHING_SHIPS)", "19-01 (builder plan, sibling — same normalize.ts contract)", "19-06/19-07/19-08 (UI plans depend on NAME_MATCHING_SHIPS for D-16's no-mark behavior)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-not-reuse module boundary (D-20): normalize.ts duplicates the small COMBINING_DIACRITIC_RE constant rather than importing anything from codeweavers/utils.ts, keeping the matching key and the URL slug provably unable to drift into each other"
    - "meta/ CI-script convention extended to a self-contained live-data harness: fetches its own dump via built-in fetch() (not axiosClient, which is Electron-coupled), computes the store_cache directory the same way Electron's userData path resolves rather than hardcoding an absolute path"
    - "Three-sample measurement structure with separate denominators, never pooled: ground-truth (statistical), real-library (qualitative-only), synthetic (pass/fail per failure mode) plus a whole-dump self-collision proxy"

key-files:
  created:
    - src/backend/crossover_index/normalize.ts
    - src/backend/crossover_index/__tests__/normalize.test.ts
    - meta/measureCrossoverMatching.ts
    - .planning/phases/19-crossover-compatibility-index-macos/measure-crossover-match-2026-07-13.md
  modified: []

key-decisions:
  - "D-02 gate measured live against the real CodeWeavers dump (not simulated): candidate C (punctuation + edition-suffix stripped) wins with wrongHitRate 0.81% (1/123) and hitRate 85.37% (105/123), comfortably inside WRONG_HIT_MAX=0.02 / HIT_RATE_MIN=0.30 — closely reproducing 19-RESEARCH.md's feasibility preview (95/99/104-ish hit counts, near-zero wrong hits)"
  - "NAME_MATCHING_SHIPS flipped false -> true, transcribed from the recorded report with an auditable comment citing the exact filename and numbers"
  - "Matching key does NOT convert roman numerals to arabic (or vice versa) — none of the three candidates do this, mirroring D-20's own finding that CodeWeavers' canonical names and Steam's store titles already agree on official branding, so conversion would pull matching strings apart rather than uniting them"
  - "Non-Steam DLC/addon filtering uses the A4 fallback heuristic (title is a prefix-extension of another owned title) — approximate by design since this sample is qualitative-only (n=15, ~5 base games) and never gate-scored"
  - "Winner-selection rule for normalize.ts's shipped normalize(): highest hitRate among candidates that pass the D-02 gate on the ground-truth set (all three candidates passed; C had the best hit rate)"

patterns-established:
  - "D-20 sibling-module separation: any future matching-key experiment must duplicate small shape-only helpers (like COMBINING_DIACRITIC_RE) rather than import from codeweavers/utils.ts"
  - "Store-cache path resolution without Electron: replicate Electron's userData default (platform-specific productName folder) via os.homedir()/process.platform rather than invoking the electron module or hardcoding an absolute path, for any future CI/meta script that needs to read on-disk app caches"

requirements-completed: [CXIDX-03, CXIDX-08]

# Metrics
duration: ~45min
completed: 2026-07-14
---

# Phase 19 Plan 02: CrossOver Matching-Key Measurement Harness Summary

**Live-measured D-02 verdict: PASS — candidate C (punctuation + edition-suffix stripped) scores 0.81% wrong hits / 85.37% hit rate on the real 123-pair Steam ground-truth set, so `NAME_MATCHING_SHIPS` ships `true` and non-Steam name matching is unlocked for plan 19-05.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2/2 completed
- **Files created:** 4 (normalize.ts, normalize.test.ts, measureCrossoverMatching.ts, dated report)

## Accomplishments

- Built `src/backend/crossover_index/normalize.ts`: the CrossOver matching key, structurally distinct from `slugify()`/`baseSlugify()` (D-20 — zero import from `codeweavers/utils.ts`, verified by grep), exporting three named candidate variants (`normalizeExactLowercase`, `normalizePunctuationStripped`, `normalizePunctuationAndEditionStripped`) plus the winning `normalize()` and the machine-readable `NAME_MATCHING_SHIPS` gate verdict.
- Built `meta/measureCrossoverMatching.ts`: a self-contained, re-runnable harness (no dependency on the sibling builder plan 19-01) that fetches the live `.tie.gz` dump, parses it (raised entity limits, the real `c4p > applications > app[]` shape, medal-rule extraction), and scores three separately-denominated samples plus a whole-dump self-collision proxy.
- **Actually ran the harness against live data** (the real CodeWeavers dump + this machine's real Steam/Epic/GOG/Nile library caches) rather than stopping at a design — reproduced 19-RESEARCH.md's preview numbers almost exactly (2,866 Mac-medal records, 123 ground-truth pairs, near-identical hit/wrong counts per candidate) and got a genuine, current PASS verdict on the pre-committed D-02 gate.
- Transcribed the live PASS verdict into `NAME_MATCHING_SHIPS = true`, with an auditable code comment citing the exact report filename and numbers, unblocking plan 19-05's non-Steam name-matching path.
- Wrote the permanent adversarial regression suite (`normalize.test.ts`, 10 tests) covering U+2019 apostrophe equivalence, the verbatim roman-numeral policy, edition-suffix stripping, duplicate-record collapse, and the `[a-z0-9-]`-only output guarantee.

## Task Commits

Each task was committed atomically:

1. **Task 1: The matching normalizer + NAME_MATCHING_SHIPS verdict + adversarial regression suite** - `7c76dac4` (feat)
2. **Task 2: The measurement harness + pre-committed D-02 gate + dated report** - `19c6ce3e` (feat) — this commit also updates `normalize.ts`'s `NAME_MATCHING_SHIPS` from the recorded harness verdict, per the plan's explicit instruction that the executor transcribes the report's PASS/FAIL into Task 1's file after Task 2 runs.

## Files Created/Modified

- `src/backend/crossover_index/normalize.ts` - the matching key (`normalize()`), its three candidate variants, and `NAME_MATCHING_SHIPS` (now `true`)
- `src/backend/crossover_index/__tests__/normalize.test.ts` - 10-test permanent adversarial regression suite
- `meta/measureCrossoverMatching.ts` - the measurement harness (688 lines: dump fetch/parse, D-04-style dedup indices, three-sample scoring, self-collision test, Markdown report writer)
- `.planning/phases/19-crossover-compatibility-index-macos/measure-crossover-match-2026-07-13.md` - the committed, auditable measurement report (aggregate counts + synthetic cases only, no owned-title list). NOTE: the initially-committed revision (commit `19c6ce3e`) DID list the 15 Sample 2 titles by name — this was a defect flagged by 19-VERIFICATION and redacted to aggregate-only counts in a follow-up commit; the names remain in that historical commit until history is rewritten before any public-fork push.

## Decisions Made

- The winning matching key is candidate C (punctuation + edition-suffix stripped), selected by the harness as the highest-hit-rate candidate among those passing the D-02 gate — all three candidates passed the gate on the live ground-truth set (A: 77.24%/0.00% wrong, B: 80.49%/0.00% wrong, C: 85.37%/0.81% wrong), so the tie-break criterion (highest hit rate) picked C.
- Roman-vs-arabic numerals are kept verbatim by every candidate (no conversion knob was implemented for matching, mirroring D-20's slug-side finding that conversion would separate already-agreeing titles).
- The self-collision test on the live dump found candidate C introduces 15 disagreeing keys / 46 records at risk (1.61% of the 2,866 Mac-medal records) versus 0 for A and B — this is the documented, accepted trade-off the D-02 gate was written to adjudicate (harm is bounded and the gate still passes on the ground-truth set, which is the actual promotion criterion).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected a false-positive in the plan's own D-20 grep verification pattern**
- **Found during:** Task 1, running the plan's `<verify>` grep checks
- **Issue:** `grep -q "from.*codeweavers/utils"` matched a doc-comment sentence ("... `baseSlugify` from `codeweavers/utils.ts` here.") even though `normalize.ts` has zero actual import statements referencing the sibling module — a false positive that would make the D-20 separation check fail even on a fully compliant file.
- **Fix:** Reworded the doc comment to avoid the literal substring "from ... codeweavers/utils" while keeping the same warning intact (now phrased as "must NOT have any import statement naming ... or the sibling module's path").
- **Files modified:** `src/backend/crossover_index/normalize.ts`
- **Verification:** `grep -q "from.*codeweavers/utils" normalize.ts` now correctly reports no match; `grep -q "slugify\|baseSlugify\|codeweavers/utils"` still finds the (intentional, non-import) doc-comment references for a human reader.
- **Committed in:** `7c76dac4` (Task 1 commit)

### Non-blocking note (not auto-fixed, documented only)

- The plan's Task 1 acceptance criterion literally specifies `pnpm test -- --testPathPattern=crossover_index/normalize`. Because the test file lives at `src/backend/crossover_index/__tests__/normalize.test.ts` (the `__tests__` subfolder convention this same plan's `<read_first>` cites as precedent), that literal pattern does not match as a contiguous substring — Jest's `testPathPathPattern` requires `crossover_index/normalize` to appear adjacently in the path, but the actual path has `__tests__` in between. Verified equivalently with `--testPathPattern="crossover_index.*normalize"` (10/10 tests pass) and with `--testPathPattern=normalize`/`--testPathPattern=crossover_index` (both also match). This is a plan-authoring quirk, not an app defect — no code change was made; flagging so a future plan-checker pass can adjust the stated command syntax across this phase.

**Total deviations:** 1 auto-fixed (doc-comment false-positive in a grep verify check), 1 non-blocking note (plan verify-command syntax quirk).
**Impact on plan:** Neither affects shipped behavior — both are documentation/verification-tooling corrections, not code changes to app logic.

## Issues Encountered

None — the harness ran successfully on the first live attempt (network access + real Steam/Epic/GOG/Nile library caches were both available in this environment), reproducing 19-RESEARCH.md's feasibility preview almost exactly (2,866 Mac-medal records, 123 ground-truth pairs, near-identical per-candidate hit/wrong counts), which cross-validates both this measurement and the prior research session.

## Next Phase Readiness

- `NAME_MATCHING_SHIPS = true` is ready for plan 19-05's runtime lookup to import and conditionally enable non-Steam byName matching.
- `normalize()` is ready for plan 19-01's index builder (or any other consumer) to import for name-key construction — it is the single source of truth for the matching key, distinct from `slugify()`.
- The dated report (`measure-crossover-match-2026-07-13.md`) is committed as the permanent audit trail for this D-02 decision; a future re-run (e.g. after a larger post-19-01 library) would produce a new dated report rather than overwriting this one.

## Self-Check: PASSED

- FOUND: `src/backend/crossover_index/normalize.ts`
- FOUND: `src/backend/crossover_index/__tests__/normalize.test.ts`
- FOUND: `meta/measureCrossoverMatching.ts`
- FOUND: `.planning/phases/19-crossover-compatibility-index-macos/measure-crossover-match-2026-07-13.md`
- FOUND commit `7c76dac4` in `git log --oneline --all`
- FOUND commit `19c6ce3e` in `git log --oneline --all`

---
*Phase: 19-crossover-compatibility-index-macos*
*Completed: 2026-07-14*
