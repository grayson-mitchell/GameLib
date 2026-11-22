//! The HTTP seam and the op wrapper: `axios_query`, the request-pinning `Replay`, `ReqwestHttp`
//! against a local server, `MemorySecretSource`, and the shutdown contract around every op.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform};
use gamelib_info::guarded;
use gamelib_info::http::{
    axios_query, install_crypto_provider, Http, HttpError, Method, Replay, Request, ReqwestHttp,
};
use gamelib_info::secrets::{EnvSecretSource, MemorySecretSource, SecretSource, Slot};
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

const T: Duration = Duration::from_secs(5);

// ---------------------------------------------------------------------------------------------
// axios_query
// ---------------------------------------------------------------------------------------------

#[test]
fn axios_query_matches_axios_encoding() {
    assert_eq!(
        axios_query(&[("dimensions", "460x215,920x430"), ("q", "a b:c$[]'!()*~")]),
        "dimensions=460x215,920x430&q=a+b:c$%5B%5D'!()*~"
    );
}

#[test]
fn axios_query_encodes_the_rest_as_encode_uri_component_does() {
    assert_eq!(axios_query(&[]), "");
    // Reserved and unsafe bytes are percent-encoded in upper-case hex; non-ASCII as UTF-8.
    assert_eq!(
        axios_query(&[("k", "a&b=c/d?e#f%g+h;i@j\"k<l>m\\n^o`p{q|r}s")]),
        "k=a%26b%3Dc%2Fd%3Fe%23f%25g%2Bh%3Bi%40j%22k%3Cl%3Em%5Cn%5Eo%60p%7Bq%7Cr%7Ds"
    );
    assert_eq!(axios_query(&[("t", "Café ☃")]), "t=Caf%C3%A9+%E2%98%83");
    // Keys are encoded the same way as values.
    assert_eq!(
        axios_query(&[("a b", "1"), ("c[]", "2")]),
        "a+b=1&c%5B%5D=2"
    );
    // Unreserved characters stay literal.
    assert_eq!(axios_query(&[("k", "AZaz09-_.~")]), "k=AZaz09-_.~");
}

// ---------------------------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------------------------

/// Writes a case directory: `exchanges.json` plus its body files.
fn case(exchanges: Value, bodies: &[(&str, &[u8])]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("exchanges.json"),
        serde_json::to_vec_pretty(&exchanges).unwrap(),
    )
    .unwrap();
    for (name, body) in bodies {
        std::fs::write(dir.path().join(name), body).unwrap();
    }
    dir
}

fn one_exchange() -> Value {
    json!([{
        "id": "e1",
        "request": {
            "method": "GET",
            "url": "https://example.test/api/search?q=half+life&page=2&dimensions=460x215,920x430",
            "headers": {
                "User-Agent": "GameLib/1.0",
                "Accept": "application/json, text/plain, */*",
                "Accept-Encoding": "gzip, compress, deflate, br",
                "Authorization": "Bearer REDACTED"
            }
        },
        "response": {
            "status": 200,
            "headers": {"content-type": "application/json"},
            "bodyFile": "body-1.json"
        }
    }])
}

fn matching_request() -> Request {
    Request::get(
        format!(
            "https://example.test/api/search?{}",
            axios_query(&[
                ("q", "half life"),
                ("page", "2"),
                ("dimensions", "460x215,920x430")
            ])
        ),
        T,
    )
    .header("User-Agent", "GameLib/1.0")
    .header("Authorization", "Bearer REDACTED")
    // A transport header: axios and reqwest add these differently, so it is not pinned.
    .header("Accept-Encoding", "identity")
}

fn replay(exchanges: Value) -> (tempfile::TempDir, Replay) {
    let dir = case(exchanges, &[("body-1.json", b"{\"ok\":true}")]);
    let r = Replay::from_case(dir.path()).unwrap();
    (dir, r)
}

