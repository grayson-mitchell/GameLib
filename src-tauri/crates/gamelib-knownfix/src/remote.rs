//! The remote known-fixes fetcher (88-11, D-03): `src/backend/knownFixesFetcher.ts` in Rust.
//!
//! Sources, in order: GameLib's own repo (every store), then Heroic's feed for legendary, gog and nile
//! only. Heroic is asked only when GameLib answers 404. Any indeterminate answer (a transport failure, a
//! timeout, a 5xx, a 403, a body that is not a JSON object) stops the fetch with nothing written and
//! nothing deleted, so a transient GameLib outage can never replace a GameLib-sourced file with Heroic's.
//! A stale downloaded file is deleted only when every applicable source answers 404.
//!
//! A body is filtered through the tier-1 allow-list at write (T-88-27), so the remote layer only ever
//! holds allow-listed keys and a tier-2 key can never arrive through it (prohibition 6). The file is
//! written as the TS writes it (`JSON.stringify(filtered, null, 2)`, keys in the body's order, no
//! trailing newline), so a released build still reads the cache after a rollback (87 D-07).
//!
//! Every request goes through `EngineCtx.fetch`, the one network seam, with a 10 s timeout, and is
//! abandoned when the shutdown token fires. Nothing here returns an error: a failure is a log line.
//! A log line carries the file name (`<id>-<store>.json`), a source label and a status or a category,
//! never a URL or a path of this machine (prohibition 1).

use std::path::{Path, PathBuf};
use std::time::Duration;

use gamelib_engine::fetch::FetchRequest;

use crate::ctx::KnownFixCtx;
use crate::jsvalue::JsValue;
use crate::reader::{filter_tier1_known_fixes, normalize, store_suffix};
use crate::types::Runner;

/// GameLib's own feed (`GAMELIB_KNOWN_FIXES_BASE`).
pub const GAMELIB_KNOWN_FIXES_BASE: &str =
    "https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main";
/// Heroic's feed (`HEROIC_KNOWN_FIXES_BASE`), consulted for epic, gog and amazon only.
pub const HEROIC_KNOWN_FIXES_BASE: &str =
    "https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main";

/// How long one request to a feed may take (the default client's axios `timeout`).
pub const FEED_REQUEST_TIMEOUT: Duration = Duration::from_millis(10_000);

/// Heroic's feed covers Epic, GOG and Amazon only (decision 6).
fn heroic_covers(runner: Runner) -> bool {
    matches!(runner, Runner::Legendary | Runner::Gog | Runner::Nile)
}

/// `<root>/<file>` when `file` resolves to one plain entry directly inside `root`: the TS test is
/// resolve plus relative, and the relative text must be non-empty, must not start with `..` (which also
/// refuses a name that merely begins with two dots), must not be absolute and must hold no separator.
fn contained_dest(root: &Path, file: &str) -> Option<PathBuf> {
    let base = normalize(root);
    let full = normalize(&base.join(file));
    let rest = full.strip_prefix(&base).ok()?;
    let parts: Vec<String> = rest
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    match parts.as_slice() {
        [one] if !one.starts_with("..") => Some(full),
        _ => None,
    }
}

/// An app name that can sit in a URL path segment unencoded: ASCII letters, digits, `.`, `_` and `-`.
fn url_safe_app_name(app_name: &str) -> bool {
    !app_name.is_empty()
        && app_name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// `JSON.stringify(value, null, 2)`: two-space indent, `key: value`, `[]` and `{}` for the empty ones.
fn pretty(value: &JsValue, depth: usize, out: &mut String) {
    let pad = |out: &mut String, depth: usize| out.push_str(&"  ".repeat(depth));
    match value {
        JsValue::Array(items) if !items.is_empty() => {
            out.push_str("[\n");
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push_str(",\n");
                }
                pad(out, depth + 1);
                pretty(item, depth + 1, out);
            }
            out.push('\n');
            pad(out, depth);
            out.push(']');
        }
        JsValue::Object(entries) if !entries.is_empty() => {
            out.push_str("{\n");
            for (i, (key, item)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push_str(",\n");
                }
                pad(out, depth + 1);
                out.push_str(&JsValue::String(key.clone()).stringify());
                out.push_str(": ");
                pretty(item, depth + 1, out);
            }
            out.push('\n');
            pad(out, depth);
            out.push('}');
        }
        leaf => out.push_str(&leaf.stringify()),
    }
}

