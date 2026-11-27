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
//!   unescaped form, and an unknown name leaves the `{{name}}` token as written;
//! - [`Catalog::t_unescaped`] is the call that passes `interpolation: { escapeValue: false }`
//!   (a dialog message or the Humble expiry digest the TS renders verbatim): the same lookup, every
//!   `{{name}}` verbatim.
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
#[derive(Debug, Clone)]
pub struct Catalog {
    /// Lookup order, resolved language first; `en` only once when they coincide.
    chain: Vec<Namespaces>,
    /// The shipped directory name the catalog resolved to (`en` when the language is not shipped).
    language: &'static str,
}

impl Default for Catalog {
    fn default() -> Self {
        Catalog {
            chain: Vec::new(),
            language: FALLBACK,
        }
    }
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
        Catalog {
            chain,
            language: resolved,
        }
    }

    /// The resolved shipped directory name (`nb_NO` for `nb-NO`): `en` for an unshipped language and
    /// for the default catalog. What a caller formats locale-dependent text by, such as the Humble
    /// digest date.
    pub fn language(&self) -> &'static str {
        self.language
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

    /// Render `key` (optionally `ns:key`), falling back to `default`, with `params` interpolated
    /// and HTML-escaped (i18next's default `escapeValue: true`).
    pub fn t(&self, key: &str, default: &str, params: &Map<String, Value>) -> String {
        self.render(key, default, params, true)
    }

    /// [`Catalog::t`] for a call the TS makes with `interpolation: { escapeValue: false }`: params
    /// are placed verbatim. Use it only where the TS call does (a dialog message or an OS notification
    /// shown as text); the golden (`tests/fixtures/rendered.json`) flags each such row with
    /// `escapeValue: false`.
    pub fn t_unescaped(&self, key: &str, default: &str, params: &Map<String, Value>) -> String {
        self.render(key, default, params, false)
    }

    /// The one lookup both entry points share: namespace split, language chain, `en`, default.
    fn render(
        &self,
        key: &str,
        default: &str,
        params: &Map<String, Value>,
        escape: bool,
    ) -> String {
        let (namespace, path) = match key.split_once(':') {
            Some((ns, rest)) => (ns, rest),
            None => ("translation", key),
        };
        let template = self.lookup(namespace, path).unwrap_or(default);
        interpolate(template, params, escape)
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

/// Single-pass `{{name}}` / `{{- name}}` substitution (values are never re-scanned). `escape_values`
/// is whether a plain `{{name}}` is HTML-escaped; `{{- name}}` never is.
fn interpolate(template: &str, params: &Map<String, Value>, escape_values: bool) -> String {
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
                out.push_str(&if unescaped || !escape_values {
                    text
                } else {
                    escape(&text)
                });
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
    fn the_catalog_reports_its_resolved_language() {
        let none = std::env::temp_dir().join("gamelib-i18n-no-locales");
        assert_eq!(Catalog::load(&none, "de").language(), "de");
        assert_eq!(Catalog::load(&none, "nb-NO").language(), "nb_NO");
        assert_eq!(Catalog::load(&none, "xx").language(), "en");
        assert_eq!(Catalog::default().language(), "en");
    }

    #[test]
    fn interpolation_is_single_pass_and_escapes() {
        let p = params(&[("a", "{{b}}"), ("b", "x"), ("c", "<&>")]);
        assert_eq!(
            interpolate("{{a}} {{ c }} {{- c}} {{z}}", &p, true),
            "{{b}} &lt;&amp;&gt; <&> {{z}}"
        );
    }

    #[test]
    fn unescaped_interpolation_places_values_verbatim() {
        let p = params(&[("a", "{{b}}"), ("c", "<&>\"'/")]);
        assert_eq!(
            interpolate("{{a}} {{ c }} {{- c}} {{z}}", &p, false),
            "{{b}} <&>\"'/ <&>\"'/ {{z}}"
        );
    }

    #[test]
    fn t_and_t_unescaped_share_lookup_and_differ_only_in_escaping() {
        let catalog = Catalog::default();
        let p = params(&[("game", "A & B")]);
        assert_eq!(catalog.t("no.such.key", "Hi {{game}}", &p), "Hi A &amp; B");
        assert_eq!(
            catalog.t_unescaped("no.such.key", "Hi {{game}}", &p),
            "Hi A & B"
        );
        // A missing param and the inline default behave the same for both.
        assert_eq!(catalog.t("no.such.key", "Hi {{who}}", &p), "Hi {{who}}");
        assert_eq!(
            catalog.t_unescaped("no.such.key", "Hi {{who}}", &p),
            "Hi {{who}}"
        );
    }

    #[test]
    fn unterminated_token_is_left_alone() {
        assert_eq!(interpolate("a {{b", &Map::new(), true), "a {{b");
    }
}
