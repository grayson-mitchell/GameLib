//! The TS incident tests of the DXVK family, ported as behavioural Rust tests (D-08): the ones of
//! `dxvkInstallRemove.test.ts` (the 32-bit DLLs of a 64-bit prefix, every `reg` command finished before
//! the call returns and before `wineboot -u` starts, the pinned source, the CR-03 recopy, the strict
//! restore of the Steam engine switch and its G30 findings) and the facts `dxvkEvidenceLines.test.ts`
//! pinned about the evidence lines the live gates cite. The assertions that only read the TS source
//! text are dropped: each fact they stood for is asserted here on what the code does.
//!
//! No real wine is run: the wine core is a recorder that notes when each command starts and finishes
//! (a yield between the two, so an un-awaited caller visibly races ahead) and answers the exit code a
//! test scripts. The prefix and tools trees are real directories on a fake HOME, so a removal is
//! observed on disk. The guarded replacement of a tool version, which the TS never had, is tested
//! here too, over a replayed feed and the real `tar`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::ctx::{EngineCtx, EnginePaths, Platform};
use gamelib_engine::dxvk::{DxvkAction, DxvkRequest, DxvkSource, DxvkTool};
use gamelib_engine::fetch::{Fetch, Replay};
use gamelib_engine::testing::{RecordingLog, RecordingUi, ScriptedSpecRunner};
use gamelib_proc::spec::SpecProcRunner;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use gamelib_wine::ctx::{Arch, WineCtx};
use gamelib_wine::tools::dxvk::install_remove;
use gamelib_wine::tools::install_tool::{install_or_update_tool, Tool, ToolOutcome};
use gamelib_wine::tools::{DxvkError, ToolsHost, WineCall, WineFuture, WineRunner};
use serde_json::{json, Value};

const DLLS: [&str; 2] = ["d3d9.dll", "d3d11.dll"];
const VERSION: &str = "dxvk-2.3";
const KEY: &str = "HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides";

type Answer = Box<dyn Fn(&WineCall) -> Option<i32> + Send + Sync>;
type AtStart = Box<dyn Fn(&[String]) + Send + Sync>;

/// The wine core: records each command (start, end, the call) and answers a scripted exit code.
struct Wine {
    events: Mutex<Vec<String>>,
    calls: Mutex<Vec<WineCall>>,
    answer: Answer,
    /// Runs on `reg import`, as the prefix update an engine flip triggers would.
    on_import: Option<Box<dyn Fn() + Send + Sync>>,
    /// Runs at every command's start with the command's label.
    at_start: Option<AtStart>,
}

impl Wine {
    fn new(answer: impl Fn(&WineCall) -> Option<i32> + Send + Sync + 'static) -> Wine {
        Wine {
            events: Mutex::new(Vec::new()),
            calls: Mutex::new(Vec::new()),
            answer: Box::new(answer),
            on_import: None,
            at_start: None,
        }
    }

    /// Every command succeeds, and an override query says "absent" (code 1).
    fn healthy() -> Wine {
        Wine::new(|call| Some(i32::from(is_query(call))))
    }

    fn events(&self) -> Vec<String> {
        self.events.lock().unwrap().clone()
    }

    fn calls(&self) -> Vec<WineCall> {
        self.calls.lock().unwrap().clone()
    }

    /// `reg add` as `add`, a query as `query`, `reg import` as `import`, else the command itself.
    fn verbs(&self) -> Vec<String> {
        self.calls()
            .iter()
            .map(|c| {
                if c.command_parts[0] == "reg" {
                    c.command_parts[1].clone()
                } else {
                    c.command_parts[0].clone()
                }
            })
            .collect()
    }
}

fn is_query(call: &WineCall) -> bool {
    call.command_parts[..2] == ["reg", "query"]
}

fn label(parts: &[String]) -> String {
    if parts[0] == "reg" {
        format!("{}:{}", parts[1], parts.get(4).cloned().unwrap_or_default())
    } else {
        parts.join(" ")
    }
}

impl WineRunner for Wine {
    fn run<'a>(&'a self, _ctx: &'a WineCtx, call: WineCall) -> WineFuture<'a, Option<i32>> {
        Box::pin(async move {
            let name = label(&call.command_parts);
            if let Some(at_start) = &self.at_start {
                at_start(&call.command_parts);
            }
            if call.command_parts[..2] == ["reg", "import"] {
                if let Some(on_import) = &self.on_import {
                    on_import();
                }
            }
            self.events.lock().unwrap().push(format!("start {name}"));
            // Settle on a later turn, so an un-awaited caller visibly races ahead.
            tokio::task::yield_now().await;
            self.events.lock().unwrap().push(format!("end {name}"));
            let code = (self.answer)(&call);
            self.calls.lock().unwrap().push(call);
            code
        })
    }
}

/// Runs every spawn through the real runner over the fake profile's environment (a child never
/// reads the operator's real profile).
struct Isolated {
    env: Vec<(String, String)>,
}

impl SpecRunner for Isolated {
    fn run(&self, mut spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let mut env = self.env.clone();
        env.extend(std::mem::take(&mut spec.env));
        spec.env = env;
        SpecProcRunner.run(spec, on_line)
    }
}

/// One fake profile: the prefix, the tools directory and the context over them.
struct Bed {
    home: FakeHome,
    log: Arc<RecordingLog>,
    ui: Arc<RecordingUi>,
    ctx: WineCtx,
    prefix: PathBuf,
}

