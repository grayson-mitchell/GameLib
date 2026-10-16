# Phase 19: CrossOver Compatibility Index (macOS) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 19-crossover-compatibility-index-macos
**Areas discussed:** v1 matching scope (Q1), Index delivery & refresh, Index vs existing scrape path, Badge + filter UX, Phase 18 mac-arch override list

---

## v1 matching scope (Q1)

| Option | Description | Selected |
|--------|-------------|----------|
| Steam-only, name matching deferred | Badge only exact `<steamid>` joins; zero false-positive risk | |
| Steam exact + normalized-exact names | Normalized-exact key for non-Steam; no fuzzy matching | |
| Measure first, then decide in-phase | Measurement task inside the phase; the number picks the rule | ✓ |

**User's choice:** Measure first, then decide in-phase
**Notes:** Follows Q1's own recommendation ("measure, don't theorize"). Puts a research spike inside an implementation phase, accepted knowingly.

| Option | Description | Selected |
|--------|-------------|----------|
| Zero wrong hits, or it doesn't ship | Strictest reading of "a false positive is worse than a miss" | |
| Wrong-hit rate under a fixed threshold | Pre-commit a ceiling and a coverage floor | ✓ |
| Ship Steam-only regardless | Measurement informs the follow-up only | |

**User's choice:** Wrong-hit rate under a fixed threshold
**Notes:** Gate fixed *before* the measurement runs, specifically so the result can't be rationalized after the fact.

| Option | Description | Selected |
|--------|-------------|----------|
| Ceiling <1% wrong, floor >40% hit | Strict | |
| Ceiling <2% wrong, floor >30% hit | Looser on both axes | ✓ |
| Ceiling <0.5% wrong, floor >50% hit | Most likely to fall back to Steam-only | |

**User's choice:** Ceiling <2% wrong, floor >30% hit

| Option | Description | Selected |
|--------|-------------|----------|
| My own GameLib library | Real distribution, single sample | |
| My library + a synthetic hard-case set | Real distribution + adversarial cases from Q1 | ✓ |
| Whatever the planner decides | Least prescriptive | |

**User's choice:** My library + a synthetic hard-case set

| Option | Description | Selected |
|--------|-------------|----------|
| Highest cxversion, then most ratings (num) | Mirrors the verified medal rule | ✓ |
| Most ratings (num), then highest cxversion | Prefers the community-rated record | |
| Most recent timestamp | Tracks freshness, not data quality | |

**User's choice:** Highest cxversion, then most ratings (num)
**Notes:** Surfaced during discussion that dedup is required even for a Steam-only index — the dump has 1,620 apps with a `<steamid>` but only 1,551 unique AppIDs, so ~69 AppIDs collide.

| Option | Description | Selected |
|--------|-------------|----------|
| Log + resolve, never fail the build | CI always publishes; collisions logged | ✓ |
| Fail the build on unbreakable ties | Stale-but-correct beats silently-arbitrary | |

**User's choice:** Log + resolve, never fail the build

---

## Index delivery & refresh

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Release asset (rolling tag) | No commits to the source tree; no Heroic merge churn | ✓ |
| Dedicated gh-pages / data branch | Also clean, plus a drift audit trail; one more branch | |
| Committed to main | Simplest, but ~365 commits/yr of churn in a rebased tree | |

**User's choice:** GitHub Release asset (rolling tag)
**Notes:** Driven by CLAUDE.md's Heroic-upstream mergeability constraint.

| Option | Description | Selected |
|--------|-------------|----------|
| Bundle a copy + refresh in background | Cold offline installs badge immediately; ~58 KB bundle cost | ✓ |
| Fetch-on-start with TTL, no bundle | Smaller bundle; fresh offline install shows no badges | |
| Fetch lazily on first library render | Cheapest startup; badges pop in after render | |

**User's choice:** Bundle a copy + refresh in background

| Option | Description | Selected |
|--------|-------------|----------|
| 24h TTL | Matches the source's daily cadence | ✓ |
| 7-day TTL | Medals move slowly; 7x less traffic | |
| On app start, always | Freshest; wasteful against a daily source | |

**User's choice:** 24h TTL

| Option | Description | Selected |
|--------|-------------|----------|
| Schema-validate + reject bad payloads, keep last good | A bad publish can't inject junk medals or brick badges | ✓ |
| Schema-validate + checksum against signed manifest | Also defends against tampering; more CI moving parts | |
| Trust the payload, guard only parse errors | Least code; silent degradation | |

**User's choice:** Schema-validate + reject bad payloads, keep last good

---

## Index vs existing scrape path

| Option | Description | Selected |
|--------|-------------|----------|
| Index store for grid; index also satisfies details lookups | One source on macOS; grid and details panel can't disagree | ✓ |
| Index store only; details panel keeps scraping | Least disruption; two-sources-of-truth risk | |
| Backfill wikiGameInfoStore from the index | One cache; writes ~2,866 entries for mostly-unowned games | |

**User's choice:** Index store for grid; index also satisfies details lookups

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — drop Linux, reverse D-07 | ROADMAP's proposed dead-weight cleanup | |
| Keep Linux fetching, badge macOS only | Smaller diff; knowingly leaves dead weight in place | ✓ |
| Drop Linux fetch AND surface Linux medals | Scope expansion beyond the ROADMAP | |

