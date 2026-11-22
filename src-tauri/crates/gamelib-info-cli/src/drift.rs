//! The D-12 live drift check: `gamelib-info-cli drift`.
//!
//! The goldens in `gamelib-info/tests/fixtures/golden` were recorded from the live services once, so
//! they cannot notice a service changing afterwards. This subcommand asks the live endpoints the same
//! questions and compares the SHAPE of what comes back to the shape of the golden. It is run by hand:
//! no test runs it (a test that needs the network is a flaky test), no CI job runs it, and it never
//! touches the Keychain (the context carries the environment key source, which reads only the two
//! `GAMELIB_INFO_*` variables).
//!
//! A case is one row of [`CASES`]: the ops that set the profile up, the op under test, where its
//! result is read (the op's own answer, or a file the op wrote), and the golden value to compare it
//! with. Later slices add their rows to the table.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::process::exit;
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::http::{Http, ReqwestHttp};
use gamelib_info::secrets::{EnvSecretSource, SecretSource};
use gamelib_store::host::StoreHost;
use serde_json::Value;

/// Where a case reads the live result.
#[derive(Clone, Copy)]
enum Read {
    /// The op's own answer.
    Answer,
    /// A file the op wrote into the profile's app folder, parsed as JSON.
    File(&'static str),
}

/// How a live result is held against its golden.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Mode {
    /// Every key path the golden carries is in the live result (a whole document against a whole
    /// document: a field the service dropped or retyped is the drift).
    Whole,
    /// The live result is ONE entry of the list the golden holds: every key path of the entry is in
    /// the golden's entries (merged), because one entry rarely carries every optional key.
    EntryOfList,
    /// The live result is a document whose key set depends on what was asked (a rating map keyed by the
    /// games sent): every key path of the live result is in the golden with an overlapping type, and the
    /// golden may carry more.
    Subset,
}

/// One live case. `golden` is a path under the crate's `tests/fixtures/golden`, and `pointer` a JSON
/// pointer into that file (`""` for the whole file).
struct Case {
    id: &'static str,
    slice: &'static str,
    platform: Platform,
    /// Ops run first, in order, against the same profile: `(op, JSON array of args)`.
    setup: &'static [(&'static str, &'static str)],
    op: &'static str,
    args: &'static str,
    read: Read,
    golden: &'static str,
    pointer: &'static str,
    mode: Mode,
    /// The environment variable that must hold an API key for the case to run. Without it the case
    /// is SKIPPED with a printed reason (never a failure: the live service refuses an unkeyed call).
    needs_env: Option<&'static str>,
}

/// The variable the SteamGridDB cases read their key from.
const SGDB_KEY_VAR: &str = "GAMELIB_INFO_SGDB_KEY";

/// The variable the IsThereAnyDeal cases read their key from (the user-key slot of the context).
const ITAD_KEY_VAR: &str = "GAMELIB_INFO_ITAD_KEY";

