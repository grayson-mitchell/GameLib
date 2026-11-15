---
phase: 78
slug: verification-records-and-test-health-after-v0-9
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-16
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `78-RESEARCH.md` § Validation Architecture, bounded by CONTEXT D-17..D-20.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (projects `Backend`, `Meta`, `Frontend`, `Relay`) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest --runTestsByPath <files>` |
| **Full suite command** | `pnpm test:ci` (= `jest --maxWorkers=2 --silent`), in a clean worktree at HEAD (D-01) |
| **Estimated runtime** | targeted ~30 s; full run several minutes |

---

## Sampling Rate

- **After every task commit:** the task's targeted jest paths; `pnpm planning-gates` for `.planning/` record edits; scoped `npx prettier --check` on non-ignored code/YAML paths only (`.planning/**`, `.husky/pre-push`, `bridge_helper.c` are ignored/unparsed — say so, omit).
- **After every plan wave:** the four DEBT-06 suites targeted + the `meta/__tests__/*Wiring.test.ts` suites.
- **Phase gate:** clean-worktree full `pnpm test:ci` — the four pass; other reds are counted and must match the D-17 grouped todo, not "full suite green". Cold `node meta/lintScoped.cjs`, every un-masked ratchet step, `pnpm planning-gates`.
- **Max feedback latency:** ~60 s for per-task checks.

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| DEBT-06 | four suites pass at clean HEAD, targeted | suite run | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts src/backend/sidecar/__tests__/testContainment.test.ts` | ✅ | ⬜ pending |
| DEBT-06 | four pass inside the full run | full run | `pnpm test:ci` (clean worktree); `^FAIL` lines exclude the four | ✅ | ⬜ pending |
| DEBT-06 (D-03) | macArch Intel case host-independent | simulated host | scratch `--setupFiles` simsetup per RESEARCH (linux/x64, darwin/x64) | scratch | ⬜ pending |
| DEBT-06 (D-16a/D-20) | ESLint under ceilings, cold | ratchet | `rm -f .eslintcache-src .eslintcache-tests; node meta/lintScoped.cjs` | ✅ | ⬜ pending |
| DEBT-06 (D-16b) | lint.yml later steps un-masked | wiring | `npx jest --runTestsByPath meta/__tests__/steamLineCeilingWiring.test.ts meta/__tests__/backendDiCeilingsWiring.test.ts meta/__tests__/boundaryWiring.test.ts meta/__tests__/gameInfoNarrowingWiring.test.ts` | ❌ W0 (assertions to update/add) | ⬜ pending |
| DEBT-05 (D-19) | 58 WR-03 pin, IN-01 fix covered | unit/source pin | `npx jest --runTestsByPath` on `helperIntegration.test.ts` and the inviteBridge test | ❌ W0 (pins/test to add) | ⬜ pending |
| DEBT-05 (D-10) | no authenticated CM logon at launch | source gate | `npx jest --runTestsByPath src/backend/__tests__/steamAuthSessionPolicy.test.ts` | ✅ | ⬜ pending |
| DEBT-05 | ledgers/todos parse | gate | `pnpm planning-gates` | ✅ | ⬜ pending |
| DEBT-05 | 52/53-VERIFICATION current body on top | grep | first `**Status:**` in body reads `passed`; "Superseded report (2026-10-24)" heading present | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Wiring-test updates in `meta/__tests__/{steamLineCeiling,backendDiCeilings,boundary,gameInfoNarrowing}Wiring.test.ts` (invert "red lint does not run prettier"; add un-masked-step assertions) — land with the lint.yml / pre-push edit.
- [ ] `helperIntegration.test.ts` pins for `GL_SEND_TIMEOUT_USEC 250000` and `SO_SNDBUF` (D-19).
- [ ] A test covering the IN-01 persistent `'error'` handler in `inviteBridge.ts` (D-19).

---

## Manual-Only Verifications

All phase behaviors have automated verification. No live check identified (D-11 not triggered); if one arises, it becomes a human item in `78-UAT.md`.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
