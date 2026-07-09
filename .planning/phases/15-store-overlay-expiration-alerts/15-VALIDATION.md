---
phase: 15
slug: store-overlay-expiration-alerts
status: draft
nyquist_compliant: true
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
| 15-01/T1 | 15-01 | 1 | HSTORE-01 | T-15-01-01 | `resolveDiscountBadge` returns 'owned' for exact title→AppID→steam.library match | unit | `npx jest src/backend/discounts/__tests__/badges.test.ts` | ❌ W0 | ⬜ pending |
| 15-01/T1 | 15-01 | 1 | HSTORE-01 | — | `resolveDiscountBadge` returns 'key-available' for exact AppID match against `selectKeysWaiting` membership | unit | same file | ❌ W0 | ⬜ pending |
| 15-01/T1 | 15-01 | 1 | HSTORE-01 | T-15-01-01 | `resolveDiscountBadge` returns null when title has no exact match — never falls to fuzzy | unit | same file | ❌ W0 | ⬜ pending |
| 15-01/T1 | 15-01 | 1 | HSTORE-01 | — | 'Owned' wins over 'key-available' when both apply (CONTEXT D-85) | unit | same file | ❌ W0 | ⬜ pending |
| 15-04/T1 | 15-04 | 1 | HSTORE-03 | T-15-04-02 | Pinned-section membership == `getUrgencyTier(...) !== null` subset of `selectKeysWaiting`; pinned ∩ rest == ∅ (D-88) | unit | `npx jest src/backend/humble/__tests__/viewFilters.test.ts` (extend) | ❌ W0 (ext) | ⬜ pending |
| 15-04/T1 | 15-04 | 1 | HSTORE-03 | — | Pinned partition empty when zero keys are within the urgency window (D-89) | unit | same as above | ❌ W0 (ext) | ⬜ pending |
| 15-03/T1 | 15-03 | 2 | HSTORE-03 | T-15-03-03 | `detectAndNotifyExpirationTransitions`: null→date fires; date→same-date does not; date→different-date fires again | unit | `npx jest src/backend/humble/__tests__/expirationAlerts.test.ts` | ❌ W0 | ⬜ pending |
| 15-03/T1 | 15-03 | 2 | HSTORE-03 | T-15-03-03 | First-sync baseline (`suppressNotifications`) seeds store WITHOUT firing — no fresh-connect storm (locked decision 3) | unit | same file | ❌ W0 | ⬜ pending |
| 15-03/T1 | 15-03 | 2 | HSTORE-03 | T-15-03-01 | Digest copy: single-key form names the game; 2+ keys use plural digest form; no `HumbleKeyInternal` access | unit | same file | ❌ W0 | ⬜ pending |
| 15-03/T1 | 15-03 | 2 | HSTORE-03 | T-15-03-02 | Notification click triggers `sendFrontendMessage('openScreen', '/humble-keys/waiting')` (fixed route) | unit (mock Notification/IPC) | same file | ❌ W0 | ⬜ pending |
| 15-03/T1 | 15-03 | 2 | HSTORE-03 | — | Settings toggle off / unsupported / Steam Deck → store advances but no notification fires | unit | same file | ❌ W0 | ⬜ pending |
| 15-02/T1 | 15-02 | 1 | HSTORE-03 | — | `notifyHumbleExpirations` factory default is `true` (D-93 on-by-default) | source/unit | `grep -c "notifyHumbleExpirations: true" src/backend/config.ts` == 1 | ❌ W0 | ⬜ pending |
| 15-02/T2 | 15-02 | 1 | HSTORE-03 | T-15-02-01 | `humbleNotifiedExpirationStore` set/get roundtrip keyed by machineName, value `{ expiration }` only, disconnect-exempt | unit | `npx jest src/backend/humble/__tests__/electronStores.test.ts` | ❌ W0 (ext) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs filled by planner: `{plan}/T{n}`. Decision IDs D-78..D-93 are Phase 15 CONTEXT/UI-SPEC IDs (numeric collision with Phase 14's historical D-77..D-80 — see plan Decision notes).*

---

## Wave 0 Requirements

- [ ] `src/common/discounts/badges.ts` + `src/backend/discounts/__tests__/badges.test.ts` — new pure helper, no existing file (Plan 15-01 Task 1)
- [ ] `src/backend/humble/expirationAlerts.ts` + `src/backend/humble/__tests__/expirationAlerts.test.ts` — new transition-detection + digest-copy logic (Plan 15-03 Task 1)
- [ ] `src/backend/humble/electronStores.ts` — extend with `humbleNotifiedExpirationStore` (existing file gains an export; extend existing `electronStores.test.ts`, do not replace) (Plan 15-02 Task 2)
- [ ] Pinned-section membership helper — `partitionWaitingByUrgency` added to `viewFilters.ts` + `viewFilters.test.ts` extension (Plan 15-04 Task 1)

*(No framework install needed — ts-jest/Jest already fully configured for both `common/` (via backend project) and frontend component tests.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OS notification renders and click focuses app window, navigates to /humble-keys/waiting | HSTORE-03 | Electron `Notification` display/click behavior is OS-level; unit tests can only mock the API | Trigger a sync where a key gains an expiration; observe OS toast; click it; verify app focuses on the keys-waiting view |
| Notification does not repeat on subsequent syncs for the same key/date | HSTORE-03 | Requires real sync cycles against persisted electron-store state | Run sync twice with same data; confirm single notification |
| Fresh Humble connect does not fire a notification storm | HSTORE-03 | Requires a real first-ever sync against an empty notified-state store | Connect a fresh Humble account with many expiring keys; confirm zero notifications on the baseline sync |
| Ownership badges visually render on Discounts screen | HSTORE-01 | Visual placement/legibility judgment | Connect Humble account, open Discounts screen, confirm Owned / Key-available badges appear per matched title (low coverage expected per RESEARCH Pitfall 1) |
| Pinned "Expiring soon" section renders/hides correctly | HSTORE-03 | Visual + DOM presence judgment | With/without keys in the 30-day window, confirm the static section appears/disappears and never duplicates a row |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-filled 2026-07-09 (Task IDs mapped to 15-01..15-04)
