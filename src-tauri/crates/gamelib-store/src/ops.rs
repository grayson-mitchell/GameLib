//! The store operations (`set`, `delete`, `clear`, `assign`, `get`, `has`) over a whole document.
//!
//! The document is exactly what is on disk, `__internal__` envelope included, so a write keeps the
//! envelope's position and any other key inside it. The operations never let a caller reach the
//! envelope: a write whose first key segment is `__internal__` is refused with no change
//! (`typed_store`'s `refuseReservedKey`, which splits on `.` even for a store that has dot paths
//! off), and a read of that key finds nothing. Callers see `envelope::strip_envelope`.
//!
//! `apply` reports whether anything changed, but conf rewrote the file after every write whatever
//! the key held, so the host decides about the write; a refusal (`Err`) is the one case that must
//! never write.

use crate::dotpath;
use crate::envelope::RESERVED_KEY;
use crate::json::{Json, Obj};

/// One mutation of a store document.
#[derive(Debug, Clone, PartialEq)]
pub enum Op {
    Set {
        key: String,
        value: Json,
    },
    Delete {
        key: String,
    },
    /// `store.clear()`: the document becomes `{}` (the envelope is stamped back on write).
    Clear,
    /// `store.store = obj`: the whole document is replaced, `__internal__` and all.
    Replace(Obj),
}

/// Why an operation was refused. A refusal changes nothing and must not write.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpReject {
    /// The first key segment is `__internal__` (conf's TypeError in the TS stack).
    ReservedKey,
    /// dot-prop refuses the path (a `__proto__`, `prototype` or `constructor` segment).
    KeyPath,
    /// A settings document (`config.json`, `GamesConfig/<app>.json`) takes whole-document
    /// replaces only: TS writes it as one object (`writeSettingsFile`), never a key at a time.
    /// [`apply`] never returns this; the host refuses the op before it reaches the document.
    NotReplace,
}

/// The first segment of `key` as `typed_store` splits it: always on `.`, whatever `dot_paths` says.
fn is_reserved(key: &str) -> bool {
    key.split('.').next() == Some(RESERVED_KEY)
}

/// Applies `op` to `doc`. Returns whether the document changed.
pub fn apply(doc: &mut Json, op: &Op, dot_paths: bool) -> Result<bool, OpReject> {
    match op {
        Op::Set { key, value } => {
            check(key, dot_paths)?;
            let before = doc.clone();
            if !dotpath::set(doc, key, value.clone(), dot_paths) {
                return Err(OpReject::KeyPath);
            }
            Ok(*doc != before)
        }
        Op::Delete { key } => {
            check(key, dot_paths)?;
            let had = dotpath::has(doc, key, dot_paths);
            dotpath::delete(doc, key, dot_paths);
            Ok(had)
        }
        Op::Clear => {
            let changed = !doc.as_object().is_some_and(|o| o.is_empty());
            *doc = Json::Obj(Obj::new());
            Ok(changed)
        }
        Op::Replace(obj) => {
            let next = Json::Obj(obj.clone());
            let changed = *doc != next;
            *doc = next;
            Ok(changed)
        }
    }
}

fn check(key: &str, dot_paths: bool) -> Result<(), OpReject> {
    if is_reserved(key) || dotpath::is_reserved_internal(key, dot_paths) {
        return Err(OpReject::ReservedKey);
    }
    if dot_paths && dotpath::segments(key).is_none() {
        return Err(OpReject::KeyPath);
    }
    Ok(())
}

/// The value at `key`. The reserved key and everything under it reads as absent.
pub fn get<'a>(doc: &'a Json, key: &str, dot_paths: bool) -> Option<&'a Json> {
    if is_reserved(key) {
        return None;
    }
    dotpath::get(doc, key, dot_paths)
}

