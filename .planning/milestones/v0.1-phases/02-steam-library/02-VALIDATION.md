---
phase: 2
slug: steam-library
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-27
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 with ts-jest |
| **Config file** | `src/backend/jest.config.js` (Jest projects entry in root `jest.config.js`) |
| **Quick run command** | `npm test -- --testPathPattern=steam --passWithNoTests` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (quick), ~120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=steam --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + manual QA of LIB-01–04 with real Steam account
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | LIB-01 | — | N/A | unit | `npm test -- --testPathPattern=steam/library --passWithNoTests` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 0 | LIB-04 | — | N/A | unit | `npm test -- --testPathPattern=steam/games --passWithNoTests` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | LIB-01,LIB-02,LIB-03 | T-2-01 | ACF parse wrapped in try/catch | unit | `npm test -- --testPathPattern=steam/library` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | LIB-04 | T-2-02 | short_description rendered as text (not innerHTML) | unit | `npm test -- --testPathPattern=steam/games` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | LIB-01 | — | N/A | manual | — | Manual only | ⬜ pending |
| 2-03-02 | 03 | 2 | LIB-02 | — | N/A | manual | — | Manual only | ⬜ pending |
| 2-03-03 | 03 | 2 | LIB-03 | — | N/A | manual | — | Manual only | ⬜ pending |
| 2-03-04 | 03 | 2 | LIB-04 | — | N/A | manual | — | Manual only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/__tests__/library.test.ts` — stubs for LIB-01, LIB-02, LIB-03
- [ ] `src/backend/storeManagers/steam/__tests__/games.test.ts` — stubs for LIB-04 (lazy metadata fetch, dedup)
- [ ] Mocks needed: `jest.mock('steam-user')`, `jest.mock('backend/utils', () => ({ getSteamLibraries: jest.fn() }))`, `jest.mock('graceful-fs')`, `jest.mock('@node-steam/vdf')`, `jest.mock('axios')`, `jest.mock('backend/logger')`

*Framework (Jest + ts-jest) already installed — no new installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Steam games visible in Library screen after login | LIB-01 | Requires real Steam account + CM connection | Log in with Steam, verify games appear in library grid alongside Epic/GOG/Amazon |
| Install badge shows/hides correctly | LIB-02 | Requires machine with Steam installed + ACF files on disk | Check a game you own but haven't installed (should show download icon, grayscale art) vs. an installed game (full color, "Installed" badge) |
| Playtime "X hours" / "Never played" displays correctly | LIB-03 | Requires real Steam session data | Verify a game with >0 playtime shows "N hours"; verify a game never played shows "Never played" |
| Cover art and metadata loads lazily on scroll | LIB-04 | Requires network + viewport interaction | Scroll through a large library; verify cards show skeleton then fade in real art within ~2s per card |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
