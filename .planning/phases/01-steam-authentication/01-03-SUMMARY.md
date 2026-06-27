---
phase: 01-steam-authentication
plan: 03
subsystem: auth
tags: [steam, react, typescript, mui, react-qr-code, globalstate, context, routing]

requires:
  - "01-01 (type foundation: 'steam' in Runner/Category/ContextType; react-qr-code installed)"
  - "01-02 (backend: all window.api.steam* methods wired via preload bridge)"

provides:
  - "steam in GlobalState StateProps + steamLogin/steamLogout methods"
  - "steamConfigStore in frontend electronStores, exported"
  - "steam in ContextProvider initialContext and ContextType"
  - "SteamLogin screen at src/frontend/screens/Login/components/SteamLogin/index.tsx — all 11 UI-SPEC states"
  - "SteamLogin scss at src/frontend/screens/Login/components/SteamLogin/index.scss"
  - "/loginweb/steam route registered before loginweb/:runner catch-all in App.tsx"
  - "Steam Runner tile always visible on Manage Accounts screen (no experimental flag)"
  - "steamLoginPath exported from Login/index.tsx"

affects:
  - AUTH-01..05 are now exercisable end-to-end from the UI

tech-stack:
  added: []
  patterns:
    - "steamLogin receives { status, username } directly — no separate getSteamUserInfo call"
    - "Steam state has no 'enabled' flag unlike zoom — always first-class"
    - "SteamLogin step state machine: checking → not-installed | tab → qr-*/credentials-*"
    - "QR auto-refresh: 30s timeout + poll-error triggers silent restart of startQRFlow"
    - "Password cleared on Back to Credentials (T-01-DISC-PWD-UI mitigation)"
    - "loginweb/steam route placed before loginweb/:runner (T-01-ROUTE mitigation)"

key-files:
  created:
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
    - src/frontend/screens/Login/components/SteamLogin/index.scss
  modified:
    - src/frontend/types.ts
    - src/frontend/helpers/electronStores.ts
    - src/frontend/state/ContextProvider.tsx
    - src/frontend/state/GlobalState.tsx
    - src/frontend/App.tsx
    - src/frontend/screens/Login/index.tsx

key-decisions:
  - "steamLogin accepts { status, username } directly (no follow-up getSteamUserInfo call) because the auth flows return the username inline"
  - "SteamLogin step state drives both QR tab and credentials tab content — a single state machine handles all 11 UI-SPEC states"
  - "QR poll interval is 2s; auto-refresh triggered at 30s or on poll error — no manual refresh button per D-05"
  - "Steam Runner tile is unconditional (no zoom.enabled guard) per D-08"

metrics:
  duration: "~8 min"
  completed: "2026-06-27"
---

# Phase 1 Plan 03: Frontend Renderer Layer — SteamLogin Screen, Route, and Steam Tile Summary

**Two-tab native Steam login screen (QR + credential+SteamGuard flows, client detection) wired to GlobalState context; Steam Runner tile always visible on Manage Accounts; /loginweb/steam route registered before WebView catch-all**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-27T00:30:00Z
- **Completed:** 2026-06-27T00:37:34Z
- **Tasks:** 3 executed
- **Files modified/created:** 8

## Accomplishments

- **Task 1 (d54e77f):** Added `steam` to `ContextType` in frontend/types.ts; exported `steamConfigStore` (TypeCheckedStoreFrontend, cwd 'steam_store') from electronStores.ts; added `steam` to ContextProvider initialContext; added `steam` to GlobalState StateProps + initial state; implemented `steamLogin`/`steamLogout` methods; wired steam into render context value

- **Task 2 (c36f9ae):** Created `src/frontend/screens/Login/components/SteamLogin/index.tsx` — all 11 UI-SPEC states: State 1 (not-installed warning, Download Steam button, Return to Login), States 2-4 (QR generating/active/confirmed with react-qr-code 200×200, auto-poll + auto-refresh), States 5-7 (credentials step 1 + loading + inline error with 3s auto-clear), States 8-9 (SteamGuard step 2 with maxLength=5 inputMode=numeric, guard error), State 10 (navigate to /login), State 11 (Runner tile handled by login screen). Created `index.scss` with semantic token-only styles (steamLoginPanel, steamNotFound, steamError, steamQrContainer, sid-input)

- **Task 3 (8ec22e4):** Added `{ path: 'loginweb/steam', lazy: SteamLogin }` in App.tsx BEFORE `loginweb/:runner`; exported `steamLoginPath = '/loginweb/steam'` from Login/index.tsx; added `isSteamLoggedIn` state + effect; rendered Steam Runner tile with faSteam icon unconditionally (no experimental guard)

## Task Commits

1. **Task 1: Wire steam into renderer state, context, and stores** — `d54e77f`
2. **Task 2: Build the SteamLogin screen (all 11 states)** — `c36f9ae`
3. **Task 3: Register the /loginweb/steam route and the always-visible Steam tile** — `8ec22e4`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All 11 UI-SPEC states are implemented. The Steam Runner tile in logged-in state (State 11) renders via the existing `Runner` component with `isLoggedIn=true` and `user={steam.username}` — no stub, wired to live state.

## Threat Flags

No new network endpoints, auth paths, or schema changes beyond the plan's threat model. All T-01 mitigations implemented:
- T-01-SPOOF-TOTP-UI: Wrong-code error displayed without auto-resubmit; user must re-enter
- T-01-DISC-PWD-UI: Password in component state only; cleared on Back to Credentials; never written to store; not re-populated
- T-01-ROUTE: loginweb/steam placed before loginweb/:runner in App.tsx; verified by codecheck + ordering assertion
- T-01-XSS: Username rendered as React text content only; no dangerouslySetInnerHTML

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/frontend/screens/Login/components/SteamLogin/index.tsx | FOUND |
| src/frontend/screens/Login/components/SteamLogin/index.scss | FOUND |
| src/frontend/types.ts (steam in ContextType) | FOUND |
| src/frontend/helpers/electronStores.ts (steamConfigStore exported) | FOUND |
| src/frontend/state/ContextProvider.tsx (steam in initialContext) | FOUND |
| src/frontend/state/GlobalState.tsx (steamLogin/steamLogout) | FOUND |
| src/frontend/App.tsx (loginweb/steam before loginweb/:runner) | FOUND |
| src/frontend/screens/Login/index.tsx (steamLoginPath + Steam Runner) | FOUND |
| Commit d54e77f (Task 1) | FOUND |
| Commit c36f9ae (Task 2) | FOUND |
| Commit 8ec22e4 (Task 3) | FOUND |
| npm run codecheck exits 0 | PASSED |
| loginweb/steam precedes loginweb/:runner | VERIFIED |
