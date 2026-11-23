//! The `w_metadata` and `w_download_manual` readers of the winetricks script
//! (`common/winetricks/metadata.ts`, Phase 45 D-19/D-17). Pure and dependency-free: the install path
//! reads the script file and hands the text here.
//!
//! One linear pass per function over the script's lines. A block ends on the first line that does not
//! end with a trailing backslash; unknown or malformed lines inside a block are skipped, never an
//! error (T-45-13: no pattern here can backtrack over an ~850 KB script, they are all anchored scans).

use std::collections::{BTreeSet, HashMap};

use gamelib_engine::jsutil::is_js_whitespace;
use serde_json::{json, Value};

/// The metadata fields a `w_metadata` block carries, named exactly so `title_bg="..."` (a localised
/// continuation line) never matches `title` (Pitfall 3 / D-19).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Field {
    Title,
    Publisher,
    Year,
    Media,
    Conflicts,
    Homepage,
}

impl Field {
    fn name(self) -> &'static str {
        match self {
            Field::Title => "title",
            Field::Publisher => "publisher",
            Field::Year => "year",
            Field::Media => "media",
            Field::Conflicts => "conflicts",
            Field::Homepage => "homepage",
        }
    }
}

const FIELDS: [(&str, Field); 6] = [
    ("title", Field::Title),
    ("publisher", Field::Publisher),
    ("year", Field::Year),
    ("media", Field::Media),
    ("conflicts", Field::Conflicts),
    ("homepage", Field::Homepage),
];

/// One verb's metadata (`WinetricksVerbMetadata`). The order the fields were first assigned in is kept,
/// because the TS object had it (the pinned fixture vector hashes its `JSON.stringify`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerbMetadata {
    pub verb: String,
    pub category: String,
    pub title: Option<String>,
    pub publisher: Option<String>,
    pub year: Option<String>,
    pub media: Option<String>,
    pub conflicts: Option<Vec<String>>,
    pub homepage: Option<String>,
    order: Vec<Field>,
}

impl VerbMetadata {
    fn new(verb: &str, category: &str) -> VerbMetadata {
        VerbMetadata {
            verb: verb.to_string(),
            category: category.to_string(),
            title: None,
            publisher: None,
            year: None,
            media: None,
            conflicts: None,
            homepage: None,
            order: Vec::new(),
        }
    }

    fn set(&mut self, field: Field, value: &str) {
        match field {
            Field::Title => self.title = Some(value.to_string()),
            Field::Publisher => self.publisher = Some(value.to_string()),
            Field::Year => self.year = Some(value.to_string()),
            Field::Media => self.media = Some(value.to_string()),
            Field::Conflicts => {
                self.conflicts = Some(
                    value
                        .split(is_js_whitespace)
                        .filter(|word| !word.is_empty())
                        .map(str::to_string)
                        .collect(),
                );
            }
            Field::Homepage => self.homepage = Some(value.to_string()),
        }
        // A field assigned again keeps its first position, as a JavaScript object does.
        if !self.order.contains(&field) {
            self.order.push(field);
        }
    }

    fn field_value(&self, field: Field) -> Value {
        match field {
            Field::Title => json!(self.title),
            Field::Publisher => json!(self.publisher),
            Field::Year => json!(self.year),
            Field::Media => json!(self.media),
            Field::Conflicts => json!(self.conflicts),
            Field::Homepage => json!(self.homepage),
        }
    }

    /// The object as JSON (key order is not significant here).
    pub fn to_value(&self) -> Value {
        let mut object = serde_json::Map::new();
        object.insert("verb".into(), json!(self.verb));
        object.insert("category".into(), json!(self.category));
        for field in &self.order {
            object.insert(field.name().into(), self.field_value(*field));
        }
        Value::Object(object)
    }

    /// The object as `JSON.stringify` writes it: `verb`, `category`, then the fields in the order
    /// they were first assigned.
    pub fn to_json_text(&self) -> String {
        let mut parts = vec![
            format!("\"verb\":{}", json!(self.verb)),
            format!("\"category\":{}", json!(self.category)),
        ];
        for field in &self.order {
            parts.push(format!("\"{}\":{}", field.name(), self.field_value(*field)));
        }
        format!("{{{}}}", parts.join(","))
    }
}

