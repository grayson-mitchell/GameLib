---
phase: "45"
slug: "native-in-app-winetricks-ui-redesigned-from-scratch-one-self"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-10"
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest |
| **Config file** | `jest.config.*` (repo root) |
| **Quick run command** | `npx jest winetricks --silent` |
| **Full suite command** | `pnpm test:ci` |
| **Estimated runtime** | ~2 seconds (winetricks scope) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest winetricks --silent`
- **After every plan wave:** Run `npx jest winetricks --silent`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

Requirements are the phase's CONTEXT decisions (D-xx). Plan→decision lists come from each PLAN's `requirements:` frontmatter. Test files are matched by decision citation and suite name, not per-assertion.

| Plan | Wave | Requirements | Test files | Status |
|------|------|--------------|------------|--------|
| 45-01 | 1 | D-01, D-02, D-03, D-11, D-12, D-13, D-16, D-18 | `winetricksQueue`, `winetricksApplyGuard`, `winetricksEnvironment`-related backend suites; `visibility.test.ts` | ✅ green |
| 45-02 | 2 | D-03, D-04, D-11, D-17 | `winetricksInstallPathInvariant.test.ts` | ✅ green |
| 45-03 | 1 | D-08, D-14, D-16, D-20 | `common/winetricks/__tests__/metadata`, `visibility`, `verbs` | ✅ green |
| 45-04 | 1 | D-09, D-17, D-19 | `common/winetricks/__tests__/verbs`, `deriveRowState` | ✅ green |
| 45-05 | 3 | D-05, D-06, D-07, D-08, D-10, D-13, D-17 | `groups`, `rowStates`, `everythingElse`, `winetricksInstallMouseRace` | ✅ green |
| 45-06 | 3 | D-09, D-14, D-15, D-16, D-17, D-19 | `winetricksOutputClassifier`, `winetricksListAvailable`, `winetricksListParse` | ✅ green |
| 45-07 | 4 | D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-14, D-21 | `listStates`, `selectionLock`, `groups`, `rowStates` | ✅ green |
| 45-08 | 5 | D-02, D-04, D-12, D-13, D-14, D-16, D-18, D-21 | `stickyBar`, `logPanel`, `environmentBanner`, `queueStateOrdering`, `remountSafety`, `applyTracer` | ✅ green |
| 45-09 | 2 | D-08, D-20 | `stringHome.test.ts`, `rowStates` (key-prefix census) | ✅ green |
| 45-10 | 2 | D-08, D-20 | `stringHome.test.ts`, `tokenCensus.test.ts` | ✅ green |
| 45-11 | 6 | D-17, D-20, D-21, D-22 | `winetricksInstallPathInvariant`, `stringHome` | ✅ green (D-22 manual) |
| 45-12 | 7 | D-01, D-03, D-12, D-14, D-16, D-17, D-18, D-21 | live gate (`45-LIVE-GATE.md`) + component suites | ✅ green (live gate manual) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. One test added by this audit: `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/stringHome.test.ts` (D-20).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live gate: one real verb applied end to end | D-21 | Needs a real Wine prefix and real winetricks | See `45-LIVE-GATE.md` |
| Phase 44 `ROADMAP.md` bookkeeping | D-22 | Docs-only change, no runtime behaviour | Check the Phase 44 row in `ROADMAP.md` |

Known narrowness: `stringHome.test.ts` guards only the `winetricksBrowse` key prefix (present in `gamelib.json`, absent from `translation.json`), not every string the tab might add. The per-decision test mapping above is by citation and suite name; D-14 has only one citing file but its behaviours are exercised by `rowStates`, `stickyBar` and `logPanel`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-15

---

## Validation Audit 2026-10-15

| Metric | Count |
|--------|-------|
| Gaps found | 4 |
| Resolved | 2 |
| Escalated | 2 |

Resolved: D-14 (covered by existing suites), D-20 (new `stringHome.test.ts`). Escalated to manual-only: D-21 live gate, D-22 bookkeeping. Re-run after the audit: 26 suites, 510 tests, all green.
