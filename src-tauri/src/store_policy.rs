//! The renderer store policy in Rust (Phase 85, plan 85-16, FND-06): which store fields the
//! renderer may read or write, which key paths are hostile, which cache store names are
//! recognised, the eager/lazy store tiers and the read-only notice areas.
//!
//! One source for both sides (T-85-42): the data is `src/common/types/ipc/storeChannels.json`,
//! compiled in here with `include_str!` and read by `src/common/types/storePolicy.ts` on the TS
//! side. The functions are ports of the TS ones (`isSafeKeyPath`, `isAllowedStoreField`,
//! `isWritableStoreField`, `filterStoreSnapshot`), and both run those rows of
//! `src/common/__fixtures__/storePolicyVectors.json` (the tests below here, the jest suite
//! `storePolicyVectors.test.ts` there). `area_for_store_key` has had no TS counterpart since the
//! TS read-only aggregate was deleted (85-24): its `area` rows are asserted here only.
//!
//! Every lookup is an own-key lookup in a `HashMap`, so a store name such as `constructor` or
//! `__proto__` is simply absent (the CR-02 fail-closed property the TS gets from `hasOwnProperty`).

use std::collections::HashMap;
use std::sync::OnceLock;

use gamelib_store::json::Json;
use serde::Deserialize;
use serde_json::{Map, Value};

const STORE_CHANNELS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/common/types/ipc/storeChannels.json"
));

/// The store-version namespace (Phase 68): never read by or written from the renderer.
const RESERVED_KEY: &str = "__internal__";

/// Key path segments that may never appear in a store key (CR-01, `dot-prop`'s disallowed keys).
#[cfg_attr(not(test), allow(dead_code))] // the write choke point (85-17) is its first caller
const DISALLOWED_KEY_PATH_SEGMENTS: [&str; 3] = ["__proto__", "prototype", "constructor"];

/// The pattern `storeChannels.json` names for a dynamic store name. The Rust check is written out
/// in [`is_plausible_cache_name`]; a test pins the file's pattern to this text so a change there
/// cannot leave the port behind.
#[cfg(test)]
const CACHE_STORE_NAME_PATTERN: &str = "^[A-Za-z0-9_-]{1,64}$";

/// A store's read policy: every top-level key (`"*"`) or the listed keys.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub(crate) enum FieldPolicy {
    All(Wildcard),
    Listed(Vec<String>),
}

/// The literal `"*"`; any other string fails to parse, so a typo is a build defect, not a
/// silently open store.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Wildcard;

