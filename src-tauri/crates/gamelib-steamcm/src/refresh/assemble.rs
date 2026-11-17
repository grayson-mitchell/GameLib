//! Library assembly: Step 3 of `refresh.ts` (`syncOwnedLibrary`) as one pure function (D-12).
//!
//! The install-state maps are inputs. TS builds them through the Phase 63/75 Rust-backed scanners
//! because those need TS-owned config (library folders, bottle settings, restart holds, ready
//! bridge bottles); this module never rescans. The bridge allowlist and `is_mac` are inputs for
//! the same reason. The TS call site still runs `stripToSchema` on receipt (79-31), so only
//! SteamGameInfo members are emitted here.

use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;
use serde_json::{json, Map, Value};

use super::meta_entry::{depot_signal_captured, SteamMetadataEntry};
use super::owned_demos::DemoEntry;

/// One ACF-derived install record, as TS hands it over.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AcfInstall {
    pub install_path: String,
    /// Already formatted by TS `getFileSize`.
    pub install_size: String,
    #[serde(default)]
    pub buildid: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallStateInput {
    #[serde(default)]
    pub native: BTreeMap<u32, AcfInstall>,
    #[serde(default)]
    pub bottle: Option<BTreeMap<u32, AcfInstall>>,
    #[serde(default)]
    pub bridge: Option<BTreeMap<u32, AcfInstall>>,
    /// Apps with an incomplete (bit 4 unset) native ACF on disk.
    #[serde(default)]
    pub incomplete: BTreeSet<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaytimeMode {
    /// Playtime and last-played come from the owned-games rows.
    Fresh,
    /// The Mac Steam path (79-36): values come from the previous library entry and from Mac
    /// Steam's localconfig.vdf; per field the larger wins, because both are monotonic (playtime
    /// only grows, last-played only moves forward), so a CM-sourced value is never lowered and a
    /// fresher local value fills in; else 0 (DV-79-13 closed by quick-261117-q52).
    CarryForward(BTreeMap<u32, gamelib_steamfiles::readers::LocalPlaytime>),
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct OwnedApp {
    pub appid: u32,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub playtime_forever: Option<i64>,
    /// Unix seconds.
    #[serde(default)]
    pub rtime_last_played: Option<i64>,
}

impl OwnedApp {
    /// The rows of a `getUserOwnedApps`-shaped value (`{apps: [...]}`); malformed rows are skipped.
    pub fn from_owned(owned: &Value) -> Vec<OwnedApp> {
        owned
            .get("apps")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|a| serde_json::from_value(a.clone()).ok())
            .collect()
    }
}

impl From<&DemoEntry> for OwnedApp {
    fn from(d: &DemoEntry) -> Self {
        OwnedApp {
            appid: d.appid,
            name: d.name.clone(),
            playtime_forever: Some(d.playtime_forever),
            rtime_last_played: None,
        }
    }
}

pub struct AssembleInput<'a> {
    pub apps: &'a [OwnedApp],
    pub metadata: &'a BTreeMap<String, SteamMetadataEntry>,
    pub install: &'a InstallStateInput,
    /// The previous library (`SteamGameInfo` JSON): source of breadcrumbs and carried playtime.
    pub previous_games: &'a [Value],
    pub bridge_allowlist: &'a BTreeSet<String>,
    pub is_mac: bool,
    pub playtime: &'a PlaytimeMode,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Source {
    Native,
    Bottle,
    Bridge,
}

/// `installPlatformForSource`: a bottle or bridge install is a Windows depot under Wine, never the
/// host platform (Pitfall 3); only a native install consults the host.
fn install_platform(source: Source, is_mac: bool) -> &'static str {
    match source {
        Source::Bottle | Source::Bridge => "Windows",
        Source::Native if is_mac => "Mac",
        Source::Native if cfg!(target_os = "linux") => "linux",
        Source::Native => "Windows",
    }
}

/// `installVersionField`: a null, empty or '0' buildid yields no `version` key at all.
fn version_of(buildid: Option<&str>) -> Option<String> {
    let t = buildid?.trim();
    (!t.is_empty() && t != "0").then(|| t.to_string())
}

