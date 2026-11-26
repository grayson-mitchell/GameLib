//! The software versions of the system information (`utils/systeminfo/heroicVersion.ts` and
//! `utils/helperBinaries/index.ts`): the app's own version with its release name, and the `--version`
//! answers of the legendary, gogdl, comet and nile runners.
//!
//! The TS asked the three Python runners through their library managers' command runners; here each is one
//! direct `<bin> --version` [`gamelib_core::process::ProcSpec`] through the context's runner (a Helper,
//! D-21), argv only and no shell, bounded at 30 s (comet at 5 s, as the TS). Where the binaries are is a
//! pure rule ([`resolve_runner_bin`], `utils.ts`'s `archSpecificBinary` and `get*Bin`): the user's
//! alternative binary setting, else the bundled one under `public/bin/<arch>/<platform>`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use gamelib_core::process::SpecOutput;
use serde_json::{json, Value};

use super::{is_js_space, is_line_terminator, node_platform, run_probe_bounded, PROBE_TIMEOUT};
use crate::ctx::{InfoCtx, Platform};

/// The bound the TS put on comet's version probe (`COMET_VERSION_TIMEOUT_MS`).
pub const COMET_VERSION_TIMEOUT: Duration = Duration::from_millis(5000);

/// The bound the three Python runners' probes get. The TS had none (the command runner waited for the
/// child); `version-probe-bounded` in golden/sysinfo `deltas.json` records the difference.
pub const RUNNER_VERSION_TIMEOUT: Duration = PROBE_TIMEOUT;

/// The software the information object lists (`softwareInUse`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SoftwareVersions {
    pub heroic_version: String,
    pub legendary_version: String,
    pub gogdl_version: String,
    pub comet_version: String,
    pub nile_version: String,
}

impl SoftwareVersions {
    pub fn to_value(&self) -> Value {
        json!({
            "heroicVersion": self.heroic_version,
            "legendaryVersion": self.legendary_version,
            "gogdlVersion": self.gogdl_version,
            "cometVersion": self.comet_version,
            "nileVersion": self.nile_version,
        })
    }
}

/// Where each runner's binary is, `None` where it could not be resolved (the version then reads
/// `invalid`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunnerBins {
    pub legendary: Option<PathBuf>,
    pub gogdl: Option<PathBuf>,
    pub comet: Option<PathBuf>,
    pub nile: Option<PathBuf>,
}

/// The user's alternative runner binaries (`altLegendaryBin`, `altGogdlBin`, `altCometBin`, `altNileBin`
/// of the global settings), read when a fetch starts: the settings can change between two reads. The shell
/// installs the reader of its engine settings; without one no alternative binary is set.
pub trait RunnerBinSettings: Send + Sync {
    /// The value of the setting `key`, when it is set to a string.
    fn alt_bin(&self, key: &str) -> Option<String>;
}

/// `fixAsarPath`: a path inside an Electron archive is read from its unpacked folder.
pub fn fix_asar_path(origin: &str) -> String {
    if origin.contains("app.asar.unpacked") {
        origin.to_string()
    } else {
        origin.replacen("app.asar", "app.asar.unpacked", 1)
    }
}

/// The runners the macOS bundle ships as PyInstaller `--onedir` trees (`MACOS_ONEDIR_RUNNERS`); comet is a
/// static binary and is never nested.
const MACOS_ONEDIR_RUNNERS: [&str; 3] = ["legendary", "gogdl", "nile"];

/// `splitPathAndName` then `join(dir, bin)`: the path with its directory and name rejoined, which turns
/// `./comet` into `comet` (a bare name, found on the `PATH`).
fn rejoin_alt(alt: &str) -> PathBuf {
    let path = Path::new(alt);
    match (path.parent(), path.file_name()) {
        (Some(dir), Some(name)) if dir == Path::new(".") => PathBuf::from(name),
        (Some(dir), Some(name)) => dir.join(name),
        _ => PathBuf::from(alt),
    }
}

