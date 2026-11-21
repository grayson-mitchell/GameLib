//! The store host: one owner per store file (Phase 84 `StoreHost`, widened here in Phase 85, D-13).
//!
//! It moved from `gamelib-core::store` (core holds traits only) and keeps the method shapes
//! (`open_cache`, `get`, `set`, `remove`, `snapshot`, `on_change`), the in-memory rollback when a
//! persist fails, the 0600 files and 0700 new directories, and the atomic write with a direct-write
//! fallback (those last three now live in [`crate::atomic`]). What changed is the value type, the
//! ordered [`Json`] (a `serde_json::Value` cannot hold a nested object's key order), and that a file
//! is decided on open by the version [`engine`](crate::engine) and written in the exact bytes the TS
//! store stack wrote: a conf store is tab-indented and carries the `__internal__` version envelope,
//! a settings document is two-space. A Phase 84 file (2-space, no envelope) is adopted without a
//! write and becomes tab plus envelope on the next change.
//!
//! The envelope is the engine's namespace: [`Store::get`] never finds it, [`Store::snapshot`] never
//! lists it, and a write that names it is refused.

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::SystemTime;

use crate::atomic::{write_atomic, Durability};
use crate::engine::{open_file, Flavour, OpenOutcome, ReadOnlyReason, StoreKind};
use crate::envelope::{set_settings_version, stamp_for_write, RESERVED_KEY};
use crate::json::{to_settings_bytes, to_store_bytes, Json};
use crate::migrate::Chains;
use crate::ops::{self, Op};
use crate::table::{row_for_key, Family, Kind, TableRow};

/// What changed. Fired after the change is on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreChange {
    Set { key: String },
    Removed { key: String },
}

type Listener = Arc<dyn Fn(&StoreChange) + Send + Sync>;

/// Locks, ignoring poisoning: a listener that panicked must not make the store unreadable.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// The mutable part of a store, behind its lock.
struct StoreState {
    /// The document as on disk, envelope included; reads go through `ops::get`, which hides it.
    view: Json,
    /// The version a write stamps: the chain's current version.
    version: u32,
    /// Writes are refused while this is set; the file's bytes are never touched.
    read_only: Option<(ReadOnlyReason, String)>,
}

/// One store file. Keys follow the row's `dot_paths`; the top-level order is the file's order.
pub struct Store {
    path: PathBuf,
    key: String,
    kind: StoreKind,
    dot_paths: bool,
    flavour: Flavour,
    outcome: OpenOutcome,
    state: Mutex<StoreState>,
    listeners: Mutex<Vec<Listener>>,
}

impl Store {
    /// The store table key (`store/uploadedLogs`).
    pub fn key(&self) -> &str {
        &self.key
    }

    /// What opening the file decided (adopt, migrate, read-only, ...).
    pub fn open_outcome(&self) -> &OpenOutcome {
        &self.outcome
    }

    /// The value at `key`; the reserved `__internal__` key reads as absent.
    pub fn get(&self, key: &str) -> Option<Json> {
        let st = lock(&self.state);
        ops::get(&st.view, key, self.dot_paths).cloned()
    }

    /// Persists atomically, then fires `StoreChange::Set`. On a persist failure the in-memory view
    /// is rolled back, so memory never claims what the disk does not hold. Setting a key to the
    /// value it already holds writes nothing and fires nothing.
    pub fn set(&self, key: &str, value: Json) -> io::Result<()> {
        let changed = self.mutate(&Op::Set {
            key: key.to_string(),
            value,
        })?;
        if changed {
            self.notify(&StoreChange::Set {
                key: key.to_string(),
            });
        }
        Ok(())
    }

    /// `Ok(true)` when the key was present (the file is rewritten without it and `Removed` fires),
    /// `Ok(false)` when it was absent (nothing is written, nothing fires).
    pub fn remove(&self, key: &str) -> io::Result<bool> {
        let removed = self.mutate(&Op::Delete {
            key: key.to_string(),
        })?;
        if removed {
            self.notify(&StoreChange::Removed {
                key: key.to_string(),
            });
        }
        Ok(removed)
    }

