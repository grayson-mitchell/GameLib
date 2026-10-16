---
phase: "48"
slug: "library-rows-user-composed-filter-rows-replacing-the-single"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-09"
reconstructed_from: [48-01..48-18 PLAN.md and SUMMARY.md, 48-SPEC.md, 48-UAT.md, 48-VERIFICATION.md]
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed after execution (validate-phase State B, 2026-10-09): no VALIDATION.md was seeded
> by plan-phase for this phase. Everything below is read from the shipped artifacts and
> re-measured on this machine (Windows 11, HEAD 24d38d58f), not copied from a plan's promise.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (projects: Frontend, Backend, Common, Meta; `jest.config.js`) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest FocusRowStrip FilterFocusRow themeTokens GameCard focusRowMigration GlobalStateFocusRowHydration focusRowFirstLaunchHydration inputModality` |
| **Full suite command** | `npm run test:ci` (`jest --maxWorkers=2 --silent`) |
| **Estimated runtime** | quick run about 7 s measured (13 suites, 392 tests, 2026-10-09); full suite minutes, and about 40 suites fail on the operator's Windows box independent of any change (CI is ubuntu-only) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command above
- **After every plan wave:** Run `npm run test:ci` (read against the known Windows-only failure set when run locally)
- **Before `/gsd-verify-work`:** Full suite must be green on CI; quick run green locally
- **Max feedback latency:** about 10 seconds for the quick run

---

## Requirement Coverage

R1-R7 are phase-local, defined in 48-SPEC.md; REQUIREMENTS.md has no Phase 48 rows by design (ROADMAP: "7, LOCKED — see 48-SPEC.md").

| Requirement | Behaviour | Automated coverage (all green 2026-10-09) | Status |
|-------------|-----------|--------------------------------------------|--------|
| R1 | One persisted `{kind,value}` selection or off, survives restart | `GlobalStateFocusRowHydration.test.ts`, `focusRowFirstLaunchHydration.test.ts` (real read path), `focusRowMigration.test.ts` | COVERED |
| R2 | FOCUS ROW section in the Games tier-2 panel: single-select, clearable, fixed group order, divider contrast | `filterFocusRow.test.tsx`; divider-label contrast census in `themeTokens.test.ts` | COVERED |
| R3 | Horizontal strip: one card tall, max 20, controls, grid-width parity, chevron reach and contrast, ring geometry, controller scroll-into-view | `focusRowOverflow.test.ts`, `focusRowStripSource.test.ts`, `gameCardControllerGeometry.test.ts`, `gameCardFocusRing.test.ts`, `inputModality.test.ts`, chevron census in `themeTokens.test.ts` | COVERED (rendering invariants manual, below) |
| R4 | Independent of filters except hidden games | `focusRowSelectors.test.ts` (incl. held-out backstop) | COVERED |
| R5 | recentlyPlayed by recency, else by title, stable tie-break | `focusRowSelectors.test.ts` | COVERED |
| R6 | `Recent Games to Show` control and dead code removed | 48-06 verify gates, re-run 2026-10-09: `git grep -il maxRecentGames -- src` returns 0 files; no `MaxRecentGames`/`LibraryTopSection` component file is tracked; `libraryTopSection` survives only in the migration read path (`config.ts`, `focusRowMigration.ts`, `types.ts`, `GlobalState.tsx`) | COVERED (shell gate, not a jest suite) |
| R7 | `Library Top Section` removed; one-time migration; clear-then-relaunch does not restore | `focusRowMigration.test.ts`, `focusRowFirstLaunchHydration.test.ts`, `GlobalStateFocusRowHydration.test.ts` | COVERED |

---

## Per-Task Verification Map

