//! The Mac Steam owned-apps source (D-14, D-15): the running, signed-in native Steam client is
//! asked, through `steam-bridge-helper --steam-owned-apps`, which apps the account holds. Spike 084.
//!
//! The helper runs OUT OF PROCESS (D-15): `steamclient.dylib` is never loaded into this process.
//! Every failure is a [`FallbackReason`], never an error the caller must treat differently; the
//! caller then uses the CM path (D-14/D-15).
//!
//! Real-profile arm: the child inherits this process's real environment on purpose. The helper
//! needs the real `HOME` to find the Steam client's `steamclient.dylib`; an isolated profile would
//! make every run a fallback. Tests spawn only stub scripts.
//!
//! No signed-in CM logon happens here: type and name lookups go over the anonymous session.
//! Free-to-play titles the account holds are kept (Steam's own library lists them).
//! Nothing here logs a SteamID or an app list: only counts and a reason word.

use std::collections::BTreeSet;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use serde_json::{json, Map, Value};
use tokio::process::Command;

use crate::anon::AnonHandle;
use crate::backend::CmBackend;
use crate::facade::PICS_TIMEOUT;
use crate::ops::pics;
use crate::refresh::owned_demos::{select_licensed_demos, DemoEntry, APP_BATCH_SIZE};

/// `HELPER_TIMEOUT_MS` in `steamInstallApp.ts`.
pub const HELPER_TIMEOUT: Duration = Duration::from_secs(30);
/// stdout above this is not a plausible helper answer (100 000 ids is about 1.1 MB).
const MAX_STDOUT: usize = 4 * 1024 * 1024;
/// Largest app count the helper may report (`GL_OA_MAX_APPS`).
const MAX_APPS: usize = 100_000;
/// Valve SDK test apps every account owns, never shown as games (spike findings,
/// steam-library-ownership item 4). 480 is Spacewar.
const SDK_TEST_APPS: &[u32] = &[480];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FallbackReason {
    NotMacos,
    HelperMissing,
    HelperFailed,
    Timeout,
    NotLoggedOn,
    AccountMismatch,
    AmbiguousSlot,
    Parse,
    /// The anonymous type/name lookup failed.
    PicsFailed,
}

impl FallbackReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotMacos => "not-macos",
            Self::HelperMissing => "helper-missing",
            Self::HelperFailed => "helper-failed",
            Self::Timeout => "timeout",
            Self::NotLoggedOn => "not-logged-on",
            Self::AccountMismatch => "account-mismatch",
            Self::AmbiguousSlot => "ambiguous-slot",
            Self::Parse => "parse",
            Self::PicsFailed => "pics-failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct MacOwned {
    /// `getUserOwnedApps` shape: `{app_count, apps: [{appid, name, ...}]}`, games only.
    pub owned: Value,
    pub demos: Vec<DemoEntry>,
    /// How many apps Steam reported before the type filter.
    pub subscribed_count: usize,
}

impl MacOwned {
    pub fn to_json(&self) -> Value {
        json!({
            "owned": self.owned,
            "demos": self.demos.iter().map(|d| json!({
                "appid": d.appid,
                "name": d.name,
                "playtime_forever": d.playtime_forever,
            })).collect::<Vec<_>>(),
            "subscribedCount": self.subscribed_count,
        })
    }
}

