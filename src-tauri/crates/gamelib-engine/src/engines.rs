//! The engines a game can run on, read-only (ported from `fallbackEngine.ts`'s
//! `pinnedEnginePaths` / `isPinnedEngineInstalled` and `engineDecision.ts`'s
//! `resolveWineManagerStaging`, and from `wineManagerReleases.ts`): where a pin lives under the tools
//! directory, whether it is installed, and the Wine Manager release list through the StoreHost.
//!
//! Nothing here downloads, extracts or writes: the install half of the fallback engine and the
//! bottle lifecycle port in their own plans.

use std::path::Path;

use gamelib_store::json::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::bottles::{marker, paths, pin_marker};
use crate::ctx::EngineCtx;
use crate::jsutil::{js_truthy, path_join, prop};
use crate::pins::EnginePin;

/// The Wine Manager's store (`<userData>/store/wine-downloader-info.json`) and its one key.
const WINE_MANAGER_STORE: &str = "wine-downloader-info";
const WINE_RELEASES_KEY: &str = "wine-releases";
/// The Wine Manager release type that is a macOS Wine build.
pub const WINE_STAGING_MACOS: &str = "Wine-Staging-macOS";

/// A Wine (and, for a pin, DXVK) a game can run on that is not CrossOver (`NonCrossoverEngine`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NonCrossoverEngine {
    pub wine_bin: String,
    pub wineserver_bin: String,
    pub label: String,
    pub version: String,
    pub dxvk: Option<DxvkBuild>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DxvkBuild {
    pub dir: String,
    pub version: String,
}

/// Where a pin's Wine and DXVK live (`pinnedEnginePaths`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinnedEnginePaths {
    pub wine_dir: String,
    pub wine_bin: String,
    pub wineserver_bin: String,
    pub dxvk_dir: String,
}

/// `<toolsPath>/steam-engines`.
pub fn pinned_engine_root(ctx: &EngineCtx) -> String {
    path_join(&[&ctx.paths.tools_path.to_string_lossy(), "steam-engines"])
}

pub fn pinned_engine_paths(ctx: &EngineCtx, pin: &EnginePin) -> PinnedEnginePaths {
    let root = pinned_engine_root(ctx);
    let wine_dir = path_join(&[&root, &pin.id]);
    let bin_dir = path_join(&[&wine_dir, "Contents", "Resources", "wine", "bin"]);
    PinnedEnginePaths {
        wine_bin: path_join(&[&bin_dir, "wine"]),
        wineserver_bin: path_join(&[&bin_dir, "wineserver"]),
        dxvk_dir: path_join(&[&root, &format!("dxvk-macOS-{}", pin.dxvk.version)]),
        wine_dir,
    }
}

/// Both halves of the pin are on disk and carry the pin's own sha256 (`isPinnedEngineInstalled`).
pub fn is_pinned_engine_installed(ctx: &EngineCtx, pin: &EnginePin) -> bool {
    let paths = pinned_engine_paths(ctx, pin);
    let wine = Path::new(&paths.wine_bin).exists()
        && Path::new(&paths.wineserver_bin).exists()
        && pin_marker::matches(Path::new(&paths.wine_dir), &pin.wine);
    let dxvk = Path::new(&paths.dxvk_dir).join("x32").exists()
        && Path::new(&paths.dxvk_dir).join("x64").exists()
        && pin_marker::matches(Path::new(&paths.dxvk_dir), &pin.dxvk);
    wine && dxvk
}

/// The pin as a launchable engine (`pinEngine`).
pub fn pin_engine(ctx: &EngineCtx, pin: &EnginePin) -> NonCrossoverEngine {
    let paths = pinned_engine_paths(ctx, pin);
    NonCrossoverEngine {
        wine_bin: paths.wine_bin,
        wineserver_bin: paths.wineserver_bin,
        label: pin.label.clone(),
        version: pin.wine.version.clone(),
        dxvk: Some(DxvkBuild {
            dir: paths.dxvk_dir,
            version: pin.dxvk.version.clone(),
        }),
    }
}

