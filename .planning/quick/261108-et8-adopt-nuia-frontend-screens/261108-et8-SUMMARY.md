# Quick 261108-et8 Summary

## Task 1
status: complete

- Scope: src/frontend/screens/Settings (127 sites -> 0). screens bucket 335 -> 208, baseline lowered to 208. No drift commit needed.
- Helper: created src/frontend/screens/__tests__/fixtures/indexed.ts (copy of components' `defined`, `at`); import via relative path.
- Source changes (no behaviour change for valid data): CustomWineProton `customWinePaths[0] ?? ''`; WineVersionSelector `find` + guard, only-wine guard; CategorySettings `list[cat]?.includes`; WinetricksSettings/index `if (!line) continue`.
- Test `!` removed in removeEosOverlayConfirmation (defined(...onClick)()). jest Settings 34 suites pass; codecheck, boundaries, scoped prettier green; eslint 0 errors (pre-existing warnings).

## Task 2
status: complete

- Commit f84cd9bc7. Scope: screens/Library + screens/Game (110 sites in 35 files -> 0). screens bucket 208 -> 104, baseline lowered to 104. No drift commit needed.
- Helper reused: screens/__tests__/fixtures/indexed.ts (`defined`, `at`).
- Source (valid-data behaviour unchanged): InstalledInfo `split('-')[0] ?? wine`; ReleaseDate `match[1] ?? date`, `for...of` over entries, `convertDate(releaseDate ?? '')` (previously would throw on an entry with no ': '); GOG modal `firstBuild = newBuilds[0]; if (firstBuild)` replaces the length check, and `getPreferredInstallLanguage(...) ?? installLanguage` (also in DownloadDialog); FocusRowStrip `RunnerToStore[..] ?? ''`; BuildSelector/DLCDownloadListing guard on the first/indexed element; DownloadDialog `filter()[0]` -> `find()` typed `GameStatus | undefined` (all uses already `?.`); SideloadDialog `platformIcon` uses `find` and returns null when no icon (FontAwesomeIcon renders nothing for an undefined icon anyway). No hook added, moved or made conditional.
- Tests: `at`/`defined` for element-then-member and regex capture sites; `?.` only under toBe/toBeNull/toEqual/toMatch/toContain matchers; useMemo mocks restructured to return the fresh slot. Removed one pre-existing `!` (steamBottleSetupSeeding exec).
- Gates: jest screens/Game + screens/Library 93 suites pass; codecheck, boundaries, scoped prettier green; eslint 0 errors; no added `!`/widening cast; find-deadcode names no touched file.

## Task 3
status: complete

- Commit 0006f38e8. Scope: remaining screens sites (104 -> 0): 24 test files + 14 source files. Baseline is now `{}`; `src/frontend/screens` appended to ADOPTED_BUCKETS and the exact ratchet-test assertion; todo (kept in pending/) lists 0 remaining, next step quick 261108-et9 (enable flag, retire ratchet). No drift commit needed.
- Helper reused: screens/__tests__/fixtures/indexed.ts (`defined`, `at`).
- Source (valid-data behaviour unchanged): `?? f`/`?? ''`/guards on ConfirmDialog, ConsoleMode hooks/index/InstallOverlay (setFocused only when a row exists), Accessibility, Discounts helpers, StoreSearch, Login, WineManager; `STORE_EXIT_ROWS.targets` typed as a non-empty tuple; WebView `let startUrl = urls[pathname] ?? ''` (source-census tests anchor on the substring, still match). No hook changed.
- Tests: `at`/`defined` for element-then-member, regex captures and invocationCallOrder; useMemo mock restructured; no assertion weakened.
- Gates: ratchet PASS, codecheck, boundaries, planning-gates, scoped prettier green; eslint 0 errors; jest screens (57 suites) + ratchet test pass; no added `!`/widening cast; find-deadcode names no touched file. Todo is prettier-ignored (excluded from check).
