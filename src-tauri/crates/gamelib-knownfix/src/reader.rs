//! The known-fix readers (88-08, D-03): `src/backend/knownFixes.ts` in Rust.
//!
//! Two tiers, each with its own layer walk:
//!
//! - **Tier 1**, `<appName>-<store>.json`: local (`<appFolder>/fixes/local`) > bundled (the repo's
//!   `public/fixes`) > remote (`<appFolder>/fixes`). The first layer whose file parses to an object wins
//!   whole-file, and every layer is filtered through the 12-key [`TIER1_KNOWN_FIX_KEYS`] allow-list, so a
//!   downloaded file can never carry a tier-2 key into a launch (prohibition 6).
//! - **Tier 2**, `<appName>-<store>.profile.json`: local > bundled only. The remote directory is not in
//!   the walk, so there is no code path that reads a profile from it.
//!
//! `appName` reaches these functions as a free string from the renderer, so a file is opened only after
//! `resolve(dir, name)` is shown to stay inside `dir` (WR-06): a name that escapes (relative `..`, a
//! backslash form on Windows, an absolute path) answers `None` with a fixed warning and nothing is read.
//!
//! Every log line goes through `EngineCtx.log` and carries the app name, the layer label, a key name or
//! a shape description, never a path. The parser message in the malformed-file warning is `serde_json`'s
//! own (line and column), a documented difference from V8's text (`golden/reader/deltas.json`).
//!
//! Recorded quirk, kept as recorded (D-20): the TS `storeMap` has no store word for `sideload`, so three
//! of the four readers look for `<id>-undefined.json` and `readGamelibFixStatus` answers `None` for the
//! same runner. See the todo `2026-11-25-known-fix-readers-read-undefined-store-file-for-sideload`.

use std::path::{Component, Path, PathBuf};

use serde_json::Value;

use crate::ctx::KnownFixCtx;
use crate::jsvalue::JsValue;
use crate::types::{
    FixLayer, KnownFixesInfo, LayeredFix, Runner, DESCRIPTIVE_KEYS, TIER1_KNOWN_FIX_KEYS,
    TIER1_ROUTING_KEYS, TIER2_PROFILE_KEYS,
};

const TIER1_FILE_SUFFIX: &str = ".json";

/// The longest ignored value a warning echoes, in characters. A downloaded file could carry a very long
/// value for a key that is shape-checked; the log line keeps its start.
const ECHO_MAX_CHARS: usize = 200;

/// The store word of a runner's fix file, `storeMap` of `src/common/utils.ts`; `None` for `sideload`.
pub fn store_suffix(runner: Runner) -> Option<&'static str> {
    match runner {
        Runner::Legendary => Some("epic"),
        Runner::Gog => Some("gog"),
        Runner::Nile => Some("amazon"),
        Runner::Steam => Some("steam"),
        Runner::Sideload => None,
    }
}

/// The word the TS puts in the file name: `storeMap[runner]` interpolated, so `undefined` for `sideload`.
fn file_store_word(runner: Runner) -> &'static str {
    store_suffix(runner).unwrap_or("undefined")
}

fn warn(ctx: &KnownFixCtx, line: String) {
    if let Some(log) = ctx.engine.log.as_ref() {
        log.warn(&line);
    }
}

/// `JSON.stringify(value)` for a warning, cut at [`ECHO_MAX_CHARS`] characters.
fn echo(value: &JsValue) -> String {
    let text = value.stringify();
    match text.char_indices().nth(ECHO_MAX_CHARS) {
        Some((cut, _)) => format!("{}...", &text[..cut]),
        None => text,
    }
}

