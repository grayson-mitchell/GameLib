# Phase 1: Steam Authentication - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can add a Steam account to GamerLib (via QR code or username/password/SteamGuard), view it in the Manage Accounts screen alongside Epic, GOG, and Amazon, and remove it. Auth credentials are stored as an encrypted refresh token. No library sync, game launching, or branding changes in this phase.

</domain>

<decisions>
## Implementation Decisions

### Credential Login Flow
- **D-01:** Use a dedicated `/loginweb/steam` route (matching `/loginweb/gog`, `/loginweb/legendary`, `/loginweb/nile` pattern) — a React screen that owns the native form UI.
- **D-02:** Multi-step flow: step 1 shows username + password fields; after credentials submit, step 2 shows a single SteamGuard code input field with instructional text ("Check your email for a code from Steam."). Step 2 handles both email codes and TOTP — same input field, user reads from whichever source they have.
- **D-03:** Back button on step 2 returns to step 1 (credentials re-entry).

### QR Login Flow
- **D-04:** The `/loginweb/steam` screen has two co-equal tabs: "QR Code" and "Username & Password". Neither is default — both are first-class.
- **D-05:** QR code auto-refreshes when the steam-session challenge URL expires (~30s). No manual refresh button — the image silently updates.

### Account Card in Manage Accounts
- **D-06:** Match the existing GOG/Epic/Amazon/Zoom card pattern exactly: Steam logo + "Logged in as [display name]" + [Log out] button. No avatar fetch, no Steam64 ID display. Visual consistency across all platforms.

### Steam Client Detection (AUTH-05)
- **D-07:** Detection method: check known platform-specific filesystem paths at login-attempt time:
  - Linux: `/usr/bin/steam` or `~/.steam/steam`
  - macOS: `/Applications/Steam.app`
  - Windows: `C:\Program Files (x86)\Steam\Steam.exe`
- **D-08:** When Steam client is not detected: show a prompt on the "Add Steam Account" action with warning text and a [Download Steam] button (opens `https://store.steampowered.com/about/` via `shell.openExternal()`). Auth cannot proceed without Steam. The Steam tile in the Login screen remains visible and clickable — the gate fires on the login attempt, not as a UI disable.

### Token Storage
- **D-09:** Store the steam-session refresh token via `electron-store` + `safeStorage` encryption, following the `configStore` pattern in `src/backend/storeManagers/gog/electronStores.ts`. New `src/backend/storeManagers/steam/electronStores.ts` with a `steamConfigStore`.

### Claude's Discretion
- Error state messaging (network failures, invalid credentials, wrong SteamGuard code) — follow existing GOG/Epic error patterns in terms of tone and placement.
- Loading/pending states during QR generation and credential submission — standard spinner pattern.
- Exact visual layout of the two-tab login screen — match existing aesthetic.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Store Manager Pattern (primary reference)
- `src/backend/storeManagers/gog/user.ts` — canonical auth pattern: `login()`, `getUserDetails()`, `isLoggedIn()`, `logout()` on a static class. Follow this structure for `SteamUser`.
- `src/backend/storeManagers/gog/electronStores.ts` — `TypeCheckedStoreBackend` usage for `configStore`. New Steam store follows same shape.
- `src/backend/storeManagers/zoom/user.ts` — most recently added store manager; use as secondary reference.

### Login Screen Pattern
- `src/frontend/screens/Login/index.tsx` — login screen that lists platforms. Steam Runner component added here.
- `src/frontend/screens/Login/components/` — per-platform Runner components. New `SteamRunner` or equivalent goes here.

### Requirements
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-05 are the full requirements for this phase.
- `.planning/ROADMAP.md` — Phase 1 success criteria.

### Tech Stack (locked — do not re-research)
- `CLAUDE.md` §Technology Stack — steam-session 1.9.4, steam-user 5.3.0, electron-store 8.2.0, @types/steam-user 5.1.1 are the chosen libraries. Alternatives listed are rejected — do not reconsider.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/electron_store.ts` — `TypeCheckedStoreBackend` class; use directly for `steamConfigStore`
- `src/frontend/screens/Login/index.tsx` — add Steam to the existing platform list; follow the `isZoomLoggedIn` / `zoom.username` pattern for `isSteamLoggedIn`
- `src/frontend/state/ContextProvider` — extend the context object with a `steam` entry (matching `epic`, `gog`, `amazon`, `zoom` shape)
- `backend/logger` — `logInfo`, `logError`, `logWarning` with `LogPrefix` — add `LogPrefix.Steam`

### Established Patterns
- Static class with `login()`, `getUserDetails()`, `isLoggedIn()`, `logout()`, `getCredentials()` — all existing store managers follow this shape
- `configStore.set('isLoggedIn', true)` + `configStore.set('userData', data)` on login success
- IPC handlers in main process → `window.api.*` in renderer — new Steam auth actions follow this bridge
- Routes: `/loginweb/steam` (new) follows same convention as `/loginweb/gog`

### Integration Points
- `src/frontend/screens/Login/index.tsx` — add `steam` context, `isSteamLoggedIn` state, Steam Runner component
- `src/backend/storeManagers/index.ts` — register the new Steam store manager
- App IPC handler registration — wherever GOG/Zoom IPC handlers are registered, Steam's go alongside

</code_context>

<specifics>
## Specific Ideas

- The `/loginweb/steam` screen is a native React form (not a BrowserView/WebContents), unlike Epic/GOG which use browser-based OAuth. This is intentional — steam-session handles auth natively.
- QR code tab: render the challenge URL as a QR image using an existing QR library or a new lightweight one. The image auto-regenerates by polling steam-session for a new challenge URL when the previous one expires.
- [Download Steam] button uses `shell.openExternal('https://store.steampowered.com/about/')`.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-account Steam support** — single account at launch (matches GOG/Epic behavior). Multi-account is a future enhancement.
- **TOTP toggle UI** — email-only SteamGuard at launch; TOTP toggle (separate UI label) deferred until user demand confirms it's needed.
- **Token expiry notification** — proactive refresh token expiry warning (~200 day tokens) — listed in REQUIREMENTS.md v2 backlog; not in Phase 1.
- **Avatar display in account card** — could enrich the card in a future iteration but deliberately deferred to match platform consistency.

</deferred>

---

*Phase: 1-Steam Authentication*
*Context gathered: 2026-06-26*
