//! The wiki sources' paths the recorded goldens do not reach (86-20): what each source does with an
//! answer of the wrong shape, how the TS built each URL for awkward titles, which `User-Agent` each one
//! sends, and what a diagnostic line may hold. Each expectation is what the TS code does for the same
//! input (a property read of `undefined` throws and lands in the source's failure value).

mod wiki_golden;

use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use gamelib_info::ctx::InfoLog;
use gamelib_info::http::{Http, HttpError, HttpFuture, Request, Response};
use gamelib_info::wiki::{agw, deck, pcgw, protondb, Outcome};
use gamelib_testutil::FakeHome;
use serde_json::json;
use wiki_golden::*;

type Answer = Result<(u16, String), HttpError>;
type Rules = Vec<(&'static str, Answer)>;

/// Answers each request by the first rule whose text its URL contains, and keeps (url, user-agent).
struct Routed {
    rules: Rules,
    seen: Mutex<Vec<(String, Option<String>)>>,
}

impl Http for Routed {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        let agent = request
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("user-agent"))
            .map(|(_, v)| v.clone());
        self.seen.lock().unwrap().push((request.url.clone(), agent));
        let answer = self
            .rules
            .iter()
            .find(|(needle, _)| request.url.contains(needle))
            .map(|(_, a)| a.clone())
            .unwrap_or(Err(HttpError::Network("no rule".to_string())));
        Box::pin(async move {
            answer.map(|(status, body)| Response {
                status,
                headers: Vec::new(),
                body: body.into_bytes(),
            })
        })
    }
}

struct Run {
    _home: FakeHome,
    ctx: gamelib_info::ctx::InfoCtx,
    http: Arc<Routed>,
    lines: Arc<Lines>,
}

fn run(rules: Rules) -> Run {
    let http = Arc::new(Routed {
        rules,
        seen: Mutex::new(Vec::new()),
    });
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    let home = FakeHome::new("info-wiki-edges-");
    let case = json!({ "id": "edges", "platform": "mac" });
    let (mut ctx, _) = case_ctx(&case, &home, &clock, Arc::clone(&http) as Arc<dyn Http>);
    let lines = Arc::new(Lines::default());
    ctx.log = Some(Arc::clone(&lines) as Arc<dyn InfoLog>);
    Run {
        _home: home,
        ctx,
        http,
        lines,
    }
}

fn ok(body: serde_json::Value) -> Answer {
    Ok((200, body.to_string()))
}

fn urls(run: &Run) -> Vec<String> {
    run.http
        .seen
        .lock()
        .unwrap()
        .iter()
        .map(|(u, _)| u.clone())
        .collect()
}

const PCGW_UA: &str = "GameLib/0.11.0 (+https://github.com/grayson-mitchell/GameLib)";

#[tokio::test]
async fn pcgamingwiki_builds_the_ts_urls_and_sends_the_gamelib_user_agent() {
    let wikitext = "|steam appid  = 5\n|hltb         = 6\n";
    let run = run(vec![
        (
            "list=search",
            ok(json!({ "query": { "search": [ { "pageid": 200143 } ] } })),
        ),
        (
            "action=parse",
            ok(json!({ "parse": { "wikitext": { "*": wikitext } } })),
        ),
    ]);
    // The first " -" becomes ":", spaces become a hand-written %20, nothing else is encoded.
    let got = pcgw::get_info(&run.ctx, "Anno 1602 - Konigs - Edition & More", None).await;
    assert_eq!(got.outcome, Outcome::Ok);
    assert_eq!(got.info.unwrap().steam_id, "5");
    assert_eq!(
        urls(&run),
        [
            "https://www.pcgamingwiki.com/w/api.php?action=query&list=search&srsearch=Anno%201602:%20Konigs%20-%20Edition%20&%20More&format=json",
            "https://www.pcgamingwiki.com/w/api.php?action=parse&format=json&pageid=200143&redirects=true&prop=wikitext",
        ]
    );
    for (_, agent) in run.http.seen.lock().unwrap().iter() {
        assert_eq!(agent.as_deref(), Some(PCGW_UA));
    }
}

