//! Tier-2 `registry` and `dllOverrides` known fixes (`knownFixesRegistry.ts`, quick 261026-j6x and
//! 261029-gow), ported for D-03.
//!
//! `dllOverrides` compile to `AppDefaults\<exe>\DllOverrides` REG_SZ values (spike 031: CrossOver's wine
//! drops `WINEDLLOVERRIDES`), views `[64]` because `HKCU\Software` is not redirected, and share the
//! applier. `reg add /f` values come from `<appName>-<runner>.profile.json`, honoured only from the
//! bundled and local layers, never the remote one (the layering lives in
//! [`crate::reader::read_known_fix_profile`]). The Steam bridge and the non-Steam Wine path both use this.
//!
//! `reg add /f` is idempotent, but each one costs a cold Wine session, so a value already present in the
//! prefix's `system.reg` or `user.reg` (same type and data) is not rewritten each launch; any doubt re-runs
//! the `reg add`. There is no applied-fix ledger or reversal: turning a profile off does not remove a
//! value already written.
//!
//! Every `reg add` goes through the [`RegistryRun`] seam, one run per (fix, view), each bounded at
//! [`REGISTRY_FIX_TIMEOUT`] by a cancel token the run acts on: [`WineRegistryRun`] hands it to
//! `gamelib-wine`'s command core, whose child is a `gamelib-proc` helper, so the timeout kill is
//! `gamelib-proc`'s group kill and this module owns no kill of its own. Failures warn and never reach the
//! caller (D-20: warnings only, as the TS).
//!
//! Log lines are fixed text built from the fix itself (key, value name, view) and the caller's label;
//! never a profile path (the skip line names only the file's base name).

use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use gamelib_wine::wine_cmd::command::{run_wine_command, WineCommandArgs};
use gamelib_wine::wine_cmd::env::GameSettingsView;
use gamelib_wine::wine_cmd::WineHost;
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};
use tokio_util::sync::CancellationToken;

use crate::ctx::KnownFixCtx;
use crate::jsvalue::JsValue;
use crate::reader::{self, normalize};
use crate::types::{KnownFixProfile, Runner};

/// How long one `reg add` gets before it is cancelled (`REGISTRY_FIX_TIMEOUT_MS`).
pub const REGISTRY_FIX_TIMEOUT: Duration = Duration::from_millis(15_000);

/// How long a run gets, after its cancel fired, to answer that it killed its child. A run that ignores
/// the cancel is abandoned (and its child is left to the helper reaper) rather than awaited without a
/// bound (the Rust shutdown contract: nothing waits without a limit).
const CANCEL_GRACE: Duration = Duration::from_secs(2);

const REGISTRY_ROOTS: [&str; 4] = [
    "HKLM\\",
    "HKEY_LOCAL_MACHINE\\",
    "HKCU\\",
    "HKEY_CURRENT_USER\\",
];

/// The longest ignored entry or value a warning echoes, in UTF-16 units (the TS `slice(0, 200)`).
const SHOWN_MAX_UNITS: usize = 200;

/// The registry value types a fix may write.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RegistryType {
    #[serde(rename = "REG_DWORD")]
    Dword,
    #[serde(rename = "REG_SZ")]
    Sz,
}

impl RegistryType {
    fn as_str(self) -> &'static str {
        match self {
            RegistryType::Dword => "REG_DWORD",
            RegistryType::Sz => "REG_SZ",
        }
    }
}

/// One validated registry fix: every field already checked, `data` the text `reg add /d` takes and
/// `views` a non-empty subset of `[32, 64]` in that order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValidRegistryFix {
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: RegistryType,
    pub data: String,
    pub views: Vec<u8>,
}

/// How one `reg add` run ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistryRunOutcome {
    /// The command finished with this exit code; `None` is the TS `undefined` (no result or no code).
    Code(Option<i32>),
    /// The run saw its cancel and killed the child it had started (its pid when it knows it).
    Killed(Option<u32>),
    /// The run saw its cancel with no running child to kill.
    Cancelled,
    /// The run failed; the text is the error's message (the TS logged `Error: <message>`).
    Failed(String),
}

/// What a [`RegistryRun`] returns: borrowed from the run, so a run can hold its context by reference.
pub type RunFuture<'a> = Pin<Box<dyn Future<Output = RegistryRunOutcome> + Send + 'a>>;

/// The seam one `reg add` runs through. The run must end its child when `cancel` fires and then answer
/// [`RegistryRunOutcome::Killed`] or [`RegistryRunOutcome::Cancelled`].
pub trait RegistryRun: Send + Sync {
    fn run(&self, command_parts: Vec<String>, cancel: CancellationToken) -> RunFuture<'_>;
}

/// What the wine command is asked with, beyond the command parts and the settings: the proton verb and
/// whether the prefix check is skipped. `wait` is false for every registry fix (`wineserver --wait` can
/// block forever; `reg.exe`'s exit code proves the write).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunOptions {
    pub proton_verb: &'static str,
    pub skip_prefix_check: bool,
}

