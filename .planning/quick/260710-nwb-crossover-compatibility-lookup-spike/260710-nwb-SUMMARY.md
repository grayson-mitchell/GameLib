---
phase: quick-260710-nwb
plan: 01
subsystem: testing
tags: [spike, crossover, codeweavers, feasibility, throwaway]

# Dependency graph
requires: []
provides:
  - Measured slug-match rate (66.7% naive, ~83.3% with two documented slugify fixes) for CrossOver compatibility lookup by kebab-case slug against codeweavers.com/compatibility/crossover/{slug}
  - Corrected protocol understanding: misses are HTTP 200 soft-404s (title "404 Not Found | CodeWeavers"), never a real HTTP 404 status
  - GO recommendation (conditional) for a future backend service + compatibility pill feature
affects: [future CrossOver/Wine compatibility backend + UI pill work]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: [spike/crossover-compat-lookup.mjs, spike/crossover-compat-FINDINGS.md]
  modified: []

key-decisions:
  - "Hit/miss detection must be content-based (soft-404 title marker vs. VideoGame JSON-LD presence), never HTTP-status-based — the site always returns 200"
  - "GO recommendation for backend + pill, conditional on content-based detection and two slugify fixes (apostrophe-drop, roman-numeral-to-digit normalization)"

patterns-established: []

requirements-completed: [SPIKE-CROSSOVER-COMPAT]

# Metrics
duration: 6min
completed: 2026-07-10
---

# Quick Task 260710-nwb: CrossOver Compatibility Lookup Spike Summary

**Measured live match rate of 66.7% (8/12) for CrossOver's kebab-case slug lookup, and discovered the site never returns a real HTTP 404 — misses are soft-404s (HTTP 200 + "404 Not Found" title) that a naive status-code check would misclassify as hits.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-10T05:14:11Z
- **Completed:** 2026-07-10T05:19:45Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both new, both under `spike/`)

## Accomplishments

- Built and ran a standalone throwaway Node ESM script (`spike/crossover-compat-lookup.mjs`) against the live codeweavers.com site with a 12-title representative sample, sequential requests, desktop Chrome UA, and a polite 1.5s inter-request delay.
- Discovered and fixed a critical protocol misunderstanding baked into the plan's pre-dispatch notes: the site returns HTTP 200 for both hits and misses. Misses are soft-404 pages (`<title>404 Not Found | CodeWeavers</title>`) with no `VideoGame` JSON-LD node — status-code-only detection would have silently reported a false 100% match rate.
- Measured a real 66.7% (8/12) match rate with the naive slugifier, and manually root-caused the four misses via `curl`: two are fixable slugify bugs (apostrophe → hyphen instead of drop; roman numeral "II" not converted to digit "2"), one is a genuine catalog miss (Pokémon — no single canonical PC release), one is the deliberately-invalid oddball (correctly missed).
- Delivered a GO recommendation (conditional on the two slugify fixes + content-based detection) for a future backend service + compatibility pill.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the CrossOver compatibility lookup spike script** - `c0fa3576` (feat)
2. **Task 2: Run the spike and record findings + go/no-go** - `90a43ad9` (docs)

## Files Created/Modified

- `spike/crossover-compat-lookup.mjs` - Throwaway Node ESM spike script: slugify() with 3 known-good self-checks, sequential Chrome-UA fetch loop with 1.5s delay, content-based (not status-based) hit/miss detection via soft-404 title marker, JSON-LD VideoGame extraction, per-title table + match-rate summary
- `spike/crossover-compat-FINDINGS.md` - Findings note: sample titles/slugs, captured per-title results, measured match rate, root-caused failure modes, GO/NO-GO recommendation

## Decisions Made

- **Content-based hit/miss detection is mandatory, not optional.** The plan's pre-dispatch "VERIFIED FACTS" stated "a miss returns HTTP 404" — this was empirically false on the live site (confirmed via `curl` header inspection: hit and miss responses are HTTP 200 with structurally identical headers, differing only in body content). Any future backend implementation must check for the soft-404 title marker or absence of a VideoGame JSON-LD node, not `response.status`.
- **GO recommendation is conditional**, not unconditional: content-based detection (above) plus two slugify fixes (drop apostrophes instead of hyphenating; normalize roman numerals to Arabic digits) before building the backend service + pill. With those fixes, the estimated match rate on this sample rises from 66.7% to 83.3%.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected hit/miss detection from HTTP-status-based to content-based**
- **Found during:** Task 1, first live run of the script — every title including a deliberately-invalid oddball ("Definitely Not A Real Game 9000") returned HTTP 200 "HIT", which was immediately suspicious.
- **Issue:** The plan's pre-dispatch VERIFIED FACTS stated misses return HTTP 404. The initial script implementation trusted this and treated `status === 200` as an unconditional hit. Live verification (`curl -sI`) proved the site returns HTTP 200 for both real hits and misses, with misses being soft-404 pages (title "404 Not Found | CodeWeavers", no VideoGame JSON-LD).
- **Fix:** Added an `isSoft404(html)` content check (regex against `<title>404 Not Found`) that runs before JSON-LD extraction. A 200 response is now classified HIT only if a `VideoGame` JSON-LD node with the expected shape is found, and MISS if the soft-404 marker is present. A third "ambiguous" bucket (200, no soft-404 marker, no parseable VideoGame node) is tracked separately and excluded from the clean hit/miss count, flagged in the summary output for manual review.
- **Files modified:** `spike/crossover-compat-lookup.mjs`
- **Verification:** Re-ran the corrected script live; the oddball title now correctly reports MISS, and the overall match rate changed from a false 100% (12/12) to a real 66.7% (8/12), which matches manual `curl` spot-checks of individual slugs.
- **Committed in:** `c0fa3576` (Task 1 commit — the fix was made before the initial commit, so the committed script already reflects the corrected logic)

---

**Total deviations:** 1 auto-fixed (1 bug fix, Rule 1)
**Impact on plan:** Essential correctness fix — without it, the spike would have reported a fabricated 100% match rate and greenlit a backend feature built on a broken hit-detection assumption. No scope creep; the fix stayed within Task 1's file (`spike/crossover-compat-lookup.mjs`).

## Issues Encountered

None beyond the deviation documented above. Live network access to codeweavers.com was available in this environment; the script ran to completion against the real site (no offline fallback needed).

## User Setup Required

None - no external service configuration required. This is a throwaway spike; no application code or config was touched.

## Next Phase Readiness

- Findings are in place for a future planning session to scope a real backend service + compatibility pill (GO, conditional on the two documented fixes).
- `spike/crossover-compat-lookup.mjs` and `spike/crossover-compat-FINDINGS.md` are throwaway and can be deleted once a real implementation exists incorporating the content-based detection and slugify fixes.
- `src/` was not touched by this task.

---
*Phase: quick-260710-nwb*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: spike/crossover-compat-lookup.mjs
- FOUND: spike/crossover-compat-FINDINGS.md
- FOUND: c0fa3576 (Task 1 commit)
- FOUND: 90a43ad9 (Task 2 commit)
