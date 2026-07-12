# Phase 19: CrossOver Compatibility Index (macOS) - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Every game in the macOS library carries a CrossOver medal badge and can be filtered by it,
served offline from a small CI-built index of CodeWeavers' daily `.tie` dump — instead of
the per-game live HTML scrape, which cannot populate a whole library and guesses its URL
from the store's title.

**In scope:** the CI index builder (GitHub Action), the index delivery/fetch/cache layer,
the dump-first lookup on macOS, a measurement task that decides whether non-Steam name
matching ships, the grid medal badge, a rating filter, and a non-blocking install-modal
warning for `knownnottowork` titles.

**Not in scope:** Linux badges, Windows anything, the dump's `<bottletemplate>` /
`<flag>` / `<installprofile>` data, and the crowd-sourced mac-arch override list
(deferred — see `<deferred>`).

</domain>

<decisions>
## Implementation Decisions

### Matching Scope (resolves Q1)

- **D-01: Measure, then decide in-phase.** Phase 19 includes a measurement task that runs
  candidate normalizers against the 2,866 Mac-medal dump names and counts hits, misses, and
  — critically — **wrong hits**. The outcome selects between Steam-only badges and
  Steam + non-Steam name matching. This is Q1's own recommendation ("measure, don't
  theorize; the answer is empirical and cheap to get").

- **D-02: The promotion gate is pre-committed, before the measurement runs.** Non-Steam
  name matching ships in v1 **only if** wrong hits are **<2%** of claimed titles
  **AND** the hit rate is **>30%**. If either bound fails, v1 ships **Steam-AppID-only
  badges** and name matching becomes a follow-up phase. The gate is fixed in advance
  specifically so the number cannot be rationalized after the fact.

  > **AMENDED 2026-07-12 (post-research).** The gate is measured against the **123
  > ground-truth pairs** (see D-03), NOT against the raw non-Steam library.
  > **Why:** the real non-Steam library is 15 Epic entries, ~10 of which are DLC / art books /
  > wallpapers — about five real games. On n=15 the smallest possible non-zero error rate is
  > 6.7%, so a "<2%" bound silently collapses into "pass only if *exactly zero* wrong." That is
  > the strictest-possible gate by arithmetic accident, and it is explicitly **not** the option
  > that was chosen when offered. Scoring on the 123 pairs keeps the <2% / >30% bounds
  > *meaningful* rather than degenerate. The bounds themselves are unchanged.
  >
  > *Steam AppID joins remain exact and are NOT subject to this gate — the AppID join is the
  > ground truth the gate is measured against, not a thing the gate judges.*

- **D-03: The measurement sample is the 123 Steam ground-truth pairs, plus a synthetic
  hard-case set.**

  > **AMENDED 2026-07-12 (post-research).** Originally "the real library + a synthetic set."
  > Research found the real non-Steam library is too small to measure anything (see D-02).
  >
  > **The ground-truth set:** the user's Steam library (377 titles) ∩ dump-by-AppID =
  > **123 pairs where the correct dump record is already known** by exact AppID join. Hold out
  > the AppID, match on **name only**, and score the result against the record the AppID proves
  > correct. This yields a real, labelled wrong-hit count on a sample 8× larger than the
  > non-Steam library — and it measures precisely what the gate cares about: *does name matching
  > select the WRONG record?*
  >
  > **Still required:** the synthetic hard-case set (edition suffixes, roman vs arabic numerals,
  > apostrophe variants incl. U+2019, duplicate-`<app>` records) — it covers failure modes the
  > library happens not to contain.
  >
  > **Non-Steam titles** are still run through the matcher and their **hit rate reported**, but
  > their wrong-hit rate carries no statistical weight at n≈5 and must not be used to pass or
  > fail the gate.
  >
  > **Research preview (indicative, not a substitute for the real measurement):** three candidate
  > normalizers scored **0 wrong hits** at 77.2% / 80.5% / 84.6% hit rates. A self-collision test
  > across all 2,866 dump names found **punctuation stripping is free** (zero rating-disagreeing
  > collisions) while **edition-suffix stripping is where harm enters** (~1.2% of records at
  > risk). Edition-suffix handling is therefore the live trade-off this measurement must
  > adjudicate — it is the knob, not an afterthought.

