# Quick 261101-h8l: Make the pre-push gate pass - Summary

The `.husky/pre-push` line 2 chain now exits 0 on main. Lint is at 0 errors in both scopes: production 1121 warnings (ceiling 1130) and tests 610 warnings (ceiling 648). Nothing was pushed.

## Commits
- `84128935c` fix(lint): clear pre-push lint errors, dead exports and gamepage.json key order
- `3b09e3e26` test(lint): bring test-scope lint warnings under the ceiling

## What changed
- **Lint errors:**
  - Removed the unused `CallbackLayoutName` type from `meta/msvcCallbackLayout.ts`.
  - `networkingLocalHost.test.ts` now reads the manifest with `readFileSync` and `JSON.parse`, typed, with no `require` and no disable comment.
  - `SteamBridgeInviteDialog.test.tsx` and `tauriNativeGamepad.test.ts` use `jest.requireActual`. The fallback disable comment was not needed and none was added; the suites pass unchanged (17 and 37 tests).
- **Dead exports:**
  - Dropped `export` on `matchRule`, `licensedNotOwnedAppIds`, `ReportDiagnosticsInput`, `SubmitResult`, `WEB3FORMS_ENDPOINT`, `SteamBridgeInviteLoad` and `DXMT_REQUIRED_MACDRV_SYMBOLS`.
  - Deleted `isSameDevice` outright, since it was wholly unused.
  - `dxmtExportGate.test.ts` only names `DXMT_REQUIRED_MACDRV_SYMBOLS` inside a `jest.mock` factory, so it needs no `ts-prune-ignore`.
- **i18n:** `gamepage.json` is the already re-sorted file from the working tree. `pnpm i18n --fail-on-update` exits 0. The file is prettier-ignored, so it is not in the prettier check.
- **Test warnings, 714 to 610:**
  - `require-await`: converted `async` mocks with no `await` to `Promise.resolve(...)` in `engineDecision`, `drmLaunchSetup`, `depot`, `games` and `library` tests.
  - Skipped bodies containing `throw`, `it` callbacks, and `games.test.ts:327`, where a sync throw would change from a rejection.
  - `unbound-method`: used `jest.spyOn(SteamUser, 'X')` in `steamAuthFlows.test.ts`.
  - `library.test.ts`: merged the duplicate `electronStores` import, used `String(bytes)` in templates, and replaced `i18next.t` with the named `t` import. The mock exposes the same function on both, so semantics are unchanged.

## Verification
- The six touched suites pass with 1178 tests plus the 37 in `steamAuthFlows` (the 1178 run predated the `steamAuthFlows` and `library` edits). I did not record a pre-change test count, but no `it` blocks were added or removed.
- `eslint.config.mjs`, `meta/lintScoped.cjs` and the find-deadcode baseline are untouched.
- Prettier is clean on every edited path, and `git status` shows only the pre-existing dirty files.

## Deviations
None of substance. Plan Task 3 is verification only. One note: `git checkout -- <file>` triggered a pnpm install through a hook; it was harmless.

## Self-Check: PASSED