/// The launcher's (`applyKnownFixProfileRegistry`): `runinprefix`, the prefix check on, because this is
/// the game's real prefix and `verifyWinePrefix` has just run. 'runinprefix' matches the
/// GalaxyCommunication `sc create` call in the same TS function (a prefix-internal tool, not a game).
pub const LAUNCHER_RUN_OPTIONS: RunOptions = RunOptions {
    proton_verb: "runinprefix",
    skip_prefix_check: false,
};

/// The Steam bridge's (`applySteamBridgeKnownFixes`): `run`, the prefix check skipped (the bottle is the
/// bridge's own).
pub const BRIDGE_RUN_OPTIONS: RunOptions = RunOptions {
    proton_verb: "run",
    skip_prefix_check: true,
};

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `s.slice(0, SHOWN_MAX_UNITS)` for text: a character that straddles the cut is dropped (a lone
/// surrogate cannot be written into a Rust string).
pub(crate) fn slice_units(s: &str) -> String {
    let mut units = 0usize;
    let mut out = String::new();
    for c in s.chars() {
        units += c.len_utf16();
        if units > SHOWN_MAX_UNITS {
            break;
        }
        out.push(c);
    }
    out
}

/// `text` with every `scheme://...` run replaced by `<url>`. A rejected entry is echoed into the log, and
/// the file it came from is the operator's: a URL in it (the entry that tried to name a download) must
/// not reach `gamelib.log` (prohibition 1). A URL ends at the quote that closes its JSON string.
pub(crate) fn redact_urls(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(at) = rest.find("://") {
        let scheme_len = rest[..at]
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
            .count();
        let start = at - scheme_len;
        let tail = &rest[at + 3..];
        let end = tail
            .find(|c: char| c == '"' || c == '\\' || c.is_whitespace())
            .unwrap_or(tail.len());
        out.push_str(&rest[..start]);
        out.push_str("<url>");
        rest = &tail[end..];
    }
    out.push_str(rest);
    out
}

/// `String(JSON.stringify(v)).slice(0, 200)`; `undefined` for an absent value.
pub(crate) fn shown(value: Option<&JsValue>) -> String {
    match value {
        None => "undefined".to_string(),
        Some(v) => slice_units(&v.stringify()),
    }
}

/// An object's value under `key`, when the value is an object that has it.
pub(crate) fn member<'a>(value: &'a JsValue, key: &str) -> Option<&'a JsValue> {
    match value {
        JsValue::Object(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
        _ => None,
    }
}

fn forbidden(s: &str) -> bool {
    s.chars().any(|c| matches!(c, '"' | '\r' | '\n' | '\0'))
}

fn registry_root(key: &str) -> Option<&'static str> {
    REGISTRY_ROOTS.iter().copied().find(|r| key.starts_with(r))
}

fn valid_key(value: Option<&JsValue>) -> Option<&str> {
    let Some(JsValue::String(key)) = value else {
        return None;
    };
    if utf16_len(key) > 512 || forbidden(key) {
        return None;
    }
    let root = registry_root(key)?;
    let rest = &key[root.len()..];
    if rest.is_empty() || rest.ends_with('\\') || rest.split('\\').any(str::is_empty) {
        return None;
    }
    Some(key)
}

/// `[32, 64]` when absent; the given views as a sorted, de-duplicated subset when every one is 32 or 64;
/// `None` for anything else, an empty list included.
fn parse_views(value: Option<&JsValue>) -> Option<Vec<u8>> {
    let Some(value) = value else {
        return Some(vec![32, 64]);
    };
    let JsValue::Array(items) = value else {
        return None;
    };
    if items.is_empty() {
        return None;
    }
    let mut views = Vec::new();
    for item in items {
        let JsValue::Number(n) = item else {
            return None;
        };
        match n.as_f64() {
            Some(32.0) => views.push(32u8),
            Some(64.0) => views.push(64u8),
            _ => return None,
        }
    }
    let mut out = Vec::new();
    if views.contains(&32) {
        out.push(32);
    }
    if views.contains(&64) {
        out.push(64);
    }
    Some(out)
}

/// A JSON number that is an integer in `0..=0xffffffff`, as its decimal text.
fn dword_text(value: Option<&JsValue>) -> Option<String> {
    let Some(JsValue::Number(n)) = value else {
        return None;
    };
    let f = n.as_f64()?;
    if !f.is_finite() || f.fract() != 0.0 || !(0.0..=4_294_967_295.0).contains(&f) {
        return None;
    }
    Some((f as u64).to_string())
}

