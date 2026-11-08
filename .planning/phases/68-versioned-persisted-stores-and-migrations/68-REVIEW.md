---
phase: 68-versioned-persisted-stores-and-migrations
reviewed: 2026-11-08T17:58:52Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - src/backend/storeVersioning/engine.ts
  - src/backend/storeVersioning/backup.ts
  - src/backend/storeVersioning/readOnlyStores.ts
  - src/backend/storeVersioning/settingsFiles.ts
  - src/backend/storeVersioning/types.ts
  - src/backend/storeMigrations/index.ts
  - src/backend/storeMigrations/settingsGlobal.ts
  - src/backend/storeMigrations/settingsGame.ts
  - src/backend/store_backend.ts
  - src/backend/typed_store.ts
  - src/backend/cache.ts
  - src/backend/config.ts
  - src/backend/game_config.ts
  - src/backend/constants/others.ts
  - src/backend/constants/key_value_stores.ts
  - src/backend/engine/engineConfig.ts
  - src/backend/engine/engineNoticeStore.ts
  - src/backend/sidecar/readOnlyStoresNotice.ts
  - src/backend/sidecar/storeWriteHandlers.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/common/types/storePolicy.ts
  - src/common/types/readOnlyStores.ts
  - src/common/types/ipc/appShell.ts
  - src/common/types.ts
  - src/preload/api/settings.ts
  - src/frontend/state/ReadOnlyStoresNotice.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/components/UI/ReadOnlyStoresNotice/index.tsx
  - src/frontend/components/UI/ReadOnlyStoresNotice/index.scss
  - src/frontend/components/UI/NoticeStack/index.tsx
  - src/backend/crossover_index/stores.ts
  - src/backend/downloadmanager/stores.ts
  - src/backend/game_overrides/stores.ts
  - src/backend/humble/stores.ts
  - src/backend/logger/stores.ts
  - src/backend/macArch/stores.ts
  - src/backend/migration/stores.ts
  - src/backend/runsForMe/stores.ts
  - src/backend/storeManagers/gog/stores.ts
  - src/backend/storeManagers/legendary/stores.ts
  - src/backend/storeManagers/nile/stores.ts
  - src/backend/storeManagers/sideload/stores.ts
  - src/backend/storeManagers/steam/stores.ts
  - src/backend/wiki_game_info/stores.ts
  - src/backend/wine/manager/stores.ts
  - src/backend/utils/systeminfo/gpu/pci_ids.ts
findings:
  critical: 1
  warning: 4
  info: 7
  total: 12
status: issues_found
---

# Phase 68: Code Review Report

**Reviewed:** 2026-11-08T17:58:52Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the versioning engine, the backup and atomic-write helpers, the read-only aggregate, the
settings-file integration and the `GameLibStore` / `TypeCheckedStoreBackend` / `CacheStore`
choke points. I also traced the conf@10.2.0 constructor and its `store` accessors
(`node_modules/conf/dist/source/index.js:61-300`) and the sidecar read/write paths
(`handlers.ts` `resolveRawStore`, `storeWriteHandlers.ts`). Tests were consulted only for
reference.

These parts hold up:
- **D-03 write blocking:** the `GameLibStore.store` setter guard catches conf's constructor
  defaults merge, `set`, `delete`, `clear`/`reset` and the expiry-delete inside `CacheStore.get`.
  `TypeCheckedStoreBackend`, `CacheStore` and `applyStoreWrite` also return early, so a refused
  write is never announced to the renderer.
- **`__internal__` isolation:** `__internal__` is refused on the write path (`refuseReservedKey`,
  `isAllowedStoreField`). It is removed from `raw_store`, `entries()` and `use_in_memory()`, and
  from both snapshot paths through `filterStoreSnapshot`.
- **Ordering:** the backup is written before the migrated file, and both writes go through
  temp-then-rename. A crash between the two writes leaves the original file intact.
- **Sidecar exit contract:** nothing in the new code creates a timer, watcher or async work.

The defects are in the edge paths. The atomic-write fallback can truncate the live file. Backup
pruning can delete the backup it just wrote. One store holding non-refetchable tokens is
classified as a cache. The `version: 'v1'` stamp crashes every pre-68 build.

## Critical Issues

### CR-01: `atomicWritePrivate` falls back to an in-place truncating write when the temp-file write itself fails

**File:** `src/backend/storeVersioning/backup.ts:41-54`
**Issue:** One `try` block wraps both `writeFileSync(tmpPath, ...)` and `renameSync(...)`. If
the temp write fails (ENOSPC, EDQUOT, EIO, EACCES on the directory), the `catch` runs
`writeFileSync(filePath, text, ...)`. That opens the live file with `O_TRUNC` and hits the same
error. The result is the live file truncated or partly written, which is exactly what the atomic
write exists to prevent. Two callers are affected:
- **Migration (`engine.ts:143`):** the migrated store file is left truncated. The engine marks the
  store `failed`, but on the very next `this.store` read conf gets a `SyntaxError`. A store without
  `clearInvalidConfig` (for example `configStore`, `steamConfigStore`, `humbleConfigStore`,
  `downloadManager`) then throws from its module-scope constructor, so the sidecar fails to boot.
  A store with `clearInvalidConfig: true` silently comes up empty, and its next write
  replaces the user-state.
