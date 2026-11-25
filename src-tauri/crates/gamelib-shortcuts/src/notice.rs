//! The notification a renderer-path add or remove raises (D-17), as the TS `addShortcut` and
//! `removeShortcut` handlers raised it (`sidecar/shortcutsFlowRegistration.ts`). The text is chosen
//! from what is on the disk AFTER the write, never from the setting alone, and rendered through the shell's
//! catalog with the TS call's own English default.
//!
//! `notify: false` (the store managers' path) raises nothing, as before.

use serde_json::Map;

use crate::ctx::{Platform, ShortcutsCtx};

/// A catalog key and the English default the TS call passed with it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Text {
    pub key: &'static str,
    pub default: &'static str,
}

pub const TITLE: Text = Text {
    key: "box.shortcuts.title",
    default: "Shortcuts",
};
pub const ADDED: Text = Text {
    key: "box.shortcuts.message",
    default: "Shortcuts were created on Desktop and Start Menu",
};
pub const ADDED_MAC: Text = Text {
    key: "box.shortcuts.message-mac",
    default: "Shortcuts were created on the Applications folder",
};
pub const ADDED_MAC_DESKTOP: Text = Text {
    key: "gamelib:box.shortcuts.messageMacDesktop",
    default: "Shortcuts were created in the Applications folder and on the Desktop",
};
pub const ADD_FAILED: Text = Text {
    key: "box.shortcuts.error",
    default: "Shortcuts could not be created. See the log for details.",
};
pub const REMOVED: Text = Text {
    key: "box.shortcuts.message-remove",
    default: "Shortcuts were removed from Desktop and Start Menu",
};
pub const REMOVED_MAC: Text = Text {
    key: "box.shortcuts.message-remove-mac",
    default: "Shortcuts were removed from the Applications folder",
};
pub const REMOVED_MAC_DESKTOP: Text = Text {
    key: "gamelib:box.shortcuts.messageRemoveMacDesktop",
    default: "Shortcuts were removed from the Applications folder and the Desktop",
};
pub const REMOVE_FAILED: Text = Text {
    key: "box.shortcuts.error-remove",
    default: "Shortcuts could not be removed. See the log for details.",
};

/// The body of the add notice. `mac_desktop_wanted` is `addDesktopShortcuts` on macOS (261027-c4g: the
/// Desktop is named iff the Desktop-link setting is on). `exists_after` is the disk re-check; a call that
/// wrote nothing is not a success (`failed` is true when the write threw).
pub fn add_notice(
    platform: Platform,
    mac_desktop_wanted: bool,
    exists_after: bool,
    failed: bool,
) -> Text {
    if failed || !exists_after {
        return ADD_FAILED;
    }
    match (platform, mac_desktop_wanted) {
        (Platform::Mac, true) => ADDED_MAC_DESKTOP,
        (Platform::Mac, false) => ADDED_MAC,
        _ => ADDED,
    }
}

/// The body of the remove notice. `had_desktop_item` is whether a macOS Desktop item was on disk BEFORE the
/// removal (261027-c4g: the toast follows the disk, not the setting). A shortcut still on disk afterwards
/// is the error notice.
pub fn remove_notice(platform: Platform, had_desktop_item: bool, exists_after: bool) -> Text {
    if exists_after {
        return REMOVE_FAILED;
    }
    match (platform, had_desktop_item) {
        (Platform::Mac, true) => REMOVED_MAC_DESKTOP,
        (Platform::Mac, false) => REMOVED_MAC,
        _ => REMOVED,
    }
}

/// `text` rendered through the installed catalog, else its English default.
pub fn render(ctx: &ShortcutsCtx, text: Text) -> String {
    match &ctx.catalog {
        Some(catalog) => catalog.t(text.key, text.default, &Map::new()),
        None => text.default.to_string(),
    }
}

/// Raises `body` under the shared `Shortcuts` title, when the op was asked to notify and a UI is installed.
pub fn raise(ctx: &ShortcutsCtx, notify: bool, body: Text) {
    if !notify {
        return;
    }
    if let Some(ui) = &ctx.ui {
        ui.notify(&render(ctx, TITLE), &render(ctx, body));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_add_notice_follows_the_disk_and_the_platform() {
        assert_eq!(add_notice(Platform::Linux, false, true, false), ADDED);
        assert_eq!(add_notice(Platform::Windows, true, true, false), ADDED);
        assert_eq!(add_notice(Platform::Mac, false, true, false), ADDED_MAC);
        assert_eq!(
            add_notice(Platform::Mac, true, true, false),
            ADDED_MAC_DESKTOP
        );
        // Resolving without writing anything is not a success; neither is a write that threw.
        assert_eq!(add_notice(Platform::Mac, true, false, false), ADD_FAILED);
        assert_eq!(add_notice(Platform::Linux, false, true, true), ADD_FAILED);
    }

    #[test]
    fn the_remove_notice_follows_the_disk_and_the_desktop_snapshot() {
        assert_eq!(remove_notice(Platform::Linux, false, false), REMOVED);
        assert_eq!(remove_notice(Platform::Windows, true, false), REMOVED);
        assert_eq!(remove_notice(Platform::Mac, false, false), REMOVED_MAC);
        assert_eq!(
            remove_notice(Platform::Mac, true, false),
            REMOVED_MAC_DESKTOP
        );
        assert_eq!(remove_notice(Platform::Mac, true, true), REMOVE_FAILED);
        assert_eq!(remove_notice(Platform::Linux, false, true), REMOVE_FAILED);
    }
}
