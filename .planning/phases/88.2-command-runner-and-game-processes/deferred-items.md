# Phase 88.2 deferred items

## From 88.2-24

- `src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient.test.ts` "ensureValveClient > rejects a symlink entry"
  fails on this macOS machine: the extraction step reports `unzip extraction failed` where the test expects the substring
  `regular file`. Not investigated further: `valveClient.ts` imports nothing 88.2-24 touched (no runner, utils or
  launcher), and the machine's `/usr/bin/unzip` is Apple's Info-ZIP 6.00 build, so it looks environmental. Out of scope;
  left alone.
