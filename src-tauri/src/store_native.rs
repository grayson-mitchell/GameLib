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

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use gamelib_core::emitter::FrontendEmitter;
use gamelib_store::engine::ReadOnlyReason;
use gamelib_store::host::StoreHost;
use gamelib_store::table::{row_for_key, table, TableRow};
use serde_json::{json, Map, Value};

use crate::ipc_contract::{
    StoreReadOnlyNoticeArgs, StoreReadOnlyNoticeArgsTsEntriesItemReason, STORE_SNAPSHOT_CHANNEL,
};
use crate::native_router::{invalid_args, NativeCtx, NativeFuture};
use crate::relay_commands::echo_channel;
use crate::store_boot::{is_rust_owned, Ownership, StoreMode};
use crate::store_policy::{
    area_for_store_key, filter_store_snapshot, is_plausible_cache_name, policy,
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
}

/// The real proxy: the sidecar state `store_dispatch` holds (installed when the sidecar spawns).
pub(crate) struct DispatcherSidecar;

impl SidecarProxy for DispatcherSidecar {
    fn invoke(&self, channel: &str, args: Vec<Value>) -> Result<Value, String> {
        let state = crate::store_dispatch::sidecar_state()
            .ok_or_else(|| "the sidecar is not running".to_string())?;
        state.invoke(channel.to_string(), args)
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
    use gamelib_store::host::Origin;
    use gamelib_store::json::Json;
    use gamelib_store::ops::Op;
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
        assert_eq!(key_of("migrationsStore"), "store/migrations");
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
    fn store_native_a_row_rust_never_opens_is_forwarded_under_rust_mode() {
        let home = FakeHome::new("gamelib-store-native-excluded-");
        let host = StoreHost::new();
        let proxy = RecordingProxy::new(json!({"appliedMigrations": []}));
        let reads = reads(&home, StoreMode::Rust, Arc::clone(&proxy));
        let out = fetch_blocking(&host, &reads, &resolved("migrationsStore")).unwrap();
        assert_eq!(out, json!({"values": {"appliedMigrations": []}}));
        assert_eq!(proxy.calls.lock().unwrap().len(), 1);
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

    struct NullHost;
    impl crate::native_router::NativeHost for NullHost {
        fn open_url(&self, _url: String) {}
        fn reveal_path(&self, _path: String) {}
    }
}