- **D-04: Dedup rule — highest `cxversion`, then most ratings (`num`), then `appid` ascending.**
  Required even for a Steam-only index. The first two keys deliberately mirror the verified
  medal rule ("rating = medal on the highest cxversion"), so the index applies one principle
  throughout rather than two.

  > **AMENDED 2026-07-12 (post-research). Two corrections:**
  >
  > **(a) The collision count was wrong.** CONTEXT originally said "~69 AppIDs collide," derived
  > from `1,620 − 1,551`. That subtraction is invalid — it mixes a Mac-medal-scoped numerator
  > against a whole-file-scoped unique count. The true figure **within the index's own scope is
  > 205 colliding AppIDs across 261 records** (~3× larger).
  >
  > **(b) The two-key tiebreak does not totally order the records.** Many collisions have
  > *identical* `cxversion` AND *identical* `num` (`Quake`, `EverQuest`, `Ghost Recon`) — a total
  > tie, which makes the CI build **non-deterministic**. A third key is therefore mandatory:
  > **`appid` ascending.** This is a strict refinement, not a contradiction — the first two keys
  > still decide wherever they can, and `appid` only breaks the residual ties.
  >
  > **Blast radius:** only **7 of the 205** collisions actually disagree on rating, so the
  > arbitrary-but-stable pick is nearly always harmless. Determinism is the point.

- **D-05: Collisions log and resolve; they never fail the build.** CI picks a winner by D-04,
  emits the collision count as a build artifact so drift stays visible, and always publishes.
  The index is an enhancement — a broken daily build must not be able to block anything.
  With D-04's third key the resolution is now always total, so "unbreakable tie" no longer
  exists as a failure mode; the logging requirement stands as a drift signal.

### Index Delivery & Refresh

- **D-06: Publish to a GitHub Release asset on a rolling tag.** The daily Action attaches the
  ~58 KB gzipped JSON to a rolling release. **Rationale is the upstream-mergeability constraint
  in CLAUDE.md** — GameLib must stay mergeable with Heroic, and committing a daily-rebuilt
  artifact to `main` would add ~365 commits/year of churn to a tree that gets rebased on
  upstream. Release assets keep the source tree clean.

- **D-07: Bundle a snapshot at build time; refresh in the background.** A copy of the index
  ships in the app bundle, so a fresh install badges immediately and works fully offline. The
  app then fetches the latest in the background and swaps it in. Costs ~58 KB of bundle size
  and removes every first-run failure mode.

- **D-08: 24-hour TTL.** Matches the source's own daily cadence — never fetch more often than
  the data can change.

- **D-09: Schema-validate the fetched payload; on rejection, keep the last good index.** A
  malformed, truncated, or oversized payload is rejected and the previous good index (or the
  bundled snapshot) stays in use. This exists because the index drives a user-facing claim
  ("this game won't run"), so a bad CI publish must not be able to inject junk medals or brick
  the badges.

### Index vs the Existing Scrape Path (Phase 16)

- **D-10: The index-first lookup is gated on `isMac`.** On Linux, `getInfoFromCodeweavers()`
  runs exactly as it does today — untouched. **This is a correctness requirement, not a
  preference:** the index is built by filtering to games with a *Mac* medal, so it carries no
  Linux ratings by construction. An ungated index-first lookup would return `linuxRating: null`
  on a Linux hit and cache it, silently regressing the Linux rating Phase 16 shipped.

- **D-11: On macOS, the index is the single source for both consumers.**
  `getInfoFromCodeweavers()` checks the index first and returns a `CodeweaversInfo` from it on
  hit, so the library grid and the game-details panel cannot disagree. The scrape runs only on
  an index miss.

- **D-12: Derive the medal label from the rating number in the UI — no `CodeweaversInfo` type
  change.** Mapping is total: 5→gold, 4→silver, 3→bronze, ≤2→knownnottowork. Consequence: the
  index does not strictly need the `medal` field the ROADMAP's proposed schema lists. (Keeping
  the raw label in the index anyway, purely as a check that the derivation matches the source,
  is planner's discretion.) The `un*` prefix distinction — community-submitted vs
  CodeWeavers-tested — is knowingly discarded.

- **D-13: Index miss → no grid badge, but the scrape still runs lazily on a details-page
  visit.** Caching behavior is unchanged from Phase 16. The scraper is retained as the safety
  net the ROADMAP describes. The grid must **never** fire bulk scrapes to paint itself — a
  200-game library would mean 200+ round-trips to CodeWeavers for one screen.

