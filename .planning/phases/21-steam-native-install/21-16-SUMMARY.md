---
phase: 21-steam-native-install
plan: 16
subsystem: ui
tags: [steam, i18n, observability, logging, react, electron]

# Dependency graph
requires:
  - phase: 21-steam-native-install (21-01..21-15)
    provides: the native depot-download engine, the GameLib 1026-manifest handoff convention, the ACF install-poller (pollInstallOnce/readAcfState), and the statusContext plumbing already used by the redist-install label branch
provides:
  - Depot-selection observability logging (chosen depot ids + os/arch/language decision + per-depot skip reasons) with zero secrets
  - Poll-time detection of the GameLib 1026 handoff, surfaced as gameStatusUpdate context 'steam-waiting-for-restart'
  - A fire-once "Restart Steam to finish installing {{game}}" notification per install
  - "Restart Steam to finish" hint on the Library grid tile (via getStatusLabel) and the game detail page (GameStatus.tsx)
  - Cleaner active-install copy ("Installing…" instead of "Steam installing")
affects: [21-UAT, steam-native-install-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GameStatus.tsx's getInstallLabel() must be called WITH statusContext from BOTH the is.installing render branch and the !is.installing branch — a call site omitting the third arg silently makes any statusContext-reading branch inside the function unreachable whenever is.installing is true"
    - "Real (unmocked) getStatusLabel coverage in a file that globally jest.mock()s '../constants' (for deriveInstallStatusKind's sake) is achieved via jest.requireActual after stubbing global.window (this project's frontend jest env has no jsdom, and constants.ts touches window.localStorage at module scope)"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot/select.ts
    - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - public/locales/en/translation.json
    - src/frontend/hooks/constants.ts
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - public/locales/en/gamepage.json
    - src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts

key-decisions:
  - "GAMELIB_HANDOFF_STATE_FLAGS = 1026 named module-level constant in library.ts, tested via strict === (not a bitmask) since 1026 is the exact literal value GameLib itself writes on handoff, distinct from the bit-4 FullyInstalled bitmask test used elsewhere"
  - "notifiedWaiting is a sibling flag on the same activePolls entry as seenDownloading (not a separate Map/Set) — keeps the fire-once state co-located with the poll lifecycle it belongs to"
  - "GameCard/index.tsx needed zero code changes — it already renders getStatusLabel's output verbatim via hasStatus.ts's label field, so both the copy fix and the waiting hint reach the Library tile with no extra plumbing"
  - "Fixed a latent bug in GameStatus.tsx (Rule 1): the is.installing render branch called getInstallLabel() without its third statusContext argument, silently making the existing statusContext-reading is.installingRedist branch (and now the new steam-waiting branch) unreachable whenever is.installing was true. Fixed both call sites to pass statusContext."

requirements-completed: [SNI-03, SNI-06]

# Metrics
duration: ~30min
completed: 2026-07-16
---

# Phase 21 Plan 16: Steam Restart Hint + Depot-Selection Observability Summary

**Poll-time "Restart Steam to finish" hint on the Library tile + detail page for the GameLib 1026-manifest handoff, cleaner "Installing…" copy, and secret-free depot-selection logInfo (chosen depot ids + os/arch/oslist/language decisions)**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-16
- **Tasks:** 3/3
- **Files modified:** 9

## Accomplishments

- `select.ts` now logs the resolved selection decision (`os=... arch=... language=... branch=... -> depots [...]`) and a per-depot skip reason at each oslist/osarch/language filter — closing the exact observability gap that turned a UAT misdiagnosis into an hour-long investigation. Zero secrets (verified by test assertion, not just prose).
- `pollInstallOnce` distinguishes the GameLib handoff-waiting state (`StateFlags === 1026` exactly) from a genuine active download, emitting `context: 'steam-waiting-for-restart'` on the existing `gameStatusUpdate` (status stays `'installing'`, so no downstream wiring changes were needed) and firing a "Restart Steam to finish installing {{game}}" notification exactly once per install via a new `notifiedWaiting` flag.
- `getStatusLabel()` — the function that computes the Library grid tile's label — now branches on `statusContext`: the waiting hint for the handoff case, and "Installing…" (was the awkward "Steam installing") for the plain active-install case. The Library tile picks this up automatically since `GameCard` already renders `getStatusLabel`'s output verbatim.
- The game detail page (`GameStatus.tsx`) gained a matching steam-waiting branch, and a latent bug that would have made it (and the existing redist branch) unreachable was fixed in the same pass.

## Task Commits

1. **Task 1: Depot-selection observability logging (SNI-06, no secrets)** - `10ce366e` (feat)
2. **Task 2: Poll-time "waiting for Steam" signal + one-time notification (backend)** - `0dddae26` (feat)
3. **Task 3: Surface the hint on the Library tile + detail page and improve status copy (frontend)** - `3a3e3736` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/backend/storeManagers/steam/depot/select.ts` - `logInfo` of the chosen-depot decision (os/arch/language/branch + ids/gids/sizes) and per-depot skip reasons at the oslist/osarch/language filter branches; `selectAllDepots` logs the final base+DLC union count
- `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts` - mocks `backend/logger`; asserts selection output is unchanged (regression guard), the expected log lines appear, and no `logInfo` argument contains key/token/steamid/lastowner text
- `src/backend/storeManagers/steam/library.ts` - `GAMELIB_HANDOFF_STATE_FLAGS = 1026` constant; `activePolls` entries gain a `notifiedWaiting` flag; `pollInstallOnce`'s `'downloading'` branch emits `context: 'steam-waiting-for-restart'` and fires the one-time notify when `StateFlags === 1026`
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - new tests: 1026 → context emitted; non-1026 → no context; notify fires exactly once across repeated polls at 1026; notify never fires for non-1026 downloads
- `public/locales/en/translation.json` - added `steam.waitingForSteam.notify` (backend notify namespace)
- `src/frontend/hooks/constants.ts` - `getStatusLabel`'s steam `installing` branch now reads `statusContext`: waiting-hint copy vs. improved active-install copy
- `src/frontend/screens/Game/GamePage/components/GameStatus.tsx` - new steam-waiting branch ahead of the generic `is.installing` copy; fixed the `is.installing` render call site to actually pass `statusContext`
- `public/locales/en/gamepage.json` - `status.steamInstalling` → "Installing…"; new `status.steamWaitingRestart` → "Restart Steam to finish"
- `src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` - new `getStatusLabel (real implementation, T-21-16 waiting-hint + copy fix)` describe block, exercising the real (unmocked, via `jest.requireActual` + a stubbed `global.window`) `getStatusLabel`

## Decisions Made

See `key-decisions` in frontmatter. Summary: `1026` tested by strict equality (the exact literal GameLib writes, distinct from the bit-4 bitmask test used elsewhere in this file); `notifiedWaiting` co-located on the existing `activePolls` entry; `GameCard` required no changes since it already renders `getStatusLabel`'s output; a latent `GameStatus.tsx` bug (missing `statusContext` arg on one call site) was fixed inline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `GameStatus.tsx`'s `is.installing` render branch never passed `statusContext` into `getInstallLabel`**
- **Found during:** Task 3 (wiring the steam-waiting branch into `GameStatus.tsx`)
- **Issue:** `getInstallLabel` accepts an optional third `statusContext` parameter and the function's `!is.installing` call site passed it, but the `is.installing` call site (the one actually reached while a Steam install is in progress) called `getInstallLabel(gameInfo.is_installed, is.notAvailable)` with no third argument — so any statusContext-reading branch inside the function (the pre-existing `is.installingRedist` branch, and the new steam-waiting branch this plan adds) was unreachable specifically in the one case where `is.installing` is true. Since `status==='redist'` and `status==='installing'` are mutually exclusive, this bug had been latent/harmless for the redist branch (never both true at once) but would have silently broken the new steam-waiting-hint branch this plan requires.
- **Fix:** Passed `statusContext` as the third argument at the `is.installing` render call site too.
- **Files modified:** `src/frontend/screens/Game/GamePage/components/GameStatus.tsx`
- **Verification:** `npm run codecheck` clean; manual trace of the render path confirms `statusContext` now reaches `getInstallLabel` on both call sites.
- **Committed in:** `3a3e3736` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for the plan's own success criteria (detail-page hint must actually render); no scope creep — fixed inline, same file already being touched by Task 3.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-UAT-04's three UX/observability findings (no restart guidance, awkward copy, zero depot-selection logging) are closed at the code level. `21-UAT.md`'s real-hardware human verification tasks remain the gate for confirming this on an actual machine (a native depot download completing, the Library tile flipping to "Restart Steam to finish", restarting Steam, and confirming the badge flips to Installed) — out of scope for this plan per its `<verification>` block, which explicitly defers that to hardware UAT.
- All three verification commands from the plan pass: `npm run codecheck` clean; `npx jest src/backend/storeManagers/steam --silent` green (469/469); `npx jest src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts` green (9/9).
- Log-inspection acceptance criterion satisfied via test assertion (no key/token/steamid/lastowner substring in any `logInfo` call argument in `select.ts`), not just prose.

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-16*
