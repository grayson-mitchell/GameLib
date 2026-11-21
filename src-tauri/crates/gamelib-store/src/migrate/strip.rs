//! The schema-derived strip (Phase 70 gaps G2/G3 in TS, `storeMigrations/schemaStrip.ts`), ported over
//! the generated descriptor instead of zod.
//!
//! Six rules, in the order the TS file states them:
//!
//! 1. Optional / nullable / default wrappers are unwrapped to find the structure; null and validity
//!    checks run against the ORIGINAL member node.
//! 2. Strict objects lose undeclared keys at every depth; `null` on a member that accepts undefined but
//!    rejects null is removed; with `drop_invalid_optional` an optional member that still fails after
//!    cleaning is removed (inner first). Required members are never removed.
//! 3. Loose objects pass through untouched.
//! 4. Arrays: every element is cleaned; with `drop_invalid_elements` an element that still fails is
//!    removed, otherwise none is dropped. Records: every value is cleaned.
//! 5. Unions: a valid value is returned as is. Otherwise pass 1 cleans each option losslessly and the
//!    first option it satisfies wins; pass 2 runs the lossy clean only on options whose literal members
//!    the value already matches, so an arm can never win by dropping the value's own discriminant.
//!    Else the value is returned unchanged.
//! 6. Everything else is returned unchanged.
//!
//! Pure and total: nothing is mutated and nothing panics. New objects are built member by member in the
//! original key order, which is the order the bytes have.
//!
//! `accepts` reproduces zod's `safeParse` verdict for the grammar the descriptor carries: a JSON value
//! is never `undefined`, so a missing key is judged by the member's `optional` flag (zod's own verdict
//! for `undefined`, recorded by the generator).

use crate::json::{Json, Obj};
use crate::schema::{Mode, Node};

/// What the strip may remove beyond undeclared keys and rejected nulls.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StripOptions {
    /// Remove an optional member whose cleaned value still fails its schema.
    pub drop_invalid_optional: bool,
    /// Remove an array element whose cleaned value still fails the element schema, keeping its valid
    /// siblings (user-state settings, where the whole array is otherwise lost).
    pub drop_invalid_elements: bool,
}

impl StripOptions {
    /// The lossless pass of rule 5: only undeclared keys and rejected nulls go.
    const LOSSLESS: StripOptions = StripOptions {
        drop_invalid_optional: false,
        drop_invalid_elements: false,
    };
}

/// zod's `safeParse(value).success` for `node`, over a JSON value (which is never `undefined`).
pub fn accepts(node: &Node, value: &Json) -> bool {
    match node {
        Node::Optional { inner } | Node::Default { inner } => accepts(inner, value),
        Node::Nullable { inner } => matches!(value, Json::Null) || accepts(inner, value),
        Node::Object { mode, members } => {
            let Json::Obj(obj) = value else { return false };
            for (key, member) in members {
                match obj.get(key) {
                    Some(v) => {
                        if !accepts(&member.node, v) {
                            return false;
                        }
                    }
                    None if member.optional => {}
                    None => return false,
                }
            }
            *mode == Mode::Loose || obj.iter().all(|(k, _)| members.contains_key(k))
        }
        Node::Array { element, min, max } => {
            let Json::Arr(items) = value else {
                return false;
            };
            min.map_or(true, |m| items.len() >= m)
                && max.map_or(true, |m| items.len() <= m)
                && items.iter().all(|i| accepts(element, i))
        }
        Node::Record { value: member } => match value {
            Json::Obj(obj) => obj.iter().all(|(_, v)| accepts(member, v)),
            _ => false,
        },
        Node::Union { options } => options.iter().any(|o| accepts(o, value)),
        Node::Literal { value: want } => value.as_str() == Some(want.as_str()),
        Node::Enum { values } => value
            .as_str()
            .is_some_and(|s| values.iter().any(|v| v == s)),
        Node::String { min, max } => match value {
            // zod counts UTF-16 code units.
            Json::Str(s) => {
                let len = s.encode_utf16().count();
                min.map_or(true, |m| len >= m) && max.map_or(true, |m| len <= m)
            }
            _ => false,
        },
        Node::Number => matches!(value, Json::Num(_)),
        Node::Boolean => matches!(value, Json::Bool(_)),
        Node::Null => matches!(value, Json::Null),
    }
}

