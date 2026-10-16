---
phase: 21
slug: steam-native-install
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-15
updated: 2026-07-15
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (ts-jest preset) — projects: src/backend, src/frontend, meta |
| **Config file** | `jest.config.js` (existing, project-wide) |
| **Quick run command** | `npx jest src/backend/storeManagers/steam --silent` |
| **Full suite command** | `npm run test:ci` (`jest --runInBand --silent`) |
| **Estimated runtime** | ~30–90 seconds (steam subset ~10s) |

---

## Sampling Rate

- **After every task commit:** `npx jest src/backend/storeManagers/steam --silent`
- **After every plan wave:** `npm run test:ci`
- **Before `/gsd-verify-work`:** Full suite green PLUS the manual-only real-machine rows (Plan 12)
- **Max feedback latency:** ~90 seconds (automated); manual rows tracked as UAT checkpoints

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | SNI-01 | T-21-SC | AES via node:crypto only; lzma Approved | unit | `npx jest .../depotPrimitives.test.ts -t crypto` | ❌ W0 (created here) | ⬜ pending |
| 21-01-02 | 01 | 1 | SNI-01 | T-21-03 | SHA1-verify-then-trust; reject unverified chunk | unit | `npx jest .../depotPrimitives.test.ts -t decompress` | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 1 | SNI-01 | T-21-04 | GIDs as strings; two-channel ownership | unit | `npx jest .../depotPrimitives.test.ts -t select` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 1 | SNI-02 | T-21-04/06/07 | 1026 only; 64-bit strings; atomic write; no vdf.stringify | unit | `npx jest .../manifest.test.ts` | ❌ W0 | ⬜ pending |
| 21-03-01 | 03 | 1 | SNI-07 | T-21-08 | toggle default OFF, no OS gate | unit+build | `npx tsc --noEmit` + JSON parse | ❌ W0 | ⬜ pending |
| 21-03-02 | 03 | 1 | SNI-07 | T-21-08 | backend accessor default OFF | unit | `npx jest .../nativeInstallSetting.test.ts` | ❌ W0 | ⬜ pending |
| 21-04-01 | 04 | 2 | SNI-01 | T-21-05/11 | numeric appId guard; connection gate; os param | unit | `npx jest .../depot.test.ts -t selection` | ❌ W0 | ⬜ pending |
| 21-04-02 | 04 | 2 | SNI-01/03 | T-21-04/10 | multi-depot summed total; GIDs strings; parser smoke | unit | `npx jest .../depot.test.ts -t "manifest\|total"` | ❌ W0 | ⬜ pending |
| 21-05-01 | 05 | 3 | SNI-01 | T-21-01/02/03 | positional streaming; bounded chunk concurrency (no unbounded Promise.all); containment; whole-file SHA1 | unit | `npx jest .../depot.test.ts -t "stream\|traversal\|sha1\|chunk-concurrency"` | ❌ W0 | ⬜ pending |
| 21-05-02 | 05 | 3 | SNI-03 | T-21-12 | throttled progress; AbortSignal cancel | unit | `npx jest .../depot.test.ts -t "progress\|cancel"` | ❌ W0 | ⬜ pending |
| 21-06-01 | 06 | 4 | SNI-04 | T-21-07/13 | single 1026 finalize; manifest last; real SizeOnDisk | unit | `npx jest .../depot.test.ts -t "finalize\|recovery\|1026"` | ❌ W0 | ⬜ pending |
| 21-06-02 | 06 | 4 | SNI-04 | T-21-14 | error classify → actionable copy; Retry non-race | unit | `npx jest .../depot.test.ts -t "error\|retry\|classify"` | ❌ W0 | ⬜ pending |
| 21-07-01 | 07 | 5 | SNI-07 | T-21-08/14 | OFF path unchanged; ON routes to depot.ts; classified error→InstallResult surfaces via EXISTING generic Retry (downloadqueue.ts unmodified) | unit | `npx jest .../games.test.ts -t "install\|error\|retry"` | ✅ (extend) | ⬜ pending |
| 21-07-02 | 07 | 5 | SNI-07 | T-21-15 | stop() aborts depot loop, no-op otherwise | unit | `npx jest .../games.test.ts -t "stop\|cancel"` | ✅ (extend) | ⬜ pending |
| 21-08-01 | 08 | 5 | SNI-04 | T-21-16 | startup finalize-then-watch; no re-download/auto-drive | unit | `npx jest .../library.test.ts -t "init\|resume\|finalize"` | ✅ (extend) | ⬜ pending |
| 21-08-02 | 08 | 5 | SNI-04 | T-21-13 | poller unchanged; reads 1026 native+bottle | unit | `npx jest .../library.test.ts -t "acf\|poller\|bottle\|stateflags"` | ✅ (extend) | ⬜ pending |
| 21-09-01 | 09 | 6 | SNI-05 | T-21-17/01 | registered-folder-only; default primary; installdir sanitized | unit | `npx jest .../installLocation.test.ts` | ❌ W0 | ⬜ pending |
| 21-09-02 | 09 | 6 | SNI-05 | T-21-17 | picker only when >1 library; no free-text dir | build | `npx tsc --noEmit` | N/A (frontend) | ⬜ pending |
| 21-11-01 | 11 | 6 | SNI-08 | T-21-16/19 | bottle os:'windows'; no Wine dispatch; OFF unchanged | unit | `npx jest .../games.test.ts -t bottle` | ✅ (extend) | ⬜ pending |
| 21-10-01 | 10 | 7 | SNI-06 | T-21-21 | ready/needs-launch/needs-install; no forged config | unit | `npx jest .../clientSetup.test.ts` | ❌ W0 | ⬜ pending |
| 21-10-02 | 10 | 7 | SNI-06 | T-21-20 | installer run non-silent from official source | build | `npx tsc --noEmit` + JSON parse | N/A (frontend) | ⬜ pending |
| 21-10-03 | 10 | 7 | SNI-06 | T-21-20/21 | guided setup + prompt-to-launch flows | manual | human-verify checkpoint | N/A | ⬜ pending |
| 21-12-01 | 12 | 8 | SNI-01/04 | T-21-22 | native adoption 1026→4 + hard-DRM launch | manual | real-machine checkpoint | N/A | ⬜ pending |
| 21-12-02 | 12 | 8 | SNI-01 | T-21-02 | streaming@10GB+ bounded RSS; multi-depot no collision | manual | real-machine checkpoint | N/A | ⬜ pending |
| 21-12-03 | 12 | 8 | SNI-08 | T-21-22 | bottled Steam adopts 1026 identically (A3) | manual | real-machine checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

