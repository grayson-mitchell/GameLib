---
status: resolved
trigger: "Phase 11 Humble key sync live-UAT failures: syncing indicator never resolves; purchased Steam-key game never appears; logout/login does not help"
created: 2026-07-06T00:00:00Z
updated: 2026-07-06T07:30:00Z
---

## Current Focus

hypothesis: CONFIRMED — CacheStore.entries() leaks the electron-store dot-notation `__timestamp` group; HumbleLibrary.getKeys() throws `entry.keys is not iterable` on any store with at least one committed entry, wedging sync mid-flight and rejecting every humbleGetKeys IPC call
test: Direct reproduction with real electron-store (scratchpad/repro.cjs) — entries() returned ['gk1', '__timestamp'] and the getKeys flatten threw TypeError
expecting: Fixing the entries() filter makes sync complete (final progress + keysUpdated) and getKeys return committed keys
next_action: DONE — fix applied, regression tests red/green verified, jest + codecheck green, committed. Awaiting human live re-test with a real Humble account (spinner clears + purchased key appears).

reasoning_checkpoint:
  hypothesis: "CacheStore.set(key, v) also writes `__timestamp.${key}`. electron-store (conf) defaults accessPropertiesByDotNotation=true, so on disk this creates a nested TOP-LEVEL `__timestamp` object. CacheStore.entries() reads this.store.store and filters only keys starting with the literal '__timestamp.' — the top-level '__timestamp' group passes. HumbleLibrary.getKeys() then executes keys.push(...entry.keys) on entry={gk: dateString} → TypeError. That single throw (a) rejects the first worker in runBounded → Promise.all rejects → sync() rejects after emitting humbleSyncProgress {done:1,total:N} but BEFORE humbleKeysUpdated → frontend syncing stuck true forever; (b) makes the humbleGetKeys IPC handler reject on every call → keys never render; (c) recurs after logout/login because the first committed order recreates the __timestamp group."
  confirming_evidence:
    - "node repro with the project's real electron-store: store.set('gk1',entry); store.set('__timestamp.gk1', Date()) produced on-disk { gk1: {...}, __timestamp: { gk1: '...' } }; entries() filter returned keys ['gk1','__timestamp']; the getKeys flatten threw 'entry.keys is not iterable'"
    - "node_modules/conf/dist/source/index.js line 74: accessPropertiesByDotNotation defaults true"
    - "GlobalState.tsx: syncing only set true by humbleSyncProgress (done<total) and only cleared by a later progress done===total or humbleKeysUpdated — both dead once sync() rejects"
    - "library.ts worker: sendFrontendMessage('humbleSyncProgress',...) executes BEFORE getKeys() throws inside the humbleKeysUpdated send — exactly the observed stuck-spinner ordering"
    - "library.test.ts mocks humbleLibraryStore with a clean Map double whose entries() never contains bookkeeping keys — why all existing tests pass"
  falsification_test: "If entries() on a real CacheStore (file-backed) after set() did NOT contain a '__timestamp' entry, or if getKeys() did not throw, this hypothesis would be wrong. Repro shows both."
  fix_rationale: "entries() is documented to exclude internal `__timestamp.*` bookkeeping; the filter simply misses the dot-notation-nested form that the file-backed path actually produces. Excluding the top-level '__timestamp' group in entries() fixes getKeys()/loadCached()/sync() and the same latent leak in steam/library.ts migrateStaleArtUrls — without changing the on-disk format (get()'s lifespan lookup reads `__timestamp.${key}` via dot-prop and keeps working)."
  blind_spots: "Cannot verify live Humble order-detail responses classify the purchased Steam key as expected (needs real account); cannot verify no OTHER live failure (e.g. 429 burst) also occurs. A worker throw from any OTHER unexpected source would still wedge the spinner — noting for report but not force-clearing on a timer."

## Symptoms

expected: Humble Keys page shows synced keys after login/startup; syncing indicator clears when sync completes
actual: Syncing indicator shows permanently; purchased Steam-key game never appears; logout+login does not fix
errors: none reported (silent failure)
reproduction: pnpm dev with real Humble account, visit Humble Keys page
started: Phase 11 plan 11-05 human verification (first live UAT of sync)

## Eliminated

## Evidence

- timestamp: 2026-07-06
  checked: src/backend/cache.ts entries() + set() vs electron-store/conf dot-notation default
  found: set() writes `__timestamp.${key}` which conf nests under a top-level `__timestamp` object; entries() filter only excludes literal '__timestamp.' prefixed keys
  implication: entries() returns a ['__timestamp', {…}] pseudo-entry once any key has been set on the file-backed path