/// `isolate`: a spawn (the real `tar`) runs over this profile's environment unless `proc` is given.
fn bed_with(
    platform: Platform,
    proc: Option<Arc<dyn SpecRunner>>,
    fetch: Option<Arc<dyn Fetch>>,
    isolate: bool,
) -> Bed {
    let home = FakeHome::new("dxvk-incidents-");
    let root = home.root().to_path_buf();
    let proc = proc.or_else(|| {
        isolate.then(|| {
            let env = home
                .env()
                .into_iter()
                .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
                .collect();
            Arc::new(Isolated { env }) as Arc<dyn SpecRunner>
        })
    });
    let log = Arc::new(RecordingLog::new());
    let ui = Arc::new(RecordingUi::new());
    let mut engine = EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        EnginePaths {
            app_folder: root.join(".config").join("GameLib"),
            user_data: root.join("userdata"),
            tools_path: root.join(".config").join("GameLib").join("tools"),
            user_home: root.clone(),
            temp: root.join("tmp"),
        },
        Shutdown::new(),
    )
    .with_app_version("0.11.0")
    .with_log(Arc::clone(&log) as Arc<dyn gamelib_engine::sinks::EngineLog>)
    .with_ui(Arc::clone(&ui) as Arc<dyn gamelib_engine::sinks::EngineUi>);
    if let Some(proc) = proc {
        engine = engine.with_proc(proc);
    }
    if let Some(fetch) = fetch {
        engine = engine.with_fetch(fetch);
    }
    let ctx = WineCtx::new(Arc::new(engine), root.join("runtimes")).with_arch(Arch::X64);
    let prefix = root.join("prefix");
    Bed {
        home,
        log,
        ui,
        ctx,
        prefix,
    }
}

fn bed() -> Bed {
    bed_with(Platform::Linux, None, None, false)
}

