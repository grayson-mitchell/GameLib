---
phase: 85-store-host-config-and-versioned-migrations
source: 85-REVIEW.md
created: 2026-11-22
findings: 43
---

# Phase 85: Code Review Disposition

One row per finding in `85-REVIEW.md`. Every finding starts as `open`. `open` means triaged into the post-phase decision (fix now or file as todos), not forgotten.

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| A-WR-01 | warning | `Synced` writes never fsync the parent directory, so the rename can be lost after a crash | open |
| A-WR-02 | warning | Refuse-newer fails open for absurd stamped versions in the engine, but closed in `version_gate` | open |
| A-WR-03 | warning | A lone-surrogate escape in a TS-written file locks a user-state, account or settings store read-only | open |
| A-WR-04 | warning | `dotpath::set` has no bound on array index or path depth, so a hostile or buggy key aborts the process | open |
| A-WR-05 | warning | `gamelib-store-cli open --dry-run` leaves a partial copy of token stores in the system temp directory on any copy error | open |
| A-WR-06 | warning | A leftover temp file (crash orphan) is never swept, and a temp-name collision fails the write instead of retrying | open |
| A-IN-01 | info | In-place fallback truncates the real file and keeps a loose existing mode | open |
| A-IN-02 | info | `Op::Replace` breaks two promises in the module docs | open |
| A-IN-03 | info | Unused dependencies | open |
| A-IN-04 | info | README still describes the retired `gamelib_core::store` | open |
| A-IN-05 | info | Dispatcher spawn failure is swallowed, so listeners silently never fire | open |
| B-WR-01 | warning | Queued renderer store writes are dropped at exit and nothing drains them | open |
| B-WR-02 | warning | The `store` drain runs concurrently with the other drains while the sidecar is still alive, and no wait follows the child stage | open |
| B-WR-03 | warning | `GAMELIB_STORE_BOOT` has no size bound and can make the sidecar spawn fail | open |
| B-WR-04 | warning | `safety_remove_tree` pauses the entire store frame worker for the whole delete, even when no `app-data` target is present | open |
| B-WR-05 | warning | Eviction runs only on a fully `removed` outcome, and the renderer write path is never paused | open |
| B-WR-06 | warning | The renderer write policy accepts keys the sidecar mirror then drops, so Rust and TS views diverge | open |
| B-WR-07 | warning | `plain_name` accepts `:`, so a `GamesConfig/<app>` name can escape its directory on Windows | open |
| B-WR-08 | warning | Confirmed writes (`sidecar:store-set-checked`) are not ordered against fire-and-forget writes | open |
| B-WR-09 | warning | A panic while handling a frame leaves it unanswered forever | open |
| B-WR-10 | warning | Runtime-cache allow-list `RUNTIME_CACHE_NAMES` owns nothing the table does not already own | open |
| B-IN-01 | info | Stale `allow(dead_code)` suppressions that reference a call site that already exists | open |
| B-IN-02 | info | Duplicated helpers across the store files | open |
| B-IN-03 | info | `storeNew` opens the file of the denied `humble_library` cache | open |
| B-IN-04 | info | `GAMELIB_STORE_BOOT` is inherited from the parent environment when the shell has nothing to say | open |
| B-IN-05 | info | A rejected frame's `refused` nack bypasses the worker's FIFO, contradicting the module's stated ordering | open |
| B-IN-06 | info | With no dispatcher configured, every store frame is dropped with a log line and no nack | open |
| B-IN-07 | info | The 10 MB frame cap is checked after the line is read and parsed in full | open |
| B-IN-08 | info | The bottle-file handlers follow symlinks and read the whole file unbounded | open |
| B-IN-09 | info | The boot candidate scan is not covered by the boot bounds | open |
| C-WR-01 | warning | `resetHeroic` deletes the settings documents but never drops their mirror cells | open |
| C-WR-02 | warning | Uninstall's "remove settings" leaves the cached `GameConfig` instance serving and re-writing the deleted settings | open |
| C-WR-03 | warning | `validateStoreFrame` measures frame size in UTF-16 code units, the shell in bytes | open |
| C-WR-04 | warning | Corpus harvester denylist does not cover the secret key names this codebase itself documents | open |
| C-WR-05 | warning | Redaction (and `placeholderOf`) silently drops a `__proto__` key | open |
| C-WR-06 | warning | Boot snapshot overwrite can clobber a newer re-fetch started by an `invalidated` push | open |
| C-IN-01 | info | `MirrorCell.write` mutates state before `sink.send`; a throwing sink leaves a never-answered op | open |
| C-IN-02 | info | `GameLibStore.set(object)` applies a partial update when a later value is invalid | open |
| C-IN-03 | info | Ack schema caps `store` at 128 chars, a `GamesConfig/<name>` store key can be 267 | open |
| C-IN-04 | info | Dead and duplicated surface in the new store modules | open |
| C-IN-05 | info | Necessity: `tsEntries` is always `[]` | open |
| C-IN-06 | info | Necessity: `StoreOptions` still carries options the mirror ignores | open |
| C-IN-07 | info | `public/changelog.json` is internally inconsistent | open |
