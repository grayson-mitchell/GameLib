---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 12
subsystem: infra
tags: [github-actions, tauri, ci-cd, electron-vite, release-pipeline, gap-closure]

# Dependency graph
requires:
  - phase: 34 (plans 34-01..34-11)
    provides: release-tauri.yml scaffold, sidecar SEA build, per-leg sidecar_triple wiring, Windows cert import/cleanup
provides:
  - "release-tauri.yml renderer build step (pnpm exec electron-vite build) ahead of tauri-action on all four matrix legs"
  - "macOS-only Phase 24 Steam bridge shim build step ahead of the renderer build"
  - "CrossOver index snapshot fetch step (mirrors draft-release-mac.yml, non-fatal fallback)"
  - "corrected release-tauri.yml header comment that states pipeline behavior as an unproven intended invariant, not verified fact"
  - "9 new ordering-regression tests in releaseWorkflow.test.ts guarding GAP-1 against reintroduction"
affects: [34-14, 34-15, "34-07 live tag-push gate (prerequisite closed)"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["pre-tauri-action asset-build steps mirrored from the existing Electron release workflow (draft-release-mac.yml) rather than invented fresh"]

key-files:
  created: []
  modified:
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts

key-decisions:
  - "Followed the plan's explicit instruction to mirror draft-release-mac.yml's CrossOver-fetch step verbatim rather than write a new variant, keeping trust posture identical to the already-shipping Electron pipeline (T-34-16)."
  - "Left tauri.conf.json's beforeBuildCommand as \"\" and used explicit workflow steps instead, per the plan's interface contract, so tauri dev remains unaffected and failures are attributable to their own step."
  - "Scoped the header-comment rewrite to only the co-run and cert-skip paragraphs plus the UNPROVEN LIVE marker -- did not touch any other lines in the header to avoid conflicting with 34-15's Windows-signing region this wave."

patterns-established:
  - "Ordering-regression assertions use expect(source).toMatch(/A[\\s\\S]*?B/) against the exact run:/uses: prefixed command strings, never bare command names, to prevent header prose from satisfying a toContain assertion."

requirements-completed: [REQ-34-01, REQ-34-02, REQ-34-03, REQ-34-06]

# Metrics
duration: 25min
completed: 2026-07-24
---

# Phase 34 Plan 12: Renderer + asset build steps for release-tauri.yml Summary

**Closed GAP-1: release-tauri.yml now builds electron-vite renderer assets, the macOS Steam bridge, and fetches the bundled CrossOver index before tauri-action on every matrix leg, ending the "Unable to find your web assets" failure that broke all four platforms.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-24T08:12:00Z (approx, session start)
- **Completed:** 2026-07-24T08:36:46Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `.github/workflows/release-tauri.yml` gained three new steps (CrossOver index fetch, macOS-only steam-bridge build, `electron-vite build`) inserted between `./.github/actions/install-deps` and `Install Rust stable`, so `tauri.conf.json`'s `frontendDist: "../build"` now resolves to a real `build/index.html` on every leg.
- Header comment rewritten to state pipeline behavior as an intended invariant pending the deferred 34-07 live gate, not verified fact (closes 34-REVIEW.md WR-09).
- `releaseWorkflow.test.ts` gained a 9-test ordering-regression describe block that failed 8/9 against the pre-fix workflow (RED) and now passes 9/9 (GREEN), guarding GAP-1 against silent reintroduction.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add RED ordering-regression tests for the missing renderer/asset build steps** - `0b405c34` (test)
2. **Task 2: Add the renderer, steam-bridge, and CrossOver-index build steps; correct the header comment** - `172b4402` (feat)

**Plan metadata:** (pending — see final commit below)

## RED Evidence (Task 1, captured verbatim)

`npx jest --testPathPattern=releaseWorkflow` against the pre-fix workflow:

```
Test Suites: 1 failed, 1 total
Tests:       8 failed, 23 passed, 31 total
```

The 8 failing tests (all in the new `release-tauri.yml renderer + asset build steps (CR-01 / GAP-1 regression guard)` describe block):
```
✕ builds the renderer via electron-vite before bundling
✕ the renderer build step precedes tauri-action
✕ builds the macOS Steam bridge shims, gated to macOS legs
✕ the steam-bridge build step precedes the renderer build
✕ fetches the bundled CrossOver index snapshot
✕ the crossover index fetch precedes the renderer build
✕ the crossover index fetch tolerates a missing published index
✕ the header states the pipeline is unproven live, not verified fact
```
Test 9 (`invariant guard: the SEA sidecar build step still precedes tauri-action`) passed both before and after, as designed — it is an invariant guard, not part of the RED signal.

## GREEN Evidence (Task 2)

- `node -e "require('js-yaml').load(...)"` → `YAML OK`
- `npx jest --testPathPattern=releaseWorkflow` → `31 passed, 31 total`
- Cross-plan regression sweep `npx jest --testPathPattern="tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched"` → `94 passed, 94 total`
- `grep -c "run: pnpm exec electron-vite build"` → `1`
- `grep -c "run: pnpm build-steam-bridge"` → `1`
- `grep -c "gh release download crossover-index"` → `1`
- `grep -c "UNPROVEN LIVE"` → `1`
- `grep -c "Heroic"` → `0`
- Ordering proof by line number: `run: pnpm exec electron-vite build` at line 110, `uses: tauri-apps/tauri-action@v1` at line 191 (110 < 191).
- `git diff .github/workflows/release-tauri.yml` shows changes ONLY in the header comment block and the three inserted steps — no hunk touches `strategy:`, `env:`, `build:sidecar-sea`, `Import Windows signing certificate`, `build_args`, or `tauri-action`.

## Files Created/Modified
- `.github/workflows/release-tauri.yml` - Inserted CrossOver-index fetch, macOS-only steam-bridge build, and electron-vite renderer build steps ahead of `tauri-action`; rewrote the header comment's co-run and cert-skip paragraphs plus added the `UNPROVEN LIVE` marker.
- `src/backend/__tests__/releaseWorkflow.test.ts` - Appended a 9-test `describe` block asserting the ordering contract above; zero existing tests modified (insertions only, confirmed via `git diff | grep -c '^-[^-]'` = 0).

## Decisions Made
- Mirrored `draft-release-mac.yml`'s CrossOver-fetch step verbatim (same `env: GH_TOKEN`, same `--pattern`, same `|| echo` fallback) rather than inventing a new variant, per the plan's interface contract and to keep an identical trust posture to the already-shipping Electron pipeline.
- Kept `beforeBuildCommand: ""` untouched in `tauri.conf.json` (read-only for this plan, owned by 34-14) — used explicit workflow steps instead, matching the plan's stated rationale that `tauri dev` should stay unaffected and step failures should be individually attributable.
- Scoped the header rewrite narrowly (co-run paragraph, cert-skip paragraph, new `UNPROVEN LIVE` sentence) to avoid touching the signing/build_args/tauri-action region 34-15 owns this wave.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria for both tasks were met on the first attempt with no auto-fixes required.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan only modifies a CI workflow file and its accompanying test file; no secrets, dashboards, or environment variables are introduced.

## Next Phase Readiness

- GAP-1 (the blocker that broke every matrix leg) is closed in code and test-guarded. 34-14 and 34-15 (wave 2) both `depends_on: ['34-12']` and can now proceed — they read/write `release-tauri.yml` and are serialized behind this plan per the file-overlap-safety note in `34-VERIFICATION.md`/`STATE.md`.
- This plan does NOT re-run or claim 34-07's deferred live `v*` tag-push gate (REQ-34-09) — it remains open and owned by 34-07, per `deferred-items.md`. It is now one gap closer to being safely resumable: the renderer, steam-bridge, and crossover-index steps that gate would have exercised first are fixed.
- No blockers for 34-13 (parallel wave-1 sibling, disjoint `files_modified`) or for 34-14/34-15 (wave 2).

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: .github/workflows/release-tauri.yml
- FOUND: src/backend/__tests__/releaseWorkflow.test.ts
- FOUND: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-12-SUMMARY.md
- FOUND commit: 0b405c34 (Task 1)
- FOUND commit: 172b4402 (Task 2)
