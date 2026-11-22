//! The renderer's store reads, answered by the shell (Phase 85, plan 85-16, FND-06).
//!
//! `sidecar:store-fetch` is a native invoke channel (`nativeChannels.json`, slice `store`): the
//! renderer names one store, Rust resolves it, applies the shared policy and answers from the one
//! `StoreHost`, with the store's `rev` beside the values. There is one owner per channel (the 83
//! rule); the sidecar keeps its old handler only under the renamed internal channel
//! `store:ts-fetch`, which the renderer cannot name.
//!
//! Who answers inside the handler (research Pattern 4, D-01): under `GAMELIB_STORE=ts` every read
//! is forwarded to the sidecar's internal channel, all or nothing. Under `rust` a store whose row
//! Rust owns is read from `StoreHost`; a row Rust never opens (`store/migrations`, D-07) is still
//! forwarded, so each file has exactly one reader of record. The forward rides `SidecarState`,
//! whose invoke is bounded by the relay timeout.
//!
//! A renderer store name maps to a file through the store table only: a row whose `tsNames` holds
//! the name, else a recognised cache store's `store_cache/<name>` row (T-85-41). A name the policy
//! does not let the renderer read (unknown, or the denied `humble_library`) is refused with the
//! invalid-args marker before anything is opened, and every result goes through
//! [`filter_store_snapshot`], so `__internal__` and unlisted fields never leave (T-85-40).
//!
//! The fetch result is `{ "values": {...}, "rev": <n> }`: `rev` is the store's change count when
//! Rust read it, absent when the sidecar answered. The values are wrapped rather than given a `rev`
//! sibling because a `"*"` store's top-level keys are arbitrary strings.
//!
//! The read-only stores notice (D-12) is raised here too, once per process:
//! `store_read_only_notice` (rustInvoke, from the sidecar's `frontendReady`) brings the stores TS
//! still reports read-only; they are merged with `StoreHost`'s, mapped to areas by
//! [`area_for_store_key`], de-duplicated in first-seen order and pushed as `readOnlyStoresNotice`
//! with the unchanged ids-only payload `{entries: [{area, reason}]}`.
//!
//! The boot snapshot (`sidecar_store_snapshot`, every `bootSetStores` store) is built the same way
//! under `rust`: each store read from `StoreHost` and filtered, plus one extra key, [`STORE_REV_KEY`]
//! (`"@rev"`, which no store name can be), mapping each Rust-read store to its rev. A boot store Rust
//! does not open is taken from the sidecar's `store:ts-snapshot`. Under `ts` the sidecar's snapshot
//! is returned unchanged.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use gamelib_core::emitter::FrontendEmitter;
use gamelib_store::engine::ReadOnlyReason;
use gamelib_store::host::{ApplyError, OpSummary, Origin, Store, StoreChange, StoreHost};
use gamelib_store::json::Json;
use gamelib_store::ops::Op;
use gamelib_store::table::{row_for_key, table, TableRow};
use serde_json::{json, Map, Value};

use crate::ipc_contract::{
    StoreReadOnlyNoticeArgs, StoreReadOnlyNoticeArgsTsEntriesItemReason, STORE_SNAPSHOT_CHANNEL,
};
use crate::native_router::{invalid_args, NativeCtx, NativeFuture};
use crate::relay_commands::echo_channel;
use crate::store_boot::{is_rust_owned, Ownership, StoreMode};
use crate::store_policy::{
    area_for_store_key, filter_store_snapshot, is_allowed_store_field, is_plausible_cache_name,
    is_safe_key_path, is_writable_store_field, policy,
};

/// The renderer's lazy per-store fetch (native, slice `store`).
pub(crate) const STORE_FETCH_CHANNEL: &str = "sidecar:store-fetch";

/// The sidecar's fetch handler, renamed so only the shell can reach it (85-16).
pub(crate) const STORE_TS_FETCH_CHANNEL: &str = "store:ts-fetch";

/// The key beside the store names in the Rust snapshot that maps each Rust-read store to its rev
/// (TS `STORE_REV_KEY`). Store names are `[A-Za-z0-9_-]`, so it never collides with one.
pub(crate) const STORE_REV_KEY: &str = "@rev";

/// The longest store name accepted, in UTF-16 code units (the old zod `nonEmptyString(128)`).
const STORE_NAME_MAX: usize = 128;

/// A renderer store name resolved to its table row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResolvedStore {
    /// The renderer's name, which the policy is keyed by.
    pub(crate) name: String,
    /// The file it reads, or `None` for a name the policy covers that no store backs (`fontsStore`
    /// is declared and allow-listed but never constructed): that store reads as empty, as it did
    /// from the sidecar.
    pub(crate) row: Option<&'static TableRow>,
}

/// The table row a renderer store name reads from, or `None` when the renderer may not read it.
pub(crate) fn resolve_renderer_store(name: &str) -> Option<ResolvedStore> {
    let p = policy();
    if !p.is_readable_store(name) {
        return None;
    }
    let row = table()
        .iter()
        .find(|r| r.ts_names.iter().any(|n| n == name))
        .or_else(|| {
            (p.is_recognized_cache(name) && is_plausible_cache_name(name))
                .then(|| row_for_key(&format!("store_cache/{name}")))
                .flatten()
        })
        // A settings document row has no single file a renderer name could mean.
        .filter(|row| row.name.is_some());
    Some(ResolvedStore {
        name: name.to_string(),
        row,
    })
}

/// How a read reaches the sidecar for a store TS answers. A trait so the handlers are tested with
/// a recording fake and no child process.
pub(crate) trait SidecarProxy: Send + Sync + 'static {
    fn invoke(&self, channel: &str, args: Vec<Value>) -> Result<Value, String>;
    /// A fire-and-forget frame (85-17: a renderer write forwarded to a store TS owns).
    fn send(&self, channel: &str, args: Vec<Value>) -> Result<(), String>;
}

/// The real proxy: the sidecar state `store_dispatch` holds (installed when the sidecar spawns).
pub(crate) struct DispatcherSidecar;

impl SidecarProxy for DispatcherSidecar {
    fn invoke(&self, channel: &str, args: Vec<Value>) -> Result<Value, String> {
        let state = crate::store_dispatch::sidecar_state()
            .ok_or_else(|| "the sidecar is not running".to_string())?;
        state.invoke(channel.to_string(), args)
    }

    fn send(&self, channel: &str, args: Vec<Value>) -> Result<(), String> {
        let state = crate::store_dispatch::sidecar_state()
            .ok_or_else(|| "the sidecar is not running".to_string())?;
        state.write_frame(&crate::SidecarRpcRequest {
            id: state.next_id(),
            kind: "send",
            channel: channel.to_string(),
            args,
        })
    }
}

/// Where Rust-owned stores live and who owns them: the values the boot open used.
#[derive(Debug, Clone)]
pub(crate) struct ReadConfig {
    pub(crate) user_data: PathBuf,
    pub(crate) mode: StoreMode,
    pub(crate) ownership: Ownership,
}

/// What the store read handlers reach: the boot's configuration (`None` without a home directory,
/// when every read is forwarded) and the sidecar proxy.
pub(crate) struct StoreReads {
    pub(crate) config: Option<ReadConfig>,
    pub(crate) sidecar: Arc<dyn SidecarProxy>,
}

impl StoreReads {
    /// Whether Rust owns the store files this boot moved (`GAMELIB_STORE=rust` with a home
    /// directory). Otherwise every renderer store call is forwarded to the sidecar.
    fn rust_mode(&self) -> bool {
        self.config
            .as_ref()
            .is_some_and(|c| c.mode == StoreMode::Rust)
    }

    /// The configuration when Rust answers `store` itself; `None` when the sidecar does. A store no
    /// file backs is answered by Rust (empty) unless the mode is `ts`.
    fn owner_of(&self, store: &ResolvedStore) -> Option<&ReadConfig> {
        self.config.as_ref().filter(|c| match store.row {
            Some(row) => is_rust_owned(row, c.mode, &c.ownership),
            None => c.mode == StoreMode::Rust,
        })
    }
}

/// One store read from `StoreHost`: the filtered values and the rev they were read at.
pub(crate) fn read_owned(
    host: &StoreHost,
    config: &ReadConfig,
    store: &ResolvedStore,
) -> Result<(Map<String, Value>, u64), String> {
    let Some(row) = store.row else {
        return Ok((Map::new(), 0));
    };
    let name = row
        .name
        .as_deref()
        .ok_or_else(|| "store row has no file".to_string())?;
    let path = config.user_data.join(&row.dir).join(format!("{name}.json"));
    let opened = host
        .open_row(row, path)
        .map_err(|e| format!("store open failed: {}", e.kind()))?;
    let (entries, rev) = opened.snapshot_with_rev();
    Ok((filter_store_snapshot(&store.name, &entries), rev))
}