- **D-14: Phase 16's D-07 STANDS — the Linux fetch is NOT removed.** The ROADMAP's scope item 7
  proposed deleting the never-rendered Linux CrossOver fetch as dead-weight cleanup. That
  cleanup is explicitly **not delivered by this phase**; the smaller diff was preferred. The
  dead weight is recorded in `<deferred>` rather than silently dropped.

### Badge + Filter UX

- **D-15: Colored medal glyph with an accessible label** on the grid tile — gold / silver /
  bronze / red, with the full text (e.g. "Runs great — CrossOver gold") in an `aria-label`.
  Follows the established `gameCardDelistedBadge` pattern (visual + `aria-label`) from
  Phase 08.1. Scannability across a whole grid is the entire point of a library-wide badge.

- **D-16: A neutral "unknown" mark, shown ONLY on games actually looked up.** "Unknown" must
  mean *"we searched the index and it isn't there"* — never *"we didn't look."* If D-02's gate
  fails and v1 ships Steam-only, non-Steam tiles therefore get **no mark at all**, rather than a
  grid full of misleading grey. This keeps the badge honest under either measurement outcome.

- **D-17: Filter only — no sort.** A rating filter alongside the existing library filters (the
  delisted / non-available pattern in `src/frontend/screens/Library/index.tsx`). This
  deliberately narrows the ROADMAP's "filter/sort" phrasing: filtering answers the stated user
  need ("show me what actually runs on my Mac"); sorting a grid by medal is a weaker want that
  would also compete with existing alphabetical/recent ordering and need a rule for where
  unrated games land.

- **D-18: The install-modal warning warns but does not block.** For `knownnottowork` titles,
  show a clear warning and let the user proceed. The data is community-sourced and can be a
  false negative (335 games carry a rating of 1), and the user may know better than the index.

### Index Infrastructure Shape

- **D-19: Build the fetch/TTL/schema-validate/keep-last-good layer parameterized by index
  identity** (name, URL, schema) rather than hardcoded to CrossOver — so a second index drops in
  without rework. **Deliberately NOT a generic index framework:** no plugin registry, no
  pluggable-schema abstraction. One real consumer exists; the seam is left exactly where the URL
  and schema are named, and no further. This mirrors the ROADMAP's own warning against
  over-building the Phase 20 provider interface before it survives one real consumer.

### Corrections to Prior Phase Decisions

- **D-20: Phase 16's D-04 roman-numeral rule is REVERSED.** `slugify()` must **keep** the
  apostrophe drop (correct and load-bearing — the site serves `alekhines-gun`, not
  `alekhine-s-gun`; 118 games depend on it) and **delete** the roman→arabic conversion (wrong —
  the site serves `age-of-empires-ii`, `armored-core-vi-fires-of-rubicon`, `quake-ii`; every
  arabic form soft-404s; 172 games affected). CodeWeavers names track each game's *official*
  branding and store titles do too, so both sides already agree — normalizing numerals forces
  apart two strings that matched. Cost today is a wasted round-trip, not a lost rating (the
  `naiveSlugify` fallback recovers all 172). See
  `.planning/notes/crossover-tie-dump-findings.md` § "D-04's roman-numeral rule is wrong".

  **Keep the *slug* function distinct from the *matching* key (D-01/D-03).** For slugs,
  verbatim is provably right and normalization provably wrong. For matching, normalization is
  the open question. Conflating them is the trap.

### Execution Traps (from research — each would cost an execution cycle)

Verified against live data during research, not recalled. See `19-RESEARCH.md` for detail.

- **T-01: `fast-xml-parser@5` throws on this dump out of the box** — `Entity expansion limit
  exceeded: 1001 > 1000`. Its v5 security defaults (`maxTotalExpansions: 1000`,
  `maxExpandedLength: 100_000`) are orders of magnitude below a 23.7 MB document. Fix via a
  `ProcessEntitiesOptions` object — **NOT** `processEntities: false`, which would leave `&amp;`
  undecoded in names like `Command & Conquer`.

- **T-02: the dump's real XML shape differs from the snippet in the findings note.** The root
  path is `c4p > applications > app[]`, and `steamid` / `category` / `medal` live **inside
  `<appprofile>`**, not as direct children of `<app>`. Extracting against the documented shape
  silently yields **zero records**.

- **T-03: GitHub disables scheduled workflows on forks by default.** GameLib is a fork, so
  D-06's daily Action will **silently never run** until a human clicks "Enable workflow" — and
  is then subject to 60-day-inactivity auto-disable. Requires: a `workflow_dispatch` trigger, an
  explicit human enable step, and a `generatedAt` staleness signal in the index so a silently
  dead builder is visible rather than invisible.

