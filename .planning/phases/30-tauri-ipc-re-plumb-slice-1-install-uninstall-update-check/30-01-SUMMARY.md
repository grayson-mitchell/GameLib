---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
plan: 01
subsystem: infra
tags: [tauri, sidecar, ipc, steam, qr-login, keychain, electron-migration]

# Dependency graph
requires:
  - phase: 27-tauri-shell-walking-skeleton
    provides: "the sidecar RPC transport (electronStub/sidecarRpc/bootstrap), the curated-import registration pattern (steamFlowRegistration.ts), and Invariant B (unported channels reject non-fatally)"
  - phase: 28-tauri-keyring-real-safestorage
    provides: "SidecarKeyringTokenStore (the Keychain-backed TokenStore seam) and the getTokenStore()/setTokenStore() registry"
  - phase: 29-tauri-store-layer-generalization
    provides: "storePolicy.ts's STORE_ALLOWLIST (steamConfigStore -> ['isLoggedIn','userData']) and the eager/lazy snapshot handlers this plan's regression test extends"
provides:
  - "checkSteamInstalled/steamStartQR/steamPollQR registered on the Tauri sidecar with real SteamUser behavior"
  - "steamAuthFlowRegistration.ts — the D-08 curated QR-login registration module"
  - "D-03 divergence note recorded at the token seam (keyringTokenStore.ts docstring)"
  - "jest coverage proving channel wiring, the token round-trip over the real rustInvoke wire protocol, and Invariant B non-fatality for unported auth channels"
affects: [30-02-install-slice, 30-03-native-dialog, 30-04-seam-doc-update, 31-settings-config-cluster]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Curated <domain>FlowRegistration.ts module: named docstring of in-scope vs deliberately-excluded channels, load-bearing `import '../storeManagers'` first-import ordering fix, ipcMain.handle() delegating unmodified to real backend static methods"
    - "Token-seam test convention: write a synthetic {id,ok,result} rustInvoke response frame directly into the injected input PassThrough (mirrors rustInvokeChannel.test.ts) rather than spying on requestRustInvoke, proving the real wire protocol round-trips"

key-files:
  created:
    - src/backend/sidecar/steamAuthFlowRegistration.ts
    - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
  modified:
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/keyringTokenStore.ts

key-decisions:
  - "Mocked SteamUser's three QR static methods (isSteamClientInstalled/startQRLogin/pollQRLogin) rather than the deeper steam-session/steam-user npm libraries — this suite proves the sidecar's registration wiring and store-layer interaction, not SteamUser's own login-flow correctness (already covered by storeManagers/steam/__tests__/user.test.ts)"
  - "Token-seam test (Task 2, Test 4) calls getTokenStore().setToken() directly and asserts the resulting rustInvoke frame + synthetic Rust response, rather than routing through a mocked SteamUser.startQRLogin — this exercises the exact seam named in the plan's acceptance criteria without re-testing SteamUser's internals"

patterns-established:
  - "Any new *FlowRegistration.ts module's docstring must name both what it ports and what it deliberately excludes (with the owning D-decision), per steamFlowRegistration.ts/steamAuthFlowRegistration.ts precedent"

requirements-completed: [REQ-30-01, REQ-30-02, REQ-30-06, REQ-30-09]

# Metrics
duration: ~20min
completed: 2026-07-22
---

# Phase 30 Plan 01: Steam QR-Login Sidecar Port Summary

**Ported checkSteamInstalled/steamStartQR/steamPollQR onto the Tauri sidecar via a new curated `steamAuthFlowRegistration.ts` module, with the refresh token proven to round-trip through `SidecarKeyringTokenStore`'s real rustInvoke wire protocol and never surface in a store snapshot.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-22T10:24:32Z (approx, per STATE.md session marker)
- **Completed:** 2026-07-22T10:33:12Z
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified: `steamAuthFlowRegistration.ts` new; `handlers.ts`, `keyringTokenStore.ts` modified; `steamAuthFlows.test.ts` new)

