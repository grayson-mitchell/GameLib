//! Store metadata/artwork enrichment: the post-fetch half of `fetchMetadataIfNeeded`
//! (`gameMetadata.ts`) as a pure function, plus the bounded Refresh stage that runs it over
//! many apps. TS only persists the returned `entry` and pushes the returned `game`.
//!
//! Stage budget (D-12): a cold cache has hundreds of never-enriched apps and the store
//! rate-limits `appdetails`, so the stage runs 5 at a time, stops at the first HTTP 429 and
//! gives up after 20 s so Refresh still returns promptly. Apps it does not reach are listed
//! in `not_reached` and stay on the lazy per-game path, which calls `enrich_entry` through an
//! op with the same merge rules.

use std::collections::{BTreeMap, VecDeque};
use std::time::Duration;

use futures_util::stream::{FuturesUnordered, StreamExt};
use serde_json::{json, Map, Value};
use tokio::time::Instant;

use super::meta_entry::{
    depot_signal_captured, resolve_platform_write, PlatformSource, PlatformTriple,
    SteamMetadataEntry,
};
use super::store_http::{mac_arch_from_min_os, store_appdetails, StoreDetails, StoreError};

/// `MAX_CONCURRENT_METADATA_FETCHES`.
pub const ENRICH_CONCURRENCY: usize = 5;
/// Wall-clock budget of one Refresh enrichment stage.
pub const ENRICH_STAGE_BUDGET: Duration = Duration::from_secs(20);

const STEAM_CDN_BASE: &str = "https://cdn.cloudflare.steamstatic.com/steam/apps";

/// What one enrichment produced. `entry` is the full `steamMetadataStore` value to persist,
/// `game` the `SteamGameInfo` to put in the library and push to the renderer.
#[derive(Debug, Clone, PartialEq)]
pub enum EnrichOutcome {
    Delisted {
        entry: Box<SteamMetadataEntry>,
        game: Value,
    },
    Enriched {
        entry: Box<SteamMetadataEntry>,
        game: Value,
    },
    /// Ambiguous / empty envelope: transient, nothing to write (never a delisted verdict).
    NoData,
}

/// JS truthiness of a JSON value (`!!x`).
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// `parseMetacriticScore`: 1..=100 integer from a number or a digits-only string.
pub fn parse_metacritic_score(raw: Option<&Value>) -> Option<u32> {
    let n: f64 = match raw? {
        Value::Number(n) => n.as_f64()?,
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() || !t.chars().all(|c| c.is_ascii_digit()) {
                return None;
            }
            t.parse().ok()?
        }
        _ => return None,
    };
    (n.fract() == 0.0 && (1.0..=100.0).contains(&n)).then_some(n as u32)
}

/// `artNeverFetched || platformsNeverCaptured` (games.ts): a delisted game is never re-fetched.
pub fn needs_enrichment(game: &Value, cached: Option<&SteamMetadataEntry>) -> bool {
    let delisted = truthy(game.get("is_delisted"));
    let art_cover = truthy(game.get("art_cover"));
    (!delisted && !art_cover) || (!delisted && !depot_signal_captured(cached))
}

fn merged_extra(current: &Value, data: &Value) -> Value {
    let mut extra: Map<String, Value> = current
        .get("extra")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let reqs = current
        .get("extra")
        .and_then(|e| e.get("reqs"))
        .filter(|r| !r.is_null())
        .cloned()
        .unwrap_or_else(|| json!([]));
    extra.insert("reqs".into(), reqs);
    // T-2-02: short_description is stored as a plain string, never parsed as HTML.
    let short = data
        .get("short_description")
        .filter(|s| !s.is_null())
        .cloned()
        .unwrap_or_else(|| json!(""));
    extra.insert(
        "about".into(),
        json!({ "description": short.clone(), "shortDescription": short }),
    );
    let genres: Vec<Value> = data
        .get("genres")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|g| g.get("description").cloned().unwrap_or(Value::Null))
                .collect()
        })
        .unwrap_or_default();
    extra.insert("genres".into(), Value::Array(genres));
    Value::Object(extra)
}

