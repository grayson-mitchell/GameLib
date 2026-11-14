//! Refresh's PICS-driven platform and metacritic capture (D-04, D-12): scope, read, parse and
//! merge, all in Rust. Port of `platformCapture.ts`, `metacriticCapture.ts` and the capture
//! sequence in `refresh.ts` (anonymous first, then the held session for what is left).
//!
//! Fail-soft by contract (34.15 D-03): a failed read is a `failed` summary, never an `Err`, so
//! Refresh keeps going with whatever it has. Rust returns the updated entries; the TS call site
//! persists them.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use std::time::Duration;

use futures_util::future::{BoxFuture, FutureExt};
use serde::Serialize;
use serde_json::Value;

use super::enrich::parse_metacritic_score;
use super::meta_entry::{
    depot_signal_captured, resolve_platform_write, PlatformSource, PlatformTriple,
    SteamMetadataEntry,
};
use crate::anon::AnonHandle;
use crate::backend::CmBackend;
use crate::error::CmError;
use crate::ops::pics;
use crate::session::{LeaseId, SessionHandle};

/// `STEAM_PICS_BULK_TIMEOUT_MS`.
pub const PICS_BULK_TIMEOUT: Duration = Duration::from_secs(90);

/// The three booleans a PICS capture ever writes (field names as `CapturedPlatforms` in TS).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct CapturedPlatforms {
    pub is_windows_native: bool,
    pub is_mac_native: bool,
    pub is_linux_native: bool,
}

/// A valid `common.metacritic_score` (1..=100).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct MetacriticCapture {
    pub metacritic_score: u32,
}

/// `parseOslistPlatforms` over `appinfo.common.oslist`. `None` when nothing should be written:
/// absent, non-string, empty, or only unrecognised tokens (D-02: never a false "no platforms").
/// `osx` is a defensive legacy synonym for `macos` (T-79-86: closed token set).
pub fn parse_oslist_platforms(appinfo: &Value) -> Option<CapturedPlatforms> {
    let oslist = appinfo.get("common")?.get("oslist")?.as_str()?;
    let mut out = CapturedPlatforms {
        is_windows_native: false,
        is_mac_native: false,
        is_linux_native: false,
    };
    let mut recognised = false;
    for token in oslist.split(',') {
        match token.trim().to_lowercase().as_str() {
            "windows" => out.is_windows_native = true,
            "macos" | "osx" => out.is_mac_native = true,
            "linux" => out.is_linux_native = true,
            _ => continue,
        }
        recognised = true;
    }
    recognised.then_some(out)
}

/// `parseMetacriticScore(appinfo.common.metacritic_score)`; the range check is T-79-86.
pub fn extract_metacritic(appinfo: &Value) -> Option<MetacriticCapture> {
    let raw = appinfo.get("common")?.get("metacritic_score");
    parse_metacritic_score(raw).map(|metacritic_score| MetacriticCapture { metacritic_score })
}

/// `isPublicOnlyEntry`: the token-gated half was withheld, or the entry is flagged `public_only`.
pub fn is_public_only_entry(entry: &Value) -> bool {
    let Some(e) = entry.as_object() else {
        return false;
    };
    if e.get("missingToken") == Some(&Value::Bool(true)) {
        return true;
    }
    match e.get("appinfo") {
        Some(Value::Object(a)) => match a.get("public_only") {
            Some(Value::Bool(b)) => *b,
            Some(Value::Number(n)) => n.as_f64() == Some(1.0),
            Some(Value::String(s)) => s == "1",
            _ => false,
        },
        _ => false,
    }
}

/// JS truthiness of `appinfo.common` (`!appinfo?.common`).
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(_) => true,
    }
}

fn entry_for(
    metadata: &BTreeMap<String, SteamMetadataEntry>,
    id: u32,
) -> Option<&SteamMetadataEntry> {
    metadata.get(&id.to_string())
}

/// Ids whose depot signal was never captured (D-04: the same set the install form calls
/// unresolved, by construction).
pub fn scope_platforms(metadata: &BTreeMap<String, SteamMetadataEntry>, ids: &[u32]) -> Vec<u32> {
    ids.iter()
        .copied()
        .filter(|id| !depot_signal_captured(entry_for(metadata, *id)))
        .collect()
}

