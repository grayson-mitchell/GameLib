# Phase 16: CrossOver Compatibility Rating (CodeWeavers) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 16-crossover-compatibility-rating-codeweavers
**Areas discussed:** Wine rating row fate, Steam AppID lookup strategy, CrossOver rating display format, Platform gating

---

## Wine rating row fate

| Option | Description | Selected |
|--------|-------------|----------|
| Keep on AppleGamingWiki | Leave the Wine row exactly as-is (categorical from AppleGamingWiki). Only the CrossOver row's source changes. Smallest blast radius. | ✓ |
| Remove the Wine row | Extra-info shows only a CrossOver rating row. Loses the Wine compatibility signal. | |
| Move to a new source | Replace Wine's source too (e.g. WineHQ AppDB). Expands scope significantly. | |

**User's choice:** Keep on AppleGamingWiki
**Notes:** CodeWeavers has no separate Wine rating (only CrossOver aggregateRating), so the Wine row has no live equivalent. Resolves roadmap open question #1.

---

## Steam AppID lookup strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Title-slug for all runners | Spike-validated constructed slug (apostrophe/roman-numeral fixes + secondary fallback) for every game. One code path, ~83% match. | ✓ |
| Reuse AGW codeweavers slug first | Use AppleGamingWiki's codeweavers slug as primary when present, else constructed slug. Higher accuracy but couples to Mac-only AGW data. | |
| Add AppID/sameAs path for Steam | Research whether CodeWeavers exposes an AppID lookup or Steam URL in JSON-LD sameAs. Most reliable if it exists — needs research. | |

**User's choice:** Title-slug for all runners
**Notes:** Keeps a single clean code path across all runners. Resolves roadmap open question #2 (no AppID-based path). AppID/sameAs reverse lookup deferred as a possible future refinement if match rate proves insufficient.

---

## CrossOver rating display format

| Option | Description | Selected |
|--------|-------------|----------|
| Numeric value + count | Show the raw rating faithfully, e.g. "4.5 / 5 (2 ratings)" or a star glyph. UI-phase can refine visuals. | ✓ |
| Map numeric → colored tiers | Bucket the numeric value into existing categorical tier labels so it matches the Wine row. Invents thresholds, hides the count. | |
| You decide / defer to UI-phase | Capture intent loosely; let UI-phase or the planner choose exact treatment. | |

**User's choice:** Numeric value + count
**Notes:** CodeWeavers aggregateRating is inherently numeric; mapping to categorical tiers would invent thresholds and drop the rating count. Exact visual polish left to UI-phase/planner.

---

## Platform gating

| Option | Description | Selected |
|--------|-------------|----------|
| Mac + Linux | Fetch CrossOver data on both platforms CrossOver actually supports. | ✓ |
| Mac-only | Match current AppleWikiInfo gating exactly. Linux users lose CrossOver data. | |
| All platforms | Show CrossOver rating everywhere including Windows. Less relevant for Windows. | |

**User's choice:** Mac + Linux
**Notes:** CrossOver by CodeWeavers is a Mac + Linux product. Implication captured in CONTEXT.md (D-08): the CrossOver row must render independently of AppleGamingWiki data, since AppleGamingWiki is not fetched on Linux.

---

## Claude's Discretion

- Cache location & TTL (reuse `wikiGameInfoStore` vs. dedicated store), following the established `EMPTY_APPLEGAMINGWIKI_INFO` cacheable-miss marker pattern.
- New backend service shape (`codeweavers/utils.ts` + `constants.ts`), type definitions, and integration into `getWikiGameInfo`'s parallel fetch.
- Exact User-Agent string (reuse existing browser UA pattern).
- Whether the row keeps AppleGamingWiki's existing `codeweavers` deep-link or uses the constructed slug.

## Deferred Ideas

- Move the Wine rating row to a live source (e.g. WineHQ AppDB) — own phase if ever wanted.
- Steam AppID / `sameAs`-based reverse lookup — revisit only if title-slug match rate proves insufficient in practice.
