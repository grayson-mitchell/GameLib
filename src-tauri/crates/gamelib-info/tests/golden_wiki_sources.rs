//! The wiki sources against the TS goldens (86-06 recorded them, 86-20 and 86-21 port them; SC1, D-10):
//! PCGamingWiki, AppleGamingWiki, ProtonDB and Steam Deck (86-20), then GamesDB and HowLongToBeat with its
//! GOG branch (86-21), each replayed over the exchanges of its own hosts out of every `wiki` case that
//! made a request to them.
//!
//! A source's output must equal the matching part of the case's golden `wiki` result (`pcgamingwiki` and
//! `fetchStatus.pcgamingwiki`, `applegamingwiki`, `steamInfo`), the requests it made must be the golden
//! requests to its host in the same order, and its replay must finish clean (no unmatched request, none
//! left over). The aggregator that decides when each source runs is 86-22.
//!
//! The GOG cases hold requests the TS made and Rust does not (D-23: the system-requirements array and
//! the changelog, flagged `tsOnly` in the recording) and one Rust makes alone (`rustOnly`: its own store
//! link GET). A source that touches those hosts is compared with the recording minus the `tsOnly`
//! exchanges, and no GOG store file may change.

mod wiki_golden;

use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use gamelib_info::crossover::GameRef;
use gamelib_info::http::{Http, Replay};
use gamelib_info::js::remove_special_characters;
use gamelib_info::runner_caps;
use gamelib_info::wiki::{agw, deck, gamesdb, hltb, pcgw, protondb};
use gamelib_testutil::FakeHome;
use serde_json::Value;
use url::Url;
use wiki_golden::*;

/// The floor this test carries; the committed MANIFEST must be at or above it.
const FLOOR: usize = 25;

const PCGW_HOST: &str = "www.pcgamingwiki.com";
const AGW_HOST: &str = "www.applegamingwiki.com";

#[test]
fn manifest_holds_the_floor_and_one_expected_folder_per_case() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    check_manifest(
        cases.as_array().unwrap(),
        &manifest,
        FLOOR,
        &expected_folders(),
    )
    .unwrap();
}

#[test]
fn an_empty_case_list_fails_the_manifest_guard() {
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let err = check_manifest(&[], &manifest, FLOOR, &[]).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

/// One recorded `wiki` op that asked `host` for something: the case, the game it ran for, its golden
/// result and the golden requests to that host.
struct Run {
    case: Value,
    game: Value,
    result: Value,
    requests: Vec<String>,
}

fn host_of(request: &str) -> String {
    let url = request.split_once(' ').map_or(request, |(_, url)| url);
    Url::parse(url)
        .unwrap()
        .host_str()
        .unwrap_or_default()
        .to_string()
}

/// Every golden `wiki` op that requested one of `hosts`.
fn runs_for(hosts: &[&str]) -> Vec<Run> {
    every_run(hosts)
        .into_iter()
        .filter(|run| !run.requests.is_empty())
        .collect()
}

/// The first golden `wiki` op that made requests, of every case that has one (a case served from the
/// cache has none), with its golden requests to `hosts` (possibly none).
fn every_run(hosts: &[&str]) -> Vec<Run> {
    let cases = read_json(&golden_dir().join("cases.json"));
    let mut runs = Vec::new();
    for case in cases.as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let want = read_json(&golden_dir().join("expected").join(id).join("result.json"));
        let requests: Vec<String> = want["requests"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r.as_str().unwrap().to_string())
            .filter(|r| hosts.contains(&host_of(r).as_str()))
            .collect();
        // The op that made them: the only `wiki` op with a request count in every recorded case that
        // reached a source (a later repeat is served from the cache).
        let ops = case["ops"].as_array().unwrap();
        let Some(at) = want["ops"]
            .as_array()
            .unwrap()
            .iter()
            .position(|o| o["op"] == "wiki" && o["requestsMade"].as_u64().unwrap_or(0) > 0)
        else {
            continue;
        };
        runs.push(Run {
            case: case.clone(),
            game: ops[at]["game"].clone(),
            result: want["ops"][at]["result"].clone(),
            requests,
        });
    }
    runs
}

struct Harness {
    _home: FakeHome,
    /// The profile the case ran in and what it held before the source ran.
    user_data: std::path::PathBuf,
    before: std::collections::BTreeMap<String, Vec<u8>>,
    ctx: gamelib_info::ctx::InfoCtx,
    tap: Arc<Tap>,
    replay: Arc<Replay>,
    lines: Arc<Lines>,
}