/// `getLegendaryBin`, `getGOGdlBin`, `getCometBin` and `getNileBin` over `archSpecificBinary`: `alt_bin`
/// when it is set (a non-empty setting), else the bundled binary of `name` under `public_dir`, the
/// architecture's own first and the `x64` one (a compatibility layer is assumed) when that does not
/// exist. `platform` is `process.platform` and `arch` `process.arch` (`x64`, `arm64`). `Err` is a fixed
/// text and never a path: the caller shows `invalid`.
pub fn resolve_runner_bin(
    name: &str,
    alt_bin: Option<&str>,
    public_dir: &Path,
    platform: Platform,
    arch: &str,
    exists: &dyn Fn(&Path) -> bool,
) -> Result<PathBuf, String> {
    if let Some(alt) = alt_bin.filter(|alt| !alt.is_empty()) {
        return Ok(rejoin_alt(alt));
    }
    let node = node_platform(platform);
    let onedir = platform == Platform::Mac && MACOS_ONEDIR_RUNNERS.contains(&name);
    let file = if platform == Platform::Windows {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    let segments: Vec<&str> = if onedir {
        vec![&file, &file]
    } else {
        vec![&file]
    };
    let under = |arch: &str| {
        let mut path = public_dir.join("bin").join(arch).join(node);
        for segment in &segments {
            path = path.join(segment);
        }
        path
    };
    let native = under(arch);
    if exists(&native) {
        return Ok(PathBuf::from(fix_asar_path(&native.to_string_lossy())));
    }
    let x64 = under("x64");
    if exists(&x64) {
        return Ok(PathBuf::from(fix_asar_path(&x64.to_string_lossy())));
    }
    if onedir {
        // A checkout that still holds the pre-onedir flat file: say so, not "not found".
        let stale = public_dir.join("bin").join(arch).join("darwin").join(&file);
        if exists(&stale) {
            return Err("runner binary is a stale flat layout".to_string());
        }
    }
    Err("runner binary not found".to_string())
}

/// `process.arch` of the architecture this build runs on.
fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        "x86" => "ia32",
        other => other,
    }
}

/// The four runner binaries of the context: the settings' alternatives, else the bundled ones. A binary
/// that cannot be resolved is `None`, where the TS threw (the version then reads `invalid`; see the
/// summary of 88.1-10).
pub fn resolve_runner_bins(ctx: &InfoCtx) -> RunnerBins {
    let settings = ctx.runner_settings.as_ref();
    let public_dir = ctx.paths.public_dir.as_deref();
    let resolve = |name: &str, key: &str| -> Option<PathBuf> {
        let alt = settings.and_then(|s| s.alt_bin(key));
        match public_dir {
            Some(dir) => {
                resolve_runner_bin(name, alt.as_deref(), dir, ctx.platform, node_arch(), &|p| {
                    p.exists()
                })
                .ok()
            }
            None => alt
                .filter(|alt| !alt.is_empty())
                .map(|alt| rejoin_alt(&alt)),
        }
    };
    RunnerBins {
        legendary: resolve("legendary", "altLegendaryBin"),
        gogdl: resolve("gogdl", "altGogdlBin"),
        comet: resolve("comet", "altCometBin"),
        nile: resolve("nile", "altNileBin"),
    }
}

/// The version name table of the app's `package.json` (`versionNames`), compiled in and parsed once.
const PACKAGE_JSON: &str = include_str!("../../../../../package.json");

fn version_names() -> &'static (String, String) {
    static NAMES: OnceLock<(String, String)> = OnceLock::new();
    NAMES.get_or_init(|| {
        let doc: Value = serde_json::from_str(PACKAGE_JSON).unwrap_or(Value::Null);
        let name = |which: &str| {
            doc["versionNames"][which]
                .as_str()
                .unwrap_or_default()
                .to_string()
        };
        (name("beta"), name("stable"))
    })
}

