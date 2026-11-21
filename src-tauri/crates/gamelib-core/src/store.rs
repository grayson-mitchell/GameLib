//! The minimal StoreHost core (Phase 84, D-09; ownership R1 option a of 82-STATE-OWNERSHIP.md).
//!
//! One owner per store file: open, atomic write with a direct-write fallback, and a change event.
//! Exactly one cache store lives here today, `uploadedLogs` at `<user_data>/store/uploadedLogs.json`.
//! Phase 85 widens this same owner (dot paths, versioned envelopes, backup, the `storeChanged`
//! bridge) without changing the signatures below: stores are keyed by `(dir, name)` and keys are flat.
//!
//! The file shape is the one the retired TS file store wrote: 2-space pretty JSON of a top-level
//! object, written through `<file>.tmp-<pid>` then renamed, 0600 file, 0700 new directory.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use indexmap::IndexMap;
use serde_json::Value;

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

/// One store file. Keys are flat (no dot traversal); the top-level order is the file's order.
pub struct Store {
    path: PathBuf,
    data: Mutex<IndexMap<String, Value>>,
    listeners: Mutex<Vec<Listener>>,
}

impl Store {
    pub fn get(&self, key: &str) -> Option<Value> {
        lock(&self.data).get(key).cloned()
    }

    /// Persists atomically, then fires `StoreChange::Set`. On a persist failure the in-memory value
    /// is rolled back, so memory never claims what the disk does not hold.
    pub fn set(&self, key: &str, v: Value) -> io::Result<()> {
        {
            let mut data = lock(&self.data);
            let previous = data.insert(key.to_string(), v);
            if let Err(e) = persist_atomic(&self.path, &data, &|from, to| fs::rename(from, to)) {
                match previous {
                    Some(old) => {
                        data.insert(key.to_string(), old);
                    }
                    None => {
                        data.shift_remove(key);
                    }
                }
                return Err(e);
            }
        }
        self.notify(&StoreChange::Set {
            key: key.to_string(),
        });
        Ok(())
    }

    /// `Ok(true)` when the key was present (the file is rewritten without it and `Removed` fires),
    /// `Ok(false)` when it was absent (nothing is written, nothing fires).
    pub fn remove(&self, key: &str) -> io::Result<bool> {
        {
            let mut data = lock(&self.data);
            let Some((index, _, old)) = data.shift_remove_full(key) else {
                return Ok(false);
            };
            if let Err(e) = persist_atomic(&self.path, &data, &|from, to| fs::rename(from, to)) {
                data.shift_insert(index, key.to_string(), old);
                return Err(e);
            }
        }
        self.notify(&StoreChange::Removed {
            key: key.to_string(),
        });
        Ok(true)
    }

    /// Every `(key, value)` in file order; a key set after open is at the end.
    pub fn snapshot(&self) -> Vec<(String, Value)> {
        lock(&self.data)
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    pub fn on_change(&self, f: Box<dyn Fn(&StoreChange) + Send + Sync>) {
        lock(&self.listeners).push(Arc::from(f));
    }

    fn notify(&self, change: &StoreChange) {
        // Cloned out so a listener may call back into the store without deadlocking.
        let listeners: Vec<Listener> = lock(&self.listeners).clone();
        for l in listeners {
            l(change);
        }
    }
}

/// Opens stores and hands out one `Arc<Store>` per file.
#[derive(Default)]
pub struct StoreHost {
    open: Mutex<HashMap<PathBuf, Arc<Store>>>,
}

impl StoreHost {
    pub fn new() -> StoreHost {
        StoreHost::default()
    }

    /// Opens `<dir>/<name>.json`. A missing file is an empty store (nothing is written until the
    /// first `set`). A file that is not a JSON object is left untouched and is `InvalidData`: a
    /// corrupt store is never overwritten.
    pub fn open_cache(&self, dir: &Path, name: &str) -> io::Result<Arc<Store>> {
        if name.is_empty() || name.contains(['/', '\\', '\0']) || name.contains("..") {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "store name must be one plain file name",
            ));
        }
        let path = dir.join(format!("{name}.json"));
        let mut open = lock(&self.open);
        if let Some(store) = open.get(&path) {
            return Ok(Arc::clone(store));
        }
        let data = match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str::<IndexMap<String, Value>>(&text)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?,
            Err(e) if e.kind() == io::ErrorKind::NotFound => IndexMap::new(),
            Err(e) => return Err(e),
        };
        let store = Arc::new(Store {
            path: path.clone(),
            data: Mutex::new(data),
            listeners: Mutex::new(Vec::new()),
        });
        open.insert(path, Arc::clone(&store));
        Ok(store)
    }
}

