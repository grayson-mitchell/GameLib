//! Retention of unpinned engines (`pruneUnpinnedEngines`) and the one guarded delete of this module
//! (D-19, FND-02): every directory this module removes goes through
//! `gamelib_safety::remove::remove_tree` with `<tools>/steam-engines` as its trust root. A target
//! outside the root, the root itself, and a root the guard cannot resolve (`unknown`) delete nothing.
//! Where the TS would have deleted and the guard refuses, that is a recorded delta
//! (`golden/fallback/deltas.json`).
//!
//! The stale-temp boot sweep (`sweepStaleEngineTemps`, 87-48) is here too: [`sweep_stale_engine_temps`]
//! and its bounded boot task [`spawn_engine_sweep`] (D-17: one owner, a registrant, a bound).

use std::fs;
use std::path::Path;
use std::time::Duration;

use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Outcome, Request, Target, TargetKind};

use super::Env;
use crate::ctx::EngineCtx;
use crate::engines::pinned_engine_paths_at;
use crate::pins::{EnginePin, EnginePins};

/// What a guarded delete did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Removal {
    /// Gone (an absent target counts: there was nothing to remove).
    Removed,
    /// The guard answered `no` or `unknown`. Nothing was deleted.
    Refused,
    /// The guard allowed it and the delete failed part way.
    Failed,
}

/// Removes `path` (a directory under the engine root) through the guard.
pub fn remove_guarded(env: &Env, path: &Path) -> Removal {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let request = Request {
        targets: vec![Target {
            id: name.clone(),
            path: path.to_string_lossy().into_owned(),
            kind: TargetKind::AppData,
            trust_root: Some(env.root_text()),
            executable: None,
        }],
        // An engine is not an install of any library entry: an empty list, never `None` (which reads
        // as "the list could not be read" and refuses everything).
        known_installs: Some(Vec::new()),
        self_key: None,
        protected_roots: vec![env.user_home.to_string_lossy().into_owned()],
    };
    let reply = remove_tree(&request, CaseMode::Auto);
    match reply.outcome {
        Outcome::Removed => Removal::Removed,
        Outcome::Refused => {
            let reason = reply
                .items
                .first()
                .and_then(|item| serde_json::to_value(item.reason).ok())
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default();
            env.warn(&format!("Engine: not removing {name}: refused ({reason})"));
            Removal::Refused
        }
        Outcome::Failed => {
            env.warn(&format!("Engine: could not remove {name}"));
            Removal::Failed
        }
    }
}

/// The directory names a pin keeps: its Wine directory and its DXVK directory.
fn kept_names(root: &str, pin: &EnginePin) -> [String; 2] {
    let paths = pinned_engine_paths_at(root, pin);
    let base = |p: &str| {
        Path::new(p)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    [base(&paths.wine_dir), base(&paths.dxvk_dir)]
}

/// Keep the current and previous pins' directories; remove other engine directories. A file and a
/// symlink are never touched (only a real directory is a candidate), and a `.tmp-*` directory is left
/// while an artifact install holds one.
pub fn prune_at(env: &Env, table: &EnginePins) {
    if !env.root.is_dir() {
        return;
    }
    let root = env.root_text();
    let mut keep: Vec<String> = Vec::new();
    for pin in std::iter::once(&table.current).chain(table.previous.as_ref()) {
        keep.extend(kept_names(&root, pin));
    }
    let entries = match fs::read_dir(&env.root) {
        Ok(entries) => entries,
        Err(_) => {
            env.warn("Engine: prune failed: the engine root could not be listed");
            return;
        }
    };
    let mut names: Vec<_> = entries.flatten().map(|e| e.file_name()).collect();
    names.sort();
    for name in names {
        let text = name.to_string_lossy().into_owned();
        if keep.contains(&text) {
            continue;
        }
        if text.starts_with(".tmp-") && env.flights.active_installs() > 0 {
            continue;
        }
        let full = env.root.join(&name);
        let is_dir = fs::symlink_metadata(&full).is_ok_and(|m| m.is_dir());
        if !is_dir {
            continue;
        }
        remove_guarded(env, &full);
    }
}

/// [`prune_at`] over the context's engine root.
pub fn prune_unpinned_engines(ctx: &EngineCtx, table: &EnginePins) {
    prune_at(&Env::from_ctx(ctx), table);
}

/// How long the boot sweep may run before the shell stops waiting for it (D-17). A sweep is a few
/// directory removals; the bound is for a disk that stalls, and boot never waits on it either way.
pub const ENGINE_SWEEP_BOUND: Duration = Duration::from_secs(10);

/// What a boot sweep did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sweep {
    /// No engine directory: nothing to do, nothing logged.
    NoRoot,
    /// An engine download or an artifact install was in flight: the sweep removed nothing.
    Skipped,
    /// The application began to exit part way; the rest was left for the next boot.
    Stopped { removed: usize },
    /// Every stale `.tmp-*` directory that was found has been handled.
    Swept { removed: usize },
}

