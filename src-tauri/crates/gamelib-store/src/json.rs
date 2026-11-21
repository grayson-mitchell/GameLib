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

    pub fn get_mut(&mut self, key: &str) -> Option<&mut Json> {
        self.0.get_mut(key)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.0.contains_key(key)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&String, &Json)> {
        self.0.iter()
    }

    /// Sets `key` the way assigning a property on a JS object does. An existing key keeps its place
    /// and takes the new value. A new integer-like key (a canonical decimal in 0..=4294967294) goes
    /// into the leading integer section in ascending order; any other new key goes last. Returns the
    /// replaced value, if any.
    pub fn insert_js(&mut self, key: impl Into<String>, value: Json) -> Option<Json> {
        let key = key.into();
        if let Some(slot) = self.0.get_mut(&key) {
            return Some(std::mem::replace(slot, value));
        }
        match index_key(&key) {
            None => {
                self.0.insert(key, value);
            }
            Some(n) => {
                // The integer keys are a sorted prefix, so the slot is a binary search away.
                let (mut lo, mut hi) = (0, self.0.len());
                while lo < hi {
                    let mid = lo + (hi - lo) / 2;
                    let smaller = self
                        .0
                        .get_index(mid)
                        .and_then(|(k, _)| index_key(k))
                        .is_some_and(|m| m < n);
                    if smaller {
                        lo = mid + 1;
                    } else {
                        hi = mid;
                    }
                }
                self.0.shift_insert(lo, key, value);
            }
        }
        None
    }

    /// Removes `key`, shifting later keys up so the order of the rest is untouched.
    pub fn remove(&mut self, key: &str) -> Option<Json> {
        self.0.shift_remove(key)
    }
}

/// The numeric value of an "array index" key: a canonical decimal (no sign, no leading zero unless
/// the key is `0`) no greater than 4294967294. JS lists these first, ascending, whatever order they
/// were assigned in; every other key (`01`, `-1`, `1.5`, `4294967295`, `9007199254740993`) keeps its
/// insertion order after them.
fn index_key(key: &str) -> Option<u32> {
    let b = key.as_bytes();
    if b.is_empty() || b.len() > 10 || !b.iter().all(u8::is_ascii_digit) {
        return None;
    }
    if b.len() > 1 && b[0] == b'0' {
        return None;
    }
    key.parse::<u64>()
        .ok()
        .filter(|n| *n <= 4_294_967_294)
        .map(|n| n as u32)
}

impl Obj {
    /// Builds an object from entries in document order, ordering them as `JSON.parse` does: integer
    /// keys first and ascending, the rest as they came. A document TS wrote is already in this order,
    /// so the common case costs one scan.
    fn from_document_order(map: IndexMap<String, Json>) -> Obj {
        let mut last_index: Option<u32> = None;
        let mut seen_other = false;
        let mut ordered = true;
        for k in map.keys() {
            match index_key(k) {
                Some(n) => {
                    if seen_other || last_index.is_some_and(|l| l > n) {
                        ordered = false;
                        break;
                    }
                    last_index = Some(n);
                }
                None => seen_other = true,
            }
        }
        if ordered {
            return Obj(map);
        }
        let mut indexed: Vec<(u32, String, Json)> = Vec::new();
        let mut others: Vec<(String, Json)> = Vec::new();
        for (k, v) in map {
            match index_key(&k) {
                Some(n) => indexed.push((n, k, v)),
                None => others.push((k, v)),
            }
        }
        // Keys are unique, so the sort has no ties.
        indexed.sort_unstable_by_key(|e| e.0);
        let mut out = IndexMap::with_capacity(indexed.len() + others.len());
        out.extend(indexed.into_iter().map(|(_, k, v)| (k, v)));
        out.extend(others);
        Obj(out)
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
        Ok(Json::Obj(Obj::from_document_order(entries)))
    }
}