New test files are created inline by the plan that creates the code under test (tdd="true" tasks),
so there is no separate Wave 0 plan — every automated `<verify>` resolves to a file that either
already exists or is created within the same plan:

- [x] `__tests__/depotPrimitives.test.ts` — created in Plan 01 (crypto/decompress/select)
- [x] `__tests__/manifest.test.ts` — created in Plan 02
- [x] `__tests__/nativeInstallSetting.test.ts` — created in Plan 03
- [x] `__tests__/depot.test.ts` — created in Plan 04, extended in 05/06
- [x] `__tests__/installLocation.test.ts` — created in Plan 09
- [x] `__tests__/clientSetup.test.ts` — created in Plan 10
- [x] `__tests__/games.test.ts` — EXISTS; extended in Plans 07, 11
- [x] `__tests__/library.test.ts` — EXISTS; extended in Plan 08
- [x] Framework install: none — Jest/ts-jest already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native .acf adoption (1026→4, zero re-download) + hard-DRM launch | SNI-01/04 | Requires a real authenticated Steam client + owned hard-DRM title; not automatable in CI | Plan 12 Task 1 |
| Streaming-to-disk at 10GB+ (bounded RSS) + real multi-depot game | SNI-01 | Requires a real large/multi-depot download + live memory profiling | Plan 12 Task 2 |
| Bottled Windows Steam adopts a hand-written 1026 manifest (A3) | SNI-08 | Requires a provisioned CrossOver bottle + bottled Steam behavior (inference, not yet tested) | Plan 12 Task 3 |
| Guided native Steam-client install + prompt-to-launch | SNI-06 | Installer download+run and launch-once are inherently human-facing | Plan 10 Task 3 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a manual-only checkpoint with rationale
- [x] Sampling continuity: no 3 consecutive code tasks without automated verify (manual rows are terminal validation only)
- [x] Wave 0 covers all MISSING references (created inline per plan)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-15
