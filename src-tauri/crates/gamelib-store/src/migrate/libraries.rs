//! The GameInfo library migrations (Phase 70 D-12, gap G2), ported unchanged (D-12).
//!
//! Per GameInfo-bearing store, a v1 -> v2 step and a v2 -> v3 step that both run the schema-derived
//! strip against the item's runner schema. It removes undeclared keys at every depth (including inside
//! arrays and records), removes null where the member is optional, and removes optional members the
//! schema still rejects (these are regenerable caches). Loose boundaries (`dlcList`) are preserved.
//! v3 re-strips profiles the original strip already stamped v2.
//!
//! Pure and total, and never drops an entry: an unknown runner and a non-object item are untouched. The
//! schemas are the generated descriptor's (`schema`); nothing is copied by hand. TS also wrote the app
//! name and issue paths of a still-invalid entry to stderr; this crate has no log channel.

use crate::json::Json;
use crate::migrate::strip::{strip, StripOptions};
use crate::migrate::Step;
use crate::schema::{schemas, Node};

/// What a library item is stripped with: invalid optional members go, invalid elements are kept.
const ITEM: StripOptions = StripOptions {
    drop_invalid_optional: true,
    drop_invalid_elements: false,
};

/// Cleans an item against its runner schema. The runner is the item's own `runner`, falling back to the
/// file's store; an unknown runner or a non-object is returned as is.
fn strip_game_info(item: &Json, fallback_runner: &str) -> Json {
    let Json::Obj(obj) = item else {
        return item.clone();
    };
    let runner = obj
        .get("runner")
        .and_then(Json::as_str)
        .unwrap_or(fallback_runner);
    match schemas().game_info.for_runner(runner) {
        Some(node) => strip(node, item, ITEM),
        None => item.clone(),
    }
}

/// An `installed` item is an installed-info object, not a GameInfo.
fn strip_installed(item: &Json, node: &Node) -> Json {
    match item {
        Json::Obj(_) => strip(node, item, ITEM),
        _ => item.clone(),
    }
}

/// Replaces each listed top-level array with its items mapped through `strip_item`, keeping the key's
/// position. A key that is missing or not an array is left alone.
fn strip_arrays(file: &mut Json, keys: &[&str], strip_item: &dyn Fn(&Json) -> Json) {
    let Json::Obj(top) = file else { return };
    for key in keys {
        let Some(Json::Arr(list)) = top.get(key) else {
            continue;
        };
        let mapped: Vec<Json> = list.iter().map(strip_item).collect();
        top.insert_js(*key, Json::Arr(mapped));
    }
}

/// `libraryChain`: the same strip at v2 and again at v3.
fn two_step(prefix: &str, run: fn(&mut Json)) -> Vec<Step> {
    vec![
        Step::new(format!("{prefix}-v1-v2"), 2, move |file| {
            run(file);
            Ok(())
        }),
        Step::new(format!("{prefix}-v2-v3"), 3, move |file| {
            run(file);
            Ok(())
        }),
    ]
}

pub fn steam_library_chain() -> Vec<Step> {
    two_step("steam-library", |file| {
        strip_arrays(file, &["games"], &|i| strip_game_info(i, "steam"));
    })
}

pub fn gog_library_chain() -> Vec<Step> {
    two_step("gog-library", |file| {
        strip_arrays(file, &["games"], &|i| strip_game_info(i, "gog"));
    })
}

pub fn gog_installed_chain() -> Vec<Step> {
    two_step("gog-installed", |file| {
        strip_arrays(file, &["installed"], &|i| {
            strip_installed(i, &schemas().game_info_installed.gog)
        });
    })
}

pub fn legendary_library_chain() -> Vec<Step> {
    two_step("legendary-library", |file| {
        strip_arrays(file, &["library"], &|i| strip_game_info(i, "legendary"));
    })
}

pub fn nile_library_chain() -> Vec<Step> {
    two_step("nile-library", |file| {
        strip_arrays(file, &["library"], &|i| strip_game_info(i, "nile"));
    })
}

