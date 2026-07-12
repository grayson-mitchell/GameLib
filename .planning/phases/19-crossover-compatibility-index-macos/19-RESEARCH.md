# Phase 19: CrossOver Compatibility Index (macOS) - Research

**Researched:** 2026-07-12
**Domain:** Offline data-index pipeline (CI builder → GitHub Release → Electron fetch/cache → React grid)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Matching Scope (resolves Q1)**
- **D-01: Measure, then decide in-phase.** Phase 19 includes a measurement task that runs candidate normalizers against the 2,866 Mac-medal dump names and counts hits, misses, and — critically — **wrong hits**. The outcome selects between Steam-only badges and Steam + non-Steam name matching.
- **D-02: The promotion gate is pre-committed, before the measurement runs.** Non-Steam name matching ships in v1 **only if** wrong hits are **<2%** of claimed non-Steam titles **AND** the hit rate is **>30%** of them. If either bound fails, v1 ships **Steam-AppID-only badges** and name matching becomes a follow-up phase. *Steam AppID joins are exact and are NOT subject to this gate.*
- **D-03: The measurement sample is the real library plus a synthetic hard-case set.** The user's actual Epic/GOG/Amazon/Humble titles supply the realistic distribution; a hand-built adversarial set supplies the failure modes — edition suffixes, roman vs arabic numerals, apostrophe variants (`Baldur's` / `Baldurs` / U+2019), and the duplicate-`<app>`-record cases named in Q1.
- **D-04: Dedup rule — highest `cxversion`, then most ratings (`num`).** Required even for a Steam-only index. This tiebreak deliberately mirrors the verified medal rule, so the index applies one principle throughout.
- **D-05: Collisions log and resolve; they never fail the build.** CI picks a winner by D-04, emits the collision count as a build artifact so drift stays visible, and always publishes. A broken daily build must not be able to block anything.

**Index Delivery & Refresh**
- **D-06: Publish to a GitHub Release asset on a rolling tag.** Rationale is the upstream-mergeability constraint in CLAUDE.md — committing a daily-rebuilt artifact to `main` would add ~365 commits/year of churn to a tree that gets rebased on upstream.
- **D-07: Bundle a snapshot at build time; refresh in the background.** A copy of the index ships in the app bundle, so a fresh install badges immediately and works fully offline.
- **D-08: 24-hour TTL.** Matches the source's own daily cadence.
- **D-09: Schema-validate the fetched payload; on rejection, keep the last good index.** The index drives a user-facing claim ("this game won't run"), so a bad CI publish must not inject junk medals or brick the badges.

**Index vs the Existing Scrape Path (Phase 16)**
- **D-10: The index-first lookup is gated on `isMac`.** On Linux, `getInfoFromCodeweavers()` runs exactly as it does today — untouched. **This is a correctness requirement, not a preference:** the index carries no Linux ratings by construction. An ungated index-first lookup would return `linuxRating: null` on a Linux hit and cache it, silently regressing the Linux rating Phase 16 shipped.
- **D-11: On macOS, the index is the single source for both consumers.** `getInfoFromCodeweavers()` checks the index first and returns a `CodeweaversInfo` from it on hit, so the library grid and the game-details panel cannot disagree.
- **D-12: Derive the medal label from the rating number in the UI — no `CodeweaversInfo` type change.** Mapping is total: 5→gold, 4→silver, 3→bronze, ≤2→knownnottowork. The `un*` prefix distinction is knowingly discarded.
- **D-13: Index miss → no grid badge, but the scrape still runs lazily on a details-page visit.** The grid must **never** fire bulk scrapes to paint itself.
- **D-14: Phase 16's D-07 STANDS — the Linux fetch is NOT removed.** The ROADMAP's scope item 7 cleanup is explicitly **not delivered by this phase**; the smaller diff was preferred.

**Badge + Filter UX**
- **D-15: Colored medal glyph with an accessible label** on the grid tile — gold / silver / bronze / red, with full text in an `aria-label`. Follows the established `gameCardDelistedBadge` pattern.
- **D-16: A neutral "unknown" mark, shown ONLY on games actually looked up.** "Unknown" must mean *"we searched the index and it isn't there"* — never *"we didn't look."* If D-02's gate fails and v1 ships Steam-only, non-Steam tiles get **no mark at all**.
- **D-17: Filter only — no sort.** A rating filter alongside the existing library filters.
- **D-18: The install-modal warning warns but does not block.** The data is community-sourced and can be a false negative.

**Index Infrastructure Shape**
- **D-19: Build the fetch/TTL/schema-validate/keep-last-good layer parameterized by index identity** (name, URL, schema) rather than hardcoded to CrossOver. **Deliberately NOT a generic index framework:** no plugin registry, no pluggable-schema abstraction.

**Corrections to Prior Phase Decisions**
- **D-20: Phase 16's D-04 roman-numeral rule is REVERSED.** `slugify()` must **keep** the apostrophe drop (correct and load-bearing) and **delete** the roman→arabic conversion (wrong — every arabic form soft-404s; 172 games affected). **Keep the *slug* function distinct from the *matching* key (D-01/D-03).**

### Claude's Discretion
- Whether the index also carries the raw medal label alongside the rating number (D-12).
- Exact index JSON schema, file naming, and rolling-tag name (D-06).
- Where the index store lives and how it is loaded into the renderer (D-11).
- Precise visual treatment of the medal glyph and the "unknown" mark (D-15/D-16) — may be refined by `/gsd-ui-phase`.
- How the measurement task's findings are written up and where they land (D-01).

### Deferred Ideas (OUT OF SCOPE)
- **Crowd-sourced mac-arch override list** (`mac-arch-overrides.json`) — deferred because Phase 18 is still executing. D-19 keeps Phase 19's fetch layer parameterized so the follow-up adds it as a second index without rework.
- **The never-rendered Linux CrossOver fetch** — D-14 explicitly declines the cleanup.
- **Linux CrossOver badges** — Linux is better served by Proton.
- **The dump's `<bottletemplate>` / `<flag>` / `<installprofile>` data** — captured as a seed.
</user_constraints>

<phase_requirements>
## Phase Requirements

**None minted yet.** ROADMAP says "TBD (mint during /gsd-plan-phase 19)". The planner mints these from CONTEXT.md's decisions.

**Natural requirement groupings** (derived from the decision clusters, offered as a starting point):

| Group | Suggested ID prefix | Covers | Decisions |
|-------|--------------------|--------|-----------|
| CI index builder | `CXIDX-0x` | Fetch dump, parse XML, filter to Mac-medal games, apply medal rule + dedup, emit JSON.gz + collision report, publish to rolling Release | D-04, D-05, D-06 |
| Delivery, fetch & cache | `CXIDX-1x` | Bundled snapshot, 24h TTL background refresh, zod schema validation, keep-last-good, parameterized by index identity | D-06, D-07, D-08, D-09, D-19 |
| Lookup wiring | `CXIDX-2x` | `isMac` gate, index-first in `getInfoFromCodeweavers()`, scrape-on-miss, bulk IPC for the grid, `slugify()` roman-numeral fix | D-10, D-11, D-12, D-13, D-14, D-20 |
| Measurement & gate | `CXIDX-3x` | Runnable normalizer measurement, pre-committed D-02 gate, auditable report | D-01, D-02, D-03 |
| UI | `CXIDX-4x` | Grid medal badge, "unknown" mark, rating filter, install-modal warning | D-15, D-16, D-17, D-18 |

**Note the ordering constraint:** the measurement group (CXIDX-3x) gates whether the UI group's non-Steam badging ships at all (D-02/D-16). It must land before the UI work is finalized, not after.
</phase_requirements>

## Summary

This phase has an unusually favorable research profile: **it needs zero new npm packages**, and **every mechanism it requires already exists in the codebase as a working analog**. `zod@3.24.3` (schema validation), `fast-xml-parser@5.5.7` (dump parsing), and `axios` (fetch) are all present. The bundled-static-JSON pattern the index snapshot needs is precisely how `public/changelog.json` already ships and is read. The bulk-map-to-renderer pattern D-11 needs is precisely how `getAllGameOverrides` + the `metadataChanged` push already work. The badge and filter patterns are the ones Phase 08.1 established. The plan is therefore mostly *composition of existing patterns*, not invention.

The research surfaced **seven concrete traps**, four of which would each have cost an execution cycle. (1) `fast-xml-parser@5.5.7` **throws** on the CrossOver dump out of the box — `Entity expansion limit exceeded: 1001 > 1000` — because its v5 security defaults (`maxTotalExpansions: 1000`, `maxExpandedLength: 100_000`) are orders of magnitude below what a 23.7 MB document needs. Verified by running it. (2) The dump's real XML shape is `c4p > applications > app[]`, with `steamid` and `category` nested **inside `<appprofile>`**, not as direct children of `<app>` as the findings note's snippet implies. (3) GameLib is a **fork**, and GitHub **disables scheduled workflows in forks by default** — D-06's daily Action will silently never run until someone clicks "Enable workflow", and is then subject to 60-day-inactivity auto-disable. (4) The rolling release tag must not match `v*` or it collides with `draft-release-mac.yml` / `draft-release-linux.yml`, and must be created with `--latest=false` or it shadows real app releases.

The biggest planning finding concerns **D-03's measurement sample**. The user's actual non-Steam library is **15 Epic titles, of which ~10 are DLC / art books / wallpapers** — leaving roughly **five real base games**. Against D-02's `<2% wrong hits` bound, a denominator of 15 makes the smallest possible non-zero error rate 6.7%, more than 3× the bound: on the real library alone the gate is unsatisfiable-with-any-error, and the `>30% hit rate` bound swings 6.7 points per title. The measurement as literally specified cannot produce a meaningful number. **The fix is available and costs nothing:** the real Steam library (377 titles) intersected with the dump's AppIDs yields **123 pairs with ground truth** — we know the correct dump record by exact AppID join, so a *name* matcher can be scored against it. I ran this preview: three candidate normalizers scored **0 wrong hits** and **77.2% / 80.5% / 84.6% hit rates**, all passing the D-02 gate. This is a feasibility signal, not the measurement (Steam titles are the *easiest* case and the result is optimistically biased) — but it establishes both that the gate is achievable and that the measurement design works.

**Primary recommendation:** Build the CI builder as a `meta/`-convention TypeScript script (matching `meta/lintTranslations.ts`), publish to a non-`v*` rolling tag with `gh release create --latest=false` + `gh release upload --clobber` under `permissions: contents: write`; bundle the snapshot at `public/crossover-index.json` (gitignored) and read it via the existing `publicDir` constant, which resolves correctly in both dev and packaged builds with no electron-builder change; validate fetched payloads with zod; and restructure the measurement to score against the 123-pair AppID ground-truth set plus the synthetic adversarial set, reporting the two separately.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dump download + XML parse + distill | CI (GitHub Actions) | — | 23.7 MB parse must not run on user machines (settled). One machine hits CodeWeavers' FTP, not every install. |
| Index artifact hosting | GitHub Releases (CDN) | — | D-06 — keeps the source tree clean for Heroic rebases. |
| Bundled snapshot | Build artifact (`public/` → asar) | — | D-07 — first-run and offline correctness. |
| Fetch / TTL / validate / keep-last-good | Electron main (backend) | — | Network + `electron-store` are main-process only. Renderer must never fetch. |
| Index lookup (AppID + name) | Electron main (backend) | — | D-10/D-11 — single source of truth so grid and details panel cannot disagree. |
| Scrape fallback | Electron main (backend) | — | D-13 — retained safety net; lazy, details-page only. |
| Bulk index → grid | IPC (main → renderer), zustand store | — | D-11/D-13 — one bulk handoff; the grid must never trigger per-game work. |
| Medal glyph rendering | Renderer (GameCard) | — | D-12/D-15 — label derived from the rating number in the UI. |
| Rating filter | Renderer (Library filter chain) | — | D-17 — pure client-side filter over already-loaded state. |
| Install warning | Renderer (InstallModal) | — | D-18 — non-blocking, presentational. |

**Boundary note:** the renderer never talks to CodeWeavers, never reads the index file, and never triggers a scrape. All three are main-process responsibilities exposed over a single bulk IPC plus the existing per-game `getWikiGameInfo`.

## Standard Stack

### Core — all already present, zero new installs

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fast-xml-parser` | 5.5.7 (devDep) | Parse the 23.7 MB `.tie` XML in CI | Already a project dependency [VERIFIED: package.json]. CI-only — the app never parses XML. Being a devDependency is correct and sufficient: CI runs `pnpm install` with dev deps. |
| `zod` | 3.24.3 (dep) | Schema-validate the fetched index payload (D-09) | **Already a runtime dependency** [VERIFIED: package.json] and already used across the backend (`backend/schemas.ts`, `backend/protocol.ts`, `backend/humble/adapter.ts`, `backend/utils/systeminfo/*`). D-09 needs **no new package.** |
| `axios` (via `axiosClient`) | 1.13.5 | Fetch the index from the GitHub Release | Already the project's HTTP client; `axiosClient` (`backend/utils.ts:1586`) is the shared instance with a 10 s timeout + keepalive agent, and is what `codeweavers/utils.ts` already imports. |
| `electron-store` (via `CacheStore`) | 8.2.0 | Persist the index + its TTL timestamp (D-08) | `CacheStore` (`backend/cache.ts`) already implements exactly the TTL semantics D-08 needs — see Pattern 3. |
| `node:zlib` | built-in | Gunzip the fetched `.gz` asset | Built into Node/Electron. No dependency. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gh` CLI | preinstalled on GitHub runners | Create/replace the rolling Release asset | In the daily Action only. Preinstalled on all GitHub-hosted runners — no setup step needed. |
| `esbuild` | 0.25.x (transitive devDep) | Run the TS builder script in CI | The project's existing convention for repo scripts — see `meta/` in Pattern 1. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh release upload --clobber` | `softprops/action-gh-release` | Third-party action; adds a supply-chain dependency and a pinning obligation for something `gh` (preinstalled) does in two lines. Prefer `gh`. |
| Bundling into `public/` | `electron-builder` `extraResources` | `extraResources` requires an electron-builder.yml change **and** a separate `process.resourcesPath` code path for packaged vs dev — the exact footgun the task flagged. The `public/` route needs neither. See Pattern 2. |
| zod | ajv / hand-rolled validation | zod is already a dependency and already the backend's validation idiom. Introducing a second validator would be gratuitous. |
| Shipping the snapshot as `.json.gz` | Shipping plain `.json` | The `.gz` saves ~240 KB of bundle (asar is not compressed) at the cost of a `gunzipSync` on read. Both are fine; **recommend `.gz` for symmetry** — the same decode path serves the bundled snapshot and the fetched asset, so there is one code path, not two. |

