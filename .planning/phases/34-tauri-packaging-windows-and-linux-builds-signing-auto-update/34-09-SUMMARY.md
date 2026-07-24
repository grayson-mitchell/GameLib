---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 09
subsystem: infra
tags: [tauri, nsis, windows, icon, packaging, jest]

# Dependency graph
requires:
  - phase: 34-05
    provides: tauri.conf.json bundle block (nsis/appimage/dmg targets, icon array) and the committed icons/ set minus icon.ico
provides:
  - Committed src-tauri/icons/icon.ico (real ICO, magic bytes 00 00 01 00)
  - bundle.icon in tauri.conf.json now references icons/icon.ico
  - tauriConf.test.ts regression guard: nsis-implies-.ico invariant, existsSync guard over every bundle.icon path, ICO magic-byte check
affects: [34-10, 34-11, release-tauri.yml windows-latest leg, live tag-push gate deferred from 34-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generate Tauri icons into a scratch dir with `tauri icon <input> -o <scratch>`, then copy only the specific artifact needed into src-tauri/icons/ -- never run `tauri icon` in place, it silently regenerates .icns byte-differently and churns unrelated committed assets"

key-files:
  created:
    - src-tauri/icons/icon.ico
  modified:
    - src-tauri/tauri.conf.json
    - src/backend/__tests__/tauriConf.test.ts

key-decisions:
  - "Confirmed via cmp that a fresh `tauri icon` regen produces a byte-different icon.icns from the committed one (all PNGs matched byte-for-byte) -- validates the plan's scratch-dir-then-copy-only-icon.ico approach as necessary, not just cautious"

requirements-completed: [REQ-34-01, REQ-34-02]

# Metrics
duration: 8min
completed: 2026-07-24
---

# Phase 34 Plan 09: Windows icon.ico (CR-02 gap closure) Summary

**Generated and committed a real Windows `.ico` from `public/icon.png` via `tauri icon -o <scratch>`, wired it into `bundle.icon`, and added a 4-test regression suite (nsis-implies-.ico invariant, existsSync guard over every icon path, ICO magic-byte check) that closes the CR-02 release blocker.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-24T07:07:00Z (approx)
- **Completed:** 2026-07-24T07:15:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `src-tauri/icons/icon.ico` committed — a real ICO (magic bytes `00 00 01 00`, 93,881 bytes), not a renamed PNG
- `bundle.icon` in `tauri.conf.json` now includes `icons/icon.ico`, placed after `icons/icon.icns`; the other five entries untouched
- `tauriConf.test.ts` grew a new describe block (`tauri.conf.json icon set (CR-02 -- nsis needs a Windows .ico)`) with 4 tests: array-contains check, nsis-implies-.ico conditional invariant, generalized existsSync guard over every `bundle.icon` path (catches the whole missing-icon defect class, not just this file), and an ICO magic-byte check that specifically rejects a renamed-PNG substitute
- RED-then-GREEN sequence followed the Wave-0 (34-01) convention: 3 of 4 new tests failed before Task 2, all 12 (8 pre-existing + 4 new) pass after

## Task Commits

Each task was committed atomically:

1. **Task 1: Add RED regression assertions for the Windows icon to tauriConf.test.ts** - `246cd65f` (test)
2. **Task 2: Generate and commit icon.ico, wire it into bundle.icon** - `bc9bd41c` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `src-tauri/icons/icon.ico` - Real Windows ICO generated from `public/icon.png` via `tauri icon -o <scratch-dir>`, then copied in isolation (nothing else in `icons/` touched)
- `src-tauri/tauri.conf.json` - Added `"icons/icon.ico"` to the `bundle.icon` array, directly after `"icons/icon.icns"`
- `src/backend/__tests__/tauriConf.test.ts` - New describe block with 4 tests guarding the icon set

## Decisions Made
- Verified by `cmp` that a `tauri icon` regen of the existing PNGs is byte-identical to the committed ones, but the regenerated `icon.icns` is byte-different from the committed one. This confirms the plan's instruction to generate into a scratch directory and copy only `icon.ico` was correct and necessary — running `tauri icon` in place would have silently churned `icon.icns`.

## Deviations from Plan

None - plan executed exactly as written. Task 1's RED output matched the plan's expectation (3 assertion failures + 1 trivially-passing existsSync check on the pre-existing five icons, since none of the entries in `bundle.icon` were missing from disk before `icon.ico` was added to the array).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Verification

- `npx jest --testPathPattern=tauriConf` — 12/12 green (8 pre-existing + 4 new)
- `xxd -l 4 -p src-tauri/icons/icon.ico` → `00000100`
- `node -e "const c=require('./src-tauri/tauri.conf.json'); if(!c.bundle.icon.includes('icons/icon.ico')) process.exit(1)"` → exits 0
- `git status --porcelain src-tauri/icons` → exactly one entry, the new `icon.ico`; no other icon file modified
- `git diff src-tauri/tauri.conf.json` → single added line in `bundle.icon`
- `npx jest --testPathPattern=releaseWorkflow` — 13/13 green (no collateral damage, confirms nothing in this plan touched CI)
- `git diff package.json` — empty (no new installs; used existing `@tauri-apps/cli` devDependency)

## Next Phase Readiness

CR-02 is closed. `34-10` (WR-01, release-reachable `GAMELIB_SIDECAR_ENTRY` override) and `34-11` (WR-02 `cert.pfx` cleanup, WR-03 sidecar-orphan-on-exit, and wiring `GAMELIB_SIDECAR_TARGET_TRIPLE` per matrix leg in `release-tauri.yml`) remain before the deferred live tag-push gate (REQ-34-04/REQ-34-09) can be safely re-run — the Windows leg of that run would have failed on this exact defect before this plan landed.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: src-tauri/icons/icon.ico
- FOUND: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-09-SUMMARY.md
- FOUND commit: 246cd65f (test task 1)
- FOUND commit: bc9bd41c (feat task 2)
- FOUND commit: 2e63ebb9 (docs summary)
