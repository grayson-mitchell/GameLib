---
phase: 85-store-host-config-and-versioned-migrations
reviewed: 2026-11-22
depth: standard
files_reviewed: 69
files_reviewed_list:
  - .github/workflows/rust-test.yml
  - meta/genIpcContract.ts
  - meta/genStoreSchemas.ts
  - meta/genStoreTable.ts
  - meta/harvestStoreCorpus.ts
  - public/changelog.json
  - src-tauri/Cargo.toml
  - src-tauri/crates/README.md
  - src-tauri/crates/gamelib-core/Cargo.toml
  - src-tauri/crates/gamelib-core/src/lib.rs
  - src-tauri/crates/gamelib-store-cli/Cargo.toml
  - src-tauri/crates/gamelib-store-cli/src/main.rs
  - src-tauri/crates/gamelib-store/Cargo.toml
  - src-tauri/crates/gamelib-store/src/atomic.rs
  - src-tauri/crates/gamelib-store/src/backup.rs
  - src-tauri/crates/gamelib-store/src/dotpath.rs
  - src-tauri/crates/gamelib-store/src/engine.rs
  - src-tauri/crates/gamelib-store/src/envelope.rs
  - src-tauri/crates/gamelib-store/src/host.rs
  - src-tauri/crates/gamelib-store/src/json.rs
  - src-tauri/crates/gamelib-store/src/lib.rs
  - src-tauri/crates/gamelib-store/src/migrate/libraries.rs
  - src-tauri/crates/gamelib-store/src/migrate/mod.rs
  - src-tauri/crates/gamelib-store/src/migrate/settings.rs
  - src-tauri/crates/gamelib-store/src/migrate/strip.rs
  - src-tauri/crates/gamelib-store/src/ops.rs
  - src-tauri/crates/gamelib-store/src/schema.rs
  - src-tauri/crates/gamelib-store/src/table.rs
  - src-tauri/crates/gamelib-store/src/version_gate.rs
  - src-tauri/src/log_upload.rs
  - src-tauri/src/main.rs
  - src-tauri/src/native_router.rs
  - src-tauri/src/relay_commands.rs
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/safety_dispatch.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/store_boot.rs
  - src-tauri/src/store_dispatch.rs
  - src-tauri/src/store_gate_dispatch.rs
  - src-tauri/src/store_native.rs
  - src-tauri/src/store_policy.rs
  - src/backend/config.ts
  - src/backend/engine/engineConfig.ts
  - src/backend/engine/engineSwitch.ts
  - src/backend/game_config.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/sidecar/storeWriteHandlers.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/titleSettings.ts
  - src/backend/store_backend.ts
  - src/backend/stores/bottleVersionGate.ts
  - src/backend/stores/dotPath.ts
  - src/backend/stores/mirrorCell.ts
  - src/backend/stores/settingsDocs.ts
  - src/backend/stores/storeFrames.ts
  - src/backend/stores/storeRoot.ts
  - src/backend/testUtils/diskStoreSink.ts
  - src/backend/utils/schemaStrip.ts
  - src/backend/utils/uninstaller.ts
  - src/common/types/ipc/native.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/common/types/ipc/sidecarInternal.ts
  - src/common/types/sidecarTransport.ts
  - src/common/types/storePolicy.ts
  - src/common/types/typed_store.ts
  - src/preload/tauriTransport.ts
findings:
  critical: 0
  warning: 22
  info: 21
  total: 43
status: issues_found
---

# Phase 85: Code Review Report

Three reviewers ran in parallel over the phase's production files, one per area: A covers the gamelib-store crates, B the Rust shell, C TypeScript and meta. Test files, generated files (`ipc_contract.rs`, `builtinTokens.generated.json`) and lockfiles were left out. Finding IDs carry the part letter (A-/B-/C-) so they cannot collide.

**Totals:** 0 critical, 22 warning, 21 info.

| Part | Scope | Critical | Warning | Info |
|---|---|---|---|---|
| A: gamelib-store, gamelib-store-cli | 22 files | 0 | 6 | 5 |
| B: Rust shell (`store_*.rs`, `sidecar.rs`, store parts of `main.rs`) | 13 files | 0 | 10 | 9 |
| C: TypeScript and meta | 34 files | 0 | 6 | 7 |

Part C read about 25 files in full and diff-skimmed the rest of its list. In part B, `main.rs` was reviewed for its store-related code only. The Phase 84 and Phase 100 changes that share files in the diff range are out of scope.

---

## Phase 85 Part A: Code Review Report

**Depth:** standard. Production code in all 22 files was read in full. The `#[cfg(test)]` modules in `host.rs` after line 800 were skimmed only. `src-tauri/src/store_gate_dispatch.rs` was read for the path-validation boundary that `version_gate` and `backup` depend on.

### Summary

The store crates are carefully built. The decision order in `engine.rs` holds up:

- A corrupt file is copied aside before anything else, and the original is never rewritten.
- The pre-migration backup is written before any step runs.
- The migrated file is written atomically, and a failure at any point leaves the original bytes and a read-only store.
- Side-file pruning never deletes the file just written.
- Dot-path segment parsing matches dot-prop 6.
- `__internal__` first-segment refusal cannot be bypassed by backslash escapes.
- Parse depth is bounded by serde_json's 128 limit.
- I found no `unwrap` or index panic reachable from untrusted file content in production code.
- The in-repo path-traversal surface sits in the shell (`valid_bottle_path`), which is part B. The crate-level functions take caller-validated paths.
- File modes: every `write_atomic` target is created 0600 (Unix), new directories 0700, and token-bearing existing paths are tightened on open.
- No Critical issues. The warnings below are durability, version-gate consistency and untrusted-key robustness issues.

### Warnings

#### A-WR-01: `Synced` writes never fsync the parent directory, so the rename can be lost after a crash

**File:** `src-tauri/crates/gamelib-store/src/atomic.rs:136-154` (design note at lines 22-26)
**Issue:** `Durability::Synced` is documented as "a crash right after the write must not lose it" (D-21). The code `sync_all`s the temp file, then renames it, and never fsyncs the containing directory. On ext4, xfs and btrfs a power loss or kernel crash after `rename` returns can leave the old directory entry in place. The write is acknowledged and a `StoreChange` is emitted, but after reboot the file holds the previous content. This is the same gap for `write_pre_migration_backup` and `write_corrupt_copy`, which are also `Synced`. The ordering "backup durable, then migrated file replaces original" is therefore not guaranteed across a crash. A migration could survive while its backup's directory entry does not.
**Fix:** After a successful rename, when `durability == Synced`, open the parent and `sync_all` it. Do this on Unix only; on Windows opening a directory handle is not generally possible, so skip it there. If this matches TS (write-file-atomic also skips the directory), say so in the doc comment and weaken the "must not lose it" claim.
```rust
#[cfg(unix)]
if durability == Durability::Synced {
    if let Ok(dir) = File::open(parent) {
        let _ = dir.sync_all();
    }
}
```

