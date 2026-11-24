//! The bottle lifecycle (Phase 87, SVC-02, D-17, D-19): CrossOver bottle creation, the wineserver kill
//! and the guarded, sibling-safe removal of a bottle this process created. Ported from
//! `bottlePrimitives.ts` (`killBottleWineServerWith`, `removeCreatedBottleDir`) and `perGameBottle.ts`
//! (`createCrossoverBottle`), and replayed against the 87-11 goldens (`golden/bottles`).
//!
//! - **Spawns (D-17):** `cxbottle --create` and `<wineserver> -k` go through `ctx.proc` (the one
//!   `SpecRunner` seam, `SpawnClass::Helper`), each with a stable label for the child registry. A
//!   create is capped by [`CX_CREATE_CAP_MS`] and takes a cancel token; a kill is capped too and
//!   takes none (a kill must still run for a cancelled create).
//! - **Removal (D-19, FND-02, T-87-37):** a bottle directory is deleted only through
//!   `gamelib_safety::remove::remove_tree` with the Bottles directory as the trust root, as a single
//!   clean name directly under it. An `unknown` or `no` verdict deletes nothing, a symlinked bottle
//!   is unlinked and its referent never touched, and a sibling bottle, a sibling directory of the
//!   root and a directory whose name merely starts with the root's name are never reachable.
//!
//! The real-profile arm of the two-profile rule lives in [`kill_bottle_wineserver`]: the child
//! inherits the real environment (`HOME`) because the prefix is explicit and wine needs nothing
//! GameLib-private from it; only the extra variables the caller names and `WINEPREFIX` are set.

use std::path::Path;
use std::time::Duration;

use gamelib_core::process::ProcSpec;
use gamelib_safety::remove::remove_tree;
use gamelib_safety::safe_path::CaseMode;
use gamelib_safety::wire::{Outcome, Request, Target, TargetKind};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::bottles::paths::{bottle_dir, is_clean_bottle_name, BOTTLES_REL};
use crate::ctx::EngineCtx;
use crate::engines::is_bottle_provisioned;
use crate::jsutil::path_join;

/// The cap on `cxbottle --create` (`CX_CREATE_CAP_MS` in `engineDecision.ts`).
pub const CX_CREATE_CAP_MS: u64 = 120_000;

/// The cap the TS callers gave every wineserver kill (15 s).
pub const KILL_TIMEOUT_MS: u64 = 15_000;

/// `PROVISION_ABORTED`: the creation was cancelled.
pub const PROVISION_ABORTED: &str = "provision-aborted";
/// `CROSSOVER_CREATE_TIMEOUT`: `cxbottle --create` hit its cap.
pub const CROSSOVER_CREATE_TIMEOUT: &str = "crossover-create-timeout";
/// `CROSSOVER_CREATE_FAILED`: `cxbottle --create` failed or left no `cxbottle.conf`.
pub const CROSSOVER_CREATE_FAILED: &str = "crossover-create-failed";

fn info(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.info(line);
    }
}

fn warn(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.warn(line);
    }
}

fn error(ctx: &EngineCtx, line: &str) {
    if let Some(log) = ctx.log.as_deref() {
        log.error(line);
    }
}

/// The Bottles directory under the profile's home: the trust root of every removal.
fn bottles_root(ctx: &EngineCtx) -> String {
    path_join(&[&ctx.paths.user_home.to_string_lossy(), BOTTLES_REL])
}

/// The directory of `name` when it is a clean name sitting directly under the Bottles root
/// (`sanitizeBottleName(name) === name` and `relative(root, dir) === name`). `.` passes the
/// sanitiser and resolves to the root itself, so the containment half is what refuses it. Public
/// (87-64) because it is the one safe way to name a bottle's directory: the Wine tools of a game take
/// their prefix from it, never from a path in the settings.
pub fn direct_child_dir(ctx: &EngineCtx, name: &str) -> Option<String> {
    if !is_clean_bottle_name(name) {
        return None;
    }
    let dir = bottle_dir(&ctx.paths.user_home, name);
    let expected = format!("{}/{name}", bottles_root(ctx));
    (dir == expected).then_some(dir)
}

/// Node's `path.dirname` on POSIX.
pub(crate) fn dirname(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    match trimmed.rfind('/') {
        None => ".".to_string(),
        Some(0) => "/".to_string(),
        Some(i) => trimmed[..i].to_string(),
    }
}

