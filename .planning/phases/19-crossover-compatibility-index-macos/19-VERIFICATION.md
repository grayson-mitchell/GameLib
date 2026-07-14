---
phase: 19-crossover-compatibility-index-macos
verified: 2026-07-14T02:41:25Z
status: gaps_found
score: 12/13 must-haves verified (1 gap, 2 human-verification items)
overrides_applied: 0
gaps:
  - truth: "The committed measurement report carries aggregate counts + the synthetic cases only — never a full dump of the user's owned titles (19-02-PLAN.md must_have; RESEARCH.md privacy note)"
    status: failed
    reason: "The committed, git-tracked report `.planning/phases/19-crossover-compatibility-index-macos/measure-crossover-match-2026-07-13.md` includes a 'Sample 2' table that lists all 15 of the real non-Steam library's titles by exact name (ARK: Survival Evolved, The Outer Worlds, Phoenix Point + 7 named DLC/addon titles, SOMA, etc.) — this IS the full non-Steam owned-title list the must_have explicitly forbids. The report's own trailing 'Privacy note' claims the table 'is limited to the ~5 real non-Steam base games after DLC/add-on filtering, not the whole library' — that claim is false; all 15 rows (base games AND the excluded DLC/addon rows) are printed verbatim. 19-02-SUMMARY.md repeats the same false claim ('no owned-title list'). GameLib is a public fork (CLAUDE.md); this file is already committed (`19c6ce3e`) on a branch intended to be pushed to the public fork remote."
    artifacts:
      - path: ".planning/phases/19-crossover-compatibility-index-macos/measure-crossover-match-2026-07-13.md"
        issue: "Sample 2 section (lines 24-42) names every real owned non-Steam title instead of reporting only aggregate hit/miss/wrong counts"
    missing:
      - "Redact Sample 2 to aggregate-only (e.g. 'n=15, X base games, Y hits, Z misses, W DLC/addon rows excluded') with no per-title names, matching the must_have and the report's own privacy-note claim"
      - "Correct or remove 19-02-SUMMARY.md's 'no owned-title list' claim once the report is fixed"
human_verification:
  - test: "Enable the 'Build CrossOver compatibility index' GitHub Action on the fork (Actions tab → 'Enable workflow') and run it once manually via workflow_dispatch, per 19-04-PLAN.md's checkpoint:human-action"
    expected: "The Action runs, creates/updates the non-`v*` `crossover-index` rolling release with `crossover-index.json.gz` + `collisions.json` attached, and does not appear as the repo's 'latest' release"
    why_human: "GitHub disables scheduled workflows on forks by default (T-03) and no CLI token available to an agent can toggle repo Actions settings or a first workflow_dispatch run reliably — this is an explicitly deferred human action, not a code gap. The code (.github/workflows/build-crossover-index.yml, build-base.yml's/draft-release-mac.yml's `gh release download` steps) is present and reviewed as correct; the app's bundled-snapshot + keep-last-good fallback (D-07/D-09, verified in fetcher.ts) means badges/filtering work today even before this Action is live."
  - test: "Add a game to the macOS library mid-session (e.g. a new Steam purchase appearing via background metadata sync, or click 'Refresh Library') and confirm its CrossOver badge/filter membership appears without an app restart"
    expected: "The new game's grid tile shows a medal/unknown badge (or correctly no badge if ineligible) and it is included in the CrossOver rating filter's correct bucket, per the WR-05 fix (`main.ts` now re-invokes `refreshCrossoverRatingMap()` from the `refreshLibrary` handler)"
    why_human: "19-REVIEW.md's own WR-05 resolution note flags this as needing manual/live verification — there is no existing `main.ts` test harness to exercise the `refreshLibrary` IPC handler's fire-and-forget call, so this can only be confirmed by running the packaged app."
---

# Phase 19: CrossOver Compatibility Index (macOS) Verification Report

