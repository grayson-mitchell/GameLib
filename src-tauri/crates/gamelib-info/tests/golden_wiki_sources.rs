//! The simple wiki sources against the TS goldens (86-06 recorded them, 86-20 ports them; SC1, D-10):
//! PCGamingWiki, AppleGamingWiki, ProtonDB and Steam Deck, each replayed over the exchanges of its own
//! host out of every `wiki` case that made a request to it.
//!
//! A source's output must equal the matching part of the case's golden `wiki` result (`pcgamingwiki` and
//! `fetchStatus.pcgamingwiki`, `applegamingwiki`, `steamInfo`), the requests it made must be the golden
//! requests to its host in the same order, and its replay must finish clean (no unmatched request, none
//! left over). The aggregator that decides when each source runs is 86-22.

mod wiki_golden;

use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use gamelib_info::http::{Http, Replay};
use gamelib_info::js::remove_special_characters;
use gamelib_info::wiki::{agw, pcgw};
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
        if requests.is_empty() {
            continue;
        }
        // The op that made them: the only `wiki` op with a request count in every recorded case that
        // reached a source (a later repeat is served from the cache).
        let ops = case["ops"].as_array().unwrap();
        let at = want["ops"]
            .as_array()
            .unwrap()
            .iter()
            .position(|o| o["op"] == "wiki" && o["requestsMade"].as_u64().unwrap_or(0) > 0)
            .unwrap_or_else(|| panic!("{id}: no wiki op made the requests"));
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
    let (mut ctx, _) = case_ctx(&run.case, &home, &clock, Arc::clone(&tap) as Arc<dyn Http>);
    let lines = Arc::new(Lines::default());
    ctx.log = Some(Arc::clone(&lines) as Arc<dyn gamelib_info::ctx::InfoLog>);
    Harness {
        _home: home,
        ctx,
        tap,
        replay,
        lines,
    }
}

impl Harness {
    /// The run's requests, the replay's verdict and the fixed-text rule on diagnostic lines.
    fn check(&self, run: &Run) {
        let id = run.case["id"].as_str().unwrap();
        assert_eq!(self.tap.urls(), run.requests, "{id}: requests");
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