/// `killBottleWineServerWith`: `<wineserver> -k` against the per-game bottle. `WINEPREFIX` is always
/// the bottle (set after, and replacing, any `WINEPREFIX` in `extra_env`), the name must be clean and
/// sit directly under the Bottles root, and the run is capped by `timeout`. Never fails: `false` for
/// an unsafe name (nothing is spawned), a spawn that failed, a run cut by its timeout or an app
/// shutdown, `true` otherwise.
///
/// Real-profile arm (the two-profile rule, `fakeHomeIsolation`): the child inherits this process's
/// environment, `HOME` included, because the prefix is explicit and wine needs nothing GameLib-private
/// from it. The only variables set are `extra_env` and `WINEPREFIX`; no other home or config variable
/// is assigned here.
pub async fn kill_bottle_wineserver(
    ctx: &EngineCtx,
    bottle_name: &str,
    wineserver_bin: &str,
    extra_env: &[(String, String)],
    timeout: Duration,
) -> bool {
    let Some(dir) = direct_child_dir(ctx, bottle_name) else {
        warn(
            ctx,
            &format!("killBottleWineServerWith: refusing unsafe bottle \"{bottle_name}\""),
        );
        return false;
    };
    let mut spec = ProcSpec::new("engine-wineserver-kill", wineserver_bin);
    spec.argv = vec!["-k".to_string()];
    spec.env = extra_env
        .iter()
        .filter(|(key, _)| key != "WINEPREFIX")
        .cloned()
        .collect();
    spec.env.push(("WINEPREFIX".to_string(), dir));
    spec.timeout = Some(timeout);
    let out = ctx.proc.run(spec, None).await;
    if out.code.is_some() {
        return true;
    }
    if out.timed_out {
        warn(
            ctx,
            &format!(
                "killBottleWineServerWith: wineserver -k for bottle \"{bottle_name}\" was killed by its timeout"
            ),
        );
    } else {
        warn(
            ctx,
            &format!(
                "killBottleWineServerWith: wineserver -k for bottle \"{bottle_name}\" failed {}",
                out.stderr
            ),
        );
    }
    false
}

/// What [`remove_created_bottle_dir`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoveCreated {
    /// The bottle (or the link at its place) is gone; also an absent bottle, which has nothing to remove.
    Removed,
    /// The name is not a single clean segment directly under the Bottles root, or the guard answered
    /// `no` or `unknown`. Nothing was deleted.
    Refused,
    /// The guard allowed it and the delete failed part way.
    Failed,
}

/// `removeCreatedBottleDir`: removes a bottle directory this call's caller created, and only as a
/// single clean segment directly under the Bottles root (T-59-25). The delete is
/// `gamelib_safety::remove::remove_tree` over a `Bottle` target with the Bottles directory as its
/// trust root (D-19, FND-02): the guard re-checks the target itself, so a `..` or a symlink aimed at
/// a sibling bottle, a root that cannot be resolved (`unknown`) and the root itself all delete
/// nothing. A bottle that is a symlink is unlinked and its referent is never opened. Never fails.
pub fn remove_created_bottle_dir(ctx: &EngineCtx, bottle_name: &str) -> RemoveCreated {
    let Some(dir) = direct_child_dir(ctx, bottle_name) else {
        warn(
            ctx,
            &format!(
                "provisionBridgeBottle: not removing partial bottle outside the Bottles root: \"{bottle_name}\""
            ),
        );
        return RemoveCreated::Refused;
    };
    let request = Request {
        targets: vec![Target {
            id: bottle_name.to_string(),
            path: dir,
            kind: TargetKind::Bottle,
            trust_root: Some(bottles_root(ctx)),
            executable: None,
        }],
        // A bottle is not an install of any library entry: an empty list, never `None` (which reads as
        // "the list could not be read" and refuses everything).
        known_installs: Some(Vec::new()),
        self_key: None,
        protected_roots: vec![ctx.paths.user_home.to_string_lossy().into_owned()],
    };
    let reply = remove_tree(&request, CaseMode::Auto);
    match reply.outcome {
        Outcome::Removed => RemoveCreated::Removed,
        Outcome::Refused => {
            let reason = reply
                .items
                .first()
                .and_then(|item| serde_json::to_value(item.reason).ok())
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default();
            warn(
                ctx,
                &format!(
                    "provisionBridgeBottle: not removing partial bottle \"{bottle_name}\": refused ({reason})"
                ),
            );
            RemoveCreated::Refused
        }
        Outcome::Failed => {
            warn(
                ctx,
                "provisionBridgeBottle: could not remove partial bottle",
            );
            RemoveCreated::Failed
        }
    }
}

