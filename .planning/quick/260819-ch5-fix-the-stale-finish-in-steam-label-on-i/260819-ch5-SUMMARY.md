---
phase: quick-260819-ch5
plan: 01
subsystem: ui
tags: [i18n, steam, gamepage, react-i18next, jest]

requires:
  - phase: 23
provides:
  - "gamelib:steam.status.resumeInstall / resumeInstallHint fork-owned i18n keys"
  - "steamResumeCopyCensus.test.ts repo-wide residual stale-copy census gate"
affects: [gamepage-ui, steam-install-labels]

tech-stack:
  added: []
  patterns:
    - "gamelib: namespace-prefixed keys for fork-owned copy on gamepage-bound t() calls"
    - "Filesystem-enumerated census gate (stripSourceComments + non-vacuity check) over a per-file assertion, for defects that recur across sibling call sites"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/__tests__/steamResumeCopyCensus.test.ts
  modified:
    - public/locales/en/gamelib.json
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/hooks/constants.ts
    - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamIncomplete.test.tsx
    - src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "New keys, not edited t() defaults — status.steamFinishInSteam already existed in gamepage.json, so editing the inline default alone would have been a silent no-op at runtime (repo's ledgered trap)."
  - "status.steamFinishInSteam stays in gamepage.json as a deliberately dead key; i18nCatalogChurnGuard forbids editing/deleting upstream-owned catalogs, and steamResumeCopyCensus.test.ts pins its continued presence so it cannot be 'cleaned up' later."
  - "hasStatus.reconcile.test.ts's fakeT (a defaults-returning mock) was replaced with the shared makeFaithfulT('gamepage') — it sat outside labelSuiteI18nCensus's scan directory and would have stayed green through the catalog change without ever measuring the rendered string."
  - "steamResumeCopyCensus.test.ts exempts one specific negated-assertion shape (`.not.toContain('Finish in Steam')`, the Task 2 regression pin) from its literal-string check, via a narrow regex, so the pin and the census can coexist without the census flagging its own safety net; a sentinel test proves the exemption does not blind the gate to a real positive occurrence."

requirements-completed: [QUICK-260819-CH5]

metrics:
  duration: ~20min
  completed: 2026-08-19
---

# Quick 260819-ch5: Fix the stale "Finish in Steam" label Summary

**Retired the stale "Finish in Steam" copy at all three GamePage render sites (button, status line, card/list label), repointing them at two new fork-owned `gamelib:steam.status.*` keys, converting both existing test suites to measure the rendered catalog value, and adding a repo-wide census gate that fails if any residual call site resurfaces.**

