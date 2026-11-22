//! Handlers for the two `safety_*` rustInvoke channels (Phase 82 D-07). Each validates through its
//! generated Args struct then passes straight to the Tauri-free `gamelib-safety` crate. No logging
//! of paths or titles (T-28-04): the crate's replies carry closed-set reasons and caller ids only.
//!
//! Phase 85 plan 15 (T-85-38): a removal can delete store files the shell owns (a reset deletes
//! `GamesConfig/` and `config.json`; an uninstall deletes `GamesConfig/<app>.json`). The store frame
//! worker is paused across the delete, and when the reply's outcome is `removed` every `app-data`
//! target is evicted: open stores at or under it take no more writes
//! (`StoreHost::evict_path`) and frames already queued for them are refused `evicted`
//! (`store_dispatch::evict_queued`), so neither the queue nor the exit drain recreates a deleted
//! settings file. A refused or failed removal evicts nothing.

use super::*;
use std::path::PathBuf;

pub(crate) fn rpc_safety_check_removal(args: &[Value]) -> Result<Value, String> {
    SafetyCheckRemovalArgs::from_args(args)?;
    gamelib_safety::dispatch("safety_check_removal", args)
}

pub(crate) fn rpc_safety_remove_tree(args: &[Value]) -> Result<Value, String> {
    SafetyRemoveTreeArgs::from_args(args)?;
    // Held until the eviction below is done: no queued store write lands between the two.
    let _paused = crate::store_dispatch::pause_for_removal();
    let reply = gamelib_safety::dispatch("safety_remove_tree", args)?;
    for target in removed_app_data_targets(args, &reply) {
        crate::store_boot::host().evict_path(&target);
        crate::store_dispatch::evict_queued(&target);
    }
    Ok(reply)
}