fn create_dir_private(dir: &Path) -> io::Result<()> {
    if dir.exists() {
        return Ok(());
    }
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(dir)
}

fn write_private(path: &Path, data: &[u8]) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?.write_all(data)
}

/// The persist seam: `rename` is a parameter so a test can force the failure without touching
/// permissions. Writes `<file>.tmp-<pid>` (0600), renames it over the file, and when either step
/// fails writes the file directly (the WR-05 fallback, kept from the retired TS file store); the
/// temp file is removed either way.
pub(crate) fn persist_atomic(
    path: &Path,
    data: &IndexMap<String, Value>,
    rename: &dyn Fn(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        create_dir_private(dir)?;
    }
    let serialized = serde_json::to_string_pretty(data)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(format!(".tmp-{}", std::process::id()));
    let tmp = PathBuf::from(tmp);
    let atomic = write_private(&tmp, serialized.as_bytes()).and_then(|()| rename(&tmp, path));
    if atomic.is_ok() {
        return Ok(());
    }
    let direct = write_private(path, serialized.as_bytes());
    let _ = fs::remove_file(&tmp);
    direct
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const TS_SHAPED: &str = "{\n  \"https://dpaste.com/ZZ99\": {\n    \"name\": \"launch.log\",\n    \"token\": \"1\",\n    \"uploadedAt\": 1795133109000\n  },\n  \"https://dpaste.com/AA11\": {\n    \"name\": \"gamelib.log\",\n    \"token\": \"1\",\n    \"uploadedAt\": 1795133100000\n  }\n}";

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

    fn entry(name: &str, at: u64) -> Value {
        json!({"name": name, "token": "1", "uploadedAt": at})
    }

    #[test]
    fn a_missing_file_opens_empty_and_writes_nothing_until_the_first_set() {
        let home = FakeHome::new("gamelib-store-");
        let store = StoreHost::new()
            .open_cache(&dir_of(&home), "uploadedLogs")
            .unwrap();
        assert!(store.snapshot().is_empty());
        assert_eq!(store.get("k"), None);
        assert!(!dir_of(&home).exists());
    }

    #[test]
    fn a_ts_shaped_file_reads_and_a_set_rewrites_it_with_the_same_order_and_indentation() {
        let home = FakeHome::new("gamelib-store-");
        let file = seed(&home, TS_SHAPED);
        let store = StoreHost::new()
            .open_cache(&dir_of(&home), "uploadedLogs")
            .unwrap();
        let keys: Vec<String> = store.snapshot().into_iter().map(|(k, _)| k).collect();
        assert_eq!(keys, ["https://dpaste.com/ZZ99", "https://dpaste.com/AA11"]);
        assert_eq!(
            store.get("https://dpaste.com/AA11"),
            Some(entry("gamelib.log", 1_795_133_100_000))
        );
        // Re-setting an existing key keeps its position and writes the very same bytes.
        store
            .set(
                "https://dpaste.com/ZZ99",
                entry("launch.log", 1_795_133_109_000),
            )
            .unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
        store
            .set("https://dpaste.com/NEW1", entry("x.log", 5))
            .unwrap();
        let head = TS_SHAPED
            .strip_suffix("\n}")
            .expect("seed ends with a brace");
        let expected = format!(
            "{head},\n  \"https://dpaste.com/NEW1\": {{\n    \"name\": \"x.log\",\n    \"token\": \"1\",\n    \"uploadedAt\": 5\n  }}\n}}"
        );
        assert_eq!(fs::read_to_string(&file).unwrap(), expected);
    }

    #[test]
    fn a_corrupt_file_is_left_byte_identical_and_reports_invalid_data() {
        let home = FakeHome::new("gamelib-store-");
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

    #[cfg(unix)]
    #[test]
    fn the_file_is_0600_and_a_new_directory_0700() {
        use std::os::unix::fs::PermissionsExt;
        let home = FakeHome::new("gamelib-store-");
        let store = StoreHost::new()
            .open_cache(&dir_of(&home), "uploadedLogs")
            .unwrap();
        store.set("k", json!(1)).unwrap();
        let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&dir_of(&home)), 0o700);
        assert_eq!(mode(&dir_of(&home).join("uploadedLogs.json")), 0o600);
    }

    #[test]
    fn the_same_dir_and_name_share_one_store_and_a_different_name_does_not() {
        let home = FakeHome::new("gamelib-store-");
        let host = StoreHost::new();
        let a = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let b = host.open_cache(&dir_of(&home), "uploadedLogs").unwrap();
        let c = host.open_cache(&dir_of(&home), "other").unwrap();
        assert!(Arc::ptr_eq(&a, &b));
        assert!(!Arc::ptr_eq(&a, &c));
        a.set("k", json!("v")).unwrap();
        assert_eq!(b.get("k"), Some(json!("v")));
        assert_eq!(c.get("k"), None);
    }

    #[test]
    fn a_store_name_must_be_one_plain_file_name() {
        let home = FakeHome::new("gamelib-store-");
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
        let home = FakeHome::new("gamelib-store-");
        let file = seed(&home, TS_SHAPED);
        let store = StoreHost::new()
            .open_cache(&dir_of(&home), "uploadedLogs")
            .unwrap();
        assert!(!store.remove("https://dpaste.com/none").unwrap());
        assert_eq!(fs::read_to_string(&file).unwrap(), TS_SHAPED);
        assert!(store.remove("https://dpaste.com/ZZ99").unwrap());
        let text = fs::read_to_string(&file).unwrap();
        assert!(!text.contains("ZZ99") && text.contains("AA11"));
        let keys: Vec<String> = store.snapshot().into_iter().map(|(k, _)| k).collect();
        assert_eq!(keys, ["https://dpaste.com/AA11"]);
        assert!(store.remove("https://dpaste.com/AA11").unwrap());
        assert_eq!(fs::read_to_string(&file).unwrap(), "{}");
    }

    #[test]
    fn snapshot_is_in_file_order_with_a_new_key_appended_at_the_end() {
        let home = FakeHome::new("gamelib-store-");
        seed(&home, TS_SHAPED);
        let store = StoreHost::new()
            .open_cache(&dir_of(&home), "uploadedLogs")
            .unwrap();
        store.set("https://dpaste.com/AAA0", json!(1)).unwrap();
        let keys: Vec<String> = store.snapshot().into_iter().map(|(k, _)| k).collect();
        assert_eq!(
            keys,
            [
                "https://dpaste.com/ZZ99",
                "https://dpaste.com/AA11",
                "https://dpaste.com/AAA0"
            ]
        );
    }

    #[test]
    fn a_listener_fires_once_per_successful_set_and_remove_after_the_persist_and_not_for_a_no_op() {
        let home = FakeHome::new("gamelib-store-");
        let file = seed(&home, TS_SHAPED);
        let store = StoreHost::new()
            .open_cache(&dir_of(&home), "uploadedLogs")
            .unwrap();
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
        store.set("https://dpaste.com/N", json!(1)).unwrap();
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
        let home = FakeHome::new("gamelib-store-");
        let store = StoreHost::new()
            .open_cache(&dir_of(&home), "uploadedLogs")
            .unwrap();
        let again = Arc::clone(&store);
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        store.on_change(Box::new(move |_| {
            c.store(again.snapshot().len(), Ordering::SeqCst);
        }));
        store.set("k", json!(1)).unwrap();
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn when_the_rename_fails_the_content_is_written_directly_and_no_temp_file_remains() {
        let home = FakeHome::new("gamelib-store-");
        let dir = dir_of(&home);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("uploadedLogs.json");
        let mut data = IndexMap::new();
        data.insert("k".to_string(), json!({"a": 1}));
        let failing = |_: &Path, _: &Path| Err(io::Error::other("forced rename failure"));
        persist_atomic(&file, &data, &failing).unwrap();
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "{\n  \"k\": {\n    \"a\": 1\n  }\n}"
        );
        let leftovers: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }

    #[test]
    fn a_failed_persist_rolls_the_in_memory_value_back_and_fires_nothing() {
        let home = FakeHome::new("gamelib-store-");
        let dir = dir_of(&home);
        let store = StoreHost::new().open_cache(&dir, "uploadedLogs").unwrap();
        store.set("k", json!(1)).unwrap();
        // A directory where the file must go makes the temp write, the rename and the direct write fail.
        fs::remove_file(dir.join("uploadedLogs.json")).unwrap();
        fs::create_dir(dir.join("uploadedLogs.json")).unwrap();
        let fired = Arc::new(AtomicUsize::new(0));
        let f = Arc::clone(&fired);
        store.on_change(Box::new(move |_| {
            f.fetch_add(1, Ordering::SeqCst);
        }));
        assert!(store.set("k", json!(2)).is_err());
        assert!(store.set("new", json!(3)).is_err());
        assert!(store.remove("k").is_err());
        assert_eq!(store.get("k"), Some(json!(1)));
        assert_eq!(store.get("new"), None);
        assert_eq!(fired.load(Ordering::SeqCst), 0);
    }
}
