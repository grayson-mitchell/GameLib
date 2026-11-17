//! Op table for the shell and `gamelib-steampoll-cli`. Every op takes one JSON object (camelCase,
//! `deny_unknown_fields`) and answers a camelCase JSON value; `Err` is only a bad-args, an
//! unknown op, a missing facade, a wrong thread or a panic (`{op}:panic`, T-80-52).
//!
//! Threading: the shell calls `dispatch` on a worker thread, never from inside a tokio runtime
//! (as `gamelib-steamcm` does). The two async ops (`steampoll_read_running_app_id`,
//! `steampoll_mac_arch_verdict`) `block_on` the crate runtime and answer `{op}:wrong-thread`
//! when called from inside a runtime.

use crate::acf_copies::{
    enumerate_copies, find_other_manifests_with_installdir, remove_copy, scan_downloading_app_ids,
};
use crate::acf_state::{
    read_acf_state, read_acf_update_fields_from_dir, read_acf_update_state, AcfSource, PollRoots,
};
use crate::adoption::{validate_watch_args, AdoptionWatchArgs};
use crate::constants::STATE_FLAG_FULLY_INSTALLED;
use crate::install_loop::StartInstallArgs;
use crate::mac_arch::mac_arch_verdict;
use crate::running::read_running_app_id;
use crate::uninstall::{start_uninstall, stop_uninstall, StartUninstallArgs};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Ops reachable from the shell. Keep sorted.
pub const OPS: &[&str] = &[
    "steampoll_acf_enumerate_copies",
    "steampoll_acf_find_other_manifests",
    "steampoll_acf_read_state",
    "steampoll_acf_read_update",
    "steampoll_acf_read_update_from_dir",
    "steampoll_acf_remove_copy",
    "steampoll_acf_scan_downloading",
    "steampoll_adoption_watch",
    "steampoll_breadcrumb_installed_on_disk",
    "steampoll_bridge_finalized",
    "steampoll_install_cancel_delegated",
    "steampoll_install_start",
    "steampoll_install_stop",
    "steampoll_mac_arch_verdict",
    "steampoll_native_in_flight",
    "steampoll_next_notice_seq",
    "steampoll_read_running_app_id",
    "steampoll_running_hold",
    "steampoll_running_last_app_id",
    "steampoll_running_release",
    "steampoll_running_start",
    "steampoll_running_stop",
    "steampoll_status",
    "steampoll_uninstall_start",
    "steampoll_uninstall_stop",
];

