---
phase: 13
slug: keys-waiting-giftable-spares-views
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 + ts-jest |
| **Config file** | `jest.config.js` (`projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend']`) |
| **Quick run command** | `pnpm test -- src/backend/humble/__tests__/viewFilters.test.ts src/backend/humble/__tests__/urgencyBadge.test.ts` |
| **Full suite command** | `pnpm test` (CI-parity: `pnpm test:ci`) |
| **Estimated runtime** | ~60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run targeted `pnpm test -- <touched test file>` for the touched pure helper
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Task IDs to be filled during planning. Requirement→test mapping from RESEARCH.md Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | HVIEW-01 | — | `selectKeysWaiting` membership (D-53) | unit | `pnpm test -- viewFilters.test.ts -t "selectKeysWaiting"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HVIEW-01 | — | `selectKeysWaiting` sort (D-56: dated soonest-first, then undated alphabetical) | unit | `pnpm test -- viewFilters.test.ts -t "sort"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HVIEW-02 | — | `selectGiftableSpares` membership (D-54/D-55: ownedElsewhere + UNREVEALED only) | unit | `pnpm test -- viewFilters.test.ts -t "selectGiftableSpares"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HVIEW-01/02 | — | `getUrgencyTier` tiering (D-61/62/63: ≤7d danger, ≤30d warning, never on REDEEMED/UNREDEEMABLE) | unit | `pnpm test -- urgencyBadge.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HVIEW-01/02 | — | Tab routes render correct child; default redirects to `waiting` (D-50/D-51) | integration or manual — confirm frontend test convention first | TBD | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HVIEW-02 | C4 | Gift confirmation dialog gates external-open; gifted-at timestamp persists and survives disconnect (D-04 carve-out) | unit (store) + manual (dialog) | `pnpm test -- humbleGiftedAtStore` (name TBD) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/humble/__tests__/viewFilters.test.ts` — stubs for HVIEW-01/HVIEW-02 membership + sort (mirrors `groupKeys.test.ts` structure/fixtures)
- [ ] `src/backend/humble/__tests__/urgencyBadge.test.ts` — stubs for D-61/62/63 tiering (mirrors `expirationDisplay.test.ts`)
- [ ] Gifted-at store disconnect-survival test following `electronStores.test.ts` pattern
- [ ] Confirm whether the frontend jest project has any RTL-based route/component test to model the tab-routing test on; if not, tab-routing verification stays manual for this phase

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gift confirmation dialog interaction (irreversibility warning shown, cancel aborts) | HVIEW-02 | Renderer dialog interaction; no confirmed RTL setup in frontend jest project | Open Giftable Spares → click gift action → verify warning copy renders and Cancel performs no external open |
| Deep-link opens Humble keys page in default browser | HVIEW-02 | Requires live browser/`shell.openExternal` | Confirm gift action opens `https://www.humblebundle.com/home/keys` externally |
| Tab navigation + default-tab redirect (if no automated route test) | HVIEW-01/02 | Pending Wave 0 framework confirmation | Open Humble Keys → lands on Keys waiting; switch tabs; back-button and deep links work |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
