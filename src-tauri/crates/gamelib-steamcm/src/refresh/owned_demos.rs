//! The ownership half of Refresh: owned games plus licensed demos (D-12, CF-05).
//!
//! Port of `licensedDemos.ts` (quick 261031-i0q) and the Step 1 owned-apps call of `refresh.ts`.
//!
//! Spike 052: `GetOwnedGames` never returns demos (free-on-demand licences), under any option.
//! The licences path does: licence package ids -> PICS package info (`packageinfo.appids`) ->
//! PICS app info (`common.type`). Only type Demo is added, by user decision; DLC, tools and
//! unplayed free-to-play games stay out, so do not widen the filter.
//!
//! The demos stage is fail-soft by contract: a failure or the 30 s bound yields an empty list and
//! `demos_failed`, never a failed owned list. A reviewer must not make it fail-closed: that would
//! trade "no demos" for "no library" (T-79-84).

use std::collections::BTreeSet;
use std::time::Duration;

use serde_json::{Map, Value};

use crate::backend::{CmConn, LicenseEntry, OwnedOpts};
use crate::error::CmError;
use crate::ops::{account, pics};

/// Apps per PICS product-info request (`APP_BATCH_SIZE` in licensedDemos.ts).
pub const APP_BATCH_SIZE: usize = 200;

/// One overall budget for the whole licences -> packages -> apps chain
/// (`LICENSED_DEMOS_TIMEOUT_MS` in licensedDemos.ts), not per call: on a stale socket per-call
/// bounds could stall Refresh by minutes.
pub const LICENSED_DEMOS_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DemoEntry {
    pub appid: u32,
    pub name: String,
    pub playtime_forever: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OwnedAndDemos {
    /// `getUserOwnedApps` shape: `{app_count, apps: [...]}`.
    pub owned: Value,
    pub demos: Vec<DemoEntry>,
    /// True when the demos stage failed or timed out (`demos` is then empty).
    pub demos_failed: bool,
    /// Why the demos stage failed: `timeout`, or the `CmError` variant (never a message body).
    /// `None` when it succeeded.
    pub demos_failure: Option<String>,
}

/// The `getUserOwnedApps` options `refresh.ts` passes (steam-user defaults plus
/// `includePlayedFreeGames`).
pub fn refresh_owned_opts() -> OwnedOpts {
    OwnedOpts {
        include_appinfo: true,
        include_played_free_games: true,
        include_free_sub: false,
        skip_unvetted_apps: true,
    }
}

/// A packageinfo `appids` member as an app id. The 79-08 shape mapping yields JSON numbers, but a
/// string (a decimal Int64 above 2^53, or a text KV value) is accepted too; TS's
/// `typeof v === 'number'` would have dropped a string, so accepting it is the lenient superset.
/// Non-positive and out-of-range values are skipped, as TS skips `v <= 0` (T-79-85).
fn appid_of(v: &Value) -> Option<u32> {
    let n = match v {
        Value::Number(n) => n.as_u64()?,
        Value::String(s) => s.trim().parse::<u64>().ok()?,
        _ => return None,
    };
    u32::try_from(n).ok().filter(|&id| id > 0)
}

/// `packageinfo.appids` is an array (the converted `0..n-1` object) or an object map; both are
/// walked by value.
fn appid_values(appids: &Value) -> Vec<&Value> {
    match appids {
        Value::Array(a) => a.iter().collect(),
        Value::Object(o) => o.values().collect(),
        _ => Vec::new(),
    }
}

/// Deduped (first-seen order) app ids granted by the given packages.
fn package_app_ids(package_ids: &[u32], packages: &Value) -> Vec<u32> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for pid in package_ids {
        let Some(appids) = packages
            .get(pid.to_string())
            .and_then(|p| p.get("packageinfo"))
            .and_then(|i| i.get("appids"))
        else {
            continue;
        };
        for v in appid_values(appids) {
            if let Some(id) = appid_of(v) {
                if seen.insert(id) {
                    out.push(id);
                }
            }
        }
    }
    out
}

/// Deduped app ids granted by the packages, minus owned ones.
fn licensed_not_owned(owned: &BTreeSet<u32>, package_ids: &[u32], packages: &Value) -> Vec<u32> {
    package_app_ids(package_ids, packages)
        .into_iter()
        .filter(|id| !owned.contains(id))
        .collect()
}