/// `getHeroicVersion`: the version and its release name, the beta name for an alpha or beta build.
pub fn heroic_version(app_version: &str) -> String {
    let (beta, stable) = version_names();
    let beta_or_alpha = app_version.contains("alpha") || app_version.contains("beta");
    format!(
        "{app_version} {}",
        if beta_or_alpha { beta } else { stable }
    )
}

/// `/"([\d.]*)".*"(.*)"$/m` over legendary's `--version` output, as `<version> <codename>`; `invalid` when
/// nothing matches or either group is empty. A line is matched alone (`.` and `$` stop at a JS line
/// terminator): the first quote pair holding only digits and dots is the version, and the codename is
/// what sits between the last two quotes of the line, which must end with a quote.
pub fn parse_legendary_version(stdout: &str) -> String {
    for line in stdout.split(is_line_terminator) {
        if let Some((version, codename)) = legendary_match(line) {
            if version.is_empty() || codename.is_empty() {
                return "invalid".to_string();
            }
            return format!("{version} {codename}");
        }
    }
    "invalid".to_string()
}

fn legendary_match(line: &str) -> Option<(&str, &str)> {
    if !line.ends_with('"') {
        return None;
    }
    let quotes: Vec<usize> = line.match_indices('"').map(|(at, _)| at).collect();
    let last = quotes.len().checked_sub(1)?;
    // The leftmost opening quote whose next quote closes a digits-and-dots group, with a quote left
    // between the group and the final one for the codename's opening.
    for i in 0..quotes.len().saturating_sub(1) {
        let group = &line[quotes[i] + 1..quotes[i + 1]];
        if !group.chars().all(|c| c.is_ascii_digit() || c == '.') {
            continue;
        }
        if last >= i + 3 {
            let codename = &line[quotes[last - 1] + 1..quotes[last]];
            return Some((group, codename));
        }
    }
    None
}

/// What a runner printed for `--version` when it ran and succeeded; `None` for a program that could not
/// start, a timeout, a cancel or a non-zero exit (the TS runner's `error` and `abort`).
fn successful(out: Option<SpecOutput>) -> Option<String> {
    let out = out?;
    if out.timed_out || out.cancelled || out.code != Some(0) {
        return None;
    }
    Some(out.stdout)
}

async fn run_version(
    ctx: &InfoCtx,
    label: &'static str,
    bin: Option<&Path>,
    timeout: Duration,
) -> Option<SpecOutput> {
    let bin = bin?;
    run_probe_bounded(
        ctx,
        label,
        &bin.to_string_lossy(),
        &["--version"],
        &[],
        true,
        timeout,
    )
    .await
    .ok()
}

/// `getCometVersion`: the output trimmed at its end; a program that cannot start or a timeout is
/// `invalid`, a non-zero exit keeps its output.
async fn comet_version(ctx: &InfoCtx, bin: Option<&Path>) -> String {
    match run_version(
        ctx,
        "info.sysinfo.comet_version",
        bin,
        COMET_VERSION_TIMEOUT,
    )
    .await
    {
        Some(out) if !out.timed_out && !out.cancelled => {
            out.stdout.trim_end_matches(is_js_space).to_string()
        }
        _ => "invalid".to_string(),
    }
}