#[tokio::test]
async fn replay_serves_a_matching_request_and_finishes_clean() {
    let (_dir, r) = replay(one_exchange());
    let resp = r.send(matching_request()).await.unwrap();
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body, b"{\"ok\":true}");
    assert!(resp
        .headers
        .iter()
        .any(|(k, v)| k == "content-type" && v == "application/json"));
    r.finish().unwrap();
}

#[tokio::test]
async fn replay_fails_naming_the_request_when_the_path_differs() {
    let (_dir, r) = replay(one_exchange());
    let req = Request::get("https://example.test/api/other?q=half+life", T);
    let err = r.send(req).await.unwrap_err();
    let HttpError::Network(message) = err else {
        panic!("expected a replay mismatch")
    };
    assert!(message.contains("GET"), "{message}");
    assert!(message.contains("example.test/api/other"), "{message}");
    assert!(r.finish().unwrap_err().contains("example.test/api/other"));
}

#[tokio::test]
async fn replay_fails_on_a_decoded_query_pair_that_differs() {
    let (_dir, r) = replay(one_exchange());
    let mut req = matching_request();
    req.url = req.url.replace("page=2", "page=3");
    let err = r.send(req).await.unwrap_err();
    let HttpError::Network(message) = err else {
        panic!("expected a replay mismatch")
    };
    assert!(message.contains("page"), "{message}");
    assert!(message.contains("/api/search"), "{message}");
}

#[tokio::test]
async fn replay_compares_decoded_query_pairs_in_order() {
    let (_dir, r) = replay(one_exchange());
    // The same pairs spelled differently on the wire (%20 for +) are the same request...
    let mut req = matching_request();
    req.url = req.url.replace("half+life", "half%20life");
    r.send(req).await.unwrap();
    // ...but a different order is a different request.
    let (_dir, r) = replay(one_exchange());
    let mut req = matching_request();
    req.url =
        "https://example.test/api/search?page=2&q=half+life&dimensions=460x215,920x430".to_string();
    assert!(r.send(req).await.is_err());
}

#[tokio::test]
async fn replay_fails_on_a_pinned_header_that_differs_or_is_added() {
    let (_dir, r) = replay(one_exchange());
    let req = Request::get(matching_request().url, T)
        .header("User-Agent", "Other/2.0")
        .header("Authorization", "Bearer REDACTED");
    let HttpError::Network(message) = r.send(req).await.unwrap_err() else {
        panic!("expected a replay mismatch")
    };
    assert!(message.to_lowercase().contains("user-agent"), "{message}");

    // A pinned header the recording never had is drift too.
    let (_dir, r) = replay(one_exchange());
    let req = matching_request().header("Referer", "https://elsewhere.test/");
    let HttpError::Network(message) = r.send(req).await.unwrap_err() else {
        panic!("expected a replay mismatch")
    };
    assert!(message.to_lowercase().contains("referer"), "{message}");
}

#[tokio::test]
async fn replay_takes_any_value_for_a_secret_header_the_recorder_redacted() {
    // The oracle recorder writes a secret header as the bare word `REDACTED`, never as
    // `Bearer REDACTED`, so a request carrying any value in that header is the recorded twin.
    let mut exchanges = one_exchange();
    exchanges[0]["request"]["headers"]["Authorization"] = json!("REDACTED");
    let (_dir, r) = replay(exchanges.clone());
    let req = Request::get(matching_request().url, T)
        .header("User-Agent", "GameLib/1.0")
        .header("Authorization", "Bearer some-test-key");
    r.send(req).await.unwrap();
    r.finish().unwrap();

    // A request with no such header, or an empty one, is still drift, and the message never prints
    // a value.
    for header in [None, Some("")] {
        let (_dir, r) = replay(exchanges.clone());
        let mut req = Request::get(matching_request().url, T).header("User-Agent", "GameLib/1.0");
        if let Some(value) = header {
            req = req.header("Authorization", value);
        }
        let HttpError::Network(message) = r.send(req).await.unwrap_err() else {
            panic!("expected a replay mismatch")
        };
        assert!(
            message.contains("header authorization differs"),
            "{message}"
        );
    }

    // The leniency is for secret headers only: a redacted-looking User-Agent is compared exactly.
    let mut other = one_exchange();
    other[0]["request"]["headers"]["User-Agent"] = json!("REDACTED");
    let (_dir, r) = replay(other);
    assert!(r.send(matching_request()).await.is_err());
}