/// Pure and total: never fails on malformed PICS data. Shared with the Mac Steam path (79-35),
/// which feeds it Steam's subscribed set.
pub fn select_licensed_demos(
    owned: &BTreeSet<u32>,
    package_ids: &[u32],
    packages: &Value,
    apps: &Value,
) -> Vec<DemoEntry> {
    let mut out = Vec::new();
    for appid in licensed_not_owned(owned, package_ids, packages) {
        let Some(common) = apps
            .get(appid.to_string())
            .and_then(|a| a.get("appinfo"))
            .and_then(|i| i.get("common"))
            .filter(|c| c.is_object())
        else {
            continue;
        };
        // `String(common.type).toLowerCase() === 'demo'`
        let is_demo = common
            .get("type")
            .and_then(Value::as_str)
            .is_some_and(|t| t.to_lowercase() == "demo");
        if !is_demo {
            continue;
        }
        let name = common
            .get("name")
            .and_then(Value::as_str)
            .filter(|n| !n.is_empty())
            .map_or_else(|| appid.to_string(), str::to_string);
        out.push(DemoEntry {
            appid,
            name,
            playtime_forever: 0,
        });
    }
    out.sort_by_key(|d| d.appid);
    out
}

fn owned_ids(owned: &Value) -> BTreeSet<u32> {
    owned
        .get("apps")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|a| a.get("appid").and_then(Value::as_u64))
        .filter_map(|id| u32::try_from(id).ok())
        .collect()
}

async fn fetch_demos<C: CmConn>(
    conn: &C,
    owned: &BTreeSet<u32>,
    licences: &[LicenseEntry],
) -> Result<Vec<DemoEntry>, CmError> {
    let mut package_ids: Vec<u32> = Vec::new();
    for l in licences {
        if !package_ids.contains(&l.package_id) {
            package_ids.push(l.package_id);
        }
    }
    if package_ids.is_empty() {
        return Ok(Vec::new());
    }
    // Tokens-first (CF-05): `product_info` fetches access tokens before the request.
    let pkg_result = pics::product_info(conn, &[], &package_ids, true).await?;
    let packages = pkg_result.get("packages").cloned().unwrap_or(Value::Null);
    let remainder = licensed_not_owned(owned, &package_ids, &packages);
    let mut apps = Map::new();
    for batch in remainder.chunks(APP_BATCH_SIZE) {
        let res = pics::product_info(conn, batch, &[], true).await?;
        if let Some(Value::Object(m)) = res.get("apps") {
            apps.extend(m.clone());
        }
    }
    let demos = select_licensed_demos(owned, &package_ids, &packages, &Value::Object(apps));
    tracing::info!(
        "Steam licensed demos: licenses={} licensedNotOwned={} demos={}",
        package_ids.len(),
        remainder.len(),
        demos.len()
    );
    Ok(demos)
}

