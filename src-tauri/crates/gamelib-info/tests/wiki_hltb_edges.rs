//! HowLongToBeat, GamesDB and the GOG context: the paths the recorded goldens do not reach (86-21). Each
//! expectation is what the TS code does for the same input (a property read of `undefined` throws; the
//! lookups fail soft to `null` or `{ steamID: "" }`; a rejection outside a `try` fails the whole wiki
//! lookup, which is `Err` here), plus the properties this plan adds: the credentials are fetched once and
//! shared, a failed handshake is never kept, the GOG answers are read and never stored, and a diagnostic
//! line holds fixed text only.

mod wiki_golden;

use std::sync::atomic::AtomicU64;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use gamelib_info::crossover::GameRef;
use gamelib_info::ctx::InfoLog;
use gamelib_info::http::{Http, HttpError, HttpFuture, Method, Request, Response};
use gamelib_info::wiki::{gamesdb, gog_ctx, hltb, Thrown};
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};
use wiki_golden::*;

type Handler = Box<dyn Fn(&Request) -> Result<Response, HttpError> + Send + Sync>;

/// Answers each request with `handler`, keeps the whole request, and yields once before answering so a
/// second caller can start while the first is still in flight.
struct Scripted {
    handler: Handler,
    seen: Mutex<Vec<Request>>,
}

impl Http for Scripted {
    fn send(&self, request: Request) -> HttpFuture<'_> {
        let answer = (self.handler)(&request);
        self.seen.lock().unwrap().push(request);
        Box::pin(async move {
            tokio::task::yield_now().await;
            answer
        })
    }
}

fn answer(status: u16, body: &str) -> Result<Response, HttpError> {
    Ok(Response {
        status,
        headers: Vec::new(),
        body: body.as_bytes().to_vec(),
    })
}

struct Run {
    _home: FakeHome,
    user_data: std::path::PathBuf,
    before: std::collections::BTreeMap<String, Vec<u8>>,
    ctx: gamelib_info::ctx::InfoCtx,
    http: Arc<Scripted>,
    lines: Arc<Lines>,
}

fn run(handler: impl Fn(&Request) -> Result<Response, HttpError> + Send + Sync + 'static) -> Run {
    let http = Arc::new(Scripted {
        handler: Box::new(handler),
        seen: Mutex::new(Vec::new()),
    });
    let clock = Arc::new(TestClock(AtomicU64::new(ORACLE_NOW)));
    let home = FakeHome::new("info-wiki-hltb-edges-");
    let case = json!({ "id": "edges", "platform": "windows" });
    let (mut ctx, user_data) = case_ctx(&case, &home, &clock, Arc::clone(&http) as Arc<dyn Http>);
    let lines = Arc::new(Lines::default());
    ctx.log = Some(Arc::clone(&lines) as Arc<dyn InfoLog>);
    Run {
        _home: home,
        before: tree(&user_data),
        user_data,
        ctx,
        http,
        lines,
    }
}

impl Run {
    fn requests(&self) -> Vec<Request> {
        self.http.seen.lock().unwrap().clone()
    }

    fn urls(&self) -> Vec<String> {
        self.requests().into_iter().map(|r| r.url).collect()
    }

    fn count(&self, needle: &str) -> usize {
        self.urls().iter().filter(|u| u.contains(needle)).count()
    }

    fn unchanged(&self) {
        assert_eq!(tree(&self.user_data), self.before, "the profile changed");
    }
}

const INIT: &str = "/api/search/site/init";
const SEARCH: &str = "/api/search/site";
const CREDENTIALS: &str = r#"{"token":"tok-abc","hpKey":"hp-key","hpVal":"hp-val"}"#;
const HADES: &str = r#"{"data":[{"game_id":9,"game_name":"Hades","comp_main":36000,"comp_plus":0,"comp_100":7200}]}"#;

fn is_init(request: &Request) -> bool {
    request.url.contains(INIT)
}

fn is_search(request: &Request) -> bool {
    request.method == Method::Post && request.url.ends_with(SEARCH)
}

fn header<'a>(request: &'a Request, name: &str) -> Option<&'a str> {
    request
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

