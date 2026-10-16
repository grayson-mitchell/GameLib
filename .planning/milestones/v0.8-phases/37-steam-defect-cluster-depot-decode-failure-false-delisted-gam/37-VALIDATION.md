---
phase: 37
slug: steam-defect-cluster-depot-decode-failure-false-delisted-gam
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-22
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `37-RESEARCH.md` § Validation Architecture.
>
> **Plan-column note:** 37-03 was split into `37-03a` (the D-15 forced backend+frontend pair) and
> `37-03b` (the additive facet row, chip, badge and the blocking live gate) during planning. Rows
> below are attributed to the resulting plan.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x via `ts-jest` preset, multi-project config (`backend`, `common`, `frontend`, `preload`, `meta`) |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `npx jest <path-to-test-file> --silent` |
| **Full suite command** | `pnpm test:ci` (`jest --runInBand --silent`) |
| **Estimated runtime** | quick ~5–20s per file; full suite several minutes |

**Standing trap for this repo:** `ts-jest` runs TRANSPILE-ONLY, so jest cannot see type errors or
dynamic-import defects. A green suite here does not stand in for `tsc`, for lint, or for a live
run. This phase's ledger records a live gate beating a green suite three separate times.

---

## Sampling Rate

- **After every task commit:** Run the single affected test file (quick run command).
- **After every plan wave:** Run `pnpm test:ci`.
- **Before `/gsd:verify-work`:** Full suite green AND the live Dead Island verification below.
- **Max feedback latency:** ~20 seconds at task granularity.

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this table is keyed by requirement and is the contract the
per-task `<automated>` blocks must satisfy.

| Plan | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-02 | REQ-37-01 | — | N/A | unit | `npx jest src/backend/storeManagers/steam/__tests__/depot.test.ts -t classifyDepotError` | ✅ extend existing `describe` | ⬜ pending |
| 37-02 | REQ-37-01 (typing gap) | — | N/A | unit | new case asserting `DepotDownloadFailure.error` reaches the classifier with `.eresult`/`.code` intact (not pre-stringified at `depot.ts:2426`) | ❌ W0 | ⬜ pending |
| 37-03a | REQ-37-02 (frontend) | — | N/A | unit | `npx jest src/frontend/screens/Library/__tests__/filterEngine.test.ts` | ✅ file exists — flip `:169-183` | ⬜ pending |
| 37-03a | REQ-37-02 (backend, D-15) | — | N/A | unit | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t isGameAvailable` | ❌ W0 — no delisted+installed case | ⬜ pending |
| 37-03b | REQ-37-02 (facet count) | — | N/A | unit | `npx jest src/frontend/components/UI/NavShell/components/FilterFacetGroup/__tests__/facetSelectionCount.test.ts` | ✅ existing tripwire — sixth kind must be added in BOTH places | ⬜ pending |
| 37-03b | REQ-37-02 (live) | — | N/A | **live gate** | Dead Island (91310) visible + launchable at default filters after a clean app restart | n/a — human | ⬜ pending |
| 37-04 | REQ-37-03 | — | N/A | unit | `npx jest src/backend/downloadmanager/__tests__/utils.test.ts` | ✅ file CONFIRMED to exist at plan time — extend, do not create | ⬜ pending |
| 37-05 | REQ-37-04 | — | N/A | unit | `npx jest src/backend/utils/aborthandler/__tests__/aborthandler.test.ts` | ✅ groundwork exists | ⬜ pending |
| 37-05 | REQ-37-04 (seam) | — | N/A | integration | new test at the `games.ts` install-flow / `utils.ts` terminal-error seam: pre-download throw produces no miss-ERROR; user-cancel unaffected | ❌ W0 | ⬜ pending |
| 37-06 | REQ-37-05 | — | N/A | unit | `npx jest src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts` | ✅ 9 tests — upper-bound case missing | ⬜ pending |
| 37-10 | REQ-37-06 | **V5 Input Validation** | Containment validation against the resolved install root rejects a traversal/absolute/separator installdir and ABORTS the install; ordinary punctuation passes unchanged | unit | `npx jest src/backend/storeManagers/steam/__tests__/installLocation.test.ts` | ✅ rich WR-04 suite — apostrophe + RED traversal cases missing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/frontend/screens/Library/__tests__/filterEngine.test.ts:169-183` — flip the existing
      "delisted counts as non-available" test from asserting forced-hide to asserting
      default-visible. RED→GREEN by design, not a new file.
- [ ] `src/backend/storeManagers/steam/__tests__/games.test.ts` — new case(s) for
      `isGameAvailable()` with `is_delisted: true` + `is_installed: true`, asserting it no longer
      returns `false`. **This is the D-15 gate; without it a frontend-only fix passes.**
