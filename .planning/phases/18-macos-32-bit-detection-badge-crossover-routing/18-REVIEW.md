---
phase: 18-macos-32-bit-detection-badge-crossover-routing
reviewed: 2026-07-13T08:31:42Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 18: Code Review Report (Gap-Closure — plan 18-06 forceUninstall keep-entry)

**Reviewed:** 2026-07-13T08:31:42Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

> Scope note: this is the gap-closure re-review for plan 18-06 (MAC32-04), scoped ONLY to
> the diff since `bb252e9e` (commits `c40def65` + `930634f5`) — the `forceUninstall()`
> keep-entry change and its tests. It supersedes the earlier full-phase 18 review artifact.

## Summary

The change replaces `library.delete(appId)` with a keep-entry mutation
(`{ ...existing, is_installed: false, install: {} }`), persists the mutated Map to
`steamLibraryStore`, and pushes a badge-preserving `pushGameToLibrary` payload. I traced
the change end to end:

- The new body is a faithful mirror of the established `pollUninstallOnce()` "absent"
  branch (`library.ts:1131-1144`) and `verifyMacArchGroundTruth()`'s persist pattern
  (`library.ts:668-677`) — same store key (`'games'`), same `Array.from(library.values())`
  serialization, same guard-on-`existing`, same push shape. Persistence is consistent with
  every other library-mutating call site in `library.ts`.
- The badge-preservation claim holds: `verifyMacArchGroundTruth()` writes `mac_arch: '32'`
  into the in-memory Map (`library.ts:670`) BEFORE `promptI386Recovery()` →
  `forceUninstall()` runs, so the `{ ...existing }` spread genuinely carries `mac_arch:'32'`
  forward. Reinstall routing is driven by `steamMetadataStore` (untouched here), so the
  CrossOver route survives.
- Dropping the old `this.getGameInfo()` call (which fired a fire-and-forget metadata fetch
  side effect) in favor of `library.get()` is a net improvement — no spurious network call
  during uninstall.

**No correctness or security defects** were found in the changed code. Findings below are
one test-reliability weakness (WARNING) and three quality/coverage observations (INFO).

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: GAP-18-06 persist assertion cannot catch the regression it is named for

**File:** `src/backend/storeManagers/steam/__tests__/games.test.ts:1817-1821`
**Issue:** The test named "preserves mac_arch:32 in the Map and persists to
steamLibraryStore" asserts only that `steamLibraryStore.set` was called with `'games'` and
`expect.any(Array)`. It never inspects the persisted array's contents. The entire point of
GAP-18-06 (GAP-17-BOTTLE-STORE-DIVERGENCE class) is that the persisted store must carry the
not-installed + `mac_arch:'32'` entry so a restart before the bottle reinstall does not
revert the badge. A future regression that persisted a stale/empty snapshot (e.g. serializing
before `library.set`, or persisting the wrong Map) would still pass this assertion. The
in-Map and pushed-payload assertions cover the Map and the IPC push, but the persisted
payload — the actual divergence surface this fix exists to close — is left unchecked.
**Fix:** Assert the persisted array actually contains the badge-preserving entry, e.g.:
```ts
const persisted = (steamLibraryStore.set as jest.Mock).mock.calls.find(
  ([key]) => key === 'games'
)?.[1] as GameInfo[]
expect(persisted).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ app_name: APP_ID, is_installed: false, mac_arch: '32' })
  ])
)
```

## Info

### IN-01: logInfo claims the entry was "kept" even when the appId was absent

**File:** `src/backend/storeManagers/steam/games.ts:873-876`
**Issue:** The `logInfo("force-uninstalled … — kept in-memory library entry marked
not-installed")` fires unconditionally, outside the `if (existing)` block. When the appId is
absent from the Map, nothing is kept, nothing is persisted, and nothing is pushed — yet the
log still asserts the entry was kept and marked not-installed. Misleading during log-driven
diagnosis of the very "orphan" scenario this fix targets.
**Fix:** Move the log inside the `if (existing)` branch, or emit a distinct message for the
absent case (e.g. "appId not in in-memory library — nothing to force-uninstall").

### IN-02: absent-entry branch is untested and its behavior silently changed

**File:** `src/backend/storeManagers/steam/games.ts:863-872`
**Issue:** The old implementation pushed `pushGameToLibrary` with `{ ...info, is_installed:
false }` even when the entry was absent (`getGameInfo()` returned `{}`); the new
implementation pushes nothing when `existing` is undefined. This is an intended behavior
change (per the doc comment), but no test exercises the absent path, so the change — and any
future regression of it — is invisible to the suite. Both new tests pre-seed the Map.
**Fix:** Add a test that calls `forceUninstall()` against an empty `library` Map and asserts
no `pushGameToLibrary` message and no `steamLibraryStore.set` call occurs.

### IN-03: keep-entry change also widens behavior for the folder-not-found caller

**File:** `src/backend/storeManagers/steam/games.ts:863` (caller: `src/backend/utils.ts:295`)
**Issue:** The doc comment and tests frame this exclusively as an i386-recovery fix, but
`forceUninstall()` is also invoked by `askForceUninstall()` (the generic "Game folder appears
to be deleted, remove from installed list?" flow). For Steam the widening is arguably correct
— an owned Steam game should remain browsable as not-installed rather than vanish — so this is
not a defect. Flagged for awareness: the second caller is outside the stated scope and has no
Steam-specific coverage, so the intent should be confirmed.
**Fix:** No code change required. Optionally note the `askForceUninstall` path in the doc
comment so the broader blast radius is explicit for future maintainers.

---

_Reviewed: 2026-07-13T08:31:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
