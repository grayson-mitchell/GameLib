---
phase: 32
slug: tauri-ipc-re-plumb-slice-3-downloads-and-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-23
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 32-RESEARCH.md §"Validation Architecture". This slice is **unit-proven only** —
> live queue E2E is doubly-gated by G-30-01 (Tauri QR login) and G-30-02 (install-hang,
> parked to Phase 33), so those paths are Manual-Only / deferred, not automated (D-06).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (already configured project-wide) |
| **Config file** | `package.json` `"test": "jest"` / `jest.config.js` |
| **Quick run command** | `npx jest src/backend/sidecar/__tests__/downloadQueueFlows.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts` |
| **Full suite command** | `npm run test:ci` (`jest --runInBand --silent`) |
| **Estimated runtime** | ~5s quick / ~90s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick command (new `downloadQueueFlows.test.ts` + the untouched `downloadqueue.test.ts` contract)
- **After every plan wave:** Run `npm run test:ci`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds (quick), ~90 seconds (full)

---

## Per-Task Verification Map

> Task IDs are placeholders (`32-PP-TT`) resolved once the planner assigns plan/task numbers.
> Every REQ maps to at least one automated assertion except the two doc artifacts (REQ-32-06/07)
> and the dual-build smoke (REQ-32-08), which match the Phase 30/31 precedent (no automated
> dual-build test exists in this repo).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-PP-TT | — | 0 | REQ-32-01 | — | install/updateGame enqueue via `addToQueue()`, no direct `SteamGame.install()` bypass; resolves `Promise<void>` once queued | unit (real RPC loop, mocked `libraryManagerMap`) | `npx jest downloadQueueFlows.test.ts -t "install.*addToQueue"` | ❌ W0 | ⬜ pending |
| 32-PP-TT | — | 0 | REQ-32-02 | T-32-inv-B | new `downloadQueueFlowRegistration.ts` registers all 5 channels; no `electron` import under `sidecar/` | unit + source-gate (mirror `electronUntouched.test.ts`) | `npx jest downloadQueueFlows.test.ts -t "registration"` | ❌ W0 | ⬜ pending |
| 32-PP-TT | — | 0/1 | REQ-32-03 | V5 | `progressUpdate` rides generic `frontend_message` relay at `depot.ts`'s existing throttle (`PROGRESS_THROTTLE_MS=500`); **no new sidecar coalescer**; zero Rust changes | unit (existing `depot.test.ts` throttle stays unchanged + new relay-reach assertion for the `progressUpdate` frame shape) | `npx jest depot.test.ts -t "progress"` + new relay-reach assertion | ⚠️ Partial (throttle exists; relay-reach is W0) | ⬜ pending |
| 32-PP-TT | — | 1 | REQ-32-04 | V5 / repudiation | all 5 queue channels map to real `downloadqueue.ts` fns; pause==abort-then-reconcile-restart (declared, not silent); any unsupported op is a **logged** no-op | unit (per-channel; `send`-kind assertions — assert the underlying fn was CALLED, never "no error thrown") | `npx jest downloadQueueFlows.test.ts -t "queue-op"` | ❌ W0 | ⬜ pending |
| 32-PP-TT | — | 1 | REQ-32-05 | — | sidecar never calls `initQueue(true)`; pre-`initQueue` cancelability preserved; 5s auto-resume timer suppressed + logged | unit (reuse `downloadqueue.test.ts` "cancelable before initQueue()" unmodified + new sidecar-bootstrap omission assertion) | `npx jest downloadqueue.test.ts` + new bootstrap assertion | ⚠️ Partial (core contract exists; boot-omission is W0) | ⬜ pending |
| 32-PP-TT | — | 2 | REQ-32-06 | — | deferred-UAT doc names G-30-01 + G-30-02; claim is "wired and unit-proven" | manual-doc | N/A — `32-HUMAN-UAT.md` (or equivalent) artifact | ❌ W0 (doc) | ⬜ pending |
| 32-PP-TT | — | 2 | REQ-32-07 | — | `32-PORTED-CHANNELS.md` declares all channels incl. `changedDMQueueInformation` + `progressUpdate`; SEAM §3→§1 move | manual-doc | N/A — `32-PORTED-CHANNELS.md` artifact + SEAM diff | ❌ W0 (doc) | ⬜ pending |
| 32-PP-TT | — | all | REQ-32-08 | inv-A / inv-B | `npm start` + `npm run tauri:dev` both boot; unported queue-adjacent channels stay non-fatal | smoke (manual per SEAM precedent — no automated dual-build test in repo) | manual: run both, confirm boot | N/A (precedent) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts` — new file, mirrors `settingsFlows.test.ts`'s real-RPC-loop + `send`-kind pattern; covers REQ-32-01/02/04/05
- [ ] A `progressUpdate` relay-reach assertion in the sidecar test harness (assert `pushFrontendMessage`/`writeLine` receives the `progressUpdate` frame with `depot.ts`'s exact payload shape) — covers REQ-32-03
- [ ] `changedDMQueueInformation` relay-reach assertion (the undeclared "fifth" push channel the research surfaced — the queue screen renders once and never updates without it) — supports REQ-32-04/07
- [ ] Doc artifacts (not tests): `32-PORTED-CHANNELS.md` + `32-HUMAN-UAT.md` — covering REQ-32-06/07
- [ ] No new test-framework install needed — Jest is already fully configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live queue E2E (enqueue an install → observe progress bar → pause/resume/cancel from the Tauri UI) | REQ-32-06 | **Doubly-gated:** G-30-01 (Tauri QR login unresponsive) blocks reaching a signed-in library, and G-30-02 (install-hang, parked to Phase 33) blocks a running install to act on. Cannot be exercised until both are fixed. | Deferred UAT item in `32-HUMAN-UAT.md` naming both blockers; run only after Phase 33 lands the install-hang fix and QR login works. |
| Dual-build smoke (`npm start` + `npm run tauri:dev` both boot after every plan) | REQ-32-08 | No automated dual-build harness exists in this repo — matches Phase 30/31's own precedent, not a new gap. | Run both commands, confirm each boots and the Electron build's behavior is unchanged. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (docs + dual-build smoke are the declared Manual-Only exceptions)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`downloadQueueFlows.test.ts` + relay-reach assertions)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (full suite)
- [ ] `nyquist_compliant: true` set in frontmatter (flip once Wave 0 test files exist and the map is fully green-able)

**Approval:** pending
