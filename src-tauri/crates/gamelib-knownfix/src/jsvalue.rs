//! A parsed JSON value that keeps what `JSON.parse` keeps and `serde_json::Value` does not: the
//! enumeration order of an object's keys.
//!
//! `serde_json`'s `preserve_order` feature must stay OFF in this workspace (`gamelib-store` explains
//! why: Cargo feature unification would reorder every crate's output). Without it a `Value` object
//! iterates sorted, but the known-fix readers walk a fix file's keys in the order a JavaScript
//! `Object.entries` would give them, because the warning for each ignored key is logged in that order
//! and the goldens record it. So a fix file is parsed into this type instead, and converted to a plain
//! `Value` only for the keys that are kept.
//!
//! The order is JavaScript's own: keys that are canonical array indices (`"0"`, `"7"`, never `"07"`)
//! come first in ascending numeric order, every other key follows in first-insertion order, and a key
//! repeated in the text keeps its first position with its last value.

use std::fmt;

use serde::de::{Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};

/// One parsed JSON value, objects as ordered entries.
#[derive(Debug, Clone, PartialEq)]
pub enum JsValue {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
    Array(Vec<JsValue>),
    Object(Vec<(String, JsValue)>),
}

impl JsValue {
    /// Parses JSON text. The error is `serde_json`'s own message (line and column, never a path).
    pub fn parse(text: &str) -> Result<JsValue, serde_json::Error> {
        serde_json::from_str(text)
    }

    /// Wraps an already parsed `Value`. Object keys come out in `Value`'s (sorted) order, then in
    /// JavaScript's integer-first order: a case file read through `serde_json` has already lost its
    /// own order, so only text goes through [`JsValue::parse`] when order matters.
    pub fn from_value(value: &Value) -> JsValue {
        match value {
            Value::Null => JsValue::Null,
            Value::Bool(b) => JsValue::Bool(*b),
            Value::Number(n) => JsValue::Number(n.clone()),
            Value::String(s) => JsValue::String(s.clone()),
            Value::Array(items) => JsValue::Array(items.iter().map(JsValue::from_value).collect()),
            Value::Object(map) => JsValue::Object(js_order(
                map.iter()
                    .map(|(k, v)| (k.clone(), JsValue::from_value(v)))
                    .collect(),
            )),
        }
    }

    /// The same value as a plain `Value`.
    pub fn to_value(&self) -> Value {
        match self {
            JsValue::Null => Value::Null,
            JsValue::Bool(b) => Value::Bool(*b),
            JsValue::Number(n) => Value::Number(n.clone()),
            JsValue::String(s) => Value::String(s.clone()),
            JsValue::Array(items) => Value::Array(items.iter().map(JsValue::to_value).collect()),
            JsValue::Object(entries) => {
                let mut map = Map::new();
                for (key, value) in entries {
                    map.insert(key.clone(), value.to_value());
                }
                Value::Object(map)
            }
        }
    }

    /// `JSON.stringify(value)`: no whitespace, object keys in the stored order.
    pub fn stringify(&self) -> String {
        let mut out = String::new();
        self.write_to(&mut out);
        out
    }

    fn write_to(&self, out: &mut String) {
        match self {
            JsValue::Null => out.push_str("null"),
            JsValue::Bool(true) => out.push_str("true"),
            JsValue::Bool(false) => out.push_str("false"),
            JsValue::Number(n) => out.push_str(&number_text(n)),
            JsValue::String(s) => out.push_str(&string_text(s)),
            JsValue::Array(items) => {
                out.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    item.write_to(out);
                }
                out.push(']');
            }
            JsValue::Object(entries) => {
                out.push('{');
                for (i, (key, value)) in entries.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    out.push_str(&string_text(key));
                    out.push(':');
                    value.write_to(out);
                }
                out.push('}');
            }
        }
    }
}

/// A string as `JSON.stringify` writes it: the same escapes `serde_json` uses (`\"`, `\\`, `\b`, `\f`,
/// `\n`, `\r`, `\t`, lower-case `\u00xx` for the other controls), everything else as is.
fn string_text(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}

/// A number as `JSON.stringify` writes it: an integral value prints without a fraction (`1.0` is `1`,
/// `-0` is `0`), anything else as the shortest round-trip text `serde_json` gives.
fn number_text(n: &Number) -> String {
    if let Some(i) = n.as_i64() {
        return i.to_string();
    }
    if let Some(u) = n.as_u64() {
        return u.to_string();
    }
    match n.as_f64() {
        Some(0.0) => "0".to_string(),
        Some(f) if f.is_finite() && f.fract() == 0.0 && f.abs() < 1e21 => format!("{f:.0}"),
        _ => n.to_string(),
    }
}

