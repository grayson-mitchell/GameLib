//! The system-information probes and parsers (Phase 88.1, SVC-03; D-24 owner `gamelib-info`), ported
//! from `src/backend/utils/systeminfo/`: the CPU, memory, GPU and operating-system reads that every
//! launch log prints and Settings shows. The goldens (`golden/sysinfo`, 88.1-05) record the TS.
//!
//! - Every probe is one [`gamelib_core::process::ProcSpec`] through the context's `proc` runner (a
//!   Helper, D-21) with the TS's 30 s bound; a missing binary rejects the read where the TS rejected it
//!   and a timeout or a non-zero exit reaches the same fallback.
//! - Everything the TS read from Node (`os.cpus()`, `os.release()`, the os-release file, the
//!   environment) comes through [`host::HostFacts`] (D-13).
//! - A probe failure logs fixed text through the context's log: never a hostname, hardware id, query or
//!   profile path (prohibition 1).

pub mod cache;
pub mod deck;
pub mod dns;
pub mod format;
pub mod gpu;
pub mod host;
pub mod memory;
pub mod os_info;
pub mod pci_ids;
pub mod versions;

use std::fmt;
use std::time::Duration;

use gamelib_core::process::{ProcSpec, SpecOutput};
use serde_json::{json, Value};

use crate::ctx::{InfoCtx, Platform};
use deck::{steam_deck_info, SteamDeckInfo};
use dns::{SystemTxtResolver, TxtResolver};
use format::filesize;
use host::{HostFacts, RealHostFacts};
use memory::{get_memory_info, MemoryInfo};
use os_info::get_os_info;
use pci_ids::GpuInfo;
use versions::{resolve_runner_bins, runner_versions, RunnerBins, SoftwareVersions};

/// `genericSpawnWrapper`'s default bound for a system probe (`DEFAULT_TIMEOUT_MS`).
pub const PROBE_TIMEOUT: Duration = Duration::from_millis(30_000);

/// Why a system-information read failed outright (the TS rejected the whole promise).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProbeError {
    /// A probe's program could not be started (the TS: `spawn <program> ENOENT`). Names the program,
    /// a fixed identifier of this crate's, never anything the system answered.
    Spawn(String),
    /// The host reported no CPU (`os.cpus() returned no CPUs`).
    NoCpus,
    /// The read this call was waiting on was dropped before it answered (the application began to exit);
    /// the TS had no such case, its in-flight promise always settled.
    Cancelled,
}

impl fmt::Display for ProbeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProbeError::Spawn(program) => write!(f, "spawn {program} failed"),
            ProbeError::NoCpus => f.write_str("os.cpus() returned no CPUs"),
            ProbeError::Cancelled => f.write_str("the system information read was cancelled"),
        }
    }
}

impl std::error::Error for ProbeError {}

/// Whether `out` says the program never started. The shell's runner reports that as no exit code, no
/// timeout and no cancellation, with a `spawn <program>: ...` stderr (a child ended by a signal has no
/// code either but a different stderr).
fn spawn_failed(out: &SpecOutput) -> bool {
    out.code.is_none() && !out.timed_out && !out.cancelled && out.stderr.starts_with("spawn ")
}

/// Runs one probe through the context's runner: empty stdin, the TS timeout, `env` added to the
/// inherited environment. `Err` only when the program could not be started; a timeout and a non-zero
/// exit come back as the output they left, as the TS wrapper resolved them.
pub(crate) async fn run_probe(
    ctx: &InfoCtx,
    label: &'static str,
    program: &str,
    argv: &[&str],
    env: &[(&str, &str)],
    hide_window: bool,
) -> Result<SpecOutput, ProbeError> {
    run_probe_bounded(ctx, label, program, argv, env, hide_window, PROBE_TIMEOUT).await
}

/// [`run_probe`] with a bound of its own (the comet version probe's 5 s).
pub(crate) async fn run_probe_bounded(
    ctx: &InfoCtx,
    label: &'static str,
    program: &str,
    argv: &[&str],
    env: &[(&str, &str)],
    hide_window: bool,
    timeout: Duration,
) -> Result<SpecOutput, ProbeError> {
    let mut spec = ProcSpec::new(label, program);
    spec.argv = argv.iter().map(|a| (*a).to_string()).collect();
    spec.env = env
        .iter()
        .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
        .collect();
    spec.stdin = Some(String::new());
    spec.timeout = Some(timeout);
    spec.hide_window = hide_window;
    let out = ctx.proc.run(spec, None).await;
    if spawn_failed(&out) {
        return Err(ProbeError::Spawn(program.to_string()));
    }
    Ok(out)
}

/// `process.platform` of a platform the shell reports.
pub fn node_platform(platform: Platform) -> &'static str {
    match platform {
        Platform::Linux => "linux",
        Platform::Mac => "darwin",
        Platform::Windows => "win32",
    }
}

