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
> Source: `49-RESEARCH.md` § Validation Architecture (2026-10-08). The Per-Task Verification Map
> below was rewritten by plan-phase on 2026-10-09 to the real `49-01`..`49-12` task numbering.

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

- **After every task commit:** Run the task's scoped `npx jest --selectProjects … --testPathPattern …`, plus `npx prettier --check` over the written, prettier-seen paths (`.planning/**` and `public/locales/**` are prettier-ignored and deliberately unchecked)
- **After every plan wave:** Run all Backend + Common + Frontend + Meta tests matching `signIn|signInProbe|storePolicy|librarySync|Login|bootstrap|authTrigger|credentialsMissing|humble|expiryProbe|epicOfflineMode|launcher_callRunner`, plus `pnpm codecheck`, `pnpm lint`, `pnpm lint-translations:gamelib`, `pnpm i18n-churn-guard`, `pnpm planning-gates`
- **Before `/gsd-verify-work`:** CI full suite green (ubuntu) + `pnpm smoke:sidecar` in CI (cold profile) + the macOS live gate (49-11 authors, 49-12 runs) for A1–A6, Keychain denial, ignored prompt and warm-profile exit
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | R1, R4, R6 | T-49-01, T-49-02 | `?open=` allow-listed, consumed once; notice reads only non-secret flags | tracer: composition + source gate | `npx jest --selectProjects Frontend --testPathPattern signInTracer` | ❌ W0 | ⬜ pending |
| 49-01-02 | 01 | 1 | R1, R5 | T-49-01 | hostile `?open=` values rejected; 80-case R1 table | unit (tdd) | `npx jest --selectProjects Common --testPathPattern "signInState\|signInDismissal"` | ❌ W0 | ⬜ pending |
| 49-01-03 | 01 | 1 | R4 | — | new modules scanned by the hardcoded-string gate | meta gate | `npx jest --selectProjects Meta --testPathPattern "genI18nGateScope\|hardcodedStringGate"` | ✅ | ⬜ pending |
| 49-02-01 | 02 | 1 | R9 | T-49-03, T-49-04 | no raw key / empty string shipped | script + meta | node assertion (3 locales × 8 keys) + `npx jest --selectProjects Meta --testPathPattern "machineFillGamelib\|lintTranslations"` | ✅ | ⬜ pending |
| 49-02-02 | 02 | 1 | R9 | T-49-03 | interpolation exact in 49 catalogues | script + gate | node assertion (49 × 8, `{{store}}` exactly once) + `pnpm lint-translations:gamelib` | ✅ | ⬜ pending |
| 49-02-03 | 02 | 1 | R9 | — | `translation.json` untouched | gates | `pnpm i18n && git diff --quiet -- public/locales/en/gamelib.json`; `pnpm i18n-churn-guard`; `pnpm planning-gates` | ✅ | ⬜ pending |
| 49-03-01 | 03 | 1 | R1 | T-49-05, T-49-06 | only boolean `expired` keys allow-listed; secrets still denied | unit | `npx jest --selectProjects Common --testPathPattern storePolicy`; `npx jest --selectProjects Backend --testPathPattern "sidecar/__tests__/storeLayer"` | ✅ | ⬜ pending |
| 49-03-02 | 03 | 1 | R2 | T-49-07 | probes can spawn with no modal | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern launcher_callRunner` | ✅ | ⬜ pending |
| 49-03-03 | 03 | 1 | R8 | T-49-08 | expired state can only enable offline mode, never gate launch | unit (tdd) + source gate | `npx jest --selectProjects Backend --testPathPattern "legendary/__tests__/epicOfflineMode"` | ❌ W0 | ⬜ pending |
| 49-04-01 | 04 | 2 | R2 | T-49-09, T-49-12 | only auth failure → `expired`; capture bounded, never logged | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "signInProbe/__tests__/classify"` | ❌ W0 | ⬜ pending |
| 49-04-02 | 04 | 2 | R3 | T-49-09, T-49-11 | push payload labels only; pull is a pure getter | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "signInProbe/__tests__/outcomes"` | ❌ W0 | ⬜ pending |
| 49-04-03 | 04 | 2 | R2 | T-49-10 | epoch fence blocks stale latch; `unknown` never writes; no AppSettings access | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "signInProbe/__tests__/(verdict\|outcomes\|classify)"` | ❌ W0 | ⬜ pending |
| 49-05-01 | 05 | 3 | R2 | T-49-13, T-49-14, T-49-15 | Epic/Amazon latch only on auth failure; constant argv; unique abort ids | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "signInProbe/__tests__/runnerProbes\|legendary/__tests__/expiryProbe\|nile/__tests__/expiryProbe"` | ❌ W0 | ⬜ pending |
| 49-05-02 | 05 | 3 | R2 | T-49-15 | GOG verdict per D-17 at the single spawn site; token stdout never logged | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "gog/__tests__/(expiryProbe\|user)\|signInProbe/__tests__/runnerProbes"` | ❌ W0 | ⬜ pending |
| 49-06-01 | 06 | 3 | R3 | T-49-16, T-49-17, T-49-19 | `'boot-probe'` not renderer-reachable; keyring-only read; `unreadable` → unknown | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "steam/__tests__/(authTrigger\|probeCredentialPresence\|credentialsMissing)"` | ✅ / ❌ W0 | ⬜ pending |
| 49-06-02 | 06 | 3 | R3 | T-49-17, T-49-18, T-49-19 | `trigger=boot-probe` label; no csrf read; no hidden webview | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "humble/__tests__/(probeSession\|user)\|sidecar/__tests__/(humbleSecretStore\|humbleFlows)"` | ✅ / ❌ W0 | ⬜ pending |
| 49-07-01 | 07 | 3 | R5 | — | dismissed set persisted under one AppSettings key | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "sidecar/__tests__/(dismissedSignInNoticesSetting\|focusRowFirstLaunchHydration)"` | ❌ W0 | ⬜ pending |
| 49-07-02 | 07 | 3 | R3, R5 | T-49-20, T-49-21 | inbound map sanitized; Humble health call removed from mount | source gate | `npx jest --selectProjects Frontend --testPathPattern "state/__tests__/(GlobalStateSignInMount\|GlobalStateFocusRowHydration\|GlobalStateSteamLogout)"` | ❌ W0 | ⬜ pending |
| 49-07-03 | 07 | 3 | R1, R6 | — | one renderer reader of the five verdict keys | unit (tdd) | `npx jest --selectProjects Frontend --testPathPattern "helpers/__tests__/signInInputs\|Library/__tests__/signInTracer"` | ❌ W0 | ⬜ pending |
| 49-08-01 | 08 | 4 | R3, R5 | T-49-22, T-49-23, T-49-24, T-49-25 | bounded, unref'd, edge-only, single-flight; backstop dismiss survives | unit (tdd) | `npx jest --selectProjects Backend --testPathPattern "signInProbe/__tests__/(pass\|dismissBackstop)"` | ❌ W0 | ⬜ pending |
| 49-08-02 | 08 | 4 | R3 | T-49-22 | READY before any probe; handler before READY | source gate + boot-wire | `npx jest --selectProjects Backend --testPathPattern "sidecar/__tests__/(bootstrapWirings\|signInProbeBootWire\|bootstrap\.test\|bootstrapUserReconcile\|gogPresenceBootWire\|playtimeQueueBootDrain\|rosettaBootWiring)"` | ✅ / ❌ W0 | ⬜ pending |
| 49-08-03 | 08 | 4 | R3 | — | folded todo closed with triage keys intact | gate | `pnpm planning-gates` + node frontmatter assertion | ✅ | ⬜ pending |
| 49-09-01 | 09 | 4 | R4, R5 | T-49-27 | expired rows never dismissible | unit (tdd) | `npx jest --selectProjects Frontend --testPathPattern "Library/__tests__/librarySignInRows"` | ❌ W0 | ⬜ pending |
| 49-09-02 | 09 | 4 | R4, R5, R8, R9 | T-49-26 | non-modal, in-flow, no `window.api`, nav only on click | source gate | `npx jest --selectProjects Frontend --testPathPattern "Library/__tests__/(librarySignInNoticeSource\|librarySignInRows\|signInTracer\|librarySyncNoticeSource)"` | ❌ W0 | ⬜ pending |
| 49-09-03 | 09 | 4 | R4 | — | `signedOut` absent; failed + missing → hidden (D-19) | unit (tdd) + source gate | `npx jest --selectProjects Frontend --testPathPattern "Library/__tests__/(librarySyncIndicator\|librarySyncNoticeSource)"` | ✅ | ⬜ pending |
| 49-10-01 | 10 | 4 | R7 | T-49-29 | five tiles from one selector; `unknown` renders Connected | unit (tdd) + source gate | `npx jest --selectProjects Frontend --testPathPattern "Login/__tests__"` | ✅ / ❌ W0 | ⬜ pending |
| 49-10-02 | 10 | 4 | R6, R7 | T-49-28, T-49-29 | one overlay per Sign in; tile/notice parity | source gate + composition | `npx jest --selectProjects Frontend --testPathPattern "Library/__tests__/signInStateParity\|Login/__tests__/loginOpenParam"` | ❌ W0 | ⬜ pending |
| 49-11-01 | 11 | 5 | R2, R3 | T-49-30, T-49-32 | sink-correct, restorable gate contract | script | node contract assertion + `git grep` emitter check | ❌ W0 | ⬜ pending |
| 49-11-02 | 11 | 5 | R2, R3, R4, R5, R6 | T-49-31 | seven-test reachability review; UAT shape | script + gate | node UAT-shape assertion + `pnpm planning-gates` | ❌ W0 | ⬜ pending |
| 49-12-01 | 12 | 6 | R2, R3, R4, R5, R6 | T-49-33, T-49-34 | run record redacted, one instance per launch | manual (checkpoint) + script | node run-record assertion | ❌ (live) | ⬜ pending |
| 49-12-02 | 12 | 6 | R2, R3, R7, R8 | T-49-33 | every result opens with a status word; gaps triaged | script + gate | node UAT-scored assertion + `pnpm planning-gates` | ❌ (live) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Every task's `<verify>` additionally carries a scoped `npx prettier --check` over its written,
prettier-seen paths (not listed above to keep the table readable). Tasks writing only
`.planning/**` or `public/locales/**` paths state the omission instead.

---

## Wave 0 Requirements

- [ ] `src/common/__tests__/signInState.test.ts`, `signInDismissal.test.ts` — R1, R5 (49-01)
- [ ] `src/frontend/screens/Library/__tests__/signInTracer.test.ts` — tracer (49-01)
- [ ] `src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts` — R8 (49-03)
- [ ] `src/backend/signInProbe/__tests__/{classify,outcomes,verdict}.test.ts` — R2, R3 (49-04)
- [ ] `src/backend/signInProbe/__tests__/runnerProbes.test.ts`, `src/backend/storeManagers/{legendary,gog,nile}/__tests__/expiryProbe.test.ts` — R2 (49-05)
- [ ] `src/backend/storeManagers/steam/__tests__/probeCredentialPresence.test.ts`, `src/backend/humble/__tests__/probeSession.test.ts` — R3 (49-06)
- [ ] `src/backend/sidecar/__tests__/dismissedSignInNoticesSetting.test.ts`, `src/frontend/state/__tests__/GlobalStateSignInMount.test.ts`, `src/frontend/helpers/__tests__/signInInputs.test.ts` — R1, R3, R5 (49-07)
- [ ] `src/backend/signInProbe/__tests__/{pass,dismissBackstop}.test.ts`, `src/backend/sidecar/__tests__/signInProbeBootWire.test.ts` — R3, R5 backstop (49-08)
- [ ] `src/frontend/screens/Library/__tests__/{librarySignInRows,librarySignInNoticeSource}.test.ts` — R4, R5 (49-09)
- [ ] `src/frontend/screens/Login/__tests__/{signInTileState,loginOpenParam}.test.ts`, `src/frontend/screens/Library/__tests__/signInStateParity.test.ts` — R6, R7 (49-10)
- [ ] Existing tests that MUST change: `launcher_callRunner.test.ts` (49-03), `storePolicy.test.ts` + `storeLayer.test.ts` (49-03), `authTrigger.test.ts` + `credentialsMissing.test.ts` (49-06), `humbleSecretStore.test.ts` (49-06), `bootstrapWirings.test.ts` (49-08), `librarySyncIndicator.test.ts` (49-09), `steamTileRefreshOnDismiss.test.ts` + deletion of `steamTileState.test.ts` (49-10), `meta/__tests__/genI18nGateScope.test.ts` declared-debt entry removal (49-10); data edits to `meta/i18nGateScope.json` + `meta/i18nForkTouchedFiles.json` (49-01, 49-10)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exact runner auth-failure strings for legendary, gogdl, nile against a real expired session (assumptions A1–A6) | R2 | No expired account reachable from the Windows box; runner binaries not exercised in unit tests | `49-LIVE-GATE.md` items 1–6 (authored 49-11, run 49-12) |
| Keychain denial / ignored prompt yields `unknown`, never `expired`, within the 45 s bound | R3, P1 | Requires macOS Keychain under an ad-hoc signature | `49-LIVE-GATE.md` items 7–8 |
| Sidecar exit within bound on a warm profile | R3 | `pnpm smoke:sidecar` runs cold (nothing logged in, nothing probed); its 30 s gate is below the 45 s bound (D-20) | `49-LIVE-GATE.md` item 9 |
| Never-connected row tone across themes; dismiss across relaunch; one overlay per Sign in | R4, R5, R6, P4 | Judgment across three shipped themes; real navigation | `49-LIVE-GATE.md` items 10–11 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