/// Whether `key` exists. The reserved key never does.
pub fn has(doc: &Json, key: &str, dot_paths: bool) -> bool {
    get(doc, key, dot_paths).is_some()
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

    fn set(key: &str, value: &str) -> Op {
        Op::Set {
            key: key.to_string(),
            value: doc(value),
        }
    }

    #[test]
    fn set_and_delete_use_dot_paths_when_asked() {
        let mut d = doc("{}");
        assert_eq!(apply(&mut d, &set("a.b", "1"), true), Ok(true));
        assert_eq!(compact(&d), r#"{"a":{"b":1}}"#);
        assert_eq!(
            apply(&mut d, &Op::Delete { key: "a.b".into() }, true),
            Ok(true)
        );
        assert_eq!(compact(&d), r#"{"a":{}}"#);
        assert_eq!(
            apply(&mut d, &Op::Delete { key: "a.b".into() }, true),
            Ok(false)
        );
    }

    #[test]
    fn a_store_without_dot_paths_keeps_the_dotted_key_whole() {
        let mut d = doc("{}");
        assert_eq!(apply(&mut d, &set("a.b", "1"), false), Ok(true));
        assert_eq!(compact(&d), r#"{"a.b":1}"#);
        assert!(has(&d, "a.b", false));
        assert!(!has(&d, "a", false));
    }

    #[test]
    fn a_reserved_first_segment_is_refused_with_no_change() {
        let mut d = doc(r#"{"a":1,"__internal__":{"gamelib":{"schemaVersion":1}}}"#);
        let before = d.clone();
        for key in [
            "__internal__",
            "__internal__.x",
            "__internal__.gamelib.schemaVersion",
        ] {
            for dot_paths in [true, false] {
                assert_eq!(
                    apply(&mut d, &set(key, "9"), dot_paths),
                    Err(OpReject::ReservedKey)
                );
                assert_eq!(
                    apply(&mut d, &Op::Delete { key: key.into() }, dot_paths),
                    Err(OpReject::ReservedKey)
                );
            }
        }
        assert_eq!(d, before);
    }

    #[test]
    fn a_key_that_merely_starts_with_the_reserved_name_is_ordinary() {
        let mut d = doc("{}");
        assert_eq!(apply(&mut d, &set("__internal__x", "1"), true), Ok(true));
        assert_eq!(compact(&d), r#"{"__internal__x":1}"#);
    }

    #[test]
    fn reads_never_expose_the_envelope() {
        let d = doc(r#"{"a":1,"__internal__":{"gamelib":{"schemaVersion":1}}}"#);
        assert!(get(&d, "__internal__", true).is_none());
        assert!(get(&d, "__internal__.gamelib", true).is_none());
        assert!(!has(&d, "__internal__", false));
        assert_eq!(get(&d, "a", true).map(compact), Some("1".to_string()));
    }

    #[test]
    fn a_refused_path_is_a_key_path_error() {
        let mut d = doc("{}");
        assert_eq!(
            apply(&mut d, &set("a.__proto__.x", "1"), true),
            Err(OpReject::KeyPath)
        );
        assert_eq!(compact(&d), "{}");
        assert_eq!(
            apply(
                &mut d,
                &Op::Delete {
                    key: "constructor.x".into()
                },
                true
            ),
            Err(OpReject::KeyPath)
        );
    }

    #[test]
    fn clear_and_replace_swap_the_whole_document() {
        let mut d = doc(r#"{"a":1,"b":{"c":2}}"#);
        assert_eq!(apply(&mut d, &Op::Clear, true), Ok(true));
        assert_eq!(compact(&d), "{}");
        assert_eq!(apply(&mut d, &Op::Clear, true), Ok(false));
        let Json::Obj(next) = doc(r#"{"x":1}"#) else {
            unreachable!()
        };
        assert_eq!(apply(&mut d, &Op::Replace(next.clone()), true), Ok(true));
        assert_eq!(apply(&mut d, &Op::Replace(next), true), Ok(false));
        assert_eq!(compact(&d), r#"{"x":1}"#);
    }
}
