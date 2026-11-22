//! dot-prop 6 paths over `Json` (the `conf` 10.2.0 dependency the TS stores used).
//!
//! A path is split on `.`; a segment ending in a backslash joins the next one with a literal dot
//! (`a\.b` is the single key `a.b`). A path with a `__proto__`, `prototype` or `constructor`
//! segment is refused outright: `get` and `has` find nothing, `set` and `delete` change nothing.
//! `set` replaces any non-object on the way down with an object and creates new keys with
//! `Obj::insert_js`, so key order follows JS at every depth; `delete` never prunes a parent.
//!
//! With `dot_paths` false (a store opened with `accessPropertiesByDotNotation: false`) the whole
//! string is one literal key and nothing is refused: a `__proto__` key is an ordinary key, as the
//! `nodot-proto-key-is-an-ordinary-key` vector records.
//!
//! Arrays are traversed by canonical index segments. JS leaves holes when an index is set past the
//! end or deleted; `JSON.stringify` prints a hole as `null`, so the holes are `Json::Null` here.

use crate::json::{Json, Obj};

/// conf's own key, reserved for the version envelope.
const INTERNAL_KEY: &str = "__internal__";

/// The deepest path `set` will build. The parse limit is 128, and `clone`, `PartialEq` and `Drop` of
/// a document recurse, so a key with tens of thousands of segments must not make one (A-WR-04).
pub const MAX_SET_DEPTH: usize = 64;

/// The most `null` holes `set` will pad an array with to reach an index. JS leaves a sparse array
/// and `JSON.stringify` then prints the holes, so a huge index is a hostile or buggy key, and
/// materialising it would try to allocate gigabytes and abort the process (A-WR-04).
pub const MAX_SET_HOLE: usize = 1024;

/// A path segment dot-prop refuses, because it would reach the prototype chain in JS.
fn is_disallowed(segment: &str) -> bool {
    matches!(segment, "__proto__" | "prototype" | "constructor")
}

/// `getPathSegments` of dot-prop 6: `None` where dot-prop returns an empty list (a disallowed
/// segment), which makes every operation a no-op.
pub fn segments(path: &str) -> Option<Vec<String>> {
    let pieces: Vec<&str> = path.split('.').collect();
    let mut parts = Vec::with_capacity(pieces.len());
    let mut i = 0;
    while i < pieces.len() {
        let mut p = pieces[i].to_string();
        while p.ends_with('\\') && i + 1 < pieces.len() {
            p.pop();
            p.push('.');
            i += 1;
            p.push_str(pieces[i]);
        }
        parts.push(p);
        i += 1;
    }
    if parts.iter().any(|s| is_disallowed(s)) {
        None
    } else {
        Some(parts)
    }
}

fn plan(path: &str, dot_paths: bool) -> Option<Vec<String>> {
    if dot_paths {
        segments(path)
    } else {
        Some(vec![path.to_string()])
    }
}

/// The index an array segment names: a canonical non-negative decimal.
fn array_index(segment: &str) -> Option<usize> {
    let b = segment.as_bytes();
    if b.is_empty() || b.len() > 10 || !b.iter().all(u8::is_ascii_digit) {
        return None;
    }
    if b.len() > 1 && b[0] == b'0' {
        return None;
    }
    segment.parse::<u32>().ok().map(|n| n as usize)
}

fn child<'a>(node: &'a Json, segment: &str) -> Option<&'a Json> {
    match node {
        Json::Obj(o) => o.get(segment),
        Json::Arr(a) => array_index(segment).and_then(|i| a.get(i)),
        _ => None,
    }
}

fn child_mut<'a>(node: &'a mut Json, segment: &str) -> Option<&'a mut Json> {
    match node {
        Json::Obj(o) => o.get_mut(segment),
        Json::Arr(a) => array_index(segment).and_then(|i| a.get_mut(i)),
        _ => None,
    }
}

fn is_container(node: &Json) -> bool {
    matches!(node, Json::Obj(_) | Json::Arr(_))
}