/// The renderer name in `args`, validated: exactly one non-empty string of at most 128 UTF-16
/// units that names a store the renderer may read. Every refusal is the invalid-args marker, so the
/// renderer classifies it as it did the sidecar's.
fn parse_store_name(args: &[Value]) -> Result<ResolvedStore, String> {
    let reject = |path: &str, code: &str| invalid_args(STORE_FETCH_CHANNEL, &[path], &[code]);
    let name = match args {
        [] => return Err(reject("(args)", "too_small")),
        [Value::String(name)] => name,
        [_] => return Err(reject("0", "invalid_type")),
        _ => return Err(reject("(args)", "too_big")),
    };
    let units = name.encode_utf16().count();
    if units == 0 {
        return Err(reject("0", "too_small"));
    }
    if units > STORE_NAME_MAX {
        return Err(reject("0", "too_big"));
    }
    resolve_renderer_store(name).ok_or_else(|| {
        // The name is renderer text: sanitised and cut, and on stderr only (T-29-18).
        crate::shell_log_detail(
            "native sidecar:store-fetch refused a store name",
            &echo_channel(name),
        );
        reject("0", "custom")
    })
}

/// The sidecar's answer, wrapped as a fetch result (no `rev`: TS has no change count).
fn forwarded(reads: &StoreReads, store: &ResolvedStore) -> Result<Value, String> {
    let values = reads
        .sidecar
        .invoke(STORE_TS_FETCH_CHANNEL, vec![json!(store.name)])?;
    let values = match values {
        Value::Object(o) => Value::Object(o),
        _ => Value::Object(Map::new()),
    };
    Ok(json!({ "values": values }))
}

/// `sidecar:store-fetch` with a parsed name, on the caller's (blocking) thread.
pub(crate) fn fetch_blocking(
    host: &StoreHost,
    reads: &StoreReads,
    store: &ResolvedStore,
) -> Result<Value, String> {
    match reads.owner_of(store) {
        Some(config) => {
            let (values, rev) = read_owned(host, config, store)?;
            Ok(json!({ "values": values, "rev": rev }))
        }
        None => forwarded(reads, store),
    }
}

/// The boot snapshot for `sidecar_store_snapshot`, on the caller's (blocking) thread.
pub(crate) fn snapshot_blocking(host: &StoreHost, reads: &StoreReads) -> Result<Value, String> {
    let rust_mode = reads
        .config
        .as_ref()
        .is_some_and(|c| c.mode == StoreMode::Rust);
    if !rust_mode {
        // GAMELIB_STORE=ts (or no home directory): the sidecar's snapshot, unchanged.
        return reads.sidecar.invoke(STORE_SNAPSHOT_CHANNEL, vec![]);
    }
    let mut stores = Map::new();
    let mut revs = Map::new();
    let mut from_ts: Vec<String> = Vec::new();
    for name in policy().boot_set_stores() {
        let Some(store) = resolve_renderer_store(name) else {
            continue;
        };
        let Some(config) = reads.owner_of(&store) else {
            from_ts.push(name.clone());
            continue;
        };
        match read_owned(host, config, &store) {
            Ok((values, rev)) => {
                stores.insert(name.clone(), Value::Object(values));
                revs.insert(name.clone(), json!(rev));
            }
            Err(e) => {
                // The store name from the policy file and the error kind (stderr only): the
                // stores hold tokens.
                crate::shell_log_detail(
                    &format!("WARN: store snapshot could not read {name}; it boots empty"),
                    &e,
                );
                stores.insert(name.clone(), Value::Object(Map::new()));
            }
        }
    }
    if !from_ts.is_empty() {
        let ts = match reads.sidecar.invoke(STORE_SNAPSHOT_CHANNEL, vec![]) {
            Ok(Value::Object(ts)) => ts,
            _ => {
                crate::shell_log(&format!(
                    "WARN: store snapshot: the sidecar did not answer for {} store(s); they boot empty",
                    from_ts.len()
                ));
                Map::new()
            }
        };
        for name in from_ts {
            let values = match ts.get(&name) {
                Some(Value::Object(o)) => Value::Object(o.clone()),
                _ => Value::Object(Map::new()),
            };
            stores.insert(name, values);
        }
    }
    stores.insert(STORE_REV_KEY.to_string(), Value::Object(revs));
    Ok(Value::Object(stores))
}

// ---- renderer writes (85-17) ------------------------------------------------------------------

/// The renderer's fire-and-forget store write (native send, slice `store`).
pub(crate) const STORE_SET_CHANNEL: &str = "storeSet";

/// The sidecar's `storeSet` handler, renamed so only the shell can reach it (85-17).
pub(crate) const STORE_TS_SET_CHANNEL: &str = "store:ts-set";

/// The renderer's confirmed write (native invoke, slice `store`): `true` only once on disk.
pub(crate) const STORE_SET_CHECKED_CHANNEL: &str = "sidecar:store-set-checked";

/// The sidecar's confirmed-write handler, renamed (85-17).
pub(crate) const STORE_TS_SET_CHECKED_CHANNEL: &str = "store:ts-set-checked";

/// The renderer's fire-and-forget store delete (native send, slice `store`).
pub(crate) const STORE_DELETE_CHANNEL: &str = "storeDelete";

/// The sidecar's `storeDelete` handler, renamed (85-17).
pub(crate) const STORE_TS_DELETE_CHANNEL: &str = "store:ts-delete";

/// The renderer's store registration (native send, slice `store`).
pub(crate) const STORE_NEW_CHANNEL: &str = "storeNew";

/// The sidecar's `storeNew` handler, renamed (85-17).
pub(crate) const STORE_TS_NEW_CHANNEL: &str = "store:ts-new";

/// The renderer push that patches its snapshot (`STORE_CHANGED_CHANNEL`).
pub(crate) const STORE_CHANGED_CHANNEL: &str = "storeChanged";

/// The longest key path accepted, in UTF-16 code units (the old zod `nonEmptyString(512)`).
const KEY_PATH_MAX: usize = 512;

/// One renderer write, its shape already checked (`parse_*` below); the policy runs when it is
/// applied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RendererWrite {
    Set {
        store: String,
        key: String,
        value: Value,
    },
    Delete {
        store: String,
        key: String,
    },
}

impl RendererWrite {
    fn store(&self) -> &str {
        match self {
            RendererWrite::Set { store, .. } | RendererWrite::Delete { store, .. } => store,
        }
    }

    fn key(&self) -> &str {
        match self {
            RendererWrite::Set { key, .. } | RendererWrite::Delete { key, .. } => key,
        }
    }

    /// The args the renamed TS handler takes, which are the renderer's own.
    fn ts_args(&self) -> Vec<Value> {
        match self {
            RendererWrite::Set { store, key, value } => {
                vec![json!(store), json!(key), value.clone()]
            }
            RendererWrite::Delete { store, key } => vec![json!(store), json!(key)],
        }
    }

    /// The sidecar channel a fire-and-forget write is forwarded to when TS owns the store.
    fn ts_send_channel(&self) -> &'static str {
        match self {
            RendererWrite::Set { .. } => STORE_TS_SET_CHANNEL,
            RendererWrite::Delete { .. } => STORE_TS_DELETE_CHANNEL,
        }
    }

    fn op(&self) -> Op {
        match self {
            // Renderer values arrive as `serde_json::Value`, whose objects this build sorts: a nested
            // object is stored in that order. It is the renderer's input order as the shell received
            // it, which is accepted as the order of a renderer-written value (85-17).
            RendererWrite::Set { key, value, .. } => Op::Set {
                key: key.clone(),
                value: Json::from(value.clone()),
            },
            RendererWrite::Delete { key, .. } => Op::Delete { key: key.clone() },
        }
    }
}

/// A string argument of 1 to `max` UTF-16 units.
fn bounded_string(v: &Value, max: usize) -> Option<String> {
    let s = v.as_str()?;
    (1..=max)
        .contains(&s.encode_utf16().count())
        .then(|| s.to_string())
}

/// `storeSet`'s args: `[storeName, keyPath, value]`, value any JSON (a renderer `undefined` crosses as
/// `null`). Shape only, as the old zod tuple; the policy runs on the slice worker.
pub(crate) fn parse_store_set(args: &[Value]) -> Result<RendererWrite, &'static str> {
    let [name, key, value] = args else {
        return Err("store-set-args");
    };
    let store = bounded_string(name, STORE_NAME_MAX).ok_or("store-set-args")?;
    let key = bounded_string(key, KEY_PATH_MAX).ok_or("store-set-args")?;
    Ok(RendererWrite::Set {
        store,
        key,
        value: value.clone(),
    })
}

/// `storeDelete`'s args: `[storeName, keyPath]`.
pub(crate) fn parse_store_delete(args: &[Value]) -> Result<RendererWrite, &'static str> {
    let [name, key] = args else {
        return Err("store-delete-args");
    };
    let store = bounded_string(name, STORE_NAME_MAX).ok_or("store-delete-args")?;
    let key = bounded_string(key, KEY_PATH_MAX).ok_or("store-delete-args")?;
    Ok(RendererWrite::Delete { store, key })
}

/// A validated `storeNew`: the name, and whether the renderer sent construction options (which are
/// never used, T-27-03; only their presence is logged).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct StoreNew {
    pub(crate) store: String,
    pub(crate) options: Option<Value>,
}

/// `storeNew`'s args: `[storeName]` or `[storeName, options]`, options an object, or absent (a renderer
/// `undefined` crosses as `null`).
pub(crate) fn parse_store_new(args: &[Value]) -> Result<StoreNew, &'static str> {
    let (name, options) = match args {
        [name] => (name, None),
        [name, Value::Null] => (name, None),
        [name, options @ Value::Object(_)] => (name, Some(options.clone())),
        _ => return Err("store-new-args"),
    };
    let store = bounded_string(name, STORE_NAME_MAX).ok_or("store-new-args")?;
    Ok(StoreNew { store, options })
}