fn harness(run: &Run, hosts: &[&str]) -> Harness {
    let id = run.case["id"].as_str().unwrap();
    let replay = Arc::new(
        Replay::for_hosts(&fixtures().join("recorded/wiki").join(id), hosts)
            .unwrap_or_else(|e| panic!("{id}: {e}")),
    );
    let tap = Arc::new(Tap::new(Arc::clone(&replay) as Arc<dyn Http>));
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    let home = FakeHome::new("info-wiki-sources-");
    let (mut ctx, user_data) =
        case_ctx(&run.case, &home, &clock, Arc::clone(&tap) as Arc<dyn Http>);
    let lines = Arc::new(Lines::default());
    ctx.log = Some(Arc::clone(&lines) as Arc<dyn gamelib_info::ctx::InfoLog>);
    Harness {
        _home: home,
        before: tree(&user_data),
        user_data,
        ctx,
        tap,
        replay,
        lines,
    }
}

impl Harness {
    /// The run's requests, the replay's verdict and the fixed-text rule on diagnostic lines.
    fn check(&self, run: &Run) {
        self.check_requests(run, &run.requests);
    }

    /// [`Harness::check`] against an explicit list of the requests the source should have made.
    fn check_requests(&self, run: &Run, requests: &[String]) {
        let id = run.case["id"].as_str().unwrap();
        assert_eq!(self.tap.urls(), requests, "{id}: requests");
        self.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));
        for line in self.lines.0.lock().unwrap().iter() {
            assert!(
                !line.contains("://")
                    && !line.contains(&run.game["title"].as_str().unwrap().to_string()),
                "{id}: a log line carries more than fixed text: {line}"
            );
        }
    }
}

fn title_of(run: &Run) -> String {
    remove_special_characters(run.game["title"].as_str().unwrap())
}

#[tokio::test]
async fn pcgamingwiki_matches_every_ts_golden_that_asked_it() {
    let runs = runs_for(&[PCGW_HOST]);
    assert!(runs.len() >= 25, "{} pcgamingwiki runs", runs.len());
    let (mut ok, mut not_found, mut error) = (0, 0, 0);
    for run in &runs {
        let id = run.case["id"].as_str().unwrap();
        let h = harness(run, &[PCGW_HOST]);
        let gog = (run.game["runner"] == "gog").then(|| run.game["app_name"].as_str().unwrap());
        let got = pcgw::get_info(&h.ctx, &title_of(run), gog).await;
        h.check(run);

        assert_eq!(
            got.outcome.word(),
            run.result["fetchStatus"]["pcgamingwiki"],
            "{id}: outcome"
        );
        let want = &run.result["pcgamingwiki"];
        assert_eq!(
            got.info.as_ref().map_or(Value::Null, |i| i.to_value()),
            *want,
            "{id}: pcgamingwiki"
        );
        match got.outcome.word() {
            "ok" => ok += 1,
            "notfound" => not_found += 1,
            _ => error += 1,
        }
    }
    // The goldens include every outcome: a found page, a page that is not there, and the failures
    // (the 403 and the live GOG-id `permissiondenied` answer).
    assert!(
        ok > 0 && not_found > 0 && error > 0,
        "{ok} {not_found} {error}"
    );
}

#[tokio::test]
async fn applegamingwiki_matches_every_ts_golden_that_asked_it() {
    let runs = runs_for(&[AGW_HOST]);
    assert!(runs.len() >= 7, "{} applegamingwiki runs", runs.len());
    let (mut found, mut empty) = (0, 0);
    for run in &runs {
        let id = run.case["id"].as_str().unwrap();
        let h = harness(run, &[AGW_HOST]);
        let got = agw::get_info(&h.ctx, &title_of(run)).await;
        h.check(run);
        assert_eq!(
            got.as_ref().map_or(Value::Null, |i| i.to_value()),
            run.result["applegamingwiki"],
            "{id}: applegamingwiki"
        );
        if got.as_ref().is_some_and(|i| i.crossover_rating.is_empty()) {
            empty += 1;
        } else {
            found += 1;
        }
    }
    assert!(found > 0 && empty > 0, "{found} {empty}");
}

const PROTONDB_HOST: &str = "www.protondb.com";
const DECK_HOST: &str = "store.steampowered.com";