#### A-WR-02: Refuse-newer fails open for absurd stamped versions in the engine, but closed in `version_gate`

**File:** `src-tauri/crates/gamelib-store/src/envelope.rs:36-48` and `:104`; contrast `version_gate.rs:51-62`
**Issue:** `store_version` and `settings_version` map any version above `u32::MAX` to 0 (`u32::try_from(..).unwrap_or(0)`, `major.parse::<u32>().unwrap_or(0)`). A file stamped `schemaVersion: 99999999999` or `version: "v99999999999"` is therefore read as unstamped v0. Under a baseline chain the file is `Adopted`, and the next write overwrites the envelope with the current version. Under a migrating chain it is backed up and migrated. That is the opposite of the Phase 68 refuse-newer rule. The TS codec `Number.isInteger(raw) && raw >= 0` returned the large number, which is greater than current and so read-only. `version_gate::codec_version` in the same crate clamps to `u32::MAX` and reports `Newer`, so the two codecs disagree on the same input. The test `store_version_is_zero_for_everything_else` pins the fail-open case (`99999999999` -> 0). The comment "nonsense reads as 0" is wrong for this one input class, because the file was stamped by some other writer that clearly did not use this scheme.
**Fix:** Clamp to `u32::MAX` as `version_gate` does, so the file reads as newer and is refused:
```rust
Num::U(u) => u32::try_from(*u).unwrap_or(u32::MAX),
Num::I(i) if *i >= 0 => u32::try_from(*i).unwrap_or(u32::MAX),
Num::I(_) => 0,
// F: if finite, integral and >= 0 then (*f).min(f64::from(u32::MAX)) as u32
```
In `settings_version`, use `major.parse::<u64>().map_or(0, |n| u32::try_from(n).unwrap_or(u32::MAX))`. Update the test to expect read-only.

#### A-WR-03: A lone-surrogate escape in a TS-written file locks a user-state, account or settings store read-only

**File:** `src-tauri/crates/gamelib-store/src/json.rs:294-296` (`parse`), consumed at `engine.rs:136-161`
**Issue:** serde_json rejects `"\ud800"`. `JSON.parse` accepts it, and well-formed `JSON.stringify` emits exactly this escape for a string truncated mid surrogate pair (for example `title.slice(0, n)` on an emoji). Such a file is a valid store file for the TS stack. Under the new engine the whole document is "not a store": a corrupt copy is written, and every non-cache kind opens `ReadOnly(Failed)`. Every later write is refused for the life of the file, and the user has no recovery path. The corpus NOTES record this as a known `rustParse: reject` divergence. It is still a user-visible availability regression for `UserState`, `Account` and `Settings` (including `store_cache/steam_library`, which holds titles and descriptions), and it is not mentioned as an accepted risk anywhere user-facing.
**Fix:** Accept lone surrogates on read, since JS accepts them. Either pre-process escapes (map an unpaired `\uD800`-`\uDFFF` escape to `�`, noting that the bytes then change) or parse with a custom string path. If rejection is a deliberate decision, confine its blast radius. For non-cache kinds, repair the offending string and continue with a backup instead of going permanently read-only. At minimum, surface the read-only reason to the user.

#### A-WR-04: `dotpath::set` has no bound on array index or path depth, so a hostile or buggy key aborts the process

**File:** `src-tauri/crates/gamelib-store/src/dotpath.rs:58-68` and `:127-136`; reached through `ops.rs:54-60` and `host.rs:366`
**Issue:** `array_index` accepts any canonical decimal up to `u32::MAX`, and `set` then runs `while a.len() <= idx { a.push(Json::Null) }`. A set of `"list.4294967290"` against an existing array tries to allocate tens to hundreds of GB. Rust allocation failure aborts the whole shell or sidecar, and `Result` does not catch it. In JS the same assignment creates a sparse array, and the later `JSON.stringify` throws a `RangeError`. TS therefore fails an op, not the process. Separately, a key with tens of thousands of `a.a.a...` segments builds an object nested far beyond the 128 parse limit. `to_store_bytes`, `clone` (taken on every `apply_inner`), `PartialEq` and `Drop` all recurse without bound, so this overflows the stack. Keys reach `apply` from the renderer and sidecar, which `store_dispatch.rs` (part B) must validate, but the crate documents `set` as total.
**Fix:** Refuse in `set` when `idx > a.len() + MAX_HOLE` (for example 1024), and when `segs.len() > 64`. Return `false` so `ops::apply` maps it to `OpReject::KeyPath`, and the host rolls back as it does for other rejections. Add a test with `"list.4294967290"` and with a 100,000-segment path.

#### A-WR-05: `gamelib-store-cli open --dry-run` leaves a partial copy of token stores in the system temp directory on any copy error

**File:** `src-tauri/crates/gamelib-store-cli/src/main.rs:253-258` (and `:144`)
**Issue:** `--dry-run` copies every store, including `steam_store/config.json` and `humble_store/config.json`, into `<tmp>/gamelib-store-cli-<pid>-<nanos>/`. A `fs::copy` failure (unreadable file, ENOSPC) propagates through `copy_dir_files(...)?` to `unwrap_or_else(|e| { eprintln!(...); exit(2) })`. The `fs::remove_dir_all(dir)` at line 273 is never reached. The partial scratch tree stays behind, with token material in plain files. The files inherit the source mode, and only the directory is 0700. A panic inside `open_file` (or Ctrl-C) leaves the same residue.
**Fix:** Make a scoped cleanup that always runs, and remove the scratch tree on the error path before `exit`:
```rust
struct Scratch(PathBuf);
impl Drop for Scratch { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
```
In the error arm, call `fs::remove_dir_all(&dir)` before `exit(2)`, because `exit` skips destructors.

#### A-WR-06: A leftover temp file (crash orphan) is never swept, and a temp-name collision fails the write instead of retrying

