//! Fetcher behaviour against a local fake CDN. Test names mirror the contract in plan 73-03.

#[allow(dead_code)]
#[path = "support/fake_cdn.rs"]
mod fake_cdn;
#[allow(dead_code)]
#[path = "support/fake_host.rs"]
mod fake_host;

use fake_cdn::{FakeCdn, Reply};
use fake_host::FakeHost;
use gamelib_depot::fetch::{FetchError, Fetcher};
use gamelib_depot::inflight::InflightLimiter;
use gamelib_depot::job::HostRef;
use gamelib_depot::outcome::{ErrorKind, Failure};
use gamelib_depot::stall::StallTracker;
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const TOKEN_FIXTURE: &str = "?secret=TOKEN_FIXTURE_9f3a";

fn host_ref(host: &str, kind: &str, token_auth: bool) -> HostRef {
    HostRef {
        host: host.to_string(),
        vhost: None,
        kind: Some(kind.to_string()),
        https_support: None,
        use_token_auth: token_auth,
        weighted_load: None,
    }
}

fn fetcher(host: Arc<FakeHost>, hosts: Vec<HostRef>) -> Fetcher {
    Fetcher::new(
        host,
        "job-1",
        "570",
        hosts,
        InflightLimiter::new(4).unwrap(),
        Arc::new(StallTracker::default()),
    )
}

fn failed(e: FetchError) -> Failure {
    match e {
        FetchError::Failed(f) => f,
        FetchError::Cancelled => panic!("expected Failed, got Cancelled"),
    }
}

#[tokio::test]
async fn fetch_token_403_forces_one_refresh() {
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/chunk/abc?t=OLD",
        vec![Reply::Status(403, vec![])],
    );
    cdn.script(
        "/depot/10/chunk/abc?t=NEW",
        vec![Reply::Status(200, b"body".to_vec())],
    );
    let host = Arc::new(
        FakeHost::new().with_tokens(vec![Ok(Some("?t=OLD".into())), Ok(Some("?t=NEW".into()))]),
    );
    let f = fetcher(host.clone(), vec![host_ref(&cdn.host(), "CDN", false)]);
    let (bytes, served_by) = f
        .fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(bytes, b"body");
    assert_eq!(served_by, cdn.host());
    assert_eq!(
        host.forces(),
        vec![false, true],
        "exactly one forced refresh"
    );
    assert_eq!(cdn.hit_count("/depot/10/chunk/abc?t=OLD"), 1);
    assert_eq!(cdn.hit_count("/depot/10/chunk/abc?t=NEW"), 1);
}

#[tokio::test]
async fn steamcache_host_never_requests_token() {
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/chunk/abc",
        vec![Reply::Status(200, b"x".to_vec())],
    );
    let host = Arc::new(FakeHost::new().with_tokens(vec![Ok(Some("?t=NO".into()))]));
    let f = fetcher(
        host.clone(),
        vec![host_ref(&cdn.host(), "SteamCache", false)],
    );
    f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
        .await
        .unwrap();
    assert!(host.token_calls.lock().unwrap().is_empty());
    assert_eq!(cdn.hits()[0].target, "/depot/10/chunk/abc");
}

#[tokio::test]
async fn usetokenauth_on_a_non_cdn_host_requests_a_token() {
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/chunk/abc?t=T",
        vec![Reply::Status(200, b"x".to_vec())],
    );
    let host = Arc::new(FakeHost::new().with_tokens(vec![Ok(Some("?t=T".into()))]));
    let f = fetcher(
        host.clone(),
        vec![host_ref(&cdn.host(), "SteamCache", true)],
    );
    f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(host.forces(), vec![false]);
}

#[tokio::test]
async fn exhausted_attempts_report_last_error() {
    let cdn = FakeCdn::start().await;
    cdn.script("/depot/10/chunk/abc", vec![Reply::Status(500, vec![])]);
    let host = Arc::new(FakeHost::new());
    let f = fetcher(host, vec![host_ref(&cdn.host(), "SteamCache", false)]).with_backoff(1, 3);
    let fail = failed(
        f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
            .await
            .unwrap_err(),
    );
    assert_eq!(fail.kind, ErrorKind::CdnHttp);
    assert_eq!(fail.http_status, Some(500));
    assert!(fail.message.contains("8 attempts"), "{}", fail.message);
    assert_eq!(cdn.hit_count("/depot/10/chunk/abc"), 8);
}

