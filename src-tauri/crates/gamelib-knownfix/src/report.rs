//! The opt-in known-fix report client (88-11, D-03): `src/backend/knownFixReport.ts` in Rust, with the
//! wire schema of `src/common/knownFixReport.ts`.
//!
//! A detector (the Mach-O arch check, the CEG probe) finds a fix the curated feed lacks and asks this
//! module to tell the relay about it. Nothing leaves the machine unless the user opted in (`enabled`,
//! the `shareDetectedFixes` setting, which only the boolean `true` turns on) and the machine is a Mac;
//! the report carries no title, user id or path, only the strict seven-field body below (T-88-29).
//!
//! The checks run in the TS order: platform, opt-in, the winning layer (a `local` file means a private
//! override, so nothing is sent), the "already known" skip, the sent record, the relay URL, the schema,
//! the in-flight table, then one POST through `EngineCtx.fetch`: 8 s, no redirects, `Content-Type` and
//! `User-Agent` only. A 2xx and a terminal 4xx are recorded in the `steam_known_fix_reports` store (a
//! 4xx is final, so it is not sent again); a 408, a 429, a 5xx, a transport failure and a shutdown are
//! `retryable` and record nothing. There is no retry queue (D-16): a CEG report is retried naturally at
//! the next install or launch.
//!
//! Prohibition 1: a log line names the app id, the key, the op and a status word or code. It never
//! carries the relay URL, a header or the relay's body (only its `status` word, when it is one of the
//! nine the schema lists).

use std::sync::Arc;
use std::time::Duration;

use gamelib_engine::ctx::Platform;
use gamelib_engine::fetch::FetchRequest;
use gamelib_store::host::Store;
use gamelib_store::json::Json;
use serde_json::{json, Value};

use crate::ctx::{KnownFixCtx, DEFAULT_RELAY_URL};
use crate::reader::read_known_fixes_with_layer;
use crate::types::{FixLayer, LayeredFix, Runner};

/// The only `(key, value)` pairs a report may carry (D-14), in the schema's order.
pub const KNOWN_FIX_REPORT_PAIRS: [(&str, &str); 2] = [("macArch", "32"), ("drm", "ceg")];
/// The wire version (`KNOWN_FIX_REPORT_VERSION`).
pub const KNOWN_FIX_REPORT_VERSION: u64 = 1;
/// The relay's request body cap in bytes (D-15).
pub const KNOWN_FIX_REPORT_MAX_BYTES: usize = 2048;
/// A relay URL holding this means the relay is not deployed: nothing is sent (fail closed).
pub const RELAY_URL_PENDING_SENTINEL: &str = "OPERATOR-DEPLOY-PENDING";
/// The status words the relay's answer is logged as; anything else is `unknown`.
pub const RELAY_RESPONSE_STATUSES: [&str; 9] = [
    "created",
    "updated",
    "counted",
    "already-known",
    "suppressed",
    "skipped",
    "rejected",
    "rate-limited",
    "unavailable",
];
/// How long the relay POST may take (`RELAY_TIMEOUT_MS`).
pub const RELAY_TIMEOUT: Duration = Duration::from_millis(8000);
/// The store the sent records live in (`steamKnownFixReportStore`).
pub const SENT_STORE_NAME: &str = "steam_known_fix_reports";

/// The two fix keys a report may carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportKey {
    MacArch,
    Drm,
}

impl ReportKey {
    pub fn parse(name: &str) -> Option<ReportKey> {
        match name {
            "macArch" => Some(ReportKey::MacArch),
            "drm" => Some(ReportKey::Drm),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            ReportKey::MacArch => "macArch",
            ReportKey::Drm => "drm",
        }
    }

    /// The one value a report may carry for this key.
    pub fn value(self) -> &'static str {
        match self {
            ReportKey::MacArch => "32",
            ReportKey::Drm => "ceg",
        }
    }
}

/// Whether the detector found a fix to add or one that is no longer needed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportOp {
    Add,
    Remove,
}

impl ReportOp {
    pub fn parse(name: &str) -> Option<ReportOp> {
        match name {
            "add" => Some(ReportOp::Add),
            "remove" => Some(ReportOp::Remove),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            ReportOp::Add => "add",
            ReportOp::Remove => "remove",
        }
    }
}

/// Which detector found it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Detector {
    Macho,
    Ceg,
}

impl Detector {
    pub fn parse(name: &str) -> Option<Detector> {
        match name {
            "macho" => Some(Detector::Macho),
            "ceg" => Some(Detector::Ceg),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Detector::Macho => "macho",
            Detector::Ceg => "ceg",
        }
    }
}

