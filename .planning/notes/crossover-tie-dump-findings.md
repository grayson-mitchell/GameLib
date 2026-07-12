---
title: CrossOver .tie daily dump — format, medal rule & verification
date: 2026-07-12
context: /gsd-explore session — CodeWeavers confirmed there is no compatibility API, but they publish a daily dump of CrossOver's own app-profile database. Explored using it as a local, offline compatibility index for library-wide tagging.
related_phase: 16 (CrossOver Compatibility Rating), 19 (CrossOver Compatibility Index)
---

# CrossOver `.tie` Dump — Findings

## Source

`https://ftp.codeweavers.com/pub/crossover/tie/crossover.tie.gz` — public, no auth,
refreshed daily. This is the app-profile database the CrossOver client itself
consumes ("TIE"), not a purpose-built export.

- **3.0 MB** gzipped / **23.7 MB** uncompressed
- Format: **XML** (`<c4p>` root). `fast-xml-parser@5.5.7` is already a project dependency.

## Structure

```xml
<app appid="com.codeweavers.c4.3" timestamp="...">
  <cxversion product="cxoffice">22.0</cxversion>
  <name>Half-Life</name>              <!-- plus <name lang="fr">, ja, nl, sk, zh-cn… -->
  <category>Games/Role Playing Games</category>
  <steamid>70</steamid>               <!-- present on ~1/3 of apps -->
  <appprofile>
    <description>…</description>
    <medal rating="5" platform="Mac" version="26.2.0" num="3" last="…">ungold</medal>
    <medal rating="1" platform="Linux" version="25.0.1" num="9" …>knownnottowork</medal>
  </appprofile>
  <bottletemplate>…</bottletemplate>  <!-- CodeWeavers' own per-game bottle tweaks -->
  <flag>…</flag>
  <installprofile>…</installprofile>
</app>
```

## Coverage (as of 2026-07-12)

| Metric | Count |
|---|---|
| `<app>` records total | 5,309 |
| …with `category` starting `Games` | 3,244 |
| …**games with at least one Mac medal** | **2,866** |
| …of those, carrying a `<steamid>` | 1,620 |
| Unique Steam AppIDs in the file | 1,551 |

Mac-medal rating spread across the 2,866: **1054 × 5 / 655 × 4 / 475 × 3 / 347 × 2 / 335 × 1**
— a genuinely discriminating signal, not a wall of golds.

Other categories present (all excludable): Productivity 566, Non-Applications 353,
Multimedia 320, Networking 199, Special Purpose 167.

## THE MEDAL RULE (verified)

Medals are recorded **per platform, per CrossOver version**, with `num` = number of
user ratings at that version. The rule that reproduces the public website is:

> **rating(platform) = the medal on the highest `cxversion` for that platform.**

`rating` is 1–5; the element text is the label: `gold`/`ungold` = 5, `silver`/`unsilver`
= 4, `bronze`/`unbronze` = 3, `knownnottowork` = 1 or 2. (The `un*` prefix distinguishes
community-submitted from CodeWeavers-tested; both map to the same numeric rating.)

**Verified 6/6 against the live site's JSON-LD** (the exact source today's
`getInfoFromCodeweavers()` scrapes):

| Slug | Dump (mac/linux) | Site (mac/linux) |
|---|---|---|
| terraria | 3 / 5 | 3 / 5 |
| rocket-league | 3 / 4 | 3 / 4 |
| fallout-4 | 5 / 5 | 5 / 5 |
| valorant | 2 / 1 | 2 / 1 |
| elden-ring | 5 / 2 | 5 / 2 |
| hades | 5 / — | 5 / (no Linux review) |
| cyberpunk-2077 | 5 / 1 | 5 / 1 |

Including the negative case: Hades has no Linux medal in the dump, and the site shows
no Linux review. **A dump-derived index is byte-identical to the scraped value** for any
app present in the dump — so it is a drop-in, with no two-sources-of-truth risk and no
UI change.

## The dump has no website slug — and that's an improvement

`<app>` carries no compatibility-page URL. The deep link
(`codeweavers.com/compatibility/crossover/{slug}`) must still be derived — but from the
dump's **canonical CodeWeavers name**, not from the store's game title. That removes the
title-mismatch guessing that makes today's lookup miss.

**This invalidates Phase 16's D-04 roman-numeral rule.** `slugify()` maps roman numerals
to arabic (`Quake II` → `quake-2`), but:

- `codeweavers.com/compatibility/crossover/quake-ii` → **HIT**
- `codeweavers.com/compatibility/crossover/quake-2` → **soft-404 (miss)**

The site slugifies its own name verbatim. Naive slugification of the dump name is the
correct rule; D-04's roman-numeral normalization was a workaround for guessing from
*store* titles and actively breaks games whose CodeWeavers name uses roman numerals.

## Index sizing

Filtering to `category=Games` + has-Mac-medal, and keeping only
`{name, slug, rating, medal label, cxversion, steamid?}`:

- **265 KB** raw JSON → **58 KB gzipped**

Small enough to fetch on every app start if we wanted to.

## Decisions taken in this session

1. **Dump-first, scrape-on-miss.** The local index answers instantly for the ~2.9k known
   games (Steam by exact AppID, others by name). A game absent from the dump falls back to
   today's slug-guess scrape, cached. The scraper stays as a safety net rather than being
   deleted.
2. **CI builds the index; the app fetches a small JSON.** A GitHub Action pulls the dump
   daily, distills it, and publishes the ~58 KB artifact. One machine hits CodeWeavers'
   FTP instead of every GameLib install; no 24 MB XML parse on the user's machine.
3. **macOS only.** Windows never needs it. Linux is better served by Proton — GameLib
   already shows ProtonDB + Steam Deck data there.

## Dead weight found while exploring

`wiki_game_info.ts:61` fetches CodeWeavers on `isMac || isLinux`, but
`AppleWikiInfo.tsx:49` gates rendering on `showCrossover = is.mac && !!codeweavers`.
**On Linux the CrossOver rating is fetched, cached, and never displayed.** Scoping the new
work to macOS deletes work that never mattered rather than removing a feature.

## Not pursued (see seed)

The dump also carries `<bottletemplate>`, `<flag>`, `<installprofile>`, and
`<preinstallregistry>` — CodeWeavers' own per-game bottle configuration. Directly adjacent
to `steamBottleDefaults.ts` / Phase 17. Captured as a seed.