fn write(path: &Path, text: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

impl Bed {
    fn tools(&self) -> PathBuf {
        self.ctx.engine.paths.tools_path.clone()
    }

    /// The TS `seed()`: a DXVK in the tools directory, and a 64-bit prefix holding the DLLs.
    fn seed(&self) {
        let tool_dir = self.tools().join("dxvk");
        for arch in ["x32", "x64"] {
            for dll in DLLS {
                write(&tool_dir.join(VERSION).join(arch).join(dll), "");
            }
        }
        write(&tool_dir.join("latest_dxvk"), VERSION);
        for dir in ["system32", "syswow64"] {
            for dll in DLLS {
                write(&self.prefix.join("drive_c/windows").join(dir).join(dll), "");
            }
        }
        write(&self.prefix.join(".update-timestamp"), "");
    }

    /// A pinned source of `x32` and `x64` DLLs holding their architecture, and a prefix that needs no
    /// `.update-timestamp` and no `latest_dxvk`.
    fn seed_source(&self) -> PathBuf {
        let source = self.home.root().join("src");
        for arch in ["x32", "x64"] {
            for dll in DLLS {
                write(&source.join(arch).join(dll), arch);
            }
        }
        std::fs::remove_file(self.prefix.join(".update-timestamp")).unwrap();
        write(&self.prefix.join("system.reg"), "");
        std::fs::remove_dir_all(self.tools().join("dxvk")).unwrap();
        for dir in ["system32", "syswow64"] {
            for dll in DLLS {
                let _ =
                    std::fs::remove_file(self.prefix.join("drive_c/windows").join(dir).join(dll));
            }
        }
        source
    }

    fn settings(&self) -> Value {
        json!({
            "winePrefix": self.prefix.to_string_lossy(),
            "wineVersion": {"bin": "/usr/bin/wine", "name": "Wine", "type": "wine"},
        })
    }

    fn request(&self, action: DxvkAction, source: Option<(&Path, &str)>) -> DxvkRequest {
        DxvkRequest {
            settings: self.settings(),
            tool: DxvkTool::Dxvk,
            action,
            source: source.map(|(dir, version)| DxvkSource {
                dir: dir.to_string_lossy().into_owned(),
                version: version.to_string(),
            }),
        }
    }

    async fn run(
        &self,
        wine: &Wine,
        action: DxvkAction,
        source: Option<(&Path, &str)>,
    ) -> Result<bool, DxvkError> {
        install_remove(
            &self.ctx,
            &ToolsHost::default(),
            wine,
            self.request(action, source),
        )
        .await
    }

    fn dll(&self, dir: &str, name: &str) -> PathBuf {
        self.prefix.join("drive_c/windows").join(dir).join(name)
    }

    fn version_file(&self) -> PathBuf {
        self.prefix.join("current_dxvk")
    }

    fn logged(&self) -> Vec<String> {
        self.log.lines().into_iter().map(|(_, line)| line).collect()
    }
}

// ---- restore on a 64-bit prefix --------------------------------------------------------------------

#[tokio::test]
async fn restore_removes_the_32_bit_dlls_from_syswow64_as_well_as_the_64_bit_ones() {
    let bed = bed();
    bed.seed();
    bed.run(&Wine::healthy(), DxvkAction::Restore, None)
        .await
        .unwrap();
    for dll in DLLS {
        assert!(!bed.dll("system32", dll).exists(), "system32/{dll}");
        assert!(!bed.dll("syswow64", dll).exists(), "syswow64/{dll}");
    }
}

#[tokio::test]
async fn restore_finishes_every_reg_delete_before_wineboot_starts() {
    let bed = bed();
    bed.seed();
    let wine = Wine::healthy();
    bed.run(&wine, DxvkAction::Restore, None).await.unwrap();

    let events = wine.events();
    let deletes: Vec<&String> = events
        .iter()
        .filter(|e| e.starts_with("end delete:"))
        .collect();
    // One override per DLL NAME: the 64-bit and 32-bit lists share names and DllOverrides is keyed by
    // name, so the old 2 x (64-bit + 32-bit) = 4 calls repeated each edit.
    assert_eq!(deletes.len(), 2, "{events:?}");
    let wineboot = events
        .iter()
        .position(|e| e == "start wineboot -u")
        .unwrap();
    for end in deletes {
        assert!(
            events.iter().position(|e| e == end).unwrap() < wineboot,
            "{events:?}"
        );
    }
}

// ---- backup ----------------------------------------------------------------------------------------

#[tokio::test]
async fn backup_does_not_return_until_every_reg_add_has_finished() {
    let bed = bed();
    bed.seed();
    let wine = Wine::healthy();
    bed.run(&wine, DxvkAction::Backup, None).await.unwrap();

    // One override per DLL name (see the restore test above); all ended before the call returned, and
    // the copies and the version marker too (no waiting for a tree to settle).
    let ends = wine
        .events()
        .iter()
        .filter(|e| e.starts_with("end add:"))
        .count();
    assert_eq!(ends, 2);
    for dll in DLLS {
        assert!(bed.dll("system32", dll).exists());
        assert!(bed.dll("syswow64", dll).exists());
    }
    assert_eq!(
        std::fs::read_to_string(bed.version_file()).unwrap(),
        VERSION
    );
}

// ---- a pinned source -------------------------------------------------------------------------------

#[tokio::test]
async fn a_pinned_source_is_copied_and_recorded_before_the_call_returns() {
    let bed = bed();
    bed.seed();
    let source = bed.seed_source();
    let done = bed
        .run(
            &Wine::healthy(),
            DxvkAction::Backup,
            Some((&source, "pinned-1.10.3")),
        )
        .await;
    assert_eq!(done, Ok(true));
    for dll in DLLS {
        assert_eq!(
            std::fs::read_to_string(bed.dll("system32", dll)).unwrap(),
            "x64"
        );
        assert_eq!(
            std::fs::read_to_string(bed.dll("syswow64", dll)).unwrap(),
            "x32"
        );
    }
    assert_eq!(
        std::fs::read_to_string(bed.version_file()).unwrap(),
        "pinned-1.10.3"
    );
    // The tools-directory tree was never consulted.
    assert!(!bed.tools().join("dxvk/latest_dxvk").exists());
}

// ---- the CR-03 short-circuit -----------------------------------------------------------------------

#[tokio::test]
async fn a_pinned_backup_recopies_when_the_version_file_already_matches() {
    let bed = bed();
    bed.seed();
    let source = bed.seed_source();
    write(&bed.version_file(), "same-1");
    let wine = Wine::healthy();
    let done = bed
        .run(&wine, DxvkAction::Backup, Some((&source, "same-1")))
        .await;
    assert_eq!(done, Ok(true));
    for dll in DLLS {
        assert!(bed.dll("system32", dll).exists());
    }
    assert!(wine.events().iter().any(|e| e.starts_with("end add:")));
}

#[tokio::test]
async fn a_source_less_backup_keeps_the_already_installed_short_circuit() {
    let bed = bed();
    bed.seed();
    write(&bed.version_file(), "same-1");
    write(&bed.tools().join("dxvk/latest_dxvk"), "same-1");
    // The tools directory has to hold the version `latest_dxvk` names.
    for arch in ["x32", "x64"] {
        for dll in DLLS {
            write(&bed.tools().join("dxvk/same-1").join(arch).join(dll), "");
        }
    }
    let wine = Wine::healthy();
    assert_eq!(bed.run(&wine, DxvkAction::Backup, None).await, Ok(true));
    assert!(!wine.events().iter().any(|e| e.starts_with("end add:")));
    assert!(bed
        .logged()
        .contains(&"dxvk already installed!".to_string()));
}

#[tokio::test]
async fn a_pinned_backup_on_a_fresh_prefix_copies_and_records_the_version() {
    let bed = bed();
    bed.seed();
    let source = bed.seed_source();
    let done = bed
        .run(
            &Wine::healthy(),
            DxvkAction::Backup,
            Some((&source, "new-2")),
        )
        .await;
    assert_eq!(done, Ok(true));
    assert_eq!(
        std::fs::read_to_string(bed.version_file()).unwrap(),
        "new-2"
    );
}

#[tokio::test]
async fn a_pinned_backup_that_cannot_copy_is_false_and_leaves_no_version() {
    let bed = bed();
    bed.seed();
    let source = bed.seed_source();
    std::fs::remove_file(source.join("x64/d3d9.dll")).unwrap();
    let done = bed
        .run(&Wine::healthy(), DxvkAction::Backup, Some((&source, "v")))
        .await;
    // A missing source DLL is a name nobody lists: the copy of the ones that exist works.
    assert_eq!(done, Ok(true));
    // A listed DLL that cannot be read (a directory in its place) is a copy error.
    std::fs::create_dir(source.join("x64/d3d9.dll")).unwrap();
    std::fs::remove_file(bed.version_file()).unwrap();
    let done = bed
        .run(&Wine::healthy(), DxvkAction::Backup, Some((&source, "v")))
        .await;
    assert_eq!(done, Ok(false));
    assert!(!bed.version_file().exists());
}

// ---- the strict restore ----------------------------------------------------------------------------

/// The state of the TS `beforeEach` of the strict-restore block: a pinned source, a prefix with
/// `system.reg` and `current_dxvk` = `v1`, and the stock (seeded) DLLs in place.
fn strict_bed() -> (Bed, PathBuf) {
    let bed = bed();
    bed.seed();
    let source = bed.home.root().join("src");
    for arch in ["x32", "x64"] {
        for dll in DLLS {
            write(&source.join(arch).join(dll), arch);
        }
    }
    std::fs::remove_file(bed.prefix.join(".update-timestamp")).unwrap();
    write(&bed.prefix.join("system.reg"), "");
    write(&bed.version_file(), "v1");
    (bed, source)
}

fn stock_dlls(bed: &Bed) -> Vec<PathBuf> {
    ["system32", "syswow64"]
        .iter()
        .flat_map(|dir| DLLS.iter().map(move |dll| (dir, dll)))
        .map(|(dir, dll)| bed.dll(dir, dll))
        .collect()
}

async fn strict(bed: &Bed, source: &Path, wine: &Wine) -> bool {
    bed.run(wine, DxvkAction::Restore, Some((source, "v1")))
        .await
        .unwrap()
}

#[tokio::test]
async fn a_strict_restore_is_true_and_removes_the_version_file_last_when_every_step_succeeds() {
    let (bed, source) = strict_bed();
    let version_file = bed.version_file();
    let present = Arc::new(Mutex::new(Vec::new()));
    let seen = Arc::clone(&present);
    let mut wine = Wine::healthy();
    wine.at_start = Some(Box::new(move |_| {
        seen.lock().unwrap().push(version_file.exists())
    }));
    assert!(strict(&bed, &source, &wine).await);
    // The version file was still present during every wine step (wineboot included).
    assert!(present.lock().unwrap().iter().all(|here| *here));
    assert_eq!(wine.verbs(), ["import", "query", "query", "wineboot"]);
    assert!(!bed.version_file().exists());
}

#[tokio::test]
async fn g30_the_dlls_go_before_the_first_wine_process_and_the_overrides_are_one_reg_import() {
    let (bed, source) = strict_bed();
    let dlls = stock_dlls(&bed);
    let reg_file = bed.prefix.join("drive_c/gamelib-dxvk-restore.reg");
    let seen: Arc<Mutex<(Vec<bool>, String)>> = Arc::new(Mutex::new((Vec::new(), String::new())));
    let probe = Arc::clone(&seen);
    let first = Arc::new(Mutex::new(true));
    let mut wine = Wine::healthy();
    {
        let reg_file = reg_file.clone();
        wine.at_start = Some(Box::new(move |_| {
            let mut first = first.lock().unwrap();
            if *first {
                *first = false;
                let mut state = probe.lock().unwrap();
                state.0 = dlls.iter().map(|f| f.exists()).collect();
                state.1 = std::fs::read_to_string(&reg_file).unwrap_or_default();
            }
        }));
    }
    assert!(strict(&bed, &source, &wine).await);

    let (dlls_at_first_call, text) = seen.lock().unwrap().clone();
    assert_eq!(dlls_at_first_call.len(), 4);
    assert!(!dlls_at_first_call.contains(&true));
    let calls = wine.calls();
    assert_eq!(
        calls[0].command_parts,
        ["reg", "import", "C:\\gamelib-dxvk-restore.reg"]
    );
    assert_eq!(
        text,
        format!(
            "Windows Registry Editor Version 5.00\r\n\r\n[{KEY}]\r\n\"d3d11\"=-\r\n\"d3d9\"=-\r\n"
        )
    );
    assert!(!reg_file.exists());
    let regs: Vec<&WineCall> = calls
        .iter()
        .filter(|c| c.command_parts[0] == "reg")
        .collect();
    assert_eq!(regs.len(), 3);
    assert_eq!(regs[1].command_parts, ["reg", "query", KEY, "/v", "d3d11"]);
    assert_eq!(regs[2].command_parts, ["reg", "query", KEY, "/v", "d3d9"]);
}

#[tokio::test]
async fn g30_wineboot_is_skipped_when_the_prefix_update_already_restored_the_stock_dlls() {
    let (bed, source) = strict_bed();
    let dlls = stock_dlls(&bed);
    let mut wine = Wine::healthy();
    wine.on_import = Some(Box::new(move || {
        for dll in &dlls {
            std::fs::write(dll, "builtin").unwrap();
        }
    }));
    assert!(strict(&bed, &source, &wine).await);
    assert!(!wine.verbs().contains(&"wineboot".to_string()));
    assert!(!bed.version_file().exists());
    assert!(bed
        .logged()
        .contains(&"Wine stock DLLs restored by the prefix update".to_string()));
}

#[tokio::test]
async fn g30_wineboot_runs_when_a_stock_dll_is_still_missing_after_the_import() {
    let (bed, source) = strict_bed();
    // Only one of the four comes back, as on a same-engine restore with no prefix update.
    let one = stock_dlls(&bed).remove(0);
    let mut wine = Wine::healthy();
    wine.on_import = Some(Box::new(move || std::fs::write(&one, "builtin").unwrap()));
    assert!(strict(&bed, &source, &wine).await);
    assert_eq!(wine.verbs().last().map(String::as_str), Some("wineboot"));
}

/// A wine whose queries answer `code` for the names it lists and "absent" (1) for the rest.
fn wine_with_queries(code: Option<i32>, names: &'static [&'static str]) -> Wine {
    Wine::new(move |call| {
        if is_query(call) {
            let at = call.command_parts.iter().position(|p| p == "/v").unwrap() + 1;
            if names.contains(&call.command_parts[at].as_str()) {
                return code;
            }
            return Some(1);
        }
        Some(0)
    })
}