## Performance
- **Duration:** ~20 min
- **Started:** 2026-08-18 (session start)
- **Completed:** 2026-08-19T09:12:29+12:00
- **Tasks:** 3/3 completed
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- All three independent render call sites (`MainButton.tsx`'s primary button, `GameStatus.tsx`'s explanatory status line, `constants.ts`'s `getStatusLabel` feeding the game card/list/submenu) now render "Resume Install" / "Install incomplete — resume the download in GameLib" instead of "Finish in Steam".
- Two new keys added to the fork-owned `public/locales/en/gamelib.json` catalog (`steam.status.resumeInstall`, `steam.status.resumeInstallHint`); `gamepage.json` untouched, keeping `i18nCatalogChurnGuard` clean.
- Both suites that previously asserted the old copy now measure the RENDERED catalog value rather than an inline `t()` default — closing a real gap in `hasStatus.reconcile.test.ts`, whose `fakeT` sat outside `labelSuiteI18nCensus`'s scan scope.
- New `steamResumeCopyCensus.test.ts` census gate scans ~970 `.ts`/`.tsx` files under `src/` and fails on any non-comment occurrence of `steamFinishInSteam` or the literal "Finish in Steam" outside the one known regression pin.
- `steam-waiting-for-restart` and `steam-paused` copy/semantics verified unchanged throughout.

## Task Commits
Each task committed atomically:
1. **Task 1: Add the fork-owned keys and repoint all three render sites** - `fa4d718be` (feat)
2. **Task 2: Convert both existing suites to measure the RENDERED string** - `5e48a76bd` (test)
3. **Task 3: Add a repo-wide residual stale-copy census gate** - `d2cacab3d` (test)

**Plan metadata:** commit pending (docs: complete plan — orchestrator-owned)

## Files Created/Modified
- `public/locales/en/gamelib.json` - added `steam.status.resumeInstall` / `resumeInstallHint`
- `src/frontend/screens/Game/GamePage/components/MainButton.tsx` - primary button now renders `gamelib:steam.status.resumeInstall`; comment updated
- `src/frontend/screens/Game/GamePage/components/GameStatus.tsx` - status line now renders `gamelib:steam.status.resumeInstallHint`; comment updated
- `src/frontend/hooks/constants.ts` - `getStatusLabel`'s `notInstalled` branch now renders `gamelib:steam.status.resumeInstall`; comment updated
- `src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamIncomplete.test.tsx` - retargeted assertions/titles to "Resume Install"; added standing `not.toContain('in Steam')` regression pin
- `src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` - replaced defaults-returning `fakeT` with shared `makeFaithfulT('gamepage')`; repaired real-catalog assertions; added inline-default sentinel test
- `src/backend/storeManagers/steam/library.ts` - comment-only: updated two quoted-label references ("Finish in Steam" → "Resume Install")
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - comment-only: same quoted-label update
- `src/frontend/screens/Game/GamePage/components/__tests__/steamResumeCopyCensus.test.ts` (new) - repo-wide census gate with non-vacuity check, RED derivation from real source, and a catalog-pin block

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Census gate's literal-string check conflicted with Task 2's own regression pin**
- **Found during:** Task 3
- **Issue:** Task 2 deliberately added `expect(text).not.toContain('Finish in Steam')` to `MainButton.steamIncomplete.test.tsx` as a standing regression pin. Task 3's census gate, scanning `src/` for any non-comment occurrence of the literal "Finish in Steam", flagged that pin as an offender — the gate would have blocked itself from ever being green while the pin it depends on for a stronger guarantee still existed.
- **Fix:** Added a narrow `stripSafePins()` helper that strips only the exact known-safe negated shape (`.not.toContain('Finish in Steam')`) before matching, plus a sentinel test proving the exemption does not blind the gate to a real positive (non-negated) occurrence of the same string.
- **Files modified:** `src/frontend/screens/Game/GamePage/components/__tests__/steamResumeCopyCensus.test.ts`
- **Verification:** `pnpm test -- src/frontend/screens/Game/GamePage/components/__tests__` — all 14 suites, 192 tests pass.
- **Committed in:** `d2cacab3d` (Task 3 commit)

None otherwise — plan executed as written.

## Known Consequences (accepted, not defects)
- **Non-English locale bundles retain the stale translated copy** until the next translation sync. `gamelib.json` (the fork-owned English catalog) carries the new keys; other language files under `public/locales/` were not touched, per hard constraint 2 (`i18nCatalogChurnGuard` forbids editing any locale path outside `gamelib.json`/`gamelib.mt.json`). `pnpm lint-translations:gamelib` exits 0 with pre-existing (unrelated) ENOENT warnings for languages that have no `gamelib.json` at all — not caused by this change.
- **`public/locales/en/gamepage.json`'s `status.steamFinishInSteam` key remains, byte-identical to HEAD, as a deliberately dead key.** `i18nCatalogChurnGuard` forbids editing or deleting upstream-owned catalogs; `steamResumeCopyCensus.test.ts`'s catalog-pin block asserts this key's continued presence so a future agent cannot "clean it up" and trip the guard.

## Issues Encountered
None beyond the auto-fixed census/pin interaction above.

## Verification Performed
- `pnpm codecheck` — clean (0 errors).
- `pnpm lint --cache` — 0 errors, 3864 pre-existing warnings (none new, none in files touched by this plan beyond pre-existing patterns).
- `pnpm test -- src/frontend/screens/Game/GamePage/components/__tests__ src/frontend/hooks/__tests__` — 14 + 2 suites, all green.
- `pnpm i18n-churn-guard` — clean; `git diff --name-only -- public/locales/` lists `gamelib.json` only.
- `pnpm lint-translations:gamelib` — exits 0.
- `pnpm test -- meta/__tests__` — 19 suites, 470 passed / 1 skipped (churn-guard live-tree block included).
- `grep -rn "steamFinishInSteam" src/` (excluding the census file itself and comments) — zero live occurrences.
- `git diff` inspected by hand for all 8 files — confirmed comment-only hunks in the two backend files, and no change to any `onClick`, `handleInstall`, `openSteamInstallOptions`, install-routing, or other backend executable line.

## Human Verification Still Needed
A dev app instance was reported running against this tree during planning. Per the plan's `<human-check>`: on a Steam game with an incomplete on-disk native install, confirm the primary button now reads **Resume Install**, the status line beneath the title reads **Install incomplete — resume the download in GameLib**, and the game's card in the library list carries **Resume Install** — and that clicking still starts GameLib's own native depot download (unchanged behaviour). This executor did not perform that live check (no instructions were given to interact with a running app instance); it is called out here for the user/orchestrator to confirm via hot reload.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
No blockers. This is a self-contained copy fix; no downstream phase depends on these exact key names beyond the census gate itself, which will catch any future regression automatically.

---
*Phase: quick-260819-ch5*
*Completed: 2026-08-19*

## Self-Check: PASSED

All 9 files created/modified by this plan verified present on disk; all 3 task commit hashes (`fa4d718be`, `5e48a76bd`, `d2cacab3d`) verified present in `git log`.