/// What the machine probes of `fetchSystemInfo` learn: everything in `SystemInformation` except the
/// software versions and the formatted sizes.
#[derive(Debug, Clone, PartialEq)]
pub struct SystemProbe {
    pub cpu_model: String,
    pub cores: usize,
    pub memory: MemoryInfo,
    pub gpus: Vec<GpuInfo>,
    pub os_platform: &'static str,
    pub os_name: String,
    pub os_version: String,
    pub steam_deck: SteamDeckInfo,
    pub is_flatpak: bool,
    pub is_app_image: bool,
}

impl SystemProbe {
    /// The TS object's fields this part fills: `CPU`, the sizes of `memory`, `GPUs`, `OS`,
    /// `steamDeckInfo`, `isFlatpak` and `isAppImage`.
    pub fn to_value(&self) -> Value {
        json!({
            "CPU": { "model": self.cpu_model, "cores": self.cores },
            "memory": { "total": self.memory.total, "used": self.memory.used },
            "GPUs": self.gpus.iter().map(GpuInfo::to_value).collect::<Vec<_>>(),
            "OS": {
                "platform": self.os_platform,
                "version": self.os_version,
                "name": self.os_name,
            },
            "steamDeckInfo": self.steam_deck.to_value(),
            "isFlatpak": self.is_flatpak,
            "isAppImage": self.is_app_image,
        })
    }
}

/// The machine probes before the host's CPU list is checked: the CPU models are still a list.
struct ProbeParts {
    cpus: Vec<String>,
    memory: MemoryInfo,
    gpus: Vec<GpuInfo>,
    os_name: String,
    os_version: String,
    steam_deck: SteamDeckInfo,
    is_flatpak: bool,
    is_app_image: bool,
}

/// The probes of `fetchSystemInfo` in the TS's order: the CPU list, memory, GPUs, the operating system and
/// the Steam Deck check. The first probe that cannot start rejects the whole read.
async fn probe_parts(
    ctx: &InfoCtx,
    host: &dyn HostFacts,
    resolver: &dyn TxtResolver,
) -> Result<ProbeParts, ProbeError> {
    let cpus = host.cpu_models();
    let memory = get_memory_info(ctx, host).await?;
    let gpus = gpu::get_gpu_info(ctx, resolver).await;
    let os = get_os_info(ctx, host).await?;
    let steam_deck = steam_deck_info(
        cpus.first().map(String::as_str),
        &gpus,
        host.steam_deck_game_mode(),
    );
    Ok(ProbeParts {
        cpus,
        memory,
        gpus,
        // `os.release()` unless the detailed probe found a version of its own.
        os_version: os.version.unwrap_or_else(|| host.release()),
        os_name: os.name,
        steam_deck,
        is_flatpak: host.flatpak_id().is_some_and(|id| !id.is_empty()),
        is_app_image: host.appimage().is_some_and(|path| !path.is_empty()),
    })
}

impl ProbeParts {
    /// The check the TS ran last: a host that listed no CPU rejects the read.
    fn into_probe(self, platform: Platform) -> Result<SystemProbe, ProbeError> {
        let Some(first_cpu) = self.cpus.first() else {
            return Err(ProbeError::NoCpus);
        };
        Ok(SystemProbe {
            cpu_model: first_cpu.clone(),
            cores: self.cpus.len(),
            memory: self.memory,
            gpus: self.gpus,
            os_platform: node_platform(platform),
            os_name: self.os_name,
            os_version: self.os_version,
            steam_deck: self.steam_deck,
            is_flatpak: self.is_flatpak,
            is_app_image: self.is_app_image,
        })
    }
}

/// The machine probes alone (no version probes): the 88.1-09 slice of the read.
pub async fn probe_system(
    ctx: &InfoCtx,
    host: &dyn HostFacts,
    resolver: &dyn TxtResolver,
) -> Result<SystemProbe, ProbeError> {
    probe_parts(ctx, host, resolver)
        .await?
        .into_probe(ctx.platform)
}

/// `SystemInformation`: the probe, the two formatted sizes and the software versions.
#[derive(Debug, Clone, PartialEq)]
pub struct SystemInformation {
    pub probe: SystemProbe,
    pub total_formatted: String,
    pub used_formatted: String,
    pub software: SoftwareVersions,
}

impl SystemInformation {
    /// The renderer's `SystemInformation` object.
    pub fn to_value(&self) -> Value {
        let mut value = self.probe.to_value();
        if let Some(fields) = value.as_object_mut() {
            if let Some(memory) = fields.get_mut("memory").and_then(Value::as_object_mut) {
                memory.insert("totalFormatted".into(), json!(self.total_formatted));
                memory.insert("usedFormatted".into(), json!(self.used_formatted));
            }
            fields.insert("softwareInUse".into(), self.software.to_value());
        }
        value
    }
}

/// `fetchSystemInfo`: the machine probes, then the four version probes together, and last the check that
/// the host listed a CPU at all (so a host with none still runs the version probes first, as the TS did).
pub async fn fetch_system_info(
    ctx: &InfoCtx,
    host: &dyn HostFacts,
    resolver: &dyn TxtResolver,
    bins: &RunnerBins,
) -> Result<SystemInformation, ProbeError> {
    let parts = probe_parts(ctx, host, resolver).await?;
    let software = runner_versions(ctx, bins).await;
    let probe = parts.into_probe(ctx.platform)?;
    Ok(SystemInformation {
        total_formatted: filesize(probe.memory.total as f64, true),
        used_formatted: filesize(probe.memory.used as f64, true),
        probe,
        software,
    })
}

