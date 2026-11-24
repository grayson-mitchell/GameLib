//! Renderer-supplied log text, sanitised in Rust at write time (Phase 84, criterion 1).
//!
//! A port of `sanitizeRendererLogMessage.ts` plus the `formatter.ts` conversion that follows it
//! (`convertUnknownToString`). Renderer logs reach Rust without a TS hop, so the redaction lives
//! here: CR and LF become the two-character escapes `\r` and `\n` (so a message cannot forge a log
//! line), strings, array elements and each value of an object message are cut at 65,536 UTF-16
//! units and arrays at 256 entries, each with a visible marker. U+2028 and U+2029 are kept, as in
//! TS. [`truncate_utf16`] is the one cutting rule; the writer also applies it, at the frame path's
//! per-entry cap, to every native-origin entry.

use std::fmt;

use serde::de::{self, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::Deserialize;

pub const LOG_TEXT_MAX: usize = 65536;
pub const LOG_ARRAY_MAX: usize = 256;

/// The `logMessage` union of `src/common/types/ipc/logger.ts`: a string, an array of strings, or a
/// strict object whose keys are only `name`, `message` and `stack`, with string values. The object
/// keeps the document's key order (what `JSON.stringify` prints), so no insertion-ordered map
/// feature of serde_json is needed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RendererMessage {
    Text(String),
    List(Vec<String>),
    Object(Vec<(String, String)>),
}

struct MessageVisitor;

impl<'de> Visitor<'de> for MessageVisitor {
    type Value = RendererMessage;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("a string, an array of strings, or an object with name, message and stack")
    }

    fn visit_str<E: de::Error>(self, v: &str) -> Result<RendererMessage, E> {
        Ok(RendererMessage::Text(v.to_string()))
    }

    fn visit_string<E: de::Error>(self, v: String) -> Result<RendererMessage, E> {
        Ok(RendererMessage::Text(v))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<RendererMessage, A::Error> {
        let mut items = Vec::new();
        while let Some(item) = seq.next_element::<String>()? {
            items.push(item);
        }
        Ok(RendererMessage::List(items))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<RendererMessage, A::Error> {
        let mut entries: Vec<(String, String)> = Vec::new();
        while let Some(key) = map.next_key::<String>()? {
            if !matches!(key.as_str(), "name" | "message" | "stack") {
                return Err(de::Error::unknown_field(
                    &key,
                    &["name", "message", "stack"],
                ));
            }
            let value = map.next_value::<String>()?;
            // A repeated key keeps its first position and takes the last value, as a JS object does.
            match entries.iter_mut().find(|(k, _)| *k == key) {
                Some(slot) => slot.1 = value,
                None => entries.push((key, value)),
            }
        }
        Ok(RendererMessage::Object(entries))
    }
}

impl<'de> Deserialize<'de> for RendererMessage {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<RendererMessage, D::Error> {
        d.deserialize_any(MessageVisitor)
    }
}

/// Cuts at `limit` UTF-16 units, appending `…[truncated N bytes]` with N the units dropped. A cut
/// inside a surrogate pair keeps the units before it and writes U+FFFD, which is what Node wrote for
/// the lone half left by `slice`. A value within the limit is returned unchanged.
pub fn truncate_utf16(value: &str, limit: usize) -> String {
    let total = value.encode_utf16().count();
    if total <= limit {
        return value.to_string();
    }
    let mut out = String::new();
    let mut units = 0;
    for c in value.chars() {
        let n = c.len_utf16();
        if units + n > limit {
            if units < limit {
                out.push('\u{FFFD}');
            }
            break;
        }
        out.push(c);
        units += n;
    }
    out.push_str(&format!("\u{2026}[truncated {} bytes]", total - limit));
    out
}

/// Cuts at `LOG_TEXT_MAX` UTF-16 units.
fn truncate_text(value: &str) -> String {
    truncate_utf16(value, LOG_TEXT_MAX)
}

/// Escapes CR and LF as the two-character `\r` and `\n`: the rule for native-origin text (shell
/// diagnostics, crate messages), the same one `sanitize_text` applies to renderer strings, so a
/// line break in text the shell did not author cannot start a second log line.
pub fn escape_line_breaks(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            other => out.push(other),
        }
    }
    out
}

fn sanitize_text(value: &str) -> String {
    escape_line_breaks(&truncate_text(value))
}

/// `JSON.stringify(x, null, 2)` of the object, in the key order the renderer sent.
fn pretty_object(entries: &[(String, String)]) -> String {
    if entries.is_empty() {
        return "{}".to_string();
    }
    let encode = |s: &str| serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string());
    let rows: Vec<String> = entries
        .iter()
        .map(|(k, v)| format!("  {}: {}", encode(k), encode(v)))
        .collect();
    format!("{{\n{}\n}}", rows.join(",\n"))
}

