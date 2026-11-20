---
phase: quick-261029-s5l
plan: 01
status: complete
commits: [58d0adbdb, de9425ef7]
---

# Quick 261029-s5l: Prompt Steam re-sign-in on install when no refresh token is stored

Native Steam installs are now gated on the latched `expired` sign-in state (`steamConfigStore.credentialsMissing`). The Steam install dialog shows a sign-in-required notice with a `Sign in to Steam` action and a disabled Install button.

## Commits
- 58d0adbdb: helper `steamInstallSignIn.ts`, gate in `startSteamQuickInstall`, tests (S1-S5, G1-G3), and an `electronStores` mock added to 4 suites that now import it transitively.
- de9425ef7: SteamDialog notice, `Sign in to Steam` action, Install disabled via the single existing `disabled=` term, `steamDialogSource` test, two `gamelib.json` keys.

## Verification (observed)
- Full Frontend jest project: 4573 passed, 1 failed. The failure is `steamInstallOptionsEntry.test.ts` C3 (GameCard source gate). GameCard is untouched and clean in git, so it is pre-existing and unrelated.
- `tsc --noEmit`: clean. eslint on the changed source files: clean. prettier: clean on all code paths.
- `gamelib.json` key check: `keys ok`. The file was clean before the edit; only my 2 lines were committed.
- `pnpm planning-gates`: 12/12 passed.

## Deviations
- [Rule 3] Four suites (`consoleSteamTarget`, `MainButton.importDemotion`, `MainButton.installClickRouting`, `MainButton.steamSplitButton`) failed at import after `InstallGameModal` pulled in `electronStores`. Added the same `jest.mock`; no assertion changed (as planned in Task 1 step 4).
- [Rule 3] `steamDialogSource.test.ts` forbids the substring `frontend/helpers` in the dialog. The helper is therefore imported by relative path (`../../../../../helpers/steamInstallSignIn`). The gate's intent (no generic `install()` or `writeConfig`) is not affected.

## Deferred
- Dev vault location: new pending todo (human decision).
- Live-gate preflight: already exists as PC12 in 56-33-LIVE-GATE.md.

## Uncommitted planning files
- Moved (staged rename): `.planning/todos/pending/...no-refresh-token.md` to `.planning/todos/completed/` with a `## Resolution` section.
- Created: `.planning/todos/pending/2026-10-29-dev-secret-vault-lives-in-os-temp-and-can-lose-the-steam-token.md`.
- This SUMMARY.md.