/// One detection (`DetectedFix`). The `app_id` is a free string until the schema has checked it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedFix {
    pub app_id: String,
    pub key: ReportKey,
    pub op: ReportOp,
    pub detector: Detector,
}

/// What one report attempt came to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReportOutcome {
    NotMac,
    Disabled,
    SkippedLocal,
    SkippedKnown,
    SkippedNot32,
    AlreadySent,
    InFlight,
    NoRelay,
    Invalid,
    Sent,
    Rejected,
    Retryable,
    Error,
}

impl ReportOutcome {
    /// The word the TS returns and the op answers.
    pub fn as_str(self) -> &'static str {
        match self {
            ReportOutcome::NotMac => "not-mac",
            ReportOutcome::Disabled => "disabled",
            ReportOutcome::SkippedLocal => "skipped-local",
            ReportOutcome::SkippedKnown => "skipped-known",
            ReportOutcome::SkippedNot32 => "skipped-not-32",
            ReportOutcome::AlreadySent => "already-sent",
            ReportOutcome::InFlight => "in-flight",
            ReportOutcome::NoRelay => "no-relay",
            ReportOutcome::Invalid => "invalid",
            ReportOutcome::Sent => "sent",
            ReportOutcome::Rejected => "rejected",
            ReportOutcome::Retryable => "retryable",
            ReportOutcome::Error => "error",
        }
    }
}

/// `reportSentKey`: the sent record's key and the relay's dedup key.
pub fn report_sent_key(app_id: &str, key: ReportKey, op: ReportOp) -> String {
    format!("{app_id}:{}:{}", key.as_str(), op.as_str())
}

/// The relay URL the report goes to: the one the shell handed the context (which resolves the
/// `GAMELIB_FIX_RELAY_URL` override once), or the deployed relay when it handed none.
pub fn relay_url(ctx: &KnownFixCtx) -> &str {
    if ctx.relay_url.is_empty() {
        DEFAULT_RELAY_URL
    } else {
        &ctx.relay_url
    }
}

// ---------------------------------------------------------------------------------------------
// The wire schema (`knownFixReportSchema`)
// ---------------------------------------------------------------------------------------------

/// A report that passed the schema: the seven fields, in the wire order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownFixReport {
    pub app_id: String,
    pub key: ReportKey,
    pub op: ReportOp,
    pub gamelib_version: String,
}

impl KnownFixReport {
    /// The JSON text the relay is sent: compact, keys in the schema's order (`v`, `store`, `appId`,
    /// `key`, `value`, `op`, `gamelibVersion`), as `JSON.stringify` of the zod output wrote it.
    pub fn body(&self) -> String {
        let text = |s: &str| serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string());
        format!(
            "{{\"v\":{KNOWN_FIX_REPORT_VERSION},\"store\":\"steam\",\"appId\":{},\"key\":{},\"value\":{},\"op\":{},\"gamelibVersion\":{}}}",
            text(&self.app_id),
            text(self.key.as_str()),
            text(self.key.value()),
            text(self.op.as_str()),
            text(&self.gamelib_version),
        )
    }
}

/// `typeof`-ish name zod puts in "received ...".
fn received(value: Option<&Value>) -> &'static str {
    match value {
        None => "undefined",
        Some(Value::Null) => "null",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(Value::Array(_)) => "array",
        Some(Value::Object(_)) => "object",
    }
}

/// `/^[1-9][0-9]{0,9}$/`.
fn is_app_id(text: &str) -> bool {
    let bytes = text.as_bytes();
    (1..=10).contains(&bytes.len())
        && matches!(bytes[0], b'1'..=b'9')
        && bytes[1..].iter().all(u8::is_ascii_digit)
}

/// `/^[0-9A-Za-z.+-]{1,40}$/`.
fn is_version(text: &str) -> bool {
    (1..=40).contains(&text.len())
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'+' | b'-'))
}

/// A string field with its pattern, as zod words the two failures.
fn string_field(
    input: &serde_json::Map<String, Value>,
    name: &str,
    pattern: &str,
    matches: fn(&str) -> bool,
    issues: &mut Vec<String>,
) -> Option<String> {
    match input.get(name) {
        Some(Value::String(text)) if matches(text) => Some(text.clone()),
        Some(Value::String(_)) => {
            issues.push(format!("Invalid string: must match pattern {pattern}"));
            None
        }
        other => {
            issues.push(format!(
                "Invalid input: expected string, received {}",
                received(other)
            ));
            None
        }
    }
}