/// What a bottle creation answers (`CreateBottleResult`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateBottleResult {
    pub done: bool,
    pub error: Option<String>,
    pub error_code: Option<&'static str>,
    /// `Some(true)` only when this call created the bottle directory (it was absent at entry).
    pub created_here: Option<bool>,
}

impl CreateBottleResult {
    pub(crate) fn failed(code: Option<&'static str>, message: String) -> CreateBottleResult {
        CreateBottleResult {
            done: false,
            error: Some(message),
            error_code: code,
            created_here: None,
        }
    }

    /// The sidecar's shape: `{status, error?, errorCode?, createdHere?}`.
    pub fn to_value(&self) -> Value {
        let mut out = json!({"status": if self.done { "done" } else { "error" }});
        if let Some(error) = &self.error {
            out["error"] = json!(error);
        }
        if let Some(code) = self.error_code {
            out["errorCode"] = json!(code);
        }
        if let Some(created) = self.created_here {
            out["createdHere"] = json!(created);
        }
        out
    }
}

/// How [`create_crossover_bottle`] is bounded.
#[derive(Debug, Clone)]
pub struct CreateOptions {
    /// The cap on `cxbottle --create`; [`CX_CREATE_CAP_MS`] by default.
    pub create_timeout: Duration,
    /// Cancelling it kills the create and cleans what this call made. `None`: only an app shutdown
    /// ends it early.
    pub cancel: Option<CancellationToken>,
}

impl Default for CreateOptions {
    fn default() -> CreateOptions {
        CreateOptions {
            create_timeout: Duration::from_millis(CX_CREATE_CAP_MS),
            cancel: None,
        }
    }
}

/// `createCrossoverBottle`: CrossOver's own `cxbottle --create --bottle <name> --template win10_64`,
/// capped by `opts.create_timeout`; on any failure the wineserver is killed and the bottle directory
/// this call created is removed (never one that existed at entry). `bin_dir` is CrossOver's `bin`
/// directory. A fresh bottle gets a best-effort wineserver kill so no wedged server is left behind.
pub async fn create_crossover_bottle(
    ctx: &EngineCtx,
    bottle_name: &str,
    bin_dir: &str,
    opts: &CreateOptions,
) -> CreateBottleResult {
    if !is_clean_bottle_name(bottle_name) {
        error(
            ctx,
            &format!("createCrossoverBottle: rejected unsafe bottle name \"{bottle_name}\""),
        );
        return CreateBottleResult::failed(None, format!("Invalid bottle name: \"{bottle_name}\""));
    }
    let created_here = !Path::new(&bottle_dir(&ctx.paths.user_home, bottle_name)).exists();
    let cancelled = || opts.cancel.as_ref().is_some_and(|c| c.is_cancelled());
    if cancelled() {
        return aborted(ctx, bottle_name, bin_dir, created_here).await;
    }

    let mut spec = ProcSpec::new("engine-cxbottle", path_join(&[bin_dir, "cxbottle"]));
    spec.argv = [
        "--create",
        "--bottle",
        bottle_name,
        "--template",
        "win10_64",
    ]
    .map(str::to_string)
    .to_vec();
    spec.timeout = Some(opts.create_timeout);
    spec.cancel = opts.cancel.clone();
    let out = ctx.proc.run(spec, None).await;

    if out.cancelled || cancelled() {
        return aborted(ctx, bottle_name, bin_dir, created_here).await;
    }
    let Some(code) = out.code else {
        if out.timed_out {
            error(
                ctx,
                &format!(
                    "createCrossoverBottle: cxbottle create for \"{bottle_name}\" hit its {} ms cap",
                    opts.create_timeout.as_millis()
                ),
            );
            cleanup(ctx, bottle_name, bin_dir, created_here).await;
            return CreateBottleResult::failed(
                Some(CROSSOVER_CREATE_TIMEOUT),
                "CrossOver did not finish creating the bottle".to_string(),
            );
        }
        // The program could not be started (or a signal ended it): the TS threw here.
        error(
            ctx,
            &format!(
                "createCrossoverBottle: cxbottle create threw {}",
                out.stderr
            ),
        );
        cleanup(ctx, bottle_name, bin_dir, created_here).await;
        return CreateBottleResult::failed(
            Some(CROSSOVER_CREATE_FAILED),
            format!(
                "Failed to create CrossOver bottle \"{bottle_name}\": {}",
                out.stderr
            ),
        );
    };
    if !is_bottle_provisioned(ctx, bottle_name) {
        error(
            ctx,
            &format!(
                "createCrossoverBottle: cxbottle create did not produce cxbottle.conf for {bottle_name} (code={code}): {}",
                out.stderr
            ),
        );
        cleanup(ctx, bottle_name, bin_dir, created_here).await;
        return CreateBottleResult::failed(
            Some(CROSSOVER_CREATE_FAILED),
            format!("Failed to create CrossOver bottle \"{bottle_name}\""),
        );
    }
    // Best effort: a fresh bottle must not leave a wedged wineserver behind.
    kill_crossover_wineserver(ctx, bottle_name, bin_dir).await;
    CreateBottleResult {
        done: true,
        error: None,
        error_code: None,
        created_here: Some(created_here),
    }
}