**Phase Goal:** Every game in the library carries a CrossOver medal badge and can be filtered by it, served offline from a small CI-built index of CodeWeavers' daily dump — instead of the per-game live HTML scrape, which cannot populate a whole library and guesses its URL from the store's title.
**Verified:** 2026-07-14T02:41:25Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (by requirement)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CXIDX-01: CI builder parses the `.tie` dump, filters to Mac-medal Games, dedups by a total 3-key order, emits gzipped JSON + collision report, fails only on zero-record extraction | VERIFIED | `meta/buildCrossoverIndex.ts`: `ProcessEntitiesOptions` raises entity limits (T-01, lines 136-139); `winner()` comparator implements the exact 3-key order — `compareVersion(cxversion) \|\| num desc \|\| appid asc` (lines 233-238); `assertNonEmpty()` is the only throw path in `main()`, collisions are logged and never fail the build (lines 297-330). 10/10 `meta/__tests__/buildCrossoverIndex.test.ts` tests pass. `pnpm tsc --noEmit` clean. |
| 2 | CXIDX-02: Daily + manual-dispatch Action publishes to a non-`v*` rolling release tag with `--latest=false`, `generatedAt` staleness signal | VERIFIED (code) / HUMAN ACTION PENDING (runtime enablement) | `.github/workflows/build-crossover-index.yml` has both `schedule` and `workflow_dispatch` triggers, tag `crossover-index` (not `v*`), `--latest=false` on creation, `--clobber` on upload (T-04 satisfied). `IndexPayload.generatedAt` present in `meta/buildCrossoverIndex.ts` payload. Committed at `35027263`. **The workflow has not yet been enabled/run on the fork** — this is the plan's own documented `checkpoint:human-action`, moved to human_verification, not treated as a code gap. |
| 3 | CXIDX-03: Measurement harness scores 3 separately-denominated samples against a pre-committed D-02 gate, produces an auditable report | PARTIALLY VERIFIED — 1 must-have FAILED | Harness (`meta/measureCrossoverMatching.ts`) and gate logic verified: `WRONG_HIT_MAX=0.02`, `HIT_RATE_MIN=0.3` printed verbatim, evaluated only on the 123-pair ground-truth sample, 3 samples reported separately, `NAME_MATCHING_SHIPS = true` matches the recorded verdict. **However** the committed report violates its own must_have — see Gap 1 below. |
| 4 | CXIDX-04: Bundled index snapshot via `publicDir`, tolerates absence, gitignored, fetched into `public/` pre-package | VERIFIED | `fetcher.ts` `loadBundledSnapshot()` reads via `publicDir` + `readFileSync`, catches ENOENT as normal cold start (no `app.isPackaged`/`extraResources` branch). `.gitignore:30` has `public/crossover-index.json.gz`. `build-base.yml`/`draft-release-mac.yml` both run `gh release download crossover-index --pattern crossover-index.json.gz --dir public --clobber \|\| echo "No published index yet..."` before packaging. |
| 5 | CXIDX-05: fetch → TTL → schema-validate → keep-last-good layer, parameterized by `IndexDescriptor`, 24h TTL, zod validation, rejection keeps last good | VERIFIED | `fetcher.ts` `loadIndex<T>()`: TTL check (`ttlMinutes`), `schema.safeParse`, on rejection or network error returns `cached?.data ?? persistBundledFallback(desc)` — never throws further. `electronStore.ts` uses `invalidateCheck: () => false` (TTL governs refetch, not eviction). `crossoverIndexSchema` (zod) validated in `schema.test.ts`. 12/12 `fetcher.test.ts` tests pass including the WR-01 self-heal regression. |
| 6 | CXIDX-06: index-first on macOS, single source for grid+details, Linux scrape untouched | VERIFIED | `wiki_game_info.ts:73-76`: `isMac ? (await getCodeweaversFromIndex(gameInfo)) ?? getInfoFromCodeweavers(title) : isLinux ? getInfoFromCodeweavers(title) : null`. `getCodeweaversFromIndex` returns unchanged `CodeweaversInfo` shape (`index.ts:114-118`). |
| 7 | CXIDX-07: index miss → no grid badge but lazy scrape still runs; stale Phase-16 "none found" self-heals | VERIFIED | `wiki_game_info.ts:50-56` `staleCrossoverData` check calls `crossoverIndexHas(gameInfo)` when `macRating === null`, forcing a refresh. `crossoverIndexHas` reads the same resolution as the primary path (`index.ts:137-147`), and (post WR-01 fix) is populated even when only the bundled snapshot is available (`fetcher.ts:87-96`, tested at `fetcher.test.ts:202+`). |
| 8 | CXIDX-08: `slugify()` keeps apostrophe drop, drops roman-numeral conversion; matching key lives in its own `normalize.ts` | VERIFIED | `codeweavers/utils.ts:47-50` `slugify()` strips apostrophes then calls `baseSlugify` (no roman-numeral logic exists in `baseSlugify`, confirmed by doc comment + absence of any ROMAN_RE). `normalize.ts` has zero import statements (confirmed via grep) — structurally cannot import `slugify`/`naiveSlugify` (D-20 separation). |
| 9 | CXIDX-09: three-state map (`rating`/`null`/key-absent) shipped over one bulk IPC pull+push into a zustand slice; grid reads synchronously, never triggers per-game work | VERIFIED | `ipc_handler.ts` `buildCrossoverRatingMap()` calls `isCrossoverIndexEligible()` FIRST (key-absent path) before consulting `getCodeweaversFromIndex` (null vs number). `GlobalStateV2`/`GlobalState.tsx` wire `getCrossoverIndex` pull + `crossoverIndexChanged` push into a zustand slice. All 6 `LibraryManager.getListOfGames()` implementations present (gog/nile/legendary/steam/sideload/zoom). `ratingMap.test.ts` passes. |
| 10 | CXIDX-10: colored medal glyph + accessible `aria-label`, tier derived from rating number in UI | VERIFIED | `CrossoverBadge.tsx`: tier derivation `rating>=5→gold, ===4→silver, ===3→bronze, else→wontRun` computed client-side; `aria-label`/`title` set from the derived label; `CrossoverBadge.test.tsx` passes (7 tests). Wired into `GameCard/index.tsx:519` reading `crossoverRatings[appName]`. |
| 11 | CXIDX-11: neutral "unknown" mark shown ONLY on looked-up-and-absent games, never on un-looked-up games | VERIFIED | `CrossoverBadge.tsx:28-30`: `rating === undefined → return null` (no element); `rating === null → tier = 'unknown'`. Matches D-16 exactly. |
| 12 | CXIDX-12: macOS-only, multi-select, opt-out, default-all-true CrossOver rating filter, filter-only | VERIFIED | `LibraryFilters/index.tsx:268-276` renders the 5 toggles only inside `platform === 'darwin' && (...)`; `LibraryContext.tsx`/`Library/index.tsx` apply `crossoverRatingFilters[crossoverRatingTier(rating)]` in the display-filter chain (`index.tsx:646-648`). No sort control added. |
| 13 | CXIDX-13: non-blocking `knownnottowork` install-modal warning, never gates Install | VERIFIED | `WineSelector/index.tsx:128-129` `isKnownNotToWork = typeof crossoverRating === 'number' && crossoverRating <= 2`; warning `<div className="infoBox">` renders independently; `disabled` props on Install-path controls (lines 147/156/164) reference only `useSharedPrefix`/`wineVersionList.length`, never `isKnownNotToWork`. |

