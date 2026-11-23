//! The apply guard and the visibility rule (`winetricksApplyGuard.ts`, `common/winetricks/visibility.ts`,
//! Phase 45 D-09/D-11/D-17, T-45-01/T-45-02/T-45-16): the shape-and-membership check of a renderer's
//! verb list before any verb reaches winetricks' argv. It is NOT shape-only: a verb of legal shape that
//! is absent from the real catalog (a stale or forged value) must never reach `install`, and a verb the
//! visibility rule hides (`annihilate`, an app, a benchmark, a needs-GUI verb) is refused even when a
//! stale or unfiltered catalog lists it.

use std::collections::{HashMap, HashSet};
use std::fmt;

use serde_json::Value;

use super::is_verb_shape;
use super::list_parse::Component;

/// The most verbs one apply may carry.
pub const WINETRICKS_APPLY_MAX_VERBS: usize = 100;

/// The categories that exist only on winetricks' screen 1 (install an application or a benchmark),
/// never on the per-game settings/dlls/fonts menus: hidden wholesale (D-09).
const HIDDEN_CATEGORIES: [&str; 2] = ["apps", "benchmarks"];

/// The interactive launcher verbs upstream seats as peers on its own screen-2 radiolist, minus the
/// three category names themselves. A bottle-wiper (`annihilate`) one search away from a novice is the
/// failure mode D-09 exists to prevent.
const HIDDEN_VERBS: [&str; 10] = [
    "annihilate",
    "winecfg",
    "regedit",
    "taskmgr",
    "explorer",
    "uninstaller",
    "winecmd",
    "wine_misc_exe",
    "shell",
    "folder",
];

/// A refused apply: the reason is the exact text the TS error carried (`WinetricksApplyRejected`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyRejected(pub String);

impl fmt::Display for ApplyRejected {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ApplyRejected {}

fn rejected(message: impl Into<String>) -> ApplyRejected {
    ApplyRejected(message.into())
}

/// D-09's visibility rule: hide the hidden categories, the hidden verbs and any verb the D-17
/// needs-GUI derivation flagged. Everything else (install-shaped settings verbs such as
/// `fontsmooth=*`, and the `bad`/`good` test verbs) stays visible.
pub fn is_visible_verb(verb: &str, category: &str, needs_gui: Option<bool>) -> bool {
    !(HIDDEN_CATEGORIES.contains(&category)
        || HIDDEN_VERBS.contains(&verb)
        || needs_gui == Some(true))
}

/// Order-preserving filter over a catalog.
pub fn filter_visible_catalog(catalog: Vec<Component>) -> Vec<Component> {
    catalog
        .into_iter()
        .filter(|c| is_visible_verb(&c.verb, &c.category, c.needs_gui))
        .collect()
}

/// JavaScript's `typeof` of a decoded JSON value.
fn js_typeof(value: &Value) -> &'static str {
    match value {
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        // `typeof null` is "object".
        Value::Null | Value::Object(_) | Value::Array(_) => "object",
    }
}

