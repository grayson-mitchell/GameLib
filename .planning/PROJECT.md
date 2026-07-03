# GameLib

## What This Is

GameLib is a public fork of Heroic Games Launcher that adds Steam as a first-class supported platform. Where Heroic covers Epic Games, GOG, and Amazon Games, GameLib extends this with full Steam library integration — browse, install, and launch Steam games from the same interface. It targets gamers who want a single unified launcher instead of switching between clients.

## Core Value

One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

## Current Milestone: v1.1 Polish & Enhancements

**Goal:** Close out UAT feedback and known v1.0 tech debt — sharper GameLib branding, richer game metadata, Steam-store browsing, and quality hardening.

**Target features:**
- macOS menu-bar tooltip reads "GameLib" (BUG-001)
- Steam as a browsable storefront in the sidebar Stores section (ENH-002)
- GameLib release notes on the version link, with a link to the upstream Heroic release (ENH-003)
- Supported platforms shown in game details (ENH-004)
- Compatibility rating overlay on game art — macOS via AppleGamingWiki now, Linux via ProtonDB later (ENH-005)
- Steam games available in Console mode (ENH-006)
- Updated README (ENH-007)
- "Playing" status badge during a Steam session
- Real install size in the download-manager queue (replace `'?? MB'`)
- Playtime on library-grid tiles (currently details page only)
- Residual backend "Heroic" log/dialog strings → GameLib
- Formal Nyquist validation pass for shipped phases

## Requirements

### Validated

- ✓ Add and manage a Steam account in Manage Accounts (QR + credentials/SteamGuard) — v1.0
- ✓ Browse the full Steam library from within GameLib — v1.0
- ✓ Steam games appear alongside Epic/GOG/Amazon in the library view — v1.0
- ✓ Install Steam games from GameLib (via `steam://`) — v1.0
- ✓ Launch Steam games from GameLib (via `steam://rungameid`, Proton delegated) — v1.0
- ✓ Uninstall Steam games from GameLib — v1.0
- ✓ Steam install state, playtime, and store metadata in the library — v1.0
- ✓ GameLib branding (Heroic → GameLib) — v1.0
- ✓ macOS menu-bar tooltip reads "GameLib" (BUG-001) — v1.1 Phase 5
- ✓ GameLib release notes on the version link, linking to the upstream Heroic release (ENH-003) — v1.1 Phase 5
- ✓ Updated README (ENH-007) — v1.1 Phase 5
- ✓ Residual backend "Heroic" log/dialog strings → GameLib — v1.1 Phase 5
- ✓ "Playing" status badge during a Steam session (GAME-05) — v1.1 Phase 6
- ✓ Real install size in the download-manager queue (LIB-06, replaces `'?? MB'`) — v1.1 Phase 6
- ✓ Playtime visible for Steam games (LIB-05, met via game-details page per D-01; grid-tile display descoped) — v1.1 Phase 6

### Active (v1.1 — in scope)

- [ ] Steam as a browsable storefront in the sidebar Stores section (ENH-002)
- [ ] Supported platforms shown in game details (ENH-004)
- [ ] macOS compatibility rating overlay on game art via AppleGamingWiki (ENH-005)
- [ ] Steam games available in Console mode (ENH-006)
- [ ] Formal Nyquist validation pass for shipped phases

### Future

- [ ] Linux compatibility rating overlay on game art via ProtonDB (follow-up to ENH-005)
- [ ] Copy-to-clipboard on the API key field (ENH-001 — deferred, dropped from v1.1)

### Out of Scope

- Other new platforms (Ubisoft Connect, itch.io, Xbox) — Steam first, others later
- Replacing Steam client functionality (friends, community, overlay) — launcher use only

## Context

- **Upstream**: Heroic Games Launcher v2.22.0 (https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher)
- **Architecture**: Electron + React + TypeScript; store managers in `src/backend/storeManagers/` (gog, legendary/Epic, nile/Amazon, sideload)
- **Existing Steam touchpoints**: `steamgrid` (artwork fetching), `shortcuts/nonesteamgame` (add non-Steam games to Steam), Steam Deck detection — none of these are a Steam store manager
- **Why a fork**: Heroic maintainers are explicitly anti-Steam and will not merge Steam support upstream
- **Target audience**: Public distribution — gamers who want one unified launcher

## Constraints

- **Tech stack**: Must remain Electron + React + TypeScript to stay mergeable with Heroic upstream improvements
- **Compatibility**: Linux, macOS, Windows (same as Heroic)
- **Steam auth**: RESOLVED in v1.0 — `steam-session` (QR + credentials/SteamGuard refresh token) + `steam-user` (CM connect, owned apps). Pure-JS, no native modules. Steamworks SDK and browser-OpenID approaches rejected (see research).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork Heroic (not build from scratch) | Heroic already solves multi-store UI, download manager, game config, Linux/Wine — no need to rebuild | ✓ Good — Steam slotted into existing Runner/storeManager patterns cleanly |
| Steam store manager follows existing pattern | `src/backend/storeManagers/` pattern is clean; new `steam/` directory keeps parity with gog/legendary/nile | ✓ Good — `satisfies Record<Runner, LibraryManager>` made it first-class |
| Start with Manage Accounts | Account auth is the prerequisite for everything else; unblocks library, install, launch | ✓ Good — auth-first sequencing held |
| `steam-session` + `steam-user` for auth/library | Pure-JS, no native rebuild; handles QR/credentials/SteamGuard + owned-apps | ⚠️ Revisit — works, but session lifecycle (QR vs credential vs DeviceConfirmation polling) caused several v1.0 bugs; needs careful listener handling |
| Delegate install/launch/uninstall to `steam://` | Steam client is a valid assumption for this audience; honors Steam's own Proton/launch options | ✓ Good — fire-and-forget; ACF poller owns real status |
| ACF poller owns Steam operation status | `steam://` returns immediately; appmanifest StateFlags reflect real install/uninstall state | ✓ Good — fixed the premature-notification badge flash |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-03 — Phase 6 (Library & Game Status UX) complete; GAME-05, LIB-06 validated, LIB-05 met-via-existing (D-01). Human-UAT + CR-01 fix tracked.*