/// Parse the helper's JSON lines. Strict: anything doubtful is a fallback.
pub fn parse_helper_output(stdout: &str, exit: Option<i32>) -> Result<Vec<u32>, FallbackReason> {
    let Some(code) = exit else {
        return Err(FallbackReason::Timeout);
    };
    let lines: Vec<Value> = stdout
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|l| serde_json::from_str::<Value>(l).ok())
        .collect::<Option<Vec<_>>>()
        .ok_or(FallbackReason::Parse)
        .or_else(|e| if code == 0 { Err(e) } else { Ok(Vec::new()) })?;
    match code {
        0 => {
            let last = lines.last().ok_or(FallbackReason::Parse)?;
            if last.get("ok").and_then(Value::as_bool) != Some(true) {
                return Err(FallbackReason::Parse);
            }
            let count = last
                .get("count")
                .and_then(Value::as_u64)
                .ok_or(FallbackReason::Parse)? as usize;
            let arr = last
                .get("appIds")
                .and_then(Value::as_array)
                .ok_or(FallbackReason::Parse)?;
            if count != arr.len() || count > MAX_APPS {
                return Err(FallbackReason::Parse);
            }
            arr.iter()
                .map(|v| {
                    v.as_u64()
                        .and_then(|n| u32::try_from(n).ok())
                        .filter(|&n| n > 0)
                        .ok_or(FallbackReason::Parse)
                })
                .collect()
        }
        2 => {
            // The guard that failed is the last line carrying a `why`.
            let why = lines
                .iter()
                .rev()
                .find_map(|l| l.get("why").and_then(Value::as_str));
            Err(match why {
                Some("not-logged-on") => FallbackReason::NotLoggedOn,
                Some("account-mismatch") => FallbackReason::AccountMismatch,
                _ => FallbackReason::HelperFailed,
            })
        }
        3 => Err(FallbackReason::AmbiguousSlot),
        _ => Err(FallbackReason::HelperFailed),
    }
}

