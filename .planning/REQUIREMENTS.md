# Requirements: GameLib — v1.1 Polish & Enhancements + v1.2 Humble Bundle Integration

**Defined:** 2026-07-02 (v1.1) · 2026-07-05 (v1.2 appended)
**Core Value:** One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

> v1.0 requirements (AUTH-01..05, LIB-01..04, GAME-01..04, BRAND-01) shipped and are archived in `.planning/milestones/v1.0-REQUIREMENTS.md`. IDs below continue that numbering.
> **v1.1 is still open** (Phase 9 + Phase 7 UAT outstanding). v1.2 requirements were appended below by explicit choice rather than archiving v1.1 first — both milestones share this file until v1.1 completes.

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
- [x] **LIB-07**: Steam's delisted signal (is_delisted) drives the Library "show non-available" filter — non-available means delisted, not merely not-installed
- [x] **LIB-08**: A delisted Steam game renders a greyed "Game no longer available" placeholder with its install option disabled
- [x] **LIB-09**: Library "Show Hidden" and "Show non-Available" filters gain tri-state Off/Show/Only modes

### Game Operations

- [ ] **GAME-05**: A "Playing" status badge is shown while a Steam game session is active

### Console Mode

- [x] **CONSOLE-01**: Steam games appear in Console mode and can be launched from it (ENH-006)

### Quality

- [ ] **QA-01**: A formal Nyquist validation pass is completed and recorded for the shipped v1.0 phases

## v1.2 Requirements

Requirements for the v1.2 Humble Bundle Integration milestone. Value is **key management** — never re-buy or lose a Humble key — with ownership-aware dedup against the existing Steam library. Each maps to exactly one roadmap phase (Phase 10+). See `.planning/research/SUMMARY.md` for the research basis and the 6-phase build order.

### Humble Account

- [ ] **HACCT-01**: User can connect a Humble Bundle account via an in-app browser login (email/password + "Humble Guard" emailed one-time code) from Manage Accounts
- [ ] **HACCT-02**: The Humble session persists encrypted (login once); when it expires (~2–3 day TTL) a non-disruptive reconnect prompt appears without breaking library browsing
- [ ] **HACCT-03**: User can disconnect and remove their Humble account

### Humble Library Sync

- [ ] **HSYNC-01**: A connected user's Humble keys sync into GameLib, normalized into the 5-state key model (UNPICKED / UNREVEALED / REVEALED / REDEEMED / UNREDEEMABLE), cached locally with concurrency-bounded, cache-aggressive fetching
- [ ] **HSYNC-02**: Every key is classified into exactly one state, with the locally-tracked REVEALED flag written before the reveal API call (write-ahead) so it survives re-sync
- [ ] **HSYNC-03**: Expiration / UNREDEEMABLE status is recomputed on every sync (Humble applies expirations retroactively)
- [ ] **HSYNC-04**: If a Humble refresh fails, the launcher shows the cached library with a clear "couldn't refresh" state rather than erroring (fail-soft)

### Humble Ownership Dedup

- [ ] **HDEDUP-01**: Every key is cross-referenced against the Steam library (AppID-first via `steam_app_id`, 85%+ fuzzy-name fallback) to set `owned_elsewhere`
- [ ] **HDEDUP-02**: A Humble Steam key already redeemed into Steam collapses onto the existing Steam library entry (annotated with its Humble origin) instead of appearing as a duplicate

### Humble Key Views

- [ ] **HVIEW-01**: A "Keys waiting" view lists unowned + unredeemed keys, sorted by expiration urgency then title
- [ ] **HVIEW-02**: A "Giftable spares" view lists owned-elsewhere + UNREVEALED keys and exposes/copies the Humble gift link

### Humble Guided Claim

