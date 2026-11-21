# Phase 85: Store host, config and versioned migrations - Research

**Researched:** 2026-11-21
**Domain:** Rust-owned JSON persistence (conf-compatible byte format), versioned migrations and backups, sync-TS-over-async-Rust mirror, Keychain-safe signed upgrade
**Confidence:** MEDIUM-HIGH (code facts and byte-format facts measured this session; Windows rename, Keychain ACL and the release-signing precondition are not provable from a desk)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Cutover and rollback
- **D-01:** **Store families flip per family, in separate plans, behind a flag.** Order: caches first, then user-state, then token-bearing stores (`steam_store/config`, which holds `steamConfigStore` and `steamBottleConfigStore` in one file, plus `humble_store/config` and the other account configs), then global settings (`store/config.json`) last. Each flip sits behind `GAMELIB_STORE=rust|ts`, following the short-lived slice-flag pattern of Phases 63–80, until the phase's live gate passes.
- **D-02:** **After the first migrated boot, the TS fallback refuses to own the affected stores.** Once Rust has written a store version newer than the TS engine understands, `GAMELIB_STORE=ts` opens that store read-only through the existing Phase 68 refuse-newer rule. It never rewrites or resets it. So the fallback is only a real rollback before any migration has run on a profile. No restore-from-backup rollback is built. — **Reversibility:** one-way. A store migrated on a real profile can't be handed back to TS without a backup restore, which is deliberately not built.
- **D-03:** **The dual path is deleted inside Phase 85.** Once the live gate passes, the phase's last plan deletes the `GAMELIB_STORE` flag, the TS owner path, `storeVersioning/*`, `storeMigrations/*` and `migration/*` (SC5). The TS classes that stay are only the write-through mirror. Each mirror's deletion point is its column in `82-STATE-OWNERSHIP.md`, and `migrationsStore`'s mirror dies here in 85.

### Downgrade and byte compatibility
- **D-04:** **Downgrading to v0.10 works, except for stores a migration bumped.** Rust writes files that are byte-compatible with what v0.10's TS writer produces, at the same store versions, so v0.10 reads them unchanged. A store that a migration Phase 85 introduces moves to a newer version is opened read-only by v0.10 through its own Phase 68 refuse-newer rule, and is never reset. No new downgrade code is written. Planning should prefer to introduce no version bumps in 85 unless a migration requires one.
- **D-05:** **Rust writes are byte-identical to TS writes.** Re-saving a store with unchanged values must produce identical bytes to TS `conf`: key order, indentation, trailing newline and string escaping. A roundtrip diff test over the real-file corpus (D-09) asserts this byte for byte. Note for research: the `store.rs` header says "2-space pretty JSON", but the v0.11 research summary says `conf` writes tab-indented JSON. Research must settle this from `conf@10.2.0`'s actual `serialize` and from real profile files, and fix whichever is wrong (84's `uploadedLogs` included). — **Reversibility:** costly. It fixes the on-disk format that v0.10 and every later Rust writer must keep matching.

### Legendary global-config import
- **D-06:** **Delete the legendary migration rather than port it.** `migration/migrations/legendary.ts` (`legendary-move-global-config-folder`) copies a system-wide legendary config into GameLib's folder on first run. Every existing GameLib profile has already recorded it as applied. The only remaining reach is a new user who already signed in through Heroic or the legendary CLI, and that user can just sign in to Epic again. Record this reachability finding (SC4), then delete `legendary.ts`, `MigrationSystem` (`migration/index.ts`, `migration/stores.ts`) and the `migrationsStore` mirror.
- **D-07:** **`store/migrations.json` stays on disk.** Rust never opens it. It is not deleted, because a downgraded v0.10 should still see the migration as applied, and deleting files cuts against this phase's "never reset" rule.

### Upgrade proof and corpus
- **D-08:** **SC3 (the Keychain guarantee) is proven by a signed v0.10 → signed Phase 85 upgrade on macOS, run by the operator as a live gate.** Install the published, signed v0.10 and sign in to Steam, Humble and Epic, with SteamGrid configured if it applies. Then install a signed and notarized build of the Phase 85 branch over it. Pass means zero Keychain prompts and every sign-in still working. A dev or unsigned build does not count. Follow the memory note's offline UAT shape: network off only for the action.
- **D-09:** **The corpus holds the live operator profile plus generated v0.8, v0.9 and v0.10 profiles.** Generate a profile by briefly running each tagged release (`v0.8`, `v0.9`, `v0.10`) in a fake HOME (`createFakeHomeProfile()`, per the fake-HOME convention). Redact secrets and token-bearing values before commit, keep the JSON shape, and check the redacted fixtures in. Add hand-built edge cases on top: unknown keys, corrupt JSON, a newer-version file, an empty file and a missing file.
- **D-10:** **Windows and Linux credentials get automated checks in 85, with no live gate.** Rust keyring code and service/account names are unchanged. CI tests on Windows and Linux assert that the same names resolve through `keyring_dispatch`. The live upgrade check on those OSes rides with Phase 99 (RET-02).

### Carried forward (already decided, not re-asked)
- **D-11:** Every remaining persisted store flips at 85 (`82-STATE-OWNERSHIP.md`, Persisted stores). `steamConfigStore` and `steamBottleConfigStore` share one file and flip together.
- **D-12:** Phase 68 behaviour is ported unchanged: up to 3 backups per store (`MAX_BACKUPS_PER_STORE`) taken before a migration, a corrupt file kept and reported (never reset), a newer-version file read-only, and the per-area read-only notice (`readOnlyStores.ts` `AREA_BY_KEY`, `ReadOnlyStoresNoticePayload`) raised the same way.
- **D-13:** Phase 84 D-09: widen the existing `gamelib-core` `StoreHost` rather than replace it. Keep its signatures, its rollback of the in-memory value when a persist fails, its 0600 file and 0700 new-directory modes, and its tmp-then-rename write with a direct-write fallback.
- **D-14:** All secrets stay behind the shell's `keyring_dispatch`, with service and account names unchanged. A `-cli` never touches the real Keychain.
- **D-15:** The config.json-wins resync of the renderer's settings mirror at boot is ported along with `configStore` (ownership table notes).

### Claude's Discretion
- The research and spike items from the roadmap's research flag: sync TS reads over async Rust ownership (mirror shape), read-your-writes guarantees, ordering of `storeChanged` against snapshots, Windows atomic rename while a file is open (the current EPERM/EBUSY direct-write fallback is the starting point), and the boot sequence for migrations (they run once at shell boot, before any consumer reads).
- Crate layout: a `gamelib-store` implementation crate vs widening `gamelib-core/src/store.rs` (research suggests core holds traits and a store crate holds the implementation; 84 put the minimal host in core).
- Channel shapes for snapshot, get, set, delete and `storeChanged` through the 83 native router.
- How the redacted corpus fixtures are generated and stored, and how they are pinned so a test can't pass with no fixtures.