/// `isBridgeAuthoritativeForInstallState`. This reads the RAW `platforms_captured` flag and must
/// NOT go through `depot_signal_captured`: it asks the MAC question, and a pre-D-17 residue entry
/// genuinely did capture its mac answer (quick 260816-hdg).
fn bridge_authoritative(
    is_mac: bool,
    allowlist: &BTreeSet<String>,
    app_id: &str,
    meta: Option<&SteamMetadataEntry>,
) -> bool {
    if !is_mac || !allowlist.contains(app_id) {
        return false;
    }
    let Some(m) = meta else { return false };
    m.mac_arch.as_deref() == Some("32")
        || (m.platforms_captured == Some(true) && m.is_mac_native == Some(false))
}

fn str_field<'a>(v: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut cur = v;
    for p in path {
        cur = cur.get(*p)?;
    }
    cur.as_str().filter(|s| !s.is_empty())
}

/// Install-start breadcrumbs of the previous library, by app id. Captured before the library is
/// rebuilt because the ACF scan can never re-derive them (260821-rb5).
fn breadcrumbs(previous: &[Value]) -> BTreeMap<String, (String, String)> {
    let mut out = BTreeMap::new();
    for g in previous {
        let Some(id) = g.get("app_name").and_then(Value::as_str) else {
            continue;
        };
        if let (Some(dir), Some(name)) = (
            str_field(g, &["install", "steamResumeTargetSteamappsDir"]),
            str_field(g, &["install", "steamResumeInstalldir"]),
        ) {
            out.insert(id.to_string(), (dir.to_string(), name.to_string()));
        }
    }
    out
}

fn previous_extra_number(previous: &[Value], app_id: &str, key: &str) -> i64 {
    previous
        .iter()
        .find(|g| g.get("app_name").and_then(Value::as_str) == Some(app_id))
        .and_then(|g| g.get("extra"))
        .and_then(|e| e.get(key))
        .and_then(Value::as_i64)
        .unwrap_or(0)
}