## Accomplishments
- The Tauri sidecar now answers `checkSteamInstalled`/`steamStartQR`/`steamPollQR` with the real `SteamUser` implementations instead of an `UNPORTED_CHANNEL_MARKER` rejection — unblocking the login gate ahead of the install slice (D-01).
- The refresh-token seam (`getTokenStore().setToken()` → `SidecarKeyringTokenStore` → Rust `keyring_set` over the real `rustInvoke` wire protocol) is proven end-to-end in a jest suite, and the Phase 28 D-04 refreshToken-exclusion regression is extended to this new channel set.
- Deliberately-unported channels (`steamStartCredentials`, `steamSubmitGuard`, `steamPollCredential`, `getSteamUserInfo`, `logoutSteam`) are proven to still reject non-fatally with `UNPORTED_CHANNEL_MARKER` (Invariant B), and the RPC loop keeps serving afterward.
- The D-03 two-token divergence (Tauri Keychain sign-in vs. Electron OSCrypt sign-in are independent) is recorded as a code comment at the token seam.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create steamAuthFlowRegistration.ts and register it from handlers.ts** - `370875a1` (feat)
2. **Task 2: Jest coverage for the QR channels and the token seam** - `9265bcef` (test, includes a Rule 1 fix to Task 1's keyringTokenStore.ts docstring)

## Files Created/Modified
- `src/backend/sidecar/steamAuthFlowRegistration.ts` - New D-08 curated module; registers `checkSteamInstalled`/`steamStartQR`/`steamPollQR` via `ipcMain.handle()`, delegating unmodified to `SteamUser`'s static methods
- `src/backend/sidecar/handlers.ts` - Imports and calls `registerSteamAuthFlows()` after `registerSteamFlows()`, before `ensureStoresRegistered()`
- `src/backend/sidecar/keyringTokenStore.ts` - Docstring-only addition recording Phase 30 D-03 (two-token divergence accepted)
- `src/backend/sidecar/__tests__/steamAuthFlows.test.ts` - New suite: 5 tests covering channel wiring, the token seam, and Invariant B

## Decisions Made
- Followed `steamFlowRegistration.ts`'s structural template exactly for the new module (docstring naming in/out-of-scope channels, load-bearing `import '../storeManagers'` first-import comment, `export function register*Flows(): void` shape).
- Chose to mock only `SteamUser`'s three QR static methods (not the deeper `steam-session`/`steam-user` npm libraries) for the wiring test — `storeManagers/steam/__tests__/user.test.ts` already unit-tests `SteamUser`'s internal login-flow correctness against mocked `steam-session`, so re-mocking at that depth here would duplicate coverage rather than add it.
- Designed the token-seam test (Test 4) to call `getTokenStore().setToken()` directly and observe the resulting `rustInvoke` frame + synthetic Rust response (mirroring `rustInvokeChannel.test.ts`'s established convention), rather than spying on `requestRustInvoke` — this proves the real wire protocol round-trips, not merely that a function was invoked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded keyringTokenStore.ts's D-03 docstring to avoid the literal string "configStore"**
- **Found during:** Task 2 (running the full `src/backend/sidecar/__tests__` suite after adding the new test file)
- **Issue:** Task 1's added D-03 docstring paragraph referenced "the shared `configStore`" in prose, which the file's own existing structural test (`keyringTokenStore.test.ts`'s "source contains no reference to configStore/TOKEN_STORE_KEY/TOKEN_PREFIX/writeFileSync" assertion — the by-construction enforcement of REQ-28-02) matches on literal substring, regardless of code-vs-comment context. The suite failed with 1 test red.
- **Fix:** Reworded the sentence to "its own shared configuration store" (no change in meaning) so the literal `configStore` substring no longer appears anywhere in the file.
- **Files modified:** `src/backend/sidecar/keyringTokenStore.ts`
- **Verification:** `npx jest src/backend/sidecar/__tests__` — all 8 suites / 106 tests pass.
- **Committed in:** `9265bcef` (folded into the Task 2 commit, since it was discovered while verifying Task 2's own suite)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Docstring wording fix only; no executable line changed. No scope creep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 30-02 (the native depot install slice) is now unblocked: the Tauri build can reach a signed-in, populated library via the QR channels this plan ports.
- **Claim level, per D-04:** "wired and unit-proven" — the live human QR scan is deferred; it must be recorded as a single UAT item in plan 30-04 alongside the install E2E it gates (per 30-CONTEXT's tension note). No independent hardware proof exists yet for this plan's channels.

---
*Phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: src/backend/sidecar/steamAuthFlowRegistration.ts
- FOUND: src/backend/sidecar/__tests__/steamAuthFlows.test.ts
- FOUND: src/backend/sidecar/handlers.ts
- FOUND: src/backend/sidecar/keyringTokenStore.ts
- FOUND commit: 370875a1
- FOUND commit: 9265bcef
