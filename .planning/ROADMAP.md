# Roadmap: GamerLib

## Overview

GamerLib forks Heroic Games Launcher and adds Steam as a first-class platform alongside Epic, GOG, and Amazon. The roadmap follows the natural dependency chain: Steam authentication is the prerequisite for everything else, library sync requires an authenticated account, game operations require the library to exist, and branding is applied once the core feature set is complete and ready to ship.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Steam Authentication** - Users can add, manage, and remove Steam accounts in GamerLib
- [ ] **Phase 2: Steam Library** - Steam games appear in the unified library with metadata and install state
- [ ] **Phase 3: Game Operations** - Users can launch, install, and uninstall Steam games from GamerLib
- [ ] **Phase 4: Branding** - App is identified and distributed as GamerLib, not Heroic

## Phase Details

### Phase 1: Steam Authentication
**Goal**: Users can add, manage, and remove Steam accounts inside GamerLib
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. User can add a Steam account via QR code scan from the Steam mobile app
  2. User can add a Steam account via username/password/SteamGuard code
  3. Steam accounts appear in the existing Manage Accounts screen alongside Epic, GOG, and Amazon accounts
  4. User can remove a Steam account from GamerLib
  5. GamerLib shows an actionable prompt when Steam client is not installed
**Plans**: TBD
**UI hint**: yes

### Phase 2: Steam Library
**Goal**: Users can browse their full Steam library alongside Epic, GOG, and Amazon games
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04
**Success Criteria** (what must be TRUE):
  1. Steam games appear in the main library view mixed with Epic, GOG, and Amazon games
  2. Each Steam game shows whether it is installed or not installed (read from ACF manifests)
  3. Each Steam game displays total playtime in hours
  4. Each Steam game shows cover art, title, description, and genres
**Plans**: TBD
**UI hint**: yes

### Phase 3: Game Operations
**Goal**: Users can launch, install, and uninstall Steam games from within GamerLib
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: GAME-01, GAME-02, GAME-03, GAME-04
**Success Criteria** (what must be TRUE):
  1. User can launch an installed Steam game from GamerLib (Steam client opens the game via steam://rungameid)
  2. User can install a Steam game from GamerLib (Steam client handles the download via steam://install)
  3. User can uninstall a Steam game from GamerLib (via steam://uninstall)
  4. Windows-only Steam games on Linux launch via Steam Proton, not Heroic's Wine layer
**Plans**: TBD

### Phase 4: Branding
**Goal**: App is identified and distributed as GamerLib, not Heroic
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: BRAND-01
**Success Criteria** (what must be TRUE):
  1. Title bar displays "GamerLib" instead of "Heroic"
  2. About page reflects the GamerLib name
  3. Package metadata (package.json and electron-builder config) correctly identifies the app as GamerLib
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Steam Authentication | 0/TBD | Not started | - |
| 2. Steam Library | 0/TBD | Not started | - |
| 3. Game Operations | 0/TBD | Not started | - |
| 4. Branding | 0/TBD | Not started | - |
