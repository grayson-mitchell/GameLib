//! Phase 81 D-08: the Rust reader for the bridge helper's `--steam-appstate <appId>` subcommand
//! (spike 083 tick mode). It asks the running macOS Steam client whether it is signed in
//! (`BLoggedOn`) and what install state it holds for the app (`GetAppInstallState`, bit 4 = Steam
//! adopted the install) and returns a typed outcome. Never errors: every failure maps to
//! `Unavailable`, so the adoption watch keeps its entry and falls back to the evidence it had before
//! (D-10).
//!
//! Same shape as `update::request_steam_install_app`: the helper path comes only from the shell host
//! (T-80-37), the appId is checked before it reaches argv (T-81-10), argv is an array with no shell,
//! stdout is capped at 64 KiB and only the last non-empty line is parsed (T-81-12). The helper
//! never prints a SteamID, and this module logs nothing.

use crate::constants::ADOPTION_HELPER_TIMEOUT_MS;
use crate::host::{PollHost, ProcessRunner};
use serde_json::{Map, Value};
use std::path::Path;
use std::time::Duration;

/// The TS runner caps helper stdout at 64 KiB; a longer one counts as truncated (helper-failed).
const HELPER_MAX_STDOUT_BYTES: usize = 64 * 1024;

/// What one helper reading found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppStateOutcome {
    /// The helper attached. `state` and `installed` are `None` when Steam is signed out (the sign-in
    /// screen) or when the helper could not verify the method slot.
    Ok {
        logged_on: bool,
        state: Option<u32>,
        installed: Option<u32>,
    },
    /// Steam is not running (the helper's `steam-not-running` reason).
    SteamNotRunning,
    /// No answer: `helper-missing`, `helper-failed`, `bad-appid`, or the helper's own reason
    /// (`unsupported-arch`, `steamclient-missing`, `method-unverified:...`).
    Unavailable { reason: String },
}

fn unavailable(reason: &str) -> AppStateOutcome {
    AppStateOutcome::Unavailable {
        reason: reason.to_string(),
    }
}

fn is_valid_app_id(app_id: &str) -> bool {
    (1..=10).contains(&app_id.len()) && app_id.bytes().all(|b| b.is_ascii_digit())
}

/// `None` = absent or null (valid, no value); `Some(None)` = present but not a u32 (invalid).
fn optional_u32(obj: &Map<String, Value>, key: &str) -> Option<Option<u32>> {
    match obj.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(Value::Number(n)) => n.as_u64().and_then(|v| u32::try_from(v).ok()).map(Some),
        Some(_) => None,
    }
}

fn parse_ok(obj: &Map<String, Value>) -> AppStateOutcome {
    let logged_on = match obj.get("loggedOn").and_then(Value::as_u64) {
        Some(0) => false,
        Some(1) => true,
        _ => return unavailable("helper-failed"),
    };
    let (Some(state), Some(installed)) =
        (optional_u32(obj, "state"), optional_u32(obj, "installed"))
    else {
        return unavailable("helper-failed");
    };
    AppStateOutcome::Ok {
        logged_on,
        state,
        installed,
    }
}

/// Asks the running Steam, through the bundled bridge helper, whether it is signed in and what
/// install state it holds for `app_id`.
pub async fn read_app_state<H, R>(host: &H, runner: &R, app_id: &str) -> AppStateOutcome
where
    H: PollHost + ?Sized,
    R: ProcessRunner + ?Sized,
{
    if !is_valid_app_id(app_id) {
        return unavailable("bad-appid");
    }
    let Some(helper) = host.bridge_helper_path().filter(|p| Path::new(p).exists()) else {
        return unavailable("helper-missing");
    };
    let argv = vec!["--steam-appstate".to_string(), app_id.to_string()];
    let out = runner
        .run(
            &helper.to_string_lossy(),
            argv,
            Duration::from_millis(ADOPTION_HELPER_TIMEOUT_MS),
        )
        .await;
    // Spawn failure and timeout surface as `code: None`; truncation as an oversize stdout.
    if out.code.is_none() || out.stdout.len() > HELPER_MAX_STDOUT_BYTES {
        return unavailable("helper-failed");
    }
    let last = out.stdout.lines().rfind(|l| !l.trim().is_empty());
    let parsed: Option<Value> = last.and_then(|l| serde_json::from_str(l).ok());
    let Some(Value::Object(obj)) = parsed else {
        return unavailable("helper-failed");
    };
    match obj.get("result").and_then(Value::as_str) {
        Some("ok") => parse_ok(&obj),
        Some("unavailable") => match obj.get("reason").and_then(Value::as_str) {
            Some("steam-not-running") => AppStateOutcome::SteamNotRunning,
            Some(reason) => unavailable(reason),
            None => unavailable("helper-failed"),
        },
        _ => unavailable("helper-failed"),
    }
}
