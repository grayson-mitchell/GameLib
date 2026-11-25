//! The overlay env the launcher and the Steam bridge merge into a game's environment (quick 261027-n77,
//! Phase 88 D-03), ported from `src/backend/knownFixOverlays.ts`.
//!
//! A tier-2 profile entry `{ id, target: "gstreamer-plugin-path" }` names an overlay in GameLib's own
//! catalogue (`catalogue.rs`); the verified payload is installed on demand ([`super::install`]) and its
//! plugin directory is appended to `GST_PLUGIN_PATH`. Only darwin with a CrossOver wine. The one resolver
//! ([`resolve_overlay_env`]) serves both callers: the launcher through [`profile_overlay_env`] (base value:
//! the tier-1 env, then the game's own last env option, then the process environment) and the Steam
//! bridge through the `knownfix_resolve_overlay_env` op (the caller computes the base values).
//!
//! Prohibition 3: a game's environment gains or loses nothing relative to the TS. The TS `baseValue`
//! callback is the [`BaseValues`] trait here: a map in the ops, a recording closure in a test. The overlay
//! lookup of a launch is read from the local and bundled layers only (`reader::read_known_fix_profile`).
//!
//! A log line carries the label, the overlay id and a reason, never a URL or a path (prohibition 1). The
//! TS wrote the "skipped" line at debug level; `EngineLog` has no such level, so the line is not written
//! (`golden/overlay_install/deltas.json`).

use std::borrow::Cow;
use std::collections::BTreeMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;

use gamelib_engine::ctx::Platform;
use serde_json::{json, Value};

use super::install::ensure_overlay_installed;
use crate::catalogue::{catalogue, lookup, OverlayCatalogueEntry};
use crate::ctx::KnownFixCtx;
use crate::jsvalue::JsValue;
use crate::reader::read_known_fix_profile;
use crate::registry::{member, redact_urls, shown};
use crate::types::Runner;

/// At most this many `overlays` entries are looked at.
pub const MAX_OVERLAY_ENTRIES: usize = 8;
/// The longest value a "known-fix env applied" line shows, in UTF-16 units.
const MAX_LOGGED_VALUE: usize = 512;
/// The keys an `overlays` entry may carry: an id and a target, nothing that names a URL or a hash.
const ALLOWED_ENTRY_KEYS: [&str; 2] = ["id", "target"];
/// GStreamer reads this one first when it is set, so it shadows `GST_PLUGIN_PATH`.
const SHADOW_KEY: &str = "GST_PLUGIN_PATH_1_0";

/// One `enviromentOptions` entry of a game's settings (the misspelling is the app's).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvOption {
    pub key: String,
    pub value: String,
}

/// One applied variable, as the log line lists it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvLine {
    pub key: String,
    pub value: String,
    pub source: String,
}

/// The value a variable has before an overlay's directory is appended to it (the TS `baseValue`). `Sync`, so a
/// resolver future that holds one can be sent to another thread (the launch prepare step's, 88.1-13).
pub trait BaseValues: Sync {
    fn base_value(&self, key: &str) -> Option<String>;
}

impl BaseValues for BTreeMap<String, String> {
    fn base_value(&self, key: &str) -> Option<String> {
        self.get(key).cloned()
    }
}

impl<F: Fn(&str) -> Option<String> + Sync> BaseValues for F {
    fn base_value(&self, key: &str) -> Option<String> {
        self(key)
    }
}

/// What installs an overlay: [`CtxInstaller`] in the app, a scripted answer in a test. An `Err` is the
/// TS's rejected promise (the real installer never fails, it answers `None`).
pub trait OverlayInstaller: Send + Sync {
    fn ensure<'a>(
        &'a self,
        entry: &'a OverlayCatalogueEntry,
        label: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<PathBuf>, String>> + Send + 'a>>;
}

/// The production installer: [`ensure_overlay_installed`] over a context.
pub struct CtxInstaller<'c>(pub &'c KnownFixCtx);

