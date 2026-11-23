//! Where a bottle lives and the path rules every marker read shares (ported from
//! `bottlePrimitives.ts`'s `getBottleDir` and `engineSwitch.ts`'s `isInside`).
//!
//! The bottle-name chokepoint (`sanitizeBottleName`, T-17-01) is [`crate::game_engine`]'s one
//! function, re-exported here so the bottle modules name a single place; this crate has exactly one
//! sanitiser, and the shared twin vectors (`bottle_twin.json`) pin it against the TS one (T-87-36).

use std::path::Path;

use crate::jsutil::path_join;

pub use crate::game_engine::sanitize_bottle_name;

/// The Bottles root under the user's home.
pub const BOTTLES_REL: &str = "Library/Application Support/CrossOver/Bottles";

/// `getBottleDir`: `<home>/Library/Application Support/CrossOver/Bottles/<name>`, joined and
/// normalised the way Node's `path.join` does (so `..` in a name climbs, as it did; callers
/// sanitise first).
pub fn bottle_dir(home: &Path, name: &str) -> String {
    path_join(&[&home.to_string_lossy(), BOTTLES_REL, name])
}

/// A name that survives [`sanitize_bottle_name`] unchanged: the only kind that may be turned into a
/// path (`sanitizeBottleName(name) === name`).
pub fn is_clean_bottle_name(name: &str) -> bool {
    sanitize_bottle_name(name).as_deref() == Some(name)
}

/// Node's `path.basename` on POSIX: the last segment, ignoring trailing slashes.
pub fn basename(path: &str) -> &str {
    let trimmed = path.trim_end_matches('/');
    trimmed.rsplit('/').next().unwrap_or("")
}

/// `isInside(root, path)`: `path` is absolute and strictly below `root` (a path equal to the root is
/// not inside it). Both are resolved lexically, as `path.resolve` does, so a `..` cannot slip a path
/// out. A relative segment that merely starts with `..` (a directory named `..x`) is refused too,
/// as the TS `rel.startsWith('..')` test did.
pub fn is_inside(root: &str, path: &str) -> bool {
    if !path.starts_with('/') {
        return false;
    }
    let root = lexical_resolve(root);
    let path = lexical_resolve(path);
    let rest = if root == "/" {
        path.strip_prefix('/')
    } else {
        path.strip_prefix(root.as_str())
            .and_then(|r| r.strip_prefix('/'))
    };
    match rest {
        Some(rel) => !rel.is_empty() && !rel.starts_with(".."),
        None => false,
    }
}

/// `path.resolve` over an absolute path: normalised, no trailing slash. A relative root is made
/// absolute against `/`, which never matches a real tools directory; the callers' roots are
/// absolute by construction.
fn lexical_resolve(path: &str) -> String {
    let joined = path_join(&["/", path]);
    if joined.len() > 1 {
        joined.trim_end_matches('/').to_string()
    } else {
        joined
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bottle_dir_is_under_the_bottles_root_and_joins_like_node() {
        let home = Path::new("/h");
        assert_eq!(
            bottle_dir(home, "GameLib-gog-1"),
            "/h/Library/Application Support/CrossOver/Bottles/GameLib-gog-1"
        );
        // Callers sanitise first: a traversal name climbs, exactly as the TS did.
        assert_eq!(bottle_dir(home, "../.."), "/h/Library/Application Support");
        assert_eq!(
            bottle_dir(home, "."),
            "/h/Library/Application Support/CrossOver/Bottles"
        );
    }

    #[test]
    fn a_clean_name_is_one_the_sanitiser_leaves_alone() {
        assert!(is_clean_bottle_name("GameLib-gog-1"));
        assert!(!is_clean_bottle_name(" padded "));
        assert!(!is_clean_bottle_name("a/b"));
        assert!(!is_clean_bottle_name(""));
        assert!(!is_clean_bottle_name("x\0y"));
    }

    #[test]
    fn inside_means_strictly_below_the_root_after_resolving() {
        let root = "/t/steam-engines";
        assert!(is_inside(root, "/t/steam-engines/a/wineserver"));
        assert!(!is_inside(root, "/t/steam-engines"));
        assert!(!is_inside(root, "/t/steam-engines/"));
        assert!(!is_inside(root, "/t/steam-engines/../x"));
        assert!(!is_inside(root, "/t/steam-engines-evil/x"));
        assert!(!is_inside(root, "/opt/elsewhere/dxvk"));
        assert!(!is_inside(root, "relative/path"));
        assert!(is_inside(root, "/t/steam-engines/a/../b"));
        // `rel.startsWith('..')` also refused a segment that only begins with two dots.
        assert!(!is_inside(root, "/t/steam-engines/..x/y"));
        assert!(is_inside("/", "/x"));
        assert!(!is_inside("/", "/"));
    }

    #[test]
    fn basename_ignores_trailing_slashes() {
        assert_eq!(basename("/a/b/wineserver"), "wineserver");
        assert_eq!(basename("/a/b/wineserver/"), "wineserver");
        assert_eq!(basename("wineserver"), "wineserver");
        assert_eq!(basename("/"), "");
    }
}