/// Per-verb metadata in script (insertion) order: a verb seen twice keeps its first position and takes
/// the later block, like a `Map`'s `set`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MetadataMap {
    entries: Vec<VerbMetadata>,
    index: HashMap<String, usize>,
}

impl MetadataMap {
    fn insert(&mut self, meta: VerbMetadata) -> usize {
        match self.index.get(&meta.verb) {
            Some(&at) => {
                self.entries[at] = meta;
                at
            }
            None => {
                self.index.insert(meta.verb.clone(), self.entries.len());
                self.entries.push(meta);
                self.entries.len() - 1
            }
        }
    }

    pub fn get(&self, verb: &str) -> Option<&VerbMetadata> {
        self.index.get(verb).map(|&at| &self.entries[at])
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &VerbMetadata> {
        self.entries.iter()
    }
}

/// What the script says about its verbs: the metadata and the needs-GUI set (`ScriptMetadata`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ScriptMetadata {
    pub by_verb: MetadataMap,
    pub needs_gui: BTreeSet<String>,
}

impl ScriptMetadata {
    /// Both readers over the script text.
    pub fn from_script(text: &str) -> ScriptMetadata {
        ScriptMetadata {
            by_verb: parse_metadata(text),
            needs_gui: derive_needs_gui_verbs(text),
        }
    }
}

/// `text.split(/\r?\n/)`: a `\r` goes only when a `\n` follows it.
fn script_lines(text: &str) -> Vec<&str> {
    let pieces: Vec<&str> = text.split('\n').collect();
    let last = pieces.len() - 1;
    pieces
        .into_iter()
        .enumerate()
        .map(|(i, piece)| {
            if i < last {
                piece.strip_suffix('\r').unwrap_or(piece)
            } else {
                piece
            }
        })
        .collect()
}

/// `/^w_metadata\s+(\S+)\s+(\S+)/`: the verb and category of a block's header line.
fn header(line: &str) -> Option<(&str, &str)> {
    let rest = line.strip_prefix("w_metadata")?;
    let after = rest.trim_start_matches(is_js_whitespace);
    if after.len() == rest.len() {
        return None;
    }
    let verb_end = after.find(is_js_whitespace)?;
    if verb_end == 0 {
        return None;
    }
    let tail = after[verb_end..].trim_start_matches(is_js_whitespace);
    if tail.len() == after.len() - verb_end {
        return None;
    }
    let category_end = tail.find(is_js_whitespace).unwrap_or(tail.len());
    if category_end == 0 {
        return None;
    }
    Some((&after[..verb_end], &tail[..category_end]))
}

/// `/^\s+(title|publisher|year|media|conflicts|homepage)="([^"]*)"/`: one field line of a block.
fn field_line(line: &str) -> Option<(Field, &str)> {
    let rest = line.trim_start_matches(is_js_whitespace);
    if rest.len() == line.len() {
        return None;
    }
    for (name, field) in FIELDS {
        if let Some(value) = rest
            .strip_prefix(name)
            .and_then(|tail| tail.strip_prefix("=\""))
        {
            let close = value.find('"')?;
            return Some((field, &value[..close]));
        }
    }
    None
}

/// `parseWinetricksMetadata`: one linear pass over the script's lines.
pub fn parse_metadata(script_text: &str) -> MetadataMap {
    let mut result = MetadataMap::default();
    let mut current: Option<usize> = None;
    let mut in_block = false;

    for line in script_lines(script_text) {
        if in_block {
            if let Some(at) = current {
                if let Some((field, value)) = field_line(line) {
                    result.entries[at].set(field, value);
                }
                if !line.ends_with('\\') {
                    in_block = false;
                    current = None;
                }
                continue;
            }
        }
        if let Some((verb, category)) = header(line) {
            let at = result.insert(VerbMetadata::new(verb, category));
            in_block = line.ends_with('\\');
            current = in_block.then_some(at);
        }
    }
    result
}

/// `/^load_([A-Za-z0-9_]+)\(\)\s*$/`: the verb whose `load_<verb>()` function opens on this line.
fn load_function(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("load_")?;
    let end = rest
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    let tail = rest[end..].strip_prefix("()")?;
    tail.chars().all(is_js_whitespace).then_some(&rest[..end])
}