fn keyed_exchange(recorded_key: &str) -> Value {
    json!([{
        "id": "k1",
        "request": {
            "method": "GET",
            "url": format!("https://example.test/games?title=portal&key={recorded_key}"),
            "headers": {"User-Agent": "GameLib/1.0"}
        },
        "response": {"status": 200, "headers": {}, "bodyFile": "body-1.json"}
    }])
}

fn keyed_request(key: &str) -> Request {
    Request::get(
        format!(
            "https://example.test/games?{}",
            axios_query(&[("title", "portal"), ("key", key)])
        ),
        T,
    )
    .header("User-Agent", "GameLib/1.0")
}

#[tokio::test]
async fn replay_takes_any_value_for_a_query_key_the_recorder_redacted() {
    // The recorder writes a `key=` query value as the bare word `REDACTED`, so a request carrying
    // any non-empty key is the recorded twin.
    let (_dir, r) = replay(keyed_exchange("REDACTED"));
    r.send(keyed_request("some-test-key")).await.unwrap();
    r.finish().unwrap();

    // An empty key is still drift, and the message never prints the value.
    let (_dir, r) = replay(keyed_exchange("REDACTED"));
    let HttpError::Network(message) = r.send(keyed_request("")).await.unwrap_err() else {
        panic!("expected a replay mismatch")
    };
    assert!(message.contains("key=<hidden>"), "{message}");

    // The leniency is for key-like parameters only: `title=REDACTED` is compared exactly.
    let mut other = keyed_exchange("REDACTED");
    other[0]["request"]["url"] = json!("https://example.test/games?title=REDACTED&key=REDACTED");
    let (_dir, r) = replay(other);
    assert!(r.send(keyed_request("k")).await.is_err());

    // A recorded key that is NOT the word REDACTED is compared exactly.
    let (_dir, r) = replay(keyed_exchange("recorded-key"));
    assert!(r.send(keyed_request("other-key")).await.is_err());
}

#[tokio::test]
async fn a_network_error_exchange_matches_is_consumed_and_fails_as_a_transport_error() {
    let mut exchanges = one_exchange();
    exchanges[0]["response"] = json!({"status": 0, "headers": {}});
    exchanges[0]["networkError"] = json!(true);
    let (_dir, r) = replay(exchanges.clone());
    let err = r.send(matching_request()).await.unwrap_err();
    assert!(matches!(err, HttpError::Network(_)), "{err:?}");
    // Consumed like any exchange: the replay finishes clean, and a second request has no twin.
    r.finish().unwrap();
    assert!(r.send(matching_request()).await.is_err());

    // Left unrequested it is an unconsumed exchange, as any other.
    let (_dir, r) = replay(exchanges);
    assert!(r.finish().unwrap_err().contains("unconsumed"));
}

#[tokio::test]
async fn a_recorded_answer_over_the_request_cap_is_too_large_and_the_exchange_is_consumed() {
    // The CrossOver index's 5 MiB cap (86-19): the request was made and matched, so the replay finishes
    // clean, and the caller sees the transport's `TooLarge`.
    let (_dir, r) = replay(one_exchange());
    let err = r.send(matching_request().max_body(4)).await.unwrap_err();
    assert_eq!(err, HttpError::TooLarge);
    r.finish().unwrap();
    // A body exactly at the cap is served.
    let (_dir, r) = replay(one_exchange());
    let resp = r
        .send(matching_request().max_body(b"{\"ok\":true}".len()))
        .await
        .unwrap();
    assert_eq!(resp.status, 200);
}

