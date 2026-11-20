---
phase: quick-261024-h5y
plan: 01
status: complete
commits: [b555c5926, c37ea6201, 6c5de4fc6]
---

# Quick 261024-h5y: Start Steam to finish for the bottled 1026 handoff

A bottle-route install parked at StateFlags 1026 now shows an enabled "Start Steam to finish" button, then "Show Steam" after dispatch. The native route is unchanged.

## What was built
- Backend (b555c5926): `library.ts` adds contexts `steam-waiting-for-bottled-steam` and `steam-finishing-in-bottled-steam`, plus `isAwaitingBottledSteamAdoption` and `markBottledSteamDispatched`. New `bottledHandoff.ts` has `startBottledSteamToFinishInstall`, which validates a numeric appId, refuses unless the bottle handoff poll is awaiting, is single-flight per appId, and dispatches via `tellBottledSteamToInstall`. A failed dispatch calls `notify`.
- IPC (c37ea6201): `steamFinishBottledInstall` is wired through the sidecar registration, preload, ipc types, the census (invoke 20 to 21) and IPC-PORT-INVENTORY (Totals 222 to 223 and 67 to 68, new section).
- Frontend (6c5de4fc6): MainButton, GameStatus and hooks/constants handle the two contexts. The install-options caret is hidden while the button is in this state. Seven `steam.bottle.finishInstall.*` keys (English) were added to all 49 `gamelib.json` files, +9 lines each. The todo was moved to completed/ with a closing note.

## Verification
- jest: bottledHandoff + library 244 pass; sidecar `__tests__` 1558 pass, 1 fail (pre-existing, see below); GamePage components + hooks 255 pass; Game + hooks 455 pass.
- `tsc --noEmit` clean.
- `pnpm planning-gates` 12/12 once the inventory edit was committed. Before the commit, the 34.4.1 "inventory has uncommitted changes" gate was RED, as it is by design.
- `pnpm lint-translations:gamelib` has 0 hard failures; it reports 1152 findings, which are other keys' missing translations. `pnpm i18n-churn-guard` is clean.
- prettier is clean on all touched code files. The IPC-PORT-INVENTORY.md and `public/locales/*/gamelib.json` are prettier-ignored, so they carry no check.
- eslint: 0 errors. The frontend files gained no warnings (16 before, 16 after). `library.ts`/`library.test.ts` went from 207 to 215 warnings: 6 are the repo-wide `import-x/no-named-as-default-member` rule on `i18next.t` (the same pattern the file already uses everywhere) plus 2 more. The new `bottledHandoff.ts` and its test add 4 more of the same `i18next.t` rule and `unbound-method` kind. I did not attempt to remove them. This is the one place I did not fully meet "no new warnings".

## Deviations
- A `git stash` ran by mistake during the lint-baseline comparison. I popped it immediately, and the stash list is empty with the working tree intact.
- Deferred, pre-existing: `src/backend/sidecar/__tests__/testContainment.test.ts` T-34.2-83 fails because `steamNativeInstallDefault.test.ts` (from 934ae58b8, quick 261024-exo) is unclassified. It is not from this task. Logged in `deferred-items.md`.

## Owed
Live verification on the Mac (XCOM 200510 bottled, cold and with bottled Steam already running).