#[tokio::test]
async fn g30_an_override_that_survives_the_import_is_false_and_keeps_the_version_file() {
    let (bed, source) = strict_bed();
    // Value present: only the exit code says so (the output may be cut short).
    let wine = wine_with_queries(Some(0), &["d3d11"]);
    assert!(!strict(&bed, &source, &wine).await);
    assert!(bed.version_file().exists());
    assert!(bed
        .logged()
        .iter()
        .any(|l| l.ends_with("overrides left: d3d11")));
}

#[tokio::test]
async fn g30_a_verify_query_with_no_exit_code_proves_nothing() {
    let (bed, source) = strict_bed();
    let wine = wine_with_queries(None, &["d3d9"]);
    assert!(!strict(&bed, &source, &wine).await);
    assert!(bed.version_file().exists());
    assert!(bed
        .logged()
        .iter()
        .any(|l| l.contains("reg query d3d9 code=undefined")));
}

#[tokio::test]
async fn g30_a_verify_query_with_an_exit_code_other_than_0_or_1_proves_nothing() {
    let (bed, source) = strict_bed();
    let wine = wine_with_queries(Some(2), &["d3d11"]);
    assert!(!strict(&bed, &source, &wine).await);
    assert!(bed.version_file().exists());
}

#[tokio::test]
async fn an_override_that_is_already_absent_is_a_success_whatever_the_output() {
    // 59-REVIEW WR-01 and the G30 findings: the verdict is the exit code alone (1 is "not there",
    // whether the key or only the value is missing), so late or cut-short output changes nothing.
    let (bed, source) = strict_bed();
    assert!(strict(&bed, &source, &Wine::healthy()).await);
    assert!(!bed.version_file().exists());
}

