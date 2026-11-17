---
status: complete
quick_id: 261117-omv
date: 2026-11-17
commits: [217d96cde, ddf6c21c2, 3dffe6d89, 4a8311fef]
---

# Quick 261117-omv: backend-di jestMock ratchet green again

`pnpm backend-di-ceilings` passes (`jestMock=1875 (449 files)`). No baseline was added or raised; the only ceiling change lowers three GameStatus entries from 7 to 6.

## Changes

- **217d96cde**: Jest maps `.css`/`.scss` to a new empty `src/frontend/__mocks__/styleStub.ts` (`src/frontend/jest.config.js`). The three GameStatus suites (`bottleWaiting`, `redistSpinner`, `steamUpdate`) no longer mock `react-router-dom` or `../../../GameContext`, so each goes from 8 mocks to 6. Their baselines in `meta/backendDiCeilings/frontend-screens-game.json` go from 7 to 6. The `../SteamUpdateInfo` stub stays because a test checks for it by identity. `AboutDialog.test.tsx` used to load the real stylesheet through `require.resolve`, which now hits the stub. It reads the file by path instead, with unchanged assertions.
- **ddf6c21c2**: `NoticeStackTwoToast.test.tsx` goes from 7 mocks to 0. It uses a real i18next instance and a `MemoryRouter`. The five login route constants move to a new `src/frontend/screens/Login/loginPaths.ts`, which `Login/index.tsx` re-exports, and `HumbleExpiryToast` imports them from there. That removes the need to mock the Login screen, whose `.png` import Jest can't load.
- **3dffe6d89, 4a8311fef**: `steamLoginPollLifecycle.test.tsx` goes from 4 mocks to 0. It now renders the real Dialog, the real auth store seeded with `steamLogin`, and the real QR code. `drawn()` matches the rendered QR svg against reference renders of each code. A new guard test checks that the reference markups are pairwise distinct, so the suite now has 23 tests. The todo moved to `todos/completed/` with a Resolution note. The two commits share one message because the first held only the rename.

## Verification

- `pnpm backend-di-ceilings`: PASS (re-run by the orchestrator).
- Full Frontend Jest project: 334 of 335 suites pass (5702/5703 tests). The one failure, `NavShell/__tests__/themeTokens.test.ts`, was already failing before the change.
- `tsc --noEmit` is clean, and scoped prettier is clean on the touched paths.

## Follow-up

- `humbleExpiryToastSuppression.test.tsx` still mocks `frontend/screens/Login`, but the mock no longer has any effect. Removing it, together with its baseline entry, would be a free reduction. That is out of scope here.