**Score:** 12/13 truths fully verified, 1 explicit must-have FAILED (CXIDX-03's privacy constraint), 2 items routed to human verification (1 of which — the GitHub Action enablement — is a known, intentionally-deferred human action per the phase's own plan, not a code defect).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `meta/buildCrossoverIndex.ts` | CI index builder | VERIFIED | Exists, substantive, tested (10/10), tsc clean |
| `meta/measureCrossoverMatching.ts` | Measurement harness | VERIFIED (harness itself) | Exists, substantive, produces correct gate evaluation |
| `.planning/phases/.../measure-crossover-match-2026-07-13.md` | Auditable dated report, aggregate-only | ⚠️ CONTENT GAP | Exists but violates its own must_have — see Gap 1 |
| `src/backend/crossover_index/normalize.ts` | Matching key, structurally separate from slugify | VERIFIED | Zero imports; `NAME_MATCHING_SHIPS = true` |
| `src/backend/crossover_index/schema.ts` | zod schema | VERIFIED | `schema.test.ts` passes |
| `src/backend/crossover_index/electronStore.ts` | keep-last-good store | VERIFIED | `invalidateCheck: () => false` confirmed |
| `src/backend/crossover_index/fetcher.ts` | fetch/TTL/validate/fallback | VERIFIED | WR-01, WR-04 fixes present and tested |
| `src/backend/crossover_index/index.ts` | index-first lookup + eligibility | VERIFIED | `getCodeweaversFromIndex`, `crossoverIndexHas`, `isCrossoverIndexEligible` all present |
| `src/backend/crossover_index/ipc_handler.ts` | bulk pull/push + rating map builder | VERIFIED | `ratingMap.test.ts` passes |
| `.github/workflows/build-crossover-index.yml` | daily+manual publish Action | VERIFIED (code) | Committed `35027263`; not yet enabled/run (human item) |
| `.github/workflows/build-base.yml`, `draft-release-mac.yml` | fetch bundled snapshot pre-package | VERIFIED | `gh release download` step present, non-fatal on absence |
| `src/frontend/screens/Library/components/GameCard/CrossoverBadge.tsx` | medal glyph component | VERIFIED | 7/7 tests pass, wired into `GameCard/index.tsx` |
| `src/frontend/components/UI/LibraryFilters/index.tsx` | rating filter UI | VERIFIED | `darwin`-gated, 5 toggles wired |
| `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx` | non-blocking warning | VERIFIED | Gated on rating ≤2, decoupled from `disabled` |