**Installation:**
```bash
# NOTHING TO INSTALL. Verified against package.json:
#   zod@^3.24.3            -> dependencies    (schema validation, D-09)
#   fast-xml-parser@^5.5.7 -> devDependencies (CI dump parse)
#   axios@^1.13.5          -> dependencies    (fetch)
#   electron-store@^8.2.0  -> dependencies    (cache/TTL)
```

**Package manager:** this project uses **pnpm**, not npm. Every workflow and script uses `pnpm` [VERIFIED: package.json scripts, `.github/workflows/*`]. Any plan that writes `npm install` or `npm run` is wrong.

## Package Legitimacy Audit

**No external packages are installed by this phase.** Every library required (`zod`, `fast-xml-parser`, `axios`, `electron-store`) is already resolved in `package.json` and present in `node_modules`, and each was independently exercised during this research session (`zod` via existing backend imports; `fast-xml-parser` by actually parsing the live dump; `axios`/`electron-store` via existing call sites).

| Package | Registry | Already Present | Verified This Session | Disposition |
|---------|----------|-----------------|----------------------|-------------|
| `zod` | npm | Yes (`^3.24.3`, dependencies) | Yes — 10+ existing backend import sites | No install needed |
| `fast-xml-parser` | npm | Yes (`^5.5.7`, devDependencies) | Yes — parsed the real 23.7 MB dump from `node_modules` | No install needed |
| `axios` | npm | Yes (`^1.13.5`, dependencies) | Yes — `axiosClient` at `backend/utils.ts:1586` | No install needed |
| `electron-store` | npm | Yes (`^8.2.0`, dependencies) | Yes — `CacheStore` at `backend/cache.ts` | No install needed |

**Packages removed due to slopcheck [SLOP] verdict:** none — no packages proposed.
**Packages flagged as suspicious [SUS]:** none.

*The slopcheck gate is not applicable to this phase: the legitimacy risk it mitigates (a hallucinated package name entering an install command) cannot arise when no install command exists. If the planner introduces any new package, it MUST run the Package Legitimacy Gate before doing so.*

## Architecture Patterns

### System Architecture Diagram

```
   CodeWeavers FTP                          [ daily, 06:00 UTC ]
   crossover.tie.gz  ──────────────►  GitHub Action (fork repo)
   3.0 MB gz / 23.7 MB XML                        │
   (verified live 2026-07-12,                     │  meta/buildCrossoverIndex.ts
    Last-Modified: 2026-07-11)                    │   ├─ gunzip
                                                  │   ├─ fast-xml-parser  ← RAISE ENTITY LIMITS (Pitfall 1)
                                                  │   ├─ filter: category^="Games" AND has Mac medal   → 2,866
                                                  │   ├─ medal rule: highest cxversion per platform
                                                  │   ├─ dedup by steamid: cxversion ▼, num ▼, appid ▲ (Pitfall 5)
                                                  │   └─ emit crossover-index.json.gz  (41–58 KB)
                                                  │        + collisions.json (D-05, never fails build)
                                                  ▼
                                        gh release upload
                                        tag: crossover-index   ← NOT v* (Pitfall 3)
                                        --clobber --latest=false (Pitfall 4)
                                                  │
                          ┌───────────────────────┴────────────────────────┐
                          │                                                │
              [ app BUILD time ]                              [ app RUN time, every 24h ]
              release workflow curls the                      backend fetch layer
              asset into public/                              (D-08 TTL, D-09 validate)
                          │                                                │
                          ▼                                                ▼
              public/crossover-index.json.gz              axiosClient.get(releases/download/...)
              (gitignored — D-06)                                          │
                          │  Vite copies public/ → build/                  ▼
                          ▼                                        zod.safeParse
              asar: build/crossover-index.json.gz              ┌──── invalid ────► KEEP LAST GOOD (D-09)
                          │                                     │                   (log, do not throw)
                          │                                     └──── valid ──────┐
                          │                                                       ▼
                          └──────────────► CrossoverIndexStore (CacheStore, TTL 24h) ◄┘
                                                        │
                                                        │ resolution order:
                                                        │   fetched (fresh) > fetched (stale) > bundled snapshot
                                                        ▼
                                          ┌──────── backend lookup ────────┐
                                          │                                │
                                    isMac? ──no──► getInfoFromCodeweavers()  ← D-10: UNTOUCHED on Linux
                                       │           (live scrape, as today)      the index has NO Linux
                                       │                                        ratings by construction
                                      yes
                                       │
                                       ▼
                          index.bySteamId[appId]  (exact — 1,359 unique AppIDs)
                                       │
                                  hit ─┴─ miss ──► index.byName[normalize(title)]
                                   │                    (ONLY IF D-02 gate passed)
                                   │                         │
                                   │                    hit ─┴─ miss ──► D-13: no grid badge;
                                   │                     │               scrape lazily on details visit
                                   ▼                     ▼
                          CodeweaversInfo { macRating, linuxRating: null, slug }
                                       │
                    ┌──────────────────┴──────────────────┐
                    │ per-game                            │ bulk (D-11)
                    ▼                                     ▼
          getWikiGameInfo (existing IPC)        getCrossoverIndex (NEW bulk IPC)
                    │                                     │
                    ▼                                     ▼
          GamePage details panel              zustand store (GlobalStateV2)
          (AppleWikiInfo.tsx — unchanged)                 │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                    GameCard badge   Library filter   InstallModal
                                      (D-15/16)        (D-17)          warning (D-18)
```

