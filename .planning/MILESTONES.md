# Milestones

## v0.1 Steam Platform (Shipped: 2026-06-29)

**Delivered:** GameLib — a Heroic Games Launcher fork that adds Steam as a first-class platform alongside Epic, GOG, and Amazon: authenticate, browse, install, launch, and uninstall Steam games from one unified launcher.

**Phases completed:** 4 phases, 16 plans, 23 tasks (+ 5 quick tasks). Timeline: 2026-06-24 → 2026-06-29 (~5 days).

**Audit:** passed — 14/14 requirements satisfied, 0 blockers (`.planning/milestones/v0.1-MILESTONE-AUDIT.md`).

**Key accomplishments:**

- **Steam Authentication (Phase 1)** — Native two-tab Steam login (QR-code via mobile app + username/password/SteamGuard), built on `steam-user` + `steam-session`. Account management in the existing Manage Accounts screen, logout, and Steam-client detection with an actionable not-installed prompt. (AUTH-01..05)
- **Steam Library (Phase 2)** — Owned Steam games appear in the unified library grid alongside Epic/GOG/Amazon, with installed/not-installed state read from local ACF manifests (`@node-steam/vdf`), playtime, and lazy-fetched cover art + store metadata. (LIB-01..04)
- **Game Operations (Phase 3)** — Launch/install/uninstall delegated to the Steam client via `steam://` (numeric-appId injection guard), an ACF poller that owns real install/uninstall status, and full Proton delegation on Linux (Steam games bypass Heroic's Wine layer via `isNative()`). (GAME-01..04)
- **Branding (Phase 4)** — Complete Heroic → GameLib rebrand across app metadata, electron-builder config, window/title-bar identity, and UI. (BRAND-01)

**Notable hardening (quick tasks + debugging this milestone):**

- Fixed the QR-login → library race so Steam games appear immediately after login without a reload (connectingPromise dedupe + frontend `poll.username` gating).
- Fixed credential + SteamGuard login for mobile-authenticator accounts — the credential session wasn't listening during the guard wait, so a background DeviceConfirmation poll silently canceled it; now attaches guard-time listeners (mirrors QR) + out-of-band phone-approval completion.
- Eliminated premature install/uninstall notifications + status badge flash (runner-scoped guards so the ACF poller solely owns Steam status).
- Plus: QR-login hang fix, Steam icon rendering, and game-details playtime display.

**Known tech debt (deferred to v0.2):** no "playing" badge during a Steam session; `'?? MB'` size in the download-manager queue; LIB-03 playtime on library tiles (currently details page only); residual backend "Heroic" log/dialog strings; formal Nyquist validation.

**Human verification:** Phase 1 UAT 5/5 pass (real Steam account); Phase 2 human QA sign-off on real data; GameLib identity human-verified.

---