/// The fixed case table. Anticheat's: the data file each platform downloads, and one lookup over the
/// file just downloaded. The lookup's empty namespace matches the first entry that carries an Epic
/// namespace (`"".includes` is always true), so it needs no hard-coded game; its answer is one entry
/// of the list, so it is held against the downloaded list's golden entries, not against the one
/// synthetic entry of the lookup golden.
const CASES: &[Case] = &[
    Case {
        id: "anticheat-download-mac",
        slice: "anticheat",
        platform: Platform::Mac,
        setup: &[],
        op: "info_anticheat_download",
        args: "[{}]",
        read: Read::File("areweanticheatyet.json"),
        golden: "anticheat/expected/download-no-local-file-mac/after/areweanticheatyet.json",
        pointer: "",
        mode: Mode::Whole,
        needs_env: None,
    },
    Case {
        id: "anticheat-download-linux",
        slice: "anticheat",
        platform: Platform::Linux,
        setup: &[],
        op: "info_anticheat_download",
        args: "[{}]",
        read: Read::File("areweanticheatyet.json"),
        golden: "anticheat/expected/download-no-local-file-linux/after/areweanticheatyet.json",
        pointer: "",
        mode: Mode::Whole,
        needs_env: None,
    },
    Case {
        id: "anticheat-lookup",
        slice: "anticheat",
        platform: Platform::Linux,
        setup: &[("info_anticheat_download", "[{}]")],
        op: "info_anticheat_info",
        args: r#"[{"appNamespace":""}]"#,
        read: Read::Answer,
        golden: "anticheat/expected/download-no-local-file-linux/after/areweanticheatyet.json",
        pointer: "",
        mode: Mode::EntryOfList,
        needs_env: None,
    },
    // SteamGridDB (86-15): the three read ops over the live service, each held against the shape the
    // operator's 86-07 recording showed. They need the operator's own key in GAMELIB_INFO_SGDB_KEY and
    // are skipped without it. The game is Celeste, SteamGridDB id 13136, the first answer of the
    // recorded search; the grids and heroes cases run the search first, as the recordings did.
    Case {
        id: "steamgrid-search",
        slice: "steamgrid",
        platform: Platform::Linux,
        setup: &[],
        op: "info_steamgrid_search",
        args: r#"[{"query":"Celeste"}]"#,
        read: Read::Answer,
        golden: "steamgrid/expected/live-search-celeste/result.json",
        pointer: "/ops/0/ok",
        mode: Mode::Whole,
        needs_env: Some(SGDB_KEY_VAR),
    },
    Case {
        id: "steamgrid-grids",
        slice: "steamgrid",
        platform: Platform::Linux,
        setup: &[("info_steamgrid_search", r#"[{"query":"Celeste"}]"#)],
        op: "info_steamgrid_grids",
        args: r#"[{"gameId":13136,"styles":["alternate"],"dimensions":["460x215","920x430"]}]"#,
        read: Read::Answer,
        golden: "steamgrid/expected/live-grids-styles-and-dimensions/result.json",
        pointer: "/ops/1/ok",
        mode: Mode::Whole,
        needs_env: Some(SGDB_KEY_VAR),
    },
    Case {
        id: "steamgrid-heroes",
        slice: "steamgrid",
        platform: Platform::Linux,
        setup: &[("info_steamgrid_search", r#"[{"query":"Celeste"}]"#)],
        op: "info_steamgrid_heroes",
        args: r#"[{"gameId":13136}]"#,
        read: Read::Answer,
        golden: "steamgrid/expected/live-heroes/result.json",
        pointer: "/ops/1/ok",
        mode: Mode::Whole,
        needs_env: Some(SGDB_KEY_VAR),
    },
    // IsThereAnyDeal (86-17, D-12): search, deals and Steam gids over the live service, each held
    // against the shape the operator's 86-07 recording showed (the golden's `ok` is the op's whole
    // answer). They need the operator's own key in GAMELIB_INFO_ITAD_KEY and are skipped without it.
    // The search is "portal" in the US; the deals case asks for Portal's own ITAD id; the gids case
    // asks for the five Steam app ids of the recording, so a mapping ITAD drops shows up as a missing
    // key path.
    Case {
        id: "itad-search",
        slice: "itad",
        platform: Platform::Linux,
        setup: &[],
        op: "info_itad_search",
        args: r#"[{"query":"portal","country":"US"}]"#,
        read: Read::Answer,
        golden: "storeSearch/expected/live-search-portal-us/result.json",
        pointer: "/ops/0/ok",
        mode: Mode::Whole,
        needs_env: Some(ITAD_KEY_VAR),
    },
    Case {
        id: "itad-deals",
        slice: "itad",
        platform: Platform::Linux,
        setup: &[],
        op: "info_itad_deals",
        args: r#"[{"gameId":"018d937f-1749-73f8-bf5a-8e0aa3cdd9ff","country":"US"}]"#,
        read: Read::Answer,
        golden: "storeSearch/expected/live-deals-portal-us/result.json",
        pointer: "/ops/0/ok",
        mode: Mode::Whole,
        needs_env: Some(ITAD_KEY_VAR),
    },
    Case {
        id: "itad-gids",
        slice: "itad",
        platform: Platform::Linux,
        setup: &[],
        op: "info_itad_gids",
        args: r#"[{"appIds":["220","400","292030","1245620","99999999"]}]"#,
        read: Read::Answer,
        golden: "storeSearch/expected/live-gids-five-appids/result.json",
        pointer: "/ops/0/ok",
        mode: Mode::Whole,
        needs_env: Some(ITAD_KEY_VAR),
    },
    // GOG discounts (86-18, D-12): the live catalog's pages, with no flags and so no token (the token is
    // the one input TS collects, D-24; the catalog itself needs no key). The golden is the 5-product
    // sample of the 86-06 synthetic cases, which were cloned from the live first page: the live list
    // (30 pages of 48) must carry every key path of those products. The live case's own golden holds
    // only a count, the ids and a digest, so it has no shape to compare.
    Case {
        id: "gog-discounts",
        slice: "discounts",
        platform: Platform::Linux,
        setup: &[],
        op: "info_gog_discounts",
        args: r#"[{"locale":{"countryCode":"US","locale":"en-US","currencyCode":"USD"},"hideOwned":false,"wishlistOnly":false,"token":null}]"#,
        read: Read::Answer,
        golden: "discounts/expected/synthetic-hide-owned-no-credentials/result.json",
        pointer: "/products",
        mode: Mode::Whole,
        needs_env: None,
    },
    // The CrossOver index (86-19, D-12): the live release asset, fetched the way the app fetches it (the
    // rating map for three fixed games on macOS makes the one request). The first case holds the cache
    // file the op wrote (the validated, stored index) against the golden of the live fetch, so a field the
    // service dropped from the entries, such as `steamid`, is a missing key path; the second holds the
    // rating map itself against the golden's, where each game's value must keep its type (a rated game
    // that stops being rated is `null` where the golden has a number). The games are Elden Ring and The
    // Witcher 3 (Steam ids that join exactly) and one title that is nowhere in the index.
    Case {
        id: "crossover-index-fetch",
        slice: "crossover",
        platform: Platform::Mac,
        setup: &[],
        op: "info_crossover_rating_map",
        args: THREE_GAMES,
        read: Read::File("store_cache/crossover_index.json"),
        golden: "crossover/expected/live-fresh-fetch-mac/after/store_cache/crossover_index.json",
        pointer: "",
        mode: Mode::Whole,
        needs_env: None,
    },
    Case {
        id: "crossover-rating-map",
        slice: "crossover",
        platform: Platform::Mac,
        setup: &[],
        op: "info_crossover_rating_map",
        args: THREE_GAMES,
        read: Read::Answer,
        golden: "crossover/expected/live-fresh-fetch-mac/result.json",
        pointer: "/ops/13/result",
        mode: Mode::Subset,
        needs_env: None,
    },
    // The wiki game info lookup (86-22, D-12, Pitfall 11): the whole aggregator over the live sources
    // (PCGamingWiki, AppleGamingWiki, GamesDB, HowLongToBeat, gog.com, ProtonDB, the Steam Deck report, the
    // CodeWeavers index and umu), asked for the three titles of the 86-06 goldens on every platform the
    // goldens cover, each held against that golden's result. A source that answers Rust 403 where the TS
    // got 200 empties its part of the result, which is a missing key path here (the golden's
    // `pcgamingwiki`, `howlongtobeat`, `steamInfo` and so on). They need no key. The platform is a
    // context parameter, so a run from one machine also asks the Linux-only sources.
    wiki_case(
        "wiki-steam-mac",
        Platform::Mac,
        STEAM_GAME,
        "wiki/expected/live-steam-mac/result.json",
    ),
    wiki_case(
        "wiki-steam-linux",
        Platform::Linux,
        STEAM_GAME,
        "wiki/expected/live-steam-linux/result.json",
    ),
    wiki_case(
        "wiki-steam-windows",
        Platform::Windows,
        STEAM_GAME,
        "wiki/expected/live-steam-windows/result.json",
    ),
    wiki_case(
        "wiki-epic-mac",
        Platform::Mac,
        EPIC_GAME,
        "wiki/expected/live-epic-mac/result.json",
    ),
    wiki_case(
        "wiki-epic-linux",
        Platform::Linux,
        EPIC_GAME,
        "wiki/expected/live-epic-linux/result.json",
    ),
    wiki_case(
        "wiki-gog-mac",
        Platform::Mac,
        GOG_GAME,
        "wiki/expected/live-gog-mac/result.json",
    ),
    wiki_case(
        "wiki-gog-linux",
        Platform::Linux,
        GOG_GAME,
        "wiki/expected/live-gog-linux/result.json",
    ),
    // The umu id on its own (the Epic title's codename, lower-cased, against the `egs` store).
    Case {
        id: "wiki-umu",
        slice: "wiki",
        platform: Platform::Linux,
        setup: &[],
        op: "info_umu_get",
        args: r#"[{"appName":"Ginger","runner":"legendary"}]"#,
        read: Read::Answer,
        golden: "wiki/expected/umu-hit-epic-codename-lower-cased/result.json",
        pointer: "/ops/0/result",
        mode: Mode::Whole,
        needs_env: None,
    },
];

/// The three titles of the live 86-06 wiki goldens: Elden Ring on Steam, Cyberpunk 2077 on Epic (app name
/// `Ginger`) and on GOG.
const STEAM_GAME: &str = r#"[{"title":"Elden Ring","appName":"1245620","runner":"steam"}]"#;
const EPIC_GAME: &str = r#"[{"title":"Cyberpunk 2077","appName":"Ginger","runner":"legendary"}]"#;
const GOG_GAME: &str = r#"[{"title":"Cyberpunk 2077","appName":"1423049311","runner":"gog"}]"#;

/// One wiki case: `info_wiki_get` over a fresh profile, held against the first op's result of the live
/// golden at `golden` (the whole result object, every key path of it).
const fn wiki_case(
    id: &'static str,
    platform: Platform,
    args: &'static str,
    golden: &'static str,
) -> Case {
    Case {
        id,
        slice: "wiki",
        platform,
        setup: &[],
        op: "info_wiki_get",
        args,
        read: Read::Answer,
        golden,
        pointer: "/ops/0/result",
        mode: Mode::Whole,
        needs_env: None,
    }
}

/// The fixed library of the CrossOver cases: two Steam games the index rates by Steam id and one title it
/// does not have (the 86-06 live case's own games, so the golden holds a value for each).
const THREE_GAMES: &str = r#"[{"games":[{"appName":"1245620","title":"Elden Ring","runner":"steam"},{"appName":"292030","title":"The Witcher 3: Wild Hunt","runner":"steam"},{"appName":"9999992","title":"No Such Game Anywhere","runner":"steam"}]}]"#;

/// The golden folder, baked in at build time: drift is a developer tool run from this checkout.
fn golden_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("gamelib-info")
        .join("tests")
        .join("fixtures")
        .join("golden")
}

/// The JSON type name drift compares on.
fn type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// Every key path of `value` with the set of JSON types seen there. An object key is `.key`, every
/// array element is `[]` (so the elements of an array merge: a key only some entries carry is still
/// one path, typed by the union).
fn paths(value: &Value) -> BTreeMap<String, BTreeSet<&'static str>> {
    fn walk(value: &Value, at: &str, out: &mut BTreeMap<String, BTreeSet<&'static str>>) {
        out.entry(at.to_string())
            .or_default()
            .insert(type_name(value));
        match value {
            Value::Object(map) => {
                for (key, child) in map {
                    walk(child, &format!("{at}.{key}"), out);
                }
            }
            Value::Array(items) => {
                for child in items {
                    walk(child, &format!("{at}[]"), out);
                }
            }
            _ => {}
        }
    }
    let mut out = BTreeMap::new();
    walk(value, "", &mut out);
    out
}

/// The key paths of a list's entries, as paths of one entry: `[]` and `[].a` become `` and `.a`.
fn entry_paths(
    list: BTreeMap<String, BTreeSet<&'static str>>,
) -> BTreeMap<String, BTreeSet<&'static str>> {
    list.into_iter()
        .filter_map(|(path, types)| {
            path.strip_prefix("[]")
                .map(|rest| (rest.to_string(), types))
        })
        .collect()
}

/// What differs between a live result and its golden (see [`Mode`]): `Err` names up to a few key
/// paths that are missing or retyped; `Ok` carries how many paths are only on the side that is
/// allowed to have more.
fn shape_diff(golden: &Value, live: &Value, mode: Mode) -> Result<usize, String> {
    let (mut golden, live) = (paths(golden), paths(live));
    // `needed` must be covered by `offered`.
    let (needed, offered, what) = match mode {
        Mode::Whole => (&golden, &live, "golden"),
        Mode::EntryOfList => {
            golden = entry_paths(golden);
            (&live, &golden, "golden entries")
        }
        Mode::Subset => (&live, &golden, "golden"),
    };
    let problems: Vec<String> = needed
        .iter()
        .filter_map(|(path, types)| match offered.get(path) {
            None => Some(format!(
                "{} {}",
                shown(path),
                match mode {
                    Mode::Whole => "is missing from the live result",
                    Mode::EntryOfList => "is in the live entry but not in the golden entries",
                    Mode::Subset => "is in the live result but not in the golden",
                }
            )),
            Some(seen) if seen.is_disjoint(types) => Some(format!(
                "{} is {} where the {what} have {}",
                shown(path),
                join(if mode == Mode::Whole { seen } else { types }),
                join(if mode == Mode::Whole { types } else { seen })
            )),
            Some(_) => None,
        })
        .collect();
    if problems.is_empty() {
        // Only a whole document has a meaningful count of new live keys: a single entry is allowed to
        // carry fewer keys than the entries the golden merges.
        Ok(match mode {
            Mode::Whole => live.keys().filter(|p| !golden.contains_key(*p)).count(),
            Mode::EntryOfList | Mode::Subset => 0,
        })
    } else {
        let more = problems.len().saturating_sub(3);
        let mut text = problems[..problems.len().min(3)].join("; ");
        if more > 0 {
            text.push_str(&format!("; and {more} more"));
        }
        Err(text)
    }
}

fn shown(path: &str) -> String {
    if path.is_empty() {
        "the value itself".to_string()
    } else {
        path.to_string()
    }
}

fn join(types: &BTreeSet<&'static str>) -> String {
    types.iter().copied().collect::<Vec<_>>().join("|")
}

/// A fresh profile folder under the system temp dir, removed on drop.
struct Profile(PathBuf);

impl Profile {
    fn new() -> Result<Profile, String> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let dir =
            std::env::temp_dir().join(format!("gamelib-info-drift-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create a temp profile: {e}"))?;
        Ok(Profile(dir))
    }
}

