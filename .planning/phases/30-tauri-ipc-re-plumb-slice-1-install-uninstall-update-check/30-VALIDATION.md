---
phase: 30
slug: tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
status: complete
nyquist_compliant: true
wave_0_complete: true
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
`npm run tauri:dev` run, not a test suite — that is what plan 30-04 Task 3 exists
for. Jest also cannot exercise the real Rust dialog picker (no Rust runtime) or a
live QR scan.

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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-T1 | 30-01 | 1 | REQ-30-01, REQ-30-02, REQ-30-06 | T-30-02, T-30-04 | Handlers take no renderer-supplied args; token seam untouched except its docstring | source assertion + typecheck | `npx tsc --noEmit && grep -c "ipcMain.handle(" src/backend/sidecar/steamAuthFlowRegistration.ts` | steamAuthFlowRegistration.ts (new) | ✅ green |
| 30-01-T2 | 30-01 | 1 | REQ-30-01, REQ-30-09 | T-30-01, T-30-03 | refreshToken never enters a snapshot; unported auth channels stay non-fatal | unit | `npx jest src/backend/sidecar/__tests__/steamAuthFlows.test.ts` | steamAuthFlows.test.ts (new) | ✅ green |
| 30-02-T1 | 30-02 | 2 | REQ-30-04 | T-30-07 | Runner-generic update check stays single-sourced; no electron import in the shared module | unit + typecheck | `npx tsc --noEmit && npx jest src/backend/sidecar/__tests__` | checkGameUpdates.ts (new) | ✅ green |
| 30-02-T2 | 30-02 | 2 | REQ-30-04, REQ-30-06, REQ-30-08 | T-30-05, T-30-06 | Args pass unchanged into the audited `SteamGame.install()`; `uninstallGameCallback` registered unmodified | source assertion + typecheck | `npx tsc --noEmit && grep -c "ipcMain.handle(" src/backend/sidecar/installFlowRegistration.ts` | installFlowRegistration.ts (new) | ✅ green |
| 30-02-T3 | 30-02 | 2 | REQ-30-05, REQ-30-09 | T-30-09 | gameStatusUpdate push proven; unported queue channel still marker-rejects | unit | `npx jest src/backend/sidecar/__tests__/installFlows.test.ts` | installFlows.test.ts (new) | ✅ green |
| 30-03-T1 | 30-03 | 1 | REQ-30-07 | T-30-10, T-30-SC | `[ASSUMED]` crate human-verified before `cargo add` | manual (blocking-human) | n/a — checkpoint | n/a | ✅ resolved (approved: 2.7.2, pinned as "2" — see 30-03-SUMMARY.md Checkpoint Resolution) |
| 30-03-T2 | 30-03 | 1 | REQ-30-07 | T-30-11, T-30-12, T-30-13 | Allowlist stays the gate; narrow capability; blocking picker off the reader thread | compile | `cd src-tauri && cargo check` | src-tauri/src/main.rs | ✅ green |
| 30-03-T3 | 30-03 | 1 | REQ-30-07, REQ-30-09 | T-30-11, T-30-14 | Dialog failures resolve canceled instead of throwing; notify() logs title only | unit | `npx jest src/backend/sidecar/__tests__/dialogStub.test.ts` | dialogStub.test.ts (new) | ✅ green |
| 30-04-T1 | 30-04 | 3 | REQ-30-02, REQ-30-04, REQ-30-08 | T-30-17 | Load-Bearing Invariants section provably unedited | source assertion | `grep -c "30-PORTED-CHANNELS" .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` | 30-PORTED-CHANNELS.md (new) | ✅ green |
| 30-04-T2 | 30-04 | 3 | REQ-30-03 | T-30-15, T-30-16 | One deferred item naming both proofs; G-23-01/02 named as pre-existing | source assertion | `grep -c "G-23-01" .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-HUMAN-UAT.md` | 30-HUMAN-UAT.md (new) | ✅ green |
| 30-04-T3 | 30-04 | 3 | REQ-30-06, REQ-30-09 | T-30-09 | Both builds start; module-init order proven against the real bundle | manual (blocking) | `npm start`; `npm run tauri:dev` | n/a | AWAITING CHECKPOINT — this task is the blocking human-verify checkpoint this plan pauses at; not yet run |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** no three consecutive tasks lack an automated verify.
The two manual tasks (30-03-T1, 30-04-T3) are each adjacent to automated ones.

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