#[tokio::test]
async fn pcgamingwiki_failures_are_error_and_a_missing_page_is_notfound() {
    let search_empty = ok(json!({ "query": { "search": [] } }));
    let cases: Vec<(&str, Rules, Outcome)> = vec![
        (
            "empty search",
            vec![("list=search", search_empty.clone())],
            Outcome::NotFound,
        ),
        (
            "page id 0",
            vec![(
                "list=search",
                ok(json!({ "query": { "search": [ { "pageid": 0 } ] } })),
            )],
            Outcome::NotFound,
        ),
        (
            "no pageid",
            vec![("list=search", ok(json!({ "query": { "search": [ {} ] } })))],
            Outcome::NotFound,
        ),
        (
            "no wikitext",
            vec![
                (
                    "list=search",
                    ok(json!({ "query": { "search": [ { "pageid": 1 } ] } })),
                ),
                (
                    "action=parse",
                    ok(json!({ "parse": { "wikitext": { "*": "" } } })),
                ),
            ],
            Outcome::NotFound,
        ),
        (
            "wikitext without a star",
            vec![
                (
                    "list=search",
                    ok(json!({ "query": { "search": [ { "pageid": 1 } ] } })),
                ),
                ("action=parse", ok(json!({ "parse": { "wikitext": {} } }))),
            ],
            Outcome::NotFound,
        ),
        (
            "403",
            vec![("list=search", Ok((403, "{}".to_string())))],
            Outcome::Error,
        ),
        (
            "no query",
            vec![("list=search", ok(json!({ "error": {} })))],
            Outcome::Error,
        ),
        (
            "no search list",
            vec![("list=search", ok(json!({ "query": {} })))],
            Outcome::Error,
        ),
        (
            "not JSON",
            vec![("list=search", Ok((200, "<html>".to_string())))],
            Outcome::Error,
        ),
        (
            "null body",
            vec![("list=search", ok(json!(null)))],
            Outcome::Error,
        ),
        (
            "no parse",
            vec![
                (
                    "list=search",
                    ok(json!({ "query": { "search": [ { "pageid": 1 } ] } })),
                ),
                (
                    "action=parse",
                    ok(json!({ "error": { "code": "missingtitle" } })),
                ),
            ],
            Outcome::Error,
        ),
        (
            "wikitext is a number",
            vec![
                (
                    "list=search",
                    ok(json!({ "query": { "search": [ { "pageid": 1 } ] } })),
                ),
                (
                    "action=parse",
                    ok(json!({ "parse": { "wikitext": { "*": 5 } } })),
                ),
            ],
            Outcome::Error,
        ),
        ("transport failure", vec![], Outcome::Error),
        (
            "timeout",
            vec![("list=search", Err(HttpError::Timeout))],
            Outcome::Error,
        ),
        (
            "too large",
            vec![("list=search", Err(HttpError::TooLarge))],
            Outcome::Error,
        ),
    ];
    for (name, rules, want) in cases {
        let run = run(rules);
        let got = pcgw::get_info(&run.ctx, "Game", None).await;
        assert_eq!(got.outcome, want, "{name}");
        assert!(got.info.is_none(), "{name}");
        // A failure leaves one line of fixed text and the title is nowhere in it.
        for line in run.lines.0.lock().unwrap().iter() {
            assert!(
                !line.contains("Game") && !line.contains("://"),
                "{name}: {line}"
            );
        }
    }
}

