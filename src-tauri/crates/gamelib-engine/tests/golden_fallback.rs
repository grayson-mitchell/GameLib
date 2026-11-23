//! The pinned fallback engine against the TS goldens (87-14 recorded them, 87-47 ports the engine; SC1,
//! D-10, D-17, D-19): `golden/fallback` holds 39 cases. The 36 that exercise the download, the status
//! sequence, retention and the installed check replay here; the three boot-sweep cases
//! (`sweep-removes-temp-dirs`, `sweep-no-root`, `sweep-skipped-while-download-in-flight`) are 87-48's
//! and this test names them so none is skipped silently.
//!
//! A case replays over a fake HOME laid out as the oracle's profile, with the oracle's synthetic pins:
//! the real current pin's ids, URLs and file names carrying the size and sha256 of three committed
//! archives of a few KB (`recorded/fallback/archives`), so the 228 MB engine is never downloaded. The
//! network is a stub `Fetch` that serves those bytes by the pinned URL with two progress steps (25%
//! and 100%), as the oracle's `stubDownloadFile` did; `tar` runs for real over the fake profile, with
//! the failing runs scripted. Compared to the golden: every caller's result (the engine's raw answer
//! and the reporter's), the engine's progress per caller, the `gameStatusUpdate` sequence per app, the
//! `.gamelib-pin.json` bytes, the log lines, the download requests, the spawn trace and the whole
//! profile tree. Callers are driven together on one thread, so what is compared across callers is each
//! one's own sequence, never their interleaving.
//!
//! What differs from the TS is written in `deltas.json` and treated in one place here
//! (`the_documented_deltas_are_exactly_those_this_replay_treats_differently`). The count floor lives
//! here too, so editing the JSON alone cannot lower the bar, and an empty case list fails. POSIX only,
//! as the TS oracle's replays are.
#![cfg(unix)]

mod common;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_engine::engines::{pinned_engine_paths, pinned_engine_root};
use gamelib_engine::fallback::ensure::{
    ensure_pinned_engine, ensure_pinned_engine_detailed, is_pinned_engine_installed, Caller,
    EnsureArgs, EnsureReason, EnsureResult, PinnedEngineResult, Tap,
};
use gamelib_engine::fallback::progress::{FallbackProgress, Phase};
use gamelib_engine::fallback::prune::{prune_unpinned_engines, remove_guarded, Removal};
use gamelib_engine::fallback::Env;
use gamelib_engine::fetch::{
    DownloadOutcome, Fetch, FetchError, FetchFuture, FetchRequest, FetchResponse, Progress,
};
use gamelib_engine::pins::{pins, EnginePin, EnginePins, PinnedArtifact};
use gamelib_engine::testing::{RecordedSpawn, RecordingEmitter, RecordingLog};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tokio_util::sync::CancellationToken;

use common::{check_floor, first_difference, read_json, Profile};

/// `golden/fallback` holds 39 cases; a later edit may raise this, never lower it.
const CASE_FLOOR: usize = 30;

/// The cases that belong to the boot sweep (87-48).
const SWEEP_CASES: [&str; 3] = [
    "sweep-removes-temp-dirs",
    "sweep-no-root",
    "sweep-skipped-while-download-in-flight",
];

fn golden_dir() -> PathBuf {
    common::fixtures().join("golden/fallback")
}

fn cases() -> Vec<Value> {
    read_json(&golden_dir().join("cases.json"))
        .as_array()
        .cloned()
        .unwrap_or_default()
}

fn id_of(case: &Value) -> &str {
    case["id"].as_str().unwrap()
}

fn sha_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

// ---------------------------------------------------------------------------------------------
// The synthetic archives and the pins
// ---------------------------------------------------------------------------------------------

struct Archives {
    wine: Vec<u8>,
    wine_escape: Vec<u8>,
    dxvk: Vec<u8>,
}

fn archives() -> Archives {
    let dir = common::fixtures().join("recorded/fallback/archives");
    let read = |name: &str| std::fs::read(dir.join(name)).unwrap();
    Archives {
        wine: read("wine-synthetic.tar.xz"),
        wine_escape: read("wine-escape.tar.xz"),
        dxvk: read("dxvk-synthetic.tar.gz"),
    }
}

struct PinSet {
    current: EnginePin,
    previous: EnginePin,
    other: EnginePin,
}

/// `artifact`: the real artifact's URL with its last two segments replaced, the size and sha256 of
/// `body`.
fn artifact(
    base: &PinnedArtifact,
    version: &str,
    url_tail: &str,
    archive_name: &str,
    body: &[u8],
) -> PinnedArtifact {
    let last = base.url.rfind('/').unwrap();
    let second = base.url[..last].rfind('/').unwrap();
    PinnedArtifact {
        version: version.to_string(),
        url: format!("{}/{url_tail}", &base.url[..second]),
        size: body.len() as u64,
        sha256: sha_hex(body),
        archive_name: archive_name.to_string(),
    }
}

