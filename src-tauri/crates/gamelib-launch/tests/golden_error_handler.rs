//! The Rust replay of `golden/error_handler` (88.2-05 recorded it from the TypeScript): `errorHandler` and
//! `askForceUninstall` over each case, with a scripted dialog, recording manager hooks and a recording UI.
//!
//! What a case compares, from its `result.json`:
//! - `asked`: the dialogs asked (title, message, buttons), in order;
//! - `frontend`: the in-app modals pushed to the renderer (title, message, type);
//! - `titleLookups`: the title reads the manager hook answered (the `getGameInfo` entries; each is one
//!   `game_title` call, and the `getGame` entry before it names the same runner);
//! - `forceUninstall`: the games removed from the installed list;
//! - `returned`: what `askForceUninstall` answered.
//!
//! Documented differences (each used by at least one case, or the replay fails):
//! - `dismissal-is-none` (the TS dialog answered its own `cancelId`, 0): a dismissal is `None` in Rust, and the
//!   hook is not called for it, exactly as for "No"; the `answered` column and a `returned` of 0 after a
//!   dismissal are therefore not compared as numbers.
//! - `main-window-raises`: the TS recorded the raise only for an in-app modal (`appState`); the Rust dialog
//!   seam raises the main window before every question as well (the TS `showMessageBox` did, off the record), so
//!   the count compared is one per in-app modal plus one per question.
//! - `english-catalog` and `interpolation-escaping` (`deltas.json`): the messages are the English catalog's,
//!   and the legendary message holds the escaped error text, which the Rust catalog's `t` reproduces.
//!
//! A count floor lives here next to the replay, equal to the MANIFEST's, so editing the JSON alone cannot
//! lower the bar.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use gamelib_core::clock::SystemClock;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::testing::{RecordingLog, RecordingUi, UiEvent};
use gamelib_info::ctx::{InfoCtx, InfoPaths, Platform as InfoPlatform};
use gamelib_info::http::ReqwestHttp;
use gamelib_knownfix::ctx::KnownFixCtx;
use gamelib_launch::ctx::LaunchCtx;
use gamelib_launch::hooks::testing::{HookCall, RecordingHooks};
use gamelib_launch::hooks::HookError;
use gamelib_launch::prepare::dialogs::testing::ScriptedDialogs;
use gamelib_launch::runner::error_handler::{ask_force_uninstall, error_handler};
use gamelib_launch::runner::RunnerName;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::WineCtx;
use serde_json::Value;

/// Every case of `golden/error_handler`: 99 `errorHandler` and 9 `askForceUninstall`. A later edit may raise
/// this, never lower it.
const ERROR_HANDLER_FLOOR: usize = 108;

fn golden_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/error_handler")
}

fn locales_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn runner_of(name: &str) -> RunnerName {
    match name {
        "legendary" => RunnerName::Legendary,
        "gog" => RunnerName::Gog,
        "nile" => RunnerName::Nile,
        "sideload" => RunnerName::Sideload,
        "steam" => RunnerName::Steam,
        other => panic!("unknown runner {other}"),
    }
}

struct Rig {
    ctx: LaunchCtx,
    ui: Arc<RecordingUi>,
    hooks: Arc<RecordingHooks>,
    dialogs: Arc<ScriptedDialogs>,
    _home: FakeHome,
}