- [ ] `src/backend/storeManagers/steam/__tests__/platformPrecedence.test.ts` — an absurdly-large /
      future finite `existingCapturedAt`, and a corrupted incoming `capturedAt`.
- [ ] `src/backend/storeManagers/steam/__tests__/installLocation.test.ts` — apostrophe installdir
      passes through unchanged; a RED traversal case that proves the containment check fires; and
      a case proving the `!candidate` branch now logs at WARNING (Correction §3's "no log at all").
- [ ] `src/backend/downloadmanager/__tests__/utils.test.ts` — `title` falls back to `appName` when
      `getGameInfo()` returns `{}`. Path CONFIRMED at plan time: the file exists, so 37-04 extends
      it rather than creating it.
- [ ] Integration test at the `games.ts` / `utils.ts` seam — no `callAbortController`-miss ERROR
      when a pre-download step throws before `runNativeDepotDownload` is reached, plus a separate
      assertion that user-cancel (`stopCurrentDownload`) is unaffected.
- [ ] `src/backend/storeManagers/steam/__tests__/depot.test.ts` — a `ChunkDecodeError`-originated
      retry-exhaustion message must NOT classify as `steam.download.error.connectionDropped`.

**Non-vacuity rule for every item above:** each new assertion must be observed FAILING against a
known-bad input before it is accepted. An unmatchable grep and an over-tolerant decoder both pass
vacuously, and both have shipped in this repo.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dead Island (91310), delisted AND installed, renders in the library grid and launches at default filter settings | REQ-37-02 | The forced hide is the product of a backend availability verdict, a localStorage-backed list and a frontend filter interacting. No `testEnvironment: 'node'` suite can observe the rendered grid, and this repo's ledger records a live gate beating a green suite three times. | Full clean app restart (**not** a reload — a reload can preserve pre-existing localStorage) under `pnpm tauri:dev`. Confirm 91310 appears with no filter changes, carries the "No store page" badge, and launches. Then confirm it still hides when the user actively selects `hide`. |
| Library header count holds at first paint after a clean restart | REQ-37-02 (folded-in owed confirmation) | The sibling "22 owned Steam games never reach the rendered library" fix (`51b175d74`) is open only pending a clean-restart confirmation. Discharge it in the same session. **The header counts the cross-store UNION, not a per-runner sync count** — comparing it to a Steam sync count is a category error that has cost a whole session here before. | Same restart. Record the header count at first paint. Note that closing REQ-37-02 explains **9** of those 22 and will NOT close that item. |
| The "No store page" row and badge render actual text, not blank | REQ-37-02 | i18next renders the catalog value in preference to a call-site default, and `i18next-parser` only resolves STRING-LITERAL arguments — a literal key with a non-literal default extracts an EMPTY catalog value and the row renders blank. Invisible to a node-environment suite. | In the same live session, open the Games tab → More filters, and confirm the row label and the card badge both read "No store page". Run `pnpm lint-translations:gamelib` and confirm the NEW key is present in `public/locales/en/gamelib.json` rather than assumed. |
| A depot install failure names its actual cause | REQ-37-01 | The user-facing string is produced only on a real failure of a real install; the classifier unit test proves the branch, not the rendered dialog. | Opportunistic — if a native install fails during the phase's live session, capture the dialog text and confirm it does not say "Steam servers dropped the connection" for a decode-stage failure. Not blocking; the unit gate is the contract. |

---

## Validation Sign-Off

Checked items were confirmed by `gsd-plan-checker` against the seven committed plans on
2026-08-22 (verdict: 0 blockers). Unchecked items **cannot** be discharged at plan time — they
are claims about code that does not exist yet, and ticking them now would be ticking a box on
intention, which this project's ledger records as a repeat failure mode.

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — all seven items map 1:1 to a concrete Wave-0 task
      inside the plan that owns the defect
- [x] All four Manual-Only rows are carried as `autonomous: false` gate tasks (rows 1–3 in
      `37-03b` Task 4, `gate="blocking"`, one clean-restart session; row 4 in `37-02` Task 4,
      `gate="advisory"`)
- [ ] Every new assertion has a recorded mutation-proven RED observation — **discharged during
      execution, not planning.** Every plan REQUIRES the RED observation; none can have made it.
- [x] No watch-mode flags
- [x] Feedback latency < 20s at task granularity
- [x] `nyquist_compliant: true` set in frontmatter

`wave_0_complete` stays **false**: the seven Wave 0 tests are assigned, not written.

**Approval:** approved at plan level 2026-08-22 (`/gsd-plan-phase 37`).
