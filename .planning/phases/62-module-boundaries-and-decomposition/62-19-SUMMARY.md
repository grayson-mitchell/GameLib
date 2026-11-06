---
phase: 62-module-boundaries-and-decomposition
plan: 19
subsystem: frontend
tags: [capabilities, frontend, boundaries, ratchet]
requires: [62-18]
provides:
  - FRONTEND_CEILING 41 -> 0; no raw runner literal in src/frontend (non-test)
affects: []
key-files:
  modified:
    - meta/boundaryRatchet.cjs
    - meta/__tests__/boundaryRatchet.test.ts
    - src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts
    - src/frontend/screens/Library/** (filterEngine, gameCount, librarySort, useNonSteamLastPlayed, GameCard, GamesList, InstallModal/**, LibrarySignInNotice)
    - src/frontend/screens/ConsoleMode/** , Login/components/LoginWarning, Humble/Keys
key-decisions:
  - "Compound steam+install sites use the existing isHandOffInstall helper; narrowing sites use the isStore type-predicate overload"
  - "LibrarySignInNotice, Humble Keys switches became Record lookups (exhaustiveness kept by the Record key type)"
  - "No new flag"
requirements-completed: [D-02, D-03, D-04, D-14, D-15]
completed: 2026-11-07
---

# Phase 62 Plan 19: Library, ConsoleMode and the rest Summary

Three commits lower FRONTEND_CEILING 41 -> 26 -> 14 -> 0 (41 sites, matching the table). Both ratchet scopes now report 0.

1. Library filter/sort/count, GameCard, GamesList: `d4a59cde8`
2. InstallModal/** + LibrarySignInNotice: `6cedcd494`
3. ConsoleMode, Humble Keys, Login: `23537ba67`

## Deviations from Plan

**1. [Rule 3 - Blocking] Extra files not named in plan tasks.** `--list` also reported `Humble/Keys/index.tsx` (2 switches) and `Library/components/LibrarySignInNotice/index.tsx` (1 switch); both are in the 62-19 table. Converted to Record lookups (commits 3 and 2).

**2. [Rule 3] Source-scan test retargeted.** `steamInstallOptionsEntry.test.ts` scanned GameCard for the literal `gameInfo.runner === 'steam'`; retargeted to `hasCapability(gameInfo.runner, 'installHandOffToClient')`, same assertions and RED derivations (commit 1).

**3.** `meta/__tests__/boundaryRatchet.test.ts`: `FRONTEND_CEILING > 0` relaxed to `>= 0` with a comment (62-16 precedent).

## Verification
codecheck, lint (0 errors), boundaries, find-deadcode, prettier, ratchet exit 0. Full jest after last change: the 6 baseline failures plus the known load-only flake dxvkInstallRemove.

## Self-Check: PASSED