impl Rig {
    /// A context over a fake HOME with the English catalog, a recording UI and log, the recording hooks
    /// answering `title`, and a dialog that answers `answer` (`None` is a dismissal).
    fn new(title: &Option<String>, answer: Option<usize>) -> Rig {
        let home = FakeHome::new("launch-error-handler-");
        let root = home.root().to_path_buf();
        let app_folder = root.join("app");
        let ui = Arc::new(RecordingUi::new());
        let engine = Arc::new(
            EngineCtx::new(
                Arc::new(StoreHost::new()),
                Arc::new(SystemClock),
                Platform::Linux,
                EnginePaths {
                    tools_path: app_folder.join("tools"),
                    user_data: app_folder.clone(),
                    app_folder: app_folder.clone(),
                    user_home: root.clone(),
                    temp: root.join("tmp"),
                },
                Shutdown::new(),
            )
            .with_ui(ui.clone())
            .with_log(Arc::new(RecordingLog::new()))
            .with_i18n(Arc::new(gamelib_i18n::Catalog::load(&locales_dir(), "en"))),
        );
        let knownfix = Arc::new(KnownFixCtx::new(
            engine.clone(),
            None,
            "https://relay.test",
            "0",
        ));
        let wine = Arc::new(WineCtx::new(engine.clone(), app_folder.join("tools")));
        let info = Arc::new(InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            InfoPlatform::Linux,
            InfoPaths {
                app_folder: app_folder.clone(),
                user_data: app_folder,
                temp: root.join("tmp"),
                public_dir: None,
            },
            "0".to_string(),
            Shutdown::new(),
            Arc::new(ReqwestHttp::new()),
        ));
        // A game whose info has no title answers its hook with an error; an empty title is an empty answer.
        let hooks = Arc::new(RecordingHooks::new().with_title(match title {
            Some(title) => Ok(title.clone()),
            None => Err(HookError("no-title")),
        }));
        let dialogs = Arc::new(ScriptedDialogs::new(vec![answer]));
        let ctx = LaunchCtx::new(engine, knownfix, wine, info)
            .with_dialogs(dialogs.clone())
            .with_hooks(hooks.clone());
        Rig {
            ctx,
            ui,
            hooks,
            dialogs,
            _home: home,
        }
    }
}

/// What the case's `answer` makes the dialog do: a button index, or a dismissal.
fn scripted_answer(case: &Value) -> Option<usize> {
    match case.get("answer") {
        Some(Value::Number(n)) => n.as_u64().map(|n| n as usize),
        Some(Value::String(s)) if s == "dismiss" => None,
        None => None,
        other => panic!("unknown answer {other:?}"),
    }
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
}

