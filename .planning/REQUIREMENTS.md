# GamerLib — v1 Requirements

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can add a Steam account via QR code scan (Steam mobile app)
- [ ] **AUTH-02**: User can add a Steam account via username + password + SteamGuard code
- [ ] **AUTH-03**: User can view and manage Steam accounts in the existing Manage Accounts screen
- [ ] **AUTH-04**: User can remove a Steam account from GamerLib
- [ ] **AUTH-05**: App detects if Steam client is installed and shows an actionable prompt if not

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

*Roadmap phase assignments filled in by gsd-roadmapper.*

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | — | pending |
| AUTH-02 | — | pending |
| AUTH-03 | — | pending |
| AUTH-04 | — | pending |
| AUTH-05 | — | pending |
| LIB-01 | — | pending |
| LIB-02 | — | pending |
| LIB-03 | — | pending |
| LIB-04 | — | pending |
| GAME-01 | — | pending |
| GAME-02 | — | pending |
| GAME-03 | — | pending |
| GAME-04 | — | pending |
| BRAND-01 | — | pending |