impl<'de> Deserialize<'de> for Json {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Json, D::Error> {
        d.deserialize_any(JsonVisitor)
    }
}

/// Parses a whole document the way `JSON.parse` reads it: a repeated key keeps its first position
/// and its last value, and integer-like keys come first in ascending order. Trailing bytes, a BOM and
/// an empty input are errors.
pub fn parse(bytes: &[u8]) -> Result<Json, ParseError> {
    serde_json::from_slice::<Json>(bytes).map_err(ParseError)
}

impl From<serde_json::Value> for Json {
    /// For call sites that hold a loose `serde_json::Value` (no key order to keep: without
    /// `preserve_order` its objects are sorted). A store's own documents are built with [`Obj`].
    fn from(v: serde_json::Value) -> Json {
        use serde_json::Value;
        match v {
            Value::Null => Json::Null,
            Value::Bool(b) => Json::Bool(b),
            Value::Number(n) => Json::Num(match (n.as_u64(), n.as_i64()) {
                (Some(u), _) => Num::U(u),
                (None, Some(i)) => Num::I(i),
                // `as_f64` is `Some` for every number this build can hold.
                (None, None) => Num::F(n.as_f64().unwrap_or(0.0)),
            }),
            Value::String(s) => Json::Str(s),
            Value::Array(a) => Json::Arr(a.into_iter().map(Json::from).collect()),
            Value::Object(m) => {
                let mut o = Obj::new();
                for (k, v) in m {
                    o.insert_js(k, Json::from(v));
                }
                Json::Obj(o)
            }
        }
    }
}

impl Json {
    /// The loose `serde_json::Value` of this document, for call sites that only read it. A
    /// non-finite float (which JSON cannot hold) becomes `null`; object order is not kept.
    pub fn to_value(&self) -> serde_json::Value {
        use serde_json::{Map, Number, Value};
        match self {
            Json::Null => Value::Null,
            Json::Bool(b) => Value::Bool(*b),
            Json::Num(Num::U(u)) => Value::Number(Number::from(*u)),
            Json::Num(Num::I(i)) => Value::Number(Number::from(*i)),
            Json::Num(Num::F(f)) => Number::from_f64(*f).map_or(Value::Null, Value::Number),
            Json::Str(s) => Value::String(s.clone()),
            Json::Arr(a) => Value::Array(a.iter().map(Json::to_value).collect()),
            Json::Obj(o) => Value::Object(
                o.iter()
                    .map(|(k, v)| (k.clone(), v.to_value()))
                    .collect::<Map<String, Value>>(),
            ),
        }
    }

    /// The number as an `f64` (what a JS comparison sees), `None` for anything but a number.
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Json::Num(Num::U(u)) => Some(*u as f64),
            Json::Num(Num::I(i)) => Some(*i as f64),
            Json::Num(Num::F(f)) => Some(*f),
            _ => None,
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(v: &Json) -> Vec<&str> {
        v.as_object()
            .unwrap()
            .iter()
            .map(|(k, _)| k.as_str())
            .collect()
    }

    #[test]
    fn js_number_text_follows_ecmascript_number_to_string() {
        let table: &[(f64, &str)] = &[
            (0.0, "0"),
            (-0.0, "0"),
            (1.0, "1"),
            (100.0, "100"),
            (-2.5, "-2.5"),
            (0.1, "0.1"),
            (123.456, "123.456"),
            (1e20, "100000000000000000000"),
            (1e21, "1e+21"),
            (1.5e21, "1.5e+21"),
            (1e-6, "0.000001"),
            (1e-7, "1e-7"),
            (1.25e-7, "1.25e-7"),
            (5e-324, "5e-324"),
            (1.7976931348623157e308, "1.7976931348623157e+308"),
            (4294967295.0, "4294967295"),
            (-1e21, "-1e+21"),
        ];
        for (f, want) in table {
            assert_eq!(js_number_text(*f), *want, "{f:e}");
        }
    }