### Deferred Ideas (OUT OF SCOPE)
- Live Windows and Linux credential upgrade checks: Phase 99 (RET-02).
- A restore-from-backup rollback lever: deliberately not built (D-02). Backups remain the manual recovery path.
- Reviewed todos (not folded): Windows unsigned releases, blank-render fix, GOG elevation live check, the bridged-launch session kick, the gamelib-log Windows path golden, the settings-flow digest gate, the steampoll grandchild flake. None is about store hosting or migrations.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-06 | Existing settings, caches and per-game config load unchanged after upgrade; unknown keys are preserved, the pre-migration state is backed up, and a corrupt file is kept, never reset. The legendary store migration is ported only if a supported upgrade path still reaches it [VERIFIED: .planning/REQUIREMENTS-v0.11.md:20] | Byte format settled (tab for conf stores, 2-space for settings documents; measured 156/156 real files). Ordered-JSON type required (serde_json default sorts nested keys; measured 40+ real-file diffs). Engine, backup, refuse-newer and migration chains inventoried for port. Legendary reachability recorded. Corpus plan and pinning. |
| FND-07 | Stored credentials keep working, with no new Keychain prompts, across a signed-release upgrade [VERIFIED: .planning/REQUIREMENTS-v0.11.md:21] | Keychain surface is already Rust and untouched by this phase; prompt risk is signing identity, not store code. Pin tests for service/account names. Live-gate precondition problem: no published v0.10 exists (see Open Questions Q1). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Conventions skill applies** (`Skill("gamelib-conventions")` loaded): (1) todos created in `.planning/todos/pending/` carry `severity:`, `platform:`, `ready:` bare, lowercase, in that order; (2) any child process spawned from `src/` or `meta/` (corpus generation runs sidecars/CLIs) uses `createFakeHomeProfile()`, never a hand-rolled `env` literal, plus a named real-profile arm only where justified; (3) sidecar timers/handles must be `unref()`ed and no unbounded in-flight work at boot (the TS mirror's frame sender and ack wait must obey this); (4) Rust: spawn through `gamelib-proc`, hold a `gamelib_core::shutdown::global()` Registrant for in-flight store writes, fit exit work in `ExitBudget::DEFAULT` (5 s total, 3.5 s drains), bound boot work (migrations); (5) UAT item shape: `### N.` at column 0, inline `expected:`, `result:` opens with a status word; (6) every task `<verify>` runs `npx prettier --check` over exact written paths, after `--file-info` shows they are not ignored (`.planning` and `public/locales` are ignored: omit the check there and say so).
- **Do not run `generate-claude-md`.** Hand-edit CLAUDE.md regions only.
- **GameLib is an independent project; do not raise upstream-Heroic mergeability as a concern.**
- **Steam stack facts:** secrets live in the OS keyring via the shell's `keyring_dispatch`; `steam-session`/`steam-user` are retired (Rust CM in `gamelib-steamcm`).
- **GSD workflow enforcement:** repo edits go through a GSD command (this research writes only the phase RESEARCH.md).
- **graphify rule:** use `graphify query/explain/path`; never read `GRAPH_REPORT.md` or `graph.json` whole (not needed for this research; code was read directly).
- **Memory notes that bear on this phase:** "GSD commit sweeps .planning" (use `--files` to scope commits); "Offline UAT: network off only for the action" (D-08 gate shape); "Dev launch is `pnpm tauri:dev`, never `tauri:dev:run`" (the dev-vault flag keeps Keychain prompts away from dev launches); "Fresh worktree needs build prep" (corpus generation from tags needs `build:sidecar`); "tauri dev does not rebuild the sidecar" (restart dev before live-testing mirror changes).

## Summary

The phase moves 55 registry stores, the global `config.json`, per-game `GamesConfig/<app>.json` and two bottle-local versioned files under a Rust owner, while the sidecar's TypeScript keeps reading synchronously. Three hard facts shape every plan. **First, the format is not what the Phase 84 `store.rs` header says.** Every conf-backed store is written with a TAB indent: `store_backend.ts` passes `(value: unknown): string => JSON.stringify(value, undefined, '\t')` as `serialize` [VERIFIED: src/backend/store_backend.ts:231], and the real profile files confirm it (tab=474 lines / spaces=0 in `store/config.json`). Only the settings documents (`config.json`, `GamesConfig/*.json`) use 2-space (`JSON.stringify(data, null, 2)` [VERIFIED: src/backend/storeVersioning/settingsFiles.ts:52]). There is no trailing newline in either. Phase 84's `uploadedLogs` writer (2-space, no `__internal__` envelope) is therefore wrong against a v0.10 file (tab, stamped), and it carries a latent defect: `prune_expired` iterates `store.snapshot()` and would treat a v0.10 file's `__internal__` key as an upload entry.

**Second, `serde_json::Value` cannot be the store's value type.** Without `preserve_order` (which Phase 84 deliberately keeps off, anchored count 0 in the shell build) every nested object is a sorted `BTreeMap`. Measured against the operator profile with a scratch harness: with `preserve_order` + `float_roundtrip` + `PrettyFormatter::with_indent(b"\t")`, 156 of 159 JSON files round-trip byte-identical (the 3 misses are gogdl/nile's own compact files, not GameLib-owned); with the feature off, more than 40 GameLib-owned files differ at byte 4 or 6 (key order). Without `float_roundtrip`, 888,964 of 3,000,000 random f64 failed to round-trip. The prescribed shape is therefore a store-private order-preserving value type (IndexMap-backed, with its own serde visitor, the same technique Phase 84 used for `RendererMessage`) plus a private tab/2-space serializer, and sidecar mirror frames that carry values as JSON *strings* so the shell's `Value` parse never sorts them.

**Third, the TS side cannot become a plain async client.** Boot and the store classes are synchronous by contract (`init()` is sync; ~38 backend files read `configStore` alone), and `conf` re-reads the file on every `.get()`. The prescribed design is: Rust migrates and opens every store before the sidecar is spawned; each TS store becomes an in-memory mirror cell (per root, keyed by resolved file path, because `steamConfigStore` and `steamBottleConfigStore` share one file) that loads once from disk, applies writes locally for read-your-writes, and sends them as ordered `kind:"store"` stdout frames; Rust is the single serialization point, assigns a per-store `rev`, persists, and pushes ordered change events to the renderer and back to the sidecar mirror, which rebases its still-unacked local writes on top. `rustInvoke` cannot carry writes because each one is handled on its own worker thread (no ordering).

**Primary recommendation:** Build a new Tauri-free `gamelib-store` crate (ordered JSON, dot-path ops, versioned envelope, backup, migration engine with a zod-derived schema descriptor, settings documents, `StoreHost`, a `-cli`), prove it byte-for-byte against a TS-oracle golden and a redacted real-file corpus **before** any TS is touched, then flip families in the CONTEXT order through a Rust-owned set of store channels that proxy unflipped families to the sidecar, and delete the TS owner path, the flag and `storeVersioning`/`storeMigrations`/`migration` in the last plan.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Disk writes for stores, `config.json`, `GamesConfig/*` | Rust shell (`gamelib-store` via `StoreHost`) | — | Phase goal: Rust is the only disk writer. |
| Versioning, backup, refuse-newer, corrupt-keep, migrations | Rust (`gamelib-store`) | — | Runs once at shell boot before the sidecar is spawned. |
| Sync reads in TS hot paths | Sidecar (in-memory mirror cell, loaded from disk at construction) | Rust (authoritative state, change events) | `init()` and ~60 consumer files are synchronous; async RPC per read is not viable. |
| Renderer store snapshot/fetch/set/delete/changed | Rust native router (renderer-origin ops) | Sidecar (proxied for families not yet flipped) | One owner per channel (83); per-family backend behind it. |
| Renderer read/write policy (allow-list, denied stores, `steamConfigStore.refreshToken` guard, safe key paths) | Rust (ported from `storePolicy.ts` via shared JSON + vectors) | TS preload (reads the same JSON) | The write choke point moves with the channels. |
| Read-only notice (`readOnlyStoresNotice`) | Rust (ids-only payload via `FrontendEmitter`) | Renderer | Payload shape and area map unchanged. |
| Settings factory defaults, `GlobalConfig`/`GameConfig` logic, settings-mirror resync | Sidecar (TS, unchanged) | — | Needs platform wine detection; not portable in 85 (see Q5). Only its file I/O moves. |
| Secrets (Keychain) | Rust shell `keyring_dispatch` (untouched) | — | No store crate code touches the keyring. |
| Corpus/oracle generation | Test/meta tooling (jest + cargo `-cli`) | — | Fake-HOME harness. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `serde_json` (workspace, locked) | 1.0.151 [VERIFIED: src-tauri/Cargo.lock] | Number type, `PrettyFormatter` with custom indent, string escaping; features `float_roundtrip` (new) | Escaping matches JS `JSON.stringify` for control chars, `/`, DEL and U+2028 (measured via round-trip over real files). `preserve_order` stays OFF (Phase 84 anchored guard). |
| `indexmap` 2 (+`serde`) (locked) | 2.14.0 [VERIFIED: src-tauri/Cargo.lock] | Ordered maps in the store-private value type | Already a `gamelib-core` dependency. |
| `tempfile` (locked) | 3.27.0 [VERIFIED: src-tauri/Cargo.lock] | Test fixtures; model for temp naming only | Already used by 10 crates. Atomic writes should copy `gamelib-steamfiles/src/atomic.rs` (symlink-following, `create_new` temp, `sync_all`, rename) rather than add a crate. |
| `gamelib-core` (in repo) | 0.1.0 | `FrontendEmitter`, `shutdown` Registrant/Token, `paths` | Core holds traits and composition-root types. |
| `gamelib-testutil` (in repo) | — | `FakeHome` for every test | Fake-HOME convention. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `serde` (derive) | 1 | Frame/args decoding with `deny_unknown_fields` | Native handler arg validation (83/84 pattern). |
| jest 29.7 + ts-jest | 29.7.0 / 29.3.2 [VERIFIED: package.json] | TS oracle, shared vectors, port-complete gate | Oracle generates fixtures; deleted with the TS in the last plan (84 pattern). |
| `zod` 4.6.7 [VERIFIED: package.json:151] | Source of truth for the schema descriptor export (`meta/genStoreSchemas.ts`) | The strip migrations read zod at call time; Rust cannot, so a generated descriptor is checked in. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Store-private ordered value type | Enable `serde_json/preserve_order` shell-wide | One-line change, but flips key order for every crate in the shell build, breaks Phase 84's recorded decision and anchored guard, and `Map::remove` becomes `swap_remove` (reorders). Rejected; revisit only if the private type proves costly. |
| Order-preserving frames via `valueJson` string | Parse frame args as `Value` | Sorted nested keys on every sidecar write: breaks D-05 byte parity. |
| `kind:"store"` ordered stdout frames for writes | `rustInvoke` per write | `rustInvoke` is dispatched on a spawned worker thread per call (`src-tauri/src/sidecar.rs:534` comment), so no FIFO. Rejected. |
| In-memory mirror + rebase | `Atomics.wait` sync RPC from a worker | Hand-built sync RPC violates the sidecar exit contract and adds a handle. Rejected. |
| New `gamelib-store` crate | Widen `gamelib-core::store` | `gamelib-core/src/lib.rs` states "core holds traits and shared composition-root types only". The store is an implementation (migration engine, schema descriptors). New crate; move `StoreHost`/`Store` with the same method signatures (`open_cache`, `get`, `set`, `remove`, `snapshot`, `on_change`) and update the 4 shell import sites (`native_router.rs`, `log_upload.rs`, `main.rs`). |

