//! The whole Refresh orchestration in Rust (D-12) and the two lazy store ops.
//!
//! `refresh_library` collects owned games and licensed demos on the held lease, captures
//! platforms and metacritic (anonymous first, held lease as fallback), merges that into a working
//! copy of the metadata snapshot, assembles the finished library, runs the bounded enrichment
//! stage for apps that need it, and returns the finished games plus every changed metadata entry.
//! TS only persists the result.
//!
//! Secret and privacy hygiene (T-79-126): nothing here logs args or results; the library and the
//! metadata snapshot are never formatted into a log line.

pub mod assemble;
pub mod capture;
pub mod enrich;
pub mod meta_entry;
pub mod owned_demos;
pub mod store_http;

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use gamelib_steamfiles::readers::{localconfig_path_for, read_localconfig_playtime, LocalPlaytime};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::anon::AnonHandle;
use crate::backend::CmBackend;
use crate::macowned::{mac_owned_apps, FallbackReason};
use crate::session::{OpFailure, SessionHandle};

use assemble::{assemble_library, AssembleInput, InstallStateInput, OwnedApp, PlaytimeMode};
use capture::{capture_platforms_and_metacritic, CaptureSummary};
use enrich::{
    enrich_entry, enrich_stage, needs_enrichment, EnrichInput, EnrichOutcome, EnrichStageSummary,
    ENRICH_STAGE_BUDGET,
};
use meta_entry::SteamMetadataEntry;
use owned_demos::collect_owned_and_demos;
use store_http::{store_appdetails, StoreDetails, StoreError};

