---
phase: 29
slug: tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
status: approved
nyquist_compliant: true
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

> Reconciled with the plan set on 2026-07-22. REQ-29-01..07 are minted in
> `.planning/REQUIREMENTS.md` and referenced in ROADMAP.md's Phase 29 entry.
> Owning plan is named per row; test file names match what those plans create.

| Requirement | Owning plan(s) | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------------|----------|-----------|-------------------|-------------|--------|
| REQ-29-01 | 29-02, 29-04 | Every `ValidStoreName` (21) + the 4 boot-set `CacheStore` names (D-13) round-trip `get`/`set`/`delete`/`raw_store` through the sidecar | integration | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts` | ❌ Wave 0 | ⬜ pending |
| REQ-29-02 | 29-04, 29-05 | A lazy-tier synchronous read returns the caller's default + emits a distinct greppable warning (`STORE_LAZY_MISS_MARKER`); a later async hydrate corrects it (D-03/D-04). The lazy read/hydrate lives in the PRELOAD bridge, so the behavior test lives with it. | integration | `npx jest src/preload/__tests__/tauriTransport.test.ts -t "lazy hydrate"` | ⚠️ extend existing | ⬜ pending |
| REQ-29-03 | 29-06 (sidecar), 29-05 (renderer) | `storeSet`/`storeDelete` persist AND push a `storeChanged` notification the renderer applies to its snapshot (D-05/D-06) | integration | `npx jest src/backend/sidecar/__tests__/skeletonFlows.test.ts -t "storeSet"` + `npx jest src/preload/__tests__/tauriTransport.test.ts -t "change events"` | ⚠️ extend existing (both) | ⬜ pending |
| REQ-29-04 | 29-03, 29-04, 29-05, 29-06 | The allow-list excludes every secret/main-process-only field (`refreshToken`, `sessionCookie`, `csrfToken`, `gog`/`zoom` `credentials`, `humble_library`) from BOTH the eager snapshot and the lazy fetch, and governs writes too (D-08) | integration | `npx jest src/common/types/__tests__/storePolicy.test.ts -t "allow-list"` + `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts -t "allow-list"` | ❌ Wave 0 (both) | ⬜ pending |
| REQ-29-05 | 29-01, 29-07 | D-07's cross-process write-clobber constraint is documented in SEAM.md and `fileStore.ts` | doc-check | N/A — comment/text presence, verified at code review | N/A | ⬜ pending |
| REQ-29-06 | 29-01 | Two stores resolving to the same on-disk path do not clobber each other's writes (D-14, path-keyed shared cell); plus `options.defaults` and atomic persist (D-02b/D-10) | unit | `npx jest src/backend/sidecar/__tests__/fileStore.test.ts -t "same-path collision"` | ❌ Wave 0 | ⬜ pending |
| REQ-29-07 | 29-02, 29-07 | Both builds still work after the phase — `npm start` (Electron) and `npm run tauri:dev` (additive/reversible invariant, REQ-27-06 pattern). The Electron-side rewire (29-02) is additionally covered by an AUTOMATED gate over the four rewired subsystems, so the claim is not manual-only. | manual + automated | `npx jest src/backend/wine src/backend/downloadmanager src/backend/migration src/backend/logger --passWithNoTests` (automated half); live run for the rest | ⚠️ existing suites | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/common/types/__tests__/storePolicy.test.ts` — NEW (plan 29-03). Covers the
      REQ-29-04 policy data itself: secret exclusion by name + boot/lazy partition
      totality. Pure data/predicates, constructs no store.
- [ ] `src/backend/sidecar/__tests__/storeLayer.test.ts` — NEW (plan 29-04). Covers
      REQ-29-01 (walk all 21 `ValidStoreName`s — `fontsStore` is the ONLY permitted
      exclusion — plus the four D-13 CacheStore names) and REQ-29-04 enforcement on
      both the eager and lazy read paths. Must use the three-mock isolation pattern above.
- [ ] `src/backend/sidecar/__tests__/fileStore.test.ts` — NEW (none exists today).
      Covers `fileStore.ts` unit behavior incl. the REQ-29-06 same-path-collision
      regression and `options.defaults` handling.
- [ ] Extend `src/backend/sidecar/__tests__/skeletonFlows.test.ts` (plan 29-06) — add
      `storeSet`/`storeDelete` round-trip + `storeChanged` notification assertions
      (REQ-29-03), plus the Phase 28 D-04 regression (a `storeSet` of
      `steamConfigStore.refreshToken` leaves the stored token byte-identical). Its existing "Test 4 (snapshot)" assertion
      (`steamConfigStore.userData` present / `refreshToken` absent) must keep
      passing unchanged.
- [ ] Extend `src/preload/__tests__/tauriTransport.test.ts` (plan 29-05) — assert a
      `storeChanged` notification patches the in-memory `snapshot`, that a lazy-tier
      miss returns the caller's default with the `STORE_LAZY_MISS_MARKER` warning and
      self-heals, and that the allow-list blocks `csrfToken`/`refreshToken.sub`
      (today it only covers `hydrateStoreSnapshot`/`snapshotGet` and the generic push slot).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Both builds still launch and render (29-07 Task 3) | REQ-29-07 | Requires a real Electron run and a real Tauri window; no headless equivalent | Run `npm start`, confirm the library renders and Steam login state is intact. Then run `npm run tauri:dev`, confirm the window mounts (not blank) and no new boot warnings beyond known unported-channel ones. |
| D-07 constraint is discoverable (29-07 Task 1) | REQ-29-05 | Documentation presence, not runtime behavior | Confirm SEAM.md and/or `fileStore.ts` state that running Electron and Tauri concurrently against the same userData folder can silently lose config writes |

---

## Validation Sign-Off

- [x] All tasks have automated verify or a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] No test resolves a store path under the real user profile (asserted per test task; 29-07 Task 2 re-asserts the mock is present and forbids weakening it)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-22 — gsd-plan-checker returned VERIFICATION PASSED on the
revised plan set (commit `06ea73b4`), Dimension 8 PASS.