/// Why Rust refused a renderer write. The words are the log categories; none carries a name or a
/// key, which go to stderr only.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WriteRefusal {
    UnknownStore,
    NoStoreBacksIt,
    ReservedKey,
    KeyPath,
    NotWritable,
    ReadOnly,
    Evicted,
    Rejected,
    Io,
}

impl WriteRefusal {
    fn as_str(self) -> &'static str {
        match self {
            WriteRefusal::UnknownStore => "unrecognised store",
            WriteRefusal::NoStoreBacksIt => "no store backs it",
            WriteRefusal::ReservedKey => "reserved key",
            WriteRefusal::KeyPath => "disallowed key path",
            WriteRefusal::NotWritable => "field not writable",
            WriteRefusal::ReadOnly => "read-only store",
            WriteRefusal::Evicted => "evicted store",
            WriteRefusal::Rejected => "rejected op",
            WriteRefusal::Io => "write failed",
        }
    }
}

/// What became of a renderer write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum WriteOutcome {
    /// On disk (or already held: a no-op is a success, as conf's was).
    Persisted,
    Refused(WriteRefusal),
    /// TS owns the store; the write went to its renamed handler, which answered `persisted` (a
    /// fire-and-forget forward has no answer and reports `false`).
    Forwarded {
        persisted: bool,
    },
}

/// The policy a renderer write passes before anything is opened (T-85-43): the `__internal__`
/// namespace, a prototype segment, then the write predicate, which also refuses
/// `steamConfigStore.refreshToken`.
fn check_write_policy(store: &str, key: &str) -> Result<(), WriteRefusal> {
    if key.split('.').next() == Some(gamelib_store::envelope::RESERVED_KEY) {
        return Err(WriteRefusal::ReservedKey);
    }
    if !is_safe_key_path(key) {
        return Err(WriteRefusal::KeyPath);
    }
    if !is_writable_store_field(store, key) {
        return Err(WriteRefusal::NotWritable);
    }
    Ok(())
}

/// Applies one renderer write on the caller's (blocking) thread. Under `GAMELIB_STORE=ts` (or with
/// no home directory) every write is forwarded through `forward`, unchanged and unchecked, exactly
/// as the renderer sent it before (D-01); under `rust` an unknown store is refused, a row TS still
/// owns is forwarded, and a Rust-owned store is checked and applied with `Origin::Renderer`, whose
/// change the host's listeners then announce.
pub(crate) fn apply_renderer_write(
    host: &StoreHost,
    reads: &StoreReads,
    write: &RendererWrite,
    forward: &dyn Fn(&RendererWrite) -> Result<bool, String>,
) -> Result<WriteOutcome, String> {
    if !reads.rust_mode() {
        let persisted = forward(write)?;
        return Ok(WriteOutcome::Forwarded { persisted });
    }
    let Some(store) = resolve_renderer_store(write.store()) else {
        return Ok(WriteOutcome::Refused(WriteRefusal::UnknownStore));
    };
    let Some(config) = reads.owner_of(&store) else {
        let persisted = forward(write)?;
        return Ok(WriteOutcome::Forwarded { persisted });
    };
    if let Err(refusal) = check_write_policy(&store.name, write.key()) {
        return Ok(WriteOutcome::Refused(refusal));
    }
    let Some(row) = store.row else {
        return Ok(WriteOutcome::Refused(WriteRefusal::NoStoreBacksIt));
    };
    let name = row.name.as_deref().unwrap_or_default();
    let path = config.user_data.join(&row.dir).join(format!("{name}.json"));
    let Ok(opened) = host.open_row(row, path) else {
        return Ok(WriteOutcome::Refused(WriteRefusal::Io));
    };
    Ok(apply_to(&opened, write))
}

/// Applies a checked renderer write to an open store with `Origin::Renderer`. A store evicted while
/// the write held it (a reset or an uninstall removed its file) refuses; a write that opens the store
/// after the eviction writes over the now-missing file, as a sidecar frame queued after it does.
fn apply_to(opened: &Store, write: &RendererWrite) -> WriteOutcome {
    match opened.apply_reporting(write.op(), Origin::Renderer) {
        Ok(_) => WriteOutcome::Persisted,
        Err(ApplyError::ReadOnly(_)) => WriteOutcome::Refused(WriteRefusal::ReadOnly),
        Err(ApplyError::Evicted) => WriteOutcome::Refused(WriteRefusal::Evicted),
        Err(ApplyError::Rejected(_)) => WriteOutcome::Refused(WriteRefusal::Rejected),
        Err(ApplyError::Io(_)) => WriteOutcome::Refused(WriteRefusal::Io),
    }
}

/// Logs a refused renderer write: the category into the shell log, the renderer's store name (cut
/// and sanitised) to stderr only, never the key's value or the value (T-28-04, T-29-18).
fn log_refusal(channel: &str, store: &str, refusal: WriteRefusal) {
    let kind = refusal.as_str();
    crate::shell_log_detail(
        &format!("WARN: native {channel} refused a store write: {kind}"),
        &echo_channel(store),
    );
}

/// The `storeSet` / `storeDelete` slice job: applies the write; a refusal is logged and dropped, as
/// the sidecar dropped one (a send has no answer).
pub(crate) fn run_send_write(ctx: &NativeCtx, channel: &str, write: &RendererWrite) {
    let sidecar = &ctx.store_reads.sidecar;
    let forward = |w: &RendererWrite| -> Result<bool, String> {
        sidecar.send(w.ts_send_channel(), w.ts_args())?;
        Ok(false)
    };
    match apply_renderer_write(&ctx.store_host, &ctx.store_reads, write, &forward) {
        Ok(WriteOutcome::Refused(refusal)) => log_refusal(channel, write.store(), refusal),
        Ok(WriteOutcome::Persisted | WriteOutcome::Forwarded { .. }) => {}
        Err(forward_error) => crate::shell_log_detail(
            &format!("WARN: native {channel} could not forward a store write"),
            &forward_error,
        ),
    }
}

/// The confirmed write on the caller's (blocking) thread: `true` only once the value is on disk (or
/// TS answered `true` for a store it owns); `false` for any refusal, logged by category.
pub(crate) fn set_checked_blocking(
    host: &StoreHost,
    reads: &StoreReads,
    write: &RendererWrite,
) -> Result<bool, String> {
    let forward = |w: &RendererWrite| -> Result<bool, String> {
        let answer = reads
            .sidecar
            .invoke(STORE_TS_SET_CHECKED_CHANNEL, w.ts_args())?;
        Ok(answer == Value::Bool(true))
    };
    Ok(match apply_renderer_write(host, reads, write, &forward)? {
        WriteOutcome::Persisted => true,
        WriteOutcome::Forwarded { persisted } => persisted,
        WriteOutcome::Refused(refusal) => {
            log_refusal(STORE_SET_CHECKED_CHANNEL, write.store(), refusal);
            false
        }
    })
}

/// `sidecar:store-set-checked`'s args, refused with the invalid-args marker (the old zod tuple).
fn parse_store_set_checked(args: &[Value]) -> Result<RendererWrite, String> {
    parse_store_set(args).map_err(|_| {
        let (path, code) = match args.len() {
            0..=2 => ("(args)", "too_small"),
            3 => ("(args)", "invalid_type"),
            _ => ("(args)", "too_big"),
        };
        invalid_args(STORE_SET_CHECKED_CHANNEL, &[path], &[code])
    })
}

/// The `sidecar:store-set-checked` invoke handler. A refusal resolves `false`, never an error, as the
/// sidecar's did; only bad args (the marker) or a failed forward reject.
pub(crate) fn store_set_checked(ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let write = parse_store_set_checked(&args)?;
        tauri::async_runtime::spawn_blocking(move || {
            set_checked_blocking(&ctx.store_host, &ctx.store_reads, &write).map(Value::Bool)
        })
        .await
        .map_err(|e| format!("store set-checked task failed: {e}"))?
    })
}

/// What a `storeNew` came to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum NewOutcome {
    /// A typed store (constructed by the sidecar's `createStores`, opened by Rust at boot): nothing
    /// to do, as before.
    Typed,
    /// A recognised cache store Rust owns, now open.
    Opened,
    /// TS owns it (or the mode is `ts`): forwarded to `store:ts-new`.
    Forwarded,
    /// Not a recognised cache name: no store, no file (WR-02, T-85-43).
    Refused,
}

/// `storeNew` on the caller's thread. The renderer's options are never used (T-27-03): a recognised
/// cache store is opened from the table's own row, lazily (a missing file is not created).
pub(crate) fn store_new_blocking(
    host: &StoreHost,
    reads: &StoreReads,
    new: &StoreNew,
    forward: &dyn Fn(&StoreNew) -> Result<(), String>,
) -> Result<NewOutcome, String> {
    if !reads.rust_mode() {
        forward(new)?;
        return Ok(NewOutcome::Forwarded);
    }
    let name = new.store.as_str();
    if table().iter().any(|r| r.ts_names.iter().any(|n| n == name))
        && !policy().is_recognized_cache(name)
    {
        return Ok(NewOutcome::Typed);
    }
    if !is_plausible_cache_name(name) || !policy().is_recognized_cache(name) {
        crate::shell_log_detail(
            "WARN: native storeNew rejected an unrecognized store name",
            &echo_channel(name),
        );
        return Ok(NewOutcome::Refused);
    }
    if new.options.is_some() {
        crate::shell_log(
            "native storeNew ignored renderer-supplied options; using the store table's row",
        );
    }
    let key = format!("store_cache/{name}");
    let (Some(row), Some(config)) = (row_for_key(&key), reads.config.as_ref()) else {
        return Ok(NewOutcome::Refused);
    };
    if !is_rust_owned(row, config.mode, &config.ownership) {
        forward(new)?;
        return Ok(NewOutcome::Forwarded);
    }
    let path = config.user_data.join(&row.dir).join(format!("{name}.json"));
    host.open_row(row, path)
        .map_err(|e| format!("store open failed: {}", e.kind()))?;
    Ok(NewOutcome::Opened)
}