/// The whole `steamcm_refresh` op is bounded here; the TS side leaves it unbounded.
pub const REFRESH_DEADLINE: Duration = Duration::from_secs(150);
/// Kept free at the end of the deadline for assembly and the reply, so the fail-soft stages
/// (capture, enrichment) always finish before the hard deadline fires (WR-01).
const STAGE_MARGIN: Duration = Duration::from_secs(5);
/// Owned games plus the 30 s demos bound, in one idempotent held-lease op.
const COLLECT_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum RefreshSource {
    /// The Mac Steam path (79-36, D-14): owned apps come from the running Mac Steam client, so no
    /// signed-in logon is made and no lease is needed.
    #[serde(rename_all = "camelCase")]
    MacSteam {
        helper_path: String,
        steam_id: String,
    },
    Cm {
        #[serde(rename = "leaseId")]
        lease_id: u64,
        #[serde(rename = "steamId")]
        steam_id: String,
    },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RefreshArgs {
    pub source: RefreshSource,
    pub metadata: BTreeMap<String, SteamMetadataEntry>,
    pub previous_games: Vec<Value>,
    pub install_state: InstallStateInput,
    pub bridge_allowlist: Vec<String>,
    pub known_fix_mac32: Vec<String>,
    pub is_mac: bool,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

fn capture_summary_json(s: &CaptureSummary) -> Value {
    json!({
        "scoped": s.scoped,
        "captured": s.captured,
        "skipped": s.skipped,
        "failed": s.failed,
    })
}

fn enrich_summary_json(s: &EnrichStageSummary) -> Value {
    json!({
        "attempted": s.attempted,
        "enriched": s.enriched,
        "delisted": s.delisted,
        "failed": s.failed,
        "rateLimited": s.rate_limited,
        "budgetHit": s.budget_hit,
        "notReached": s.not_reached,
    })
}

/// The owned-games failure is `ownedFailed` (the TS side falls back to the cached library); a
/// lease or shutdown problem keeps its own kind.
fn owned_failure(f: &OpFailure) -> Value {
    let mut v = crate::facade::failure(f);
    let cause = v["kind"].clone();
    if !matches!(cause.as_str(), Some("leaseUnknown") | Some("shuttingDown")) {
        v["kind"] = json!("ownedFailed");
        v["cause"] = cause;
    }
    v
}

fn mac_fallback(r: FallbackReason) -> Value {
    json!({"ok": false, "kind": "macFallback", "reason": r.as_str()})
}

/// Refresh. Never fails for a demos, capture or enrichment problem; only an owned-games failure,
/// an unknown lease or the 150 s deadline yield `{ok:false}`.
///
/// Only the owned-games step can run into the deadline. Capture and enrichment share what is
/// left of it: capture stops early enough to leave enrichment its budget, enrichment stops
/// `STAGE_MARGIN` before the deadline, and either stopping early is a soft `failed`/`budgetHit`.
pub async fn refresh_library<B: CmBackend>(
    session: Option<SessionHandle<B>>,
    anon: &AnonHandle<B>,
    client: &reqwest::Client,
    base_url: &str,
    args: RefreshArgs,
) -> Value
where
    B::Conn: Send + Sync + 'static,
{
    let deadline = tokio::time::Instant::now() + REFRESH_DEADLINE;
    match tokio::time::timeout_at(
        deadline,
        refresh_body(session, anon, client, base_url, args, deadline),
    )
    .await
    {
        Ok(v) => v,
        Err(_) => json!({"ok": false, "kind": "timeout"}),
    }
}

async fn refresh_body<B: CmBackend>(
    session: Option<SessionHandle<B>>,
    anon: &AnonHandle<B>,
    client: &reqwest::Client,
    base_url: &str,
    args: RefreshArgs,
    deadline: tokio::time::Instant,
) -> Value
where
    B::Conn: Send + Sync + 'static,
{
    let stages_end = deadline - STAGE_MARGIN;
    let (apps, owned_count, demo_count, demos_failed, demos_failure, held, playtime, source_tag) =
        match &args.source {
            RefreshSource::Cm { lease_id, steam_id } => {
                let (Some(session), Ok(lease), Ok(steam_id)) =
                    (session, u32::try_from(*lease_id), steam_id.parse::<u64>())
                else {
                    return json!({"ok": false, "kind": "leaseUnknown"});
                };
                // Step 1: owned games plus licensed demos on the held lease. The demos stage is
                // fail-soft inside; only the owned call can fail this.
                let licences = match session.licenses(lease).await {
                    Ok(l) => l,
                    Err(e) => return owned_failure(&e),
                };
                let collected = match session
                    .run_op(lease, true, COLLECT_TIMEOUT, |c| {
                        let licences = licences.clone();
                        Box::pin(async move {
                            collect_owned_and_demos(c.as_ref(), steam_id, &licences).await
                        })
                    })
                    .await
                {
                    Ok(c) => c,
                    Err(e) => return owned_failure(&e),
                };
                // Demos are concatenated after the owned rows.
                let mut apps = OwnedApp::from_owned(&collected.owned);
                let owned_count = apps.len();
                apps.extend(collected.demos.iter().map(OwnedApp::from));
                (
                    apps,
                    owned_count,
                    collected.demos.len(),
                    json!(collected.demos_failed),
                    json!(collected.demos_failure),
                    Some((session, lease)),
                    PlaytimeMode::Fresh,
                    "cm",
                )
            }
            RefreshSource::MacSteam {
                helper_path,
                steam_id,
            } => {
                // Every guard failure is a typed fallback before any capture, assembly or
                // enrichment work (T-79-108); the TS side then runs the CM path.
                let Ok(steam_id) = steam_id.parse::<u64>() else {
                    return mac_fallback(FallbackReason::Parse);
                };
                let mac = match mac_owned_apps(anon, Path::new(helper_path), steam_id).await {
                    Ok(m) => m,
                    Err(r) => return mac_fallback(r),
                };
                let mut apps = OwnedApp::from_owned(&mac.owned);
                let owned_count = apps.len();
                apps.extend(mac.demos.iter().map(OwnedApp::from));
                // Per-app playtime from Mac Steam's own localconfig.vdf (DV-79-13): a file read,
                // no logon (D-14). The real file is tens of MiB, so it is parsed off the async
                // runtime; any failure is an empty map (pure carry-forward).
                let root = gamelib_steamfiles::discover::discover_default().path;
                let local = tokio::task::spawn_blocking(move || {
                    mac_local_playtime(Path::new(&root), steam_id)
                })
                .await
                .unwrap_or_default();
                (
                    apps,
                    owned_count,
                    mac.demos.len(),
                    json!(false),
                    Value::Null,
                    None,
                    PlaytimeMode::CarryForward(local),
                    "macSteam",
                )
            }
        };
    let ids: Vec<u32> = apps.iter().map(|a| a.appid).collect();

    // Step 2: capture. Fail-soft by contract (34.15 D-01..D-05): a failure leaves the entries
    // uncaptured and never fails Refresh.
    let cap = capture_platforms_and_metacritic(
        anon,
        held.as_ref().map(|(s, l)| (s, *l)),
        &args.metadata,
        &ids,
        now_ms(),
        stages_end - ENRICH_STAGE_BUDGET,
    )
    .await;
    let mut working = args.metadata.clone();
    let mut updates: BTreeMap<String, SteamMetadataEntry> = BTreeMap::new();
    for (k, e) in &cap.updates {
        working.insert(k.clone(), e.clone());
        updates.insert(k.clone(), e.clone());
    }

    // Step 3: assemble.
    let allow: BTreeSet<String> = args.bridge_allowlist.iter().cloned().collect();
    let mut games = assemble_library(AssembleInput {
        apps: &apps,
        metadata: &working,
        install: &args.install_state,
        previous_games: &args.previous_games,
        bridge_allowlist: &allow,
        is_mac: args.is_mac,
        playtime: &playtime,
    });

    // Step 4: bounded enrichment. Apps it does not reach keep their cached art and are served by
    // the lazy `steamcm_store_enrich` op (the remainder path).
    let fixes: BTreeSet<&str> = args.known_fix_mac32.iter().map(String::as_str).collect();
    let inputs: Vec<EnrichInput> = games
        .iter()
        .filter_map(|g| {
            let id = g.get("app_name").and_then(Value::as_str)?;
            needs_enrichment(g, working.get(id)).then(|| EnrichInput {
                app_id: id.to_string(),
                cached: working.get(id).cloned(),
                current: g.clone(),
                known_fix_mac32: fixes.contains(id),
            })
        })
        .collect();
    let budget = stages_end
        .saturating_duration_since(tokio::time::Instant::now())
        .min(ENRICH_STAGE_BUDGET);
    let (outcomes, enrich_sum) = enrich_stage(client, base_url, inputs, budget).await;
    for g in games.iter_mut() {
        let Some(id) = g.get("app_name").and_then(Value::as_str).map(String::from) else {
            continue;
        };
        match outcomes.get(&id) {
            Some(EnrichOutcome::Enriched { entry, game })
            | Some(EnrichOutcome::Delisted { entry, game }) => {
                *g = game.clone();
                updates.insert(id, (**entry).clone());
            }
            _ => {}
        }
    }

    let metadata_updates = serde_json::to_value(&updates).unwrap_or(Value::Null);
    json!({"ok": true, "result": {
        "games": games,
        "metadataUpdates": metadata_updates,
        "ownedCount": owned_count,
        "demoCount": demo_count,
        "demosFailed": demos_failed,
        "demosFailure": demos_failure,
        "capture": {
            "platforms": capture_summary_json(&cap.platforms),
            "metacritic": capture_summary_json(&cap.metacritic),
            "anonCount": cap.anon_count,
            "heldCount": cap.held_count,
        },
        "enrich": enrich_summary_json(&enrich_sum),
        "source": source_tag,
    }})
}

fn store_failure(e: &StoreError) -> Value {
    match e {
        StoreError::BadAppId => json!({"ok": false, "kind": "badAppId"}),
        StoreError::Http { status } => json!({"ok": false, "kind": "http", "status": status}),
        StoreError::TooLarge => json!({"ok": false, "kind": "tooLarge"}),
        StoreError::Timeout => json!({"ok": false, "kind": "timeout"}),
        StoreError::Parse => json!({"ok": false, "kind": "parse"}),
        StoreError::Network => json!({"ok": false, "kind": "network"}),
    }
}

/// `steamcm_store_enrich`: the same `enrich_entry` the Refresh stage uses, for one app.
pub async fn store_enrich(
    client: &reqwest::Client,
    base_url: &str,
    app_id: &str,
    cached: Option<&SteamMetadataEntry>,
    current: &Value,
    known_fix_mac32: bool,
) -> Value {
    let details = match store_appdetails(client, base_url, app_id).await {
        Ok(d) => d,
        Err(e) => return store_failure(&e),
    };
    let result = match enrich_entry(app_id, cached, current, &details, known_fix_mac32, now_ms()) {
        EnrichOutcome::Delisted { entry, game } => {
            json!({"kind": "delisted", "entry": entry, "game": game})
        }
        EnrichOutcome::Enriched { entry, game } => {
            json!({"kind": "enriched", "entry": entry, "game": game})
        }
        EnrichOutcome::NoData => json!({"kind": "noData"}),
    };
    json!({"ok": true, "result": result})
}

/// `steamcm_store_appdetails`: the parsed envelope, for `getSteamInstallSize`.
pub async fn store_appdetails_op(client: &reqwest::Client, base_url: &str, app_id: &str) -> Value {
    match store_appdetails(client, base_url, app_id).await {
        Ok(d) => json!({"ok": true, "result": details_json(&d)}),
        Err(e) => store_failure(&e),
    }
}

fn details_json(d: &StoreDetails) -> Value {
    json!({
        "delisted": d.delisted,
        "data": d.data,
        "storageBytes": d.storage_bytes,
        "macMinOs": d.mac_min_os,
        "macArch": d.mac_arch,
    })
}

/// localconfig.vdf playtime for a SteamID64 under a Steam root; empty when the id is not an
/// individual account or the file is missing, oversized or malformed.
fn mac_local_playtime(steam_root: &Path, steam_id: u64) -> BTreeMap<u32, LocalPlaytime> {
    match localconfig_path_for(steam_root, steam_id) {
        Some(path) => read_localconfig_playtime(&path),
        None => BTreeMap::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::store_http::mock::{spawn, Reply};
    use super::*;
    use crate::backend::{OwnedGameRaw, PicsAppRaw, PicsRaw, RefreshTokenSecret};
    use crate::fake::FakeBackend;
    use crate::session::NoWrap;
    use std::sync::Arc;

    const FULL: &str = "\"oslist\" \"windows,macos\"\n\"metacritic_score\" \"88\"";

    fn args(lease: u64) -> RefreshArgs {
        serde_json::from_value(json!({
            "source": {"kind": "cm", "leaseId": lease, "steamId": "76561198000000001"},
            "metadata": {}, "previousGames": [], "installState": {},
            "bridgeAllowlist": [], "knownFixMac32": [], "isMac": false
        }))
        .unwrap()
    }

    fn owned(id: i32) -> OwnedGameRaw {
        OwnedGameRaw {
            app_id: id,
            name: format!("Game {id}"),
            playtime_forever: 5,
            rtime_last_played: 0,
        }
    }

    fn pics_app(id: u32) -> PicsAppRaw {
        PicsAppRaw {
            app_id: id,
            change_number: 1,
            missing_token: false,
            buffer: format!("\"appinfo\"\n{{\n\"common\"\n{{\n{FULL}\n}}\n}}\n").into_bytes(),
        }
    }

    struct Rig {
        b: Arc<FakeBackend>,
        anon: AnonHandle<FakeBackend>,
        sess: SessionHandle<FakeBackend>,
        lease: u32,
    }

    async fn rig() -> Rig {
        let b = Arc::new(FakeBackend::new());
        let anon = AnonHandle::spawn(b.clone());
        let sess = SessionHandle::spawn(b.clone(), Arc::new(NoWrap));
        let lease = sess
            .acquire(RefreshTokenSecret::new("t".into()), "test".into(), 0)
            .await
            .unwrap()
            .0;
        Rig {
            b,
            anon,
            sess,
            lease,
        }
    }

    fn store_ok(ids: &'static [&'static str]) -> impl Fn(&str) -> Reply + Send + Sync {
        move |target| {
            let id = target
                .split("appids=")
                .nth(1)
                .and_then(|r| r.split('&').next())
                .unwrap_or("");
            if ids.contains(&id) {
                Reply::json(json!({id: {"success": true, "data": {
                    "name": "G", "short_description": "s", "genres": [],
                    "platforms": {"windows": true, "mac": false, "linux": false}
                }}}))
            } else {
                Reply::status(500)
            }
        }
    }

    #[tokio::test]
    async fn refresh_runs_end_to_end_over_a_held_lease() {
        let r = rig().await;
        r.b.script(|s| {
            s.owned.queue.push_back(Ok(vec![owned(10), owned(20)]));
            s.pics.queue.push_back(Ok(PicsRaw {
                apps: vec![pics_app(10), pics_app(20)],
                ..Default::default()
            }));
        });
        let m = spawn(store_ok(&["10", "20"])).await;
        let c = reqwest::Client::new();
        let v = refresh_library(
            Some(r.sess.clone()),
            &r.anon,
            &c,
            &m.base,
            args(r.lease as u64),
        )
        .await;
        assert_eq!(v["ok"], true, "{v}");
        let res = &v["result"];
        let ids: Vec<&str> = res["games"]
            .as_array()
            .unwrap()
            .iter()
            .map(|g| g["app_name"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["10", "20"]);
        assert_eq!(res["ownedCount"], 2);
        assert_eq!(res["demoCount"], 0);
        assert_eq!(res["source"], "cm");
        assert_eq!(res["capture"]["platforms"]["captured"], 2);
        assert_eq!(res["enrich"]["attempted"], 2);
        assert_eq!(res["enrich"]["enriched"], 2);
        let upd = res["metadataUpdates"].as_object().unwrap();
        assert!(upd.contains_key("10") && upd.contains_key("20"));
        // Enriched game carries the enrich_entry game (the entry's art URL is set).
        assert!(!res["games"][0]["art_cover"].as_str().unwrap().is_empty());
        // Captured platform data survives into the final entry.
        assert_eq!(upd["10"]["metacritic_score"], 88);
    }

    #[tokio::test]
    async fn owned_failure_does_no_capture_or_enrich_work() {
        let r = rig().await;
        r.b.script(|s| {
            s.owned
                .queue
                .push_back(Err(crate::error::CmError::EResult(5)))
        });
        let m = spawn(store_ok(&[])).await;
        let c = reqwest::Client::new();
        let v = refresh_library(
            Some(r.sess.clone()),
            &r.anon,
            &c,
            &m.base,
            args(r.lease as u64),
        )
        .await;
        assert_eq!(v["ok"], false);
        assert_eq!(v["kind"], "ownedFailed");
        assert_eq!(v["eresult"], 5);
        assert!(r.b.script(|s| s.pics_reqs.is_empty()));
        assert!(m.paths.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn capture_and_enrich_problems_never_fail_refresh() {
        let r = rig().await;
        r.b.script(|s| {
            s.owned.queue.push_back(Ok(vec![owned(10)]));
            // The anonymous read, the held read and its idempotent retry all fail.
            for _ in 0..4 {
                s.pics.queue.push_back(Err(crate::error::CmError::Closed));
            }
        });
        let m = spawn(|_| Reply::status(429)).await;
        let c = reqwest::Client::new();
        let v = refresh_library(
            Some(r.sess.clone()),
            &r.anon,
            &c,
            &m.base,
            args(r.lease as u64),
        )
        .await;
        assert_eq!(v["ok"], true, "{v}");
        assert_eq!(v["result"]["capture"]["platforms"]["failed"], true);
        assert_eq!(v["result"]["enrich"]["rateLimited"], true);
        assert_eq!(v["result"]["games"].as_array().unwrap().len(), 1);
    }

    /// WR-01: capture's own bounds (90 s anonymous, 90 s held plus a retry) used to add up past
    /// the 150 s Refresh deadline, so a stalled capture read threw the whole library away as
    /// `timeout`. Capture is fail-soft: it now stops inside the deadline and the owned games are
    /// returned.
    #[tokio::test(start_paused = true)]
    async fn a_stalled_capture_keeps_the_library_inside_the_deadline() {
        let r = rig().await;
        r.b.script(|s| s.owned.queue.push_back(Ok(vec![owned(10), owned(20)])));
        r.b.set_delay("pics_product_info", Duration::from_secs(3600));
        let m = spawn(store_ok(&[])).await;
        let c = reqwest::Client::new();
        let start = tokio::time::Instant::now();
        let v = refresh_library(
            Some(r.sess.clone()),
            &r.anon,
            &c,
            &m.base,
            args(r.lease as u64),
        )
        .await;
        assert_eq!(v["ok"], true, "{v}");
        assert!(start.elapsed() < REFRESH_DEADLINE);
        let res = &v["result"];
        assert_eq!(res["ownedCount"], 2);
        assert_eq!(res["games"].as_array().unwrap().len(), 2);
        assert_eq!(res["capture"]["platforms"]["failed"], true);
    }

    #[tokio::test]
    async fn unknown_lease_is_a_typed_result() {
        let r = rig().await;
        let m = spawn(store_ok(&[])).await;
        let c = reqwest::Client::new();
        let v = refresh_library(
            Some(r.sess.clone()),
            &r.anon,
            &c,
            &m.base,
            args(r.lease as u64 + 100),
        )
        .await;
        assert_eq!(v, json!({"ok": false, "kind": "leaseUnknown"}));
        let none = refresh_library::<FakeBackend>(None, &r.anon, &c, &m.base, args(1)).await;
        assert_eq!(none["kind"], "leaseUnknown");
    }

    fn mac_args(helper: &str, previous: Value) -> RefreshArgs {
        serde_json::from_value(json!({
            "source": {"kind": "macSteam", "helperPath": helper, "steamId": "76561198000000001"},
            "metadata": {}, "previousGames": previous, "installState": {},
            "bridgeAllowlist": [], "knownFixMac32": [], "isMac": true
        }))
        .unwrap()
    }

    #[test]
    fn mac_source_parses_and_rejects_unknown_keys() {
        assert!(matches!(
            mac_args("/x", json!([])).source,
            RefreshSource::MacSteam { .. }
        ));
        let bad = serde_json::from_value::<RefreshArgs>(json!({
            "source": {"kind": "macSteam", "helperPath": "/x", "steamId": "1", "leaseId": 1},
            "metadata": {}, "previousGames": [], "installState": {},
            "bridgeAllowlist": [], "knownFixMac32": [], "isMac": true
        }));
        assert!(bad.is_err());
    }

    #[tokio::test]
    async fn mac_guard_failures_are_typed_fallbacks_with_no_work() {
        let r = rig().await;
        let m = spawn(store_ok(&[])).await;
        let c = reqwest::Client::new();
        let v = refresh_library::<FakeBackend>(
            None,
            &r.anon,
            &c,
            &m.base,
            mac_args("/nonexistent/steam-bridge-helper", json!([])),
        )
        .await;
        assert_eq!(v["ok"], false);
        assert_eq!(v["kind"], "macFallback");
        let want = if cfg!(target_os = "macos") {
            "helper-missing"
        } else {
            "not-macos"
        };
        assert_eq!(v["reason"], want);
        assert!(r.b.script(|s| s.pics_reqs.is_empty()));
        assert!(m.paths.lock().unwrap().is_empty());
        // An unparseable SteamID is a fallback too.
        let mut bad = mac_args("/x", json!([]));
        bad.source = RefreshSource::MacSteam {
            helper_path: "/x".into(),
            steam_id: "nope".into(),
        };
        let v = refresh_library::<FakeBackend>(None, &r.anon, &c, &m.base, bad).await;
        assert_eq!(
            v,
            json!({"ok": false, "kind": "macFallback", "reason": "parse"})
        );
    }

    #[test]
    fn mac_local_playtime_reads_the_account_file_or_is_empty() {
        let root = tempfile::tempdir().unwrap();
        assert!(mac_local_playtime(root.path(), 76561198000000001).is_empty());
        let cfg = root.path().join("userdata/39734273/config");
        std::fs::create_dir_all(&cfg).unwrap();
        std::fs::write(
            cfg.join("localconfig.vdf"),
            "\"UserLocalConfigStore\"{\"Software\"{\"Valve\"{\"Steam\"{\"apps\"{\"10\"{\"Playtime\" \"12\" \"LastPlayed\" \"34\"}}}}}}",
        )
        .unwrap();
        let m = mac_local_playtime(root.path(), 76561198000000001);
        assert_eq!(m[&10].playtime_minutes, Some(12));
        assert_eq!(m[&10].last_played, Some(34));
        assert!(mac_local_playtime(root.path(), 5).is_empty());
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    // accountId 39734273 has no userdata dir on a real machine, so this stays pure carry-forward.
    async fn mac_source_runs_anonymously_and_carries_playtime_forward() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let helper = dir.path().join("steam-bridge-helper");
        std::fs::write(
            &helper,
            "#!/bin/sh\necho '{\"ok\":true,\"count\":3,\"appIds\":[10,20,30]}'\n",
        )
        .unwrap();
        std::fs::set_permissions(&helper, std::fs::Permissions::from_mode(0o755)).unwrap();
        let typed = |id: u32, ty: &str| {
            PicsAppRaw {
            app_id: id,
            change_number: 1,
            missing_token: false,
            buffer: format!(
                "\"appinfo\"\n{{\n\"common\"\n{{\n\"type\" \"{ty}\"\n\"name\" \"n{id}\"\n{FULL}\n}}\n}}\n"
            )
            .into_bytes(),
        }
        };
        let r = rig().await;
        r.b.script(|s| {
            // Mac type/name lookup, then the capture pass.
            s.pics.queue.push_back(Ok(PicsRaw {
                apps: vec![typed(10, "Game"), typed(20, "Game"), typed(30, "Demo")],
                ..Default::default()
            }));
            s.pics.queue.push_back(Ok(PicsRaw {
                apps: vec![pics_app(10), pics_app(20), pics_app(30)],
                ..Default::default()
            }));
        });
        let m = spawn(store_ok(&["10", "20", "30"])).await;
        let c = reqwest::Client::new();
        let prev = json!([{"app_name": "10", "extra": {
            "steamPlaytimeMinutes": 42, "steamLastPlayed": 7}}]);
        let v = refresh_library::<FakeBackend>(
            None,
            &r.anon,
            &c,
            &m.base,
            mac_args(helper.to_str().unwrap(), prev),
        )
        .await;
        assert_eq!(v["ok"], true, "{v}");
        let res = &v["result"];
        assert_eq!(res["source"], "macSteam");
        assert_eq!(res["ownedCount"], 2);
        assert_eq!(res["demoCount"], 1);
        assert_eq!(res["capture"]["heldCount"], 0);
        let games = res["games"].as_array().unwrap();
        assert_eq!(games.len(), 3);
        assert_eq!(games[0]["extra"]["steamPlaytimeMinutes"], 42);
        assert_eq!(games[0]["extra"]["steamLastPlayed"], 7);
        assert_eq!(games[1]["extra"]["steamPlaytimeMinutes"], 0);
        assert_eq!(r.b.script(|s| s.authed.len()), 0);
    }

    #[test]
    fn args_reject_unknown_keys() {
        let bad = serde_json::from_value::<RefreshArgs>(json!({
            "source": {"kind": "cm", "leaseId": 1, "steamId": "1"},
            "metadata": {}, "previousGames": [], "installState": {},
            "bridgeAllowlist": [], "knownFixMac32": [], "isMac": false, "x": 1
        }));
        assert!(bad.is_err());
    }

    #[tokio::test]
    async fn store_ops_reject_a_bad_app_id_without_a_request() {
        let m = spawn(store_ok(&[])).await;
        let c = reqwest::Client::new();
        let v = store_enrich(&c, &m.base, "abc", None, &json!({}), false).await;
        assert_eq!(v, json!({"ok": false, "kind": "badAppId"}));
        let v = store_appdetails_op(&c, &m.base, "abc").await;
        assert_eq!(v, json!({"ok": false, "kind": "badAppId"}));
        assert!(m.paths.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn store_ops_return_enrichment_and_details() {
        let m = spawn(store_ok(&["10"])).await;
        let c = reqwest::Client::new();
        let cur = json!({"app_name": "10", "title": "T", "extra": {}});
        let v = store_enrich(&c, &m.base, "10", None, &cur, false).await;
        assert_eq!(v["result"]["kind"], "enriched");
        assert!(v["result"]["entry"].is_object() && v["result"]["game"].is_object());
        let d = store_appdetails_op(&c, &m.base, "10").await;
        assert_eq!(d["ok"], true);
        assert_eq!(d["result"]["delisted"], false);
    }
}
