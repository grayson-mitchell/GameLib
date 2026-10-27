---
quick: 261027-tot
status: complete
live-gate: partial (client row passed 2026-10-28; bottle row pending)
commits: [2a9e1a0dd, c5c22158d, ec864ad2b]
---

# Quick 261027-tot: Steam client / bottle setup downloads visible in Downloads

First-run Steam setup payload fetches now push `steamSetupDownloadProgress` and render as a "Setup" section in Downloads; installs diverted because the Steam client is not installed or never launched are deferred instead of recorded as finished errors.

## Commits
- `2a9e1a0dd` Task 1: backend push, wiring, deferral
- `c5c22158d` Task 2: frontend Setup section, en strings
- `ec864ad2b` Task 3: 48 locales, mt manifests, fill record, todo closed

## Verify results
- Task 1: jest (setupDownloads, clientSetup, bottle, games, downloadmanager, preload) 17 suites green after one fix (below). `pnpm codecheck` FAILS on a pre-existing error not from this task: `__tests__/anonymousClient.test.ts` imports `../anonymousClient`, which does not exist (HEAD commit 061c9bd38 "test(54-01): anonymous PICS client (failing)", Phase 54 RED). No other tsc errors; `tsc -p tsconfig.meta.json` clean. No bare `downloadFile({` left in clientSetup.ts / bottle.ts (0). Prettier check clean on all written src paths; eslint 0 errors (only pre-existing warnings).
- Task 2: jest DownloadManager + state 25 suites / 321 tests green; i18n-churn-guard clean; en has exactly the 3 keys; baseline untouched; prettier + eslint clean (one unused `React` import removed). codecheck: same pre-existing anonymousClient error only.
- Task 3: lint-translations jest suites (4) 269 green; `lint-translations:gamelib` exit 0, 0 hard failures (1632 findings = baselined, unchanged); churn guard clean; planning-gates 12/12; baseline byte-identical to HEAD; 49 gamelib.json contain `steamBottle`, 48 mt manifests list the keys; todo in completed/ with Closed section. Prettier: de gamelib.json, de gamelib.mt.json and the todo all `"ignored": true`, check omitted. The fill record is under `.planning` (ignored).
- i18n: 144/144 pairs pass `validateTranslation`; sabotage control (value dropping `Steam`) rejected ("drops or alters glossary term Steam"). Only en-identical value: `nb_NO steamBottle` ("Steam for CrossOver"; "for" is the Norwegian word too, legitimate). Translations authored in session (no machine-fill key used).

## Deviations
- [Rule 3] bottle.test.ts broke (9 tests, provisionBottle returned error) because the real `ipc` module loaded via setupDownloads.ts. Chose the narrower fix: `jest.mock('../../../ipc')` in bottle.test.ts, rather than mocking `../setupDownloads`. clientSetup.test.ts already mocked ipc; no change.
- TDD ordering: setupDownloads module and its test were written in one step (not a separate RED run); the games.test deferral tests were added after the games.ts change and were not run against pre-change code. No separate test/feat commits.
- Mt manifests: `keys` arrays are not globally sorted, so keys were inserted at their sorted position rather than re-sorting the whole array (avoids a 96-file reorder diff).

## Behaviour coverage notes
- Deferral tests: native route (needs-install, needs-launch), bottle-native route (needs-launch), bridge route (needs-install; also asserts no `markBridgeFailedThisSession` by showing a second install() still reaches the bridge download), invalid-appId-with-error stays an error. The `markForcedWindowsViaBottle` guard on the bottle-native route (`!deferredToSetup`) has no dedicated test: forcing that path needs the D-17 override args the existing harness does not set up cheaply.
- Accepted limitation: setup rows exist only for pushes received after the frontend store module loaded; downloadFile re-emits about 1/s, so a late view fills in within about a second.

## Known stubs
None.

## Operator live gate (client half PASSED 2026-10-28; bottle half pending)
**Client half: pass.** Run on the operator's Mac 2026-10-28 from the worktree dev build, with `/Applications/Steam.app` moved to the Trash. Install showed the guided-setup consent dialog, not the old "Steam client not ready for appId" error. After consent the Downloads view showed the "Steam client installer" row with advancing bytes (operator confirmed). Avernum 5 then installed to completion over the bridge. A first attempt failed with "Bridge shim has not been built yet": the fresh worktree lacked the gitignored `public/bin/arm64/darwin` bridge DLLs. That was a worktree build gap, fixed by `pnpm build-steam-bridge`, not a defect in this change.

**Bottle half: pending.** It needs a bottle-only title (e.g. Avernum 6, 206060) on a profile with no provisioned CrossOver bottle. Expect the row "Steam for CrossOver". Removing Mac Steam is not needed for this half.

## Deferred
- Pre-existing `pnpm codecheck` failure from Phase 54 RED test (anonymousClient); owned by the Phase 54 session.
