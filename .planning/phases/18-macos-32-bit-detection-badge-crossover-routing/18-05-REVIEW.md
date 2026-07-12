---
phase: 18-macos-32-bit-detection-badge-crossover-routing
reviewed: 2026-07-12T08:49:33Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
findings:
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 18: Code Review Report (gap closure — plan 18-05)

**Reviewed:** 2026-07-12T08:49:33Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

This is a scoped gap-closure review of the diff from `4b370413` to HEAD, confined
to (1) `verifyMacArchGroundTruth()`'s new propagation of the resolved `mac_arch`
verdict into the in-memory `library` Map + `pushGameToLibrary` push, (2)
`refresh()`'s new `mac_arch: cachedMeta?.mac_arch ?? 'unknown'` seed, and (3) two
new regression tests.

The `refresh()` change is correct and false-flag-safe: the default is `'unknown'`,
never `'32'`, and the new test explicitly asserts both the positive case (cached
`'32'` survives resync) and the negative control (`undefined` cachedMeta →
`'unknown'`, not `'32'`).

The `verifyMacArchGroundTruth()` change correctly merges onto the *existing*
library entry via spread (never fabricates a `GameInfo`) and correctly guards
against the appId being absent from the Map (logs and no-ops rather than
crashing or fabricating an entry). The new regression test does assert the
verdict reaches the `pushGameToLibrary` payload, not just the metadata store.

However, the propagation fix is an **incomplete implementation of the CR-01 fix
prescribed in the prior `18-REVIEW.md`** (see `18-REVIEW.md:93-106`): the
recommended fix explicitly included a `steamLibraryStore.set('games', ...)`
call immediately after `library.set(appId, updated)`, mirroring the
"GAP-17-BOTTLE-STORE-DIVERGENCE" persist-immediately pattern applied everywhere
else in this same file (`refreshInstallState()`, `pollInstallOnce()`,
`pollUninstallOnce()`). The shipped diff omits that line. This is flagged below
as CR-01 (this review's own numbering, since it is a fresh finding against the
18-05 diff, not a duplicate of an out-of-scope pre-existing item).

## Critical Issues

### CR-01: `verifyMacArchGroundTruth()`'s propagation fix drops the `steamLibraryStore` persist step — `mac_arch` reverts to stale/`'unknown'` after a restart until the next successful background `refresh()`

**File:** `src/backend/storeManagers/steam/library.ts:651-661`

**Issue:** The new propagation block updates the in-memory `library` Map and
pushes the updated `GameInfo` to the frontend for the *current* session, but
never calls `steamLibraryStore.set('games', Array.from(library.values()))`:

```ts
const currentGameInfo = library.get(appId)
if (currentGameInfo) {
  const updatedGameInfo: GameInfo = { ...currentGameInfo, mac_arch: verdict }
  library.set(appId, updatedGameInfo)
  sendFrontendMessage('pushGameToLibrary', updatedGameInfo)
  // <-- no steamLibraryStore.set('games', ...) here
} else { ... }
```

Every other call site in this file that mutates `library` after the initial
population — `refreshInstallState()` (`library.ts:419-426`),
`pollInstallOnce()`'s `'installed'` branch (`library.ts:942-947`), and
`pollUninstallOnce()`'s `'absent'` branch (`library.ts:1117-1121`) — persists
to `steamLibraryStore` immediately after every `library.set(...)`, each with an
explicit "GAP-17-BOTTLE-STORE-DIVERGENCE" comment explaining *why*: an app
restart before the next full `refresh()` must not read a stale value from
`steamLibraryStore`. This exact class of bug is what the new code reintroduces
for `mac_arch`.

Concretely: `pollInstallOnce()`'s `'installed'` branch persists the library
snapshot to `steamLibraryStore` *before* the fire-and-forget
`verifyMacArchGroundTruth()` call is even invoked (`library.ts:946`, then
`:972`). By the time `verifyMacArchGroundTruth()` resolves the verdict and
updates the in-memory Map, the on-disk `steamLibraryStore` snapshot is already
frozen without `mac_arch`. If the app restarts before the session's background
`refresh()` fires — `SteamLibraryManager.init()` only triggers `refresh()`
`if (SteamUser.isLoggedIn())` via `runOnceWhenOnline()` (`library.ts:124-126`),
which is not immediate and requires network connectivity — `init()` loads the
stale `steamLibraryStore` array and pushes it straight to the frontend
(`library.ts:89-100`) with the `'32'` (or `'64'`) verdict missing, i.e. the
32-bit warning badge — this phase's primary UI deliverable, per the prior
CR-01 finding — silently disappears again until the next successful sync.