impl OverlayInstaller for CtxInstaller<'_> {
    fn ensure<'a>(
        &'a self,
        entry: &'a OverlayCatalogueEntry,
        label: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<PathBuf>, String>> + Send + 'a>> {
        Box::pin(async move { Ok(ensure_overlay_installed(self.0, entry, label).await) })
    }
}

fn warn(ctx: &KnownFixCtx, label: &str, text: &str) {
    ctx.log_warn(&format!("{label}: {text}"));
}

/// Validates raw `overlays` entries (`validateOverlayEntries`): never fails, warns once per reject, keeps
/// the catalogue's own entry for each valid one and drops a duplicate. At most
/// [`MAX_OVERLAY_ENTRIES`] entries are considered. `None` (no `overlays` key) is silent.
pub fn validate_overlay_entries(
    ctx: &KnownFixCtx,
    raw: Option<&JsValue>,
    label: &str,
) -> Vec<&'static OverlayCatalogueEntry> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    let JsValue::Array(entries) = raw else {
        warn(ctx, label, "overlays must be an array; ignoring");
        return Vec::new();
    };
    if entries.len() > MAX_OVERLAY_ENTRIES {
        warn(
            ctx,
            label,
            &format!(
                "more than {MAX_OVERLAY_ENTRIES} overlays; only the first {MAX_OVERLAY_ENTRIES} are considered"
            ),
        );
    }
    let mut out: Vec<&'static OverlayCatalogueEntry> = Vec::new();
    for entry in entries.iter().take(MAX_OVERLAY_ENTRIES) {
        let reject = |why: &str| {
            warn(
                ctx,
                label,
                &format!(
                    "overlay entry rejected ({why}): {}",
                    redact_urls(&shown(Some(entry)))
                ),
            );
        };
        let JsValue::Object(keys) = entry else {
            reject("not an object");
            continue;
        };
        let extra: Vec<&str> = keys
            .iter()
            .map(|(k, _)| k.as_str())
            .filter(|k| !ALLOWED_ENTRY_KEYS.contains(k))
            .collect();
        if !extra.is_empty() {
            reject(&format!("unexpected key {}", extra.join(", ")));
            continue;
        }
        let catalogued = match member(entry, "id") {
            Some(JsValue::String(id)) => lookup(id),
            _ => None,
        };
        let Some(catalogued) = catalogued else {
            reject("unknown overlay id");
            continue;
        };
        if !matches!(member(entry, "target"), Some(JsValue::String(t)) if *t == catalogued.target) {
            reject("target does not match the catalogue");
            continue;
        }
        if out.iter().any(|known| known.id == catalogued.id) {
            continue;
        }
        out.push(catalogued);
    }
    out
}

/// `path.resolve` for a POSIX path, lexically: `.` and empty segments dropped, `..` popping one segment,
/// no trailing separator. A relative path stays relative (the overlay's directory is never relative).
fn normalised(p: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    if p.starts_with('/') {
        format!("/{}", parts.join("/"))
    } else {
        parts.join("/")
    }
}

/// Appends `dir` to a `:` list unless it is already there; empty segments are dropped. A segment counts as
/// "already there" only when it is absolute and names the same directory once normalised.
pub fn append_path_list(existing: Option<&str>, dir: &str) -> String {
    let mut parts: Vec<&str> = existing
        .unwrap_or("")
        .split(':')
        .filter(|s| !s.is_empty())
        .collect();
    let want = normalised(dir);
    let has = parts
        .iter()
        .any(|p| p.starts_with('/') && normalised(p) == want);
    if !has {
        parts.push(dir);
    }
    parts.join(":")
}

/// The `enviromentOptions` of a game's settings: the entries that are a string key and a string value.
pub fn env_options_of(settings: &Value) -> Vec<EnvOption> {
    settings
        .get("enviromentOptions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|o| {
            Some(EnvOption {
                key: o.get("key")?.as_str()?.to_string(),
                value: o.get("value")?.as_str()?.to_string(),
            })
        })
        .collect()
}

/// The last matching option wins, as `setupEnvVars` applies them.
pub fn last_env_option<'a>(options: &'a [EnvOption], key: &str) -> Option<&'a str> {
    options
        .iter()
        .rev()
        .find(|o| o.key == key)
        .map(|o| o.value.as_str())
}

