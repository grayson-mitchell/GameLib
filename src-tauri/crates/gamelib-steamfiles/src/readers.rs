//! Typed readers for the Valve client manifest and installscript.vdf (plan 75-08), plus
//! registry.vdf and localconfig.vdf. Unreadable / malformed input is a RESULT, never an error.

use crate::kv_text::{self, Limits, MergedMap, MergedValue, Pair, Value};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const MAX_VALVE_MANIFEST_BYTES: u64 = 512 * 1024;
const MAX_VALVE_PACKAGE_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValvePackage {
    pub manifest_version: String,
    pub file: String,
    pub sha2: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValveManifestResult {
    pub ok: bool,
    pub reason: Option<String>,
    pub pkg: Option<ValvePackage>,
}

fn fail(reason: &str) -> ValveManifestResult {
    ValveManifestResult {
        ok: false,
        reason: Some(reason.to_string()),
        pkg: None,
    }
}

fn contains(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

fn is_lower_hex(s: &str, n: usize) -> bool {
    s.len() == n && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn all_digits(s: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_digit())
}

/// Validate a Valve client manifest in the same order as the TS `parseValveClientManifest`:
/// size cap and forbidden-key reject on the raw text BEFORE parse, then the win64 / bins_win64
/// shape checks, with the same reason strings.
pub fn parse_valve_manifest(path: &Path) -> ValveManifestResult {
    match std::fs::metadata(path) {
        Ok(m) if m.len() > MAX_VALVE_MANIFEST_BYTES => return fail("manifest too large"),
        Ok(_) => {}
        Err(_) => return fail("not text"),
    }
    let Ok(bytes) = std::fs::read(path) else {
        return fail("not text");
    };
    if bytes.len() as u64 > MAX_VALVE_MANIFEST_BYTES {
        return fail("manifest too large");
    }
    if std::str::from_utf8(&bytes).is_err() {
        return fail("not text");
    }
    // Rust cannot be prototype-polluted, but the reject is kept for behavioural parity with the
    // TS guard (D-05): the first hit by position wins, as with the TS regex.
    let hit = ["__proto__", "constructor", "prototype"]
        .iter()
        .filter_map(|k| contains(&bytes, format!("\"{k}\"").as_bytes()).map(|p| (p, *k)))
        .min_by_key(|(p, _)| *p);
    if let Some((_, k)) = hit {
        return fail(&format!("forbidden key {k}"));
    }
    let limits = Limits {
        max_bytes: MAX_VALVE_MANIFEST_BYTES as usize,
        max_depth: 64,
    };
    let Ok(pairs) = kv_text::parse(&bytes, &limits) else {
        return fail("manifest did not parse");
    };
    let root = kv_text::merged(&pairs);
    let Some(win64) = root.get("win64") else {
        return fail("no win64 root");
    };
    let win64 = match win64 {
        MergedValue::Map(m) => m,
        MergedValue::Str(_) => return fail("no bins_win64 node"),
    };
    let Some(bins) = win64.get("bins_win64") else {
        return fail("no bins_win64 node");
    };
    let empty = MergedMap::default();
    let bins = match bins {
        MergedValue::Map(m) => m,
        MergedValue::Str(_) => &empty,
    };
    let file = match bins.str("file") {
        Some(f)
            if f.strip_prefix("bins_win64.zip.")
                .is_some_and(|h| is_lower_hex(h, 40)) =>
        {
            f
        }
        _ => return fail("bad bins_win64 file"),
    };
    let Some(sha2) = bins.str("sha2") else {
        return fail("sha2 is not a hex string");
    };
    if !is_lower_hex(&sha2, 64) {
        return fail("bad bins_win64 sha2");
    }
    let size = bins
        .str("size")
        .filter(|s| all_digits(s, 1, 10))
        .and_then(|s| s.parse::<u64>().ok())
        .filter(|n| (1..=MAX_VALVE_PACKAGE_BYTES).contains(n));
    let Some(size) = size else {
        return fail("bad bins_win64 size");
    };
    let version = win64.str("version").unwrap_or_default();
    if !all_digits(&version, 1, 20) {
        return fail("bad manifest version");
    }
    ValveManifestResult {
        ok: true,
        reason: None,
        pkg: Some(ValvePackage {
            manifest_version: version,
            file,
            sha2,
            size,
        }),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallScriptProcess {
    pub process: String,
    pub command: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RequirementOs {
    #[serde(rename = "is64BitWindows")]
    pub is64_bit_windows: Option<String>,
    #[serde(rename = "osType")]
    pub os_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallScriptEntry {
    pub name: String,
    pub has_run_key: Option<String>,
    pub minimum_has_run_value: i64,
    pub processes: Vec<InstallScriptProcess>,
    pub requirement_os: Option<RequirementOs>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallScriptResult {
    pub exists: bool,
    pub entries: Option<Vec<InstallScriptEntry>>,
}

const INSTALLSCRIPT_MAX_BYTES: usize = 1024 * 1024;

/// First case-insensitive string child (ordered view), decoded with only `\\` and `\"` applied
/// so a single-backslash Windows path such as `\ndp48.exe` keeps its `\n` (75 WR-06).
fn child_str(pairs: &[Pair], key: &str) -> Option<String> {
    match &kv_text::find(pairs, key)?.value {
        Value::Str(s) => Some(s.decoded_quote_backslash_only()),
        Value::Map(_) => None,
    }
}

fn child_map<'a>(pairs: &'a [Pair], key: &str) -> Option<&'a [Pair]> {
    match &kv_text::find(pairs, key)?.value {
        Value::Map(m) => Some(m),
        Value::Str(_) => None,
    }
}

/// Parse an installscript.vdf's `Run Process` entries in file order on the ordered view
/// (duplicate keys kept, `[$COND]` ignored). Replaces `parseKv1` / `parseInstallScript`.
pub fn read_installscript(path: &Path) -> InstallScriptResult {
    let Ok(bytes) = std::fs::read(path) else {
        return InstallScriptResult {
            exists: false,
            entries: None,
        };
    };
    InstallScriptResult {
        exists: true,
        entries: installscript_entries(&bytes),
    }
}

fn installscript_entries(bytes: &[u8]) -> Option<Vec<InstallScriptEntry>> {
    let limits = Limits {
        max_bytes: INSTALLSCRIPT_MAX_BYTES,
        max_depth: 64,
    };
    let root = kv_text::parse(bytes, &limits).ok()?;
    let script = child_map(&root, "installscript")?;
    let run = child_map(script, "run process")?;
    let mut entries = Vec::new();
    for node in run {
        let Value::Map(kids) = &node.value else {
            continue;
        };
        let mut processes = Vec::new();
        for i in 1.. {
            let Some(process) = child_str(kids, &format!("process {i}")) else {
                break;
            };
            processes.push(InstallScriptProcess {
                process,
                command: child_str(kids, &format!("command {i}")),
            });
        }
        let min = child_str(kids, "minimumhasrunvalue")
            .and_then(|s| s.trim().parse::<i64>().ok())
            .unwrap_or(1);
        let requirement_os = child_map(kids, "requirement_os").map(|r| RequirementOs {
            is64_bit_windows: child_str(r, "is64bitwindows"),
            os_type: child_str(r, "ostype"),
        });
        entries.push(InstallScriptEntry {
            name: node.key.decoded_quote_backslash_only(),
            has_run_key: child_str(kids, "hasrunkey"),
            minimum_has_run_value: min,
            processes,
            requirement_os,
        });
    }
    Some(entries)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningAppIdResult {
    pub running_app_id: u32,
}

const REGISTRY_MAX_BYTES: usize = 4 * 1024 * 1024;

/// `Registry/HKCU/Software/Valve/Steam/RunningAppID`, case-insensitive; 0 on a missing file, a
/// parse failure or a missing / non-numeric key (runningPoll's fail-soft contract).
pub fn read_running_app_id(path: &Path) -> RunningAppIdResult {
    RunningAppIdResult {
        running_app_id: running_app_id(path).unwrap_or(0),
    }
}

fn running_app_id(path: &Path) -> Option<u32> {
    let bytes = std::fs::read(path).ok()?;
    let limits = Limits {
        max_bytes: REGISTRY_MAX_BYTES,
        max_depth: 64,
    };
    let root = kv_text::merged(&kv_text::parse(&bytes, &limits).ok()?);
    let steam = root
        .map("Registry")?
        .map("HKCU")?
        .map("Software")?
        .map("Valve")?
        .map("Steam")?;
    steam.str("RunningAppID")?.trim().parse().ok()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginUsersOfflineModeResult {
    /// The most recent user's `WantsOfflineMode` ("1" true, any other value false). None when the
    /// file is missing or unparseable, or no user can be picked.
    pub wants_offline_mode: Option<bool>,
}

const LOGINUSERS_MAX_BYTES: usize = 1024 * 1024;

/// Whether the user chose Steam's offline mode, from `config/loginusers.vdf`: Steam saves "Go
/// Offline" (and "Start in Offline Mode") as `WantsOfflineMode "1"` on the account. The user is
/// the one marked `MostRecent "1"`, or the only user when none is marked. Signed in but not
/// logged on with this unset means Steam was signed out (for example "Logged In Elsewhere"), not
/// offline by choice. Fail-soft: every failure is `None`.
pub fn read_loginusers_offline_mode(path: &Path) -> LoginUsersOfflineModeResult {
    LoginUsersOfflineModeResult {
        wants_offline_mode: loginusers_offline_mode(path),
    }
}

fn loginusers_offline_mode(path: &Path) -> Option<bool> {
    let bytes = std::fs::read(path).ok()?;
    let limits = Limits {
        max_bytes: LOGINUSERS_MAX_BYTES,
        max_depth: 16,
    };
    let root = kv_text::merged(&kv_text::parse(&bytes, &limits).ok()?);
    let users: Vec<&MergedMap> = root
        .map("users")?
        .iter()
        .filter_map(|(_, v)| match v {
            MergedValue::Map(m) => Some(m),
            _ => None,
        })
        .collect();
    let user = users
        .iter()
        .find(|u| u.str("MostRecent").is_some_and(|s| s.trim() == "1"))
        .or(if users.len() == 1 {
            users.first()
        } else {
            None
        })?;
    Some(
        user.str("WantsOfflineMode")
            .is_some_and(|s| s.trim() == "1"),
    )
}

const STEAM_HKCU_SUBKEY: &str = "Software\\Valve\\Steam";
const RUNNING_APP_ID_VALUE: &str = "RunningAppID";

/// Reads one REG_DWORD under HKCU. `Ok(None)` is a missing value, `Err(())` any other failure.
#[allow(clippy::result_unit_err)]
pub trait RegistryDword {
    fn hkcu_dword(&self, subkey: &str, value: &str) -> Result<Option<u32>, ()>;
}

/// 0 on a missing value and on any error (runningPoll's fail-soft contract, D-13).
pub fn running_app_id_from(reg: &dyn RegistryDword) -> u32 {
    reg.hkcu_dword(STEAM_HKCU_SUBKEY, RUNNING_APP_ID_VALUE)
        .ok()
        .flatten()
        .unwrap_or(0)
}

/// The real HKCU reader: the Windows registry API on Windows, always `Ok(None)` elsewhere.
pub struct RealRegistry;

impl RegistryDword for RealRegistry {
    fn hkcu_dword(&self, subkey: &str, value: &str) -> Result<Option<u32>, ()> {
        hkcu_dword_impl(subkey, value)
    }
}

/// `HKCU\Software\Valve\Steam\RunningAppID` read natively (no child process); 0 when missing or on
/// any error.
pub fn read_windows_running_app_id() -> u32 {
    running_app_id_from(&RealRegistry)
}

#[cfg(not(windows))]
fn hkcu_dword_impl(_subkey: &str, _value: &str) -> Result<Option<u32>, ()> {
    Ok(None)
}

#[cfg(windows)]
fn hkcu_dword_impl(subkey: &str, value: &str) -> Result<Option<u32>, ()> {
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

    let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    let (sub, val) = (wide(subkey), wide(value));
    let mut data: u32 = 0;
    let mut bytes = std::mem::size_of::<u32>() as u32;
    // SAFETY: `sub` and `val` are NUL-terminated and outlive the call; `data` is a u32 and
    // `bytes` is its size in bytes, the exact buffer contract RRF_RT_REG_DWORD requires.
    let st = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            sub.as_ptr(),
            val.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&mut data as *mut u32).cast(),
            &mut bytes,
        )
    };
    match st {
        ERROR_SUCCESS => Ok(Some(data)),
        ERROR_FILE_NOT_FOUND => Ok(None),
        _ => Err(()),
    }
}

/// Test hook: the real reader against an arbitrary HKCU subkey.
#[doc(hidden)]
#[allow(clippy::result_unit_err)]
pub fn real_hkcu_dword(subkey: &str, value: &str) -> Result<Option<u32>, ()> {
    hkcu_dword_impl(subkey, value)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfigBetaKeyResult {
    pub beta_key: Option<String>,
}

const LOCALCONFIG_BLOB_MAX_BYTES: usize = 64 * 1024;
const LOCALCONFIG_BLOB_MAX_DEPTH: usize = 8;

fn find_user_app_config(pairs: &[Pair]) -> Option<&[Pair]> {
    for p in pairs {
        if let Value::Map(children) = &p.value {
            if p.key.eq_ignore_ascii_case("UserAppConfig") {
                return Some(children);
            }
            if let Some(found) = find_user_app_config(children) {
                return Some(found);
            }
        }
    }
    None
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    let b = s.as_bytes();
    if b.is_empty() || b.len() % 2 != 0 {
        return None;
    }
    let nib = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    b.chunks(2)
        .map(|c| Some(nib(c[0])? << 4 | nib(c[1])?))
        .collect()
}

/// Read an app's beta branch from localconfig.vdf's first `UserAppConfig` block: the app's value
/// is a hex blob of binary KV whose `UserConfig` map carries `BetaKey`. Replaces both the TS
/// line-regex reader and the hand-rolled binary walker `decodeUserAppConfigBetaKey`.
pub fn read_localconfig_beta_key(path: &Path, app_id: &str) -> LocalConfigBetaKeyResult {
    LocalConfigBetaKeyResult {
        beta_key: localconfig_beta_key(path, app_id),
    }
}

/// SteamID64 of account id 0 (the individual-universe base).
pub const STEAM_ID64_BASE: u64 = 76561197960265728;

/// Size cap for the playtime read of localconfig.vdf. A real Mac Steam file measured about 34 MiB
/// (2026-11-17), so the 64 MiB `Limits::local_file()` leaves too little headroom; the parse uses
/// `Limits { max_bytes: LOCALCONFIG_PLAYTIME_MAX_BYTES as usize, max_depth: 64 }`.
pub const LOCALCONFIG_PLAYTIME_MAX_BYTES: u64 = 128 * 1024 * 1024;

const LOCALCONFIG_PLAYTIME_MAX_ENTRIES: usize = 200_000;

/// Per-app playtime from localconfig.vdf: minutes and unix seconds, each independently optional.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct LocalPlaytime {
    pub playtime_minutes: Option<i64>,
    pub last_played: Option<i64>,
}

/// `<root>/userdata/<accountId>/config/localconfig.vdf` for a SteamID64; None when the id is not
/// a valid individual account (never resolves to the `0` directory). Pure, no filesystem access.
pub fn localconfig_path_for(steam_root: &Path, steam_id64: u64) -> Option<PathBuf> {
    let diff = steam_id64.checked_sub(STEAM_ID64_BASE)?;
    let account = u32::try_from(diff).ok().filter(|a| *a > 0)?;
    Some(
        steam_root
            .join("userdata")
            .join(account.to_string())
            .join("config")
            .join("localconfig.vdf"),
    )
}

/// Fail-soft read of per-app `Playtime` / `LastPlayed` from localconfig.vdf. Every failure is an
/// empty map.
pub fn read_localconfig_playtime(path: &Path) -> BTreeMap<u32, LocalPlaytime> {
    read_localconfig_playtime_capped(path, LOCALCONFIG_PLAYTIME_MAX_BYTES)
}

#[doc(hidden)]
pub fn read_localconfig_playtime_capped(path: &Path, cap: u64) -> BTreeMap<u32, LocalPlaytime> {
    localconfig_playtime(path, cap).unwrap_or_default()
}

fn playtime_field(app: &[Pair], key: &str) -> Option<i64> {
    match &kv_text::find(app, key)?.value {
        Value::Str(s) => s.decoded().trim().parse::<i64>().ok().filter(|v| *v >= 0),
        Value::Map(_) => None,
    }
}

fn localconfig_playtime(path: &Path, cap: u64) -> Option<BTreeMap<u32, LocalPlaytime>> {
    if std::fs::metadata(path).ok()?.len() > cap {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() as u64 > cap {
        return None;
    }
    let limits = Limits {
        max_bytes: cap as usize,
        max_depth: 64,
    };
    let root = kv_text::parse(&bytes, &limits).ok()?;
    let mut cur: &[Pair] = &root;
    for key in ["UserLocalConfigStore", "Software", "Valve", "Steam", "apps"] {
        match &kv_text::find(cur, key)?.value {
            Value::Map(m) => cur = m,
            Value::Str(_) => return None,
        }
    }
    let mut out = BTreeMap::new();
    for pair in cur {
        if out.len() >= LOCALCONFIG_PLAYTIME_MAX_ENTRIES {
            break;
        }
        let key = pair.key.decoded();
        if key.is_empty() || !key.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let Ok(app_id) = key.parse::<u32>() else {
            continue;
        };
        let Value::Map(app) = &pair.value else {
            continue;
        };
        let entry = LocalPlaytime {
            playtime_minutes: playtime_field(app, "Playtime"),
            last_played: playtime_field(app, "LastPlayed"),
        };
        if entry.playtime_minutes.is_some() || entry.last_played.is_some() {
            out.insert(app_id, entry);
        }
    }
    Some(out)
}

fn localconfig_beta_key(path: &Path, app_id: &str) -> Option<String> {
    if app_id.is_empty() || !app_id.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let root = kv_text::parse(&bytes, &Limits::local_file()).ok()?;
    let block = find_user_app_config(&root)?;
    let hex = match &kv_text::find(block, app_id)?.value {
        Value::Str(s) => s.decoded(),
        Value::Map(_) => return None,
    };
    let blob = hex_decode(&hex)?;
    let doc = crate::kv_bin::parse_bin(
        &blob,
        &crate::kv_bin::BinLimits {
            max_bytes: LOCALCONFIG_BLOB_MAX_BYTES,
            max_depth: LOCALCONFIG_BLOB_MAX_DEPTH,
        },
    )
    .ok()?;
    let user_config = doc.root.iter().find_map(|(k, n)| match n {
        crate::kv_bin::BinNode::Map(m) if k == b"UserConfig" => Some(m),
        _ => None,
    })?;
    let key = user_config.iter().find_map(|(k, n)| match n {
        crate::kv_bin::BinNode::Str(s) if k == b"BetaKey" => Some(s),
        _ => None,
    })?;
    let key = String::from_utf8_lossy(key).into_owned();
    crate::acf::is_valid_beta_key(&key).then_some(key)
}