### Recommended Project Structure

```
meta/
└── buildCrossoverIndex.ts          # CI builder — follows meta/ convention (Pattern 1)
                                    # also reusable as the measurement harness' dump loader

src/backend/
├── crossover_index/                # NEW module — the D-19 seam lives here
│   ├── index.ts                    # load/refresh/lookup public API
│   ├── fetcher.ts                  # D-19: fetch+TTL+validate+keep-last-good, param'd by IndexDescriptor
│   ├── schema.ts                   # zod schema (D-09) — the "identity" half of D-19
│   ├── normalize.ts                # the MATCHING key (distinct from slugify! — D-20)
│   ├── electronStore.ts            # CacheStore instance (mirrors wiki_game_info/electronStore.ts)
│   ├── ipc_handler.ts              # bulk IPC (mirrors wiki_game_info/ipc_handler.ts)
│   └── __tests__/
│       ├── normalize.test.ts       # the synthetic adversarial set lives here (D-03) — permanent regression
│       ├── schema.test.ts          # D-09 reject-bad-payload cases
│       └── lookup.test.ts          # isMac gate (D-10), index-first (D-11), miss→scrape (D-13)
└── wiki_game_info/
    ├── wiki_game_info.ts           # MODIFIED: index-first, isMac-gated
    └── codeweavers/utils.ts        # MODIFIED: slugify() roman fix (D-20) — apostrophe drop KEPT

public/
└── crossover-index.json.gz         # bundled snapshot (D-07) — GITIGNORED (D-06)

.github/workflows/
└── build-crossover-index.yml       # NEW — daily; joins the 14 existing workflows
```

### Pattern 1: Repo scripts live in `meta/` and run via esbuild → node

The project already has an established convention for repo-level Node scripts — **use it** rather than inventing a `scripts/` dir.

```jsonc
// package.json (existing, verbatim)
"download-helper-binaries": "esbuild --bundle --platform=node --target=node21 meta/downloadHelperBinaries.ts | node",
"lint-translations":        "esbuild --bundle --platform=node --target=node21 meta/lintTranslations.ts | node",
```

The builder and the measurement harness both follow this shape:
```jsonc
"build-crossover-index":  "esbuild --bundle --platform=node --target=node21 meta/buildCrossoverIndex.ts | node",
"measure-crossover-match":"esbuild --bundle --platform=node --target=node21 meta/measureCrossoverMatching.ts | node",
```
This gives TypeScript, project imports, and zero new tooling. `fast-xml-parser` being a devDependency is fine here — these scripts only ever run in CI or on a dev machine.

### Pattern 2: The bundled-static-JSON path — `publicDir`, not `extraResources`

**This is the answer to the dev-vs-packaged footgun, and it requires no electron-builder change.**

The project already ships and reads a static JSON exactly this way:
```typescript
// src/backend/utils.ts (existing) — the analog to copy
const getCurrentChangelog = async (): Promise<Release | null> => {
  if (process.env.CI === 'e2e') return null
  try {
    const changelogPath = join(publicDir, 'changelog.json')
    const content = readFileSync(changelogPath, 'utf-8')
    return JSON.parse(content) as Release
  } catch (error) { /* ... */ return null }
}
```

Why the same relative filename resolves correctly in **both** dev and packaged:
```typescript
// src/backend/constants/paths.ts:63 (existing)
export const publicDir = resolve(
  __dirname, '..',
  app.isPackaged || process.env.CI === 'e2e' ? '' : '../public'
)
```
- **Dev:** `__dirname` = `<root>/build/main` → resolves to `<root>/public` → reads `public/crossover-index.json.gz` from the working tree.
- **Packaged:** `__dirname` = `…/app.asar/build/main` → resolves to `…/app.asar/build` → reads the copy Vite placed there.

The copy happens because electron-vite's **renderer** config sets `root: '.'` and `outDir: 'build'`, and Vite's default `publicDir` is `<root>/public`, which it copies into `outDir` on build. `electron-builder.yml` then bundles `build/**/*` into the asar. **`readFileSync` works inside an asar** — `asarUnpack` is only needed for files that must exist as real files on disk (executables), which this is not.

Net: drop the file at `public/crossover-index.json.gz`, read it at `join(publicDir, 'crossover-index.json.gz')`. No `extraResources`, no `process.resourcesPath`, no branch on `app.isPackaged`.

**Two obligations this creates:**
1. `public/crossover-index.json.gz` must be **gitignored** (D-06 — artifact must not enter the source tree). Add to `.gitignore`; note `.gitignore` currently ignores `public/**/*.js` but not `public/*.json*`, so an explicit line is required.
2. Because it is gitignored, it **will not exist** on a fresh clone or a local `pnpm dist:mac`. Two consequences the plan must handle:
   - The **release workflows** (`draft-release-mac.yml`, `build-base.yml`) need a step that curls the asset into `public/` before `pnpm release:mac` / `pnpm dist:*`.
   - The backend loader **must treat a missing snapshot as a normal cold-start**, not an error — log at info, fall through to the fetch layer, badge nothing until the first fetch lands. A `readFileSync` that throws on a contributor's dev build would be a hard regression.

### Pattern 3: `CacheStore` already implements the D-08 TTL contract

Do not hand-roll TTL bookkeeping. `CacheStore` (`src/backend/cache.ts`) already stores a `__timestamp.<key>` sidecar on every `set()` and evicts on `get()` once `max_value_lifespan` (in **minutes**) elapses. D-08's 24 h is `60 * 24`:

```typescript
// mirrors src/backend/wiki_game_info/electronStore.ts
import CacheStore from '../cache'
export const crossoverIndexStore = new CacheStore<CrossoverIndex, 'index'>(
  'crossover_index',
  60 * 24 // D-08: 24-hour TTL, matching the dump's own daily cadence
)
```

**One caveat that matters for D-09.** `CacheStore.get()` *deletes* the entry when the TTL expires and returns the fallback. That is the opposite of "keep last good" — an expired-but-valid index would be **destroyed** before the refresh attempt, so a failed refresh would leave nothing. Two clean options:

- **(a) Use the `invalidateCheck` escape hatch.** The constructor accepts `{ invalidateCheck }`, and expiry only fires when it returns `true`. Passing `() => false` makes entries never auto-evict; the fetch layer then reads a separate `fetchedAt` field on the payload to decide staleness, and overwrites only on a *successful, validated* fetch. The `umuStore` already uses `invalidateCheck` this way.
- **(b) Store the index under a key the TTL doesn't govern** and keep a separate `lastFetchAttempt` timestamp.

**Recommend (a)** — it keeps one store, and "the cached value is never thrown away; it is only ever *replaced* by a validated newer one" is exactly D-09's stated requirement.

### Pattern 4: The bulk-map-to-renderer handoff (D-11)

The task correctly notes `wikiGameInfoStore` is title-keyed and populated per-game, so it cannot paint a grid. The project already solved this exact problem twice, and both are direct analogs:

```typescript
// src/common/types/ipc.ts (existing)
humbleGetOwnershipOverrides: () => Promise<Record<string, number>>
getAllGameOverrides: () => Promise<Record<string, GameMetadataOverride>>
```

`getAllGameOverrides` is the closer analog because it also has a **push** channel for invalidation:
```typescript
// src/backend/main.ts:1468 + :1475 (existing)
sendFrontendMessage('metadataChanged', getAllGameOverrides())   // push on change
addHandler('getAllGameOverrides', async () => getAllGameOverrides())  // pull on demand
```
```typescript
// src/frontend/state/GlobalState.tsx:1077 (existing)
window.api.handleMetadataChanged((e, overrides) => { /* → zustand */ })
```
…landing in a zustand slice:
```typescript
// src/frontend/state/GlobalStateV2.ts (existing)
gameOverrides: Record<string, GameOverride>
setGameOverrides: (overrides: Record<string, GameOverride>) => void
```

**Copy this shape exactly:** a `getCrossoverIndex` pull handler + a `crossoverIndexChanged` push (fired when a background refresh swaps the index in), landing in a `crossoverRatings: Record<string, number>` zustand slice keyed by `app_name`. The grid then reads from zustand — synchronous, no per-card IPC, and structurally incapable of triggering a scrape (D-13).