/// The four version probes of `fetchSystemInfo`, started together in the TS's order (legendary, gogdl,
/// comet, nile), and the app's own version line.
pub async fn runner_versions(ctx: &InfoCtx, bins: &RunnerBins) -> SoftwareVersions {
    let legendary = async {
        let out = run_version(
            ctx,
            "info.sysinfo.legendary_version",
            bins.legendary.as_deref(),
            RUNNER_VERSION_TIMEOUT,
        )
        .await;
        successful(out).map_or_else(
            || "invalid".to_string(),
            |text| parse_legendary_version(&text),
        )
    };
    let gogdl = async {
        let out = run_version(
            ctx,
            "info.sysinfo.gogdl_version",
            bins.gogdl.as_deref(),
            RUNNER_VERSION_TIMEOUT,
        )
        .await;
        successful(out).unwrap_or_else(|| "invalid".to_string())
    };
    let nile = async {
        let out = run_version(
            ctx,
            "info.sysinfo.nile_version",
            bins.nile.as_deref(),
            RUNNER_VERSION_TIMEOUT,
        )
        .await;
        successful(out).unwrap_or_else(|| "invalid".to_string())
    };
    let (legendary_version, gogdl_version, cometv, nile_version) = tokio::join!(
        legendary,
        gogdl,
        comet_version(ctx, bins.comet.as_deref()),
        nile
    );
    SoftwareVersions {
        heroic_version: heroic_version(&ctx.app_version),
        legendary_version,
        gogdl_version,
        comet_version: cometv,
        nile_version,
    }
}

/// A reader of fixed alternatives, for the CLI and tests.
pub struct FixedAltBins(pub Vec<(String, String)>);

impl RunnerBinSettings for FixedAltBins {
    fn alt_bin(&self, key: &str) -> Option<String> {
        self.0
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, value)| value.clone())
    }
}

/// Convenience for the shell: wraps a closure as the settings reader.
pub struct AltBinsFn<F>(pub F);

impl<F> RunnerBinSettings for AltBinsFn<F>
where
    F: Fn(&str) -> Option<String> + Send + Sync,
{
    fn alt_bin(&self, key: &str) -> Option<String> {
        (self.0)(key)
    }
}

/// An `Arc` of the settings reader, the shape the context holds.
pub type SharedAltBins = Arc<dyn RunnerBinSettings>;

#[cfg(test)]
mod tests {
    use super::*;

    fn exists_all(_: &Path) -> bool {
        true
    }

    #[test]
    fn the_app_version_takes_the_beta_name_for_an_alpha_or_a_beta_and_the_stable_one_otherwise() {
        let names = version_names();
        assert_eq!(names.0, "Caesar Clown");
        assert_eq!(names.1, "Hajrudin");
        assert_eq!(heroic_version("2.15.0"), "2.15.0 Hajrudin");
        assert_eq!(
            heroic_version("2.16.0-beta.1"),
            "2.16.0-beta.1 Caesar Clown"
        );
        assert_eq!(
            heroic_version("2.16.0-alpha.2"),
            "2.16.0-alpha.2 Caesar Clown"
        );
    }

    #[test]
    fn legendary_output_is_the_version_and_the_codename_or_invalid() {
        let ok = "legendary version \"0.20.33\", codename \"Undue Alarm\"\n";
        assert_eq!(parse_legendary_version(ok), "0.20.33 Undue Alarm");
        assert_eq!(parse_legendary_version("legendary 0.20.33\n"), "invalid");
        assert_eq!(parse_legendary_version(""), "invalid");
        // The line must end with the codename's closing quote.
        assert_eq!(
            parse_legendary_version("version \"0.20.33\", codename \"Undue Alarm\" x"),
            "invalid"
        );
        // An empty version or codename is a match that reads invalid.
        assert_eq!(
            parse_legendary_version("version \"\", codename \"A\""),
            "invalid"
        );
        assert_eq!(
            parse_legendary_version("version \"1.0\", codename \"\""),
            "invalid"
        );
        // A later line is matched when the first does not match; CRLF ends a line.
        assert_eq!(
            parse_legendary_version("warn\r\nversion \"1.2\", codename \"Fox\"\r\n"),
            "1.2 Fox"
        );
        // A first quote pair that holds letters is skipped for the next one.
        assert_eq!(
            parse_legendary_version("\"abc\" \"1.2\" \"x\" \"Fox\""),
            "1.2 Fox"
        );
    }

