---
phase: 15
slug: store-overlay-expiration-alerts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | ts-jest (Jest) — two-project setup |
| **Config file** | `jest.config.js` (root, `projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend']`), plus `src/backend/jest.config.js` / `src/frontend/jest.config.js` |
| **Quick run command** | `npx jest src/backend/humble/__tests__/<file>.test.ts` (pure helpers in `common/` are tested from the backend project) |
| **Full suite command** | `pnpm test:ci` (or `pnpm test`) |
| **Estimated runtime** | ~30 seconds targeted; full suite per wave |

---

## Sampling Rate

- **After every task commit:** Run targeted `npx jest <changed-file's test>` (< 30s)
- **After every plan wave:** Run `pnpm test:ci` (full suite, `--runInBand --silent`)
- **Before `/gsd:verify-work`:** Full suite must be green, plus `pnpm codecheck` (tsc --noEmit) and `pnpm lint`
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | HSTORE-01 | — | `resolveDiscountBadge` returns 'owned' for exact title→AppID→steam.library match | unit | `npx jest src/backend/discounts/__tests__/badges.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HSTORE-01 | — | `resolveDiscountBadge` returns 'key-available' for exact AppID match against `selectKeysWaiting` membership | unit | same file | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HSTORE-01 | — | `resolveDiscountBadge` returns null when title has no exact match — never falls to fuzzy | unit | same file | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HSTORE-01 | — | 'Owned' wins over 'key-available' when both apply (D-85) | unit | same file | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HSTORE-03 | — | Pinned-section membership == `getUrgencyTier(...) !== null` subset of `selectKeysWaiting` | unit | `npx jest src/backend/humble/__tests__/viewFilters.test.ts` (extend) | ❌ W0 (ext) | ⬜ pending |
| TBD | TBD | TBD | HSTORE-03 | — | Pinned section hidden when zero keys are within the urgency window (D-89) | unit | same as above | ❌ W0 (ext) | ⬜ pending |
| TBD | TBD | TBD | HSTORE-03 | — | `detectExpirationTransitions`: null→date fires; date→same-date does not; date→different-date fires again | unit | `npx jest src/backend/humble/__tests__/expirationAlerts.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HSTORE-03 | — | Digest copy: single-key form names the game; 2+ keys use plural digest form | unit | same file | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HSTORE-03 | — | Notification click triggers `sendFrontendMessage('openScreen', '/humble-keys/waiting')` | unit (mock Notification/IPC) | same file | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HSTORE-03 | — | Settings toggle default is `true` and gates notification firing | unit | `npx jest src/frontend/screens/Settings/__tests__/` (or backend config default test) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs to be filled by planner during PLAN.md creation.*

---

## Wave 0 Requirements

- [ ] `src/common/discounts/badges.ts` + `src/backend/discounts/__tests__/badges.test.ts` — new pure helper, no existing file
- [ ] `src/backend/humble/expirationAlerts.ts` + `src/backend/humble/__tests__/expirationAlerts.test.ts` — new transition-detection + digest-copy logic
- [ ] `src/backend/humble/electronStores.ts` — extend with `humbleNotifiedExpirationStore` (existing file gains an export; extend existing `electronStores.test.ts`, do not replace)
- [ ] Pinned-section membership helper (extend `viewFilters.ts` or add a sibling pure function) + corresponding test extension

*(No framework install needed — ts-jest/Jest already fully configured for both `common/` (via backend project) and frontend component tests.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OS notification renders and click focuses app window, navigates to /humble-keys/waiting | HSTORE-03 | Electron `Notification` display/click behavior is OS-level; unit tests can only mock the API | Trigger a sync where a key gains an expiration; observe OS toast; click it; verify app focuses on the keys-waiting view |
| Notification does not repeat on subsequent syncs for the same key/date | HSTORE-03 | Requires real sync cycles against persisted electron-store state | Run sync twice with same data; confirm single notification |
| Ownership badges visually render on Discounts screen | HSTORE-01 | Visual placement/legibility judgment | Connect Humble account, open Discounts screen, confirm Owned / Unclaimed-key / New badges appear per title |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