/// The pure merge. `known_fix_mac32` is the TS-owned known-fixes verdict for this app and
/// `now_ms` the capture clock; both are passed in.
pub fn enrich_entry(
    app_id: &str,
    cached: Option<&SteamMetadataEntry>,
    current: &Value,
    details: &StoreDetails,
    known_fix_mac32: bool,
    now_ms: i64,
) -> EnrichOutcome {
    if details.delisted {
        // GAP-B: persist the flag without wiping cached art/extra.
        let mut game = current.as_object().cloned().unwrap_or_default();
        game.insert("is_delisted".into(), Value::Bool(true));
        let mut entry = cached.cloned().unwrap_or_else(SteamMetadataEntry::blank);
        entry.is_delisted = Some(true);
        return EnrichOutcome::Delisted {
            entry: Box::new(entry),
            game: Value::Object(game),
        };
    }
    let Some(data) = details.data.as_ref() else {
        return EnrichOutcome::NoData;
    };

    let art_base = format!("{STEAM_CDN_BASE}/{app_id}");
    let art_cover = format!("{art_base}/header.jpg");
    // Portrait library capsule (2:3), matching the portrait tile.
    let art_square = format!("{art_base}/library_600x900.jpg");
    let extra = merged_extra(current, data);

    let platform = |k: &str| truthy(data.get("platforms").and_then(|p| p.get(k)));
    let incoming = PlatformTriple {
        is_windows_native: platform("windows"),
        is_mac_native: platform("mac"),
        is_linux_native: platform("linux"),
    };
    let metacritic = parse_metacritic_score(data.get("metacritic").and_then(|m| m.get("score")));

    let resolution = resolve_platform_write(cached, incoming, PlatformSource::Appdetails, now_ms);
    // The EFFECTIVE triple, never the raw appdetails values, is used from here on.
    let eff = resolution.platforms;

    let arch_verified = cached.is_some_and(|c| c.mac_arch_verified == Some(true));
    let mac_arch: Option<String> = if arch_verified {
        cached.and_then(|c| c.mac_arch.clone())
    } else if known_fix_mac32 {
        Some("32".into())
    } else if eff.is_mac_native {
        let min = data
            .get("mac_requirements")
            .and_then(|m| m.get("minimum"))
            .and_then(Value::as_str);
        Some(mac_arch_from_min_os(min).into())
    } else if cached.is_some_and(|c| c.mac_arch_source.as_deref() == Some("known-fix")) {
        None
    } else {
        cached.and_then(|c| c.mac_arch.clone())
    };

    // ---- game (SteamGameInfo)
    let mut game = current.as_object().cloned().unwrap_or_default();
    if let Some(name) = data.get("name").filter(|n| !n.is_null()) {
        game.insert("title".into(), name.clone());
    }
    game.insert("art_cover".into(), json!(art_cover));
    game.insert("art_square".into(), json!(art_square));
    game.insert("is_mac_native".into(), json!(eff.is_mac_native));
    game.insert("is_linux_native".into(), json!(eff.is_linux_native));
    game.insert("is_windows_native".into(), json!(eff.is_windows_native));
    match &mac_arch {
        Some(a) => game.insert("mac_arch".into(), json!(a)),
        None => game.remove("mac_arch"),
    };
    game.insert("is_delisted".into(), json!(false));
    game.insert("steamPlatformsCaptured".into(), json!(true));
    match metacritic.or_else(|| cached.and_then(|c| c.metacritic_score)) {
        Some(s) => game.insert("metacritic_score".into(), json!(s)),
        None => game.remove("metacritic_score"),
    };
    game.insert("extra".into(), extra.clone());

    // ---- entry: the enumerated write, with the standing carry-forwards (T-18-02-04).
    // Unmodelled keys ride along from the cached entry (T-79-123).
    let mut entry = SteamMetadataEntry::blank();
    entry.rest = cached.map(|c| c.rest.clone()).unwrap_or_default();
    entry.art_cover = art_cover;
    entry.art_square = art_square;
    entry.extra = extra;
    entry.is_mac_native = Some(eff.is_mac_native);
    entry.is_linux_native = Some(eff.is_linux_native);
    entry.is_windows_native = Some(eff.is_windows_native);
    entry.is_delisted = Some(false);
    entry.platforms_captured = Some(true);
    entry.platforms_source = Some(resolution.platforms_source.as_str().into());
    entry.platforms_captured_at = Some(resolution.platforms_captured_at);
    entry.mac_arch = mac_arch;
    if arch_verified {
        entry.mac_arch_verified = Some(true);
        entry.mac_arch_source = cached.and_then(|c| c.mac_arch_source.clone());
    } else if known_fix_mac32 {
        entry.mac_arch_source = Some("known-fix".into());
    } else if eff.is_mac_native {
        entry.mac_arch_source = Some("minos".into());
    }
    if cached.is_some_and(|c| c.forced_windows_via_bottle == Some(true)) {
        entry.forced_windows_via_bottle = Some(true);
    }
    entry.bridge = cached
        .and_then(|c| c.bridge.clone())
        .filter(|b| !b.is_null());
    match metacritic {
        Some(s) => {
            entry.metacritic_score = Some(s);
            entry.metacritic_captured = Some(true);
        }
        None => {
            entry.metacritic_score = cached.and_then(|c| c.metacritic_score);
            if cached.is_some_and(|c| c.metacritic_captured == Some(true)) {
                entry.metacritic_captured = Some(true);
            }
        }
    }

    EnrichOutcome::Enriched {
        entry: Box::new(entry),
        game: Value::Object(game),
    }
}