/// The `app-data` target paths of a removal whose outcome is `removed`; none for any other outcome
/// (`refused`, `failed`: a failed removal may have deleted an earlier target, but evicting on a
/// partial result is not this function's call, the plan's rule is evict nothing).
fn removed_app_data_targets(args: &[Value], reply: &Value) -> Vec<PathBuf> {
    if reply.get("outcome").and_then(Value::as_str) != Some("removed") {
        return Vec::new();
    }
    args.first()
        .and_then(|req| req.get("targets"))
        .and_then(Value::as_array)
        .map(|targets| {
            targets
                .iter()
                .filter(|t| t.get("kind").and_then(Value::as_str) == Some("app-data"))
                .filter_map(|t| t.get("path").and_then(Value::as_str))
                .map(PathBuf::from)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store_boot::{Ownership, StoreMode};
    use crate::store_dispatch::{Config, Dispatcher, EventSink, LogSink};
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::{Origin, StoreHost};
    use gamelib_store::json::{parse, Json};
    use gamelib_store::ops::Op;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::fs;
    use std::path::Path;
    use std::sync::{Arc, Mutex};

    fn request(targets: Value) -> Vec<Value> {
        vec![json!({ "targets": targets, "knownInstalls": [], "protectedRoots": [] })]
    }

    fn app_data(id: &str, path: &Path, root: &Path) -> Value {
        json!({ "id": id, "path": path.to_string_lossy(), "kind": "app-data",
                "trustRoot": root.to_string_lossy() })
    }

    #[test]
    fn safety_removed_app_data_targets_are_listed_only_for_a_removed_outcome() {
        let args = request(json!([
            { "id": "a", "path": "/x/GamesConfig", "kind": "app-data", "trustRoot": "/x" },
            { "id": "b", "path": "/x/pfx", "kind": "prefix" },
            { "id": "c", "path": "/x/config.json", "kind": "app-data", "trustRoot": "/x" }
        ]));
        assert_eq!(
            removed_app_data_targets(&args, &json!({ "outcome": "removed" })),
            vec![
                PathBuf::from("/x/GamesConfig"),
                PathBuf::from("/x/config.json")
            ]
        );
        for outcome in ["refused", "failed"] {
            assert!(removed_app_data_targets(&args, &json!({ "outcome": outcome })).is_empty());
        }
        assert!(removed_app_data_targets(&args, &json!({})).is_empty());
        assert!(removed_app_data_targets(&[], &json!({ "outcome": "removed" })).is_empty());
    }

    /// A dispatcher over `home` with the settings family owned, and the events it answered.
    fn rig(home: &FakeHome, host: &Arc<StoreHost>) -> (Arc<Dispatcher>, Arc<Mutex<Vec<Value>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let e = Arc::clone(&events);
        let sink: EventSink = Arc::new(move |v| e.lock().unwrap().push(v));
        let log: LogSink = Arc::new(|_| {});
        let dispatcher = Dispatcher::new(
            Arc::clone(host),
            Config {
                user_data: home.root().to_path_buf(),
                mode: StoreMode::Rust,
                ownership: Ownership::parse(r#"{"families":{"settings":true},"stores":{}}"#)
                    .unwrap(),
            },
            Shutdown::new(),
            sink,
            log,
        );
        (dispatcher, events)
    }

    fn replace_frame(seq: u64, store: &str, body: &str) -> Value {
        json!({ "kind": "store", "seq": seq, "store": store, "op": "replace", "valueJson": body })
    }

    fn send(d: &Arc<Dispatcher>, v: Value) {
        let len = serde_json::to_string(&v).unwrap().len();
        d.enqueue(len, v);
    }

    fn obj(text: &str) -> gamelib_store::json::Obj {
        match parse(text.as_bytes()).unwrap() {
            Json::Obj(o) => o,
            _ => unreachable!(),
        }
    }

    /// T-85-38 end to end on one dispatcher and host: an open document and a queued write for
    /// it, a real `remove_tree` of its directory under the pause, then the eviction. The queued
    /// write is refused `evicted`, the open store refuses writes, the drain recreates nothing, and a
    /// write sent after the eviction (a new game config) is applied.
    #[test]
    fn safety_a_removed_app_data_target_evicts_open_and_queued_stores_and_nothing_is_recreated() {
        let home = FakeHome::new("gamelib-safety-evict-");
        let host = Arc::new(StoreHost::new());
        let (dispatcher, events) = rig(&home, &host);
        let games = home.root().join("GamesConfig");
        let doc = games.join("480.json");
        let body = r#"{"480":{"maxSharpness":1},"version":"v2","explicit":true}"#;
        send(&dispatcher, replace_frame(1, "GamesConfig/480", body));
        assert!(dispatcher.wait_idle(Duration::from_secs(10)));
        assert!(doc.is_file());
        let open = host.open_doc("GamesConfig/480", doc.clone()).unwrap();

        // Paused: a write queued now is not applied before the removal and the eviction.
        let pause = dispatcher.pause(Duration::from_secs(5));
        send(&dispatcher, replace_frame(2, "GamesConfig/480", body));
        send(
            &dispatcher,
            replace_frame(3, "settings/global", r#"{"version":"v2"}"#),
        );
        let args = request(json!([app_data("settings", &games, home.root())]));
        let reply = gamelib_safety::dispatch("safety_remove_tree", &args).unwrap();
        assert_eq!(reply["outcome"], "removed");
        let targets = removed_app_data_targets(&args, &reply);
        assert_eq!(targets, vec![games.clone()]);
        for t in &targets {
            assert_eq!(host.evict_path(t), 1);
            assert_eq!(
                dispatcher.evict_queued(t),
                1,
                "only the GamesConfig frame is doomed"
            );
        }
        drop(pause);
        assert!(dispatcher.wait_idle(Duration::from_secs(10)));

        assert!(
            !doc.exists(),
            "the queued write did not recreate the deleted document"
        );
        assert!(
            home.root().join("config.json").is_file(),
            "an unrelated store still writes"
        );
        let answers: Vec<(u64, String, Option<String>)> = events
            .lock()
            .unwrap()
            .iter()
            .map(|e| {
                (
                    e["originSeq"].as_u64().unwrap(),
                    e["op"].as_str().unwrap().to_string(),
                    e["reason"].as_str().map(str::to_string),
                )
            })
            .collect();
        assert_eq!(
            answers,
            vec![
                (1, "applied".to_string(), None),
                (2, "refused".to_string(), Some("evicted".to_string())),
                (3, "applied".to_string(), None),
            ]
        );
        // The store that was open refuses writes and creates nothing.
        assert!(open.apply(Op::Replace(obj(body)), Origin::Rust).is_err());
        assert!(!doc.exists());

        // A write sent after the eviction is a new document: it is applied.
        send(&dispatcher, replace_frame(4, "GamesConfig/480", body));
        assert!(dispatcher.wait_idle(Duration::from_secs(10)));
        assert!(doc.is_file());
    }

    #[test]
    fn safety_a_refused_removal_evicts_nothing() {
        let home = FakeHome::new("gamelib-safety-evict-");
        let host = Arc::new(StoreHost::new());
        let (dispatcher, events) = rig(&home, &host);
        let config = home.root().join("config.json");
        send(
            &dispatcher,
            replace_frame(1, "settings/global", r#"{"version":"v2"}"#),
        );
        assert!(dispatcher.wait_idle(Duration::from_secs(10)));
        // The trust root itself is refused (`is-trust-root`): nothing is deleted.
        let args = request(json!([app_data("config", home.root(), home.root())]));
        let reply = gamelib_safety::dispatch("safety_remove_tree", &args).unwrap();
        assert_eq!(reply["outcome"], "refused");
        assert!(removed_app_data_targets(&args, &reply).is_empty());
        assert!(config.is_file());
        send(
            &dispatcher,
            replace_frame(2, "settings/global", r#"{"version":"v2","a":1}"#),
        );
        assert!(dispatcher.wait_idle(Duration::from_secs(10)));
        let last = events.lock().unwrap().last().cloned().unwrap();
        assert_eq!(last["op"], "applied");
    }

    /// The production entry with no host installed and no dispatcher configured (a unit test of
    /// this module): the removal still runs and nothing panics.
    #[test]
    fn safety_rpc_remove_tree_without_a_configured_dispatcher_still_removes() {
        let home = FakeHome::new("gamelib-safety-evict-");
        let target = home.root().join("GamesConfig");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("1.json"), "{}").unwrap();
        let reply =
            rpc_safety_remove_tree(&request(json!([app_data("s", &target, home.root())]))).unwrap();
        assert_eq!(reply["outcome"], "removed");
        assert!(!target.exists());
    }
}
