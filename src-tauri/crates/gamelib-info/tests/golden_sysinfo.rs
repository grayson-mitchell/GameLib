//! The Rust replay of the system-information goldens 88.1-05 recorded from the TypeScript
//! (`tests/fixtures/golden/sysinfo`, 94 cases): the probes (`lspci`, `free`, `sysctl`, `vm_stat`, the
//! two PowerShell queries) over a scripted spawn seam, the host facts from each case's scenario, the
//! `pci.ids` lookups over a scripted TXT resolver and two seeded caches, and the probe result the
//! assembly (`probe_system`) produces, compared with the TS's recorded one: the CPU, memory sizes, GPUs
//! with their names, OS, Steam Deck info and the two container flags, the spawns, the log lines, the
//! lookups in order (`dns.json`) and the caches after (`cache.json`).
//!
//! A count floor lives in this file next to the replay (equal to the MANIFEST's), so editing the JSON
//! alone cannot lower the bar, and an empty list fails. The only differences from the TS are the entries
//! of `deltas.json`, each with its reason; a delta that no case uses is itself an error.
//!
//! 88.1-10 completes the replay: the four version probes (a direct `<bin> --version` spawn each, where
//! the TS went through its library managers), the `filesize` vectors, the formatted text and the
//! single-flight cache (the `sequence` cases). Every kind of `cases.json` is replayed; a kind this file
//! does not handle fails the test, so a new kind cannot be added without being compared here.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use gamelib_core::clock::SystemClock;
use gamelib_core::process::{BoxFuture, SpecOutput};
use gamelib_core::shutdown::Shutdown;
use gamelib_engine::testing::{RecordedSpawn, ScriptedSpecRunner};
use gamelib_info::cache_view::{js_date_string, CacheView, PCI_IDS_DEVICE, PCI_IDS_VENDOR};
use gamelib_info::ctx::{InfoCtx, InfoLog, InfoPaths, Platform};
use gamelib_info::http::ReqwestHttp;
use gamelib_info::sysinfo::cache::SystemInfoCache;
use gamelib_info::sysinfo::dns::TxtResolver;
use gamelib_info::sysinfo::format::{filesize, format_system_info};
use gamelib_info::sysinfo::host::HostFacts;
use gamelib_info::sysinfo::versions::{
    resolve_runner_bin, FixedAltBins, RunnerBins, RUNNER_VERSION_TIMEOUT,
};
use gamelib_info::sysinfo::{fetch_system_info, SystemInformation};
use gamelib_store::host::StoreHost;
use gamelib_store::json::Json;
use gamelib_testutil::FakeHome;
use serde_json::{json, Value};

/// `golden/sysinfo` holds 94 cases, the MANIFEST floor; a later edit may raise this, never lower it.
const SYSINFO_FLOOR: usize = 94;

/// Every `call.kind` of `golden/sysinfo`: `info` is a whole read (the Linux, macOS and Windows probes, the
/// `pci.ids` lookups and caches, the Steam Deck check, the version probes and the text), `sequence` the
/// single-flight cache of `getSystemInfo` and `filesize` the byte-size format. The test fails when
/// `cases.json` holds a kind that is not in this list.
const HANDLED_KINDS: [&str; 3] = ["info", "sequence", "filesize"];

/// The programs the machine probes spawn; the version probes are told apart by their `--version` argv.
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

/// The delta kind for the three Python runners' version probes: the TS asked them through its library
/// managers' command runners (no spawn of its own in the golden), the Rust spawns `<bin> --version`
/// directly.
const VERSION_DIRECT_SPAWN: &str = "version-probe-direct-spawn";