#[tokio::test]
async fn the_credentials_are_fetched_once_and_reused_by_the_next_title_lookup() {
    let run = run(|request| {
        if is_init(request) {
            answer(200, CREDENTIALS)
        } else {
            answer(200, HADES)
        }
    });
    let first = hltb::get_by_title(&run.ctx, "Hades").await.unwrap();
    let second = hltb::get_by_title(&run.ctx, "Hades").await.unwrap();
    assert_eq!(first, second);
    assert_eq!(run.count(INIT), 1, "one handshake");
    assert_eq!(run.requests().iter().filter(|r| is_search(r)).count(), 2);
    assert_eq!(
        first.to_value(),
        json!({
            "mainStory": 10, "mainExtra": 0, "completionist": 2, "gameId": 9, "gameName": "Hades",
            "gameWebLink": "https://howlongtobeat.com/game/9"
        })
    );
    run.unchanged();
}

#[tokio::test]
async fn concurrent_lookups_share_one_handshake() {
    let run = run(|request| {
        if is_init(request) {
            answer(200, CREDENTIALS)
        } else {
            answer(200, HADES)
        }
    });
    let (a, b, c) = tokio::join!(
        hltb::get_by_title(&run.ctx, "Hades"),
        hltb::get_by_title(&run.ctx, "Hades"),
        hltb::get_by_title(&run.ctx, "Hades")
    );
    assert!(a.is_some() && a == b && b == c);
    assert_eq!(run.count(INIT), 1, "three callers, one handshake");
}

#[tokio::test]
async fn a_failed_handshake_is_not_kept_and_a_concurrent_waiter_shares_its_failure() {
    let inits = Arc::new(AtomicUsize::new(0));
    let seen = Arc::clone(&inits);
    let run = run(move |request| {
        if is_init(request) {
            // The first handshake fails, the next succeeds.
            if seen.fetch_add(1, Ordering::SeqCst) == 0 {
                answer(403, "<html>blocked</html>")
            } else {
                answer(200, CREDENTIALS)
            }
        } else {
            answer(200, HADES)
        }
    });
    // Two callers in flight together get the one failed outcome (no second handshake for the waiter).
    let (a, b) = tokio::join!(
        hltb::get_by_title(&run.ctx, "Hades"),
        hltb::get_by_title(&run.ctx, "Hades")
    );
    assert!(a.is_none() && b.is_none());
    assert_eq!(run.count(INIT), 1);
    // The failure was not cached: the next caller handshakes again, and succeeds.
    assert!(hltb::get_by_title(&run.ctx, "Hades").await.is_some());
    assert_eq!(run.count(INIT), 2);
}