**File:** `src-tauri/crates/gamelib-store/src/atomic.rs:129-136`
**Issue:** The temp name is `<name>.<pid>.<seq>.tmp` with a per-process `AtomicU64` seq starting at 0, opened with `create_new`. If the process dies between create and rename, a 0600 `*.tmp` holding full store bytes (possibly tokens) stays forever. Nothing in the crate removes it, and `row_for_path` and the settings walker deliberately ignore it. A later process with the same PID and seq (PIDs are small and constant in containers and sandboxes) then gets `AlreadyExists` from `create_new(true)`. The `?` returns the error and the write fails. `apply_inner` rolls back and surfaces `ApplyError::Io(AlreadyExists)` to the caller, a real user save failing for a reason it cannot act on. The next call uses the next seq and succeeds, so it is intermittent.
**Fix:** In the create loop, on `AlreadyExists` take the next seq and retry (bounded, for example 8 attempts). Optionally sweep `<name>.*.tmp` older than a minute for the store being opened.

### Info

#### A-IN-01: In-place fallback truncates the real file and keeps a loose existing mode

**File:** `src-tauri/crates/gamelib-store/src/atomic.rs:156-163`
**Issue:** When the rename fails for any reason, not just the Windows-sharing cases `is_retryable` names, the code reopens the target with `truncate(true)` and writes in place. A failure or crash mid-write leaves a truncated token or settings file, which the engine then treats as corrupt on next boot. The caller also sees an error and rolls memory back, so memory and disk disagree. The mode set by `private_options` applies only on create, so an existing 0644 file written through the fallback stays 0644. The atomic path would have made it 0600. This is the documented TS WR-05 behaviour, but it is only needed on Windows. The fallback is also unaffected by the A-WR-01 directory sync.
**Fix:** Gate the fallback to `cfg(windows)` or to `is_retryable` errors. On Unix after a hard rename failure, return the error. If it stays, `set_permissions(0o600)` on the existing file first.

#### A-IN-02: `Op::Replace` breaks two promises in the module docs

**File:** `src-tauri/crates/gamelib-store/src/ops.rs:73-78`, `:3-8`
**Issue:**
1. The module doc says callers can never reach the `__internal__` envelope. A `Replace(obj)` carrying `__internal__` with extra keys or other namespaces writes them through, because `stamp_for_write` only overwrites `gamelib.schemaVersion`. This is conf `store.store = obj` parity, but the doc and the `a_write_naming_the_envelope_is_refused` test cover only `Set` and `Delete`.
2. `changed = *doc != next` compares the full document, envelope or `version: "vN"` included, with an obj that usually has none (for example a `snapshot` round trip). A logically identical Replace therefore always reports changed. It rewrites the file, bumps `rev` and emits a `StoreChange`, contradicting "setting a key to the value it already holds writes nothing" for the Replace form.
**Fix:** Compare `strip_envelope(doc)` against `strip_envelope(next)` (and ignore the settings `version`) to decide `changed`. Either strip a caller-supplied `__internal__` before applying a Replace from non-Rust origins, or state in the docs that Replace is the one path that can write it.

#### A-IN-03: Unused dependencies

**File:** `src-tauri/crates/gamelib-store/Cargo.toml:14` and `src-tauri/crates/gamelib-store-cli/Cargo.toml:14`
**Issue:** `gamelib-core` is a dependency of `gamelib-store` but nothing in `src/` or `tests/` references `gamelib_core`. The store was meant to be Tauri-free, and this pulls tokio and tokio-util into every store build for no reason. `serde_json` is a dependency of `gamelib-store-cli`, but neither `src/main.rs` nor `tests/cli.rs` uses it.
**Fix:** Remove both. `cargo udeps` or `cargo machete` will confirm.

#### A-IN-04: README still describes the retired `gamelib_core::store`

**File:** `src-tauri/crates/README.md:370-373`
**Issue:** The "A minimal `StoreHost` for one store" bullet says `gamelib_core::store` "carries the minimal core ... and phase 85 widens the same owner". That module was deleted from `gamelib-core` in this phase (`lib.rs` no longer lists `store`), and the owner now lives in `gamelib-store`. The same stale reference exists in `tests/fixtures/golden/NOTES.md:60` ("The `gamelib-core` `store.rs` header"). The README also has no section for the Phase 85 store crates beyond the one-line crate list on line 17.
**Fix:** Reword the bullet to say the minimal host was widened and moved into `gamelib-store` in 85-09. Add a short store section covering the ordered `Json`, the engine decision order, the side-file families, and the version gate.

#### A-IN-05: Dispatcher spawn failure is swallowed, so listeners silently never fire

**File:** `src-tauri/crates/gamelib-store/src/host.rs:181-211`
**Issue:** If `thread::Builder::spawn` fails, the listener is already pushed onto `listeners`, `tx` stays `None`, and `listening()` stays false. The sidecar mirror and the renderer's change pushes then never fire, with no log line and no error, and the stores keep writing. `spawned` is only tested with `.is_ok()`.
**Fix:** Log the error kind via `eprintln!` (the file already does this for `tighten failed`). Consider returning a `Result` from `on_change` / `on_any_change` so a caller can fail startup loudly.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Phase 85 Part B: Rust shell code review

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 13 (main.rs reviewed for store boot, store drain, keyring pins, module registration only)
**Status:** issues_found

### Summary

The renderer write policy is sound. I traced reserved keys, prototype segments, escaped-dot paths, writable fields, unknown stores, the denied `humble_library` store and `refreshToken`. I found no bypass: Rust splits on `.` while `dotpath::segments` joins on backslash escapes, and every divergence I could construct errs toward refusal. Frame parsing, the queue (unbounded by design, warning at 256), the worker's `catch_unwind`, the host's single `store-events` dispatcher thread and the keyring pins all hold up. Nothing in the reviewed code panics on untrusted input. `store_policy()` panics only on a build defect.

The defects are concentrated in the exit and removal paths and in places where two validation paths disagree. Nothing rises to a crash or a security hole, so there are no criticals. Eight things matter:

- Renderer writes queued on the `store` slice are dropped on exit, and nothing drains them.
- The `store` exit drain runs while the sidecar is still alive and producing frames, and no wait follows the child stage.
- `GAMELIB_STORE_BOOT` has no size bound and can break sidecar spawn.
- `safety_remove_tree` pauses the whole frame worker for the full delete.
- The eviction skips a partial (`failed`) removal.
- The renderer write path accepts keys that the sidecar mirror then drops.
- `plain_name` lets a Windows drive prefix through `PathBuf::join`.
- Confirmed (`store-set-checked`) writes are not ordered against fire-and-forget writes.

I did not read `graphify-out/GRAPH_REPORT.md` or `graph.json`. The `graphify query` hook was not followed. The files were named in the task, and I read them directly.

