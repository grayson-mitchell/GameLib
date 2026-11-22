//! The version envelope and the settings version string (D-05, D-12).
//!
//! A conf store (`store/`, `store_cache/`, `gog_store/`, ...) keeps its schema version in
//! `__internal__.gamelib.schemaVersion`; the TS `storeVersionCodec` read it and `stampForWrite` put
//! it back on every write. A settings document (`config.json`, `GamesConfig/<app>.json`) keeps a
//! top-level `version: 'vN'` string instead (`settingsVersionCodec`). Both codecs are here so the
//! engine can decide a file's fate the way Phase 68 did, and so a write prints the same bytes.
//!
//! `__internal__` is the engine's namespace, never store data: `strip_envelope` is the view a caller
//! may see, and `ops` refuses any write whose first key segment is `__internal__`.

use crate::json::{Json, Obj};

/// The top-level key the version envelope lives under. A store write that names it is refused.
pub const RESERVED_KEY: &str = "__internal__";

const NAMESPACE_KEY: &str = "gamelib";
const VERSION_KEY: &str = "schemaVersion";
const SETTINGS_VERSION_KEY: &str = "version";

/// `__internal__.gamelib.schemaVersion`, or 0 when it is absent or not a non-negative integer
/// (`storeVersionCodec.read`, which also treats an invalid value as 0 and moves on).
pub fn store_version(data: &Json) -> u32 {
    let raw = data
        .get(RESERVED_KEY)
        .and_then(|i| i.get(NAMESPACE_KEY))
        .and_then(|g| g.get(VERSION_KEY));
    match raw {
        Some(Json::Num(n)) => num_to_version(n),
        _ => 0,
    }
}

/// A JS `Number.isInteger(raw) && raw >= 0` check, narrowed to what a `u32` version can hold. A
/// version beyond `u32` is clamped to `u32::MAX`, which is newer than any chain and so refused, the
/// same as `version_gate`'s codec and the TS codec (A-WR-02). Any other invalid value reads as 0.
fn num_to_version(n: &crate::json::Num) -> u32 {
    use crate::json::Num;
    match n {
        Num::U(u) => u32::try_from(*u).unwrap_or(u32::MAX),
        Num::I(i) if *i >= 0 => u32::try_from(*i).unwrap_or(u32::MAX),
        Num::I(_) => 0,
        Num::F(f) => {
            if f.is_finite() && f.fract() == 0.0 && *f >= 0.0 {
                // `as` saturates, and the `min` pins the clamp to `u32::MAX` explicitly.
                (*f).min(f64::from(u32::MAX)) as u32
            } else {
                0
            }
        }
    }
}

/// `stampForWrite`: a copy of `data` whose `__internal__.gamelib.schemaVersion` is `version`. An
/// existing `__internal__` key keeps its position and any other key inside `gamelib` survives; a
/// store with no envelope gets one appended last. A non-object `__internal__` or `gamelib` is
/// replaced, as the TS spread over a non-object does. A non-object root is returned unchanged.
pub fn stamp_for_write(data: &Json, version: u32) -> Json {
    let Json::Obj(root) = data else {
        return data.clone();
    };
    let mut out = root.clone();
    let mut internal = match out.get(RESERVED_KEY) {
        Some(Json::Obj(o)) => o.clone(),
        _ => Obj::new(),
    };
    let mut gamelib = match internal.get(NAMESPACE_KEY) {
        Some(Json::Obj(o)) => o.clone(),
        _ => Obj::new(),
    };
    gamelib.insert_js(
        VERSION_KEY,
        Json::Num(crate::json::Num::U(u64::from(version))),
    );
    internal.insert_js(NAMESPACE_KEY, Json::Obj(gamelib));
    out.insert_js(RESERVED_KEY, Json::Obj(internal));
    Json::Obj(out)
}

/// The view without the envelope: what a read may expose. A non-object is returned unchanged.
pub fn strip_envelope(data: &Json) -> Json {
    let Json::Obj(root) = data else {
        return data.clone();
    };
    let mut out = root.clone();
    out.remove(RESERVED_KEY);
    Json::Obj(out)
}

/// `parseSettingsVersion` over the top-level `version` key: `vN` or `vN.M` gives N, anything else
/// (absent, not a string, no leading `v`, a sign, an exponent) is 0.
pub fn settings_version(data: &Json) -> u32 {
    let Some(raw) = data.get(SETTINGS_VERSION_KEY).and_then(Json::as_str) else {
        return 0;
    };
    let Some(rest) = raw.strip_prefix('v') else {
        return 0;
    };
    let (major, minor) = match rest.split_once('.') {
        Some((a, b)) => (a, Some(b)),
        None => (rest, None),
    };
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    if !digits(major) || minor.is_some_and(|m| !digits(m)) {
        return 0;
    }
    // A major beyond `u32` is clamped: newer than any chain, so refused (A-WR-02).
    major
        .parse::<u64>()
        .map_or(u32::MAX, |n| u32::try_from(n).unwrap_or(u32::MAX))
}