/// The process-wide facade: the one set of collaborators the shell installs at boot.
pub mod facade {
    use crate::adoption::AdoptionWatch;
    use crate::host::{Clock, HoldSink, PollHost, ProcessRunner};
    use crate::install_loop::InstallPolls;
    use crate::monitor::DownloadMonitor;
    use crate::outbox::Outbox;
    use crate::profile::{Platform, SidecarProfile};
    use crate::registry::Registry;
    use crate::running::{ClaimId, RunningPoll};
    use crate::runtime;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex, MutexGuard};

    pub struct Facade {
        pub registry: Registry,
        pub outbox: Arc<Outbox>,
        pub polls: InstallPolls,
        pub running: RunningPoll,
        pub adoption: AdoptionWatch,
        pub hold: Arc<dyn HoldSink>,
        pub profile: SidecarProfile,
        pub runner: Arc<dyn ProcessRunner>,
        pub home: PathBuf,
        claims: Mutex<(u64, HashMap<u64, ClaimId>)>,
    }

    impl Facade {
        pub(crate) fn add_claim(&self, claim: ClaimId) -> u64 {
            let mut g = lock(&self.claims);
            g.0 += 1;
            let id = g.0;
            g.1.insert(id, claim);
            id
        }

        pub(crate) fn take_claim(&self, id: u64) -> Option<ClaimId> {
            lock(&self.claims).1.remove(&id)
        }
    }

    fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
        m.lock().unwrap_or_else(|e| e.into_inner())
    }

    static SLOT: Mutex<Option<Arc<Facade>>> = Mutex::new(None);

    fn build(
        host: Arc<dyn PollHost>,
        runner: Arc<dyn ProcessRunner>,
        clock: Arc<dyn Clock>,
        hold: Arc<dyn HoldSink>,
        profile: SidecarProfile,
    ) -> Arc<Facade> {
        let platform = Platform::current();
        let registry = Registry::new(
            runtime::handle(),
            host.clone(),
            runner.clone(),
            clock.clone(),
        );
        let outbox = Arc::new(Outbox::new());
        let monitor = Arc::new(DownloadMonitor::new(host, runner.clone(), clock));
        let polls = InstallPolls::new(
            registry.clone(),
            outbox.clone(),
            hold.clone(),
            monitor,
            platform,
        );
        let home = std::env::var("HOME")
            .ok()
            .or_else(|| std::env::var("USERPROFILE").ok())
            .filter(|h| !h.is_empty())
            .map(PathBuf::from)
            .unwrap_or_default();
        let running = RunningPoll::for_platform(
            registry.clone(),
            platform,
            home.clone(),
            profile.default_steam_path(),
        );
        let adoption = AdoptionWatch::new(
            registry.clone(),
            outbox.clone(),
            platform,
            profile.default_steam_path().map(PathBuf::from),
        );
        Arc::new(Facade {
            registry,
            outbox,
            polls,
            running,
            adoption,
            hold,
            profile,
            runner,
            home,
            claims: Mutex::new((0, HashMap::new())),
        })
    }

    /// Installs the facade once per process. `false` when one is already installed.
    pub fn install(
        host: Arc<dyn PollHost>,
        runner: Arc<dyn ProcessRunner>,
        clock: Arc<dyn Clock>,
        hold: Arc<dyn HoldSink>,
        profile: SidecarProfile,
    ) -> bool {
        let mut slot = lock(&SLOT);
        if slot.is_some() {
            return false;
        }
        *slot = Some(build(host, runner, clock, hold, profile));
        true
    }

    /// Replaces any installed facade (tests; the old polls are left to drop).
    #[cfg(any(test, feature = "testing"))]
    pub fn install_for_test(
        host: Arc<dyn PollHost>,
        runner: Arc<dyn ProcessRunner>,
        clock: Arc<dyn Clock>,
        hold: Arc<dyn HoldSink>,
        profile: SidecarProfile,
    ) -> Arc<Facade> {
        let f = build(host, runner, clock, hold, profile);
        *lock(&SLOT) = Some(f.clone());
        f
    }

    /// Drops the installed facade (tests).
    #[cfg(any(test, feature = "testing"))]
    pub fn reset_for_test() {
        *lock(&SLOT) = None;
    }

    pub fn current() -> Option<Arc<Facade>> {
        lock(&SLOT).clone()
    }

    /// The installed registry (a cheap clone), `None` before `install`.
    pub fn registry() -> Option<Registry> {
        current().map(|f| f.registry.clone())
    }

    pub fn outbox() -> Option<Arc<Outbox>> {
        current().map(|f| f.outbox.clone())
    }

    pub fn polls() -> Option<InstallPolls> {
        current().map(|f| f.polls.clone())
    }
}

fn bad_args(op: &str) -> String {
    format!("{op}:bad-args")
}

fn parse<T: DeserializeOwned>(op: &str, args: &[Value]) -> Result<T, String> {
    let first = args.first().ok_or_else(|| bad_args(op))?;
    serde_json::from_value(first.clone()).map_err(|_| bad_args(op))
}

fn out<T: serde::Serialize>(op: &str, v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|_| format!("{op}:serialize"))
}

fn configured() -> Result<std::sync::Arc<facade::Facade>, String> {
    facade::current().ok_or_else(|| "steampoll:not-configured".to_string())
}

fn numeric_app_id(op: &str, app_id: &str) -> Result<(), String> {
    if (1..=10).contains(&app_id.len()) && app_id.bytes().all(|b| b.is_ascii_digit()) {
        Ok(())
    } else {
        Err(bad_args(op))
    }
}

