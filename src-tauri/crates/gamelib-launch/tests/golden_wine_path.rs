//! The Rust replay of `getWinePath` (88.2-13, D-22): `wine_path` (88.1-13's `get_wine_path` behind the op's
//! argument shape) against `golden/wine_path`, the 16 cases 88.2-04 recorded from the TypeScript: the
//! `winepath` spawn (program, argv, the whole environment, cwd, no timeout, the helper class), the answer, and
//! the error line when the answer is empty.
//!
//! The wine side runs over a scripted spawn seam (`CaseRunner`) that delivers the recorded chunks in order, so
//! a difference here is the port's, not the pipe's. The count floor lives here next to the replay, so editing
//! the JSON alone cannot lower the bar.
//!
//! Differences from the TS, all in `golden/wine_path/deltas.json`: `wine-path-error-line` (the empty-answer
//! line is 88.1's fixed text, never the path or `winepath`'s standard error), `wine-path-log-lines` (the
//! `Getting wine path for <path>.` and `Running Wine command:` debug lines carry the path, and 88.1's function
//! writes neither), and `wine-path-track-and-resolve-on` (88.1's function runs through 87's
//! `run_wine_command`, which registers no tracked entry and waits with the spawn seam's own drain).

mod common;

use std::sync::Arc;

use common::*;
use gamelib_engine::ctx::Platform;
use gamelib_engine::testing::RecordingLog;
use gamelib_launch::runner::wine_path::{wine_path, WinePathArgs};
use gamelib_wine::wine_cmd::env::EnvSnapshot;
use gamelib_wine::wine_cmd::WineHost;
use serde::Deserialize;
use serde_json::{json, Value};

/// The cases of `golden/wine_path` this file compares. A later edit may raise this, never lower it.
const WINE_PATH_FLOOR: usize = 16;

/// The one line an empty answer logs: 88.1's fixed text (`wine-path-error-line`).
const FIXED_ERROR_LINE: &str = "Couldn't get wine path";

const PREFIX: &str = "<HOME>/Games/prefix";

#[derive(Debug, Clone, Deserialize)]
struct Setup {
    kind: String,
    #[serde(default)]
    wineserver: bool,
    #[serde(default, rename = "missingBin")]
    missing_bin: bool,
}