/// `settingsVersionCodec.write`: sets the top-level `version` to `vN`, keeping an existing key's
/// place and appending a new one last. A non-object root is left alone.
pub fn set_settings_version(data: &mut Json, version: u32) {
    if let Json::Obj(o) = data {
        o.insert_js(SETTINGS_VERSION_KEY, Json::Str(format!("v{version}")));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::{parse, to_compact_bytes};

    fn doc(text: &str) -> Json {
        parse(text.as_bytes()).unwrap()
    }

    fn compact(v: &Json) -> String {
        String::from_utf8(to_compact_bytes(v)).unwrap()
    }

    #[test]
    fn store_version_reads_a_stamped_integer() {
        assert_eq!(
            store_version(&doc(r#"{"__internal__":{"gamelib":{"schemaVersion":3}}}"#)),
            3
        );
        assert_eq!(
            store_version(&doc(
                r#"{"__internal__":{"gamelib":{"schemaVersion":3.0}}}"#
            )),
            3
        );
    }

    #[test]
    fn store_version_is_zero_for_everything_else() {
        for text in [
            "{}",
            r#"{"__internal__":{}}"#,
            r#"{"__internal__":{"gamelib":{}}}"#,
            r#"{"__internal__":{"gamelib":{"schemaVersion":"x"}}}"#,
            r#"{"__internal__":{"gamelib":{"schemaVersion":-1}}}"#,
            r#"{"__internal__":{"gamelib":{"schemaVersion":1.5}}}"#,
            r#"{"__internal__":{"gamelib":{"schemaVersion":null}}}"#,
            r#"{"__internal__":7}"#,
        ] {
            assert_eq!(store_version(&doc(text)), 0, "{text}");
        }
    }

    #[test]
    fn a_version_beyond_u32_clamps_so_it_reads_as_newer() {
        for text in [
            r#"{"__internal__":{"gamelib":{"schemaVersion":99999999999}}}"#,
            r#"{"__internal__":{"gamelib":{"schemaVersion":1e20}}}"#,
        ] {
            assert_eq!(store_version(&doc(text)), u32::MAX, "{text}");
        }
        assert_eq!(
            settings_version(&doc(r#"{"version":"v99999999999"}"#)),
            u32::MAX
        );
        // A digit run beyond u64 is still just "huge", not unstamped.
        assert_eq!(
            settings_version(&doc(r#"{"version":"v99999999999999999999999"}"#)),
            u32::MAX
        );
    }

    #[test]
    fn a_new_envelope_goes_last_and_an_existing_one_keeps_its_place() {
        let appended = stamp_for_write(&doc(r#"{"a":1,"b":2}"#), 1);
        assert_eq!(
            compact(&appended),
            r#"{"a":1,"b":2,"__internal__":{"gamelib":{"schemaVersion":1}}}"#
        );
        let kept = stamp_for_write(
            &doc(r#"{"__internal__":{"gamelib":{"note":"kept","schemaVersion":1}},"a":1}"#),
            2,
        );
        assert_eq!(
            compact(&kept),
            r#"{"__internal__":{"gamelib":{"note":"kept","schemaVersion":2}},"a":1}"#
        );
    }

    #[test]
    fn a_non_object_envelope_is_replaced() {
        let stamped = stamp_for_write(&doc(r#"{"__internal__":7,"a":1}"#), 4);
        assert_eq!(
            compact(&stamped),
            r#"{"__internal__":{"gamelib":{"schemaVersion":4}},"a":1}"#
        );
    }

    #[test]
    fn strip_envelope_drops_only_the_reserved_key() {
        let view = strip_envelope(&doc(
            r#"{"a":1,"__internal__":{"gamelib":{"schemaVersion":1}},"b":2}"#,
        ));
        assert_eq!(compact(&view), r#"{"a":1,"b":2}"#);
    }

    #[test]
    fn settings_version_parses_like_parse_settings_version() {
        let v = |t: &str| settings_version(&doc(t));
        assert_eq!(v(r#"{"version":"v2"}"#), 2);
        assert_eq!(v(r#"{"version":"v12.3"}"#), 12);
        for bad in [
            "{}",
            r#"{"version":2}"#,
            r#"{"version":"2"}"#,
            r#"{"version":"v"}"#,
            r#"{"version":"vx"}"#,
            r#"{"version":"v1.x"}"#,
            r#"{"version":"v-1"}"#,
            r#"{"version":"v1.2.3"}"#,
            r#"{"version":null}"#,
        ] {
            assert_eq!(v(bad), 0, "{bad}");
        }
    }

    #[test]
    fn set_settings_version_keeps_position_or_appends() {
        let mut d = doc(r#"{"version":"v0","a":1}"#);
        set_settings_version(&mut d, 2);
        assert_eq!(compact(&d), r#"{"version":"v2","a":1}"#);
        let mut d = doc(r#"{"a":1}"#);
        set_settings_version(&mut d, 2);
        assert_eq!(compact(&d), r#"{"a":1,"version":"v2"}"#);
    }
}