/// Ids with `metacriticCaptured !== true`.
pub fn scope_metacritic(metadata: &BTreeMap<String, SteamMetadataEntry>, ids: &[u32]) -> Vec<u32> {
    ids.iter()
        .copied()
        .filter(|id| entry_for(metadata, *id).and_then(|e| e.metacritic_captured) != Some(true))
        .collect()
}

/// `mergePlatformCapture`: the entry to persist, or `None` when `resolvePlatformWrite` declines
/// (an existing strictly-newer complete capture survives; T-79-125). Every other field of
/// `existing`, modelled or not, carries forward; `mac_arch` is never inferred from PICS.
pub fn merge_platforms(
    existing: Option<&SteamMetadataEntry>,
    captured: &CapturedPlatforms,
    now_ms: i64,
) -> Option<SteamMetadataEntry> {
    let res = resolve_platform_write(
        existing,
        PlatformTriple {
            is_windows_native: captured.is_windows_native,
            is_mac_native: captured.is_mac_native,
            is_linux_native: captured.is_linux_native,
        },
        PlatformSource::Pics,
        now_ms,
    );
    if !res.accepted {
        return None;
    }
    let mut e = existing.cloned().unwrap_or_else(SteamMetadataEntry::blank);
    e.is_windows_native = Some(res.platforms.is_windows_native);
    e.is_mac_native = Some(res.platforms.is_mac_native);
    e.is_linux_native = Some(res.platforms.is_linux_native);
    e.platforms_captured = Some(true);
    e.platforms_source = Some(res.platforms_source.as_str().to_string());
    e.platforms_captured_at = Some(res.platforms_captured_at);
    Some(e)
}

/// metacriticCapture's write: drop any stale score, write the new one if there is one, and mark
/// the app captured either way (an app with no score is not re-asked every sync).
pub fn merge_metacritic(
    existing: Option<&SteamMetadataEntry>,
    capture: Option<&MetacriticCapture>,
) -> SteamMetadataEntry {
    let mut e = existing.cloned().unwrap_or_else(SteamMetadataEntry::blank);
    e.metacritic_score = capture.map(|c| c.metacritic_score);
    e.metacritic_captured = Some(true);
    e
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct CaptureSummary {
    pub scoped: usize,
    pub captured: usize,
    pub skipped: usize,
    pub failed: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct CaptureResult {
    pub updates: BTreeMap<String, SteamMetadataEntry>,
    pub platforms: CaptureSummary,
    pub metacritic: CaptureSummary,
    /// Ids answered usably by the anonymous session / the held lease.
    pub anon_count: usize,
    pub held_count: usize,
}

struct State<'a> {
    metadata: &'a BTreeMap<String, SteamMetadataEntry>,
    now_ms: i64,
    plat_scope: BTreeSet<u32>,
    meta_scope: BTreeSet<u32>,
    plat_done: BTreeSet<u32>,
    meta_done: BTreeSet<u32>,
    plat_captured: usize,
    meta_captured: usize,
    updates: BTreeMap<String, SteamMetadataEntry>,
}

impl State<'_> {
    fn remainder(&self) -> Vec<u32> {
        self.plat_scope
            .union(&self.meta_scope)
            .copied()
            .filter(|id| {
                (self.plat_scope.contains(id) && !self.plat_done.contains(id))
                    || (self.meta_scope.contains(id) && !self.meta_done.contains(id))
            })
            .collect()
    }

    fn working(&self, id: u32) -> Option<SteamMetadataEntry> {
        let key = id.to_string();
        self.updates
            .get(&key)
            .or_else(|| self.metadata.get(&key))
            .cloned()
    }

    /// Fold one response into the working entries. Returns the ids that were answered usably.
    /// `public_ok` is true for the held read, where a `public_only` entry is still complete.
    fn absorb(&mut self, resp: &Value, ids: &[u32], public_ok: bool) -> usize {
        let unknown: BTreeSet<u64> = resp
            .get("unknownApps")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_u64).collect())
            .unwrap_or_default();
        let mut usable = 0;
        for &id in ids {
            if unknown.contains(&u64::from(id)) {
                continue;
            }
            let Some(entry) = resp.get("apps").and_then(|a| a.get(id.to_string())) else {
                continue;
            };
            let public_only = !public_ok && is_public_only_entry(entry);
            if !public_only {
                usable += 1;
            }
            let appinfo = entry.get("appinfo").filter(|a| a.is_object());
            let Some(appinfo) = appinfo else { continue };

            let key = id.to_string();
            let mut current = self.working(id);
            let mut changed = false;

            if self.plat_scope.contains(&id) && !self.plat_done.contains(&id) && !public_only {
                if let Some(parsed) = parse_oslist_platforms(appinfo) {
                    self.plat_done.insert(id);
                    if let Some(next) = merge_platforms(current.as_ref(), &parsed, self.now_ms) {
                        current = Some(next);
                        changed = true;
                        self.plat_captured += 1;
                    }
                }
            }
            if self.meta_scope.contains(&id)
                && !self.meta_done.contains(&id)
                && truthy(appinfo.get("common"))
            {
                self.meta_done.insert(id);
                current = Some(merge_metacritic(
                    current.as_ref(),
                    extract_metacritic(appinfo).as_ref(),
                ));
                changed = true;
                self.meta_captured += 1;
            }
            if changed {
                if let Some(c) = current {
                    self.updates.insert(key, c);
                }
            }
        }
        usable
    }
}

