//! The Rust replay of the system-information goldens 88.1-05 recorded from the TypeScript
//! (`tests/fixtures/golden/sysinfo`, 94 cases): the probes (`lspci`, `free`, `sysctl`, `vm_stat`, the
//! two PowerShell queries) over a scripted spawn seam, the host facts from each case's scenario, and
//! the partial results they produce, compared with the TS's recorded ones.
//!
//! A count floor lives in this file next to the replay (equal to the MANIFEST's), so editing the JSON
//! alone cannot lower the bar, and an empty list fails. The only differences from the TS are the entries
//! of `deltas.json`, each with its reason; a delta that no case uses is itself an error.
//!
//! The version probes, `filesize` formatting and the single-flight cache are 88.1-10's (the system
//! information assembly); the kinds that exercise them are listed in `DEFERRED_KINDS` and counted, so a
//! new kind cannot be added to `cases.json` without being either compared here or handed over there.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::SpecOutput;
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::testing::{RecordedSpawn, ScriptedSpecRunner};
use gamelib_info::ctx::{InfoCtx, InfoLog, InfoPaths, Platform};
use gamelib_info::http::ReqwestHttp;
use gamelib_info::sysinfo::gpu::{gpu_info_linux, PartialGpu};
use gamelib_info::sysinfo::host::HostFacts;
use gamelib_info::sysinfo::memory::get_memory_info;
use gamelib_info::sysinfo::os_info::get_os_info;
use gamelib_info::sysinfo::ProbeError;
use gamelib_store::host::StoreHost;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// `golden/sysinfo` holds 94 cases, the MANIFEST floor; a later edit may raise this, never lower it.
const SYSINFO_FLOOR: usize = 94;

/// Every `call.kind` of `golden/sysinfo` this file replays. The test fails when `cases.json` holds a
/// kind that is in neither this list nor [`DEFERRED_KINDS`].
const HANDLED_KINDS: [&str; 1] = ["info"];

/// The kinds 88.1-10 replays: `sequence` (the single-flight cache of `getSystemInfo`) and `filesize`
/// (the byte-size format).
const DEFERRED_KINDS: [&str; 2] = ["sequence", "filesize"];

