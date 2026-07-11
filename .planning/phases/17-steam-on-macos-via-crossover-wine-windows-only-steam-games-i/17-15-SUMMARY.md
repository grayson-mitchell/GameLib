---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 15
subsystem: infra
tags: [crossover, wine, steam, bottle-provisioning, gap-closure]

requires:
  - phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
    provides: provisionBottle()/isBottleReady()/isBottleProvisioned() foundation (17-02/17-04), 17-01 LOCKED cxbottle mechanism, 17-12 both-root resolver

provides:
  - "bottleWineArch() — reads cxbottle.conf and returns 'win32' | 'win64' | null"
  - "provisionBottle() creates NEW bottles with --template win10_64 (64-bit) instead of win10 (32-bit)"
  - "provisionBottle() detects an existing win32 bottle and deletes + recreates it as win10_64 BEFORE either idempotent guard can reuse it"
  - "GameLib's Steam ACCOUNT auth (refreshToken/isLoggedIn/userData) is preserved across a win32->win64 recreate — only bottle state (provisioned) is reset"
  - "corrected spike/steam-bottle/FINDINGS.md LOCKED-CLI note + 17-04 note (win10_64, not win10)"

affects: [17-UAT, phase-17-verification]

tech-stack:
  added: []
  patterns:
    - "Pre-guard arch-detection before idempotent short-circuits: bottleWineArch() runs BEFORE isBottleReady/isBottleProvisioned so a stale win32 bottle can be recreated instead of being reused forever"
    - "cxbottle --delete --force + rmSync directory fallback for irreversible bottle recreation, argv-only (T-17-01 pattern reused for the new delete call)"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - spike/steam-bottle/FINDINGS.md

key-decisions:
  - "GAP-17-CEF-RENDER root cause confirmed: CrossOver's win10 template creates a 32-bit (WineArch=win32) prefix; modern 64-bit Steam's CEF steamwebhelper composites the install dialog at 0x0 inside a win32 prefix, rendering a grey unresponsive bar. Fix: create with win10_64 going forward, and detect+recreate any existing win32 bottle."
  - "Recreate branch resets ONLY steamBottleConfigStore 'provisioned' to false — refreshToken/isLoggedIn/userData (Steam ACCOUNT auth) are never touched. Bottled-client login lives inside the Wine prefix, so re-login after a win32->win64 recreate is inherent and expected."
  - "The win32 recreate check runs even when the stale bottle 'looks ready' (conf + steam.exe both present) — win64 idempotency and win32 recreation are mutually exclusive on the SAME arch check, avoiding an infinite reprovision loop (T-17-15-01)."

patterns-established:
  - "bottleWineArch() as the canonical pre-guard signal for any future bottle-recreate-on-detected-drift logic in this module"

requirements-completed: [MACSTEAM-02, MACSTEAM-04]

duration: ~20min
completed: 2026-07-11
---

# Phase 17 Plan 15: GAP-17-CEF-RENDER Gap Closure Summary

**Fixed the bottled Steam install dialog rendering as a grey 0x0 bar by switching the CrossOver bottle create template from the 32-bit `win10` to the 64-bit `win10_64`, and added a pre-guard that detects and recreates any existing 32-bit bottle before the idempotent guards can reuse it — Steam account auth untouched.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 completed
- **Files modified:** 3

## Accomplishments

- `provisionBottle()` now creates all NEW bottles with `--template win10_64`, producing a genuine 64-bit (`WineArch = win64`) prefix so modern Steam's CEF-based install dialog composites correctly instead of rendering at "0 x 0".
- New `bottleWineArch(bottleName)` helper reads `cxbottle.conf` defensively (try/catch, no throw) and returns `'win32' | 'win64' | null`.
- `provisionBottle()` inserts a new step BETWEEN "persist identity" and the `isBottleReady` short-circuit: if the bottle exists and is detected as `win32`, it is deleted (`cxbottle --delete --force`, with an `rmSync` directory-removal fallback if `cxbottle.conf` lingers), only `provisioned:false` is reset, and execution falls through to the create-guard, which rebuilds the bottle fresh as `win10_64`.
- A ready `win64` bottle still hits the existing `isBottleReady` short-circuit unchanged — no needless delete/recreate.
- `spike/steam-bottle/FINDINGS.md` LOCKED (CLI) line and the "Note for 17-04" paragraph corrected to reflect `win10_64` and the GAP-17-CEF-RENDER root cause (the prior note wrongly claimed the win10 32-bit prefix was compatible with 64-bit Steam).