impl Setup {
    fn wine_dir(&self) -> &'static str {
        match self.kind.as_str() {
            "wine" => "<TOOLS>/wine/Wine-9",
            "proton-umu" | "proton" => "<TOOLS>/proton/GE-Proton9-1",
            "crossover" => "<TOOLS>/crossover",
            "toolkit" => "<TOOLS>/toolkit",
            other => panic!("unknown wine kind {other}"),
        }
    }

    fn bin(&self) -> String {
        let dir = self.wine_dir();
        match self.kind.as_str() {
            "wine" | "crossover" => format!("{dir}/bin/wine"),
            "toolkit" => format!("{dir}/bin/wine64"),
            _ => format!("{dir}/proton"),
        }
    }

    fn wineserver_path(&self) -> String {
        let dir = self.wine_dir();
        match self.kind.as_str() {
            "proton-umu" | "proton" => format!("{dir}/files/bin/wineserver"),
            _ => format!("{dir}/bin/wineserver"),
        }
    }

    fn has_wineserver(&self) -> bool {
        self.kind == "wine" || self.wineserver
    }

    fn name(&self) -> &'static str {
        match self.kind.as_str() {
            "wine" => "Wine-9",
            "proton-umu" | "proton" => "GE-Proton9-1",
            "crossover" => "CrossOver-24",
            "toolkit" => "GPTK-2",
            other => panic!("unknown wine kind {other}"),
        }
    }

    fn platform(&self) -> Platform {
        if self.kind == "crossover" || self.kind == "toolkit" {
            Platform::Mac
        } else {
            Platform::Linux
        }
    }

    /// The `GameSettings` fields the env builders and the runner read, placeholders unexpanded.
    fn settings(&self) -> Value {
        let mut wine_version = json!({
            "type": if self.kind.starts_with("proton") { "proton" } else { self.kind.as_str() },
            "name": self.name(),
            "bin": self.bin(),
        });
        if self.has_wineserver() {
            wine_version["wineserver"] = json!(self.wineserver_path());
        }
        if self.kind == "wine" {
            wine_version["lib"] = json!(format!("{}/lib64", self.wine_dir()));
            wine_version["lib32"] = json!(format!("{}/lib", self.wine_dir()));
        }
        json!({
            "nvidiaPrime": false,
            "showFps": false,
            "enviromentOptions": [{ "key": "MY_VAR", "value": "\"quoted value\"" }],
            "winePrefix": PREFIX,
            "wineCrossoverBottle": if self.kind == "crossover" { "bottle-1" } else { "" },
            "enableDXVKFpsLimit": false,
            "DXVKFpsCap": "60",
            "enableFSR": false,
            "enableEsync": false,
            "enableMsync": false,
            "enableFsync": false,
            "enableWineWayland": false,
            "enableHDR": false,
            "enableWoW64": false,
            "autoInstallDxvkNvapi": false,
            "eacRuntime": false,
            "battlEyeRuntime": false,
            "verboseLogs": false,
            "preferSystemLibs": false,
            "advertiseAvxForRosetta": false,
            "disableUMU": self.kind != "proton-umu",
            "wineVersion": wine_version,
        })
    }

    /// The files a case starts from: the installation, and the prefix `runWineCommand` checks for.
    fn seed(&self) -> Value {
        let mut seed: Vec<Value> = Vec::new();
        if !self.missing_bin {
            seed.push(json!({ "path": self.bin(), "text": "" }));
        }
        if self.has_wineserver() {
            seed.push(json!({ "path": self.wineserver_path(), "text": "" }));
        }
        if self.kind == "crossover" {
            return Value::Array(seed);
        }
        let regs = |base: &str| -> Vec<Value> {
            vec![
                json!({ "path": format!("{base}/dosdevices"), "dir": true }),
                json!({ "path": format!("{base}/drive_c"), "dir": true }),
                json!({ "path": format!("{base}/system.reg"), "text": "" }),
                json!({ "path": format!("{base}/user.reg"), "text": "" }),
                json!({ "path": format!("{base}/userdef.reg"), "text": "" }),
            ]
        };
        if self.kind.starts_with("proton") {
            for file in ["pfx.lock", "tracked_files", "version", "config_info"] {
                seed.push(json!({ "path": format!("{PREFIX}/{file}"), "text": "" }));
            }
            seed.extend(regs(&format!("{PREFIX}/pfx")));
        } else {
            seed.extend(regs(PREFIX));
        }
        if self.kind == "proton-umu" {
            // The file `getUmuPath` falls back to, so the install is umu-supported.
            seed.push(json!({ "path": "<TOOLS>/runtimes/umu/umu_run.py", "text": "" }));
        }
        Value::Array(seed)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    id: String,
    call_site: String,
    setup: Setup,
    path: String,
    variant: String,
    #[serde(default)]
    process_env: std::collections::BTreeMap<String, String>,
    script: Vec<Step>,
}