/// The Steam id the aggregator hands ProtonDB and the Deck lookup (`wiki_game_info.ts`): the app name
/// itself for a runner whose app name is a Steam app id, else the first truthy of GamesDB's and
/// PCGamingWiki's `steamID` (the last one when neither is).
fn steam_id_of(run: &Run) -> Option<String> {
    let runner = run.game["runner"].as_str().unwrap();
    if runner_caps::caps(runner).is_some_and(|c| c.app_name_is_steam_app_id) {
        return run.game["app_name"].as_str().map(str::to_string);
    }
    let from = |part: &Value| {
        part["steamID"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    from(&run.result["gamesdb"]).or_else(|| from(&run.result["pcgamingwiki"]))
}

#[tokio::test]
async fn protondb_and_the_steam_deck_match_every_ts_golden_that_asked_them() {
    let runs = runs_for(&[PROTONDB_HOST, DECK_HOST]);
    assert!(runs.len() >= 4, "{} steam-info runs", runs.len());
    let mut levels = 0;
    for run in &runs {
        let id = run.case["id"].as_str().unwrap();
        let h = harness(run, &[PROTONDB_HOST, DECK_HOST]);
        let steam_id = steam_id_of(run);
        let protondb = protondb::get_info(&h.ctx, steam_id.as_deref()).await;
        let deck = deck::get_comp(&h.ctx, steam_id.as_deref()).await;
        h.check(run);

        // `steamInfo` is `{ compatibilityLevel, steamDeckCatagory }` when either answered, else null.
        let want = &run.result["steamInfo"];
        assert_eq!(
            protondb.as_ref().map(|p| &p.level),
            want.get("compatibilityLevel"),
            "{id}: compatibilityLevel"
        );
        assert_eq!(
            deck.as_ref().map(|d| Value::Number(d.category.clone())),
            want.get("steamDeckCatagory").cloned(),
            "{id}: steamDeckCatagory"
        );
        assert_eq!(
            want.is_null(),
            protondb.is_none() && deck.is_none(),
            "{id}: steamInfo is null exactly when neither answered"
        );
        if protondb.is_some() {
            levels += 1;
        }
    }
    assert!(levels > 0);
}

// ---- 86-21: GamesDB, HowLongToBeat and the GOG context ----

const GAMESDB_HOST: &str = "gamesdb.gog.com";
const HLTB_HOST: &str = "howlongtobeat.com";
const GOG_API_HOST: &str = "api.gog.com";
const GOG_STORE_HOST: &str = "af.gog.com";

fn str_of<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap()
}

impl Harness {
    /// D-23: a GOG case never writes GOG's `gog_api_info` cache or any other file of the profile.
    fn assert_no_store_writes(&self, run: &Run) {
        let id = run.case["id"].as_str().unwrap();
        assert_eq!(
            tree(&self.user_data),
            self.before,
            "{id}: the profile changed during a wiki source"
        );
        assert!(
            !self
                .user_data
                .join("store_cache/gog_api_info.json")
                .exists(),
            "{id}: gog_api_info was written"
        );
    }
}

#[tokio::test]
async fn gamesdb_matches_every_ts_golden_including_the_gog_cases() {
    let runs = every_run(&[GAMESDB_HOST]);
    assert!(runs.len() >= 25, "{} gamesdb runs", runs.len());
    // A request was made (GOG and Epic), no request was made (Steam appId, sideload), and a Steam id
    // was found.
    let (mut asked, mut silent, mut found) = (0, 0, 0);
    for run in &runs {
        let id = run.case["id"].as_str().unwrap();
        let h = harness(run, &[GAMESDB_HOST]);
        let got = gamesdb::get(
            &h.ctx,
            &title_of(run),
            str_of(&run.game, "app_name"),
            str_of(&run.game, "runner"),
        )
        .await
        .unwrap_or_else(|e| panic!("{id}: {e:?}"));
        h.check(run);
        h.assert_no_store_writes(run);
        assert_eq!(got.to_value(), run.result["gamesdb"], "{id}: gamesdb");
        if run.requests.is_empty() {
            silent += 1;
            assert!(!got.has_steam_id(), "{id}: a silent runner has no Steam id");
        } else {
            asked += 1;
        }
        if got.has_steam_id() {
            found += 1;
        }
    }
    assert!(
        asked > 0 && silent > 0 && found > 0,
        "{asked} {silent} {found}"
    );
}

#[tokio::test]
async fn a_gog_game_resolves_its_steam_id_through_the_d23_get_without_touching_gog_state() {
    let runs: Vec<Run> = runs_for(&[GAMESDB_HOST])
        .into_iter()
        .filter(|run| run.game["runner"] == "gog")
        .collect();
    assert!(runs.len() >= 4, "{} gog runs", runs.len());
    for run in &runs {
        let h = harness(run, &[GAMESDB_HOST]);
        let got = gamesdb::get(
            &h.ctx,
            "",
            str_of(&run.game, "app_name"),
            str_of(&run.game, "runner"),
        )
        .await
        .unwrap();
        assert_eq!(got.to_value(), serde_json::json!({ "steamID": "1091500" }));
        assert_eq!(
            h.tap.urls(),
            [format!(
                "GET https://gamesdb.gog.com/platforms/gog/external_releases/{}",
                str_of(&run.game, "app_name")
            )]
        );
        h.assert_no_store_writes(run);
    }
}

/// What a Rust source asked of `hosts`: the recording's exchanges without the `tsOnly` ones (D-23), in
/// order, as `<METHOD> <url>`; and whether a `rustOnly` exchange is among them (its place in the file is
/// where the recorder appended it, not where the flow makes it, so the lists are then compared sorted).
fn rust_requests(run: &Run, hosts: &[&str]) -> (Vec<String>, bool) {
    let id = run.case["id"].as_str().unwrap();
    let list = read_json(
        &fixtures()
            .join("recorded/wiki")
            .join(id)
            .join("exchanges.json"),
    );
    let mut requests = Vec::new();
    let mut rust_only = false;
    for exchange in list.as_array().unwrap() {
        if exchange["tsOnly"].as_bool().unwrap_or(false) {
            continue;
        }
        let request = &exchange["request"];
        let line = format!(
            "{} {}",
            request["method"].as_str().unwrap().to_ascii_uppercase(),
            request["url"].as_str().unwrap()
        );
        if hosts.contains(&host_of(&line).as_str()) {
            rust_only |= exchange["rustOnly"].as_bool().unwrap_or(false);
            requests.push(line);
        }
    }
    (requests, rust_only)
}

#[tokio::test]
async fn howlongtobeat_matches_every_ts_golden_by_id_by_title_and_through_gog() {
    let hosts = [HLTB_HOST, GOG_API_HOST, GOG_STORE_HOST];
    let runs = runs_for(&hosts);
    assert!(runs.len() >= 20, "{} howlongtobeat runs", runs.len());
    // by id, by title (handshake, search and the one retry), a lookup that finds nothing, and GOG.
    let (mut by_id, mut by_title, mut nothing, mut gog) = (0, 0, 0, 0);
    for run in &runs {
        let id = run.case["id"].as_str().unwrap();
        let h = harness(run, &hosts);
        let game = GameRef {
            runner: str_of(&run.game, "runner"),
            app_name: str_of(&run.game, "app_name"),
            // The raw title (the TS looks up the game's own title; only PCGamingWiki and the wiki
            // cache use the cleaned one).
            title: str_of(&run.game, "title"),
        };
        let hltb_id = run.result["pcgamingwiki"]["howLongToBeatID"].as_str();
        let got = hltb::get(&h.ctx, &game, hltb_id)
            .await
            .unwrap_or_else(|e| panic!("{id}: {e:?}"));

        let (expected, rust_only) = rust_requests(run, &hosts);
        let mut asked = h.tap.urls();
        let mut wanted = expected.clone();
        if rust_only {
            asked.sort();
            wanted.sort();
        }
        assert_eq!(asked, wanted, "{id}: requests");
        h.replay.finish().unwrap_or_else(|e| panic!("{id}: {e}"));
        h.assert_no_store_writes(run);
        // Pitfall 3: the browser headers go out without an `Accept-Encoding`.
        for names in h.tap.header_names.lock().unwrap().iter() {
            assert!(
                !names
                    .iter()
                    .any(|n| n.eq_ignore_ascii_case("accept-encoding")),
                "{id}: Accept-Encoding was sent"
            );
        }
        assert_eq!(
            got.as_ref().map_or(Value::Null, |entry| entry.to_value()),
            run.result["howlongtobeat"],
            "{id}: howlongtobeat"
        );

        let all = h.tap.urls();
        if game.runner == "gog" {
            gog += 1;
            assert!(
                all.iter().any(|u| u.contains("api.gog.com/v2/games/")),
                "{id}"
            );
            assert!(all.iter().any(|u| u.contains("af.gog.com/")), "{id}");
        } else if got.is_some() && all.iter().any(|u| u.contains("/api/search/site")) {
            by_title += 1;
        } else if got.is_some() {
            by_id += 1;
        } else {
            nothing += 1;
        }
    }
    assert!(
        by_id > 0 && by_title > 0 && nothing > 0 && gog > 0,
        "{by_id} {by_title} {nothing} {gog}"
    );
}
