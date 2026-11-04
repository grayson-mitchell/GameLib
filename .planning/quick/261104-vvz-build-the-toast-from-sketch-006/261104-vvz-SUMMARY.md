---
status: complete
quick_id: 261104-vvz
commits: [30ccb0b5f, 15bf076cb]
---

# Quick 261104-vvz: SteamEngineLaunchNotice to sketch 006 variant A

Both notices now render in one fixed bottom-right stack, with per-cause icons, title and body, a pausable hairline countdown, slide and fade motion, and an exit lifecycle (in, leaving, collapsing, removed).

## Commits
- 30ccb0b5f: TSX lifecycle, hover-pausable timer, overlay focus gating, fallbacks, tests, i18n keys, presence baseline
- 15bf076cb: SCSS (variant A surface, keyframes, slot collapse, bar, reduced-motion)

## Gates run
- `npx jest src/frontend/components/UI/SteamEngineLaunchNotice`: PASS (18/18)
- `npx jest meta/__tests__/hardcodedStringGate.test.ts`: PASS (176/176), after fixing a first failure
- `npx jest src/frontend/screens/Login/__tests__/loginCrossfade.test.ts`: PASS
- `pnpm lint-translations:gamelib`: PASS (0 hard failures)
- `pnpm i18n`: only `public/locales/en/gamelib.json` changed (the 4 intended keys)
- `pnpm i18n-churn-guard`: PASS (clean)
- `pnpm codecheck`: PASS
- `npx eslint` on the TSX and test: 0 errors, 6 warnings (5 react-hooks/exhaustive-deps from the deliberate seq/phase-keyed deps, 1 no-unsafe-argument in the test)
- `npx prettier --check` on the tsx, scss, test and baseline: PASS
- `npx vite build`: PASS. SCSS has no 4.5rem and no hex colours, and all 7 keyframes exist.
- `graphify update .`: run

## Deviations
1. [Rule 1] The hardcoded-string gate flagged the class-name literals in the toast's modifier ternaries (4 violations). I hoisted them into `TOAST_*` constants. The gate is not widened and the exempt marker is untouched.
2. The presence baseline regeneration also added `settings.navbar.run` and `steam.engine.wineTabHint`. Those were already missing from the baseline before this task and are unrelated to it. Regenerating includes them, so the baseline is correct, but the diff is wider than the 4 new keys.
3. Tests were written together with the implementation, not strictly RED-first.
4. The old toast leaf keys are kept, because the backend notification uses them.

## Not done
The manual `pnpm tauri:dev` visual verification is not done (non-blocking per the plan). It still needs a live check: slide motion, hover pause, the overlay frozen bar, store-embed behaviour, Reduce Motion, and themes.

## Self-Check: PASSED