/// Validates raw `registry` entries; never fails, warns once per reject (`validateRegistryFixes`).
pub fn validate_registry_fixes(
    ctx: &KnownFixCtx,
    raw: Option<&JsValue>,
    label: &str,
) -> Vec<ValidRegistryFix> {
    let Some(JsValue::Array(entries)) = raw else {
        ctx.log_warn(&format!("{label}: ignoring registry fixes, not an array"));
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries {
        let reject = |why: &str| {
            ctx.log_warn(&format!(
                "{label}: skipping invalid registry fix ({why}): {}",
                shown(Some(entry))
            ));
        };
        if !matches!(entry, JsValue::Object(_)) {
            reject("not an object");
            continue;
        }
        let Some(key) = valid_key(member(entry, "key")) else {
            reject("bad key");
            continue;
        };
        let name = match member(entry, "name") {
            Some(JsValue::String(name))
                if !name.is_empty()
                    && utf16_len(name) <= 256
                    && !name.starts_with('/')
                    && !forbidden(name) =>
            {
                name
            }
            _ => {
                reject("bad name");
                continue;
            }
        };
        let value = member(entry, "value");
        let (kind, data) = match member(entry, "type") {
            Some(JsValue::String(t)) if t == "REG_DWORD" => match dword_text(value) {
                Some(data) => (RegistryType::Dword, data),
                None => {
                    reject("bad REG_DWORD value");
                    continue;
                }
            },
            Some(JsValue::String(t)) if t == "REG_SZ" => match value {
                Some(JsValue::String(text)) if utf16_len(text) <= 1024 && !forbidden(text) => {
                    (RegistryType::Sz, text.clone())
                }
                _ => {
                    reject("bad REG_SZ value");
                    continue;
                }
            },
            _ => {
                reject("unknown type");
                continue;
            }
        };
        let Some(views) = parse_views(member(entry, "views")) else {
            reject("bad views");
            continue;
        };
        out.push(ValidRegistryFix {
            key: key.to_string(),
            name: name.clone(),
            kind,
            data,
            views,
        });
    }
    out
}

const DLL_OVERRIDE_MODES: [&str; 5] = [
    "native",
    "builtin",
    "native,builtin",
    "builtin,native",
    "disabled",
];

/// `/^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,250}\.exe$/i`.
fn valid_dll_override_exe(exe: &str) -> bool {
    let Some(stem) = exe
        .len()
        .checked_sub(4)
        .and_then(|at| exe.get(..at).zip(exe.get(at..)))
        .and_then(|(stem, ext)| ext.eq_ignore_ascii_case(".exe").then_some(stem))
    else {
        return false;
    };
    let mut chars = stem.chars();
    let first_ok = chars.next().is_some_and(|c| c.is_ascii_alphanumeric());
    let rest_ok = stem
        .chars()
        .skip(1)
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '.' | '_' | '(' | ')' | '+' | '-'));
    first_ok && rest_ok && stem.chars().count() <= 251
}

/// `/^[A-Za-z0-9_+-][A-Za-z0-9_.+-]{0,63}$/` and not `/\.dll$/i`.
fn valid_dll_name(dll: &str) -> bool {
    let mut chars = dll.chars();
    let first_ok = chars
        .next()
        .is_some_and(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '+' | '-'));
    let rest_ok = dll
        .chars()
        .skip(1)
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '+' | '-'));
    let ends_dll = dll.len() >= 4
        && dll
            .get(dll.len() - 4..)
            .is_some_and(|ext| ext.eq_ignore_ascii_case(".dll"));
    first_ok && rest_ok && dll.chars().count() <= 64 && !ends_dll
}

/// A raw registry entry as the compiler writes it: `key`, `name`, `type`, `value`, `views`.
fn raw_entry(key: String, name: &str, value: &str) -> JsValue {
    JsValue::Object(vec![
        ("key".to_string(), JsValue::String(key)),
        ("name".to_string(), JsValue::String(name.to_string())),
        ("type".to_string(), JsValue::String("REG_SZ".to_string())),
        ("value".to_string(), JsValue::String(value.to_string())),
        (
            "views".to_string(),
            JsValue::Array(vec![JsValue::Number(Number::from(64))]),
        ),
    ])
}

