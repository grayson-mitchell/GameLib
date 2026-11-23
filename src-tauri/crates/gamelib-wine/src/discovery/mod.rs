//! Wine discovery (Phase 87, D-22, D-25 (b)): the wines GameLib can offer, ported from
//! `utils/compatibility_layers.ts` and `GlobalConfig.getAlternativeWine` and replayed against the
//! goldens `87-08` recorded from the TS.
//!
//! - [`mac`]: CrossOver (by `mdfind`), wine on the Mac, Wineskin, the Game Porting Toolkit, the system
//!   GPTK and Whisky;
//! - [`linux`]: the Linux set (the tools directory, Lutris, Proton directories, the default wine and
//!   custom paths);
//! - [`custom`]: the `customWinePaths` of `config.json`;
//! - [`default_wine`]: the first `wine` on `PATH`.
//!
//! Crate-only (D-06): ops `wine_discover_alternatives`, `wine_discover_crossover` and
//! `wine_default_wine` exist with no channel, shim or caller; 87-26 serves `getAlternativeWine`
//! natively and deletes the TS functions.
//!
//! The crate reads no environment variable and no profile path of its own. What the TS read from the
//! process or the settings (the home directory, `PATH`, the custom wine paths, whether Valve's Proton
//! is shown, the Steam libraries `libraryfolders.vdf` names) arrives in a [`DiscoveryHost`] the shell
//! builds. Discovery never executes what it finds except `<wine> --version` (argv array, 5 s limit,
//! capped output); a Spotlight query is a short labelled `mdfind` (T-87-24, T-87-25).
//!
//! D-19 deltas from the TS (documented in `golden/discovery/deltas.json`): a directory is listed
//! sorted (the TS listed in filesystem order, which the goldens already pin sorted); a bundle whose
//! plist cannot be read is skipped where the TS threw out of the whole discovery (wine-on-mac) or out
//! of the rest of its list (CrossOver); Windows answers an empty list (the TS ran the Linux set there
//! and created `tools/wine`); a failing release refresh is logged and discovery goes on.

pub mod custom;
pub mod default_wine;
pub mod linux;
pub mod mac;

use std::path::{Path, PathBuf};
use std::time::Duration;

use gamelib_core::process::{ProcSpec, SpecOutput};
use gamelib_engine::ctx::Platform;
use plist::{Dictionary, Value as Plist};
use serde::Deserialize;
use serde_json::Value;

use crate::ctx::WineCtx;
use crate::manager::{log_error, log_info};
use crate::wine_cmd::{js_dirname, js_join, WineInstallation};

/// How long a Spotlight query gets (the TS `MDFIND_TIMEOUT_MS`; a cold index is slow).
pub(crate) const MDFIND_TIMEOUT: Duration = Duration::from_secs(10);
/// How long a `<wine> --version` probe gets (the TS `WINE_VERSION_TIMEOUT_MS`).
pub(crate) const VERSION_TIMEOUT: Duration = Duration::from_secs(5);

/// The directories and files the shell resolves that discovery looks under. The TS read them through
/// `os.homedir()` and `AppPaths`; no test reads a real one (the golden test passes a fake HOME's).
///
/// The TS reads no `/Applications` directory of its own: CrossOver, wine-on-mac and the system GPTK
/// take their bundle paths from `mdfind`, and Wineskin and Whisky live under the user home the
/// context already carries (`ctx.engine.paths.user_home`), so there is no `applications` root.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscoveryRoots {
    /// `os.homedir()`: the Lutris directory (`~/.local/share/lutris`) is under it. It can differ from
    /// `ctx.engine.paths.user_home` (Flatpak).
    pub home: PathBuf,
    /// `config.json`: the custom wine paths are read only when it exists, so a new installation does
    /// not recurse into its own first-run defaults.
    pub config_path: PathBuf,
    /// `/usr/share/steam`, the one absolute path the Linux set reads. `None` leaves it out (a test,
    /// or a system without it).
    #[serde(default)]
    pub system_steam: Option<PathBuf>,
}

/// The two settings discovery reads (`customWinePaths`, `showValveProton`).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscoverySettings {
    #[serde(default)]
    pub custom_wine_paths: Vec<String>,
    #[serde(default)]
    pub show_valve_proton: bool,
}

/// What reading `libraryfolders.vdf` answered (the `gamelib-steamfiles` read the shell makes): the
/// file existed, it parsed, and the library paths it named.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SteamLibraries {
    pub exists: bool,
    pub parsed: bool,
    #[serde(default)]
    pub paths: Vec<String>,
}