- timestamp: 2026-07-06
  checked: src/backend/humble/library.ts getKeys()/sync() worker
  found: getKeys() does keys.push(...entry.keys) with no guard; worker sends humbleSyncProgress then evaluates getKeys() as the humbleKeysUpdated argument; a throw rejects runBounded's Promise.all and sync()
  implication: first committed order → progress(1,N) sent, then TypeError → no keysUpdated, sync rejects → spinner stuck (symptom 1), humbleGetKeys IPC rejects (symptom 2), recreated after logout/login (symptom 3)

- timestamp: 2026-07-06
  checked: scratchpad/repro.cjs with the project's real electron-store
  found: entries-equivalent returned keys ['gk1','__timestamp']; flatten threw 'entry.keys is not iterable'
  implication: root cause demonstrated without a real Humble account

- timestamp: 2026-07-06
  checked: src/backend/humble/__tests__/library.test.ts mock boundaries
  found: humbleLibraryStore mocked as clean Map double; real CacheStore never exercised
  implication: explains why the whole suite passes while live UAT fails

- timestamp: 2026-07-06
  checked: frontend syncing lifecycle (GlobalState.tsx 1086-1098, Keys/index.tsx)
  found: syncing set true only by progress done<total; cleared by progress done===total or any humbleKeysUpdated; frontendListenerSlot is additive (no slot stealing); sendFrontendMessage targets main window correctly
  implication: frontend wiring is sound — no separate frontend bug; once backend emits terminal events the spinner clears

- timestamp: 2026-07-06
  checked: src/backend/storeManagers/steam/library.ts migrateStaleArtUrls (line 116)
  found: same entries() leak but harmless there (optional chaining on meta?.art_square)
  implication: single shared fix in cache.ts covers both consumers

## Eliminated

- hypothesis: frontendListenerSlot replaces GlobalState's listener when Keys page registers the same channel
  evidence: preload/ipc.ts frontendListenerSlot uses ipcRenderer.on (additive) and returns a targeted removeListener
  timestamp: 2026-07-06

- hypothesis: sync() has an early-return path that skips the completion event by design (gamekeys failure)
  evidence: those paths never set syncing=true in the first place (no progress events sent); the stuck spinner requires at least one progress event with done<total
  timestamp: 2026-07-06

- hypothesis: runBounded deadlocks (pool never drains)
  evidence: pool logic is sound (async recursion, abort flag); existing concurrency/abort tests exercise it; the hang comes from the worker wrapper throwing, not the pool
  timestamp: 2026-07-06

## Resolution

root_cause: CacheStore.entries() (src/backend/cache.ts) leaks electron-store's dot-notation-nested top-level `__timestamp` bookkeeping group because its filter only excludes keys starting with the literal string '__timestamp.'. HumbleLibrary.getKeys() then throws TypeError spreading entry.keys of the pseudo-entry, which rejects sync() mid-flight (after humbleSyncProgress, before humbleKeysUpdated → permanent spinner) and rejects every humbleGetKeys IPC call (keys never render, logout/login recreates it).
fix: entries() filter now excludes both the literal '__timestamp.'-prefixed keys (in-memory Map path) AND the top-level '__timestamp' group (file-backed dot-notation path). On-disk format unchanged — get()'s lifespan lookup of `__timestamp.${key}` still resolves via dot-prop. Also fixes the same latent leak in steam/library.ts migrateStaleArtUrls (harmless there due to optional chaining, but no longer iterated).
verification: Red/green demonstrated — with fix stashed, 4 new regression tests fail (cache.test.ts entries() leak + all 3 library.realstore.test.ts tests reject with the live TypeError); with fix applied, all pass. Full verification — `npx jest src/backend/humble/__tests__ src/backend/__tests__/cache.test.ts --no-coverage` (6 suites, 100 tests, exit 0), `npm test` (29 suites, 401 tests, exit 0; pre-existing worker force-exit warning confirmed present on clean base too), `npm run codecheck` (tsc --noEmit, exit 0). Live re-verify with a real Humble account still required (spinner clears, purchased Steam-key game appears) — flagged for human re-test.
files_changed:
  - src/backend/cache.ts (entries() bookkeeping filter)
  - src/backend/__tests__/cache.test.ts (regression: entries() excludes __timestamp group on file-backed + in-memory paths)
  - src/backend/humble/__tests__/library.realstore.test.ts (new: HumbleLibrary against REAL CacheStore/electron-store — sync completes with terminal progress + keysUpdated ordering, getKeys/loadCached never throw)