/// The `storeNew` slice job.
pub(crate) fn run_store_new(ctx: &NativeCtx, new: &StoreNew) {
    let sidecar = &ctx.store_reads.sidecar;
    let forward = |n: &StoreNew| -> Result<(), String> {
        let mut args = vec![json!(n.store)];
        if let Some(options) = &n.options {
            args.push(options.clone());
        }
        sidecar.send(STORE_TS_NEW_CHANNEL, args)
    };
    if let Err(open_error) = store_new_blocking(&ctx.store_host, &ctx.store_reads, new, &forward) {
        crate::shell_log_detail("WARN: native storeNew could not open a store", &open_error);
    }
}

/// The renderer names whose snapshot a store table key feeds: every store the renderer may read
/// (the boot and lazy tiers and the recognised caches), grouped by the row it resolves to. Two names
/// over one file (`steamConfigStore`, `steamBottleConfigStore`) both hear its changes.
fn renderer_names_for(store_key: &str) -> &'static [String] {
    static BY_KEY: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    let map = BY_KEY.get_or_init(|| {
        let p = policy();
        let mut map: HashMap<String, Vec<String>> = HashMap::new();
        let names = p
            .boot_set_stores()
            .iter()
            .chain(p.lazy_stores())
            .chain(p.recognized_cache_store_names());
        for name in names {
            let Some(row) = resolve_renderer_store(name).and_then(|s| s.row) else {
                continue;
            };
            let entry = map.entry(row.key.clone()).or_default();
            if !entry.contains(name) {
                entry.push(name.clone());
            }
        }
        map
    });
    map.get(store_key).map(Vec::as_slice).unwrap_or(&[])
}

/// The `storeChanged` pushes one change makes, one per renderer name over its file, in that name's
/// policy: a set or delete only for a field the renderer may read (the secret-leak guard that lived
/// in TS `pushStoreChanged`, T-85-44), a clear or replace as an `invalidated` push that carries no
/// value. Every push carries the change's `rev` (Pitfall 8).
pub(crate) fn renderer_pushes(change: &StoreChange) -> Vec<Value> {
    let rev = change.rev;
    renderer_names_for(&change.store)
        .iter()
        .filter_map(|name| match &change.op {
            OpSummary::Set { key } => is_allowed_store_field(name, key).then(|| {
                let value = change.value.as_deref().map_or(Value::Null, Json::to_value);
                json!({ "store": name, "key": key, "value": value, "rev": rev })
            }),
            OpSummary::Delete { key } => is_allowed_store_field(name, key)
                .then(|| json!({ "store": name, "key": key, "deleted": true, "rev": rev })),
            OpSummary::Clear | OpSummary::Replace => {
                Some(json!({ "store": name, "key": "", "invalidated": true, "rev": rev }))
            }
        })
        .collect()
}

/// Registers the renderer push on `host`, once at boot: every change of a store the renderer reads,
/// whoever made it (the sidecar's mirror, the renderer, a Rust module), reaches the renderer from
/// here, in the host's `rev` order. The host's dispatcher thread runs it; it holds no lock and no
/// shutdown registrant (a parked thread is idle, not in-flight work).
pub(crate) fn install_renderer_push(host: &StoreHost, emitter: Arc<dyn FrontendEmitter>) {
    host.on_any_change(Box::new(move |change| {
        for push in renderer_pushes(change) {
            emitter.emit(STORE_CHANGED_CHANNEL, vec![push]);
        }
    }));
}

/// The renderer push the read-only notice rides (`frontendMessage` channel).
const READ_ONLY_NOTICE_CHANNEL: &str = "readOnlyStoresNotice";

/// The most TS entries one notice call accepts, and the longest store key: the generated args type
/// takes no length keywords, so the bounds live here.
const NOTICE_MAX_ENTRIES: usize = 1024;
const NOTICE_KEY_MAX: usize = 256;

/// Set by the first notice of the process: later calls send nothing (D-12, once per launch).
static NOTICE_SENT: AtomicBool = AtomicBool::new(false);

fn reason_word(reason: ReadOnlyReason) -> &'static str {
    match reason {
        ReadOnlyReason::Newer => "newer",
        ReadOnlyReason::Failed => "failed",
    }
}

/// `store_read_only_notice`: merge TS's read-only stores with the host's and push the notice, once
/// per process. Resolves the number of entries sent.
pub(crate) fn read_only_notice(
    args: &[Value],
    emitter: &dyn FrontendEmitter,
) -> Result<Value, String> {
    let rust_entries = crate::store_boot::host().read_only_entries();
    read_only_notice_with(args, &rust_entries, emitter, &NOTICE_SENT, &|line| {
        crate::shell_log(line)
    })
}

/// The `store_read_only_notice` rustInvoke arm: [`read_only_notice`] through the app's emitter.
pub(crate) fn rpc_read_only_notice(
    args: &[Value],
    app: &tauri::AppHandle,
) -> Result<Value, String> {
    read_only_notice(
        args,
        &crate::steampoll_dispatch::TauriFrontendEmitter(app.clone()),
    )
}

/// [`read_only_notice`] with the host's entries, the once-flag and the log sink passed in.
pub(crate) fn read_only_notice_with(
    args: &[Value],
    rust_entries: &[(String, ReadOnlyReason, String)],
    emitter: &dyn FrontendEmitter,
    sent: &AtomicBool,
    log: &dyn Fn(&str),
) -> Result<Value, String> {
    const BAD: &str = "store_read_only_notice:bad-args";
    if args.len() != 1 {
        return Err(BAD.to_string());
    }
    let parsed = StoreReadOnlyNoticeArgs::from_args(args)?;
    if parsed.ts_entries.len() > NOTICE_MAX_ENTRIES
        || parsed
            .ts_entries
            .iter()
            .any(|e| e.store_key.is_empty() || e.store_key.len() > NOTICE_KEY_MAX)
    {
        return Err(BAD.to_string());
    }
    if sent.swap(true, Ordering::SeqCst) {
        return Ok(json!(0));
    }
    // Rust's stores first, then TS's, each mapped to its area; the first (area, reason) wins.
    let ts_entries = parsed.ts_entries.iter().map(|e| {
        let reason = match e.reason {
            StoreReadOnlyNoticeArgsTsEntriesItemReason::Newer => "newer",
            StoreReadOnlyNoticeArgsTsEntriesItemReason::Failed => "failed",
        };
        (e.store_key.as_str(), reason)
    });
    let all = rust_entries
        .iter()
        .map(|(key, reason, _detail)| (key.as_str(), reason_word(*reason)))
        .chain(ts_entries);
    let mut seen: Vec<(&'static str, &'static str)> = Vec::new();
    for (key, reason) in all {
        let pair = (area_for_store_key(key), reason);
        if !seen.contains(&pair) {
            seen.push(pair);
        }
    }
    let entries: Vec<Value> = seen
        .iter()
        .map(|(area, reason)| json!({ "area": area, "reason": reason }))
        .collect();
    let count = entries.len();
    if count > 0 {
        emitter.emit(
            READ_ONLY_NOTICE_CHANNEL,
            vec![json!({ "entries": entries })],
        );
    }
    log(&format!("store read-only notice: {count} entries"));
    Ok(json!(count))
}