#[tokio::test]
async fn pcgamingwiki_uses_the_gog_id_first_and_falls_back_to_the_title_search() {
    let page = ok(json!({ "parse": { "wikitext": { "*": "|steam appid  = 7\n" } } }));
    // The cargoquery hit is used, the search is never made, the id is a text here.
    let hit = run(vec![
        (
            "action=cargoquery",
            ok(json!({ "cargoquery": [ { "title": { "pageID": "97605" } } ] })),
        ),
        ("pageid=97605", page.clone()),
    ]);
    let got = pcgw::get_info(&hit.ctx, "Cyberpunk 2077", Some("1423049311")).await;
    assert_eq!(got.outcome, Outcome::Ok);
    assert_eq!(
        urls(&hit)[0],
        "https://www.pcgamingwiki.com/w/api.php?action=cargoquery&tables=Infobox_game&fields=Infobox_game._pageID%3DpageID%2C&where=Infobox_game.GOGcom_ID%20HOLDS%201423049311&format=json"
    );
    assert_eq!(urls(&hit).len(), 2);

    // An empty cargoquery falls back to the title search.
    let empty = run(vec![
        ("action=cargoquery", ok(json!({ "cargoquery": [] }))),
        (
            "list=search",
            ok(json!({ "query": { "search": [ { "pageid": 12 } ] } })),
        ),
        ("pageid=12", page.clone()),
    ]);
    assert_eq!(
        pcgw::get_info(&empty.ctx, "Cyberpunk 2077", Some("1"))
            .await
            .outcome,
        Outcome::Ok
    );
    assert_eq!(urls(&empty).len(), 3);

    // The live API's answer today: HTTP 200 with an error object and no `cargoquery`. Reading it throws.
    let denied = run(vec![(
        "action=cargoquery",
        ok(json!({ "error": { "code": "permissiondenied" } })),
    )]);
    assert_eq!(
        pcgw::get_info(&denied.ctx, "Cyberpunk 2077", Some("1"))
            .await
            .outcome,
        Outcome::Error
    );
    assert_eq!(urls(&denied).len(), 1);

    // An empty GOG id is as absent as in JS: the cargoquery is skipped.
    let none = run(vec![(
        "list=search",
        ok(json!({ "query": { "search": [] } })),
    )]);
    assert_eq!(
        pcgw::get_info(&none.ctx, "Game", Some("")).await.outcome,
        Outcome::NotFound
    );
    assert_eq!(urls(&none).len(), 1);
}

#[tokio::test]
async fn pcgamingwiki_reads_the_page_the_way_the_ts_does() {
    let wikitext = "{{Infobox game\r\n|steam appid  = 2622380\r\n|hltb         = 160589\r\n\
        |direct3d versions      = 11, 12\r\n\
        {{Infobox game/row/reception|Metacritic|elden-ring|96}}\r\n\
        {{Infobox game/row/reception|IGDB|a|b|7}}\r\n\
        {{Infobox game/row/taxonomy/genres | Action, RPG }}\r\n\
        {{Infobox game/row/date|Windows|May 29, 2025}}{{Infobox game/row/date|OS X|June 1, 2025}}";
    let run = run(vec![
        (
            "list=search",
            ok(json!({ "query": { "search": [ { "pageid": "42" } ] } })),
        ),
        (
            "action=parse",
            ok(json!({ "parse": { "wikitext": { "*": wikitext } } })),
        ),
    ]);
    let got = pcgw::get_info(&run.ctx, "Elden Ring", None).await;
    let info = got.info.unwrap();
    assert_eq!(info.steam_id, "2622380");
    assert_eq!(info.how_long_to_beat_id, "160589");
    assert_eq!(info.direct3d_versions, ["11", "12"]);
    assert_eq!(info.genres, ["Action", "RPG"]);
    assert_eq!(info.metacritic.score, "96");
    assert_eq!(info.metacritic.urlid, "elden-ring");
    // A group that is not there is empty text, and the OpenCritic score is not there at all.
    assert_eq!(info.opencritic, pcgw::Score::default());
    assert_eq!(info.igdb.urlid, "a|b");
    assert_eq!(
        info.release_date,
        ["Windows: May 29, 2025", "OS X: June 1, 2025"]
    );
    // The keys come out in the order the TS wrote them (the wiki cache stores them so).
    let value = info.to_json();
    let keys: Vec<&str> = value
        .as_object()
        .unwrap()
        .iter()
        .map(|(k, _)| k.as_str())
        .collect();
    assert_eq!(
        keys,
        [
            "steamID",
            "howLongToBeatID",
            "metacritic",
            "opencritic",
            "igdb",
            "direct3DVersions",
            "genres",
            "releaseDate"
        ]
    );
}

#[tokio::test]
async fn pcgamingwiki_empty_lists_are_a_list_of_one_empty_text_as_in_ts() {
    let run = run(vec![
        (
            "list=search",
            ok(json!({ "query": { "search": [ { "pageid": 9 } ] } })),
        ),
        (
            "action=parse",
            ok(json!({ "parse": { "wikitext": { "*": "no fields" } } })),
        ),
    ]);
    let info = pcgw::get_info(&run.ctx, "Game", None).await.info.unwrap();
    assert_eq!(info.direct3d_versions, [""]);
    assert_eq!(info.genres, [""]);
    assert!(info.release_date.is_empty());
}