/// `buildPins`.
fn build_pins(archives: &Archives) -> PinSet {
    let real = &pins().unwrap().current;
    let mk = |id: &str, wine_version: &str, dxvk_version: &str| EnginePin {
        id: id.to_string(),
        label: format!("{id} (synthetic)"),
        wine: artifact(
            &real.wine,
            wine_version,
            &format!("{wine_version}/wine-staging-{wine_version}-osx64.tar.xz"),
            &format!("wine-staging-{wine_version}-osx64.tar.xz"),
            &archives.wine,
        ),
        dxvk: artifact(
            &real.dxvk,
            dxvk_version,
            &format!("{dxvk_version}/dxvk-macOS-async-{dxvk_version}.tar.gz"),
            &format!("dxvk-macOS-async-{dxvk_version}.tar.gz"),
            &archives.dxvk,
        ),
    };
    PinSet {
        current: EnginePin {
            label: real.label.clone(),
            ..mk(&real.id, &real.wine.version, &real.dxvk.version)
        },
        previous: mk("wine-staging-11.1", "11.1", "v1.10.2-20230101-repack"),
        other: mk("wine-staging-9.0", "9.0", "v1.10.0-20220101-repack"),
    }
}

fn serve_of<'a>(case: &'a Value, kind: &str) -> Option<&'a str> {
    case["downloads"][kind].as_str()
}

fn served_body<'a>(kind: &str, serve: Option<&str>, archives: &'a Archives) -> &'a [u8] {
    if kind == "dxvk" {
        &archives.dxvk
    } else if serve == Some("escape") {
        &archives.wine_escape
    } else {
        &archives.wine
    }
}

/// The artifact as the pin under test claims it (`applyServe`): another size or another sha256 for the
/// two mismatch variants.
fn served_artifact(
    base: &PinnedArtifact,
    kind: &str,
    serve: Option<&str>,
    archives: &Archives,
) -> PinnedArtifact {
    let body = served_body(kind, serve, archives);
    let mut out = PinnedArtifact {
        size: body.len() as u64,
        sha256: sha_hex(body),
        ..base.clone()
    };
    match serve {
        Some("wrong-size") => out.size += 1,
        Some("wrong-sha") => out.sha256 = "0".repeat(64),
        _ => {}
    }
    out
}

// ---------------------------------------------------------------------------------------------
// The network: a stub that serves the archives by the pinned URL
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum Fail {
    Network,
    Stopped,
}

struct Recording {
    url: String,
    body: Vec<u8>,
    fail: Option<Fail>,
}

#[derive(Default)]
struct StubFetch {
    recordings: Mutex<Vec<Recording>>,
    requested: Mutex<Vec<String>>,
    unexpected: Mutex<Vec<String>>,
    /// Waits for the cancel token after the first progress step (a download a quit interrupts).
    hold_after_first_step: bool,
}

impl StubFetch {
    fn with(recordings: Vec<Recording>) -> StubFetch {
        StubFetch {
            recordings: Mutex::new(recordings),
            ..StubFetch::default()
        }
    }

    fn requested(&self) -> Vec<String> {
        self.requested.lock().unwrap().clone()
    }

    fn expect_all_served(&self) {
        let left: Vec<String> = self
            .recordings
            .lock()
            .unwrap()
            .iter()
            .map(|r| r.url.clone())
            .collect();
        assert!(
            left.is_empty(),
            "recorded downloads never requested: {left:?}"
        );
        let unexpected = self.unexpected.lock().unwrap().clone();
        assert!(
            unexpected.is_empty(),
            "unexpected downloads: {unexpected:?}"
        );
    }
}

impl Fetch for StubFetch {
    fn get(&self, _req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
        Box::pin(async { Err(FetchError::Network) })
    }

    fn download<'a>(
        &'a self,
        req: FetchRequest,
        dest: &'a Path,
        progress: &'a (dyn Fn(Progress) + Send + Sync),
        cancel: CancellationToken,
    ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
        Box::pin(async move {
            self.requested.lock().unwrap().push(req.url.clone());
            let recording = {
                let mut all = self.recordings.lock().unwrap();
                all.iter()
                    .position(|r| r.url == req.url)
                    .map(|i| all.remove(i))
            };
            let Some(recording) = recording else {
                self.unexpected.lock().unwrap().push(req.url.clone());
                return Err(FetchError::Network);
            };
            let total = recording.body.len() as u64;
            // A quarter is exact in binary, so the percentage is exactly 25.
            let steps: Vec<(u64, f64)> = if recording.fail.is_some() {
                vec![(total / 4, 25.0)]
            } else {
                vec![(total / 4, 25.0), (total, 100.0)]
            };
            for (n, (bytes, percentage)) in steps.iter().enumerate() {
                progress(Progress {
                    bytes: *bytes,
                    total,
                    percentage: *percentage,
                });
                if cancel.is_cancelled() {
                    return Err(FetchError::Aborted);
                }
                if n == 0 && self.hold_after_first_step {
                    cancel.cancelled().await;
                    return Err(FetchError::Aborted);
                }
            }
            match recording.fail {
                Some(Fail::Network) => Err(FetchError::Network),
                Some(Fail::Stopped) => Err(FetchError::Aborted),
                None => {
                    std::fs::write(dest, &recording.body).map_err(|_| FetchError::Io)?;
                    Ok(DownloadOutcome {
                        bytes: total,
                        sha256: sha_hex(&recording.body),
                    })
                }
            }
        })
    }
}