#[tokio::test]
async fn replay_fails_on_a_body_that_differs() {
    let exchanges = json!([{
        "id": "post",
        "request": {
            "method": "POST",
            "url": "https://example.test/api/token",
            "headers": {"Content-Type": "application/json"},
            "body": "{\"a\":1}"
        },
        "response": {"status": 200, "headers": {}, "bodyFile": "body-1.json"}
    }]);
    let (_dir, r) = replay(exchanges.clone());
    let ok = Request::new(Method::Post, "https://example.test/api/token", T)
        .header("Content-Type", "application/json")
        .body(b"{\"a\":1}".to_vec());
    r.send(ok).await.unwrap();
    r.finish().unwrap();

    let (_dir, r) = replay(exchanges);
    let bad = Request::new(Method::Post, "https://example.test/api/token", T)
        .header("Content-Type", "application/json")
        .body(b"{\"a\":2}".to_vec());
    let HttpError::Network(message) = r.send(bad).await.unwrap_err() else {
        panic!("expected a replay mismatch")
    };
    assert!(message.contains("body"), "{message}");
}

#[tokio::test]
async fn replay_fails_on_an_unconsumed_exchange_unless_it_is_ts_only() {
    let (_dir, r) = replay(one_exchange());
    let err = r.finish().unwrap_err();
    assert!(err.contains("e1"), "{err}");

    // Flagged in the case file (D-23)...
    let mut flagged = one_exchange();
    flagged[0]["tsOnly"] = json!(true);
    let (_dir, r) = replay(flagged);
    r.finish().unwrap();

    // ...or listed by the test.
    let (_dir, r) = replay(one_exchange());
    r.with_ts_only(&["e1"]).finish().unwrap();
}

/// `for_host` keeps one source's exchanges out of a case that recorded several (86-20): the others are
/// dropped, so they are neither served nor reported as left over.
#[tokio::test]
async fn for_host_keeps_only_that_hosts_exchanges() {
    let two = json!([
        {
            "id": "a",
            "request": { "method": "GET", "url": "https://one.test/x?q=1", "headers": {} },
            "response": { "status": 200, "headers": {} }
        },
        {
            "id": "b",
            "request": { "method": "GET", "url": "https://TWO.test/y", "headers": {} },
            "response": { "status": 200, "headers": {} }
        }
    ]);
    let dir = case(two, &[]);
    let r = Replay::for_host(dir.path(), "two.test").unwrap();
    // Host names compare without case; the dropped exchange is not left over and is not served.
    let ok = r.send(Request::get("https://two.test/y", T)).await.unwrap();
    assert_eq!(ok.status, 200);
    let miss = r.send(Request::get("https://one.test/x?q=1", T)).await;
    assert!(miss.is_err());
    assert!(r.finish().is_err(), "the unmatched request is drift");

    let both = Replay::for_hosts(dir.path(), &["one.test", "two.test"]).unwrap();
    both.send(Request::get("https://one.test/x?q=1", T))
        .await
        .unwrap();
    both.send(Request::get("https://two.test/y", T))
        .await
        .unwrap();
    both.finish().unwrap();

    let none = Replay::for_hosts(dir.path(), &[]).unwrap();
    none.finish().unwrap();
}

#[tokio::test]
async fn replay_matches_paginated_exchanges_in_any_order() {
    let page = |n: u32| {
        json!({
            "id": format!("p{n}"),
            "request": {"method": "GET", "url": format!("https://example.test/list?page={n}")},
            "response": {"status": 200, "headers": {}, "bodyFile": format!("page-{n}.txt")}
        })
    };
    let dir = case(
        json!([page(1), page(2)]),
        &[("page-1.txt", b"one"), ("page-2.txt", b"two")],
    );
    let r = Replay::from_case(dir.path()).unwrap();
    let second = r
        .send(Request::get("https://example.test/list?page=2", T))
        .await
        .unwrap();
    assert_eq!(second.body, b"two");
    let first = r
        .send(Request::get("https://example.test/list?page=1", T))
        .await
        .unwrap();
    assert_eq!(first.body, b"one");
    r.finish().unwrap();
    // A third request has nothing left to match.
    assert!(r
        .send(Request::get("https://example.test/list?page=1", T))
        .await
        .is_err());
    assert!(r.finish().is_err(), "an unmatched request stays failed");
}