No new test infrastructure is required. Jest, the sidecar suite directory, and the
proven three-way mock preamble all already exist and are green today — this phase
extends existing shapes rather than building a harness.

The three new suites each plan creates are the Wave 0 deliverable, and each is
written inside the plan that produces the code it covers (so no task ships without
an `<automated>` verify):

| Wave 0 item | Created by | Extends | Covers |
|---|---|---|---|
| `src/backend/sidecar/__tests__/steamAuthFlows.test.ts` | 30-01 Task 2 | `skeletonFlows.test.ts` preamble + helpers; `storeLayer.test.ts`'s Phase 28 D-04 regression shape | REQ-30-01, REQ-30-02 |
| `src/backend/sidecar/__tests__/installFlows.test.ts` | 30-02 Task 3 | `skeletonFlows.test.ts` preamble + helpers | REQ-30-04, REQ-30-05, REQ-30-08 |
| `src/backend/sidecar/__tests__/dialogStub.test.ts` | 30-03 Task 3 | `skeletonFlows.test.ts` preamble; `electronUntouched.test.ts`'s by-construction grep-gate idiom | REQ-30-07 |

`electronUntouched.test.ts` needs no changes — it is the additive/reversible guard
(REQ-30-09) and must simply stay green.

**No MISSING automated verifies:** every code-producing task in this phase maps to
one of the three suites above or to a typecheck/compile command. The two manual
verifications are structural (a supply-chain checkpoint and a bundle smoke run) and
are documented in Manual-Only Verifications below, not deferred as gaps.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `tauri-plugin-dialog` crate legitimacy | REQ-30-07 | `[ASSUMED]` per the Package Legitimacy Audit; slopcheck has unconfirmed cargo coverage | 30-03 Task 1 — verify publisher org and version on crates.io before `cargo add` |
| Live QR scan → populated library → install E2E in the Tauri build | REQ-30-01, REQ-30-03, REQ-30-04 | Requires a phone with the Steam mobile app and a real Steam account; deferred per D-04 | Logged as **one** deferred UAT item in `30-HUMAN-UAT.md` naming both the scan and the install E2E it gates |
| Both builds still launch after every plan | REQ-30-09 | Bundled-runtime behavior; esbuild/electron-vite bundling is not exercised by ts-jest | `npm start`, then `npm run tauri:dev` — which already bundles (`electron-vite build && pnpm build:sidecar && tauri dev`); there is no separate `npm run build` script (30-04 Task 3) |
| Module-init order of the two new `*FlowRegistration.ts` modules | REQ-30-06 | 27-05 crash class reproduces only in the bundle | Observe a clean `npm run tauri:dev` boot with no constructor error (30-04 Task 3) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are documented Manual-Only entries
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none outstanding)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] Every test uses the three-way mock isolation pattern (no real userData writes)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** conditional-pass — all automated verifies for 30-01/30-02/30-03 and this plan's own
Task 1/Task 2 are green (statuses above filled from real results, not planned intent). Final
approval is gated on Task 3, the both-builds smoke-pass checkpoint (`npm start` +
`npm run tauri:dev`), which has not yet run as of this document's finalization. This phase's
overall claim level, per D-04/REQ-30-03, is **wired and unit-proven** — never "hardware-proven" —
regardless of Task 3's outcome; see `30-HUMAN-UAT.md` for the deferred live-scan proof this
claim-level statement covers.