/// Builds one `SteamGameInfo` per owned app.
pub fn assemble_library(input: AssembleInput) -> Vec<Value> {
    let crumbs = breadcrumbs(input.previous_games);
    let mut games = Vec::with_capacity(input.apps.len());
    for app in input.apps {
        let id_str = app.appid.to_string();
        let native = input.install.native.get(&app.appid);
        let bottle = input
            .install
            .bottle
            .as_ref()
            .and_then(|m| m.get(&app.appid));
        let bridge = input
            .install
            .bridge
            .as_ref()
            .and_then(|m| m.get(&app.appid));
        let cached = input.metadata.get(&id_str);

        // D-UAT-24-02: for a bridge-eligible title install-state is authoritative to the bridge
        // bottle ONLY; a native or Phase-17 bottle copy must not shadow it (they would show Play
        // while the bridge bottle lacks the game). Otherwise native wins, then bottle, then bridge.
        let (installed, source) =
            if bridge_authoritative(input.is_mac, input.bridge_allowlist, &id_str, cached) {
                (bridge, Source::Bridge)
            } else if let Some(n) = native {
                (Some(n), Source::Native)
            } else if let Some(b) = bottle {
                (Some(b), Source::Bottle)
            } else {
                (bridge, Source::Bridge)
            };

        let mut g = Map::new();
        g.insert("runner".into(), json!("steam"));
        g.insert("app_name".into(), json!(id_str));
        g.insert("title".into(), json!(app.name));
        // Seed artwork from the metadata cache so previously fetched art survives a resync.
        g.insert(
            "art_cover".into(),
            json!(cached.map_or("", |c| c.art_cover.as_str())),
        );
        g.insert(
            "art_square".into(),
            json!(cached.map_or("", |c| c.art_square.as_str())),
        );
        g.insert(
            "is_mac_native".into(),
            json!(cached.and_then(|c| c.is_mac_native).unwrap_or(false)),
        );
        g.insert(
            "is_linux_native".into(),
            json!(cached.and_then(|c| c.is_linux_native).unwrap_or(false)),
        );
        // D-17: is_windows_native is deliberately NOT defaulted (34.13 review WR-16). It is
        // THREE-valued: absent = "never captured (pre-34.13 entry)", false = "confirmed no
        // Windows depot", only `true` permits offering a Windows install. Defaulting absent to
        // false would destroy the first state at the GameInfo boundary.
        if let Some(w) = cached.and_then(|c| c.is_windows_native) {
            g.insert("is_windows_native".into(), json!(w));
        }
        if let Some(m) = cached.and_then(|c| c.metacritic_score) {
            g.insert("metacritic_score".into(), json!(m));
        }
        // GAP-B: seed the persisted delisted verdict so it survives a resync.
        g.insert(
            "is_delisted".into(),
            json!(cached.and_then(|c| c.is_delisted).unwrap_or(false)),
        );
        // CR-01: the default MUST be 'unknown', never '32': a missing or blank cache can never be
        // coerced into a 32-bit verdict (T-18-05-02, the false-flag-safe invariant from MAC32-01).
        g.insert(
            "mac_arch".into(),
            json!(cached
                .and_then(|c| c.mac_arch.as_deref())
                .unwrap_or("unknown")),
        );
        // Routed through depot_signal_captured (260816-hdg): this seeds the frontend's
        // hasSteamDepotSignalCaptured, which asks the DEPOT question, so a pre-D-17 residue entry
        // that flagged the fetch complete without writing the Windows field claims no signal.
        g.insert(
            "steamPlatformsCaptured".into(),
            json!(depot_signal_captured(cached)),
        );
        g.insert("is_installed".into(), json!(installed.is_some()));

        let mut install = Map::new();
        if let Some(i) = installed {
            install.insert("install_path".into(), json!(i.install_path));
            install.insert("install_size".into(), json!(i.install_size));
            // The platform reflects which root actually matched, never hardcoded.
            install.insert(
                "platform".into(),
                json!(install_platform(source, input.is_mac)),
            );
            if let Some(v) = version_of(i.buildid.as_deref()) {
                install.insert("version".into(), json!(v));
            }
        } else if input.install.incomplete.contains(&app.appid) {
            // WR-01 (21-17): no fully-installed manifest but an incomplete native ACF is on disk:
            // durably re-surface "Resume Install". is_installed stays false (Play-safety).
            install.insert("steamResumePending".into(), json!(true));
        }
        // 260821-rb5: re-apply a captured breadcrumb. A game that is now fully installed drops it
        // (the same self-heal rule as init()'s startup self-heal).
        if installed.is_none() {
            if let Some((dir, name)) = crumbs.get(&id_str) {
                install.insert("steamResumePending".into(), json!(true));
                install.insert("steamResumeTargetSteamappsDir".into(), json!(dir));
                install.insert("steamResumeInstalldir".into(), json!(name));
            }
        }
        g.insert("install".into(), Value::Object(install));

        // Cached extra preserves about/genres/art from prior fetches. Playtime and last-played
        // must reflect the latest sync, so they are placed AFTER the spread (fresh wins over stale).
        let mut extra = Map::new();
        extra.insert("reqs".into(), json!([]));
        if let Some(Value::Object(c)) = cached.map(|c| &c.extra) {
            extra.extend(c.clone());
        }
        let (minutes, last_played) = match input.playtime {
            PlaytimeMode::Fresh => (
                app.playtime_forever.unwrap_or(0),
                app.rtime_last_played.unwrap_or(0),
            ),
            PlaytimeMode::CarryForward(local) => {
                let l = local.get(&app.appid);
                (
                    previous_extra_number(input.previous_games, &id_str, "steamPlaytimeMinutes")
                        .max(l.and_then(|l| l.playtime_minutes).unwrap_or(0)),
                    previous_extra_number(input.previous_games, &id_str, "steamLastPlayed")
                        .max(l.and_then(|l| l.last_played).unwrap_or(0)),
                )
            }
        };
        extra.insert("steamPlaytimeMinutes".into(), json!(minutes));
        extra.insert("steamLastPlayed".into(), json!(last_played));
        g.insert("extra".into(), Value::Object(extra));

        g.insert("canRunOffline".into(), json!(true));
        g.insert("installable".into(), json!(true));
        g.insert(
            "store_url".into(),
            json!(format!("https://store.steampowered.com/app/{}/", app.appid)),
        );
        games.push(Value::Object(g));
    }
    games
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(id: u32, name: &str, pt: i64, lp: i64) -> OwnedApp {
        OwnedApp {
            appid: id,
            name: name.into(),
            playtime_forever: Some(pt),
            rtime_last_played: Some(lp),
        }
    }

    fn acf(path: &str, build: Option<&str>) -> AcfInstall {
        AcfInstall {
            install_path: path.into(),
            install_size: "1.5 GB".into(),
            buildid: build.map(str::to_string),
        }
    }

    struct Fx {
        apps: Vec<OwnedApp>,
        meta: BTreeMap<String, SteamMetadataEntry>,
        install: InstallStateInput,
        prev: Vec<Value>,
        allow: BTreeSet<String>,
        is_mac: bool,
        mode: PlaytimeMode,
    }

    impl Fx {
        fn new(apps: Vec<OwnedApp>) -> Self {
            Fx {
                apps,
                meta: BTreeMap::new(),
                install: InstallStateInput::default(),
                prev: Vec::new(),
                allow: BTreeSet::new(),
                is_mac: false,
                mode: PlaytimeMode::Fresh,
            }
        }
        fn run(&self) -> Vec<Value> {
            assemble_library(AssembleInput {
                apps: &self.apps,
                metadata: &self.meta,
                install: &self.install,
                previous_games: &self.prev,
                bridge_allowlist: &self.allow,
                is_mac: self.is_mac,
                playtime: &self.mode,
            })
        }
    }

    fn meta(f: impl FnOnce(&mut SteamMetadataEntry)) -> SteamMetadataEntry {
        let mut m = SteamMetadataEntry::blank();
        f(&mut m);
        m
    }

    #[test]
    fn uncached_app_gets_the_documented_defaults() {
        let g = &Fx::new(vec![app(10, "Ten", 5, 99)]).run()[0];
        assert_eq!(g["runner"], "steam");
        assert_eq!(g["app_name"], "10");
        assert_eq!(g["title"], "Ten");
        assert_eq!(g["art_cover"], "");
        assert_eq!(g["art_square"], "");
        assert_eq!(g["is_mac_native"], false);
        assert_eq!(g["is_linux_native"], false);
        assert_eq!(g["is_delisted"], false);
        // 'unknown', never '32'
        assert_eq!(g["mac_arch"], "unknown");
        assert_eq!(g["steamPlatformsCaptured"], false);
        // three-valued: absent, not false
        assert!(g.get("is_windows_native").is_none());
        assert!(g.get("metacritic_score").is_none());
        assert_eq!(g["is_installed"], false);
        assert_eq!(g["install"], json!({}));
        assert_eq!(g["canRunOffline"], true);
        assert_eq!(g["installable"], true);
        assert_eq!(g["store_url"], "https://store.steampowered.com/app/10/");
        assert_eq!(
            g["extra"],
            json!({"reqs": [], "steamPlaytimeMinutes": 5, "steamLastPlayed": 99})
        );
    }

    #[test]
    fn cached_metadata_seeds_art_platforms_and_flags() {
        let mut fx = Fx::new(vec![app(10, "Ten", 0, 0)]);
        fx.meta.insert(
            "10".into(),
            meta(|m| {
                m.art_cover = "c".into();
                m.art_square = "s".into();
                m.is_mac_native = Some(true);
                m.is_linux_native = Some(true);
                m.is_windows_native = Some(false);
                m.metacritic_score = Some(88);
                m.is_delisted = Some(true);
                m.mac_arch = Some("64".into());
                m.platforms_captured = Some(true);
            }),
        );
        let g = &fx.run()[0];
        assert_eq!(g["art_cover"], "c");
        assert_eq!(g["art_square"], "s");
        assert_eq!(g["is_mac_native"], true);
        assert_eq!(g["is_linux_native"], true);
        // confirmed-false survives as false
        assert_eq!(g["is_windows_native"], false);
        assert_eq!(g["metacritic_score"], 88);
        assert_eq!(g["is_delisted"], true);
        assert_eq!(g["mac_arch"], "64");
        assert_eq!(g["steamPlatformsCaptured"], true);
    }

    #[test]
    fn residue_entry_without_windows_field_claims_no_depot_signal() {
        let mut fx = Fx::new(vec![app(10, "Ten", 0, 0)]);
        fx.meta
            .insert("10".into(), meta(|m| m.platforms_captured = Some(true)));
        assert_eq!(fx.run()[0]["steamPlatformsCaptured"], false);
    }

    #[test]
    fn native_wins_over_bottle_wins_over_bridge() {
        let mut fx = Fx::new(vec![
            app(1, "a", 0, 0),
            app(2, "b", 0, 0),
            app(3, "c", 0, 0),
        ]);
        fx.is_mac = true;
        fx.install.native.insert(1, acf("/n/1", Some("11")));
        let mut bottle = BTreeMap::new();
        bottle.insert(1, acf("/b/1", None));
        bottle.insert(2, acf("/b/2", None));
        fx.install.bottle = Some(bottle);
        let mut bridge = BTreeMap::new();
        bridge.insert(1, acf("/g/1", None));
        bridge.insert(2, acf("/g/2", None));
        bridge.insert(3, acf("/g/3", Some("0")));
        fx.install.bridge = Some(bridge);
        let out = fx.run();
        assert_eq!(out[0]["install"]["install_path"], "/n/1");
        assert_eq!(out[0]["install"]["platform"], "Mac");
        assert_eq!(out[0]["install"]["version"], "11");
        assert_eq!(out[0]["install"]["install_size"], "1.5 GB");
        assert_eq!(out[1]["install"]["install_path"], "/b/2");
        assert_eq!(out[1]["install"]["platform"], "Windows");
        assert!(out[1]["install"].get("version").is_none());
        assert_eq!(out[2]["install"]["install_path"], "/g/3");
        assert_eq!(out[2]["install"]["platform"], "Windows");
        // buildid '0' yields no version key
        assert!(out[2]["install"].get("version").is_none());
        assert!(out.iter().all(|g| g["is_installed"] == true));
    }

    #[test]
    fn bridge_authoritative_by_arch_32_ignores_native_and_bottle() {
        let mut fx = Fx::new(vec![app(1, "a", 0, 0)]);
        fx.is_mac = true;
        fx.allow.insert("1".into());
        fx.meta
            .insert("1".into(), meta(|m| m.mac_arch = Some("32".into())));
        fx.install.native.insert(1, acf("/n/1", None));
        fx.install.bottle = Some(BTreeMap::from([(1, acf("/b/1", None))]));
        fx.install.bridge = Some(BTreeMap::from([(1, acf("/g/1", None))]));
        let g = &fx.run()[0];
        assert_eq!(g["install"]["install_path"], "/g/1");
        assert_eq!(g["install"]["platform"], "Windows");
    }

    #[test]
    fn bridge_authoritative_by_captured_non_mac_and_not_installed_when_bridge_lacks_it() {
        let mut fx = Fx::new(vec![app(1, "a", 0, 0)]);
        fx.is_mac = true;
        fx.allow.insert("1".into());
        fx.meta.insert(
            "1".into(),
            meta(|m| {
                m.platforms_captured = Some(true);
                m.is_mac_native = Some(false);
            }),
        );
        // only a native copy exists: it must NOT make the game installed (T-79-124)
        fx.install.native.insert(1, acf("/n/1", None));
        let g = &fx.run()[0];
        assert_eq!(g["is_installed"], false);
        assert_eq!(g["install"], json!({}));
    }

    #[test]
    fn bridge_gate_needs_mac_allowlist_and_a_verdict() {
        let base = |is_mac: bool, allow: bool, m: Option<SteamMetadataEntry>| {
            let mut fx = Fx::new(vec![app(1, "a", 0, 0)]);
            fx.is_mac = is_mac;
            if allow {
                fx.allow.insert("1".into());
            }
            if let Some(m) = m {
                fx.meta.insert("1".into(), m);
            }
            fx.install.native.insert(1, acf("/n/1", None));
            fx.run()[0]["install"]["install_path"].clone()
        };
        let arch32 = || Some(meta(|m| m.mac_arch = Some("32".into())));
        assert_eq!(base(false, true, arch32()), "/n/1");
        assert_eq!(base(true, false, arch32()), "/n/1");
        assert_eq!(base(true, true, None), "/n/1");
        // captured flag alone, without is_mac_native === false, is no verdict
        assert_eq!(
            base(
                true,
                true,
                Some(meta(|m| m.platforms_captured = Some(true)))
            ),
            "/n/1"
        );
    }

    #[test]
    fn incomplete_install_sets_resume_pending_but_not_installed() {
        let mut fx = Fx::new(vec![app(1, "a", 0, 0)]);
        fx.install.incomplete.insert(1);
        let g = &fx.run()[0];
        assert_eq!(g["install"], json!({"steamResumePending": true}));
        assert_eq!(g["is_installed"], false);
    }

    #[test]
    fn breadcrumb_is_reapplied_when_not_installed_and_dropped_when_installed() {
        let prev = vec![
            json!({"app_name": "1", "install": {
                "steamResumeTargetSteamappsDir": "/steamapps",
                "steamResumeInstalldir": "Game"}}),
            json!({"app_name": "2", "install": {
                "steamResumeTargetSteamappsDir": "/steamapps",
                "steamResumeInstalldir": "Other"}}),
            // half a breadcrumb is none
            json!({"app_name": "3", "install": {"steamResumeInstalldir": "x"}}),
        ];
        let mut fx = Fx::new(vec![
            app(1, "a", 0, 0),
            app(2, "b", 0, 0),
            app(3, "c", 0, 0),
        ]);
        fx.prev = prev;
        fx.install.native.insert(2, acf("/n/2", None));
        let out = fx.run();
        assert_eq!(
            out[0]["install"],
            json!({
                "steamResumePending": true,
                "steamResumeTargetSteamappsDir": "/steamapps",
                "steamResumeInstalldir": "Game"
            })
        );
        assert_eq!(out[0]["is_installed"], false);
        assert!(out[1]["install"]
            .get("steamResumeTargetSteamappsDir")
            .is_none());
        assert!(out[1]["install"].get("steamResumePending").is_none());
        assert_eq!(out[2]["install"], json!({}));
    }

    #[test]
    fn fresh_playtime_overrides_cached_extra_but_other_extra_survives() {
        let mut fx = Fx::new(vec![app(1, "a", 70, 1234)]);
        fx.meta.insert(
            "1".into(),
            meta(|m| {
                m.extra = json!({
                    "reqs": [{"x": 1}],
                    "about": "hello",
                    "steamPlaytimeMinutes": 1,
                    "steamLastPlayed": 2
                })
            }),
        );
        let g = &fx.run()[0];
        assert_eq!(
            g["extra"],
            json!({
                "reqs": [{"x": 1}],
                "about": "hello",
                "steamPlaytimeMinutes": 70,
                "steamLastPlayed": 1234
            })
        );
    }

    #[test]
    fn missing_owned_playtime_defaults_to_zero() {
        let fx = Fx::new(vec![OwnedApp {
            appid: 1,
            name: "a".into(),
            playtime_forever: None,
            rtime_last_played: None,
        }]);
        let g = &fx.run()[0];
        assert_eq!(g["extra"]["steamPlaytimeMinutes"], 0);
        assert_eq!(g["extra"]["steamLastPlayed"], 0);
    }

    #[test]
    fn carry_forward_takes_playtime_from_the_previous_entry_else_zero() {
        let mut fx = Fx::new(vec![app(1, "a", 999, 999), app(2, "b", 999, 999)]);
        fx.mode = PlaytimeMode::CarryForward(BTreeMap::new());
        fx.prev = vec![json!({"app_name": "1", "extra": {
            "steamPlaytimeMinutes": 42, "steamLastPlayed": 7}})];
        // cached extra is overridden in carry-forward mode as well
        fx.meta.insert(
            "1".into(),
            meta(|m| m.extra = json!({"reqs": [], "steamPlaytimeMinutes": 5})),
        );
        let out = fx.run();
        assert_eq!(out[0]["extra"]["steamPlaytimeMinutes"], 42);
        assert_eq!(out[0]["extra"]["steamLastPlayed"], 7);
        assert_eq!(out[1]["extra"]["steamPlaytimeMinutes"], 0);
        assert_eq!(out[1]["extra"]["steamLastPlayed"], 0);
    }

    fn local(entries: &[(u32, Option<i64>, Option<i64>)]) -> PlaytimeMode {
        use gamelib_steamfiles::readers::LocalPlaytime;
        PlaytimeMode::CarryForward(
            entries
                .iter()
                .map(|(id, p, l)| {
                    (
                        *id,
                        LocalPlaytime {
                            playtime_minutes: *p,
                            last_played: *l,
                        },
                    )
                })
                .collect(),
        )
    }

    #[test]
    fn carry_forward_takes_the_larger_of_carried_and_local() {
        let mut fx = Fx::new(vec![
            app(1, "a", 0, 0),
            app(2, "b", 0, 0),
            app(3, "c", 0, 0),
            app(4, "d", 0, 0),
            app(5, "e", 0, 0),
        ]);
        fx.mode = local(&[
            (1, Some(100), Some(50)),
            (2, Some(10), Some(3)),
            (3, None, Some(99)),
            (4, Some(8), Some(9)),
        ]);
        fx.prev = ["1", "2", "3"]
            .iter()
            .map(|id| {
                json!({"app_name": id, "extra": {
                    "steamPlaytimeMinutes": 42, "steamLastPlayed": 7}})
            })
            .collect();
        let out = fx.run();
        let pair = |i: usize| {
            (
                out[i]["extra"]["steamPlaytimeMinutes"].as_i64().unwrap(),
                out[i]["extra"]["steamLastPlayed"].as_i64().unwrap(),
            )
        };
        assert_eq!(pair(0), (100, 50)); // local fresher wins
        assert_eq!(pair(1), (42, 7)); // never regresses a carried value
        assert_eq!(pair(2), (42, 99)); // fields merge independently
        assert_eq!(pair(3), (8, 9)); // no prev, local entry
        assert_eq!(pair(4), (0, 0)); // neither
    }

    #[test]
    fn fresh_ignores_local_data_by_construction() {
        let mut fx = Fx::new(vec![app(1, "a", 5, 6)]);
        fx.mode = PlaytimeMode::Fresh;
        let out = fx.run();
        assert_eq!(out[0]["extra"]["steamPlaytimeMinutes"], 5);
    }

    #[test]
    fn install_state_input_deserializes_from_ts_camel_case_json() {
        let i: InstallStateInput = serde_json::from_value(json!({
            "native": {"10": {"installPath": "/p", "installSize": "1 GB", "buildid": "5"}},
            "bottle": null,
            "incomplete": [20]
        }))
        .unwrap();
        assert_eq!(
            i.native[&10],
            AcfInstall {
                install_path: "/p".into(),
                install_size: "1 GB".into(),
                buildid: Some("5".into())
            }
        );
        assert!(i.bottle.is_none() && i.bridge.is_none());
        assert!(i.incomplete.contains(&20));
    }

    #[test]
    fn owned_rows_and_demos_convert_to_owned_apps() {
        let owned = json!({"app_count": 2, "apps": [
            {"appid": 5, "name": "Five", "playtime_forever": 3, "rtime_last_played": 8},
            {"bad": true}
        ]});
        let apps = OwnedApp::from_owned(&owned);
        assert_eq!(apps, vec![app(5, "Five", 3, 8)]);
        let d = DemoEntry {
            appid: 9,
            name: "Nine".into(),
            playtime_forever: 0,
        };
        let o = OwnedApp::from(&d);
        assert_eq!((o.appid, o.playtime_forever), (9, Some(0)));
    }

    #[test]
    fn output_keys_stay_inside_the_steam_game_info_schema() {
        let mut fx = Fx::new(vec![app(1, "a", 1, 1)]);
        fx.install.native.insert(1, acf("/n", Some("3")));
        let g = fx.run().remove(0);
        let allowed = [
            "runner",
            "app_name",
            "title",
            "art_cover",
            "art_square",
            "is_mac_native",
            "is_linux_native",
            "is_windows_native",
            "metacritic_score",
            "is_delisted",
            "mac_arch",
            "steamPlatformsCaptured",
            "is_installed",
            "install",
            "extra",
            "canRunOffline",
            "installable",
            "store_url",
        ];
        for k in g.as_object().unwrap().keys() {
            assert!(allowed.contains(&k.as_str()), "unexpected key {k}");
        }
    }
}