/// `value.slice(0, MAX_LOGGED_VALUE)` in UTF-16 units; a character that straddles the cut is dropped.
fn cut_value(value: &str) -> Option<String> {
    if value.encode_utf16().count() <= MAX_LOGGED_VALUE {
        return None;
    }
    let mut units = 0usize;
    let mut out = String::new();
    for c in value.chars() {
        units += c.len_utf16();
        if units > MAX_LOGGED_VALUE {
            break;
        }
        out.push(c);
    }
    Some(out)
}

/// The info line that lists the applied variables, or `None` for none (`formatKnownFixEnvLine`).
pub fn format_known_fix_env_line(entries: &[EnvLine]) -> Option<String> {
    if entries.is_empty() {
        return None;
    }
    let items: Vec<String> = entries
        .iter()
        .map(|e| {
            let v = match cut_value(&e.value) {
                Some(cut) => format!("{cut}..."),
                None => e.value.clone(),
            };
            format!("{}={v} ({})", e.key, e.source)
        })
        .collect();
    Some(format!("known-fix env applied: {}", items.join("; ")))
}

/// Logs [`format_known_fix_env_line`] at info, prefixed with the label, and answers the line.
pub fn log_known_fix_env(ctx: &KnownFixCtx, label: &str, entries: &[EnvLine]) -> Option<String> {
    let line = format_known_fix_env_line(entries)?;
    ctx.log_info(&format!("{label}: {line}"));
    Some(line)
}

/// `settings` with `env` appended to its `enviromentOptions`, the original untouched. With no env the
/// same settings come back (borrowed), as the TS returned the same object.
pub fn with_known_fix_env<'a>(settings: &'a Value, env: &[(String, String)]) -> Cow<'a, Value> {
    if env.is_empty() {
        return Cow::Borrowed(settings);
    }
    let mut options: Vec<Value> = settings
        .get("enviromentOptions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    options.extend(
        env.iter()
            .map(|(key, value)| json!({"key": key, "value": value})),
    );
    let mut out = settings.clone();
    if let Value::Object(map) = &mut out {
        map.insert("enviromentOptions".to_string(), Value::Array(options));
    }
    Cow::Owned(out)
}

fn os_name(platform: Platform) -> &'static str {
    match platform {
        Platform::Mac => "darwin",
        Platform::Linux => "linux",
        Platform::Windows => "win32",
    }
}

/// The env an overlay profile adds to a launch: for each valid overlay that belongs on this OS and wine
/// flavour (darwin and CrossOver), the installed plugin directory appended, once, to the target's env var
/// after its base value. Fail-open: an overlay that is not installed adds nothing, and an installer that
/// fails empties the whole answer, as the TS did. `raw` is the profile's `overlays` (`None`: no such key).
pub async fn resolve_overlay_env(
    ctx: &KnownFixCtx,
    raw: Option<&JsValue>,
    label: &str,
    wine_type: Option<&str>,
    base_values: &dyn BaseValues,
    installer: &dyn OverlayInstaller,
) -> BTreeMap<String, String> {
    let mut result: BTreeMap<String, String> = BTreeMap::new();
    let Some(raw) = raw else {
        return result;
    };
    let platform = os_name(ctx.engine.platform);
    let mut warned_shadow = false;
    for entry in validate_overlay_entries(ctx, Some(raw), label) {
        if entry.platform.os != platform || Some(entry.platform.wine.as_str()) != wine_type {
            // The TS logged this at debug level; the engine log has none, so nothing is written.
            continue;
        }
        let dir = match installer.ensure(entry, label).await {
            Ok(Some(dir)) => dir,
            Ok(None) => continue,
            Err(why) => {
                warn(
                    ctx,
                    label,
                    &format!("overlay env failed: Error: {why}; launching without it"),
                );
                return BTreeMap::new();
            }
        };
        let Some(env_key) = catalogue()
            .ok()
            .and_then(|c| c.target_env.get(&entry.target))
        else {
            continue;
        };
        let existing = result
            .get(env_key)
            .cloned()
            .or_else(|| base_values.base_value(env_key));
        let plugin_dir = dir.join(&entry.plugin_subdir);
        result.insert(
            env_key.clone(),
            append_path_list(existing.as_deref(), &plugin_dir.to_string_lossy()),
        );
        if !warned_shadow
            && base_values
                .base_value(SHADOW_KEY)
                .is_some_and(|v| !v.is_empty())
        {
            warned_shadow = true;
            warn(
                ctx,
                label,
                &format!(
                    "{SHADOW_KEY} is set and shadows GST_PLUGIN_PATH, so overlay {} may not be loaded",
                    entry.id
                ),
            );
        }
    }
    result
}

