# Phase 7: Game Details Enrichment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 7-game-details-enrichment
**Areas discussed:** Platform display (DETAIL-01), Overlay placement & style (DETAIL-02), Overlay vs existing tab text, Rating semantics & gating

---

## Platform display (DETAIL-01)

### Visual
| Option | Description | Selected |
|--------|-------------|----------|
| OS icons only | Windows/Apple/Linux glyphs, Steam-store style | ✓ |
| Text labels | Plain 'Windows, macOS, Linux' text | |
| Icons + text | Icons with label/tooltip | |

### Placement
| Option | Description | Selected |
|--------|-------------|----------|
| Near the title / metadata row | Alongside genres/release-date, always visible | |
| Inside the Install-info tab | In the 'Install info' TabPanel | ✓ |

### Scope
| Option | Description | Selected |
|--------|-------------|----------|
| Steam games only | Gate on runner==='steam' | |
| All runners | Use is_mac_native/is_linux_native for every game | ✓ |

**User's choice:** OS icons, in the Install-info tab, for all runners.
**Notes:** All-runners choice means Steam must capture appdetails.platforms into the generic GameInfo platform flags so the shared indicator has data.

---

## Overlay placement & style (DETAIL-02)

### Which art
| Option | Description | Selected |
|--------|-------------|----------|
| Cover square (portrait art) | art_square near the title, reads like a box-art sticker | ✓ |
| Background hero image | Large blurred art_background | |

### Style
| Option | Description | Selected |
|--------|-------------|----------|
| Corner pill/badge | Small rounded pill in a corner | ✓ |
| Ribbon / banner strip | Horizontal strip across the art | |

### Color
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, color-coded | Tier→green/amber/red via semantic tokens | ✓ |
| Neutral single style | One accent color regardless of rating | |

**User's choice:** Color-coded corner pill on the portrait cover art.
**Notes:** Colors must use semantic tokens from _colors.scss.

---

## Overlay vs existing tab text

### Coexist?
| Option | Description | Selected |
|--------|-------------|----------|
| Keep both | Overlay + existing AppleWikiInfo tab row | ✓ |
| Overlay replaces tab row | Move rating entirely to art | |
| Overlay only, make it the link | Remove tab row, overlay is the link | |

### Clickable
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, clickable | Pill opens the codeweavers CrossOver link | ✓ |
| No, display-only | Overlay informational only | |

**User's choice:** Keep both surfaces; overlay is clickable to the CrossOver page.

---

## Rating semantics & gating

### Which rating
| Option | Description | Selected |
|--------|-------------|----------|
| crossoverRating | What AppleWikiInfo already uses | (default) |
| wineRating | Wine/native rating | |
| Prefer crossover, fall back to wine | Crossover else wine | |

**User's choice (free text):** "can set in settings default to crossover" — make the rating source a user-configurable setting, defaulting to CrossOver.

### Unrated
| Option | Description | Selected |
|--------|-------------|----------|
| Hide the overlay entirely | No pill when no rating | |
| Show a neutral 'Unrated' pill | Always show pill for Mac games | ✓ |

### Gate
| Option | Description | Selected |
|--------|-------------|----------|
| Derive from DETAIL-01 platform data | darwin + mac===true | ✓ |
| Gate on wiki data presence alone | Show whenever wiki returned a rating | |

**User's choice:** Unrated → neutral pill; gate derived from DETAIL-01 platform data.

---

## Rating-source setting (follow-up)

### Setting location
| Option | Description | Selected |
|--------|-------------|----------|
| Global setting (all games) | One app-wide toggle, default CrossOver | ✓ |
| Per-game setting | Toggle on each game's settings | |

### Applies to
| Option | Description | Selected |
|--------|-------------|----------|
| Both overlay and tab row | Preference drives both surfaces | ✓ |
| Overlay only | Tab row stays crossover always | |

**User's choice:** Global setting, applies to both the overlay and the Extra-info tab row.

---

## Claude's Discretion

- crossoverRating value vocabulary and tier→semantic-color mapping (confirm via research).
- Exact Settings location/label and persistence store for the rating-source toggle.
- Frontend plumbing of the global setting to components.
- Whether the Extra-info tab row shows "Unrated" or keeps returning null on empty (only the overlay must show "Unrated").
- Precise OS platform icon component set.

## Deferred Ideas

- DETAIL-03 — Linux/ProtonDB compatibility overlay. Deferred to post-v0.2. ProtonDB data already wired for Steam (quick task 260630-ud4).