- **Every settings save (`settingsFiles.ts:42`, used by `config.ts` and `game_config.ts`
  `writeToFile`):** `config.json` or `GamesConfig/<app>.json` is left truncated. The next
  `GlobalConfig.getSettings()` `JSON.parse` throws.

The fallback is only justified for a failed rename (Windows EPERM/EBUSY when another process
holds the file open). It must not run when the temp write failed.
**Fix:**
```ts
export function atomicWritePrivate(filePath: string, text: string | Buffer): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmpPath = `${filePath}.tmp-${process.pid}`
  try {
    writeFileSync(tmpPath, text, { mode: 0o600 })
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* may not exist */ }
    throw err // live file untouched
  }
  try {
    renameSync(tmpPath, filePath)
  } catch (err) {
    process.stderr.write(`[storeVersion] rename failed for ${basename(filePath)}: ${errMessage(err)}\n`)
    writeFileSync(filePath, text, { mode: 0o600 }) // rename-only fallback
    try { unlinkSync(tmpPath) } catch { /* best effort */ }
  }
}
```

## Warnings

### WR-01: Backup pruning can delete the backup it just wrote, so a migration proceeds with no backup

**File:** `src/backend/storeVersioning/backup.ts:130-147`
**Issue:** Pruning sorts every backup by the UTC stamp in its name and deletes all but the newest
three. The new `target` is not excluded from that list. If the clock goes backwards (manual
change, a dead RTC battery, a VM snapshot restore, a profile copied from a machine whose clock ran
ahead), three or more existing backups can carry stamps later than `now()`. The new `target` then
sorts oldest, lands in `all.slice(0, ...)`, and is unlinked immediately. `writePreMigrationBackup`
still returns `target`, so `runFileMigration` rewrites the store believing a backup exists, and
the D-08 guarantee is lost. The dedupe check at lines 120-128 has the same weakness: "newest"
means the newest stamp, not the most recently written file.
**Fix:** Never prune the file just written. Also consider ordering by mtime, or by a
monotonically increasing sequence number in the name, instead of wall-clock time:
```ts
const all = listBackups(storePath).filter((p) => p !== target)
for (const old of all.slice(0, Math.max(0, all.length - (MAX_BACKUPS_PER_STORE - 1)))) { ... }
```

### WR-02: `uploadedLogs` is declared `kind: 'cache'` but holds server deletion tokens that cannot be refetched

**File:** `src/backend/logger/stores.ts:17`
**Issue:** `uploadedLogs` stores `UploadedLogData { name, token, uploadedAt }`
(`common/types.ts:1275-1282`), and `token` is the only credential that can delete an uploaded
log from the server (`logger/uploader.ts:97-149`). D-01 defines a cache as data that can be
rebuilt, and D-14 says uncertain kinds default to user-state. These tokens cannot be rebuilt. As
declared:
- the first non-identity chain for `store/uploadedLogs` unlinks the file (`engine.ts:120-123`);
- a newer `uploadedLogs.json` is shown as `{}` (`engine.ts:205`), so the user's uploaded logs
  disappear from the UI and cannot be deleted from that build.

No chain ships yet, so nothing is lost today. The misclassification arms the first time this
store's shape changes.
**Fix:** Declare `{ kind: 'user-state' }` (arguably also `tokenBearing: true`, since the file
holds credential-like material). Then re-check the other `'cache'` declarations against the same
rule (`wine-downloader-info` and the store-metadata caches look correct).

### WR-03: Writing `version: 'v1'` makes every pre-68 build throw in `GlobalConfig.get()` / `GameConfig.get()`, and the per-game bump is unnecessary

**File:** `src/backend/constants/others.ts:3-4`, `src/backend/game_config.ts:288,310`, `src/backend/storeMigrations/settingsGame.ts:10-12`
**Issue:** Pre-68 builds handle an unknown settings version with
`default: logError(...); break` and then call `GlobalConfig.globalInstance.upgrade()` (base
`config.ts:137-145`) or `GameConfig.instances.get(appName)!.upgrade()` on `undefined`. Either
call throws a TypeError. The `settings/global` migration runs at the first `GlobalConfig.get()`
and stamps `config.json` `v1` immediately. After one launch of this build, any pre-68 build
(including other worktree dev builds on the same profile) throws on its first `GlobalConfig.get()`.
The CONTEXT "accepted limitation" says pre-68 builds "read and write newer files freely", which
does not describe settings files: they crash.