const AGW_UA: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[tokio::test]
async fn applegamingwiki_encodes_the_title_sends_the_browser_user_agent_and_reads_the_page() {
    let wikitext = format!(
        "|crossover{}= playable\n|wine{}= perfect\ncodeweavers  = elden-ring\n",
        " ".repeat(12),
        " ".repeat(17)
    );
    let run = run(vec![
        (
            "list=search",
            ok(json!({ "query": { "search": [ { "pageid": 1795 } ] } })),
        ),
        (
            "action=parse",
            ok(json!({ "parse": { "wikitext": { "*": wikitext } } })),
        ),
    ]);
    let got = agw::get_info(&run.ctx, "Anno 1602 - Konigs: Edition")
        .await
        .unwrap();
    assert_eq!(got.crossover_rating, "playable");
    assert_eq!(got.wine_rating, "perfect");
    assert_eq!(got.crossover_link, "elden-ring");
    assert_eq!(
        urls(&run),
        [
            "https://www.applegamingwiki.com/w/api.php?action=query&list=search&srsearch=Anno%201602%3A%20Konigs%3A%20Edition&format=json",
            "https://www.applegamingwiki.com/w/api.php?action=parse&format=json&pageid=1795&redirects=true&prop=wikitext",
        ]
    );
    for (_, agent) in run.http.seen.lock().unwrap().iter() {
        assert_eq!(agent.as_deref(), Some(AGW_UA));
    }
    let value = got.to_json();
    let keys: Vec<&str> = value
        .as_object()
        .unwrap()
        .iter()
        .map(|(k, _)| k.as_str())
        .collect();
    assert_eq!(keys, ["crossoverRating", "wineRating", "crossoverLink"]);
}

#[tokio::test]
async fn applegamingwiki_no_page_and_no_text_are_the_empty_value_and_a_failure_is_none() {
    let empty = agw::AgwInfo::default();
    for (name, rules, want) in [
        (
            "no hit",
            vec![("list=search", ok(json!({ "query": { "search": [] } })))],
            Some(empty.clone()),
        ),
        (
            "pageid 0",
            vec![(
                "list=search",
                ok(json!({ "query": { "search": [ { "pageid": 0 } ] } })),
            )],
            Some(empty.clone()),
        ),
        (
            "page without wikitext",
            vec![
                (
                    "list=search",
                    ok(json!({ "query": { "search": [ { "pageid": 3 } ] } })),
                ),
                ("action=parse", ok(json!({ "parse": { "wikitext": "" } }))),
            ],
            Some(empty.clone()),
        ),
        (
            "page with no matching fields",
            vec![
                (
                    "list=search",
                    ok(json!({ "query": { "search": [ { "pageid": 3 } ] } })),
                ),
                (
                    "action=parse",
                    ok(json!({ "parse": { "wikitext": { "*": "nothing" } } })),
                ),
            ],
            Some(empty.clone()),
        ),
        (
            "403",
            vec![("list=search", Ok((403, "{}".to_string())))],
            None,
        ),
        ("no query", vec![("list=search", ok(json!({})))], None),
        (
            "no parse",
            vec![
                (
                    "list=search",
                    ok(json!({ "query": { "search": [ { "pageid": 3 } ] } })),
                ),
                ("action=parse", ok(json!({}))),
            ],
            None,
        ),
        (
            "wikitext is a list",
            vec![
                (
                    "list=search",
                    ok(json!({ "query": { "search": [ { "pageid": 3 } ] } })),
                ),
                (
                    "action=parse",
                    ok(json!({ "parse": { "wikitext": { "*": [1] } } })),
                ),
            ],
            None,
        ),
        ("transport failure", vec![], None),
    ] {
        let run = run(rules);
        assert_eq!(agw::get_info(&run.ctx, "Game").await, want, "{name}");
    }
}

#[tokio::test]
async fn protondb_and_the_deck_ask_nothing_without_a_steam_id() {
    let run = run(vec![]);
    for id in [None, Some("")] {
        assert_eq!(protondb::get_info(&run.ctx, id).await, None);
        assert_eq!(deck::get_comp(&run.ctx, id).await, None);
    }
    assert!(urls(&run).is_empty());
}

#[tokio::test]
async fn protondb_builds_the_ts_url_sends_the_gamelib_user_agent_and_reads_the_tier() {
    let run = run(vec![(
        "summaries/1234.json",
        ok(json!({ "tier": "gold", "score": 0.7 })),
    )]);
    let got = protondb::get_info(&run.ctx, Some("1234")).await.unwrap();
    assert_eq!(got.to_value(), json!({ "level": "gold" }));
    assert_eq!(
        urls(&run),
        ["https://www.protondb.com/api/v1/reports/summaries/1234.json"]
    );
    assert_eq!(run.http.seen.lock().unwrap()[0].1.as_deref(), Some(PCGW_UA));
}