/// `sideload_apps/library` is unstamped on disk; the engine prepends the identity v0 -> v1 step.
pub fn sideload_library_chain() -> Vec<Step> {
    two_step("sideload-library", |file| {
        strip_arrays(file, &["games"], &|i| strip_game_info(i, "sideload"));
        strip_arrays(file, &["installed"], &|i| {
            strip_installed(i, &schemas().game_info_installed.sideload)
        });
    })
}

/// A retried or resumed queue or finished element re-sends its params through the strict install
/// schema, so `params.gameInfo` must be clean too.
fn strip_download_element(element: &Json) -> Json {
    let Json::Obj(top) = element else {
        return element.clone();
    };
    let Some(Json::Obj(params)) = top.get("params") else {
        return element.clone();
    };
    let Some(game_info) = params.get("gameInfo") else {
        return element.clone();
    };
    let fallback = params.get("runner").and_then(Json::as_str).unwrap_or("");
    let mut next_params = params.clone();
    next_params.insert_js("gameInfo", strip_game_info(game_info, fallback));
    let mut next = top.clone();
    next.insert_js("params", Json::Obj(next_params));
    Json::Obj(next)
}

pub fn download_manager_chain() -> Vec<Step> {
    two_step("download-manager", |file| {
        strip_arrays(file, &["queue", "finished"], &strip_download_element);
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::{parse, to_compact_bytes};

    fn run(chain: &[Step], doc: &str) -> String {
        let mut v = parse(doc.as_bytes()).unwrap();
        for step in chain {
            (step.run)(&mut v).unwrap();
        }
        String::from_utf8(to_compact_bytes(&v)).unwrap()
    }

    /// A valid nile GameInfo with `extra` (members, with a leading comma) appended.
    fn nile_item(extra: &str) -> String {
        format!(
            r#"{{"runner":"nile","app_name":"a","art_cover":"c","art_square":"s","install":{{}},"is_installed":false,"title":"T","canRunOffline":true{extra}}}"#
        )
    }

    #[test]
    fn an_item_loses_undeclared_keys_and_an_unknown_runner_or_non_object_is_untouched() {
        let rest = r#"{"runner":"humble","k":1},"text",null"#;
        let doc = format!(
            r#"{{"library":[{},{rest}]}}"#,
            nile_item(r#","stale":1,"extra":{"x":1}"#)
        );
        let out = run(&nile_library_chain(), &doc);
        assert_eq!(out, format!(r#"{{"library":[{},{rest}]}}"#, nile_item("")));
    }

    #[test]
    fn the_runner_falls_back_to_the_files_store_and_other_keys_stay_in_place() {
        // No `runner` on the item: the file's own store decides, so the item is stripped as nile.
        let doc = r#"{"a":1,"library":[{"app_name":"a","bogus":true}],"z":2}"#;
        let out = run(&nile_library_chain(), doc);
        assert_eq!(out, r#"{"a":1,"library":[{"app_name":"a"}],"z":2}"#);
    }

    #[test]
    fn a_missing_or_non_array_list_is_left_alone() {
        for doc in [r#"{}"#, r#"{"library":{"a":1}}"#, r#"{"library":null}"#] {
            assert_eq!(run(&nile_library_chain(), doc), doc);
        }
    }

    #[test]
    fn the_download_manager_strips_params_game_info_only_where_it_is_present() {
        let rest = r#"{"params":{"x":1}},{"other":1}"#;
        let doc = format!(
            r#"{{"queue":[{{"params":{{"runner":"nile","gameInfo":{}}},"n":1}},{rest}],"finished":[]}}"#,
            nile_item(r#","stale":1"#)
        );
        let out = run(&download_manager_chain(), &doc);
        let want = format!(
            r#"{{"queue":[{{"params":{{"runner":"nile","gameInfo":{}}},"n":1}},{rest}],"finished":[]}}"#,
            nile_item("")
        );
        assert_eq!(out, want);
    }

    #[test]
    fn the_sideload_chain_starts_from_an_unstamped_file_through_the_adoption_step() {
        use crate::migrate::Chains;
        let c = Chains::baseline();
        let from0 = c.pending("sideload_apps/library", 0);
        assert_eq!(from0.iter().map(|s| s.to).collect::<Vec<_>>(), [1, 2, 3]);
        assert!(from0[0].identity && !from0[1].identity);
    }
}