/// `getSystemInfo(cache)` of one context: the production host facts and resolver over [`fetch_system_info`],
/// behind the context's single-flight cache.
pub async fn get_system_info(
    ctx: &InfoCtx,
    cache: bool,
) -> Result<std::sync::Arc<SystemInformation>, ProbeError> {
    let host = RealHostFacts::new(ctx.host_env.clone());
    let resolver = SystemTxtResolver::new(ctx.shutdown.clone());
    ctx.sysinfo
        .get(cache, async {
            let bins = resolve_runner_bins(ctx);
            fetch_system_info(ctx, &host, &resolver, &bins).await
        })
        .await
}

// ---------------------------------------------------------------------------------------------
// The JavaScript text rules the parsers depend on
// ---------------------------------------------------------------------------------------------

/// JS `\s` and the characters `String.prototype.trim` removes: white space and line terminators.
pub(crate) fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{000B}' | '\u{000C}' | '\r' | ' ' | '\u{00A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `String.prototype.trim`.
pub(crate) fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_space)
}

/// The JS line terminators: where a multiline `^` can match and where `.` stops.
pub(crate) fn is_line_terminator(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// Byte offsets where a multiline `^` matches: the start of the text and after each line terminator.
pub(crate) fn line_starts(text: &str) -> Vec<usize> {
    let mut starts = vec![0];
    for (at, c) in text.char_indices() {
        if is_line_terminator(c) {
            starts.push(at + c.len_utf8());
        }
    }
    starts
}

/// What a `(.*)` capture after `key` at the start of some line holds: the text up to the next line
/// terminator of the first line that begins with `key` (`/^KEY(.*)/m`).
pub(crate) fn line_after_key<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    line_starts(text).into_iter().find_map(|start| {
        let rest = text[start..].strip_prefix(key)?;
        let end = rest.find(is_line_terminator).unwrap_or(rest.len());
        Some(&rest[..end])
    })
}

/// The leading run of ASCII digits (`\d*`) and what follows it.
pub(crate) fn split_digits(text: &str) -> (&str, &str) {
    let end = text
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(text.len());
    text.split_at(end)
}

/// `Number(digits)` for a string of ASCII digits, `0` for the empty string (a falsy capture the TS
/// replaces with `0`).
pub(crate) fn digits_to_number(digits: &str) -> f64 {
    if digits.is_empty() {
        return 0.0;
    }
    digits.parse::<f64>().unwrap_or(0.0)
}

/// A non-negative JS number as the whole byte count the formatters and sums take.
pub(crate) fn to_bytes(value: f64) -> u64 {
    if value.is_finite() && value > 0.0 {
        value as u64
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn js_space_covers_the_unicode_spaces_rust_trim_also_removes_and_the_bom_it_does_not() {
        assert!(is_js_space('\u{FEFF}'));
        assert!(is_js_space('\u{00A0}'));
        assert!(is_js_space('\u{2028}'));
        assert!(!is_js_space('\u{200B}'));
        assert_eq!(js_trim("\u{FEFF} a b \r\n"), "a b");
    }

    #[test]
    fn line_starts_follow_every_js_line_terminator() {
        assert_eq!(line_starts("a\nb\r\nc"), vec![0, 2, 4, 5]);
        assert_eq!(line_starts(""), vec![0]);
    }

    #[test]
    fn line_after_key_takes_the_first_matching_line_up_to_its_terminator() {
        let text = "PRETTY_NAME=x\nNAME=\"Ubuntu\"\r\nNAME=second\n";
        assert_eq!(line_after_key(text, "NAME="), Some("\"Ubuntu\""));
        assert_eq!(line_after_key(text, "VERSION="), None);
        assert_eq!(line_after_key("NAME=", "NAME="), Some(""));
    }

    #[test]
    fn spawn_failure_is_told_from_a_signal_a_timeout_and_a_cancel() {
        let failed = SpecOutput {
            stderr: "spawn free: not found".to_string(),
            ..SpecOutput::default()
        };
        assert!(spawn_failed(&failed));
        assert!(!spawn_failed(&SpecOutput::default()));
        assert!(!spawn_failed(&SpecOutput {
            timed_out: true,
            ..failed.clone()
        }));
        assert!(!spawn_failed(&SpecOutput {
            code: Some(1),
            ..failed
        }));
    }

    #[test]
    fn digit_helpers_read_the_leading_run() {
        assert_eq!(split_digits("123 456"), ("123", " 456"));
        assert_eq!(split_digits("abc"), ("", "abc"));
        assert_eq!(digits_to_number(""), 0.0);
        assert_eq!(digits_to_number("16642998272"), 16_642_998_272.0);
        assert_eq!(to_bytes(-1.0), 0);
        assert_eq!(to_bytes(f64::NAN), 0);
    }
}
