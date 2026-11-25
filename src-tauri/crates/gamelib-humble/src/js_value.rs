//! A JSON value that keeps what the TypeScript's `JSON.parse` keeps and `serde_json::Value` does not.
//!
//! The classifier's diagnostics list the field names of a Humble order (`Object.keys`), in the order
//! JavaScript reports them: integer-like keys ascending first, then the rest in document order.
//! `serde_json::Value` sorts its keys (the `preserve_order` feature must stay off: `gamelib-store`
//! forbids it, and Cargo's feature unification would turn it on for every crate), so the classifier
//! reads this type instead. Numbers are `f64`, as in JavaScript.

use std::collections::HashMap;
use std::fmt;

use serde::de::{Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};

/// One parsed JSON value, objects as ordered entries.
#[derive(Debug, Clone, PartialEq)]
pub enum JsValue {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<JsValue>),
    /// Entries in document order; a repeated key keeps its first position and its last value, which is
    /// what `JSON.parse` does.
    Object(Vec<(String, JsValue)>),
}

impl JsValue {
    /// `value[key]` for a string key: an own property of an object, `None` for anything else (a
    /// JavaScript read of a missing property is `undefined`, which this models as `None`).
    pub fn get(&self, key: &str) -> Option<&JsValue> {
        match self {
            JsValue::Object(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// `value[key] ?? undefined`: a property that is present and not `null`.
    pub fn get_non_null(&self, key: &str) -> Option<&JsValue> {
        self.get(key).filter(|v| !matches!(v, JsValue::Null))
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsValue::String(s) => Some(s),
            _ => None,
        }
    }

    /// `typeof value === 'object' && value !== null`: an object or an array.
    pub fn is_object_like(&self) -> bool {
        matches!(self, JsValue::Object(_) | JsValue::Array(_))
    }

    /// `Boolean(value)`: falsy are `null`, `false`, `0`, `NaN` and the empty string.
    pub fn is_truthy(&self) -> bool {
        match self {
            JsValue::Null => false,
            JsValue::Bool(b) => *b,
            JsValue::Number(n) => *n != 0.0 && !n.is_nan(),
            JsValue::String(s) => !s.is_empty(),
            JsValue::Array(_) | JsValue::Object(_) => true,
        }
    }

    /// `typeof value`.
    pub fn type_of(&self) -> &'static str {
        match self {
            JsValue::Null | JsValue::Array(_) | JsValue::Object(_) => "object",
            JsValue::Bool(_) => "boolean",
            JsValue::Number(_) => "number",
            JsValue::String(_) => "string",
        }
    }

    /// `Object.keys(value)` of an object or an array, in the order JavaScript reports them.
    pub fn keys(&self) -> Vec<String> {
        match self {
            JsValue::Object(entries) => {
                let mut indexed: Vec<(u32, &str)> = Vec::new();
                let mut named: Vec<&str> = Vec::new();
                for (key, _) in entries {
                    match array_index(key) {
                        Some(n) => indexed.push((n, key)),
                        None => named.push(key),
                    }
                }
                indexed.sort_by_key(|(n, _)| *n);
                indexed
                    .into_iter()
                    .map(|(_, k)| k.to_string())
                    .chain(named.into_iter().map(str::to_string))
                    .collect()
            }
            JsValue::Array(items) => (0..items.len()).map(|i| i.to_string()).collect(),
            _ => Vec::new(),
        }
    }

    /// An object from entries in the given order (a synthetic record the classifier builds).
    pub fn object_of(entries: Vec<(&str, JsValue)>) -> JsValue {
        JsValue::Object(
            entries
                .into_iter()
                .map(|(k, v)| (k.to_string(), v))
                .collect(),
        )
    }
}

impl From<&serde_json::Value> for JsValue {
    /// Keys arrive in `serde_json`'s (sorted) order; use the `Deserialize` impl to keep a document's.
    fn from(value: &serde_json::Value) -> JsValue {
        match value {
            serde_json::Value::Null => JsValue::Null,
            serde_json::Value::Bool(b) => JsValue::Bool(*b),
            serde_json::Value::Number(n) => JsValue::Number(n.as_f64().unwrap_or(f64::NAN)),
            serde_json::Value::String(s) => JsValue::String(s.clone()),
            serde_json::Value::Array(a) => JsValue::Array(a.iter().map(JsValue::from).collect()),
            serde_json::Value::Object(o) => JsValue::Object(
                o.iter()
                    .map(|(k, v)| (k.clone(), JsValue::from(v)))
                    .collect(),
            ),
        }
    }
}

/// A canonical array index: decimal digits, no leading zero (but `0` itself), below `2^32 - 1`.
fn array_index(key: &str) -> Option<u32> {
    let bytes = key.as_bytes();
    if bytes.is_empty() || bytes.len() > 10 || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    if bytes.len() > 1 && bytes[0] == b'0' {
        return None;
    }
    let n: u64 = key.parse().ok()?;
    (n < u64::from(u32::MAX)).then_some(n as u32)
}

/// `String(n)` for a JavaScript number (ECMAScript `Number::toString`, radix 10).
pub fn js_number_to_string(x: f64) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    if x == 0.0 {
        return "0".to_string();
    }
    if x.is_infinite() {
        return if x < 0.0 { "-Infinity" } else { "Infinity" }.to_string();
    }
    let sign = if x < 0.0 { "-" } else { "" };
    // The shortest round-trip digits, as `d.ddde<exp>`.
    let sci = format!("{:e}", x.abs());
    let (mantissa, exp) = sci.split_once('e').unwrap_or((&sci, "0"));
    let exp: i32 = exp.parse().unwrap_or(0);
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exp + 1;
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let e = n - 1;
        let sign_e = if e < 0 { '-' } else { '+' };
        if k == 1 {
            format!("{digits}e{sign_e}{}", e.abs())
        } else {
            format!("{}.{}e{sign_e}{}", &digits[..1], &digits[1..], e.abs())
        }
    };
    format!("{sign}{body}")
}