    /// Every top-level `(key, value)` in file order, without the `__internal__` envelope; a key set
    /// after open is at the end.
    pub fn snapshot(&self) -> Vec<(String, Json)> {
        let st = lock(&self.state);
        match &st.view {
            Json::Obj(o) => o
                .iter()
                .filter(|(k, _)| k.as_str() != RESERVED_KEY)
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn on_change(&self, f: Box<dyn Fn(&StoreChange) + Send + Sync>) {
        lock(&self.listeners).push(Arc::from(f));
    }

    /// The reason writes are refused, if they are.
    pub fn read_only(&self) -> Option<ReadOnlyReason> {
        lock(&self.state).read_only.as_ref().map(|(r, _)| *r)
    }

    /// Applies `op` under the lock and persists it; the view is restored when the write fails.
    /// Returns whether the document changed.
    fn mutate(&self, op: &Op) -> io::Result<bool> {
        let mut st = lock(&self.state);
        if st.read_only.is_some() {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "store is read-only",
            ));
        }
        let previous = st.view.clone();
        let changed = ops::apply(&mut st.view, op, self.dot_paths)
            .map_err(|reject| io::Error::new(io::ErrorKind::InvalidInput, format!("{reject:?}")))?;
        if !changed {
            return Ok(false);
        }
        if let Err(e) = self.persist(&mut st) {
            st.view = previous;
            return Err(e);
        }
        Ok(true)
    }

    /// Writes the view in this store's byte layout, version stamped. `view` is replaced by the
    /// stamped document only once the bytes are on disk.
    fn persist(&self, st: &mut StoreState) -> io::Result<()> {
        let (stamped, bytes) = match self.flavour {
            Flavour::Store => {
                let stamped = stamp_for_write(&st.view, st.version);
                let bytes = to_store_bytes(&stamped);
                (stamped, bytes)
            }
            Flavour::Settings => {
                let mut stamped = st.view.clone();
                set_settings_version(&mut stamped, st.version);
                let bytes = to_settings_bytes(&stamped);
                (stamped, bytes)
            }
        };
        write_atomic(&self.path, &bytes, durability_of(self.kind))?;
        st.view = stamped;
        Ok(())
    }

    fn notify(&self, change: &StoreChange) {
        // Cloned out so a listener may call back into the store without deadlocking.
        let listeners: Vec<Listener> = lock(&self.listeners).clone();
        for l in listeners {
            l(change);
        }
    }
}

/// D-21: user data is `sync_all`-ed before it replaces the file, a rebuildable cache is not.
fn durability_of(kind: StoreKind) -> Durability {
    match kind {
        StoreKind::Cache => Durability::Unsynced,
        StoreKind::UserState | StoreKind::Account | StoreKind::Settings => Durability::Synced,
    }
}

/// The engine kind a row opens as. `None` is a row Rust never opens (`store/migrations`, D-07).
fn engine_kind(row: &TableRow) -> Option<StoreKind> {
    match row.family {
        Family::Excluded => None,
        // `uploadedLogs` is owned by a Rust module but is still a cache of its own kind.
        Family::Native => Some(match row.kind {
            Kind::Cache => StoreKind::Cache,
            Kind::UserState => StoreKind::UserState,
        }),
        _ => row.store_kind(),
    }
}

/// The row a runtime cache store (one the table does not list) opens with.
fn runtime_cache_row(key: String, dir: &str, name: &str) -> TableRow {
    TableRow {
        key,
        dir: dir.to_string(),
        name: Some(name.to_string()),
        ts_names: Vec::new(),
        kind: Kind::Cache,
        family: Family::Cache,
        token_bearing: false,
        dot_paths: true,
        flavour: Flavour::Store,
        chain: None,
    }
}

type Clock = Arc<dyn Fn() -> SystemTime + Send + Sync>;