// ---------------------------------------------------------------------------------------------
// The spawn seam: real `tar` over the fake profile, the failing runs scripted
// ---------------------------------------------------------------------------------------------

struct TracingRunner {
    home_env: Vec<(String, String)>,
    /// Archive file names whose extraction fails (`tar` exits 2).
    failing: Vec<String>,
    spawns: Arc<Mutex<Vec<RecordedSpawn>>>,
}

impl SpecRunner for TracingRunner {
    fn run(&self, spec: ProcSpec, on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let archive = spec.argv.get(1).cloned().unwrap_or_default();
        let scripted = self
            .failing
            .iter()
            .any(|name| archive.ends_with(&format!("/{name}")));
        let recorded = (
            spec.program.clone(),
            spec.argv.clone(),
            spec.env.iter().cloned().collect::<BTreeMap<_, _>>(),
            spec.cwd.clone(),
            spec.stdin.clone(),
            spec.timeout,
            spec.max_buffer,
            spec.label,
            spec.replace_env,
        );
        let mut real = spec;
        // The real child sees the fake profile's HOME and friends, never the operator's.
        real.env.extend(self.home_env.clone());
        let run = (!scripted).then(|| gamelib_proc::spec::SpecProcRunner.run(real, on_line));
        let spawns = self.spawns.clone();
        Box::pin(async move {
            let output = match run {
                Some(run) => run.await,
                None => SpecOutput {
                    code: Some(2),
                    stderr: "tar: synthetic extraction failure\n".to_string(),
                    ..SpecOutput::default()
                },
            };
            let (program, argv, env_set, cwd, stdin, timeout, max_buffer, label, replace_env) =
                recorded;
            spawns.lock().unwrap().push(RecordedSpawn {
                program,
                argv,
                env_set,
                env_unset: Vec::new(),
                replace_env,
                cwd,
                stdin,
                timeout,
                max_buffer,
                label,
                result: output.clone(),
            });
            output
        })
    }
}

// ---------------------------------------------------------------------------------------------
// A case's world
// ---------------------------------------------------------------------------------------------

/// `installedSeed`.
fn installed_seed(pin: &EnginePin, installed: &Value) -> Vec<Value> {
    const ROOT: &str = "<TOOLS>/steam-engines";
    let marker = |artifact: &PinnedArtifact, sha: Option<&str>| {
        json!({"sha256": sha.unwrap_or(&artifact.sha256), "version": artifact.version}).to_string()
    };
    let mut out = Vec::new();
    if let Some(state) = installed["wine"].as_str() {
        let dir = format!("{ROOT}/{}", pin.id);
        let bin = format!("{dir}/Contents/Resources/wine/bin");
        out.push(json!({"path": format!("{bin}/wine"), "text": "wine", "mode": "0755"}));
        if state != "no-wineserver" {
            out.push(
                json!({"path": format!("{bin}/wineserver"), "text": "wineserver", "mode": "0755"}),
            );
        }
        let marker_path = format!("{dir}/.gamelib-pin.json");
        match state {
            "ok" | "no-wineserver" => {
                out.push(json!({"path": marker_path, "text": marker(&pin.wine, None)}))
            }
            "wrong-sha" => out.push(
                json!({"path": marker_path, "text": marker(&pin.wine, Some(&"1".repeat(64)))}),
            ),
            "corrupt-marker" => out.push(json!({"path": marker_path, "text": "not json {"})),
            _ => {}
        }
    }
    if let Some(state) = installed["dxvk"].as_str() {
        let dir = format!("{ROOT}/dxvk-macOS-{}", pin.dxvk.version);
        out.push(json!({"path": format!("{dir}/x32/d3d9.dll"), "text": "x32"}));
        if state != "no-x64" {
            out.push(json!({"path": format!("{dir}/x64/d3d9.dll"), "text": "x64"}));
        }
        let sha = (state == "wrong-sha").then(|| "2".repeat(64));
        out.push(json!({
            "path": format!("{dir}/.gamelib-pin.json"),
            "text": marker(&pin.dxvk, sha.as_deref()),
        }));
    }
    out
}