/// Spawn the helper and return its parsed app ids.
async fn run_helper(
    helper_path: &Path,
    steam_id: u64,
    bound: Duration,
) -> Result<Vec<u32>, FallbackReason> {
    if !helper_path.is_file() {
        return Err(FallbackReason::HelperMissing);
    }
    let child = Command::new(helper_path)
        .args(["--steam-owned-apps", "--expect-steamid"])
        .arg(steam_id.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| FallbackReason::HelperFailed)?;
    // A timeout drops the future, and `kill_on_drop` kills the child.
    let out = match tokio::time::timeout(bound, child.wait_with_output()).await {
        Err(_) => return Err(FallbackReason::Timeout),
        Ok(Err(_)) => return Err(FallbackReason::HelperFailed),
        Ok(Ok(o)) => o,
    };
    if out.stdout.len() > MAX_STDOUT {
        return Err(FallbackReason::Parse);
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    // Killed by a signal (no exit code): the helper's own alarm, read as a timeout.
    parse_helper_output(&stdout, out.status.code())
}

/// Anonymous PICS lookup of every id, merged into one `apps` map.
async fn lookup_apps<B: CmBackend>(
    anon: &AnonHandle<B>,
    ids: &[u32],
) -> Result<Map<String, Value>, FallbackReason> {
    let mut apps = Map::new();
    for batch in ids.chunks(APP_BATCH_SIZE) {
        let batch = batch.to_vec();
        let res = anon
            .run_read("mac-owned", PICS_TIMEOUT, move |c| {
                Box::pin(async move { pics::product_info(c.as_ref(), &batch, &[], true).await })
            })
            .await
            .map_err(|_| FallbackReason::PicsFailed)?;
        if let Some(Value::Object(m)) = res.get("apps") {
            apps.extend(m.clone());
        }
    }
    Ok(apps)
}

fn common_of(apps: &Map<String, Value>, id: u32) -> Option<&Value> {
    apps.get(&id.to_string())?
        .get("appinfo")?
        .get("common")
        .filter(|c| c.is_object())
}

/// Keep `common.type` game, beta or application (case-insensitive; owned betas and applications
/// are in `GetOwnedGames`, DV-79-12) with names; demos by the same rule as the CM path.
fn split_games_and_demos(ids: &[u32], apps: Map<String, Value>) -> (Value, Vec<DemoEntry>) {
    let mut games: Vec<(u32, String)> = Vec::new();
    for &id in ids {
        if SDK_TEST_APPS.contains(&id) {
            continue;
        }
        let Some(common) = common_of(&apps, id) else {
            continue;
        };
        let is_game = common.get("type").and_then(Value::as_str).is_some_and(|t| {
            ["game", "beta", "application"]
                .iter()
                .any(|k| t.eq_ignore_ascii_case(k))
        });
        if !is_game {
            continue;
        }
        let name = common
            .get("name")
            .and_then(Value::as_str)
            .filter(|n| !n.is_empty())
            .map_or_else(|| id.to_string(), str::to_string);
        games.push((id, name));
    }
    games.sort_by_key(|g| g.0);
    games.dedup_by_key(|g| g.0);
    let game_ids: BTreeSet<u32> = games.iter().map(|g| g.0).collect();
    // The set stands in for one package granting every subscribed app; demos not already games.
    let packages = json!({ "0": { "packageinfo": { "appids": ids } } });
    let demos = select_licensed_demos(&game_ids, &[0], &packages, &Value::Object(apps));
    let rows: Vec<Value> = games
        .iter()
        .map(|(id, name)| {
            json!({
                "appid": id,
                "name": name,
                "playtime_forever": 0,
                "rtime_last_played": 0,
            })
        })
        .collect();
    (json!({ "app_count": rows.len(), "apps": rows }), demos)
}

/// The helper, then the anonymous lookup. Bound injectable for tests; the host check is in
/// [`mac_owned_apps`].
pub(crate) async fn mac_owned_apps_bounded<B: CmBackend>(
    anon: &AnonHandle<B>,
    helper_path: &Path,
    steam_id: u64,
    bound: Duration,
) -> Result<MacOwned, FallbackReason> {
    let result: Result<MacOwned, FallbackReason> = async {
        let mut ids = run_helper(helper_path, steam_id, bound).await?;
        ids.sort_unstable();
        ids.dedup();
        let apps = lookup_apps(anon, &ids).await?;
        let (owned, demos) = split_games_and_demos(&ids, apps);
        Ok(MacOwned {
            owned,
            demos,
            subscribed_count: ids.len(),
        })
    }
    .await;
    match &result {
        Ok(m) => {
            let games = m.owned["app_count"].as_u64().unwrap_or(0);
            tracing::info!(
                "mac-owned ok subscribed={} games={games} demos={}",
                m.subscribed_count,
                m.demos.len()
            );
        }
        Err(r) => tracing::info!("mac-owned fallback reason={}", r.as_str()),
    }
    result
}

/// Owned apps from the running Mac Steam client. `Err` is always a reason to use the CM path.
pub async fn mac_owned_apps<B: CmBackend>(
    anon: &AnonHandle<B>,
    helper_path: &Path,
    steam_id: u64,
) -> Result<MacOwned, FallbackReason> {
    if !cfg!(target_os = "macos") {
        tracing::info!(
            "mac-owned fallback reason={}",
            FallbackReason::NotMacos.as_str()
        );
        return Err(FallbackReason::NotMacos);
    }
    mac_owned_apps_bounded(anon, helper_path, steam_id, HELPER_TIMEOUT).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use crate::backend::{PicsAppRaw, PicsRaw};
    use crate::fake::FakeBackend;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::sync::Arc;

    #[cfg(unix)]
    fn stub(dir: &Path, body: &str) -> std::path::PathBuf {
        let p = dir.join("steam-bridge-helper");
        std::fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        p
    }

    #[cfg(unix)] // only the unix-gated helper-stub tests use it
    fn app_raw(rows: &[(u32, &str)]) -> PicsRaw {
        PicsRaw {
            apps: rows
                .iter()
                .map(|&(id, ty)| PicsAppRaw {
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

    fn setup() -> (Arc<FakeBackend>, AnonHandle<FakeBackend>) {
        let b = Arc::new(FakeBackend::new());
        let h = AnonHandle::spawn(b.clone());
        (b, h)
    }

    #[test]
    fn parses_success_and_each_failure_kind() {
        let ok =
            "{\"step\":\"attach\",\"ok\":true}\n{\"ok\":true,\"count\":2,\"appIds\":[10,20]}\n";
        assert_eq!(parse_helper_output(ok, Some(0)), Ok(vec![10, 20]));
        let nl = "{\"step\":\"logon\",\"ok\":false,\"why\":\"not-logged-on\"}\n";
        assert_eq!(
            parse_helper_output(nl, Some(2)),
            Err(FallbackReason::NotLoggedOn)
        );
        let mm =
            "{\"step\":\"account\",\"match\":false}\n{\"ok\":false,\"why\":\"account-mismatch\"}\n";
        assert_eq!(
            parse_helper_output(mm, Some(2)),
            Err(FallbackReason::AccountMismatch)
        );
        let af = "{\"ok\":false,\"why\":\"attach-failed\",\"detail\":\"x\"}\n";
        assert_eq!(
            parse_helper_output(af, Some(2)),
            Err(FallbackReason::HelperFailed)
        );
        assert_eq!(
            parse_helper_output("{\"ok\":false}\n", Some(3)),
            Err(FallbackReason::AmbiguousSlot)
        );
        assert_eq!(
            parse_helper_output("{\"ok\":false}\n", Some(64)),
            Err(FallbackReason::HelperFailed)
        );
        assert_eq!(parse_helper_output(ok, None), Err(FallbackReason::Timeout));
        assert_eq!(
            parse_helper_output("garbage", Some(0)),
            Err(FallbackReason::Parse)
        );
        assert_eq!(parse_helper_output("", Some(0)), Err(FallbackReason::Parse));
    }

    #[test]
    fn rejects_inconsistent_or_malformed_success_lines() {
        for line in [
            "{\"ok\":true,\"count\":3,\"appIds\":[1,2]}",
            "{\"ok\":true,\"count\":1,\"appIds\":[0]}",
            "{\"ok\":true,\"count\":1,\"appIds\":[\"7\"]}",
            "{\"ok\":true,\"count\":1,\"appIds\":[4294967296]}",
            "{\"ok\":true,\"count\":1}",
            "{\"ok\":false,\"count\":0,\"appIds\":[]}",
            "{\"count\":0,\"appIds\":[]}",
        ] {
            assert_eq!(
                parse_helper_output(line, Some(0)),
                Err(FallbackReason::Parse),
                "{line}"
            );
        }
        // an empty library is a valid answer
        assert_eq!(
            parse_helper_output("{\"ok\":true,\"count\":0,\"appIds\":[]}", Some(0)),
            Ok(vec![])
        );
    }

    #[cfg(unix)] // the stub helper is a #!/bin/sh script
    #[tokio::test]
    async fn beta_and_application_types_survive_but_other_types_still_drop() {
        let dir = tempfile::tempdir().unwrap();
        let helper = stub(
            dir.path(),
            "echo '{\"ok\":true,\"count\":6,\"appIds\":[1,2,3,4,5,6]}'",
        );
        let (b, h) = setup();
        b.script(|s| {
            s.pics.queue.push_back(Ok(app_raw(&[
                (1, "Game"),
                (2, "Beta"),
                (3, "application"),
                (4, "DLC"),
                (5, "Music"),
                (6, "Tool"),
            ])))
        });
        let r = mac_owned_apps_bounded(&h, &helper, 76561198000000001, Duration::from_secs(10))
            .await
            .unwrap();
        let ids: Vec<u64> = r.owned["apps"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["appid"].as_u64().unwrap())
            .collect();
        assert_eq!(ids, vec![1, 2, 3]);
    }

    #[test]
    fn sdk_test_app_480_is_dropped_from_games() {
        let mut apps = Map::new();
        for id in [480u32, 100] {
            apps.insert(
                id.to_string(),
                json!({ "appinfo": { "common": { "type": "Game", "name": format!("n{id}") } } }),
            );
        }
        let (owned, _) = split_games_and_demos(&[100, 480], apps);
        let ids: Vec<u64> = owned["apps"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["appid"].as_u64().unwrap())
            .collect();
        assert_eq!(ids, vec![100]);
    }

    #[cfg(unix)] // the stub helper is a #!/bin/sh script
    #[tokio::test]
    async fn keeps_games_with_names_and_selects_demos() {
        let dir = tempfile::tempdir().unwrap();
        let helper = stub(
            dir.path(),
            "echo '{\"step\":\"attach\",\"ok\":true}'\n\
             echo '{\"ok\":true,\"count\":5,\"appIds\":[100,200,300,400,500]}'",
        );
        let (b, h) = setup();
        b.script(|s| {
            s.pics.queue.push_back(Ok(app_raw(&[
                (100, "Game"),
                (200, "game"),
                (300, "DLC"),
                (400, "Demo"),
                (500, "Tool"),
            ])))
        });
        let r = mac_owned_apps_bounded(&h, &helper, 76561198000000001, Duration::from_secs(10))
            .await
            .unwrap();
        assert_eq!(r.subscribed_count, 5);
        let apps = r.owned["apps"].as_array().unwrap();
        assert_eq!(
            apps.iter()
                .map(|a| a["appid"].as_u64().unwrap())
                .collect::<Vec<_>>(),
            vec![100, 200]
        );
        assert_eq!(apps[0]["name"], "n100");
        assert_eq!(r.owned["app_count"], 2);
        assert_eq!(
            r.demos.iter().map(|d| d.appid).collect::<Vec<_>>(),
            vec![400]
        );
        // anonymous only
        assert_eq!(b.script(|s| s.authed.len()), 0);
    }

    #[cfg(unix)] // the stub helper is a #!/bin/sh script
    #[tokio::test]
    async fn a_hung_helper_times_out_and_is_killed() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("alive");
        let helper = stub(
            dir.path(),
            &format!("echo $$ > {}\nexec sleep 40", marker.display()),
        );
        let (_b, h) = setup();
        let start = std::time::Instant::now();
        let r = mac_owned_apps_bounded(&h, &helper, 1, Duration::from_secs(1)).await;
        assert_eq!(r, Err(FallbackReason::Timeout));
        assert!(start.elapsed() < Duration::from_secs(10));
        // the pid file was written by the stub; the process must be gone
        let pid: i32 = std::fs::read_to_string(&marker)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        let mut gone = false;
        for _ in 0..40 {
            // A killed child may linger as a zombie until tokio reaps it: that is dead.
            let stat = std::process::Command::new("ps")
                .args(["-o", "stat=", "-p", &pid.to_string()])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_default();
            let alive = !stat.is_empty() && !stat.starts_with('Z');
            if !alive {
                gone = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(gone, "helper survived the timeout");
    }

    #[cfg(unix)] // the stub helper is a #!/bin/sh script
    #[tokio::test]
    async fn a_missing_helper_and_helper_exit_codes_fall_back() {
        let dir = tempfile::tempdir().unwrap();
        let (_b, h) = setup();
        let missing = dir.path().join("nope");
        assert_eq!(
            mac_owned_apps_bounded(&h, &missing, 1, Duration::from_secs(2)).await,
            Err(FallbackReason::HelperMissing)
        );
        let helper = stub(
            dir.path(),
            "echo '{\"step\":\"account\",\"match\":false}'\n\
             echo '{\"ok\":false,\"why\":\"account-mismatch\"}'\nexit 2",
        );
        assert_eq!(
            mac_owned_apps_bounded(&h, &helper, 1, Duration::from_secs(5)).await,
            Err(FallbackReason::AccountMismatch)
        );
    }

    #[cfg(unix)] // the stub helper is a #!/bin/sh script
    #[tokio::test]
    async fn an_anonymous_lookup_failure_falls_back() {
        let dir = tempfile::tempdir().unwrap();
        let helper = stub(
            dir.path(),
            "echo '{\"ok\":true,\"count\":1,\"appIds\":[100]}'",
        );
        let (b, h) = setup();
        b.script(|s| s.pics.queue.push_back(Err(crate::error::CmError::Timeout)));
        assert_eq!(
            mac_owned_apps_bounded(&h, &helper, 1, Duration::from_secs(5)).await,
            Err(FallbackReason::PicsFailed)
        );
    }

    #[cfg(not(target_os = "macos"))]
    #[tokio::test]
    async fn non_macos_falls_back_without_spawning() {
        let (_b, h) = setup();
        let r = mac_owned_apps(&h, Path::new("/nonexistent"), 1).await;
        assert_eq!(r, Err(FallbackReason::NotMacos));
    }

    #[test]
    fn no_signed_in_session_api_is_referenced() {
        let src = include_str!("macowned.rs");
        let body = src.split("#[cfg(test)]").next().unwrap();
        assert!(!body.contains("SessionHandle"));
        assert!(!body.contains("connect_authed"));
    }
}