/// The documented differences that a case used.
#[derive(Default)]
struct Used(BTreeSet<&'static str>);

fn compare(case: &Value, used: &mut Used) -> Result<(), String> {
    let id = case["id"].as_str().ok_or("a case without an id")?;
    let entry = case["entry"].as_str().ok_or("a case without an entry")?;
    let runner = runner_of(case["runner"].as_str().ok_or("a case without a runner")?);
    let app_name = case["appName"].as_str().unwrap_or_default();
    let error = case["error"].as_str().unwrap_or_default();
    let title = case["title"].as_str().map(str::to_string);
    let answer = scripted_answer(case);
    let want = read_json(&golden_dir().join("expected").join(id).join("result.json"));

    let rig = Rig::new(&title, answer);
    let returned = runtime().block_on(async {
        match entry {
            "askForceUninstall" => ask_force_uninstall(&rig.ctx, runner, app_name).await,
            "errorHandler" => {
                error_handler(&rig.ctx, error, app_name, runner).await;
                None
            }
            other => panic!("unknown entry {other}"),
        }
    });

    // asked
    let asked: Vec<(String, String, Vec<String>)> = rig
        .dialogs
        .asked()
        .into_iter()
        .map(|a| (a.title, a.message, a.buttons))
        .collect();
    let want_asked: Vec<(String, String, Vec<String>)> = want["asked"]
        .as_array()
        .ok_or("asked is not a list")?
        .iter()
        .map(|a| {
            (
                a["title"].as_str().unwrap_or_default().to_string(),
                a["message"].as_str().unwrap_or_default().to_string(),
                a["buttons"]
                    .as_array()
                    .map(|b| {
                        b.iter()
                            .map(|b| b.as_str().unwrap_or_default().to_string())
                            .collect()
                    })
                    .unwrap_or_default(),
            )
        })
        .collect();
    if asked != want_asked {
        return Err(format!("{id}: asked {asked:?}, want {want_asked:?}"));
    }

    // frontend and the main-window raises
    let events = rig.ui.events();
    let frontend: Vec<(String, String, String)> = events
        .iter()
        .filter_map(|e| match e {
            UiEvent::ShowDialog {
                title, body, kind, ..
            } => Some((title.clone(), body.clone(), kind.clone())),
            _ => None,
        })
        .collect();
    let want_frontend: Vec<(String, String, String)> = want["frontend"]
        .as_array()
        .ok_or("frontend is not a list")?
        .iter()
        .map(|f| {
            (
                f["title"].as_str().unwrap_or_default().to_string(),
                f["message"].as_str().unwrap_or_default().to_string(),
                f["type"].as_str().unwrap_or_default().to_string(),
            )
        })
        .collect();
    if frontend != want_frontend {
        return Err(format!(
            "{id}: frontend {frontend:?}, want {want_frontend:?}"
        ));
    }
    let raises = events
        .iter()
        .filter(|e| matches!(e, UiEvent::RaiseMainWindow))
        .count();
    let want_raises = want_frontend.len() + want_asked.len();
    if raises != want_raises {
        return Err(format!(
            "{id}: {raises} main-window raises, want {want_raises}"
        ));
    }
    if !want_asked.is_empty() {
        used.0.insert("main-window-raises");
    }

    // titleLookups and forceUninstall
    let lookups: Vec<&Value> = want["titleLookups"]
        .as_array()
        .ok_or("titleLookups is not a list")?
        .iter()
        .collect();
    let want_titles: Vec<HookCall> = lookups
        .iter()
        .filter(|l| l["call"] == "getGameInfo")
        .map(|l| HookCall::GameTitle {
            runner,
            app_name: l["appName"].as_str().unwrap_or_default().to_string(),
        })
        .collect();
    if let Some(bad) = lookups
        .iter()
        .find(|l| l["call"] == "getGame" && l["runner"].as_str() != Some(runner.as_str()))
    {
        return Err(format!("{id}: a getGame lookup names {bad}"));
    }
    let calls = rig.hooks.calls();
    let titles: Vec<HookCall> = calls
        .iter()
        .filter(|c| matches!(c, HookCall::GameTitle { .. }))
        .cloned()
        .collect();
    if titles != want_titles {
        return Err(format!(
            "{id}: title lookups {titles:?}, want {want_titles:?}"
        ));
    }
    let uninstalls: Vec<HookCall> = calls
        .iter()
        .filter(|c| matches!(c, HookCall::ForceUninstall { .. }))
        .cloned()
        .collect();
    let want_uninstalls: Vec<HookCall> = want["forceUninstall"]
        .as_array()
        .ok_or("forceUninstall is not a list")?
        .iter()
        .map(|u| HookCall::ForceUninstall {
            runner,
            app_name: u["appName"].as_str().unwrap_or_default().to_string(),
        })
        .collect();
    if uninstalls != want_uninstalls {
        return Err(format!(
            "{id}: force uninstalls {uninstalls:?}, want {want_uninstalls:?}"
        ));
    }

    // returned
    if entry == "askForceUninstall" {
        let want_returned = if case.get("answer") == Some(&Value::String("dismiss".into())) {
            used.0.insert("dismissal-is-none");
            None
        } else {
            want["returned"].as_u64().map(|n| n as usize)
        };
        if returned != want_returned {
            return Err(format!(
                "{id}: returned {returned:?}, want {want_returned:?}"
            ));
        }
    }
    Ok(())
}

#[test]
fn golden_error_handler_replays_every_case() {
    let cases = read_json(&golden_dir().join("cases.json"));
    let cases = cases.as_array().expect("cases.json is a list");
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    let count = manifest["count"].as_u64().expect("manifest count") as usize;
    let floor = manifest["floor"].as_u64().expect("manifest floor") as usize;
    assert_eq!(cases.len(), count, "cases.json and MANIFEST.json disagree");
    assert!(
        floor <= ERROR_HANDLER_FLOOR,
        "the manifest floor {floor} is above this replay's {ERROR_HANDLER_FLOOR}"
    );
    let folders = std::fs::read_dir(golden_dir().join("expected"))
        .expect("expected/")
        .count();
    assert_eq!(folders, count, "one expected folder per case");

    let mut used = Used::default();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for case in cases {
        match compare(case, &mut used) {
            Ok(()) => compared += 1,
            Err(e) => failures.push(e),
        }
    }
    assert!(
        failures.is_empty(),
        "{} failed:\n{}",
        failures.len(),
        failures.join("\n")
    );
    println!("compared {compared} floor {ERROR_HANDLER_FLOOR}");
    assert!(
        compared >= ERROR_HANDLER_FLOOR,
        "error_handler: scanned {compared}, below the floor of {ERROR_HANDLER_FLOOR}"
    );
    for delta in ["main-window-raises", "dismissal-is-none"] {
        assert!(
            used.0.contains(delta),
            "no case used the difference {delta}"
        );
    }
}