impl<'de> Deserialize<'de> for JsValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<JsValue, D::Error> {
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
                Ok(JsValue::Number(v as f64))
            }

            fn visit_u64<E>(self, v: u64) -> Result<JsValue, E> {
                Ok(JsValue::Number(v as f64))
            }

            fn visit_f64<E>(self, v: f64) -> Result<JsValue, E> {
                Ok(JsValue::Number(v))
            }

            fn visit_str<E>(self, v: &str) -> Result<JsValue, E> {
                Ok(JsValue::String(v.to_string()))
            }

            fn visit_string<E>(self, v: String) -> Result<JsValue, E> {
                Ok(JsValue::String(v))
            }

            fn visit_unit<E>(self) -> Result<JsValue, E> {
                Ok(JsValue::Null)
            }

            fn visit_none<E>(self) -> Result<JsValue, E> {
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
                let mut seen: HashMap<String, usize> = HashMap::new();
                while let Some((key, value)) = map.next_entry::<String, JsValue>()? {
                    match seen.get(&key) {
                        Some(&at) => entries[at].1 = value,
                        None => {
                            seen.insert(key.clone(), entries.len());
                            entries.push((key, value));
                        }
                    }
                }
                Ok(JsValue::Object(entries))
            }
        }

        deserializer.deserialize_any(JsVisitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(text: &str) -> JsValue {
        serde_json::from_str(text).expect("valid JSON")
    }

    #[test]
    fn keys_keep_document_order_with_integer_keys_first() {
        let v = parse(r#"{"b":1,"10":2,"a":3,"2":4,"01":5}"#);
        assert_eq!(v.keys(), ["2", "10", "b", "a", "01"]);
    }

    #[test]
    fn a_repeated_key_keeps_its_first_position_and_last_value() {
        let v = parse(r#"{"a":1,"b":2,"a":3}"#);
        assert_eq!(v.keys(), ["a", "b"]);
        assert_eq!(v.get("a"), Some(&JsValue::Number(3.0)));
    }

    #[test]
    fn an_array_reports_its_indices() {
        assert_eq!(parse("[7,8,9]").keys(), ["0", "1", "2"]);
    }

    #[test]
    fn truthiness_follows_javascript() {
        assert!(!parse("null").is_truthy());
        assert!(!parse("0").is_truthy());
        assert!(!parse("-0.0").is_truthy());
        assert!(!parse(r#""""#).is_truthy());
        assert!(!parse("false").is_truthy());
        assert!(parse("[]").is_truthy());
        assert!(parse("{}").is_truthy());
        assert!(parse(r#""0""#).is_truthy());
    }

    #[test]
    fn a_property_read_of_a_non_object_is_absent() {
        assert_eq!(parse("[1]").get("0"), None);
        assert_eq!(parse(r#""abc""#).get("length"), None);
    }

    #[test]
    fn number_to_string_follows_ecmascript() {
        assert_eq!(js_number_to_string(620.0), "620");
        assert_eq!(js_number_to_string(-3.0), "-3");
        assert_eq!(js_number_to_string(1.5), "1.5");
        assert_eq!(js_number_to_string(0.000001), "0.000001");
        assert_eq!(js_number_to_string(1e-7), "1e-7");
        assert_eq!(js_number_to_string(1e21), "1e+21");
        assert_eq!(
            js_number_to_string(123456789012345680000.0),
            "123456789012345680000"
        );
        assert_eq!(js_number_to_string(1.2345e25), "1.2345e+25");
        assert_eq!(js_number_to_string(0.0), "0");
    }
}