Every task in every plan carries a `<verify>` block with at least one `<automated>` command (counted 2026-10-09: 49 tasks, 0 `<manual>` blocks). Threat refs: none of the 18 plans declares a threat model, so the column reads "—".

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 48-01-01..03 | 01 | 1 | R2, R3 | — | N/A | unit + source | `npx jest FilterFocusRow FocusRowStrip` | ✅ | ✅ green |
| 48-02-01..03 | 02 | 2 | R1, R3, R4, R5 | — | N/A | unit | `npx jest focusRowSelectors GlobalStateFocusRowHydration` | ✅ | ✅ green |
| 48-03-01..02 | 03 | 3 | R2 | — | N/A | component | `npx jest FilterFocusRow` | ✅ | ✅ green |
| 48-04-01..03 | 04 | 3 | R3 | — | N/A | unit + source | `npx jest focusRowOverflow focusRowStripSource` | ✅ | ✅ green |
| 48-05-01 | 05 | 3 | R7 | — | N/A | human checkpoint (decision) | — (operator ruling recorded in 48-05-SUMMARY.md) | n/a | ✅ ruled |
| 48-05-02..03 | 05 | 3 | R7 | — | N/A | unit | `npx jest focusRowMigration` | ✅ | ✅ green |
| 48-06-01 | 06 | 4 | R6 | — | N/A | shell gate + all jest projects | `git grep -il maxRecentGames -- src` (expects 0) and `npx jest --selectProjects Backend/Frontend/Meta/Common` | ✅ | ✅ green |
| 48-07-01..03 | 07 | 1 | R7, R1 | — | N/A | unit (real read path) | `npx jest focusRowFirstLaunchHydration focusRowMigration` | ✅ | ✅ green |
| 48-08-01 | 08 | 2 | R1, R2, R3, R6, R7 | — | N/A | tracer (live gate rig) | `npx jest FocusRowStrip FilterFocusRow` | ✅ | ✅ green |
| 48-08-02 | 08 | 2 | R1, R2, R3, R6, R7 | — | N/A | human checkpoint (live gate) | — (48-UAT.md items 1-7) | n/a | ✅ UAT pass |
| 48-09-01..02 | 09 | 1 | R3 (G-48-8a, 8b) | — | N/A | source | `npx jest gameCardControllerGeometry gameCardFocusRing` | ✅ | ✅ green |
| 48-10-01..02 | 10 | 1 | R3 (G-48-4b, 9) | — | N/A | source + unit | `npx jest focusRowStripSource focusRowOverflow` | ✅ | ✅ green |
| 48-11-01..03 | 11 | 2 | R2, R3 (G-48-4a, 7) | — | N/A | token census | `npx jest themeTokens focusRowStripSource` | ✅ | ✅ green |
| 48-12-01..03 | 12 | 3 | R3 (G-48-8c) | — | N/A | unit + source | `npx jest focusRowOverflow focusRowStripSource` | ✅ | ✅ green |
| 48-13-01..02 | 13 | 1 | R3 (G-48-11b) | — | N/A | source (red gate first) + WebKit desk harness | `npx jest focusRowStripSource`; `evidence/48-13/run-webkit.sh` (macOS only) | ✅ | ✅ green |
| 48-14-01..02 | 14 | 2 | R3 (G-48-11a) | — | N/A | unit | `npx jest focusRowOverflow FocusRowStrip` | ✅ | ✅ green |
| 48-15-01 | 15 | 3 | R3 (G-48-11a, 11b) | — | N/A | tracer (live gate rig) | `npx jest FocusRowStrip` | ✅ | ✅ green |
| 48-15-02 | 15 | 3 | R3 | — | N/A | human checkpoint (live gate) | — (48-UAT.md items 4, 9, 11, 12) | n/a | ✅ UAT pass |
| 48-15-03 | 15 | 3 | R3 | — | N/A | docs | `npx prettier --check` on written paths (planning paths are prettier-ignored; recorded as vacuous in the plan) | ✅ | ✅ |
| 48-16-01..03 | 16 | 1 | R3 (G-48-12a) | — | N/A | unit + source + Chromium desk harness | `npx jest inputModality gameCardFocusRing`; `evidence/48-16/` CDP harness | ✅ | ✅ green |
| 48-17-01..03 | 17 | 2 | R3, R4 (G-48-11c) | — | N/A | unit + source + WebKit desk harness | `npx jest focusRowOverflow focusRowStripSource FocusRowStrip`; `evidence/48-17/run-webkit.sh` (macOS only) | ✅ | ✅ green |
| 48-18-01 | 18 | 3 | R3, R4 | — | N/A | tracer (live gate rig) | `npx jest FocusRowStrip GameCard` | ✅ | ✅ green |
| 48-18-02 | 18 | 3 | R3, R4 | — | N/A | human checkpoint (live gate) | — (48-UAT.md items 11, 12) | n/a | ✅ UAT pass |
| 48-18-03 | 18 | 3 | R3, R4 | — | N/A | docs | — (UAT bookkeeping) | n/a | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Quick-run measurement backing the ✅ column: `npx jest FocusRowStrip FilterFocusRow themeTokens GameCard focusRowMigration GlobalStateFocusRowHydration focusRowFirstLaunchHydration inputModality` on 2026-10-09 at HEAD 24d38d58f: 13 suites passed, 392 tests passed, 7.3 s.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No Wave 0 was needed: jest and its four projects predate the phase, and every new suite was written by the plan that introduced the behaviour it gates (TDD tasks are marked `tdd="true"` in the plans).

---

## Manual-Only Verifications

These are rendering, hit-testing and input-device invariants that no jest project can see. Each was measured live and is recorded as a pass in `48-UAT.md`.

| Behavior | Requirement | Why Manual | Test Instructions / Record |
|----------|-------------|------------|----------------------------|
| Chevron glyph at least 3:1 over real artwork in all 10 themes; divider labels at least 4.5:1 | R2, R3 | Pixel contrast against artwork and the disc edge; the token census cannot see art | 48-UAT.md items 4 and 10 (C1-C4 sampling rule), pass 2026-10-08/09 |
| Chevron stays on top of a hovered, transformed edge card and a click pages the strip | R3 | CSS stacking and hit-testing in a real engine | 48-UAT.md item 9, pass (macOS CGEvent pointer, 2026-10-09) |
| Strip card width equals the grid's within 1px at every window width, incl. empty grid and list layout; no `ResizeObserver loop` error during a resize sweep | R3 | Layout-engine resolution and a scrollbar feedback loop | 48-UAT.md item 11, pass (macOS 48-18; Windows controller clauses 2026-10-09) |
| Mouse/controller handoff never resizes or crops a card; exactly one tile ringed at a time; controller focus past the last visible card scrolls it in with ring clearance | R3 | Physical controller input and live `:hover`/`:focus-within` interplay | 48-UAT.md items 8, 11 and 12, pass (Windows 11, physical controller, 2026-10-07 and 2026-10-09) |
| Persistence and migration across a real quit and relaunch (legs A-D) | R1, R7 | Needs a real process restart against the on-disk profile | 48-UAT.md items 2 and 3, pass (2026-10-07) |
| Settings General shows no `Library Top Section` or `Recent Games to Show` row and no layout hole | R6 | Rendered layout of the Settings page | 48-UAT.md item 1, pass (2026-10-07) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (49 tasks, 0 `<manual>` blocks; 4 human checkpoints are gates, not verification substitutes, and each has a UAT record)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none)
- [x] No watch-mode flags
- [x] Feedback latency < 10s for the quick run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-09 (validate-phase, State B reconstruction; auditor not spawned because no gap was found)
