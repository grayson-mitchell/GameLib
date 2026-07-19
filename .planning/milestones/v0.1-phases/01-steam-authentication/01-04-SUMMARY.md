---
phase: 01-steam-authentication
plan: "04"
subsystem: steam-auth
tags: [steam, guard, normalization, alphanumeric, email-code, tdd, fix]
dependency_graph:
  requires: [01-03]
  provides: [alphanumeric-email-guard-normalization]
  affects: [src/frontend/screens/Login/components/SteamLogin/index.tsx, src/backend/storeManagers/steam/user.ts, src/backend/storeManagers/steam/__tests__/user.test.ts]
tech_stack:
  added: []
  patterns: [frontend-normalization, defense-in-depth-backend, tdd-red-green]
key_files:
  created: []
  modified:
    - src/frontend/screens/Login/components/SteamLogin/index.tsx
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/__tests__/user.test.ts
decisions:
  - "Normalize guard code at two layers: onChange + handleGuardSubmit (frontend) and submitSteamGuardCode entry (backend)"
  - "Used trim().toUpperCase() — strip().toUpperCase() on internal whitespace not needed since Steam codes never have internal spaces"
  - "inputMode changed to text (not dropped) to preserve keyboard hint compatibility across mobile browsers"
metrics:
  duration: "~8 min"
  completed: "2026-06-29T07:30:07Z"
  tasks: 2
  files: 3
---

# Phase 01 Plan 04: Email SteamGuard Alphanumeric Fix Summary

**One-liner:** Frontend + backend normalization (trim + toUpperCase) to accept 5-character alphanumeric email Steam Guard codes (e.g. KQM4F), closing UAT gap without touching numeric TOTP path.

## What Was Built

Closed Phase 1 UAT Test 2 gap: EMAIL Steam Guard login was failing because the guard input advertised numeric-only entry and the code was forwarded verbatim. Steam rejects mis-cased or whitespace-padded codes as `InvalidLoginAuthCode (65)`.

**Task 1 — Frontend (SteamLogin/index.tsx):**
- Removed `inputMode="numeric"` from the Steam Guard `<input>`, replaced with `inputMode="text"`
- Added `autoCapitalize="characters"` and `style={{ textTransform: 'uppercase' }}` for mobile UX
- Updated `aria-label` to "Steam Guard code (letters or digits)"
- `onChange` now stores normalized form: `e.target.value.replace(/\s/g, '').toUpperCase()`
- `handleGuardSubmit` passes `guardCode.trim().toUpperCase()` to `window.api.steamSubmitGuard` as defense-in-depth
- Prompt text and error message updated to reference both email and authenticator app

**Task 2 — Backend TDD (user.ts + user.test.ts):**

RED phase: Added 4 regression tests inside the existing `describe('submitSteamGuardCode()')` block:
1. Alphanumeric `KQM4F` resolves `{ status: 'done' }` and mock receives `'KQM4F'` (passes even before GREEN)
2. Lowercase `kqm4f` → mock must receive `'KQM4F'` (FAILED before GREEN)
3. Padded `'  kqm4f  '` → mock must receive `'KQM4F'` (FAILED before GREEN)
4. Numeric `'12345'` → mock receives `'12345'` unchanged (no regression)

GREEN phase: Added `const normalized = code.trim().toUpperCase()` in `submitSteamGuardCode` before forwarding to `session.submitSteamGuardCode(normalized)`. Preserves all event-wiring, finishAuth, and error/timeout handling.

## Verification Results

- `npm run codecheck` (TypeScript, no `--noEmit` errors): PASS
- `npm test -- --testPathPattern=steam` (6 suites, 136 tests): PASS
- All 4 new EmailCode normalization tests: PASS (GREEN confirmed)
- Pre-existing `'12345'` and `'99999'` tests: PASS (no regression)

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `febb573` | fix | Frontend: alphanumeric guard input, normalization, guard-type messaging |
| `2c642a2` | test | RED: failing EmailCode normalization tests |
| `e90536d` | feat | GREEN: defense-in-depth normalization in submitSteamGuardCode |

## TDD Gate Compliance

- RED gate commit: `2c642a2` (test) — 2 tests failed as expected before implementation
- GREEN gate commit: `e90536d` (feat) — all tests pass after normalization added
- REFACTOR gate: not needed (implementation is already minimal/clean)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all changes are functional wiring with no placeholders.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes introduced.

## Self-Check

**Files exist:**
- `src/frontend/screens/Login/components/SteamLogin/index.tsx` — FOUND (modified)
- `src/backend/storeManagers/steam/user.ts` — FOUND (modified)
- `src/backend/storeManagers/steam/__tests__/user.test.ts` — FOUND (modified)

**Commits exist:**
- `febb573` — FOUND
- `2c642a2` — FOUND
- `e90536d` — FOUND

## Self-Check: PASSED