/// The installed Wine Manager releases (`store.get('wine-releases', [])`), each kept as the JSON the
/// store holds: a malformed entry stays malformed, the filters below decide. A missing or unreadable
/// store, and a value that is not a list, read as no releases.
pub fn wine_manager_releases(ctx: &EngineCtx) -> Vec<Value> {
    let dir = ctx.paths.user_data.join("store");
    let Ok(store) = ctx.host.open_cache(&dir, WINE_MANAGER_STORE) else {
        return Vec::new();
    };
    match store.get(WINE_RELEASES_KEY) {
        Some(Json::Arr(items)) => items.iter().map(Json::to_value).collect(),
        _ => Vec::new(),
    }
}

/// `r.type === 'Wine-Staging-macOS' && r.isInstalled`: a release the engine layer may offer.
pub fn is_installed_macos_release(release: &Value) -> bool {
    prop(release, "type").and_then(Value::as_str) == Some(WINE_STAGING_MACOS)
        && prop(release, "isInstalled").is_some_and(js_truthy)
}

/// `<installDir>/Contents/Resources/wine/bin`, for a release whose `installDir` is a string.
pub fn release_bin_dir(release: &Value) -> Option<String> {
    let install_dir = prop(release, "installDir")?.as_str()?;
    Some(path_join(&[
        install_dir,
        "Contents",
        "Resources",
        "wine",
        "bin",
    ]))
}

/// `resolveWineManagerStaging`: the installed Wine Manager build `version` as an engine, or `None`
/// when it is a DXMT build, not installed, missing its binaries, or lives outside
/// `<toolsPath>/wine`.
pub fn resolve_wine_manager_staging(ctx: &EngineCtx, version: &str) -> Option<NonCrossoverEngine> {
    if version.ends_with("-DXMT") {
        return None;
    }
    let release = wine_manager_releases(ctx).into_iter().find(|r| {
        is_installed_macos_release(r)
            && prop(r, "version").and_then(Value::as_str) == Some(version)
            && prop(r, "installDir").is_some_and(Value::is_string)
    })?;
    let bin_dir = release_bin_dir(&release)?;
    let wine_bin = path_join(&[&bin_dir, "wine"]);
    let wineserver_bin = path_join(&[&bin_dir, "wineserver"]);
    if !Path::new(&wine_bin).exists() || !Path::new(&wineserver_bin).exists() {
        return None;
    }
    let root = path_join(&[&ctx.paths.tools_path.to_string_lossy(), "wine"]);
    let inside = wine_bin
        .strip_prefix(root.trim_end_matches('/'))
        .is_some_and(|rest| rest.starts_with('/') && rest.len() > 1);
    if !inside {
        return None;
    }
    Some(NonCrossoverEngine {
        wine_bin,
        wineserver_bin,
        label: format!("Wine Manager: {version}"),
        version: version.to_string(),
        dxvk: None,
    })
}

/// `getBottleDir`: `<userHome>/Library/Application Support/CrossOver/Bottles/<bottleName>`.
pub fn bottle_dir(ctx: &EngineCtx, bottle_name: &str) -> String {
    paths::bottle_dir(&ctx.paths.user_home, bottle_name)
}

/// `isBottleProvisioned`: the bottle directory has been created (its `cxbottle.conf` exists). Not
/// "the bottle is ready to use".
pub fn is_bottle_provisioned(ctx: &EngineCtx, bottle_name: &str) -> bool {
    Path::new(&bottle_dir(ctx, bottle_name))
        .join("cxbottle.conf")
        .exists()
}

/// `readBottleEngineMarkerKind`: the read-only view of the bottle's engine marker. `None` for an
/// absent or unreadable marker or an unsafe bottle name; never infers or writes a marker. A
/// crossover marker contradicted by DXVK-macOS in the bottle reads as the pin, as the switch treats
/// it (76 review WR-01). The read rules live in [`crate::bottles::marker`].
pub fn read_bottle_engine_marker_kind(
    ctx: &EngineCtx,
    bottle_name: &str,
) -> Option<crate::offline::MarkerKind> {
    use crate::offline::MarkerKind;

    marker::read_marker_kind_is_crossover(ctx, bottle_name).map(|crossover| {
        if crossover {
            MarkerKind::Crossover
        } else {
            MarkerKind::NonCrossover
        }
    })
}