impl Drop for Profile {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn parse_args(op: &str, text: &str) -> Result<Vec<Value>, String> {
    match serde_json::from_str(text) {
        Ok(Value::Array(items)) => Ok(items),
        _ => Err(format!("{op}: the case arguments are not a JSON array")),
    }
}

/// Runs one case over `http` and compares its live result to the golden. `Ok(note)` is a pass; the
/// note is empty or says how many keys only the live side has.
fn run_case(
    case: &Case,
    http: Arc<dyn Http>,
    secrets: Arc<dyn SecretSource>,
    app_version: &str,
    golden_root: &Path,
) -> Result<String, String> {
    let golden_text = std::fs::read(golden_root.join(case.golden))
        .map_err(|e| format!("cannot read the golden {}: {}", case.golden, e.kind()))?;
    let golden: Value = serde_json::from_slice(&golden_text)
        .map_err(|_| format!("the golden {} is not JSON", case.golden))?;
    let golden = golden
        .pointer(case.pointer)
        .ok_or_else(|| format!("the golden {} has no {}", case.golden, case.pointer))?;

    let profile = Profile::new()?;
    let mut ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        case.platform,
        InfoPaths {
            app_folder: profile.0.clone(),
            user_data: profile.0.clone(),
            temp: profile.0.join("temp"),
            public_dir: None,
        },
        app_version.to_string(),
        Shutdown::new(),
        http,
    );
    // The environment source and nothing else: drift never reads the Keychain (D-12).
    ctx.secrets = Some(secrets);