/// Everything the TS read from the process, the settings and the Steam files, handed over by the
/// shell. Every field but `roots` is optional on the wire.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscoveryHost {
    pub roots: DiscoveryRoots,
    /// The process `PATH` (`getDefaultWineBinary` scans it). `None`: unset.
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub settings: DiscoverySettings,
    /// The Steam libraries read. `None`, or `null` on the wire: the read failed (the TS then kept only
    /// `/usr/share/steam`).
    #[serde(default)]
    pub steam_libraries: Option<SteamLibraries>,
    /// Whether the custom wine paths are scanned. `getAlternativeWine` defaults to `true`.
    #[serde(default)]
    pub scan_custom: Option<bool>,
}

/// `getAlternativeWine`: the wines installed on this machine, in the TS order (the macOS set on a
/// Mac, the Linux set on Linux, an empty list elsewhere). With no wine releases stored the release
/// list is refreshed first, which pushes `wineVersionsUpdated`.
pub async fn discover_alternatives(ctx: &WineCtx, host: &DiscoveryHost) -> Vec<WineInstallation> {
    refresh_when_empty(ctx).await;
    match ctx.engine.platform {
        Platform::Mac => mac::mac_wine_set(ctx).await,
        Platform::Linux => linux::linux_wine_set(ctx, host, host.scan_custom.unwrap_or(true)).await,
        Platform::Windows => Vec::new(),
    }
}

/// `getCrossover`: the CrossOver installs Spotlight knows, in the order it lists them (macOS only).
pub async fn discover_crossover(ctx: &WineCtx) -> Vec<WineInstallation> {
    mac::crossover(ctx).await
}

/// `if (store.get('wine-releases', []).length === 0) await updateWineVersionInfos(deps, true)`.
async fn refresh_when_empty(ctx: &WineCtx) {
    let stored = match crate::manager::releases::list(ctx) {
        Ok(Value::Array(list)) => list,
        Ok(_) => Vec::new(),
        Err(kind) => {
            log_error(ctx, &format!("wine releases store unreadable: {kind:?}"));
            return;
        }
    };
    if !stored.is_empty() {
        return;
    }
    // The TS awaited this and let a failure reject the whole discovery; a store that cannot be opened
    // is logged here and the discovery of what is on disk goes on (D-19).
    if let Err(error) = crate::manager::releases::update_wine_version_infos(
        ctx,
        true,
        None,
        crate::manager::releases::DEFAULT_COUNT,
    )
    .await
    {
        log_error(ctx, &format!("wine versions refresh failed: {error}"));
    }
}

/// A run that exited 0 on its own (the TS `ok`).
fn ok(output: &SpecOutput) -> bool {
    !output.timed_out && !output.cancelled && output.code == Some(0)
}

/// Runs `mdfind` (the Spotlight CLI) over `argv` and answers its stdout, `None` for a spawn failure,
/// a timeout or a non-zero exit (the TS threw and each caller caught).
pub(crate) async fn mdfind(ctx: &WineCtx, argv: &[&str]) -> Option<String> {
    let mut spec = ProcSpec::new("wine-mdfind", "mdfind");
    spec.argv = argv.iter().map(|a| (*a).to_string()).collect();
    spec.stdin = Some(String::new());
    spec.timeout = Some(MDFIND_TIMEOUT);
    spec.max_buffer = gamelib_core::process::DEFAULT_MAX_BUFFER;
    let output = ctx.proc.run(spec, None).await;
    ok(&output).then_some(output.stdout)
}

/// The first line `<bin> --version` prints, `None` when it did not exit 0 (the TS threw or kept its
/// fallback name). The binary is spawned as an argv array, never through a shell.
pub(crate) async fn wine_version_line(ctx: &WineCtx, bin: &str) -> Option<String> {
    let mut spec = ProcSpec::new("wine-version", bin);
    spec.argv = vec!["--version".to_string()];
    spec.stdin = Some(String::new());
    spec.timeout = Some(VERSION_TIMEOUT);
    let output = ctx.proc.run(spec, None).await;
    if !ok(&output) {
        log_info(ctx, "A wine did not report its version");
        return None;
    }
    Some(
        output
            .stdout
            .split('\n')
            .next()
            .unwrap_or_default()
            .to_string(),
    )
}

/// `getWineExecs`: the `wineserver` beside `wine_bin`, `""` when there is none.
pub(crate) fn wine_execs(wine_bin: &str) -> String {
    let candidate = js_join(&[&js_dirname(wine_bin), "wineserver"]);
    if candidate.exists() {
        candidate.to_string_lossy().into_owned()
    } else {
        String::new()
    }
}