/// Compiles tier-2 `dllOverrides` to raw registry entries under
/// `HKCU\Software\Wine\AppDefaults\<exe>\DllOverrides`. They still go through
/// [`validate_registry_fixes`]. Never fails; an invalid part is skipped with a warning
/// (`dllOverridesToRegistryFixes`).
pub fn dll_overrides_to_registry_fixes(
    ctx: &KnownFixCtx,
    raw: Option<&JsValue>,
    label: &str,
) -> Vec<JsValue> {
    let Some(JsValue::Array(entries)) = raw else {
        ctx.log_warn(&format!("{label}: ignoring dllOverrides, not an array"));
        return Vec::new();
    };
    let warn = |why: &str, v: Option<&JsValue>| {
        ctx.log_warn(&format!(
            "{label}: skipping invalid dllOverrides ({why}): {}",
            shown(v)
        ));
    };
    let mut out = Vec::new();
    for entry in entries {
        if !matches!(entry, JsValue::Object(_)) {
            warn("entry not an object", Some(entry));
            continue;
        }
        let exe = member(entry, "exe");
        let Some(JsValue::String(exe_name)) = exe else {
            warn("bad exe", exe);
            continue;
        };
        if !valid_dll_override_exe(exe_name) {
            warn("bad exe", exe);
            continue;
        }
        let dlls = member(entry, "dlls");
        let Some(JsValue::Object(dll_entries)) = dlls.filter(|d| match d {
            JsValue::Object(entries) => !entries.is_empty(),
            _ => false,
        }) else {
            warn("dlls not a non-empty object", dlls);
            continue;
        };
        for (dll, mode) in dll_entries {
            if !valid_dll_name(dll) {
                warn("bad dll name", Some(&JsValue::String(dll.clone())));
                continue;
            }
            let mode_text = match mode {
                JsValue::String(m) if DLL_OVERRIDE_MODES.contains(&m.as_str()) => m.as_str(),
                other => {
                    warn(&format!("bad mode for {dll}"), Some(other));
                    continue;
                }
            };
            out.push(raw_entry(
                format!("HKCU\\Software\\Wine\\AppDefaults\\{exe_name}\\DllOverrides"),
                dll,
                if mode_text == "disabled" {
                    ""
                } else {
                    mode_text
                },
            ));
        }
    }
    out
}

/// Raw registry fixes for a profile's two keys: `registry` first, then compiled `dllOverrides`. `None`
/// when the profile has neither; the profile's `registry` itself when `dllOverrides` is absent
/// (registry-only stays byte-identical) (`knownFixProfileRegistryFixes`).
pub fn profile_registry_fixes_js(
    ctx: &KnownFixCtx,
    registry: Option<&JsValue>,
    dll_overrides: Option<&JsValue>,
    label: &str,
) -> Option<JsValue> {
    let Some(dll_overrides) = dll_overrides else {
        return registry.cloned();
    };
    let mut base: Vec<JsValue> = Vec::new();
    if let Some(registry) = registry {
        match registry {
            JsValue::Array(items) => base = items.clone(),
            _ => ctx.log_warn(&format!("{label}: ignoring registry fixes, not an array")),
        }
    }
    base.extend(dll_overrides_to_registry_fixes(
        ctx,
        Some(dll_overrides),
        label,
    ));
    Some(JsValue::Array(base))
}

/// [`profile_registry_fixes_js`] over a tier-2 profile as the reader answers it. The reader's values
/// are plain JSON, so a warning that echoes an entry lists its keys in sorted order.
pub fn profile_registry_fixes(
    ctx: &KnownFixCtx,
    profile: &KnownFixProfile,
    label: &str,
) -> Option<JsValue> {
    let registry = profile.registry.as_ref().map(JsValue::from_value);
    let dll = profile.dll_overrides.as_ref().map(JsValue::from_value);
    profile_registry_fixes_js(ctx, registry.as_ref(), dll.as_ref(), label)
}

/// Argv for `reg add`; a vector, never a shell string (`buildRegistryFixCommandParts`).
pub fn command_parts(fix: &ValidRegistryFix, view: u8) -> Vec<String> {
    vec![
        "reg".to_string(),
        "add".to_string(),
        fix.key.clone(),
        "/v".to_string(),
        fix.name.clone(),
        "/t".to_string(),
        fix.kind.as_str().to_string(),
        "/d".to_string(),
        fix.data.clone(),
        format!("/reg:{view}"),
        "/f".to_string(),
    ]
}

fn printable_ascii(s: &str) -> bool {
    s.chars().all(|c| (' '..='~').contains(&c))
}

