//! Wine-version removal (`removeWineVersion` in `src/backend/wine/manager/utils.ts` and its handler):
//! the stored entry's `installDir` is removed and the entry unmarked.
//!
//! The version the caller sends is the only thing read from the caller (D-19, T-87-19): the
//! directory removed is the `installDir` this backend recorded when it installed the version, never
//! the one in the `WineVersionInfo` the renderer sent. The delete goes through `gamelib-safety`, with
//! the install folder that holds the directory (`<tools>/wine`, `<tools>/proton`,
//! `<tools>/game-porting-toolkit` or a Steam `compatibilitytools.d`) as the trust root, so a stored
//! path that is not one directory deep inside one of them, is a link out of it, or cannot be resolved
//! is refused and nothing is removed.

use std::path::{Path, PathBuf};

use gamelib_store::json::Json;

use super::{
    emit_updated, log_error, log_info, log_warn, notify, number, remove_guarded, store, text_of,
    RemoveFailure,
};
use crate::ctx::WineCtx;
use crate::tools::dxmt::{self, WineVersionInfo};

/// The install folder that may hold `dir`, when `dir` is a direct child of one: the three install
/// folders under `<tools>` and any Steam `compatibilitytools.d` (a Proton install can go there).
fn install_root(ctx: &WineCtx, dir: &Path) -> Option<PathBuf> {
    let parent = dir.parent()?;
    let tools = &ctx.engine.paths.tools_path;
    let known = ["wine", "proton", "game-porting-toolkit"]
        .iter()
        .any(|name| parent == tools.join(name));
    let steam = parent
        .file_name()
        .is_some_and(|name| name == "compatibilitytools.d");
    (known || steam).then(|| parent.to_path_buf())
}

/// What DXMT is told about a removed version: the keys of the stored entry it reads.
fn uninstalled_info(entry: &Json) -> WineVersionInfo {
    WineVersionInfo {
        version: text_of(entry, "version").unwrap_or_default().to_string(),
        kind: text_of(entry, "type").unwrap_or_default().to_string(),
        install_dir: text_of(entry, "installDir").map(str::to_string),
        is_installed: true,
    }
}

/// Removes the wine version `version`: `true` once it is unmarked in the store (and its directory,
/// when there was one, removed), `false` when the store has no such entry or the guard refused the
/// stored directory. A directory that the guard allowed but could not delete is logged and the version
/// is still marked as not installed, as the TS did. The `Uninstalled` notification is shown on `true`.
pub async fn remove(ctx: &WineCtx, version: &str) -> bool {
    let store = match store::open(ctx) {
        Ok(store) => store,
        Err(error) => {
            log_error(ctx, &format!("wine removal: store {:?}", error.kind()));
            return false;
        }
    };
    let Some(mut releases) = store::read(&store) else {
        log_error(
            ctx,
            "Couldn't find a wine-releases entry in wine-downloader-info. A release couldn't be removed!",
        );
        return false;
    };
    let Some(index) = releases
        .iter()
        .position(|entry| text_of(entry, "version") == Some(version))
    else {
        log_error(
            ctx,
            &format!("Can't find {version} in wine-downloader-info!"),
        );
        return false;
    };

    // The caller's installDir is untrusted: only the directory this backend recorded is removed.
    let stored_dir = match releases.get(index).and_then(|e| e.get("installDir")) {
        Some(Json::Str(dir)) if !dir.is_empty() => Some(PathBuf::from(dir)),
        _ => None,
    };
    if let Some(dir) = stored_dir.filter(|dir| dir.exists()) {
        let removed = match install_root(ctx, &dir) {
            Some(root) => remove_guarded(ctx, &dir, &root),
            None => Err(RemoveFailure::Refused),
        };
        match removed {
            // The `wineVersionUninstalled` listener (87-31): the TS emitted the event here, with a copy of
            // the stored entry (its `installDir` still set), and DXMT listened. The directory is gone, so
            // a `-DXMT` copy beside it goes too. Only the stored entry is described to DXMT, never the
            // caller's.
            Ok(()) => {
                if let Some(entry) = releases.get(index) {
                    dxmt::on_wine_uninstalled(ctx, &uninstalled_info(entry)).await;
                }
            }
            Err(RemoveFailure::Refused) => {
                log_warn(
                    ctx,
                    &format!("Refused to remove the folder of {version}: not inside a wine install folder"),
                );
                return false;
            }
            Err(RemoveFailure::Failed) => log_warn(
                ctx,
                &format!(
                    "Couldn't remove the folder of {version}! Still mark it as not installed!"
                ),
            ),
        }
    }

    // Update the tool information: keys keep their place, a missing one is added in this order.
    if let Some(Json::Obj(entry)) = releases.get_mut(index) {
        entry.insert_js("isInstalled", Json::Bool(false));
        entry.insert_js("installDir", Json::Str(String::new()));
        entry.insert_js("disksize", number(0));
        entry.insert_js("hasUpdate", Json::Bool(false));
    }
    if let Err(error) = store::write(&store, releases) {
        log_error(ctx, &format!("wine removal: store {:?}", error.kind()));
        return false;
    }
    log_info(
        ctx,
        &format!("Removed wine version {version} successfully."),
    );
    emit_updated(ctx);
    notify(ctx, version, "notify.uninstalled", "Uninstalled");
    true
}