Necessity rubric (`necessity-review.md`) was read. One necessity finding is recorded (WR-10).

### Warnings

#### B-WR-01: Queued renderer store writes are dropped at exit and nothing drains them

**File:** `src-tauri/src/native_router.rs:209-213`, `src-tauri/src/main.rs:956-962`
**Issue:** `storeSet`, `storeDelete` and `storeNew` run on the `store` slice worker (`spawn_slice_worker`). That worker holds a `Registrant` only while a job is running. Once `shutdown.drain()` cancels the token (its first statement), the loop's `if token.is_cancelled() { continue; }` silently discards every job still queued. The `store` exit drain (`store_boot::drain`) waits only on the sidecar frame queue (`store_dispatch::wait_idle`) and on `host().wait_idle` (applies in flight). It never sees jobs sitting in the slice channel, so those writes are neither waited for nor applied. They are fire-and-forget, so the renderer never learns.

Burst writes make this reachable. A zoom or theme slider sends one write per tick, and `Synced` stores fsync each one, so a backlog builds. A quit right after the last tick loses the final value. This breaks Rust shutdown contract rule 2: work that must finish holds a registrant, and queued-but-not-started work holds none. D-14's "drop on cancel" is correct for log lines but wrong for persisted user state. The sidecar frame worker (`store_dispatch`) handles this case correctly.
**Fix:** Take a registrant when a write is enqueued and release it after the job runs, or skip the cancel-drop for the store slice. For example, give `spawn_slice_worker` a `drain_on_cancel: bool`, set true for `STORE_SLICE`. Alternatively add a slice-queue depth counter that `store_boot::drain` waits on.

```rust
// store slice: do not discard persisted writes on cancel
if token.is_cancelled() && !drain_on_cancel { continue; }
```

#### B-WR-02: The `store` drain runs concurrently with the other drains while the sidecar is still alive, and no wait follows the child stage

**File:** `src-tauri/src/main.rs:928-998`, `src-tauri/src/store_boot.rs:252-257`
**Issue:** `run_exit` runs all drains concurrently and then the children stage, which SIGTERMs the sidecar and waits up to 1.5 s. The `store` drain samples `wait_idle` once at t=0 and returns as soon as the queue is empty. Meanwhile the depot and steamcm drains run for up to 3.5 s with the sidecar live. It keeps emitting frames, and the reader thread keeps enqueuing them. The worker takes a registrant on enqueue, so frames that arrive during the drain stage are covered by `shutdown.drain`.

Frames that arrive after `shutdown.drain` returns are not covered. That includes everything the sidecar writes while it handles SIGTERM or the kill during `children()`. The reader thread is still enqueuing, the worker is applying, and `finish` then lets the process exit with `store-frames` possibly mid-apply or with frames still queued. Nothing re-checks `store_dispatch::wait_idle` after `children()`. The sidecar is the only source of frames, so the correct wait point is after it has stopped (reader EOF), not before. The TS flush and pending-operations confirm covers the normal quit, but this is the safety net the drain exists to provide.
**Fix:** After `children(remaining)` and before `finish`, run a bounded `store_boot::drain(budget.total - start.elapsed())`. Alternatively, move the `store` drain to run after the children stage. This stays inside the one 5 s budget; it takes the budget's slack, not a new wait.

#### B-WR-03: `GAMELIB_STORE_BOOT` has no size bound and can make the sidecar spawn fail

**File:** `src-tauri/src/store_boot.rs:212-236`, `src-tauri/src/sidecar.rs:264-266`, `src-tauri/src/sidecar.rs:325-327`
**Issue:** `boot_env_value` serialises every read-only and start-empty store key into one environment variable, about 70 bytes per entry. After a downgrade, or with any newer-schema profile, every `GamesConfig/<app>` document opens `ReadOnly { Newer }`. The boot sweep opens up to `BOOT_SWEEP_MAX_FILES` = 10,000 documents, and nothing caps this list.

Windows limits a single environment variable to 32,767 characters, about 450 documents. Linux limits one string to `MAX_ARG_STRLEN` = 131,072 bytes. Past either limit `Command::spawn` fails (E2BIG or invalid-parameter), so the user sees the "could not start its backend process" fatal dialog. A downgrade then leaves the app unable to start. The host already knows the same set through `read_only_entries()`, and `store_read_only_notice` merges it, so the env var is only the sidecar mirror's synchronous boot hint.
**Fix:** Cap the payload (for example at 16 KiB). When truncated, emit a `"truncated": true` marker and let the mirror treat unknown stores as read-only until the host's `changed`/`refused` events arrive. Or pass the list as a first stdin frame or a temp file.

#### B-WR-04: `safety_remove_tree` pauses the entire store frame worker for the whole delete, even when no `app-data` target is present

**File:** `src-tauri/src/safety_dispatch.rs:23-25`
**Issue:** `let _paused = pause_for_removal();` is unconditional. The guard lives until the function returns, so the worker takes no frame for as long as `gamelib_safety::dispatch("safety_remove_tree")` runs. That call is a synchronous recursive delete of the targets, which can be a multi-GB game install or Wine prefix. Every store (downloads, installed lists, play history, accounts) stops persisting for the duration. Frames pile up in memory (the queue is unbounded and only warns at 256). The `store` registrant stays held, and sidecar `flush` waiters time out. A crash or SIGKILL during the removal loses all of those writes. The pause is only needed when a target is `kind: "app-data"`, since those are the only ones that evict.
**Fix:** Pause only when the request holds an `app-data` target, and hold the pause for the shortest span.

```rust
let has_app_data = args.first().and_then(|r| r.get("targets")).and_then(Value::as_array)
    .is_some_and(|t| t.iter().any(|t| t.get("kind").and_then(Value::as_str) == Some("app-data")));
let _paused = has_app_data.then(crate::store_dispatch::pause_for_removal).flatten();
```

#### B-WR-05: Eviction runs only on a fully `removed` outcome, and the renderer write path is never paused

**File:** `src-tauri/src/safety_dispatch.rs:26-29`, `src-tauri/src/safety_dispatch.rs:33-52`
**Issue:** Two gaps in the T-85-38 guarantee that a queued write never recreates a deleted store file:
1. A `failed` outcome (some targets removed, a later one not) evicts nothing. The module comment concedes that "a failed removal may have deleted an earlier target". The open `Store` for a deleted `GamesConfig` document keeps its in-memory view and the queued frames stay live. The next write or exit drain rewrites the whole document and resurrects the file the user just reset. Eviction is idempotent and cheap, so over-evicting on a partial failure is harmless, whereas under-evicting is the exact defect the code exists to prevent.
2. The pause covers only the sidecar frame worker. `storeSet`, `storeDelete`, `storeNew` and `store-set-checked` apply on the slice worker or `spawn_blocking`, and none is paused. A renderer write to a store under the removed path, landing between the delete and `evict_path`, recreates the file.