/// Conservative reader for a Wine `.reg` file: `true` ONLY when the value is certainly present with the
/// same type and data. Any doubt answers `false` (a false "present" is the only real failure mode;
/// `false` just re-runs `reg add`) (`wineRegistryValueIsSet`).
pub fn value_is_set(reg_text: &str, fix: &ValidRegistryFix, view: u8) -> bool {
    let lines: Vec<&str> = reg_text
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect();
    if lines.first() != Some(&"WINE REGISTRY Version 2") {
        return false;
    }
    let mut arch: Option<&str> = None;
    for line in &lines {
        if line.starts_with('[') {
            break;
        }
        if *line == "#arch=win32" {
            arch = Some("win32");
        } else if *line == "#arch=win64" {
            arch = Some("win64");
        }
    }
    let Some(arch) = arch else {
        return false;
    };

    let Some(root) = registry_root(&fix.key) else {
        return false;
    };
    let segments: Vec<&str> = fix.key[root.len()..].split('\\').collect();
    let is_hklm = root == "HKLM\\" || root == "HKEY_LOCAL_MACHINE\\";

    let mapped: Vec<String> = match (arch, view) {
        ("win64", 64) | ("win32", 32) => segments.iter().map(|s| s.to_string()).collect(),
        ("win64", 32) => {
            let top = segments.first();
            let sub = segments.get(1);
            if !is_hklm
                || !top.is_some_and(|t| t.eq_ignore_ascii_case("software"))
                || sub.map_or(true, |s| s.eq_ignore_ascii_case("classes"))
                || segments
                    .iter()
                    .any(|s| s.eq_ignore_ascii_case("wow6432node"))
            {
                return false;
            }
            let mut mapped = vec!["Software".to_string(), "Wow6432Node".to_string()];
            mapped.extend(segments.iter().skip(1).map(|s| s.to_string()));
            mapped
        }
        _ => return false,
    };

    if mapped
        .iter()
        .map(String::as_str)
        .chain(std::iter::once(fix.name.as_str()))
        .any(|s| !printable_ascii(s) || s.contains('[') || s.contains(']'))
    {
        return false;
    }

    let header = format!("[{}]", mapped.join("\\\\")).to_lowercase();
    let section_start = lines.iter().position(|l| {
        if !l.starts_with('[') {
            return false;
        }
        match l.find(']') {
            Some(close) if close > 0 => l[..=close].to_lowercase() == header,
            _ => false,
        }
    });
    let Some(section_start) = section_start else {
        return false;
    };

    let mut body: Vec<&str> = Vec::new();
    for l in &lines[section_start + 1..] {
        if l.starts_with('[') {
            break;
        }
        if l.starts_with('#') {
            continue;
        }
        if l.ends_with('\\') {
            return false;
        }
        body.push(l);
    }

    let name_prefix = format!("\"{}\"=", fix.name.replace('\\', "\\\\")).to_lowercase();
    let Some(value_line) = body
        .iter()
        .find(|l| l.to_lowercase().starts_with(&name_prefix))
    else {
        return false;
    };
    let stored: String = value_line
        .chars()
        .skip(name_prefix.chars().count())
        .collect();

    match fix.kind {
        RegistryType::Dword => {
            let Some(hex) = stored.strip_prefix("dword:") else {
                return false;
            };
            if hex.len() != 8 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
                return false;
            }
            let Ok(parsed) = u32::from_str_radix(hex, 16) else {
                return false;
            };
            // `Number(fix.data)`: the data is the validated decimal text of the value.
            let wanted = if fix.data.trim().is_empty() {
                Some(0.0)
            } else {
                fix.data.trim().parse::<f64>().ok()
            };
            wanted == Some(f64::from(parsed))
        }
        RegistryType::Sz => {
            if !printable_ascii(&fix.data) {
                return false;
            }
            let chars: Vec<char> = stored.chars().collect();
            if chars.len() < 2 || chars[0] != '"' || chars[chars.len() - 1] != '"' {
                return false;
            }
            let inner = &chars[1..chars.len() - 1];
            let mut out = String::new();
            let mut i = 0;
            while i < inner.len() {
                match inner[i] {
                    '\\' => match inner.get(i + 1) {
                        Some(&n) if n == '\\' || n == '"' => {
                            out.push(n);
                            i += 2;
                        }
                        _ => return false,
                    },
                    '"' => return false,
                    c => {
                        out.push(c);
                        i += 1;
                    }
                }
            }
            out == fix.data
        }
    }
}

/// The Wine prefix directory holding `system.reg` and `user.reg` for a game's settings, or `None` when
/// unknown (no skip, the old behaviour) (`knownFixPrefixDir`). `game_settings` is the settings object as
/// the renderer holds it: only `wineVersion.type`, `winePrefix` and `wineCrossoverBottle` are read.
pub fn prefix_dir(user_home: &Path, game_settings: &Value) -> Option<PathBuf> {
    let text = |key: &str| game_settings.get(key).and_then(Value::as_str);
    let kind = game_settings
        .get("wineVersion")
        .and_then(|v| v.get("type"))
        .and_then(Value::as_str);
    if kind == Some("crossover") {
        let bottle = text("wineCrossoverBottle").filter(|b| !b.is_empty())?;
        // Mirrors steam/bottle.ts getBottleDir without importing that module.
        return Some(normalize(
            &user_home
                .join("Library/Application Support/CrossOver/Bottles")
                .join(bottle),
        ));
    }
    let prefix = text("winePrefix").filter(|p| !p.is_empty())?;
    match kind {
        Some("proton") => Some(normalize(&Path::new(prefix).join("pfx"))),
        Some("wine" | "toolkit") => Some(PathBuf::from(prefix)),
        _ => None,
    }
}

/// Which Wine registry file in the prefix holds this fix's hive.
fn registry_file_for(prefix_dir: &Path, fix: &ValidRegistryFix) -> Option<PathBuf> {
    let root = registry_root(&fix.key)?;
    match root {
        "HKLM\\" | "HKEY_LOCAL_MACHINE\\" => Some(prefix_dir.join("system.reg")),
        _ => Some(prefix_dir.join("user.reg")),
    }
}

/// The text of a registry file, read once per application; `None` for a file that cannot be read.
fn read_reg(cache: &mut HashMap<PathBuf, Option<String>>, file: &Path) -> Option<String> {
    cache
        .entry(file.to_path_buf())
        .or_insert_with(|| {
            std::fs::read(file)
                .ok()
                .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        })
        .clone()
}

