---
phase: 5
slug: branding-about-polish
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-02
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 with ts-jest |
| **Config file** | `src/backend/jest.config.js` (tests in `src/backend/**/__tests__/*.test.ts`) |
| **Quick run command** | `pnpm test --testPathPattern=tray_icon` |
| **Full suite command** | `pnpm test` |
| **Type check command** | `pnpm codecheck` (runs `tsc --noEmit`) |
| **Branding check** | `node scripts/verify-branding.cjs` |
| **Estimated runtime** | ~30 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm codecheck` (tsc zero errors is the primary gate)
- **After every plan wave:** Run `pnpm test` + `node scripts/verify-branding.cjs`
- **Before `/gsd:verify-work`:** Full suite green + branding script green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-xx-xx | tray | 1 | BRAND-02 | — | N/A | unit | `pnpm test --testPathPattern=tray_icon` | ✅ exists, needs assertion | ⬜ pending |
| 05-xx-xx | strings | 1 | BRAND-03 | — | N/A | branding script | `node scripts/verify-branding.cjs` | ✅ exists, needs new section | ⬜ pending |
| 05-xx-xx | changelog | 1 | APP-01 | — | Local read; `readFileSync` in try/catch (V5, low risk) | branding script | `node scripts/verify-branding.cjs` | ✅ script, needs new check | ⬜ pending |
| 05-xx-xx | changelog | 1 | APP-01 | — | `getLatestReleases` returns `[]` (no network) | unit | `pnpm test --testPathPattern=utils` | ❌ W0 gap | ⬜ pending |
| 05-xx-xx | readme | 1 | BRAND-04 | — | N/A | manual spot-check | Manual review of README.md | ✅ README exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Plan/wave IDs to be finalized by the planner; requirement→test mapping is authoritative.*

---

## Wave 0 Requirements

- [x] Add tooltip assertion to `src/backend/tray_icon/__tests__/tray_icon.test.ts` — asserts tooltip equals `'GameLib'` (BRAND-02) — *covered inline by plan 05-01 Task 3*
- [x] Add `getLatestReleases` suppression test in `src/backend/**/__tests__/` — asserts it returns `[]` under normal conditions (APP-01, D-04) — *covered inline by plan 05-01 Task 2*
- [x] Extend `scripts/verify-branding.cjs` with a new section asserting: rebranded backend strings say "GameLib", tray tooltip literal, and `public/changelog.json` exists + parses as a valid `Release` (BRAND-03, APP-01) — *covered inline by plan 05-04 Task 1*

*Existing test infrastructure covers the majority of this phase; the above are additions, not rewrites. All Wave 0 items are covered inline by phase plans — no separate Wave 0 plan is required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README reads accurately (typos fixed, fork/Steam/build-install correct, attribution kept) | BRAND-04 | Prose quality is not machine-assertable beyond typo/string checks | Read README.md top-to-bottom; confirm GameLib intro is typo-free, fork-of-Heroic attribution + upstream links retained, instructional steps say GameLib |
| Version-click opens release-notes modal showing GameLib 1.0.0 content + upstream Heroic v2.22.0 link | APP-01 | Requires running the app and clicking the sidebar version | Launch app, click version in sidebar, confirm modal renders bundled notes + upstream link resolves to Heroic v2.22.0 release |
| macOS tray tooltip visually reads "GameLib" | BRAND-02 | Tray hover is OS-level UI | On macOS, hover the menu-bar icon; tooltip reads "GameLib" |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (tray assertion, getLatestReleases test, verify-branding extension)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
