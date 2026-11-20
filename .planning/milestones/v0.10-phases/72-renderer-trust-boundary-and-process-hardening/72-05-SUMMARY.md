---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 05
subsystem: sidecar
tags: [dead-code, token-store, fail-closed, knip]
requires: [72-02]
provides:
  - no ipc_handler.ts modules remain in src
  - fail-closed Steam token store default
affects: [steam-auth]
key-files:
  modified:
    - src/backend/storeManagers/steam/tokenStore.ts
    - src/backend/storeManagers/steam/constants.ts
    - src/backend/sidecar/bootstrap.ts
    - meta/knip-baseline.txt
key-decisions:
  - "UnconfiguredTokenStore default: setToken throws 'Steam token store not installed'; reads unreadable; clearToken warns (D-12)"
requirements-completed: [D-11, D-12]
completed: 2026-11-08
---

# Phase 72 Plan 05: Dead handlers and fail-closed token store Summary

Deleted all 14 `*/ipc_handler.ts` modules (including the `execAsync(commandParts.join(' '))` path in `tools/ipc_handler.ts`) and replaced the Steam token store's plaintext-capable default with a fail-closed `UnconfiguredTokenStore`.

## Commits
- 47ba49198: refactor(72-05): delete 14 dead ipc_handler modules
- 332830b07: fix(72-05): fail-closed Steam token store, delete ElectronTokenStore plaintext path

## ipc_handler reference classification (pre-deletion)
- Code imports: only `shortcuts/__tests__/macShortcutToast.test.ts:55` and `shortcutsExistsFallback.test.ts:76` (both repointed/deleted).
- Comments/docs only: `utils.ts`, `crossover_index/crossoverRatingMap.ts`, `crossover_index/__tests__/ratingMap.test.ts`, `logger/sanitizeRendererLogMessage.ts`, `humble/userAgent.ts`, `humble/user.ts`, `discounts/fetchDiscounts.ts`, `steamgrid/secretStore.ts`, `tools/__tests__/winetricksInstallPathInvariant.test.ts`, and the porting notes in `sidecar/*FlowRegistration.ts` and `bootstrap.ts:1182`.
- Negative-assertion tests (string literals inside "must not import" fixtures): `humbleFlows.test.ts`, `humbleLoginFlows.test.ts`, `runnerSliceRegistration.test.ts`.
- Live `callTool` path is `sidecar/runnerMiscFlowRegistration.ts`.

## Task 1 notes
- `macShortcutToast.test.ts` deleted: every case is already asserted by `shortcutsFlows.test.ts` describe "261027-c4g mac toast names the Desktop" (add on/off, remove link/no-link, non-mac).
- `shortcutsExistsFallback.test.ts` kept and repointed to `registerShortcutsFlows()` (its darwin dangling-link cases are not duplicated in shortcutsFlows).
- 13 knip baseline lines removed; no newly orphaned exports surfaced, none removed.

## Task 2 notes
- `ElectronTokenStore`, `encryptToken`/`decryptToken`/`encryptionAvailable`, the `safeStorage` import removed; `clearOrphanedElectronToken()` kept.
- `TOKEN_PREFIX` removed from `steam/constants.ts` (became an unused export that knip would flag).
- `user.test.ts` now installs a test-only config-backed store in `beforeEach`; the three decrypt/legacy-plaintext cases and the encrypt assertion were removed or rewritten (production code gone).
- `bootstrap.test.ts` gained "boot-time Steam token store install (D-12)": init() replaces a sentinel store.
- `electronUntouched.test.ts` restores the previously active store instead of constructing the deleted class; its pinned sha256 in `gameDetailsImportGate.test.ts` was re-pinned (documented in-comment).

## Deviations from Plan
- [Rule 3] Re-pinned `ELECTRON_UNTOUCHED_SHA256` in `gameDetailsImportGate.test.ts` and removed `TOKEN_PREFIX` from `constants.ts`; neither was listed in the plan's files.

## Deferred Issues
- `src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts` "Intel: never seeds..." fails (expects `steam://install/63000` openExternal). It does not touch the token store; related to Phase 65 install-flow changes. Not fixed (out of scope).

## Verification
pnpm codecheck, find-deadcode, boundaries green; sidecar + steam + shortcuts jest folders green except the deferred test above.

## Known Stubs
None.

## Self-Check: PASSED