/// What happened to one (fix, view), once it was started.
enum Settled {
    Done(RegistryRunOutcome),
    TimedOut,
}

/// Validates and writes every registry fix, one run per (fix, view), each bounded by
/// [`REGISTRY_FIX_TIMEOUT`]. A value already present in `prefix_dir`'s registry files is skipped. A
/// timed-out `reg add` is cancelled through its token (the run kills the child's group). Never fails:
/// failures warn and the caller carries on (`applyRegistryFixes`). Once shutdown has begun nothing more
/// is started.
pub async fn apply_registry_fixes(
    ctx: &KnownFixCtx,
    raw: Option<&JsValue>,
    label: &str,
    run: &dyn RegistryRun,
    prefix_dir: Option<&Path>,
) {
    let shutdown = ctx.engine.shutdown.token();
    let mut cache: HashMap<PathBuf, Option<String>> = HashMap::new();
    for fix in validate_registry_fixes(ctx, raw, label) {
        for &view in &fix.views {
            if shutdown.is_cancelled() {
                return;
            }
            let at = format!("{} {} (/reg:{view})", fix.key, fix.name);
            if let Some(dir) = prefix_dir.filter(|d| !d.as_os_str().is_empty()) {
                let file = registry_file_for(dir, &fix);
                let text = file.as_deref().and_then(|f| read_reg(&mut cache, f));
                if let (Some(file), Some(text)) = (file, text) {
                    if value_is_set(&text, &fix, view) {
                        let base = file.file_name().map(|n| n.to_string_lossy().into_owned());
                        ctx.log_info(&format!(
                            "{label}: registry fix {at} already set in {}, skipping reg add",
                            base.unwrap_or_default()
                        ));
                        continue;
                    }
                }
            }
            let cancel = shutdown.child_token();
            let mut running = run.run(command_parts(&fix, view), cancel.clone());
            let settled = tokio::select! {
                biased;
                outcome = &mut running => Settled::Done(outcome),
                () = tokio::time::sleep(REGISTRY_FIX_TIMEOUT) => Settled::TimedOut,
            };
            match settled {
                Settled::Done(RegistryRunOutcome::Code(Some(0))) => {}
                Settled::Done(RegistryRunOutcome::Code(code)) => {
                    let code = code.map_or("undefined".to_string(), |c| c.to_string());
                    ctx.log_warn(&format!(
                        "{label}: registry fix {at} did not succeed (code {code})"
                    ));
                }
                Settled::Done(RegistryRunOutcome::Failed(message)) => {
                    ctx.log_warn(&format!(
                        "{label}: registry fix {at} threw: Error: {message}"
                    ));
                }
                Settled::Done(RegistryRunOutcome::Killed(_) | RegistryRunOutcome::Cancelled) => {
                    // Ended by the shutdown token, not by this bound: nothing more is started.
                    if shutdown.is_cancelled() {
                        return;
                    }
                    ctx.log_warn(&format!(
                        "{label}: registry fix {at} did not succeed (code undefined)"
                    ));
                }
                Settled::TimedOut => {
                    cancel.cancel();
                    let after = tokio::time::timeout(CANCEL_GRACE, &mut running).await;
                    let ms = REGISTRY_FIX_TIMEOUT.as_millis();
                    let line = match after {
                        Ok(RegistryRunOutcome::Killed(Some(pid))) => format!(
                            "{label}: registry fix {at} timed out after {ms} ms; killed reg add (pid {pid})"
                        ),
                        Ok(RegistryRunOutcome::Killed(None)) => format!(
                            "{label}: registry fix {at} timed out after {ms} ms; killed reg add"
                        ),
                        _ => format!(
                            "{label}: registry fix {at} timed out (no running child to kill)"
                        ),
                    };
                    ctx.log_warn(&line);
                }
            }
        }
    }
}

/// [`RegistryRun`] over `gamelib-wine`'s command core: each `reg add` is a `run_wine_command` with
/// `wait` false, so the child is whatever the context's spawn seam makes it (a `gamelib-proc` helper in
/// the app, `SpawnClass::Helper`) and the caller's cancel is the command's, which ends the child's group.
pub struct WineRegistryRun {
    wine: Arc<gamelib_wine::ctx::WineCtx>,
    host: WineHost,
    settings: Option<GameSettingsView>,
    options: RunOptions,
}

impl WineRegistryRun {
    /// A run over `wine` for the game settings `game_settings` (the renderer's object). Settings that do
    /// not carry a wine installation the command core can read make every run answer "no exit code", which
    /// the applier warns about per (fix, view), as the TS did for a refused command.
    pub fn new(
        wine: Arc<gamelib_wine::ctx::WineCtx>,
        host: WineHost,
        game_settings: &Value,
        options: RunOptions,
    ) -> WineRegistryRun {
        let settings = serde_json::from_value(game_settings.clone()).ok();
        WineRegistryRun {
            wine,
            host,
            settings,
            options,
        }
    }
}