fn unwrap(mut node: &Node) -> &Node {
    while let Node::Optional { inner } | Node::Nullable { inner } | Node::Default { inner } = node {
        node = inner;
    }
    node
}

/// True unless `value` carries a present member that the option declares as a literal and the value's
/// member is a different literal. Non-object options always match.
fn literal_members_match(option: &Node, value: &Json) -> bool {
    let Node::Object { members, .. } = unwrap(option) else {
        return true;
    };
    let Json::Obj(obj) = value else { return true };
    members.iter().all(|(key, member)| {
        let literal = unwrap(&member.node);
        if !matches!(literal, Node::Literal { .. }) {
            return true;
        }
        obj.get(key).map_or(true, |v| accepts(literal, v))
    })
}

fn clean_object(
    value: &Obj,
    members: &std::collections::HashMap<String, crate::schema::Member>,
    opts: StripOptions,
) -> Json {
    let mut out = Obj::new();
    for (key, raw) in value.iter() {
        let Some(member) = members.get(key) else {
            continue;
        };
        if matches!(raw, Json::Null) && member.optional && !accepts(&member.node, &Json::Null) {
            continue;
        }
        let cleaned = clean(raw, &member.node, opts);
        if opts.drop_invalid_optional && member.optional && !accepts(&member.node, &cleaned) {
            continue;
        }
        out.insert_js(key.clone(), cleaned);
    }
    Json::Obj(out)
}

fn clean(value: &Json, node: &Node, opts: StripOptions) -> Json {
    match unwrap(node) {
        Node::Object { mode, members } => match value {
            Json::Obj(obj) if *mode == Mode::Strict => clean_object(obj, members, opts),
            _ => value.clone(),
        },
        Node::Array { element, .. } => {
            let Json::Arr(items) = value else {
                return value.clone();
            };
            let cleaned = items.iter().map(|i| clean(i, element, opts));
            Json::Arr(if opts.drop_invalid_elements {
                cleaned.filter(|i| accepts(element, i)).collect()
            } else {
                cleaned.collect()
            })
        }
        Node::Record { value: member } => {
            let Json::Obj(obj) = value else {
                return value.clone();
            };
            let mut out = Obj::new();
            for (k, v) in obj.iter() {
                out.insert_js(k.clone(), clean(v, member, opts));
            }
            Json::Obj(out)
        }
        union @ Node::Union { options } => {
            if accepts(union, value) {
                return value.clone();
            }
            // Pass 1 (lossless): only undeclared keys and rejected nulls go, so an arm whose own
            // discriminant the value carries wins before any arm that would drop that discriminant.
            for option in options {
                let cleaned = clean(value, option, StripOptions::LOSSLESS);
                if accepts(option, &cleaned) {
                    return cleaned;
                }
            }
            // Pass 2 (lossy): only arms whose literal members the value already satisfies, so a
            // `type: 'dlc'` value can never be rewritten into the `type: 'basic'` arm.
            for option in options {
                if !literal_members_match(option, value) {
                    continue;
                }
                let cleaned = clean(value, option, opts);
                if accepts(option, &cleaned) {
                    return cleaned;
                }
            }
            value.clone()
        }
        _ => value.clone(),
    }
}