/// The filtered body as the file holds it: only the keys the allow-list kept, in the body's own order.
fn filtered_text(parsed: &JsValue, kept: &crate::types::KnownFixesInfo) -> String {
    let JsValue::Object(entries) = parsed else {
        return "{}".to_string();
    };
    let mut seen: Vec<&str> = Vec::new();
    let mut out: Vec<(String, JsValue)> = Vec::new();
    for (key, value) in entries {
        if kept.get(key).is_some() && !seen.contains(&key.as_str()) {
            seen.push(key.as_str());
            out.push((key.clone(), value.clone()));
        }
    }
    let mut text = String::new();
    pretty(&JsValue::Object(out), 0, &mut text);
    text
}

/// What one source's answer decides.
enum Answer {
    /// 404: this source does not have it; ask the next one.
    Missing,
    /// A body to write.
    Body(Vec<u8>),
    /// Indeterminate: stop, writing and deleting nothing.
    Stop,
}

/// Asks one source for the file. The shutdown token ends the wait quietly (`Stop`).
async fn ask(ctx: &KnownFixCtx, label: &str, url: String, file: &str) -> Answer {
    let request = FetchRequest::get(url)
        .gamelib_agent(&ctx.app_version)
        .timeout(FEED_REQUEST_TIMEOUT);
    let token = ctx.engine.shutdown.token();
    let sent = tokio::select! {
        biased;
        _ = token.cancelled() => return Answer::Stop,
        sent = ctx.engine.fetch.get(request) => sent,
    };
    let response = match sent {
        Ok(response) => response,
        Err(error) => {
            ctx.log_warn(&format!(
                "Known fixes: {label} request failed for {file}: {error}"
            ));
            return Answer::Stop;
        }
    };
    match response.status {
        404 => Answer::Missing,
        200 => Answer::Body(response.body),
        status => {
            ctx.log_warn(&format!(
                "Known fixes: {label} returned {status} for {file}"
            ));
            Answer::Stop
        }
    }
}

async fn run(ctx: &KnownFixCtx, app_name: &str, runner: Runner) -> Result<(), String> {
    let Some(store) = store_suffix(runner) else {
        return Ok(());
    };
    // `contained_dest` guards only the on-disk name. The request URL is built from the same text, so
    // a `?`, `#`, `%` or control character would re-target the request while still passing it (WR-02).
    if !url_safe_app_name(app_name) {
        ctx.log_warn("Refusing known-fixes fetch for an unsafe app name");
        return Ok(());
    }
    let file = format!("{app_name}-{store}.json");
    let root = ctx.paths.fixes.as_path();
    let Some(dest) = contained_dest(root, &file) else {
        ctx.log_warn("Refusing known-fixes fetch for an unsafe app name");
        return Ok(());
    };

    let mut sources = vec![("GameLib", GAMELIB_KNOWN_FIXES_BASE)];
    if heroic_covers(runner) {
        sources.push(("Heroic", HEROIC_KNOWN_FIXES_BASE));
    }

    for (label, base) in sources {
        let url = format!("{base}/{store}/{file}");
        let body = match ask(ctx, label, url, &file).await {
            Answer::Missing => continue,
            Answer::Stop => return Ok(()),
            Answer::Body(body) => body,
        };
        let text = String::from_utf8_lossy(&body);
        let Ok(parsed) = JsValue::parse(&text) else {
            ctx.log_warn(&format!(
                "Known fixes: {label} body for {file} is not valid JSON"
            ));
            return Ok(());
        };
        let Some(kept) =
            filter_tier1_known_fixes(ctx, app_name, &format!("remote: {label}"), &parsed)
        else {
            ctx.log_warn(&format!(
                "Known fixes: {label} body for {file} is not a JSON object"
            ));
            return Ok(());
        };

        tokio::fs::create_dir_all(root)
            .await
            .map_err(|e| e.kind().to_string())?;
        let tmp = root.join(format!("{file}.tmp-{}", std::process::id()));
        tokio::fs::write(&tmp, filtered_text(&parsed, &kept))
            .await
            .map_err(|e| e.kind().to_string())?;
        if let Err(e) = tokio::fs::rename(&tmp, &dest).await {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(e.kind().to_string());
        }
        ctx.log_info(&format!("Known fixes written from {label}: {file}"));
        return Ok(());
    }

    // Every applicable source answered 404: a stale downloaded file goes.
    if tokio::fs::symlink_metadata(&dest).await.is_ok() {
        tokio::fs::remove_file(&dest)
            .await
            .map_err(|e| e.kind().to_string())?;
        ctx.log_info(&format!(
            "Known fixes: no source has {file}, removed stale {file}"
        ));
    }
    Ok(())
}

