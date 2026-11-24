//! The standard (non-Electron) browser user agent for Humble-facing requests, ported from
//! `src/backend/login/userAgent.ts` (Phase 94, D-06).
//!
//! Google's SSO detects an embedded browser by the `Electron/x.y.z` and app-name tokens of the runtime's
//! user agent and then restricts the sign-in options. The helper rebuilds a plain Chrome user agent from
//! the runtime's own fallback string (the platform token and the Chrome version are read from it, never
//! hardcoded, so they stay in step with the real Chromium).
//!
//! This is a twin of the TypeScript helper, pinned to the same vectors: `golden/user_agent/*.json` is
//! replayed here and by `src/backend/login/__tests__/userAgent.test.ts`, so the two cannot drift before
//! Phase 92 deletes the TypeScript.
//!
//! The patterns spell their JavaScript semantics out. JavaScript's `\S` is the complement of its white
//! space set (which holds U+FEFF and U+00A0), and this crate builds `regex` without `unicode-perl`, so
//! `\S` does not compile; it is written as an explicit class, and a test checks that class against
//! [`crate::js_date::is_js_whitespace`] over the whole BMP.

use regex::Regex;
use std::sync::OnceLock;

/// The JavaScript white space and line terminator set, as a regex class body.
const JS_WS: &str = r" \t\n\x0B\x0C\r\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";

/// `\S+` as JavaScript reads it.
fn non_ws() -> String {
    format!("[^{JS_WS}]+")
}

/// `/^Mozilla\/5\.0 \(([^)]+)\)/`.
fn platform_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^Mozilla/5\.0 \(([^)]+)\)").expect("a valid pattern"))
}

/// `/Chrome\/(\S+)/`.
fn chrome_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(&format!("Chrome/({})", non_ws())).expect("a valid pattern"))
}

/// `/ Electron\/\S+/`.
fn electron_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(&format!(" Electron/{}", non_ws())).expect("a valid pattern"))
}

/// `standardBrowserUserAgent`: a plain Chrome user agent from the runtime's `userAgentFallback`. A string
/// with no `Mozilla/5.0 (<platform>)` group or no `Chrome/<version>` token only loses its first
/// ` Electron/<version>` token.
pub fn standard_browser_user_agent(user_agent_fallback: &str) -> String {
    let platform = platform_re()
        .captures(user_agent_fallback)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str());
    let chrome_version = chrome_re()
        .captures(user_agent_fallback)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str());
    match (platform, chrome_version) {
        (Some(platform), Some(version)) if !platform.is_empty() && !version.is_empty() => format!(
            "Mozilla/5.0 ({platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{version} Safari/537.36"
        ),
        // Defensive: the fallback shape is stable across Electron versions, but if it ever changes, at
        // least strip the Electron-identifying token (the first one only, as the JS pattern has no `g`).
        _ => electron_re()
            .replace(user_agent_fallback, "")
            .into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::js_date::is_js_whitespace;
    use serde::Deserialize;
    use std::fs;
    use std::path::PathBuf;

    #[derive(Deserialize)]
    struct Manifest {
        count: usize,
        floor: usize,
    }

    #[derive(Deserialize)]
    struct Vector {
        input: Input,
        output: String,
    }

    #[derive(Deserialize)]
    struct Input {
        #[serde(rename = "userAgentFallback")]
        user_agent_fallback: String,
    }

    fn vectors_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/user_agent")
    }

    #[test]
    fn every_recorded_vector_returns_the_recorded_string() {
        let dir = vectors_dir();
        let manifest: Manifest =
            serde_json::from_str(&fs::read_to_string(dir.join("MANIFEST.json")).unwrap()).unwrap();
        let mut files: Vec<PathBuf> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.extension().is_some_and(|e| e == "json"))
            .filter(|p| p.file_name().is_some_and(|n| n != "MANIFEST.json"))
            .collect();
        files.sort();
        assert_eq!(
            files.len(),
            manifest.count,
            "the manifest count is the directory's"
        );
        assert!(files.len() >= manifest.floor, "under the manifest floor");
        let mut replayed = 0;
        for file in &files {
            let vector: Vector = serde_json::from_str(&fs::read_to_string(file).unwrap())
                .unwrap_or_else(|e| panic!("{}: {e}", file.display()));
            assert_eq!(
                standard_browser_user_agent(&vector.input.user_agent_fallback),
                vector.output,
                "{}",
                file.display()
            );
            replayed += 1;
        }
        assert_eq!(replayed, manifest.count);
    }

    #[test]
    fn an_input_with_no_platform_group_returns_the_fallback_with_only_electron_stripped() {
        assert_eq!(
            standard_browser_user_agent("GameLibWebview/1.0 Chrome/142.0.7444.52 Electron/41.1.1"),
            "GameLibWebview/1.0 Chrome/142.0.7444.52"
        );
        assert_eq!(standard_browser_user_agent(""), "");
        // A platform group but no Chrome token takes the same branch.
        assert_eq!(
            standard_browser_user_agent("Mozilla/5.0 (X11; Linux x86_64) Electron/41.1.1"),
            "Mozilla/5.0 (X11; Linux x86_64)"
        );
    }

    #[test]
    fn only_the_first_electron_token_is_stripped_as_the_js_pattern_has_no_g_flag() {
        assert_eq!(
            standard_browser_user_agent("Foo Electron/1 Bar Electron/2"),
            "Foo Bar Electron/2"
        );
    }

    #[test]
    fn the_chrome_version_runs_to_the_first_javascript_white_space() {
        // U+00A0 is white space to JavaScript's `\S`, so it ends the version; U+2003 too.
        let ua = "Mozilla/5.0 (X11; Linux x86_64) Chrome/142.0\u{a0}Safari/537.36";
        assert_eq!(
            standard_browser_user_agent(ua),
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36"
        );
    }

    #[test]
    fn the_explicit_white_space_class_is_the_javascript_set_over_the_whole_bmp() {
        let class = Regex::new(&format!("^[{JS_WS}]$")).unwrap();
        for unit in 0u32..=0xFFFF {
            let Some(c) = char::from_u32(unit) else {
                continue;
            };
            assert_eq!(
                class.is_match(&c.to_string()),
                is_js_whitespace(c),
                "U+{unit:04X}"
            );
        }
    }
}