    #[test]
    fn an_alternative_binary_wins_and_an_empty_setting_does_not() {
        let public = Path::new("/app/public");
        let alt = resolve_runner_bin(
            "comet",
            Some("/pins/bin/comet"),
            public,
            Platform::Linux,
            "x64",
            &exists_all,
        );
        assert_eq!(alt, Ok(PathBuf::from("/pins/bin/comet")));
        let bundled = resolve_runner_bin(
            "comet",
            Some(""),
            public,
            Platform::Linux,
            "x64",
            &exists_all,
        );
        assert_eq!(
            bundled,
            Ok(PathBuf::from("/app/public/bin/x64/linux/comet"))
        );
        // `./comet` is rejoined to a bare name, as `join(dirname, basename)` does.
        assert_eq!(
            resolve_runner_bin(
                "comet",
                Some("./comet"),
                public,
                Platform::Linux,
                "x64",
                &exists_all
            ),
            Ok(PathBuf::from("comet"))
        );
    }

    #[test]
    fn the_bundled_path_follows_the_platform_arch_and_the_macos_onedir_rule() {
        let public = Path::new("/app/public");
        let get = |name, platform, arch| {
            resolve_runner_bin(name, None, public, platform, arch, &exists_all).unwrap()
        };
        assert_eq!(
            get("legendary", Platform::Mac, "arm64"),
            PathBuf::from("/app/public/bin/arm64/darwin/legendary/legendary")
        );
        // comet is never nested.
        assert_eq!(
            get("comet", Platform::Mac, "arm64"),
            PathBuf::from("/app/public/bin/arm64/darwin/comet")
        );
        assert_eq!(
            get("gogdl", Platform::Windows, "x64"),
            PathBuf::from("/app/public/bin/x64/win32/gogdl.exe")
        );
        assert_eq!(
            get("nile", Platform::Linux, "x64"),
            PathBuf::from("/app/public/bin/x64/linux/nile")
        );
    }

    #[test]
    fn the_arch_binary_falls_back_to_x64_and_a_stale_flat_layout_or_a_missing_one_is_an_error() {
        let public = Path::new("/app/public");
        // By component, not by text: a joined path carries backslashes on Windows.
        let only_x64 = |p: &Path| p.components().any(|c| c.as_os_str() == "x64");
        assert_eq!(
            resolve_runner_bin("nile", None, public, Platform::Linux, "arm64", &only_x64),
            Ok(PathBuf::from("/app/public/bin/x64/linux/nile"))
        );
        let stale = |p: &Path| p == Path::new("/app/public/bin/arm64/darwin/nile");
        assert_eq!(
            resolve_runner_bin("nile", None, public, Platform::Mac, "arm64", &stale),
            Err("runner binary is a stale flat layout".to_string())
        );
        // The stale layout is only a macOS onedir runner's case.
        assert_eq!(
            resolve_runner_bin("comet", None, public, Platform::Mac, "arm64", &stale),
            Err("runner binary not found".to_string())
        );
        assert_eq!(
            resolve_runner_bin("nile", None, public, Platform::Linux, "x64", &|_| false),
            Err("runner binary not found".to_string())
        );
    }

    #[test]
    fn a_bundled_path_inside_the_archive_is_read_from_its_unpacked_folder() {
        assert_eq!(
            fix_asar_path("/app/resources/app.asar/public/bin/x64/linux/comet"),
            "/app/resources/app.asar.unpacked/public/bin/x64/linux/comet"
        );
        assert_eq!(
            fix_asar_path("/app/app.asar.unpacked/public"),
            "/app/app.asar.unpacked/public"
        );
        let found = resolve_runner_bin(
            "comet",
            None,
            Path::new("/r/app.asar/public"),
            Platform::Linux,
            "x64",
            &exists_all,
        );
        assert_eq!(
            found,
            Ok(PathBuf::from(
                "/r/app.asar.unpacked/public/bin/x64/linux/comet"
            ))
        );
    }
}