/// Opens stores and hands out one `Arc<Store>` per file.
pub struct StoreHost {
    open: Mutex<HashMap<PathBuf, Arc<Store>>>,
    chains: Chains,
    now: Clock,
}

impl Default for StoreHost {
    fn default() -> Self {
        StoreHost::new()
    }
}

impl StoreHost {
    pub fn new() -> StoreHost {
        StoreHost::with_clock(Arc::new(SystemTime::now))
    }

    /// A host whose side files (corrupt copy, pre-migration backup) are stamped by `now`.
    pub fn with_clock(now: Clock) -> StoreHost {
        StoreHost {
            open: Mutex::new(HashMap::new()),
            chains: Chains::baseline(),
            now,
        }
    }

    /// Opens `<dir>/<name>.json` as the table row `<dir's name>/<name>` (a cache row with dot paths
    /// for a store the table does not list). A missing file is an empty store (nothing is written
    /// until the first change). A file that is not a JSON object is left untouched and is
    /// `InvalidData`: this entry point never lets a corrupt file be overwritten (Phase 84). A store
    /// the host never opens from Rust (`store/migrations`, D-07) is `InvalidInput`.
    pub fn open_cache(&self, dir: &Path, name: &str) -> io::Result<Arc<Store>> {
        if name.is_empty() || name.contains(['/', '\\', '\0']) || name.contains("..") {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "store name must be one plain file name",
            ));
        }
        let path = dir.join(format!("{name}.json"));
        let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        let key = format!("{dir_name}/{name}");
        let row = match row_for_key(&key) {
            Some(row) => row.clone(),
            None => runtime_cache_row(key, dir_name, name),
        };
        self.open_inner(&row, path, true)
    }

    /// Opens the file at `path` as `row`, whatever the engine decides: a file that cannot be read
    /// opens read-only (or, for a cache, empty) instead of failing. The boot sweep and the family
    /// plans open stores this way.
    pub fn open_row(&self, row: &TableRow, path: PathBuf) -> io::Result<Arc<Store>> {
        self.open_inner(row, path, false)
    }

    fn open_inner(&self, row: &TableRow, path: PathBuf, strict: bool) -> io::Result<Arc<Store>> {
        let Some(kind) = engine_kind(row) else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "this store is not opened from Rust",
            ));
        };
        let mut open = lock(&self.open);
        if let Some(store) = open.get(&path) {
            return Ok(Arc::clone(store));
        }
        let opened = open_file(
            &path,
            row.flavour,
            kind,
            row.chain_key(),
            &self.chains,
            (self.now)(),
        );
        let read_only = match &opened.outcome {
            OpenOutcome::ReadOnly { reason, detail } => Some((*reason, detail.clone())),
            _ => None,
        };
        let unreadable = matches!(opened.outcome, OpenOutcome::StartEmpty { .. })
            || matches!(read_only, Some((ReadOnlyReason::Failed, _)));
        if strict && unreadable {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "store file is not a readable store",
            ));
        }
        let store = Arc::new(Store {
            path: path.clone(),
            key: row.key.clone(),
            kind,
            dot_paths: row.dot_paths,
            flavour: row.flavour,
            outcome: opened.outcome,
            state: Mutex::new(StoreState {
                view: opened.view,
                version: opened.version,
                read_only,
            }),
            listeners: Mutex::new(Vec::new()),
        });
        open.insert(path, Arc::clone(&store));
        Ok(store)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::{parse, Num, Obj};
    use gamelib_testutil::FakeHome;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A v0.10 `uploadedLogs.json`: tab-indented, the version envelope last.
    const TS_SHAPED: &str = "{\n\t\"https://dpaste.com/ZZ99\": {\n\t\t\"name\": \"launch.log\",\n\t\t\"token\": \"1\",\n\t\t\"uploadedAt\": 1795133109000\n\t},\n\t\"https://dpaste.com/AA11\": {\n\t\t\"name\": \"gamelib.log\",\n\t\t\"token\": \"1\",\n\t\t\"uploadedAt\": 1795133100000\n\t},\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}";

    /// What Phase 84 wrote: 2-space, no envelope.
    const PHASE_84: &str = "{\n  \"https://dpaste.com/ZZ99\": {\n    \"name\": \"launch.log\",\n    \"token\": \"1\",\n    \"uploadedAt\": 1795133109000\n  }\n}";

    fn dir_of(home: &FakeHome) -> PathBuf {
        home.root().join("store")
    }

    fn seed(home: &FakeHome, text: &str) -> PathBuf {
        let dir = dir_of(home);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("uploadedLogs.json");
        fs::write(&file, text).unwrap();
        file
    }

    fn entry(name: &str, at: u64) -> Json {
        let mut o = Obj::new();
        o.insert_js("name", Json::Str(name.to_string()));
        o.insert_js("token", Json::Str("1".to_string()));
        o.insert_js("uploadedAt", Json::Num(Num::U(at)));
        Json::Obj(o)
    }

    fn num(n: u64) -> Json {
        Json::Num(Num::U(n))
    }

    fn keys(store: &Store) -> Vec<String> {
        store.snapshot().into_iter().map(|(k, _)| k).collect()
    }

    fn open(home: &FakeHome) -> Arc<Store> {
        StoreHost::new()
            .open_cache(&dir_of(home), "uploadedLogs")
            .unwrap()
    }

    #[test]
    fn a_missing_file_opens_empty_and_writes_nothing_until_the_first_set() {
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        assert!(store.snapshot().is_empty());
        assert_eq!(store.get("k"), None);
        assert!(!dir_of(&home).exists());
        assert_eq!(store.key(), "store/uploadedLogs");
        assert_eq!(*store.open_outcome(), OpenOutcome::Missing);
    }

    #[test]
    fn a_v010_file_lists_without_internal_and_a_set_rewrites_it_with_the_same_bytes_and_order() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        assert_eq!(
            keys(&store),
            ["https://dpaste.com/ZZ99", "https://dpaste.com/AA11"]
        );
        assert_eq!(store.get("__internal__"), None);
        assert_eq!(
            store.get("https://dpaste.com/AA11"),
            Some(entry("gamelib.log", 1_795_133_100_000))
        );
        // Re-setting an existing key to its value changes nothing: nothing is written.
        store
            .set(
                "https://dpaste.com/ZZ99",
                entry("launch.log", 1_795_133_109_000),
            )
            .unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
        // The envelope keeps its place and a new key follows it, as a conf write does.
        store
            .set("https://dpaste.com/NEW1", entry("x.log", 5))
            .unwrap();
        let written = parse(fs::read(&file).unwrap().as_slice()).unwrap();
        let order: Vec<&str> = written
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, _)| k.as_str())
            .collect();
        assert_eq!(
            order,
            [
                "https://dpaste.com/ZZ99",
                "https://dpaste.com/AA11",
                "__internal__",
                "https://dpaste.com/NEW1"
            ]
        );
        assert!(fs::read_to_string(&file).unwrap().starts_with("{\n\t\""));
    }

    #[test]
    fn a_phase_84_file_is_adopted_without_a_write_and_becomes_tab_plus_envelope_on_change() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, PHASE_84);
        let before = fs::metadata(&file).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        let store = open(&home);
        assert_eq!(*store.open_outcome(), OpenOutcome::Adopted);
        assert_eq!(keys(&store), ["https://dpaste.com/ZZ99"]);
        assert_eq!(fs::read_to_string(&file).unwrap(), PHASE_84);
        assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), before);
        store.set("https://dpaste.com/B", num(1)).unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "{\n\t\"https://dpaste.com/ZZ99\": {\n\t\t\"name\": \"launch.log\",\n\t\t\"token\": \"1\",\n\t\t\"uploadedAt\": 1795133109000\n\t},\n\t\"https://dpaste.com/B\": 1,\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}"
        );
    }

    #[test]
    fn a_corrupt_file_is_left_byte_identical_and_reports_invalid_data() {
        let home = FakeHome::new("gamelib-store-host-");
        for bad in ["{not json", "[1, 2]", ""] {
            let file = seed(&home, bad);
            let err = StoreHost::new()
                .open_cache(&dir_of(&home), "uploadedLogs")
                .err()
                .expect("corrupt store must not open");
            assert_eq!(err.kind(), io::ErrorKind::InvalidData, "{bad:?}");
            assert_eq!(fs::read_to_string(&file).unwrap(), bad);
        }
    }

    #[test]
    fn a_newer_file_opens_read_only_and_every_write_is_refused() {
        let home = FakeHome::new("gamelib-store-host-");
        let newer = TS_SHAPED.replace("\"schemaVersion\": 1", "\"schemaVersion\": 9");
        let file = seed(&home, &newer);
        let store = open(&home);
        assert_eq!(store.read_only(), Some(ReadOnlyReason::Newer));
        assert!(store.set("k", num(1)).is_err());
        assert!(store.remove("https://dpaste.com/ZZ99").is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), newer);
    }

    #[test]
    fn migrations_json_is_never_opened_from_rust() {
        let home = FakeHome::new("gamelib-store-host-");
        let dir = dir_of(&home);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("migrations.json"), "{}").unwrap();
        let err = StoreHost::new()
            .open_cache(&dir, "migrations")
            .err()
            .expect("excluded row");
        assert_eq!(err.kind(), io::ErrorKind::InvalidInput);
        assert_eq!(
            fs::read_to_string(dir.join("migrations.json")).unwrap(),
            "{}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_file_is_0600_and_a_new_directory_0700() {
        use std::os::unix::fs::PermissionsExt;
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        store.set("k", num(1)).unwrap();
        let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&dir_of(&home)), 0o700);
        assert_eq!(mode(&dir_of(&home).join("uploadedLogs.json")), 0o600);
    }

    #[test]
    fn the_same_dir_and_name_share_one_store_and_a_different_name_does_not() {
        let home = FakeHome::new("gamelib-store-host-");
        let host = StoreHost::new();
        let a = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let b = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let c = host.open_cache(&dir_of(&home), "other").unwrap();
        assert!(Arc::ptr_eq(&a, &b));
        assert!(!Arc::ptr_eq(&a, &c));
        a.set("k", Json::Str("v".into())).unwrap();
        assert_eq!(b.get("k"), Some(Json::Str("v".into())));
        assert_eq!(c.get("k"), None);
    }

    #[test]
    fn a_store_name_must_be_one_plain_file_name() {
        let home = FakeHome::new("gamelib-store-host-");
        for bad in ["", "a/b", "a\\b", "..", "a\0b"] {
            let err = StoreHost::new()
                .open_cache(&dir_of(&home), bad)
                .err()
                .expect("bad name");
            assert_eq!(err.kind(), io::ErrorKind::InvalidInput, "{bad:?}");
        }
    }

    #[test]
    fn remove_of_a_present_key_persists_without_it_and_an_absent_key_changes_nothing() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        assert!(!store.remove("https://dpaste.com/none").unwrap());
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
        assert!(store.remove("https://dpaste.com/ZZ99").unwrap());
        let text = fs::read_to_string(&file).unwrap();
        assert!(!text.contains("ZZ99") && text.contains("AA11"));
        assert_eq!(keys(&store), ["https://dpaste.com/AA11"]);
        assert!(store.remove("https://dpaste.com/AA11").unwrap());
        // An emptied store keeps its envelope.
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "{\n\t\"__internal__\": {\n\t\t\"gamelib\": {\n\t\t\t\"schemaVersion\": 1\n\t\t}\n\t}\n}"
        );
        assert!(store.snapshot().is_empty());
    }

    #[test]
    fn a_write_naming_the_envelope_is_refused_and_changes_nothing() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        assert!(store.set("__internal__", num(1)).is_err());
        assert!(store.remove("__internal__").is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
    }

    #[test]
    fn a_url_key_with_dots_stays_one_key_because_the_row_has_dot_paths_off() {
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        store
            .set("https://paste.example.com/a.log", num(1))
            .unwrap();
        store.set("a.b", num(2)).unwrap();
        assert_eq!(store.get("a"), None);
        assert_eq!(store.get("a.b"), Some(num(2)));
        assert_eq!(keys(&store), ["https://paste.example.com/a.log", "a.b"]);
    }

    #[test]
    fn snapshot_is_in_file_order_with_a_new_key_appended_at_the_end() {
        let home = FakeHome::new("gamelib-store-host-");
        seed(&home, TS_SHAPED);
        let store = open(&home);
        store.set("https://dpaste.com/AAA0", num(1)).unwrap();
        assert_eq!(
            keys(&store),
            [
                "https://dpaste.com/ZZ99",
                "https://dpaste.com/AA11",
                "https://dpaste.com/AAA0"
            ]
        );
    }

    #[test]
    fn a_listener_fires_once_per_successful_set_and_remove_after_the_persist_and_not_for_a_no_op() {
        let home = FakeHome::new("gamelib-store-host-");
        let file = seed(&home, TS_SHAPED);
        let store = open(&home);
        let seen = Arc::new(Mutex::new(Vec::<(StoreChange, bool)>::new()));
        let sink = Arc::clone(&seen);
        let watched = file.clone();
        store.on_change(Box::new(move |c| {
            // On disk already: the file holds the key (set) or no longer does (removed).
            let text = fs::read_to_string(&watched).unwrap();
            let on_disk = match c {
                StoreChange::Set { key } => text.contains(key.as_str()),
                StoreChange::Removed { key } => !text.contains(key.as_str()),
            };
            sink.lock().unwrap().push((c.clone(), on_disk));
        }));
        store.set("https://dpaste.com/N", num(1)).unwrap();
        store.remove("https://dpaste.com/none").unwrap();
        store.remove("https://dpaste.com/N").unwrap();
        let seen = seen.lock().unwrap().clone();
        assert_eq!(
            seen,
            vec![
                (
                    StoreChange::Set {
                        key: "https://dpaste.com/N".into()
                    },
                    true
                ),
                (
                    StoreChange::Removed {
                        key: "https://dpaste.com/N".into()
                    },
                    true
                ),
            ]
        );
    }

    #[test]
    fn a_listener_may_call_back_into_the_store() {
        let home = FakeHome::new("gamelib-store-host-");
        let store = open(&home);
        let again = Arc::clone(&store);
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        store.on_change(Box::new(move |_| {
            c.store(again.snapshot().len(), Ordering::SeqCst);
        }));
        store.set("k", num(1)).unwrap();
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_failed_persist_rolls_the_in_memory_value_back_fires_nothing_and_leaves_no_temp_file() {
        let home = FakeHome::new("gamelib-store-host-");
        let dir = dir_of(&home);
        let store = open(&home);
        store.set("k", num(1)).unwrap();
        // A directory where the file must go makes the temp write, the rename and the direct write
        // fail.
        fs::remove_file(dir.join("uploadedLogs.json")).unwrap();
        fs::create_dir(dir.join("uploadedLogs.json")).unwrap();
        let fired = Arc::new(AtomicUsize::new(0));
        let f = Arc::clone(&fired);
        store.on_change(Box::new(move |_| {
            f.fetch_add(1, Ordering::SeqCst);
        }));
        assert!(store.set("k", num(2)).is_err());
        assert!(store.set("new", num(3)).is_err());
        assert!(store.remove("k").is_err());
        assert_eq!(store.get("k"), Some(num(1)));
        assert_eq!(store.get("new"), None);
        assert_eq!(fired.load(Ordering::SeqCst), 0);
        let leftovers: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }
}
