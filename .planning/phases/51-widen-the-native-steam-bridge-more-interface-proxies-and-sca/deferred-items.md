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