The eviction path is also built from the raw `args` path string. `Path::starts_with` is component-wise and case-sensitive, so a spelling difference from the opened store's path (case on macOS or Windows, or a symlinked user-data directory) evicts nothing, silently.
**Fix:** Evict every `app-data` target for `removed` and `failed` outcomes; only a `refused` outcome evicts nothing. Take the eviction path from the reply if the safety crate returns canonical paths. Consider rejecting renderer store writes while a removal pause is held (a shared `AtomicUsize` that `apply_renderer_write` checks).

#### B-WR-06: The renderer write policy accepts keys the sidecar mirror then drops, so Rust and TS views diverge

**File:** `src-tauri/src/store_native.rs:362-373`, `src-tauri/src/store_dispatch.rs:278-289`
**Issue:** `parse_store_frame` rejects any key with an empty segment (`a..b`, `.x`, `x.`, `.`) as `key-path`. `check_write_policy`, the renderer's choke point, checks only the reserved first segment, the prototype segments and writability, so those keys pass. `dotpath::set` then writes an empty-named key.

Rust announces the change to the sidecar as `changed {key}`. `MirrorCell.applyChanged` runs `validateStoreFrame` on a synthesised frame (`mirrorCell.ts` `opOfChange`). That check includes the empty-segment rule, so the event is dropped with a stderr line. The file holds a key that no TS reader ever sees, `baseRev` is not advanced for it, and a later `storeSet` delete from TS is refused `rejected`. The two validators, which the module docs say accept and reject "the same vectors", disagree on a renderer-reachable input.
**Fix:** Share one key-path validator. Reject empty segments in `check_write_policy`:

```rust
if key.split('.').any(str::is_empty) { return Err(WriteRefusal::KeyPath); }
```

Better, make `is_safe_key_path` itself reject them, and add a vector row to `storePolicyVectors.json` so the TS side agrees.

#### B-WR-07: `plain_name` accepts `:`, so a `GamesConfig/<app>` name can escape its directory on Windows

**File:** `src-tauri/src/store_dispatch.rs:124-131`, `src-tauri/src/store_dispatch.rs:210-220`
**Issue:** `plain_name` rejects `/`, `\`, NUL and `..`, but not `:`. `path_for` builds `user_data.join("GamesConfig").join(format!("{app}.json"))`. On Windows `PathBuf::join` treats an argument with a drive prefix and no root (`C:foo.json`) as replacing the entire base. A frame for store `GamesConfig/C:foo` therefore opens and writes `C:foo.json` relative to the process's current directory on drive C, outside user-data, and the boot sweep's filter shares the same predicate. Windows also reads `NUL`, `CON` and `COM1` as device names with any extension, and `name:stream` as an alternate data stream.

The frame source is the sidecar, which is trusted at this boundary, but any line printed to the sidecar's stdout can forge a `kind:"store"` frame (the reader's own comment says so for `openExternal`). `plain_name` is the T-85-37 path containment, and `gamelib_store::host::plain_segment` duplicates it, so both need the fix.
**Fix:** Allow only a safe character class, and reject reserved device names:

```rust
name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b' '))
```

Also trim trailing dots and spaces, and reject Windows reserved names. Do it in one place and have `host.rs` call it.

#### B-WR-08: Confirmed writes (`sidecar:store-set-checked`) are not ordered against fire-and-forget writes

**File:** `src-tauri/src/store_native.rs:467-476`, `src-tauri/src/native_router.rs:257-259`
**Issue:** `storeSet` and `storeDelete` are FIFO on the single `store` slice thread ("applied in send order"). `store_set_checked` applies on whatever `spawn_blocking` thread picks it up, with no ordering relative to the slice queue or to other concurrent checked writes. A renderer sequence `storeSet(a)`, then `await storeSetChecked(b)` on the same key can persist `b` and then `a`, so the final value is the older one. Two un-awaited checked writes to one key can swap. Under the sidecar path every write was serialised by Node's single thread, so this ordering was implicit and is now lost. The module docs promise send order for the store slice.
**Fix:** Route the checked write through the same slice worker and answer through a `oneshot`. Alternatively, serialise `apply_renderer_write` behind one `Mutex<()>` in `StoreReads` and queue checked writes behind pending sends.

#### B-WR-09: A panic while handling a frame leaves it unanswered forever

**File:** `src-tauri/src/store_dispatch.rs:521-524`
**Issue:** `catch_unwind(AssertUnwindSafe(|| self.handle(frame)))` correctly keeps the worker and the registrant alive. But `frame` is moved into `handle`, so on a panic nothing is sent back. The sidecar's `MirrorCell` keeps that `seq` in `pending` forever, so its view permanently shows a write the shell never applied. Any `flush` waiter for that frame fails only by timeout. The mirror already has a `refused` path for exactly this.
**Fix:** Capture `(seq, store)` before the call and reply on a panic:

```rust
let (seq, store) = (frame.seq, frame.store.clone());
if catch_unwind(AssertUnwindSafe(|| self.handle(frame))).is_err() {
    (self.log)("WARN: store frame worker recovered from a panic");
    self.reply(&store, 0, "refused", seq, Some("rejected"));
}
```

#### B-WR-10: Runtime-cache allow-list `RUNTIME_CACHE_NAMES` owns nothing the table does not already own

**File:** `src-tauri/src/store_dispatch.rs:159-185`
**Category:** necessity
**Issue:** Subtype: generality without instantiation. `runtime_cache_recognised(key, recognised)` is `row_for_key(key).is_some() || recognised.contains(&name)`. Every name in `RUNTIME_CACHE_NAMES` is a table row. The shipped test `store_frame_owned_row_takes_every_openable_row_and_refuses_unrecognised_runtime_names` asserts `row_for_key(&key).is_some()` for all five, and the doc comment says "today the runtime branch owns nothing the table does not already name". So in production the `||` right-hand side never decides anything. The list, `runtime_cache_recognised`, the `runtime_cache_row` branch of `row_for_store_key` and the test that pins the list to `storeChannels.json` are machinery for a hypothetical future runtime cache. The rubric's trust-boundary exemption does not apply: the same names are enforced by the table, and unknown names are refused at the `owned_row` row check.
**Fix:** Record the invariant and drop the list, or keep one source for it. If a future runtime cache is real, add it when it exists. Otherwise `owned_row` can be `row_for_store_key(key).filter(is_rust_owned)`.

### Info

#### B-IN-01: Stale `allow(dead_code)` suppressions that reference a call site that already exists

**File:** `src-tauri/src/store_policy.rs:32,87,91,112,147,158,186`
**Issue:** `#[cfg_attr(not(test), allow(dead_code))] // the write choke point (85-17) is its first caller`. The write choke point landed in 85-17 and `is_safe_key_path`, `is_writable_store_field`, `DISALLOWED_KEY_PATH_SEGMENTS` and `write_denied_fields` are all used in non-test code (`check_write_policy`). `recognized_cache_store_names()` and `lazy_stores()` are used by `renderer_names_for`. The attributes now mask any future real dead code in the policy module. Only `cache_store_name_pattern` is genuinely test-only.
**Fix:** Remove all but the one on `cache_store_name_pattern` and let the compiler speak.