    for (op, args) in case.setup {
        let answer = gamelib_info::dispatch_sync(op, &parse_args(op, args)?, &ctx)?;
        refused(op, &answer)?;
    }
    let answer = gamelib_info::dispatch_sync(case.op, &parse_args(case.op, case.args)?, &ctx)?;
    refused(case.op, &answer)?;
    let live = match case.read {
        Read::Answer => answer,
        Read::File(name) => {
            let bytes = std::fs::read(profile.0.join(name))
                .map_err(|e| format!("the op wrote no {name} ({})", e.kind()))?;
            serde_json::from_slice(&bytes).map_err(|_| format!("the live {name} is not JSON"))?
        }
    };
    let extra = shape_diff(golden, &live, case.mode)?;
    Ok(match extra {
        0 => String::new(),
        n => format!("{n} key path(s) the golden does not have"),
    })
}

/// An op that answers `{ written: false, warning }` did not get the live data: a FAIL, with the
/// op's own reason (an HTTP status such as 403 is named in it).
fn refused(op: &str, answer: &Value) -> Result<(), String> {
    if answer.get("written") == Some(&Value::Bool(false)) {
        let why = answer
            .get("warning")
            .and_then(Value::as_str)
            .unwrap_or("no reason given");
        return Err(format!("{op} fetched nothing ({why})"));
    }
    Ok(())
}

/// The key source drift uses: the two `GAMELIB_INFO_*` variables, never the Keychain.
fn env_secrets() -> Arc<dyn SecretSource> {
    Arc::new(EnvSecretSource::new(ITAD_KEY_VAR, SGDB_KEY_VAR))
}

/// Why `case` cannot run, when it cannot: the variable it needs is unset or blank.
fn skip_reason(case: &Case, var: impl Fn(&str) -> Option<String>) -> Option<String> {
    let name = case.needs_env?;
    match var(name) {
        Some(value) if !value.trim().is_empty() => None,
        _ => Some(format!("{name} is not set")),
    }
}

