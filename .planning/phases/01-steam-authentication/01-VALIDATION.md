---
phase: 1
slug: steam-authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 with ts-jest |
| **Config file** | `src/backend/jest.config.js` (Jest projects entry in root `jest.config.js`) |
| **Quick run command** | `npm test -- --testPathPattern=steam --passWithNoTests` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (unit tests only) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=steam --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + manual QA of AUTH-01 and AUTH-02 with real Steam credentials
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | AUTH-01/02/03/04/05 | — | `StoreStructure` updated before any store instantiation | Unit | `npm test -- --testPathPattern=steam --passWithNoTests` | ❌ Wave 0 | ⬜ pending |
| 1-xx-01 | xx | 1 | AUTH-03 | — | `isLoggedIn()` reads configStore, never raw disk | Unit | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 | ⬜ pending |
| 1-xx-02 | xx | 1 | AUTH-04 | T-logout | `logout()` clears configStore AND disconnects steam-user client | Unit | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 | ⬜ pending |
| 1-xx-03 | xx | 1 | AUTH-05 | — | `isSteamClientInstalled()` returns false on missing path | Unit (mock graceful-fs) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 | ⬜ pending |
| 1-xx-04 | xx | 2 | AUTH-01 | T-QR | QR challenge URL returned from IPC handler | Unit (mock steam-session) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 | ⬜ pending |
| 1-xx-05 | xx | 2 | AUTH-02 | T-creds | Credential login calls steam-session; never stores password | Unit (mock steam-session) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 | ⬜ pending |
| 1-xx-06 | xx | 2 | AUTH-02 | T-guard | SteamGuard code submission calls submitSteamGuardCode | Unit (mock steam-session) | `npm test -- --testPathPattern=steam/user` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: Task IDs xx will be updated to match final plan numbering after planning completes.*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/__tests__/user.test.ts` — unit tests covering AUTH-01 through AUTH-05
- [ ] Mock setup: `jest.mock('steam-session')`, `jest.mock('steam-user')`, `jest.mock('electron')` (for `safeStorage`), `jest.mock('graceful-fs')`
- [ ] Reference pattern: `src/backend/__tests__/utils.test.ts` — existing test pattern (no store manager tests exist yet)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| QR code scan with Steam mobile app | AUTH-01 | Requires real Steam session and mobile device | Open app → Login → Steam → QR Code tab. Scan with Steam app. Verify login completes and Runner card shows username. |
| SteamGuard email code delivery and entry | AUTH-02 | Requires real Steam account with email guard | Login with credentials for email-guard account. Verify step 2 appears. Enter code. Verify success. |
| App behavior when Steam client is not installed | AUTH-05 | Requires modifying or mocking filesystem paths | Temporarily rename Steam binary, attempt login. Verify warning state with Download Steam button. |
| Login persistence across app restart | AUTH-03 | Requires app restart | Login → close app → reopen. Verify Runner card shows logged-in state without re-authentication. |
| TOTP code entry (authenticator app) | AUTH-02 | Requires real TOTP-protected account | Login with TOTP account. Verify same step 2 UI handles TOTP codes. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