/// The value at `path`, if every step finds a container to look in. A `null` leaf is a value.
pub fn get<'a>(root: &'a Json, path: &str, dot_paths: bool) -> Option<&'a Json> {
    let segs = plan(path, dot_paths)?;
    let mut cur = root;
    for seg in &segs {
        cur = child(cur, seg)?;
    }
    Some(cur)
}

/// dot-prop's `has`: the leaf key exists (whatever its value) and every step is a container.
pub fn has(root: &Json, path: &str, dot_paths: bool) -> bool {
    get(root, path, dot_paths).is_some()
}

/// Sets `path` to `value`. Returns false when the path is refused (a disallowed segment, more than
/// [`MAX_SET_DEPTH`] segments, an array index more than [`MAX_SET_HOLE`] past the array's end) or the
/// root is not a container. A refusal found mid-walk can follow the creation of the objects above it,
/// so a caller that must not change anything on a refusal works on a copy, as the host does.
pub fn set(root: &mut Json, path: &str, value: Json, dot_paths: bool) -> bool {
    let Some(segs) = plan(path, dot_paths) else {
        return false;
    };
    if segs.is_empty() || segs.len() > MAX_SET_DEPTH || !is_container(root) {
        return false;
    }
    let mut value = Some(value);
    let mut cur = root;
    for (i, seg) in segs.iter().enumerate() {
        let slot: &mut Json = match cur {
            Json::Obj(o) => {
                if !o.contains_key(seg) {
                    o.insert_js(seg.clone(), Json::Null);
                }
                match o.get_mut(seg) {
                    Some(s) => s,
                    None => return false,
                }
            }
            Json::Arr(a) => {
                let Some(idx) = array_index(seg) else {
                    // A named property on an array never reaches `JSON.stringify`.
                    return false;
                };
                if idx > a.len().saturating_add(MAX_SET_HOLE) {
                    return false;
                }
                while a.len() <= idx {
                    a.push(Json::Null);
                }
                &mut a[idx]
            }
            _ => return false,
        };
        if i + 1 == segs.len() {
            if let Some(v) = value.take() {
                *slot = v;
            }
            return true;
        }
        if !is_container(slot) {
            *slot = Json::Obj(Obj::new());
        }
        cur = slot;
    }
    true
}

/// Removes the leaf at `path`. Returns whether the walk reached the leaf's container; a missing
/// leaf is not an error and a parent is never pruned. An array element becomes a hole (`null`).
pub fn delete(root: &mut Json, path: &str, dot_paths: bool) -> bool {
    let Some(segs) = plan(path, dot_paths) else {
        return false;
    };
    let Some((leaf, parents)) = segs.split_last() else {
        return false;
    };
    let mut cur = root;
    for seg in parents {
        match child_mut(cur, seg) {
            Some(next) if is_container(next) => cur = next,
            _ => return false,
        }
    }
    match cur {
        Json::Obj(o) => {
            o.remove(leaf);
            true
        }
        Json::Arr(a) => {
            if let Some(slot) = array_index(leaf).and_then(|i| a.get_mut(i)) {
                *slot = Json::Null;
            }
            true
        }
        _ => false,
    }
}