#[test]
fn replay_refuses_a_case_it_cannot_read() {
    let dir = tempfile::tempdir().unwrap();
    assert!(Replay::from_case(dir.path()).is_err(), "no exchanges.json");
    std::fs::write(dir.path().join("exchanges.json"), b"not json").unwrap();
    assert!(Replay::from_case(dir.path()).is_err());
    std::fs::write(
        dir.path().join("exchanges.json"),
        serde_json::to_vec(&json!([{
            "id": "x",
            "request": {"method": "GET", "url": "https://example.test/"},
            "response": {"status": 200, "headers": {}, "bodyFile": "../escape.txt"}
        }]))
        .unwrap(),
    )
    .unwrap();
    assert!(
        Replay::from_case(dir.path()).is_err(),
        "a body file must stay inside the case directory"
    );
    assert!(Replay::from_case(Path::new("/definitely/not/here")).is_err());
}

#[tokio::test]
async fn replay_hides_secret_looking_query_values_in_its_messages() {
    let exchanges = json!([{
        "id": "itad",
        // A recorded value that is not the bare word `REDACTED` is compared exactly (the word itself
        // matches any non-empty value, see `replay_takes_any_value_for_a_query_key_the_recorder_redacted`).
        "request": {"method": "GET", "url": "https://api.example.test/v1?key=RECORDEDSECRET&country=NZ"},
        "response": {"status": 200, "headers": {}, "bodyFile": "body-1.json"}
    }]);
    let (_dir, r) = replay(exchanges);
    let err = r
        .send(Request::get(
            "https://api.example.test/v1?key=SUPERSECRET&country=NZ",
            T,
        ))
        .await
        .unwrap_err();
    for secret in ["SUPERSECRET", "RECORDEDSECRET"] {
        assert!(!err.to_string().contains(secret), "{err}");
        assert!(!r.finish().unwrap_err().contains(secret));
    }
}

// ---------------------------------------------------------------------------------------------
// ReqwestHttp against a local server
// ---------------------------------------------------------------------------------------------

/// A tiny one-response-per-connection HTTP/1.1 server. `handler(head, nth)` is given the request
/// head (and any body bytes already read) and the zero-based connection number, and returns the raw
/// response bytes (or `None` to hold the connection open without answering).
struct Server {
    addr: SocketAddr,
    seen: Arc<Mutex<Vec<String>>>,
    connections: Arc<AtomicUsize>,
}

fn read_request(stream: &mut TcpStream) -> String {
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if let Some(end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&buf[..end]).to_string();
                    let want: usize = head
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse().unwrap_or(0))
                        })
                        .unwrap_or(0);
                    if buf.len() >= end + 4 + want {
                        break;
                    }
                }
            }
        }
    }
    String::from_utf8_lossy(&buf).to_string()
}

fn serve<F>(handler: F) -> Server
where
    F: Fn(&str, usize) -> Option<Vec<u8>> + Send + Sync + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let seen = Arc::new(Mutex::new(Vec::new()));
    let connections = Arc::new(AtomicUsize::new(0));
    let (seen2, conns2) = (seen.clone(), connections.clone());
    let handler = Arc::new(handler);
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let nth = conns2.fetch_add(1, Ordering::SeqCst);
            let (seen, handler) = (seen2.clone(), handler.clone());
            std::thread::spawn(move || {
                let request = read_request(&mut stream);
                seen.lock().unwrap().push(request.clone());
                match handler(&request, nth) {
                    Some(bytes) => {
                        let _ = stream.write_all(&bytes);
                        let _ = stream.flush();
                    }
                    None => std::thread::sleep(Duration::from_secs(3)),
                }
            });
        }
    });
    Server {
        addr,
        seen,
        connections,
    }
}