impl RegistryRun for WineRegistryRun {
    fn run(&self, command_parts: Vec<String>, cancel: CancellationToken) -> RunFuture<'_> {
        Box::pin(async move {
            // Settings without a usable wine: the command core's own "Invalid wine" refusal, which the TS
            // `runWineCommand` answered with no exit code ("did not succeed (code undefined)").
            let Some(settings) = self.settings.clone() else {
                return RegistryRunOutcome::Code(None);
            };
            let args = WineCommandArgs {
                game_settings: Some(settings),
                command_parts,
                wait: false,
                proton_verb: Some(self.options.proton_verb.to_string()),
                skip_prefix_check: self.options.skip_prefix_check,
                ..WineCommandArgs::default()
            };
            let mut host = self.host.clone();
            host.cancel = Some(cancel.clone());
            let result = run_wine_command(&self.wine, args, &host).await;
            if cancel.is_cancelled() && result.ran {
                // The command core ended the child's group on the cancel; the spawn seam does not report
                // its pid.
                return RegistryRunOutcome::Killed(None);
            }
            if result.ran {
                RegistryRunOutcome::Code(result.code)
            } else {
                RegistryRunOutcome::Code(None)
            }
        })
    }
}

/// The launcher's [`WineRegistryRun`] over the context's wine core, or `None` when none is installed.
fn wine_run(
    ctx: &KnownFixCtx,
    game_settings: &Value,
    options: RunOptions,
) -> Option<WineRegistryRun> {
    let wine = ctx.wine.as_ref()?;
    Some(WineRegistryRun::new(
        Arc::clone(wine),
        ctx.wine_host.clone(),
        game_settings,
        options,
    ))
}

/// The refusal of a registry op before the wine core is installed (the shell answers `<op>:not-ready`).
pub const NOT_READY: &str = "not-ready";

/// The non-Steam launch hook over the context's wine core (`applyKnownFixProfileRegistry`): the profile
/// is read, its registry and dllOverrides applied to the game's own prefix, every `reg add` a helper
/// through the spawn seam. `Err(NOT_READY)` when no wine core is installed.
pub async fn apply_known_fix_profile_registry(
    ctx: &KnownFixCtx,
    app_name: &str,
    runner: Runner,
    game_settings: &Value,
) -> Result<(), &'static str> {
    let run = wine_run(ctx, game_settings, LAUNCHER_RUN_OPTIONS).ok_or(NOT_READY)?;
    apply_known_fix_profile_registry_with(ctx, app_name, runner, game_settings, &run).await;
    Ok(())
}

/// [`apply_bridge_registry_fixes`] over a given run: the Steam tier-2 profile is read here (the one owner
/// of the fix data), its registry then dllOverrides applied into the bridge's bottle through `run`, with
/// the values already in `bottle_dir`'s registry files skipped. A game with no profile, or a profile with
/// neither key, is a no-op.
pub async fn apply_bridge_registry_fixes_with(
    ctx: &KnownFixCtx,
    app_id: &str,
    label: &str,
    run: &dyn RegistryRun,
    bottle_dir: Option<&Path>,
) {
    let Some(profile) = reader::read_known_fix_profile(ctx, app_id, Runner::Steam) else {
        return;
    };
    let Some(raw) = profile_registry_fixes(ctx, &profile, label) else {
        return;
    };
    apply_registry_fixes(ctx, Some(&raw), label, run, bottle_dir).await;
}

/// The Steam bridge's registry step (`applySteamBridgeKnownFixes`): `wait` false, protonVerb `run`, the
/// prefix check skipped, the bottle at `bottle_dir`. `label` names the game in the log (`Steam <appId>`).
/// `Err(NOT_READY)` when no wine core is installed.
pub async fn apply_bridge_registry_fixes(
    ctx: &KnownFixCtx,
    app_id: &str,
    label: &str,
    game_settings: &Value,
    bottle_dir: Option<&Path>,
) -> Result<(), &'static str> {
    let run = wine_run(ctx, game_settings, BRIDGE_RUN_OPTIONS).ok_or(NOT_READY)?;
    apply_bridge_registry_fixes_with(ctx, app_id, label, &run, bottle_dir).await;
    Ok(())
}