### Key Link Verification

Automated `gsd-sdk query verify.key-links` reported several `false`/error results across 19-02, 19-05, 19-07, 19-08. Each was manually re-verified by direct grep/read against source — all are tool false-negatives (regex-escaping issues with literal `[`/`(` in patterns, or "to" targets that are descriptions rather than file paths, or a "must NOT import" link the tool can't score as an absence check). None represent real wiring gaps:

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `wiki_game_info.ts` | `crossover_index/index.ts` | `isMac ? (await getCodeweaversFromIndex(...)) ?? getInfoFromCodeweavers(...)` | WIRED (manually confirmed) | Literal match at `wiki_game_info.ts:73-76`; tool reported a regex-pattern miss but the substring is present verbatim |
| `crossover_index/normalize.ts` | NOT `codeweavers/utils.ts` | must not import slugify | WIRED / absence confirmed | `grep "^import"` on `normalize.ts` returns zero results |
| `crossover_index/index.ts` | `crossover_index/fetcher.ts` | `loadIndex(crossoverIndexDescriptor)` | WIRED (manually confirmed) | Literal call present at `index.ts:103`; tool errored on regex escaping (`loadIndex\(`), not a real gap |
| `GameCard/index.tsx` | `crossoverRatings` slice | `crossoverRatings[appName]` | WIRED (manually confirmed) | Literal match at `GameCard/index.tsx:137` |
| `Library/index.tsx` | `crossoverRatings` slice | `crossoverRatings[game.app_name]` | WIRED (manually confirmed) | Literal match at `Library/index.tsx:646` |
| `main.ts` | `ipc_handler.buildCrossoverRatingMap` | startup + `refreshLibrary` re-invocation (WR-05 fix) | WIRED | `refreshCrossoverRatingMap()` called at both `app.whenReady()` (line 387) and end of `refreshLibrary` handler (line 1056) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `CrossoverBadge` (grid tile) | `crossoverRatings[appName]` | `buildCrossoverRatingMap()` → real per-manager `getListOfGames()` enumeration → `getCodeweaversFromIndex`/`isCrossoverIndexEligible` against the loaded index | Yes | FLOWING |
| `LibraryFilters` rating toggles | `crossoverRatingFilters` (localStorage-backed) × `crossoverRatings` | Same slice as above, applied in `Library/index.tsx`'s display-filter reduce | Yes | FLOWING |
| `WineSelector` install warning | `crossoverRatings[appName]` | Same slice | Yes | FLOWING |
| Index itself | `crossoverIndexStore` cache | `loadIndex()` → live GitHub Release fetch, falling back to bundled `public/crossover-index.json.gz` | Yes, once either the Action publishes or a bundled snapshot ships | FLOWING (fallback-dependent until the Action is enabled — see human_verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CXIDX-01 | 19-01 | CI build script | SATISFIED | See Truth 1 |
| CXIDX-02 | 19-04 | Daily publish Action | SATISFIED (code) / human enablement pending | See Truth 2 |
| CXIDX-03 | 19-02 | Measurement harness + gate | PARTIALLY SATISFIED — 1 must-have FAILED (privacy) | See Gap 1 |
| CXIDX-04 | 19-03/19-04 | Bundled snapshot | SATISFIED | See Truth 4 |
| CXIDX-05 | 19-03 | fetch/TTL/validate/fallback layer | SATISFIED | See Truth 5 |
| CXIDX-06 | 19-05 | index-first, Linux untouched | SATISFIED | See Truth 6 |
| CXIDX-07 | 19-05 | miss→no badge, self-heal | SATISFIED | See Truth 7 |
| CXIDX-08 | 19-02/19-05 | slugify fix + normalize.ts separation | SATISFIED | See Truth 8 |
| CXIDX-09 | 19-06 | three-state bulk IPC map | SATISFIED | See Truth 9 |
| CXIDX-10 | 19-07 | medal glyph | SATISFIED | See Truth 10 |
| CXIDX-11 | 19-07 | unknown mark honesty | SATISFIED | See Truth 11 |
| CXIDX-12 | 19-08 | rating filter | SATISFIED | See Truth 12 |
| CXIDX-13 | 19-08 | install warning | SATISFIED | See Truth 13 |

**Note on `.planning/REQUIREMENTS.md` traceability table (lines 234-246):** it currently shows CXIDX-01, 02, 03, 04, 05, 12, 13 as "Pending" and unchecked, while 06-11 are "Complete." This is stale documentation, not a reflection of actual code state — `git log` shows the table was last updated at the 19-07 commit (`7a6ac477`) and never updated again for 19-01/02/03/05/08, even though all of those plans have committed SUMMARY.md files and working code (confirmed above). Only CXIDX-02's *runtime enablement* (not its code) is genuinely incomplete. This checkbox staleness should be corrected but is a documentation debt, not a functional gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `measure-crossover-match-2026-07-13.md` | 24-42 | Full list of real owned non-Steam titles committed to a public-fork-bound git file, contradicting the file's own must_have and its own trailing "Privacy note" | 🛑 Blocker (this phase's own stated constraint) | See Gap 1 |
| `.gitignore` | — | `dist-index/` (CI builder's local output dir) not gitignored (IN-02, still open per 19-REVIEW.md) | ℹ️ Info | Cosmetic; contributors running the builder locally will see untracked build output in `git status` |
| `wiki_game_info.ts:67-79` | — | Inline `await` inside `Promise.all` array literal (IN-03, still open) | ℹ️ Info | Functionally correct per review, minor readability/concurrency-intent issue |
| `GameCard/index.css` | 115-131, 217-231 | `.gameCardCrossoverBadge` shares `z-index:3` with later-painted `.gameTitle` (IN-04, still open) | ℹ️ Info | Possible visual overlap of the medal dot under the hover-revealed title bar |
| `schema.ts` / `buildCrossoverIndex.ts` | — | `label` field emitted by builder, stripped by zod, never read (IN-01, still open) | ℹ️ Info | Dead weight, no functional impact |

No `TBD`/`FIXME`/`XXX` markers found in any phase-19 source file.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full phase-19 test suite | `npx jest crossover_index meta/__tests__ .../CrossoverBadge.test.tsx` | 7 suites, 67 tests passed | PASS |
| Type safety | `pnpm tsc --noEmit` | Clean, no errors | PASS |
| No debt markers | grep TBD/FIXME/XXX across all phase-19 files | None found | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` conventional probes exist for this phase, and no PLAN/SUMMARY declares one. SKIPPED (no runnable probes for this phase — verification instead used the phase's own Jest suite and tsc, see Behavioral Spot-Checks).

### Human Verification Required

### 1. Enable and first-run the CrossOver index publishing Action

**Test:** On GitHub, open the fork's Actions tab, enable "Build CrossOver compatibility index" (forks have scheduled workflows disabled by default), then trigger it once via `workflow_dispatch`.
**Expected:** The Action succeeds, publishes `crossover-index.json.gz` + `collisions.json` to the non-`v*` `crossover-index` rolling release (not marked "latest").
**Why human:** No agent-available CLI token can toggle a fork's Actions settings or perform the one-time manual enable click. This is explicitly called out as a `checkpoint:human-action` in 19-04-PLAN.md. The app already ships a bundled-snapshot + keep-last-good fallback (verified above), so badges/filtering function correctly regardless of whether this Action is live.

### 2. Confirm mid-session library additions pick up a CrossOver badge (WR-05 live check)

**Test:** With the app running, add a new game to the macOS library (Steam metadata sync or manual "Refresh Library"), then check its grid tile and the rating filter.
**Expected:** The new game shows its badge (or correctly no badge if genuinely ineligible) without an app restart.
**Why human:** 19-REVIEW.md itself flags this fix as needing live/manual verification — there's no `main.ts` test harness to exercise the `refreshLibrary` IPC handler's new fire-and-forget call.

### Gaps Summary

Twelve of thirteen CXIDX requirements are fully implemented, wired, and covered by passing automated tests — the core engineering (CI builder, measurement harness mechanics, fetch/TTL/validate/fallback layer, index-first lookup, three-state IPC pipeline, badge/filter/install-modal UI) is solid and matches the CONTEXT.md decisions (D-01 through D-20) closely, including all 5 warnings from the prior code review being genuinely fixed and tested (confirmed by direct code read, not just the review's own claim).

**The one real gap:** the committed measurement report (`measure-crossover-match-2026-07-13.md`, part of CXIDX-03) violates its own explicit must_have — "The committed report carries aggregate counts + the synthetic cases only — never a full dump of the user's owned titles." Sample 2 of the report lists all 15 real non-Steam library titles by name (base games and the "excluded" DLC/addon titles alike), and the report's own trailing privacy note falsely claims otherwise, as does 19-02-SUMMARY.md ("no owned-title list"). Since GameLib is a public fork (per CLAUDE.md) and this file is already committed to git, this is a real, user-identifiable data exposure that contradicts a decision explicitly recorded during planning (RESEARCH.md's privacy note) — not a cosmetic doc issue. Recommend redacting Sample 2 to aggregate counts only before this branch reaches the public fork remote.

The two human-verification items do not block the phase's technical completion: one (the GitHub Action's runtime enablement) is a pre-planned, explicitly-deferred human action with a working offline fallback already in place; the other (WR-05 live mid-session refresh) is a review-flagged manual-verification item on an already-fixed code path.

---

_Verified: 2026-07-14T02:41:25Z_
_Verifier: Claude (gsd-verifier)_

---

## Orchestrator Resolution (post-verification, 2026-07-14)

The single blocking gap (CXIDX-03 / T-19-02-03 — owned-title names in the
committed measurement report) has been REMEDIATED:
- Report output redacted to aggregate-only counts (commit `b2eeb6cb`).
- Harness code fixed so re-runs cannot re-leak (commit `31d684a1`).
- Git-history exposure accepted via the `.planning/`-excluded publication path
  (see 19-SECURITY.md "Orchestrator Resolution"; user decision 2026-07-14).

Remaining before formal phase closure — both are the pre-existing
human-verification items, NOT code gaps:
1. 19-04 `checkpoint:human-action` — enable + first-run the CrossOver index
   GitHub Action on the fork (user-deferred; offline fallback in place).
2. WR-05 live check — mid-session-added game picks up its badge after a
   library refresh.

On resume, once (1) is done, re-run `/gsd-verify-work 19` (or re-verify) to flip
status to passed, then `phase.complete`.
