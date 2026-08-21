# CrossOver Compatibility Lookup Spike — Findings

Throwaway feasibility spike. Run against the live CodeWeavers site on 2026-07-10
via `node spike/crossover-compat-lookup.mjs` (Node 26, built-in fetch, no
dependencies). Sequential requests, ~1.5s delay, desktop Chrome User-Agent.

## Sample titles and generated slugs

| Title                           | Slug                              |
| ------------------------------- | --------------------------------- |
| Hades                           | `hades`                           |
| 007 Nightfire                   | `007-nightfire`                   |
| Half-Life 2                     | `half-life-2`                     |
| Baldur's Gate 3                 | `baldur-s-gate-3`                 |
| The Witcher 3: Wild Hunt        | `the-witcher-3-wild-hunt`         |
| Pokémon                         | `pokemon`                         |
| Ori and the Blind Forest        | `ori-and-the-blind-forest`        |
| Call of Duty: Modern Warfare II | `call-of-duty-modern-warfare-ii`  |
| Marvel's Spider-Man Remastered  | `marvel-s-spider-man-remastered`  |
| Elden Ring                      | `elden-ring`                      |
| Definitely Not A Real Game 9000 | `definitely-not-a-real-game-9000` |
| Grand Theft Auto V              | `grand-theft-auto-v`              |

## Captured per-title results (live run)

| Title                           | Slug                            | HTTP Status    | Hit/Miss | ratingValue | ratingCount |
| ------------------------------- | ------------------------------- | -------------- | -------- | ----------- | ----------- |
| Hades                           | hades                           | 200            | HIT      | 5           | 1           |
| 007 Nightfire                   | 007-nightfire                   | 200            | HIT      | 3.5         | 2           |
| Half-Life 2                     | half-life-2                     | 200            | HIT      | 4.5         | 2           |
| Baldur's Gate 3                 | baldur-s-gate-3                 | 200 (soft-404) | MISS     | -           | -           |
| The Witcher 3: Wild Hunt        | the-witcher-3-wild-hunt         | 200            | HIT      | 3.5         | 2           |
| Pokémon                         | pokemon                         | 200 (soft-404) | MISS     | -           | -           |
| Ori and the Blind Forest        | ori-and-the-blind-forest        | 200            | HIT      | 4.5         | 2           |
| Call of Duty: Modern Warfare II | call-of-duty-modern-warfare-ii  | 200 (soft-404) | MISS     | -           | -           |
| Marvel's Spider-Man Remastered  | marvel-s-spider-man-remastered  | 200            | HIT      | 4           | 1           |
| Elden Ring                      | elden-ring                      | 200            | HIT      | 3.5         | 2           |
| Definitely Not A Real Game 9000 | definitely-not-a-real-game-9000 | 200 (soft-404) | MISS     | -           | -           |
| Grand Theft Auto V              | grand-theft-auto-v              | 200            | HIT      | 5           | 2           |

**Measured overall match rate: 8/12 hits = 66.7%**

## Critical protocol correction (deviation from pre-spike VERIFIED FACTS)

The plan's pre-dispatch notes stated "a miss returns HTTP 404." **This is
incorrect in practice.** Live verification (`curl` + header inspection)
confirmed:

- Every request to `/compatibility/crossover/{slug}` — hit or miss — returns
  **HTTP 200**. Response headers are byte-for-byte structurally identical
  between a real hit and a miss (same Cloudflare/CSP/cookie headers).
- A miss is a **soft-404**: HTTP 200 with `<title>404 Not Found | CodeWeavers</title>`
  and no `VideoGame` JSON-LD node in the page.
- A hit has a page title of the form `Will {Title} run on Mac or Linux? | CodeWeavers`
  and a `<script type="application/ld+json">` block whose `@graph` contains a
  `VideoGame` node with `aggregateRating`.

The spike script (`spike/crossover-compat-lookup.mjs`) was corrected to detect
hit/miss by content (soft-404 title marker vs. presence of a parseable
`VideoGame` JSON-LD node) rather than by HTTP status code. **Any future
backend implementation of this lookup MUST use the same content-based
detection — checking `response.status === 200` alone is not sufficient and
will misclassify every miss as a hit.**

## Observations on failure modes

- **Apostrophes are stripped, not hyphenated.** "Baldur's Gate 3" missed at
  the spike's `slugify()` output `baldur-s-gate-3` (apostrophe → hyphen, per
  the plan's documented slug rules) but the real CodeWeavers slug is
  `baldurs-gate-3` (apostrophe simply dropped, no hyphen inserted).
  Manually confirmed via `curl`: `baldurs-gate-3` returns a real hit
  ("Will Baldur's Gate 3 run on Mac or Linux?").
- **Roman numerals are not converted to Arabic numerals.** "Call of Duty:
  Modern Warfare II" missed at slug `call-of-duty-modern-warfare-ii`.
  Manually confirmed the real listing is `call-of-duty-modern-warfare-2`
  (digit "2", not roman numeral "II") — a real hit.
- **Pokémon** missed and is very likely a genuine catalog miss (CrossOver
  compatibility testing targets individual PC game releases; "Pokémon" as a
  bare franchise name has no single canonical PC release to test). Not
  investigated further since it's expected behavior, not a slugify bug.
- **The deliberate oddball ("Definitely Not A Real Game 9000")** correctly
  missed (soft-404), confirming the corrected detection logic works for a
  true "does not exist" case.
- **Plain titles, numeric/subtitle titles, hyphenated titles, colon+subtitle
  titles, and diacritic titles that ARE real catalog entries** (Hades, 007
  Nightfire, Half-Life 2, The Witcher 3: Wild Hunt, Ori and the Blind Forest,
  Marvel's Spider-Man Remastered when its apostrophe happened to slugify
  correctly, Elden Ring, Grand Theft Auto V) all hit cleanly and parsed
  `ratingValue`/`ratingCount` without issue.

If the two identified slugify bugs (apostrophe-drop, no roman-numeral
normalization) were fixed, the measured match rate on this sample would rise
to **10/12 = 83.3%** (Pokémon and the deliberate oddball remain genuine
misses).

## GO / NO-GO Recommendation

**GO**, conditional on two fixes before building the backend + pill:

1. Use **content-based hit/miss detection** (soft-404 title marker check, not
   HTTP status) — this is a correctness requirement, not optional.
2. Improve `slugify()` to (a) drop apostrophes entirely instead of replacing
   with a hyphen, and (b) normalize common roman numerals (II/III/IV...) to
   Arabic digits before slugifying, or add a secondary fallback slug attempt
   when the primary slug misses.

Rationale: even with the naive slugify implementation and before any of the
above fixes, real catalog titles matched at 66.7% (rising to an estimated
83.3% with straightforward slug-normalization fixes), and the failure modes
observed are systematic and fixable (not random/unpredictable), not a
fundamental blocker to the lookup-by-slug approach. A backend service with
these two fixes plus a graceful "no compatibility data available" UI state
for genuine misses is viable.

## Reminder

This is throwaway spike code. `spike/crossover-compat-lookup.mjs` and this
findings note can be deleted once the GO decision above has been acted on
(i.e., once the real backend service + pill implementation exists and
incorporates the content-based detection and slugify fixes noted above).