/// The wineserver kill every create path ends with: CrossOver's own wineserver, `CX_ROOT` set to the
/// CrossOver directory, the 15 s cap.
async fn kill_crossover_wineserver(ctx: &EngineCtx, bottle_name: &str, bin_dir: &str) -> bool {
    kill_bottle_wineserver(
        ctx,
        bottle_name,
        &path_join(&[bin_dir, "wineserver"]),
        &[("CX_ROOT".to_string(), dirname(bin_dir))],
        Duration::from_millis(KILL_TIMEOUT_MS),
    )
    .await
}

/// Kills the wineserver and removes the bottle directory when this call created it.
async fn cleanup(ctx: &EngineCtx, bottle_name: &str, bin_dir: &str, created_here: bool) {
    kill_crossover_wineserver(ctx, bottle_name, bin_dir).await;
    if created_here {
        remove_created_bottle_dir(ctx, bottle_name);
    }
}

async fn aborted(
    ctx: &EngineCtx,
    bottle_name: &str,
    bin_dir: &str,
    created_here: bool,
) -> CreateBottleResult {
    info(
        ctx,
        &format!("createCrossoverBottle: creation cancelled for \"{bottle_name}\""),
    );
    cleanup(ctx, bottle_name, bin_dir, created_here).await;
    CreateBottleResult::failed(
        Some(PROVISION_ABORTED),
        "bottle creation cancelled".to_string(),
    )
}

