//! Replays a plan-02 timeline through the Rust machines under paused time (D-14).
//!
//! The same file the TS driver (`src/backend/testUtils/steamPollReplay/tsDriver.ts`) consumes goes
//! through `InstallPolls` / `start_uninstall` / `RunningPoll` / `rearm_persisted_holds` with a
//! recording host, a scripted process runner and a fake clock. Each tick advances tokio time by
//! one interval (3 s, 5 s for `running`). The output is the stream the README specifies: relative
//! paths, no `seq`.
//!
//! Differences from the TS driver, all inherent to running the real machines:
//! - ACF records are written as real `appmanifest_<appid>.acf` files into a temp dir (the writer
//!   in `gamelib_steamfiles::acf` cannot express BytesStaged / TargetBuildID / ScheduledAutoUpdate,
//!   so this module writes the text itself, escaping through its `vdf_escape`), and every temp
//!   prefix is stripped from the output.
//! - `monitor` readings are injected into `DownloadMonitor` (nettop rows are plan 06's tests).
//! - Rearm clears done by `HoldStore` itself are reported as `file clear` records by diffing the
//!   store before and after.

use gamelib_i18n::Catalog;
use gamelib_steampoll::acf_state::{AcfSource, PollRoots};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::hold::{parse_record, HoldStore};
use gamelib_steampoll::host::{
    BoxFuture, HoldSink, Notification, NotifyText, PollHost, ProcessRunner, RunOutput,
    StreamingChild,
};
use gamelib_steampoll::install_loop::{InstallPolls, PollOptions, StartInstallArgs};
use gamelib_steampoll::monitor::{DownloadMonitor, DownloadReading};
use gamelib_steampoll::outbox::Outbox;
use gamelib_steampoll::profile::{Platform, SidecarProfile};
use gamelib_steampoll::registry::Registry;
use gamelib_steampoll::running::{ClaimId, RunningPoll};
use gamelib_steampoll::testing::FakeClock;
use gamelib_steampoll::uninstall::{start_uninstall, StartUninstallArgs};
use serde_json::{json, Map, Value};
use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Fixed epoch so `recordedAt` and probe spacing are deterministic (README).
const EPOCH_MS: u64 = 1_700_000_000_000;
const TICK_MS: u64 = 3000;
const RUNNING_TICK_MS: u64 = 5000;

/// One record of the output stream (`{frontend}`, `{notify}`, `{state}` or `{file}`).
pub type StreamRecord = Value;

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

// ---------------------------------------------------------------------------------------------
// World: what the scripted probes answer
// ---------------------------------------------------------------------------------------------

struct World {
    running: Option<u32>,
    steam_pids: Option<Vec<u32>>,
    start_tokens: Option<HashMap<u32, String>>,
    helper: (String, Option<i32>),
    lipo: (String, Option<i32>),
    ack_timeout: bool,
}

impl World {
    fn fresh() -> World {
        World {
            running: Some(0),
            steam_pids: Some(vec![]),
            start_tokens: Some(HashMap::new()),
            helper: (String::new(), None),
            lipo: (String::new(), Some(0)),
            ack_timeout: false,
        }
    }
}

type SharedWorld = Arc<Mutex<World>>;

struct ReplayRunner {
    world: SharedWorld,
    helper: String,
}

fn out(code: Option<i32>, stdout: String) -> RunOutput {
    RunOutput {
        code,
        stdout,
        stderr: String::new(),
    }
}

impl ProcessRunner for ReplayRunner {
    fn run(&self, program: &str, argv: Vec<String>, _timeout: Duration) -> BoxFuture<RunOutput> {
        let w = lock(&self.world);
        let base = program.rsplit(['/', '\\']).next().unwrap_or(program);
        let result = if program == self.helper {
            out(w.helper.1, w.helper.0.clone())
        } else if base == "lipo" {
            out(w.lipo.1, w.lipo.0.clone())
        } else if base == "pgrep" {
            match &w.steam_pids {
                None => out(Some(2), String::new()),
                Some(v) if v.is_empty() => out(Some(1), String::new()),
                Some(v) => out(
                    Some(0),
                    v.iter().map(|p| format!("{p}\n")).collect::<String>(),
                ),
            }
        } else if base.eq_ignore_ascii_case("tasklist.exe") {
            match &w.steam_pids {
                None => out(Some(1), String::new()),
                Some(v) => out(
                    Some(0),
                    v.iter()
                        .map(|p| format!("\"steam.exe\",\"{p}\",\"Console\",\"1\",\"10,000 K\"\n"))
                        .collect::<String>(),
                ),
            }
        } else if base == "ps" || base.eq_ignore_ascii_case("powershell.exe") {
            match &w.start_tokens {
                None => out(Some(2), String::new()),
                Some(m) if m.is_empty() && base == "ps" => out(Some(1), String::new()),
                Some(m) => {
                    let wanted = wanted_pids(&argv);
                    let mut keys: Vec<&u32> = m.keys().filter(|k| wanted.contains(k)).collect();
                    keys.sort();
                    out(
                        Some(0),
                        keys.iter()
                            .map(|k| format!("{k} {}\n", m[k]))
                            .collect::<String>(),
                    )
                }
            }
        } else {
            out(Some(1), String::new())
        };
        Box::pin(async move { result })
    }