#[tokio::test]
async fn a_failed_reg_import_is_false_and_never_reads_code_1_as_absent() {
    let (bed, source) = strict_bed();
    let wine = Wine::new(|call| {
        if call.command_parts[..2] == ["reg", "import"] {
            Some(1)
        } else {
            Some(0)
        }
    });
    assert!(!strict(&bed, &source, &wine).await);
    // No /v query ran, and the version file is kept.
    assert!(wine
        .calls()
        .iter()
        .all(|c| !c.command_parts.contains(&"/v".to_string())));
    assert!(bed.version_file().exists());
    assert!(bed.logged().iter().any(|l| l.contains("reg import code=1")));
}

#[tokio::test]
async fn g30_a_strict_restore_runs_every_wine_step_without_waiting_and_resolves_on_exit() {
    let (bed, source) = strict_bed();
    let wine = Wine::healthy();
    assert!(strict(&bed, &source, &wine).await);
    let calls = wine.calls();
    assert!(calls.len() > 1);
    assert!(calls.iter().any(|c| c.command_parts[0] == "wineboot"));
    for call in &calls {
        assert!(!call.wait);
        assert!(call.resolve_on_exit);
    }
}

#[tokio::test]
async fn a_strict_restore_whose_wineboot_fails_is_false_and_keeps_the_version_file() {
    let (bed, source) = strict_bed();
    let wine = Wine::new(|call| {
        if call.command_parts[0] == "wineboot" {
            Some(3)
        } else {
            Some(i32::from(is_query(call)))
        }
    });
    assert!(!strict(&bed, &source, &wine).await);
    assert!(bed.version_file().exists());
}

#[tokio::test]
async fn a_strict_restore_that_cannot_remove_a_dll_is_false_and_keeps_the_version_file() {
    let (bed, source) = strict_bed();
    // A non-empty directory where the DLL should be makes the removal fail (not "not found").
    let blocked = bed.dll("system32", "d3d9.dll");
    std::fs::remove_file(&blocked).unwrap();
    write(&blocked.join("keep"), "");
    assert!(!strict(&bed, &source, &Wine::healthy()).await);
    assert!(bed.version_file().exists());
}

#[tokio::test]
async fn a_strict_restore_treats_an_already_absent_dll_as_success() {
    let (bed, source) = strict_bed();
    for dll in stock_dlls(&bed) {
        std::fs::remove_file(dll).unwrap();
    }
    assert!(strict(&bed, &source, &Wine::healthy()).await);
}

// ---- the toggle's restore keeps the lenient Heroic behaviour ---------------------------------------

#[tokio::test]
async fn a_restore_without_a_source_waits_on_the_process_and_has_no_resolve_on_exit() {
    let bed = bed();
    bed.seed();
    let wine = Wine::healthy();
    bed.run(&wine, DxvkAction::Restore, None).await.unwrap();
    let calls = wine.calls();
    assert!(!calls.is_empty());
    for call in &calls {
        assert!(call.wait);
        assert!(!call.resolve_on_exit);
    }
}

#[tokio::test]
async fn a_restore_without_a_source_is_true_even_when_every_wine_command_fails() {
    let bed = bed();
    bed.seed();
    let wine = Wine::new(|_| Some(1));
    assert_eq!(bed.run(&wine, DxvkAction::Restore, None).await, Ok(true));
}

// ---- the evidence lines (dxvkEvidenceLines.test.ts) ------------------------------------------------

#[tokio::test]
async fn the_install_dispatch_line_comes_once_and_before_the_already_installed_early_return() {
    let bed = bed();
    bed.seed();
    write(&bed.version_file(), VERSION);
    bed.run(&Wine::healthy(), DxvkAction::Backup, None)
        .await
        .unwrap();
    let lines = bed.logged();
    let dispatch: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| l.starts_with("installing dxvk on..."))
        .map(|(i, _)| i)
        .collect();
    let early = lines
        .iter()
        .position(|l| l == "dxvk already installed!")
        .unwrap();
    assert_eq!(dispatch.len(), 1, "{lines:?}");
    // The marker says the guards were all passed and the install direction entered even when the
    // copy itself is skipped: the property a live-gate contract relies on when it cites the line.
    assert!(dispatch[0] < early);
}

