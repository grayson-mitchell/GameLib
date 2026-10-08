---
phase: "49"
slug: "cross-store-signed-out-offline-mode"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-08"
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `49-RESEARCH.md` § Validation Architecture (2026-10-08). The planner fills the
> per-task map from its PLAN.md tasks; the requirement → test map below is the seed.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 via `ts-jest`, multi-project (`Backend`, `Common`, `Frontend`, `Preload`, `Meta`) |
| **Config file** | `jest.config.js` (root, `projects`), per-project `src/*/jest.config.js`, `meta/jest.config.js` |
| **Quick run command** | `npx jest --selectProjects <Project> --testPathPattern <pattern>` |
| **Full suite command** | `pnpm test:ci` (CI only; ~40 suites fail on the operator's Windows box regardless of change) |
| **Estimated runtime** | ~30–120 seconds per scoped run |

---

## Sampling Rate

- **After every task commit:** Run the scoped `npx jest --selectProjects … --testPathPattern …` for the files touched, plus `npx prettier --check` over written, non-ignored paths
- **After every plan wave:** Run all Backend + Common + Frontend + Meta tests matching `signIn|signInProbe|storePolicy|librarySync|Login|bootstrap|authTrigger|credentialsMissing|humble`, plus `pnpm codecheck`, `pnpm lint-translations:gamelib`, `pnpm i18n-churn-guard`, `pnpm planning-gates`
- **Before `/gsd-verify-work`:** CI full suite green (ubuntu) + `pnpm smoke:sidecar` in CI + the macOS live gate for runner strings (A1–A6) and the Keychain-denial path
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | R1 | — | N/A | unit | `npx jest --selectProjects Common --testPathPattern signInState` | ❌ W0 | ⬜ pending |
| 49-01-02 | 01 | 1 | R1 | — | new keys allow-listed, no secret field exposed | unit | `npx jest --selectProjects Common --testPathPattern storePolicy` | ✅ | ⬜ pending |
| 49-02-01 | 02 | 1 | R2 | — | expired flag set only on proven auth failure, never from network/timeout | unit | `npx jest --selectProjects Backend --testPathPattern "signInProbe\|expiryProbe"` | ❌ W0 | ⬜ pending |
| 49-03-01 | 03 | 2 | R3 | — | READY before any probe; every timer unref'd; no unbounded in-flight work | unit | `npx jest --selectProjects Backend --testPathPattern "signInProbe\|signInProbeBootWire\|bootstrap"` | ❌ W0 | ⬜ pending |
| 49-03-02 | 03 | 2 | R3 | — | `'boot-probe'` sticky; `'startup'` still locked; `unreadable` → unknown | unit | `npx jest --selectProjects Backend --testPathPattern "steam/__tests__/(authTrigger\|credentialsMissing)\|humbleSecretStore\|humble/__tests__/user"` | ✅ | ⬜ pending |
| 49-04-01 | 04 | 2 | R4 | — | notice is not a Dialog; no notify() call site | unit + source gate | `npx jest --selectProjects Frontend --testPathPattern "librarySignInRows\|librarySyncIndicator\|librarySignInNoticeSource"` | ❌ W0 | ⬜ pending |
| 49-04-02 | 04 | 2 | R5 | — | dismiss persisted independently of the pass | unit | `npx jest --selectProjects Common --testPathPattern signInDismissal` | ❌ W0 | ⬜ pending |
| 49-05-01 | 05 | 2 | R6 | — | overlay opens only from explicit Sign in; `?open=` allow-listed | unit + source gate | `npx jest --selectProjects Frontend --testPathPattern "loginOpenParam\|Login/__tests__"` | ❌ W0 | ⬜ pending |
| 49-05-02 | 05 | 2 | R7 | — | N/A | unit + source gate | `npx jest --selectProjects Frontend --testPathPattern "signInTileState\|signInStateParity"` | ❌ W0 | ⬜ pending |
| 49-06-01 | 06 | 2 | R8 | — | expired state never gates render or launch | unit + source gate | `npx jest --selectProjects Backend --testPathPattern "epicOfflineMode\|launcher"` | ❌ W0 | ⬜ pending |
| 49-07-01 | 07 | 1 | R9 | — | N/A | script + gates | `pnpm lint-translations:gamelib && pnpm i18n-churn-guard` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs above are placeholders seeded from the research test map; the planner rewrites this table to match the real PLAN.md task numbering.*

---

## Wave 0 Requirements

- [ ] `src/common/__tests__/signInState.test.ts` — stubs for R1
- [ ] `src/common/__tests__/signInDismissal.test.ts` — stubs for R5
- [ ] `src/backend/signInProbe/__tests__/{classify,pass,dismissBackstop}.test.ts` — stubs for R2, R3, R5 backstop
- [ ] `src/backend/sidecar/__tests__/signInProbeBootWire.test.ts` — R3 READY ordering
- [ ] `src/backend/storeManagers/{legendary,gog,nile}/__tests__/expiryProbe.test.ts` — R2 per store
- [ ] `src/backend/__tests__/launcher_callRunner.test.ts` — extend for `skipErrorHandler` + `onOutput` capture on non-zero exit
- [ ] `src/frontend/screens/Library/__tests__/{librarySignInRows,librarySignInNoticeSource}.test.ts` — R4
- [ ] `src/frontend/screens/Login/__tests__/{loginOpenParam,signInTileState,signInStateParity}.test.ts` — R6, R7
- [ ] `src/backend/__tests__/epicOfflineMode.test.ts` — R8
- [ ] `src/frontend/state/__tests__/globalStateHumbleMount.test.ts` — R3 (health call removed, sync stays)
- [ ] Existing tests that MUST change: `librarySyncIndicator.test.ts`, `storePolicy.test.ts`, `steamTileState.test.ts` (migrate/retire); `meta/i18nGateScope.json` + `meta/i18nForkTouchedFiles.json` (data edits, not test edits)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exact runner auth-failure strings for legendary, gogdl, nile against a real expired session (assumptions A1–A6) | R2 | No expired account reachable from the Windows box; runner binaries not exercised in unit tests | macOS live gate per `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`: expire each store's session, launch, capture sidecar log, confirm one `expired` row per store and no row for a network-only failure |
| Keychain denial / ignored prompt yields `unknown`, never `expired`, within the 45 s bound | R3, P1 | Requires macOS Keychain under an ad-hoc signature | On the Mac: dismiss the Keychain prompt at boot; confirm the Humble/Steam row stays absent (or stays `expired` only if previously latched) and the sidecar exits at stdin EOF |
| Sidecar exit within bound on a warm profile | R3 | `pnpm smoke:sidecar` runs cold (nothing logged in, nothing probed); its 30 s gate is below the 45 s bound | Warm local run: launch with all five stores connected, send stdin EOF, measure exit time |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
