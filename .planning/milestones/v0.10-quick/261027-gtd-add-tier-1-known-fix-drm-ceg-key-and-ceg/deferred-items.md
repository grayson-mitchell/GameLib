# Deferred items

- src/backend/__tests__/steamBridgeKnownFixes.test.ts L545 ("bundled 63000 profile") asserts public/fixes/63000-steam.json does not exist; that file was added by quick 261027-bqe, so the test fails independent of gtd. Out of scope here (test not in files_modified).