#[tokio::test]
async fn the_install_direction_reaches_the_wine_core_through_the_dll_registration_loop() {
    // The install copies DLLs itself, but right after it registers each one with a `reg add ...
    // DllOverrides ... native,builtin` through the wine core (retiring research Pitfall 2).
    let bed = bed();
    bed.seed();
    let wine = Wine::healthy();
    bed.run(&wine, DxvkAction::Backup, None).await.unwrap();
    let calls = wine.calls();
    assert!(calls.len() >= 2);
    for call in &calls {
        assert_eq!(call.command_parts[..3], ["reg", "add", KEY]);
        assert_eq!(call.command_parts[5..7], ["/d", "native,builtin"]);
    }
}

#[tokio::test]
async fn the_restore_direction_is_told_apart_by_its_commands_and_its_lines() {
    let bed = bed();
    bed.seed();
    let wine = Wine::healthy();
    bed.run(&wine, DxvkAction::Restore, None).await.unwrap();
    // reg delete and wineboot -u appear only in a restore, never the install marker.
    assert!(wine.verbs().contains(&"delete".to_string()));
    assert_eq!(wine.verbs().last().map(String::as_str), Some("wineboot"));
    assert!(!bed
        .logged()
        .iter()
        .any(|l| l.starts_with("installing dxvk on...")));
}

#[tokio::test]
async fn the_version_marker_is_written_after_the_install_dispatch_line() {
    let bed = bed();
    bed.seed();
    let marker = bed.version_file();
    let at_dispatch = Arc::new(Mutex::new(None));
    let seen = Arc::clone(&at_dispatch);
    let mut wine = Wine::healthy();
    // At the first wine command the dispatch line is already logged and the marker not yet written.
    wine.at_start = Some(Box::new(move |_| {
        seen.lock().unwrap().get_or_insert_with(|| marker.exists());
    }));
    bed.run(&wine, DxvkAction::Backup, None).await.unwrap();
    assert_eq!(*at_dispatch.lock().unwrap(), Some(false));
    assert!(bed.version_file().exists());
}

// ---- the tools directory: guarded replacement and extraction ---------------------------------------

/// The synthetic macOS DXVK archive the 87-09 recording made for the pinned-tag lookup.
fn recorded_macos_case() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/recorded/dxvk/mac-dxvk-install-crossover-pinned-tag")
}

fn macos_tool() -> Tool {
    Tool {
        name: "dxvk-macOS",
        url: "https://api.github.com/repos/Gcenx/DXVK-macOS/releases/tags/v1.10.3-20230507-repack"
            .to_string(),
        os: "darwin",
        strip: None,
    }
}

fn update_bed() -> (Bed, Arc<Replay>) {
    let replay = Arc::new(Replay::from_case(&recorded_macos_case()).unwrap());
    let bed = bed_with(
        Platform::Mac,
        None,
        Some(Arc::clone(&replay) as Arc<dyn Fetch>),
        true,
    );
    (bed, replay)
}

const OLD: &str = "dxvk-macOS-old";
const NEW: &str = "dxvk-macOS-async-v1.10.3-20230507-repack";

fn seed_old_version(bed: &Bed, recorded_version: &str) {
    let dir = bed.tools().join("dxvk-macOS");
    write(&dir.join(OLD).join("x32/d3d9.dll"), "old");
    write(&dir.join("latest_dxvk-macOS"), recorded_version);
}

#[tokio::test]
async fn an_update_removes_the_replaced_version_and_the_archive_inside_the_tool_directory() {
    let (bed, replay) = update_bed();
    seed_old_version(&bed, OLD);
    let outcome = install_or_update_tool(&bed.ctx, &macos_tool()).await;
    replay.finish().unwrap();
    assert_eq!(outcome, Ok(ToolOutcome::Updated));

    let dir = bed.tools().join("dxvk-macOS");
    assert!(!dir.join(OLD).exists(), "the replaced version");
    assert!(dir.join(NEW).join("x64/d3d11.dll").exists());
    assert_eq!(
        std::fs::read_to_string(dir.join("latest_dxvk-macOS")).unwrap(),
        NEW
    );
    // The archive is gone.
    assert!(!dir.join(format!("{NEW}.tar.gz")).exists());
    assert!(!dir.join(format!("{NEW}.tar.gz.part")).exists());
    assert!(bed.logged().contains(&"dxvk-macOS updated!".to_string()));
}

#[tokio::test]
async fn a_recorded_version_that_walks_out_of_the_tool_directory_removes_nothing() {
    let (bed, replay) = update_bed();
    seed_old_version(&bed, "../outside");
    let outside = bed.tools().join("outside");
    write(&outside.join("precious"), "keep");
    let outcome = install_or_update_tool(&bed.ctx, &macos_tool()).await;
    replay.finish().unwrap();
    assert_eq!(outcome, Ok(ToolOutcome::Updated));
    assert_eq!(
        std::fs::read_to_string(outside.join("precious")).unwrap(),
        "keep"
    );
    // The refusal is logged without the path.
    assert!(bed
        .logged()
        .contains(&"The recorded version of dxvk-macOS is not a folder name".to_string()));
}

