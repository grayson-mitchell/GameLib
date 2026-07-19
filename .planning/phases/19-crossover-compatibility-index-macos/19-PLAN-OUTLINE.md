# Phase 19 — Plan Outline (manifest)

**Phase:** 19 — crossover-compatibility-index-macos
**Milestone:** v0.5 (Steam macOS Compatibility)
**Mode:** standard · **Generated:** 2026-07-14 (outline-only chunked run)

> This is the outline manifest. One single-plan Task will be spawned per row below to write
> each `19-NN-PLAN.md`. Requirement IDs (`CXIDX-01..13`) were minted into
> `.planning/REQUIREMENTS.md` in the same run and every locked decision D-01..D-20 is traceable
> to at least one requirement.

## Wave rationale

- **Wave 1 (parallel, disjoint files):** the CI index **builder** (`meta/`), the **measurement
  harness + D-02 gate + matching normalizer**, and the **app-side fetch/TTL/schema-validate/
  keep-last-good cache scaffold** are mutually independent and land first. The measurement's
  pre-committed gate lands here so its verdict (does non-Steam name matching ship?) is settled
  before any UI is written.
- **Wave 2:** index **publishing workflow + bundled-snapshot delivery** (depends on the builder),
  and the **`isMac`-gated index-first lookup + `slugify()` D-20 fix** (depends on the cache
  scaffold + the normalizer).
- **Wave 3:** the **bulk index IPC + zustand slice** that resolves title→rating in the backend
  and hands the grid a three-state map (depends on the lookup landing).
- **Wave 4:** the **grid medal badge / unknown mark** and the **rating filter / install-modal
  warning** (both depend on the zustand slice; disjoint files → parallel).

## Plans

| Plan ID | Objective | Wave | Depends On | Requirements |
|---------|-----------|------|-----------|-------------|
| 19-01 | CI index **builder script** (`meta/buildCrossoverIndex.ts`, `package.json` scripts): fetch+gunzip the `.tie` dump, parse with raised entity limits (T-01) against the real `c4p>applications>app[]`/`<appprofile>` shape (T-02), filter to Mac-medal Games (~2,866), apply the medal rule, dedup by the total 3-key order (cxversion▼, num▼, appid▲ — Pitfall 5), emit `crossover-index.json.gz` + `collisions.json` (log-not-fail, D-05), fail only on zero records | 1 | none | CXIDX-01 |
| 19-02 | **Measurement harness + D-02 gate + matching normalizer** (`meta/measureCrossoverMatching.ts`, `src/backend/crossover_index/normalize.ts` + its adversarial-set regression test): score candidate normalizers on the 123-pair Steam AppID ground-truth set, the synthetic hard-case set, and a whole-dump self-collision test (scored separately), evaluate the pre-committed `<2%` wrong / `>30%` hit gate, write a dated auditable report; the winning normalizer becomes `normalize.ts`, kept distinct from `slugify()` | 1 | none | CXIDX-03, CXIDX-08 |
| 19-03 | **App-side cache scaffold — the D-19 seam** (`src/backend/crossover_index/{schema.ts,electronStore.ts,fetcher.ts}` + tests): zod schema (D-09), `CacheStore` with `invalidateCheck:()=>false` for 24h TTL keep-last-good (D-08), and the generic `loadIndex<T>(IndexDescriptor)` fetch→gunzip→`safeParse`→fallback-to-bundled layer reading the bundled snapshot via `publicDir` (tolerating absence) | 1 | none | CXIDX-04, CXIDX-05 |
| 19-04 | **Publishing workflow + bundled-snapshot delivery** (`.github/workflows/build-crossover-index.yml`, `.gitignore`, `draft-release-mac.yml`/`build-base.yml` snapshot-fetch step): daily `schedule`+`workflow_dispatch` Action that runs the builder and `gh release`-publishes to the non-`v*` `crossover-index` rolling tag with `--latest=false --clobber` (T-04); gitignore the snapshot; **human "enable workflow on fork" checkpoint** (T-03) → non-autonomous | 2 | 19-01 | CXIDX-02, CXIDX-04 |
| 19-05 | **`isMac`-gated index-first lookup + D-20 `slugify()` fix** (`src/backend/crossover_index/index.ts`, `wiki_game_info/wiki_game_info.ts`, `wiki_game_info/codeweavers/utils.ts` + lookup test): index-first on macOS returning `CodeweaversInfo` (D-11/D-12), Linux scrape untouched (D-10/D-14), miss→lazy scrape + `staleCrossoverData` self-heal for cached Phase-16 misses (D-13); delete the roman→arabic conversion, keep the apostrophe drop | 2 | 19-02, 19-03 | CXIDX-06, CXIDX-07, CXIDX-08 |
| 19-06 | **Bulk index IPC + zustand slice** (`crossover_index/ipc_handler.ts`, `backend/main.ts`, `common/types/ipc.ts`, `frontend/state/GlobalStateV2.ts`, `frontend/state/GlobalState.tsx`): backend resolves each library title→rating and ships a three-state map over a `getCrossoverIndex` pull + `crossoverIndexChanged` push pair into a `crossoverRatings` slice, so the grid reads synchronously and never triggers a scrape (D-11/D-13/D-16) | 3 | 19-05 | CXIDX-09 |
| 19-07 | **Grid medal badge + "unknown" mark** (`frontend/screens/Library/components/GameCard/index.tsx` + `.css`): colored medal dot with full `aria-label`, tier derived from the rating number in the UI (5→gold…≤2→red), neutral mark only for looked-up-but-absent, **no element** when not looked up (D-15/D-16), following the `gameCardDelistedBadge`/`MacArchBadge` precedent | 4 | 19-06 | CXIDX-10, CXIDX-11 |
| 19-08 | **Rating filter + install-modal warning** (`frontend/components/UI/LibraryFilters/index.tsx`, `frontend/screens/Library/index.tsx`, `frontend/types.ts`, `.../InstallModal/WineSelector/index.tsx`): macOS-only multi-select opt-out `{gold,silver,bronze,wontRun,unrated}` filter (no sort, D-17) plus a non-blocking `.infoBox` `knownnottowork` warning on the CrossOver-bottle install path that never gates Install (D-18) | 4 | 19-06 | CXIDX-12, CXIDX-13 |

**Plans:** 8 · **Waves:** 4

## Coverage audit (source → plan)

- **GOAL** (library-wide offline CrossOver badge + filter, dump-first on macOS): 19-01/19-03/19-05/19-06/19-07/19-08.
- **REQ** (CXIDX-01..13, minted this run): every ID appears in ≥1 plan (see column above).
- **CONTEXT** (D-01..D-20): D-01/D-02/D-03→19-02; D-04/D-05→19-01; D-06→19-04(+19-01 tag); D-07→19-03/19-04; D-08/D-09/D-19→19-03; D-10/D-11/D-12/D-14→19-05(+19-06/19-07 for D-11/D-12 UI half); D-13→19-05/19-06/19-07; D-15/D-16→19-07; D-17→19-08; D-18→19-08; D-20→19-02/19-05. All 20 covered.
- **TRAPS** (T-01..T-05): T-01/T-02→19-01; T-03/T-04→19-04; T-05 (pnpm not npm)→cross-cutting, honored in every `meta/`/workflow plan.
- **RESEARCH out-of-scope / DEFERRED** (Linux badges, mac-arch override list, bottle-template data, Linux-fetch cleanup per D-14): correctly excluded — not gaps.