/// `/^\s+w_download_manual\s/`.
fn manual_download(line: &str) -> bool {
    let rest = line.trim_start_matches(is_js_whitespace);
    rest.len() != line.len()
        && rest
            .strip_prefix("w_download_manual")
            .and_then(|tail| tail.chars().next())
            .is_some_and(is_js_whitespace)
}

/// `deriveNeedsGuiVerbs`: the verbs whose `load_<verb>()` body calls `w_download_manual` (D-17). The
/// body runs until a `}` at column 0 (winetricks' own formatting). Never reads the `media` field
/// (Pitfall 3: `gdiplus_winxp` and `protectionid` both set `media="manual_download"` but call the
/// ordinary `w_download`).
pub fn derive_needs_gui_verbs(script_text: &str) -> BTreeSet<String> {
    let mut result = BTreeSet::new();
    let mut current: Option<&str> = None;
    for line in script_lines(script_text) {
        if let Some(verb) = load_function(line) {
            current = Some(verb);
            continue;
        }
        if let Some(verb) = current {
            if manual_download(line) {
                result.insert(verb.to_string());
            }
            if line == "}" {
                current = None;
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_full_block_is_read_field_by_field() {
        let map = parse_metadata(
            "w_metadata vcrun2019 dlls \\\n    title=\"Visual C++\" \\\n    year=\"2019\" \\\n    conflicts=\"vcrun2022  vcrun2017\" \\\n    homepage=\"https://example.invalid/\"\n",
        );
        let meta = map.get("vcrun2019").unwrap();
        assert_eq!(meta.category, "dlls");
        assert_eq!(meta.title.as_deref(), Some("Visual C++"));
        assert_eq!(
            meta.conflicts.as_deref(),
            Some(&["vcrun2022".to_string(), "vcrun2017".to_string()][..])
        );
        assert_eq!(
            meta.to_json_text(),
            "{\"verb\":\"vcrun2019\",\"category\":\"dlls\",\"title\":\"Visual C++\",\"year\":\"2019\",\"conflicts\":[\"vcrun2022\",\"vcrun2017\"],\"homepage\":\"https://example.invalid/\"}"
        );
    }

    #[test]
    fn a_localised_title_and_a_stray_field_do_not_count() {
        let map = parse_metadata(
            "    title=\"not in a block\"\nw_metadata a dlls \\\n    title_bg=\"x\" \\\n    colour=\"red\" \\\n    title=\"A\"\nw_metadata b fonts\n",
        );
        assert_eq!(map.len(), 2);
        assert_eq!(map.get("a").unwrap().title.as_deref(), Some("A"));
        assert_eq!(map.get("b").unwrap().title, None);
        let order: Vec<&str> = map.iter().map(|m| m.verb.as_str()).collect();
        assert_eq!(order, ["a", "b"]);
    }

    #[test]
    fn a_block_ends_on_a_line_without_a_trailing_backslash() {
        let map = parse_metadata(
            "w_metadata a dlls \\\n    title=\"A\"\n    year=\"2000\"\nw_metadata b fonts \\\n    title=\"B\"\n",
        );
        assert_eq!(map.get("a").unwrap().year, None);
        assert_eq!(map.get("b").unwrap().title.as_deref(), Some("B"));
    }

    #[test]
    fn crlf_lines_are_read() {
        let map = parse_metadata(
            "w_metadata d3dx9 dlls \\\r\n    title=\"d3dx9\" \\\r\n    year=\"2010\"\r\n",
        );
        assert_eq!(map.get("d3dx9").unwrap().year.as_deref(), Some("2010"));
    }

    #[test]
    fn needs_gui_comes_from_manual_downloads_in_load_functions_only() {
        let set = derive_needs_gui_verbs(
            "load_one()\n{\n    w_download_manual https://x.invalid/a a.exe 00\n}\nload_two()\n{\n    w_download https://x.invalid/b b.exe 00\n}\n    w_download_manual stray\n",
        );
        assert_eq!(set.into_iter().collect::<Vec<_>>(), ["one"]);
        let media_only = derive_needs_gui_verbs(
            "w_metadata g dlls \\\n    media=\"manual_download\"\nload_g()\n{\n    w_download https://x a 00\n}\n",
        );
        assert!(media_only.is_empty());
    }
}