/// The message body exactly as `formatLogMessage` would have produced it from the sanitised value.
/// An empty result writes no line (the formatter drops an empty body).
pub fn renderer_body(m: &RendererMessage) -> String {
    match m {
        RendererMessage::Text(s) => sanitize_text(s),
        RendererMessage::List(items) => {
            let mut parts: Vec<String> = items
                .iter()
                .take(LOG_ARRAY_MAX)
                .map(|s| sanitize_text(s))
                .collect();
            if items.len() > LOG_ARRAY_MAX {
                parts.push(format!(
                    "\u{2026}[truncated {} entries]",
                    items.len() - LOG_ARRAY_MAX
                ));
            }
            parts.join(" ")
        }
        RendererMessage::Object(entries) => {
            let cut: Vec<(String, String)> = entries
                .iter()
                .map(|(k, v)| (k.clone(), truncate_text(v)))
                .collect();
            pretty_object(&cut)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn parse(v: serde_json::Value) -> Result<RendererMessage, serde_json::Error> {
        serde_json::from_value(v)
    }

    fn body(v: serde_json::Value) -> String {
        renderer_body(&parse(v).expect("deserializes"))
    }

    #[test]
    fn crlf_becomes_four_characters_and_u2028_is_kept() {
        assert_eq!(body(json!("a\r\nb")), "a\\r\\nb");
        assert_eq!(body(json!("a\u{2028}b\u{2029}c")), "a\u{2028}b\u{2029}c");
    }

    #[test]
    fn the_in04_forge_string_stays_one_line() {
        let forged = body(json!("x\n(12:34:56) [ERROR]:   [Backend]: forged"));
        assert!(!forged.contains('\n'));
        assert_eq!(forged, "x\\n(12:34:56) [ERROR]:   [Backend]: forged");
    }

    #[test]
    fn a_long_string_is_cut_with_a_marker_counting_the_dropped_units() {
        let out = body(json!("a".repeat(LOG_TEXT_MAX + 5)));
        assert_eq!(
            out,
            format!("{}\u{2026}[truncated 5 bytes]", "a".repeat(LOG_TEXT_MAX))
        );
        // At the cap exactly: untouched.
        assert_eq!(body(json!("a".repeat(LOG_TEXT_MAX))).len(), LOG_TEXT_MAX);
    }

    #[test]
    fn a_cut_inside_a_surrogate_pair_writes_u_fffd() {
        // 65,535 units, then a 2-unit character: 65,537 in all, the cut splits the pair.
        let input = format!("{}\u{1F600}", "a".repeat(LOG_TEXT_MAX - 1));
        let out = body(json!(input));
        assert_eq!(
            out,
            format!(
                "{}\u{FFFD}\u{2026}[truncated 1 bytes]",
                "a".repeat(LOG_TEXT_MAX - 1)
            )
        );
        // A pair that ends exactly at the cap is kept whole.
        let whole = format!("{}\u{1F600}", "a".repeat(LOG_TEXT_MAX - 2));
        assert_eq!(body(json!(whole.clone())), whole);
    }

    #[test]
    fn an_array_is_cut_at_256_entries_with_an_entries_marker() {
        let items: Vec<String> = (0..257).map(|i| format!("e{i}")).collect();
        let out = body(json!(items));
        assert!(out.ends_with(" \u{2026}[truncated 1 entries]"), "{out}");
        assert!(out.contains(" e255 "));
        assert!(!out.contains("e256"));
        // Elements are sanitised and joined by one space.
        assert_eq!(body(json!(["a\nb", "c"])), "a\\nb c");
        assert_eq!(body(json!([])), "");
    }

    #[test]
    fn an_object_keeps_the_senders_key_order_and_pretty_prints_like_json_stringify() {
        let ordered: RendererMessage =
            serde_json::from_str(r#"{"stack":"s\nx","name":"N"}"#).expect("parses");
        assert_eq!(
            renderer_body(&ordered),
            "{\n  \"stack\": \"s\\nx\",\n  \"name\": \"N\"\n}"
        );
        assert_eq!(body(json!({})), "{}");
    }

    #[test]
    fn an_object_value_is_cut_at_the_text_cap_with_a_marker() {
        let sent = format!(
            r#"{{"stack":"{}","name":"N"}}"#,
            "a".repeat(LOG_TEXT_MAX + 1)
        );
        let out = renderer_body(&serde_json::from_str(&sent).expect("parses"));
        assert_eq!(
            out,
            format!(
                "{{\n  \"stack\": \"{}\u{2026}[truncated 1 bytes]\",\n  \"name\": \"N\"\n}}",
                "a".repeat(LOG_TEXT_MAX)
            )
        );
        // At the cap exactly: untouched.
        let whole = body(json!({"message": "a".repeat(LOG_TEXT_MAX)}));
        assert!(!whole.contains("truncated"), "cut at the cap exactly");
    }

    #[test]
    fn a_repeated_object_key_keeps_its_position_and_takes_the_last_value() {
        let m: RendererMessage =
            serde_json::from_str(r#"{"name":"a","stack":"b","name":"c"}"#).expect("parses");
        assert_eq!(
            m,
            RendererMessage::Object(vec![
                ("name".into(), "c".into()),
                ("stack".into(), "b".into())
            ])
        );
    }

    #[test]
    fn wrong_shapes_fail_to_deserialize() {
        assert!(parse(json!([1])).is_err(), "non-string array element");
        assert!(parse(json!(["a", null])).is_err());
        assert!(
            parse(json!({"other": "x"})).is_err(),
            "key outside name/message/stack"
        );
        assert!(parse(json!({"name": 1})).is_err(), "non-string value");
        assert!(parse(json!(7)).is_err());
        assert!(parse(json!(null)).is_err());
    }
}
