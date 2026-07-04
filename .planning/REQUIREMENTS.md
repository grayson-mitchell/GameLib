# Requirements: GameLib — v1.1 Polish & Enhancements

**Defined:** 2026-07-02
**Core Value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

> v1.0 requirements (AUTH-01..05, LIB-01..04, GAME-01..04, BRAND-01) shipped and are archived in `.planning/milestones/v1.0-REQUIREMENTS.md`. IDs below continue that numbering.

## v1.1 Requirements

Requirements for the v1.1 milestone. Each maps to exactly one roadmap phase.

### Branding & Docs

- [ ] **BRAND-02**: macOS menu-bar (tray) tooltip reads "GameLib" instead of "Heroic" (BUG-001)
- [ ] **BRAND-03**: Residual backend log and dialog strings that still say "Heroic" read "GameLib"
- [ ] **BRAND-04**: README accurately documents GameLib — the fork, Steam support, and build/install steps (ENH-007)

### Stores

- [x] **STORE-01**: User can browse the Steam storefront from the sidebar Stores section, alongside the Epic and GOG store tabs (ENH-002)

### Game Details

- [ ] **DETAIL-01**: The game details page shows the game's supported platforms (ENH-004)
- [ ] **DETAIL-02**: On macOS, Mac games show an AppleGamingWiki compatibility rating overlay on the game art (ENH-005)

### App & About

- [ ] **APP-01**: Clicking the version number opens GameLib release notes that describe what changed in GameLib and link to the corresponding upstream Heroic release (ENH-003)

### Library

- [ ] **LIB-05**: Steam playtime is shown on library-grid tiles, not only on the game details page
- [ ] **LIB-06**: The download-manager queue shows the real install size instead of `'?? MB'`
- [ ] **LIB-07**: Steam's delisted signal (is_delisted) drives the Library "show non-available" filter — non-available means delisted, not merely not-installed
- [ ] **LIB-08**: A delisted Steam game renders a greyed "Game no longer available" placeholder with its install option disabled
- [ ] **LIB-09**: Library "Show Hidden" and "Show non-Available" filters gain tri-state Off/Show/Only modes

### Game Operations

- [ ] **GAME-05**: A "Playing" status badge is shown while a Steam game session is active

### Console Mode

- [x] **CONSOLE-01**: Steam games appear in Console mode and can be launched from it (ENH-006)

### Quality

- [ ] **QA-01**: A formal Nyquist validation pass is completed and recorded for the shipped v1.0 phases

## Future Requirements

Deferred beyond v1.1. Tracked but not in the current roadmap.

### Game Details

- **DETAIL-03**: On Linux, games show a ProtonDB compatibility rating overlay on the game art (follow-up to DETAIL-02/ENH-005)

### Settings

- **API-01**: Copy-to-clipboard button on the API key field, Settings → API (ENH-001 — dropped from v1.1)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Other new platforms (Ubisoft Connect, itch.io, Xbox) | Steam first; other stores are a separate future milestone |
| Replacing Steam client functionality (friends, community, overlay) | GameLib is a launcher, not a Steam client replacement |
| Purchasing/checkout flows inside the Steam storefront view | Storefront is browse-only; buying happens in Steam's own web/client flow |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BRAND-02 | Phase 5 | Pending |
| BRAND-03 | Phase 5 | Pending |
| BRAND-04 | Phase 5 | Pending |
| APP-01 | Phase 5 | Pending |
| LIB-05 | Phase 6 | Pending |
| LIB-06 | Phase 6 | Pending |
| GAME-05 | Phase 6 | Pending |
| DETAIL-01 | Phase 7 | Pending |
| DETAIL-02 | Phase 7 | Pending |
| STORE-01 | Phase 8 | Complete |
| CONSOLE-01 | Phase 8 | Complete |
| LIB-07 | Phase 08.1 | Pending |
| LIB-08 | Phase 08.1 | Pending |
| LIB-09 | Phase 08.1 | Pending |
| QA-01 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 15 total
- Mapped to phases: 15 (Phases 5-9)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-02*
*Last updated: 2026-07-02 — traceability filled during v1.1 roadmap creation*