#[cfg(all(test, feature = "testing"))]
mod tests {
    use super::*;
    use crate::manager::testkit::{kit, seed, stored, Kit, WaitsForCancel};
    use serde_json::json;
    use std::fs;
    use std::sync::Arc;

    fn entry(version: &str, install_dir: &Path) -> serde_json::Value {
        json!({
            "version": version, "type": "GE-Proton", "date": "2025-01-01", "download": "",
            "downsize": 1, "disksize": 99, "checksum": "", "release_notes_link": "",
            "isInstalled": true, "hasUpdate": true, "installDir": install_dir.to_str().unwrap(),
        })
    }

    fn setup(install_dir: impl Fn(&Kit) -> PathBuf) -> (Kit, PathBuf) {
        let kit = kit(Arc::new(WaitsForCancel));
        let dir = install_dir(&kit);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("file"), "x").unwrap();
        seed(&kit, &[entry("GE-Proton9-27", &dir)]);
        (kit, dir)
    }

    #[tokio::test]
    async fn a_stored_directory_inside_an_install_folder_is_removed_and_the_entry_unmarked() {
        for folder in ["wine", "proton", "game-porting-toolkit"] {
            let (kit, dir) = setup(|k| {
                k.home
                    .root()
                    .join("tools")
                    .join(folder)
                    .join("GE-Proton9-27")
            });
            assert!(remove(&kit.ctx, "GE-Proton9-27").await, "{folder}");
            assert!(!dir.exists());
            let after = &stored(&kit)[0];
            assert_eq!(after["isInstalled"], json!(false));
            assert_eq!(after["installDir"], json!(""));
            assert_eq!(after["disksize"], json!(0));
            assert_eq!(after["hasUpdate"], json!(false));
        }
    }

    #[tokio::test]
    async fn a_steam_compatibility_tools_directory_is_an_install_folder_too() {
        let (kit, dir) = setup(|k| {
            k.home
                .root()
                .join("steam/compatibilitytools.d/GE-Proton9-27")
        });
        assert!(remove(&kit.ctx, "GE-Proton9-27").await);
        assert!(!dir.exists());
        assert!(dir.parent().unwrap().exists(), "the folder itself stays");
    }

    #[tokio::test]
    async fn a_stored_directory_outside_every_install_folder_is_refused_and_nothing_changes() {
        for place in [
            "precious/project",
            "tools",
            "tools/proton",
            "tools/wine/a/b",
        ] {
            let (kit, dir) = setup(|k| k.home.root().join(place));
            let before = stored(&kit);
            assert!(!remove(&kit.ctx, "GE-Proton9-27").await, "{place}");
            assert_eq!(
                fs::read_to_string(dir.join("file")).unwrap(),
                "x",
                "{place}"
            );
            assert_eq!(stored(&kit), before, "{place}: the entry is untouched");
            assert!(kit.ui.events().is_empty(), "{place}: no notification");
            assert!(kit.emitter.pushed().is_empty(), "{place}: no event");
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_stored_link_is_unlinked_and_what_it_pointed_at_survives() {
        let kit = kit(Arc::new(WaitsForCancel));
        let outside = kit.home.root().join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("keep"), "keep").unwrap();
        let proton = kit.home.root().join("tools/proton");
        fs::create_dir_all(&proton).unwrap();
        let link = proton.join("GE-Proton9-27");
        std::os::unix::fs::symlink(&outside, &link).unwrap();
        seed(&kit, &[entry("GE-Proton9-27", &link)]);
        assert!(remove(&kit.ctx, "GE-Proton9-27").await);
        assert!(link.symlink_metadata().is_err(), "the link is gone");
        assert_eq!(fs::read_to_string(outside.join("keep")).unwrap(), "keep");
    }

    #[tokio::test]
    async fn the_version_must_be_stored_and_the_store_must_have_a_list() {
        let kit = kit(Arc::new(WaitsForCancel));
        // No list at all.
        assert!(!remove(&kit.ctx, "GE-Proton9-27").await);
        // A list without the version.
        seed(
            &kit,
            &[entry(
                "GE-Proton9-0",
                &kit.home.root().join("tools/proton/x"),
            )],
        );
        assert!(!remove(&kit.ctx, "GE-Proton9-27").await);
        assert!(kit.ui.events().is_empty() && kit.emitter.pushed().is_empty());
    }

    #[tokio::test]
    async fn an_entry_whose_directory_is_gone_is_still_unmarked() {
        let (kit, dir) = setup(|k| k.home.root().join("tools/proton/GE-Proton9-27"));
        fs::remove_file(dir.join("file")).unwrap();
        fs::remove_dir(&dir).unwrap();
        assert!(remove(&kit.ctx, "GE-Proton9-27").await);
        assert_eq!(stored(&kit)[0]["isInstalled"], json!(false));
    }
}
