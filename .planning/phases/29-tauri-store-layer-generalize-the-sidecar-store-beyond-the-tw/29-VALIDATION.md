---
phase: 29
slug: tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-22
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `29-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (project-wide; sidecar suites under `src/backend/sidecar/__tests__/`) |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts` |
| **Full suite command** | `npx jest src/backend/sidecar src/preload/__tests__/tauriTransport.test.ts` |
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
store path under the real user profile.

---

## Sampling Rate

- **After every task commit:** Run the specific new/extended test file
  (`npx jest <file>`)
- **After every plan wave:** Run `npx jest src/backend/sidecar`
- **Before `/gsd-verify-work`:** Full suite green
  (`npx jest src/backend/sidecar src/preload/__tests__/tauriTransport.test.ts`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Task IDs are filled in by the planner. Requirement IDs REQ-29-01..06 are minted
> at plan time (ROADMAP.md currently reads `TBD — mint at /gsd-plan-phase 29`).

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| REQ-29-01 | Every `ValidStoreName` (21) + the 4 boot-set `CacheStore` names (D-13) round-trip `get`/`set`/`delete`/`raw_store` through the sidecar | integration | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts` | ❌ Wave 0 | ⬜ pending |
| REQ-29-02 | A lazy-tier synchronous read returns the caller's default + emits a distinct greppable warning; a later async hydrate corrects it (D-03/D-04) | integration | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts -t "lazy hydrate"` | ❌ Wave 0 | ⬜ pending |
| REQ-29-03 | `storeSet`/`storeDelete` persist AND push a change notification the renderer observes (D-05/D-06) | integration | `npx jest src/backend/sidecar/__tests__/skeletonFlows.test.ts -t "storeSet"` | ⚠️ extend existing | ⬜ pending |
| REQ-29-04 | The allow-list excludes every secret/main-process-only field (`refreshToken`, `sessionCookie`, `csrfToken`, + research additions) from any snapshot response (D-08) | integration | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts -t "allow-list"` | ❌ Wave 0 | ⬜ pending |
| REQ-29-05 | D-07's cross-process write-clobber constraint is documented in SEAM.md and `fileStore.ts` | doc-check | N/A — comment/text presence, verified at code review | N/A | ⬜ pending |
| REQ-29-06 | Two stores resolving to the same on-disk path do not clobber each other's writes (D-14, path-keyed singleton) | unit | `npx jest src/backend/sidecar/__tests__/fileStore.test.ts -t "same-path collision"` | ❌ Wave 0 | ⬜ pending |
| REQ-29-07 | Both builds still work after the phase — `npm start` (Electron) and `npm run tauri:dev` (additive/reversible invariant, REQ-27-06 pattern) | manual | N/A — live run | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/sidecar/__tests__/storeLayer.test.ts` — NEW. Covers REQ-29-01/02/04.
      Must use the three-mock isolation pattern above.
- [ ] `src/backend/sidecar/__tests__/fileStore.test.ts` — NEW (none exists today).
      Covers `fileStore.ts` unit behavior incl. the REQ-29-06 same-path-collision
      regression and `options.defaults` handling.
- [ ] Extend `src/backend/sidecar/__tests__/skeletonFlows.test.ts` — add
      `storeSet`/`storeDelete` round-trip + change-notification assertions
      (REQ-29-03). Its existing "Test 4 (snapshot)" assertion
      (`steamConfigStore.userData` present / `refreshToken` absent) must keep
      passing unchanged.
- [ ] Extend `src/preload/__tests__/tauriTransport.test.ts` — assert a change
      notification patches the in-memory `snapshot` (today it only covers
      `hydrateStoreSnapshot`/`snapshotGet` and the generic push slot).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Both builds still launch and render | REQ-29-07 | Requires a real Electron run and a real Tauri window; no headless equivalent | Run `npm start`, confirm the library renders and Steam login state is intact. Then run `npm run tauri:dev`, confirm the window mounts (not blank) and no new boot warnings beyond known unported-channel ones. |
| D-07 constraint is discoverable | REQ-29-05 | Documentation presence, not runtime behavior | Confirm SEAM.md and/or `fileStore.ts` state that running Electron and Tauri concurrently against the same userData folder can silently lose config writes |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] No test resolves a store path under the real user profile
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