/// The delta kind for the bound those direct spawns carry (30 s; the TS had none).
const VERSION_BOUNDED: &str = "version-probe-bounded";

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
                    [
                        "replace",
                        "env-inherited",
                        VERSION_DIRECT_SPAWN,
                        VERSION_BOUNDED
                    ]
                    .contains(&kind.as_str()),
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
        // An `env-inherited` delta names no case: it holds for every spawn of its programs. The two
        // version-probe deltas hold for every case too, and are read by [`Deltas::version_probe`].
        let at = self.entries.iter().position(|d| {
            d.file == file
                && d.kind != VERSION_DIRECT_SPAWN
                && d.kind != VERSION_BOUNDED
                && (d.id == id || (d.kind == "env-inherited" && d.id == "*"))
        })?;
        self.used.lock().unwrap().insert(at);
        Some(&self.entries[at])
    }

    /// The delta of `kind` (a version-probe one), marked used.
    fn version_probe(&self, kind: &str) -> &Delta {
        let at = self
            .entries
            .iter()
            .position(|d| d.kind == kind)
            .unwrap_or_else(|| panic!("deltas.json has no {kind} delta"));
        self.used.lock().unwrap().insert(at);
        &self.entries[at]
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
    flatpak_id: Option<String>,
    appimage: Option<String>,
    game_mode: bool,
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
            flatpak_id: scenario["env"]["FLATPAK_ID"].as_str().map(str::to_string),
            appimage: scenario["env"]["APPIMAGE"].as_str().map(str::to_string),
            game_mode: scenario["steamDeckGameMode"].as_bool().unwrap_or(false),
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
        self.flatpak_id.clone()
    }
    fn appimage(&self) -> Option<String> {
        self.appimage.clone()
    }
    fn steam_deck_game_mode(&self) -> bool {
        self.game_mode
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

/// A script of a Python runner's `--version` (the TS manager's `runRunnerCommand` result): `stdout`, an
/// `error` or an `abort`. The Rust spawns the binary directly, so an error is a failed run and an abort a
/// cancelled one.
fn manager_output(script: &Value) -> SpecOutput {
    if script["abort"].as_bool().unwrap_or(false) {
        return SpecOutput {
            code: None,
            cancelled: true,
            ..SpecOutput::default()
        };
    }
    if script["error"].is_string() {
        return SpecOutput {
            code: Some(1),
            stderr: "boom".to_string(),
            ..SpecOutput::default()
        };
    }
    SpecOutput {
        code: Some(0),
        stdout: script["stdout"].as_str().unwrap_or_default().to_string(),
        ..SpecOutput::default()
    }
}

/// Where the bundled binary of `name` is on `platform` and `arch` under `<home>/public`, spelled out
/// independently of the crate's rule: `bin/<arch>/<node platform>/<name>`, `.exe` on Windows, and one
/// directory deeper on macOS for the three Python runners.
fn expected_bin(home: &str, name: &str, platform: &str, arch: &str) -> String {
    let node = match platform {
        "linux" => "linux",
        "mac" => "darwin",
        "windows" => "win32",
        other => panic!("unknown platform {other}"),
    };
    let file = if platform == "windows" {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    // Joined as the crate joins them, so the separators are the host's own: a `/` literal here would not
    // match the backslashes a Windows join gives (the Windows leg of 88.1-20's CI).
    let base = Path::new(home)
        .join("public")
        .join("bin")
        .join(arch)
        .join(node);
    let path = if platform == "mac" && name != "comet" {
        base.join(&file).join(&file)
    } else {
        base.join(&file)
    };
    path.to_string_lossy().into_owned()
}

/// The runner binaries the crate resolves for a scenario, over a bundled directory in which every file
/// exists (the golden's `existsSync` answered true) and the scenario's `altCometBin`.
fn bins_for(scenario: &Value, home: &str) -> (RunnerBins, FixedAltBins) {
    let platform = platform_of(scenario["platform"].as_str().expect("platform"));
    let arch = scenario["arch"].as_str().expect("arch");
    let alts = FixedAltBins(
        scenario["altCometBin"]
            .as_str()
            .map(|alt| vec![("altCometBin".to_string(), alt.to_string())])
            .unwrap_or_default(),
    );
    let public = Path::new(home).join("public");
    let resolve = |name: &str, key: &str| {
        use gamelib_info::sysinfo::versions::RunnerBinSettings;
        resolve_runner_bin(
            name,
            alts.alt_bin(key).as_deref(),
            &public,
            platform,
            arch,
            &|_| true,
        )
        .ok()
    };
    let bins = RunnerBins {
        legendary: resolve("legendary", "altLegendaryBin"),
        gogdl: resolve("gogdl", "altGogdlBin"),
        comet: resolve("comet", "altCometBin"),
        nile: resolve("nile", "altNileBin"),
    };
    (bins, alts)
}

/// The runner a scenario's scripts make: `lspci`, `free`, `sysctl`, `vm_stat` and the two PowerShell
/// queries, comet's `--version` and the three Python runners' `--version`, each answering what the case
/// scripted. A probe a case leaves `null` is not scripted, so a spawn of it is listed as unscripted and
/// fails the case.
fn runner_for(scenario: &Value, bins: &RunnerBins) -> Arc<ScriptedSpecRunner> {
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
    let version_argv = ["--version"];
    if !scenario["comet"].is_null() {
        let comet = bins.comet.as_ref().expect("a comet binary");
        let program = comet.to_string_lossy().into_owned();
        runner = runner.on(
            &program,
            &version_argv,
            script_output("comet", &scenario["comet"]),
        );
    }
    for (bin, manager) in [
        (&bins.legendary, "legendary"),
        (&bins.gogdl, "gog"),
        (&bins.nile, "nile"),
    ] {
        let script = &scenario["managers"][manager];
        if script.is_null() {
            continue;
        }
        let program = bin
            .as_ref()
            .expect("a runner binary")
            .to_string_lossy()
            .into_owned();
        runner = runner.on(&program, &version_argv, manager_output(script));
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

fn spawn_shape(spawn: &RecordedSpawn) -> Value {
    json!({
        "program": one_separator(&spawn.program),
        "argv": spawn.argv,
        "timeoutMs": spawn.timeout.map(|t| t.as_millis() as u64),
        "replaceEnv": spawn.replace_env,
        "envDiff": { "set": spawn.env_set, "unset": spawn.env_unset },
        "cwd": spawn.cwd.as_ref().map(|p| p.to_string_lossy().into_owned()),
        "stdin": spawn.stdin,
    })
}

// ---------------------------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------------------------

/// The `pci.ids` resolver a scenario scripts: each name answers what the case's `dns` map says (`txt`
/// records or an `error`), and every lookup is kept in order, with the answer it got, to compare with the
/// recorded `dns.json`. A name the scenario does not script is listed as unscripted and fails the case.
#[derive(Default)]
struct TxtState {
    script: Vec<(String, Value)>,
    asked: Mutex<Vec<Value>>,
    unscripted: Mutex<Vec<String>>,
}

struct ScriptedTxt(Arc<TxtState>);

impl ScriptedTxt {
    fn of(scenario: &Value) -> ScriptedTxt {
        ScriptedTxt(Arc::new(TxtState {
            script: scenario["dns"]
                .as_object()
                .map(|names| names.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                .unwrap_or_default(),
            ..TxtState::default()
        }))
    }
}

impl TxtResolver for ScriptedTxt {
    fn lookup(&self, name: &str) -> BoxFuture<Option<String>> {
        let answer = self
            .0
            .script
            .iter()
            .find(|(scripted, _)| scripted == name)
            .map(|(_, answer)| answer.clone());
        let this = self.0.clone();
        let name = name.to_string();
        Box::pin(async move {
            let Some(answer) = answer else {
                this.unscripted.lock().unwrap().push(name);
                return None;
            };
            this.asked
                .lock()
                .unwrap()
                .push(json!({ "name": name, "answer": answer }));
            // `records[0]?.[0]?.replace(/^i=/, '')`
            let first = answer["txt"][0][0].as_str()?;
            Some(first.strip_prefix("i=").unwrap_or(first).to_string())
        })
    }
}

/// Seeds one pci.ids cache with a case's entries, each aged as the case says, through the same host the
/// context holds.
fn seed_cache(ctx: &InfoCtx, store: &str, entries: &Value) {
    let dir = ctx.paths.user_data.join("store_cache");
    std::fs::create_dir_all(&dir).unwrap();
    let file = ctx.host.open_cache(&dir, store).unwrap();
    let now = ctx.clock.now_ms() as i64;
    for entry in entries.as_array().into_iter().flatten() {
        let key = entry["key"].as_str().expect("cache key");
        file.set(
            key,
            Json::Str(entry["value"].as_str().expect("value").to_string()),
        )
        .unwrap();
        let age_ms = entry["ageDays"].as_f64().unwrap_or(0.0) * 86_400_000.0;
        file.set(
            &format!("__timestamp.{key}"),
            Json::Str(js_date_string(now - age_ms as i64)),
        )
        .unwrap();
    }
}

/// What a pci.ids cache holds, as the `cache.json` golden spells it: key to name.
fn cache_contents(ctx: &InfoCtx, params: gamelib_info::cache_view::CacheParams) -> Value {
    let view = CacheView::open(&ctx.host, &ctx.paths.user_data, params, ctx.clock.clone()).unwrap();
    let mut names = serde_json::Map::new();
    for (key, value) in view.entries() {
        match value {
            Json::Str(name) => names.insert(key, json!(name)),
            other => panic!("a pci.ids cache entry that is not a string: {other:?}"),
        };
    }
    Value::Object(names)
}

/// The expected spawn list of a case, in the order the Rust makes them: the machine probes the golden
/// recorded (in its order, without `seq` and `result`), then, when the golden shows the version probes ran
/// (comet's `--version`), the four `--version` spawns in the TS's start order: legendary, gogdl, comet,
/// nile. Comet's is the golden's own, with its path; the three Python runners' are the direct spawns of
/// the `version-probe-direct-spawn` delta, carrying the bound of the `version-probe-bounded` one.
fn expected_spawns(raw: &Value, deltas: &Deltas, home: &str, scenario: &Value) -> Value {
    let all = raw.as_array().expect("spawns.json is an array");
    let strip = |s: &Value| {
        let mut s = s.clone();
        let fields = s.as_object_mut().expect("a spawn is an object");
        fields.remove("seq");
        fields.remove("result");
        s
    };
    let mut kept: Vec<Value> = all
        .iter()
        .filter(|s| PROBE_PROGRAMS.contains(&s["program"].as_str().unwrap_or_default()))
        .map(strip)
        .collect();
    let comet = all
        .iter()
        .find(|s| s["argv"] == json!(["--version"]))
        .map(strip);
    if let Some(mut comet) = comet {
        let direct = deltas.version_probe(VERSION_DIRECT_SPAWN);
        let bounded = deltas.version_probe(VERSION_BOUNDED);
        let timeout = bounded.rust.as_ref().expect("a bound")["timeoutMs"].clone();
        assert_eq!(timeout, json!(RUNNER_VERSION_TIMEOUT.as_millis() as u64));
        let platform = scenario["platform"].as_str().expect("platform");
        let arch = scenario["arch"].as_str().expect("arch");
        let program = comet["program"]
            .as_str()
            .expect("program")
            .replace("<HOME>", home);
        comet["program"] = json!(program);
        let direct_spawn = |name: &str| {
            assert!(direct.programs.iter().any(|p| p == name), "{name}");
            let mut spawn = comet.clone();
            spawn["program"] = json!(expected_bin(home, name, platform, arch));
            spawn["timeoutMs"] = timeout.clone();
            spawn
        };
        let (legendary, gogdl, nile) = (
            direct_spawn("legendary"),
            direct_spawn("gogdl"),
            direct_spawn("nile"),
        );
        kept.extend([legendary, gogdl, comet, nile]);
    }
    for spawn in &mut kept {
        let program = one_separator(spawn["program"].as_str().expect("program"));
        spawn["program"] = json!(program);
    }
    Value::Array(kept)
}

/// A spawned program's path with one separator, so a recorded `/pins/bin/comet` and what a Windows join
/// makes of it (`/pins/bin\comet`) compare equal. The recording was made on macOS; the separator is the
/// host's, not a behaviour the golden pins (the Windows leg of 88.1-20's CI).
fn one_separator(program: &str) -> String {
    program.replace('\\', "/")
}

/// The scripted machine of one scenario: a fake profile, the context over the scripted runner, the host
/// facts, the `pci.ids` resolver and the runner binaries.
struct Machine {
    home: FakeHome,
    ctx: InfoCtx,
    runner: Arc<ScriptedSpecRunner>,
    lines: Arc<Lines>,
    host: ScenarioHost,
    txt: ScriptedTxt,
    bins: RunnerBins,
    platform: Platform,
}

impl Machine {
    fn of(scenario: &Value) -> Machine {
        let platform = platform_of(scenario["platform"].as_str().expect("platform"));
        let home = FakeHome::new("info-sysinfo-");
        let user_data = home.root().join("userData");
        std::fs::create_dir_all(&user_data).unwrap();
        let home_text = home.root().to_string_lossy().into_owned();
        let (bins, alts) = bins_for(scenario, &home_text);
        let runner = runner_for(scenario, &bins);
        let lines = Arc::new(Lines::default());
        let mut ctx = InfoCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            platform,
            InfoPaths {
                app_folder: user_data.clone(),
                user_data,
                temp: home.root().join("temp"),
                public_dir: Some(home.root().join("public")),
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
        ctx.runner_settings = Some(Arc::new(alts));
        seed_cache(&ctx, "pci_ids_device", &scenario["caches"]["device"]);
        seed_cache(&ctx, "pci_ids_vendor", &scenario["caches"]["vendor"]);
        Machine {
            home,
            ctx,
            runner,
            lines,
            host: ScenarioHost::of(scenario),
            txt: ScriptedTxt::of(scenario),
            bins,
            platform,
        }
    }

    async fn read(&self) -> Result<SystemInformation, gamelib_info::sysinfo::ProbeError> {
        fetch_system_info(&self.ctx, &self.host, &self.txt, &self.bins).await
    }
}

fn caches_of(ctx: &InfoCtx) -> Value {
    json!({
        "device": cache_contents(ctx, PCI_IDS_DEVICE),
        "vendor": cache_contents(ctx, PCI_IDS_VENDOR),
    })
}

fn run_case(case: &Value, deltas: &Deltas) -> Vec<String> {
    let id = case["id"].as_str().expect("case id");
    let dir = fixtures().join("expected").join(id);
    let scenario = &case["scenario"];
    let machine = Machine::of(scenario);
    let home_text = machine.home.root().to_string_lossy().into_owned();
    let caches_before = caches_of(&machine.ctx);

    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("runtime");
    let outcome = runtime.block_on(machine.read());

    let want_result = read_json(&dir.join("result.json"));
    let got_result = match &outcome {
        Ok(info) => json!({ "systemInfo": info.to_value() }),
        Err(error) => json!({ "error": error.to_string() }),
    };
    let mut failures = Vec::new();
    let want = deltas.expected(id, "result.json", want_result);
    if want != got_result {
        failures.push(format!(
            "{id}: result.json\n  want {want}\n  got  {got_result}"
        ));
    }

    // The text the clipboard gets, for a read that succeeded.
    let want_text = read_json(&dir.join("text.json"));
    if let (Ok(info), Some(text)) = (&outcome, want_text["text"].as_str()) {
        let got_text = format_system_info(info, machine.platform);
        if got_text != text {
            failures.push(format!(
                "{id}: text.json\n  want {text:?}\n  got  {got_text:?}"
            ));
        }
    }

    // The lookups, in the order the TS made them, each with the answer it was given.
    let want_dns: Vec<Value> = read_json(&dir.join("dns.json"))
        .as_array()
        .expect("dns.json is an array")
        .iter()
        .map(|e| json!({ "name": e["name"], "answer": e["answer"] }))
        .collect();
    let got_dns = machine.txt.0.asked.lock().unwrap().clone();
    if want_dns != got_dns {
        failures.push(format!(
            "{id}: dns.json\n  want {want_dns:?}\n  got  {got_dns:?}"
        ));
    }
    if !machine.txt.0.unscripted.lock().unwrap().is_empty() {
        failures.push(format!(
            "{id}: unscripted lookups {:?}",
            machine.txt.0.unscripted.lock().unwrap()
        ));
    }

    // The caches, before and after.
    let want_cache = read_json(&dir.join("cache.json"));
    let got_after = caches_of(&machine.ctx);
    if want_cache["before"] != caches_before || want_cache["after"] != got_after {
        failures.push(format!(
            "{id}: cache.json\n  want {}\n  got  before {caches_before} after {got_after}",
            want_cache
        ));
    }

    let want_spawns = deltas.expected(
        id,
        "spawns.json",
        expected_spawns(
            &read_json(&dir.join("spawns.json")),
            deltas,
            &home_text,
            scenario,
        ),
    );
    let got_spawns = Value::Array(machine.runner.spawns().iter().map(spawn_shape).collect());
    if want_spawns != got_spawns {
        failures.push(format!(
            "{id}: spawns.json\n  want {want_spawns}\n  got  {got_spawns}"
        ));
    }
    if !machine.runner.unscripted().is_empty() {
        failures.push(format!(
            "{id}: unscripted spawns {:?}",
            machine.runner.unscripted()
        ));
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
    let got_events: Vec<Value> = machine
        .lines
        .0
        .lock()
        .unwrap()
        .iter()
        .map(|l| json!(l))
        .collect();
    if want_events != got_events {
        failures.push(format!(
            "{id}: events\n  want {want_events:?}\n  got  {got_events:?}"
        ));
    }
    failures
}

// ---------------------------------------------------------------------------------------------
// The single-flight cache
// ---------------------------------------------------------------------------------------------

/// Replays one `sequence` case: the steps of the TS test (`start` a call, `await` it, `settle`, make a
/// `newCache`) over `SystemInfoCache`s sharing the scripted machine. The calls' results (which cache
/// instance each used and which call's object it got back) are compared with `result.json`; the spawns by
/// program, as a multiset, because concurrent reads interleave their probes.
fn run_sequence(case: &Value, deltas: &Deltas) -> Vec<String> {
    let id = case["id"].as_str().expect("case id");
    let dir = fixtures().join("expected").join(id);
    let scenario = &case["scenario"];
    let machine = Arc::new(Machine::of(scenario));
    let home_text = machine.home.root().to_string_lossy().into_owned();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("runtime");

    type Outcome = Result<Arc<SystemInformation>, gamelib_info::sysinfo::ProbeError>;
    let mut instances: Vec<Arc<SystemInfoCache>> = vec![Arc::new(SystemInfoCache::new())];
    let mut started: Vec<(String, bool, usize, tokio::task::JoinHandle<Outcome>)> = Vec::new();
    let mut settled: Vec<(String, bool, usize, Outcome)> = Vec::new();
    runtime.block_on(async {
        for step in case["call"]["steps"].as_array().expect("steps") {
            match step["op"].as_str().expect("op") {
                "start" => {
                    let name = step["call"].as_str().expect("call").to_string();
                    let cache = step["cache"].as_bool().unwrap_or(true);
                    let instance = instances.len() - 1;
                    let (machine, cache_of) =
                        (Arc::clone(&machine), Arc::clone(&instances[instance]));
                    let task =
                        tokio::spawn(async move { cache_of.get(cache, machine.read()).await });
                    started.push((name, cache, instance, task));
                }
                "settle" => {
                    for _ in 0..64 {
                        tokio::task::yield_now().await;
                    }
                }
                "newCache" => instances.push(Arc::new(SystemInfoCache::new())),
                "await" => {
                    let name = step["call"].as_str().expect("call");
                    let at = started
                        .iter()
                        .position(|(n, ..)| n == name)
                        .unwrap_or_else(|| panic!("{id}: {name} was not started"));
                    let (name, cache, instance, task) = started.remove(at);
                    settled.push((name, cache, instance, task.await.expect("the task ran")));
                }
                other => panic!("{id}: unknown step {other}"),
            }
        }
    });

    let mut failures = Vec::new();
    let want = read_json(&dir.join("result.json"));
    let want_calls = want["calls"].as_array().expect("calls");
    if want_calls.len() != settled.len() {
        failures.push(format!(
            "{id}: {} calls, want {}",
            settled.len(),
            want_calls.len()
        ));
        return failures;
    }
    for (at, (want, (name, cache, instance, outcome))) in
        want_calls.iter().zip(&settled).enumerate()
    {
        let info = outcome.as_ref().expect("a successful read");
        let same_as = match want["sameObjectAs"].as_str() {
            Some(other) => settled
                .iter()
                .find(|(n, ..)| n == other)
                .map(|(.., o)| Arc::ptr_eq(o.as_ref().unwrap(), info)),
            None => None,
        };
        let shape = json!({
            "call": name,
            "cache": cache,
            "instance": instance,
            "sameObjectAs": want["sameObjectAs"],
            "systemInfo": info.to_value(),
        });
        if &shape != want || same_as == Some(false) {
            failures.push(format!("{id}: call {name}\n  want {want}\n  got  {shape}"));
        }
        // A call that named another call's object must hold that very object, and one that did not
        // must not hold the object of a call settled before it.
        if want["sameObjectAs"].is_null() {
            let twin = settled[..at]
                .iter()
                .any(|(.., o)| Arc::ptr_eq(o.as_ref().unwrap(), info));
            if twin {
                failures.push(format!("{id}: call {name} shares an object it should not"));
            }
        }
    }

    // The spawns, as a multiset of program and argv.
    let want_spawns = expected_spawns(
        &read_json(&dir.join("spawns.json")),
        deltas,
        &home_text,
        scenario,
    );
    let mut want_all: Vec<String> = Vec::new();
    // `expected_spawns` lists one fetch's version spawns; a sequence repeats them once per fetch.
    let golden = read_json(&dir.join("spawns.json"));
    let fetches = golden
        .as_array()
        .expect("spawns")
        .iter()
        .filter(|s| s["argv"] == json!(["--version"]))
        .count();
    let probes: Vec<&Value> = golden
        .as_array()
        .unwrap()
        .iter()
        .filter(|s| PROBE_PROGRAMS.contains(&s["program"].as_str().unwrap_or_default()))
        .collect();
    let one_fetch = want_spawns.as_array().expect("spawns");
    let version_spawns: Vec<&Value> = one_fetch
        .iter()
        .filter(|s| s["argv"] == json!(["--version"]))
        .collect();
    for probe in &probes {
        want_all.push(format!("{} {}", probe["program"], probe["argv"]));
    }
    for _ in 0..fetches {
        // The golden lists the probes of every fetch; the versions of one fetch are four spawns.
        for spawn in &version_spawns[..4.min(version_spawns.len())] {
            want_all.push(format!("{} {}", spawn["program"], spawn["argv"]));
        }
    }
    let mut got_all: Vec<String> = machine
        .runner
        .spawns()
        .iter()
        .map(|s| format!("{} {}", json!(one_separator(&s.program)), json!(s.argv)))
        .collect();
    want_all.sort();
    got_all.sort();
    if want_all != got_all {
        failures.push(format!(
            "{id}: spawns\n  want {want_all:?}\n  got  {got_all:?}"
        ));
    }
    failures
}

// ---------------------------------------------------------------------------------------------
// The `filesize` vectors
// ---------------------------------------------------------------------------------------------

fn run_filesize(case: &Value) -> Vec<String> {
    let id = case["id"].as_str().expect("case id");
    let want = read_json(&fixtures().join("expected").join(id).join("result.json"));
    let vectors = want["vectors"].as_array().expect("vectors");
    let asked = case["call"]["values"].as_array().expect("values");
    let mut failures = Vec::new();
    if vectors.len() != asked.len() || vectors.is_empty() {
        failures.push(format!(
            "{id}: {} vectors for {} values",
            vectors.len(),
            asked.len()
        ));
    }
    for vector in vectors {
        let value = vector["value"].as_f64().expect("value");
        for (key, base2) in [("base2", true), ("plain", false)] {
            let got = filesize(value, base2);
            if vector[key] != json!(got) {
                failures.push(format!(
                    "{id}: {value} {key}: want {} got {got}",
                    vector[key]
                ));
            }
        }
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
fn every_case_has_an_expected_folder_and_every_kind_is_handled() {
    let cases = read_json(&fixtures().join("cases.json"));
    let cases = cases.as_array().expect("cases.json is an array");
    check_floor("golden/sysinfo cases", cases.len(), SYSINFO_FLOOR).unwrap();
    let handled: BTreeSet<&str> = HANDLED_KINDS.into_iter().collect();
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
fn every_case_of_golden_sysinfo_replays_the_ts_goldens() {
    let cases = read_json(&fixtures().join("cases.json"));
    let cases = cases.as_array().expect("cases.json is an array");
    check_floor("golden/sysinfo cases", cases.len(), SYSINFO_FLOOR).unwrap();

    let deltas = Deltas::load();
    let mut compared = 0usize;
    let mut failures = Vec::new();
    for case in cases {
        let kind = case["call"]["kind"].as_str().expect("call kind");
        assert!(HANDLED_KINDS.contains(&kind), "{kind} is not handled");
        failures.extend(match kind {
            "info" => run_case(case, &deltas),
            "sequence" => run_sequence(case, &deltas),
            _ => run_filesize(case),
        });
        compared += 1;
    }
    deltas.assert_all_used();
    eprintln!("golden sysinfo: compared {compared} floor {SYSINFO_FLOOR}");
    check_floor("golden/sysinfo compared", compared, SYSINFO_FLOOR).unwrap();
    assert!(
        failures.is_empty(),
        "{} differences over {compared} cases:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
