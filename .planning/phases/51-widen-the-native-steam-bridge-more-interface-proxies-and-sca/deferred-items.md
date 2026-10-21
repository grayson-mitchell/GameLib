# Deferred Items

Pre-existing/out-of-scope findings noticed during plan execution, logged per the
deviation-rules scope boundary (fix only what the current task's changes directly cause).

## 51-07: `node meta/findDeadcode.cjs` reports 20 new `used-in-module` findings

Run at close-out of 51-07 (after Task 2's GREEN commit): 20 new `used-in-module` exports not
in `meta/deadcode-baseline-used-in-module.txt`, across `meta/buildSteamBridgeShims.ts`,
`meta/downloadZig.ts`, `src/backend/storeManagers/steam/bridge/bridgeConfig.ts`,
`importParse.ts`, `interfaceVersions.ts`, and `shimCoverage.ts`.

None of these files are in 51-07's `files_modified` (`bridgeRoute.ts`, `shimGenerate.ts`,
their tests, `paths.ts`) — they land from earlier same-wave plans (51-01 through 51-06,
merged just before 51-07 per the dispatch note). Out of scope for this plan; not fixed here.
Surfacing so a later plan (or a dedicated `find-deadcode` sweep) picks it up.

## 51-10: three pre-existing test suite failures, confirmed unrelated via `git stash`

Running `pnpm jest meta/__tests__ src/backend/storeManagers/steam` at Task 2 close-out
surfaced 3 failing suites: `meta/__tests__/findDeadcode.test.ts` (same baseline drift as the
51-07 entry above, now also naming `meta/buildSteamBridgeShims.ts`'s pre-existing exports),
`meta/__tests__/hardcodedStringGate.test.ts` (6 hardcoded-string violations in
`src/frontend/screens/Game/GamePage/components/GameStatus.tsx`, a file 51-10 never touches),
and `meta/__tests__/genI18nGateScope.test.ts`.

Confirmed pre-existing and unrelated to 51-10: `git stash` (reverting every 51-10 working-tree
change back to the Task 1 commit) reproduces the identical 3-suite failure
(`Test Suites: 3 failed, 3 total`). None of the three touch `gen_vtables.ts`, `bridge_helper.c`,
`buildSteamBridgeShims.ts`'s own exports (beyond the pre-existing ones already named above),
`protocol.ts`, or either steam bridge test file 51-10 modifies. Not fixed here, per the
deviation-rules scope boundary.