**Installation:** none. No external package is added; `Cargo.lock` gains only the in-repo `gamelib-store` (and `gamelib-store-cli`) entries. Update `.github/workflows/rust-test.yml` (`-p` list), `meta/__tests__/rustTestWorkflow.test.ts` and `src/backend/__tests__/cargoFeatures.test.ts` (`EXPECTED_LOCKFILE_CRATE_NAMES`) exactly as plan 84-02 did for `gamelib-log` [CITED: .planning/phases/84-logger/84-02-SUMMARY.md files-modified list].

**Version verification:** `cargo tree -e features -i serde_json` shows the shell build's serde_json features are `default`, `raw_value`, `std`, `alloc`, `unbounded_depth`; no `preserve_order` [VERIFIED: command run this session]. Adding `float_roundtrip` is a unified feature across the shell build (parse precision only; benign) and must be added to the anchored-feature gate notes.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| tempfile | crates.io | 11 yrs | 20.9M/wk | github.com/Stebalien/tempfile | OK | Approved (already locked 3.27.0) |
| indexmap | crates.io | 8 yrs | 39.6M/wk | github.com/indexmap-rs/indexmap | OK | Approved (already locked 2.14.0) |
| serde_json | crates.io | 11 yrs | 35.4M/wk | github.com/serde-rs/json | OK | Approved (already locked 1.0.151) |
| serde | crates.io | — | — | — | OK (checked in the same `package-legitimacy check` run) | Approved (already locked) |

`gsd_run query package-legitimacy check --ecosystem crates tempfile indexmap serde_json serde` returned OK for all four [VERIFIED: command run this session]. **Packages removed due to SLOP:** none. **Packages flagged SUS:** none. No package is newly introduced to the lockfile.

## Architecture Patterns

### System Architecture Diagram

```
                      BOOT (before the sidecar exists)
  run_setup --> StoreHost::open_all(store_table)  [bounded: Shutdown token, count/time cap]
      |            per file: read bytes -> parse (ordered) -> version codec
      |              ok / identity-adopt: no write          newer: read-only (kept)
      |              pending chain: backup(<=3) -> migrate -> atomic write
      |              corrupt: keep bytes, read-only 'failed', report
      |            sweep GamesConfig/*.json the same way (settings codec)
      v
  spawn sidecar (files on disk are final) ------------------------------+
                                                                         |
 RENDERER                       RUST SHELL                              SIDECAR (TS)
 storeSet/storeFetch/...  --->  native store channels  (one owner)      MirrorCell per file path
  (policy: allow-list,           |  flipped family ---> StoreHost         get/has/store: memory
   safe key path, token guard)   |  unflipped family -> internal relay    set/delete/clear:
 <--- storeChanged{rev} -------- ordered event dispatcher (single FIFO)      1 apply locally (pending op)
 <--- snapshot{rev} (under lock) |                                           2 frame kind:"store" -----+
                                 |<---- single stdout reader (in order) <----+  {seq,store,op,key,valueJson}
                                 |  per-store apply -> rev++ -> persist (atomic, 0600)
                                 |  -> events: renderer (policy-filtered) + sidecar (storeMirrorEvent)
                                 +--> read-only entries --> readOnlyStoresNotice once per launch
 sidecar rebase: base = Rust event stream (rev order); view = base + still-unacked local ops
 exit: store drain holds a Registrant until the queue is empty (inside the 3.5 s drain budget)
```

### Recommended Project Structure
```
src-tauri/crates/gamelib-store/
├── src/json.rs        # ordered Value, visitor, tab/2-space serializer, JS-order key insert
├── src/dotpath.rs     # dot-prop 6 semantics (get/set/has/delete, escape, disallowed segments)
├── src/envelope.rs    # __internal__.gamelib.schemaVersion + settings `version: 'vN'` codecs
├── src/engine.rs      # decide ok/migrate/discard/read-only/failed; backup; kinds
├── src/migrate/       # chains: settings.rs, libraries.rs, strip.rs (descriptor-driven)
├── src/schemas.json   # GENERATED from zod (meta/genStoreSchemas.ts), include_str!
├── src/table.rs       # store table (dir,name,kind,tokenBearing,clearInvalidConfig,dot_paths)
├── src/host.rs        # StoreHost, Store, rev, ordered event queue, per-family backends
├── src/atomic.rs      # copy of the steamfiles atomic_write, mode 0600/0700
└── tests/{golden.rs,corpus.rs,roundtrip.rs}
src-tauri/crates/gamelib-store-cli/   # replay/migrate a profile dir headlessly (fake HOME only)
src-tauri/crates/gamelib-store/tests/fixtures/{corpus/,golden/,MANIFEST.json}
src/common/types/ipc/storeChannels.json  # shared policy + vectors (jest + cargo), like nativeChannels.json
src/backend/stores/mirrorCell.ts + mirrorStore.ts  # the TS mirror (replaces store_backend.ts owner path)
```

### Pattern 1: Ordered JSON with JS key order
**What:** A store-private `Json` enum (`Null/Bool/Num(serde_json::Number)/Str/Arr/Obj(IndexMap<String, Json>)`) with a `Deserialize` visitor and a serializer built on `serde_json::ser::PrettyFormatter::with_indent(b"\t")` (stores) or `b"  "` (settings documents). Duplicate keys: IndexMap keeps first position and last value, as `JSON.parse` does.
**When to use:** every store read/write and every frame value.
**JS ordering on insert (verified need):** JS objects list integer-like keys ("0".."4294967294", canonical decimal) first in ascending order, then other keys in insertion order. Real files show it (`store/timestamp.json` and `store_cache/steam_metadata.json` start with integer keys: 5 and 413 integer-like keys respectively). An insert of a new key must reproduce this at every depth, including keys created by dot paths, or a Rust-written file differs from what TS would have written. Existing keys keep their position.
**Example (measured harness, scratch crate):**
```rust
// Source: scratch harness /private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/dfdf0729-2268-49bb-8648-17cd63118a4b/scratchpad/rt/src/main.rs (run this session)
let fmt = serde_json::ser::PrettyFormatter::with_indent(b"\t");
let mut s = serde_json::Serializer::with_formatter(&mut buf, fmt);
value.serialize(&mut s).unwrap(); // identical to JSON.stringify(v, undefined, '\t'): 156/159 real files
```