impl Sweep {
    /// The one word the boot log line carries (never a path or a name).
    pub fn label(self) -> &'static str {
        match self {
            Sweep::NoRoot => "no-root",
            Sweep::Skipped => "skipped",
            Sweep::Stopped { .. } => "stopped",
            Sweep::Swept { .. } => "done",
        }
    }
}

/// Boot-time sweep of `.tmp-*` unpack directories under the engine root (G20). An interrupted unpack
/// leaves `steam-engines/.tmp-<kind>-*` behind and a prune only runs after a successful install.
///
/// Every delete is [`remove_guarded`] (D-19): `gamelib-safety` with `<tools>/steam-engines` as the
/// trust root, refusing on `unknown`. Only a real directory named `.tmp-*` directly under the root is a
/// candidate, so a file or a link of that name stays.
///
/// The TS ran before READY, so no install could hold a temp directory. This runs beside the app, so the
/// order is what keeps it from racing one: the directory is listed FIRST and the in-flight counters
/// are read AFTER. An install raises its counter before it creates its temp directory, so a
/// directory that is in the listing either belongs to a finished install (already removed) or to one
/// the counters still show, and the sweep then removes nothing; a directory created after the listing
/// is never a candidate.
pub fn sweep_stale_engine_temps_at(env: &Env) -> Sweep {
    if !env.root.is_dir() {
        return Sweep::NoRoot;
    }
    let Ok(entries) = fs::read_dir(&env.root) else {
        env.warn("Engine: temp sweep failed: the engine root could not be listed");
        return Sweep::NoRoot;
    };
    let mut names: Vec<_> = entries
        .flatten()
        .map(|e| e.file_name())
        .filter(|n| n.to_string_lossy().starts_with(".tmp-"))
        .collect();
    names.sort();
    if env.flights.in_flight() > 0 || env.flights.active_installs() > 0 {
        return Sweep::Skipped;
    }
    let token = env.shutdown.token();
    let mut removed = 0usize;
    let mut stopped = false;
    for name in names {
        if token.is_cancelled() {
            stopped = true;
            break;
        }
        let full = env.root.join(&name);
        // A symlink is not a directory here: `symlink_metadata` does not follow it.
        if !fs::symlink_metadata(&full).is_ok_and(|m| m.is_dir()) {
            continue;
        }
        if remove_guarded(env, &full) == Removal::Removed {
            removed += 1;
        }
    }
    if removed > 0 {
        env.info(&format!(
            "Engine: removed {removed} stale engine temp dir(s) at boot"
        ));
    }
    if stopped {
        Sweep::Stopped { removed }
    } else {
        Sweep::Swept { removed }
    }
}

/// [`sweep_stale_engine_temps_at`] over the context's engine root.
pub fn sweep_stale_engine_temps(ctx: &EngineCtx) -> Sweep {
    sweep_stale_engine_temps_at(&Env::from_ctx(ctx))
}