fn read_apps<C: crate::backend::CmConn + Send + Sync + 'static>(
    conn: Arc<C>,
    ids: Vec<u32>,
) -> BoxFuture<'static, Result<Value, CmError>> {
    async move { pics::product_info(&*conn, &ids, &[], true).await }.boxed()
}

/// Anonymous first; whatever is still uncaptured (public-only, unknown, or the read failed) is
/// re-read through the held lease when one is given (D-04). One PICS read serves both kinds over
/// the union of the two scopes, as `getProductInfo` has no per-field projection. Never fails.
pub async fn capture_platforms_and_metacritic<B: CmBackend>(
    anon: &AnonHandle<B>,
    held: Option<(&SessionHandle<B>, LeaseId)>,
    metadata: &BTreeMap<String, SteamMetadataEntry>,
    ids: &[u32],
    now_ms: i64,
) -> CaptureResult
where
    B::Conn: Send + Sync + 'static,
{
    let plat: Vec<u32> = scope_platforms(metadata, ids);
    let meta: Vec<u32> = scope_metacritic(metadata, ids);
    let mut st = State {
        metadata,
        now_ms,
        plat_scope: plat.iter().copied().collect(),
        meta_scope: meta.iter().copied().collect(),
        plat_done: BTreeSet::new(),
        meta_done: BTreeSet::new(),
        plat_captured: 0,
        meta_captured: 0,
        updates: BTreeMap::new(),
    };
    let mut anon_count = 0;
    let mut held_count = 0;
    let mut read_failed = false;

    let todo = st.remainder();
    if !todo.is_empty() {
        let req = todo.clone();
        match anon
            .run_read("platform-capture", PICS_BULK_TIMEOUT, move |c| {
                read_apps(c, req)
            })
            .await
        {
            Ok(resp) => anon_count = st.absorb(&resp, &todo, false),
            Err(_) => read_failed = true,
        }
    }

    let rest = st.remainder();
    if !rest.is_empty() {
        if let Some((session, lease)) = held {
            let req = rest.clone();
            match session
                .run_op(lease, true, PICS_BULK_TIMEOUT, move |c| {
                    read_apps(c, req.clone())
                })
                .await
            {
                Ok(resp) => {
                    held_count = st.absorb(&resp, &rest, true);
                    // The held read answered: an earlier anonymous failure is recovered.
                    read_failed = false;
                }
                Err(_) => read_failed = true,
            }
        }
    }

    let summarise = |scoped: usize, captured: usize| CaptureSummary {
        scoped,
        captured,
        skipped: if read_failed {
            0
        } else {
            scoped.saturating_sub(captured)
        },
        failed: read_failed && scoped > 0,
    };
    CaptureResult {
        platforms: summarise(plat.len(), st.plat_captured),
        metacritic: summarise(meta.len(), st.meta_captured),
        updates: st.updates,
        anon_count,
        held_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{PicsAppRaw, PicsRaw};
    use crate::fake::FakeBackend;
    use crate::session::NoWrap;
    use serde_json::json;

    fn parse(oslist: Value) -> Option<CapturedPlatforms> {
        parse_oslist_platforms(&json!({ "common": { "oslist": oslist } }))
    }

    fn cp(w: bool, m: bool, l: bool) -> Option<CapturedPlatforms> {
        Some(CapturedPlatforms {
            is_windows_native: w,
            is_mac_native: m,
            is_linux_native: l,
        })
    }

    #[test]
    fn oslist_cases_from_platform_capture_test() {
        assert_eq!(parse(json!("unknowntoken")), None);
        assert_eq!(parse(json!("unknowntoken,linux")), cp(false, false, true));
        assert_eq!(parse(json!("windows")), cp(true, false, false));
        assert_eq!(parse(json!("windows,linux")), cp(true, false, true));
        assert_eq!(parse(json!("windows,macos,linux")), cp(true, true, true));
        assert_eq!(parse(json!("macos")), cp(false, true, false));
        assert_eq!(parse(json!("osx")), cp(false, true, false));
        assert_eq!(parse(json!(" Windows , MacOS ")), cp(true, true, false));
    }

    #[test]
    fn oslist_writes_nothing_for_absent_empty_or_non_string() {
        assert_eq!(parse(json!("")), None);
        assert_eq!(parse(json!("  ,  ")), None);
        assert_eq!(parse(json!(5)), None);
        assert_eq!(parse(json!(null)), None);
        assert_eq!(parse_oslist_platforms(&json!({})), None);
        assert_eq!(parse_oslist_platforms(&json!({ "common": {} })), None);
    }

    #[test]
    fn metacritic_extraction_follows_parse_metacritic_score() {
        let m = |v: Value| extract_metacritic(&json!({ "common": { "metacritic_score": v } }));
        assert_eq!(m(json!(86)).map(|c| c.metacritic_score), Some(86));
        assert_eq!(m(json!("86")).map(|c| c.metacritic_score), Some(86));
        assert_eq!(m(json!(0)), None);
        assert_eq!(m(json!(101)), None);
        assert_eq!(m(json!(86.5)), None);
        assert_eq!(m(json!("x")), None);
        assert_eq!(extract_metacritic(&json!({ "common": {} })), None);
        assert_eq!(extract_metacritic(&json!({})), None);
    }

    #[test]
    fn public_only_entry_cases() {
        assert!(!is_public_only_entry(&Value::Null));
        assert!(!is_public_only_entry(&json!("x")));
        assert!(!is_public_only_entry(&json!({})));
        assert!(is_public_only_entry(&json!({ "missingToken": true })));
        assert!(!is_public_only_entry(&json!({ "missingToken": false })));
        assert!(is_public_only_entry(
            &json!({ "appinfo": { "public_only": true } })
        ));
        assert!(is_public_only_entry(
            &json!({ "appinfo": { "public_only": 1 } })
        ));
        assert!(is_public_only_entry(
            &json!({ "appinfo": { "public_only": "1" } })
        ));
        assert!(!is_public_only_entry(
            &json!({ "appinfo": { "public_only": 0 } })
        ));
        assert!(!is_public_only_entry(
            &json!({ "appinfo": { "public_only": "0" } })
        ));
        assert!(!is_public_only_entry(&json!({ "appinfo": {} })));
    }

    fn entry(v: Value) -> SteamMetadataEntry {
        serde_json::from_value(v).unwrap()
    }

    fn store(items: &[(u32, Value)]) -> BTreeMap<String, SteamMetadataEntry> {
        items
            .iter()
            .map(|(id, v)| (id.to_string(), entry(v.clone())))
            .collect()
    }

    #[test]
    fn scope_platforms_excludes_captured_apps() {
        let m = store(&[
            (
                1,
                json!({ "platformsCaptured": true, "is_windows_native": true }),
            ),
            (2, json!({ "platformsCaptured": true })),
            (3, json!({ "is_windows_native": true })),
        ]);
        assert_eq!(scope_platforms(&m, &[1, 2, 3, 4]), vec![2, 3, 4]);
    }

    #[test]
    fn scope_metacritic_excludes_captured_apps() {
        let m = store(&[
            (1, json!({ "metacriticCaptured": true })),
            (2, json!({ "metacriticCaptured": false })),
            (3, json!({ "metacritic_score": 80 })),
        ]);
        assert_eq!(scope_metacritic(&m, &[1, 2, 3, 4]), vec![2, 3, 4]);
    }

    const ALL: CapturedPlatforms = CapturedPlatforms {
        is_windows_native: true,
        is_mac_native: true,
        is_linux_native: true,
    };

    #[test]
    fn merge_platforms_without_existing_stamps_pics_and_invents_no_mac_arch() {
        let out = merge_platforms(None, &ALL, 5_000).unwrap();
        assert_eq!(out.is_windows_native, Some(true));
        assert_eq!(out.platforms_captured, Some(true));
        assert_eq!(out.platforms_source.as_deref(), Some("pics"));
        assert_eq!(out.platforms_captured_at, Some(5_000));
        assert_eq!(out.mac_arch, None);
    }

    #[test]
    fn merge_platforms_carries_forward_every_other_field() {
        let ex = entry(json!({
            "art_cover": "c", "art_square": "s", "extra": { "reqs": [1] },
            "is_delisted": true, "mac_arch": "x86_64", "mac_arch_verified": true,
            "mac_arch_source": "probe", "forcedWindowsViaBottle": true,
            "bridge": { "k": 1 }, "futureField": 7,
            "platformsCapturedAt": 10, "platformsSource": "appdetails",
        }));
        let out = merge_platforms(Some(&ex), &ALL, 5_000).unwrap();
        assert_eq!(out.art_cover, "c");
        assert_eq!(out.mac_arch.as_deref(), Some("x86_64"));
        assert_eq!(out.mac_arch_source.as_deref(), Some("probe"));
        assert_eq!(out.forced_windows_via_bottle, Some(true));
        assert_eq!(out.bridge, Some(json!({ "k": 1 })));
        assert_eq!(out.rest.get("futureField"), Some(&json!(7)));
        assert_eq!(out.platforms_source.as_deref(), Some("pics"));
    }

    #[test]
    fn merge_platforms_declines_against_a_newer_complete_appdetails_write() {
        let ex = entry(json!({
            "is_windows_native": true, "is_mac_native": false, "is_linux_native": false,
            "platformsCaptured": true, "platformsSource": "appdetails",
            "platformsCapturedAt": 9_000,
        }));
        assert!(merge_platforms(Some(&ex), &ALL, 5_000).is_none());
    }

    #[test]
    fn merge_platforms_accepts_a_legacy_entry_without_a_stamp() {
        let ex = entry(json!({ "is_windows_native": true }));
        assert!(merge_platforms(Some(&ex), &ALL, 5_000).is_some());
    }

    #[test]
    fn merge_metacritic_marks_captured_with_or_without_a_score() {
        let ex = entry(json!({ "metacritic_score": 70, "futureField": 1 }));
        let with = merge_metacritic(
            Some(&ex),
            Some(&MetacriticCapture {
                metacritic_score: 91,
            }),
        );
        assert_eq!(with.metacritic_score, Some(91));
        assert_eq!(with.metacritic_captured, Some(true));
        assert_eq!(with.rest.get("futureField"), Some(&json!(1)));
        // The TS write drops the stale score first, then writes only a defined one.
        let without = merge_metacritic(Some(&ex), None);
        assert_eq!(without.metacritic_score, None);
        assert_eq!(without.metacritic_captured, Some(true));
        assert_eq!(merge_metacritic(None, None).metacritic_captured, Some(true));
    }

    // --- capture_platforms_and_metacritic -------------------------------------------------

    fn app_raw(id: u32, missing_token: bool, common: &str) -> PicsAppRaw {
        PicsAppRaw {
            app_id: id,
            change_number: 1,
            missing_token,
            buffer: format!("\"appinfo\"\n{{\n\"common\"\n{{\n{common}\n}}\n}}\n").into_bytes(),
        }
    }

    fn raw(apps: Vec<PicsAppRaw>, unknown: Vec<u32>) -> PicsRaw {
        PicsRaw {
            apps,
            unknown_app_ids: unknown,
            ..Default::default()
        }
    }

    const FULL: &str = "\"oslist\" \"windows,macos\"\n\"metacritic_score\" \"88\"";

    async fn lease(h: &SessionHandle<FakeBackend>) -> LeaseId {
        h.acquire(
            crate::backend::RefreshTokenSecret::new("t".into()),
            "test".into(),
            0,
        )
        .await
        .unwrap()
        .0
    }

    fn rig() -> (
        Arc<FakeBackend>,
        AnonHandle<FakeBackend>,
        SessionHandle<FakeBackend>,
    ) {
        let b = Arc::new(FakeBackend::new());
        (
            b.clone(),
            AnonHandle::spawn(b.clone()),
            SessionHandle::spawn(b, Arc::new(NoWrap)),
        )
    }

    fn pics_reads(b: &FakeBackend) -> usize {
        b.script(|s| s.pics_reqs.len())
    }

    #[tokio::test]
    async fn everything_answered_anonymously_makes_no_held_call() {
        let (b, anon, sess) = rig();
        let l = lease(&sess).await;
        b.script(|s| {
            s.pics.queue.push_back(Ok(raw(
                vec![app_raw(1, false, FULL), app_raw(2, false, FULL)],
                vec![],
            )))
        });
        let r = capture_platforms_and_metacritic(
            &anon,
            Some((&sess, l)),
            &BTreeMap::new(),
            &[1, 2],
            1_000,
        )
        .await;
        assert_eq!(pics_reads(&b), 1);
        assert_eq!(r.anon_count, 2);
        assert_eq!(r.held_count, 0);
        assert_eq!(r.platforms.captured, 2);
        assert_eq!(r.metacritic.captured, 2);
        assert!(!r.platforms.failed && !r.metacritic.failed);
        let e = &r.updates["1"];
        assert_eq!(e.is_mac_native, Some(true));
        assert_eq!(e.metacritic_score, Some(88));
        assert_eq!(e.platforms_source.as_deref(), Some("pics"));
    }

    #[tokio::test]
    async fn public_only_apps_go_to_the_held_lease_and_stay_uncaptured_without_one() {
        // Public-only entry: platforms withheld, metacritic still readable.
        let anon_reply = raw(
            vec![
                app_raw(1, true, "\"metacritic_score\" \"77\""),
                app_raw(2, false, FULL),
            ],
            vec![],
        );

        let (b, anon, sess) = rig();
        let l = lease(&sess).await;
        b.script(|s| {
            s.pics.queue.push_back(Ok(anon_reply.clone()));
            s.pics
                .queue
                .push_back(Ok(raw(vec![app_raw(1, false, FULL)], vec![])));
        });
        let r = capture_platforms_and_metacritic(
            &anon,
            Some((&sess, l)),
            &BTreeMap::new(),
            &[1, 2],
            1_000,
        )
        .await;
        assert_eq!(pics_reads(&b), 2);
        let held_req = b.script(|s| s.pics_reqs[1].clone());
        assert_eq!(
            held_req.apps.iter().map(|a| a.id).collect::<Vec<_>>(),
            vec![1]
        );
        assert_eq!(r.anon_count, 1);
        assert_eq!(r.held_count, 1);
        assert_eq!(r.platforms.captured, 2);
        // metacritic for app 1 was taken from the anonymous public data, not overwritten.
        assert_eq!(r.updates["1"].metacritic_score, Some(77));
        assert_eq!(r.updates["1"].is_windows_native, Some(true));

        // The Mac path: no lease, the remainder is left uncaptured, nothing fails.
        let (b2, anon2, _s2) = rig();
        b2.script(|s| s.pics.queue.push_back(Ok(anon_reply)));
        let r2 =
            capture_platforms_and_metacritic(&anon2, None, &BTreeMap::new(), &[1, 2], 1_000).await;
        assert_eq!(pics_reads(&b2), 1);
        assert_eq!(r2.platforms.captured, 1);
        assert_eq!(r2.platforms.skipped, 1);
        assert!(!r2.platforms.failed);
        assert!(!r2.updates["1"].is_windows_native.is_some());
    }

    #[tokio::test]
    async fn anonymous_failure_falls_back_to_the_held_lease() {
        let (b, anon, sess) = rig();
        let l = lease(&sess).await;
        b.script(|s| {
            s.pics.queue.push_back(Err(CmError::Timeout));
            s.pics
                .queue
                .push_back(Ok(raw(vec![app_raw(1, false, FULL)], vec![])));
        });
        let r = capture_platforms_and_metacritic(
            &anon,
            Some((&sess, l)),
            &BTreeMap::new(),
            &[1],
            1_000,
        )
        .await;
        assert_eq!(r.anon_count, 0);
        assert_eq!(r.held_count, 1);
        assert_eq!(r.platforms.captured, 1);
        assert!(!r.platforms.failed);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn both_failing_is_a_failed_summary_never_an_error() {
        let (b, anon, sess) = rig();
        let l = lease(&sess).await;
        // The session retries an idempotent read once, so give it enough failures.
        b.script(|s| {
            for _ in 0..6 {
                s.pics.queue.push_back(Err(CmError::Timeout));
            }
        });
        let r = capture_platforms_and_metacritic(
            &anon,
            Some((&sess, l)),
            &BTreeMap::new(),
            &[1, 2],
            1_000,
        )
        .await;
        assert!(r.updates.is_empty());
        assert!(r.platforms.failed && r.metacritic.failed);
        assert_eq!(r.platforms.captured, 0);
    }

    #[tokio::test]
    async fn one_read_serves_both_scopes_over_their_union() {
        let (b, anon, _s) = rig();
        // 1: platforms captured already, metacritic not. 2: the reverse. 3: both uncaptured.
        let m = store(&[
            (
                1,
                json!({ "platformsCaptured": true, "is_windows_native": true }),
            ),
            (2, json!({ "metacriticCaptured": true })),
        ]);
        b.script(|s| {
            s.pics.queue.push_back(Ok(raw(
                vec![
                    app_raw(1, false, FULL),
                    app_raw(2, false, FULL),
                    app_raw(3, false, FULL),
                ],
                vec![],
            )))
        });
        let r = capture_platforms_and_metacritic(&anon, None, &m, &[1, 2, 3], 1_000).await;
        assert_eq!(pics_reads(&b), 1);
        assert_eq!(r.platforms.scoped, 2);
        assert_eq!(r.metacritic.scoped, 2);
        // App 1 only gets metacritic, app 2 only platforms, app 3 both, merged into one entry.
        assert_eq!(r.updates["1"].metacritic_score, Some(88));
        assert_eq!(r.updates["1"].is_mac_native, None);
        assert_eq!(r.updates["2"].is_mac_native, Some(true));
        assert_eq!(r.updates["2"].metacritic_score, None);
        assert_eq!(r.updates["3"].is_mac_native, Some(true));
        assert_eq!(r.updates["3"].metacritic_score, Some(88));
        assert_eq!(r.updates.len(), 3);
    }

    #[tokio::test]
    async fn nothing_scoped_reads_nothing_and_unwritten_apps_are_not_updated() {
        let (b, anon, _s) = rig();
        let m = store(&[(
            1,
            json!({ "platformsCaptured": true, "is_windows_native": true, "metacriticCaptured": true }),
        )]);
        let r = capture_platforms_and_metacritic(&anon, None, &m, &[1], 1_000).await;
        assert_eq!(pics_reads(&b), 0);
        assert!(r.updates.is_empty());

        // An unknown app and an app with no oslist write nothing.
        b.script(|s| {
            s.pics
                .queue
                .push_back(Ok(raw(vec![app_raw(5, false, "\"name\" \"x\"")], vec![4])))
        });
        let r =
            capture_platforms_and_metacritic(&anon, None, &BTreeMap::new(), &[4, 5], 1_000).await;
        // App 5 has a `common` block, so metacritic is captured (without a score); platforms are not.
        assert_eq!(r.platforms.captured, 0);
        assert_eq!(r.platforms.skipped, 2);
        assert_eq!(r.metacritic.captured, 1);
        assert!(!r.updates.contains_key("4"));
        assert_eq!(r.updates["5"].metacritic_captured, Some(true));
        assert_eq!(r.updates["5"].platforms_captured, None);
    }
}
