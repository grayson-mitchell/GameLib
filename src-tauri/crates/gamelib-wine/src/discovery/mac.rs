//! The macOS wine set (`compatibility_layers.ts` and `GlobalConfig.getMacOsWineSet`). Every function
//! answers an empty list off macOS. Each takes the platform, the tools directory and the user home
//! from the context, and runs `mdfind` and `<wine> --version` through the spawn seam.

use std::collections::HashSet;
use std::path::Path;

use gamelib_engine::ctx::Platform;

use super::{js_template, list_dir, mdfind, plist_text, read_plist, wine_execs, wine_version_line};
use crate::ctx::WineCtx;
use crate::manager::{log_error, log_info};
use crate::wine_cmd::{js_dirname, js_join, WineInstallation, WineKind};

fn on_mac(ctx: &WineCtx) -> bool {
    ctx.engine.platform == Platform::Mac
}

fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// `getMacOsWineSet`: the Game Porting Toolkit, the system GPTK, CrossOver, wine on the Mac, Wineskin
/// and Whisky, in that order. The spawns run one after the other, as the TS awaited them.
pub async fn mac_wine_set(ctx: &WineCtx) -> Vec<WineInstallation> {
    if !on_mac(ctx) {
        return Vec::new();
    }
    let mut set = game_porting_toolkit(ctx);
    set.extend(system_gptk(ctx).await);
    set.extend(crossover(ctx).await);
    set.extend(wine_on_mac(ctx).await);
    set.extend(wineskin(ctx).await);
    set.extend(whisky(ctx));
    set
}

/// `getCrossover`: every CrossOver bundle Spotlight lists, in its order. The bundle needs only its
/// `Info.plist`: one without a `wine` binary is still listed, with an empty `wineserver` (87-08
/// finding 4, pinned by `crossover-app-missing-wine`).
pub async fn crossover(ctx: &WineCtx) -> Vec<WineInstallation> {
    let mut found = Vec::new();
    if !on_mac(ctx) {
        return found;
    }
    let Some(stdout) = mdfind(
        ctx,
        &[
            "kMDItemCFBundleIdentifier",
            "=",
            "com.codeweavers.CrossOver",
        ],
    )
    .await
    else {
        log_info(ctx, "CrossOver not found");
        return found;
    };
    for bundle in stdout.split('\n').filter(|line| !line.is_empty()) {
        let info_path = js_join(&[bundle, "Contents/Info.plist"]);
        if !info_path.exists() {
            continue;
        }
        // D-19: a bundle whose plist cannot be read is skipped; the TS threw out of the rest of the
        // list (and logged "CrossOver not found").
        let Some(info) = read_plist(&info_path) else {
            continue;
        };
        let version = plist_text(&info, "CFBundleShortVersionString");
        let wine_bin = text(&js_join(&[
            bundle,
            "Contents/SharedSupport/CrossOver/bin/wine",
        ]));
        found.push(WineInstallation {
            wineserver: Some(wine_execs(&wine_bin)),
            bin: wine_bin,
            name: format!("CrossOver - {version}"),
            kind: WineKind::Crossover,
            lib: None,
            lib32: None,
        });
    }
    found
}