/// The programs this slice spawns. The comet and manager version probes of a recorded case are
/// 88.1-10's, so they are left out of the expected spawns.
const PROBE_PROGRAMS: [&str; 5] = ["free", "lspci", "sysctl", "vm_stat", "powershell"];

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/golden/sysinfo")
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// A case list is usable only at or above its floor: an empty or shrunken list is an error, so the
/// replay cannot pass by iterating nothing.
fn check_floor(what: &str, count: usize, floor: usize) -> Result<(), String> {
    if count < floor {
        return Err(format!(
            "{what}: scanned {count}, below the floor of {floor}"
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// The deltas
// ---------------------------------------------------------------------------------------------

/// One documented difference between the TS golden and the Rust answer.
struct Delta {
    id: String,
    file: String,
    kind: String,
    rust: Option<Value>,
    programs: Vec<String>,
}

struct Deltas {
    entries: Vec<Delta>,
    used: Mutex<BTreeSet<usize>>,
}

impl Deltas {
    fn load() -> Deltas {
        let list = read_json(&fixtures().join("deltas.json"));
        let entries = list
            .as_array()
            .expect("deltas.json is an array")
            .iter()
            .map(|d| {
                let reason = d["reason"].as_str().unwrap_or_default();
                assert!(
                    reason.len() > 20,
                    "a delta without a reason of its own is not documented: {d}"
                );
                let kind = d["kind"].as_str().expect("delta kind").to_string();
                assert!(
                    kind == "replace" || kind == "env-inherited",
                    "unknown delta kind {kind}"
                );
                Delta {
                    id: d["id"].as_str().expect("delta id").to_string(),
                    file: d["file"].as_str().expect("delta file").to_string(),
                    kind,
                    rust: d.get("rust").cloned(),
                    programs: d["programs"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .map(|p| p.as_str().expect("program").to_string())
                                .collect()
                        })
                        .unwrap_or_default(),
                }
            })
            .collect();
        Deltas {
            entries,
            used: Mutex::new(BTreeSet::new()),
        }
    }

    fn find(&self, id: &str, file: &str) -> Option<&Delta> {
        // An `env-inherited` delta names no case: it holds for every spawn of its programs.
        let at = self.entries.iter().position(|d| {
            d.file == file && (d.id == id || (d.kind == "env-inherited" && d.id == "*"))
        })?;
        self.used.lock().unwrap().insert(at);
        Some(&self.entries[at])
    }

    /// What the golden says the case's `file` holds, with its documented delta applied.
    fn expected(&self, id: &str, file: &str, want: Value) -> Value {
        match self.find(id, file) {
            Some(d) if d.kind == "replace" => d.rust.clone().expect("replace needs rust"),
            Some(d) => {
                // `env-inherited`: the spawns of the listed programs add their variables to the
                // inherited environment instead of replacing it.
                let mut want = want;
                for spawn in want.as_array_mut().into_iter().flatten() {
                    let program = spawn["program"].as_str().unwrap_or_default().to_string();
                    if d.programs.contains(&program) {
                        spawn["replaceEnv"] = json!(false);
                    }
                }
                want
            }
            None => want,
        }
    }

    fn assert_all_used(&self) {
        let used = self.used.lock().unwrap();
        for (at, d) in self.entries.iter().enumerate() {
            assert!(
                used.contains(&at),
                "the delta for {} {} was never used by a case",
                d.id,
                d.file
            );
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The scripted machine a case runs on
// ---------------------------------------------------------------------------------------------

/// The host facts of one case's scenario.
struct ScenarioHost {
    cpu: Option<(String, usize)>,
    release: String,
    total_mem: u64,
    free_mem: u64,
    os_release_files: Vec<(String, String)>,
}

impl ScenarioHost {
    fn of(scenario: &Value) -> ScenarioHost {
        let cpu = scenario["cpu"]["model"].as_str().map(|model| {
            (
                model.to_string(),
                scenario["cpu"]["cores"].as_u64().unwrap_or(0) as usize,
            )
        });
        ScenarioHost {
            cpu,
            release: scenario["osRelease"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            total_mem: scenario["totalmem"].as_u64().unwrap_or(0),
            free_mem: scenario["freemem"].as_u64().unwrap_or(0),
            os_release_files: scenario["osReleaseFiles"]
                .as_object()
                .map(|files| {
                    files
                        .iter()
                        .map(|(path, text)| {
                            (path.clone(), text.as_str().unwrap_or_default().to_string())
                        })
                        .collect()
                })
                .unwrap_or_default(),
        }
    }
}

impl HostFacts for ScenarioHost {
    fn cpu_models(&self) -> Vec<String> {
        match &self.cpu {
            Some((model, cores)) => vec![model.clone(); *cores],
            None => Vec::new(),
        }
    }
    fn release(&self) -> String {
        self.release.clone()
    }
    fn total_mem(&self) -> u64 {
        self.total_mem
    }
    fn free_mem(&self) -> u64 {
        self.free_mem
    }
    fn read_os_release(&self, path: &str) -> Option<String> {
        self.os_release_files
            .iter()
            .find(|(p, _)| p == path)
            .map(|(_, text)| text.clone())
    }
    fn flatpak_id(&self) -> Option<String> {
        None
    }
    fn appimage(&self) -> Option<String> {
        None
    }
    fn steam_deck_game_mode(&self) -> bool {
        false
    }
}

/// What one probe's spawn answers (`Script` of the TS oracle): `throws` is a spawn failure.
fn script_output(program: &str, script: &Value) -> SpecOutput {
    if let Some(reason) = script["throws"].as_str() {
        return SpecOutput {
            code: None,
            stderr: format!("spawn {program}: {reason}"),
            ..SpecOutput::default()
        };
    }
    let timed_out = script["timedOut"].as_bool().unwrap_or(false);
    SpecOutput {
        code: if timed_out {
            None
        } else {
            Some(script["code"].as_i64().unwrap_or(0) as i32)
        },
        stdout: script["stdout"].as_str().unwrap_or_default().to_string(),
        stderr: script["stderr"].as_str().unwrap_or_default().to_string(),
        timed_out,
        ..SpecOutput::default()
    }
}

/// The PowerShell argv the two Windows queries run (the TS passes them as separate arguments).
fn powershell_argv(class: &str, properties: &str, select: &str) -> Vec<String> {
    [
        "Get-CimInstance",
        "-Class",
        class,
        "-Property",
        properties,
        "|",
        "Select-Object",
        select,
        "|",
        "ConvertTo-Json",
        "-Compress",
    ]
    .iter()
    .map(|s| (*s).to_string())
    .collect()
}

/// The runner a scenario's scripts make: `lspci`, `free`, `sysctl`, `vm_stat` and the two PowerShell
/// queries, each answering what the case scripted. A probe a case leaves `null` is not scripted, so a
/// spawn of it is listed as unscripted and fails the case.
fn runner_for(scenario: &Value) -> Arc<ScriptedSpecRunner> {
    let strings = |argv: &[&str]| argv.iter().map(|a| (*a).to_string()).collect::<Vec<_>>();
    let table: Vec<(&str, Vec<String>, &str)> = vec![
        ("lspci", strings(&["-mm", "-v", "-n", "-k"]), "lspci"),
        ("free", strings(&["-b"]), "free"),
        ("sysctl", strings(&["-n", "vm.pagesize"]), "sysctl"),
        ("vm_stat", Vec::new(), "vmStat"),
        (
            "powershell",
            powershell_argv(
                "Win32_VideoController",
                "AdapterCompatibility,DriverVersion,PnPDeviceID",
                "AdapterCompatibility,DriverVersion,PnPDeviceID",
            ),
            "powershellGpu",
        ),
        (
            "powershell",
            powershell_argv(
                "Win32_OperatingSystem",
                "Caption,Version",
                "Caption,Version",
            ),
            "powershellOs",
        ),
    ];
    let mut runner = ScriptedSpecRunner::new(Vec::new());
    for (program, argv, key) in table {
        let script = &scenario[key];
        if script.is_null() {
            continue;
        }
        let argv: Vec<&str> = argv.iter().map(String::as_str).collect();
        runner = runner.on(program, &argv, script_output(program, script));
    }
    Arc::new(runner)
}

/// An `InfoLog` that keeps every line.
#[derive(Default)]
struct Lines(Mutex<Vec<String>>);

impl InfoLog for Lines {
    fn line(&self, text: &str) {
        self.0.lock().unwrap().push(text.to_string());
    }
}

fn platform_of(name: &str) -> Platform {
    match name {
        "linux" => Platform::Linux,
        "mac" => Platform::Mac,
        "windows" => Platform::Windows,
        other => panic!("unknown platform {other}"),
    }
}

/// `process.platform` of a scenario platform.
fn node_platform(platform: Platform) -> &'static str {
    match platform {
        Platform::Linux => "linux",
        Platform::Mac => "darwin",
        Platform::Windows => "win32",
    }
}

fn spawn_shape(spawn: &RecordedSpawn) -> Value {
    json!({
        "program": spawn.program,
        "argv": spawn.argv,
        "timeoutMs": spawn.timeout.map(|t| t.as_millis() as u64),
        "replaceEnv": spawn.replace_env,
        "envDiff": { "set": spawn.env_set, "unset": spawn.env_unset },
        "cwd": spawn.cwd.as_ref().map(|p| p.to_string_lossy().into_owned()),
        "stdin": spawn.stdin,
    })
}

/// The expected spawn list: this slice's programs only, in order, without `seq` and `result`.
fn expected_spawns(raw: &Value) -> Value {
    let kept: Vec<Value> = raw
        .as_array()
        .expect("spawns.json is an array")
        .iter()
        .filter(|s| PROBE_PROGRAMS.contains(&s["program"].as_str().unwrap_or_default()))
        .map(|s| {
            let mut s = s.clone();
            let fields = s.as_object_mut().expect("a spawn is an object");
            fields.remove("seq");
            fields.remove("result");
            s
        })
        .collect();
    Value::Array(kept)
}

// ---------------------------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------------------------

/// What the probes of this slice produced for a case.
struct Probed {
    result: Value,
    gpus: Vec<PartialGpu>,
}

/// The probes in the TS's order (memory, GPUs, operating system), then the CPU check the TS makes
/// last. The first probe that cannot start rejects the read.
async fn probe(ctx: &InfoCtx, host: &ScenarioHost) -> Result<Probed, ProbeError> {
    let memory = get_memory_info(ctx, host).await?;
    let gpus = match ctx.platform {
        Platform::Linux => gpu_info_linux(ctx).await,
        _ => Vec::new(),
    };
    let os = get_os_info(ctx, host).await?;
    if host.cpu_models().is_empty() {
        return Err(ProbeError::NoCpus);
    }
    let version = os.version.unwrap_or_else(|| host.release());
    Ok(Probed {
        result: json!({
            "memory": { "total": memory.total, "used": memory.used },
            "OS": { "platform": node_platform(ctx.platform), "version": version, "name": os.name },
        }),
        gpus,
    })
}

/// This slice replays Linux and macOS; the Windows GPU probe and the pci.ids names are Task 3's.
fn replayed_now(scenario: &Value) -> bool {
    scenario["platform"].as_str() != Some("windows")
}

/// The part of a recorded `result.json` this slice produces.
fn expected_result(want: &Value) -> Value {
    match want.get("error") {
        Some(_) => want.clone(),
        None => {
            let info = &want["systemInfo"];
            json!({ "memory": { "total": info["memory"]["total"], "used": info["memory"]["used"] }, "OS": info["OS"] })
        }
    }
}

/// Whether `got` lists, in order, a GPU for each of the recorded (named) GPUs: the recorded list drops a
/// GPU whose names could not be looked up, which is Task 3's.
fn gpus_cover(got: &[PartialGpu], want: &Value) -> Result<(), String> {
    let wanted: Vec<&Value> = want["systemInfo"]["GPUs"]
        .as_array()
        .map(|a| a.iter().collect())
        .unwrap_or_default();
    let mut at = 0;
    for expected in wanted {
        let mut found = false;
        while at < got.len() {
            let candidate = got[at].to_value();
            at += 1;
            let same = [
                "vendorId",
                "deviceId",
                "subvendorId",
                "subdeviceId",
                "driverVersion",
            ]
            .iter()
            .all(|k| candidate.get(*k) == expected.get(*k));
            if same {
                found = true;
                break;
            }
        }
        if !found {
            return Err(format!(
                "the recorded GPU {expected} is not among the probed ones"
            ));
        }
    }
    Ok(())
}

fn run_case(case: &Value, deltas: &Deltas) -> Vec<String> {
    let id = case["id"].as_str().expect("case id");
    let dir = fixtures().join("expected").join(id);
    let scenario = &case["scenario"];
    let platform = platform_of(scenario["platform"].as_str().expect("platform"));

    let home = FakeHome::new("info-sysinfo-");
    let user_data = home.root().join("userData");
    std::fs::create_dir_all(&user_data).unwrap();
    let runner = runner_for(scenario);
    let lines = Arc::new(Lines::default());
    let mut ctx = InfoCtx::new(
        Arc::new(StoreHost::new()),
        Arc::new(SystemClock),
        platform,
        InfoPaths {
            app_folder: user_data.clone(),
            user_data,
            temp: home.root().join("temp"),
            public_dir: None,
        },
        scenario["appVersion"]
            .as_str()
            .unwrap_or("0.0.0")
            .to_string(),
        Shutdown::new(),
        Arc::new(ReqwestHttp::new()),
    );
    ctx.log = Some(lines.clone());
    ctx.proc = runner.clone();
    let host = ScenarioHost::of(scenario);

    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("runtime");
    let outcome = runtime.block_on(probe(&ctx, &host));

    let want_result = read_json(&dir.join("result.json"));
    let got_result = match &outcome {
        Ok(probed) => probed.result.clone(),
        Err(error) => json!({ "error": error.to_string() }),
    };
    let mut failures = Vec::new();
    let want = deltas.expected(id, "result.json", expected_result(&want_result));
    if want != got_result {
        failures.push(format!(
            "{id}: result.json\n  want {want}\n  got  {got_result}"
        ));
    }
    if let Ok(probed) = &outcome {
        if let Err(why) = gpus_cover(&probed.gpus, &want_result) {
            failures.push(format!("{id}: GPUs: {why}"));
        }
    }

    let want_spawns = deltas.expected(
        id,
        "spawns.json",
        expected_spawns(&read_json(&dir.join("spawns.json"))),
    );
    let got_spawns = Value::Array(runner.spawns().iter().map(spawn_shape).collect());
    if want_spawns != got_spawns {
        failures.push(format!(
            "{id}: spawns.json\n  want {want_spawns}\n  got  {got_spawns}"
        ));
    }
    if !runner.unscripted().is_empty() {
        failures.push(format!("{id}: unscripted spawns {:?}", runner.unscripted()));
    }

    let want_events: Vec<Value> = read_json(&dir.join("events.json"))
        .as_array()
        .expect("events.json is an array")
        .iter()
        .map(|e| json!(e["text"]))
        .collect();
    let want_events = match deltas.find(id, "events.json") {
        Some(d) => d
            .rust
            .as_ref()
            .and_then(Value::as_array)
            .expect("an events delta lists lines")
            .iter()
            .map(|e| json!(e["text"]))
            .collect(),
        None => want_events,
    };
    let got_events: Vec<Value> = lines.0.lock().unwrap().iter().map(|l| json!(l)).collect();
    if want_events != got_events {
        failures.push(format!(
            "{id}: events\n  want {want_events:?}\n  got  {got_events:?}"
        ));
    }
    failures
}

// ---------------------------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------------------------

#[test]
fn the_floor_matches_the_manifest_and_an_empty_list_fails() {
    let manifest = read_json(&fixtures().join("MANIFEST.json"));
    assert_eq!(
        manifest["floor"].as_u64(),
        Some(SYSINFO_FLOOR as u64),
        "the floor in this file equals the MANIFEST's"
    );
    assert!(manifest["count"].as_u64().unwrap_or(0) >= SYSINFO_FLOOR as u64);
    let err = check_floor("golden/sysinfo", 0, SYSINFO_FLOOR).unwrap_err();
    assert!(err.contains("below the floor"), "{err}");
}

#[test]
fn every_case_has_an_expected_folder_and_every_kind_is_handled_or_handed_over() {
    let cases = read_json(&fixtures().join("cases.json"));
    let cases = cases.as_array().expect("cases.json is an array");
    check_floor("golden/sysinfo cases", cases.len(), SYSINFO_FLOOR).unwrap();
    let handled: BTreeSet<&str> = HANDLED_KINDS.into_iter().chain(DEFERRED_KINDS).collect();
    for case in cases {
        let id = case["id"].as_str().expect("case id");
        assert!(
            fixtures().join("expected").join(id).is_dir(),
            "{id} has no expected folder"
        );
        let kind = case["call"]["kind"].as_str().expect("call kind");
        assert!(
            handled.contains(kind),
            "{id}: the kind {kind} is not handled"
        );
    }
}

#[test]
fn the_probe_cases_replay_the_ts_goldens() {
    let cases = read_json(&fixtures().join("cases.json"));
    let cases = cases.as_array().expect("cases.json is an array");
    check_floor("golden/sysinfo cases", cases.len(), SYSINFO_FLOOR).unwrap();

    let deltas = Deltas::load();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for case in cases {
        let kind = case["call"]["kind"].as_str().expect("call kind");
        if kind != "info" || !replayed_now(&case["scenario"]) {
            continue;
        }
        failures.extend(run_case(case, &deltas));
        compared += 1;
    }
    deltas.assert_all_used();
    eprintln!("golden sysinfo: compared {compared} floor {SYSINFO_FLOOR}");
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
    assert!(compared > 0, "no case was compared");
}