/// Whether `key` is a canonical array index: a decimal `u32` below `2^32 - 1` with no leading zero.
fn is_array_index(key: &str) -> Option<u32> {
    let n: u32 = key.parse().ok()?;
    (n != u32::MAX && n.to_string() == key).then_some(n)
}

/// JavaScript's own-key order: array indices ascending, then the rest as given.
fn js_order(entries: Vec<(String, JsValue)>) -> Vec<(String, JsValue)> {
    let (mut indexed, rest): (Vec<_>, Vec<_>) = entries
        .into_iter()
        .partition(|(key, _)| is_array_index(key).is_some());
    indexed.sort_by_key(|(key, _)| is_array_index(key));
    indexed.extend(rest);
    indexed
}

impl<'de> Deserialize<'de> for JsValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<JsValue, D::Error> {
        deserializer.deserialize_any(JsVisitor)
    }
}

struct JsVisitor;

impl<'de> Visitor<'de> for JsVisitor {
    type Value = JsValue;

    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("any JSON value")
    }

    fn visit_bool<E>(self, v: bool) -> Result<JsValue, E> {
        Ok(JsValue::Bool(v))
    }

    fn visit_i64<E>(self, v: i64) -> Result<JsValue, E> {
        Ok(JsValue::Number(v.into()))
    }

    fn visit_u64<E>(self, v: u64) -> Result<JsValue, E> {
        Ok(JsValue::Number(v.into()))
    }

    fn visit_f64<E>(self, v: f64) -> Result<JsValue, E> {
        Ok(Number::from_f64(v).map_or(JsValue::Null, JsValue::Number))
    }

    fn visit_str<E>(self, v: &str) -> Result<JsValue, E> {
        Ok(JsValue::String(v.to_string()))
    }

    fn visit_string<E>(self, v: String) -> Result<JsValue, E> {
        Ok(JsValue::String(v))
    }

    fn visit_none<E>(self) -> Result<JsValue, E> {
        Ok(JsValue::Null)
    }

    fn visit_unit<E>(self) -> Result<JsValue, E> {
        Ok(JsValue::Null)
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<JsValue, A::Error> {
        let mut items = Vec::new();
        while let Some(item) = seq.next_element::<JsValue>()? {
            items.push(item);
        }
        Ok(JsValue::Array(items))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<JsValue, A::Error> {
        let mut entries: Vec<(String, JsValue)> = Vec::new();
        while let Some(key) = map.next_key::<String>()? {
            let value = map.next_value::<JsValue>()?;
            match entries.iter_mut().find(|(existing, _)| *existing == key) {
                Some(slot) => slot.1 = value,
                None => entries.push((key, value)),
            }
        }
        Ok(JsValue::Object(js_order(entries)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_keep_javascript_order_and_a_repeated_key_keeps_its_first_place() {
        let v = JsValue::parse(r#"{"b":1,"2":true,"a":2,"1":false,"b":3,"01":0}"#).unwrap();
        let JsValue::Object(entries) = &v else {
            panic!("object")
        };
        let keys: Vec<&str> = entries.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(keys, ["1", "2", "b", "a", "01"]);
        assert_eq!(entries[2].1, JsValue::Number(3.into()));
    }

    #[test]
    fn stringify_matches_json_stringify() {
        let v = JsValue::parse(
            r#" { "z" : [1, 1.0, -0.0, 2.5, "a\u0000\n\"", null, true], "a" : {} } "#,
        )
        .unwrap();
        assert_eq!(
            v.stringify(),
            r#"{"z":[1,1,0,2.5,"a\u0000\n\"",null,true],"a":{}}"#
        );
    }

    #[test]
    fn a_non_object_top_level_parses_and_a_bad_text_is_an_error() {
        assert_eq!(
            JsValue::parse("[1]").unwrap().to_value(),
            serde_json::json!([1])
        );
        assert_eq!(JsValue::parse("5").unwrap().stringify(), "5");
        assert!(JsValue::parse("{ not json").is_err());
        assert!(JsValue::parse("").is_err());
        assert!(JsValue::parse("\u{feff}{}").is_err());
    }
}