#[cfg(unix)]
#[tokio::test]
async fn a_replaced_version_that_is_a_link_is_unlinked_and_its_target_is_left() {
    let (bed, replay) = update_bed();
    let dir = bed.tools().join("dxvk-macOS");
    let victim = bed.home.root().join("victim");
    write(&victim.join("precious"), "keep");
    std::fs::create_dir_all(&dir).unwrap();
    std::os::unix::fs::symlink(&victim, dir.join(OLD)).unwrap();
    write(&dir.join("latest_dxvk-macOS"), OLD);
    let outcome = install_or_update_tool(&bed.ctx, &macos_tool()).await;
    replay.finish().unwrap();
    assert_eq!(outcome, Ok(ToolOutcome::Updated));
    assert!(
        std::fs::symlink_metadata(dir.join(OLD)).is_err(),
        "the link"
    );
    assert_eq!(
        std::fs::read_to_string(victim.join("precious")).unwrap(),
        "keep"
    );
}

#[tokio::test]
async fn an_up_to_date_tool_is_not_downloaded_again() {
    let (bed, replay) = update_bed();
    let dir = bed.tools().join("dxvk-macOS");
    write(&dir.join(NEW).join("x32/d3d9.dll"), "current");
    write(&dir.join("latest_dxvk-macOS"), NEW);
    // Only the feed lookup is made; the archive exchanges stay unconsumed, so finish() reports them.
    let outcome = install_or_update_tool(&bed.ctx, &macos_tool()).await;
    assert_eq!(outcome, Ok(ToolOutcome::UpToDate));
    assert!(replay.finish().unwrap_err().contains("unconsumed"));
    assert_eq!(
        std::fs::read_to_string(dir.join(NEW).join("x32/d3d9.dll")).unwrap(),
        "current"
    );
}

#[tokio::test]
async fn a_tool_for_another_os_makes_no_request() {
    let (bed, replay) = update_bed();
    let mut tool = macos_tool();
    tool.os = "linux";
    assert_eq!(
        install_or_update_tool(&bed.ctx, &tool).await,
        Ok(ToolOutcome::OtherOs)
    );
    assert!(replay.finish().unwrap_err().contains("unconsumed"));
}

#[tokio::test]
async fn a_failed_extraction_removes_the_archive_and_the_partial_tree_and_writes_no_version() {
    let replay = Arc::new(Replay::from_case(&recorded_macos_case()).unwrap());
    let proc = Arc::new(ScriptedSpecRunner::new(Vec::new()).on_program(
        "tar",
        SpecOutput {
            code: Some(2),
            stderr: "tar: Error is not recoverable".to_string(),
            ..SpecOutput::default()
        },
    ));
    let bed = bed_with(
        Platform::Mac,
        Some(proc),
        Some(Arc::clone(&replay) as Arc<dyn Fetch>),
        false,
    );
    let outcome = install_or_update_tool(&bed.ctx, &macos_tool()).await;
    replay.finish().unwrap();
    assert_eq!(outcome, Ok(ToolOutcome::ExtractFailed));
    let dir = bed.tools().join("dxvk-macOS");
    assert!(!dir.join(NEW).exists(), "the partial extraction");
    assert!(!dir.join(format!("{NEW}.tar.gz")).exists(), "the archive");
    assert!(!dir.join("latest_dxvk-macOS").exists(), "no version file");
}

#[tokio::test]
async fn a_download_failure_tells_the_user_and_installs_nothing() {
    // The golden covers the DXVK text; this pins that the answer is a value, the dialog is raised
    // once and the tool directory holds no archive.
    let replay = Arc::new(
        Replay::from_case(
            &Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/recorded/dxvk/mac-dxvk-install-download-fails"),
        )
        .unwrap(),
    );
    let bed = bed_with(
        Platform::Mac,
        None,
        Some(Arc::clone(&replay) as Arc<dyn Fetch>),
        false,
    );
    let outcome = install_or_update_tool(&bed.ctx, &macos_tool()).await;
    replay.finish().unwrap();
    assert_eq!(outcome, Ok(ToolOutcome::DownloadFailed));
    assert_eq!(bed.ui.events().len(), 1);
    let dir = bed.tools().join("dxvk-macOS");
    assert!(!dir.join("latest_dxvk-macOS").exists());
    let leftovers: Vec<_> = std::fs::read_dir(&dir)
        .map(|d| d.map(|e| e.unwrap().file_name()).collect())
        .unwrap_or_default();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[tokio::test]
async fn a_feed_that_is_not_a_release_is_an_error_not_a_panic() {
    // A case with no recorded exchange: the feed request has no twin and fails.
    let case = FakeHome::new("dxvk-empty-case-");
    write(&case.root().join("exchanges.json"), "[]");
    let replay = Arc::new(Replay::from_case(case.root()).unwrap());
    let bed = bed_with(Platform::Mac, None, Some(replay as Arc<dyn Fetch>), false);
    assert_eq!(
        install_or_update_tool(&bed.ctx, &macos_tool()).await,
        Err(DxvkError::Feed)
    );
}

// ---- the request is checked before anything runs ---------------------------------------------------

#[tokio::test]
async fn settings_without_a_prefix_are_a_bad_request_and_run_nothing() {
    let bed = bed();
    let wine = Wine::healthy();
    let request = DxvkRequest {
        settings: json!({"wineVersion": {"bin": "/usr/bin/wine", "name": "Wine", "type": "wine"}}),
        tool: DxvkTool::Dxvk,
        action: DxvkAction::Backup,
        source: None,
    };
    let done = install_remove(&bed.ctx, &ToolsHost::default(), &wine, request).await;
    assert_eq!(done, Err(DxvkError::BadSettings));
    assert!(wine.calls().is_empty());
}

#[tokio::test]
async fn a_tool_version_file_that_names_a_path_is_refused_before_it_is_read() {
    let bed = bed();
    bed.seed();
    write(&bed.tools().join("dxvk/latest_dxvk"), "../../..");
    let wine = Wine::healthy();
    let done = bed.run(&wine, DxvkAction::Backup, None).await;
    assert_eq!(done, Err(DxvkError::Unreadable));
    assert!(wine.calls().is_empty());
}

// ---- the engine's DxvkInstaller seam (87-29, D-25 (a)) ---------------------------------------------

use gamelib_wine::WineDxvkInstaller;
use sha2::{Digest, Sha256};

fn golden_case_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/dxvk")
}

