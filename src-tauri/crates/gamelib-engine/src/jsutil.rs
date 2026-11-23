//! The few JavaScript semantics the ported engine code has to reproduce byte for byte: `String.trim`,
//! `.length` in UTF-16 units, truthiness, `String(value)` and `path.join`. A port that used Rust's
//! `str::trim` or `chars().count()` would disagree with the TS answer on a name the goldens and
//! vectors pin (a BOM, an astral character), so the rule lives here once.

use serde_json::Value;

/// ECMAScript `WhiteSpace` and `LineTerminator`: tab, VT, FF, space, NBSP, the BOM, the `Zs`
/// category, LF, CR, LS and PS. Not Rust's `White_Space`: U+0085 is not trimmed by JS, U+FEFF is.
pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{9}'
            | '\u{a}'
            | '\u{b}'
            | '\u{c}'
            | '\u{d}'
            | '\u{20}'
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// `String.prototype.trim`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_whitespace)
}

/// `string.length`: UTF-16 code units.
pub fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// JavaScript truthiness of a JSON value.
pub fn js_truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(true),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// `String(value)` for a JSON value (`undefined` is the caller's `"undefined"`).
pub fn js_to_string(v: &Value) -> String {
    match v {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => match n.as_f64() {
            Some(f) if f.is_finite() && f.fract() == 0.0 && f.abs() < 1e21 => {
                format!("{}", f as i128)
            }
            _ => n.to_string(),
        },
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .map(|i| match i {
                Value::Null => String::new(),
                other => js_to_string(other),
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

/// A property of a JSON object, `None` for a missing key and for a value that is not an object (an
/// array has no named properties here: `[].type` is `undefined`).
pub fn prop<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    match v {
        Value::Object(map) => map.get(key),
        _ => None,
    }
}

/// Node's `path.join` on POSIX: joins with `/` and normalises (`.`, `..`, doubled slashes), keeping
/// a trailing slash when the last part has one. An empty result is `.`.
pub fn path_join(parts: &[&str]) -> String {
    let joined = parts
        .iter()
        .filter(|p| !p.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join("/");
    if joined.is_empty() {
        return ".".to_string();
    }
    let absolute = joined.starts_with('/');
    let trailing = joined.ends_with('/');
    let mut out: Vec<&str> = Vec::new();
    for seg in joined.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if matches!(out.last(), Some(last) if *last != "..") {
                    out.pop();
                } else if !absolute {
                    out.push("..");
                }
            }
            other => out.push(other),
        }
    }
    let mut text = out.join("/");
    if text.is_empty() && !absolute {
        text = ".".to_string();
    }
    if trailing && !text.is_empty() && text != "/" {
        text.push('/');
    }
    if absolute {
        format!("/{text}")
    } else {
        text
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn trim_is_the_javascript_one() {
        assert_eq!(js_trim("\u{feff} a \u{3000}"), "a");
        // NEL is trimmed by Rust and not by JavaScript.
        assert_eq!(js_trim("\u{85}a"), "\u{85}a");
    }

    #[test]
    fn length_counts_utf16_units() {
        assert_eq!(utf16_len("a"), 1);
        assert_eq!(utf16_len("\u{1f600}"), 2);
    }

    #[test]
    fn truthiness_and_string_conversion() {
        assert!(!js_truthy(&json!("")));
        assert!(!js_truthy(&json!(0)));
        assert!(!js_truthy(&Value::Null));
        assert!(js_truthy(&json!([])));
        assert_eq!(js_to_string(&json!(5)), "5");
        assert_eq!(js_to_string(&json!(5.0)), "5");
        assert_eq!(js_to_string(&json!([1, null, "a"])), "1,,a");
        assert_eq!(js_to_string(&json!({})), "[object Object]");
        assert_eq!(js_to_string(&Value::Null), "null");
    }

    #[test]
    fn join_normalises_like_node() {
        assert_eq!(
            path_join(&["/a/b/", "Contents", "wine"]),
            "/a/b/Contents/wine"
        );
        assert_eq!(path_join(&["/a", "..", "b"]), "/b");
        assert_eq!(path_join(&["a", "", "b"]), "a/b");
        assert_eq!(path_join(&["", ""]), ".");
        assert_eq!(path_join(&["/a//b", "c/"]), "/a/b/c/");
    }
}