/// `drift [--slice <name>] [--list]`.
pub fn run(args: &[String]) {
    let mut slice: Option<&str> = None;
    let mut list = false;
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "--list" => list = true,
            "--slice" => match rest.next() {
                Some(name) => slice = Some(name),
                None => super::usage(),
            },
            _ => super::usage(),
        }
    }
    let cases: Vec<&Case> = CASES
        .iter()
        .filter(|c| slice.map_or(true, |s| c.slice == s))
        .collect();
    if cases.is_empty() {
        super::bad(&format!(
            "no drift cases for slice {}",
            slice.unwrap_or_default()
        ));
    }
    if list {
        for case in cases {
            println!("{}", case.id);
        }
        return;
    }

    let http: Arc<dyn Http> = Arc::new(ReqwestHttp::new());
    let root = golden_root();
    let mut failed = 0;
    for case in cases {
        if let Some(reason) = skip_reason(case, |name| std::env::var(name).ok()) {
            println!("SKIP {}: {reason}", case.id);
            continue;
        }
        match run_case(
            case,
            http.clone(),
            env_secrets(),
            env!("CARGO_PKG_VERSION"),
            &root,
        ) {
            Ok(note) if note.is_empty() => println!("PASS {}", case.id),
            Ok(note) => println!("PASS {} ({note})", case.id),
            Err(reason) => {
                failed += 1;
                println!("FAIL {}: {reason}", case.id);
            }
        }
    }
    exit(if failed == 0 { 0 } else { 1 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_info::http::Replay;
    use serde_json::json;

    #[test]
    fn a_missing_or_retyped_golden_path_fails_and_an_extra_live_path_does_not() {
        let whole = Mode::Whole;
        let golden = json!([{ "a": 1, "b": "x", "c": { "d": [true] } }]);
        // Same shape, different values.
        assert_eq!(
            shape_diff(
                &golden,
                &json!([{ "a": 9, "b": "y", "c": { "d": [false] } }]),
                whole
            ),
            Ok(0)
        );
        // An extra key on the live side is counted, not failed.
        assert_eq!(
            shape_diff(
                &golden,
                &json!([{ "a": 1, "b": "x", "c": { "d": [true] }, "z": 1 }]),
                whole
            ),
            Ok(1)
        );
        // A key the golden has and the live value lacks.
        let err = shape_diff(&golden, &json!([{ "a": 1, "b": "x" }]), whole).unwrap_err();
        assert!(
            err.contains("[].c is missing from the live result"),
            "{err}"
        );
        // A retyped key.
        let err = shape_diff(
            &golden,
            &json!([{ "a": "1", "b": "x", "c": { "d": [true] } }]),
            whole,
        )
        .unwrap_err();
        assert!(
            err.contains("[].a is string where the golden have number"),
            "{err}"
        );
        // A different top-level shape.
        assert!(shape_diff(&golden, &json!({}), whole).is_err());
        assert!(shape_diff(&golden, &json!(null), whole).is_err());
    }

    #[test]
    fn array_elements_merge_so_an_optional_key_and_a_union_type_are_one_path() {
        let whole = Mode::Whole;
        let golden = json!([{ "a": 1 }, { "a": null, "b": 2 }]);
        // The live list has `b` on one entry and `a` as a number: both paths are covered.
        assert_eq!(
            shape_diff(&golden, &json!([{ "a": 5 }, { "b": 7 }]), whole),
            Ok(0)
        );
        // `a` was null or a number in the golden: a string overlaps neither.
        assert!(shape_diff(&golden, &json!([{ "a": "x", "b": 1 }]), whole).is_err());
    }

    #[test]
    fn one_live_entry_must_stay_inside_the_golden_entries_but_need_not_carry_every_key() {
        let entry = Mode::EntryOfList;
        let golden = json!([{ "a": 1, "b": { "c": "x" } }, { "a": 2, "d": [1] }]);
        // An entry with only some of the optional keys is fine, with values of other kinds of value.
        assert_eq!(shape_diff(&golden, &json!({ "a": 7 }), entry), Ok(0));
        assert!(shape_diff(&golden, &json!({ "a": 7, "d": [9] }), entry).is_ok());
        // A key no golden entry has, or a retyped key, is drift.
        let err = shape_diff(&golden, &json!({ "a": 1, "new": 1 }), entry).unwrap_err();
        assert!(
            err.contains(".new is in the live entry but not in the golden entries"),
            "{err}"
        );
        let err = shape_diff(&golden, &json!({ "a": "1" }), entry).unwrap_err();
        assert!(
            err.contains(".a is string where the golden entries have number"),
            "{err}"
        );
        // `null` (no entry matched) is not an entry of the list.
        assert!(shape_diff(&golden, &json!(null), entry).is_err());
    }

    #[test]
    fn many_problems_are_summarised() {
        let golden = json!({ "a": 1, "b": 1, "c": 1, "d": 1, "e": 1 });
        let err = shape_diff(&golden, &json!({}), Mode::Whole).unwrap_err();
        assert!(err.ends_with("and 2 more"), "{err}");
    }

    #[test]
    fn the_case_table_ids_are_unique_and_every_golden_resolves() {
        let mut ids: Vec<&str> = CASES.iter().map(|c| c.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), CASES.len());
        assert!(
            CASES.iter().filter(|c| c.slice == "anticheat").count() >= 3,
            "anticheat carries a download per platform and a lookup"
        );
        assert!(
            CASES.iter().filter(|c| c.slice == "steamgrid").count() >= 3,
            "steamgrid carries search, grids and heroes"
        );
        assert!(
            CASES
                .iter()
                .filter(|c| c.slice == "steamgrid")
                .all(|c| c.needs_env == Some(SGDB_KEY_VAR)),
            "every steamgrid case needs the operator's key"
        );
        assert!(
            CASES.iter().filter(|c| c.slice == "itad").count() >= 3,
            "itad carries search, deals and gids"
        );
        assert!(
            CASES
                .iter()
                .filter(|c| c.slice == "itad")
                .all(|c| c.needs_env == Some(ITAD_KEY_VAR)),
            "every itad case needs the operator's key"
        );
        for case in CASES {
            let text = std::fs::read(golden_root().join(case.golden)).expect(case.golden);
            let golden: Value = serde_json::from_slice(&text).unwrap();
            assert!(golden.pointer(case.pointer).is_some(), "{}", case.id);
            for (op, _) in case.setup.iter().chain([&(case.op, "")]) {
                assert!(gamelib_info::OPS.contains(op), "{op}");
            }
        }
    }

    /// The recorded 86-04 service stands in for the live one. The `Replay` pins the request, so this
    /// also checks that drift asks for exactly what the app asks for (apart from the version in the
    /// User-Agent, which the test sets to the recorded one).
    fn recorded(slice: &str, id: &str) -> Arc<Replay> {
        let dir = golden_root()
            .join("..")
            .join("recorded")
            .join(slice)
            .join(id);
        Arc::new(Replay::from_case(&dir).expect(id))
    }

    /// No keys at all: the anticheat cases never read one.
    fn no_keys() -> Arc<dyn SecretSource> {
        Arc::new(gamelib_info::secrets::MemorySecretSource::new())
    }

    #[test]
    fn a_recorded_service_that_matches_the_golden_passes_every_anticheat_case() {
        for (case_id, recording) in [
            ("anticheat-download-mac", "download-no-local-file-mac"),
            ("anticheat-download-linux", "download-no-local-file-linux"),
            // The lookup's setup download is the one recorded exchange.
            ("anticheat-lookup", "download-no-local-file-linux"),
        ] {
            let case = CASES.iter().find(|c| c.id == case_id).unwrap();
            let replay = recorded("anticheat", recording);
            let outcome = run_case(case, replay.clone(), no_keys(), "0.11.0", &golden_root());
            assert_eq!(outcome, Ok(String::new()), "{case_id}");
            replay.finish().expect(case_id);
        }
    }

    #[test]
    fn a_recorded_service_that_matches_the_golden_passes_every_steamgrid_case() {
        use gamelib_info::secrets::{MemorySecretSource, Slot};
        for (case_id, recording) in [
            ("steamgrid-search", "live-search-celeste"),
            ("steamgrid-grids", "live-grids-styles-and-dimensions"),
            ("steamgrid-heroes", "live-heroes"),
        ] {
            let case = CASES.iter().find(|c| c.id == case_id).unwrap();
            let replay = recorded("steamgrid", recording);
            // The recorder stores the key as REDACTED; any non-empty Authorization value matches.
            let keys = Arc::new(MemorySecretSource::with(Slot::SteamGridDb, "a-test-key"));
            let outcome = run_case(case, replay.clone(), keys, "0.11.0", &golden_root());
            assert_eq!(outcome, Ok(String::new()), "{case_id}");
            replay.finish().expect(case_id);
        }
    }

    #[test]
    fn a_recorded_service_that_matches_the_golden_passes_every_itad_case() {
        use gamelib_info::secrets::{MemorySecretSource, Slot};
        for (case_id, recording) in [
            ("itad-search", "live-search-portal-us"),
            ("itad-deals", "live-deals-portal-us"),
            ("itad-gids", "live-gids-five-appids"),
        ] {
            let case = CASES.iter().find(|c| c.id == case_id).unwrap();
            let replay = recorded("storeSearch", recording);
            // The recorder stores the key as REDACTED; any non-empty key query value matches.
            let keys = Arc::new(MemorySecretSource::with(Slot::Itad, "a-test-key"));
            let outcome = run_case(case, replay.clone(), keys, "0.11.0", &golden_root());
            assert_eq!(outcome, Ok(String::new()), "{case_id}");
            replay.finish().expect(case_id);
        }
    }

    #[test]
    fn a_recorded_catalog_that_matches_the_golden_passes_the_gog_discounts_case() {
        let case = CASES.iter().find(|c| c.id == "gog-discounts").unwrap();
        // The live-us-default recording is 30 pages of the real catalog: every request the op makes is
        // pinned (the Replay finishes clean), and every key path of the golden's sample is in the list.
        let replay = recorded("discounts", "live-us-default");
        let outcome = run_case(case, replay.clone(), no_keys(), "0.11.0", &golden_root());
        assert!(outcome.is_ok(), "{outcome:?}");
        replay.finish().expect("gog-discounts");
        // The catalog needs no key, so the case is never skipped.
        assert_eq!(skip_reason(case, |_| None), None);
    }

    #[test]
    fn a_catalog_that_drops_a_product_key_fails_with_the_path() {
        let case = CASES.iter().find(|c| c.id == "gog-discounts").unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("body.json"),
            r#"{"pages":1,"productCount":1,"products":[{"id":"1"}]}"#,
        )
        .unwrap();
        std::fs::write(
            dir.path().join("exchanges.json"),
            r#"[{"id":"e","request":{"method":"GET","url":"https://catalog.gog.com/v1/catalog?limit=48&order=desc%3Atrending&discounted=eq%3Atrue&productType=in%3Agame%2Cpack%2Cdlc&page=1&countryCode=US&locale=en-US&currencyCode=USD","headers":{"user-agent":"HeroicGamesLauncher/0.11.0"}},"response":{"status":200,"headers":{},"bodyFile":"body.json"}}]"#,
        )
        .unwrap();
        let replay = Arc::new(Replay::from_case(dir.path()).unwrap());
        let err = run_case(case, replay, no_keys(), "0.11.0", &golden_root()).unwrap_err();
        // The live product lost every key but `id`.
        assert!(err.contains("is missing from the live result"), "{err}");
        assert!(err.contains("[].coverHorizontal"), "{err}");
    }

    #[test]
    fn an_itad_case_is_skipped_with_a_reason_when_the_key_variable_is_unset_or_blank() {
        for id in ["itad-search", "itad-deals", "itad-gids"] {
            let case = CASES.iter().find(|c| c.id == id).unwrap();
            assert_eq!(
                skip_reason(case, |_| None).as_deref(),
                Some("GAMELIB_INFO_ITAD_KEY is not set"),
                "{id} unset"
            );
            assert!(
                skip_reason(case, |_| Some(" ".to_string())).is_some(),
                "{id} blank"
            );
            assert_eq!(
                skip_reason(case, |_| Some("k".to_string())),
                None,
                "{id} set"
            );
        }
    }

    #[test]
    fn a_steamgrid_case_is_skipped_with_a_reason_when_the_key_variable_is_unset_or_blank() {
        let case = CASES.iter().find(|c| c.id == "steamgrid-search").unwrap();
        let unset = skip_reason(case, |_| None);
        assert_eq!(
            unset.as_deref(),
            Some("GAMELIB_INFO_SGDB_KEY is not set"),
            "unset"
        );
        let blank = skip_reason(case, |_| Some("  ".to_string()));
        assert!(blank.is_some(), "blank");
        assert_eq!(skip_reason(case, |_| Some("k".to_string())), None);
        // A case with no key requirement is never skipped.
        let anticheat = CASES.iter().find(|c| c.slice == "anticheat").unwrap();
        assert_eq!(skip_reason(anticheat, |_| None), None);
    }

    #[test]
    fn a_steamgrid_service_that_changes_shape_fails_with_the_path() {
        use gamelib_info::secrets::{MemorySecretSource, Slot};
        let case = CASES.iter().find(|c| c.id == "steamgrid-search").unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("body.json"),
            r#"{"success":true,"data":[{"id":1}]}"#,
        )
        .unwrap();
        std::fs::write(
            dir.path().join("exchanges.json"),
            r#"[{"id":"e","request":{"method":"GET","url":"https://www.steamgriddb.com/api/v2/search/autocomplete/Celeste","headers":{"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeroicGamesLauncher/0.11.0","authorization":"REDACTED"}},"response":{"status":200,"headers":{},"bodyFile":"body.json"}}]"#,
        )
        .unwrap();
        let replay = Arc::new(Replay::from_case(dir.path()).unwrap());
        let keys = Arc::new(MemorySecretSource::with(Slot::SteamGridDb, "k"));
        let err = run_case(case, replay, keys, "0.11.0", &golden_root()).unwrap_err();
        // The live entry lost its `name`.
        assert!(
            err.contains("[].name is missing from the live result"),
            "{err}"
        );
    }

    #[test]
    fn a_service_that_answers_403_or_changes_shape_fails_with_a_reason() {
        let case = CASES
            .iter()
            .find(|c| c.id == "anticheat-download-linux")
            .unwrap();

        // A 403: the download fetches nothing and the line names the status.
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("exchanges.json"),
            r#"[{"id":"e","request":{"method":"GET","url":"https://raw.githubusercontent.com/Starz0r/AreWeAntiCheatYet/HEAD/games.json","headers":{"user-agent":"GameLib/0.11.0 (+https://github.com/grayson-mitchell/GameLib)"}},"response":{"status":403,"headers":{}}}]"#,
        )
        .unwrap();
        let replay = Arc::new(Replay::from_case(dir.path()).unwrap());
        let err = run_case(case, replay, no_keys(), "0.11.0", &golden_root()).unwrap_err();
        assert!(err.contains("status 403"), "{err}");

        // A body that parses but has another shape (a list of strings).
        std::fs::write(dir.path().join("body.txt"), r#"["a","b"]"#).unwrap();
        std::fs::write(
            dir.path().join("exchanges.json"),
            r#"[{"id":"e","request":{"method":"GET","url":"https://raw.githubusercontent.com/Starz0r/AreWeAntiCheatYet/HEAD/games.json","headers":{"user-agent":"GameLib/0.11.0 (+https://github.com/grayson-mitchell/GameLib)"}},"response":{"status":200,"headers":{},"bodyFile":"body.txt"}}]"#,
        )
        .unwrap();
        let replay = Arc::new(Replay::from_case(dir.path()).unwrap());
        let err = run_case(case, replay, no_keys(), "0.11.0", &golden_root()).unwrap_err();
        assert!(
            err.contains("[] is string where the golden have object"),
            "{err}"
        );
    }

    #[test]
    fn the_crossover_cases_are_in_the_table_and_need_no_key() {
        let cases: Vec<&Case> = CASES.iter().filter(|c| c.slice == "crossover").collect();
        assert!(cases.len() >= 2, "an index fetch and a rating map");
        assert!(cases.iter().all(|c| c.needs_env.is_none()));
        assert!(cases.iter().all(|c| c.platform == Platform::Mac));
        assert!(cases.iter().all(|c| c.op == "info_crossover_rating_map"));
        for case in cases {
            assert_eq!(skip_reason(case, |_| None), None, "{}", case.id);
        }
    }

    #[test]
    fn a_recorded_index_that_matches_the_golden_passes_both_crossover_cases() {
        for case_id in ["crossover-index-fetch", "crossover-rating-map"] {
            let case = CASES.iter().find(|c| c.id == case_id).unwrap();
            // The recorded live fetch is the one request the op makes: pinned to what the app sends.
            let replay = recorded("crossover", "live-fresh-fetch-mac");
            let outcome = run_case(case, replay.clone(), no_keys(), "0.11.0", &golden_root());
            assert_eq!(outcome, Ok(String::new()), "{case_id}");
            replay.finish().expect(case_id);
        }
    }

    #[test]
    fn an_index_the_service_stops_serving_fails_both_crossover_cases_with_the_path() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("body.txt"), "{}").unwrap();
        std::fs::write(
            dir.path().join("exchanges.json"),
            r#"[{"id":"e","request":{"method":"GET","url":"https://github.com/grayson-mitchell/GameLib/releases/download/crossover-index/crossover-index.json.gz","headers":{"user-agent":"GameLib/0.11.0 (+https://github.com/grayson-mitchell/GameLib)"}},"response":{"status":500,"headers":{},"bodyFile":"body.txt"}}]"#,
        )
        .unwrap();

        // No index was stored, so the op wrote no cache file.
        let case = CASES
            .iter()
            .find(|c| c.id == "crossover-index-fetch")
            .unwrap();
        let replay = Arc::new(Replay::from_case(dir.path()).unwrap());
        let err = run_case(case, replay, no_keys(), "0.11.0", &golden_root()).unwrap_err();
        assert!(
            err.contains("the op wrote no store_cache/crossover_index.json"),
            "{err}"
        );

        // The rating map answers null for a game the golden has rated: the type moved.
        let case = CASES
            .iter()
            .find(|c| c.id == "crossover-rating-map")
            .unwrap();
        let replay = Arc::new(Replay::from_case(dir.path()).unwrap());
        let err = run_case(case, replay, no_keys(), "0.11.0", &golden_root()).unwrap_err();
        assert!(
            err.contains(".1245620 is null where the golden have number"),
            "{err}"
        );
    }

    #[test]
    fn the_wiki_cases_are_in_the_table_and_need_no_key() {
        let cases: Vec<&Case> = CASES.iter().filter(|c| c.slice == "wiki").collect();
        assert!(cases.len() >= 4, "a Steam, an Epic and a GOG title and umu");
        assert!(cases.iter().all(|c| c.needs_env.is_none()));
        for runner in ["steam", "legendary", "gog"] {
            assert!(
                cases
                    .iter()
                    .any(|c| c.op == "info_wiki_get" && c.args.contains(runner)),
                "{runner}"
            );
        }
        // Every platform the goldens cover is asked for the Steam title.
        for platform in [Platform::Mac, Platform::Linux, Platform::Windows] {
            assert!(cases
                .iter()
                .any(|c| c.platform == platform && c.args.contains("steam")));
        }
        assert!(cases.iter().any(|c| c.op == "info_umu_get"));
        for case in cases {
            assert_eq!(skip_reason(case, |_| None), None, "{}", case.id);
        }
    }

    /// The wiki recording for every request but the CrossOver index asset, which has its own.
    struct Routed {
        index: Arc<Replay>,
        wiki: Arc<Replay>,
    }

    impl Http for Routed {
        fn send(&self, request: gamelib_info::http::Request) -> gamelib_info::http::HttpFuture<'_> {
            if request.url.contains("/crossover-index/") {
                self.index.send(request)
            } else {
                self.wiki.send(request)
            }
        }
    }

    #[test]
    fn a_recorded_service_that_matches_the_golden_passes_every_wiki_case() {
        for (case_id, recording) in [
            ("wiki-steam-mac", "live-steam-mac"),
            ("wiki-steam-linux", "live-steam-linux"),
            ("wiki-steam-windows", "live-steam-windows"),
            ("wiki-epic-mac", "live-epic-mac"),
            ("wiki-epic-linux", "live-epic-linux"),
            ("wiki-gog-mac", "live-gog-mac"),
            ("wiki-gog-linux", "live-gog-linux"),
        ] {
            let case = CASES.iter().find(|c| c.id == case_id).unwrap();
            let replay = recorded("wiki", recording);
            // The macOS cases read the CrossOver index, which the TS oracle seeded into the profile
            // instead of fetching: its live fetch is the crossover slice's recording.
            let index = recorded("crossover", "live-fresh-fetch-mac");
            let routed = Arc::new(Routed {
                index: index.clone(),
                wiki: replay.clone(),
            });
            let outcome = run_case(case, routed, no_keys(), "0.11.0", &golden_root());
            assert_eq!(outcome, Ok(String::new()), "{case_id}");
            // The GOG recordings hold the requests TS made and Rust does not, flagged `tsOnly`.
            replay.finish().expect(case_id);
            if case.platform == Platform::Mac {
                index.finish().expect(case_id);
            }
        }
    }

    /// Answers every request with one status and an empty object.
    struct Refusing(u16);

    impl Http for Refusing {
        fn send(
            &self,
            _request: gamelib_info::http::Request,
        ) -> gamelib_info::http::HttpFuture<'_> {
            let status = self.0;
            Box::pin(async move {
                Ok(gamelib_info::http::Response {
                    status,
                    headers: Vec::new(),
                    body: b"{}".to_vec(),
                })
            })
        }
    }

    /// Pitfall 11: sources that answer Rust 403 empty their part of the result, and that is a FAIL naming
    /// the key paths the golden has and the live result lacks, not a pass.
    #[test]
    fn sources_that_answer_403_fail_the_wiki_case_with_the_missing_paths() {
        let case = CASES.iter().find(|c| c.id == "wiki-steam-windows").unwrap();
        let err = run_case(
            case,
            Arc::new(Refusing(403)),
            no_keys(),
            "0.11.0",
            &golden_root(),
        )
        .unwrap_err();
        assert!(
            err.contains(".howlongtobeat is null where the golden have object"),
            "{err}"
        );
    }

    #[test]
    fn a_subset_result_may_have_fewer_keys_than_the_golden_but_never_a_new_one() {
        let subset = Mode::Subset;
        let golden = json!({ "a": 5, "b": null, "c": 3 });
        assert_eq!(shape_diff(&golden, &json!({ "a": 1 }), subset), Ok(0));
        assert_eq!(shape_diff(&golden, &json!({}), subset), Ok(0));
        let err = shape_diff(&golden, &json!({ "z": 1 }), subset).unwrap_err();
        assert!(
            err.contains(".z is in the live result but not in the golden"),
            "{err}"
        );
        let err = shape_diff(&golden, &json!({ "a": null }), subset).unwrap_err();
        assert!(
            err.contains(".a is null where the golden have number"),
            "{err}"
        );
    }
}