/// `assertWinetricksApplyPayload`: the verbs of a renderer's apply, validated against the catalog and
/// de-duplicated keeping the first occurrence's order. The checks run in the TS order, so the first
/// failing one names itself (the count is checked before the catalog, so an empty catalog still
/// reports the count).
pub fn assert_apply_payload(
    verbs: &Value,
    catalog: &[Component],
) -> Result<Vec<String>, ApplyRejected> {
    let Value::Array(items) = verbs else {
        return Err(rejected(format!(
            "winetricksApply: verbs must be an array, got {}",
            js_typeof(verbs)
        )));
    };
    if items.is_empty() {
        return Err(rejected("winetricksApply: verbs must not be empty"));
    }
    if items.len() > WINETRICKS_APPLY_MAX_VERBS {
        return Err(rejected(format!(
            "winetricksApply: verbs must not exceed {WINETRICKS_APPLY_MAX_VERBS} entries, got {}",
            items.len()
        )));
    }
    let strings: Option<Vec<&str>> = items.iter().map(Value::as_str).collect();
    let Some(strings) = strings else {
        return Err(rejected(
            "winetricksApply: verbs must be an array of strings",
        ));
    };
    if !strings.iter().all(|verb| is_verb_shape(verb)) {
        return Err(rejected(
            "winetricksApply: verbs must match the winetricks verb shape",
        ));
    }

    let by_verb: HashMap<&str, &Component> = catalog.iter().map(|c| (c.verb.as_str(), c)).collect();
    if !strings.iter().all(|verb| by_verb.contains_key(verb)) {
        return Err(rejected(
            "winetricksApply: verbs must be present in the catalog",
        ));
    }

    // D-09/D-17, T-45-16: `list_available` already returns only visible verbs; the matched entry is
    // re-checked anyway so a stale or unfiltered catalog can never smuggle `annihilate`, an app, a
    // benchmark or a needs-GUI verb through to `install`.
    let hidden = strings.iter().any(|verb| {
        !by_verb
            .get(verb)
            .is_some_and(|c| is_visible_verb(&c.verb, &c.category, c.needs_gui))
    });
    if hidden {
        return Err(rejected(
            "winetricksApply: verbs must be installable (hidden verbs are refused)",
        ));
    }

    // Dedupe keeping first-occurrence order (T-45-02's `['xact','xact','corefonts']` case).
    let mut seen: HashSet<&str> = HashSet::new();
    Ok(strings
        .into_iter()
        .filter(|verb| seen.insert(verb))
        .map(str::to_string)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn component(verb: &str, category: &str, needs_gui: Option<bool>) -> Component {
        Component {
            needs_gui,
            ..Component::new(verb, &format!("title of {verb}"), category, false)
        }
    }

    fn catalog() -> Vec<Component> {
        vec![
            component("vcrun2019", "dlls", None),
            component("corefonts", "fonts", None),
            component("d3dx9", "dlls", None),
            component("fontsmooth=rgb", "settings", None),
            component("foobar2000", "apps", None),
            component("annihilate", "settings", None),
            component("manualdll", "dlls", Some(true)),
            component("visibleflag", "dlls", Some(false)),
        ]
    }

    fn reason(verbs: Value) -> String {
        assert_apply_payload(&verbs, &catalog()).unwrap_err().0
    }

    #[test]
    fn a_valid_list_is_deduped_keeping_first_order() {
        let verbs = json!(["d3dx9", "vcrun2019", "d3dx9", "corefonts", "vcrun2019"]);
        assert_eq!(
            assert_apply_payload(&verbs, &catalog()).unwrap(),
            ["d3dx9", "vcrun2019", "corefonts"]
        );
        assert!(
            assert_apply_payload(&json!(["fontsmooth=rgb", "visibleflag"]), &catalog()).is_ok()
        );
    }

    #[test]
    fn each_rejection_has_its_reason() {
        assert_eq!(
            reason(json!("vcrun2019")),
            "winetricksApply: verbs must be an array, got string"
        );
        assert_eq!(
            reason(json!(null)),
            "winetricksApply: verbs must be an array, got object"
        );
        assert_eq!(
            reason(json!(3)),
            "winetricksApply: verbs must be an array, got number"
        );
        assert_eq!(
            reason(json!([])),
            "winetricksApply: verbs must not be empty"
        );
        assert_eq!(
            reason(json!(["vcrun2019", 3])),
            "winetricksApply: verbs must be an array of strings"
        );
        assert_eq!(
            reason(json!(["VCRUN2019"])),
            "winetricksApply: verbs must match the winetricks verb shape"
        );
        assert_eq!(
            reason(json!(["vcrun2019;rm"])),
            "winetricksApply: verbs must match the winetricks verb shape"
        );
        assert_eq!(
            reason(json!(["dotnet48"])),
            "winetricksApply: verbs must be present in the catalog"
        );
        let hidden = "winetricksApply: verbs must be installable (hidden verbs are refused)";
        for verb in ["foobar2000", "annihilate", "manualdll"] {
            assert_eq!(reason(json!([verb])), hidden, "{verb}");
        }
        assert_eq!(reason(json!(["vcrun2019", "annihilate"])), hidden);
    }

    /// T-45-01: exactly the maximum is accepted, one more is refused, and the count is checked before
    /// the catalog (an empty catalog still reports the count). A duplicate counts as an entry.
    #[test]
    fn the_maximum_is_an_entry_count_checked_before_the_catalog() {
        let many: Vec<String> = (0..=WINETRICKS_APPLY_MAX_VERBS)
            .map(|i| format!("v{i:03}"))
            .collect();
        let catalog: Vec<Component> = many.iter().map(|v| component(v, "dlls", None)).collect();
        let max = json!(&many[..WINETRICKS_APPLY_MAX_VERBS]);
        assert_eq!(
            assert_apply_payload(&max, &catalog).unwrap().len(),
            WINETRICKS_APPLY_MAX_VERBS
        );
        let over = json!(many);
        assert_eq!(
            assert_apply_payload(&over, &[]).unwrap_err().0,
            "winetricksApply: verbs must not exceed 100 entries, got 101"
        );
        let mut with_duplicate: Vec<&str> = many[..WINETRICKS_APPLY_MAX_VERBS - 1]
            .iter()
            .map(String::as_str)
            .collect();
        with_duplicate.push(&many[0]);
        let accepted = assert_apply_payload(&json!(with_duplicate), &catalog).unwrap();
        assert_eq!(accepted.len(), WINETRICKS_APPLY_MAX_VERBS - 1);
    }

    #[test]
    fn visibility_hides_categories_verbs_and_needs_gui() {
        assert!(!is_visible_verb("x", "apps", None));
        assert!(!is_visible_verb("x", "benchmarks", None));
        assert!(!is_visible_verb("shell", "settings", None));
        assert!(!is_visible_verb("x", "dlls", Some(true)));
        assert!(is_visible_verb("x", "dlls", Some(false)));
        assert!(is_visible_verb("fontsmooth=rgb", "settings", None));
        let kept = filter_visible_catalog(catalog());
        assert!(kept
            .iter()
            .all(|c| c.verb != "annihilate" && c.verb != "foobar2000"));
    }
}
