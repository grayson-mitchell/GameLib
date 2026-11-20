---
phase: 66
status: passed
score: 6/6
verified: 2026-11-10
scope: narrowed step-1 scope (ROADMAP "Split 2026-11-10"); full migration belongs to 66.1–66.3
---

# Phase 66 Verification

## Re-run checks
- `pnpm backend-di-ceilings` PASS — moduleState=292, childProcess=32, jestMock=2582, sanctioned=3
- `pnpm boundaries` — no dependency violations (1153 modules)
- jest: `src/backend/process`, `bootSourceShape`, `bootstrap`, `sidecarRejectionGuard` — 7 suites, 110 tests pass
- lint / find-deadcode / codecheck / smoke:sidecar — reported passing after fix commit 4773a5eec (not re-run by verifier)

## Deliverables
| # | Deliverable | Status |
|---|---|---|
| 1 | `src/backend/process/` leaf (clock, runner + tracked/long-lived registries + openDetached, AppContext) | ✓ |
| 2 | depcruise `runner-is-a-leaf` (`.dependency-cruiser.cjs:99`) | ✓ |
| 3 | `meta/backendDiCeilings.cjs` + 44 shards; fails on growth, shrink and stale entries; wired into package.json, pre-push, lint.yml | ✓ |
| 4 | Test fakes: scriptedRunner, realRunner (createFakeHomeProfile), fakeClock, createTestContext | ✓ |
| 5 | bootstrap.ts = 27 named steps via `bootSidecar(ctx,…)`; only top-level `let` is `booted` (asserted by bootSourceShape.test.ts); second boot throws (D-08) | ✓ |
| 6 | Boot-re-entering sidecar tests on `bootFresh()` + fresh registry/context | ✓ |

## Flagged points
1. **sanctioned=3 is by decision** (CONTEXT D-13: runner, logger sink, boot entry). Zero `rust-overlap` (D-14) entries — "starts empty" refers to those. Roadmap wording loose.
2. **"17 once-guards"** = 16 boolean guards + `let i18nReady` (RESEARCH L254/L293 count is a top-level-`let` census). All 17 gone.
3. **No test boots twice per registry.** `bootSidecar(`/`startSidecar(` appear only in bootstrap.ts, downloadQueueFlowRegistration.ts, bootSourceShape.test.ts, bootstrap.test.ts, sidecarHarness.ts. Unmigrated files only call `startRpcServer`/`register*Flows`. Exact "37" not recounted; no-re-entry enforced by test.
4. **Ratchet tightened**: shard moduleState sums match live 292; gate fails "shrank: lower X" when below baseline, and passes — no regrowth room.

## Known, not phase-66 regressions
- test:ci: 10 tests in 8 suites fail identically at pre-phase commit a247fdb7f (testContainment T-34.2-83, tauriShellSource, macArchKnownFixRouting, gamelibCatalogParity, genI18nGateScope, lintTranslations, logSecretGate, x86CallbackWineHarness).
- "Cannot log after tests are done" — bare setImmediate in downloadQueueFlowRegistration.ts; in deferred-items.md.

## Advisory follow-ups (66-REVIEW.md; no must-have undermined)
WR-01 run() timeout hang · WR-04 ratchet raisable by shard edit · WR-05/06 ban & mock-count bypasses · WR-07 removeLegacyZoomData ignores ctx.paths.userData · IN-01 latch can't tell failed boot. Suggested home: 66.1 or 66.2.
