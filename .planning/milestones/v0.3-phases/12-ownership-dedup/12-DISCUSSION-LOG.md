# Phase 12: Ownership Dedup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 12-ownership-dedup
**Areas discussed:** Steam-entry annotation, Owned badge on keys page, Match confidence & overrides, Match scope & recompute

---

## Steam-entry annotation (HDEDUP-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Game details page (Recommended) | Line on the Steam game's details page; established metadata surface, zero grid clutter | ✓ |
| Library tile badge | Humble icon on the library tile; competes with existing status badges | |
| Both | Details line + tile badge; more surface to maintain | |

**User's choice:** Game details page

| Option | Description | Selected |
|--------|-------------|----------|
| Origin only (Recommended) | "Includes a key from Humble Bundle: {bundle name}" | ✓ |
| Origin + purchase date | Bundle name plus order created date | |
| You decide | Claude picks copy/fields during planning | |

**User's choice:** Origin only

| Option | Description | Selected |
|--------|-------------|----------|
| Stays on keys page (Recommended) | Key remains a REDEEMED row; collapse only prevents a separate library-like entry | ✓ |
| Hidden from keys page | Row disappears once matched; inventory no longer complete | |
| Collapsed sub-section | Matched keys move to an "Already in your library" group | |

**User's choice:** Stays on keys page

| Option | Description | Selected |
|--------|-------------|----------|
| Normal REDEEMED row (Recommended) | No annotation on unmatched redeemed keys; no guessing | ✓ |
| Flag the mismatch | "Redeemed but not found in your Steam library" hint; false-alarm risk on delisted titles | |
| You decide | Claude picks during planning | |

**User's choice:** Normal REDEEMED row

---

## Owned badge on keys page (HDEDUP-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Badge per row (Recommended) | "Owned on Steam" badge — visible proof matching works before Phase 13 | ✓ |
| Backend only | Flag computed but invisible until Phase 13 | |

**User's choice:** Badge per row

| Option | Description | Selected |
|--------|-------------|----------|
| Fact only (Recommended) | Neutral "Owned on Steam"; recommendations arrive with Phase 13 views | ✓ |
| Fact + recommendation hint | Owned + UNREVEALED rows hint "giftable spare" early | |

**User's choice:** Fact only

| Option | Description | Selected |
|--------|-------------|----------|
| Badge only (Recommended) | Keep the Phase 11 D-21 layout untouched | ✓ |
| De-emphasize owned rows | Dim/sink owned rows within their state group | |

**User's choice:** Badge only

| Option | Description | Selected |
|--------|-------------|----------|
| Redeemed-only (Recommended) | Details annotation fires only for the HDEDUP-02 collapse; unclaimed-key surfacing is Phase 15 | ✓ |
| Also hint unclaimed keys | "Unredeemed Humble key available" on owned games' details pages | |

**User's choice:** Redeemed-only

---

## Match confidence & overrides

| Option | Description | Selected |
|--------|-------------|----------|
| Distinguish fuzzy (Recommended) | Exact → "Owned on Steam"; fuzzy → "Likely owned on Steam"; Phase 14 C2 can differentiate | ✓ |
| Identical treatment | One badge regardless of match method | |

**User's choice:** Distinguish fuzzy

| Option | Description | Selected |
|--------|-------------|----------|
| Override fuzzy only (Recommended) | "Not the same game" clears fuzzy matches (persisted); exact matches trusted | ✓ |
| No override in v1 | Wrong fuzzy match stays; blocks Phase 14 claims | |
| Override both directions | Also allow manual "mark as owned" | |

**User's choice:** Override fuzzy only

| Option | Description | Selected |
|--------|-------------|----------|
| Survive disconnect (Recommended) | Overrides join the D-04 wipe exemption, keyed by machine_name | ✓ |
| Wiped on disconnect | Clean-slate wipe resurrects known-wrong matches on reconnect | |

**User's choice:** Survive disconnect

| Option | Description | Selected |
|--------|-------------|----------|
| Trust the AppID (Recommended) | steam_app_id present → verdict final; fuzzy only when missing | ✓ |
| Fuzzy as second chance | AppID miss falls through to name matching; catches edition variants, more false-positive surface | |

**User's choice:** Trust the AppID

---

## Match scope & recompute

| Option | Description | Selected |
|--------|-------------|----------|
| All keys match (Recommended) | Every platform's keys matched vs Steam ownership; non-Steam keys via fuzzy path | ✓ |
| Steam keys only | Other platforms unmatched until a later phase | |

**User's choice:** All keys match

| Option | Description | Selected |
|--------|-------------|----------|
| Steam owned list only (Recommended) | Full Steam owned-apps list (installed or not), per the roadmap's Phase 12 scope | ✓ |
| All connected runners | Also fuzzy-match Epic/GOG/Amazon libraries — bigger phase, more false positives | |

**User's choice:** Steam owned list only

| Option | Description | Selected |
|--------|-------------|----------|
| Both sync paths (Recommended) | Recompute after every Humble sync AND on Steam library refresh; in-memory over cached data | ✓ |
| Humble sync only | New Steam purchases stay "Claim this" until the next Humble sync | |

**User's choice:** Both sync paths

| Option | Description | Selected |
|--------|-------------|----------|
| Keep last-known (Recommended) | Flags persist until a successful recompute against real Steam data | ✓ |
| Clear when Steam absent | Temporary Steam logout drops all ownership claims | |

**User's choice:** Keep last-known

---

## Claude's Discretion

- Fuzzy algorithm/library and title normalization (85%+ threshold and DLC guard are locked)
- Match-result/override store shapes, persisted-vs-recomputed `owned_elsewhere`
- IPC channel names, badge styling, i18n keys, override affordance placement
- Whether cached Phase 11 rows need a one-time `steam_app_id` backfill (acceptable; D-24 forbids recurring cost only)
- Confirming UNPICKED pseudo-entries are excluded from matching

## Deferred Ideas

- Ownership matching against Epic/GOG/Amazon libraries (spec F3 full "unified library" reading)
- Mismatch hint on unmatched REDEEMED rows (rejected for false-alarm risk; may return later)
