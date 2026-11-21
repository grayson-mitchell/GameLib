//! The store's private ordered JSON type and its three byte-exact writers (D-05).
//!
//! `serde_json::Value` is not usable here: without `preserve_order` it sorts every object's keys,
//! and the feature itself must stay off for the whole shell build. So the store parses into its own
//! `Json`, whose objects are `IndexMap`s that keep the order the document had, and prints it with its
//! own writers, which match `JSON.stringify` of the TS stack byte for byte: tab-indented conf stores,
//! two-space settings documents, compact text, never a trailing newline.

use std::fmt;

use indexmap::IndexMap;
use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};

/// A JSON number as the parser saw it. Integers keep their exact value; everything else (fractions,
/// exponents, and integers beyond `u64`/`i64`) is an `f64`, parsed correctly rounded.
#[derive(Debug, Clone, PartialEq)]
pub enum Num {
    U(u64),
    I(i64),
    F(f64),
}

/// A JSON value whose objects remember their key order.
#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(Num),
    Str(String),
    Arr(Vec<Json>),
    Obj(Obj),
}

/// An ordered JSON object. Equality is order-sensitive: the order is part of the bytes.
#[derive(Debug, Clone, Default)]
pub struct Obj(IndexMap<String, Json>);

impl PartialEq for Obj {
    fn eq(&self, other: &Obj) -> bool {
        self.0.len() == other.0.len() && self.0.iter().zip(other.0.iter()).all(|(a, b)| a == b)
    }
}