- **T-04: the rolling tag must not match `v*`** — that pattern would trigger
  `draft-release-mac.yml`'s signed/notarized build every day. It must also use `--latest=false`,
  or the index release shadows real app releases on the repo's Releases page.

- **T-05: the project uses `pnpm`, not `npm`.** Any plan writing `npm run …` is wrong.

### Claude's Discretion

- Whether the index also carries the raw medal label alongside the rating number (D-12).
- Exact index JSON schema, file naming, and rolling-tag name (D-06).
- Where the index store lives and how it is loaded into the renderer (D-11).
- Precise visual treatment of the medal glyph and the "unknown" mark (D-15/D-16) — may be
  refined by `/gsd-ui-phase`.
- How the measurement task's findings are written up and where they land (D-01).

### Folded Todos

- **`steam-getproductinfo-appinfo-dump.md`** — *"Runtime getProductInfo appinfo dump to lock
  the osarch parser."* Matched this phase (score 0.6) but belongs to **Phase 18's** Mach-O /
  osarch work, not to the CrossOver index. **Not folded** — see `<deferred>`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The dump, the medal rule, and the slug fix
- `.planning/notes/crossover-tie-dump-findings.md` — the `.tie` dump's format, coverage
  (5,309 apps / 2,866 with a Mac medal / 1,620 with a `<steamid>` / 1,551 unique AppIDs), the
  **medal rule verified 6/6 against the live site**, index sizing (265 KB raw → 58 KB gz), and
  the D-04 roman-numeral analysis behind D-20. **The single most important ref for this phase.**

### The open question this phase resolves
- `.planning/research/questions.md` §Q1 — "How do we match non-Steam library titles onto the
  CrossOver dump's canonical names?" D-01/D-02/D-03/D-04 are this phase's answer. Read the
  failure modes it enumerates before designing the normalizer.

### What Phase 16 already shipped (and what Phase 19 changes)
- `.planning/phases/16-crossover-compatibility-rating-codeweavers/16-CONTEXT.md` — D-01..D-09.
  Note **D-04 is reversed by D-20** and **D-07 is explicitly upheld by D-14**.
- `src/backend/wiki_game_info/codeweavers/utils.ts` — the live scraper: `slugify()`,
  `naiveSlugify()`, content-based soft-404 detection, per-OS JSON-LD parsing, and the
  cacheable-miss vs retryable-error distinction. The index sits in front of this; it does not
  replace it.
- `src/backend/wiki_game_info/wiki_game_info.ts` — where CodeWeavers slots into the
  `Promise.all`, the `isMac || isLinux` fetch gate (D-14), and the stale-cache self-heal logic.
- `src/common/types.ts` — `CodeweaversInfo` (`macRating` / `linuxRating` / `slug`), which D-12
  leaves unchanged.

### UI patterns to follow
- `src/frontend/screens/Library/components/GameCard/index.tsx` — `gameCardDelistedBadge` is the
  badge analog for D-15 (visual + `aria-label` overlay span).
- `src/frontend/screens/Library/index.tsx` — the delisted / non-available filter wiring is the
  analog for D-17.

### The deferred arch-override list
- `.planning/notes/steam-mac-arch-detection-decisions.md` — why the Mach-O check is the only
  ground truth for 32-bit, and the opt-in / GitHub-native / review-gate constraints that carry
  forward to the deferred override-list phase (D-19).