fn hex_sha256(path: &Path) -> String {
    Sha256::digest(std::fs::read(path).unwrap())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Every file under `dir`, relative to `root`, as a `/`-joined path.
fn files_under(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries {
        let path = entry.unwrap().path();
        if path.is_dir() {
            files_under(root, &path, out);
        } else {
            let rel = path.strip_prefix(root).unwrap();
            out.push(
                rel.components()
                    .map(|c| c.as_os_str().to_string_lossy().into_owned())
                    .collect::<Vec<_>>()
                    .join("/"),
            );
        }
    }
}

/// An engine context whose `dxvk` is a [`WineDxvkInstaller`] over `wine`. The wine context holds the
/// engine context it was built from, so the installer's own context is a second one over the same
/// directories (the shell breaks the same loop with a call-time lookup).
fn engine_with_installer(wine: Arc<WineCtx>, runner: Arc<Wine>) -> EngineCtx {
    let paths = wine.engine.paths.clone();
    let platform = wine.engine.platform;
    let installer = WineDxvkInstaller::new(wine).with_runner(runner as Arc<dyn WineRunner>);
    EngineCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        paths,
        Shutdown::new(),
    )
    .with_dxvk(Arc::new(installer))
}

/// The tracer of 87-29: the golden macOS install ("tools directory already holds the build") driven
/// through `EngineCtx.dxvk.install_remove`, the way the engine switch calls it, leaves the files
/// `golden_dxvk` pins for the same case (same paths, same sha256).
#[tokio::test]
async fn the_engine_dxvk_trait_installs_the_macos_golden_tree() {
    let bed = bed_with(Platform::Mac, None, None, false);
    let root = bed.home.root().to_path_buf();
    let dir = golden_case_dir();
    let cases: Value =
        serde_json::from_slice(&std::fs::read(dir.join("cases.json")).unwrap()).unwrap();
    let cases = cases
        .as_array()
        .cloned()
        .or_else(|| cases["cases"].as_array().cloned())
        .unwrap();
    let case = cases
        .iter()
        .find(|c| c["id"] == "mac-dxvk-install-from-tools")
        .expect("the golden case");

    let tools = bed.tools();
    let expand = |text: &str| {
        text.replace("<HOME>", &root.to_string_lossy())
            .replace("<TOOLS>", &tools.to_string_lossy())
    };
    for entry in case["seed"].as_array().unwrap() {
        let path = PathBuf::from(expand(entry["path"].as_str().unwrap()));
        if entry["dir"] == true {
            std::fs::create_dir_all(&path).unwrap();
        } else {
            write(&path, entry["text"].as_str().unwrap());
        }
    }

    let wine = Arc::new(Wine::healthy());
    let engine = engine_with_installer(Arc::new(bed.ctx), Arc::clone(&wine));
    let done = engine
        .dxvk
        .install_remove(DxvkRequest {
            settings: json!({
                "winePrefix": root.join("prefix").to_string_lossy(),
                "wineVersion": expand_value(&case["wineVersion"], &expand),
            }),
            tool: DxvkTool::Dxvk,
            action: DxvkAction::Backup,
            source: None,
        })
        .await;
    assert!(done, "the golden returned true");

    // The tree the golden pinned: every file it lists is there with its hash, and the prefix and tools
    // directories hold nothing else.
    let golden: Value = serde_json::from_slice(
        &std::fs::read(dir.join("expected/mac-dxvk-install-from-tools/tree.json")).unwrap(),
    )
    .unwrap();
    let mut want: Vec<String> = Vec::new();
    for entry in golden.as_array().unwrap() {
        if entry["kind"] != "file" {
            continue;
        }
        let rel = entry["path"].as_str().unwrap();
        assert_eq!(
            hex_sha256(&root.join(rel)),
            entry["sha256"].as_str().unwrap(),
            "{rel}"
        );
        want.push(rel.to_string());
    }
    want.sort();
    let mut have = Vec::new();
    files_under(&root, &root.join("prefix"), &mut have);
    files_under(&root, &root.join(".config/GameLib/tools"), &mut have);
    have.sort();
    assert_eq!(have, want);

    // The wine core was reached through the trait: one `reg add` per DLL name of the build.
    let adds = wine.verbs().iter().filter(|v| *v == "add").count();
    assert_eq!(adds, 3, "d3d9, d3d11 and dxgi");
}

fn expand_value(value: &Value, expand: &dyn Fn(&str) -> String) -> Value {
    match value {
        Value::String(text) => Value::String(expand(text)),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), expand_value(v, expand)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// A [`DxvkError`] is the TS rejection; the trait answers a plain `bool`, so it is `false` here.
#[tokio::test]
async fn the_engine_dxvk_trait_answers_false_for_an_install_that_errors() {
    let bed = bed();
    bed.seed();
    // `latest_dxvk` names a path: `install_remove` answers `Err(Unreadable)`.
    write(&bed.tools().join("dxvk/latest_dxvk"), "../../..");
    let request = bed.request(DxvkAction::Backup, None);
    let wine = Arc::new(Wine::healthy());
    let engine = engine_with_installer(Arc::new(bed.ctx), Arc::clone(&wine));
    assert!(!engine.dxvk.install_remove(request).await);
    assert!(wine.calls().is_empty());
}