// ---- Refresh stage ------------------------------------------------------------------------

/// One app handed to the stage.
#[derive(Debug, Clone)]
pub struct EnrichInput {
    pub app_id: String,
    pub cached: Option<SteamMetadataEntry>,
    /// `SteamGameInfo` as JSON.
    pub current: Value,
    pub known_fix_mac32: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EnrichStageSummary {
    pub attempted: usize,
    pub enriched: usize,
    pub delisted: usize,
    pub failed: usize,
    pub rate_limited: bool,
    pub budget_hit: bool,
    /// Apps with no verdict from this stage (never started, in flight at the budget, or the
    /// 429 itself); the lazy per-game op serves them.
    pub not_reached: Vec<String>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

enum Done {
    Outcome(String, EnrichOutcome),
    Failed(String, StoreError),
}

/// Enrich many apps: concurrency [`ENRICH_CONCURRENCY`], stop at the first 429, stop at
/// `budget`. Only `Enriched`/`Delisted` outcomes are returned; a per-app failure is counted
/// and never aborts the stage.
pub async fn enrich_stage(
    client: &reqwest::Client,
    base_url: &str,
    apps: Vec<EnrichInput>,
    budget: Duration,
) -> (BTreeMap<String, EnrichOutcome>, EnrichStageSummary) {
    let deadline = Instant::now() + budget;
    let mut queue: VecDeque<EnrichInput> = apps.into();
    let mut inflight = FuturesUnordered::new();
    let mut in_flight_ids: Vec<String> = Vec::new();
    let mut out = BTreeMap::new();
    let mut sum = EnrichStageSummary::default();

    loop {
        while !sum.rate_limited && inflight.len() < ENRICH_CONCURRENCY {
            let Some(app) = queue.pop_front() else { break };
            sum.attempted += 1;
            in_flight_ids.push(app.app_id.clone());
            inflight.push(async move {
                match store_appdetails(client, base_url, &app.app_id).await {
                    Ok(d) => {
                        let o = enrich_entry(
                            &app.app_id,
                            app.cached.as_ref(),
                            &app.current,
                            &d,
                            app.known_fix_mac32,
                            now_ms(),
                        );
                        Done::Outcome(app.app_id, o)
                    }
                    Err(e) => Done::Failed(app.app_id, e),
                }
            });
        }
        if inflight.is_empty() {
            break;
        }
        let next = match tokio::time::timeout_at(deadline, inflight.next()).await {
            Ok(Some(done)) => done,
            Ok(None) => break,
            Err(_) => {
                sum.budget_hit = true;
                break;
            }
        };
        match next {
            Done::Outcome(id, o) => {
                in_flight_ids.retain(|x| *x != id);
                match o {
                    EnrichOutcome::Enriched { .. } => {
                        sum.enriched += 1;
                        out.insert(id, o);
                    }
                    EnrichOutcome::Delisted { .. } => {
                        sum.delisted += 1;
                        out.insert(id, o);
                    }
                    EnrichOutcome::NoData => sum.failed += 1,
                }
            }
            Done::Failed(id, e) => {
                in_flight_ids.retain(|x| *x != id);
                if e == (StoreError::Http { status: 429 }) {
                    sum.rate_limited = true;
                    sum.not_reached.push(id);
                } else {
                    sum.failed += 1;
                }
            }
        }
    }
    drop(inflight);
    // Anything still in flight (budget hit, or a 429 that stopped us) plus the unstarted queue.
    sum.not_reached.extend(in_flight_ids);
    sum.not_reached.extend(queue.into_iter().map(|a| a.app_id));
    (out, sum)
}

#[cfg(test)]
mod tests {
    use super::super::store_http::mock::{spawn, Reply};
    use super::*;

    const NOW: i64 = 5_000_000;

    fn data(plat: (bool, bool, bool)) -> Value {
        json!({
            "name": "Game", "short_description": "short",
            "genres": [{"id": "1", "description": "Action"}, {"id": "2", "description": "RPG"}],
            "platforms": {"windows": plat.0, "mac": plat.1, "linux": plat.2},
            "mac_requirements": {"minimum": "<li><strong>OS:</strong> 10.15</li>"},
            "metacritic": {"score": 88}
        })
    }

    fn details(d: Value) -> StoreDetails {
        StoreDetails {
            delisted: false,
            data: Some(d),
            storage_bytes: None,
            mac_min_os: None,
            mac_arch: None,
        }
    }

    fn current() -> Value {
        json!({
            "app_name": "570", "title": "Old", "extra": {"reqs": [{"a": 1}], "steamPlaytimeMinutes": 42},
            "is_installed": false
        })
    }

    fn enriched(o: EnrichOutcome) -> (SteamMetadataEntry, Value) {
        match o {
            EnrichOutcome::Enriched { entry, game } => (*entry, game),
            other => panic!("not enriched: {other:?}"),
        }
    }

    #[test]
    fn delisted_without_cache_writes_the_blank_placeholder() {
        let d = StoreDetails {
            delisted: true,
            data: None,
            storage_bytes: None,
            mac_min_os: None,
            mac_arch: None,
        };
        match enrich_entry("570", None, &current(), &d, false, NOW) {
            EnrichOutcome::Delisted { entry, game } => {
                assert_eq!(
                    serde_json::to_value(&*entry).unwrap(),
                    json!({"art_cover": "", "art_square": "", "extra": {"reqs": []}, "is_delisted": true})
                );
                let mut want = current();
                want["is_delisted"] = json!(true);
                assert_eq!(game, want);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn delisted_with_cache_only_changes_the_flag() {
        let mut c = SteamMetadataEntry::blank();
        c.art_cover = "x".into();
        c.is_mac_native = Some(true);
        c.bridge = Some(json!({"scan": 1}));
        c.is_delisted = Some(false);
        let d = StoreDetails {
            delisted: true,
            data: None,
            storage_bytes: None,
            mac_min_os: None,
            mac_arch: None,
        };
        let EnrichOutcome::Delisted { entry, .. } =
            enrich_entry("1", Some(&c), &current(), &d, false, NOW)
        else {
            panic!()
        };
        let mut want = c.clone();
        want.is_delisted = Some(true);
        assert_eq!(*entry, want);
    }

    #[test]
    fn no_data_is_transient() {
        let d = StoreDetails {
            delisted: false,
            data: None,
            storage_bytes: None,
            mac_min_os: None,
            mac_arch: None,
        };
        assert_eq!(
            enrich_entry("1", None, &current(), &d, false, NOW),
            EnrichOutcome::NoData
        );
    }

    #[test]
    fn full_details_entry_and_game() {
        let (entry, game) = enriched(enrich_entry(
            "570",
            None,
            &current(),
            &details(data((true, true, false))),
            false,
            NOW,
        ));
        assert_eq!(
            serde_json::to_value(&entry).unwrap(),
            json!({
                "art_cover": format!("{STEAM_CDN_BASE}/570/header.jpg"),
                "art_square": format!("{STEAM_CDN_BASE}/570/library_600x900.jpg"),
                "extra": {
                    "reqs": [{"a": 1}], "steamPlaytimeMinutes": 42,
                    "about": {"description": "short", "shortDescription": "short"},
                    "genres": ["Action", "RPG"]
                },
                "is_mac_native": true, "is_linux_native": false, "is_windows_native": true,
                "is_delisted": false, "platformsCaptured": true,
                "platformsSource": "appdetails", "platformsCapturedAt": NOW,
                "mac_arch": "64", "mac_arch_source": "minos",
                "metacritic_score": 88, "metacriticCaptured": true
            })
        );
        assert_eq!(game["title"], "Game");
        assert_eq!(game["is_delisted"], false);
        assert_eq!(game["steamPlatformsCaptured"], true);
        assert_eq!(game["metacritic_score"], 88);
        assert_eq!(game["mac_arch"], "64");
        assert_eq!(game["app_name"], "570");
        assert_eq!(
            game["extra"],
            serde_json::to_value(&entry).unwrap()["extra"]
        );
    }

    #[test]
    fn extra_defaults_when_current_has_none() {
        let d = details(json!({"platforms": {}}));
        let (entry, _) = enriched(enrich_entry(
            "1",
            None,
            &json!({"title": "T"}),
            &d,
            false,
            NOW,
        ));
        assert_eq!(
            entry.extra,
            json!({"reqs": [], "about": {"description": "", "shortDescription": ""}, "genres": []})
        );
    }

    #[test]
    fn title_kept_when_store_has_no_name() {
        let d = details(json!({"platforms": {"windows": true}}));
        let (_, game) = enriched(enrich_entry(
            "1",
            None,
            &json!({"title": "Keep"}),
            &d,
            false,
            NOW,
        ));
        assert_eq!(game["title"], "Keep");
    }

    #[test]
    fn platform_precedence_declines_a_newer_pics_capture() {
        let mut c = SteamMetadataEntry::blank();
        c.is_windows_native = Some(true);
        c.is_mac_native = Some(false);
        c.is_linux_native = Some(true);
        c.platforms_source = Some("pics".into());
        c.platforms_captured_at = Some(NOW + 1000);
        let (entry, game) = enriched(enrich_entry(
            "1",
            Some(&c),
            &current(),
            &details(data((true, true, false))),
            false,
            NOW,
        ));
        assert_eq!(entry.is_mac_native, Some(false));
        assert_eq!(entry.platforms_source.as_deref(), Some("pics"));
        assert_eq!(entry.platforms_captured_at, Some(NOW + 1000));
        assert_eq!(game["is_mac_native"], false);
        // mac-native gate uses the EFFECTIVE flag: no minos arch, no minos source.
        assert_eq!(entry.mac_arch, None);
        assert_eq!(entry.mac_arch_source, None);
        assert!(game.get("mac_arch").is_none());
    }

    #[test]
    fn mac_arch_verified_wins_and_carries_source() {
        let mut c = SteamMetadataEntry::blank();
        c.mac_arch = Some("32".into());
        c.mac_arch_verified = Some(true);
        c.mac_arch_source = Some("macho".into());
        let (entry, game) = enriched(enrich_entry(
            "1",
            Some(&c),
            &current(),
            &details(data((true, true, false))),
            true,
            NOW,
        ));
        assert_eq!(entry.mac_arch.as_deref(), Some("32"));
        assert_eq!(entry.mac_arch_verified, Some(true));
        assert_eq!(entry.mac_arch_source.as_deref(), Some("macho"));
        assert_eq!(game["mac_arch"], "32");
    }

    #[test]
    fn known_fix_seeds_32_without_verifying() {
        let (entry, _) = enriched(enrich_entry(
            "1",
            None,
            &current(),
            &details(data((true, true, false))),
            true,
            NOW,
        ));
        assert_eq!(entry.mac_arch.as_deref(), Some("32"));
        assert_eq!(entry.mac_arch_source.as_deref(), Some("known-fix"));
        assert_eq!(entry.mac_arch_verified, None);
    }

    #[test]
    fn retracted_known_fix_is_cleared_for_a_non_mac_app() {
        let mut c = SteamMetadataEntry::blank();
        c.mac_arch = Some("32".into());
        c.mac_arch_source = Some("known-fix".into());
        let (entry, game) = enriched(enrich_entry(
            "1",
            Some(&c),
            &current(),
            &details(data((true, false, false))),
            false,
            NOW,
        ));
        assert_eq!(entry.mac_arch, None);
        assert!(game.get("mac_arch").is_none());
    }

    #[test]
    fn cached_arch_kept_for_a_non_mac_app() {
        let mut c = SteamMetadataEntry::blank();
        c.mac_arch = Some("64".into());
        c.mac_arch_source = Some("minos".into());
        let (entry, game) = enriched(enrich_entry(
            "1",
            Some(&c),
            &current(),
            &details(data((true, false, false))),
            false,
            NOW,
        ));
        assert_eq!(entry.mac_arch.as_deref(), Some("64"));
        assert_eq!(
            entry.mac_arch_source, None,
            "enumerated write carries no source here"
        );
        assert_eq!(game["mac_arch"], "64");
    }

    #[test]
    fn low_min_os_is_unknown_never_32() {
        let mut d = data((true, true, false));
        d["mac_requirements"]["minimum"] = json!("OS: 10.9");
        let (entry, _) = enriched(enrich_entry("1", None, &current(), &details(d), false, NOW));
        assert_eq!(entry.mac_arch.as_deref(), Some("unknown"));
    }

    #[test]
    fn carry_forwards_survive() {
        let mut c = SteamMetadataEntry::blank();
        c.forced_windows_via_bottle = Some(true);
        c.bridge = Some(json!({"scan": {"x": 1}, "userRoute": "bridge"}));
        c.metacritic_score = Some(70);
        c.metacritic_captured = Some(true);
        c.rest.insert("futureField".into(), json!(1));
        let mut d = data((true, true, false));
        d.as_object_mut().unwrap().remove("metacritic");
        let (entry, game) = enriched(enrich_entry(
            "1",
            Some(&c),
            &current(),
            &details(d),
            false,
            NOW,
        ));
        assert_eq!(entry.forced_windows_via_bottle, Some(true));
        assert_eq!(entry.bridge, c.bridge);
        assert_eq!(entry.metacritic_score, Some(70));
        assert_eq!(entry.metacritic_captured, Some(true));
        assert_eq!(entry.rest.get("futureField"), Some(&json!(1)));
        assert_eq!(game["metacritic_score"], 70);
    }

    #[test]
    fn forced_flag_false_is_not_carried_and_fresh_score_wins() {
        let mut c = SteamMetadataEntry::blank();
        c.forced_windows_via_bottle = Some(false);
        c.metacritic_score = Some(70);
        let (entry, _) = enriched(enrich_entry(
            "1",
            Some(&c),
            &current(),
            &details(data((true, true, false))),
            false,
            NOW,
        ));
        assert_eq!(entry.forced_windows_via_bottle, None);
        assert_eq!(entry.metacritic_score, Some(88));
    }

    #[test]
    fn windows_flag_is_written_false_not_dropped() {
        let (entry, _) = enriched(enrich_entry(
            "1",
            None,
            &current(),
            &details(data((false, true, false))),
            false,
            NOW,
        ));
        assert_eq!(entry.is_windows_native, Some(false));
        assert!(depot_signal_captured(Some(&entry)));
    }

    #[test]
    fn metacritic_parser_matches_the_ts_validator() {
        let p = |v: Value| parse_metacritic_score(Some(&v));
        assert_eq!(p(json!(90)), Some(90));
        assert_eq!(p(json!("90")), Some(90));
        assert_eq!(p(json!(" 7 ")), Some(7));
        assert_eq!(p(json!(0)), None);
        assert_eq!(p(json!(101)), None);
        assert_eq!(p(json!(90.5)), None);
        assert_eq!(p(json!("9x")), None);
        assert_eq!(p(json!("")), None);
        assert_eq!(p(json!(null)), None);
        assert_eq!(parse_metacritic_score(None), None);
    }

    #[test]
    fn needs_enrichment_matches_games_ts() {
        let mut full = SteamMetadataEntry::blank();
        full.platforms_captured = Some(true);
        full.is_windows_native = Some(true);
        let with_art = json!({"art_cover": "a"});
        assert!(!needs_enrichment(&with_art, Some(&full)));
        assert!(
            needs_enrichment(&json!({}), Some(&full)),
            "never fetched art"
        );
        assert!(
            needs_enrichment(&with_art, None),
            "never captured platforms"
        );
        let mut residue = full.clone();
        residue.is_windows_native = None;
        assert!(needs_enrichment(&with_art, Some(&residue)));
        let delisted = json!({"is_delisted": true});
        assert!(!needs_enrichment(&delisted, None));
    }

    // ---- stage (real-time short timings: paused time misfires with loopback IO)

    fn input(id: &str) -> EnrichInput {
        EnrichInput {
            app_id: id.into(),
            cached: None,
            current: json!({"title": id}),
            known_fix_mac32: false,
        }
    }

    fn ok_body(path: &str) -> Reply {
        let id = path.rsplit('=').next().unwrap().to_string();
        Reply::json(json!({ id: {"success": true, "data": data((true, true, false))} }))
    }

    fn client() -> reqwest::Client {
        crate::install_crypto_provider();
        reqwest::Client::new()
    }

    #[tokio::test]
    async fn stage_respects_concurrency_five() {
        let m = spawn(|p| ok_body(p).delayed(Duration::from_millis(80))).await;
        let apps: Vec<_> = (1..=12).map(|i| input(&i.to_string())).collect();
        let (out, sum) = enrich_stage(&client(), &m.base, apps, Duration::from_secs(10)).await;
        assert_eq!(out.len(), 12);
        assert_eq!(sum.enriched, 12);
        assert_eq!(sum.attempted, 12);
        assert!(sum.not_reached.is_empty() && !sum.rate_limited && !sum.budget_hit);
        let max = m.max_concurrent.load(std::sync::atomic::Ordering::SeqCst);
        assert!(max <= ENRICH_CONCURRENCY, "max concurrent {max}");
        assert!(max >= 2, "should actually run in parallel, got {max}");
    }

    #[tokio::test]
    async fn stage_stops_at_the_first_429() {
        let m = spawn(|p| {
            if p.ends_with("=3") {
                Reply::status(429)
            } else {
                ok_body(p).delayed(Duration::from_millis(30))
            }
        })
        .await;
        let apps: Vec<_> = (1..=30).map(|i| input(&i.to_string())).collect();
        let (out, sum) = enrich_stage(&client(), &m.base, apps, Duration::from_secs(10)).await;
        assert!(sum.rate_limited);
        assert!(sum.not_reached.contains(&"3".to_string()));
        assert!(sum.attempted < 30, "no new requests after the 429");
        assert_eq!(out.len() + sum.not_reached.len() + sum.failed, 30);
        assert!(sum.not_reached.len() >= 20);
    }

    #[tokio::test]
    async fn stage_budget_lists_unreached_apps() {
        let m = spawn(|p| ok_body(p).delayed(Duration::from_millis(400))).await;
        let apps: Vec<_> = (1..=12).map(|i| input(&i.to_string())).collect();
        let (out, sum) = enrich_stage(&client(), &m.base, apps, Duration::from_millis(150)).await;
        assert!(sum.budget_hit);
        assert!(out.is_empty());
        assert_eq!(sum.not_reached.len(), 12);
    }

    #[tokio::test]
    async fn stage_counts_failures_and_delisted_without_aborting() {
        let m = spawn(|p| {
            if p.ends_with("=2") {
                Reply::status(500)
            } else if p.ends_with("=3") {
                Reply::json(json!({"3": {"success": false}}))
            } else if p.ends_with("=4") {
                Reply::json(json!({"4": {"success": true}}))
            } else {
                ok_body(p)
            }
        })
        .await;
        let apps: Vec<_> = (1..=5).map(|i| input(&i.to_string())).collect();
        let (out, sum) = enrich_stage(&client(), &m.base, apps, Duration::from_secs(10)).await;
        assert_eq!((sum.enriched, sum.delisted, sum.failed), (2, 1, 2));
        assert!(matches!(out["3"], EnrichOutcome::Delisted { .. }));
        assert!(!out.contains_key("2") && !out.contains_key("4"));
        assert!(!sum.rate_limited && !sum.budget_hit);
    }

    #[test]
    fn stage_constants_match_ts() {
        assert_eq!(ENRICH_CONCURRENCY, 5);
        assert_eq!(ENRICH_STAGE_BUDGET, Duration::from_secs(20));
    }
}