**Sizing note:** the renderer only needs `app_name → rating`, not the whole index. For a 377-game library that is a ~10 KB map. Resolve library-title → rating **in the backend** (it owns the normalizer and the `isMac` gate) and ship the resolved map, not the 2,866-entry index. This keeps the matching logic in exactly one place and keeps D-16 honest: a game is in the map with a rating (badge), in the map with `null` (looked-up-and-absent → "unknown" mark), or **not in the map at all** (not looked up → no mark). That three-state map is precisely what D-16 requires and it falls out for free.

### Pattern 5: The D-19 seam — an `IndexDescriptor`, not a framework

D-19 asks for parameterization by identity, explicitly *not* a plugin registry. The seam is one type and one function:

```typescript
// src/backend/crossover_index/fetcher.ts
interface IndexDescriptor<T> {
  name: string                     // store filename, log prefix
  url: string                      // the rolling-release asset URL
  bundledPath: string              // join(publicDir, '…')
  schema: z.ZodType<T>             // D-09
  ttlMinutes: number               // D-08
}

// ONE generic function. No registry. No dynamic dispatch. Callers name their descriptor.
export async function loadIndex<T>(desc: IndexDescriptor<T>): Promise<T | null>
```
The deferred `mac-arch-overrides.json` phase then adds a second `const MAC_ARCH_INDEX: IndexDescriptor<…>` and calls the same `loadIndex`. That is the entire extension story — no further abstraction is warranted, and the planner should resist adding any.

### Anti-Patterns to Avoid

- **Reading the index in the renderer.** The renderer has no filesystem access to `publicDir` and no business fetching. Backend resolves; renderer receives a map.
- **`extraResources` / `process.resourcesPath`.** Unnecessary here and introduces the dev-vs-packaged divergence Pattern 2 avoids. See Pitfall 6.
- **Making `getInfoFromCodeweavers()` index-aware internally on all platforms.** D-10 is a correctness gate — an ungated index-first path returns `linuxRating: null` on Linux and *caches* it, silently regressing Phase 16. Gate at the call site in `wiki_game_info.ts` where `isMac` is already imported.
- **Reusing `slugify()` as the matching key.** D-20 is explicit: the slug function and the matching key are different functions with *opposite* correctness criteria (verbatim right for slugs; normalization is the open question for matching). Put the matching key in a **new file** (`crossover_index/normalize.ts`) so the two can never drift into each other.
- **Failing the CI build on collisions.** D-05 — log, resolve, publish. The index is an enhancement; a broken daily build must not block anything.
- **Deleting the Linux CrossOver fetch while working nearby.** D-14 explicitly declines this. It is dead weight *by design decision*.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payload schema validation (D-09) | Manual `typeof` / shape checks | `zod` (already a dep) | Already the backend's idiom (`backend/schemas.ts`). `safeParse` gives you reject-and-keep-last-good in one call with a structured error to log. |
| TTL bookkeeping (D-08) | A `lastFetched` field + manual date math | `CacheStore` (`backend/cache.ts`) | Already stores `__timestamp.<key>` per entry and evicts on read. Use `invalidateCheck: () => false` for keep-last-good (Pattern 3). |
| Bulk map → renderer (D-11) | A new IPC architecture | The `getAllGameOverrides` + `metadataChanged` pair | Pull handler + push channel + zustand slice already exist and are proven for exactly this shape. |
| Gunzip | Streaming/chunked decompressors | `node:zlib` `gunzipSync` | Built in. The payload is 41–58 KB; sync is fine and simpler. |
| Release asset upload | A custom GitHub API client, or a third-party action | `gh release upload --clobber` | `gh` is preinstalled on GitHub runners. Two lines, no supply-chain surface, no pinning obligation. |
| XML parsing | Regex over 23.7 MB | `fast-xml-parser` (already a dep) | Already a dependency; regex over nested localized `<name>` / `<medal>` elements is exactly the "deceptively complex" trap. **But you must raise its entity limits — see Pitfall 1.** |
| Card badge overlay | A new badge component | `gameCardDelistedBadge` pattern (`GameCard/index.tsx:502-509`) | Established visual + `aria-label` overlay span with CSS in `GameCard/index.css`. D-15 says follow it. |
| Tri-state library filter | A new filter mechanism | The `showNonAvailable` / `showHidden` `FilterMode` chain (`Library/index.tsx:576-590`) | Phase 08.1 already built tri-state (`off`/`on`/`only`) filters with localStorage persistence and a `toggleWithOnly` control in `components/UI/LibraryFilters/`. |

**Key insight:** this phase's novelty is entirely in the *data pipeline* (dump → index → delivery). Every *application-side* concern it touches — caching, validation, IPC, badges, filters — already has a working, tested implementation in this codebase. A plan that invents new machinery for any of those is adding risk for nothing.

## Runtime State Inventory

> Included because D-20 changes `slugify()`, whose output is **persisted** in `wikiGameInfoStore`, and because the index-first path changes what gets written into that same cache. A grep-only audit would miss both.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `wikiGameInfoStore` (`~/Library/Application Support/GameLib/store_cache/wikigameinfo.json` — **present on the dev machine, non-empty**). Holds `codeweavers: { macRating, linuxRating, slug }` per title. Two staleness effects: (a) **D-20** changes `slugify()`, so cached `slug` values computed with the roman→arabic rule (e.g. `quake-2`) are now wrong — *harmless* (the rating is already resolved and the slug is only a deep-link), but they will not self-heal, since the existing `staleCrossoverData` check only tests `!codeweavers` and `macRating === undefined`. (b) Entries cached as a "checked, none found" miss (`macRating: null`) from the **scraper** will suppress a *newly available index hit* until the 30-day TTL expires. | **Code edit + a cache-invalidation decision.** Recommend extending the existing `staleCrossoverData` self-heal in `wiki_game_info.ts` to also treat a null-`macRating` codeweavers entry as stale **on macOS once the index is loaded** — otherwise users who ran Phase 16 keep seeing "no rating" for games the index now covers. This is a real, user-visible regression risk and the planner must address it explicitly. |
| **Live service config** | None. No external service holds phase-19 state. The GitHub Release is created *by* this phase, not pre-existing. | None. |
| **OS-registered state** | None — verified: no launchd/Task Scheduler/pm2 registration is involved. | None. |
| **Secrets / env vars** | `GITHUB_TOKEN` (auto-provided to Actions). Existing workflows use `secrets.WORKFLOW_TOKEN` for electron-builder publishing, but the index workflow does **not** need it — the default `GITHUB_TOKEN` with `permissions: contents: write` suffices for same-repo release upload. No new secret to provision. | None. |
| **Build artifacts** | `public/crossover-index.json.gz` — generated, gitignored, and **absent on a fresh clone**. `build/` is gitignored and rebuilt. | Release workflows must fetch it pre-build; the backend must tolerate its absence (see Pattern 2, obligation 2). |

## Common Pitfalls

### Pitfall 1: `fast-xml-parser@5` throws on the dump out of the box — VERIFIED, not theoretical
**What goes wrong:** The CI builder fails on its very first run with:
```
Error: Entity expansion limit exceeded: 1001 > 1000
```
**Why it happens:** fast-xml-parser v5 added billion-laughs/XXE hardening with defaults sized for small documents. From its own type defs (`node_modules/fast-xml-parser/src/fxp.d.ts`): `maxTotalExpansions` defaults to **1000**, `maxExpandedLength` to **100 000** characters. The dump is 23.7 MB and its `<description>` blocks are dense with `&amp;` / `&quot;` / `&#39;`. Both defaults are exceeded immediately.
**How to avoid:** pass a `ProcessEntitiesOptions` object (v5 accepts `boolean | ProcessEntitiesOptions`):
```typescript
new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: {
    enabled: true,
    maxTotalExpansions: 500_000,   // default 1_000  — far too low
    maxExpandedLength: 50_000_000, // default 100_000 — far too low for a 23.7 MB doc
    maxEntityCount: 1_000          // default 100
  },
  isArray: (name) => ['app', 'name', 'medal', 'category'].includes(name)
})
```
**Warning signs:** any parse error mentioning "expansion". Do **not** "fix" this with `processEntities: false` — that would leave `&amp;` undecoded in names like `Command & Conquer`, silently corrupting the matching key.

### Pitfall 2: The dump's real XML shape differs from the findings-note snippet
**What goes wrong:** `doc.c4p.app` is `undefined`; extraction silently yields **0 records** and the builder happily publishes an empty index.
**Why it happens:** The note's illustrative snippet shows `<steamid>` and `<category>` as children of `<app>`. In the real file [VERIFIED by parsing the live dump 2026-07-12]:
- The root path is **`c4p > applications > app[]`** (there is an `<applications>` wrapper; `c4p` also has `highlightedapps`, `revokelist`, `disabledlicenses` siblings).
- `<app>` has only: `@appid`, `@timestamp`, `name[]`, `cxversion[]`, `appprofile`, `contributor?`, `cdprofile?`, `installprofile?`.
- **`steamid`, `category`, `medal`, `description`, `flag`, `bottletemplate` all live INSIDE `<appprofile>`.**
- `<name>` is an array whose **first element is the bare canonical name** (a plain string), followed by `{ '#text', '@_lang' }` localized variants — *including* a `lang="en"` duplicate. Take the entry with **no** `@_lang`, falling back to `lang="en"`.
- `<cxversion>` on `<app>` is the *profile applicability* list — **not** the medal version. The medal carries its own `@_version`. Do not confuse them; the medal rule sorts on `medal[@version]`.
- Medal attributes, exhaustively: `#text` (label), `@_rating`, `@_platform`, `@_version`, `@_num`, `@_last`.

