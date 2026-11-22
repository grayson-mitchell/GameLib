//! The small JavaScript behaviours the leaf services copy (Phase 86): `encodeURIComponent`, truthiness,
//! the `String(value)` text of a JSON value (a template literal's `${value}`), and `removeSpecialcharacters`
//! (the wiki cache key, `backend/utils.ts`). Each carries vectors recorded by running the JS once.

use gamelib_store::json::js_number_text;
use serde_json::Value;

/// JS `encodeURIComponent`: everything but `A-Z a-z 0-9 - _ . ! ~ * ' ( )` is `%XX` over the UTF-8
/// bytes (a space is `%20`, not `+`).
pub fn encode_uri_component(text: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(text.len());
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => out.push(char::from(byte)),
            _ => {
                out.push('%');
                out.push(char::from(HEX[usize::from(byte >> 4)]));
                out.push(char::from(HEX[usize::from(byte & 0x0F)]));
            }
        }
    }
    out
}

/// JS truthiness of a JSON value.
pub fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// What a template literal makes of a value parsed from JSON: `${value}`. A string is itself, a number
/// is its JS text, `true` and `false` and `null` are their words, an array joins its elements' text with
/// `,` (a `null` element is empty, as `Array.prototype.join` has it) and an object is `[object Object]`.
pub fn to_js_text(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => js_number_text(n.as_f64().unwrap_or(f64::NAN)),
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .map(|item| match item {
                Value::Null => String::new(),
                other => to_js_text(other),
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

/// The characters `removeSpecialcharacters` deletes: the class of
/// `/[:|/|*|?|<|>|\\|&|{|}|%|$|@|`|!|™|+|'|"|®]/gi`, where every `|` is a literal member (so `|` itself
/// is deleted). The `i` flag changes nothing: none of the members has a case.
const SPECIAL: &[char] = &[
    ':', '|', '/', '*', '?', '<', '>', '\\', '&', '{', '}', '%', '$', '@', '`', '!', '\u{2122}',
    '+', '\'', '"', '\u{AE}',
];

/// `backend/utils.ts` `removeSpecialcharacters`: the text with every character of [`SPECIAL`] removed.
/// It is also how a game directory is named, so the set must not change.
pub fn remove_special_characters(text: &str) -> String {
    text.chars().filter(|c| !SPECIAL.contains(c)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn encode_uri_component_matches_javascript() {
        assert_eq!(encode_uri_component("Dead Cells"), "Dead%20Cells");
        assert_eq!(
            encode_uri_component("a-b_c.d!e~f*g'h(i)j"),
            "a-b_c.d!e~f*g'h(i)j"
        );
        assert_eq!(
            encode_uri_component("a/b?c=d&e#f+g,h:i"),
            "a%2Fb%3Fc%3Dd%26e%23f%2Bg%2Ch%3Ai"
        );
        assert_eq!(encode_uri_component("é"), "%C3%A9");
        assert_eq!(encode_uri_component("日本"), "%E6%97%A5%E6%9C%AC");
        assert_eq!(encode_uri_component("100%"), "100%25");
        assert_eq!(encode_uri_component(""), "");
        // The wiki titles that carry a colon (a `-` replaced by `:`) and an astral character.
        assert_eq!(
            encode_uri_component("Anno 1602: Edition"),
            "Anno%201602%3A%20Edition"
        );
        assert_eq!(encode_uri_component("\u{1F3AE}"), "%F0%9F%8E%AE");
    }

    #[test]
    fn truthy_follows_javascript() {
        for (value, want) in [
            (json!(true), true),
            (json!(false), false),
            (json!(null), false),
            (json!(0), false),
            (json!(2), true),
            (json!(""), false),
            (json!("x"), true),
            (json!([]), true),
            (json!({}), true),
        ] {
            assert_eq!(truthy(&value), want, "{value}");
        }
    }

    // Vectors from `String(value)` / a template literal in node 22.
    #[test]
    fn to_js_text_follows_a_template_literal() {
        for (value, want) in [
            (json!("200143"), "200143"),
            (json!(200143), "200143"),
            (json!(1.5), "1.5"),
            (json!(1e21), "1e+21"),
            (json!(100.0), "100"),
            (json!(true), "true"),
            (json!(false), "false"),
            (json!(null), "null"),
            (json!([1, "a", null, [2, 3]]), "1,a,,2,3"),
            (json!([]), ""),
            (json!({"a": 1}), "[object Object]"),
        ] {
            assert_eq!(to_js_text(&value), want, "{value}");
        }
    }

    // Vectors from `removeSpecialcharacters` in node 22.
    #[test]
    fn remove_special_characters_matches_the_ts_class() {
        for (input, want) in [
            ("Elden Ring", "Elden Ring"),
            (
                "Marvel's Spider-Man: Remastered",
                "Marvels Spider-Man Remastered",
            ),
            (
                "S.T.A.L.K.E.R.: Shadow of Chernobyl",
                "S.T.A.L.K.E.R. Shadow of Chernobyl",
            ),
            ("Half-Life\u{2122} 2 \u{AE}", "Half-Life 2 "),
            (
                "a/b\\c|d*e?f<g>h&i{j}k%l$m@n`o!p+q\"r",
                "abcdefghijklmnopqr",
            ),
            ("100% Orange Juice", "100 Orange Juice"),
            ("\u{1F3AE} Game: Pt.2", "\u{1F3AE} Game Pt.2"),
            ("", ""),
        ] {
            assert_eq!(remove_special_characters(input), want, "{input:?}");
        }
    }
}