impl<'de> Deserialize<'de> for Wildcard {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Wildcard, D::Error> {
        let s = String::deserialize(d)?;
        if s == "*" {
            Ok(Wildcard)
        } else {
            Err(serde::de::Error::custom(
                "a store policy string must be \"*\"",
            ))
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AreaPrefix {
    prefix: String,
    area: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadOnlyAreas {
    by_key: HashMap<String, String>,
    by_prefix: Vec<AreaPrefix>,
    fallback: String,
}

/// `storeChannels.json`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct StorePolicy {
    store_allowlist: HashMap<String, FieldPolicy>,
    #[cfg_attr(not(test), allow(dead_code))] // read by the write choke point (85-17)
    write_denied_fields: HashMap<String, Vec<String>>,
    denied_cache_stores: Vec<String>,
    recognized_cache_store_names: Vec<String>,
    #[cfg_attr(not(test), allow(dead_code))]
    cache_store_name_pattern: String,
    boot_set_stores: Vec<String>,
    lazy_stores: Vec<String>,
    read_only_areas: ReadOnlyAreas,
}

/// The policy compiled into the shell, parsed once. A file that does not parse is a build defect.
pub(crate) fn policy() -> &'static StorePolicy {
    static POLICY: OnceLock<StorePolicy> = OnceLock::new();
    POLICY.get_or_init(|| {
        serde_json::from_str(STORE_CHANNELS_JSON)
            .unwrap_or_else(|e| panic!("storeChannels.json does not parse: {e}"))
    })
}

fn first_segment(key: &str) -> &str {
    key.split('.').next().unwrap_or_default()
}

/// `true` iff no dot-segment of `key` is `__proto__`, `prototype` or `constructor`.
#[cfg_attr(not(test), allow(dead_code))] // the write choke point (85-17) is its first caller
pub(crate) fn is_safe_key_path(key: &str) -> bool {
    !key.split('.')
        .any(|segment| DISALLOWED_KEY_PATH_SEGMENTS.contains(&segment))
}

/// A syntactically plausible dynamic store name: 1-64 characters, each `[A-Za-z0-9_-]`.
pub(crate) fn is_plausible_cache_name(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

impl StorePolicy {
    /// The store is denied wholesale (`humble_library`).
    pub(crate) fn is_denied(&self, store: &str) -> bool {
        self.denied_cache_stores.iter().any(|s| s == store)
    }

    /// A recognised cache store name, the denied one included (the TS `RECOGNIZED_CACHE_STORE_NAMES`).
    pub(crate) fn is_recognized_cache(&self, store: &str) -> bool {
        self.recognized_cache_store_names.iter().any(|s| s == store)
    }

    /// The renderer may read some field of this store: it has an allow-list entry, or it is a
    /// recognised cache store that is not denied.
    pub(crate) fn is_readable_store(&self, store: &str) -> bool {
        if self.is_denied(store) {
            return false;
        }
        self.store_allowlist.contains_key(store) || self.is_recognized_cache(store)
    }

    /// The recognised cache store names, in declared order.
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn recognized_cache_store_names(&self) -> &[String] {
        &self.recognized_cache_store_names
    }

    /// The eager tier, in declared order.
    pub(crate) fn boot_set_stores(&self) -> &[String] {
        &self.boot_set_stores
    }

    /// The lazy tier, in declared order.
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn lazy_stores(&self) -> &[String] {
        &self.lazy_stores
    }
}

/// `isAllowedStoreField`: FAIL CLOSED. A denied store, the `__internal__` namespace and an unknown
/// store are refused; a `"*"` store allows every key; otherwise the key's first dot-segment must be
/// listed.
pub(crate) fn is_allowed_store_field(store: &str, key: &str) -> bool {
    let p = policy();
    if p.is_denied(store) {
        return false;
    }
    if first_segment(key) == RESERVED_KEY {
        return false;
    }
    match p.store_allowlist.get(store) {
        None => p.is_recognized_cache(store),
        Some(FieldPolicy::All(_)) => true,
        Some(FieldPolicy::Listed(keys)) => {
            let top = first_segment(key);
            keys.iter().any(|k| k == top)
        }
    }
}

/// `isWritableStoreField`: readable, a safe key path, and not write-denied.
#[cfg_attr(not(test), allow(dead_code))] // the write choke point (85-17) is its first caller
pub(crate) fn is_writable_store_field(store: &str, key: &str) -> bool {
    if !is_allowed_store_field(store, key) || !is_safe_key_path(key) {
        return false;
    }
    match policy().write_denied_fields.get(store) {
        None => true,
        Some(denied) => {
            let top = first_segment(key);
            !denied.iter().any(|k| k == top)
        }
    }
}

/// `filterStoreSnapshot`: a new object holding only the entries of a store snapshot whose top-level
/// key the renderer may read. Only the kept values are converted.
pub(crate) fn filter_store_snapshot(store: &str, raw: &[(String, Json)]) -> Map<String, Value> {
    let mut out = Map::new();
    for (key, value) in raw {
        if is_allowed_store_field(store, key) {
            out.insert(key.clone(), value.to_value());
        }
    }
    out
}

/// `areaForStoreKey`: the read-only notice area of a store key: an exact key, else the first
/// matching prefix, else the fallback (`app-data`).
pub(crate) fn area_for_store_key(store_key: &str) -> &'static str {
    let areas = &policy().read_only_areas;
    if let Some(area) = areas.by_key.get(store_key) {
        return area;
    }
    areas
        .by_prefix
        .iter()
        .find(|p| store_key.starts_with(&p.prefix))
        .map_or(areas.fallback.as_str(), |p| p.area.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const VECTORS: &str = include_str!("../../src/common/__fixtures__/storePolicyVectors.json");
    const READ_ONLY_TYPES: &str = include_str!("../../src/common/types/readOnlyStores.ts");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).expect("storePolicyVectors.json parses")
    }

    fn rows(key: &str) -> Vec<Value> {
        let rows = vectors()[key]
            .as_array()
            .unwrap_or_else(|| panic!("{key} is an array"))
            .clone();
        assert!(!rows.is_empty(), "{key} has no vectors");
        rows
    }