fn block_on<F: std::future::Future>(op: &str, fut: F) -> Result<F::Output, String> {
    if tokio::runtime::Handle::try_current().is_ok() {
        return Err(format!("{op}:wrong-thread"));
    }
    Ok(crate::runtime::handle().block_on(fut))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RootsApp {
    roots: PollRoots,
    app_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RootsAppSource {
    roots: PollRoots,
    app_id: String,
    source: AcfSource,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RootsOnly {
    roots: PollRoots,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DirApp {
    steamapps_dir: String,
    app_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FindOther {
    steamapps_dir: String,
    installdir: String,
    app_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AppOnly {
    app_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BridgeFinalized {
    app_id: String,
    finalized: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeInFlight {
    app_id: String,
    in_flight: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MacArchArgs {
    install_path: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
struct StrictArgs {
    strict: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RunningHoldArgs {
    app_id: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RunningReleaseArgs {
    claim_id: u64,
    terminal_sent: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UninstallStartArgs {
    app_id: String,
    title: String,
    roots: PollRoots,
    source: AcfSource,
    #[serde(default)]
    interval_ms: Option<u64>,
    #[serde(default)]
    bridge_authoritative: bool,
}

/// `breadcrumbAppIsFullyInstalledOnDisk`: false on absent, unparsed, no flags or any failure.
fn breadcrumb_installed(steamapps_dir: &str, app_id: &str) -> bool {
    if steamapps_dir.is_empty() || numeric_app_id("", app_id).is_err() {
        return false;
    }
    let path = Path::new(steamapps_dir).join(format!("appmanifest_{app_id}.acf"));
    let res = gamelib_steamfiles::acf::read_acf(&path);
    if !res.exists || !res.parsed || res.read_error.is_some() {
        return false;
    }
    res.record
        .and_then(|r| r.state_flags)
        .is_some_and(|f| f & STATE_FLAG_FULLY_INSTALLED != 0)
}

fn run_op(op: &str, args: &[Value]) -> Result<Value, String> {
    match op {
        "steampoll_acf_enumerate_copies" => {
            let a: RootsApp = parse(op, args)?;
            out(op, enumerate_copies(&a.roots, &a.app_id))
        }
        "steampoll_acf_find_other_manifests" => {
            let a: FindOther = parse(op, args)?;
            out(
                op,
                find_other_manifests_with_installdir(&a.steamapps_dir, &a.installdir, &a.app_id),
            )
        }
        "steampoll_acf_read_state" => {
            let a: RootsAppSource = parse(op, args)?;
            out(op, read_acf_state(&a.roots, &a.app_id, a.source))
        }
        "steampoll_acf_read_update" => {
            let a: RootsAppSource = parse(op, args)?;
            out(op, read_acf_update_state(&a.roots, &a.app_id, a.source))
        }
        "steampoll_acf_read_update_from_dir" => {
            let a: DirApp = parse(op, args)?;
            out(
                op,
                read_acf_update_fields_from_dir(&a.steamapps_dir, &a.app_id),
            )
        }
        "steampoll_acf_remove_copy" => {
            let a: RootsAppSource = parse(op, args)?;
            numeric_app_id(op, &a.app_id)?;
            out(op, remove_copy(&a.roots, &a.app_id, a.source))
        }
        "steampoll_acf_scan_downloading" => {
            let a: RootsOnly = parse(op, args)?;
            out(op, scan_downloading_app_ids(&a.roots))
        }
        "steampoll_adoption_watch" => {
            let a: AdoptionWatchArgs = parse(op, args)?;
            validate_watch_args(&a).map_err(|_| bad_args(op))?;
            configured()?.adoption.watch(a).map_err(|_| bad_args(op))?;
            out(op, true)
        }
        "steampoll_breadcrumb_installed_on_disk" => {
            let a: DirApp = parse(op, args)?;
            out(op, breadcrumb_installed(&a.steamapps_dir, &a.app_id))
        }
        "steampoll_bridge_finalized" => {
            let a: BridgeFinalized = parse(op, args)?;
            numeric_app_id(op, &a.app_id)?;
            configured()?
                .polls
                .set_bridge_finalized(&a.app_id, a.finalized);
            Ok(Value::Null)
        }
        "steampoll_install_cancel_delegated" => {
            let a: AppOnly = parse(op, args)?;
            numeric_app_id(op, &a.app_id)?;
            out(op, configured()?.polls.cancel_delegated(&a.app_id))
        }
        "steampoll_install_start" => {
            let a: StartInstallArgs = parse(op, args)?;
            let f = configured()?;
            // True when the appId's poll is update-aware after this call (80-REVIEW C-WR-03).
            out(
                op,
                f.polls
                    .start_install_reporting(a)
                    .map_err(|_| bad_args(op))?,
            )
        }
        "steampoll_install_stop" => {
            let a: AppOnly = parse(op, args)?;
            numeric_app_id(op, &a.app_id)?;
            out(op, configured()?.polls.stop_install(&a.app_id))
        }
        "steampoll_mac_arch_verdict" => {
            let a: MacArchArgs = parse(op, args)?;
            let f = configured()?;
            let platform = f.polls.platform();
            let path = PathBuf::from(a.install_path);
            let verdict = block_on(
                op,
                mac_arch_verdict(&*f.runner, platform, AcfSource::Native, &path),
            )?;
            out(op, verdict.map(|v| v.as_str()))
        }
        "steampoll_native_in_flight" => {
            let a: NativeInFlight = parse(op, args)?;
            numeric_app_id(op, &a.app_id)?;
            configured()?
                .polls
                .set_native_in_flight(&a.app_id, a.in_flight);
            Ok(Value::Null)
        }
        "steampoll_next_notice_seq" => out(op, configured()?.registry.next_notice_seq()),
        "steampoll_read_running_app_id" => {
            // The object is optional: `[]` and `[null]` (`[undefined]` over JSON) both mean the
            // default, as in the zod schema and the shell contract (80-REVIEW B/WR-03).
            let a: StrictArgs = match args.first() {
                None | Some(Value::Null) => StrictArgs::default(),
                Some(_) => parse(op, args)?,
            };
            let f = configured()?;
            let platform = f.polls.platform();
            let root = f.profile.default_steam_path();
            let id = block_on(
                op,
                read_running_app_id(platform, &f.home, root.as_deref(), &*f.runner, a.strict),
            )?
            .map_err(|e| format!("{op}:{e}"))?;
            out(op, id)
        }
        "steampoll_running_hold" => {
            let a: RunningHoldArgs = parse(op, args)?;
            let f = configured()?;
            let claim = f.running.hold(a.app_id);
            out(op, f.add_claim(claim))
        }
        "steampoll_running_last_app_id" => out(op, configured()?.running.last_app_id()),
        "steampoll_running_release" => {
            let a: RunningReleaseArgs = parse(op, args)?;
            let f = configured()?;
            // An unknown or already released claim is a no-op, as in the TS release closure.
            if let Some(claim) = f.take_claim(a.claim_id) {
                f.running.release(claim, a.terminal_sent);
            }
            Ok(Value::Null)
        }
        "steampoll_running_start" => {
            configured()?.running.start();
            Ok(Value::Null)
        }
        "steampoll_running_stop" => {
            configured()?.running.stop();
            Ok(Value::Null)
        }
        "steampoll_status" => out(op, configured()?.polls.status()),
        "steampoll_uninstall_start" => {
            let a: UninstallStartArgs = parse(op, args)?;
            let f = configured()?;
            let started = start_uninstall(
                &f.registry,
                f.outbox.clone(),
                f.hold.clone(),
                StartUninstallArgs {
                    app_id: a.app_id,
                    title: a.title,
                    roots: a.roots,
                    source: a.source,
                    interval_ms: a.interval_ms,
                    bridge_authoritative: a.bridge_authoritative,
                },
            )
            .map_err(|_| bad_args(op))?;
            out(op, started)
        }
        "steampoll_uninstall_stop" => {
            let a: AppOnly = parse(op, args)?;
            numeric_app_id(op, &a.app_id)?;
            out(op, stop_uninstall(&configured()?.registry, &a.app_id))
        }
        _ => Err(format!("{op}:unknown-op")),
    }
}

pub fn dispatch(op: &str, args: &[Value]) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_op(op, args)))
        .unwrap_or_else(|_| Err(format!("{op}:panic")))
}
