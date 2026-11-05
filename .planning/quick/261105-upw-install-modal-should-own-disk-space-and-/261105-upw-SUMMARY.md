---
phase: quick-261105-upw
plan: 01
subsystem: steam-install
tags: [steam, install-modal, ipc, installapp]
key-files:
  created:
    - src/frontend/screens/Library/components/InstallModal/steamLibraryRoute.ts
    - src/frontend/screens/Library/components/InstallModal/__tests__/steamLibraryRoute.test.ts
  modified:
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/sidecar/__tests__/installFlows.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/common/types/ipc.ts
    - src/preload/api/steam.ts
    - src/frontend/screens/Library/components/InstallModal/index.tsx
    - src/frontend/screens/Library/components/InstallModal/steamSectionGating.ts
    - src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts
    - .planning/IPC-PORT-INVENTORY.md
decisions:
  - "Separate discriminator IPC; listSteamLibraryTargets unchanged so SteamDialog sign-in gate/notice copy stay put"
  - "Single-library InstallApp route mirrors native-ON: no picker, no free-space line"
completed: 2026-11-05
---

# Quick 261105-upw: Install modal owns library choice on the InstallApp route

New backend IPC `getSteamInstallAppTargets(appName)` returns `{ installAppRoute, libraries }`; the modal calls it only when `listSteamLibraryTargets` resolved `[]` and feeds the gating resolver `steamLibraryChoiceOwned`, while SteamDialog keeps `steamNativeInstallOn`.

## Commits
- 431d52b04 feat: backend IPC, type, preload, census 7 -> 8
- 8e4694a85 feat: modal wiring (steamLibraryRoute.ts, index.tsx, gating docs, wiring gates)
- 75be2a97a docs(todos): todo moved to completed/ with Resolution; parent step 6 annotated
- 9224bbc10, 25f2d8bc8 docs: IPC-PORT-INVENTORY entry and reconciled totals (237 -> 238, ported 82 -> 83)

## Verification
- installFlows + flowRegistrationCensus: 118 passed. InstallModal folder + InstallGameModal: 548 passed. tsc clean. `pnpm lint`: 0 errors (warnings only). Prettier check passes on all code paths. `pnpm planning-gates`: 12/12.
- SteamDialog/index.tsx and steamSectionGating.test.ts have no diff.
- Full `--selectProjects Backend` run showed 3 failures in files this plan did not touch: `tauriShellSource.test.ts` (WR-07 title literal) and `macArchKnownFixRouting.test.ts` (Intel case, `steam://install` expectation). Not investigated or fixed (out of scope). The latter may relate to quick 261105-ord's uncommitted SUMMARY work area; flagging only.
- Live check (optional) not performed.

## Deviations
**[Rule 3 - Blocking] IPC inventory.** The new preload channel failed `preload-surface-gate` because it was in no bucket of `.planning/IPC-PORT-INVENTORY.md`. Added it to the Already-ported bucket line, bumped Totals, and added a section (same precedent as the 58-32 entry).

## Self-Check: PASSED