/// `mkdtemp`'s suffix is random: `.tmp-<kind>-XXXXXX` in every compared value.
fn scrub(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(at) = rest.find(".tmp-") {
        let (head, tail) = rest.split_at(at);
        out.push_str(head);
        let kind = ["wine", "dxvk"]
            .into_iter()
            .find(|k| tail[5..].starts_with(&format!("{k}-")));
        match kind {
            Some(kind) => {
                let after = &tail[5 + kind.len() + 1..];
                let suffix: String = after
                    .chars()
                    .take_while(char::is_ascii_alphanumeric)
                    .collect();
                if suffix.len() == 6 {
                    out.push_str(&format!(".tmp-{kind}-XXXXXX"));
                    rest = &after[6..];
                } else {
                    out.push_str(".tmp-");
                    rest = &tail[5..];
                }
            }
            None => {
                out.push_str(".tmp-");
                rest = &tail[5..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn scrub_value(value: Value) -> Value {
    match value {
        Value::String(s) => Value::String(scrub(&s)),
        Value::Array(items) => Value::Array(items.into_iter().map(scrub_value).collect()),
        Value::Object(map) => {
            Value::Object(map.into_iter().map(|(k, v)| (k, scrub_value(v))).collect())
        }
        other => other,
    }
}

fn normal(profile: &Profile, value: Value) -> Value {
    scrub_value(profile.normalise(value))
}

fn markers(profile: &Profile) -> Value {
    let mut out = Map::new();
    fn walk(dir: &Path, profile: &Profile, out: &mut Map<String, Value>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let path = entry.path();
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                walk(&path, profile, out);
            } else if entry.file_name() == ".gamelib-pin.json" {
                out.insert(
                    profile.normalise_text(&path.to_string_lossy()),
                    Value::String(std::fs::read_to_string(&path).unwrap()),
                );
            }
        }
    }
    walk(&profile.tools.join("steam-engines"), profile, &mut out);
    Value::Object(out)
}

fn list_root(profile: &Profile) -> Value {
    let root = profile.tools.join("steam-engines");
    match std::fs::read_dir(&root) {
        Err(_) => Value::Null,
        Ok(entries) => {
            let mut names: Vec<String> = entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect();
            names.sort();
            json!(names)
        }
    }
}

fn paths_value(profile: &Profile, ctx: &gamelib_engine::ctx::EngineCtx, pin: &EnginePin) -> Value {
    let paths = pinned_engine_paths(ctx, pin);
    normal(
        profile,
        json!({
            "wineDir": paths.wine_dir,
            "wineBin": paths.wine_bin,
            "wineserverBin": paths.wineserver_bin,
            "dxvkDir": paths.dxvk_dir,
        }),
    )
}

/// One caller's record.
struct CallerRun {
    app: String,
    abort: Option<String>,
    raw: EnsureResult,
    reported: PinnedEngineResult,
    progress: Vec<FallbackProgress>,
}

fn raw_value(
    raw: &EnsureResult,
    profile: &Profile,
    ctx: &gamelib_engine::ctx::EngineCtx,
    pin: &EnginePin,
) -> Value {
    match raw {
        EnsureResult::Ok(_) => json!({"ok": true, "paths": paths_value(profile, ctx, pin)}),
        EnsureResult::Failed { reason, detail } => {
            json!({"ok": false, "reason": reason.as_str(), "detail": detail})
        }
    }
}

fn progress_value(p: &FallbackProgress) -> Value {
    let mut out = json!({
        "phase": match p.phase {
            Phase::Downloading => "downloading",
            Phase::Verifying => "verifying",
            Phase::Extracting => "extracting",
        },
        "artifact": p.artifact.as_str(),
    });
    if let Some(percentage) = p.percentage {
        // JSON has one number: a whole percentage is the integer the TS recorded.
        out["percentage"] = if percentage.fract() == 0.0 {
            json!(percentage as i64)
        } else {
            json!(percentage)
        };
    }
    out
}

/// The golden's progress with the ETA left out (the Rust engine does not compute one: the reporter
/// never read it).
fn golden_progress(list: &Value) -> Vec<Value> {
    list.as_array()
        .unwrap()
        .iter()
        .map(|p| {
            let mut p = p.clone();
            p.as_object_mut().unwrap().remove("eta");
            p
        })
        .collect()
}

/// What the TS gave for a download the stub failed, and what the Rust fetch's category word is
/// (`deltas.json`, `download-failure-detail-is-the-fetch-category`).
fn delta_detail(case_id: &str, golden: &str) -> String {
    match case_id {
        "download-failed-network" => "network".to_string(),
        "download-stopped-without-signal" | "abort-during-download-progress" => {
            "aborted".to_string()
        }
        _ => golden.to_string(),
    }
}

/// The golden's log lines as `<level> <message>`, with the documented deltas applied.
fn golden_logs(logs: &Value) -> Vec<String> {
    logs.as_array()
        .unwrap()
        .iter()
        .map(|l| {
            let level = l["level"].as_str().unwrap();
            let message = l["message"].as_str().unwrap();
            if level == "ERROR" && message.starts_with("Extracting Error:") {
                return "error Engine: tar exited with an error".to_string();
            }
            if let Some(at) = message.find(": ") {
                if message.starts_with("built-in engine unavailable for ") {
                    // `<reason> <detail>`: the Rust line names the reason only.
                    let reason = message[at + 2..].split(' ').next().unwrap();
                    return format!("warn {}: {reason}", &message[..at]);
                }
            }
            format!(
                "{} {message}",
                level.to_lowercase().replace("warning", "warn")
            )
        })
        .collect()
}

async fn run_case(case: &Value, archives: &Archives) {
    let id = id_of(case);
    let golden = golden_dir().join("expected").join(id);
    let profile = Arc::new(Profile::new());
    let set = build_pins(archives);
    let which = case["pin"].as_str().unwrap_or("current");
    let base = match which {
        "previous" => &set.previous,
        "other" => &set.other,
        _ => &set.current,
    };
    let pin = EnginePin {
        wine: served_artifact(&base.wine, "wine", serve_of(case, "wine"), archives),
        dxvk: served_artifact(&base.dxvk, "dxvk", serve_of(case, "dxvk"), archives),
        ..base.clone()
    };
    let table = EnginePins {
        current: if which == "current" {
            pin.clone()
        } else {
            set.current.clone()
        },
        previous: Some(if which == "previous" {
            pin.clone()
        } else {
            set.previous.clone()
        }),
    };

    let recordings: Vec<Recording> = ["dxvk", "wine"]
        .into_iter()
        .filter_map(|kind| {
            let serve = serve_of(case, kind)?;
            let artifact = if kind == "dxvk" { &pin.dxvk } else { &pin.wine };
            Some(Recording {
                url: artifact.url.clone(),
                body: served_body(kind, Some(serve), archives).to_vec(),
                fail: match serve {
                    "fail-network" => Some(Fail::Network),
                    "fail-stopped" => Some(Fail::Stopped),
                    _ => None,
                },
            })
        })
        .collect();
    let stub = Arc::new(StubFetch::with(recordings));
    let failing: Vec<String> = [("dxvk", &pin.dxvk), ("wine", &pin.wine)]
        .into_iter()
        .filter(|(kind, _)| serve_of(case, kind) == Some("tar-fails"))
        .map(|(_, a)| a.archive_name.clone())
        .collect();
    let runner = Arc::new(TracingRunner {
        home_env: profile
            .home
            .env()
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
            .collect(),
        failing,
        spawns: Arc::default(),
    });
    let log = Arc::new(RecordingLog::new());
    let emitter = Arc::new(RecordingEmitter::new());

    let mut seed = installed_seed(&pin, &case["installed"]);
    seed.extend(case["seed"].as_array().cloned().unwrap_or_default());
    profile.seed(&Value::Array(seed));

    let ctx = profile
        .ctx_with(log.clone(), Some(runner.clone()))
        .with_fetch(stub.clone())
        .with_emitter(emitter.clone())
        .with_online(case["online"].as_bool() != Some(false));

    let op = case["op"].as_str().unwrap();
    let mut result = Map::new();
    let mut callers: Vec<CallerRun> = Vec::new();
    match op {
        "ensure" => {
            let calls = case["callers"]
                .as_array()
                .cloned()
                .unwrap_or_else(|| vec![json!({"app": "oracle-app"})]);
            let mut futures = Vec::new();
            let progress: Vec<Arc<Mutex<Vec<FallbackProgress>>>> = calls
                .iter()
                .map(|_| Arc::new(Mutex::new(Vec::new())))
                .collect();
            for (call, seen) in calls.iter().zip(&progress) {
                let abort = call["abort"].as_str().map(str::to_string);
                let token = CancellationToken::new();
                if matches!(abort.as_deref(), Some("before" | "sync")) {
                    token.cancel();
                }
                let tap: Tap = {
                    let seen = seen.clone();
                    let token = token.clone();
                    let abort = abort.clone();
                    Arc::new(move |p: &FallbackProgress| {
                        seen.lock().unwrap().push(*p);
                        let hit = (abort.as_deref() == Some("downloading-progress")
                            && p.phase == Phase::Downloading
                            && p.percentage.unwrap_or(0.0) > 0.0)
                            || (abort.as_deref() == Some("verifying")
                                && p.phase == Phase::Verifying)
                            || (abort.as_deref() == Some("extracting")
                                && p.phase == Phase::Extracting);
                        if hit {
                            token.cancel();
                        }
                    })
                };
                let caller = Caller {
                    app_name: call["app"].as_str().unwrap().to_string(),
                    runner: "nile".to_string(),
                    cancel: abort.is_some().then_some(token),
                    tap: Some(tap),
                };
                futures.push(ensure_pinned_engine_detailed(&ctx, &table, &pin, caller));
            }
            let answers = futures_util::future::join_all(futures).await;
            for ((call, seen), (raw, reported)) in calls.iter().zip(&progress).zip(answers) {
                callers.push(CallerRun {
                    app: call["app"].as_str().unwrap().to_string(),
                    abort: call["abort"].as_str().map(str::to_string),
                    raw,
                    reported,
                    progress: seen.lock().unwrap().clone(),
                });
            }
        }
        "prune" => {
            let before = list_root(&profile);
            prune_unpinned_engines(&ctx, &table);
            result.insert("before".into(), before);
            result.insert("after".into(), list_root(&profile));
        }
        "installed" => {
            result.insert(
                "installed".into(),
                json!(is_pinned_engine_installed(&ctx, &pin)),
            );
            result.insert("paths".into(), paths_value(&profile, &ctx, &pin));
        }
        "paths" => {
            result.insert(
                "root".into(),
                normal(&profile, json!(pinned_engine_root(&ctx))),
            );
            for (key, p) in [
                ("current", &set.current),
                ("previous", &set.previous),
                ("other", &set.other),
            ] {
                result.insert(key.into(), paths_value(&profile, &ctx, p));
            }
        }
        other => panic!("{id}: no replay for op {other}"),
    }

    stub.expect_all_served();
    assert_eq!(
        ctx.fallback.in_flight(),
        0,
        "{id}: a flight was left in the map"
    );
    assert_eq!(ctx.fallback.active_installs(), 0, "{id}");

    // --- the result ---
    let want = read_json(&golden.join("result.json"));
    if op == "ensure" {
        let want_callers = want["callers"].as_array().unwrap();
        assert_eq!(want_callers.len(), callers.len(), "{id}: callers");
        for (want, got) in want_callers.iter().zip(&callers) {
            let who = format!("{id}/{}", got.app);
            assert_eq!(want["app"], json!(got.app), "{who}");
            assert_eq!(want["abort"], json!(got.abort), "{who}: abort");
            // The engine's raw answer.
            let mut want_raw = want["raw"].clone();
            if want_raw["ok"] == json!(false) {
                let detail = delta_detail(id, want_raw["detail"].as_str().unwrap());
                want_raw["detail"] = json!(detail);
            }
            let want_raw = scrub_value(want_raw);
            let got_raw = normal(&profile, raw_value(&got.raw, &profile, &ctx, &pin));
            assert_eq!(want_raw, got_raw, "{who}: the engine's answer");
            // The reporter's.
            let want_reporting = want["reporting"].clone();
            let got_reporting = normal(&profile, got.reported.to_value());
            let want_reporting = if want_reporting["ok"] == json!(false) {
                let reason = want_reporting["reason"].as_str().unwrap();
                let error = if reason == "aborted" {
                    "aborted".to_string()
                } else {
                    let raw_detail = delta_detail(id, want["raw"]["detail"].as_str().unwrap());
                    format!("{reason} {raw_detail}")
                };
                let mut v = want_reporting;
                v["error"] = json!(error);
                scrub_value(v)
            } else {
                want_reporting
            };
            assert_eq!(
                want_reporting, got_reporting,
                "{who}: the reporter's answer"
            );
            // The engine's progress.
            let want_progress = golden_progress(&want["progress"]);
            let got_progress: Vec<Value> = got.progress.iter().map(progress_value).collect();
            assert_eq!(want_progress, got_progress, "{who}: progress");
        }
    } else {
        for (key, got) in &result {
            assert_eq!(
                &normal(&profile, got.clone()),
                &scrub_value(want[key.as_str()].clone()),
                "{id}: {key}"
            );
        }
        assert_eq!(want["op"], json!(op), "{id}");
    }
    assert_eq!(want["abortControllerReleased"], json!(true), "{id}");
    assert_eq!(want["markers"], markers(&profile), "{id}: the pin markers");

    // --- the log lines ---
    let got_logs: Vec<String> = log
        .lines()
        .into_iter()
        .map(|(level, line)| format!("{level} {}", profile.normalise_text(&line)))
        .collect();
    let mut want_logs = golden_logs(&want["logs"]);
    let mut got_logs = got_logs;
    if callers.len() > 1 {
        // The callers' lines interleave by scheduling.
        want_logs.sort();
        got_logs.sort();
    }
    assert_eq!(want_logs, got_logs, "{id}: log lines");

    // --- the status events, per app ---
    let want_events = read_json(&golden.join("events.json"));
    let pushed = emitter.pushed();
    let got_events: Vec<Value> = pushed
        .iter()
        .map(|(channel, args)| json!({"channel": channel, "args": args}))
        .collect();
    let mut apps: Vec<String> = want_events
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["args"][0]["appName"].as_str().unwrap().to_string())
        .collect();
    apps.sort();
    apps.dedup();
    assert_eq!(
        want_events.as_array().unwrap().len(),
        got_events.len(),
        "{id}: event count"
    );
    for app in &apps {
        let pick = |list: &[Value]| -> Vec<Value> {
            list.iter()
                .filter(|e| e["args"][0]["appName"] == json!(app))
                .cloned()
                .collect()
        };
        assert_eq!(
            pick(want_events.as_array().unwrap()),
            pick(&got_events),
            "{id}: gameStatusUpdate sequence of {app}"
        );
    }
    if apps.len() < 2 {
        assert_eq!(
            want_events,
            Value::Array(got_events.clone()),
            "{id}: event order"
        );
    }

    // --- the requests, the spawns, the tree ---
    let want_requests: Vec<String> = read_json(&golden.join("requests.json"))
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    let got_requests: Vec<String> = stub
        .requested()
        .into_iter()
        .map(|url| format!("DOWNLOAD {url}"))
        .collect();
    assert_eq!(want_requests, got_requests, "{id}: requests");

    let want_spawns = read_json(&golden.join("spawns.json"));
    let got_spawns = normal(
        &profile,
        Value::Array(
            runner
                .spawns
                .lock()
                .unwrap()
                .iter()
                .map(RecordedSpawn::to_json)
                .collect(),
        ),
    );
    assert_eq!(
        scrub_value(want_spawns),
        got_spawns,
        "{id}: the spawn trace"
    );

    let want_tree = read_json(&golden.join("tree.json"));
    let got_tree = scrub_value(profile.snapshot());
    assert_eq!(
        want_tree,
        got_tree,
        "{id}: the profile tree ({})",
        first_difference(&want_tree, &got_tree)
    );
}

#[tokio::test]
async fn every_fallback_golden_replays() {
    let archives = archives();
    let all = cases();
    let replayed: Vec<&Value> = all
        .iter()
        .filter(|c| !SWEEP_CASES.contains(&id_of(c)))
        .collect();
    for case in &replayed {
        run_case(case, &archives).await;
    }
    // Every sweep case is named above and exists; the rest replay.
    for id in SWEEP_CASES {
        assert!(all.iter().any(|c| id_of(c) == id), "{id}");
    }
    assert_eq!(replayed.len() + SWEEP_CASES.len(), all.len());
    check_floor("fallback goldens replayed", replayed.len(), 36).unwrap();
}

#[test]
fn the_manifest_agrees_with_the_case_list_and_an_empty_list_fails() {
    let all = cases();
    let manifest = read_json(&golden_dir().join("MANIFEST.json"));
    assert_eq!(manifest["count"].as_u64().unwrap() as usize, all.len());
    assert!(manifest["floor"].as_u64().unwrap() as usize >= CASE_FLOOR);
    check_floor("fallback cases", all.len(), CASE_FLOOR).unwrap();
    assert!(check_floor("fallback cases", 0, CASE_FLOOR).is_err());
    // One expected folder per case, no more.
    let mut folders: Vec<String> = std::fs::read_dir(golden_dir().join("expected"))
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    folders.sort();
    let mut ids: Vec<String> = all.iter().map(|c| id_of(c).to_string()).collect();
    ids.sort();
    assert_eq!(folders, ids);
}

#[test]
fn the_documented_deltas_are_exactly_those_this_replay_treats_differently() {
    let deltas = read_json(&golden_dir().join("deltas.json"));
    let mut keys: Vec<&str> = deltas
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        [
            "download-failure-detail-is-the-fetch-category",
            "extract-failure-log-names-no-tar-output",
            "removal-goes-through-the-safety-guard",
            "unavailable-log-line-names-the-reason-not-the-detail",
        ]
    );
    for (key, why) in deltas.as_object().unwrap() {
        assert!(why.as_str().unwrap().len() > 150, "{key}");
    }
}

// ---------------------------------------------------------------------------------------------
// What the goldens cannot reach
// ---------------------------------------------------------------------------------------------

fn world(
    stub: StubFetch,
) -> (
    Arc<Profile>,
    gamelib_engine::ctx::EngineCtx,
    Arc<StubFetch>,
    Archives,
    PinSet,
) {
    let archives = archives();
    let set = build_pins(&archives);
    let profile = Arc::new(Profile::new());
    let stub = Arc::new(stub);
    let runner = Arc::new(TracingRunner {
        home_env: profile
            .home
            .env()
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
            .collect(),
        failing: Vec::new(),
        spawns: Arc::default(),
    });
    let ctx = profile
        .ctx_with(Arc::new(RecordingLog::new()), Some(runner))
        .with_fetch(stub.clone())
        .with_online(true);
    (profile, ctx, stub, archives, set)
}

fn table_of(set: &PinSet) -> EnginePins {
    EnginePins {
        current: set.current.clone(),
        previous: Some(set.previous.clone()),
    }
}

#[tokio::test]
async fn a_quit_cancels_the_download_and_leaves_no_partial_directory() {
    let (profile, ctx, stub, archives, set) = world(StubFetch {
        hold_after_first_step: true,
        ..StubFetch::default()
    });
    *stub.recordings.lock().unwrap() = vec![Recording {
        url: set.current.dxvk.url.clone(),
        body: archives.dxvk.clone(),
        fail: None,
    }];
    let table = table_of(&set);
    let caller = Caller {
        app_name: "app".into(),
        runner: "nile".into(),
        ..Caller::default()
    };
    let shutdown = ctx.shutdown.clone();
    let ensure = ensure_pinned_engine_detailed(&ctx, &table, &set.current, caller);
    let quit = async {
        // Let the download start, then quit as the exit path does and wait for the registrant.
        while stub.requested().is_empty() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        tokio::task::spawn_blocking(move || shutdown.drain(Duration::from_secs(10)))
            .await
            .unwrap()
    };
    let ((raw, reported), still_held) = tokio::join!(ensure, quit);
    assert!(
        still_held.is_empty(),
        "the registrant is released: {still_held:?}"
    );
    assert!(matches!(
        raw,
        EnsureResult::Failed {
            reason: EnsureReason::Aborted,
            ..
        }
    ));
    assert!(matches!(
        reported,
        PinnedEngineResult::Failed { aborted: true, .. }
    ));
    let left = list_root(&profile);
    assert_eq!(left, json!([]), "no .tmp-* directory and nothing installed");
}

#[tokio::test]
async fn the_op_refuses_an_unknown_pin_and_a_bad_cancel_id() {
    let (_profile, ctx, _stub, _archives, set) = world(StubFetch::default());
    // The shared table does not hold the synthetic pin, so the op's own lookup refuses it.
    let unknown = EnsureArgs {
        pin_id: set.current.id.clone() + "-nope",
        app_name: "app".into(),
        runner: "nile".into(),
        cancel_id: None,
    };
    assert_eq!(
        ensure_pinned_engine(&ctx, &unknown).await.unwrap_err(),
        "unknown-pin"
    );
    let bad = EnsureArgs {
        pin_id: pins().unwrap().current.id.clone(),
        app_name: "app".into(),
        runner: "nile".into(),
        cancel_id: Some("not valid!".into()),
    };
    assert_eq!(
        ensure_pinned_engine(&ctx, &bad).await.unwrap_err(),
        "bad-cancel-id"
    );
}

#[tokio::test]
async fn a_dropped_caller_counts_as_aborted_and_the_last_one_stops_the_download() {
    let (profile, ctx, stub, archives, set) = world(StubFetch {
        hold_after_first_step: true,
        ..StubFetch::default()
    });
    *stub.recordings.lock().unwrap() = vec![Recording {
        url: set.current.dxvk.url.clone(),
        body: archives.dxvk.clone(),
        fail: None,
    }];
    let table = table_of(&set);
    let caller = || Caller {
        app_name: "app".into(),
        runner: "nile".into(),
        ..Caller::default()
    };
    // The only caller goes away mid-download (an op future dropped): the flight stops by itself.
    {
        let ensure = ensure_pinned_engine_detailed(&ctx, &table, &set.current, caller());
        tokio::select! {
            _ = ensure => panic!("the download is held"),
            _ = async { while stub.requested().is_empty() { tokio::time::sleep(Duration::from_millis(5)).await } } => {}
        }
    }
    for _ in 0..200 {
        if ctx.fallback.in_flight() == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(ctx.fallback.in_flight(), 0);
    assert_eq!(list_root(&profile), json!([]));
}

#[test]
fn the_guard_refuses_a_target_outside_the_engine_root_and_the_root_itself() {
    let profile = Profile::new();
    let ctx = profile.ctx(Arc::new(RecordingLog::new()));
    let env = Env::from_ctx(&ctx);
    let outside = profile.root().join("outside");
    std::fs::create_dir_all(outside.join("keep")).unwrap();
    std::fs::create_dir_all(&env.root).unwrap();
    assert_eq!(remove_guarded(&env, &outside), Removal::Refused);
    assert!(outside.join("keep").is_dir());
    assert_eq!(remove_guarded(&env, &env.root), Removal::Refused);
    assert!(env.root.is_dir());
    // A `..` that climbs out is refused as well.
    let sneaky = env.root.join("..").join("..").join("..").join("outside");
    assert_eq!(remove_guarded(&env, &sneaky), Removal::Refused);
    assert!(outside.join("keep").is_dir());
    // A symlink inside the root is unlinked and its target is never opened.
    std::os::unix::fs::symlink(&outside, env.root.join("link")).unwrap();
    assert_eq!(
        remove_guarded(&env, &env.root.join("link")),
        Removal::Removed
    );
    assert!(outside.join("keep").is_dir());
    // A real directory inside it goes.
    std::fs::create_dir_all(env.root.join("old/x")).unwrap();
    assert_eq!(
        remove_guarded(&env, &env.root.join("old")),
        Removal::Removed
    );
    assert!(!env.root.join("old").exists());
}

#[test]
fn the_fallback_module_deletes_nothing_by_itself() {
    // D-19: every recursive delete of this module is the guard's.
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/fallback");
    let needle = ["remove", "_dir_", "all"].concat();
    for entry in std::fs::read_dir(dir).unwrap().flatten() {
        let text = std::fs::read_to_string(entry.path()).unwrap();
        assert!(!text.contains(&needle), "{:?}", entry.path());
    }
}