#[tokio::test]
async fn exhausted_attempts_on_a_dead_port_report_network_code() {
    let dead = {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        l.local_addr().unwrap().to_string()
    };
    let f = fetcher(
        Arc::new(FakeHost::new()),
        vec![host_ref(&dead, "SteamCache", false)],
    )
    .with_budget(3, Duration::from_secs(15))
    .with_backoff(1, 3);
    let fail = failed(
        f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
            .await
            .unwrap_err(),
    );
    assert_eq!(fail.kind, ErrorKind::Network);
    assert_eq!(fail.code.as_deref(), Some("connect"));
    assert!(fail.http_status.is_none());
}

#[tokio::test(start_paused = true)]
async fn attempt_timeout_15s() {
    let cdn = FakeCdn::start().await;
    cdn.script("/depot/10/chunk/abc", vec![Reply::Hang]);
    let f = fetcher(
        Arc::new(FakeHost::new()),
        vec![host_ref(&cdn.host(), "SteamCache", false)],
    )
    .with_budget(
        1,
        Duration::from_millis(gamelib_depot::fetch::CHUNK_FETCH_TIMEOUT_MS),
    );
    let started = tokio::time::Instant::now();
    let fail = failed(
        f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
            .await
            .unwrap_err(),
    );
    assert_eq!(fail.kind, ErrorKind::Network);
    assert_eq!(fail.code.as_deref(), Some("timeout"));
    let el = started.elapsed();
    assert!(
        el >= Duration::from_secs(15) && el < Duration::from_secs(16),
        "{el:?}"
    );
}

#[tokio::test]
async fn redirect_not_followed() {
    let other = FakeCdn::start().await;
    other.script(
        "/depot/10/chunk/abc",
        vec![Reply::Status(200, b"evil".to_vec())],
    );
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/chunk/abc",
        vec![Reply::Redirect(format!(
            "http://{}/depot/10/chunk/abc",
            other.host()
        ))],
    );
    let f = fetcher(
        Arc::new(FakeHost::new()),
        vec![host_ref(&cdn.host(), "SteamCache", false)],
    )
    .with_budget(2, Duration::from_secs(5));
    let fail = failed(
        f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
            .await
            .unwrap_err(),
    );
    assert_eq!(fail.kind, ErrorKind::CdnHttp);
    assert_eq!(fail.http_status, Some(302));
    assert!(
        other.hits().is_empty(),
        "redirect target must never be contacted"
    );
}

#[tokio::test]
async fn manifest_code_refreshed_on_403() {
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/manifest/99/5/OLD",
        vec![Reply::Status(403, vec![])],
    );
    cdn.script(
        "/depot/10/manifest/99/5/NEW",
        vec![Reply::Status(200, b"mf".to_vec())],
    );
    let host = Arc::new(FakeHost::new().with_codes(vec![Ok(Some("NEW".into()))]));
    let f = fetcher(
        host.clone(),
        vec![host_ref(&cdn.host(), "SteamCache", false)],
    );
    let bytes = f
        .fetch_manifest("10", "99", Some("OLD"), &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(bytes, b"mf");
    let calls = host.code_calls.lock().unwrap().clone();
    assert_eq!(
        calls,
        vec![("570".to_string(), "10".to_string(), "99".to_string())]
    );
}

