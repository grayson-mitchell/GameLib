---
status: complete
quick_id: 261110-ugu
---

# Quick 261110-ugu: import-time mirror reads moved post-hydration

Moved the remaining module-scope mirror reads (settings: hideChangelogsOnStartup, experimentalFeatures, focusRow; auth: dismissedSignInNotices; library: gameOverrides) into `readInitialSettings/Auth/Library()`, with `readFocusRowMirrorSeed()` replacing the import-time seed. CR-01 now fires only when the hydrated mirror lacks `focusRow`. Boot libraries receive the hydrated overrides.

## Commits
- cac3c5ba3 fix: code + tests (Tasks 1 and 2 combined)
- docs commit: todo moved to completed/ with Resolution

## Deviations
- Tasks 1 and 2 committed as one commit: the initStateSubscriptions test file carries cases for both, so splitting would leave an interim red commit.
- Rule 3: `FocusRowMirrorSeed` is not exported, so `readFocusRowMirrorSeed` is typed via `ReturnType<typeof seedFocusRowFromMirror>` (avoids touching common/).
- Existing tests that preloaded the store's `gameOverrides`/dismissed set before calling `readInitialLibrary`/boot (libraryState.test, GlobalStateSteamCacheHydration.test, GlobalStateSignInMount.test) were updated to seed the mirror instead, since readInitial now overwrites from the mirror. The initStateSubscriptions harness gained a `storeHas` branch (CacheStore needs it).

## Verification
- `npx jest src/frontend/state`: 500/500 pass. `pnpm codecheck` and `pnpm planning-gates` green. eslint 0 errors (pre-existing warnings). Prettier clean on all touched paths.
- `grep globalSettingsAtImport|focusRowMirrorSeed src/` empty.
- Ordering: index.tsx hydrate await (~145) precedes `initStateSubscriptions()` (265).
- RED was not run separately before GREEN (tests and code written together); anti-vacuity self-test included.
