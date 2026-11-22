---
phase: 85-store-host-config-and-versioned-migrations
source: 85-REVIEW.md
created: 2026-11-22
findings: 50
---

# Phase 85: Code Review Disposition

One row per finding in `85-REVIEW.md`. Every finding starts as `open`. `open` means triaged into the post-phase decision (fix now or file as todos), not forgotten.

Reconciled 2026-11-22 against `85-REVIEW-FIX.md` (iteration 1, scope critical_warning): 19 fixed, 2 skipped. B-WR-10 is a necessity finding, out of that scope, and stays `open` with the 21 info findings.

Round 2 (review committed after the fixes; round 1 is at `5714cafea`) verified 16 of the 19 fixes and added seven `D-` rows, all `open`. D-WR-01, D-WR-02 and D-WR-03 reopen B-WR-02, B-WR-03 and C-WR-06; all three were fixed in round-2 fix iteration 2 (`85-REVIEW-FIX.md`). The D-IN rows stay `open`.

All 22 round-1 warnings were triaged in 85 UAT (Test 3, 2026-11-22): 19 fixed (B-WR-02, B-WR-03 and C-WR-06 completed in round 2), A-WR-03 won't fix, C-WR-01 and B-WR-10 deferred to todos. The info rows (round 1 and round 2) stay `open`; they were not part of that triage.

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| A-WR-01 | warning | `Synced` writes never fsync the parent directory, so the rename can be lost after a crash | fixed (58dbcb8c5) |
| A-WR-02 | warning | Refuse-newer fails open for absurd stamped versions in the engine, but closed in `version_gate` | fixed (fe76120d1) |
| A-WR-03 | warning | A lone-surrogate escape in a TS-written file locks a user-state, account or settings store read-only | skipped (won't fix: the D-18 rejection of lone surrogates stands, decided by the operator in 85 UAT on 2026-11-22) |
| A-WR-04 | warning | `dotpath::set` has no bound on array index or path depth, so a hostile or buggy key aborts the process | fixed (8861f6f3d) |
| A-WR-05 | warning | `gamelib-store-cli open --dry-run` leaves a partial copy of token stores in the system temp directory on any copy error | fixed (8805d74cd) |
| A-WR-06 | warning | A leftover temp file (crash orphan) is never swept, and a temp-name collision fails the write instead of retrying | fixed (bfd28ae47) |
| A-IN-01 | info | In-place fallback truncates the real file and keeps a loose existing mode | open |
| A-IN-02 | info | `Op::Replace` breaks two promises in the module docs | open |
| A-IN-03 | info | Unused dependencies | open |
| A-IN-04 | info | README still describes the retired `gamelib_core::store` | open |
| A-IN-05 | info | Dispatcher spawn failure is swallowed, so listeners silently never fire | open |
| B-WR-01 | warning | Queued renderer store writes are dropped at exit and nothing drains them | fixed (4a743b730) |
| B-WR-02 | warning | The `store` drain runs concurrently with the other drains while the sidecar is still alive, and no wait follows the child stage | fixed (1b23669f1) |
| B-WR-03 | warning | `GAMELIB_STORE_BOOT` has no size bound and can make the sidecar spawn fail | fixed (2ff2aa7b7) |
| B-WR-04 | warning | `safety_remove_tree` pauses the entire store frame worker for the whole delete, even when no `app-data` target is present | fixed (7cddb57f9) |
| B-WR-05 | warning | Eviction runs only on a fully `removed` outcome, and the renderer write path is never paused | fixed (66cc1deb5) (partial: evict on `failed` only; pausing renderer writes during removal left open) |
| B-WR-06 | warning | The renderer write policy accepts keys the sidecar mirror then drops, so Rust and TS views diverge | fixed (6951c3392) |
| B-WR-07 | warning | `plain_name` accepts `:`, so a `GamesConfig/<app>` name can escape its directory on Windows | fixed (feae34d50) |
| B-WR-08 | warning | Confirmed writes (`sidecar:store-set-checked`) are not ordered against fire-and-forget writes | fixed (a8fcd4a2b) |
| B-WR-09 | warning | A panic while handling a frame leaves it unanswered forever | fixed (bc1a7ece6) |
| B-WR-10 | warning | Runtime-cache allow-list `RUNTIME_CACHE_NAMES` owns nothing the table does not already own | deferred (`.planning/todos/pending/2026-11-22-runtime-cache-names-allow-list-owns-nothing.md`) |
| B-IN-01 | info | Stale `allow(dead_code)` suppressions that reference a call site that already exists | open |
| B-IN-02 | info | Duplicated helpers across the store files | open |
| B-IN-03 | info | `storeNew` opens the file of the denied `humble_library` cache | open |
| B-IN-04 | info | `GAMELIB_STORE_BOOT` is inherited from the parent environment when the shell has nothing to say | open |
| B-IN-05 | info | A rejected frame's `refused` nack bypasses the worker's FIFO, contradicting the module's stated ordering | open |
| B-IN-06 | info | With no dispatcher configured, every store frame is dropped with a log line and no nack | open |
| B-IN-07 | info | The 10 MB frame cap is checked after the line is read and parsed in full | open |
| B-IN-08 | info | The bottle-file handlers follow symlinks and read the whole file unbounded | open |
| B-IN-09 | info | The boot candidate scan is not covered by the boot bounds | open |
| C-WR-01 | warning | `resetHeroic` deletes the settings documents but never drops their mirror cells | deferred (`.planning/todos/pending/2026-11-22-reset-heroic-leaves-settings-mirror-cells.md`) |
| C-WR-02 | warning | Uninstall's "remove settings" leaves the cached `GameConfig` instance serving and re-writing the deleted settings | fixed (97aed9670) |
| C-WR-03 | warning | `validateStoreFrame` measures frame size in UTF-16 code units, the shell in bytes | fixed (ff0988f17) |
| C-WR-04 | warning | Corpus harvester denylist does not cover the secret key names this codebase itself documents | fixed (e3b769703) |
| C-WR-05 | warning | Redaction (and `placeholderOf`) silently drops a `__proto__` key | fixed (abf1d82da) |
| C-WR-06 | warning | Boot snapshot overwrite can clobber a newer re-fetch started by an `invalidated` push | fixed (b6f1d968d) |
| C-IN-01 | info | `MirrorCell.write` mutates state before `sink.send`; a throwing sink leaves a never-answered op | open |
| C-IN-02 | info | `GameLibStore.set(object)` applies a partial update when a later value is invalid | open |
| C-IN-03 | info | Ack schema caps `store` at 128 chars, a `GamesConfig/<name>` store key can be 267 | open |
| C-IN-04 | info | Dead and duplicated surface in the new store modules | open |
| C-IN-05 | info | Necessity: `tsEntries` is always `[]` | open |
| C-IN-06 | info | Necessity: `StoreOptions` still carries options the mirror ignores | open |
| C-IN-07 | info | `public/changelog.json` is internally inconsistent | open |
| D-WR-01 | warning | The post-children store wait does not wait for the sidecar's reader, so late frames are still missed (reopens B-WR-02) | fixed (f7f154b01) |
| D-WR-02 | warning | The capped `GAMELIB_STORE_BOOT` drops the core stores first, and the `truncated` marker has no reader (reopens B-WR-03) | fixed (4c27efe9d) |
| D-WR-03 | warning | `hydrateStoreSnapshot` now returns before the re-fetch it defers to has landed (reopens C-WR-06) | fixed (efe601a78) |
| D-IN-01 | info | The store slice's queue is now owned by the context its own worker holds, so the worker thread can never end | open |
| D-IN-02 | info | The Rust game-config name rule is now closed, and the TS rule is still the old deny list | open |
| D-IN-03 | info | The temp-collision test can pass without colliding | open |
| D-IN-04 | info | The renderer still applies an empty-segment key to its own snapshot optimistically | open |