/// An op-supplied `extraEnv` as variable pairs; `None` when a name is empty or holds `=` or NUL, or a
/// value is not a string without NUL (a child spawn would fail or misread it). `WINEPREFIX` in it is
/// accepted and ignored: [`kill_bottle_wineserver`] always sets the bottle's own.
pub fn env_pairs(map: &serde_json::Map<String, Value>) -> Option<Vec<(String, String)>> {
    let mut out = Vec::new();
    for (key, value) in map {
        if key.is_empty() || key.contains('=') || key.contains('\0') {
            return None;
        }
        let text = value.as_str()?;
        if text.contains('\0') {
            return None;
        }
        out.push((key.clone(), text.to_string()));
    }
    Some(out)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::ctx::{EnginePaths, Platform};
    use crate::testing::{RecordingLog, ScriptedSpecRunner};
    use gamelib_core::clock::SystemClock;
    use gamelib_core::process::SpecOutput;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    fn ctx_for(home: &FakeHome, runner: Arc<ScriptedSpecRunner>) -> (EngineCtx, Arc<RecordingLog>) {
        let root = home.root().to_path_buf();
        let log = Arc::new(RecordingLog::new());
        let ctx = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.join(".config/GameLib"),
                user_data: root.join("data"),
                tools_path: root.join(".config/GameLib/tools"),
                user_home: root.clone(),
                temp: root.join("tmp"),
            },
            Shutdown::new(),
        )
        .with_proc(runner)
        .with_log(log.clone());
        (ctx, log)
    }

    fn idle() -> Arc<ScriptedSpecRunner> {
        Arc::new(ScriptedSpecRunner::new(Vec::new()))
    }

    fn bottles(home: &FakeHome) -> std::path::PathBuf {
        home.root().join(BOTTLES_REL)
    }

    fn seed(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn dirname_follows_node() {
        assert_eq!(dirname("/a/b/bin"), "/a/b");
        assert_eq!(dirname("/a/b/bin/"), "/a/b");
        assert_eq!(dirname("/bin"), "/");
        assert_eq!(dirname("bin"), ".");
    }

    #[test]
    fn a_bottle_is_removed_and_its_sibling_bottle_and_sibling_directories_are_not() {
        let home = FakeHome::new("engine-lifecycle-");
        let (ctx, log) = ctx_for(&home, idle());
        seed(&bottles(&home).join("mine/system.reg"), "mine");
        seed(&bottles(&home).join("sibling/system.reg"), "keep");
        seed(&bottles(&home).join("mine-too/system.reg"), "keep");
        let cx = home.root().join("Library/Application Support/CrossOver");
        seed(&cx.join("Bottles-keep/keep.txt"), "keep");
        seed(&cx.join("Sibling/keep.txt"), "keep");

        assert_eq!(
            remove_created_bottle_dir(&ctx, "mine"),
            RemoveCreated::Removed
        );

        assert!(!bottles(&home).join("mine").exists());
        for kept in [
            bottles(&home).join("sibling/system.reg"),
            bottles(&home).join("mine-too/system.reg"),
            cx.join("Bottles-keep/keep.txt"),
            cx.join("Sibling/keep.txt"),
        ] {
            assert_eq!(std::fs::read_to_string(&kept).unwrap().len(), 4, "{kept:?}");
        }
        assert!(log.lines().is_empty());
    }

    #[test]
    fn a_name_that_climbs_or_names_the_root_deletes_nothing() {
        let home = FakeHome::new("engine-lifecycle-");
        let (ctx, log) = ctx_for(&home, idle());
        seed(&bottles(&home).join("sibling/system.reg"), "keep");
        let cx = home.root().join("Library/Application Support/CrossOver");
        seed(&cx.join("Sibling/keep.txt"), "keep");
        for name in [
            "..",
            ".",
            "",
            "../Sibling",
            "sibling/",
            "a/b",
            " sibling",
            "sibling\0",
        ] {
            assert_eq!(
                remove_created_bottle_dir(&ctx, name),
                RemoveCreated::Refused,
                "{name:?}"
            );
        }
        assert_eq!(
            std::fs::read_to_string(bottles(&home).join("sibling/system.reg")).unwrap(),
            "keep"
        );
        assert_eq!(
            std::fs::read_to_string(cx.join("Sibling/keep.txt")).unwrap(),
            "keep"
        );
        assert_eq!(log.lines().len(), 8);
        assert!(log.lines().iter().all(|(level, _)| *level == "warn"));
    }

    #[test]
    fn a_bottle_that_is_a_symlink_to_a_sibling_bottle_is_unlinked_and_the_sibling_survives() {
        let home = FakeHome::new("engine-lifecycle-");
        let (ctx, _log) = ctx_for(&home, idle());
        seed(&bottles(&home).join("sibling/system.reg"), "keep");
        seed(&bottles(&home).join("sibling/drive_c/game.exe"), "keep");
        std::os::unix::fs::symlink(bottles(&home).join("sibling"), bottles(&home).join("link"))
            .unwrap();

        assert_eq!(
            remove_created_bottle_dir(&ctx, "link"),
            RemoveCreated::Removed
        );

        assert!(std::fs::symlink_metadata(bottles(&home).join("link")).is_err());
        assert_eq!(
            std::fs::read_to_string(bottles(&home).join("sibling/system.reg")).unwrap(),
            "keep"
        );
        assert_eq!(
            std::fs::read_to_string(bottles(&home).join("sibling/drive_c/game.exe")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn a_bottles_root_that_is_itself_a_link_to_elsewhere_is_judged_at_where_it_points() {
        // The guard resolves the trust root with links followed: the bottle is inside the real root,
        // and a sibling of the real root is still out of reach.
        let home = FakeHome::new("engine-lifecycle-");
        let (ctx, _log) = ctx_for(&home, idle());
        let real = home.root().join("elsewhere/Bottles");
        seed(&real.join("mine/system.reg"), "mine");
        seed(&home.root().join("elsewhere/keep.txt"), "keep");
        std::fs::create_dir_all(bottles(&home).parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&real, bottles(&home)).unwrap();

        remove_created_bottle_dir(&ctx, "mine");

        assert!(!real.join("mine").exists());
        assert_eq!(
            std::fs::read_to_string(home.root().join("elsewhere/keep.txt")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn an_unresolvable_bottles_root_is_unknown_and_deletes_nothing() {
        // A root that is a dangling link cannot be resolved: the verdict is `unknown`, which is not
        // permission to delete (T-87-37).
        let home = FakeHome::new("engine-lifecycle-");
        let (ctx, log) = ctx_for(&home, idle());
        std::fs::create_dir_all(bottles(&home).parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(home.root().join("gone"), bottles(&home)).unwrap();
        seed(&home.root().join("gone-keep/keep.txt"), "keep");

        let outcome = remove_created_bottle_dir(&ctx, "mine");

        assert_eq!(outcome, RemoveCreated::Refused);
        assert!(std::fs::symlink_metadata(bottles(&home)).is_ok());
        assert_eq!(
            std::fs::read_to_string(home.root().join("gone-keep/keep.txt")).unwrap(),
            "keep"
        );
        // Whatever it answered, no bottle was removed and nothing was logged as a failure to delete.
        assert!(log
            .lines()
            .iter()
            .all(|(_, line)| !line.contains("could not remove")));
    }

    #[test]
    fn an_absent_bottle_is_a_quiet_no_op() {
        let home = FakeHome::new("engine-lifecycle-");
        let (ctx, log) = ctx_for(&home, idle());
        seed(&bottles(&home).join("sibling/system.reg"), "keep");
        assert_eq!(
            remove_created_bottle_dir(&ctx, "no-such-bottle"),
            RemoveCreated::Removed
        );
        assert!(log.lines().is_empty());
        assert!(bottles(&home).join("sibling/system.reg").exists());
    }

    #[tokio::test]
    async fn a_kill_sets_the_prefix_last_and_inherits_the_rest() {
        let home = FakeHome::new("engine-lifecycle-");
        let runner = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
            "/w/wineserver",
            SpecOutput {
                code: Some(0),
                ..SpecOutput::default()
            },
        ));
        let (ctx, _log) = ctx_for(&home, runner.clone());
        let ok = kill_bottle_wineserver(
            &ctx,
            "GameLib-a",
            "/w/wineserver",
            &[
                ("WINEPREFIX".to_string(), "/evil".to_string()),
                ("USER".to_string(), "crossover".to_string()),
            ],
            Duration::from_secs(15),
        )
        .await;
        assert!(ok);
        let spawns = runner.spawns();
        assert_eq!(spawns.len(), 1);
        assert_eq!(spawns[0].label, "engine-wineserver-kill");
        assert_eq!(spawns[0].argv, ["-k"]);
        assert!(!spawns[0].replace_env, "the real profile arm inherits");
        assert_eq!(spawns[0].timeout, Some(Duration::from_secs(15)));
        assert_eq!(
            spawns[0].env_set.get("WINEPREFIX").map(String::as_str),
            Some(bottle_dir(home.root(), "GameLib-a").as_str())
        );
        assert_eq!(spawns[0].env_set.len(), 2);
    }

    #[tokio::test]
    async fn an_unsafe_name_never_spawns_a_kill() {
        let home = FakeHome::new("engine-lifecycle-");
        let runner = idle();
        let (ctx, _log) = ctx_for(&home, runner.clone());
        for name in ["..", ".", "", "a/b", " x "] {
            assert!(
                !kill_bottle_wineserver(&ctx, name, "/w/wineserver", &[], Duration::from_secs(1))
                    .await
            );
        }
        assert!(runner.spawns().is_empty());
    }

    #[test]
    fn env_pairs_refuses_a_malformed_variable() {
        let ok = json!({"USER": "crossover"});
        assert_eq!(
            env_pairs(ok.as_object().unwrap()),
            Some(vec![("USER".to_string(), "crossover".to_string())])
        );
        for bad in [
            json!({"A=B": "x"}),
            json!({"": "x"}),
            json!({"A": 1}),
            json!({"A": "x\u{0}"}),
        ] {
            assert!(env_pairs(bad.as_object().unwrap()).is_none(), "{bad}");
        }
    }
}