### Project constraints
- `CLAUDE.md` — the Heroic-upstream mergeability constraint that drives D-06.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getInfoFromCodeweavers()`** (`codeweavers/utils.ts`) — the working scraper. Becomes the
  index's fallback rather than being deleted (D-13). Its cacheable-miss vs retryable-error
  split (Phase 16 D-09) is a pattern to preserve.
- **`CodeweaversInfo`** (`common/types.ts`) — unchanged by D-12; the index produces this shape
  on a hit, so the details panel needs no rework.
- **`wikiGameInfoStore`** — the existing title-keyed cache. Note it is populated *per-game on
  details-page visit*, so it cannot serve a library-wide grid on its own; the index store is a
  separate bulk-queryable thing (D-11).
- **`gameCardDelistedBadge`** + **`gameCardUpdateBadge`** (`GameCard/index.tsx`) — established
  card-overlay badge pattern with `aria-label`; the medal badge follows it (D-15).
- **`fast-xml-parser@5.5.7`** — already a project dependency; the CI builder needs it to parse
  the 23.7 MB XML. No new runtime dep for the app itself (the app only reads JSON).

### Established Patterns
- **Content-based hit/miss detection, never HTTP status** (Phase 16 D-03) — every CodeWeavers
  response is HTTP 200. Preserved wherever the scraper still runs.
- **Cacheable "checked, none found" marker vs null-on-error** (Phase 16 D-09) — misses cache,
  errors retry. The index's miss path should not break this.
- **`source: 'macho'` field on Phase 18's arch cache** — the same "which path answered this"
  provenance idea, if the planner wants it for debuggability.

### Integration Points
- `wiki_game_info.ts` `Promise.all` — where the index-first check is inserted, gated on `isMac`
  (D-10).
- `GameCard` render — the medal badge overlay (D-15).
- `Library/index.tsx` filter chain — the rating filter (D-17).
- `InstallModal` — the non-blocking `knownnottowork` warning (D-18).
- `.github/workflows/` — a new daily Action joins the 14 existing workflows (D-06).

</code_context>

<specifics>
## Specific Ideas

- The **medal rule is already verified 6/6 against the live site, including a negative case**
  (Hades has no Linux medal in the dump; the site shows no Linux review). A dump-derived index
  is therefore *byte-identical* to today's scraped value for any app present in the dump. This
  is what makes the index a drop-in with no two-sources-of-truth risk — do not redesign around
  a fear that the dump and the site disagree. They don't.

- The Mac-medal rating spread across the 2,866 games is **1054 × 5 / 655 × 4 / 475 × 3 /
  347 × 2 / 335 × 1** — a genuinely discriminating signal, not a wall of golds. The filter in
  D-17 will actually partition a library.

- The user explicitly chose the **smaller diff** over the ROADMAP's proposed Linux cleanup
  (D-14). Do not "helpfully" delete the Linux fetch while working nearby.

</specifics>

<deferred>
## Deferred Ideas

- **Crowd-sourced mac-arch override list** (`mac-arch-overrides.json`). Phase 18's post-install
  Mach-O check produces a fact CodeWeavers' dump doesn't carry — "AppID X's mac build is
  *actually* i386-only, despite Steam not tagging it `osarch=32`" — and the same
  offline-index-from-GitHub delivery pattern could turn it into a **pre-install** hint for all
  users. **Deferred because Phase 18 is still executing** (Plan 1 of 4): the data this would
  distribute does not exist yet. D-19 keeps Phase 19's fetch layer parameterized so the
  follow-up phase adds it as a second index without rework.
  **Constraints that carry forward:** opt-in per submission only — never silent telemetry (a
  bare AppID reveals ownership); GitHub-native transport (prefilled issue / copyable JSON +
  maintainer-reviewed PR), no app-side auto-PR; the human review gate is what mitigates
  poisoning, since the list acts pre-install, before any local Mach-O override.

- **The never-rendered Linux CrossOver fetch.** `wiki_game_info.ts` fetches CodeWeavers on
  `isMac || isLinux`, but `AppleWikiInfo.tsx` gates rendering on `is.mac` — so on Linux the
  rating is fetched, cached, and never displayed. The ROADMAP proposed cleaning this up in
  Phase 19; **D-14 explicitly declines** in favour of a smaller diff. Recorded here so it is not
  lost.

- **Linux CrossOver badges.** The dump carries Linux medals too. Out of scope: Linux is better
  served by Proton, and GameLib already shows ProtonDB + Steam Deck data there.

- **The dump's `<bottletemplate>` / `<flag>` / `<installprofile>` data** — CodeWeavers' own
  per-game bottle configuration, directly adjacent to `steamBottleDefaults.ts` / Phase 17.
  Captured as `.planning/seeds/crossover-bottle-templates-from-tie-dump.md`, gated on whether
  CodeWeavers' per-game profiles apply to GameLib's bottled-Steam model.

### Reviewed Todos (not folded)

- **`steam-getproductinfo-appinfo-dump.md`** — "Runtime getProductInfo appinfo dump to lock the
  osarch parser." Keyword-matched this phase (0.6) on *dump* / *macos* / *bit*, but it concerns
  Steam PICS appinfo and 32-bit detection, which is **Phase 18's** domain. Not folded.

</deferred>

---

*Phase: 19-crossover-compatibility-index-macos*
*Context gathered: 2026-07-12*