/// What the TS did with an answer that is not what it expected: `null`, and one line of fixed text.
#[tokio::test]
async fn protondb_answers_none_for_a_changed_api_and_for_every_failure() {
    for (name, rules) in [
        (
            "tierLevel instead of tier",
            vec![("summaries", ok(json!({ "tierLevel": "gold" })))],
        ),
        ("empty tier", vec![("summaries", ok(json!({ "tier": "" })))]),
        (
            "null tier",
            vec![("summaries", ok(json!({ "tier": null })))],
        ),
        ("null body", vec![("summaries", ok(json!(null)))]),
        (
            "text body",
            vec![("summaries", Ok((200, "<html>".to_string())))],
        ),
        ("404", vec![("summaries", Ok((404, "{}".to_string())))]),
        ("transport failure", vec![]),
        ("timeout", vec![("summaries", Err(HttpError::Timeout))]),
    ] {
        let run = run(rules);
        assert_eq!(
            protondb::get_info(&run.ctx, Some("1234")).await,
            None,
            "{name}"
        );
        let lines = run.lines.0.lock().unwrap();
        assert_eq!(lines.len(), 1, "{name}: {lines:?}");
        assert!(
            !lines[0].contains("1234") && !lines[0].contains("://"),
            "{name}: {}",
            lines[0]
        );
    }
    // A tier that is truthy but not a text is passed through, as the TS passed it.
    let run = run(vec![("summaries", ok(json!({ "tier": 3 })))]);
    assert_eq!(
        protondb::get_info(&run.ctx, Some("1"))
            .await
            .unwrap()
            .to_value(),
        json!({ "level": 3 })
    );
}

#[tokio::test]
async fn the_deck_builds_the_ts_url_and_reads_a_finite_number() {
    let run = run(vec![(
        "nAppID=1234",
        ok(json!({ "success": 1, "results": { "resolved_category": 3 } })),
    )]);
    let got = deck::get_comp(&run.ctx, Some("1234")).await.unwrap();
    assert_eq!(got.to_value(), json!({ "category": 3 }));
    assert_eq!(
        urls(&run),
        ["https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=1234"]
    );
    assert_eq!(run.http.seen.lock().unwrap()[0].1.as_deref(), Some(PCGW_UA));
    // Category 0 (unknown) is a finite number, so it is an answer (the TS tested `isFinite`, not truth).
    let zero = self::run(vec![(
        "nAppID",
        ok(json!({ "results": { "resolved_category": 0 } })),
    )]);
    assert_eq!(
        deck::get_comp(&zero.ctx, Some("1"))
            .await
            .unwrap()
            .to_value(),
        json!({ "category": 0 })
    );
}

#[tokio::test]
async fn the_deck_answers_none_unless_the_category_is_a_finite_number() {
    for (name, rules) in [
        (
            "tierLevel",
            vec![("nAppID", ok(json!({ "results": { "tierLevel": "gold" } })))],
        ),
        (
            "numeric text",
            vec![(
                "nAppID",
                ok(json!({ "results": { "resolved_category": "3" } })),
            )],
        ),
        (
            "null category",
            vec![(
                "nAppID",
                ok(json!({ "results": { "resolved_category": null } })),
            )],
        ),
        ("no results", vec![("nAppID", ok(json!({})))]),
        (
            "null results",
            vec![("nAppID", ok(json!({ "results": null })))],
        ),
        ("null body", vec![("nAppID", ok(json!(null)))]),
        ("text body", vec![("nAppID", Ok((200, "nope".to_string())))]),
        ("500", vec![("nAppID", Ok((500, "{}".to_string())))]),
        ("transport failure", vec![]),
    ] {
        let run = run(rules);
        assert_eq!(deck::get_comp(&run.ctx, Some("1234")).await, None, "{name}");
        let lines = run.lines.0.lock().unwrap();
        assert_eq!(lines.len(), 1, "{name}: {lines:?}");
        assert!(
            !lines[0].contains("1234") && !lines[0].contains("://"),
            "{name}: {}",
            lines[0]
        );
    }
}
