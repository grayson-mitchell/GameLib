---
phase: 26
slug: steam-key-redemption
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-20
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 26-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (`ts-jest` preset), multi-project config |
| **Config file** | `jest.config.js` (`projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend', '<rootDir>/meta']`) |
| **Quick run command** | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts` |
| **Full suite command** | `npm test` (runs `jest` across all projects) |
| **Estimated runtime** | ~seconds (quick backend file, mocked `steam-user`, no live network) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts` (fast, mocked, seconds)
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds (quick run)

> **Live/manual carve-out:** SPEC REQ2/REQ4/REQ5 acceptance criteria require the user's real spare test keys (success + already-owned + invalid live verification). These are **manual-only UAT items**, tracked separately below — they are NOT covered by `npm test` and must not be assumed green from the automated suite.

---

## Per-Task Verification Map

| SPEC # | Behavior | Wave | Test Type | Automated Command | File Exists | Status |
|--------|----------|------|-----------|-------------------|-------------|--------|
| REQ1 | Sidebar item hidden/shown based on Steam login | — | unit (frontend) | `npx jest src/frontend/components/UI/Sidebar/components/SidebarLinks -x` | ❌ W0 — no `SidebarLinks` test file exists | ⬜ pending |
| REQ2 | Backend wrapper calls `redeemKey` on connected client, returns classified result | — | unit (backend) | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -x` | ✅ extend existing `jest.mock('steam-user')` pattern | ⬜ pending |
| REQ3 | Format validator rejects empty/malformed, allows non-5-5-5 input | — | unit | `npx jest <new-validator-test-path> -x` | ❌ W0 — new pure function, new colocated test | ⬜ pending |
| REQ4 | Success path: `packageList` name extracted, `refreshLibrary({library:'steam'})` invoked | — | unit (backend) + manual/live | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -x` (classifier); live redeem is manual-only | ✅ backend unit; live = UAT | ⬜ pending |
| REQ5 | All 8 `EPurchaseResult` values classify into correct 1-of-4 bucket | — | unit (backend, table-driven) | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -x` | ✅ same file | ⬜ pending |
| REQ6 | `store` field present and defaulted to `'steam'` on request/response shape | — | unit (backend, type-level/runtime assert) | `npx jest src/backend/storeManagers/steam/__tests__/user.test.ts -x` | ✅ same file | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Wave column filled by planner once plan/wave IDs are minted.*

---

## Wave 0 Requirements

- [ ] `SidebarLinks` test file (`src/frontend/components/UI/Sidebar/components/SidebarLinks/__tests__/index.test.tsx` or similar) — none exists today; REQ1's login-gating has no current automated coverage pattern to extend (new test infrastructure, not just new cases).
- [ ] New test file for the client-side format validator (`validateKeyFormat` / `normalizeKey`), wherever the planner places it — pure function, trivial to test once written.
- [ ] No new backend test *infrastructure* gap — `src/backend/storeManagers/steam/__tests__/user.test.ts` already exists with an established `jest.mock('steam-user')` + `SteamUserLib` mock pattern (`describe('SteamUser', ...)` at line 116) that the new `redeemKey()` tests extend directly.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Redeem a valid unowned key over the live CM session; game appears after refresh, no restart | REQ2, REQ4 | Requires a real Steam session + a real unowned spare key; cannot be exercised against mocked `steam-user` | Log into Steam in GameLib → open redeem modal → paste a known-valid unowned spare key → confirm success message names the game and the game appears in the Steam library view without restart |
| Already-owned key shows distinct "already owned" message | REQ5 | Needs a real key for an already-owned title | Redeem a key for a game the account already owns → confirm the "already owned" copy (not generic failure) |
| Invalid/malformed key shows distinct "invalid key" message | REQ5 | Needs a live rejection round-trip | Redeem a garbage-but-shaped key → confirm distinct "invalid key" copy |
| Rate-limited/cooldown result surfaces as distinct "wait" message | REQ5 | Account-level cooldown is hard to reproduce on demand | Verify via `EPurchaseResult.OnCooldown` (53) → message mapping in the classifier unit test if not reproducible live (SPEC permits mapping-verified) |
| Raw key values never appear in logs | SPEC constraint | Log inspection is observational | After any redeem attempt, grep the log output — confirm no raw key value present, only status (mirrors `doRevealKey` redaction) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (plan-checker confirmed all 8 tasks carry a jest/tsc/grep verify)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — SidebarLinks test (26-05 Task 2) + validator test (26-02 Task 1) addressed inline
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

> `wave_0_complete` stays `false` until execution actually writes the two new test files (26-02, 26-05); flip it during execute-phase.

**Approval:** approved 2026-07-20 (plan-checker VERIFICATION PASSED — Dimension 8 green)