/// Runs `work` once, in the background, as bounded boot work (D-17), and hands `report` exactly one
/// word: the work's own label, `timeout` when it ran past `bound`, `shutdown` when the application
/// began to exit first (the work is then not started if it had not begun), or `panic`.
///
/// The work holds a `Shutdown` registrant named `engine-temp-sweep` for as long as it really runs, so an
/// exit waits for it within the one exit budget instead of cutting a delete short. After `bound` the
/// wait is abandoned (a blocking delete cannot be interrupted) but the registrant stays with the worker
/// until it returns. The registrant is taken before this function returns, so an exit that starts
/// straight after cannot miss it.
fn spawn_bounded(
    shutdown: gamelib_core::shutdown::Shutdown,
    bound: Duration,
    work: impl FnOnce() -> &'static str + Send + 'static,
    report: impl FnOnce(&'static str) + Send + 'static,
) -> Result<(), String> {
    let runtime = crate::runtime().map_err(|e| format!("engine_sweep:no-runtime ({e})"))?;
    let token = shutdown.token();
    if token.is_cancelled() {
        report("shutdown");
        return Ok(());
    }
    let registrant = shutdown.register("engine-temp-sweep");
    runtime.spawn(async move {
        let job = tokio::task::spawn_blocking(move || {
            let _registrant = registrant;
            work()
        });
        let word = tokio::select! {
            biased;
            done = tokio::time::timeout(bound, job) => match done {
                Ok(Ok(label)) => label,
                Ok(Err(_)) => "panic",
                Err(_) => "timeout",
            },
            _ = token.cancelled() => "shutdown",
        };
        report(word);
    });
    Ok(())
}

/// Starts [`sweep_stale_engine_temps`] as bounded boot work on the crate's own runtime (callable from
/// any thread). `report` gets one word (see [`spawn_bounded`] and [`Sweep::label`]). An error is only a
/// runtime that could not be built.
pub fn spawn_engine_sweep(
    ctx: &EngineCtx,
    bound: Duration,
    report: impl FnOnce(&'static str) + Send + 'static,
) -> Result<(), String> {
    let env = Env::from_ctx(ctx);
    let shutdown = env.shutdown.clone();
    spawn_bounded(
        shutdown,
        bound,
        move || sweep_stale_engine_temps_at(&env).label(),
        report,
    )
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::testing::RecordingLog;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    use crate::ctx::{EnginePaths, Platform};
    use crate::pins::pins;

    fn ctx(home: &FakeHome) -> EngineCtx {
        let root = home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.join("app"),
                user_data: root.join("data"),
                tools_path: root.join("app").join("tools"),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_log(Arc::new(RecordingLog::new()))
    }

    fn names(env: &Env) -> Vec<String> {
        let mut out: Vec<String> = fs::read_dir(&env.root)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        out.sort();
        out
    }

    fn table() -> EnginePins {
        let current = pins().unwrap().current.clone();
        let mut previous = current.clone();
        previous.id = "wine-staging-11.1".into();
        previous.dxvk.version = "v1.10.2-20230101-repack".into();
        EnginePins {
            current,
            previous: Some(previous),
        }
    }

    #[test]
    fn prune_keeps_both_pins_removes_other_directories_and_never_touches_a_file_or_link() {
        let home = FakeHome::new("fallback-prune-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        let table = table();
        for dir in [
            table.current.id.clone(),
            format!("dxvk-macOS-{}", table.current.dxvk.version),
            "wine-staging-11.1".to_string(),
            "dxvk-macOS-v1.10.2-20230101-repack".to_string(),
            "wine-staging-9.0".to_string(),
            "dxvk-macOS-old".to_string(),
            ".tmp-wine-interrupted".to_string(),
        ] {
            fs::create_dir_all(env.root.join(dir).join("x")).unwrap();
        }
        fs::write(env.root.join("readme.txt"), "keep").unwrap();
        let outside = home.root().join("outside");
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, env.root.join("link")).unwrap();

        prune_at(&env, &table);
        assert_eq!(
            names(&env),
            vec![
                "dxvk-macOS-v1.10.2-20230101-repack".to_string(),
                format!("dxvk-macOS-{}", table.current.dxvk.version),
                "link".to_string(),
                "readme.txt".to_string(),
                "wine-staging-11.1".to_string(),
                table.current.id.clone(),
            ]
        );
        assert!(outside.is_dir(), "a link's target is never opened");
    }

    #[test]
    fn a_temp_directory_survives_while_an_install_holds_one_and_prune_without_a_root_does_nothing()
    {
        let home = FakeHome::new("fallback-prune-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        // No steam-engines directory: nothing happens and nothing is created.
        prune_at(&env, &table());
        assert!(!env.root.exists());

        fs::create_dir_all(env.root.join(".tmp-dxvk-abc123/dl")).unwrap();
        {
            let _install = env.flights.install_guard();
            prune_at(&env, &table());
            assert_eq!(names(&env), vec![".tmp-dxvk-abc123"]);
        }
        prune_at(&env, &table());
        assert!(names(&env).is_empty());
    }

    fn sweep_names(env: &Env) -> Vec<String> {
        names(env)
    }

    #[test]
    fn the_sweep_removes_only_stale_temp_directories_and_logs_the_count() {
        let home = FakeHome::new("fallback-sweep-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        for dir in [
            ".tmp-wine-a/out",
            ".tmp-dxvk-b/dl",
            "keep-dir",
            "wine-staging-9.0",
        ] {
            fs::create_dir_all(env.root.join(dir)).unwrap();
        }
        fs::write(env.root.join(".tmp-note"), "a file").unwrap();
        let outside = home.root().join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("keep.txt"), "x").unwrap();
        std::os::unix::fs::symlink(&outside, env.root.join(".tmp-link")).unwrap();

        assert_eq!(
            sweep_stale_engine_temps_at(&env),
            Sweep::Swept { removed: 2 }
        );
        assert_eq!(
            sweep_names(&env),
            vec![".tmp-link", ".tmp-note", "keep-dir", "wine-staging-9.0"]
        );
        assert!(
            outside.join("keep.txt").is_file(),
            "a link is never followed"
        );
    }

    #[test]
    fn the_sweep_without_a_root_does_nothing_and_creates_nothing() {
        let home = FakeHome::new("fallback-sweep-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        assert_eq!(sweep_stale_engine_temps_at(&env), Sweep::NoRoot);
        assert!(!env.root.exists());
    }

    #[test]
    fn the_sweep_removes_nothing_while_an_install_holds_a_temp_directory() {
        let home = FakeHome::new("fallback-sweep-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        fs::create_dir_all(env.root.join(".tmp-dxvk-abc123/dl")).unwrap();
        {
            let _install = env.flights.install_guard();
            assert_eq!(sweep_stale_engine_temps_at(&env), Sweep::Skipped);
            assert_eq!(sweep_names(&env), vec![".tmp-dxvk-abc123"]);
        }
        assert_eq!(
            sweep_stale_engine_temps_at(&env),
            Sweep::Swept { removed: 1 }
        );
        assert!(sweep_names(&env).is_empty());
    }

    #[test]
    fn a_symlinked_engine_root_is_resolved_and_its_stale_temps_are_swept() {
        // A tools folder kept on another drive is a link: the guard resolves the root it is handed,
        // so the directories behind it are inside the trust root and are removed.
        let home = FakeHome::new("fallback-sweep-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        let elsewhere = home.root().join("elsewhere");
        fs::create_dir_all(elsewhere.join(".tmp-wine-x/out")).unwrap();
        fs::create_dir_all(env.root.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &env.root).unwrap();
        assert_eq!(
            sweep_stale_engine_temps_at(&env),
            Sweep::Swept { removed: 1 }
        );
        assert!(fs::read_dir(&elsewhere).unwrap().next().is_none());
    }

    #[test]
    fn the_sweep_guard_refuses_a_temp_named_directory_outside_the_engine_root() {
        let home = FakeHome::new("fallback-sweep-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        fs::create_dir_all(&env.root).unwrap();
        let outside = home.root().join(".tmp-wine-outside");
        fs::create_dir_all(outside.join("x")).unwrap();
        assert_eq!(remove_guarded(&env, &outside), Removal::Refused);
        assert!(outside.join("x").is_dir());
    }

    #[test]
    fn a_sweep_stops_between_directories_when_the_application_exits() {
        let home = FakeHome::new("fallback-sweep-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        fs::create_dir_all(env.root.join(".tmp-wine-a")).unwrap();
        env.shutdown.token().cancel();
        assert_eq!(
            sweep_stale_engine_temps_at(&env),
            Sweep::Stopped { removed: 0 }
        );
        assert_eq!(sweep_names(&env), vec![".tmp-wine-a"]);
    }

    fn wait_for(rx: &std::sync::mpsc::Receiver<&'static str>) -> &'static str {
        rx.recv_timeout(Duration::from_secs(5))
            .expect("the report arrives")
    }

    #[test]
    fn the_spawned_sweep_reports_one_word_and_releases_its_registrant() {
        let home = FakeHome::new("fallback-sweep-");
        let ctx = ctx(&home);
        let env = Env::from_ctx(&ctx);
        fs::create_dir_all(env.root.join(".tmp-dxvk-a/dl")).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        spawn_engine_sweep(&ctx, ENGINE_SWEEP_BOUND, move |w| {
            tx.send(w).unwrap();
        })
        .unwrap();
        assert_eq!(wait_for(&rx), "done");
        assert!(names(&env).is_empty());
        assert!(
            ctx.shutdown.drain(Duration::from_secs(2)).is_empty(),
            "the registrant is released"
        );
    }

    #[test]
    fn a_sweep_past_its_bound_is_abandoned_with_one_word_and_still_releases_its_registrant() {
        let shutdown = Shutdown::new();
        let (tx, rx) = std::sync::mpsc::channel();
        let (go_tx, go_rx) = std::sync::mpsc::channel::<()>();
        spawn_bounded(
            shutdown.clone(),
            Duration::from_millis(40),
            move || {
                // A disk that stalls: holds the blocking worker until the test lets it go.
                let _ = go_rx.recv_timeout(Duration::from_secs(5));
                "done"
            },
            move |w| tx.send(w).unwrap(),
        )
        .unwrap();
        assert_eq!(wait_for(&rx), "timeout");
        // The worker is still holding the registrant: an exit would wait for it, within its budget.
        assert_eq!(
            shutdown.drain(Duration::from_millis(30)),
            vec!["engine-temp-sweep"]
        );
        go_tx.send(()).unwrap();
        // Released when the worker returns.
        std::thread::sleep(Duration::from_millis(200));
        assert!(shutdown.drain(Duration::from_secs(2)).is_empty());
    }

    #[test]
    fn a_sweep_is_not_started_once_the_application_is_exiting() {
        let shutdown = Shutdown::new();
        shutdown.token().cancel();
        let (tx, rx) = std::sync::mpsc::channel();
        spawn_bounded(
            shutdown.clone(),
            ENGINE_SWEEP_BOUND,
            || panic!("the work must not start"),
            move |w| tx.send(w).unwrap(),
        )
        .unwrap();
        assert_eq!(wait_for(&rx), "shutdown");
        assert!(shutdown.drain(Duration::from_millis(50)).is_empty());
    }

    #[test]
    fn a_panicking_sweep_reports_panic_and_releases_its_registrant() {
        let shutdown = Shutdown::new();
        let (tx, rx) = std::sync::mpsc::channel();
        spawn_bounded(
            shutdown.clone(),
            ENGINE_SWEEP_BOUND,
            || panic!("boom"),
            move |w| tx.send(w).unwrap(),
        )
        .unwrap();
        assert_eq!(wait_for(&rx), "panic");
        assert!(shutdown.drain(Duration::from_secs(2)).is_empty());
    }
}