fn http_response(status: &str, headers: &[&str], body: &[u8]) -> Vec<u8> {
    let mut out = format!("HTTP/1.1 {status}\r\nConnection: close\r\n").into_bytes();
    for h in headers {
        out.extend_from_slice(h.as_bytes());
        out.extend_from_slice(b"\r\n");
    }
    out.extend_from_slice(format!("Content-Length: {}\r\n\r\n", body.len()).as_bytes());
    out.extend_from_slice(body);
    out
}

#[tokio::test]
async fn reqwest_http_sends_method_headers_and_body_and_returns_the_response() {
    install_crypto_provider();
    install_crypto_provider();
    let server = serve(|_, _| Some(http_response("201 Created", &["X-Reply: yes"], b"hello")));
    let http = ReqwestHttp::new();
    let url = format!(
        "http://{}/path?{}",
        server.addr,
        axios_query(&[("q", "a b")])
    );
    let req = Request::new(Method::Post, url, T)
        .header("X-Test", "1")
        .header("Content-Type", "application/json")
        .body(b"{\"a\":1}".to_vec());
    let resp = http.send(req).await.unwrap();
    assert_eq!(resp.status, 201);
    assert_eq!(resp.body, b"hello");
    assert!(resp
        .headers
        .iter()
        .any(|(k, v)| k.eq_ignore_ascii_case("x-reply") && v == "yes"));
    let seen = server.seen.lock().unwrap().clone();
    assert!(
        seen[0].starts_with("POST /path?q=a+b HTTP/1.1"),
        "{}",
        seen[0]
    );
    assert!(seen[0].to_lowercase().contains("x-test: 1"));
    assert!(seen[0].ends_with("{\"a\":1}"));
}

#[tokio::test]
async fn reqwest_http_errors_never_carry_the_url_or_its_key() {
    install_crypto_provider();
    // A port nothing listens on: bind, note the port, drop.
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let http = ReqwestHttp::new();
    for url in [
        format!("http://127.0.0.1:{port}/v1/search?key=SECRETKEY&q=x"),
        "ht!tp://nope.invalid/v1?key=SECRETKEY".to_string(),
        "not a url?key=SECRETKEY".to_string(),
    ] {
        let err = http.send(Request::get(url, T)).await.unwrap_err();
        let text = format!("{err} / {err:?}");
        assert!(!text.contains("SECRETKEY"), "{text}");
        assert!(!text.contains("key="), "{text}");
    }
    // And a Request's own Debug leaves the query out.
    let req = Request::get("https://x.test/p?key=SECRETKEY", T).header("Authorization", "Bearer S");
    let shown = format!("{req:?}");
    assert!(
        !shown.contains("SECRETKEY") && !shown.contains("Bearer"),
        "{shown}"
    );
}

#[tokio::test]
async fn reqwest_http_times_out_per_request() {
    install_crypto_provider();
    let server = serve(|_, _| None);
    let http = ReqwestHttp::new();
    let req = Request::get(
        format!("http://{}/slow", server.addr),
        Duration::from_millis(300),
    );
    assert_eq!(http.send(req).await.unwrap_err(), HttpError::Timeout);
}

#[tokio::test]
async fn reqwest_http_follows_at_most_five_redirects() {
    install_crypto_provider();
    let server = serve(|_, _| Some(http_response("302 Found", &["Location: /again"], b"")));
    let http = ReqwestHttp::new();
    let err = http
        .send(Request::get(format!("http://{}/start", server.addr), T))
        .await
        .unwrap_err();
    assert!(matches!(err, HttpError::Network(_)), "{err:?}");
    // The original request plus five redirects.
    assert_eq!(server.connections.load(Ordering::SeqCst), 6);

    // A short chain is followed to its end.
    let server = serve(|head, nth| {
        if nth < 3 {
            Some(http_response("302 Found", &["Location: /next"], b""))
        } else {
            assert!(head.starts_with("GET /next"));
            Some(http_response("200 OK", &[], b"landed"))
        }
    });
    let resp = http
        .send(Request::get(format!("http://{}/start", server.addr), T))
        .await
        .unwrap();
    assert_eq!(resp.body, b"landed");
}