/// `value` cleaned against `node` under `opts`. The caller checks validity afterwards with `accepts`;
/// the strip never repairs a required member.
pub fn strip(node: &Node, value: &Json, opts: StripOptions) -> Json {
    clean(value, node, opts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::{parse, to_compact_bytes};

    fn node(json: &str) -> Node {
        serde_json::from_str(json).expect("node")
    }

    fn doc(json: &str) -> Json {
        parse(json.as_bytes()).expect("json")
    }

    fn text(v: &Json) -> String {
        String::from_utf8(to_compact_bytes(v)).unwrap()
    }

    const KEEP: StripOptions = StripOptions {
        drop_invalid_optional: false,
        drop_invalid_elements: false,
    };
    const LOSSY: StripOptions = StripOptions {
        drop_invalid_optional: true,
        drop_invalid_elements: true,
    };

    /// `{ a: string (required), b: number?, c: string? }`, strict.
    fn strict_abc() -> Node {
        node(
            r#"{"kind":"object","mode":"strict","members":{
              "a":{"optional":false,"node":{"kind":"string"}},
              "b":{"optional":true,"node":{"kind":"optional","inner":{"kind":"number"}}},
              "c":{"optional":true,"node":{"kind":"optional","inner":{"kind":"string","max":3}}}}}"#,
        )
    }

    #[test]
    fn a_strict_object_loses_undeclared_keys_and_keeps_the_order() {
        let n = strict_abc();
        let out = strip(&n, &doc(r#"{"z":1,"c":"x","a":"s","y":2,"b":3}"#), KEEP);
        assert_eq!(text(&out), r#"{"c":"x","a":"s","b":3}"#);
    }

    #[test]
    fn null_goes_from_an_optional_member_that_rejects_null_and_stays_where_null_is_valid() {
        let n = strict_abc();
        let out = strip(&n, &doc(r#"{"a":"s","b":null}"#), KEEP);
        assert_eq!(text(&out), r#"{"a":"s"}"#);
        // A required member is never removed, null or not.
        let out = strip(&n, &doc(r#"{"a":null}"#), LOSSY);
        assert_eq!(text(&out), r#"{"a":null}"#);
        let nullable = node(
            r#"{"kind":"object","mode":"strict","members":{"f":{"optional":true,
              "node":{"kind":"optional","inner":{"kind":"nullable","inner":{"kind":"string"}}}}}}"#,
        );
        let out = strip(&nullable, &doc(r#"{"f":null}"#), LOSSY);
        assert_eq!(text(&out), r#"{"f":null}"#);
    }

    #[test]
    fn an_invalid_optional_member_goes_only_with_the_option() {
        let n = strict_abc();
        let bad = doc(r#"{"a":"s","c":"toolong","b":"x"}"#);
        assert_eq!(
            text(&strip(&n, &bad, KEEP)),
            r#"{"a":"s","c":"toolong","b":"x"}"#
        );
        assert_eq!(text(&strip(&n, &bad, LOSSY)), r#"{"a":"s"}"#);
    }

    #[test]
    fn a_loose_object_and_a_non_object_pass_through() {
        let loose = node(
            r#"{"kind":"object","mode":"loose","members":{"a":{"optional":false,"node":{"kind":"string"}}}}"#,
        );
        let v = doc(r#"{"a":1,"zzz":[1]}"#);
        assert_eq!(strip(&loose, &v, LOSSY), v);
        let n = strict_abc();
        assert_eq!(strip(&n, &doc("[1]"), LOSSY), doc("[1]"));
        assert_eq!(strip(&n, &doc("\"s\""), LOSSY), doc("\"s\""));
    }

    #[test]
    fn arrays_clean_every_element_and_drop_invalid_ones_only_on_request() {
        let arr = node(
            r#"{"kind":"array","element":{"kind":"object","mode":"strict","members":{
              "k":{"optional":false,"node":{"kind":"string"}}}}}"#,
        );
        let v = doc(r#"[{"k":"a","x":1},{"x":2},{"k":"b"}]"#);
        assert_eq!(text(&strip(&arr, &v, KEEP)), r#"[{"k":"a"},{},{"k":"b"}]"#);
        assert_eq!(text(&strip(&arr, &v, LOSSY)), r#"[{"k":"a"},{"k":"b"}]"#);
    }

    #[test]
    fn records_clean_every_value() {
        let rec = node(
            r#"{"kind":"record","value":{"kind":"object","mode":"strict","members":{
              "n":{"optional":false,"node":{"kind":"number"}}}}}"#,
        );
        let out = strip(&rec, &doc(r#"{"b":{"n":1,"q":0},"a":{"n":2}}"#), KEEP);
        assert_eq!(text(&out), r#"{"b":{"n":1},"a":{"n":2}}"#);
    }

    /// `basic | altExe`, both strict, `type` a literal member.
    fn launch_options() -> Node {
        node(
            r#"{"kind":"union","options":[
              {"kind":"object","mode":"strict","members":{
                "type":{"optional":true,"node":{"kind":"optional","inner":{"kind":"literal","value":"basic"}}},
                "name":{"optional":false,"node":{"kind":"string"}}}},
              {"kind":"object","mode":"strict","members":{
                "type":{"optional":false,"node":{"kind":"literal","value":"altExe"}},
                "executable":{"optional":false,"node":{"kind":"string"}}}}]}"#,
        )
    }

    #[test]
    fn a_union_returns_a_valid_value_as_is_and_the_first_lossless_arm_otherwise() {
        let n = launch_options();
        let valid = doc(r#"{"name":"x"}"#);
        assert_eq!(strip(&n, &valid, LOSSY), valid);
        // Pass 1: the altExe arm wins with its own discriminant before the basic arm can drop it.
        let alt = doc(r#"{"type":"altExe","executable":"/g","extra":1}"#);
        assert_eq!(
            text(&strip(&n, &alt, LOSSY)),
            r#"{"type":"altExe","executable":"/g"}"#
        );
        // Neither arm is satisfied: unchanged.
        let none = doc(r#"{"type":"nope"}"#);
        assert_eq!(strip(&n, &none, LOSSY), none);
    }

    #[test]
    fn the_lossy_union_pass_never_rewrites_a_value_into_an_arm_with_another_literal() {
        // `type: 'altExe'` with a bad executable: dropping it cannot make the basic arm win.
        let n = node(
            r#"{"kind":"union","options":[
              {"kind":"object","mode":"strict","members":{
                "type":{"optional":true,"node":{"kind":"optional","inner":{"kind":"literal","value":"basic"}}},
                "name":{"optional":true,"node":{"kind":"optional","inner":{"kind":"string"}}}}},
              {"kind":"object","mode":"strict","members":{
                "type":{"optional":false,"node":{"kind":"literal","value":"altExe"}},
                "executable":{"optional":true,"node":{"kind":"optional","inner":{"kind":"string","max":2}}}}}]}"#,
        );
        let v = doc(r#"{"type":"altExe","executable":"/toolong"}"#);
        // Pass 1 cannot satisfy either arm; pass 2 skips the basic arm (its literal differs) and the
        // altExe arm drops the invalid optional `executable`.
        assert_eq!(text(&strip(&n, &v, LOSSY)), r#"{"type":"altExe"}"#);
    }

    #[test]
    fn accepts_follows_the_zod_verdicts() {
        let n = strict_abc();
        assert!(accepts(&n, &doc(r#"{"a":"s"}"#)));
        assert!(!accepts(&n, &doc(r#"{}"#)), "a required member is missing");
        assert!(!accepts(&n, &doc(r#"{"a":"s","z":1}"#)), "strict rejects");
        assert!(!accepts(&n, &doc(r#"{"a":"s","b":null}"#)));
        assert!(!accepts(&n, &doc(r#"[]"#)));
        // `max` counts UTF-16 code units: one astral character is two.
        assert!(accepts(&n, &doc("{\"a\":\"s\",\"c\":\"ab\"}")));
        assert!(!accepts(
            &n,
            &doc("{\"a\":\"s\",\"c\":\"a\u{1F600}\u{1F600}\"}")
        ));
        let e = node(r#"{"kind":"enum","values":["x","y"]}"#);
        assert!(accepts(&e, &doc("\"x\"")) && !accepts(&e, &doc("\"z\"")));
        let a = node(r#"{"kind":"array","element":{"kind":"number"},"min":1,"max":2}"#);
        assert!(
            !accepts(&a, &doc("[]")) && accepts(&a, &doc("[1]")) && !accepts(&a, &doc("[1,2,3]"))
        );
    }
}