/// An enum field: one of `options`, else zod's "Invalid option" text.
fn enum_field<'a>(
    input: &'a serde_json::Map<String, Value>,
    name: &str,
    options: &[&str],
    issues: &mut Vec<String>,
) -> Option<&'a str> {
    match input.get(name) {
        Some(Value::String(text)) if options.contains(&text.as_str()) => Some(text),
        _ => {
            let list: Vec<String> = options.iter().map(|o| format!("\"{o}\"")).collect();
            issues.push(format!(
                "Invalid option: expected one of {}",
                list.join("|")
            ));
            None
        }
    }
}

/// `parseKnownFixReport`: the strict schema, then its two refinements. `Err` is the issues joined with
/// `; `, cut at 200 characters, never an echo of the input. The two refinement messages are the
/// schema's own (`pair not allowed`, `only macArch can be removed`); the wording of the others is this
/// port's (`deltas.json`).
pub fn parse_known_fix_report(input: &Value) -> Result<KnownFixReport, String> {
    const FIELDS: [&str; 7] = [
        "v",
        "store",
        "appId",
        "key",
        "value",
        "op",
        "gamelibVersion",
    ];
    let Value::Object(map) = input else {
        return Err(format!(
            "Invalid input: expected object, received {}",
            received(Some(input))
        ));
    };
    let mut issues: Vec<String> = Vec::new();
    let unknown: Vec<String> = map
        .keys()
        .filter(|k| !FIELDS.contains(&k.as_str()))
        .map(|k| format!("\"{k}\""))
        .collect();
    match unknown.len() {
        0 => {}
        1 => issues.push(format!("Unrecognized key: {}", unknown[0])),
        _ => issues.push(format!("Unrecognized keys: {}", unknown.join(", "))),
    }
    if map.get("v").and_then(Value::as_u64) != Some(KNOWN_FIX_REPORT_VERSION) {
        issues.push(format!(
            "Invalid input: expected {KNOWN_FIX_REPORT_VERSION}"
        ));
    }
    if map.get("store").and_then(Value::as_str) != Some("steam") {
        issues.push("Invalid input: expected \"steam\"".to_string());
    }
    let app_id = string_field(map, "appId", "/^[1-9][0-9]{0,9}$/", is_app_id, &mut issues);
    let key = enum_field(map, "key", &["macArch", "drm"], &mut issues);
    let value = enum_field(map, "value", &["32", "ceg"], &mut issues);
    let op = enum_field(map, "op", &["add", "remove"], &mut issues);
    let version = string_field(
        map,
        "gamelibVersion",
        "/^[0-9A-Za-z.+-]{1,40}$/",
        is_version,
        &mut issues,
    );
    if issues.is_empty() {
        // Present and valid, so these cannot miss.
        let (Some(app_id), Some(key), Some(value), Some(op), Some(version)) =
            (app_id, key, value, op, version)
        else {
            return Err("Invalid input".to_string());
        };
        let (Some(key), Some(op)) = (ReportKey::parse(key), ReportOp::parse(op)) else {
            return Err("Invalid input".to_string());
        };
        if key.value() != value {
            issues.push("pair not allowed".to_string());
        }
        if op == ReportOp::Remove && key != ReportKey::MacArch {
            issues.push("only macArch can be removed".to_string());
        }
        if issues.is_empty() {
            return Ok(KnownFixReport {
                app_id,
                key,
                op,
                gamelib_version: version,
            });
        }
    }
    Err(issues.join("; ").chars().take(200).collect())
}

// ---------------------------------------------------------------------------------------------
// What a report reads and writes besides the network
// ---------------------------------------------------------------------------------------------

/// The four things a report reads or writes besides the relay (the TS `ReportDeps`): whether this is a
/// Mac, the layer that wins for a game, and the sent records. Each can fail, which is the `error`
/// outcome. [`CtxReportEnv`] is the real one; a test swaps in one that fails.
pub trait ReportEnv: Send + Sync {
    fn is_mac(&self) -> Result<bool, String>;
    /// The tier-1 fix that wins for the Steam game `app_id`, and its layer.
    fn winning(&self, app_id: &str) -> Result<Option<LayeredFix>, String>;
    /// The sent record under `key`.
    fn sent(&self, key: &str) -> Result<Option<Json>, String>;
    /// Records a sent report: `{ at, status }` under `key`.
    fn record_sent(&self, key: &str, at: u64, status: u16) -> Result<(), String>;
}

/// The real environment: the context's platform, the layered reader and the
/// `store_cache/steam_known_fix_reports` store through the one store host.
pub struct CtxReportEnv {
    ctx: KnownFixCtx,
}

impl CtxReportEnv {
    pub fn new(ctx: &KnownFixCtx) -> CtxReportEnv {
        CtxReportEnv { ctx: ctx.clone() }
    }