/// conf refuses any key under `__internal__.` with a TypeError when dot paths are on. With dot
/// paths off such a key is an ordinary literal one. (The plain key `__internal__` itself is
/// refused by the object form of `set`, which the store layer owns.)
pub fn is_reserved_internal(path: &str, dot_paths: bool) -> bool {
    dot_paths
        && path
            .strip_prefix(INTERNAL_KEY)
            .is_some_and(|rest| rest.starts_with('.'))
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
    fn segments_split_on_dots_and_honour_backslash_escapes() {
        assert_eq!(
            segments("a.b.c"),
            Some(vec!["a".into(), "b".into(), "c".into()])
        );
        assert_eq!(segments("a\\.b"), Some(vec!["a.b".into()]));
        assert_eq!(segments("a\\.b.c"), Some(vec!["a.b".into(), "c".into()]));
        assert_eq!(segments(""), Some(vec!["".into()]));
        assert_eq!(segments("a."), Some(vec!["a".into(), "".into()]));
        // A trailing backslash with nothing after it stays.
        assert_eq!(segments("a\\"), Some(vec!["a\\".into()]));
    }

    #[test]
    fn the_three_prototype_segments_are_refused_anywhere_in_the_path() {
        for p in ["__proto__", "a.__proto__.x", "prototype.x", "x.constructor"] {
            assert_eq!(segments(p), None, "{p}");
        }
        assert!(segments("protos.constructors.prototype_").is_some());
    }

    #[test]
    fn a_refused_path_changes_nothing_and_finds_nothing() {
        let mut d = doc(r#"{"keep":1}"#);
        assert!(!set(&mut d, "__proto__.x", Json::Null, true));
        assert!(!delete(&mut d, "constructor.x", true));
        assert_eq!(get(&d, "__proto__", true), None);
        assert!(!has(&d, "prototype", true));
        assert_eq!(compact(&d), r#"{"keep":1}"#);
    }

    #[test]
    fn set_creates_objects_and_places_integer_segments_first() {
        let mut d = doc("{}");
        set(&mut d, "a.b", Json::Bool(true), true);
        set(&mut d, "a.2", Json::Bool(true), true);
        set(&mut d, "a.1", Json::Bool(true), true);
        assert_eq!(compact(&d), r#"{"a":{"1":true,"2":true,"b":true}}"#);
    }

    #[test]
    fn set_past_the_end_of_an_array_fills_with_holes() {
        let mut d = doc(r#"{"list":[1]}"#);
        set(&mut d, "list.3", Json::Bool(true), true);
        assert_eq!(compact(&d), r#"{"list":[1,null,null,true]}"#);
    }

    #[test]
    fn a_huge_array_index_or_a_very_deep_path_is_refused_not_allocated() {
        let one = || Json::Num(crate::json::Num::U(1));
        let mut d = doc(r#"{"list":[1,2]}"#);
        assert!(!set(&mut d, "list.4294967290", one(), true));
        assert_eq!(compact(&d), r#"{"list":[1,2]}"#);
        // A modest gap is still padded with holes.
        assert!(set(&mut d, "list.10", one(), true));

        let deep = vec!["a"; 100_000].join(".");
        let mut d = doc("{}");
        assert!(!set(&mut d, &deep, one(), true));
        assert_eq!(compact(&d), "{}");
        let at_limit = vec!["a"; MAX_SET_DEPTH].join(".");
        assert!(set(&mut d, &at_limit, one(), true));
    }

    #[test]
    fn delete_keeps_parents_and_turns_array_elements_into_holes() {
        let mut d = doc(r#"{"a":{"b":1},"l":[1,2,3]}"#);
        assert!(delete(&mut d, "a.b", true));
        assert!(delete(&mut d, "l.1", true));
        assert!(!delete(&mut d, "x.y", true));
        assert_eq!(compact(&d), r#"{"a":{},"l":[1,null,3]}"#);
    }

    #[test]
    fn with_dot_paths_off_the_whole_key_is_one_literal_segment() {
        let mut d = doc(r#"{"a":{"b":1}}"#);
        assert!(set(&mut d, "a.b", Json::Num(crate::json::Num::U(2)), false));
        assert_eq!(compact(&d), r#"{"a":{"b":1},"a.b":2}"#);
        assert!(has(&d, "a.b", false));
        assert!(!has(&d, "a.c", false));
        assert!(delete(&mut d, "a.b", false));
        assert_eq!(compact(&d), r#"{"a":{"b":1}}"#);
    }

    #[test]
    fn only_dotted_internal_keys_are_reserved_and_only_with_dot_paths() {
        assert!(is_reserved_internal("__internal__.x", true));
        assert!(!is_reserved_internal("__internal__.x", false));
        assert!(!is_reserved_internal("__internalx__.x", true));
        assert!(!is_reserved_internal("__internal__", true));
    }
}