#### B-IN-02: Duplicated helpers across the store files

**File:** `src-tauri/src/store_dispatch.rs:117-139`, `src-tauri/src/store_boot.rs:203-208`, `src-tauri/src/store_native.rs:605-610`
**Issue:** `cache_name` repeats `store_policy::is_plausible_cache_name`. `disallowed_segment` repeats `DISALLOWED_KEY_PATH_SEGMENTS`. `reason_word` is defined identically in `store_boot` and `store_native`. `plain_name` repeats `gamelib_store::host::plain_segment`. B-WR-06 and B-WR-07 are both symptoms of this: a rule fixed in one copy stays wrong in the others.
**Fix:** One definition per rule, re-exported from `store_policy` or `gamelib_store`.

#### B-IN-03: `storeNew` opens the file of the denied `humble_library` cache

**File:** `src-tauri/src/store_native.rs:497-524`
**Issue:** `humble_library` is in `recognizedCacheStoreNames` and passes `is_recognized_cache`. The only deny check lives in `is_allowed_store_field` and `is_readable_store`, so `store_new_blocking` opens `store_cache/humble_library` for the renderer. A policy-denied store is opened on renderer request (reading, migrating and possibly backing up its file), though no read or write is ever permitted. Harmless to data, but it is a side effect the policy says cannot happen.
**Fix:** Return `NewOutcome::Refused` when `policy().is_denied(name)`.

#### B-IN-04: `GAMELIB_STORE_BOOT` is inherited from the parent environment when the shell has nothing to say

**File:** `src-tauri/src/sidecar.rs:264-266`, `src-tauri/src/sidecar.rs:325-327`
**Issue:** The variable is set only when `Some`. With `None` the spawn does not `env_remove` it, so a stale value in the launching shell (a dev terminal, a wrapper script) makes the sidecar believe stores are read-only that the host opened fine.
**Fix:** `else { cmd.env_remove("GAMELIB_STORE_BOOT"); }` in both spawn paths.

#### B-IN-05: A rejected frame's `refused` nack bypasses the worker's FIFO, contradicting the module's stated ordering

**File:** `src-tauri/src/store_dispatch.rs:447-459`, `:14-22`
**Issue:** `enqueue` answers a rejected frame immediately from the reader thread via `host.post`. Earlier valid frames may still be queued in the worker, so `refused(seq=5)` can leave before `applied(seq=4)`. The module doc says "none overtakes an earlier change". The mirror tolerates this because it matches by `originSeq`, so it is a doc and invariant mismatch rather than a bug today. It would become one if the mirror ever relied on seq order.
**Fix:** Queue the nack as a pseudo-frame on the worker queue, or soften the doc to say only worker-produced replies are ordered.

#### B-IN-06: With no dispatcher configured, every store frame is dropped with a log line and no nack

**File:** `src-tauri/src/store_dispatch.rs:732-738`
**Issue:** With no home directory `CONFIG` is never set, so `global()` is `None`. Each frame logs "store frame dropped" with no `refused` reply, so the mirror keeps every op pending for the life of the process, and the log line repeats per frame.
**Fix:** Log once (an `AtomicBool`) and either nack via `SIDECAR` or tell the sidecar at boot that the shell owns no stores.

#### B-IN-07: The 10 MB frame cap is checked after the line is read and parsed in full

**File:** `src-tauri/src/sidecar.rs:435-450`, `src-tauri/src/store_dispatch.rs:233-235`
**Issue:** `BufReader::lines()` has no length bound, and `serde_json::from_str` parses the whole line before `parse_store_frame` compares `line_len` with `MAX_FRAME_BYTES`. The cap rejects and logs but protects neither memory nor time. The frame is then parsed a second time from `valueJson` by the ordered parser. The source is the trusted sidecar, so this is low risk, but the check is not the guard its name suggests.
**Fix:** Read with a bounded `take`/`read_until` limit, or check the raw line length before `from_str`.

#### B-IN-08: The bottle-file handlers follow symlinks and read the whole file unbounded

**File:** `src-tauri/src/store_gate_dispatch.rs:62-68`
**Issue:** `valid_bottle_path` validates the name and chain but not the file type. If `<bottle>/.gamelib-engine.json` is a symlink, `fs::read` follows it, reads it whole, and `write_pre_migration_backup` writes a `0600` copy of the target next to it. The caller is the sidecar and the directory is user-owned, so the impact is local only. The unbounded `fs::read` of a path the sidecar names is the more practical risk.
**Fix:** `symlink_metadata` and require a regular file, with a size cap.

#### B-IN-09: The boot candidate scan is not covered by the boot bounds

**File:** `src-tauri/src/store_boot.rs:62-100`, `:119-131`
**Issue:** `BOOT_SWEEP_MAX_FILES` and `BOOT_SWEEP_MAX_MS` are checked only between opens. `candidates()` runs first, listing `GamesConfig`, `row_for_path` and `is_file()` for every entry, then sorting, with no limit. A slow or huge directory delays `run_setup` on the main thread before the budget can act. One slow single open is also unbounded. This is rule 4 of the Rust shutdown contract, bound boot work.
**Fix:** Check the deadline inside the directory loop, or cap the directory entries read.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Phase 85 Part C (TypeScript): Code Review Report

**Reviewed:** 2026-11-22
**Depth:** standard
**Status:** issues_found

### Summary