    fn s<'a>(row: &'a Value, field: &str) -> &'a str {
        row[field]
            .as_str()
            .unwrap_or_else(|| panic!("{field} is a string in {row}"))
    }

    fn b(row: &Value, field: &str) -> bool {
        row[field]
            .as_bool()
            .unwrap_or_else(|| panic!("{field} is a bool in {row}"))
    }

    #[test]
    fn store_policy_every_read_vector_passes() {
        for row in rows("read") {
            assert_eq!(
                is_allowed_store_field(s(&row, "store"), s(&row, "key")),
                b(&row, "allowed"),
                "read {row}"
            );
        }
    }

    #[test]
    fn store_policy_every_write_vector_passes() {
        for row in rows("write") {
            assert_eq!(
                is_writable_store_field(s(&row, "store"), s(&row, "key")),
                b(&row, "allowed"),
                "write {row}"
            );
        }
    }

    #[test]
    fn store_policy_every_key_path_vector_passes() {
        for row in rows("keyPath") {
            assert_eq!(
                is_safe_key_path(s(&row, "key")),
                b(&row, "safe"),
                "keyPath {row}"
            );
        }
    }

    #[test]
    fn store_policy_every_cache_name_vector_passes() {
        let p = policy();
        for row in rows("cacheName") {
            let name = s(&row, "name");
            assert_eq!(
                is_plausible_cache_name(name) && p.is_recognized_cache(name),
                b(&row, "accepted"),
                "cacheName {row}"
            );
        }
    }

    #[test]
    fn store_policy_every_area_vector_passes() {
        for row in rows("area") {
            assert_eq!(
                area_for_store_key(s(&row, "storeKey")),
                s(&row, "area"),
                "area {row}"
            );
        }
    }

    #[test]
    fn store_policy_the_refresh_token_is_never_readable_or_writable() {
        assert!(!is_allowed_store_field("steamConfigStore", "refreshToken"));
        assert!(!is_allowed_store_field(
            "steamConfigStore",
            "refreshToken.x"
        ));
        assert!(!is_writable_store_field("steamConfigStore", "refreshToken"));
        assert!(!is_allowed_store_field("humbleConfigStore", "csrfToken"));
        assert!(!is_allowed_store_field("gogConfigStore", "credentials"));
    }

    #[test]
    fn store_policy_prototype_names_are_unknown_stores() {
        for name in ["constructor", "toString", "__proto__", "hasOwnProperty"] {
            assert!(!is_allowed_store_field(name, "x"), "{name}");
            assert!(!policy().is_readable_store(name), "{name}");
        }
    }

    #[test]
    fn store_policy_filter_drops_internal_and_unlisted_fields_and_denied_stores() {
        let raw = entries(&[
            ("isLoggedIn", json!(true)),
            ("refreshToken", json!("steam:v1:secret")),
            ("__internal__", json!({"gamelib": {"version": 1}})),
            ("userData", json!({"name": "x"})),
        ]);
        let out = filter_store_snapshot("steamConfigStore", &raw);
        assert_eq!(
            Value::Object(out),
            json!({"isLoggedIn": true, "userData": {"name": "x"}})
        );
        let star = filter_store_snapshot(
            "timestampStore",
            &entries(&[("480", json!(1)), ("__internal__", json!(2))]),
        );
        assert_eq!(Value::Object(star), json!({"480": 1}));
        let denied = filter_store_snapshot("humble_library", &entries(&[("a", json!(1))]));
        assert!(denied.is_empty());
        let cache = filter_store_snapshot("steam_library", &entries(&[("games", json!([]))]));
        assert_eq!(Value::Object(cache), json!({"games": []}));
    }

    fn entries(pairs: &[(&str, Value)]) -> Vec<(String, Json)> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), Json::from(v.clone())))
            .collect()
    }

    #[test]
    fn store_policy_the_file_pattern_is_the_one_the_port_implements() {
        assert_eq!(policy().cache_store_name_pattern, CACHE_STORE_NAME_PATTERN);
    }

    #[test]
    fn store_policy_tiers_are_disjoint_and_every_tier_store_is_readable() {
        let p = policy();
        assert!(!p.boot_set_stores().is_empty());
        assert!(!p.lazy_stores().is_empty());
        for name in p.boot_set_stores() {
            assert!(!p.lazy_stores().contains(name), "{name} in both tiers");
            assert!(p.is_readable_store(name), "{name}");
        }
        for name in p.lazy_stores() {
            assert!(p.is_readable_store(name), "{name}");
        }
        assert!(!p.is_readable_store("humble_library"));
    }

    #[test]
    fn store_policy_every_area_is_in_the_closed_set() {
        let p = policy();
        let mut areas: Vec<&str> = p
            .read_only_areas
            .by_key
            .values()
            .map(String::as_str)
            .collect();
        areas.extend(p.read_only_areas.by_prefix.iter().map(|x| x.area.as_str()));
        areas.push(&p.read_only_areas.fallback);
        for area in areas {
            assert!(
                READ_ONLY_TYPES.contains(&format!("'{area}'")),
                "{area} is not in READ_ONLY_AREAS"
            );
        }
    }

    #[test]
    fn store_policy_a_wildcard_must_be_a_star() {
        let bad: Result<FieldPolicy, _> = serde_json::from_str("\"all\"");
        assert!(bad.is_err());
        let good: FieldPolicy = serde_json::from_str("\"*\"").unwrap();
        assert_eq!(good, FieldPolicy::All(Wildcard));
    }
}