    fn spawn_streaming(
        &self,
        _program: &str,
        _argv: Vec<String>,
    ) -> std::io::Result<StreamingChild> {
        Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "replay scripts no streaming children",
        ))
    }
}

/// The pid list the hold probe asked about: `-p 1,2` (ps) or `Id 1,2` (PowerShell script).
fn wanted_pids(argv: &[String]) -> Vec<u32> {
    let csv = argv
        .iter()
        .position(|a| a == "-p")
        .and_then(|i| argv.get(i + 1))
        .cloned()
        .or_else(|| {
            argv.last().and_then(|s| {
                let after = s.split("-Id ").nth(1)?;
                Some(after.split(' ').next()?.to_string())
            })
        })
        .unwrap_or_default();
    csv.split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Host: the recording stream
// ---------------------------------------------------------------------------------------------

struct ReplayHost {
    records: Mutex<Vec<Value>>,
    catalog: Catalog,
    world: SharedWorld,
    helper: PathBuf,
    title: String,
    mac: bool,
}

impl ReplayHost {
    fn push(&self, v: Value) {
        lock(&self.records).push(v);
    }

    fn render(&self, t: &NotifyText) -> String {
        match t {
            NotifyText::Literal(s) => s.clone(),
            NotifyText::Key {
                key,
                default,
                params,
            } => self.catalog.t(key, default, params),
        }
    }
}

impl PollHost for ReplayHost {
    fn emit_frontend(&self, channel: &str, args: Vec<Value>) {
        // The sidecar's own push is covered by the state record that precedes it (R2).
        if channel == "pushGameToLibrary" {
            return;
        }
        self.push(json!({"frontend": {"channel": channel, "args": args}}));
    }

    fn notify(&self, n: Notification) {
        let mut rec = Map::new();
        rec.insert("title".into(), json!(self.render(&n.title)));
        rec.insert("body".into(), json!(self.render(&n.body)));
        if let NotifyText::Key {
            key,
            default,
            params,
        } = &n.body
        {
            rec.insert("key".into(), json!(key));
            rec.insert("default".into(), json!(default));
            if !params.is_empty() {
                rec.insert("params".into(), Value::Object(params.clone()));
            }
        }
        self.push(json!({ "notify": rec }));
    }

    fn state_event(&self, ev: StateEvent) -> BoxFuture<AckReply> {
        let mut v = serde_json::to_value(&ev).unwrap_or(Value::Null);
        if let Some(o) = v.as_object_mut() {
            o.remove("seq");
        }
        self.push(json!({ "state": v }));
        let timeout = lock(&self.world).ack_timeout;
        let reply = AckReply {
            applied: true,
            title: Some(self.title.clone()),
            mac_arch_check: Some(self.mac),
            bridge_authoritative: None,
        };
        Box::pin(async move {
            if timeout {
                std::future::pending().await
            } else {
                reply
            }
        })
    }

    fn bridge_helper_path(&self) -> Option<PathBuf> {
        Some(self.helper.clone())
    }

    fn shell_pid(&self) -> u32 {
        1
    }
}

impl HoldSink for ReplayHost {
    fn record(&self, app_id: &str, record: Value, _now_ms: u64) {
        self.push(json!({"file": {"op": "record", "appId": app_id, "record": record}}));
    }

    fn clear(&self, app_id: &str) {
        self.push(json!({"file": {"op": "clear", "appId": app_id, "record": null}}));
    }
}

// ---------------------------------------------------------------------------------------------
// Temp layout
// ---------------------------------------------------------------------------------------------

struct Layout {
    base: PathBuf,
    /// Every textual form of the temp prefix to strip from the output.
    prefixes: Vec<String>,
    darwin: bool,
}

impl Layout {
    fn map(&self, fake: &str) -> PathBuf {
        self.base.join(fake.trim_start_matches(['/', '\\']))
    }

    fn write_acf(&self, dir_key: &str, record: &Value) -> Result<(), String> {
        let dir = self.map(dir_key);
        std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
        let Some(appid) = record.get("appid").and_then(Value::as_str) else {
            return Ok(());
        };
        let installdir = record
            .get("installdir")
            .and_then(Value::as_str)
            .unwrap_or("");
        let text = acf_text(record);
        std::fs::write(dir.join(format!("appmanifest_{appid}.acf")), text)
            .map_err(|e| format!("write acf: {e}"))?;
        let flags = record
            .get("stateFlags")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        if self.darwin && flags & 4 != 0 && !installdir.is_empty() {
            // A bundle for the post-install Mach-O probe to find; `lipo` itself is scripted.
            let bin = dir
                .join("common")
                .join(installdir)
                .join("Game.app")
                .join("Contents")
                .join("MacOS");
            std::fs::create_dir_all(&bin).map_err(|e| format!("mkdir: {e}"))?;
            std::fs::write(bin.join("Game"), b"").map_err(|e| format!("write bin: {e}"))?;
        }
        Ok(())
    }

    fn clear_acf(&self, dir_key: &str) {
        let dir = self.map(dir_key);
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().into_owned();
                if n.starts_with("appmanifest_") && n.ends_with(".acf") {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
    }

    fn unmap(&self, v: &mut Value) {
        match v {
            Value::String(s) => {
                for p in &self.prefixes {
                    if s.contains(p.as_str()) {
                        *s = s.replace(p.as_str(), "");
                    }
                }
            }
            Value::Array(a) => a.iter_mut().for_each(|x| self.unmap(x)),
            Value::Object(o) => o.values_mut().for_each(|x| self.unmap(x)),
            _ => {}
        }
    }
}

fn acf_text(r: &Value) -> String {
    let q = |k: &str| r.get(k).and_then(Value::as_str);
    let mut lines = vec!["\"AppState\"".to_string(), "{".to_string()];
    let mut put = |key: &str, value: String| {
        lines.push(format!(
            "\t\"{key}\"\t\t\"{}\"",
            gamelib_steamfiles::acf::vdf_escape(&value)
        ))
    };
    for (key, field) in [
        ("appid", "appid"),
        ("name", "name"),
        ("installdir", "installdir"),
        ("SizeOnDisk", "sizeOnDisk"),
        ("buildid", "buildid"),
        ("BytesDownloaded", "bytesDownloaded"),
        ("BytesToDownload", "bytesToDownload"),
        ("BytesStaged", "bytesStaged"),
        ("BytesToStage", "bytesToStage"),
        ("TargetBuildID", "targetBuildId"),
        ("ScheduledAutoUpdate", "scheduledAutoUpdate"),
    ] {
        if let Some(v) = q(field) {
            put(key, v.to_string());
        }
    }
    if let Some(f) = r.get("stateFlags").and_then(Value::as_u64) {
        put("StateFlags", f.to_string());
    }
    if let Some(b) = q("betaKey") {
        lines.push("\t\"UserConfig\"\n\t{".to_string());
        lines.push(format!(
            "\t\t\"BetaKey\"\t\t\"{}\"",
            gamelib_steamfiles::acf::vdf_escape(b)
        ));
        lines.push("\t}".to_string());
    }
    lines.push("}".to_string());
    lines.join("\n") + "\n"
}

// ---------------------------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------------------------

fn locales_dir() -> PathBuf {
    let built = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales");
    if built.exists() {
        built
    } else {
        PathBuf::from("public/locales")
    }
}

fn expand_ticks(ticks: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    for t in ticks {
        let mut first = t.clone();
        let repeat = first
            .as_object_mut()
            .and_then(|o| o.remove("repeat"))
            .and_then(|r| r.as_u64())
            .unwrap_or(0);
        out.push(first);
        for _ in 0..repeat {
            out.push(json!({}));
        }
    }
    out
}

fn str_field<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

fn bool_tick(tick: &Value, key: &str) -> Option<bool> {
    tick.get(key).and_then(Value::as_bool)
}

fn apply_tick(
    tick: &Value,
    world: &SharedWorld,
    layout: &Layout,
    monitor: &DownloadMonitor,
    polls: &InstallPolls,
    app_id: &str,
) -> Result<(), String> {
    if let Some(acf) = tick.get("acf").and_then(Value::as_object) {
        for (dir, rec) in acf {
            if rec.is_null() {
                layout.clear_acf(dir);
            } else {
                layout.clear_acf(dir);
                layout.write_acf(dir, rec)?;
            }
        }
    }
    {
        let mut w = lock(world);
        if let Some(r) = tick.get("running") {
            w.running = r.as_u64().map(|n| n as u32);
        }
        if let Some(p) = tick.get("steamPids") {
            w.steam_pids = p.as_array().map(|a| {
                a.iter()
                    .filter_map(Value::as_u64)
                    .map(|n| n as u32)
                    .collect()
            });
        }
        if let Some(t) = tick.get("startTokens") {
            w.start_tokens = t.as_object().map(|m| {
                m.iter()
                    .filter_map(|(k, v)| Some((k.parse().ok()?, v.as_str()?.to_string())))
                    .collect()
            });
        }
        for (key, slot) in [("helper", 0), ("lipo", 1)] {
            if let Some(h) = tick.get(key).filter(|h| h.is_object()) {
                let reply = (
                    str_field(h, "stdout").unwrap_or("").to_string(),
                    h.get("code").and_then(Value::as_i64).map(|c| c as i32),
                );
                if slot == 0 {
                    w.helper = reply;
                } else {
                    w.lipo = reply;
                }
            }
        }
        w.ack_timeout = str_field(tick, "ack") == Some("timeout");
    }
    if let Some(m) = tick.get("monitor") {
        let reading = m.as_object().map(|o| DownloadReading {
            bytes_done: o.get("bytesDone").and_then(Value::as_f64).unwrap_or(0.0),
            bytes_total: o.get("bytesTotal").and_then(Value::as_f64).unwrap_or(0.0),
            speed_bytes_per_sec: o.get("speedBytesPerSec").and_then(Value::as_f64),
        });
        monitor.inject_reading(app_id, reading);
    }
    if let Some(b) = bool_tick(tick, "nativeInFlight") {
        polls.set_native_in_flight(app_id, b);
    }
    if let Some(b) = bool_tick(tick, "bridgeFinalized") {
        polls.set_bridge_finalized(app_id, b);
    }
    Ok(())
}

async fn settle() {
    for _ in 0..64 {
        tokio::task::yield_now().await;
    }
}

fn poll_options(start: &Value) -> Result<PollOptions, String> {
    let mut o = start.as_object().cloned().unwrap_or_default();
    for k in ["appId", "title", "roots"] {
        o.remove(k);
    }
    o.insert("intervalMs".into(), json!(TICK_MS));
    serde_json::from_value(Value::Object(o)).map_err(|e| format!("bad start options: {e}"))
}

fn bridge_authoritative(timeline: &Value, platform: Platform) -> bool {
    let store = timeline.get("store");
    if platform != Platform::Darwin
        || !store
            .and_then(|s| s.get("bridgeAllowlisted"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return false;
    }
    let meta = store.and_then(|s| s.get("metadata"));
    str_field(meta.unwrap_or(&Value::Null), "mac_arch") == Some("32")
        || (meta
            .and_then(|m| m.get("platformsCaptured"))
            .and_then(Value::as_bool)
            == Some(true)
            && meta
                .and_then(|m| m.get("is_mac_native"))
                .and_then(Value::as_bool)
                == Some(false))
}

/// Runs `timeline` and returns the normalised stream.
pub fn replay(timeline: &Value) -> Result<Vec<StreamRecord>, String> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .start_paused(true)
        .build()
        .map_err(|e| format!("runtime: {e}"))?;
    rt.block_on(run(timeline))
}

async fn run(timeline: &Value) -> Result<Vec<StreamRecord>, String> {
    let name = str_field(timeline, "name")
        .unwrap_or("<unnamed>")
        .to_string();
    let machine = str_field(timeline, "machine").ok_or("machine missing")?;
    let platform = Platform::from_node(str_field(timeline, "platform").ok_or("platform missing")?);
    let start = timeline.get("start").ok_or("start missing")?;
    let app_id = str_field(start, "appId")
        .ok_or("start.appId missing")?
        .to_string();
    let title = str_field(start, "title").unwrap_or("").to_string();
    let ticks = expand_ticks(
        timeline
            .get("ticks")
            .and_then(Value::as_array)
            .ok_or("ticks missing")?,
    );
    if ticks.is_empty() {
        return Err(format!("timeline {name}: ticks missing"));
    }
    let roots_spec = start.get("roots").ok_or("start.roots missing")?;
    let native: Vec<String> = roots_spec
        .get("native")
        .and_then(Value::as_array)
        .ok_or("start.roots.native missing")?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();

    // Temp layout.
    let tmp = tempfile::tempdir().map_err(|e| format!("tempdir: {e}"))?;
    let base = std::fs::canonicalize(tmp.path()).map_err(|e| format!("tempdir: {e}"))?;
    let mut prefixes = vec![base.to_string_lossy().into_owned()];
    let raw = tmp.path().to_string_lossy().into_owned();
    if !prefixes.contains(&raw) {
        prefixes.push(raw);
    }
    let layout = Layout {
        base: base.clone(),
        prefixes,
        darwin: platform == Platform::Darwin,
    };
    let steam_root = native
        .first()
        .map(|p| layout.map(p))
        .unwrap_or_else(|| base.join("no-steam"));
    for lib in &native {
        std::fs::create_dir_all(layout.map(lib).join("steamapps"))
            .map_err(|e| format!("mkdir: {e}"))?;
    }
    let mut vdf = String::from("\"libraryfolders\"\n{\n");
    for (i, lib) in native.iter().enumerate() {
        vdf.push_str(&format!(
            "\t\"{i}\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n",
            gamelib_steamfiles::acf::vdf_escape(&layout.map(lib).to_string_lossy())
        ));
    }
    vdf.push_str("}\n");
    std::fs::create_dir_all(steam_root.join("steamapps")).map_err(|e| format!("mkdir: {e}"))?;
    std::fs::write(steam_root.join("steamapps").join("libraryfolders.vdf"), vdf)
        .map_err(|e| format!("write vdf: {e}"))?;
    let bottle = str_field(roots_spec, "bottle").map(|p| layout.map(p));
    let bridge = str_field(roots_spec, "bridge").map(|p| layout.map(p));
    for d in bottle.iter().chain(bridge.iter()) {
        std::fs::create_dir_all(d).map_err(|e| format!("mkdir: {e}"))?;
    }
    let roots = PollRoots {
        steam_root: steam_root.to_string_lossy().into_owned(),
        bottle_steamapps_root: bottle.map(|p| p.to_string_lossy().into_owned()),
        bridge_steamapps_root: bridge.map(|p| p.to_string_lossy().into_owned()),
    };

    // Scratch profile (config.json carries defaultSteamPath for the boot rearm).
    let user_data = base.join("profile").join("GameLib");
    let store_path = user_data
        .join("store_cache")
        .join("steam_restart_hold.json");
    let config_path = user_data.join("config.json");
    std::fs::create_dir_all(&user_data).map_err(|e| format!("mkdir: {e}"))?;
    std::fs::write(
        &config_path,
        json!({"defaultSettings": {"defaultSteamPath": roots.steam_root}}).to_string(),
    )
    .map_err(|e| format!("write config: {e}"))?;
    let profile = SidecarProfile {
        user_data: user_data.to_string_lossy().into_owned(),
        config_path: config_path.to_string_lossy().into_owned(),
        restart_hold_store_path: store_path.to_string_lossy().into_owned(),
        locales_dir: Some(locales_dir()),
    };
    let store = HoldStore::new(&store_path);
    if let Some(records) = timeline
        .get("store")
        .and_then(|s| s.get("restartHold"))
        .and_then(Value::as_object)
    {
        for (id, rec) in records {
            let parsed = parse_record(rec).ok_or_else(|| format!("bad restartHold record {id}"))?;
            store.record(id, &parsed, EPOCH_MS);
        }
    }

    // Collaborators.
    let world: SharedWorld = Arc::new(Mutex::new(World::fresh()));
    let helper = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    let host = Arc::new(ReplayHost {
        records: Mutex::new(vec![]),
        catalog: Catalog::load(&locales_dir(), "en"),
        world: world.clone(),
        helper: helper.clone(),
        title: title.clone(),
        mac: platform == Platform::Darwin,
    });
    let runner = Arc::new(ReplayRunner {
        world: world.clone(),
        helper: helper.to_string_lossy().into_owned(),
    });
    let clock = Arc::new(FakeClock::new(EPOCH_MS));
    let registry = Registry::new(
        tokio::runtime::Handle::current(),
        host.clone(),
        runner.clone(),
        clock.clone(),
    );
    let outbox = Arc::new(Outbox::new());
    let monitor = Arc::new(DownloadMonitor::with_platform(
        host.clone(),
        runner.clone(),
        clock.clone(),
        false,
    ));
    let polls = InstallPolls::new(
        registry.clone(),
        outbox.clone(),
        host.clone(),
        monitor.clone(),
        platform,
    );
    let running = {
        let w = world.clone();
        RunningPoll::new(
            registry.clone(),
            Arc::new(move || {
                let id = lock(&w).running.unwrap_or(0);
                Box::pin(async move { id })
            }),
        )
    };

    let ready_at = timeline
        .get("sidecarReadyAtTick")
        .and_then(Value::as_u64)
        .map(|n| n as usize);
    if ready_at.is_none() {
        outbox.mark_ready(host.as_ref()).await;
    }

    // First tick's state is applied before the machine starts.
    apply_tick(&ticks[0], &world, &layout, &monitor, &polls, &app_id)?;

    let interval = if machine == "running" {
        RUNNING_TICK_MS
    } else {
        TICK_MS
    };
    let start_args = |opts: PollOptions| StartInstallArgs {
        app_id: app_id.clone(),
        title: title.clone(),
        roots: roots.clone(),
        options: opts,
    };
    match machine {
        "install" => polls
            .start_install(start_args(poll_options(start)?))
            .map_err(|e| format!("start: {e}"))?,
        "uninstall" => {
            let source: AcfSource =
                serde_json::from_value(start.get("source").cloned().unwrap_or(json!("native")))
                    .map_err(|e| format!("bad source: {e}"))?;
            start_uninstall(
                &registry,
                outbox.clone(),
                host.clone(),
                StartUninstallArgs {
                    app_id: app_id.clone(),
                    title: title.clone(),
                    roots: roots.clone(),
                    source,
                    interval_ms: Some(TICK_MS),
                    bridge_authoritative: bridge_authoritative(timeline, platform),
                },
            )
            .map_err(|e| format!("start: {e}"))?;
        }
        "rearm" => {
            let before: BTreeSet<String> = store.list().into_iter().map(|(id, _)| id).collect();
            gamelib_steampoll::rearm::rearm_persisted_holds(&polls, &profile).await;
            let after: BTreeSet<String> = store.list().into_iter().map(|(id, _)| id).collect();
            for gone in before.difference(&after) {
                host.clear(gone);
            }
            settle().await;
        }
        "running" => running.start(),
        other => return Err(format!("timeline {name}: bad machine {other}")),
    }

    // Let the spawned loops reach their first await so their intervals anchor at t=0.
    settle().await;

    let mut claims: HashMap<u64, ClaimId> = HashMap::new();
    let mut elapsed: u64 = 0;
    for (index, tick) in ticks.iter().enumerate() {
        if index > 0 {
            apply_tick(tick, &world, &layout, &monitor, &polls, &app_id)?;
        }
        if ready_at == Some(index) {
            outbox.mark_ready(host.as_ref()).await;
        }
        if let Some(again) = tick.get("startAgain").filter(|v| v.is_object()) {
            let mut merged = start.as_object().cloned().unwrap_or_default();
            merged.retain(|k, _| k == "appId" || k == "title" || k == "roots");
            if let Some(o) = again.as_object() {
                merged.extend(o.clone());
            }
            polls
                .start_install(start_args(poll_options(&Value::Object(merged))?))
                .map_err(|e| format!("startAgain: {e}"))?;
        }
        if bool_tick(tick, "cancelDelegated") == Some(true) {
            polls.cancel_delegated(&app_id);
        }
        if let Some(id) = tick.get("runningHold").and_then(Value::as_u64) {
            claims.insert(id, running.hold(id as u32));
        }
        if let Some(rel) = tick.get("runningRelease").filter(|v| v.is_object()) {
            let id = rel.get("appId").and_then(Value::as_u64).unwrap_or(0);
            if let Some(claim) = claims.remove(&id) {
                running.release(
                    claim,
                    rel.get("terminalSent")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                );
            }
        }
        settle().await;
        elapsed += interval;
        clock.set(EPOCH_MS + elapsed);
        tokio::time::advance(Duration::from_millis(interval)).await;
        settle().await;
    }
    settle().await;

    running.stop();
    registry.cancel_all_and_wait(Duration::from_secs(1)).await;

    let mut records = std::mem::take(&mut *lock(&host.records));
    for r in &mut records {
        layout.unmap(r);
    }
    drop(tmp);
    Ok(records)
}