    /// Opened per call, lazily: the store is only touched once every gate has passed.
    fn store(&self) -> Result<Arc<Store>, String> {
        let dir = self.ctx.engine.paths.user_data.join("store_cache");
        self.ctx
            .engine
            .host
            .open_cache(&dir, SENT_STORE_NAME)
            .map_err(|e| format!("the sent-report store is not available ({})", e.kind()))
    }
}

impl ReportEnv for CtxReportEnv {
    fn is_mac(&self) -> Result<bool, String> {
        Ok(self.ctx.engine.platform == Platform::Mac)
    }

    fn winning(&self, app_id: &str) -> Result<Option<LayeredFix>, String> {
        Ok(read_known_fixes_with_layer(
            &self.ctx,
            app_id,
            Runner::Steam,
        ))
    }

    fn sent(&self, key: &str) -> Result<Option<Json>, String> {
        Ok(self.store()?.get(key))
    }

    fn record_sent(&self, key: &str, at: u64, status: u16) -> Result<(), String> {
        self.store()?
            .set(key, Json::from(json!({ "at": at, "status": status })))
            .map_err(|e| format!("the sent record could not be written ({})", e.kind()))
    }
}

/// `wasSent`: a record that is an object holding a finite number `at`.
fn was_sent(record: Option<&Json>) -> bool {
    record
        .and_then(|r| r.get("at"))
        .and_then(Json::as_f64)
        .is_some_and(f64::is_finite)
}

/// `Known-fix report: unexpected error (...)`, and the `error` outcome.
fn failed(ctx: &KnownFixCtx, message: &str) -> ReportOutcome {
    ctx.log_warn(&format!("Known-fix report: unexpected error ({message})"));
    ReportOutcome::Error
}

/// The word the relay's own `status` field is logged as: one of the nine, else `unknown`.
fn relay_status_word(body: &[u8]) -> &'static str {
    let parsed: Option<Value> = serde_json::from_slice(body).ok();
    let word = parsed
        .as_ref()
        .and_then(|v| v.get("status"))
        .and_then(Value::as_str);
    RELAY_RESPONSE_STATUSES
        .iter()
        .copied()
        .find(|s| Some(*s) == word)
        .unwrap_or("unknown")
}

/// Sends one detected fix to the relay, if the user opted in (`enabled`) and nothing makes it pointless.
/// Never fails: the outcome says what happened and the log says why.
pub async fn run_known_fix_report(
    ctx: &KnownFixCtx,
    fix: &DetectedFix,
    enabled: bool,
) -> ReportOutcome {
    run_known_fix_report_with(ctx, fix, enabled, &CtxReportEnv::new(ctx)).await
}

/// [`run_known_fix_report`] over an environment (the TS `ReportDeps`).
pub async fn run_known_fix_report_with(
    ctx: &KnownFixCtx,
    fix: &DetectedFix,
    enabled: bool,
    env: &dyn ReportEnv,
) -> ReportOutcome {
    // RED: the report logic is not written yet.
    let _ = (ctx, fix, enabled, env);
    ReportOutcome::Error
}

/// The fire-and-forget entry point for a detector hook (`reportDetectedFix`): the report runs as a task
/// holding the `knownfix` registrant, stops at shutdown, and nothing it does reaches the caller. Outside
/// a tokio runtime there is nothing to run it on and it does nothing.
pub fn report_detected_fix(ctx: &KnownFixCtx, fix: DetectedFix, enabled: bool) {
    report_detected_fix_with(ctx, fix, enabled, Arc::new(CtxReportEnv::new(ctx)));
}