fn cases() -> Vec<Case> {
    let path = fixtures().join("golden/wine_path/cases.json");
    serde_json::from_slice(&std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

fn replay(case: &Case) -> Result<(), String> {
    let id = &case.id;
    let expected = fixtures().join("golden/wine_path/expected").join(id);
    let rig = Rig::new();
    rig.seed(&case.setup.seed());
    let class = class_of(&case.call_site);
    let runner = Arc::new(CaseRunner::new(case.script.clone()));
    let engine_log = Arc::new(RecordingLog::new());
    let ctx = rig.launch_ctx(case.setup.platform(), runner.clone(), engine_log.clone());

    let mut env = rig.pinned_env();
    env.extend(case.process_env.clone());
    let host = WineHost {
        env: EnvSnapshot::from_pairs(env),
        // The TS oracle's validWine stand-in checks file existence only and skips the Sonoma rule.
        darwin_release: (case.setup.platform() == Platform::Mac).then(|| "24.1.0".to_string()),
        ..WineHost::default()
    };
    let call = rig.expand_deep(&json!({
        "path": case.path,
        "gameSettings": case.setup.settings(),
        "variant": case.variant,
    }));
    let args: WinePathArgs =
        serde_json::from_value(call).map_err(|e| format!("{id}: the call does not decode: {e}"))?;

    let rt = runtime();
    let answer = rt.block_on(wine_path(&ctx, args, &host));
    drop(rt);
    if runner.unused() > 0 {
        return Err(format!("{id}: a scripted spawn never happened"));
    }

    // result.json
    let want = read_json(&expected.join("result.json"));
    if json!(answer) != want["answer"] {
        return Err(format!(
            "{id}: the answer is {answer:?}, want {}",
            want["answer"]
        ));
    }

    // spawns.json: what the child was given (the tracked key and `resolveOn` are the
    // `wine-path-track-and-resolve-on` delta).
    let want_spawns = read_json(&expected.join("spawns.json"));
    let want_spawns = want_spawns.as_array().cloned().unwrap_or_default();
    let specs = lock(&runner.specs).clone();
    if specs.len() != want_spawns.len() {
        return Err(format!(
            "{id}: {} spawns, want {}",
            specs.len(),
            want_spawns.len()
        ));
    }
    for (index, (spec, want)) in specs.iter().zip(&want_spawns).enumerate() {
        let env: std::collections::BTreeMap<String, String> = spec.env.iter().cloned().collect();
        let got = rig.normalise(json!({
            "program": spec.program,
            "argv": spec.argv,
            "env": env,
            "cwd": spec.cwd.as_ref().map(|c| c.to_string_lossy().into_owned()),
            "replaceEnv": spec.replace_env,
            "timeoutMs": spec.timeout.map(|t| t.as_millis() as u64),
            "windowsHide": spec.hide_window,
            "class": class,
        }));
        let wanted = json!({
            "program": want["program"],
            "argv": want["argv"],
            "env": want["env"],
            "cwd": want["cwd"],
            "replaceEnv": want["replaceEnv"],
            "timeoutMs": want["timeoutMs"],
            "windowsHide": want["windowsHide"],
            "class": want["class"],
        });
        if got != wanted {
            return Err(format!("{id}: spawn {index} is {got}, want {wanted}"));
        }
    }

    // events.json: the error line is the fixed text (`wine-path-error-line`); the two debug lines are not
    // written (`wine-path-log-lines`). Nothing else is logged at warning or above.
    let want_events = read_json(&expected.join("events.json"));
    let want_error = want_events
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .any(|e| e["level"] == "error");
    let lines: Vec<(String, String)> = engine_log
        .lines()
        .into_iter()
        .filter(|(level, _)| *level == "warn" || *level == "error")
        .map(|(level, text)| (level.to_string(), text))
        .collect();
    let want_lines: Vec<(String, String)> = if want_error {
        vec![("error".to_string(), FIXED_ERROR_LINE.to_string())]
    } else {
        Vec::new()
    };
    if lines != want_lines {
        return Err(format!("{id}: logged {lines:?}, want {want_lines:?}"));
    }
    // The fixed line names neither the path asked about nor winepath's own output.
    let secret: &str = &case.path;
    if lines.iter().any(|(_, text)| text.contains(secret)) {
        return Err(format!("{id}: an error line carries the path"));
    }
    Ok(())
}

fn compared(cases: &[Case], floor: usize) -> Result<usize, String> {
    let mut count = 0;
    let mut failures = Vec::new();
    for case in cases {
        match replay(case) {
            Ok(()) => count += 1,
            Err(e) => failures.push(e),
        }
    }
    if !failures.is_empty() {
        return Err(failures.join("\n"));
    }
    check_floor("golden_wine_path", count, floor)?;
    Ok(count)
}

#[test]
fn every_wine_path_golden_replays_through_the_op() {
    let all = cases();
    let manifest = read_json(&fixtures().join("golden/wine_path/MANIFEST.json"));
    assert_eq!(manifest["count"], json!(all.len()));
    let n = compared(&all, WINE_PATH_FLOOR).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(n, all.len());
    assert_eq!(all.len(), manifest["floor"].as_u64().unwrap() as usize);
    println!("golden_wine_path compared {n} floor {WINE_PATH_FLOOR}");
}

/// A changed answer fails the replay: the guard that the comparison compares.
#[test]
fn a_replay_with_a_changed_answer_fails() {
    let mut case = cases()
        .into_iter()
        .find(|c| c.id == "wine-path-wine-unix")
        .expect("case");
    case.script[0].chunks[0].text = "/somewhere/else\n".to_string();
    assert!(replay(&case).is_err());
}

/// `wine-path-error-line`, `wine-path-log-lines` and `wine-path-track-and-resolve-on` are named with a reason.
#[test]
fn the_deltas_file_names_each_delta_with_a_reason() {
    let deltas = read_json(&fixtures().join("golden/wine_path/deltas.json"));
    for key in [
        "wine-path-error-line",
        "wine-path-log-lines",
        "wine-path-track-and-resolve-on",
    ] {
        assert!(
            deltas[key].as_str().is_some_and(|t| t.len() > 40),
            "wine_path/deltas.json lacks a reason for {key}"
        );
    }
}