#[tokio::test]
async fn reqwest_http_caps_the_body_by_content_length_and_while_streaming() {
    install_crypto_provider();
    let http = ReqwestHttp::new();
    // Declared too large: refused before reading the body.
    let server = serve(|_, _| Some(http_response("200 OK", &[], &[b'x'; 4096])));
    let req = Request::get(format!("http://{}/big", server.addr), T).max_body(100);
    assert_eq!(http.send(req).await.unwrap_err(), HttpError::TooLarge);

    // No length declared: refused as soon as the cap is passed, without reading to the end.
    let server = serve(|_, _| {
        let mut out = b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".to_vec();
        out.extend(std::iter::repeat(b'y').take(256 * 1024));
        Some(out)
    });
    let req = Request::get(format!("http://{}/stream", server.addr), T).max_body(1024);
    assert_eq!(http.send(req).await.unwrap_err(), HttpError::TooLarge);

    // Within the cap it is returned whole.
    let server = serve(|_, _| Some(http_response("200 OK", &[], &[b'z'; 512])));
    let req = Request::get(format!("http://{}/ok", server.addr), T).max_body(1024);
    assert_eq!(http.send(req).await.unwrap().body.len(), 512);
}

// ---------------------------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------------------------

#[test]
fn memory_secret_source_trims_clears_and_never_prints_a_value() {
    let s = MemorySecretSource::new();
    assert_eq!(s.get(Slot::Itad), Ok(None));
    s.set(Slot::Itad, "  abc  ").unwrap();
    assert_eq!(s.get(Slot::Itad), Ok(Some("abc".to_string())));
    assert_eq!(s.get(Slot::SteamGridDb), Ok(None));
    assert!(!format!("{s:?}").contains("abc"));
    s.set(Slot::Itad, "   ").unwrap();
    assert_eq!(s.get(Slot::Itad), Ok(None));
    s.set(Slot::SteamGridDb, "k").unwrap();
    s.delete(Slot::SteamGridDb).unwrap();
    assert_eq!(s.get(Slot::SteamGridDb), Ok(None));
}

#[test]
fn env_secret_source_reads_only_the_names_it_was_given_and_never_writes() {
    let s = EnvSecretSource::new("GAMELIB_INFO_TEST_ABSENT_A", "GAMELIB_INFO_TEST_ABSENT_B");
    assert_eq!(s.get(Slot::Itad), Ok(None));
    assert_eq!(s.get(Slot::SteamGridDb), Ok(None));
    assert!(s.set(Slot::Itad, "x").is_err());
    assert!(s.delete(Slot::Itad).is_err());
}

// ---------------------------------------------------------------------------------------------
// The op wrapper
// ---------------------------------------------------------------------------------------------

fn ctx(home: &FakeHome, shutdown: Shutdown) -> InfoCtx {
    let user_data = home.root().join("userData");
    InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        Platform::Linux,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data,
            temp: home.root().join("temp"),
            public_dir: None,
        },
        "0.0.0-test".to_string(),
        shutdown,
        Arc::new(ReqwestHttp::new()),
    )
}