impl Obj {
    pub fn new() -> Obj {
        Obj(IndexMap::new())
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn get(&self, key: &str) -> Option<&Json> {
        self.0.get(key)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.0.contains_key(key)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&String, &Json)> {
        self.0.iter()
    }

    /// Sets `key`, keeping an existing key's place. (Skeleton for the RED run: appends.)
    pub fn insert_js(&mut self, key: impl Into<String>, value: Json) -> Option<Json> {
        self.0.insert(key.into(), value)
    }

    /// Removes `key`, shifting later keys up so the order of the rest is untouched.
    pub fn remove(&mut self, key: &str) -> Option<Json> {
        self.0.shift_remove(key)
    }
}

impl Json {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Json::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[Json]> {
        match self {
            Json::Arr(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&Obj> {
        match self {
            Json::Obj(o) => Some(o),
            _ => None,
        }
    }

    /// `self[key]` for an object, `None` for anything else or a missing key.
    pub fn get(&self, key: &str) -> Option<&Json> {
        self.as_object().and_then(|o| o.get(key))
    }
}

/// A document that is not valid JSON, or that nests deeper than serde_json's recursion limit (128).
/// The limit is never disabled: a hostile file must fail to parse, not overflow the stack.
#[derive(Debug)]
pub struct ParseError(serde_json::Error);

impl ParseError {
    pub fn line(&self) -> usize {
        self.0.line()
    }

    pub fn column(&self) -> usize {
        self.0.column()
    }
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl std::error::Error for ParseError {}

struct JsonVisitor;

impl<'de> Visitor<'de> for JsonVisitor {
    type Value = Json;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("any JSON value")
    }

    fn visit_unit<E: de::Error>(self) -> Result<Json, E> {
        Ok(Json::Null)
    }

    fn visit_bool<E: de::Error>(self, v: bool) -> Result<Json, E> {
        Ok(Json::Bool(v))
    }

    fn visit_u64<E: de::Error>(self, v: u64) -> Result<Json, E> {
        Ok(Json::Num(Num::U(v)))
    }

    fn visit_i64<E: de::Error>(self, v: i64) -> Result<Json, E> {
        Ok(Json::Num(Num::I(v)))
    }

    fn visit_f64<E: de::Error>(self, v: f64) -> Result<Json, E> {
        Ok(Json::Num(Num::F(v)))
    }

    fn visit_str<E: de::Error>(self, v: &str) -> Result<Json, E> {
        Ok(Json::Str(v.to_string()))
    }

    fn visit_string<E: de::Error>(self, v: String) -> Result<Json, E> {
        Ok(Json::Str(v))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Json, A::Error> {
        let mut items = Vec::with_capacity(seq.size_hint().unwrap_or(0).min(4096));
        while let Some(item) = seq.next_element::<Json>()? {
            items.push(item);
        }
        Ok(Json::Arr(items))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Json, A::Error> {
        let mut entries: IndexMap<String, Json> = IndexMap::new();
        while let Some((key, value)) = map.next_entry::<String, Json>()? {
            // A repeated key keeps its first position and takes the last value, as JSON.parse does.
            entries.insert(key, value);
        }
        Ok(Json::Obj(Obj(entries)))
    }
}

impl<'de> Deserialize<'de> for Json {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Json, D::Error> {
        d.deserialize_any(JsonVisitor)
    }
}

/// Parses a whole document. Trailing bytes, a BOM and an empty input are errors.
pub fn parse(bytes: &[u8]) -> Result<Json, ParseError> {
    serde_json::from_slice::<Json>(bytes).map_err(ParseError)
}

/// Integers beyond this magnitude are not exactly representable as a JS number: TS parses them
/// lossily and prints the nearest double, so the writer does the same.
const MAX_SAFE_INTEGER: u64 = 1 << 53;

/// `Number::prototype.toString` (ECMA-262 Number::toString) of a double: the shortest digits that
/// round-trip, laid out by the decimal exponent. `1e21` -> `1e+21`, `1e20` -> `100000000000000000000`,
/// `1e-7` -> `1e-7`, `100.0` -> `100`, `-0` -> `0`. JSON has no NaN or infinity, but `JSON.stringify`
/// prints them as `null`, so this does too rather than inventing text.
pub fn js_number_text(f: f64) -> String {
    if f == 0.0 {
        return "0".to_string();
    }
    if !f.is_finite() {
        return "null".to_string();
    }
    // Rust's `{:e}` is the shortest round-trip form: `d[.ddd]e<exp>`.
    let sci = format!("{:e}", f.abs());
    let (mantissa, exp) = sci.split_once('e').unwrap_or((sci.as_str(), "0"));
    let exp: i32 = exp.parse().unwrap_or(0);
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    // The value is 0.<digits> * 10^n, so n = exp + 1.
    let n = exp + 1;
    let mut out = String::new();
    if f < 0.0 {
        out.push('-');
    }
    if k <= n && n <= 21 {
        out.push_str(&digits);
        out.extend(std::iter::repeat('0').take((n - k) as usize));
    } else if 0 < n && n <= 21 {
        out.push_str(&digits[..n as usize]);
        out.push('.');
        out.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        out.extend(std::iter::repeat('0').take((-n) as usize));
        out.push_str(&digits);
    } else {
        let e = n - 1;
        out.push_str(&digits[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        out.push(if e < 0 { '-' } else { '+' });
        out.push_str(&e.abs().to_string());
    }
    out
}

impl Num {
    /// The text `JSON.stringify` prints for this number after TS parsed it.
    pub fn to_js_text(&self) -> String {
        match self {
            Num::U(u) if *u <= MAX_SAFE_INTEGER => u.to_string(),
            Num::U(u) => js_number_text(*u as f64),
            Num::I(i) if i.unsigned_abs() <= MAX_SAFE_INTEGER => i.to_string(),
            Num::I(i) => js_number_text(*i as f64),
            Num::F(f) => js_number_text(*f),
        }
    }
}

fn write_string(out: &mut Vec<u8>, s: &str) {
    // serde_json escapes exactly what JSON.stringify does: `"`, `\`, the C0 controls (with the
    // short forms for \b \f \n \r \t and lowercase \u00xx for the rest) and nothing else.
    let _ = serde_json::to_writer(&mut *out, s);
}

fn write_newline(out: &mut Vec<u8>, indent: &[u8], depth: usize) {
    out.push(b'\n');
    for _ in 0..depth {
        out.extend_from_slice(indent);
    }
}

fn write_value(out: &mut Vec<u8>, v: &Json, indent: Option<&[u8]>, depth: usize) {
    match v {
        Json::Null => out.extend_from_slice(b"null"),
        Json::Bool(true) => out.extend_from_slice(b"true"),
        Json::Bool(false) => out.extend_from_slice(b"false"),
        Json::Num(n) => out.extend_from_slice(n.to_js_text().as_bytes()),
        Json::Str(s) => write_string(out, s),
        Json::Arr(items) => {
            if items.is_empty() {
                out.extend_from_slice(b"[]");
                return;
            }
            out.push(b'[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                if let Some(ind) = indent {
                    write_newline(out, ind, depth + 1);
                }
                write_value(out, item, indent, depth + 1);
            }
            if let Some(ind) = indent {
                write_newline(out, ind, depth);
            }
            out.push(b']');
        }
        Json::Obj(obj) => {
            if obj.is_empty() {
                out.extend_from_slice(b"{}");
                return;
            }
            out.push(b'{');
            for (i, (key, value)) in obj.iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                if let Some(ind) = indent {
                    write_newline(out, ind, depth + 1);
                }
                write_string(out, key);
                out.push(b':');
                if indent.is_some() {
                    out.push(b' ');
                }
                write_value(out, value, indent, depth + 1);
            }
            if let Some(ind) = indent {
                write_newline(out, ind, depth);
            }
            out.push(b'}');
        }
    }
}

fn write_all(v: &Json, indent: Option<&[u8]>) -> Vec<u8> {
    let mut out = Vec::new();
    write_value(&mut out, v, indent, 0);
    out
}

/// `JSON.stringify(v, undefined, '\t')`: a conf store file. No trailing newline.
pub fn to_store_bytes(v: &Json) -> Vec<u8> {
    write_all(v, Some(b"\t"))
}

/// `JSON.stringify(v, null, 2)`: a settings document. No trailing newline.
pub fn to_settings_bytes(v: &Json) -> Vec<u8> {
    write_all(v, Some(b"  "))
}

/// `JSON.stringify(v)`: compact text.
pub fn to_compact_bytes(v: &Json) -> Vec<u8> {
    write_all(v, None)
}
