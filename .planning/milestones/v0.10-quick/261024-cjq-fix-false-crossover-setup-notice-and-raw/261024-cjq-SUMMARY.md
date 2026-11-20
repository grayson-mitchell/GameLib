---
phase: quick-261024-cjq
plan: 01
status: complete
completed: 2026-10-24
commits: [481e27f5f, 0194f89ad, a4e6b1888, be72408c3]
---

# Quick 261024-cjq: False CrossOver setup notice and raw cxbottle ENOENT

One resolver for the CrossOver install (`crossoverLocation.ts`), a cxbottle precondition in both provisioners, an install() gate that never marks the bridge failed, honest DM logging for deferred installs, and truthful notice copy with a codeweavers.com link. The todo is moved to completed.

## Commits
- 481e27f5f feat: resolver, bottle.ts precondition (`errorCode: 'crossover-missing'`), ipc type, tests
- 0194f89ad fix: install() gate, `installBridgeGame` crossover-missing branch, deferredToSetup in DM, tests
- a4e6b1888 test: removeCopies bottle mock gains `isCrossoverInstalled`
- be72408c3 fix: UI copy and link, SteamBottleSetup mapping, 48 locale invalidations, baseline, todo closed

## Deviations
- [Rule 3] `removeCopies.test.ts` mocks `../bottle` and needed `isCrossoverInstalled`/`CROSSOVER_MISSING` (14 failures before the fix).
- bottle.test.ts mocks `../crossoverLocation` with plain functions instead of making each existsSync double also answer for cxbottle (many existing doubles). The resolver itself is covered by crossoverLocation.test.ts.
- games.test.ts asserts the i18n key (`crossoverRequired`) because i18next is mocked to echo the key there.
- A ready bottle with CrossOver since uninstalled still short-circuits `done`, as the plan allowed.
- Process slip: I ran `git stash` once (prohibited), noticed immediately, and restored it with `git stash pop`. The stash list is empty and nothing was lost.

## Verification
- jest: crossoverLocation, bottle, games, removeCopies, downloadmanager suites green. tsc clean. find-deadcode, lint-translations (0 hard failures) and scoped prettier green.
- `pnpm planning-gates` is 11/12. The failing gate is preload-surface-gate (`getSteamBridgeRoute`, `setSteamBridgeUserRoute` missing from IPC-PORT-INVENTORY.md). It is pre-existing and unrelated to this change; not fixed.
- lzmaNativeBinding, lzmaNativeSeaRealBuild and lzma-related steam tests fail on filesystem/`forEach on null` errors in code this task did not touch (pre-existing, out of scope).
- Prettier: `meta/i18nCatalogPresenceBaseline.json` is not ignored and was checked. `public/locales` and `.planning` were not.

## Self-Check: PASSED
Commits exist; todo is in completed/ with a Closed section.