/// `getWineOnMac`: the bundles in `<tools>/wine`, then the ones Spotlight finds by bundle identifier
/// `*.wine`, each de-duplicated by path. 87-08 finding 7: the directories are the input, not the
/// wine-manager store.
pub async fn wine_on_mac(ctx: &WineCtx) -> Vec<WineInstallation> {
    let mut found = Vec::new();
    if !on_mac(ctx) {
        return found;
    }
    let tools_wine = js_join(&[&text(&ctx.engine.paths.tools_path), "wine"]);

    let mut bundles: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut add = |path: String| {
        if seen.insert(path.clone()) {
            bundles.push(path);
        }
    };
    if tools_wine.exists() {
        for entry in list_dir(&tools_wine) {
            add(text(&js_join(&[&text(&tools_wine), &entry])));
        }
    }
    match mdfind(ctx, &["kMDItemCFBundleIdentifier", "=", "*.wine"]).await {
        Some(stdout) => {
            for line in stdout.split('\n') {
                add(line.to_string());
            }
        }
        None => log_info(ctx, "Spotlight found no system Wine"),
    }

    for bundle in bundles.iter().filter(|b| !b.is_empty()) {
        let info_path = js_join(&[bundle, "Contents/Info.plist"]);
        if !info_path.exists() {
            continue;
        }
        // D-19: an unreadable plist skips the bundle; the TS rejected the whole discovery.
        let Some(info) = read_plist(&info_path) else {
            continue;
        };
        let version = plist_text(&info, "CFBundleShortVersionString");
        let name = plist_text(&info, "CFBundleName");
        let mut wine_bin = text(&js_join(&[bundle, "Contents/Resources/wine/bin/wine64"]));
        if !Path::new(&wine_bin).exists() {
            // Fall back to `wine` when `wine64` is not there.
            wine_bin = text(&js_join(&[bundle, "Contents/Resources/wine/bin/wine"]));
        }
        if Path::new(&wine_bin).exists() {
            let lib = format!("{bundle}/Contents/Resources/wine/lib");
            found.push(WineInstallation {
                wineserver: Some(wine_execs(&wine_bin)),
                lib: Some(lib.clone()),
                lib32: Some(lib),
                bin: wine_bin,
                name: format!("{name} - {version}"),
                kind: WineKind::Wine,
            });
        }
    }
    found
}

/// `getWineskinWine`: each `*.app*` under `<home>/Applications/Wineskin` with a `wine64`, named by
/// the version that binary reports. One that does not report is skipped.
pub async fn wineskin(ctx: &WineCtx) -> Vec<WineInstallation> {
    let mut found = Vec::new();
    if !on_mac(ctx) {
        return found;
    }
    let home = text(&ctx.engine.paths.user_home);
    let root = format!("{home}/Applications/Wineskin");
    if !Path::new(&root).exists() {
        return found;
    }
    for app in list_dir(Path::new(&root)) {
        if !app.contains(".app") {
            continue;
        }
        let support = format!("{root}/{app}/Contents/SharedSupport/wine");
        let wine_bin = format!("{support}/bin/wine64");
        if !Path::new(&wine_bin).exists() {
            continue;
        }
        let Some(version) = wine_version_line(ctx, &wine_bin).await else {
            log_error(ctx, "Error getting the wine version of a Wineskin app");
            continue;
        };
        found.push(WineInstallation {
            wineserver: Some(wine_execs(&wine_bin)),
            lib: Some(format!("{support}/lib")),
            lib32: Some(format!("{support}/lib")),
            name: format!("Wineskin - {version}"),
            kind: WineKind::Wine,
            bin: wine_bin,
        });
    }
    found
}

/// `getGamePortingToolkitWine`: each directory of `<tools>/game-porting-toolkit` that has an
/// `Info.plist` and a `wine64`, named by its directory.
pub fn game_porting_toolkit(ctx: &WineCtx) -> Vec<WineInstallation> {
    let mut found = Vec::new();
    if !on_mac(ctx) {
        return found;
    }
    let root = js_join(&[&text(&ctx.engine.paths.tools_path), "game-porting-toolkit"]);
    if !root.exists() {
        return found;
    }
    let mut seen: HashSet<String> = HashSet::new();
    for entry in list_dir(&root) {
        let bundle = text(&js_join(&[&text(&root), &entry]));
        if !seen.insert(bundle.clone()) {
            continue;
        }
        if !js_join(&[&bundle, "Contents/Info.plist"]).exists() {
            continue;
        }
        let wine_bin = text(&js_join(&[&bundle, "Contents/Resources/wine/bin/wine64"]));
        if !Path::new(&wine_bin).exists() {
            continue;
        }
        let lib = format!("{bundle}/Contents/Resources/wine/lib");
        found.push(WineInstallation {
            wineserver: Some(wine_execs(&wine_bin)),
            lib: Some(lib.clone()),
            lib32: Some(lib),
            name: bundle.rsplit('/').next().unwrap_or_default().to_string(),
            kind: WineKind::Toolkit,
            bin: wine_bin,
        });
    }
    found
}

