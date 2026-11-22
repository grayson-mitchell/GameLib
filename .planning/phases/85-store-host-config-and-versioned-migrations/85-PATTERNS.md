# Phase 85: Store host, config and versioned migrations - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** ~30 (grouped by plan family)
**Analogs found:** 26 / 30 (4 have no analog or partial)

All analog paths were checked with `git ls-files` (tracked source, no capability mirrors).
Line numbers refer to the files as read this session.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-store/Cargo.toml`, `src/lib.rs` | crate scaffold | batch | `src-tauri/crates/gamelib-log/Cargo.toml` | exact |
| `gamelib-store-cli/{Cargo.toml,src/main.rs,tests/cli.rs}` | cli | batch | `src-tauri/crates/gamelib-steamfiles-cli/` | exact |
| `gamelib-store/src/atomic.rs` | utility | file-I/O | `src-tauri/crates/gamelib-steamfiles/src/atomic.rs` (copy) plus `gamelib-core/src/store.rs` `persist_atomic` fallback | exact |
| `gamelib-store/src/host.rs` (`StoreHost`, `Store`, rev, events) | service | CRUD + event-driven | `src-tauri/crates/gamelib-core/src/store.rs` (widened, moved) | exact |
| `gamelib-store/src/json.rs` (ordered Value, tab/2-space serializer) | utility | transform | `gamelib-log/src/sanitize.rs` `RendererMessage` visitor (ordered deserialize) | role-match |
| `gamelib-store/src/dotpath.rs` | utility | transform | `node_modules/dot-prop@6.0.1/index.js` (behaviour being ported; untracked dep) | no repo analog |
| `gamelib-store/src/{engine,envelope,migrate/*}.rs` | service | batch | `src/backend/storeVersioning/engine.ts`, `backup.ts`, `storeMigrations/*.ts` (port) | exact (port) |
| `gamelib-store/src/table.rs`, `schemas.json` | config | schema | `src/backend/stores/__tests__/fixtures/registeredStores.json` + `storeKinds.test.ts` drift idea | role-match |
| `gamelib-store/tests/{golden,corpus,roundtrip,migrate_golden}.rs` + `fixtures/` | test | transform | `src-tauri/crates/gamelib-log/tests/golden.rs` + `tests/fixtures/golden/{cases,entries}.json` | exact |
| `src/backend/stores/__tests__/storeOracle.test.ts` | test | transform | the deleted 84 `logGolden.test.ts` pattern (oracle writes goldens under an env flag); see `loggerPortComplete.test.ts` header | role-match |
| `src/backend/stores/mirrorCell.ts`, `mirrorStore.ts` (TS write-through mirror) | store | event-driven | `src/backend/store_backend.ts` (surface it replaces) + `src/backend/logger/forwarder.ts` (fire-and-forget frame sink) | role-match |
| `src-tauri/src/store_dispatch.rs`, `store_frame` arm in `sidecar.rs` | controller | pub-sub FIFO | `src-tauri/src/sidecar.rs` `route_log_frame` / `handle_log_frame`, `log_dispatch.rs` | exact |
| `src-tauri/src/native_router.rs` store channels, `src/common/types/ipc/nativeChannels.json`, `ipc_contract.rs` | route | request-response | same files, logger-slice entries (`logError`) | exact |
| `src/common/types/ipc/storeChannels.json`, `src/common/__fixtures__/storeFrameVectors.json` | config/test | schema vectors | `src/common/__fixtures__/logFrameVectors.json` | exact |
| `src-tauri/src/store_policy.rs` | utility | request-response | `src/common/types/storePolicy.ts` (port) + `storePolicy.test.ts` | exact (port) |
| `src-tauri/src/log_upload.rs` (modify: envelope, tab, `__internal__`) | service | CRUD | itself | exact |
| read-only notice emit (`readOnlyStoresNotice`) | service | event-driven | `src/backend/sidecar/readOnlyStoresNotice.ts`, `storeVersioning/readOnlyStores.ts` | exact (port) |
| `src/backend/__tests__/storeHostPortComplete.test.ts` | test | census | `src/backend/__tests__/loggerPortComplete.test.ts` | exact |
| `src/backend/__tests__/storeMirrorSchedule.test.ts` | test | census | `loggerPortComplete.test.ts` + `82-STATE-OWNERSHIP.md` table | role-match |
| `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts`, `src-tauri/Cargo.toml`, `src-tauri/crates/README.md` | config | CI | the `gamelib-log` entries in each | exact |
| `85-HUMAN-UAT.md` | doc | UAT | `.planning/phases/84-logger/84-HUMAN-UAT.md` | exact |
| corpus harvest + redaction tool (`meta/` or test util) | utility | batch/file-I/O | `src/backend/testUtils/fakeHomeProfile.ts` | role-match |
| `meta/genStoreSchemas.ts` + drift test | utility | transform | none | no analog |
| spike notes S1..S5 (mirror rebase sim, Windows rename, throughput) | spike | n/a | none | no analog |
| `version_gate` op (bottle files) | service | request-response | `storeVersioning/engineMarkerFile.ts`, `sharedRedistLedgerFile.ts` | exact (port) |

## Pattern Assignments

### `gamelib-store` crate scaffold (crate, batch)
**Analog:** `src-tauri/crates/gamelib-log/Cargo.toml` (lines 1-37). Same edition, rust-version 1.77.2, `publish = false`, clippy denies, `gamelib-core` and `gamelib-testutil` path deps.
```toml
[package]
name = "gamelib-store"
version = "0.1.0"
edition = "2021"
rust-version = "1.77.2"
publish = false
[lib]
path = "src/lib.rs"
[dependencies]
gamelib-core = { path = "../gamelib-core" }
serde = { version = "1", features = ["derive"] }
# Default features only PLUS float_roundtrip (RESEARCH). preserve_order stays OFF for the shell build.
serde_json = { version = "1", features = ["float_roundtrip"] }
indexmap = { version = "2", features = ["serde"] }
[dev-dependencies]
gamelib-testutil = { path = "../gamelib-testutil" }
tempfile = "3"
[lints.clippy]
dbg_macro = "deny"
todo = "deny"
```
No `keyring` dependency (assert with `cargo tree -p gamelib-store | grep -c keyring` = 0). No Tauri, no env reads: inject dirs and clock.

**Registration checklist (copy 84-02):** add `gamelib-store`/`-cli` to `src-tauri/Cargo.toml` (workspace members near line 482, path dep near line 18), `.github/workflows/rust-test.yml:132-135` (`-p ...` list and step name), `meta/__tests__/rustTestWorkflow.test.ts:47,127,161-162,174-175` (regex helper, "multi-crate step tests X" case, step-name fixtures, the omission mutation), `src/backend/__tests__/cargoFeatures.test.ts:167,222` (`EXPECTED_LOCKFILE_CRATE_NAMES`), `src-tauri/crates/README.md:17,201`.

### `gamelib-store-cli` (cli, batch)
**Analog:** `src-tauri/crates/gamelib-steamfiles-cli/Cargo.toml` and `src/main.rs`, `tests/cli.rs`
```toml
[[bin]]
name = "gamelib-steamfiles-cli"
path = "src/main.rs"
[dependencies]
gamelib-steamfiles = { path = "../gamelib-steamfiles" }
serde_json = "1"
[dev-dependencies]
tempfile = "3"
```
Rule (D-14): a `-cli` never touches the real Keychain or a real profile; tests run on `FakeHome`.

### `gamelib-store/src/atomic.rs` (utility, file-I/O)
**Analog:** `src-tauri/crates/gamelib-steamfiles/src/atomic.rs` lines 1-80: `resolve_final_symlinks`, `create_new` temp `"{name}.{pid}.{seq}.tmp"`, `sync_all`, `rename`, temp removal on error. Copy it, then force 0600 on the temp file (the analog copies the existing perms instead) and add dir 0700.
**Fallback to keep (D-13):** `gamelib-core/src/store.rs` `persist_atomic` (line 181) and `write_private` (line 166): rename failure falls back to a direct write. Per D-21 make `sync_all` conditional on store kind (user-state, settings, token-bearing yes; cache no). Add a bounded retry before the direct-write fallback (RESEARCH pitfall 10). Existing tests to carry over from `store.rs`: `the_file_is_0600_and_a_new_directory_0700` (288), `when_the_rename_fails_the_content_is_written_directly_and_no_temp_file_remains` (422), `a_failed_persist_rolls_the_in_memory_value_back_and_fires_nothing` (444).

### `gamelib-store/src/host.rs` (service, CRUD + events)
**Analog:** `src-tauri/crates/gamelib-core/src/store.rs` (move it, keep signatures `open_cache`, `get`, `set`, `remove`, `snapshot`, `on_change`; update the 3 shell import sites `native_router.rs`, `log_upload.rs`, `main.rs`).
**Lock helper and rollback pattern** (lines 29-70):
```rust
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}
pub fn set(&self, key: &str, v: Value) -> io::Result<()> {
    {
        let mut data = lock(&self.data);
        let previous = data.insert(key.to_string(), v);
        if let Err(e) = persist_atomic(&self.path, &data, &|from, to| fs::rename(from, to)) {
            match previous {
                Some(old) => { data.insert(key.to_string(), old); }
                None => { data.shift_remove(key); }
            }
            return Err(e);
        }
    }
    self.notify(&StoreChange::Set { key: key.to_string() });
    Ok(())
}
```
Changes the research requires: replace `serde_json::Value` with the private ordered `Json` type; assign `rev` under the lock and dispatch through one FIFO (not `notify` after unlock); use `shift_remove` (never `swap_remove`); host owns `__internal__` (never exposed from `snapshot`/`get`); per-store `dot_paths` flag (false for `uploadedLogs`); hold a `gamelib_core::shutdown::global()` Registrant while the write queue is non-empty (conventions row 4).
**Header to fix:** `store.rs` lines 1-9 claim "2-space pretty JSON"; conf stores are tab-indented with the envelope. Fix the doc and the `TS_SHAPED` test fixture (test at line 240).
**Listener-callback pattern (keep):** line 101-107 clones listeners out of the lock so a listener may call back (test at 406).

### `gamelib-store/src/json.rs` (utility, transform)
**Analog:** the `RendererMessage` visitor in `src-tauri/crates/gamelib-log/src/sanitize.rs` (ordered `Deserialize` via `Visitor`/`MapAccess`, also imported in `gamelib-log/tests/golden.rs` lines 13-16: `serde::de::{Deserializer, MapAccess, SeqAccess, Visitor}`). Build `Json` (`Null/Bool/Num(serde_json::Number)/Str/Arr/Obj(IndexMap)`) the same way. Serializer: `serde_json::ser::PrettyFormatter::with_indent(b"\t")` (stores) or `b"  "` (settings docs); no trailing newline. JS integer-like key ordering on insert needs its own tests (no analog).

### `gamelib-store/src/{engine,envelope,migrate}.rs` (service, batch)
**Analog (behaviour to port):** `src/backend/storeVersioning/engine.ts` lines 100-205 (`runFileMigration`), `backup.ts` (`atomicWritePrivate` lines 29-60, `MAX_BACKUPS_PER_STORE = 3`, `writePreMigrationBackup`), `readOnlyStores.ts` (AREA_BY_KEY lines 21-40), `storeMigrations/{settingsGlobal,settingsGame,settingsStrip,schemaStrip,gameInfoLibraries}.ts`.
**Decision core to copy** (`engine.ts:133-199`):
```ts
const current = deps.migrations.currentVersionOf(chainKey)
// unreadable/malformed: return state            (Rust differs: D-18 copy aside + read-only 'failed')
if (fileVersion > current) return markReadOnly(filePath, state, 'newer', `file v${fileVersion} is newer than this build (v${current})`)
if (fileVersion === current) return state
const steps = deps.migrations.pendingChain(chainKey, fileVersion)
if (steps.every((s) => s.identity)) return state     // identity adoption: NO rewrite
if (declaration.kind === 'cache') { unlinkSync(filePath); return state }
writePreMigrationBackup(filePath, fileVersion, bytes)
atomicWritePrivate(filePath, JSON.stringify(codec.write(result, current), undefined, '\t'))
```
Deliberate deviation (D-18, RESEARCH pitfall 4): corrupt bytes are copied to `<name>.corrupt.<stamp>.json`, original kept byte-identical; settings and user-state open read-only `'failed'`; caches continue empty only after the copy exists. TS today lets conf reset it.
**Envelope write** (`store_backend.ts:231`): `serialize = (value) => JSON.stringify(value, undefined, '\t')` plus `stampForWrite` adding `__internal__.gamelib.schemaVersion`. Settings docs use `JSON.stringify(data, null, 2)` (`storeVersioning/settingsFiles.ts:52`) with top-level `version: 'vN'`.
**Corpus golden:** assert TS-oracle parity for old-version inputs (strip chains delete undeclared keys); assert key preservation only at current version. Name the tests that way (RESEARCH pitfall 5).

### `gamelib-store/tests/{golden,corpus,...}.rs` and fixtures (test, transform)
**Analog:** `src-tauri/crates/gamelib-log/tests/golden.rs` lines 1-50 and fixtures `tests/fixtures/golden/{cases.json,entries.json,NOTES.md,expected/<case-id>/...}`.
```rust
//! Rust == TS golden. Every oracle case in `cases.json` ... is replayed through the real `Logger` on a
//! FakeHome log dir; the resulting tree must equal `expected/<id>/` byte for byte.
const CASES: &str = include_str!("fixtures/golden/cases.json");
const ENTRIES: &str = include_str!("fixtures/golden/entries.json");
use gamelib_testutil::FakeHome;
```
Copy: `include_str!` the case list, replay on a `FakeHome` dir, compare the resulting tree byte for byte to `expected/<id>/`. Add `MANIFEST.json` (hash + count) and a `manifest_is_complete` test so the corpus cannot pass vacuously (use the floor idea from `src/backend/testUtils/censusFloor.ts` `assertAtOrAboveFloor`). The goldens stay after the TS oracle is deleted (as 84 `loggerPortComplete` header states).

### `src/backend/stores/__tests__/storeOracle.test.ts` (test, transform)
**Analog:** the 84 TS oracle shape: runs the real TS (conf + engine + migrations) over scripted ops, writes goldens only under `GAMELIB_WRITE_STORE_GOLDEN=1`, deleted in the last plan. Spawns that touch HOME use `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile.ts`), never a hand-rolled `env`. Existing store fixtures to reuse as migration inputs: `src/backend/storeMigrations/__tests__/fixtures/*.json` (e.g. `settings-global-v0.json`, `steam-library-gameinfo-v1.json`).

### `src-tauri/src/sidecar.rs` store frame arm + `store_dispatch.rs` (controller, pub-sub)
**Analog:** `src-tauri/src/sidecar.rs` lines 350-380 and 520-530.
```rust
pub(crate) fn route_log_frame(logger: &gamelib_log::writer::Logger, line_len: usize, value: Value)
    -> Result<(), gamelib_log::frame::FrameReject> {
    let batches = gamelib_log::frame::parse_frame(line_len, value)?;
    logger.submit(batches);
    Ok(())
}
// reader loop:
let kind = value.get("kind").and_then(|v| v.as_str());
if kind == Some(LOG_FRAME_KIND) {
    handle_log_frame(trimmed.len(), value);
    continue;
}
```
Copy: a `STORE_FRAME_KIND` arm in the single in-order reader; validate and enqueue, never block the reader, never write a file inline (2026-10-05 freeze). Rejection is reported by category only (`shell_eprintln!` + logger warning), never echoing content. Difference: no drop-on-full (stores use an unbounded queue with a counted high-water log line). Frame values travel as `valueJson` strings so nested key order survives. `rustInvoke` is NOT used for writes (unordered worker per call, `sidecar.rs:534` comment).
**Vector test:** copy `sidecar.rs:928-980` (`const VECTORS: &str = include_str!("../../src/common/__fixtures__/logFrameVectors.json")`, `frame_of`, `log_frame_kind_matches_the_ts_transport_constant`) for `store_frame` tests over `storeFrameVectors.json`.

### `storeFrameVectors.json`, `storeChannels.json` (config, schema vectors)
**Analog:** `src/common/__fixtures__/logFrameVectors.json` (`maxFrameBytes`, `maxEntryUtf16`, `valid[{name, frame}]`, `invalid[...]` read by both jest and cargo) and `src/common/types/ipc/nativeChannels.json` (`channels.<name>` with `kind`, `slice`, `args[{name,type,strict}]`, `returns`, `valid[]`, `invalid[]`). Add one `slice: "store"` entry per store channel; one owner per channel (83 census, `nativeSeamPortComplete`). Policy vectors: `src/common/types/storePolicy.ts` and `src/common/types/__tests__/storePolicy.test.ts` are the TS source; the Rust `store_policy.rs` reads the same JSON.

### TS mirror: `src/backend/stores/mirrorCell.ts` + `mirrorStore.ts` (store, event-driven)
**Analog:** `src/backend/store_backend.ts` (`GameLibStore extends Conf`; constructor `prepareStore` lines 200-235 resolves `cwd` + `configName` to an absolute file path, mkdir 0700, `tightenTokenPaths` for tokenBearing, `prepareStoreFile`). Keep the same constructor surface (`{ declaration, root, ...conf options }`) and the same file-path keying; replace Conf internals with a cell keyed by resolved file path per `StoreRoot` (shared by `steamConfigStore`/`steamBottleConfigStore`). Frame sink is injected (jest uses a recording fake); `unref()` every timer/handle (conventions row 3). Fire-and-forget sender style: `src/backend/logger/forwarder.ts`. Test mock to update: `src/backend/__mocks__/store_backend.ts`.
No existing mirror-rebase analog: use RESEARCH Pattern 3 and spike S1.

### `native_router.rs` store channels (route, request-response)
**Analog:** the logger-slice channels in `src-tauri/src/native_router.rs` and `nativeChannels.json` (`logError` etc.). Flipped families resolve to `StoreHost`; unflipped ones proxy to the sidecar under internal channel names until the flag is deleted (D-01, D-03).

### `src-tauri/src/log_upload.rs` (modify)
Add a regression case per RESEARCH pitfall 2: a v0.10 tab+`__internal__` `uploadedLogs.json` lists correctly and `prune_expired` never sees `__internal__`. Declared `accessPropertiesByDotNotation: false`, kind `cache`.

### `storeHostPortComplete.test.ts` (test, census)
**Analog:** `src/backend/__tests__/loggerPortComplete.test.ts` (lines 1-60): header explaining the gate, imports `assertAtOrAboveFloor` (`backend/testUtils/censusFloor`) and `stripSourceComments`/`stripTrailingLineComment` (`backend/testUtils/stripSourceComments`), `const ROOT = join(__dirname, '..', '..', '..')`, `DELETED` array, `KEPT` array (including golden fixture dirs), `FORBIDDEN_IDENTIFIERS`.
```ts
const DELETED = [
  'src/backend/logger/log_writer.ts',
  ...
]
const GOLDEN = 'src-tauri/crates/gamelib-log/tests/fixtures/golden'
```
For 85 list as DELETED: `src/backend/storeVersioning/*` (engine, backup, readOnlyStores, settingsFiles, engineMarkerFile, sharedRedistLedgerFile, types and `__tests__`), `src/backend/storeMigrations/*`, `src/backend/migration/{index,stores}.ts`, `migration/migrations/legendary.ts`; forbidden identifiers: `GAMELIB_STORE`, `MigrationSystem`, `migrationsStore`, `legendary-move-global-config-folder`. Also assert `store/migrations.json` is never opened (D-07). Every scan runs over comment-stripped text, with a walk floor and self-tests proving each scan can fail. Update `src/backend/__tests__/storeKinds.test.ts` (`EXPECTED_KINDS`) and `registeredStores.json`.

### `storeMirrorSchedule.test.ts` (D-19)
Copy the table from `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md` "Persisted stores" (column "TS mirror deleted", e.g. `configStore` 98, `timestampStore` 94, `steamConfigStore` 90, `steamBottleConfigStore` 96, `gogConfigStore` 92), pin it in a test. Only `migrationsStore` (85) is deleted here.

### Settings resync (D-15/D-20)
Stays TS: `src/backend/settingsMirrorResync.ts` with `src/backend/__tests__/settingsMirrorResync.test.ts`. It must keep working through the mirror; no move to Rust.

### Corpus harvest and redaction (utility, batch)
**Analog:** `src/backend/testUtils/fakeHomeProfile.ts` (`createFakeHomeProfile()`; policed by `src/backend/__tests__/fakeHomeIsolation.test.ts`). Generate v0.8/v0.9/v0.10 profiles by running each tag's sidecar in a fake HOME; add a redaction test failing on token, cookie or ciphertext patterns; hand-built edge cases: unknown keys, corrupt, newer, empty, missing, BOM, CRLF.

### `85-HUMAN-UAT.md`
**Analog:** `.planning/phases/84-logger/84-HUMAN-UAT.md`. Item shape per convention 5 (`### N.` at column 0, inline `expected:`, `result:` starting with a status word). Include the offline shape (network off only for the action) and the Wave 0 signing-identity precondition (D-16).

## Shared Patterns

### Fake-HOME isolation
**Source:** `src/backend/testUtils/fakeHomeProfile.ts`; Rust `gamelib_testutil::FakeHome` (`src-tauri/crates/gamelib-testutil/src/lib.rs`).
**Apply to:** every test, `-cli` test, corpus generator and oracle. Never a hand-rolled `env` literal.

### Shutdown contract (Rust)
**Source:** `gamelib_core::shutdown::global()` Registrant, `ExitBudget::DEFAULT` (5 s; 3.5 s drains). **Apply to:** the store write queue drain and boot-time migration sweep (bounded by count/time cap). No new spawn outside `gamelib-proc`.

### Census/portcomplete test idiom
**Source:** `src/backend/__tests__/loggerPortComplete.test.ts`, `src/backend/testUtils/censusFloor.ts`, `stripSourceComments.ts`. **Apply to:** `storeHostPortComplete`, `storeMirrorSchedule`, any new scan.

### Shared JSON vectors for jest and cargo
**Source:** `src/common/__fixtures__/logFrameVectors.json`, `src/common/types/ipc/nativeChannels.json`. **Apply to:** `storeFrameVectors.json`, `storeChannels.json`.

### Ordered stdout frames
**Source:** `sidecar.rs` `kind` dispatch (lines 520-530) and `src/backend/sidecar/__tests__/sidecarStdoutFramesOnly.test.ts` (stdout carries frames only; update it for the new `kind:"store"`).

### Read-only notice
**Source:** `src/backend/storeVersioning/readOnlyStores.ts` `AREA_BY_KEY` and `src/common/types/readOnlyStores.ts` payload (ids only, once per launch). **Apply to:** Rust port; keep the payload shape (D-12).

### Secrets
**Source:** `src-tauri/src/main.rs` keyring dispatch (service `com.gamelib.launcher`; accounts `steam-refresh-token`, `humble-session`, `humble-csrf`, `steamgrid-api-key`, `itad-api-key`, per RESEARCH). **Apply to:** a names-pin test in the shell crate; `gamelib-store` has no keyring dependency.

### Verify block
Every task `<verify>`: `npx prettier --check` over exact paths after `--file-info`. `.planning` and `public/locales` are ignored: omit the check and say so.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `gamelib-store/src/dotpath.rs` | utility | transform | Only analog is `dot-prop@6.0.1` in `node_modules` (untracked); port its semantics with a TS-oracle golden |
| JS integer-key order on insert (in `json.rs`) | utility | transform | No Rust precedent; verified need on `store/timestamp.json` |
| `meta/genStoreSchemas.ts` + schema descriptor drift test | utility | transform | No zod-to-descriptor generator exists |
| TS mirror rebase protocol (`mirrorCell.ts`) | store | event-driven | New design; needs spike S1 against a fake Rust peer |
| Spikes S1-S5 | spike | n/a | Throwaway; no analog |

## Metadata

**Analog search scope:** `src-tauri/crates/*`, `src-tauri/src/{sidecar,native_router,log_dispatch,log_upload}.rs`, `src/backend/{store_backend,typed_store,stores,storeVersioning,storeMigrations,migration,logger,__tests__,testUtils}`, `src/common/{types,__fixtures__}`, `.github/workflows`, `meta/__tests__`, `.planning/phases/84-logger`, `82-STATE-OWNERSHIP.md`.
**Files scanned:** ~45 (targeted reads and greps).
**Pattern extraction date:** 2026-11-21