/// `String.prototype.trim` of JavaScript: the WhiteSpace and LineTerminator code points. Not Rust's
/// `trim`, which also removes U+0085 and does not remove U+FEFF.
fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| {
        matches!(
            c,
            '\t' | '\u{b}' | '\u{c}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
                ..='\u{200a}'
                    | '\u{2028}'
                    | '\u{2029}'
                    | '\u{202f}'
                    | '\u{205f}'
                    | '\u{3000}'
                    | '\u{feff}'
                    | '\n'
                    | '\r'
        )
    })
}

/// A path with its `.` and `..` components resolved lexically, as `path.resolve` does: nothing is read
/// from disk and a `..` at the root stays at the root.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                let last_is_name =
                    matches!(out.components().next_back(), Some(Component::Normal(_)));
                if last_is_name {
                    out.pop();
                } else if !out.has_root() {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// `<dir>/<name>` when it stays inside `dir`; `None` when it is `dir` itself, leaves it, or is
/// absolute. The test is the TS one, resolve plus relative: the relative text must not be empty and must
/// not start with `..` (which also refuses a file whose own name starts with two dots).
fn contained(dir: &Path, name: &str) -> Option<PathBuf> {
    let base = normalize(dir);
    let full = normalize(&base.join(name));
    let rest = full.strip_prefix(&base).ok()?;
    let relative: Vec<String> = rest
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    let relative = relative.join("/");
    if relative.is_empty() || relative.starts_with("..") {
        return None;
    }
    Some(full)
}

/// Reads and parses `<dir>/<appName>-<store><suffix>`: `None` for a name that escapes `dir` (warned), a
/// file that is absent (silent), or one that cannot be read or parsed (warned).
fn read_within(
    ctx: &KnownFixCtx,
    dir: &Path,
    app_name: &str,
    runner: Runner,
    suffix: &str,
    layer: FixLayer,
) -> Option<JsValue> {
    let name = format!("{app_name}-{}{suffix}", file_store_word(runner));
    let Some(fix_path) = contained(dir, &name) else {
        warn(
            ctx,
            format!(
                "Known fixes lookup for '{app_name}' resolved outside the known-fixes directory, ignoring."
            ),
        );
        return None;
    };
    if !fix_path.exists() {
        return None;
    }
    // A downloaded file can be malformed or unreadable; either is a warning and a fall-through.
    let parsed = std::fs::read(&fix_path)
        .map_err(|e| e.to_string())
        .and_then(|bytes| {
            JsValue::parse(&String::from_utf8_lossy(&bytes)).map_err(|e| e.to_string())
        });
    match parsed {
        Ok(value) => Some(value),
        Err(message) => {
            warn(
                ctx,
                format!(
                    "Known fixes could not be applied ({} layer), ignoring.\n{message}",
                    layer.as_str()
                ),
            );
            None
        }
    }
}

/// Shape check for a tier-1 `exeOverride`: a non-empty install-relative path with no drive letter, no
/// absolute form (posix or win32), no NUL and no `..` segment. Containment and existence are checked at
/// launch against the real install path.
pub fn is_valid_exe_override_shape(value: &Value) -> bool {
    let Value::String(text) = value else {
        return false;
    };
    if js_trim(text).is_empty() || text.contains('\0') {
        return false;
    }
    if text.starts_with('/') || text.starts_with('\\') {
        return false;
    }
    let mut chars = text.chars();
    if let (Some(first), Some(':')) = (chars.next(), chars.next()) {
        if first.is_ascii_alphabetic() {
            return false;
        }
    }
    !text.split(['/', '\\']).any(|segment| segment == "..")
}

/// True when a tier-1 fix carries at least one routing key and nothing but routing and descriptive
/// keys. A title-only fix is false: a descriptive-only bundled file still shows the GameLib row.
pub fn is_routing_only_tier1_fix(fix: &KnownFixesInfo) -> bool {
    let keys = fix.keys();
    keys.iter().any(|k| TIER1_ROUTING_KEYS.contains(k))
        && keys
            .iter()
            .all(|k| TIER1_ROUTING_KEYS.contains(k) || DESCRIPTIVE_KEYS.contains(k))
}

/// The tier-1 validator: copies only allow-listed keys and shape-checks the five that need it, warning
/// for every key it drops. `None` for a parsed value that is not an object.
pub fn filter_tier1_known_fixes(
    ctx: &KnownFixCtx,
    app_name: &str,
    layer_label: &str,
    parsed: &JsValue,
) -> Option<KnownFixesInfo> {
    let JsValue::Object(entries) = parsed else {
        warn(
            ctx,
            format!(
                "Known fixes for '{app_name}' ({layer_label} layer) is not an object, ignoring."
            ),
        );
        return None;
    };
    let mut out = KnownFixesInfo::default();
    for (key, value) in entries {
        let key = key.as_str();
        if TIER1_KNOWN_FIX_KEYS.contains(&key) {
            // Only the literals the routing and fix logic act on are accepted, so a downloaded file
            // cannot widen what a title is sent to.
            let rejected = match key {
                "macArch" => (!matches!(value, JsValue::String(s) if s == "32"))
                    .then_some("'macArch' accepts only \"32\""),
                "drm" => (!matches!(value, JsValue::String(s) if s == "ceg"))
                    .then_some("'drm' accepts only \"ceg\""),
                "steamGameOverlay" => (!matches!(value, JsValue::String(s) if s == "off"))
                    .then_some("'steamGameOverlay' accepts only \"off\""),
                "launchArgs" => (!matches!(
                    value,
                    JsValue::Array(items) if items.iter().all(|i| matches!(i, JsValue::String(_)))
                ))
                .then_some("'launchArgs' must be an array of strings"),
                "exeOverride" => (!is_valid_exe_override_shape(&value.to_value()))
                    .then_some("'exeOverride' must be a relative path inside the install folder"),
                _ => None,
            };
            if let Some(reason) = rejected {
                warn(
                    ctx,
                    format!(
                        "Known fixes for '{app_name}' ({layer_label} layer): {reason}, ignoring {}.",
                        echo(value)
                    ),
                );
                continue;
            }
            out.set(key, value.to_value());
        } else if TIER2_PROFILE_KEYS.contains(&key) && !DESCRIPTIVE_KEYS.contains(&key) {
            warn(
                ctx,
                format!(
                    "Known fixes for '{app_name}' ({layer_label} layer): '{key}' is a tier-2 key that belongs in '{app_name}-<store>.profile.json', ignoring it here."
                ),
            );
        } else {
            warn(
                ctx,
                format!(
                    "Known fixes for '{app_name}' ({layer_label} layer): '{key}' is not a tier-1 key, ignoring it."
                ),
            );
        }
    }
    Some(out)
}

/// The tier-1 layers in precedence order, each with its directory; the bundled layer is skipped when
/// the shell has none.
fn tier1_layers(ctx: &KnownFixCtx) -> Vec<(FixLayer, &Path)> {
    let mut layers = vec![(FixLayer::Local, ctx.paths.local.as_path())];
    if let Some(bundled) = ctx.paths.bundled.as_deref() {
        layers.push((FixLayer::Bundled, bundled));
    }
    layers.push((FixLayer::Remote, ctx.paths.fixes.as_path()));
    layers
}

/// The first tier-1 layer whose file parses to an object, filtered.
fn walk_tier1(ctx: &KnownFixCtx, app_name: &str, runner: Runner) -> Option<LayeredFix> {
    for (layer, dir) in tier1_layers(ctx) {
        let Some(parsed) = read_within(ctx, dir, app_name, runner, TIER1_FILE_SUFFIX, layer) else {
            continue;
        };
        if let Some(fix) = filter_tier1_known_fixes(ctx, app_name, layer.as_str(), &parsed) {
            return Some(LayeredFix { fix, layer });
        }
    }
    None
}

/// Tier 1: `<appName>-<store>.json`, local > bundled > remote, allow-listed.
pub fn read_known_fixes(
    ctx: &KnownFixCtx,
    app_name: &str,
    runner: Runner,
) -> Option<KnownFixesInfo> {
    walk_tier1(ctx, app_name, runner).map(|found| found.fix)
}

#[cfg(test)]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
    use gamelib_engine::testing::RecordingLog;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use serde_json::json;
    use std::sync::Arc;

    struct Rig {
        home: FakeHome,
        log: Arc<RecordingLog>,
        ctx: KnownFixCtx,
    }

    impl Rig {
        fn new() -> Rig {
            let home = FakeHome::new("knownfix-reader-");
            let root = home.root().to_path_buf();
            let log = Arc::new(RecordingLog::new());
            let engine = EngineCtx::new(
                Arc::new(StoreHost::new()),
                Arc::new(SystemClock),
                Platform::Linux,
                EnginePaths {
                    app_folder: root.join("app"),
                    user_data: root.join("app"),
                    tools_path: root.join("app").join("tools"),
                    user_home: root.join("home"),
                    temp: root.join("temp"),
                },
                Shutdown::new(),
            )
            .with_log(log.clone());
            let ctx = KnownFixCtx::new(
                Arc::new(engine),
                Some(root.join("public").join("fixes")),
                "https://relay.test",
                "1.2.3",
            );
            Rig { home, log, ctx }
        }

        fn seed(&self, path: &Path, text: &str) {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        }

        fn local(&self, file: &str) -> PathBuf {
            self.ctx.paths.local.join(file)
        }

        fn bundled(&self, file: &str) -> PathBuf {
            self.ctx.paths.bundled.clone().unwrap().join(file)
        }

        fn remote(&self, file: &str) -> PathBuf {
            self.ctx.paths.fixes.join(file)
        }
    }

    #[test]
    fn the_local_file_wins_whole_file_and_only_allow_listed_keys_survive() {
        let rig = Rig::new();
        rig.seed(
            &rig.local("1-gog.json"),
            r#"{"title":"local","winetricks":["a"],"registry":[],"nonsense":1}"#,
        );
        rig.seed(&rig.bundled("1-gog.json"), r#"{"title":"bundled"}"#);
        rig.seed(&rig.remote("1-gog.json"), r#"{"title":"remote"}"#);
        let got = read_known_fixes(&rig.ctx, "1", Runner::Gog).unwrap();
        assert_eq!(
            serde_json::to_value(&got).unwrap(),
            json!({"title": "local", "winetricks": ["a"]})
        );
        let lines = rig.log.lines();
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(
            lines[0].1.contains("'registry' is a tier-2 key"),
            "{lines:?}"
        );
        assert!(
            lines[1].1.contains("'nonsense' is not a tier-1 key"),
            "{lines:?}"
        );
    }

    #[test]
    fn a_malformed_local_file_falls_through_to_the_bundled_one_with_one_warning() {
        let rig = Rig::new();
        rig.seed(&rig.local("1-gog.json"), "{ not json");
        rig.seed(&rig.bundled("1-gog.json"), r#"{"title":"bundled"}"#);
        let got = read_known_fixes(&rig.ctx, "1", Runner::Gog).unwrap();
        assert_eq!(got.title, Some(json!("bundled")));
        let lines = rig.log.lines();
        assert_eq!(lines.len(), 1, "{lines:?}");
        assert_eq!(lines[0].0, "warn");
        assert!(
            lines[0]
                .1
                .starts_with("Known fixes could not be applied (local layer), ignoring.\n"),
            "{lines:?}"
        );
        assert!(!lines[0].1.contains(rig.home.root().to_str().unwrap()));
    }

    #[test]
    fn an_absent_file_in_every_layer_is_none_and_silent() {
        let rig = Rig::new();
        assert_eq!(read_known_fixes(&rig.ctx, "nope", Runner::Steam), None);
        assert!(rig.log.lines().is_empty());
    }

    #[test]
    fn a_traversing_app_name_is_refused_with_a_fixed_warning_and_nothing_is_opened() {
        let rig = Rig::new();
        // A file the traversal would land on, in each layer's parent directory.
        rig.seed(
            &rig.ctx.paths.fixes.join("x-gog.json"),
            r#"{"title":"escaped from local"}"#,
        );
        rig.seed(
            &rig.home.root().join("public").join("x-gog.json"),
            r#"{"title":"escaped from bundled"}"#,
        );
        rig.seed(
            &rig.home.root().join("app").join("x-gog.json"),
            r#"{"title":"escaped from remote"}"#,
        );
        for name in ["../x", "../../x", "..\\x", "/abs/x", "a/../../x"] {
            assert_eq!(
                read_known_fixes(&rig.ctx, name, Runner::Gog),
                None,
                "{name}"
            );
        }
        let lines = rig.log.lines();
        assert_eq!(lines.len(), 5 * 3, "one warning per layer per name");
        for (level, line) in &lines {
            assert_eq!(*level, "warn");
            assert!(
                line.starts_with("Known fixes lookup for '")
                    && line.ends_with("' resolved outside the known-fixes directory, ignoring."),
                "{line}"
            );
        }
    }

    #[test]
    fn a_name_that_stays_inside_the_layer_is_read() {
        let rig = Rig::new();
        rig.seed(&rig.local("sub/x-gog.json"), r#"{"title":"inside"}"#);
        let got = read_known_fixes(&rig.ctx, "sub/x", Runner::Gog).unwrap();
        assert_eq!(got.title, Some(json!("inside")));
    }

    #[test]
    fn the_sideload_runner_reads_the_undefined_store_file_as_the_ts_does() {
        let rig = Rig::new();
        rig.seed(&rig.local("app1-undefined.json"), r#"{"title":"sideload"}"#);
        rig.seed(&rig.local("app1-sideload.json"), r#"{"title":"wrong"}"#);
        let got = read_known_fixes(&rig.ctx, "app1", Runner::Sideload).unwrap();
        assert_eq!(got.title, Some(json!("sideload")));
    }

    #[test]
    fn a_non_object_file_warns_and_falls_through() {
        let rig = Rig::new();
        rig.seed(&rig.local("1-steam.json"), "[1,2]");
        rig.seed(&rig.bundled("1-steam.json"), r#"{"title":"b"}"#);
        let got = read_known_fixes(&rig.ctx, "1", Runner::Steam).unwrap();
        assert_eq!(got.title, Some(json!("b")));
        assert_eq!(
            rig.log.lines(),
            vec![(
                "warn",
                "Known fixes for '1' (local layer) is not an object, ignoring.".to_string()
            )]
        );
    }

    #[test]
    fn the_five_shape_checked_keys_drop_a_bad_value_with_its_own_text() {
        let rig = Rig::new();
        rig.seed(
            &rig.local("1-steam.json"),
            r#"{"macArch":"64","drm":"steamstub","steamGameOverlay":"on","launchArgs":["a",1],"exeOverride":"../x.exe","title":"t"}"#,
        );
        let got = read_known_fixes(&rig.ctx, "1", Runner::Steam).unwrap();
        assert_eq!(serde_json::to_value(&got).unwrap(), json!({"title": "t"}));
        let texts: Vec<String> = rig.log.lines().into_iter().map(|(_, t)| t).collect();
        // JS order: insertion order, so the keys appear as written.
        assert_eq!(
            texts,
            vec![
                "Known fixes for '1' (local layer): 'macArch' accepts only \"32\", ignoring \"64\".",
                "Known fixes for '1' (local layer): 'drm' accepts only \"ceg\", ignoring \"steamstub\".",
                "Known fixes for '1' (local layer): 'steamGameOverlay' accepts only \"off\", ignoring \"on\".",
                "Known fixes for '1' (local layer): 'launchArgs' must be an array of strings, ignoring [\"a\",1].",
                "Known fixes for '1' (local layer): 'exeOverride' must be a relative path inside the install folder, ignoring \"../x.exe\".",
            ]
        );
    }

    #[test]
    fn an_ignored_value_is_cut_in_the_warning() {
        let rig = Rig::new();
        let long = "x".repeat(5000);
        rig.seed(
            &rig.local("1-steam.json"),
            &format!(r#"{{"macArch":"{long}"}}"#),
        );
        read_known_fixes(&rig.ctx, "1", Runner::Steam).unwrap();
        let lines = rig.log.lines();
        assert_eq!(lines.len(), 1);
        assert!(lines[0].1.len() < 400, "{}", lines[0].1.len());
        assert!(lines[0].1.ends_with("...."), "{}", lines[0].1);
    }

    #[test]
    fn the_exe_override_shape_matches_the_ts_rules() {
        for (value, want) in [
            (json!("bin/game.exe"), true),
            (json!("bin\\game.exe"), true),
            (json!("game.exe"), true),
            (json!("/abs/game.exe"), false),
            (json!("\\game.exe"), false),
            (json!("C:\\game.exe"), false),
            (json!("C:game.exe"), false),
            (json!("c:/x"), false),
            (json!("\\\\server\\share\\g.exe"), false),
            (json!("../game.exe"), false),
            (json!("bin/../../game.exe"), false),
            (json!("bin\\..\\..\\g.exe"), false),
            (json!(""), false),
            (json!("   "), false),
            (json!("\u{feff}"), false),
            (json!("a\u{0}b"), false),
            (json!(5), false),
            (json!(["x"]), false),
            (json!(null), false),
            (json!("..x/y.exe"), true),
            (json!("é:x"), true),
        ] {
            assert_eq!(is_valid_exe_override_shape(&value), want, "{value}");
        }
    }

    #[test]
    fn routing_only_needs_a_routing_key_and_nothing_else_but_descriptive_ones() {
        let mut fix = KnownFixesInfo::default();
        assert!(!is_routing_only_tier1_fix(&fix));
        fix.set("title", json!("t"));
        assert!(!is_routing_only_tier1_fix(&fix));
        fix.set("macArch", json!("32"));
        assert!(is_routing_only_tier1_fix(&fix));
        fix.set("launchArgs", json!(["-x"]));
        assert!(!is_routing_only_tier1_fix(&fix));
    }

    #[test]
    fn normalize_resolves_dots_and_stays_at_the_root() {
        assert_eq!(
            normalize(Path::new("/a/b/../c/./d")),
            PathBuf::from("/a/c/d")
        );
        assert_eq!(normalize(Path::new("/../..")), PathBuf::from("/"));
        assert_eq!(normalize(Path::new("a/../..")), PathBuf::from(".."));
        assert_eq!(
            contained(Path::new("/d"), "x.json"),
            Some(PathBuf::from("/d/x.json"))
        );
        assert_eq!(
            contained(Path::new("/d"), "../d/x.json"),
            Some(PathBuf::from("/d/x.json"))
        );
        assert_eq!(contained(Path::new("/d"), ""), None);
        assert_eq!(contained(Path::new("/d"), "."), None);
        assert_eq!(contained(Path::new("/d"), "../e/x.json"), None);
        assert_eq!(contained(Path::new("/d"), "..x.json"), None);
        assert_eq!(contained(Path::new("/d"), "/e/x.json"), None);
    }

    #[test]
    fn js_trim_removes_what_javascript_removes() {
        assert_eq!(js_trim("\u{feff} \t\n x \u{a0}\u{2028}"), "x");
        // U+0085 is not JavaScript whitespace.
        assert_eq!(js_trim("\u{85}x\u{85}"), "\u{85}x\u{85}");
    }
}