/// `^(?!.*heroic\/tools).*game-porting-toolkit.*\/wine64$` over one line (a JavaScript `.` does not
/// match a line terminator, so a line holding one never matches).
fn is_system_gptk_line(line: &str) -> bool {
    if line.contains(['\r', '\u{2028}', '\u{2029}']) || line.contains("heroic/tools") {
        return false;
    }
    match line.strip_suffix("/wine64") {
        Some(before) => before.contains("game-porting-toolkit"),
        None => false,
    }
}

/// `getSystemGamePortingToolkitWine`: the first `wine64` Spotlight lists under a `game-porting-toolkit`
/// directory that is not GameLib's own tools (87-08 finding 5: only the first match is tried, so a
/// stale one hides a later one that exists).
pub async fn system_gptk(ctx: &WineCtx) -> Vec<WineInstallation> {
    let mut found = Vec::new();
    if !on_mac(ctx) {
        return found;
    }
    log_info(ctx, "Searching for Gaming Porting Toolkit Wine");
    // A failed Spotlight query finds nothing.
    let stdout = mdfind(ctx, &["wine64"]).await.unwrap_or_default();
    let Some(wine_bin) = stdout.split('\n').find(|line| is_system_gptk_line(line)) else {
        return found;
    };
    if !Path::new(wine_bin).exists() {
        return found;
    }
    log_info(ctx, "Found Game Porting Toolkit Wine");
    let Some(version) = wine_version_line(ctx, wine_bin).await else {
        log_error(ctx, "Error getting the wine version of the system GPTK");
        return found;
    };
    let gptk_dir = js_join(&[&js_dirname(wine_bin), ".."]);
    let lib = text(&js_join(&[&text(&gptk_dir), "lib"]));
    found.push(WineInstallation {
        wineserver: Some(wine_execs(wine_bin)),
        name: format!("GPTK System (DX11/DX12 Only) - {version}"),
        kind: WineKind::Toolkit,
        lib: Some(lib.clone()),
        lib32: Some(lib),
        bin: wine_bin.to_string(),
    });
    found
}

/// `getWhisky`: Whisky's bundled wine, when its version plist and `wine64` are both there. A version
/// plist without the `version` dictionary lists nothing.
pub fn whisky(ctx: &WineCtx) -> Vec<WineInstallation> {
    let mut found = Vec::new();
    if !on_mac(ctx) {
        return found;
    }
    let libraries = text(&js_join(&[
        &text(&ctx.engine.paths.user_home),
        "Library/Application Support/com.isaacmarovitz.Whisky/Libraries",
    ]));
    let version_plist = js_join(&[&libraries, "WhiskyWineVersion.plist"]);
    let wine_bin = text(&js_join(&[&libraries, "Wine/bin/wine64"]));
    if !(version_plist.exists() && Path::new(&wine_bin).exists()) {
        return found;
    }
    let Some(info) = read_plist(&version_plist) else {
        log_error(ctx, "Error reading the Whisky version");
        return found;
    };
    let Some(version) = info.get("version").and_then(|v| v.as_dictionary()) else {
        log_error(ctx, "Error reading the Whisky version");
        return found;
    };
    let part = |key: &str| js_template(version.get(key));
    let lib = text(&js_join(&[&libraries, "Wine/lib"]));
    found.push(WineInstallation {
        name: format!(
            "Whisky - {}.{}.{}-{}",
            part("major"),
            part("minor"),
            part("patch"),
            part("build")
        ),
        kind: WineKind::Toolkit,
        lib: Some(lib.clone()),
        lib32: Some(lib),
        wineserver: Some(wine_execs(&wine_bin)),
        bin: wine_bin,
    });
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_system_gptk_line_rule_is_the_ts_regular_expression() {
        let yes = [
            "/Applications/game-porting-toolkit/bin/wine64",
            "/x/game-porting-toolkit/wine64",
            "/opt/homebrew/game-porting-toolkit-1.1/bin/wine64",
        ];
        let no = [
            "",
            "/Applications/wine/bin/wine64",
            "/u/heroic/tools/game-porting-toolkit/bin/wine64",
            "/x/game-porting-toolkit/bin/wine64 ",
            "/x/game-porting-toolkit/bin/wine",
            "game-porting-toolkit/wine64\r",
            "/wine64",
        ];
        for line in yes {
            assert!(is_system_gptk_line(line), "{line}");
        }
        for line in no {
            assert!(!is_system_gptk_line(line), "{line}");
        }
    }
}