- [ ] **HCLAIM-01**: User can reveal a single UNREVEALED key only on explicit per-key action, behind a clear irreversibility warning — never auto-reveal, no "reveal all"
- [ ] **HCLAIM-02**: Revealing a key for an already-owned game is intercepted and routed to the giftable-spare path instead of proceeding (C2 guard)
- [ ] **HCLAIM-03**: On reveal, the key is copied to clipboard and the browser opens `store.steampowered.com/account/registerkey?key=` pre-filled; the user confirms activation via a "Mark as redeemed" button
- [ ] **HCLAIM-04**: Every reveal and redeem is recorded in a local audit log (what key, when, outcome)
- [ ] **HCLAIM-05**: Non-Steam keys (Epic/Ubisoft/GOG/…) show a "redeem on {platform}" link-out and copy-key, with no one-click activation

### Humble Store & Alerts

- [ ] **HSTORE-01**: When browsing store surfaces, each title is badged Owned / Unclaimed-key-available / New based on ownership and key availability
- [ ] **HSTORE-03**: An "expiring soon" surface flags keys nearing expiration, with optional OS notifications for newly-expiring keys

## Future Requirements

Deferred beyond v1.1. Tracked but not in the current roadmap.

### Game Details

- **DETAIL-03**: On Linux, games show a ProtonDB compatibility rating overlay on the game art (follow-up to DETAIL-02/ENH-005)

### Settings

- **API-01**: Copy-to-clipboard button on the API key field, Settings → API (ENH-001 — dropped from v1.1)

### Humble Store (deferred from v1.2)

- **HSTORE-02**: A read-only Humble bundle/deals listing is browsable in-app with "Buy on Humble" deep-links (deferred from v1.2 — key management prioritized over the store surface; separate bundle-listing data source)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Other new platforms (Ubisoft Connect, itch.io, Xbox) | Steam first; other stores are a separate future milestone |
| Replacing Steam client functionality (friends, community, overlay) | GameLib is a launcher, not a Steam client replacement |
| Purchasing/checkout flows inside the Steam storefront view | Storefront is browse-only; buying happens in Steam's own web/client flow |
| In-app Humble checkout / purchasing (v1.2) | Store surface is read-only + deep-links; buying happens on Humble's site |
| One-click activation for non-Steam Humble key types (v1.2) | Each platform has its own auth/activation flow; HCLAIM-05 links out instead |
| Automated / unattended bulk redemption of Humble keys (v1.2) | Triggers Steam rate-limit flagging (~10 failed/hr lockout); actions stay user-initiated + throttled (C1, C3) |
| Managing DRM-free Humble downloads / Humble-hosted installers (v1.2) | Key-focused milestone; DRM-free download management is a separate future phase with its own research |

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
| LIB-07 | Phase 08.1 | Complete |
| LIB-08 | Phase 08.1 | Complete |
| LIB-09 | Phase 08.1 | Complete |
| QA-01 | Phase 9 | Pending |
| HACCT-01 | Phase 10 | Pending |
| HACCT-02 | Phase 10 | Pending |
| HACCT-03 | Phase 10 | Pending |
| HSYNC-01 | Phase 11 | Pending |
| HSYNC-02 | Phase 11 | Pending |
| HSYNC-03 | Phase 11 | Pending |
| HSYNC-04 | Phase 11 | Pending |
| HDEDUP-01 | Phase 12 | Pending |
| HDEDUP-02 | Phase 12 | Pending |
| HVIEW-01 | Phase 13 | Pending |
| HVIEW-02 | Phase 13 | Pending |
| HCLAIM-01 | Phase 14 | Pending |
| HCLAIM-02 | Phase 14 | Pending |
| HCLAIM-03 | Phase 14 | Pending |
| HCLAIM-04 | Phase 14 | Pending |
| HCLAIM-05 | Phase 14 | Pending |
| HSTORE-01 | Phase 15 | Pending |
| HSTORE-03 | Phase 15 | Pending |

**Coverage:**
- v1.1 requirements: 15 total
- Mapped to phases: 15 (Phases 5–9)
- Unmapped: 0 ✓

- v1.2 requirements: 18 total (HSTORE-02 deferred to Future)
- Mapped to phases: 18 (Phases 10–15)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-02*
*Last updated: 2026-07-05 — v1.2 traceability appended during roadmap creation (Phases 10–15)*
