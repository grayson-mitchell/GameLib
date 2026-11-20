---
phase: quick-261116-swr
plan: 01
status: complete
commits: [2dc0c3522, 249495278, b2d0818b5]
---

# Quick 261116-swr: align Humble and read-only toasts with the Steam notice

Shared icon, text, title, body and action rules now live once in `NoticeStack/index.scss`. The Steam, read-only and Humble notices use them and keep their own classes as hooks only.

## Commits

- 2dc0c3522 feat: shared rules in the region sheet; Steam and read-only migrated; theme-token test reads shared rules (new action test, literal-colour scan covers Humble and read-only sheets); gate specimens re-anchored on the Steam bar.
- 249495278 feat: Humble toast on shared parts with split copy ("Humble Bundle session expired" / "Reconnect to keep your keys in sync.") and a "Reconnect" `.noticeStackAction` button; en catalog gets `humble_expired_title`, `humble_expired_body`, `humble_reconnect_short`, and `humble_expired_toast` is retired. `login.humble_reconnect` is untouched.
- b2d0818b5 test: gate extended to shared parts (`restylesSharedPart`, `missingSharedClasses`, two derived-specimen self-tests); `__gamelibNotices.readOnly()` and `.all()` added, `clear()` resets the read-only store; sketch reference updated.

## Decisions

- Decision 5 resolved as `align-items: flex-start` for the Humble root (a title+body block would float icon, X and button to the middle under `center`).
- The new keys stay in `translation.json` (en only; 48 locales fall back) with the existing Humble keys; no namespace move.

## Verification

- All scoped jest runs passed (last run: 8 suites, 105 tests). The Humble/gate/theme/hardcoded-string run: 5 suites, 215 tests.
- Sabotage: appending a Humble title rule made the gate fail; removing `noticeStackIcon ` from the read-only TSX made it fail; both files restored byte-identical (cmp) and the gate passes again.
- `pnpm i18n` run twice: `translation.json` byte-identical (shasum 0eb83315...). Only en/translation.json changed; no other locale drift. After the Task 2 commit `pnpm i18n` leaves `public/locales` clean and `pnpm i18n-churn-guard` reports clean (rc 0).
- Scoped prettier clean on all checked paths. ESLint: 0 errors; pre-existing warnings only (react-hooks/exhaustive-deps in SteamEngineLaunchNotice, no-floating-promises on `navigate` in HumbleExpiryToast).
- `grep status-warning` in the Humble and read-only dirs returns nothing.

## Not verified

The visual result is unverified live. The human check is still pending: run `pnpm tauri:dev`, then `__gamelibNotices.all()` in DevTools, and check shared icon size and accent colour, fonts, X, Humble top alignment with the accent-outlined "Reconnect" button (hover tint, focus ring), read-only body spacing, on a light theme and high-contrast too.

## Deviations

None of substance. Note: the first Task 1 verify attempt tripped on zsh word-splitting of a file-list variable; rerun with an array, no code impact.
