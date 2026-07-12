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
