//! Rust translation module for the notifications the Steam polls send.
//!
//! Reusable by any Rust slice (Phase 80 D-03). [`Catalog::t`] renders `{key, default, params}` to
//! the same string the sidecar's i18next renders today, for every shipped locale; the proof is
//! `tests/render.rs` against `tests/fixtures/rendered.json`, generated from the real i18next by
//! `meta/genI18nGolden.ts` (and kept fresh by `src/backend/__tests__/i18nGolden.test.ts`).
//!
//! Behaviour ported from the sidecar's i18next init (`src/backend/sidecar/bootstrap.ts`):
//!
//! - language resolution is `common/languages.ts`: a shipped code (`nb_NO`) or its BCP-47 tag
//!   (`nb-NO`) selects that locale directory; anything else (unknown, empty) is `en`;
//! - only the `translation` (default) and `gamelib` namespaces are loaded; `ns:key` selects one;
//! - lookup walks the dotted key in the resolved language, then `en`, then the call's inline
//!   default, never the raw key; empty strings count as missing (`returnEmptyString: false`);
//! - `{{name}}` interpolation is a single pass with i18next's default HTML escaping of `& < > " ' /`
//!   (`escapeValue: true`: the backend init sets no `interpolation` option), `{{- name}}` is the
//!   unescaped form, and an unknown name leaves the `{{name}}` token as written.
//!
//! Not ported: `{{name, format}}` formatters, `$t()` nesting and plural suffixes; none of the
//! poll notifications use them.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde_json::{Map, Value};

/// The shipped locale directories (`supportedLanguages` in `src/common/languages.ts`).
pub const SHIPPED_LANGUAGES: &[&str] = &[
    "ar", "az", "be", "bg", "bs", "ca", "cs", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fr",
    "ga", "gl", "he", "hr", "hu", "ja", "ko", "id", "it", "lt", "ml", "nb_NO", "nl", "pl", "pt",
    "pt_BR", "ro", "ru", "sr", "sk", "sv", "ta", "tr", "uk", "vi", "zh_Hans", "zh_Hant",
];

const NAMESPACES: &[&str] = &["translation", "gamelib"];
const FALLBACK: &str = "en";

/// Resolve a language setting to a shipped directory name, `en` when it is not shipped.
/// Mirrors `localeFileSegments(toShippedLanguage(language))`: the BCP-47 tag (`nb-NO`) and the
/// directory name (`nb_NO`) both resolve to the directory.
fn resolve_language(language: &str) -> &'static str {
    SHIPPED_LANGUAGES
        .iter()
        .copied()
        .find(|shipped| *shipped == language || shipped.replace('_', "-") == language)
        .unwrap_or(FALLBACK)
}

type Namespaces = HashMap<&'static str, Value>;

/// A loaded set of catalogs: the resolved language and the `en` fallback.
#[derive(Debug, Clone, Default)]
pub struct Catalog {
    /// Lookup order, resolved language first; `en` only once when they coincide.
    chain: Vec<Namespaces>,
}

fn load_language(locales_dir: &Path, language: &str) -> Namespaces {
    let mut out = Namespaces::new();
    for ns in NAMESPACES {
        let path = locales_dir.join(language).join(format!("{ns}.json"));
        // A missing or malformed file is skipped (T-80-07): the lookup falls back to en/default.
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                out.insert(ns, value);
            }
        }
    }
    out
}

impl Catalog {
    /// Load the catalogs for `language` (a shipped code or BCP-47 tag) from `locales_dir`
    /// (`public/locales`). Never fails: absent files simply produce an empty catalog.
    pub fn load(locales_dir: &Path, language: &str) -> Catalog {
        let resolved = resolve_language(language);
        let mut chain = vec![load_language(locales_dir, resolved)];
        if resolved != FALLBACK {
            chain.push(load_language(locales_dir, FALLBACK));
        }
        Catalog { chain }
    }

    fn lookup(&self, namespace: &str, path: &str) -> Option<&str> {
        for namespaces in &self.chain {
            let Some(mut node) = namespaces.get(namespace) else {
                continue;
            };
            let mut found = true;
            for segment in path.split('.') {
                match node.get(segment) {
                    Some(next) => node = next,
                    None => {
                        found = false;
                        break;
                    }
                }
            }
            if !found {
                // i18next also tries the whole remaining path as one flat key.
                match namespaces.get(namespace).and_then(|root| root.get(path)) {
                    Some(flat) => node = flat,
                    None => continue,
                }
            }
            if let Some(text) = node.as_str() {
                if !text.is_empty() {
                    return Some(text);
                }
            }
        }
        None
    }

    /// Render `key` (optionally `ns:key`), falling back to `default`, with `params` interpolated.
    pub fn t(&self, key: &str, default: &str, params: &Map<String, Value>) -> String {
        let (namespace, path) = match key.split_once(':') {
            Some((ns, rest)) => (ns, rest),
            None => ("translation", key),
        };
        let template = self.lookup(namespace, path).unwrap_or(default);
        interpolate(template, params)
    }
}

fn escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            '/' => out.push_str("&#x2F;"),
            other => out.push(other),
        }
    }
    out
}

fn param_text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Single-pass `{{name}}` / `{{- name}}` substitution (values are never re-scanned).
fn interpolate(template: &str, params: &Map<String, Value>) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find("{{") {
        let Some(len) = rest[start + 2..].find("}}") else {
            break;
        };
        let end = start + 2 + len;
        out.push_str(&rest[..start]);
        let token = &rest[start..end + 2];
        let inner = rest[start + 2..end].trim();
        let (unescaped, name) = match inner.strip_prefix('-') {
            Some(name) => (true, name.trim()),
            None => (false, inner),
        };
        match params.get(name) {
            Some(value) => {
                let text = param_text(value);
                out.push_str(&if unescaped { text } else { escape(&text) });
            }
            None => out.push_str(token),
        }
        rest = &rest[end + 2..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(pairs: &[(&str, &str)]) -> Map<String, Value> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), Value::String((*v).to_string())))
            .collect()
    }

    #[test]
    fn resolves_directory_and_tag_forms() {
        assert_eq!(resolve_language("nb_NO"), "nb_NO");
        assert_eq!(resolve_language("nb-NO"), "nb_NO");
        assert_eq!(resolve_language("xx"), "en");
        assert_eq!(resolve_language(""), "en");
    }

    #[test]
    fn interpolation_is_single_pass_and_escapes() {
        let p = params(&[("a", "{{b}}"), ("b", "x"), ("c", "<&>")]);
        assert_eq!(
            interpolate("{{a}} {{ c }} {{- c}} {{z}}", &p),
            "{{b}} &lt;&amp;&gt; <&> {{z}}"
        );
    }

    #[test]
    fn unterminated_token_is_left_alone() {
        assert_eq!(interpolate("a {{b", &Map::new()), "a {{b");
    }
}