/// Owned games (a failure fails the call, so the caller can fall back to the cached library) plus
/// the licensed demos (fail-soft, 30 s bound).
pub async fn collect_owned_and_demos<C: CmConn>(
    conn: &C,
    steam_id: u64,
    licences: &[LicenseEntry],
) -> Result<OwnedAndDemos, CmError> {
    let owned = account::owned_apps(conn, steam_id, refresh_owned_opts()).await?;
    let ids = owned_ids(&owned);
    let (demos, demos_failure) =
        match tokio::time::timeout(LICENSED_DEMOS_TIMEOUT, fetch_demos(conn, &ids, licences)).await
        {
            Ok(Ok(d)) => (d, None),
            Ok(Err(e)) => {
                tracing::warn!("Steam licensed demos lookup failed, continuing owned-only: {e:?}");
                (Vec::new(), Some(format!("{e:?}")))
            }
            Err(_) => {
                tracing::warn!("Steam licensed demos timed out, continuing owned-only");
                (Vec::new(), Some("timeout".to_string()))
            }
        };
    Ok(OwnedAndDemos {
        owned,
        demos,
        demos_failed: demos_failure.is_some(),
        demos_failure,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{CmBackend, OwnedGameRaw, PicsAppRaw, PicsPackageRaw, PicsRaw};
    use crate::fake::FakeBackend;
    use serde_json::json;

    fn pkg(appids: Value) -> Value {
        json!({ "packageinfo": { "appids": appids } })
    }

    fn app(ty: Option<&str>, name: Option<&str>) -> Value {
        let mut c = Map::new();
        if let Some(t) = ty {
            c.insert("type".into(), json!(t));
        }
        if let Some(n) = name {
            c.insert("name".into(), json!(n));
        }
        json!({ "appinfo": { "common": c } })
    }

    fn set(ids: &[u32]) -> BTreeSet<u32> {
        ids.iter().copied().collect()
    }

    #[test]
    fn adds_a_licensed_not_owned_demo() {
        let out = select_licensed_demos(
            &set(&[]),
            &[1136752],
            &json!({ "1136752": pkg(json!([3205720])) }),
            &json!({ "3205720": app(Some("Demo"), Some("Schedule I: Free Sample")) }),
        );
        assert_eq!(
            out,
            vec![DemoEntry {
                appid: 3205720,
                name: "Schedule I: Free Sample".into(),
                playtime_forever: 0
            }]
        );
    }

    #[test]
    fn does_not_duplicate_an_already_owned_demo() {
        let out = select_licensed_demos(
            &set(&[3205720]),
            &[1136752],
            &json!({ "1136752": pkg(json!([3205720])) }),
            &json!({ "3205720": app(Some("Demo"), Some("x")) }),
        );
        assert!(out.is_empty());
    }

    #[test]
    fn excludes_non_demo_types_and_matches_demo_case_insensitively() {
        let types = ["DLC", "Tool", "Config", "Game", "Music", "Application"];
        let mut apps = Map::new();
        let mut ids: Vec<u32> = Vec::new();
        for (i, t) in types.iter().enumerate() {
            let id = 100 + i as u32;
            ids.push(id);
            apps.insert(id.to_string(), app(Some(t), Some(t)));
        }
        apps.insert("200".into(), app(None, Some("untyped")));
        apps.insert("201".into(), app(Some("demo"), Some("lower")));
        apps.insert("202".into(), app(Some("DEMO"), Some("upper")));
        ids.extend([200, 201, 202]);
        let out = select_licensed_demos(
            &set(&[]),
            &[1],
            &json!({ "1": pkg(json!(ids)) }),
            &Value::Object(apps),
        );
        assert_eq!(
            out.iter().map(|d| d.appid).collect::<Vec<_>>(),
            vec![201, 202]
        );
    }

    #[test]
    fn missing_pics_data_adds_nothing_and_does_not_panic() {
        let cases: Vec<(Value, Value)> = vec![
            (json!({}), json!({})),
            (json!({ "1": {} }), json!({})),
            (json!({ "1": { "packageinfo": {} } }), json!({})),
            (json!({ "1": pkg(json!([5])) }), json!({})),
            (json!({ "1": pkg(json!([5])) }), json!({ "5": {} })),
            (
                json!({ "1": pkg(json!([5])) }),
                json!({ "5": { "appinfo": {} } }),
            ),
            (Value::Null, Value::Null),
            // a null packageinfo (empty buffer) and a non-collection appids
            (json!({ "1": { "packageinfo": null } }), json!({})),
            (json!({ "1": pkg(json!(7)) }), json!({})),
        ];
        for (p, a) in cases {
            assert!(select_licensed_demos(&set(&[]), &[1], &p, &a).is_empty());
        }
    }

    #[test]
    fn object_map_appids_work_and_shared_appids_are_returned_once() {
        let out = select_licensed_demos(
            &set(&[]),
            &[1, 2],
            &json!({ "1": pkg(json!({ "0": 7 })), "2": pkg(json!([7])) }),
            &json!({ "7": app(Some("Demo"), Some("Seven")) }),
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].appid, 7);
    }

    #[test]
    fn missing_name_falls_back_to_the_appid_string() {
        let out = select_licensed_demos(
            &set(&[]),
            &[1],
            &json!({ "1": pkg(json!([9])) }),
            &json!({ "9": app(Some("Demo"), None) }),
        );
        assert_eq!(out[0].name, "9");
    }

    #[test]
    fn string_appids_are_accepted_and_non_positive_skipped() {
        let out = select_licensed_demos(
            &set(&[]),
            &[1],
            &json!({ "1": pkg(json!(["8", 0, -3, "x", 9])) }),
            &json!({
                "8": app(Some("Demo"), Some("Eight")),
                "9": app(Some("Demo"), Some("Nine")),
                "0": app(Some("Demo"), Some("Zero")),
            }),
        );
        assert_eq!(out.iter().map(|d| d.appid).collect::<Vec<_>>(), vec![8, 9]);
    }

    #[test]
    fn output_is_sorted_by_appid() {
        let out = select_licensed_demos(
            &set(&[]),
            &[1],
            &json!({ "1": pkg(json!([30, 10, 20])) }),
            &json!({
                "10": app(Some("Demo"), Some("a")),
                "20": app(Some("Demo"), Some("b")),
                "30": app(Some("Demo"), Some("c")),
            }),
        );
        assert_eq!(
            out.iter().map(|d| d.appid).collect::<Vec<_>>(),
            vec![10, 20, 30]
        );
    }

    // ---- collect_owned_and_demos over the fake backend ----

    /// 4-byte id prefix + binary KV `{ <pid> { appids { 0: a, 1: b } } }`.
    fn pkg_buf(pid: u32, appids: &[u32]) -> Vec<u8> {
        let mut b = pid.to_le_bytes().to_vec();
        b.push(0x00);
        b.extend(pid.to_string().bytes());
        b.push(0);
        b.push(0x00);
        b.extend(b"appids\0");
        for (i, a) in appids.iter().enumerate() {
            b.push(0x02);
            b.extend(i.to_string().bytes());
            b.push(0);
            b.extend(a.to_le_bytes());
        }
        b.extend([0x08, 0x08, 0x08]);
        b
    }

    fn pkg_raw(pid: u32, appids: &[u32]) -> PicsRaw {
        PicsRaw {
            packages: vec![PicsPackageRaw {
                package_id: pid,
                buffer: pkg_buf(pid, appids),
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    fn app_raw(ids: &[u32], ty: &str) -> PicsRaw {
        PicsRaw {
            apps: ids
                .iter()
                .map(|&id| PicsAppRaw {
                    app_id: id,
                    buffer: format!(
                        "\"appinfo\" {{ \"common\" {{ \"type\" \"{ty}\" \"name\" \"n{id}\" }} }}"
                    )
                    .into_bytes(),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        }
    }

    fn lic(pid: u32) -> LicenseEntry {
        LicenseEntry {
            package_id: pid,
            ..Default::default()
        }
    }

    async fn conn(b: &FakeBackend) -> crate::fake::FakeConn {
        b.connect_anon().await.ok().unwrap()
    }

    fn owned_rows() -> Vec<OwnedGameRaw> {
        vec![OwnedGameRaw {
            app_id: 1000,
            name: "Owned".into(),
            playtime_forever: 5,
            rtime_last_played: 9,
        }]
    }

    #[tokio::test]
    async fn returns_demos_via_packages_then_apps_tokens_first() {
        let b = FakeBackend::new();
        b.script(|s| {
            s.owned.queue.push_back(Ok(owned_rows()));
            s.pics.queue.push_back(Ok(pkg_raw(1136752, &[3205720])));
            s.pics.queue.push_back(Ok(app_raw(&[3205720], "Demo")));
        });
        let c = conn(&b).await;
        let out = collect_owned_and_demos(&c, 7, &[lic(1136752)])
            .await
            .unwrap();
        assert!(!out.demos_failed);
        assert_eq!(out.owned["app_count"], 1);
        assert_eq!(out.demos.len(), 1);
        assert_eq!(out.demos[0].appid, 3205720);
        assert_eq!(out.demos[0].name, "n3205720");
        b.script(|s| {
            // tokens before every product-info request
            assert_eq!(
                s.log,
                vec![
                    "pics_access_tokens",
                    "pics_product_info",
                    "pics_access_tokens",
                    "pics_product_info"
                ]
            );
        });
    }

    #[tokio::test]
    async fn no_licences_means_no_pics_and_no_failure() {
        let b = FakeBackend::new();
        b.script(|s| s.owned.queue.push_back(Ok(owned_rows())));
        let c = conn(&b).await;
        let out = collect_owned_and_demos(&c, 7, &[]).await.unwrap();
        assert!(out.demos.is_empty());
        assert!(!out.demos_failed);
        assert!(b.script(|s| s.pics_reqs.is_empty()));
    }

    #[tokio::test]
    async fn owned_failure_fails_the_call() {
        let b = FakeBackend::new();
        b.script(|s| s.owned.queue.push_back(Err(CmError::Timeout)));
        let c = conn(&b).await;
        assert_eq!(
            collect_owned_and_demos(&c, 7, &[lic(1)]).await.unwrap_err(),
            CmError::Timeout
        );
    }

    #[tokio::test]
    async fn package_lookup_failure_is_soft_and_keeps_owned() {
        let b = FakeBackend::new();
        b.script(|s| {
            s.owned.queue.push_back(Ok(owned_rows()));
            s.pics.queue.push_back(Err(CmError::Timeout));
        });
        let c = conn(&b).await;
        let out = collect_owned_and_demos(&c, 7, &[lic(1)]).await.unwrap();
        assert!(out.demos.is_empty());
        assert!(out.demos_failed);
        assert_eq!(out.demos_failure.as_deref(), Some("Timeout"));
        assert_eq!(out.owned["apps"][0]["appid"], 1000);
    }

    #[tokio::test]
    async fn one_failed_app_batch_yields_no_partial_set() {
        let ids: Vec<u32> = (1000..1450).collect();
        let b = FakeBackend::new();
        b.script(|s| {
            s.owned.queue.push_back(Ok(Vec::new()));
            s.pics.queue.push_back(Ok(pkg_raw(1, &ids)));
            s.pics.queue.push_back(Ok(app_raw(&ids[..200], "Demo")));
            s.pics.queue.push_back(Err(CmError::Timeout));
        });
        let c = conn(&b).await;
        let out = collect_owned_and_demos(&c, 7, &[lic(1)]).await.unwrap();
        assert!(out.demos.is_empty());
        assert!(out.demos_failed);
    }

    #[tokio::test]
    async fn only_licensed_not_owned_ids_in_batches_of_at_most_200() {
        let ids: Vec<u32> = (1000..1450).collect();
        let b = FakeBackend::new();
        b.script(|s| {
            // owns 1000 and 1001
            s.owned.queue.push_back(Ok(vec![
                OwnedGameRaw {
                    app_id: 1000,
                    ..Default::default()
                },
                OwnedGameRaw {
                    app_id: 1001,
                    ..Default::default()
                },
            ]));
            s.pics.queue.push_back(Ok(pkg_raw(1, &ids)));
        });
        let c = conn(&b).await;
        collect_owned_and_demos(&c, 7, &[lic(1)]).await.unwrap();
        b.script(|s| {
            let app_reqs: Vec<_> = s
                .pics_reqs
                .iter()
                .filter(|r| r.packages.is_empty())
                .collect();
            assert_eq!(app_reqs.len(), 3);
            let requested: Vec<u32> = app_reqs
                .iter()
                .flat_map(|r| r.apps.iter().map(|a| a.id))
                .collect();
            assert_eq!(requested.len(), 448);
            assert!(!requested.contains(&1000) && !requested.contains(&1001));
            assert!(app_reqs.iter().all(|r| r.apps.len() <= APP_BATCH_SIZE));
        });
    }

    #[tokio::test]
    async fn no_app_lookup_when_the_remainder_is_empty() {
        let b = FakeBackend::new();
        b.script(|s| {
            s.owned.queue.push_back(Ok(vec![OwnedGameRaw {
                app_id: 3205720,
                ..Default::default()
            }]));
            s.pics.queue.push_back(Ok(pkg_raw(1136752, &[3205720])));
        });
        let c = conn(&b).await;
        let out = collect_owned_and_demos(&c, 7, &[lic(1136752)])
            .await
            .unwrap();
        assert!(out.demos.is_empty() && !out.demos_failed);
        assert_eq!(b.script(|s| s.pics_reqs.len()), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn a_lookup_that_never_settles_yields_empty_demos_after_30s() {
        let b = FakeBackend::new();
        b.set_delay("pics_product_info", Duration::from_secs(3600));
        b.script(|s| s.owned.queue.push_back(Ok(owned_rows())));
        let c = conn(&b).await;
        let out = collect_owned_and_demos(&c, 7, &[lic(1)]).await.unwrap();
        assert!(out.demos.is_empty());
        assert!(out.demos_failed);
        assert_eq!(out.owned["app_count"], 1);
    }

    #[tokio::test]
    async fn owned_call_options_match_refresh_ts() {
        let b = FakeBackend::new();
        b.script(|s| s.owned.queue.push_back(Ok(owned_rows())));
        let c = conn(&b).await;
        collect_owned_and_demos(&c, 7, &[]).await.unwrap();
        // one GetOwnedGames call, with refresh.ts's options
        let seen = b.script(|s| s.owned_opts.clone());
        assert_eq!(
            seen,
            vec![OwnedOpts {
                include_appinfo: true,
                include_played_free_games: true,
                include_free_sub: false,
                skip_unvetted_apps: true,
            }]
        );
    }

    #[test]
    fn batch_and_timeout_constants_match_licensed_demos_ts() {
        assert_eq!(APP_BATCH_SIZE, 200);
        assert_eq!(LICENSED_DEMOS_TIMEOUT, Duration::from_secs(30));
    }
}
