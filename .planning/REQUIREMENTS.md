# GamerLib — v1 Requirements

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can add a Steam account via QR code scan (Steam mobile app)
- [x] **AUTH-02**: User can add a Steam account via username + password + SteamGuard code
- [x] **AUTH-03**: User can view and manage Steam accounts in the existing Manage Accounts screen
- [x] **AUTH-04**: User can remove a Steam account from GamerLib
- [x] **AUTH-05**: App detects if Steam client is installed and shows an actionable prompt if not

### Library

- [ ] **LIB-01**: User can browse their full Steam library alongside Epic, GOG, and Amazon games
- [ ] **LIB-02**: Each Steam game shows installed vs not-installed state (reads Steam ACF manifests)
- [ ] **LIB-03**: Playtime is displayed for each Steam game (hours, sourced from library sync)
- [ ] **LIB-04**: Steam games display cover art and store metadata (title, description, genres)

### Game Operations

- [ ] **GAME-01**: User can launch an installed Steam game from GamerLib (delegates to Steam client via `steam://rungameid`)
- [ ] **GAME-02**: User can install a Steam game from GamerLib (delegates to Steam client via `steam://install`)
- [ ] **GAME-03**: User can uninstall a Steam game from GamerLib (via `steam://uninstall`)
- [ ] **GAME-04**: Windows-only Steam games on Linux launch via Steam's Proton, not Heroic's Wine layer

### Branding

- [ ] **BRAND-01**: App name updated from "Heroic" to "GamerLib" in title bar, about page, and app metadata (package.json, electron-builder config)

---

## v2 Requirements (deferred)

- Achievement display — `ISteamUserStats/GetPlayerAchievements` mapped to existing achievement UI
- Update detection indicator — ACF `StateFlags` polling
- Proactive refresh token expiry notification (~200-day tokens)
- Full visual rebrand (new logo, color scheme)
- Additional platforms (itch.io, Ubisoft Connect, Xbox Game Pass)

---

## Out of Scope

- Friends list, Steam overlay, community features — this is a launcher, not a Steam client replacement
- SteamCMD-based download manager — delegate all downloads to Steam client
- `moveInstall()` — Steam owns its library layout; directing users to Steam's "Move Install Folder" is safer
- `syncSaves()` — Steam Cloud is automatic and has no public trigger API; no implementation needed
- Username/password + credentials storage — only refresh tokens stored (Steam Web API ToS)
- Direct binary launch — bypasses SteamStub DRM; always use `steam://` protocol

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| LIB-01 | Phase 2 | pending |
| LIB-02 | Phase 2 | pending |
| LIB-03 | Phase 2 | pending |
| LIB-04 | Phase 2 | pending |
| GAME-01 | Phase 3 | pending |
| GAME-02 | Phase 3 | pending |
| GAME-03 | Phase 3 | pending |
| GAME-04 | Phase 3 | pending |
| BRAND-01 | Phase 4 | pending |
