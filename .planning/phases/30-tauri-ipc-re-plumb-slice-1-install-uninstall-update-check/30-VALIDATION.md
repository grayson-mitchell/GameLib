---
phase: 30
slug: tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-22
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `30-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (project-wide; sidecar suites under `src/backend/sidecar/__tests__/`) |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `npx jest src/backend/sidecar/__tests__` |
| **Full suite command** | `npx jest src/backend/sidecar src/preload/__tests__` |
| **Estimated runtime** | ~30 seconds |

---

## ⚠ MANDATORY TEST-ISOLATION RULE (read before writing any test)

Jest suites that `requireActual` `electron-store` have previously reached the
**real** `~/Library/Application Support/GameLib` and wiped the developer's live
Steam refresh token (fixed in commit `92c29a5e`). An `afterAll` restore is **not**
a safety net — jest force-exits workers.

Every test in this phase MUST use the proven three-way mock isolation pattern from
`src/backend/sidecar/__tests__/skeletonFlows.test.ts` (`os` + `electron` +
`electron-store`), pointing `userData` at a temp directory. No test may resolve a
store path under the real user profile. **This phase touches the token seam
directly (REQ-30-01), so the rule is load-bearing, not precautionary.**

---

## ⚠ WHAT JEST CANNOT PROVE (carry into every acceptance criterion)

The 27-05 `SteamLibraryManager is not a constructor` crash reproduced **only** in
the esbuild bundle, never under ts-jest. A green jest run therefore does **not**
prove sidecar module-init order for the two new `*FlowRegistration.ts` modules
(REQ-30-06). Module-init ordering must be verified against a real bundled
`npm run tauri:dev` run, not a test suite.

**REQ-30-03 claim discipline:** this phase's honest claim is **"wired and
unit-proven"**, never "hardware-proven". The live human QR scan is deferred, and
because every install acceptance depends on a populated library, the install
slice's own hardware proof is deferred with it — as **one** named UAT item
covering both.

---

## Pre-Existing Conditions (NOT Phase 30 regressions)

| Gap | Description | Why it matters here |
|-----|-------------|---------------------|
| **G-23-01** | A `Blocked` depot key aborts the whole install | Sits under any real depot install run this phase attempts |
| **G-23-02** | Native install applies no execute bits | Same — a failed launch after install is not a Tauri porting bug |

Any depot install exercised in this phase runs on top of both. Name them before
attributing a failure to the IPC port.

---

## Per-Task Verification Map

*Populated by the planner — one row per task across all Phase 30 plans.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/backend/sidecar/__tests__`
- **After every plan wave:** Run `npx jest src/backend/sidecar src/preload/__tests__`
- **Before `/gsd-verify-work`:** Full suite green **and** both builds start
  (`npm start` and `npm run tauri:dev`) — REQ-30-09's additive/reversible invariant
  is not provable by jest alone.
- **Max feedback latency:** ~30 seconds

---

## Wave 0 Requirements

*Populated by the planner. Expected shape: extensions to the existing suites rather
than new infrastructure —*
`src/backend/sidecar/__tests__/skeletonFlows.test.ts` (new-channel shape),
`storeLayer.test.ts` (Phase 29's coverage walk),
`electronUntouched.test.ts` (the additive/reversible guard).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live QR scan → populated library → install E2E in the Tauri build | REQ-30-01, REQ-30-03, REQ-30-04 | Requires a phone with the Steam mobile app and a real Steam account; deferred per D-04 | Logged as **one** deferred UAT item naming both the scan and the install E2E it gates |
| Both builds still launch after every plan | REQ-30-09 | Bundled-runtime behavior; esbuild/electron-vite bundling is not exercised by ts-jest | `npm start`, then `npm run tauri:dev` |
| Module-init order of the two new `*FlowRegistration.ts` modules | REQ-30-06 | 27-05 crash class reproduces only in the bundle | Observe a clean `npm run tauri:dev` boot with no constructor error |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] Every test uses the three-way mock isolation pattern (no real userData writes)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
