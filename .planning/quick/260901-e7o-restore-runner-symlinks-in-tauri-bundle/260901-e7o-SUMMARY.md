---
phase: quick-260901-e7o
plan: 01
subsystem: build
tags: [tauri, macos, bundle-packaging, symlinks, pyinstaller, packagingConfig]

# Dependency graph
requires:
  - phase: quick-260901-8rm
    provides: "Per-platform tauri.{macos,windows,linux}.conf.json overlays narrowing bundle.resources to only the runner trees each platform needs"
provides:
  - "src-tauri/tauri.macos.conf.json routes both darwin bin/ trees through bundle.macOS.files (symlink-preserving copy_dir) instead of bundle.resources (symlink-dereferencing copy_resources)"
  - "Hardened pnpm verify:runner-bundle (Resources-alias check, _internal sibling-stub check, exact censusTree --expect-* CLI assertions) proven to catch the real field defect against a preserved OLD-artifact control"
  - "packagingConfig.test.ts positive-coverage gate closing the hole where nothing asserted macOS actually ships the darwin trees"
  - "Measured OLD-shipped vs NEW-shipped darwin-tree census on a real release DMG (260901-e7o-MEASUREMENTS.md)"
  - "Cause 3 of the 2026-08-28 bundle-size todo marked CLOSED, with two prior errors in that file corrected"
affects: [build, packaging, macos-bundle-size, tauri-config, steam-runner-bootstrap]

tech-stack:
  added: []
  patterns:
    - "Tauri bundle.macOS.files (map form, KEY=Contents-relative destination, VALUE=source) copies via symlink-preserving fs_utils::copy_dir, one step before codesigning -- use this instead of bundle.resources for any tree containing symlinks Tauri must not dereference"
    - "platformShipsBinPath(platform, relPath) as a single predicate over BOTH bundle.resources and bundle.macOS.files, so config-shape tests don't need to know which mechanism a given platform currently uses to ship a path"
    - "OLD-shipped vs NEW-shipped apparent-byte census (never repo-tree vs shipped-tree, never du) as the only valid packaging-fix comparison pair"

key-files:
  created: []
  modified:
    - src-tauri/tauri.macos.conf.json
    - meta/verifyRunnerBundle.ts
    - meta/__tests__/verifyRunnerBundle.test.ts
    - src/backend/__tests__/packagingConfig.test.ts
    - .planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md

key-decisions:
  - "Moved both arm64/darwin and x64/darwin to bundle.macOS.files for consistency, even though only arm64/darwin actually carries symlinks (x64/darwin is 0-symlink, byte-identical repo-to-shipped either way)"
  - "Task 3's live per-runner UI checkpoint was resolved as partially met, partially substituted -- not recorded as a clean 3/3 pass -- because the Epic and Amazon UI gestures were environmentally unreachable (work-network Epic block; no owned Amazon games), not because of a defect in this fix"
  - "Closed the Epic/Amazon UI verification gap with a mutation-proven direct-execution gesture (runner --version against the installed app, proven non-vacuous by deliberately dangling and restoring the _internal/Python symlink on a scratch copy) rather than treating the gap as unaddressed"

requirements-completed: []

# Metrics
duration: spans a compacted session with a human checkpoint round-trip; see Performance for commit timestamps
completed: 2026-09-01
---

# Quick Task 260901-e7o: Restore runner symlinks in Tauri bundle Summary

**Moved both darwin runner trees from Tauri's symlink-dereferencing `bundle.resources` to the symlink-preserving `bundle.macOS.files`, restoring all 12 PyInstaller Python.framework symlinks and recovering 47,981,472 B (-45.76 MiB) of installed-app apparent bytes, verified on a real release DMG with a hardened structural gate and a mutation-proven direct-execution check.**

## Performance