## Task Commits

1. **Task 1: Create 64-bit bottles + detect/recreate an existing win32 bottle** - `72d1ca74` (fix)
2. **Task 2: Unit-test the win10_64 template, win32 recreate (auth-preserving), and win64 idempotency** - `4a47469d` (test)

_Note: worktree mode — STATE.md/ROADMAP.md updates are owned by the orchestrator after merge; this plan's metadata commit only covers SUMMARY.md (and REQUIREMENTS.md if applicable)._

## Files Created/Modified

- `src/backend/storeManagers/steam/bottle.ts` — added `readFileSync`/`rmSync` imports, `bottleWineArch()` helper, the win32 detect/delete/recreate pre-guard step in `provisionBottle()`, and changed the create-template argument from `'win10'` to `'win10_64'`.
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` — mocked `readFileSync`/`rmSync`; added a `bottleWineArch` describe block (win32/win64/null/absent); extended the `provisionBottle` describe block with 3 new tests (win10_64 template regression guard, win32 recreate with auth-preservation assertions, win64 idempotent short-circuit).
- `spike/steam-bottle/FINDINGS.md` — corrected `LOCKED (CLI)` line and "Note for 17-04" to `win10_64` + GAP-17-CEF-RENDER rationale.

## Decisions Made

- Confirmed GAP-17-CEF-RENDER root cause: `win10` is CrossOver's 32-bit template; a win32 prefix breaks modern 64-bit Steam's CEF UI (steamwebhelper "Invalid browser dimensions: 0 x 0"). `win10_64` is the corrected, locked create template.
- The recreate pre-guard fires even when the win32 bottle "looks ready" (both `cxbottle.conf` and `steam.exe` present) — it must run BEFORE `isBottleReady`'s short-circuit, otherwise a fully-installed-but-32-bit bottle would never be recreated.
- Only `steamBottleConfigStore.set('provisioned', false)` is called during recreate. `refreshToken`/`isLoggedIn`/`userData` (Steam ACCOUNT auth, separate from bottle state) are never written or cleared — unit-tested via explicit `not.toHaveBeenCalledWith` assertions (T-17-15-02).

## Deviations from Plan

None — plan executed exactly as written. Both tasks matched the `<action>` and `<behavior>` specifications in 17-15-PLAN.md precisely.

## Issues Encountered

- The plan's automated acceptance command `npm test -- --testPathPattern=steam/bottle` returns "No tests found" in this repo — Jest's `testPathPattern` requires a contiguous path substring match, and the actual test file lives at `src/backend/storeManagers/steam/__tests__/bottle.test.ts` (the `__tests__` segment breaks the literal `steam/bottle` substring). This is a pre-existing quirk of the repo's test file layout, unrelated to this plan's code changes, and would affect the identical acceptance command for any `steam/*` test file. Verified instead with `npm test -- --testPathPattern=bottle` (62/62 tests pass, including all new coverage) and a full-suite run (`npm test`: 49 suites / 962 tests, exit 0). `npm run codecheck` (`tsc --noEmit`) also exits 0.
- Full-suite run surfaced one unrelated stray stack trace after test completion, from a leaked timer in `src/backend/storeManagers/steam/library.ts` (`pollInstallOnce` -> `readAcfState` -> `getSteamLibraries()` returning undefined post-teardown). This is a pre-existing issue in a file untouched by this plan (out of scope per the deviation rules' scope boundary — not fixed here); the overall test run still reported `Test Suites: 49 passed, 49 total` / exit 0.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- GAP-17-CEF-RENDER is closed at the code level: new bottles are created 64-bit, and any existing win32 bottle self-heals to win64 on the next `provisionBottle()` call, preserving Steam account auth.
- Ready for the pending human macOS + CrossOver UAT resume (17-07 Task 2, steps 2-7) to confirm the install dialog renders and the Install button is clickable on real hardware with a freshly recreated bottle.
- No frontend changes; the 17-12 both-root resolver (`resolveBottleSteamRoot`) is untouched and remains belt-and-suspenders for path resolution under either prefix layout.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/bottle.ts (modified, task 1 commit 72d1ca74)
- FOUND: spike/steam-bottle/FINDINGS.md (modified, task 1 commit 72d1ca74)
- FOUND: src/backend/storeManagers/steam/__tests__/bottle.test.ts (modified, task 2 commit 4a47469d)
- FOUND: commit 72d1ca74 in git log
- FOUND: commit 4a47469d in git log