#[tokio::test]
async fn manifest_without_a_code_asks_node_up_front() {
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/manifest/99/5/FRESH",
        vec![Reply::Status(200, b"mf".to_vec())],
    );
    let host = Arc::new(FakeHost::new().with_codes(vec![Ok(Some("FRESH".into()))]));
    let f = fetcher(
        host.clone(),
        vec![host_ref(&cdn.host(), "SteamCache", false)],
    );
    let bytes = f
        .fetch_manifest("10", "99", None, &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(bytes, b"mf");
    assert_eq!(host.code_calls.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn cancel_wakes_backoff() {
    let cdn = FakeCdn::start().await;
    cdn.script("/depot/10/chunk/abc", vec![Reply::Status(500, vec![])]);
    let f = Arc::new(fetcher(
        Arc::new(FakeHost::new()),
        vec![host_ref(&cdn.host(), "SteamCache", false)],
    ));
    let cancel = CancellationToken::new();
    let (f2, c2) = (f.clone(), cancel.clone());
    let task = tokio::spawn(async move { f2.fetch_chunk("10", "abc", 0, 0, &c2).await });
    // Attempt 1 fails fast; the 200 ms backoff is running by now.
    tokio::time::sleep(Duration::from_millis(80)).await;
    let t = std::time::Instant::now();
    cancel.cancel();
    let r = task.await.unwrap();
    assert!(matches!(r, Err(FetchError::Cancelled)));
    assert!(t.elapsed() < Duration::from_millis(50), "{:?}", t.elapsed());
}

#[tokio::test]
async fn cancel_during_a_hung_request_returns_promptly() {
    let cdn = FakeCdn::start().await;
    cdn.script("/depot/10/chunk/abc", vec![Reply::Hang]);
    let f = Arc::new(fetcher(
        Arc::new(FakeHost::new()),
        vec![host_ref(&cdn.host(), "SteamCache", false)],
    ));
    let cancel = CancellationToken::new();
    let (f2, c2) = (f.clone(), cancel.clone());
    let task = tokio::spawn(async move { f2.fetch_chunk("10", "abc", 0, 0, &c2).await });
    tokio::time::sleep(Duration::from_millis(50)).await;
    cancel.cancel();
    assert!(matches!(task.await.unwrap(), Err(FetchError::Cancelled)));
}

#[tokio::test]
async fn failure_messages_never_contain_token() {
    let cdn = FakeCdn::start().await;
    let target = format!("/depot/10/chunk/abc{TOKEN_FIXTURE}");
    cdn.script(&target, vec![Reply::Status(500, vec![])]);
    let host = Arc::new(FakeHost::new().with_tokens(vec![Ok(Some(TOKEN_FIXTURE.into()))]));
    let f = fetcher(host.clone(), vec![host_ref(&cdn.host(), "CDN", false)]).with_backoff(1, 3);
    let fail = failed(
        f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
            .await
            .unwrap_err(),
    );
    assert_eq!(cdn.hit_count(&target), 8, "token really was on the wire");
    let json = serde_json::to_string(&fail).unwrap();
    assert!(!json.contains("TOKEN_FIXTURE"), "{json}");
    assert!(!format!("{fail:?}").contains("TOKEN_FIXTURE"));
    assert!(!format!("{f:?}").contains("TOKEN_FIXTURE"));
    for ev in host.emits.lock().unwrap().iter() {
        assert!(!serde_json::to_string(ev).unwrap().contains("TOKEN_FIXTURE"));
    }

    // Network-error path with a token in the URL.
    let dead = {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        l.local_addr().unwrap().to_string()
    };
    let host = Arc::new(FakeHost::new().with_tokens(vec![Ok(Some(TOKEN_FIXTURE.into()))]));
    let f = fetcher(host, vec![host_ref(&dead, "CDN", false)])
        .with_budget(2, Duration::from_secs(15))
        .with_backoff(1, 3);
    let fail = failed(
        f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
            .await
            .unwrap_err(),
    );
    assert!(!serde_json::to_string(&fail)
        .unwrap()
        .contains("TOKEN_FIXTURE"));
}

#[tokio::test]
async fn request_headers_match_the_real_client() {
    let cdn = FakeCdn::start().await;
    cdn.script(
        "/depot/10/chunk/abc",
        vec![Reply::Status(200, b"x".to_vec())],
    );
    let f = fetcher(
        Arc::new(FakeHost::new()),
        vec![host_ref(&cdn.host(), "SteamCache", false)],
    );
    f.fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
        .await
        .unwrap();
    let h = cdn.hits()[0].headers.clone();
    assert!(h.contains("user-agent: valve/steam http client 1.0"), "{h}");
    assert!(h.contains("accept: text/html,*/*;q=0.9"), "{h}");
    assert!(
        h.contains("accept-charset: iso-8859-1,utf-8,*;q=0.7"),
        "{h}"
    );
}

#[tokio::test]
async fn failed_host_is_rotated_away_from_on_retry() {
    let bad = FakeCdn::start().await;
    bad.script("/depot/10/chunk/abc", vec![Reply::Status(500, vec![])]);
    let good = FakeCdn::start().await;
    good.script(
        "/depot/10/chunk/abc",
        vec![Reply::Status(200, b"ok".to_vec())],
    );
    let f = fetcher(
        Arc::new(FakeHost::new()),
        vec![
            host_ref(&bad.host(), "SteamCache", false),
            host_ref(&good.host(), "SteamCache", false),
        ],
    );
    let (bytes, served_by) = f
        .fetch_chunk("10", "abc", 0, 0, &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(bytes, b"ok");
    assert_eq!(served_by, good.host());
    assert_eq!(bad.hit_count("/depot/10/chunk/abc"), 1);
}