/// The non-Steam launch hook: applies the game's tier-2 profile `registry` and `dllOverrides` to its own
/// Wine prefix through `run`, on every launch (`applyKnownFixProfileRegistry`). The prefix check is NOT
/// skipped by the production run: this is the game's real prefix and `verifyWinePrefix` has just run.
pub async fn apply_known_fix_profile_registry_with(
    ctx: &KnownFixCtx,
    app_name: &str,
    runner: Runner,
    game_settings: &Value,
    run: &dyn RegistryRun,
) {
    let label = format!("{} {app_name}", runner.as_str());
    let Some(profile) = reader::read_known_fix_profile(ctx, app_name, runner) else {
        return;
    };
    let Some(raw) = profile_registry_fixes(ctx, &profile, &label) else {
        return;
    };
    let dir = prefix_dir(&ctx.engine.paths.user_home, game_settings);
    apply_registry_fixes(ctx, Some(&raw), &label, run, dir.as_deref()).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_dll_exe_name_matches_the_ts_pattern_at_its_edges() {
        assert!(valid_dll_override_exe("a.exe"));
        assert!(valid_dll_override_exe("My Game (x64)+1_2-3.EXE"));
        assert!(valid_dll_override_exe(&format!("a{}.exe", "b".repeat(250))));
        assert!(!valid_dll_override_exe(&format!(
            "a{}.exe",
            "b".repeat(251)
        )));
        assert!(!valid_dll_override_exe(".exe"));
        assert!(!valid_dll_override_exe("-a.exe"));
        assert!(!valid_dll_override_exe("a/b.exe"));
        assert!(!valid_dll_override_exe("a.exe "));
        assert!(!valid_dll_override_exe("é.exe"));
        assert!(!valid_dll_override_exe("exe"));
    }

    #[test]
    fn a_dll_name_is_bounded_and_never_ends_in_dll() {
        assert!(valid_dll_name("d3d9"));
        assert!(valid_dll_name("_a.b"));
        assert!(valid_dll_name(&"a".repeat(64)));
        assert!(!valid_dll_name(&"a".repeat(65)));
        assert!(!valid_dll_name("d3d9.DLL"));
        assert!(!valid_dll_name(".a"));
        assert!(!valid_dll_name(""));
    }

    #[test]
    fn views_are_deduplicated_sorted_and_closed_to_32_and_64() {
        let parse = |v: Value| parse_views(Some(&JsValue::from_value(&v)));
        assert_eq!(parse_views(None), Some(vec![32, 64]));
        assert_eq!(parse(json!([64, 32, 64])), Some(vec![32, 64]));
        assert_eq!(parse(json!([64.0])), Some(vec![64]));
        assert_eq!(parse(json!([])), None);
        assert_eq!(parse(json!([16])), None);
        assert_eq!(parse(json!("64")), None);
        assert_eq!(parse(Value::Null), None);
    }

    #[test]
    fn a_dword_is_an_integer_in_the_unsigned_32_bit_range() {
        let text = |v: Value| dword_text(Some(&JsValue::from_value(&v)));
        assert_eq!(text(json!(0)), Some("0".to_string()));
        assert_eq!(text(json!(4294967295u64)), Some("4294967295".to_string()));
        assert_eq!(text(json!(1e3)), Some("1000".to_string()));
        assert_eq!(text(json!(4294967296u64)), None);
        assert_eq!(text(json!(-1)), None);
        assert_eq!(text(json!(1.5)), None);
        assert_eq!(text(json!("1")), None);
        assert_eq!(dword_text(None), None);
    }

    #[test]
    fn a_shown_value_is_cut_at_200_utf16_units() {
        let long = JsValue::String("x".repeat(500));
        assert_eq!(shown(Some(&long)).chars().count(), 200);
        // The opening quote is one unit and an astral character two: the cut never splits one, so 99
        // characters fit (199 units) and the hundredth would pass 200.
        let astral = JsValue::String("😀".repeat(200));
        let cut = shown(Some(&astral));
        assert_eq!(cut.encode_utf16().count(), 199);
        assert_eq!(shown(None), "undefined");
    }

    #[test]
    fn the_prefix_directory_follows_the_wine_type() {
        let home = Path::new("/home/u");
        let dir = |v: Value| prefix_dir(home, &v);
        assert_eq!(
            dir(json!({"winePrefix": "/x", "wineVersion": {"type": "proton"}})),
            Some(PathBuf::from("/x/pfx"))
        );
        assert_eq!(
            dir(json!({"winePrefix": "/x", "wineVersion": {"type": "wine"}})),
            Some(PathBuf::from("/x"))
        );
        assert_eq!(
            dir(json!({"wineCrossoverBottle": "B", "wineVersion": {"type": "crossover"}})),
            Some(PathBuf::from(
                "/home/u/Library/Application Support/CrossOver/Bottles/B"
            ))
        );
        assert_eq!(
            dir(json!({"winePrefix": "/x", "wineVersion": {"type": "crossover"}})),
            None
        );
        assert_eq!(dir(json!({"winePrefix": "/x"})), None);
    }

    #[test]
    fn the_command_parts_are_an_argv_vector_with_the_data_as_one_element() {
        let fix = ValidRegistryFix {
            key: "HKCU\\Software\\Foo".to_string(),
            name: "Path".to_string(),
            kind: RegistryType::Sz,
            data: "C:\\Games\\x y; rm -rf /".to_string(),
            views: vec![64],
        };
        let parts = command_parts(&fix, 64);
        assert_eq!(parts.len(), 11);
        assert_eq!(parts[8], "C:\\Games\\x y; rm -rf /");
        assert_eq!(parts[9], "/reg:64");
    }
}