### Pattern 2: Two on-disk flavours, one engine
- **conf store** (55 registry stores): tab indent, no trailing newline, `__internal__: { gamelib: { schemaVersion: N } }` stamped at write time (`stampForWrite` spreads the value and adds/updates `__internal__`; it keeps an existing key's position, otherwise appends last), dot-path access, mode 0600, dirs 0700, token-bearing files/dirs tightened on load (`tightenTokenPaths`: file 0600, dir 0700 only when group/other bits are set).
- **settings document** (`<appFolder>/config.json` chain `settings/global`; `GamesConfig/<app>.json` chain `settings/game`): 2-space indent, no trailing newline, top-level `version: 'vN'` string (`parseSettingsVersion`: absent/unparseable = v0), whole-document writes (`{defaultSettings, version}` and `{<appName>: {...}, version, explicit}`), no `__internal__`. Current versions: `currentGlobalConfigVersion = 'v2'` [VERIFIED: src/backend/constants/others.ts:4].
- **marker documents** (engine marker `<bottle>/.gamelib-engine.json` chain `engine/gamelib-engine-marker`; `<bottle>/gamelib-shared-redists.json` chain `steam_bridge/shared-redists`): numeric top-level `version`, chains empty so baseline v1 is an identity adoption (never rewritten). Written compact (`JSON.stringify({ ...marker, version })` in `engineSwitch.ts:389`). **These are not in `82-STATE-OWNERSHIP.md` or the roadmap and are consumers of `storeVersioning/*`** (see Q2): deleting that directory in 85 strands `engineSwitch.ts`/`sharedRedistInstall.ts`.

### Pattern 3: Mirror cell with pending-op rebase (read-your-writes, ordering)
**What:** One `MirrorCell` per resolved file path per `StoreRoot` (never per TS store instance): `base` (state at the last Rust event applied, plus `rev`), `pending` (local ops not yet acknowledged, each with `seq`), and `view = apply(pending, base)`. All reads use `view`. A local write appends to `pending`, updates the view synchronously and enqueues one ordered frame. A Rust event for `(store, rev, originSeq?)` is applied to `base` in `rev` order; if `originSeq` is set, that op leaves `pending`; the view is recomputed. This converges to Rust's state, keeps read-your-writes at all times, and is correct when a renderer write to the same key interleaves.
**Why per path:** `conf` re-read the file on every access, so two instances over one file were coherent through the disk. In-memory per-instance copies break that for `steamConfigStore`/`steamBottleConfigStore` (one file, two TS names) and for ad hoc `new Store(...)` in `storeWriteHandlers.ts` and `handlers.ts`.
**Settings documents:** `GameConfig.readSettings()` re-reads `GamesConfig/<app>.json` after a flush (`game_config.ts:208`), as do `engine/engineConfig.ts` and `steam/titleSettings.ts` (`readStoredGameConfig`). A single TS helper `readSettingsDoc(path)` must serve pending (unacked) writes before falling back to `readFileSync`; every direct reader moves to it.

### Pattern 4: Rust-owned channels, per-family backend
The 83 test fails on a channel with zero or two owners, and the store channels (`sidecar:store-snapshot` command, `sidecar:store-fetch`, `storeSet`, `sidecar:store-set-checked`, `storeDelete`, `storeNew`, `storeChanged` push) are single names shared by all families. Make Rust the owner of each channel at the channel level; a flipped family resolves to `StoreHost`, an unflipped family is forwarded internally to the sidecar under renamed internal channels. `GAMELIB_STORE=ts` forces every family back to the sidecar backend until the last plan deletes the flag. Snapshot results merge both backends.

### Pattern 5: Slice recipe (Phases 63-84)
Golden/oracle fixtures committed before TS is touched; shared vectors for jest and cargo; a `-cli` for headless parity; live-gate contract authored first (`85-HUMAN-UAT.md`); a "PortComplete" source gate (`storeHostPortComplete.test.ts`, as `loggerPortComplete.test.ts`) asserting the deleted modules are gone; the last plan deletes the flag.

### Anti-Patterns to Avoid
- **`serde_json::Value` as the store value** (sorts nested keys; the existing `Store` holds `IndexMap<String, Value>`, which keeps only top-level order).
- **Notifying after the lock is released** (`store.rs` fires `notify` after the data lock drops): two concurrent sets can notify out of order. Assign `rev` under the lock and dispatch through one FIFO.
- **`Map::remove` on an ordered map** (use `shift_remove`; `swap_remove` reorders).
- **Writing `1.0`/`100.0`:** serde_json prints an f64 as `100.0` where JS prints `100` (measured). Never construct f64s in a migration; keep integers.
- **Opening a second Rust reader of the same file with its own cache** (`tray/recent.rs`, `gamelib-steampoll/src/profile.rs` read `config.json`/`store/config.json` today): fine as atomic-rename readers, but they must not write.
- **Hand-edits while the app runs:** `conf` picked them up (re-read each access); the Rust owner will overwrite them at its next write. UAT scripts that edit store files must do so with the app closed (plan note, not a bug).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JS-compatible pretty JSON | A new formatter | `serde_json` `PrettyFormatter::with_indent` over the private ordered type | Escaping parity measured on 156 real files. |
| Atomic same-directory write with symlink follow | A fresh `tmp + rename` | Copy `gamelib-steamfiles/src/atomic.rs` (symlink resolve, `create_new`, `sync_all`, perms) and force 0600 | 75 WR-03/WR-04 already fixed the concurrent-temp and symlink-replacement bugs. |
| Dot-path semantics | Ad hoc `split('.')` | A port of `dot-prop@6.0.1` `getPathSegments/get/set/has/delete` (backslash-dot escape, `__proto__`/`prototype`/`constructor` rejected, arrays traversed by index, `set` overwrites non-objects with `{}`, `delete` does not prune parents) [VERIFIED: node_modules/dot-prop/index.js read this session] | Stores contain literal dotted top-level keys (11 in `gog_api_info.json`) and `__timestamp.<key>` nesting; wrong semantics corrupt caches. |
| Zod strip in Rust | Re-deriving key lists by hand | Generate a schema descriptor from zod (`meta/genStoreSchemas.ts`), check it in with a drift test, and drive the Rust strip from it | The TS strip "reads the zod schema at call time (no copied key lists)" so the two can never disagree; a hand copy would. |
| Backup rotation | New scheme | Port `writePreMigrationBackup`: `<name>.v<from>.<UTC stamp>.bak.json`, skip when bytes equal newest, keep `MAX_BACKUPS_PER_STORE = 3` [VERIFIED: src/backend/storeVersioning/backup.ts:22] | Same file names so v0.10 and Rust coexist; operator profile already holds such backups. |
| Per-store config table | Hand-typing 55 entries | Generate from `src/backend/stores/__tests__/fixtures/registeredStores.json` (name, dir, clearInvalidConfig, kind, tokenBearing) plus the 3 `dir/name` exceptions, with a drift test | The fixture is already the ratchet for the TS side. |

**Key insight:** every divergence found this session (sorted keys, `.0` floats, integer-key order, `__internal__` leaking into snapshots, tab vs 2-space) is invisible to a semantic JSON-equality test and visible only to a byte diff over real files. The test asset, not the code, is what protects this phase.

## Runtime State Inventory

Not a rename, but a persistence migration; the five categories apply.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 55 registry stores (46 distinct files; `pci_ids_*` registered twice; `steamConfigStore`+`steamBottleConfigStore` share `steam_store/config.json`), `<appFolder>/config.json`, ~75 `GamesConfig/<app>.json` on the operator profile (some 0644 untouched by the engine, some 0600), 2 bottle-local versioned files, existing backups `<name>.v<N>.<stamp>.bak.json` (`config.v0.20261108T091637899Z.bak.json`, `steam_library.v1.…bak.json` are real older-shape captures usable as corpus seeds), `store/migrations.json` (left in place, D-07). Files outside scope: `gog_store/auth.json` (gogdl), `nile_config/**` (nile), `legendaryConfig/**` (legendary), written in other formats. | Data migration for pre-v0.10 (unstamped) files via the ported chains; code edit for the writer. |
| Live service config | None. No external service holds a store key. | None — verified by reading `keyring_dispatch` and the store table. |
| OS-registered state | Keychain items: service `com.gamelib.launcher`, accounts `steam-refresh-token`, `humble-session`, `humble-csrf`, `steamgrid-api-key`, `itad-api-key` [VERIFIED: src-tauri/src/main.rs:428,481-490]. | None to change; add a pin test. |
| Secrets/env vars | Store files hold flags and ids only on the current profile (`steam_store/config.json` keys: `bottleName, wineCrossoverBottle, wineVersion, provisioned, cmLogonId, isLoggedIn, userData{username,steamId}`; `humble_store/config.json`: `encryptionDegraded, isLoggedIn, expired`). Older profiles (v0.8/v0.9) may still carry `steam:v1:`/`humble:v1:` ciphertext keys; unknown keys must round-trip untouched so the TS `humbleSecretStore` migration still finds them. `GAMELIB_STORE` is a new env var, inherited by the sidecar (the shell spawns it with inherited env). | Redact `userData`, ciphertext and tokens in corpus fixtures. |
| Build artifacts / installed packages | Tags `v0.8`, `v0.9`, `v0.10` exist locally; `v0.9`/`v0.8` on the remote; **`v0.10` is not on the remote and no `v0.10` GitHub release exists**; only `v0.8.0` is published (pre-release). | See Open Question Q1. |

## Common Pitfalls

### Pitfall 1: The documented format is wrong in two places
**What goes wrong:** `store.rs` header says "2-space pretty JSON"; Phase 84 `uploadedLogs` writes 2-space without an envelope.
**Why:** the header described the deleted Phase 27 sidecar file store, which "never ran in production".
**How to avoid:** conf stores tab + `__internal__` envelope; settings documents 2-space; fix `store.rs` doc, its `TS_SHAPED` test fixture and the `uploadedLogs` path in the widened host. v0.10 declared `uploadedLogs` with `accessPropertiesByDotNotation: false` and kind `cache` [VERIFIED: `git show v0.10:src/backend/logger/stores.ts`: `accessPropertiesByDotNotation: false`], so the host needs a per-store `dot_paths` flag (false for this one store; its keys are URLs containing dots).
**Warning signs:** a no-op boot changes bytes of a v0.10 `uploadedLogs.json`.

### Pitfall 2: `__internal__` leaks into snapshots and entries
**What goes wrong:** Phase 84's `prune_expired` iterates `store.snapshot()`; on a v0.10 file the `__internal__` key becomes a fake upload entry in the UI list.
**How to avoid:** the host owns the envelope: `snapshot()`/`get` never expose `__internal__`; writes stamp it; `refuseReservedKey` parity (`typed_store.ts:37` `const RESERVED_KEY = '__internal__'`). Add a regression test over a stamped v0.10-shaped `uploadedLogs.json`.

### Pitfall 3: Identity adoption must not rewrite
**What goes wrong:** the engine returns without writing when every pending step is identity (`if (steps.every((s) => s.identity)) return state`, `engine.ts:163`), so unstamped files stay unstamped until their first write. A port that stamps at boot makes a no-op launch dirty every file.
**How to avoid:** replicate exactly; assert "no-op boot = zero byte changes" over the corpus. Likewise `fileVersion === current` returns untouched; `fileVersion > current` is read-only `'newer'` (`engine.ts:152-159`); a cache with a non-identity pending chain is deleted (no cache chain exists today, so the branch is unreachable but ported and tested with an override).

### Pitfall 4: "Corrupt file kept and reported" is not what TS does
**What goes wrong:** D-12 says Phase 68 already does this. It does not: the engine treats an unreadable or malformed file as "conf keeps its own clearInvalidConfig behaviour" (`engine.ts:139-142`), and conf with `clearInvalidConfig: true` returns an empty store on a `SyntaxError` (`node_modules/conf/dist/source/index.js` `get store()`), so the next write replaces the corrupt file. 42 of the 55 registrations set `clearInvalidConfig: true` (36 under `store_cache`, plus macArch, runsForMe, gameOverrides, two GOG stores and sideload) [VERIFIED: counted from registeredStores.json this session]. Phase 84's host is already stricter (`InvalidData`, file untouched).
**How to avoid:** Rust implements SC2 literally: corrupt bytes are never overwritten; the store opens read-only with reason `'failed'` (existing closed set `READ_ONLY_REASONS = ['newer', 'failed']`), serves an empty view, and the area notice fires. For `GlobalConfig`/`GameConfig` a corrupt document must degrade without throwing at boot. Q4 asks whether a copy-aside is also wanted.

### Pitfall 5: SC1 "unknown keys preserved" vs the strip migrations
The v1→v2/v3 chains delete undeclared keys by design (D-04 Phase 68, "clean rewrite") behind a pre-migration backup. For a current-version file nothing is stripped and unknown keys must survive a read-write round trip; for an older file the ported migration strips exactly what TS strips. The corpus golden for older profiles asserts TS-oracle parity, not key preservation. State both in the test names.

### Pitfall 6: Per-instance mirrors diverge (see Pattern 3)
Shared-file stores and ad hoc `Store` constructions require a per-root, per-path cell.

### Pitfall 7: `rustInvoke` is unordered
Writes sent through `rustInvoke` can reorder (spawned worker per call). Use the single stdout reader's in-order arm (`sidecar.rs` handles `kind:"log"` there without blocking the reader, `sidecar.rs:527-531`). The store arm must also never block the reader (the 2026-10-05 send-queue freeze); never drop a store write the way the log queue drops (use an unbounded queue with a counted high-water log line).

### Pitfall 8: Tauri events and invoke responses have no relative order
The renderer already documents it: "A push and a fetch result take different routes from the shell with no ordering guarantee" and buffers `changesDuringFetch`, replayed over the fetch result [VERIFIED: src/preload/tauriTransport.ts:158-163]. Keep that mechanism; add an optional `rev` to `StoreChangedPayload` and to snapshot/fetch results so a stale push is dropped instead of transiently applied. Rust must emit in apply order (single dispatcher).

### Pitfall 9: Durability window and exit
Writes become asynchronous: a SIGKILL loses frames not yet persisted (conf wrote synchronously). Hold a `Shutdown` Registrant while the store queue is non-empty and add a `store` drain to `handle_exit` within the 3.5 s budget; the sidecar is stopped in the later children stage, so frames already in the pipe must be read before the drain declares empty. Provide a `flush` barrier op for critical user-state (download queue, pending adoption) at known points. `sync_all` on macOS is a full fsync: parity is no fsync for caches; decide per kind (Q6).

### Pitfall 10: Windows rename over an open file
`gamelib-log` already pins the fact that a destination opened without `FILE_SHARE_DELETE` refuses a rename (`writer.rs` `mod windows`, opens with `share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)`). Rust `std::fs` opens with all three share flags and libuv does too (assumed), so the realistic blockers are antivirus/indexers. Keep the direct-write fallback; add a bounded retry with backoff before it; test with the same non-share-delete handle on the Windows CI leg. Never leave a torn file on fallback failure (the fallback truncates then writes; a crash mid-write corrupts: copy the previous bytes aside first for user-state kinds).

### Pitfall 11: Settings factory defaults and the resync
`resyncSettingsMirror` merges `config.getSettings()` (factory defaults from `getFactoryDefaults()`, which calls `getDefaultWineBinary()` and platform checks) into `store/config.json: settings`. This cannot run in Rust in 85. Keep it in TS through the mirror (Q5).

### Pitfall 12: Test harness blast radius
89 backend test files reference `testStoreRoot`/`createStoreRoot`/`createTestServices`; most mock `store_backend` (`src/backend/__mocks__/store_backend.ts`), about 10 use real stores (`humble/__tests__/library.realstore.test.ts`, `crossover_index/__tests__/*`, `wiki_game_info/__tests__/*`). The mirror needs an injectable frame sink so jest can run it with a recording fake or an in-process writer; `smoke:sidecar` runs the sidecar with no Rust peer (reads only; writes go to an unread stdout).

### Pitfall 13: Number edge cases (low risk, pin with vectors)
Measured serde_json vs JS: `1e21` both `1e+21`; `1e20` JS `100000000000000000000`, Rust `1e+20` (an integer text beyond u64 parses as f64); `-0` JS `0`, Rust `-0.0`; `18446744073709551615` JS loses precision, Rust keeps it; a lone-surrogate `\ud83d` escape that JS can write is a parse error in serde_json. None occurs in the corpus (timestamps are ints < 2^53). Add one vectors file; tolerate by keeping the file read-only `'failed'` rather than rewriting.

## Code Examples

### Version and corrupt decision (port of `runFileMigration`)
```rust
// Source: port of src/backend/storeVersioning/engine.ts:115-201 (read this session)
match (parse(bytes), codec.read(&doc)) {
    (Err(_), _) => State::read_only(Reason::Failed, "unparseable"),         // kept; never rewritten
    (Ok(_), v) if v > current => State::read_only(Reason::Newer, detail),   // engine.ts:152-159
    (Ok(_), v) if v == current => State::ok(),
    (Ok(doc), v) => {
        let steps = chain.pending(v);
        if steps.iter().all(|s| s.identity) { return State::ok(); }          // engine.ts:163: no rewrite
        if kind == Cache { remove_file(path)?; return State::ok(); }          // engine.ts:165-177
        write_pre_migration_backup(path, v, bytes)?;                          // <=3 kept
        atomic_write(path, serialize(codec.write(run_all(steps, doc), current)))
            .map_or_else(|e| State::read_only(Reason::Failed, e), |_| State::ok())
    }
}
```

### Frame shape (sidecar to shell, ordered)
```ts
// kind:"store" stdout frame; value travels as a JSON string so the shell's Value parse never sorts keys
{ kind: 'store', seq: 41, store: 'steam_library', op: 'set', key: 'games', valueJson: '[{"app_name":"480",...}]' }
// ops: set | delete | clear | replace (CacheStore.commit()) | flush(barrier) ; Rust answers on the shell->sidecar
// internal channel storeMirrorEvent { store, rev, op, key, originSeq } in rev order
```

### Shared policy vectors (jest and cargo read the same file)
```jsonc
// src/common/types/ipc/storeChannels.json (new, modelled on nativeChannels.json)
{ "policy": { "STORE_ALLOWLIST": {...}, "WRITE_DENIED_FIELDS": {...}, "DENIED_CACHE_STORES": ["humble_library"] },
  "writeVectors": [ { "store": "steamConfigStore", "key": "refreshToken", "allowed": false }, { "store": "x", "key": "a.__proto__.b", "allowed": false } ] }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `conf` re-reads the file on every `.get()` (coherent across instances, hand edits visible) | In-memory mirror cell + Rust single writer | this phase | Faster reads; shared-file coherence must be rebuilt; hand edits while running are overwritten. |
| `uploadedLogs` as a TS conf store | Rust-owned from Phase 84 | 84 | Needs format/envelope correction in 85. |
| Corrupt file: conf resets on next write (`clearInvalidConfig`) | Keep bytes, read-only `'failed'`, report | this phase (SC2) | New behaviour, not a port. |
| Cache/user-state split decided per store at construction | Rust store table generated from `registeredStores.json` | this phase | One table, drift-tested. |

**Deprecated/outdated:** the `store.rs` header comment ("2-space pretty JSON"), its `TS_SHAPED` fixture and the gamelib-log/core Cargo comments that say `preserve_order` must stay off "for every crate" (still true; add the reason that nested order needs the private type).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | macOS Keychain item ACLs bind to the code signature of the accessing binary, so a new prompt appears only if the signing identity/designated requirement changes between builds (or a different binary starts reading an item) [PITFALLS.md Pitfall 12 rates this MEDIUM; not observed for this migration] | Summary, Security | The D-08 gate could pass on identical identities yet fail for users on a different one; mitigate by gating with the same identity for both builds. |
| A2 | Node/libuv opens files with `FILE_SHARE_DELETE` and Rust `std::fs` uses all three share modes on Windows | Pitfall 10 | The sidecar's boot-time read could block a Rust rename; low impact, direct-write fallback exists. Verify on the Windows leg. |
| A3 | Boot parse of every store is cheap enough to run synchronously before the sidecar spawn; measured parse + two serializations of all 159 files was 0.38 s wall including process start (release build, operator profile) | Architecture | If a user has thousands of `GamesConfig` files the sweep needs the documented time/count cap. |
| A4 | An eager `GamesConfig/*` sweep at boot is acceptable even though `game_config.ts:335` documents "never sweeps GamesConfig/ at boot" | Pattern 3 | Required so TS's synchronous per-game reads never see unmigrated files; if rejected, TS readers must tolerate old shapes until first Rust touch. |
| A5 | zod grammar used by the settings and GameInfo schemas is small enough to descriptor-drive in Rust (counts: `z.boolean` 79, `strictObject` 26, `number` 12, `string` 10 with `.max(N)`, `array` 10, `literal` 9, `enum` 8, `union` 3, `record` 1, `looseObject` 1, `discriminatedUnion` 1; refinements: `.max`, `.min(1)`, `.brand`, `.nullish`, `.optional`, `.default`) | Standard Stack | An unlisted refinement (`.refine` in `schemaTypes`) would need a descriptor kind; check `schemaTypes.ts` helpers before sizing. |
| A6 | The only supported upgrade sources are v0.8, v0.9 and v0.10 (CONTEXT D-09 corpus) | Legendary finding | A direct v0.7-era profile would also have the legendary id recorded (Electron `main.ts:412` ran it), so the finding is robust, but the strip chains would run from v0 on such a profile. |
| A7 | `sync_all` per write on macOS is a full fsync and too slow for high-frequency cache sets | Pitfall 9 | If cheap, enable it for all kinds. |
| A8 | The signed-upgrade macOS gate can be run with the operator's `Apple Development` identity only if both builds use it; the CI "Developer ID" path was not inspected | Open Questions | Identity mismatch invalidates the gate. |

## Open Questions

1. **There is no published signed v0.10 to upgrade from (blocks D-08).**
   - What we know: `gh release list` shows only `v0.8.0` (pre-release) among GameLib releases; `gh release view v0.10` returns "release not found"; `git ls-remote --tags origin` lists `v0.8`, `v0.8.0`, `v0.9` but not `v0.10`; the last `release-tauri.yml` runs are `v0.9` (success, 2026-11-06) and earlier; the local keychain has one valid code-signing identity, `Apple Development: grayson mitchell`; the workflow header says "0.x ships UNsigned" though a later comment says all six Apple secrets are now enrolled.
   - What's unclear: how the operator will obtain a signed v0.10 baseline and a signed, notarized Phase 85 build with the same identity.
   - Recommendation: add a Wave 0 task (checkpoint:human-action): push `v0.10` (operator authorises) to run `release-tauri.yml`, or run it by `workflow_dispatch`, and record the signing identity of both artifacts before the gate is scheduled. Until then SC3 cannot be proven; the plan must say so rather than substitute a dev build.

2. **Bottle-local versioned files and `storeVersioning/*` deletion.**
   - What we know: `engineMarkerFile.ts` and `sharedRedistLedgerFile.ts` live in `storeVersioning/` and are consumed by `engine/engineSwitch.ts` and `storeManagers/steam/bridge/sharedRedistInstall.ts` (Phases 87 and 95). They are absent from the ownership table.
   - Recommendation: a small Rust op `version_gate(path, chain)` (read version, refuse-newer, no migrations since both chains are empty) called via `rustInvoke` at the two TS call sites, or a ~40-line TS `versionedFile.ts` kept until 87/95. Either way, name it in the ownership table and add it to the SC5 deletion inventory. Needs a decision before planning wave 1.

3. **SC5 wording "name and execute the mirror's deletion point for every family".**
   - Recommendation: name every store's deletion phase in a pinned table (`storeMirrorSchedule` test, copied from the ownership table); execute only the deletion whose phase is 85 (`migrationsStore`), plus delete the TS *owner* path for all families (D-03). Confirm.

4. **Corrupt file: read-only only, or also copy-aside?** SC2 says "kept and reported". Read-only `'failed'` with an empty view means the user loses that area until they hand-fix the file. A copy-aside (`<name>.corrupt.<stamp>.json`) plus continuing on an empty store is friendlier but is a reset in effect. Recommend read-only plus a `.corrupt.<stamp>` copy for settings/user-state, and for caches (rebuildable) allow continuing on empty only after the copy exists. Operator decision.

5. **D-15 "resync ported with configStore".** The resync needs TS factory defaults; recommend it stays TS (through the mirror) and D-15 is read as "keeps working", not "moves to Rust". Confirm.

6. **Per-kind durability.** `sync_all` for user-state only, none for caches? Recommend yes (A7), measured on the Windows leg and macOS during the spike.

7. **`GlobalConfig` first-boot write.** `load()` calls `resetToDefaults()` (a write) when `config.json` is absent; with Rust as writer this becomes a frame at boot. Confirm that a fresh profile's first `getSettings()` is served from the in-memory `this.config` (it is) so no read-after-write race exists.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cargo / rustc | all Rust work | yes | cargo 1.99.1 / rustc 1.99.1 | — |
| node / pnpm | oracle, jest | yes | v22.23.4 / 10.28.0 | — |
| jest | tests | yes | 29.7 (ts-jest 29.3.2 range) | — |
| macOS signing identity | D-08 gate | partial | `Apple Development: grayson mitchell (4BULWN7PPN)` only (no Developer ID found locally) | CI `release-tauri.yml` with enrolled secrets (Q1) |
| Published signed v0.10 | D-08 gate | **no** | tag local only; no release | Q1 |
| `gh` CLI | release inspection | yes | authenticated | — |
| Windows machine / CI leg | Windows rename + keyring-name tests | CI only | `rust-test.yml` three-OS legs | batch a live Windows check with Phase 99 (D-10) |
| Old release builds for corpus | D-09 profiles | partial | tags `v0.8`, `v0.9` on remote, `v0.10` local; building a tag needs its own lockfile and `build:sidecar` | run only each tag's headless sidecar in a fake HOME (no GUI), seeded additionally from the operator profile's real `*.bak.json` pre-migration captures |

**Missing with no fallback:** a published signed v0.10 baseline (Q1).
**Missing with fallback:** per-tag app builds (use sidecar-only generation plus real backups).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust `cargo test` (std harness, per crate, 3 OS legs in `rust-test.yml`); jest 29.7 with projects `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta`, `relay` |
| Config file | `src-tauri/Cargo.toml`, `jest.config.js`, `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts` |
| Quick run command | `cd src-tauri && cargo test -p gamelib-store` |
| Full suite command | `cd src-tauri && cargo test --bin gamelib-shell && cargo test -p gamelib-store -p gamelib-core -p gamelib-log -p gamelib-proc -p gamelib-steamcm`, then `pnpm exec jest --runTestsByPath <changed suites>`, `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode`, `pnpm planning-gates`, `pnpm smoke:sidecar` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-06 / SC1 | Every corpus file (operator profile + v0.8/v0.9/v0.10 generated + real `*.bak.json` captures) loads, no-op re-save is byte-identical (tab for stores, 2-space for settings), unknown keys preserved at current version | integration | `cargo test -p gamelib-store --test corpus roundtrip_is_byte_identical` | ❌ Wave 0 |
| FND-06 / SC1 | Fixture pinning: manifest lists every fixture with hash and count; the test fails when fewer than N files are found (cannot pass vacuously) | integration | `cargo test -p gamelib-store --test corpus manifest_is_complete` | ❌ Wave 0 |
| FND-06 / SC1 | JS key order on insert (integer-like keys first at every depth), dot-path set/get/delete parity with `dot-prop@6` incl. literal dotted keys | unit + golden | `cargo test -p gamelib-store json::order dotpath` and TS oracle `src/backend/stores/__tests__/storeOracle.test.ts` | ❌ Wave 0 |
| FND-06 / SC1 | Number/escape vectors (`.0`, 1e20, -0, lone surrogate, U+2028) | unit | `cargo test -p gamelib-store json::numbers` | ❌ Wave 0 |
| FND-06 / SC1 | Strip migrations (settings v0→v2, libraries v0/v1→v3) equal the TS zod oracle on corpus inputs | golden | `cargo test -p gamelib-store --test migrate_golden` ; generator `GAMELIB_WRITE_STORE_GOLDEN=1 pnpm exec jest storeOracle.test.ts` | ❌ Wave 0 |
| FND-06 / SC1 | Schema descriptor is not stale | jest | `pnpm exec jest src/backend/storeMigrations/__tests__/schemaDescriptor.test.ts` | ❌ Wave 0 |
| FND-06 / SC2 | Backup before migrate, newest-equal skip, max 3, file names, 0600; newer = read-only with `'newer'`; corrupt (`{not json`, `[1]`, empty, BOM) kept byte-identical with `'failed'`; missing = empty; identity adoption writes nothing | unit | `cargo test -p gamelib-store engine::` | ❌ Wave 0 |
| FND-06 / SC2 | Read-only notice payload and `AREA_BY_KEY` parity (ids only, once per launch) | unit + jest vector | `cargo test -p gamelib-store readonly::` ; `cargo test --bin gamelib-shell read_only_notice` | ❌ Wave 0 |
| FND-06 | Atomic write: temp cleanup, symlink follow, 0600/0700, EPERM fallback, Windows non-share-delete handle | unit (+ CI Windows) | `cargo test -p gamelib-store atomic::` ; `atomic::windows` | ❌ Wave 0 |
| FND-06 | Ordering: rev under lock, in-order events with concurrent writers; snapshot rev vs change rev; listener may call back | unit | `cargo test -p gamelib-store host::ordering` | ❌ Wave 0 |
| FND-06 | Mirror: read-your-writes, rebase against interleaved renderer write, shared-file coherence, ack removes pending, no handle left (`unref`) | jest | `pnpm exec jest src/backend/stores/__tests__/mirrorCell.test.ts` | ❌ Wave 0 |
| FND-06 | `kind:"store"` frame validation vectors shared by jest and cargo (size cap, bad op, traversal, `__internal__`) | unit | `cargo test --bin gamelib-shell store_frame` + `src/common/__fixtures__/storeFrameVectors.json` | ❌ Wave 0 |
| FND-06 | Renderer policy vectors (allow-list, write-denied, `refreshToken` guard, safe key path) identical in TS and Rust | unit | `cargo test --bin gamelib-shell store_policy` ; `pnpm exec jest storePolicy` | ❌ Wave 0 |
| FND-06 | One-owner-per-channel (83 census) holds with the new store channels | jest | `pnpm exec jest nativeSeamPortComplete` + `pnpm check:ipc-contract` | ✅ exists, needs update |
| FND-06 | `uploadedLogs` regression: v0.10 tab+envelope file lists correctly, `__internal__` never returned | unit | `cargo test --bin gamelib-shell log_upload` | ✅ exists, add case |
| FND-06 / SC4 | Reachability recorded and `legendary.ts`, `MigrationSystem`, `migrationsStore` deleted; `store/migrations.json` untouched by a boot | jest | `src/backend/__tests__/storeHostPortComplete.test.ts` | ❌ Wave 0 |
| FND-06 / SC5 | Mirror deletion schedule pinned; `storeVersioning/*`, `storeMigrations/*`, `migration/*`, the flag and owner path gone; `EXPECTED_KINDS`/`registeredStores.json` updated | jest | `src/backend/__tests__/storeHostPortComplete.test.ts`, `storeKinds.test.ts` | ❌ Wave 0 |
| FND-07 / SC3 | Keyring service and slot→account table unchanged; `gamelib-store` and `-cli` have no `keyring` dependency | unit + `cargo tree` | `cargo test --bin gamelib-shell keyring_` ; `cargo tree -p gamelib-store | grep -c keyring` = 0 | ❌ Wave 0 (names pin) |
| FND-07 / D-10 | Same names resolve through `keyring_dispatch` on Windows and Linux legs | unit (CI) | `cargo test --bin gamelib-shell keyring_` on `rust-test.yml` | ❌ Wave 0 |
| FND-07 / SC3 | Signed v0.10 to signed 85: zero Keychain prompts, sign-ins survive | live gate (operator, macOS) | `85-HUMAN-UAT.md` | ❌ authored in Wave 0, run last |
| Exit | Store drain holds a Registrant, empties within the 3.5 s budget; no permanent registrant | unit | `cargo test -p gamelib-core shutdown` + `cargo test -p gamelib-store host::drain` | ❌ Wave 0 |
| Gates | sidecar boot with no Rust peer (reads only) exits cleanly | smoke | `pnpm smoke:sidecar`, `pnpm smoke:exit-check -- --mode eof` | ✅ exists |

### Sampling Rate
- **Per task commit:** the crate/suite named in the task `<verify>` plus `npx prettier --check` over exact written paths (run `--file-info` first; `.planning`, `public/locales` are ignored: omit and say so).
- **Per wave merge:** `cargo test -p gamelib-store -p gamelib-core` + `cargo test --bin gamelib-shell` + targeted jest + `pnpm check:ipc-contract` + `pnpm codecheck`.
- **Phase gate:** CI `rust-test.yml` three-OS green, full jest green, live macOS gate run, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/backend/stores/__tests__/storeOracle.test.ts` (TS oracle: runs the real conf + engine + migrations over scripted op sequences and the corpus, writes goldens under `GAMELIB_WRITE_STORE_GOLDEN=1`; deleted with the TS in the last plan) + `src-tauri/crates/gamelib-store/tests/fixtures/{golden,corpus,MANIFEST.json}` committed before any TS change.
- [ ] Corpus harvest + redaction tool run under `createFakeHomeProfile()` (sidecar-only generation for `v0.8`/`v0.9`/`v0.10`, operator profile copy, real `*.bak.json` captures, hand edge cases: unknown keys, corrupt JSON, newer version, empty, missing, BOM, CRLF), with a redaction test that fails on any value matching token/cookie/ciphertext patterns.
- [ ] `85-HUMAN-UAT.md` live-gate contract authored first (item shape per convention 5), including the offline shape and the signing-identity precondition.
- [ ] `gamelib-store` crate scaffold, CI wiring (`rust-test.yml`, `rustTestWorkflow.test.ts`, `cargoFeatures.test.ts`), `src-tauri/crates/README.md`.
- [ ] `storeChannels.json` shared policy/vectors; `storeFrameVectors.json`.
- [ ] `meta/genStoreSchemas.ts` + drift test.
- [ ] Spike notes (Wave 0, throwaway code allowed): (S1) mirror rebase protocol simulated against a fake Rust peer with randomized interleavings; (S2) Windows rename/retry on the CI leg; (S3) frame throughput for a 600 KB `set('games', …)` burst and queue high-water; (S4) GamesConfig sweep time on the operator profile; (S5) `sync_all` cost.
- [ ] Framework install: none.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (credentials stay in `keyring_dispatch`; no code change) | pin names; no `keyring` dependency in the store crates |
| V3 Session Management | no | — |
| V4 Access Control | yes | Renderer allow-list/write-denied/denied-stores and the `steamConfigStore.refreshToken` guard ported to Rust with shared vectors; native handler arg validation with `deny_unknown_fields`; `__internal__` unreachable from any channel |
| V5 Input Validation | yes | Store name restricted to one plain file name (existing `open_cache` check), recognized-name allow-list for `storeNew`, `CACHE_STORE_NAME_PATTERN` (`/^[A-Za-z0-9_-]{1,64}$/`), `isSafeKeyPath` rejecting `__proto__`/`prototype`/`constructor`, frame size cap (10 MiB, as `MAX_LINE_LENGTH`), containment (resolve+relative, not `join`) |
| V6 Cryptography | no | none added; never hand-roll |
| V8 Data Protection | yes | files 0600, new dirs 0700, token-bearing existing paths tightened on load, backups 0600, logs carry store key/versions/`err.kind` only, never values (T-28-04) |
| V12 File and Resources | yes | `create_new` temp names, symlink-resolved targets, no temp left behind, backups confined to the store directory (`assertInside`) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile store name or key path from the renderer (`../../x`, `__proto__.polluted`) | Tampering | Name pattern + allow-list + `isSafeKeyPath` + containment in Rust; vectors shared with TS |
| Secret exposure through `storeChanged` or snapshot | Information disclosure | The Rust emitter applies `isAllowedStoreField` before every push (the TS "secret-leak guard" in `pushStoreChanged` moves here); `humble_library` denied |
| Symlink/temp-file race on the store file | Tampering | `create_new` + symlink resolution (copy of `atomic.rs`) in a 0700 directory |
| Corrupt or newer file silently reset | Repudiation / data loss | Read-only with reason, bytes kept, notice raised |
| Plaintext secrets in corpus fixtures | Information disclosure | Redaction tool + failing test; fake-HOME for every spawn; `registerCapture()` for raw captures |
| Backup files holding token material | Information disclosure | 0600 files, 0700 dir, same pruning |

## Sources

### Primary (HIGH confidence, read or measured this session)
- `src/backend/store_backend.ts`, `typed_store.ts`, `cache.ts`, `stores/{storeRoot,storeRegistry,createStores}.ts`, `sidecar/storeWriteHandlers.ts`, `sidecar/handlers.ts` (store read path), `sidecar/readOnlyStoresNotice.ts`
- `src/backend/storeVersioning/{engine,backup,types,readOnlyStores,settingsFiles,engineMarkerFile,sharedRedistLedgerFile}.ts`, `storeMigrations/{index,settingsGlobal,settingsGame,settingsStrip,schemaStrip,gameInfoLibraries}.ts`, `migration/{index,stores}.ts`, `migration/migrations/legendary.ts`
- `src/backend/config.ts`, `game_config.ts`, `settingsMirrorResync.ts`, `src/common/types/{storePolicy,sidecarTransport,readOnlyStores}.ts`, `src/preload/tauriTransport.ts`
- `src-tauri/crates/gamelib-core/src/{store,emitter,lib,paths}.rs`, `gamelib-steamfiles/src/atomic.rs`, `gamelib-log/src/writer.rs`, `src-tauri/src/{native_router,log_dispatch,log_upload,sidecar,main(keyring + setup),tray/recent}.rs`
- `node_modules/conf/dist/source/index.js` (conf 10.2.0), `node_modules/dot-prop/index.js` (6.0.1)
- Operator profile `~/Library/Application Support/gamelib` (structure only; no values quoted) and the scratch harness measurements (`rt`, `fl` crates in the session scratchpad)
- `82-STATE-OWNERSHIP.md`, `84-*-SUMMARY.md`, `84-VALIDATION.md`, `.planning/research/v0.11/{PITFALLS,STACK,SUMMARY}.md`, `.planning/milestones/v0.10-phases/68-*/68-CONTEXT.md`
- `gh release list`, `git ls-remote --tags`, `gsd_run query package-legitimacy check`

### Secondary (MEDIUM confidence)
- Phase 84 summaries for the crate-scaffolding and golden-oracle recipe (read, not re-executed).

### Tertiary (LOW confidence, flagged `[ASSUMED]` in the log)
- Keychain ACL behaviour (A1), Windows share-mode behaviour of Node (A2), macOS `sync_all` cost (A7).

## Findings the planner must not lose (compact)

1. **Format settled:** conf stores = tab + `__internal__` envelope, no trailing newline; settings documents = 2-space, no envelope; marker files = compact. Fix `store.rs` header/tests and `uploadedLogs`.
2. **Order-preserving private JSON type is mandatory**; `preserve_order` stays off; add `float_roundtrip`; JS integer-key ordering on insert.
3. **Legendary reachability (SC4):** `applyMigrations()` is called from the sidecar bootstrap in `v0.8`, `v0.9` and `v0.10` [VERIFIED: `git grep applyMigrations() v0.8|v0.9|v0.10 -- src`: `bootstrap.ts:849`, `:857`, `:1775`], and was wired by quick 260822-s8y before `v0.8` (2026-10-16); Electron-era builds ran it from `main.ts`. The migration returns `true` (recorded) even when there is nothing to copy, and the operator's `store/migrations.json` reads `["legendary-move-global-config-folder"]`. Every supported upgrade source has it recorded; the only remaining reach is a fresh install with `~/.config/legendary` (non-Linux) or `<appData>/legendary` (Linux) present, who can sign in again. Conclusion: delete, as D-06 decides. Record this paragraph in the plan SUMMARY.
4. **Chains to port** (`currentVersionOf = max(1, max to)`): `settings/global` v2 (v0→v1 trayIconVariant/focusRow, v1→v2 strip to `appSettingsSchema.partial()`), `settings/game` v2 (v0→v1 identity, v1→v2 strip to `gameSettingsSchema.partial()`), libraries v3 for `store_cache/steam_library`, `store_cache/gog_library`, `gog_store/installed`, `store_cache/legendary_library`, `store_cache/nile_library`, `sideload_apps/library`, `store/download-manager`; everything else baseline v1 (identity adoption). No version bumps in 85 (D-04).
5. **Family sizes** (for plan splitting): caches about 20 stores (store_cache lookups plus `store/wine-downloader-info`); user-state libraries needing strip chains 7; other user-state about 22 (counts approximate, derive them from the generated store table); token-bearing: `steam_store/config` (2 TS names), `humble_store/config`; account configs `gog/nile/legendary_store/config`; settings last: `store/config.json`, `<appFolder>/config.json`, `GamesConfig/*` (CONTEXT says "global settings (`store/config.json`)"; the global settings file proper is `<appFolder>/config.json`, a different file: both flip in the last family).
6. **Other Rust readers of store files today** (read-only, keep working because bytes are unchanged): `tray/recent.rs` (`config.json`, `store/config.json` `games.recent`), `gamelib-steampoll/src/profile.rs` (`defaultSettings.<key>`, `steam_restart_hold.json`). The shell's `APP_NAME_SEGMENT` is `GameLib` while the operator's dev profile directory is `gamelib` (case-insensitive on macOS; case matters on Linux).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new packages; versions from `Cargo.lock`; byte-format claims measured on 159 real files.
- Architecture: MEDIUM. Mirror/rebase/ordering design is derived from existing code constraints (single in-order stdout reader, unordered `rustInvoke`, renderer's `changesDuringFetch`); it needs spike S1 before the TS mirror plan is frozen.
- Pitfalls: HIGH for the format, `__internal__`, corrupt-file and unordered-rustInvoke findings (code read); MEDIUM for Windows and Keychain (not provable here).
- Release/gate preconditions: HIGH that the published v0.10 baseline does not exist (commands run); open on how to create it.

**Research date:** 2026-11-21
**Valid until:** 2026-12-05 (the code and tags move quickly during v0.11; re-check Q1 and the store table drift tests before planning)