#[tokio::test]
async fn an_op_running_at_shutdown_answers_shutdown_and_releases_its_registrant() {
    let home = FakeHome::new("info-guard-");
    let shutdown = Shutdown::new();
    let ctx = ctx(&home, shutdown.clone());
    let token = shutdown.token();
    let canceller = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        token.cancel();
    });
    let out = guarded("info_test", &ctx, async {
        // An op still in flight: a long sleep stands in for slow HTTP.
        tokio::time::sleep(Duration::from_secs(30)).await;
        Ok(json!("late"))
    })
    .await;
    canceller.await.unwrap();
    assert_eq!(out, Err("info_test:shutdown".to_string()));
    assert!(
        shutdown.drain(Duration::from_millis(500)).is_empty(),
        "the op's registrant must be released"
    );
}

#[tokio::test]
async fn an_op_that_finishes_passes_its_result_through_and_releases_its_registrant() {
    let home = FakeHome::new("info-guard-");
    let shutdown = Shutdown::new();
    let ctx = ctx(&home, shutdown.clone());
    assert_eq!(
        guarded("info_test", &ctx, async { Ok(json!({"a": 1})) }).await,
        Ok(json!({"a": 1}))
    );
    assert_eq!(
        guarded("info_test", &ctx, async {
            Err("info_test:bad-args".to_string())
        })
        .await,
        Err("info_test:bad-args".to_string())
    );
    assert!(shutdown.drain(Duration::from_millis(500)).is_empty());
}

#[tokio::test]
async fn an_op_that_panics_answers_panic() {
    let home = FakeHome::new("info-guard-");
    let shutdown = Shutdown::new();
    let ctx = ctx(&home, shutdown.clone());
    let out = guarded("info_test", &ctx, async {
        if true {
            panic!("boom");
        }
        Ok(json!(null))
    })
    .await;
    assert_eq!(out, Err("info_test:panic".to_string()));
    assert!(shutdown.drain(Duration::from_millis(500)).is_empty());
}

#[tokio::test]
async fn an_op_is_not_started_once_shutdown_has_begun() {
    let home = FakeHome::new("info-guard-");
    let shutdown = Shutdown::new();
    let ctx = ctx(&home, shutdown.clone());
    shutdown.token().cancel();
    let started = Arc::new(AtomicUsize::new(0));
    let flag = started.clone();
    let out = guarded("info_test", &ctx, async move {
        flag.fetch_add(1, Ordering::SeqCst);
        Ok(json!(1))
    })
    .await;
    assert_eq!(out, Err("info_test:shutdown".to_string()));
    assert_eq!(started.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn dispatch_answers_unknown_op_and_dispatch_sync_refuses_a_runtime_thread() {
    let home = FakeHome::new("info-guard-");
    let ctx = ctx(&home, Shutdown::new());
    let err = gamelib_info::dispatch("info_nope", &[], &ctx)
        .await
        .unwrap_err();
    assert_eq!(err, "unknown op: info_nope");
    // Called from inside this runtime, the sync entry point answers wrong-thread, not a panic.
    let err = gamelib_info::dispatch_sync("info_nope", &[], &ctx).unwrap_err();
    assert_eq!(err, "info_nope:wrong-thread");
}

#[test]
fn dispatch_sync_blocks_on_its_own_runtime_from_a_plain_thread() {
    let home = FakeHome::new("info-guard-");
    let ctx = ctx(&home, Shutdown::new());
    assert_eq!(
        gamelib_info::dispatch_sync("info_nope", &[], &ctx),
        Err("unknown op: info_nope".to_string())
    );
}

#[test]
fn ctx_secret_answers_no_secret_source_until_one_is_installed() {
    let home = FakeHome::new("info-guard-");
    let mut ctx = ctx(&home, Shutdown::new());
    assert_eq!(
        ctx.secret("info_itad_search", Slot::Itad),
        Err("info_itad_search:no-secret-source".to_string())
    );
    ctx.secrets = Some(Arc::new(MemorySecretSource::with(Slot::Itad, "k")));
    assert_eq!(
        ctx.secret("info_itad_search", Slot::Itad),
        Ok(Some("k".to_string()))
    );
    assert_eq!(ctx.secret("info_itad_search", Slot::SteamGridDb), Ok(None));
}
