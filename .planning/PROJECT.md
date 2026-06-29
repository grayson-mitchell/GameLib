# GameLib

## What This Is

GameLib is a public fork of Heroic Games Launcher that adds Steam as a first-class supported platform. Where Heroic covers Epic Games, GOG, and Amazon Games, GameLib extends this with full Steam library integration — browse, install, and launch Steam games from the same interface. It targets gamers who want a single unified launcher instead of switching between clients.

## Core Value

One launcher that manages your entire game library across Epic, GOG, Amazon, and Steam — without needing to open Steam, Epic, or GOG separately.

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

### Active (v1.1 candidates — polish)

- [ ] "Playing" status badge during a Steam session (launch returns immediately today)
- [ ] Real install size in the download-manager queue (replace `'?? MB'`)
- [ ] Playtime on library-grid tiles (currently game-details page only)
- [ ] Residual backend "Heroic" log/dialog strings → GameLib
- [ ] Formal Nyquist validation pass for shipped phases

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
*Last updated: 2026-06-29 after v1.0 Steam Platform milestone*