- **Tasks:** 4/4 completed (Task 3 was a blocking human checkpoint, resolved partially/substituted per explicit coordinator instruction, not as a clean pass)
- **Files modified:** 5 (`src-tauri/tauri.macos.conf.json`, `meta/verifyRunnerBundle.ts`, `meta/__tests__/verifyRunnerBundle.test.ts`, `src/backend/__tests__/packagingConfig.test.ts`, the 2026-08-28 bundle-size todo)
- **Task commit timestamps:** Task 1 `65a2a0d84` 2026-09-01T11:20:52+12:00 — Task 2 `43a4971cf` 2026-09-01T11:24:15+12:00 — Task 4 `f64bd8f69` 2026-09-01T11:50:32+12:00. Execution spanned a compacted session (Task 3's checkpoint required a human round-trip between Task 2 and Task 4), so a single continuous start-to-finish duration is not meaningful; the commit timestamps above are the honest record.

## Accomplishments

- Hardened `pnpm verify:runner-bundle` with a Resources-alias check, an `_internal` sibling-stub check, symlink-target containment reuse, and exact `censusTree`/`--expect-*` CLI assertions — validated against the real OLD-artifact control (`/tmp/e7o-OLD.dmg`), not just synthetic fixtures, confirming the hardened gate can see the real field defect (FAILs on OLD, PASSes on NEW).
- Fixed the root cause: `arm64/darwin` and `x64/darwin` now ship via `bundle.macOS.files` (`fs_utils::copy_dir`, symlink-preserving) instead of `bundle.resources` (`tauri_utils::resources::copy_resources`, symlink-dereferencing).
- Built a real release DMG and measured the fix end-to-end on the mounted artifact: `arm64/darwin` went from 285 files/0 symlinks/148,688,545 B to 279 files/12 symlinks/100,707,073 B (exact match to the repo tree); all 12 symlinks resolve; `x64/darwin` unchanged at 4 files/0 symlinks/46,423,272 B; installed `.app` shrank by exactly 47,981,472 B, matching the arithmetic prediction to the byte; `codesign --force -s -` on the shipped framework exits 0 (was exit 1 on the OLD artifact).
- Closed `packagingConfig.test.ts`'s positive-coverage hole: added `platformShipsBinPath`/`mergedMacFilesMap` and assertions that macOS actually ships `arm64/darwin/{legendary,gogdl,nile}` and `x64/darwin`, plus a `bundle.resources`/`bundle.macOS.files` disjointness test and a no-nesting test. 47/47 tests pass (gate required ≥30).
- Resolved the Task 3 live-UI checkpoint honestly: gogdl proven full-strength via a real UI library re-sync; legendary and nile's UI gestures were environmentally unreachable and are recorded as deferred, not passed; the resulting gap was closed at the layer this change can actually break, via a mutation-proven direct-execution gesture on the installed app.
- Corrected two pre-existing errors in the 2026-08-28 bundle-size todo: a stale repo-vs-shipped census comparison (superseded, not deleted), and a claim that both darwin trees were affected by the symlink defect (only `arm64/darwin` is — `x64/darwin` carries no symlinks and is byte-identical repo-to-shipped).

## Task Commits

1. **Task 1: Harden `verify:runner-bundle` and validate against a preserved OLD-artifact control** — `65a2a0d84` (test) — `meta/verifyRunnerBundle.ts`, `meta/__tests__/verifyRunnerBundle.test.ts`
2. **Task 2: Move darwin trees to `bundle.macOS.files`, build and measure a real release DMG** — `43a4971cf` (fix) — `src-tauri/tauri.macos.conf.json`
3. **Task 3: Live per-runner checkpoint** — blocking human checkpoint; no code commit. Resolved partially/substituted per the coordinator's explicit instruction (see Deviations below); result recorded in `260901-e7o-MEASUREMENTS.md`.
4. **Task 4: Close the `packagingConfig.test.ts` positive-coverage gate hole, update the todo** — `f64bd8f69` (test) — `src/backend/__tests__/packagingConfig.test.ts`, `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md`

_Note: no `docs: complete plan` metadata commit was made — per this task's explicit instruction, the orchestrator commits SUMMARY.md/MEASUREMENTS.md/STATE.md, not the executor._

## Files Created/Modified

- `src-tauri/tauri.macos.conf.json` — both darwin `bin/` trees moved from `bundle.resources` to `bundle.macOS.files`
- `meta/verifyRunnerBundle.ts` — Resources-alias check, `_internal` sibling-stub check, `censusTree`/`TreeCensus`, `--expect-files/--expect-symlinks/--expect-bytes` CLI flags
- `meta/__tests__/verifyRunnerBundle.test.ts` — 36 tests covering the hardened checks (Resources-alias, sibling-stub, scoping, containment-escape, censusTree, CLI `--expect-*`)
- `src/backend/__tests__/packagingConfig.test.ts` — `TauriConfig.bundle.macOS`, `mergedMacFilesMap`, `platformShipsBinPath`, positive-coverage tests for the four darwin paths, disjointness test, no-nesting test, extended negative guards
- `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md` — Cause 3 marked CLOSED with measured figures and the Task 3 partial/substituted verdicts; two prior errors corrected; left in `pending/` (steam_api.pdb/.lib item still open)
- `.planning/quick/260901-e7o-restore-runner-symlinks-in-tauri-bundle/260901-e7o-MEASUREMENTS.md` — full derivation for all four tasks (not committed by this executor, per instruction)

## Decisions Made

- **Moved both darwin trees, not just the affected one.** Only `arm64/darwin` carries the 12 PyInstaller symlinks the defect corrupts; `x64/darwin` has 0 symlinks and is byte-identical whichever mechanism ships it. Both were moved to `bundle.macOS.files` for consistency (one mechanism per platform-specific tree family) rather than splitting `x64/darwin` across two config keys for no measurable benefit.
- **Task 3 recorded as partially met, partially substituted — never as a clean 3/3 UI pass.** This was an explicit instruction from the coordinator after the human checkpoint returned 1/3 full UI verification (gogdl) and 2/3 environmentally-blocked gestures (legendary: Epic blank page on a work network; nile: no owned Amazon games). The gap for legendary/nile was closed at the layer this change can actually break — direct helper execution against the installed app, proven non-vacuous by a mutation test (dangling the `_internal/Python` symlink on a scratch copy makes `--version` fail with PYI-7129; restoring it makes it pass again) — rather than left unaddressed or misrepresented as a UI pass.
- **Epic login blank page flagged as a separate, undiagnosed observation**, not folded into this task's findings — e7o only moved config-declared `bin/` tree locations, and the Epic login window loads a remote `epicgames.com` URL untouched by this change.

## Deviations from Plan

### Task 3 checkpoint resolution (not a code deviation, but a documented departure from a clean pass)

**1. [Checkpoint resolution] Task 3's live per-runner UI checkpoint resolved as partial + substituted, not a clean 3/3 pass**
- **Found during:** Task 3 (blocking human checkpoint)
- **Issue:** The plan's Task 3 asked for a full library re-sync through the app UI for one game per runner (legendary/gogdl/nile). Only gogdl could be fully performed — legendary's Epic login showed a blank page on a work network that likely blocks Epic; nile had no Amazon games owned to re-sync.
- **Resolution:** Recorded gogdl as PROVEN, full-strength, human-verified. Recorded legendary and nile as NOT PROVEN / DEFERRED, with the environmental reason stated, not as failures of the runner or the fix. Closed the verification gap for legendary/nile at the layer this fix can actually break (Python interpreter boot from the restored framework) via direct `--version` execution against the installed app, mutation-proven non-vacuous (PYI-7129 on a deliberately-dangled scratch copy, restored to pass). This substitution and its mutation proof are named explicitly in `260901-e7o-MEASUREMENTS.md`; the record does not claim the original 3/3-UI criterion was met.
- **Files modified:** None (verification-only; no code change resulted from this resolution).
- **Committed in:** N/A — checkpoint resolution recorded in `260901-e7o-MEASUREMENTS.md`, uncommitted per this task's docs-artifact constraint.

No other deviations. Tasks 1, 2, and 4 executed as specified in the plan with no auto-fixes needed — all gates passed on the first attempt.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this task's changes.

## Threat Flags

None. This task changes only which Tauri config key a set of already-shipped files is copied through; it introduces no new network endpoints, auth paths, or trust-boundary schema changes.

## Issues Encountered

- The Epic login blank page (observed during Task 3's checkpoint attempt) is very unlikely to be caused by this task but remains undiagnosed. Flagged for re-check on a home network in a future session; not investigated here since it falls outside this task's scope (config-key routing of already-shipped files, not the Epic login flow).
- `steam_api.pdb`/`steam_api_shim.lib` (~2.7 MB) remains an open item in the 2026-08-28 bundle-size todo, explicitly out of scope for this task. The todo stays in `.planning/todos/pending/`.

## Next Phase Readiness

- The macOS bundle-size todo's Cause 3 is closed; the only remaining open item in that todo is the `steam_api.pdb`/`steam_api_shim.lib` (~2.7 MB) Windows-build-byproduct cleanup, which needs a `buildSteamBridgeShims.ts` compile-flag change in a future task.
  **Annotation 2026-09-01 (quick-260901-kl2): the compile-flag prediction was REFUTED by measurement.** No `zig cc` flag suppresses both byproducts — `-g0` suppresses neither, `--strip` is not a valid driver flag, `-Wl,-s` drops the `.pdb` but rewrites 455,308 bytes of the DLL, and `-Wl,--out-implib` redirects only the `.lib` while still perturbing the DLL. The item was closed by a post-compile-gate unlink instead.
- legendary and nile UI-level library re-sync verification (blocked by Epic-on-work-network and no-owned-Amazon-games respectively) should be re-attempted on a home network before this fix is considered fully UI-verified end-to-end; the direct-execution/mutation-proof evidence stands in the interim as proof the fix itself is correct.

---

*Task: quick-260901-e7o*
*Completed: 2026-09-01*

## Self-Check: PASSED

All three task commits (`65a2a0d84`, `43a4971cf`, `f64bd8f69`) confirmed present in `git log --oneline --all`. All seven referenced files (`src-tauri/tauri.macos.conf.json`, `meta/verifyRunnerBundle.ts`, `meta/__tests__/verifyRunnerBundle.test.ts`, `src/backend/__tests__/packagingConfig.test.ts`, the 2026-08-28 bundle-size todo, `260901-e7o-MEASUREMENTS.md`, this file) confirmed present on disk.