/// [`report_detected_fix`] over an environment.
pub fn report_detected_fix_with(
    ctx: &KnownFixCtx,
    fix: DetectedFix,
    enabled: bool,
    env: Arc<dyn ReportEnv>,
) {
    let Ok(handle) = tokio::runtime::Handle::try_current() else {
        return;
    };
    let ctx = ctx.clone();
    let registrant = ctx.engine.shutdown.register("knownfix");
    handle.spawn(async move {
        let _registrant = registrant;
        let _ = run_known_fix_report_with(&ctx, &fix, enabled, env.as_ref()).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok_input() -> Value {
        json!({"v": 1, "store": "steam", "appId": "220", "key": "macArch", "value": "32",
               "op": "add", "gamelibVersion": "0.8.0"})
    }

    #[test]
    fn a_valid_report_round_trips_to_the_wire_body() {
        let report = parse_known_fix_report(&ok_input()).unwrap();
        assert_eq!(
            report.body(),
            r#"{"v":1,"store":"steam","appId":"220","key":"macArch","value":"32","op":"add","gamelibVersion":"0.8.0"}"#
        );
        assert_eq!(report.body().len(), 102);
        assert_eq!(
            report_sent_key("220", ReportKey::Drm, ReportOp::Add),
            "220:drm:add"
        );
    }

    #[test]
    fn the_schema_refuses_what_the_ts_schema_refuses() {
        let with = |field: &str, value: Value| {
            let mut input = ok_input();
            input[field] = value;
            input
        };
        for refused in [
            with("appId", json!("12345678901")),
            with("appId", json!("0")),
            with("appId", json!("../x")),
            with("appId", json!(220)),
            with("v", json!(2)),
            with("store", json!("gog")),
            with("key", json!("title")),
            with("value", json!("64")),
            with("op", json!("delete")),
            with("gamelibVersion", json!("x".repeat(41))),
            with("gamelibVersion", json!("not a version!")),
            with("gamelibVersion", json!("")),
            with("title", json!("Half-Life")),
            json!(null),
            json!("text"),
            json!([1]),
            json!({}),
        ] {
            assert!(
                parse_known_fix_report(&refused).is_err(),
                "{refused} was accepted"
            );
        }
        for accepted in [
            with("appId", json!("1234567890")),
            with("gamelibVersion", json!("0.8.0-beta+1")),
            with("gamelibVersion", json!("1")),
        ] {
            assert!(parse_known_fix_report(&accepted).is_ok(), "{accepted}");
        }
    }

    #[test]
    fn the_two_refinements_say_what_the_schema_says_and_never_echo_the_input() {
        let mut wrong_pair = ok_input();
        wrong_pair["value"] = json!("ceg");
        assert_eq!(
            parse_known_fix_report(&wrong_pair).unwrap_err(),
            "pair not allowed"
        );
        let mut drm_remove = ok_input();
        drm_remove["key"] = json!("drm");
        drm_remove["value"] = json!("ceg");
        drm_remove["op"] = json!("remove");
        assert_eq!(
            parse_known_fix_report(&drm_remove).unwrap_err(),
            "only macArch can be removed"
        );
        drm_remove["value"] = json!("32");
        assert_eq!(
            parse_known_fix_report(&drm_remove).unwrap_err(),
            "pair not allowed; only macArch can be removed"
        );
        let mut secret = ok_input();
        secret["appId"] = json!("SECRET-APP");
        secret["title"] = json!("SECRET-TITLE");
        let error = parse_known_fix_report(&secret).unwrap_err();
        assert!(!error.contains("SECRET"), "{error}");
        assert!(error.chars().count() <= 200);
    }

    #[test]
    fn the_pairs_and_constants_are_the_shared_schemas() {
        assert_eq!(KNOWN_FIX_REPORT_PAIRS, [("macArch", "32"), ("drm", "ceg")]);
        assert_eq!(KNOWN_FIX_REPORT_VERSION, 1);
        assert_eq!(KNOWN_FIX_REPORT_MAX_BYTES, 2048);
        assert_eq!(RELAY_TIMEOUT, Duration::from_millis(8000));
        assert!(!DEFAULT_RELAY_URL.contains(RELAY_URL_PENDING_SENTINEL));
        for (key, value) in KNOWN_FIX_REPORT_PAIRS {
            let parsed = ReportKey::parse(key).unwrap();
            assert_eq!((parsed.as_str(), parsed.value()), (key, value));
        }
    }

    #[test]
    fn only_a_finite_at_counts_as_sent() {
        let rec = |v: Value| Json::from(v);
        assert!(was_sent(Some(&rec(json!({"at": 1234, "status": 200})))));
        assert!(was_sent(Some(&rec(json!({"at": 0})))));
        for not_sent in [
            json!("yes"),
            json!({"at": "x"}),
            json!(null),
            json!({}),
            json!(5),
        ] {
            assert!(!was_sent(Some(&rec(not_sent.clone()))), "{not_sent}");
        }
        assert!(!was_sent(None));
    }

    #[test]
    fn the_relay_status_word_is_one_of_the_nine_or_unknown() {
        assert_eq!(
            relay_status_word(br#"{"status":"created","detail":"SECRET"}"#),
            "created"
        );
        assert_eq!(
            relay_status_word(br#"{"status":"rate-limited"}"#),
            "rate-limited"
        );
        for odd in [
            &br#"{"status":"weird"}"#[..],
            br#"{"status":5}"#,
            b"null",
            br#""plain text""#,
            b"plain text",
            br#"{"detail":"only"}"#,
            b"",
        ] {
            assert_eq!(relay_status_word(odd), "unknown");
        }
    }
}