/// [`profile_overlay_env`] with another installer (a test's scripted one).
pub async fn profile_overlay_env_with(
    ctx: &KnownFixCtx,
    app_name: &str,
    runner: Runner,
    game_settings: &Value,
    tier1_env: &BTreeMap<String, String>,
    process_env_base: &BTreeMap<String, String>,
    installer: &dyn OverlayInstaller,
) -> BTreeMap<String, String> {
    let overlays = read_known_fix_profile(ctx, app_name, runner)
        .and_then(|p| p.overlays)
        .map(|v| JsValue::from_value(&v));
    let options = env_options_of(game_settings);
    // Precedence mirrors the runner's command env: tier-1, then the game's own option, then the process.
    let base = |key: &str| -> Option<String> {
        tier1_env
            .get(key)
            .cloned()
            .or_else(|| last_env_option(&options, key).map(str::to_string))
            .or_else(|| process_env_base.get(key).cloned())
    };
    let wine_type = game_settings
        .get("wineVersion")
        .and_then(|w| w.get("type"))
        .and_then(Value::as_str);
    resolve_overlay_env(
        ctx,
        overlays.as_ref(),
        &format!("{} {app_name}", runner.as_str()),
        wine_type,
        &base,
        installer,
    )
    .await
}

/// The overlay env for a non-Steam launch (`knownFixProfileOverlayEnv`): the game's tier-2 profile read
/// from the local and bundled layers, resolved against the base values `tier1_env`, the game's own
/// `enviromentOptions` and `process_env_base` give. May download and install an overlay (up to 120 s).
pub async fn profile_overlay_env(
    ctx: &KnownFixCtx,
    app_name: &str,
    runner: Runner,
    game_settings: &Value,
    tier1_env: &BTreeMap<String, String>,
    process_env_base: &BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    profile_overlay_env_with(
        ctx,
        app_name,
        runner,
        game_settings,
        tier1_env,
        process_env_base,
        &CtxInstaller(ctx),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_url_in_a_rejected_entry_never_reaches_the_log() {
        assert_eq!(
            redact_urls(r#"{"id":"x","url":"https://evil.example/a?k=1&t=2","n":1}"#),
            r#"{"id":"x","url":"<url>","n":1}"#
        );
        assert_eq!(redact_urls("no link here"), "no link here");
        assert_eq!(redact_urls("a ftp://h/p and b://c"), "a <url> and <url>");
        // The 200 unit cut can leave a URL without its closing quote.
        assert_eq!(redact_urls(r#"{"url":"http://h/p"#), r#"{"url":"<url>"#);
    }

    #[test]
    fn append_path_list_matches_the_ts_on_the_shapes_the_goldens_do_not_hold() {
        assert_eq!(append_path_list(Some("/a:/b"), "/c"), "/a:/b:/c");
        assert_eq!(append_path_list(Some("/a/./b/"), "/a/b"), "/a/./b/");
        assert_eq!(append_path_list(Some("rel/d"), "/rel/d"), "rel/d:/rel/d");
        assert_eq!(append_path_list(None, "/d"), "/d");
    }

    #[test]
    fn a_long_value_is_cut_at_512_units_in_the_log_line() {
        let line = format_known_fix_env_line(&[EnvLine {
            key: "K".into(),
            value: "é".repeat(600),
            source: "overlay".into(),
        }])
        .unwrap();
        assert_eq!(
            line,
            format!("known-fix env applied: K={}... (overlay)", "é".repeat(512))
        );
    }
}