This is not merely cosmetic: for an i386-only game, the badge is the signal
that tells the user the native install is unrunnable and that CrossOver
routing is available. A user who restarts the app shortly after an install
(a very plausible sequence) will see the game listed without the warning
until the next online, logged-in `refresh()` completes.

The new regression test (`library.test.ts:2611-2654`) only asserts
`sendFrontendMessage` and `library.get(APP_ID)?.mac_arch` — it does not assert
`steamLibraryStore.set` was called, so this gap is unverified by the added
test.

**Fix:** Add the persist call, exactly as originally specified in
`18-REVIEW.md:93-106`:

```ts
const currentGameInfo = library.get(appId)
if (currentGameInfo) {
  const updatedGameInfo: GameInfo = { ...currentGameInfo, mac_arch: verdict }
  library.set(appId, updatedGameInfo)
  // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately, mirroring every
  // other library-mutating call site in this file — otherwise a restart
  // before the next full refresh() reads a stale mac_arch from
  // steamLibraryStore and the 32-bit badge silently reverts.
  steamLibraryStore.set('games', Array.from(library.values()))
  sendFrontendMessage('pushGameToLibrary', updatedGameInfo)
} else {
  ...
}
```

Add a corresponding assertion to the new regression test:
```ts
expect(steamLibraryStore.set).toHaveBeenCalledWith(
  'games',
  expect.arrayContaining([expect.objectContaining({ app_name: APP_ID, mac_arch: '32' })])
)
```

## Warnings

### WR-01: No explicit regression test for the "appId absent from `library` Map" skip branch

**File:** `src/backend/storeManagers/steam/library.ts:656-661`, `src/backend/storeManagers/steam/__tests__/library.test.ts:2413-2655`

**Issue:** The scope note for this gap closure specifically calls out
verifying the guard against the appId being absent from the Map. The
production code does guard correctly (logs and returns without touching
`library` or pushing a fabricated `GameInfo`), and this branch is *implicitly*
exercised by the pre-existing tests in the same `describe` block (none of them
seed `library` with `APP_ID`, and `afterEach` deletes it after the one new
test that does seed it) — so the code path runs without throwing. However, no
test explicitly asserts the two properties that matter for this branch: (a)
`sendFrontendMessage` is never called with `pushGameToLibrary` when the appId
isn't in the Map, and (b) `library.has(appId)` remains `false` afterward. A
future refactor of this branch could silently start fabricating a partial
`GameInfo` or crash on a missing field, and none of the current tests would
catch it since none assert the negative behavior directly — they only assert
unrelated positive outcomes (`steamMetadataStore.set` calls) that happen to
coexist with this branch running.

**Fix:** Add an explicit test, e.g.:
```ts
it('CR-01: does not push or throw when appId is not present in the in-memory library Map', async () => {
  // library does not have APP_ID (afterEach deletes it)
  ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
    if (dir === INSTALL_PATH) return ['OldGame.app']
    if (dir === MACOS_DIR) return ['OldGame']
    return []
  })
  ;(existsSync as jest.Mock).mockReturnValue(true)
  ;(execFileSync as jest.Mock).mockImplementation((cmd: string) =>
    cmd === 'lipo' ? 'i386\n' : (() => { throw new Error('unexpected') })()
  )
  ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
    art_cover: '', art_square: '', extra: { reqs: [] }
  })

  await expect(
    verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')
  ).resolves.not.toThrow()

  expect(sendFrontendMessage).not.toHaveBeenCalledWith(
    'pushGameToLibrary',
    expect.objectContaining({ app_name: APP_ID })
  )
  expect(library.has(APP_ID)).toBe(false)
})
```

---

_Reviewed: 2026-07-12T08:49:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