For `GamesConfig/*.json` the bump buys nothing. The chain is identity-only ("Shape unchanged"),
yet every `flush()` now writes `'v1'`, so each game saved in this build becomes a crash point for
an older build.
**Fix:** Keep writing `version: 'v0'` from `GameConfigV0.flush()` until a real per-game shape
change ships. The engine already treats v0-with-identity as current, and `currentVersionOf`
already floors at 1. For `config.json`, either accept and document the crash honestly in
CONTEXT (correct the accepted-limitation text), or have the migration keep `version: 'v0'` and
track adoption in a field the old loader ignores.

### WR-04: The read-only notice is lost on a renderer reload while writes stay refused

**File:** `src/backend/sidecar/appShellFlowRegistration.ts:539,587-594`; `src/frontend/state/ReadOnlyStoresNotice.ts:19-28`
**Issue:** `pushReadOnlyStoresNotice()` runs inside the `frontendReadyBootWorkDone` one-shot
block. The renderer's zustand store is reset by a reload (devtools reload, webview
crash-recovery, which the CR-02 comment in that file names as real paths). The sidecar never
re-sends the notice, so for the rest of the session every write to the read-only stores is
silently dropped and the user has nothing telling them (D-05/D-07). This applies to entries
recorded before the reload; later `recordReadOnly` calls still re-publish.
**Fix:** Call `pushReadOnlyStoresNotice()` (or a non-mutating `publish()` re-send) outside the
one-shot guard. It is idempotent, ids-only and creates no handle. The renderer's `dismissed`
flag already gives "once per renderer lifetime".

## Info

### IN-01: The unexpected-error path in `prepareStoreFile` marks the store read-only without telling the user

**File:** `src/backend/storeVersioning/engine.ts:182-197`
**Issue:** The `catch` path sets `status: 'readOnly'` but never calls `recordReadOnly`. That
store's writes are refused with no notice (D-07) and no logger line, only stderr. The path is
practically unreachable today, because `runFileMigration` catches internally.
**Fix:** Call `recordReadOnly({ storeKey: chainKey, file: basename(filePath), reason: 'failed', detail })`
inside the inner `try`.

### IN-02: An invalid `schemaVersion` is treated as v0 and is overwritten with v1 on the next write

**File:** `src/backend/storeMigrations/index.ts:62-72`
**Issue:** A non-integer or string stamp (corruption, or a future build that changes encoding)
reads as 0. The store is then adopted, and the next write re-stamps it v1. That fails open,
against D-03's intent.
**Fix:** Treat a present-but-invalid stamp as read-only (`'failed'`) rather than v0.

### IN-03: Leftover `*.tmp-<pid>` files are never cleaned up and can hold token material

**File:** `src/backend/storeVersioning/backup.ts:40`
**Issue:** A crash between the temp write and the rename leaves
`config.json.tmp-<pid>` beside `steam_store/` and `humble_store/` files. It is mode 0o600, but
nothing ever removes it, and `listBackups` does not see it.
**Fix:** Sweep stale `<name>.json.tmp-*` siblings in `prepareStore`, synchronously and only in
the store's own directory.

### IN-04: `atomicWritePrivate` replaces a symlinked `config.json` / `GamesConfig/*.json` with a regular file

**File:** `src/backend/storeVersioning/settingsFiles.ts:42`
**Issue:** The previous `writeFileSync` followed the symlink. Rename-over replaces the link
itself, which breaks dotfile-managed settings. This is a behaviour change for the two settings
writers, new in this phase.
**Fix:** `realpathSync` the target before writing, or document the change.

### IN-05: Removing `GameConfigV0_1` silently turns `v0.1` files into explicit configs

**File:** `src/backend/game_config.ts:112-117`
**Issue:** `v0.1` files used to load with `isExplicit = false`. They now load as `GameConfigV0`
(`isExplicit = true`), and the on-disk `explicit` flag is ignored. The next flush freezes every
global default into that game's file. This is low impact, because this codebase never wrote
`'v0.1'`.
**Fix:** Derive `isExplicit` from the file's `explicit` field, or record the dropped semantics.

### IN-06: Some readers parse `GamesConfig/<app>.json` without `ensureSettingsMigrated`

**File:** `src/backend/storeManagers/steam/titleSettings.ts:22-35`
**Issue:** `readStoredTitleConfig` parses the file directly. That is harmless while
`settings/game` is identity-only. Once a real per-game migration ships, this reader will see
the old shape before `GameConfig.get` has migrated the file.
**Fix:** Call `ensureSettingsMigrated(path, 'settings/game')` before reading, as
`engineConfig.ts:95` does.

### IN-07: Exports used only by tests

**File:** `src/backend/storeVersioning/settingsFiles.ts:29` (`isSettingsFileReadOnly`), `engine.ts:230` (`readOnlyReasonOf`), `readOnlyStores.ts:111` (`listReadOnly`)
**Issue:** These have no production consumer. Test-only exports widen the module surface and are
knip-ratchet candidates.
**Fix:** Prefix them with `__` and add `ForTest`, matching `__kindMismatchesForTest`, or annotate them for knip.

---

_Reviewed: 2026-11-08T17:58:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