The mirror cell protocol (pending list, rev ordering, nack handling, no-op ack rule, re-entrant ack
safety) holds up under hand-tracing: `pending.push` precedes `sink.send`, so a synchronous ack
(diskStoreSink) is safe; an `applied` ack above `baseRev` folds into base, one at or below it only
rebuilds the view; a `refused` ack drops the op. Prototype pollution is closed in `dotPath.ts`,
`applyOp` (own-property define for `replace`), `loadFile` and the `changed` replay. The sidecar exit
contract is respected (the only timer, `flush`'s deadline, is `unref()`ed; nothing runs at import).
`store_backend.ts` is a correct mirror-only facade.

The real defects are at the edges of the settings document seam (what survives a deleted file), the
corpus harvester's redaction (key-name coverage and fidelity), one preload race, and a frame-size
check that counts the wrong unit. No finding is a security hole in the committed corpus: I grepped
`src-tauri/crates/gamelib-store/tests/fixtures/corpus` for the account-shaped keys and home paths
and found only `REDACTED`/empty values and `/Users/operator`.

### Warnings

#### C-WR-01: `resetHeroic` deletes the settings documents but never drops their mirror cells

**File:** `src/backend/utils.ts:392-435` (caller side), `src/backend/stores/settingsDocs.ts:125`, `src/backend/stores/mirrorCell.ts:355-366`
**Issue:** The uninstaller calls `dropSettingsDoc` after a `removed` outcome (`uninstaller.ts:197`).
`resetHeroic` removes `GamesConfig/` and `config.json` through the same `guardedRemoveTree`, and the
shell evicts the open stores (`safety_dispatch.rs`), but TS never drops the matching cells. Until the
1 s relaunch timer fires:
1. `settingsDocExists`/`readSettingsDoc` still serve the deleted documents from the cell (`peek` hit).
2. Any settings write sends a `replace` frame the shell treats as a new document (it applies writes
   after an eviction). The shell store reopens at rev 1 while the surviving cell has `baseRev` N.
   The `applied` ack (rev 1) is `<= baseRev`, so the cell takes the "no-op ack" branch: the op is
   spliced out of `pending` but never folded into `base`, and the view reverts to the deleted
   document. The write is on disk and invisible to every reader.
**Fix:** Drop every settings cell on a `removed` reset, e.g. a `dropSettingsDocs(root, userData)` that
drops `settings/global` and every `GamesConfig/*` cell, called from `resetHeroic` after
`removed.outcome === 'removed'`. More generally, a rev below `baseRev` from the shell is not
distinguishable from a no-op ack; consider the shell sending a `reset` event (or rev epoch) on evict.

#### C-WR-02: Uninstall's "remove settings" leaves the cached `GameConfig` instance serving and re-writing the deleted settings

**File:** `src/backend/game_config.ts:362-385` (`instances` cache), `src/backend/storeManagers/storeManagerCommon/games.ts:30-37`, `src/backend/utils/uninstaller.ts:168-201`
**Issue:** `dropSettingsDoc`'s stated purpose is "no read serves the deleted settings". The main
reader does not go through the cell: `getAppSettings` returns `gameConfigs.get(appName).config`, which
`load()` always sets, so it is always truthy and never falls through to `getSettings()`. The
`instances` map keeps that object after the document is gone. Consequences within the session:
`.config` still returns the deleted overrides (launch, legendary/gog/nile setup, `utils.ts:1891`), and
the next `setSetting`/`flush` writes the whole stale `.config` back as a `replace` frame, resurrecting
exactly what the user asked to remove (e.g. after a reinstall). The drop only fixes the readers that
use `readSettingsDoc` directly.
**Fix:** Give `GameConfigs` a `forget(appName)` that deletes the instance (and call it next to
`dropSettingsDoc` in `removeSettingsAndLogs`), so the next `get` re-`load()`s from the (absent) document.
The global config has the same property after a reset: `GlobalConfigV0.getSettings()` returns the
cached `this.config`.

#### C-WR-03: `validateStoreFrame` measures frame size in UTF-16 code units, the shell in bytes

**File:** `src/backend/stores/storeFrames.ts:209`, `src/backend/stores/mirrorCell.ts:270`
**Issue:** `const size = lineBytes ?? JSON.stringify(frame).length` counts UTF-16 units, and
`MirrorCell.write` never passes `lineBytes`. The shell's `parse_store_frame` compares the line's byte
length against `MAX_FRAME_BYTES` (10 MiB). A value with non-ASCII text can be 2-3x larger in bytes than
in units (3 bytes per CJK unit), so a frame under 10M units passes the local check, is refused
`too-large` by the shell, and the cell has already applied it to its view. The ack protocol reverts
the view afterwards, so the symptom is a write that reads back for a moment and then vanishes with
no error to the caller, while the doc comment promises "a frame the shell would refuse is refused here".
**Fix:** `Buffer.byteLength(JSON.stringify(frame), 'utf8')` (and in `write()` pass the serialized
line's byte length as `lineBytes` to avoid a second stringify).

#### C-WR-04: Corpus harvester denylist does not cover the secret key names this codebase itself documents

**File:** `meta/harvestStoreCorpus.ts:129-163, 251-262, 264-279`
**Issue:** `DENY_KEYS` matches whole key names and `DENY_KEY_PATTERNS` has no `token`/`cookie`/
`csrf`/`session`/`auth` substring pattern. `humbleConfigStore.sessionCookie` and `csrfToken` (named as
secrets in `storePolicy.ts` and `store_backend.ts`) are not denylisted; neither are `authToken`,
`idToken`, `sessionToken`, `loginToken`, `credentials` is only caught by the pattern. They are
redacted only when the value happens to match a value-shape rule (`humble:v1:` ciphertext, JWT).
A plaintext 32-char token in a dev-vault profile (not 40+, so below the test scan's hex/base64
threshold) passes both the harvester and `storeCorpus.test.ts`, then lands in a public repo.
Two related gaps: `redactKey` never applies the SteamID64/email/JWT rules to key names (the test scan
checks keys, so such a key makes the harvest fail the gate instead of being redacted), and
`redactString` anchors every rule (`^7656119\d{10}$`, `^eyJ`, `^...@...$`) so a SteamID64, email or
bearer token embedded in a URL or sentence is untouched while the independent scan (unanchored) then
rejects the file. The committed corpus is clean today; the harvester is one profile change away from
an operator-hand-edit loop or a leak.
**Fix:** Add `/token/i`, `/cookie/i`, `/csrf/i`, `/session/i`, `/auth(?!or)/i`, `/bearer/i` to
`DENY_KEY_PATTERNS`; apply `STEAMID64_RE`/`EMAIL_RE`/`JWT_RE` unanchored inside `redactString` and
`redactKey`; keep the scan as the backstop.

#### C-WR-05: Redaction (and `placeholderOf`) silently drops a `__proto__` key

**File:** `meta/harvestStoreCorpus.ts:182-184, 296-301`
**Issue:** `JSON.parse` yields an own `__proto__` property. `out[redactKey(k, ctx)] = ...` on a `{}`
literal is a `[[Set]]`, so an object value sets `out`'s prototype and the key vanishes from
`Object.entries`/`JSON.stringify`. A real-profile file with such a key is committed without it, so the
Rust roundtrip tests (whose whole point is fidelity, including hostile keys, `__proto__` handling being
a headline of this phase) never see it. No global pollution, but a silent fidelity loss in a fixture
generator that claims to keep the shape.
**Fix:** Build `out` with `Object.defineProperty` (or `Object.fromEntries`, which uses
CreateDataProperty) for every key, as `dotPath.ts`'s `assignOwn` does.

#### C-WR-06: Boot snapshot overwrite can clobber a newer re-fetch started by an `invalidated` push

**File:** `src/preload/tauriTransport.ts:263-273, 360-388`
**Issue:** An `invalidated` push (store `clear()`) arriving while `hydrateStoreSnapshot` is in flight
deletes `hydrated[store]` and starts a fresh `hydrateStore` fetch (reads at the new rev). The snapshot
replay then skips it (`!change.invalidated`) and finishes with `snapshot[store] = fresh` (read at the
older rev, pre-clear data), `noteRev(storeName, readRev)` (no-op, already higher) and
`hydrated.add(storeName)`. If the re-fetch resolved before the snapshot invoke returned, the stale
pre-clear snapshot overwrites the newer fetch result and the store is marked hydrated, so nothing
re-fetches it. The rev bookkeeping the phase added is exactly what detects this (`lastRev.get(store)`
is above `readRev`) but it is not consulted.
**Fix:** In `hydrateStoreSnapshot`, if `lastRev.get(storeName)` is above `readRev` and an invalidated
change for the store was buffered, do not overwrite the snapshot or add `hydrated` (let the in-flight
re-fetch own it).

### Info

#### C-IN-01: `MirrorCell.write` mutates state before `sink.send`; a throwing sink leaves a never-answered op

**File:** `src/backend/stores/mirrorCell.ts:279-282`, `src/backend/stores/storeRoot.ts:71-77`
**Issue:** The view fold and `pending.push` happen before `send`. `NO_FRAME_SINK.send` throws by design;
the throw escapes after the view and `pending` already hold the op, which no ack will ever clear
(`flushStores` would then wait on it at quit). Production sinks never throw, so this is test-only.
**Fix:** Send inside a try that, on throw, removes the pending entry and invalidates `viewDoc`
before rethrowing.

#### C-IN-02: `GameLibStore.set(object)` applies a partial update when a later value is invalid

**File:** `src/backend/store_backend.ts:249-255`
**Issue:** conf validated and applied the object as one write; the facade calls `cell.set` per entry,
so `set({a: 1, b: undefined})` writes `a` and then throws on `b`.
**Fix:** Run `assertWritable` over all entries first (export it or add a `setMany` to the cell that
validates, then applies and sends one frame per key).

#### C-IN-03: Ack schema caps `store` at 128 chars, a `GamesConfig/<name>` store key can be 267

**File:** `src/common/types/ipc/sidecarInternal.ts:172-183` vs `src/backend/stores/storeFrames.ts:57-66`
**Issue:** `isPlainAppName` allows 255-char app names; `storeMirrorAck.store` is `nonEmptyString(128)`.
For an app name over 116 chars the shell accepts the frame and the ack fails sidecar validation, so
the op stays pending forever. Unreachable with current ids (numeric Steam ids, nanoids), but the two
limits should agree.
**Fix:** Raise the ack schema to `12 + 255` or cap `isPlainAppName` at 116 (and the shell's row check).

#### C-IN-04: Dead and duplicated surface in the new store modules

**File:** `src/backend/stores/dotPath.ts:49,110`, `src/backend/store_backend.ts:269-271`, `src/backend/stores/mirrorCell.ts:49,236`, `src/backend/stores/storeFrames.ts:184-189`
**Issue:** `hasPath` and `segments` are exported and used only by tests (`MirrorCell.has` re-derives
`getPath(...) !== undefined`). `GameLibStore.reset()` is a silent no-op with no callers in `src/`
(`grep "\.reset("` finds only unrelated loops): a future caller would believe it restored defaults.
`DISALLOWED_SEGMENTS`/`RESERVED_KEY` are declared in `dotPath.ts`, `storeFrames.ts`, `mirrorCell.ts`
and `storePolicy.ts`.
**Fix:** Remove `reset` (or make it throw); use `hasPath` in `MirrorCell.has` and drop the export of
`segments`; export the two constants once.

#### C-IN-05: Necessity: `tsEntries` is always `[]`

**File:** `src/backend/sidecar/appShellFlowRegistration.ts:717`, `src/common/types/ipc/rustInvoke.ts:409-424`
**Category:** necessity
**Issue:** Generality without instantiation, rests on judgment of the Rust merge: the one call site
passes `{ tsEntries: [] }` ("TS reports no entries" since the TS engine was deleted in 85-24), yet the
channel schema, its doc comment and the shell's merge/bounds path still carry a populated-list form.
**Fix:** Drop `tsEntries` from the channel (a no-arg call) when the Rust side is next touched.

#### C-IN-06: Necessity: `StoreOptions` still carries options the mirror ignores

**File:** `src/common/types/typed_store.ts:176-188`, `src/backend/store_backend.ts:120-171`
**Category:** necessity
**Issue:** `fileExtension` and `schema` have no instantiation (no construction site sets either) and
`translateStoreOptions` still predicts the path for an empty `fileExtension` that `resolveStore`
(`"${name}."`) and `mirrorCellFor` (`.json` required) disagree with. The 60-line `conf` rationale at the
top of `store_backend.ts` describes behavior of a package that is gone.
**Fix:** Remove both options and trim the header to what the module does now.

#### C-IN-07: `public/changelog.json` is internally inconsistent

**File:** `public/changelog.json:3-9`
**Issue:** `tag_name`/`name`/`html_url`/body title say 0.11.0 while `published_at` is still
`2026-10-01T00:00:00Z` and the body's headline section is still "New in 0.8.0". If this feeds the
in-app "what's new" view it advertises 0.8.0 content under 0.11.0.
**Fix:** Update `published_at` and the section to the 0.11.0 notes, or revert the bump.

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