/// The `sidecar:store-fetch` invoke handler.
pub(crate) fn store_fetch(ctx: Arc<NativeCtx>, args: Vec<Value>) -> NativeFuture {
    Box::pin(async move {
        let store = parse_store_name(&args)?;
        tauri::async_runtime::spawn_blocking(move || {
            fetch_blocking(&ctx.store_host, &ctx.store_reads, &store)
        })
        .await
        .map_err(|e| format!("store fetch task failed: {e}"))?
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::ipc_contract::IPC_INVALID_ARGS_MARKER;
    use gamelib_testutil::FakeHome;
    use std::fs;
    use std::sync::Mutex;

    /// A proxy that records what it was asked and answers with a fixed value.
    pub(crate) struct RecordingProxy {
        pub(crate) calls: Mutex<Vec<(String, Vec<Value>)>>,
        pub(crate) answer: Value,
    }

    impl RecordingProxy {
        pub(crate) fn new(answer: Value) -> Arc<RecordingProxy> {
            Arc::new(RecordingProxy {
                calls: Mutex::new(Vec::new()),
                answer,
            })
        }
    }

    impl SidecarProxy for RecordingProxy {
        fn invoke(&self, channel: &str, args: Vec<Value>) -> Result<Value, String> {
            self.calls.lock().unwrap().push((channel.to_string(), args));
            Ok(self.answer.clone())
        }

        fn send(&self, channel: &str, args: Vec<Value>) -> Result<(), String> {
            self.calls.lock().unwrap().push((channel.to_string(), args));
            Ok(())
        }
    }

    pub(crate) fn reads(
        home: &FakeHome,
        mode: StoreMode,
        proxy: Arc<RecordingProxy>,
    ) -> StoreReads {
        StoreReads {
            config: Some(ReadConfig {
                user_data: home.root().to_path_buf(),
                mode,
                ownership: Ownership::embedded().clone(),
            }),
            sidecar: proxy,
        }
    }

    fn write(home: &FakeHome, rel: &str, body: &str) {
        let path = home.root().join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }

    fn resolved(name: &str) -> ResolvedStore {
        resolve_renderer_store(name).unwrap_or_else(|| panic!("{name} resolves"))
    }

    fn key_of(name: &str) -> &'static str {
        resolved(name)
            .row
            .map(|r| r.key.as_str())
            .unwrap_or("<none>")
    }

    #[test]
    fn store_native_resolves_renderer_names_through_the_table() {
        assert_eq!(key_of("configStore"), "store/config");
        assert_eq!(key_of("wikigameinfo"), "store_cache/wikigameinfo");
        assert_eq!(key_of("steam_library"), "store_cache/steam_library");
        assert_eq!(key_of("steamBottleConfigStore"), "steam_store/config");
        assert_eq!(key_of("fontsStore"), "<none>");
        for name in [
            "humble_library",
            "notAStore",
            "macArchStore",
            "uploadedLogs",
            "constructor",
            "../config",
            "",
        ] {
            assert!(resolve_renderer_store(name).is_none(), "{name}");
        }
    }

    #[test]
    fn store_native_every_policy_store_resolves() {
        let p = policy();
        for name in p.boot_set_stores().iter().chain(p.lazy_stores()) {
            assert!(resolve_renderer_store(name).is_some(), "{name}");
        }
    }

    #[test]
    fn store_native_fetch_reads_a_rust_owned_store_filtered_with_its_rev() {
        let home = FakeHome::new("gamelib-store-native-");
        write(
            &home,
            "store/config.json",
            "{\n\t\"theme\": \"dark\",\n\t\"notAField\": 1,\n\t\"__internal__\": {\"migrations\": {\"version\": \"1\"}}\n}",
        );
        let host = StoreHost::new();
        let proxy = RecordingProxy::new(json!({}));
        let reads = reads(&home, StoreMode::Rust, Arc::clone(&proxy));
        let out = fetch_blocking(&host, &reads, &resolved("configStore")).unwrap();
        assert_eq!(out, json!({"values": {"theme": "dark"}, "rev": 0}));

        // A change moves the rev the next fetch carries.
        let path = home.root().join("store/config.json");
        let row = resolved("configStore").row.unwrap();
        host.open_row(row, path)
            .unwrap()
            .apply(
                Op::Set {
                    key: "theme".to_string(),
                    value: Json::from(json!("light")),
                },
                Origin::Rust,
            )
            .unwrap();
        let out = fetch_blocking(&host, &reads, &resolved("configStore")).unwrap();
        assert_eq!(out, json!({"values": {"theme": "light"}, "rev": 1}));
        assert!(proxy.calls.lock().unwrap().is_empty(), "nothing forwarded");
    }

    #[test]
    fn store_native_fetch_reads_a_cache_store_and_a_missing_file_is_empty() {
        let home = FakeHome::new("gamelib-store-native-cache-");
        write(
            &home,
            "store_cache/wikigameinfo.json",
            "{\n\t\"Some Game\": {\"timestampLastFetch\": \"x\"}\n}",
        );
        let host = StoreHost::new();
        let reads = reads(&home, StoreMode::Rust, RecordingProxy::new(json!({})));
        let out = fetch_blocking(&host, &reads, &resolved("wikigameinfo")).unwrap();
        assert_eq!(
            out,
            json!({"values": {"Some Game": {"timestampLastFetch": "x"}}, "rev": 0})
        );
        let out = fetch_blocking(&host, &reads, &resolved("steam_library")).unwrap();
        assert_eq!(out, json!({"values": {}, "rev": 0}));
        // Declared and allow-listed, but no store backs it: empty, as the sidecar answered.
        let out = fetch_blocking(&host, &reads, &resolved("fontsStore")).unwrap();
        assert_eq!(out, json!({"values": {}, "rev": 0}));
    }

    #[test]
    fn store_native_ts_mode_forwards_every_read_and_never_opens_a_file() {
        let home = FakeHome::new("gamelib-store-native-ts-");
        write(&home, "store/config.json", "{\n\t\"theme\": \"dark\"\n}");
        let host = StoreHost::new();
        let proxy = RecordingProxy::new(json!({"theme": "from-ts"}));
        let reads = reads(&home, StoreMode::Ts, Arc::clone(&proxy));
        let out = fetch_blocking(&host, &reads, &resolved("configStore")).unwrap();
        assert_eq!(out, json!({"values": {"theme": "from-ts"}}));
        assert_eq!(
            proxy.calls.lock().unwrap().as_slice(),
            &[(
                STORE_TS_FETCH_CHANNEL.to_string(),
                vec![json!("configStore")]
            )]
        );
        assert!(host.read_only_entries().is_empty());
        assert_eq!(host.in_flight(), 0);
    }

    #[test]
    fn store_native_without_a_home_every_read_is_forwarded() {
        let proxy = RecordingProxy::new(json!("not an object"));
        let reads = StoreReads {
            config: None,
            sidecar: proxy,
        };
        let out = fetch_blocking(&StoreHost::new(), &reads, &resolved("configStore")).unwrap();
        assert_eq!(out, json!({"values": {}}));
    }

    #[test]
    fn store_native_bad_names_are_the_invalid_args_marker() {
        let long = "x".repeat(STORE_NAME_MAX + 1);
        for args in [
            vec![],
            vec![json!(1)],
            vec![Value::Null],
            vec![json!("")],
            vec![json!(long)],
            vec![json!("humble_library")],
            vec![json!("notAStore")],
            vec![json!("configStore"), json!("extra")],
        ] {
            let err = parse_store_name(&args).unwrap_err();
            assert!(err.starts_with(IPC_INVALID_ARGS_MARKER), "{args:?}: {err}");
            assert!(err.contains(STORE_FETCH_CHANNEL), "{err}");
        }
        assert!(parse_store_name(&[json!("x".repeat(STORE_NAME_MAX))]).is_err());
        assert_eq!(
            parse_store_name(&[json!("configStore")]).unwrap().name,
            "configStore"
        );
    }

    #[test]
    fn store_native_the_handler_answers_end_to_end_through_the_native_ctx() {
        let home = FakeHome::new("gamelib-store-native-ctx-");
        write(
            &home,
            "steam_store/config.json",
            "{\n\t\"isLoggedIn\": true,\n\t\"refreshToken\": \"steam:v1:secret\"\n}",
        );
        let mut ctx = NativeCtx::for_tests(Arc::new(NullHost), None);
        ctx.store_reads = reads(&home, StoreMode::Rust, RecordingProxy::new(json!({})));
        let ctx = Arc::new(ctx);
        let out = tauri::async_runtime::block_on(store_fetch(
            Arc::clone(&ctx),
            vec![json!("steamConfigStore")],
        ))
        .unwrap();
        assert_eq!(out, json!({"values": {"isLoggedIn": true}, "rev": 0}));
        let err = tauri::async_runtime::block_on(store_fetch(ctx, vec![json!("humble_library")]))
            .unwrap_err();
        assert!(err.starts_with(IPC_INVALID_ARGS_MARKER));
    }

    #[test]
    fn store_native_snapshot_reads_every_boot_store_filtered_with_its_rev() {
        let home = FakeHome::new("gamelib-store-native-snapshot-");
        write(
            &home,
            "steam_store/config.json",
            "{\n\t\"isLoggedIn\": true,\n\t\"refreshToken\": \"steam:v1:secret\",\n\t\"__internal__\": {}\n}",
        );
        write(
            &home,
            "store_cache/steam_library.json",
            "{\n\t\"games\": [{\"app_name\": \"480\"}]\n}",
        );
        write(&home, "store/config.json", "{\n\t\"theme\": \"dark\"\n}");
        let host = StoreHost::new();
        let proxy = RecordingProxy::new(json!({"configStore": {"theme": "from-ts"}}));
        let reads = reads(&home, StoreMode::Rust, Arc::clone(&proxy));
        // One change, so a rev other than 0 is visible.
        let row = resolved("configStore").row.unwrap();
        host.open_row(row, home.root().join("store/config.json"))
            .unwrap()
            .apply(
                Op::Set {
                    key: "theme".to_string(),
                    value: Json::from(json!("light")),
                },
                Origin::Rust,
            )
            .unwrap();
        let out = snapshot_blocking(&host, &reads).unwrap();
        let obj = out.as_object().unwrap();
        let mut expected: Vec<&str> = policy()
            .boot_set_stores()
            .iter()
            .map(String::as_str)
            .collect();
        expected.push(STORE_REV_KEY);
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort_unstable();
        expected.sort_unstable();
        assert_eq!(keys, expected);
        assert_eq!(obj["steamConfigStore"], json!({"isLoggedIn": true}));
        assert_eq!(
            obj["steam_library"],
            json!({"games": [{"app_name": "480"}]})
        );
        assert_eq!(obj["configStore"], json!({"theme": "light"}));
        assert_eq!(obj["humbleConfigStore"], json!({}));
        let revs = obj[STORE_REV_KEY].as_object().unwrap();
        assert_eq!(revs["configStore"], json!(1));
        assert_eq!(revs["steamConfigStore"], json!(0));
        assert_eq!(revs.len(), policy().boot_set_stores().len());
        assert!(proxy.calls.lock().unwrap().is_empty(), "nothing forwarded");
        assert!(!out.to_string().contains("refreshToken"));
        assert!(!out.to_string().contains("__internal__"));
    }

    #[test]
    fn store_native_snapshot_under_ts_mode_is_the_sidecar_result_unchanged() {
        let home = FakeHome::new("gamelib-store-native-snapshot-ts-");
        let ts = json!({"configStore": {"theme": "ts"}, "steamConfigStore": {}});
        let proxy = RecordingProxy::new(ts.clone());
        let host = StoreHost::new();
        let out =
            snapshot_blocking(&host, &reads(&home, StoreMode::Ts, Arc::clone(&proxy))).unwrap();
        assert_eq!(out, ts);
        assert_eq!(
            proxy.calls.lock().unwrap().as_slice(),
            &[(STORE_SNAPSHOT_CHANNEL.to_string(), vec![])]
        );
        assert_eq!(STORE_SNAPSHOT_CHANNEL, "store:ts-snapshot");
        assert_eq!(host.in_flight(), 0);
    }

    #[test]
    fn store_native_snapshot_takes_a_boot_store_rust_does_not_open_from_the_sidecar() {
        let home = FakeHome::new("gamelib-store-native-snapshot-mixed-");
        write(&home, "store/config.json", "{\n\t\"theme\": \"dark\"\n}");
        let proxy = RecordingProxy::new(json!({
            "steamConfigStore": {"isLoggedIn": false},
            "configStore": {"theme": "ts-should-not-win"}
        }));
        // The account family held back by a per-store override: steam_store/config is TS's.
        let ownership: Ownership =
            serde_json::from_str(r#"{"families":{"cache":true,"user-state":true,"account":true,"settings":true},"stores":{"steam_store/config":false}}"#)
                .unwrap();
        let reads = StoreReads {
            config: Some(ReadConfig {
                user_data: home.root().to_path_buf(),
                mode: StoreMode::Rust,
                ownership,
            }),
            sidecar: proxy.clone(),
        };
        let out = snapshot_blocking(&StoreHost::new(), &reads).unwrap();
        assert_eq!(out["steamConfigStore"], json!({"isLoggedIn": false}));
        assert_eq!(out["configStore"], json!({"theme": "dark"}));
        assert!(out[STORE_REV_KEY].get("steamConfigStore").is_none());
        assert_eq!(proxy.calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn store_native_the_rev_key_matches_the_ts_constant() {
        const TS_TRANSPORT: &str = include_str!("../../src/common/types/sidecarTransport.ts");
        assert!(TS_TRANSPORT.contains("export const STORE_REV_KEY = '@rev' as const"));
        assert!(!is_plausible_cache_name(STORE_REV_KEY));
    }

    /// A recording emitter: every push, in order.
    struct RecordingEmitter(Mutex<Vec<(String, Vec<Value>)>>);
    impl FrontendEmitter for RecordingEmitter {
        fn emit(&self, channel: &str, args: Vec<Value>) {
            self.0.lock().unwrap().push((channel.to_string(), args));
        }
    }

    fn notice_args(entries: Value) -> Vec<Value> {
        vec![json!({ "tsEntries": entries })]
    }

    #[test]
    fn store_native_the_notice_merges_dedupes_and_is_sent_once() {
        let emitter = RecordingEmitter(Mutex::new(Vec::new()));
        let sent = AtomicBool::new(false);
        let lines = Mutex::new(Vec::<String>::new());
        let log = |l: &str| lines.lock().unwrap().push(l.to_string());
        let rust = vec![
            (
                "store_cache/steam_library".to_string(),
                ReadOnlyReason::Newer,
                "v3 > v2".to_string(),
            ),
            (
                "GamesConfig/480".to_string(),
                ReadOnlyReason::Failed,
                "parse".to_string(),
            ),
        ];
        let ts = notice_args(json!([
            {"storeKey": "store/migrations", "reason": "newer"},
            // The same area and reason as a Rust entry: one notice entry.
            {"storeKey": "settings/game", "reason": "failed"},
            {"storeKey": "store_cache/humble_revealed", "reason": "failed"},
            {"storeKey": "store_cache/humble_audit", "reason": "failed"}
        ]));
        let n = read_only_notice_with(&ts, &rust, &emitter, &sent, &log).unwrap();
        assert_eq!(n, json!(4));
        let pushed = emitter.0.lock().unwrap().clone();
        assert_eq!(pushed.len(), 1);
        assert_eq!(pushed[0].0, "readOnlyStoresNotice");
        assert_eq!(
            pushed[0].1,
            vec![json!({"entries": [
                {"area": "steam-library", "reason": "newer"},
                {"area": "game-settings", "reason": "failed"},
                {"area": "app-data", "reason": "newer"},
                {"area": "humble", "reason": "failed"}
            ]})]
        );
        assert_eq!(
            lines.lock().unwrap().as_slice(),
            &["store read-only notice: 4 entries".to_string()]
        );

        // A second call in the same process sends nothing.
        let again = read_only_notice_with(&ts, &rust, &emitter, &sent, &log).unwrap();
        assert_eq!(again, json!(0));
        assert_eq!(emitter.0.lock().unwrap().len(), 1);
    }

    #[test]
    fn store_native_an_empty_notice_pushes_nothing_but_still_uses_the_one_shot() {
        let emitter = RecordingEmitter(Mutex::new(Vec::new()));
        let sent = AtomicBool::new(false);
        let n =
            read_only_notice_with(&notice_args(json!([])), &[], &emitter, &sent, &|_| {}).unwrap();
        assert_eq!(n, json!(0));
        assert!(emitter.0.lock().unwrap().is_empty());
        assert!(sent.load(Ordering::SeqCst));
    }

    #[test]
    fn store_native_bad_notice_args_are_refused_and_do_not_spend_the_one_shot() {
        let emitter = RecordingEmitter(Mutex::new(Vec::new()));
        let sent = AtomicBool::new(false);
        let long = "k".repeat(NOTICE_KEY_MAX + 1);
        let too_many: Vec<Value> = (0..=NOTICE_MAX_ENTRIES)
            .map(|i| json!({"storeKey": format!("k{i}"), "reason": "newer"}))
            .collect();
        for args in [
            vec![],
            vec![json!({})],
            vec![json!({"tsEntries": [{"storeKey": "a", "reason": "corrupt"}]})],
            vec![json!({"tsEntries": [{"storeKey": "", "reason": "newer"}]})],
            vec![json!({"tsEntries": [{"storeKey": long, "reason": "newer"}]})],
            vec![json!({"tsEntries": too_many})],
            vec![json!({"tsEntries": []}), json!("extra")],
        ] {
            let err = read_only_notice_with(&args, &[], &emitter, &sent, &|_| {}).unwrap_err();
            assert_eq!(err, "store_read_only_notice:bad-args", "{args:?}");
        }
        assert!(!sent.load(Ordering::SeqCst));
        assert!(emitter.0.lock().unwrap().is_empty());
    }

    // ---- renderer writes (85-17) ----------------------------------------------------------------

    /// Waits until the host's event queue has run everything queued so far.
    fn delivered(host: &StoreHost) {
        let (tx, rx) = std::sync::mpsc::channel();
        host.post(Box::new(move || {
            let _ = tx.send(());
        }));
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .expect("the host's event queue drained");
    }

    /// A host with both of the shell's listeners: the renderer push into an emitter and the sidecar
    /// mirror events into a list, as `run_setup` and `store_dispatch::configure` register them.
    struct WriteRig {
        home: FakeHome,
        host: Arc<StoreHost>,
        pushes: Arc<RecordingEmitter>,
        events: Arc<Mutex<Vec<Value>>>,
        _dispatcher: Arc<crate::store_dispatch::Dispatcher>,
    }

    fn write_rig(prefix: &str) -> WriteRig {
        let home = FakeHome::new(prefix);
        let host = Arc::new(StoreHost::new());
        let pushes = Arc::new(RecordingEmitter(Mutex::new(Vec::new())));
        install_renderer_push(&host, Arc::clone(&pushes) as Arc<dyn FrontendEmitter>);
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&events);
        let dispatcher = crate::store_dispatch::Dispatcher::new(
            Arc::clone(&host),
            crate::store_dispatch::Config {
                user_data: home.root().to_path_buf(),
                mode: StoreMode::Rust,
                ownership: Ownership::embedded().clone(),
            },
            gamelib_core::shutdown::Shutdown::new(),
            Arc::new(move |e| sink.lock().unwrap().push(e)),
            Arc::new(|_| {}),
        );
        WriteRig {
            home,
            host,
            pushes,
            events,
            _dispatcher: dispatcher,
        }
    }

    fn set(store: &str, key: &str, value: Value) -> RendererWrite {
        RendererWrite::Set {
            store: store.to_string(),
            key: key.to_string(),
            value,
        }
    }

    fn no_forward(_: &RendererWrite) -> Result<bool, String> {
        panic!("a Rust-owned store is never forwarded")
    }

    #[test]
    fn store_native_tracer_a_renderer_set_is_persisted_and_announced_once_to_each_side() {
        let rig = write_rig("gamelib-store-native-write-");
        write(
            &rig.home,
            "store/config.json",
            "{\n\t\"theme\": \"dark\"\n}",
        );
        let reads = reads(&rig.home, StoreMode::Rust, RecordingProxy::new(json!({})));
        let out = apply_renderer_write(
            &rig.host,
            &reads,
            &set("configStore", "theme", json!("light")),
            &no_forward,
        )
        .unwrap();
        assert_eq!(out, WriteOutcome::Persisted);
        delivered(&rig.host);

        // On disk, in the TS byte layout.
        let text = fs::read_to_string(rig.home.root().join("store/config.json")).unwrap();
        assert!(text.contains("\"theme\": \"light\""), "{text}");

        // Exactly one renderer push, with the rev.
        let pushes = rig.pushes.0.lock().unwrap().clone();
        assert_eq!(
            pushes,
            vec![(
                STORE_CHANGED_CHANNEL.to_string(),
                vec![json!({"store": "configStore", "key": "theme", "value": "light", "rev": 1})]
            )]
        );
        // Exactly one sidecar event: a renderer write is `changed`, never an ack.
        let events = rig.events.lock().unwrap().clone();
        assert_eq!(
            events,
            vec![json!({
                "store": "store/config",
                "rev": 1,
                "op": "changed",
                "key": "theme",
                "valueJson": "\"light\""
            })]
        );
    }

    #[test]
    fn store_native_a_renderer_write_the_policy_refuses_writes_nothing_and_announces_nothing() {
        let rig = write_rig("gamelib-store-native-refuse-");
        write(
            &rig.home,
            "steam_store/config.json",
            "{\n\t\"isLoggedIn\": true,\n\t\"refreshToken\": \"steam:v1:secret\"\n}",
        );
        let before = fs::read(rig.home.root().join("steam_store/config.json")).unwrap();
        let reads = reads(&rig.home, StoreMode::Rust, RecordingProxy::new(json!({})));
        let cases = [
            (
                set("steamConfigStore", "refreshToken", json!("attacker")),
                WriteRefusal::NotWritable,
            ),
            (
                set("steamConfigStore", "refreshToken.inner", json!(1)),
                WriteRefusal::NotWritable,
            ),
            (
                set("timestampStore", "__proto__.polluted", json!(1)),
                WriteRefusal::KeyPath,
            ),
            (
                set("timestampStore", "a.constructor", json!(1)),
                WriteRefusal::KeyPath,
            ),
            (
                set("configStore", "__internal__.migrations", json!(1)),
                WriteRefusal::ReservedKey,
            ),
            (
                set("configStore", "settings", json!({})),
                WriteRefusal::NotWritable,
            ),
            (
                set("humble_library", "k", json!(1)),
                WriteRefusal::UnknownStore,
            ),
            (set("notAStore", "k", json!(1)), WriteRefusal::UnknownStore),
            (set("fontsStore", "k", json!(1)), WriteRefusal::NotWritable),
        ];
        for (write, want) in cases {
            let out = apply_renderer_write(&rig.host, &reads, &write, &no_forward).unwrap();
            assert_eq!(out, WriteOutcome::Refused(want), "{write:?}");
        }
        delivered(&rig.host);
        assert_eq!(
            fs::read(rig.home.root().join("steam_store/config.json")).unwrap(),
            before
        );
        assert!(rig.pushes.0.lock().unwrap().is_empty());
        assert!(rig.events.lock().unwrap().is_empty());
    }

    #[test]
    fn store_native_ts_mode_forwards_a_renderer_write_unchanged_and_rust_announces_nothing() {
        let rig = write_rig("gamelib-store-native-write-ts-");
        let reads = reads(&rig.home, StoreMode::Ts, RecordingProxy::new(json!({})));
        let forwarded = Mutex::new(Vec::new());
        let forward = |w: &RendererWrite| -> Result<bool, String> {
            forwarded
                .lock()
                .unwrap()
                .push((w.ts_send_channel(), w.ts_args()));
            Ok(false)
        };
        // Unchecked under ts: TS's own guards decide, exactly as before this plan.
        let write = set("steamConfigStore", "refreshToken", json!("x"));
        let out = apply_renderer_write(&rig.host, &reads, &write, &forward).unwrap();
        assert_eq!(out, WriteOutcome::Forwarded { persisted: false });
        assert_eq!(
            forwarded.lock().unwrap().as_slice(),
            &[(
                STORE_TS_SET_CHANNEL,
                vec![json!("steamConfigStore"), json!("refreshToken"), json!("x")]
            )]
        );
        delivered(&rig.host);
        assert!(rig.pushes.0.lock().unwrap().is_empty());
        assert!(rig.events.lock().unwrap().is_empty());
        assert_eq!(rig.host.in_flight(), 0);
        assert!(!rig.home.root().join("steam_store").exists());
    }

    #[test]
    fn store_native_a_row_ts_owns_under_rust_mode_is_forwarded() {
        let home = FakeHome::new("gamelib-store-native-write-mixed-");
        let ownership: Ownership = serde_json::from_str(
            r#"{"families":{"cache":true,"user-state":true,"account":true,"settings":true},"stores":{"store/config":false}}"#,
        )
        .unwrap();
        let reads = StoreReads {
            config: Some(ReadConfig {
                user_data: home.root().to_path_buf(),
                mode: StoreMode::Rust,
                ownership,
            }),
            sidecar: RecordingProxy::new(json!({})),
        };
        let calls = Mutex::new(0);
        let forward = |_: &RendererWrite| -> Result<bool, String> {
            *calls.lock().unwrap() += 1;
            Ok(false)
        };
        let out = apply_renderer_write(
            &StoreHost::new(),
            &reads,
            &set("configStore", "theme", json!("x")),
            &forward,
        )
        .unwrap();
        assert_eq!(out, WriteOutcome::Forwarded { persisted: false });
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn store_native_pushes_follow_each_renderer_name_policy_and_bulk_changes_invalidate() {
        let change = |op: OpSummary, value: Option<Json>| StoreChange {
            store: "steam_store/config".to_string(),
            rev: 4,
            op,
            origin: Origin::Sidecar { seq: 1 },
            value: value.map(Arc::new),
        };
        // A secret field: no renderer name may read it, so nothing is pushed.
        let token = change(
            OpSummary::Set {
                key: "refreshToken".into(),
            },
            Some(Json::Str("steam:v1:secret".into())),
        );
        assert!(renderer_pushes(&token).is_empty());
        // An allow-listed field reaches the name that may read it, with the rev.
        let pushed = renderer_pushes(&change(
            OpSummary::Set {
                key: "isLoggedIn".into(),
            },
            Some(Json::Bool(true)),
        ));
        assert!(pushed.contains(
            &json!({"store": "steamConfigStore", "key": "isLoggedIn", "value": true, "rev": 4})
        ));
        assert!(pushed.iter().all(|p| p["key"] == "isLoggedIn"));
        let deleted = renderer_pushes(&change(
            OpSummary::Delete {
                key: "isLoggedIn".into(),
            },
            None,
        ));
        assert!(deleted.contains(
            &json!({"store": "steamConfigStore", "key": "isLoggedIn", "deleted": true, "rev": 4})
        ));
        // A clear or replace has no key: every name over the file re-fetches; no value leaves.
        for op in [OpSummary::Clear, OpSummary::Replace] {
            let pushed = renderer_pushes(&change(op, Some(Json::Str("secret".into()))));
            assert!(pushed.contains(
                &json!({"store": "steamConfigStore", "key": "", "invalidated": true, "rev": 4})
            ));
            assert!(!Value::Array(pushed).to_string().contains("secret"));
        }
        // A store the renderer never reads gets no push at all.
        let native = StoreChange {
            store: "store/uploadedLogs".to_string(),
            rev: 1,
            op: OpSummary::Set { key: "k".into() },
            origin: Origin::Rust,
            value: Some(Arc::new(Json::Bool(true))),
        };
        assert!(renderer_pushes(&native).is_empty());
    }

    #[test]
    fn store_native_set_checked_is_true_only_once_on_disk_and_false_for_every_refusal() {
        let rig = write_rig("gamelib-store-native-checked-");
        write(
            &rig.home,
            "store/config.json",
            "{\n\t\"theme\": \"dark\"\n}",
        );
        // A store one version above its chain opens read-only.
        write(
            &rig.home,
            "store/timestamp.json",
            r#"{"a":1,"__internal__":{"gamelib":{"schemaVersion":999}}}"#,
        );
        write(&rig.home, "store_cache/steam_library.json", "{}");
        let reads = reads(&rig.home, StoreMode::Rust, RecordingProxy::new(json!(true)));

        assert_eq!(
            set_checked_blocking(
                &rig.host,
                &reads,
                &set("configStore", "theme", json!("light"))
            ),
            Ok(true)
        );
        let text = fs::read_to_string(rig.home.root().join("store/config.json")).unwrap();
        assert!(text.contains("\"theme\": \"light\""), "{text}");
        // The same value again is a no-op, which is still a success.
        assert_eq!(
            set_checked_blocking(
                &rig.host,
                &reads,
                &set("configStore", "theme", json!("light"))
            ),
            Ok(true)
        );

        let timestamp_before = fs::read(rig.home.root().join("store/timestamp.json")).unwrap();
        for write in [
            set("steamConfigStore", "refreshToken", json!("attacker")),
            set("timestampStore", "__proto__.polluted", json!(1)),
            set("timestampStore", "b", json!(2)),
            set("notAStore", "b", json!(2)),
        ] {
            assert_eq!(
                set_checked_blocking(&rig.host, &reads, &write),
                Ok(false),
                "{write:?}"
            );
        }
        assert_eq!(
            fs::read(rig.home.root().join("store/timestamp.json")).unwrap(),
            timestamp_before
        );

        // An evicted store (its directory was removed under a write that held it) refuses.
        assert_eq!(
            set_checked_blocking(&rig.host, &reads, &set("steam_library", "k", json!(1))),
            Ok(true)
        );
        let held = rig
            .host
            .open_row(
                row_for_key("store_cache/steam_library").unwrap(),
                rig.home.root().join("store_cache/steam_library.json"),
            )
            .unwrap();
        rig.host.evict_path(&rig.home.root().join("store_cache"));
        assert_eq!(
            apply_to(&held, &set("steam_library", "k", json!(2))),
            WriteOutcome::Refused(WriteRefusal::Evicted)
        );
        // A write that opens the store after the eviction writes over the now-missing file.
        assert_eq!(
            set_checked_blocking(&rig.host, &reads, &set("steam_library", "k", json!(3))),
            Ok(true)
        );
    }

    #[test]
    fn store_native_store_delete_removes_the_key_and_pushes_deleted_with_its_rev() {
        let rig = write_rig("gamelib-store-native-delete-");
        write(
            &rig.home,
            "store/config.json",
            "{\n\t\"theme\": \"dark\",\n\t\"language\": \"en\"\n}",
        );
        let reads = reads(&rig.home, StoreMode::Rust, RecordingProxy::new(json!({})));
        let delete = parse_store_delete(&[json!("configStore"), json!("theme")]).unwrap();
        assert_eq!(
            apply_renderer_write(&rig.host, &reads, &delete, &no_forward),
            Ok(WriteOutcome::Persisted)
        );
        delivered(&rig.host);
        let text = fs::read_to_string(rig.home.root().join("store/config.json")).unwrap();
        assert!(!text.contains("theme"), "{text}");
        assert!(text.contains("language"), "{text}");
        assert_eq!(
            rig.pushes.0.lock().unwrap().as_slice(),
            &[(
                STORE_CHANGED_CHANNEL.to_string(),
                vec![json!({"store": "configStore", "key": "theme", "deleted": true, "rev": 1})]
            )]
        );
        assert_eq!(
            rig.events.lock().unwrap().as_slice(),
            &[json!({"store": "store/config", "rev": 1, "op": "changed", "key": "theme"})]
        );
    }

    fn new_of(args: &[Value]) -> StoreNew {
        parse_store_new(args).unwrap()
    }

    fn no_new_forward(_: &StoreNew) -> Result<(), String> {
        panic!("a Rust-owned store is never forwarded")
    }

    #[test]
    fn store_native_store_new_opens_a_recognised_cache_lazily_and_ignores_options() {
        let rig = write_rig("gamelib-store-native-new-");
        let reads = reads(&rig.home, StoreMode::Rust, RecordingProxy::new(json!({})));
        // Hostile options: never a path, never a name.
        let new = new_of(&[
            json!("steam_library"),
            json!({"cwd": "../../evil", "name": "pwned"}),
        ]);
        assert_eq!(
            store_new_blocking(&rig.host, &reads, &new, &no_new_forward),
            Ok(NewOutcome::Opened)
        );
        // Opened, not created: no file until a write, and nothing at the options' path.
        assert!(!rig.home.root().join("store_cache").exists());
        assert!(!rig.home.root().join("pwned.json").exists());
        assert_eq!(
            store_new_blocking(
                &rig.host,
                &reads,
                &new_of(&[json!("configStore")]),
                &no_new_forward
            ),
            Ok(NewOutcome::Typed)
        );
        for name in ["brand_new_cache", "../config", "a/b"] {
            assert_eq!(
                store_new_blocking(&rig.host, &reads, &new_of(&[json!(name)]), &no_new_forward),
                Ok(NewOutcome::Refused),
                "{name}"
            );
        }
        assert!(!rig.home.root().join("store_cache").exists());
    }

    #[test]
    fn store_native_ts_mode_forwards_each_write_handler_to_its_ts_channel_and_rust_pushes_nothing()
    {
        let rig = write_rig("gamelib-store-native-ts-all-");
        let proxy = RecordingProxy::new(json!(true));
        let reads = reads(&rig.home, StoreMode::Ts, Arc::clone(&proxy));
        let ctx = {
            let mut ctx = NativeCtx::for_tests(Arc::new(NullHost), None);
            ctx.store_host = Arc::clone(&rig.host);
            ctx.store_reads = reads;
            ctx
        };
        run_send_write(
            &ctx,
            STORE_SET_CHANNEL,
            &set("configStore", "theme", json!("x")),
        );
        run_send_write(
            &ctx,
            STORE_DELETE_CHANNEL,
            &parse_store_delete(&[json!("configStore"), json!("theme")]).unwrap(),
        );
        run_store_new(
            &ctx,
            &new_of(&[json!("steam_library"), json!({"cwd": "x"})]),
        );
        let checked = set_checked_blocking(
            &ctx.store_host,
            &ctx.store_reads,
            &set("configStore", "theme", json!("y")),
        );
        assert_eq!(checked, Ok(true), "TS's own answer is the result");
        delivered(&rig.host);
        assert_eq!(
            proxy.calls.lock().unwrap().as_slice(),
            &[
                (
                    STORE_TS_SET_CHANNEL.to_string(),
                    vec![json!("configStore"), json!("theme"), json!("x")]
                ),
                (
                    STORE_TS_DELETE_CHANNEL.to_string(),
                    vec![json!("configStore"), json!("theme")]
                ),
                (
                    STORE_TS_NEW_CHANNEL.to_string(),
                    vec![json!("steam_library"), json!({"cwd": "x"})]
                ),
                (
                    STORE_TS_SET_CHECKED_CHANNEL.to_string(),
                    vec![json!("configStore"), json!("theme"), json!("y")]
                ),
            ]
        );
        assert!(rig.pushes.0.lock().unwrap().is_empty());
        assert!(rig.events.lock().unwrap().is_empty());
        assert!(!rig.home.root().join("store").exists());
    }

    #[test]
    fn store_native_set_checked_handler_refuses_bad_args_with_the_marker() {
        let ctx = Arc::new(NativeCtx::for_tests(Arc::new(NullHost), None));
        for args in [
            vec![],
            vec![json!("configStore")],
            vec![json!(1), json!("theme"), json!(1)],
            vec![
                json!("configStore"),
                json!("theme"),
                json!(1),
                json!("extra"),
            ],
        ] {
            let err =
                tauri::async_runtime::block_on(store_set_checked(Arc::clone(&ctx), args.clone()))
                    .unwrap_err();
            assert!(err.starts_with(IPC_INVALID_ARGS_MARKER), "{args:?}: {err}");
            assert!(err.contains(STORE_SET_CHECKED_CHANNEL));
        }
    }

    #[test]
    fn store_native_store_delete_and_new_args_are_shape_checked() {
        assert!(parse_store_delete(&[json!("configStore"), json!("a")]).is_ok());
        for args in [
            vec![],
            vec![json!("configStore")],
            vec![json!("configStore"), json!("")],
            vec![json!("configStore"), json!(1)],
            vec![json!("configStore"), json!("a"), json!("extra")],
        ] {
            assert!(parse_store_delete(&args).is_err(), "{args:?}");
        }
        assert_eq!(new_of(&[json!("s")]).options, None);
        assert_eq!(new_of(&[json!("s"), Value::Null]).options, None);
        assert_eq!(
            new_of(&[json!("s"), json!({"a": 1})]).options,
            Some(json!({"a": 1}))
        );
        for args in [
            vec![],
            vec![json!("")],
            vec![json!(1), json!({})],
            vec![json!("s"), json!("not-an-object")],
            vec![json!("s"), json!({}), json!("extra")],
        ] {
            assert!(parse_store_new(&args).is_err(), "{args:?}");
        }
    }

    #[test]
    fn store_native_store_set_args_are_shape_checked() {
        assert_eq!(
            parse_store_set(&[json!("configStore"), json!("a.b"), json!({"x": [1, null]})]),
            Ok(set("configStore", "a.b", json!({"x": [1, null]})))
        );
        assert!(parse_store_set(&[json!("configStore"), json!("a"), Value::Null]).is_ok());
        let long_key = "k".repeat(KEY_PATH_MAX + 1);
        for args in [
            vec![],
            vec![json!("configStore")],
            vec![json!("configStore"), json!("a")],
            vec![json!(1), json!("a"), json!(1)],
            vec![json!("s"), json!(""), json!(1)],
            vec![json!(""), json!("a"), json!(1)],
            vec![json!("s"), json!(long_key), json!(1)],
            vec![json!("s"), json!("a"), json!(1), json!("extra")],
        ] {
            assert!(parse_store_set(&args).is_err(), "{args:?}");
        }
    }

    struct NullHost;
    impl crate::native_router::NativeHost for NullHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }
}