/// `readdirSync`, sorted (D-19: the TS listed in filesystem order). An unreadable directory lists
/// nothing.
pub(crate) fn list_dir(path: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(path) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// The top dictionary of an XML `Info.plist` (the TS `plist` package reads XML only). `None` for a
/// file that is missing, unreadable or not an XML plist dictionary.
pub(crate) fn read_plist(path: &Path) -> Option<Dictionary> {
    let file = std::fs::File::open(path).ok()?;
    match Plist::from_reader_xml(std::io::BufReader::new(file)).ok()? {
        Plist::Dictionary(dict) => Some(dict),
        _ => None,
    }
}

/// `info[key] || ''` as a template-literal part: a string as is, a number as JavaScript prints it,
/// and anything falsy (absent, `false`, `0`, `""`) as `""`.
pub(crate) fn plist_text(info: &Dictionary, key: &str) -> String {
    match info.get(key) {
        Some(value) => {
            let text = js_template(Some(value));
            if matches!(text.as_str(), "false" | "0" | "NaN") {
                String::new()
            } else {
                text
            }
        }
        None => String::new(),
    }
}

/// A plist value as a template literal prints it: `undefined` for an absent one.
pub(crate) fn js_template(value: Option<&Plist>) -> String {
    match value {
        None => "undefined".to_string(),
        Some(Plist::String(s)) => s.clone(),
        Some(Plist::Integer(n)) => n.to_string(),
        Some(Plist::Real(f)) => f.to_string(),
        Some(Plist::Boolean(b)) => b.to_string(),
        Some(_) => "[object Object]".to_string(),
    }
}

#[cfg(all(test, feature = "testing"))]
mod tests {
    use super::*;
    use crate::manager::testkit::{kit, seed, WaitsForCancel};
    use serde_json::json;
    use std::sync::Arc;

    fn host(home: &Path) -> DiscoveryHost {
        DiscoveryHost {
            roots: DiscoveryRoots {
                home: home.to_path_buf(),
                config_path: home.join("config.json"),
                system_steam: None,
            },
            path: None,
            settings: DiscoverySettings::default(),
            steam_libraries: None,
            scan_custom: None,
        }
    }

    #[tokio::test]
    async fn an_empty_release_list_is_refreshed_first_and_pushes_wine_versions_updated() {
        let kit = kit(Arc::new(WaitsForCancel));
        let found = discover_alternatives(&kit.ctx, &host(kit.home.root())).await;
        assert!(found.is_empty());
        // The refresh ran (its feeds failed, so the stored list is empty) and said so.
        let pushed = kit.emitter.pushed();
        assert_eq!(pushed, vec![("wineVersionsUpdated".to_string(), vec![])]);
    }

    #[tokio::test]
    async fn a_stored_release_list_is_not_refreshed() {
        let kit = kit(Arc::new(WaitsForCancel));
        seed(&kit, &[json!({ "version": "stored" })]);
        let _ = discover_alternatives(&kit.ctx, &host(kit.home.root())).await;
        assert!(kit.emitter.pushed().is_empty());
    }

    #[test]
    fn plist_values_print_as_a_template_literal_does() {
        let mut info = Dictionary::new();
        info.insert("s".into(), Plist::String("9.0".into()));
        info.insert("zero".into(), Plist::Integer(0.into()));
        info.insert("n".into(), Plist::Integer(24.into()));
        info.insert("no".into(), Plist::Boolean(false));
        assert_eq!(plist_text(&info, "s"), "9.0");
        assert_eq!(plist_text(&info, "n"), "24");
        assert_eq!(plist_text(&info, "zero"), "");
        assert_eq!(plist_text(&info, "no"), "");
        assert_eq!(plist_text(&info, "absent"), "");
        assert_eq!(js_template(None), "undefined");
    }

    #[test]
    fn a_directory_is_listed_sorted_and_a_missing_one_lists_nothing() {
        let home = gamelib_testutil::FakeHome::new("wine-disc-list-");
        for name in ["b", "a", "C"] {
            std::fs::write(home.root().join(name), "").unwrap();
        }
        assert_eq!(list_dir(home.root()), ["C", "a", "b"]);
        assert!(list_dir(&home.root().join("nope")).is_empty());
    }

    #[test]
    fn the_wine_execs_rule_names_the_sibling_wineserver_or_nothing() {
        let home = gamelib_testutil::FakeHome::new("wine-disc-execs-");
        let bin = home.root().join("w/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("wineserver"), "").unwrap();
        let wine = bin.join("wine").to_string_lossy().into_owned();
        assert_eq!(
            wine_execs(&wine),
            bin.join("wineserver").to_string_lossy().into_owned()
        );
        assert_eq!(wine_execs("/nowhere/bin/wine"), "");
    }
}