**User's choice:** Keep Linux fetching, badge macOS only
**Notes:** Phase 16's D-07 stands. The ROADMAP's scope item 7 "cleans up dead weight" claim is explicitly NOT delivered by this phase; recorded as a deferred idea instead.

| Option | Description | Selected |
|--------|-------------|----------|
| Index consulted only when host is macOS | Linux path preserved by construction | ✓ |
| Index-first everywhere, but only merge macRating | Still does the Linux round-trip | |
| Include Linux medals in the index | Larger index; expands scope into Linux badges | |

**User's choice:** Index consulted only when host is macOS
**Notes:** Raised during discussion as a correctness trap — the index is filtered to Mac-medal games, so an ungated index-first lookup would cache `linuxRating: null` on Linux and silently regress Phase 16's shipped Linux rating.

| Option | Description | Selected |
|--------|-------------|----------|
| Add optional medal + source fields to CodeweaversInfo | Explicit; keeps the `un*` distinction; type change | |
| Derive the medal label from the rating number | No type change; loses the `un*` distinction | ✓ |
| Separate index entry type | Cleanest separation, most plumbing | |

**User's choice:** Derive the medal label from the rating number
**Notes:** Consequence — the index no longer strictly needs the `medal` field the ROADMAP's schema proposed.

| Option | Description | Selected |
|--------|-------------|----------|
| No grid badge; scrape lazily on details-page visit | Scraper stays a safety net; grid never bulk-scrapes | ✓ |
| Scrape on miss to fill the grid | Complete badges; 200+ round-trips to paint one screen | |
| No badge, no scrape — index is the only source | Simplest; throws away the working scraper | |

**User's choice:** No grid badge; scrape lazily on details-page visit

---

## Badge + filter UX

| Option | Description | Selected |
|--------|-------------|----------|
| Colored medal glyph + accessible label | Scannable across a grid; follows gameCardDelistedBadge | ✓ |
| Text label overlay | Max consistency with existing pattern; noisy at scale | |
| Numeric rating (4/5) | Consistent with Phase 16 D-05; hard to scan on a grid | |

**User's choice:** Colored medal glyph + accessible label

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing — absence of a badge | Clean grid; can't distinguish "no data" from "not checked" | |
| Neutral "unknown" mark | More honest; risks greying out most of a non-Steam library | ✓ |

**User's choice:** Neutral "unknown" mark

| Option | Description | Selected |
|--------|-------------|----------|
| Only mark games we actually looked up | "Unknown" stays truthful under either measurement outcome | ✓ |
| Mark every unbadged game "unknown" | Simpler; overclaims for games never queried | |
| Only show the unknown mark when the filter is active | Clean by default; hides the distinction while browsing | |

**User's choice:** Only mark games we actually looked up
**Notes:** Raised as an interaction between decisions — if D-02's gate fails and v1 ships Steam-only, "mark everything unbadged" would grey out an entire non-Steam library with a mark that means "we didn't look."

| Option | Description | Selected |
|--------|-------------|----------|
| Filter only — "show me what runs" | Answers the stated user need directly | ✓ |
| Filter + sort | What the ROADMAP literally says; sort competes with existing ordering | |
| Sort only | Can't hide what won't run | |

**User's choice:** Filter only — deliberately narrows the ROADMAP's "filter/sort" phrasing

| Option | Description | Selected |
|--------|-------------|----------|
| Warn, don't block | Respects that the data is community-sourced and can be wrong | ✓ |
| Warn + require explicit confirmation | Harder to ignore; friction on a possible false negative | |
| No install warning in this phase | Smallest surface | |

**User's choice:** Warn, don't block

---

## Phase 18 mac-arch override list

| Option | Description | Selected |
|--------|-------------|----------|
| Defer the feature, generalize the infra | Build only the CrossOver index; parameterize the fetch layer | ✓ |
| Fold it in — build both indexes now | One phase; depends on unfinished Phase 18 work | |
| Fully out of scope — build CrossOver-specific | Least work now; refactor later | |

**User's choice:** Defer the feature, generalize the infra
**Notes:** Phase 18 is still executing (Plan 1 of 4) — the Mach-O check that would *produce* this data hasn't shipped.

| Option | Description | Selected |
|--------|-------------|----------|
| One consumer now, seam left at the obvious place | Parameterize URL + schema; no registry | ✓ |
| Full generic index framework | Over-builds an abstraction against one real consumer | |

**User's choice:** One consumer now, seam left at the obvious place

---

## Claude's Discretion

- Whether the index also carries the raw medal label alongside the rating number
- Exact index JSON schema, file naming, and rolling-tag name
- Where the index store lives and how it is loaded into the renderer
- Precise visual treatment of the medal glyph and the "unknown" mark (may be refined by `/gsd-ui-phase`)
- How the measurement task's findings are written up and where they land

## Deferred Ideas

- Crowd-sourced mac-arch override list (`mac-arch-overrides.json`) — blocked on Phase 18 completing
- The never-rendered Linux CrossOver fetch (dead weight; cleanup explicitly declined in favour of a smaller diff)
- Linux CrossOver badges (Linux is better served by Proton)
- The dump's `<bottletemplate>` / `<flag>` / `<installprofile>` data (seed captured)
