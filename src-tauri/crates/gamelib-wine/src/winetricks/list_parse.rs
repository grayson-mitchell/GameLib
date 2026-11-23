//! `winetricks list-all` into components (`winetricksListParse.ts`, quick-260915-ajd). Pure: no I/O.
//!
//! `winetricks_list_all` sources each category's metadata files in turn and echoes a
//! `===== <category> =====` header before each block. The `prefix` block is a trap (F-6): it
//! early-returns for `prefix|main|mkprefix` and echoes the category name list (`apps`, `dlls`, `fonts`,
//! `settings`, ...) one per line, which are NOT verbs but are lowercase words that pass the verb shape
//! test. It is skipped as a whole block, not filtered by shape.
//!
//! The TS patterns are hand-written here with their JavaScript semantics (`\s` is the ECMAScript
//! whitespace set, see `classify`); the vectors of `winetricks_pure.json` pin them.

use std::collections::HashSet;

use gamelib_engine::jsutil::{is_js_whitespace, js_trim};
use serde::{Deserialize, Serialize};

use super::is_verb_shape;

/// One verb of the catalog (`WinetricksComponent`). The fields after `cached` come from the script's
/// own metadata (`scriptMetadata`) and are absent until it is read; absent fields are left out of the
/// JSON, as the TS left them out of the object.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Component {
    pub verb: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub cached: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conflicts: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// `true` for a verb that needs a human at a download page (`w_download_manual`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub needs_gui: Option<bool>,
}

impl Component {
    pub fn new(verb: &str, title: &str, category: &str, cached: bool) -> Component {
        Component {
            verb: verb.to_string(),
            title: title.to_string(),
            category: category.to_string(),
            cached,
            publisher: None,
            year: None,
            media: None,
            conflicts: None,
            homepage: None,
            needs_gui: None,
        }
    }
}

const PREFIX_CATEGORY: &str = "prefix";

/// `/^===== (\S+) =====$/`: the category of a header line.
fn header_category(line: &str) -> Option<&str> {
    let middle = line.strip_prefix("===== ")?.strip_suffix(" =====")?;
    (!middle.is_empty() && !middle.contains(is_js_whitespace)).then_some(middle)
}

/// `.` of a pattern without the `s` flag stops at a line terminator.
fn has_line_terminator(text: &str) -> bool {
    text.contains(['\n', '\r', '\u{2028}', '\u{2029}'])
}

/// `/^(\S+)\s+(\S.*)$/`: the first token and a non-empty remainder (a real metadata line always has a
/// title after the verb column, so a bare single token is rejected here, not by the shape test).
fn first_token(line: &str) -> Option<(&str, &str)> {
    let end = line.find(is_js_whitespace)?;
    if end == 0 {
        return None;
    }
    let rest = line[end..].trim_start_matches(is_js_whitespace);
    // `(\S.*)$`: a non-space first character, and no line terminator before the end of the line.
    if rest.is_empty() || has_line_terminator(rest) {
        return None;
    }
    Some((&line[..end], rest))
}

/// `/\s*\[([^[\]]*)]$/`: a trailing bracketed flags group. Only the LAST `[` can start one (the group
/// may not contain `[` or `]`), and the match begins at the whitespace run before it.
fn trailing_flags(remainder: &str) -> Option<(usize, &str)> {
    let body = remainder.strip_suffix(']')?;
    let open = body.rfind('[')?;
    let flags = &body[open + 1..];
    if flags.contains(']') {
        return None;
    }
    let start = remainder[..open].trim_end_matches(is_js_whitespace).len();
    Some((start, flags))
}

/// `parseWinetricksListAll`: the verbs of `winetricks list-all`'s output (as the chunks it arrived
/// in), the first of a repeated verb kept.
pub fn parse_list_all(chunks: &[String]) -> Vec<Component> {
    let joined = chunks.concat();
    // `/\r?\n/`: a `\r` goes only when a `\n` follows it.
    let pieces: Vec<&str> = joined.split('\n').collect();
    let mut seen: HashSet<String> = HashSet::new();
    let mut components = Vec::new();
    let mut category: Option<String> = None;

    for (i, piece) in pieces.iter().enumerate() {
        let line = if i + 1 < pieces.len() {
            piece.strip_suffix('\r').unwrap_or(piece)
        } else {
            piece
        };
        // The header check MUST run before the verb shape test (F-11's ordering trap): `=====` is
        // built entirely from `=`, which is itself a legal verb character.
        if let Some(found) = header_category(line) {
            category = Some(found.to_string());
            continue;
        }
        let Some(current) = category.as_deref() else {
            continue;
        };
        if current == PREFIX_CATEGORY {
            continue;
        }
        let Some((verb, mut remainder)) = first_token(line) else {
            continue;
        };
        if !is_verb_shape(verb) {
            continue;
        }
        let mut cached = false;
        if let Some((start, flags)) = trailing_flags(remainder) {
            cached = flags
                .split(',')
                .map(js_trim)
                .filter(|flag| !flag.is_empty())
                .any(|flag| flag == "cached");
            remainder = &remainder[..start];
        }
        let title = js_trim(remainder);
        if !seen.insert(verb.to_string()) {
            continue;
        }
        components.push(Component::new(verb, title, current, cached));
    }
    components
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(text: &str) -> Vec<Component> {
        parse_list_all(&[text.to_string()])
    }

    #[test]
    fn the_prefix_block_is_skipped_as_a_whole() {
        let list = parse(
            "===== prefix =====\napps\ndlls\n===== dlls =====\nd3dx9   MS d3dx9 [downloadable]\n",
        );
        assert_eq!(list.len(), 1);
        assert_eq!(list[0], Component::new("d3dx9", "MS d3dx9", "dlls", false));
    }

    #[test]
    fn flags_set_cached_and_leave_the_title() {
        let list =
            parse("===== dlls =====\nvcrun2019   Visual C++ [downloadable,cached]\nx  t []\n");
        assert!(list[0].cached);
        assert_eq!(list[0].title, "Visual C++");
        assert_eq!(list[1].title, "t");
        assert!(!list[1].cached);
    }

    #[test]
    fn a_line_before_any_header_and_a_bare_token_are_ignored() {
        let list = parse("vcrun2019   ignored\n===== dlls =====\nvcrun2019\nd3dx9   title\n");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].verb, "d3dx9");
    }

    #[test]
    fn a_line_split_across_chunks_is_one_line_and_crlf_is_one_break() {
        let chunks = [
            "===== dlls =====\r\nvcrun20".to_string(),
            "19    Visual C++ [downloadable]\r\nd3dx9   ".to_string(),
            "title [downloadable]\r\n".to_string(),
        ];
        let list = parse_list_all(&chunks);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].verb, "vcrun2019");
        assert_eq!(list[1].title, "title");
    }

    #[test]
    fn the_first_of_a_repeated_verb_wins_and_uppercase_is_refused() {
        let list = parse(
            "===== dlls =====\nvcrun2019   first\n===== fonts =====\nvcrun2019   second\nVCRUN   up\nvc.run   dot\n",
        );
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "first");
    }

    #[test]
    fn a_header_lookalike_is_not_a_verb() {
        let list = parse("===== dlls =====\n===== x =====\n=====  no\nvcrun2019   title\n");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].category, "x");
    }

    #[test]
    fn a_component_serialises_without_its_absent_fields() {
        let value = serde_json::to_value(Component::new("a", "t", "dlls", true)).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"verb": "a", "title": "t", "category": "dlls", "cached": true})
        );
    }
}