    #[test]
    fn integers_beyond_2_pow_53_print_as_the_nearest_double() {
        assert_eq!(
            Num::U(9_007_199_254_740_992).to_js_text(),
            "9007199254740992"
        );
        assert_eq!(
            Num::U(9_007_199_254_740_993).to_js_text(),
            "9007199254740992"
        );
        assert_eq!(Num::U(u64::MAX).to_js_text(), "18446744073709552000");
        assert_eq!(Num::I(i64::MIN).to_js_text(), "-9223372036854776000");
        assert_eq!(Num::I(-42).to_js_text(), "-42");
    }

    #[test]
    fn index_keys_are_canonical_decimals_below_u32_max() {
        for (k, want) in [
            ("0", Some(0)),
            ("7", Some(7)),
            ("4294967294", Some(4294967294)),
            ("4294967295", None),
            ("01", None),
            ("-1", None),
            ("1.5", None),
            ("1e3", None),
            ("", None),
            ("9007199254740993", None),
        ] {
            assert_eq!(index_key(k), want, "{k:?}");
        }
    }

    #[test]
    fn a_new_integer_key_goes_among_the_integers() {
        let mut o = Obj::new();
        for k in ["10", "x", "2", "y", "100", "3"] {
            o.insert_js(k, Json::Null);
        }
        let v = Json::Obj(o);
        assert_eq!(keys(&v), ["2", "3", "10", "100", "x", "y"]);
    }

    #[test]
    fn parse_orders_keys_like_json_parse_and_keeps_the_last_duplicate() {
        let v = parse(br#"{"b":1,"2":"two","a":2,"1":"one","b":3}"#).unwrap();
        assert_eq!(keys(&v), ["1", "2", "b", "a"]);
        assert_eq!(v.get("b"), Some(&Json::Num(Num::U(3))));
    }

    #[test]
    fn strings_escape_as_json_stringify_does() {
        let v = Json::Str("a\"b\\c\n\u{1f}\u{7f}\u{2028}é".to_string());
        let got = String::from_utf8(to_compact_bytes(&v)).unwrap();
        assert_eq!(got, "\"a\\\"b\\\\c\\n\\u001f\u{7f}\u{2028}é\"");
    }

    #[test]
    fn empty_containers_and_nesting_print_like_json_stringify() {
        let v = parse(br#"{"a":[],"b":{},"c":[1,{"d":null}]}"#).unwrap();
        assert_eq!(
            String::from_utf8(to_settings_bytes(&v)).unwrap(),
            "{\n  \"a\": [],\n  \"b\": {},\n  \"c\": [\n    1,\n    {\n      \"d\": null\n    }\n  ]\n}"
        );
        assert_eq!(
            String::from_utf8(to_compact_bytes(&v)).unwrap(),
            r#"{"a":[],"b":{},"c":[1,{"d":null}]}"#
        );
    }

    #[test]
    fn a_bom_and_trailing_bytes_are_parse_errors() {
        assert!(parse(b"\xef\xbb\xbf{}").is_err());
        assert!(parse(b"{} x").is_err());
        assert!(parse(b"").is_err());
    }

    #[test]
    fn a_loose_value_round_trips_through_json() {
        let v = serde_json::json!({"a": [1, -2, 2.5, null, true, "x"], "n": {"k": 18446744073709551615u64}});
        let j = Json::from(v.clone());
        assert_eq!(
            j.get("a").and_then(Json::as_array).map(<[Json]>::len),
            Some(6)
        );
        assert_eq!(j.to_value(), v);
        assert_eq!(
            Json::Num(Num::F(f64::NAN)).to_value(),
            serde_json::Value::Null
        );
        assert_eq!(Json::Num(Num::U(3)).as_f64(), Some(3.0));
        assert_eq!(Json::Str("3".into()).as_f64(), None);
    }
}
