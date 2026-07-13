# CrossOver Name-Matching Measurement Report

Generated: 2026-07-13T22:28:01.524Z
Dump Last-Modified: Mon, 13 Jul 2026 12:30:43 GMT

## D-02 pre-committed gate (fixed BEFORE this run)

- `WRONG_HIT_MAX = 0.02` (wrong hits must be < 2%)
- `HIT_RATE_MIN = 0.3` (hit rate must be > 30%)
- Evaluated ONLY on Sample 1 (the ground-truth set) — never on Sample 2 or 3 (D-02/D-03 amendment).

## Sample 1: Steam library ∩ dump-by-AppID ground-truth set (n=123)

> Read this honestly: Steam titles are the EASIEST case for this matcher — CodeWeavers' canonical names were sourced with a Steam AppID attached for roughly a third of the dump, so they track Steam's own titles closely. The true non-Steam (Epic/GOG/Amazon) hit rate is expected to be LOWER than this number (19-RESEARCH.md Pitfall 9). This bias is stated explicitly so the ground-truth number is read honestly, not as a universal hit rate.

| Candidate | HIT | WRONG | MISS | hitRate | wrongHitRate | Gate |
|---|---|---|---|---|---|---|
| A — exact lowercase | 95 | 0 | 28 | 77.24% | 0.00% | PASS |
| B — punctuation-stripped | 99 | 0 | 24 | 80.49% | 0.00% | PASS |
| C — punctuation + edition-suffix stripped | 105 | 1 | 17 | 85.37% | 0.81% | PASS |

**VERDICT: PASS** — winner: Candidate C — punctuation + edition-suffix stripped, wrongHitRate=0.81%, hitRate=85.37%. NAME_MATCHING_SHIPS = true.

## Sample 2: real non-Steam library (qualitative only, n=15, NO percentage computed — sample too small to be statistically meaningful)

| Title | Classification | Outcome (winning normalizer) |
|---|---|---|
| ARK: Survival Evolved | base game | MISS |
| The Outer Worlds | base game | HIT (rating 5) |
| The Outer Worlds: Spacer's Choice Edition | DLC/addon (excluded) | — |
| Phoenix Point | base game | MISS |
| Phoenix Point Content | DLC/addon (excluded) | — |
| SOMA | base game | MISS |
| Phoenix Point Art Book | DLC/addon (excluded) | — |
| Phoenix Point Blood and Titanium | DLC/addon (excluded) | — |
| Phoenix Point Legacy of the Ancients | DLC/addon (excluded) | — |
| Phoenix Point Festering Skies | DLC/addon (excluded) | — |
| Phoenix Point Corrupted Horizons | DLC/addon (excluded) | — |
| Phoenix Point - Kaos Engines | DLC/addon (excluded) | — |
| Phoenix Point Digital Game Manual | DLC/addon (excluded) | — |
| Phoenix Point Compendium | DLC/addon (excluded) | — |
| Phoenix Point Desktop Wallpaper | DLC/addon (excluded) | — |

## Sample 3: synthetic adversarial set (pass/fail per failure mode, never pooled into a rate)

| Case | A — exact lowercase | B — punctuation-stripped | C — punctuation + edition-suffix stripped |
|---|---|---|---|
| Apostrophe variant (U+0027 vs U+2019) | diverge | unify | unify |
| Roman vs Arabic numerals | diverge | diverge | diverge |
| Edition-suffix pair | diverge | diverge | unify |
| Chained edition-suffix ("... GOTY Edition") | diverge | diverge | unify |
| Duplicate-<app>-record base title (dedup is the builder's job, D-04) | unify | unify | unify |

## Whole-dump self-collision test (n=2866 Mac-medal records — a large-denominator wrong-hit proxy requiring no library)

| Candidate | Distinct keys | Colliding keys | Disagreeing keys (harmful) | Records at risk |
|---|---|---|---|---|
| A — exact lowercase | 2360 | 367 | 0 | 0 (0.00%) |
| B — punctuation-stripped | 2358 | 369 | 0 | 0 (0.00%) |
| C — punctuation + edition-suffix stripped | 2343 | 375 | 15 | 46 (1.61%) |

## Privacy note

This report carries aggregate counts and the synthetic test cases only. It does NOT include the full list of the user's owned titles (RESEARCH.md line 824) — Sample 2's table is limited to the ~5 real non-Steam base games after DLC/add-on filtering, not the whole library.
