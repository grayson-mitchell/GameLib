# Open Research Questions

Questions surfaced during exploration that need deeper investigation before the work
that depends on them can be planned confidently.

---

## Q1 — How do we match non-Steam library titles onto the CrossOver dump's canonical names?

**Raised:** 2026-07-12 (/gsd-explore — CrossOver `.tie` dump)
**Blocks:** Phase 19 (CrossOver Compatibility Index) — specifically the library-wide badge
and filter for Epic / GOG / Amazon / Humble games
**Context:** `.planning/notes/crossover-tie-dump-findings.md`

### The problem

The dump gives us **2,866 game apps with a Mac medal**, of which only **1,620 carry a
`<steamid>`**. For Steam games, matching is exact and settled — join on AppID, done.

Everything else in a GameLib library (Epic, GOG, Amazon, Humble) has **no shared
identifier with the dump at all**. The only join key is the *title string*, and the two
sides disagree in exactly the ways title matching always disagrees:

- Editions and suffixes — `"Cyberpunk 2077"` vs `"Cyberpunk 2077: Ultimate Edition"`,
  GOG's `"(Game of the Year Edition)"`, Epic's trailing platform noise
- Roman vs arabic numerals — the dump says `Quake II`; a store may say `Quake 2`
- Punctuation — `Baldur's Gate 3` / `Baldurs Gate 3` / `Baldur’s Gate 3` (U+2019)
- The dump has **duplicate `<app>` records under the same name** — e.g. two `Half-Life`
  entries, only one carrying `steamid=70`. A name→app map needs a defined dedup/merge rule.
- The dump ships **localized `<name lang="…">` variants** (fr, ja, nl, sk, zh-cn — 18,969
  `<name>` elements across 5,309 apps). These are a matching *asset* if the user's library
  is localized, and noise otherwise.

### What needs deciding

1. **Normalization function** — how far to normalize before comparing (case, diacritics,
   punctuation, edition suffixes, numerals). Note: this is a *matching* key, and must NOT
   be conflated with the *slug* used to build the compatibility-page URL, where naive
   slugification of the dump name is provably correct and normalization is provably wrong
   (`quake-ii` HITs, `quake-2` soft-404s).
2. **Exact-only or fuzzy?** A false positive is worse than a miss here — badging a game
   "won't run" because it fuzzy-matched the wrong app is actively harmful. Does a
   normalized-exact match give acceptable coverage, or do we need edit-distance / token
   matching with a confidence floor?
3. **Dedup rule** for duplicate names in the dump — prefer the record with a `steamid`?
   The most recent `timestamp`? The one with the most medal submissions (`num`)?
4. **Do we even need it for v1?** Steam AppID matching alone covers 1,620 games with zero
   ambiguity. A defensible v1 is *Steam-only badges*, with name matching as a follow-up
   once we can measure real hit rates against actual libraries.

### How to answer it

Measure, don't theorize. Take a real GameLib library (Epic + GOG + Amazon + Humble
titles), run candidate normalizers against the 2,866 dump names, and count exact hits,
misses, and — most importantly — **wrong hits**. The answer is empirical and cheap to get.

---

## Q2 — What does migrating from CheapShark to IsThereAnyDeal actually cost?

**Raised:** 2026-07-12 (/gsd-explore — aggregated store search)
**Blocks:** Productionising Phase 20 (Aggregated Store Search) for non-US users; gates the
aggregated-discovery seed (`.planning/seeds/aggregated-discovery-multi-provider-deals.md`)
**Context:** `.planning/notes/aggregated-store-search-foundations.md`

### The problem

Phase 20 prototypes on **CheapShark** — deliberately, for speed: no API key, no approval, public
JSON. But CheapShark is **USD-only**, and GameLib's existing `Discounts` screen *already* models
currency properly (`CatalogLocaleSettings = { countryCode, locale, currencyCode }`). So the
prototype provider is strictly less capable than the app around it, and the provider interface
Phase 20 mints will have been designed against that weaker source.

**IsThereAnyDeal is the production target** because it is localised. The question is what the
switch actually costs — and the honest answer today is *we have not checked*. That uncertainty
is the whole reason this is a research question and not a task.

### What needs answering

1. **Access** — ITAD requires registering an app for an API key. Is it self-service and instant,
   or is there a human approval step / review queue? What are the **terms of use** — is a desktop
   game launcher an allowed client, and is there an attribution requirement? A hard gate here
   changes the plan, and finding it late would hurt.
2. **Currency & region coverage** — which countries/currencies does the API actually return prices
   for, and how is region passed (param, key config, account setting)? Does it map cleanly onto
   the `CatalogLocaleSettings` we already have, or is a translation layer needed?
3. **Rate limits & caching** — per-key limits, and whether a per-keystroke search box is even
   viable or whether we must debounce/cache aggressively. This shapes the search UX, not just
   the backend.
4. **Identity/matching** — does ITAD expose a Steam AppID (as CheapShark's `steamAppID` does)?
   That field is what makes the "you already own this" badge exact rather than fuzzy for Steam
   titles. Losing it would push *everything* onto fuzzy title matching and materially raise the
   false-positive risk.
5. **Interface delta** — given the above, how much of the Phase 20 provider interface survives?
   The goal of answering this early is to keep the CheapShark-specific damage **contained inside
   the adapter** rather than leaked into shared types and IPC payloads.

### Why it matters

The USD-only debt was accepted **knowingly** (see the note). This question is what converts it
from an open-ended "worry later" into a bounded, costed task. Answer it *before* the aggregated
discovery surface is built on top of the same interface — the cost of reshaping grows with each
consumer.