/// Downloads the remote known fixes of one game into `<appFolder>/fixes/<appName>-<store>.json`
/// (`fetchRemoteKnownFixes`). Never fails: a refused name, an unsafe destination, an indeterminate
/// answer and a write error are each a log line.
pub async fn fetch_remote_known_fixes(ctx: &KnownFixCtx, app_name: &str, runner: Runner) {
    if let Err(kind) = run(ctx, app_name, runner).await {
        ctx.log_warn(&format!("Known fixes fetch failed for {app_name}: {kind}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_destination_must_be_one_plain_entry_inside_the_folder() {
        let root = Path::new("/data/fixes");
        assert_eq!(
            contained_dest(root, "1-gog.json"),
            Some(PathBuf::from("/data/fixes/1-gog.json"))
        );
        assert_eq!(
            contained_dest(root, "a.b-gog.json"),
            Some(PathBuf::from("/data/fixes/a.b-gog.json"))
        );
        for refused in [
            "../escape-gog.json",
            "..-gog.json",
            "..dots-gog.json",
            "a/b-gog.json",
            "/abs-gog.json",
        ] {
            assert_eq!(contained_dest(root, refused), None, "{refused}");
        }
    }

    #[test]
    fn an_app_name_with_a_url_metacharacter_is_refused() {
        for ok in ["1", "a.b-c_d", "Fortnite", "1207658930"] {
            assert!(url_safe_app_name(ok), "{ok}");
        }
        for refused in ["", "a?b", "a#b", "..%2fx", "a b", "a\nb", "a/b", "a\u{e9}"] {
            assert!(!url_safe_app_name(refused), "{refused:?}");
        }
    }

    #[test]
    fn the_written_text_is_json_stringify_with_two_spaces_and_no_trailing_newline() {
        let parsed = JsValue::parse(
            r#"{"title":"T","envVariables":{"A":"1"},"winetricks":["a","b"],"launchArgs":[],"extra":1}"#,
        )
        .unwrap();
        let mut kept = crate::types::KnownFixesInfo::default();
        for key in ["title", "envVariables", "winetricks", "launchArgs"] {
            kept.set(key, parsed.to_value().get(key).unwrap().clone());
        }
        assert_eq!(
            filtered_text(&parsed, &kept),
            "{\n  \"title\": \"T\",\n  \"envVariables\": {\n    \"A\": \"1\"\n  },\n  \"winetricks\": [\n    \"a\",\n    \"b\"\n  ],\n  \"launchArgs\": []\n}"
        );
        assert_eq!(
            filtered_text(&parsed, &crate::types::KnownFixesInfo::default()),
            "{}"
        );
    }
}