**How to avoid:** assert non-empty after extraction and **fail the build if the record count is zero** (this is the one case that *should* fail — an empty index is worse than a stale one; D-05's "never fail" applies to *collisions*, not to a structurally broken parse).
**Warning signs:** record count of 0, or wildly off 2,866.

### Pitfall 3: The rolling tag must not match `v*`
**What goes wrong:** Creating the rolling release under a tag like `v-crossover-index` triggers `draft-release-mac.yml` and `draft-release-linux.yml`, both of which fire on `push: tags: ['v*']` — kicking off signed, notarized macOS builds that consume Apple credentials, on a daily schedule.
**Why it happens:** Both existing release workflows match the `v*` glob broadly [VERIFIED: `.github/workflows/draft-release-*.yml` lines 5-6].
**How to avoid:** name the tag `crossover-index` (no `v` prefix). *(GitHub's "a `GITHUB_TOKEN`-triggered event does not start new workflow runs" rule would likely also prevent this, but relying on it is unnecessary when a safe tag name is free.)*
**Warning signs:** unexpected `Draft Release MacOSX` runs appearing daily.

### Pitfall 4: The rolling release will hijack "Latest release"
**What goes wrong:** `gh release create` marks the new release as **Latest** by default (it is the most recent). The index release then shadows real GameLib app releases in the repo UI, and breaks any `/releases/latest/download/…` URL consumers.
**How to avoid:** `gh release create crossover-index --latest=false …` [CITED: cli.github.com/manual/gh_release_create — "`--latest=false` to explicitly NOT set as latest"]. Also mark it a prerelease if you want it hidden from the sidebar entirely.

### Pitfall 5: D-04's tiebreak does not fully order the records — the build is non-deterministic without a third key
**What goes wrong:** The index artifact differs between runs even when the dump has not changed, producing pointless daily churn and defeating any "has the index actually changed?" check.
**Why it happens:** [VERIFIED by running the dedup over the live dump] Among the 2,866 Mac-medal games, **1,620 carry a `steamid` but only 1,359 are unique → 205 colliding AppIDs (261 records)**. D-04's tiebreak is *highest `cxversion`, then most `num`* — but many collisions are **exact ties on both**:
```
sid 2310   -> Quake=r5@cx26.2.0/num1 ~ Quake=r5@cx26.2.0/num1
sid 205710 -> EverQuest=r5@cx26.2.0/num10 ~ EverQuest (×3, all identical)
sid 15300  -> Tom Clancy's Ghost Recon=r2@cx26.2.0/num1  (×3, all identical)
```
With a total tie, the winner depends on map iteration order.
**How to avoid:** add a **third, total, stable** tiebreak after D-04's two: **`@appid` ascending**. This is a strict refinement of D-04, not a contradiction of it — it only decides cases D-04 leaves tied.
**Silver lining worth telling the planner:** only **7 of the 205** colliding AppIDs actually **disagree on rating**, so for 198 the winner choice is immaterial to the output. The determinism fix is cheap and the correctness exposure is small — but the collision count is **~3× larger than CONTEXT D-04's "~69" estimate**, which was derived as `1,620 − 1,551` (mixing a Mac-medal-scoped numerator with a whole-file-scoped unique count). D-04's *rule* stands; only its stated *magnitude* was off.

### Pitfall 6: The dev-vs-packaged snapshot path (the classic footgun)
**What goes wrong:** The index loads in `pnpm start` and is missing in the `.dmg` (or vice versa), because the code branches on `app.isPackaged` or reaches for `process.resourcesPath`.
**How to avoid:** don't branch. Use `join(publicDir, 'crossover-index.json.gz')` — the existing `publicDir` constant already encodes the dev/packaged difference (Pattern 2), which is why `getCurrentChangelog()` works in both. And **handle the file being absent** as a normal cold-start, since it is gitignored and won't exist on a fresh clone.
**Warning signs:** a `readFileSync` ENOENT thrown at startup on a contributor's machine.

### Pitfall 7: The daily Action will silently never run — GameLib is a fork
**What goes wrong:** The workflow merges, and the index is simply never built. No error, no run, no notification.
**Why it happens:** [VERIFIED: docs.github.com] *"When a public repository is forked, scheduled workflows are disabled by default."* GameLib's push remote is `grayson-mitchell/GameLib`, a fork of `Heroic-Games-Launcher/HeroicGamesLauncher` [VERIFIED: `git remote -v`]. Additionally: *"In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days"* — so even once enabled, a quiet period silently stops the daily build.
**How to avoid (three parts):**
1. Ship a **`workflow_dispatch` trigger alongside `schedule`** so the index can always be built on demand, and so the first build doesn't depend on the schedule firing.
2. Add a **one-time manual step to the plan**: enable the workflow in the fork's Actions tab (`gh workflow enable build-crossover-index.yml`). This is a human step — the planner should make it an explicit `checkpoint:human-verify` task, not an assumption.
3. Put a **`generatedAt` timestamp in the index payload** and log a warning when the loaded index is older than ~7 days. This makes a stalled Action *visible* instead of silent. (D-07's bundled snapshot + D-09's keep-last-good mean a stalled Action degrades gracefully rather than breaking badges — but "gracefully stale forever" is still a bug.)
**Warning signs:** the Actions tab shows the workflow greyed out / "This scheduled workflow is disabled".

### Pitfall 8: The Epic library is mostly DLC — the measurement denominator is contaminated
**What goes wrong:** The measurement reports a hit rate near 30% and the D-02 gate fails (or barely passes) for reasons that have nothing to do with the normalizer.
**Why it happens:** [VERIFIED by reading `legendary_library.json`] The real Epic library holds **15 entries**, of which roughly ten are not games:
```
ARK: Survival Evolved | The Outer Worlds | The Outer Worlds: Spacer's Choice Edition |
Phoenix Point | SOMA |
Phoenix Point Content | Phoenix Point Art Book | Phoenix Point Blood and Titanium |
Phoenix Point Legacy of the Ancients | Phoenix Point Festering Skies |
Phoenix Point Corrupted Horizons | Phoenix Point - Kaos Engines |
Phoenix Point Digital Game Manual | Phoenix Point Compendium |
Phoenix Point Desktop Wallpaper
```
Art books, wallpapers, manuals and DLC will **never** appear in CrossOver's dump. Counting them as "misses" mechanically drags the hit rate toward zero.
**How to avoid:** filter the measurement's library sample to base games before scoring (Legendary's metadata exposes DLC/add-on status). And see the next pitfall — this library is too small regardless.

### Pitfall 9: D-02's gate is unsatisfiable on the real non-Steam library — the denominator is 15
**What goes wrong:** The measurement produces a number that cannot be interpreted, and the pre-committed gate — whose entire purpose was to prevent post-hoc rationalization — gets rationalized anyway because everyone can see 1/15 is not really "6.7% wrong hits".
**Why it happens:** D-02 bounds wrong hits at **<2%** of claimed non-Steam titles. With n=15 (really ~5 after DLC filtering), **the smallest possible non-zero wrong-hit rate is 6.7%** — over 3× the bound. The gate is therefore pass-only-if-*exactly-zero*-wrong-hits, which is not what a 2% bound means. Symmetrically, the >30% hit-rate bound moves 6.7 points per title. A 2% bound implicitly assumes n ≥ ~50.
**How to avoid — and this is the phase's most important design recommendation:** the measurement has a **ground-truth set hiding in plain sight**. The real Steam library holds 377 titles; **123 of them have an AppID present in the dump** [VERIFIED by intersecting the live dump with `steam_library.json`]. For each, the *correct* dump record is known exactly by AppID join. So you can run the **name** matcher on the Steam store title — pretending you don't know the AppID — and score it against ground truth. n=123 makes a single wrong hit **0.81%**, comfortably representable below the 2% bound; the gate becomes a real test.

I ran this as a feasibility preview against the live dump:

| Normalizer | HIT | WRONG | MISS | D-02 gate |
|---|---|---|---|---|
| A — exact lowercase | 95 (77.2%) | **0 (0.0%)** | 28 (22.8%) | PASS |
| B — punctuation-stripped | 99 (80.5%) | **0 (0.0%)** | 24 (19.5%) | PASS |
| C — punct + edition-suffix stripping | 104 (84.6%) | **0 (0.0%)** | 19 (15.4%) | PASS |

**Read this honestly — it is a feasibility signal, not the measurement.** Steam store titles are the *easiest* case: 1,620 of the dump's records were sourced with a Steam ID attached, so CodeWeavers' canonical names track Steam's titles closely. Epic/GOG/Amazon conventions differ (GOG's `(Game of the Year Edition)` suffixes, Epic's odd variants). The true non-Steam hit rate will be **lower** than 77–85%. What the preview *does* establish: (i) the measurement design works and is cheap; (ii) wrong hits are structurally rare because game titles are highly distinctive strings; (iii) the gate is achievable rather than aspirational.

**Recommended measurement structure (three sets, scored separately — never pooled into one denominator):**
1. **Ground-truth set (n=123, Steam ∩ dump-by-AppID)** → the *statistics*. Produces hit-rate and wrong-hit-rate with a real denominator and objective labels. This is what the D-02 gate should be evaluated against, with the Steam-title bias stated explicitly in the report.
2. **Real non-Steam set (n≈5 after DLC filtering)** → *qualitative* evidence only. Report as a table of individual title → outcome. Do not compute a percentage from n=5.
3. **Synthetic adversarial set (D-03)** → *pass/fail per failure mode*, not a rate. Deliberately failure-biased, so pooling it with (1) would corrupt both numbers.

Additionally, run a **self-collision test over the 2,866 dump names** — a large-denominator wrong-hit proxy requiring no library at all. Two different dump games that normalize to the same key mean any library title landing there is a coin-flip. Measured against the live dump:

| Normalizer | distinct keys | colliding keys | keys where rating **disagrees** | records at risk |
|---|---|---|---|---|
| A — exact lowercase | 2360 | 367 | **0** | 0 (0.0%) |
| B — punctuation-stripped | 2358 | 369 | **0** | 0 (0.0%) |
| C — punct + edition-suffix | 2345 | 374 | **11** | 33 (1.2%) |

This is a clean, decisive result: **punctuation stripping is free** (every collision it creates is between duplicate records of the *same* game, which D-04's dedup already handles — zero rating disagreements). **Edition-suffix stripping is where the harm enters** — it fuses genuinely different games and puts 1.2% of records at risk, landing right at the D-02 bound. That is exactly the trade-off D-02 was written to adjudicate, and the phase now has a cheap instrument to adjudicate it with.

## Code Examples

### The daily index workflow (D-06)
```yaml
# .github/workflows/build-crossover-index.yml
name: Build CrossOver compatibility index

on:
  schedule:
    - cron: '0 6 * * *'    # daily, after CodeWeavers' refresh
  workflow_dispatch:        # Pitfall 7 — always buildable on demand

permissions:
  contents: write           # required to create the release + upload the asset

jobs:
  build-index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/install-deps      # the project's existing composite action

      - name: Build index from the CodeWeavers dump
        run: pnpm build-crossover-index           # meta/buildCrossoverIndex.ts (Pattern 1)

      - name: Publish to the rolling release
        env:
          GH_TOKEN: ${{ github.token }}           # default token suffices; no WORKFLOW_TOKEN needed
        run: |
          # gh release upload requires the release to already exist.
          # Tag is NOT v* (Pitfall 3) and NOT latest (Pitfall 4).
          gh release view crossover-index >/dev/null 2>&1 || \
            gh release create crossover-index \
              --title "CrossOver compatibility index" \
              --notes "Rolling artifact, rebuilt daily from CodeWeavers' public .tie dump. Not a GameLib release." \
              --latest=false

          gh release upload crossover-index \
            dist-index/crossover-index.json.gz \
            dist-index/collisions.json \
            --clobber                              # delete + re-upload same-named assets

      - name: Surface collision drift (D-05 — never fails the build)
        run: cat dist-index/collisions.json
```

**The stable fetch URL the app then uses** — permanent as long as the tag and filename are stable [CITED: docs.github.com/rest/releases/assets; redirects to GitHub's asset CDN, which `axios` follows by default]:
```
https://github.com/grayson-mitchell/GameLib/releases/download/crossover-index/crossover-index.json.gz
```
No auth required (public repo). No API call, no rate limit, no token in the client.

### The builder's parse + medal rule + deterministic dedup
```typescript
// meta/buildCrossoverIndex.ts
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Pitfall 1 — v5 security defaults are far too low for a 23.7 MB document.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 500_000,   // default 1_000
    maxExpandedLength: 50_000_000, // default 100_000
    maxEntityCount: 1_000          // default 100
  },
  isArray: (name) => ['app', 'name', 'medal', 'category'].includes(name)
})

// Pitfall 2 — the real path has an <applications> wrapper.
const apps = parser.parse(xml).c4p.applications.app

const text = (v: unknown) => (v && typeof v === 'object' ? (v as any)['#text'] : v)

// The canonical name is the <name> with NO lang attribute (lang="en" is a duplicate).
const canonicalName = (app: any): string => {
  const names = app.name ?? []
  const bare = names.find((n: any) => typeof n !== 'object' || !n['@_lang'])
  const en = names.find((n: any) => typeof n === 'object' && n['@_lang'] === 'en')
  return String(text(bare ?? en ?? names[0]) ?? '')
}

const compareVersion = (a: string, b: string) => { /* numeric dotted compare */ }

for (const app of apps) {
  const profile = app.appprofile
  if (!profile) continue

  // Pitfall 2 — category lives inside <appprofile>.
  const categories = (profile.category ?? []).map(text).filter(Boolean).map(String)
  if (!categories.some((c) => c.startsWith('Games'))) continue

  // THE MEDAL RULE (verified 6/6): rating = medal on the highest cxversion for that platform.
  const macMedals = [].concat(profile.medal ?? [])
    .filter((m: any) => m && typeof m === 'object' && m['@_platform'] === 'Mac')
  if (!macMedals.length) continue          // -> exactly 2,866 games survive

  macMedals.sort((x: any, y: any) => compareVersion(y['@_version'], x['@_version']))
  const best = macMedals[0]

  records.push({
    appid: String(app['@_appid']),          // needed for the D-04 determinism tiebreak
    name: canonicalName(app),
    rating: Number(best['@_rating']),       // 1..5
    label: String(text(best) ?? ''),        // gold/ungold/... (optional per D-12)
    cxversion: String(best['@_version']),
    num: Number(best['@_num'] ?? 0),
    steamid: profile.steamid !== undefined ? String(text(profile.steamid)) : undefined
  })
}

// D-04 dedup + Pitfall 5: the third key makes the ordering TOTAL, so the build is deterministic.
const winner = (a, b) =>
  compareVersion(b.cxversion, a.cxversion) ||   // 1. highest cxversion   (D-04)
  (b.num - a.num) ||                            // 2. most ratings        (D-04)
  a.appid.localeCompare(b.appid)                // 3. lowest appid  (NEW — breaks exact ties)
```

### The D-09 validate / keep-last-good layer
```typescript
// src/backend/crossover_index/schema.ts
import { z } from 'zod'   // already a dependency

export const crossoverIndexSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),          // Pitfall 7 — staleness is detectable
  entries: z.array(z.object({
    name: z.string().min(1),
    rating: z.number().int().min(1).max(5),    // rejects junk medals outright
    steamid: z.string().optional()
  })).min(1000)                                // a truncated payload is a rejected payload
})
export type CrossoverIndex = z.infer<typeof crossoverIndexSchema>
```
```typescript
// src/backend/crossover_index/fetcher.ts — D-19: parameterized by identity, not a framework
export async function loadIndex<T>(desc: IndexDescriptor<T>): Promise<T | null> {
  const cached = store.get(desc.name)          // CacheStore w/ invalidateCheck: () => false
  if (cached && !isStale(cached, desc.ttlMinutes)) return cached.data

  try {
    const { data } = await axiosClient.get<ArrayBuffer>(desc.url, {
      responseType: 'arraybuffer',
      maxContentLength: 5 * 1024 * 1024        // mirrors the Phase 16 bound
    })
    const json = JSON.parse(gunzipSync(Buffer.from(data)).toString('utf-8'))

    const parsed = desc.schema.safeParse(json)
    if (!parsed.success) {
      // D-09: reject and KEEP LAST GOOD. Never throw, never overwrite.
      logError(['Rejected index payload', desc.name, parsed.error.issues], LogPrefix.Backend)
      return cached?.data ?? loadBundledSnapshot(desc)
    }

    store.set(desc.name, { data: parsed.data, fetchedAt: Date.now() })
    return parsed.data
  } catch (error) {
    // Network/parse failure: stale-but-valid beats nothing.
    logError(['Index refresh failed, keeping last good', desc.name, error], LogPrefix.Backend)
    return cached?.data ?? loadBundledSnapshot(desc)
  }
}
```

### The D-10 gate — where it belongs
```typescript
// src/backend/wiki_game_info/wiki_game_info.ts — inside the existing Promise.all
// D-14: this line's `isMac || isLinux` condition is NOT changed. The Linux fetch stays.
const [pcgamingwiki, gamesdb, applegamingwiki, umuId, codeweavers] = await Promise.all([
  getInfoFromPCGamingWiki(title, runner === 'gog' ? appName : undefined),
  getInfoFromGamesDB(title, appName, runner),
  isMac ? getInfoFromAppleGamingWiki(title) : null,
  isLinux ? getUmuId(appName, runner) : null,

  // D-10: index-first ONLY on macOS. The index has no Linux ratings by construction,
  // so an ungated index hit would cache linuxRating: null and regress Phase 16.
  isMac
    ? (await getCodeweaversFromIndex(gameInfo)) ?? getInfoFromCodeweavers(title)  // D-11, D-13
    : isLinux
      ? getInfoFromCodeweavers(title)   // unchanged — exactly as today (D-14)
      : null
])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `fast-xml-parser` v4 parsed any document with default options | v5 enforces entity-expansion limits by default (`maxTotalExpansions: 1000`) | v5.x | **Breaks the CI builder immediately.** Must pass a `ProcessEntitiesOptions` object. This is the single highest-value finding in this document — see Pitfall 1. |
| `actions/upload-release-asset` | Archived/unmaintained; `gh release upload --clobber` or `softprops/action-gh-release` | ~2021 onward | Do not use `actions/upload-release-asset`. Prefer the preinstalled `gh` CLI. |
| Implicit broad `GITHUB_TOKEN` permissions | Explicit `permissions:` block per workflow | 2021 onward | The project already follows this (`build-base.yml`, `test.yml`, `codecheck.yml` all declare `permissions: contents: read`). The index workflow needs `contents: write` and should declare it explicitly. |

**Deprecated/outdated:**
- `actions/upload-release-asset` — archived; does not support overwrite.
- The `set-output` workflow command — irrelevant here, but do not copy it from old examples.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vite copies `public/` into `build/` on the renderer build (default `publicDir` behavior), which is why `publicDir`-relative reads work when packaged | Pattern 2 | LOW — inferred from Vite's documented default + the fact that `getCurrentChangelog()` reads `join(publicDir, 'changelog.json')` and works in production. Not directly observed (`build/` currently holds only `main/` + `preload/`; the renderer build hasn't been run in this tree). **A 30-second `pnpm dist:mac` + `ls build/` in Wave 0 confirms it.** If wrong, fall back to `extraResources` (and accept the dev/packaged branch). |
| A2 | `gh` CLI is preinstalled on `ubuntu-latest` GitHub-hosted runners | Code Examples | LOW — long-standing and widely relied upon. If wrong, add `gh` install step. |
| A3 | The 123-pair ground-truth preview generalizes *directionally* (not numerically) to Epic/GOG/Amazon titles | Pitfall 9 | MEDIUM — Steam titles are the easiest case and the preview is optimistically biased. This is exactly why the measurement (D-01) must still run and is stated as such. The preview is offered as feasibility evidence, **not** as a substitute for the measurement. |
| A4 | Legendary's library metadata exposes enough to filter DLC/add-ons from base games | Pitfall 8 | LOW — the entries are visibly distinguishable and `legendary_library.json` carries per-entry metadata. If not, filter by "is the title a prefix-extension of another owned title" as a fallback heuristic. |
| A5 | `readFileSync` on a path inside `app.asar` works without `asarUnpack` | Pattern 2 | LOW — Electron patches `fs` for asar reads; `asarUnpack` exists for files needing a real on-disk path (executables). The existing `changelog.json` read is the proof. |

## Open Questions

1. **Does the D-02 gate get evaluated against the 123-pair Steam ground-truth set, the ~5-title real non-Steam set, or both?**
   - What we know: D-02 says "<2% wrong hits AND >30% hit rate on *claimed non-Steam titles*". The real non-Steam sample is 15 entries (~5 base games) — too small for a 2% bound to be meaningful (Pitfall 9).
   - What's unclear: whether the user intends the gate to bind on a sample that cannot express its own threshold.
   - Recommendation: **evaluate the gate on the 123-pair ground-truth set**, report the non-Steam titles qualitatively alongside, and state the Steam-title bias explicitly in the report. This preserves D-02's intent (a pre-committed, un-rationalizable number) while giving it a denominator that can actually express 2%. **This should be surfaced to the user before planning locks** — it is an interpretation of a locked decision, not a change to it, but it is consequential enough to confirm.

2. **Should the existing `wikiGameInfoStore` codeweavers entries be invalidated when the index first loads?**
   - What we know: Phase 16 cached "checked, none found" misses (`macRating: null`) with a 30-day TTL. Those entries will suppress newly-available index hits for up to 30 days.
   - What's unclear: whether that's acceptable (it self-heals eventually) or a visible regression (a user who ran Phase 16 sees fewer badges than a fresh install).
   - Recommendation: extend the existing `staleCrossoverData` self-heal to treat null-`macRating` as stale on macOS. Cheap, and it removes a confusing "why does my friend see a badge and I don't" class of bug. Flagged in the Runtime State Inventory.

3. **Bundled snapshot freshness in release builds.**
   - What we know: the snapshot must be fetched into `public/` by the release workflow before `pnpm dist:*` (Pattern 2, obligation 1).
   - What's unclear: whether to *fail* a release build if the index asset can't be fetched, or ship without a snapshot and rely on first-run fetch.
   - Recommendation: **warn, don't fail.** A release should not be blocked by CodeWeavers' FTP being down. The app already handles a missing snapshot as a cold start.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| CodeWeavers `.tie` dump | CI builder | ✓ | 3,088,416 bytes; `Last-Modified: Sat, 11 Jul 2026` [VERIFIED via `curl -sI` 2026-07-12] | — (D-05: build failure never blocks) |
| `fast-xml-parser` | CI builder | ✓ | 5.5.7 (devDep, in `node_modules`) | — |
| `zod` | D-09 validation | ✓ | 3.24.3 (runtime dep) | — |
| `axios` / `axiosClient` | Index fetch | ✓ | 1.13.5 | — |
| `electron-store` / `CacheStore` | TTL cache | ✓ | 8.2.0 | — |
| `node:zlib` | gunzip | ✓ | built-in | — |
| `pnpm` | all scripts | ✓ | project standard (all workflows use it) | — |
| `gh` CLI | Release publish | ✗ **locally** | not installed on the dev machine | Preinstalled on GitHub-hosted runners — only the *workflow* needs it. Local absence does not block. |
| GitHub Actions **schedule on a fork** | D-06 daily refresh | ⚠ **disabled by default** | — | `workflow_dispatch` + a one-time manual enable (Pitfall 7). **Not automatic — requires a human step.** |

**Missing dependencies with no fallback:** none.

**Missing dependencies with a fallback:**
- `gh` CLI locally — not needed locally; the workflow runs on GitHub runners.
- Scheduled-workflow-on-fork — mitigated by `workflow_dispatch` + a manual enable step, which the planner must schedule as an explicit human task.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest (`preset: 'ts-jest'`, `testEnvironment: 'node'`) |
| Config file | `jest.config.js` (root), with `projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend']` |
| Quick run command | `pnpm test -- --testPathPattern=crossover` |
| Full suite command | `pnpm test:ci` (`jest --runInBand --silent`) |
| Type gate | `pnpm codecheck` (`tsc --noEmit`) |

Existing precedent for this exact area: `src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts` (Phase 16). New tests belong in `src/backend/crossover_index/__tests__/`.

### Phase Requirements → Test Map

Requirement IDs are not yet minted, so this maps against the **decisions** they will be minted from.

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-04 + Pitfall 5 | Dedup picks highest cxversion, then most `num`, then lowest appid; **build is deterministic** (same input → byte-identical output) | unit | `pnpm test -- --testPathPattern=buildCrossoverIndex` | ❌ Wave 0 |
| D-05 | A collision logs and resolves; the build still emits an index | unit | `pnpm test -- --testPathPattern=buildCrossoverIndex` | ❌ Wave 0 |
| Pitfall 1/2 | The builder parses a real dump fixture (entity limits raised; `applications` wrapper; `appprofile`-nested fields) and yields a non-zero record count | unit (fixture) | `pnpm test -- --testPathPattern=buildCrossoverIndex` | ❌ Wave 0 |
| D-08 | An index older than 24 h triggers a refetch; a fresh one does not | unit | `pnpm test -- --testPathPattern=crossover_index/fetcher` | ❌ Wave 0 |
| D-09 | A malformed / truncated / oversized / junk-rating payload is **rejected** and the previous good index is retained | unit | `pnpm test -- --testPathPattern=crossover_index/schema` | ❌ Wave 0 |
| D-09 | A fetch failure keeps the last good index (never throws, never blanks) | unit | `pnpm test -- --testPathPattern=crossover_index/fetcher` | ❌ Wave 0 |
| **D-10** | **On Linux, `getInfoFromCodeweavers()` runs unchanged and `linuxRating` is preserved** (regression guard for the Phase 16 rating) | unit | `pnpm test -- --testPathPattern=wiki_game_info` | ❌ Wave 0 — **highest-value test in the phase** |
| D-11 | On macOS an index hit returns a `CodeweaversInfo` and the scraper is **not** called | unit | `pnpm test -- --testPathPattern=crossover_index/lookup` | ❌ Wave 0 |
| D-13 | On an index miss, no grid badge is produced and no bulk scrape is fired | unit | `pnpm test -- --testPathPattern=crossover_index/lookup` | ❌ Wave 0 |
| D-12 | Rating→label mapping is total: 5→gold, 4→silver, 3→bronze, ≤2→knownnottowork | unit | `pnpm test -- --testPathPattern=GameCard` | ❌ Wave 0 |
| D-15 | The medal badge renders with the correct `aria-label` | unit (RTL) | `pnpm test -- --testPathPattern=GameCard` | ✅ extend existing |
| D-16 | A non-looked-up game gets **no mark** (not a grey "unknown") | unit (RTL) | `pnpm test -- --testPathPattern=GameCard` | ❌ Wave 0 |
| D-17 | The rating filter partitions the library; tri-state semantics match the existing pattern | unit (RTL) | `pnpm test -- --testPathPattern=Library` | ✅ extend existing |
| D-18 | The `knownnottowork` warning renders and **does not block** the install action | unit (RTL) | `pnpm test -- --testPathPattern=InstallModal` | ❌ Wave 0 |
| **D-20** | **`slugify()` keeps the apostrophe drop and no longer converts roman numerals** (`Quake II` → `quake-ii`, `Alekhine's Gun` → `alekhines-gun`) | unit | `pnpm test -- --testPathPattern=codeweavers` | ✅ extend existing |
| D-01/D-02/D-03 | The measurement harness is **re-runnable** and emits an auditable report | script (not jest) | `pnpm measure-crossover-match` | ❌ Wave 0 |
| D-03 | The synthetic adversarial cases are **permanent regression tests** of the normalizer | unit | `pnpm test -- --testPathPattern=crossover_index/normalize` | ❌ Wave 0 |

**On the measurement's testability (D-01):** the *normalizer* is a pure function and belongs in `crossover_index/normalize.ts` with the synthetic hard-case set as ordinary Jest tests — permanently re-runnable, and they fail loudly if someone later "improves" the normalizer. The *statistics* (hit / miss / wrong-hit rates) belong in `meta/measureCrossoverMatching.ts`, run via `pnpm measure-crossover-match`, which reads the dump, the local library caches, and the synthetic fixture, and writes a dated Markdown report. Keeping these separate is what makes the measurement re-runnable rather than a one-off: the gate decision is an *artifact* (a committed report), while the normalizer's behavior is *enforced* (a test).

**Privacy note for the report:** the measurement reads the user's real library. The committed report should carry **aggregate counts + the synthetic cases**, not a full dump of the user's owned titles.

### Sampling Rate

- **Per task commit:** `pnpm test -- --testPathPattern=<touched area>` + `pnpm codecheck`
- **Per wave merge:** `pnpm test:ci`
- **Phase gate:** `pnpm test:ci` + `pnpm codecheck` + `pnpm lint` green, **and** the measurement report exists with an explicit PASS/FAIL against D-02's pre-committed bounds, before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `src/backend/crossover_index/__tests__/normalize.test.ts` — synthetic adversarial set (D-03)
- [ ] `src/backend/crossover_index/__tests__/schema.test.ts` — D-09 reject cases
- [ ] `src/backend/crossover_index/__tests__/fetcher.test.ts` — D-08 TTL, D-09 keep-last-good
- [ ] `src/backend/crossover_index/__tests__/lookup.test.ts` — D-10 isMac gate, D-11 index-first, D-13 miss path
- [ ] `meta/__tests__/buildCrossoverIndex.test.ts` — medal rule, D-04 dedup determinism, D-05 collisions
- [ ] **A trimmed `.tie` XML fixture** (~20 apps, hand-picked to cover: a Mac medal, a Linux-only medal, an AppID collision with an exact cxversion+num tie, a localized `<name>` set, an entity-heavy `<description>`). This fixture is the single most valuable Wave 0 artifact — it makes the builder testable without a 23.7 MB network fetch.
- [ ] Frontend: extend `GameCard` / `Library` / `InstallModal` test files for D-12/D-15/D-16/D-17/D-18
- [ ] Framework install: **none needed** — Jest + ts-jest + RTL are all configured.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user auth in this phase. The Release asset is public and fetched anonymously — no token ships in the client. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | yes (CI) | `permissions: contents: write` scoped to the one workflow that needs it. Every other workflow keeps `contents: read`. Do not widen the default token. |
| V5 Input Validation | **yes** | **The index is untrusted input.** It is fetched over the network and drives a user-facing claim. `zod` `safeParse` on every fetched payload (D-09), plus `maxContentLength` on the axios call to bound a hostile/oversized response — mirroring the `MAX_CONTENT_LENGTH` bound Phase 16 already applies to scraped pages. |
| V6 Cryptography | no | HTTPS via `axiosClient` (GitHub's TLS). No custom crypto. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Compromised/poisoned index injects junk medals ("this game won't run") | Tampering | D-09's zod validation with a **bounded** rating (`z.number().int().min(1).max(5)`) and a minimum entry count. Reject → keep last good. The rating range check is what stops junk from reaching the UI. |
| Hostile oversized payload exhausts memory | DoS | `maxContentLength` on the axios request (the Phase 16 pattern). The real payload is 41–58 KB; a 5 MB ceiling is generous. |
| Billion-laughs / entity expansion in the XML dump | DoS | Handled **in CI, not in the app** — the app never parses XML. And note the fix in Pitfall 1 *raises* fast-xml-parser's guard rails rather than disabling them (`processEntities: false` would be the unsafe shortcut). Raising `maxTotalExpansions` to 500 k on a trusted 23.7 MB source in an ephemeral CI runner is an acceptable, bounded risk. |
| Path traversal via a crafted slug | Tampering | Already mitigated in Phase 16 (T-16-01: `baseSlugify` output is `[a-z0-9-]` only). **D-20 must not regress this** — the roman-numeral removal touches `slugify()`, so the existing character-class guarantee must be preserved and its test kept. |
| Malicious `<name>` reaching the DOM | XSS | Names flow into React text nodes and `aria-label`s only — React escapes both. No `dangerouslySetInnerHTML`. The index carries no HTML (the dump's `<description>` field, which *does* contain HTML, is deliberately **not** in the index). |
| Supply-chain: a third-party release action | Tampering | Avoided — use the preinstalled `gh` CLI rather than a third-party action. Zero new supply-chain surface. |

## Sources

### Primary (HIGH confidence)
- **The live CodeWeavers dump** — downloaded and parsed during this session (2026-07-12). `curl -sI` → HTTP 200, `Content-Length: 3088416`, `Last-Modified: Sat, 11 Jul 2026 12:30:31 GMT`. All structural, coverage, sizing, collision, and normalizer findings were computed against it directly, and independently reproduce the settled numbers in `crossover-tie-dump-findings.md` (5,309 apps; 2,866 Mac-medal games; 1,620 with steamid; rating spread 1054/655/475/347/335) — which cross-validates both that note and this extraction.
- **The GameLib codebase** — read directly: `package.json`, `electron-builder.yml`, `electron.vite.config.ts`, `jest.config.js`, `.github/workflows/*` (all 14), `src/backend/constants/paths.ts`, `src/backend/constants/environment.ts`, `src/backend/cache.ts`, `src/backend/utils.ts`, `src/backend/wiki_game_info/*`, `src/common/types.ts`, `src/common/types/ipc.ts`, `src/frontend/state/GlobalStateV2.ts`, `src/frontend/screens/Library/index.tsx`, `src/frontend/screens/Library/components/GameCard/index.tsx`, `src/frontend/screens/Library/components/InstallModal/index.tsx`.
- **`node_modules/fast-xml-parser/src/fxp.d.ts`** — the `ProcessEntitiesOptions` type and its documented defaults (`maxTotalExpansions: 1000`, `maxExpandedLength: 100000`, `maxEntityCount: 100`). The `Entity expansion limit exceeded: 1001 > 1000` failure was **reproduced**, not inferred.
- **The real library caches** — `~/Library/Application Support/GameLib/store_cache/{steam,legendary,gog,nile}_library.json` (377 Steam / 15 Epic / 0 GOG / 0 Amazon).
- [GitHub Docs — Disabling and enabling a workflow](https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow) — *"When a public repository is forked, scheduled workflows are disabled by default"* and the 60-day inactivity rule.
- [GitHub Docs — Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) — scheduled workflows run only on the default branch; 5-minute minimum interval.
- [gh release create manual](https://cli.github.com/manual/gh_release_create) — `--latest=false`, auto tag creation, `--notes` / `--title` / `--target`.
- [gh release upload manual](https://cli.github.com/manual/gh_release_upload) — `--clobber` deletes and re-uploads same-named assets; requires an **existing** release.

### Secondary (MEDIUM confidence)
- [GitHub Docs — REST API for release assets](https://docs.github.com/en/rest/releases/assets) — the `releases/download/{tag}/{filename}` URL shape and its redirect-to-CDN behavior.
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release) / [svenstaro/upload-release-action](https://github.com/svenstaro/upload-release-action) — reviewed as alternatives to `gh`; both update an existing release, both rejected in favor of the preinstalled CLI.

### Tertiary (LOW confidence)
- The claim that Vite copies `public/` → `build/` on the renderer build (A1) is inferred from Vite's documented default `publicDir` plus the working `getCurrentChangelog()` production read. **Confirm with a one-off `pnpm dist:mac` + `ls build/` in Wave 0.**

## Metadata

**Confidence breakdown:**
- **Standard stack: HIGH** — every library verified present in `package.json` and exercised in-session. Zero new packages, so zero package-legitimacy risk.
- **Architecture: HIGH** — every pattern is an existing, working analog in this codebase (`changelog.json` for bundling, `CacheStore` for TTL, `getAllGameOverrides` for bulk IPC, `gameCardDelistedBadge` for the badge, the `FilterMode` chain for the filter). The one inferred link (Vite `public/` → `build/`) is flagged as A1 with a cheap confirmation step.
- **CI / delivery: HIGH** — dump availability, `gh` flags, fork-schedule behavior, and the tag-collision hazard all verified against official docs or the repo itself.
- **Pitfalls: HIGH** — Pitfalls 1, 2, 5, 8, 9 were each *reproduced against live data*, not recalled. Pitfalls 3, 4, 7 are verified against the repo's own workflows and GitHub's docs.
- **Measurement design: HIGH on the mechanism, MEDIUM on the predicted outcome** — the 123-pair ground-truth set is a verified fact; the 0-wrong-hit / 77–85%-hit preview is real but Steam-biased and explicitly *not* a substitute for the measurement D-01 mandates.

**Research date:** 2026-07-12
**Valid until:** ~2026-08-12 (30 days). The dump refreshes daily, so coverage counts drift slowly; the structural findings, library versions, and CI mechanics are stable. Re-verify the dump's shape if the builder is written more than a month from now.