#[tokio::test]
async fn the_search_carries_the_token_the_honeypot_pair_and_no_accept_encoding() {
    let run = run(|request| {
        if is_init(request) {
            answer(200, CREDENTIALS)
        } else {
            answer(200, HADES)
        }
    });
    hltb::get_by_title(&run.ctx, "Hades").await.unwrap();
    for request in run.requests() {
        assert!(header(&request, "accept-encoding").is_none());
        assert_eq!(
            header(&request, "user-agent"),
            Some("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        );
        assert_eq!(
            header(&request, "referer"),
            Some("https://howlongtobeat.com/")
        );
    }
    let requests = run.requests();
    let init = &requests[0];
    assert_eq!(
        init.url,
        format!("https://howlongtobeat.com/api/search/site/init?t={ORACLE_NOW}")
    );
    let search = &requests[1];
    assert_eq!(header(search, "x-auth-token"), Some("tok-abc"));
    assert_eq!(header(search, "x-hp-key"), Some("hp-key"));
    assert_eq!(header(search, "x-hp-val"), Some("hp-val"));
    assert_eq!(header(search, "content-type"), Some("application/json"));
    let body: Value = serde_json::from_slice(search.body.as_ref().unwrap()).unwrap();
    assert_eq!(
        body["hp-key"], "hp-val",
        "the honeypot value is in the body too"
    );
    assert_eq!(body["searchTerms"], json!(["Hades"]));
    // The token is held in memory only: no line and no file of the profile carries it.
    for line in run.lines.0.lock().unwrap().iter() {
        assert!(
            !line.contains("tok-abc") && !line.contains("hp-val"),
            "{line}"
        );
    }
    run.unchanged();
}

#[tokio::test]
async fn a_403_search_re_handshakes_once_and_a_second_403_gives_up() {
    let run = run(|request| {
        if is_init(request) {
            answer(200, CREDENTIALS)
        } else {
            answer(403, "{}")
        }
    });
    assert!(hltb::get_by_title(&run.ctx, "Hades").await.is_none());
    assert_eq!(run.count(INIT), 2);
    assert_eq!(run.requests().iter().filter(|r| is_search(r)).count(), 2);
}

#[tokio::test]
async fn a_search_that_cannot_start_or_answers_badly_is_null_with_fixed_text_lines() {
    let hades = "Hades";
    let cases: Vec<(&str, Handler)> = vec![
        (
            "init without a key",
            Box::new(|_| answer(200, r#"{"token":"t"}"#)),
        ),
        (
            "init without a token",
            Box::new(|_| answer(200, r#"{"hpKey":"k"}"#)),
        ),
        ("init text body", Box::new(|_| answer(200, "<html>"))),
        ("init null body", Box::new(|_| answer(200, "null"))),
        (
            "init 5xx",
            Box::new(|r| {
                if is_init(r) {
                    answer(503, "")
                } else {
                    answer(200, HADES)
                }
            }),
        ),
        (
            "init transport failure",
            Box::new(|_| Err(HttpError::Network("down".to_string()))),
        ),
        ("init timeout", Box::new(|_| Err(HttpError::Timeout))),
        (
            "search 5xx",
            Box::new(|r| {
                if is_init(r) {
                    answer(200, CREDENTIALS)
                } else {
                    answer(500, "")
                }
            }),
        ),
        (
            "search 404",
            Box::new(|r| {
                if is_init(r) {
                    answer(200, CREDENTIALS)
                } else {
                    answer(404, "{}")
                }
            }),
        ),
        (
            "search empty list",
            Box::new(|r| {
                if is_init(r) {
                    answer(200, CREDENTIALS)
                } else {
                    answer(200, r#"{"data":[]}"#)
                }
            }),
        ),
        (
            "search data is an object",
            Box::new(|r| {
                if is_init(r) {
                    answer(200, CREDENTIALS)
                } else {
                    answer(200, r#"{"data":{"a":1}}"#)
                }
            }),
        ),
        (
            "search null result",
            Box::new(|r| {
                if is_init(r) {
                    answer(200, CREDENTIALS)
                } else {
                    answer(200, r#"{"data":[null]}"#)
                }
            }),
        ),
        (
            "search name that is not a text",
            Box::new(|r| {
                if is_init(r) {
                    answer(200, CREDENTIALS)
                } else {
                    answer(200, r#"{"data":[{"game_name":5,"game_id":1}]}"#)
                }
            }),
        ),
        (
            "search no unambiguous match",
            Box::new(|r| {
                if is_init(r) {
                    answer(200, CREDENTIALS)
                } else {
                    answer(
                        200,
                        r#"{"data":[{"game_name":"Hades","game_id":1},{"game_name":"HADES","game_id":2}]}"#,
                    )
                }
            }),
        ),
    ];
    for (name, handler) in cases {
        let run = run(handler);
        assert_eq!(hltb::get_by_title(&run.ctx, hades).await, None, "{name}");
        let lines = run.lines.0.lock().unwrap();
        assert!(!lines.is_empty(), "{name}: no line");
        for line in lines.iter() {
            assert!(
                !line.contains("://") && !line.contains(hades),
                "{name}: {line}"
            );
            assert!(!line.contains("down"), "{name}: {line}");
        }
        drop(lines);
        run.unchanged();
    }
}

#[tokio::test]
async fn the_by_title_pick_skips_an_empty_name_and_reads_the_matched_game() {
    let run = run(|r| {
        if is_init(r) {
            answer(200, CREDENTIALS)
        } else {
            answer(
                200,
                r#"{"data":[{"game_id":1},{"game_name":"","game_id":2},{"game_name":"Hades","game_id":3,"game_image":"3_h.jpg","comp_main":5400}]}"#,
            )
        }
    });
    let entry = hltb::get_by_title(&run.ctx, "Hades").await.unwrap();
    assert_eq!(
        entry.to_value(),
        json!({
            "mainStory": 2, "mainExtra": 0, "completionist": 0, "gameId": 3, "gameName": "Hades",
            "gameImageUrl": "https://howlongtobeat.com/games/3_h.jpg",
            "gameWebLink": "https://howlongtobeat.com/game/3"
        })
    );
}

fn next_data_page(game: &Value) -> String {
    let data = json!({ "props": { "pageProps": { "game": { "data": { "game": [game] } } } } });
    format!("<html><script id=\"__NEXT_DATA__\" type=\"application/json\">{data}</script></html>")
}

#[tokio::test]
async fn by_id_reads_the_next_data_game_and_every_miss_is_null() {
    let page = next_data_page(&json!({ "game_id": 7, "game_name": "Celeste", "comp_main": 36000 }));
    let ok = run(move |_| answer(200, &page));
    let entry = hltb::get_by_id(&ok.ctx, "7").await.unwrap();
    assert_eq!(entry.to_value()["gameId"], 7);
    assert_eq!(ok.urls(), ["https://howlongtobeat.com/game/7"]);
    assert_eq!(
        header(&ok.requests()[0], "referer"),
        Some("https://howlongtobeat.com")
    );

    let no_id = next_data_page(&json!({ "game_name": "x" }));
    let empty_list = "<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"props\":{\"pageProps\":{\"game\":{\"data\":{\"game\":[]}}}}}</script>";
    let no_props = "<script id=\"__NEXT_DATA__\" type=\"application/json\">{}</script>";
    let null_data = "<script id=\"__NEXT_DATA__\" type=\"application/json\">null</script>";
    let broken = "<script id=\"__NEXT_DATA__\" type=\"application/json\">{not json</script>";
    for (name, status, body) in [
        ("no game_id", 200, no_id.as_str()),
        ("empty list", 200, empty_list),
        ("no props", 200, no_props),
        ("null data", 200, null_data),
        ("broken json", 200, broken),
        ("no script", 200, "<html></html>"),
        ("404", 404, "<html></html>"),
        ("json body", 200, "[1]"),
        ("5xx", 502, ""),
    ] {
        let body = body.to_string();
        let run = run(move |_| answer(status, &body));
        assert_eq!(hltb::get_by_id(&run.ctx, "7").await, None, "{name}");
    }
}

fn gog_games(href: Option<&str>) -> String {
    match href {
        Some(href) => json!({ "_links": { "store": { "href": href } } }).to_string(),
        None => json!({ "_links": { "store": {} } }).to_string(),
    }
}

const BOX: &str = r#"<div><span class="howlongtobeat-box__time"> 25.5 h</span><span class="howlongtobeat-box__name">Main</span><span class="howlongtobeat-box__time">40 h </span><span class="howlongtobeat-box__name">Main + Sides</span><span class="howlongtobeat-box__time"> 62.4 h</span><span class="howlongtobeat-box__name">Completionist</span><a target="_blank" href="https://howlongtobeat.com/game/2127">HowLongToBeat</a></div>"#;

fn gog_flow(games: &'static str, page_status: u16, page: &'static str) -> Run {
    run(move |request| {
        if request.url.contains("api.gog.com/v2/games/") {
            answer(200, games)
        } else {
            answer(page_status, page)
        }
    })
}

#[tokio::test]
async fn the_gog_box_is_parsed_from_the_affiliate_store_page() {
    let games: &'static str =
        Box::leak(gog_games(Some("https://www.gog.com/en/game/cp")).into_boxed_str());
    let run = gog_flow(games, 200, BOX);
    let entry = hltb::get_gog(&run.ctx, "1423049311", "Cyberpunk 2077")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        entry.to_value(),
        json!({
            "mainStory": 26, "mainExtra": 40, "completionist": 62, "gameId": 2127,
            "gameName": "Cyberpunk 2077", "gameWebLink": "https://howlongtobeat.com/game/2127"
        })
    );
    assert_eq!(
        run.urls(),
        [
            "https://api.gog.com/v2/games/1423049311?locale=en-US",
            "https://af.gog.com/en/game/cp?as=1838482841"
        ]
    );
    // The page request has the browser headers and no Referer; the API one only the GameLib agent.
    assert!(header(&run.requests()[1], "referer").is_none());
    assert!(header(&run.requests()[1], "accept-encoding").is_none());
    assert_eq!(
        header(&run.requests()[0], "user-agent"),
        Some("GameLib/0.11.0 (+https://github.com/grayson-mitchell/GameLib)")
    );
    // D-23: nothing of GOG's is stored.
    run.unchanged();
    assert!(!run.user_data.join("store_cache/gog_api_info.json").exists());
}

#[tokio::test]
async fn the_gog_branch_fails_soft_and_never_falls_back_to_a_title_search() {
    let with_link: &'static str =
        Box::leak(gog_games(Some("https://www.gog.com/en/game/cp")).into_boxed_str());
    let no_href: &'static str = Box::leak(gog_games(None).into_boxed_str());
    let no_main: &'static str = r#"<span class="howlongtobeat-box__time"> 1 h</span><span class="howlongtobeat-box__name">Completionist</span>"#;
    for (name, run) in [
        ("page 404", gog_flow(with_link, 404, "")),
        ("page 5xx", gog_flow(with_link, 500, "")),
        (
            "page without a box",
            gog_flow(with_link, 200, "<html></html>"),
        ),
        ("page missing a time", gog_flow(with_link, 200, no_main)),
        ("no store href", gog_flow(no_href, 200, BOX)),
        ("no _links", gog_flow("{}", 200, BOX)),
        ("null _links", gog_flow(r#"{"_links":null}"#, 200, BOX)),
        ("null body", gog_flow("null", 200, BOX)),
    ] {
        let game = GameRef {
            runner: "gog",
            app_name: "1",
            title: "Cyberpunk 2077",
        };
        let got = hltb::get(&run.ctx, &game, Some("2127")).await.unwrap();
        assert_eq!(got, None, "{name}");
        assert_eq!(
            run.count(SEARCH),
            0,
            "{name}: a GOG game is never searched by title"
        );
        assert_eq!(run.count("/game/2127"), 0, "{name}: nor looked up by id");
        run.unchanged();
    }
    // An answer whose `_links` has no `store` made the TS reject outside its `try`: `Err`, which fails
    // the whole wiki lookup as it did.
    for body in [r#"{"_links":{}}"#, r#"{"_links":{"store":null}}"#] {
        let run = gog_flow(body, 200, BOX);
        assert_eq!(
            gog_ctx::gog_store_url(&run.ctx, "1").await,
            Err(Thrown::Shape),
            "{body}"
        );
    }
    // So does a link that is not a URL.
    let run = gog_flow(r#"{"_links":{"store":{"href":"nope"}}}"#, 200, BOX);
    assert_eq!(
        gog_ctx::gog_store_url(&run.ctx, "1").await,
        Err(Thrown::Shape)
    );
    // A failed games request is `null` data: no link, no error.
    let run = run_failing();
    assert_eq!(gog_ctx::gog_store_url(&run.ctx, "1").await, Ok(None));
}

fn run_failing() -> Run {
    run(|_| Err(HttpError::Network("down".to_string())))
}

#[tokio::test]
async fn get_follows_the_ts_order_id_then_title_and_skips_what_cannot_be_asked() {
    let page = next_data_page(&json!({ "game_id": 7, "game_name": "Celeste" }));
    let routes = move |request: &Request| {
        if is_init(request) {
            answer(200, CREDENTIALS)
        } else if is_search(request) {
            answer(200, HADES)
        } else if request.url.ends_with("/game/7") {
            answer(200, &page)
        } else {
            answer(404, "")
        }
    };
    let game = |title| GameRef {
        runner: "sideload",
        app_name: "a",
        title,
    };

    // An id that answers is used and nothing else is asked.
    let found = run(routes.clone());
    let entry = hltb::get(&found.ctx, &game("Hades"), Some("7"))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(entry.to_value()["gameId"], 7);
    assert_eq!(found.count(SEARCH), 0);

    // A stale id (404) falls back to the title search.
    let stale = run(routes.clone());
    let entry = hltb::get(&stale.ctx, &game("Hades"), Some("8"))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(entry.to_value()["gameId"], 9);
    assert_eq!(stale.urls()[0], "https://howlongtobeat.com/game/8");

    // No id, or an empty one, goes straight to the search.
    for id in [None, Some("")] {
        let run = run(routes.clone());
        assert!(hltb::get(&run.ctx, &game("Hades"), id)
            .await
            .unwrap()
            .is_some());
        assert_eq!(run.count("/game/"), 0);
    }

    // No id and no title asks nothing.
    let nothing = run(routes);
    assert_eq!(hltb::get(&nothing.ctx, &game(""), None).await, Ok(None));
    assert!(nothing.urls().is_empty());
}

#[tokio::test]
async fn gamesdb_reads_the_steam_release_and_fails_like_the_ts() {
    let get = |runner: &'static str, body: Value| {
        let run = run(move |_| answer(200, &body.to_string()));
        async move {
            let got = gamesdb::get(&run.ctx, "t", "game-1", runner).await;
            let asked = run.urls();
            run.unchanged();
            (got.map(|g| g.to_value()), asked)
        }
    };
    let release = |platform: &str, id: Value| json!({ "platform_id": platform, "external_id": id });

    let (got, asked) = get(
        "gog",
        json!({ "game": { "releases": [release("epic", json!("e")), release("steam", json!("440"))] } }),
    )
    .await;
    assert_eq!(got, Ok(json!({ "steamID": "440" })));
    assert_eq!(
        asked,
        ["https://gamesdb.gog.com/platforms/gog/external_releases/game-1"]
    );

    // The Epic runner asks the `epic` platform.
    let (_, asked) = get("legendary", json!({ "game": { "releases": [] } })).await;
    assert_eq!(
        asked,
        ["https://gamesdb.gog.com/platforms/epic/external_releases/game-1"]
    );

    // No steam release, and a steam release with no or a null id, read as an empty id.
    for body in [
        json!({ "game": { "releases": [release("epic", json!("e"))] } }),
        json!({ "game": { "releases": [] } }),
        json!({ "game": { "releases": [{ "platform_id": "steam" }] } }),
        json!({ "game": { "releases": [release("steam", Value::Null)] } }),
    ] {
        let (got, _) = get("gog", body.clone()).await;
        assert_eq!(got, Ok(json!({ "steamID": "" })), "{body}");
    }
    // A number is passed through as sent.
    let (got, _) = get(
        "gog",
        json!({ "game": { "releases": [release("steam", json!(440))] } }),
    )
    .await;
    assert_eq!(got, Ok(json!({ "steamID": 440 })));
    // The first steam release wins, and a malformed entry AFTER it is never read.
    let (got, _) = get(
        "gog",
        json!({ "game": { "releases": [release("steam", json!("1")), null] } }),
    )
    .await;
    assert_eq!(got, Ok(json!({ "steamID": "1" })));

    // Data with no `game.releases` list made the TS throw out of the lookup; so does a null entry read
    // before a match.
    for body in [
        json!({}),
        json!({ "game": null }),
        json!({ "game": {} }),
        json!({ "game": { "releases": "x" } }),
        json!({ "game": { "releases": {} } }),
        json!({ "game": { "releases": [null, release("steam", json!("1"))] } }),
        json!([]),
    ] {
        let (got, _) = get("gog", body.clone()).await;
        assert_eq!(got, Err(Thrown::Shape), "{body}");
    }
    // Answers that are not data: the TS swallowed them into "no data".
    for body in [json!(null), json!("text"), json!(5)] {
        let (got, _) = get("gog", body.clone()).await;
        assert_eq!(got, Ok(json!({ "steamID": "" })), "{body}");
    }
}

#[tokio::test]
async fn gamesdb_asks_nothing_for_a_steam_app_id_or_a_sideload_and_survives_failures() {
    for runner in ["steam", "sideload", "not-a-runner"] {
        let run = run(|_| answer(200, "{}"));
        let got = gamesdb::get(&run.ctx, "t", "1", runner).await.unwrap();
        assert_eq!(got.to_value(), json!({ "steamID": "" }), "{runner}");
        assert!(run.urls().is_empty(), "{runner}");
    }
    for (name, handler) in [
        ("404", Box::new(|_: &Request| answer(404, "{}")) as Handler),
        ("500", Box::new(|_| answer(500, "{}"))),
        ("transport", Box::new(|_| Err(HttpError::Timeout))),
    ] {
        let run = run(handler);
        let got = gamesdb::get(&run.ctx, "t", "1", "gog").await.unwrap();
        assert_eq!(got.to_value(), json!({ "steamID": "" }), "{name}");
        for line in run.lines.0.lock().unwrap().iter() {
            assert!(!line.contains("://"), "{name}: {line}");
        }
    }
}
