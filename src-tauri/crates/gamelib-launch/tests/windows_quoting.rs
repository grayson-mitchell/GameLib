//! SC1 of ROADMAP 88.2 (D-13, 88.2-14): Windows command lines against Node, with a real executable.
//!
//! The stub `gamelib-launch-cmdline-echo` prints the command line Windows started it with (`GetCommandLineW()`) and
//! its own parse of it. For each row of an argv table the test starts the stub three ways: through the Rust helper
//! spawn path (`SpecProcRunner`), through the game spawn path (`spawn_game_tracked`) and through Node's
//! `child_process.spawnSync`, and checks what each produced.
//!
//! What is asserted, and why it is not "the three command lines are byte-equal":
//!
//! 1. **The child's argv equals the argv sent, on all three paths, for every row.** This is the property that
//!    matters (T-88.2-20, argument injection): whatever a runner argument holds, the program receives exactly it.
//! 2. **The helper and the game path build the same command line**, byte for byte: both are Rust's `std` quoting.
//! 3. **Rust and Node build the same command line** (the part after the program name) for every row with no `"`
//!    in it. The program name is left out: Rust always wraps it in quotes, libuv only when it needs them, so
//!    `"C:\x\echo.exe" a` and `C:\x\echo.exe a` are one command line to every program. For a row WITH a `"`
//!    the two quote differently by design (libuv wraps the whole argument in quotes and escapes inside, Rust
//!    escapes in place: `"a\"b"` against `a\"b`); the CRT parses both to the same argument, which is what (1)
//!    asserts. Those rows are printed with both command lines, so a reviewer sees the difference, and are not
//!    compared byte for byte. The difference is recorded in the D-20 todo for the Windows runtime differences.
//!
//! Batch files (`.bat`, `.cmd`, assumption A4): Node 18.20.2 and later refuses to start one without a shell
//! (`spawn EINVAL`), Rust's std runs it through cmd.exe. The same table is run against `echo.bat` and `echo.cmd`;
//! the test records, per row, what Node did and what Rust's std did, asserts that Node refuses every row (the
//! refusal depends on the file's extension, not its arguments), and that `call_runner`'s direct path refuses a
//! `.bat` or `.cmd` with exactly the message Node threw, so the outcome of a call is the same on both runtimes.
//!
//! No vacuous skip: when `GITHUB_ACTIONS` is set and `node` is missing the test fails; off CI it says why and
//! skips. Every child runs with the fake profile's eight variables set (never the operator's profile, D-22).
#![cfg(windows)]

mod common;

use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Arc;

use common::{runtime, Rig};
use gamelib_core::process::{ProcSpec, SpecRunner};
use gamelib_engine::ctx::Platform;
use gamelib_engine::testing::RecordingLog;
use gamelib_launch::runner::call_runner::{
    call_runner, powershell_command, RunnerCallArgs, RunnerHost, BATCH_REFUSAL,
};
use gamelib_launch::runner::stream::NullSink;
use gamelib_proc::{spawn_game_tracked, SpecProcRunner};
use serde_json::{json, Value};

const ECHO: &str = env!("CARGO_BIN_EXE_gamelib-launch-cmdline-echo");

/// Run on Node: every row through `spawnSync` against the echo stub, and every row against each batch file, then
/// the message `spawn` throws for a batch file (the TS runner's call: it throws inside a promise executor).
const NODE_SCRIPT: &str = r#"'use strict'
const { spawnSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const sync = (file, args) => {
  const r = spawnSync(file, args, { encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, error: r.error ? r.error.code : null }
}
const refusal = (file, cwd) =>
  new Promise((resolve) => {
    try {
      const child = spawn(file, ['x'], { cwd, stdio: 'ignore' })
      child.once('error', (e) => resolve(e.message))
      child.once('close', () => resolve(null))
    } catch (e) {
      resolve(e.message)
    }
  })
async function main() {
  const out = { node: process.version, exe: [], batch: {} }
  for (const row of input.rows) out.exe.push({ name: row.name, ...sync(input.exe, row.args) })
  for (const target of input.batch) {
    out.batch[target.name] = {
      rows: input.rows.map((row) => ({ name: row.name, ...sync(target.path, row.args) })),
      message: await refusal(target.name, input.dir)
    }
  }
  process.stdout.write(JSON.stringify(out))
}
main()
"#;

struct Row {
    name: &'static str,
    args: Vec<String>,
}

impl Row {
    fn new(name: &'static str, args: &[&str]) -> Row {
        Row {
            name,
            args: args.iter().map(|a| a.to_string()).collect(),
        }
    }

    fn has_quote(&self) -> bool {
        self.args.iter().any(|a| a.contains('"'))
    }
}

/// The argv table: every shape the plan names, then the PowerShell `-ArgumentList` strings `callRunner` builds.
fn rows() -> Vec<Row> {
    let parts = |words: &[&str]| words.iter().map(|w| w.to_string()).collect::<Vec<_>>();
    let mut rows = vec![
        Row::new("plain", &["alpha", "beta", "--flag=1"]),
        Row::new(
            "spaces",
            &["two words", "C:\\Program Files\\GameLib\\x.exe"],
        ),
        Row::new("embedded-quotes", &["say \"hi\"", "a\"b", "\"", "\"\""]),
        Row::new("trailing-backslash", &["C:\\dir\\", "C:\\my dir\\", "\\"]),
        Row::new(
            "backslashes-before-quote",
            &["a\\\"b", "a\\\\\"b", "\\\\\\\"", "x y\\\"z", "x y\\\\"],
        ),
        Row::new("empty-argument", &["", "after", ""]),
        Row::new("tab", &["a\tb", "\t", "x\ty z"]),
        Row::new(
            "non-ascii",
            &["caf\u{e9} \u{fc}n\u{ef}", "ゲーム", "日本 語"],
        ),
        Row::new("percent-path", &["%PATH%", "%USERPROFILE%\\x", "100%"]),
        Row::new("shell-metacharacters", &["^&|<>", "a&b", "a|b c", "(x)"]),
        Row::new("single-quote-and-backtick", &["it's", "`x`", "$env:PATH"]),
        Row::new("flags", &["--flag=value with space", "-k", "/c", "--"]),
        Row::new("long-argument", &[&"x".repeat(3000), &"y z ".repeat(200)]),
    ];
    // What callRunner hands powershell for a runner path and parts with spaces, quotes and backslashes.
    let hostile = powershell_command(
        "C:\\Program Files\\Legendary\\legendary.exe",
        &parts(&[
            "launch",
            "Game App",
            "--token",
            "a\"b",
            "C:\\path with space\\",
            "",
        ]),
    );
    rows.push(Row {
        name: "powershell-wrapper-hostile",
        args: hostile,
    });
    let plain = powershell_command("C:\\tools\\gogdl.exe", &parts(&["info", "1234"]));
    rows.push(Row {
        name: "powershell-wrapper-plain",
        args: plain,
    });
    let none = powershell_command("C:\\tools\\nile.exe", &[]);
    rows.push(Row {
        name: "powershell-wrapper-no-arguments",
        args: none,
    });
    rows
}

struct Echo {
    command_line: String,
    argv: Vec<String>,
}

fn parse_echo(text: &str) -> Echo {
    let mut lines = text.lines();
    let command_line = lines.next().expect("a command line").to_string();
    let argv = serde_json::from_str(lines.next().expect("an argv line")).expect("argv json");
    Echo { command_line, argv }
}

/// The command line after its program token (CreateProcess's rule: a leading quote ends at the next quote,
/// otherwise the token ends at the first space or tab).
fn args_part(command_line: &str) -> &str {
    let rest = match command_line.strip_prefix('"') {
        Some(after) => after.find('"').map_or("", |i| &after[i + 1..]),
        None => command_line
            .find([' ', '\t'])
            .map_or("", |i| &command_line[i..]),
    };
    rest.trim_start_matches([' ', '\t'])
}

fn env_pairs(rig: &Rig) -> Vec<(String, String)> {
    rig.home
        .env()
        .into_iter()
        .map(|(key, value)| (key.to_string(), value.to_string_lossy().into_owned()))
        .collect()
}

fn via_helper(rig: &Rig, args: &[String]) -> Echo {
    let mut spec = ProcSpec::new("cmdline-echo", ECHO);
    spec.argv = args.to_vec();
    spec.env = env_pairs(rig);
    let out = runtime().block_on(SpecProcRunner.run(spec, None));
    assert_eq!(out.code, Some(0), "{out:?}");
    parse_echo(&out.stdout)
}

fn via_game(rig: &Rig, args: &[String], tag: usize) -> Echo {
    let capture = rig.root().join(format!("game-{tag}.out"));
    let mut cmd = Command::new(ECHO);
    cmd.args(args);
    rig.home.apply(&mut cmd);
    let mut handle = spawn_game_tracked(cmd, Some(&capture)).expect("the game spawn");
    handle.wait_leader_exit().expect("the leader exits");
    let status = handle.reap_status().expect("the leader's status");
    assert!(status.success(), "{status:?}");
    parse_echo(&std::fs::read_to_string(&capture).expect("the capture file"))
}

/// Whether Node is there; on CI a missing Node is a failure, off CI a printed skip.
fn node_available() -> bool {
    let ok = Command::new("node")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if !ok {
        if std::env::var("GITHUB_ACTIONS").is_ok() {
            panic!("node is required on CI for the Windows quoting cross-check but `node --version` failed");
        }
        println!("SKIP windows_quoting: node is not installed");
    }
    ok
}

/// Writes the batch echo scripts and the Node script, runs Node once and answers its JSON.
fn run_node(rig: &Rig, rows: &[Row]) -> (Value, std::path::PathBuf) {
    let dir = rig.root().join("batch");
    std::fs::create_dir_all(&dir).unwrap();
    for name in ["echo.bat", "echo.cmd"] {
        std::fs::write(dir.join(name), "@echo %*\r\n").unwrap();
    }
    let script = rig.root().join("crosscheck.js");
    std::fs::write(&script, NODE_SCRIPT).unwrap();
    let input = rig.root().join("rows.json");
    let table: Vec<Value> = rows
        .iter()
        .map(|row| json!({ "name": row.name, "args": row.args }))
        .collect();
    let batch: Vec<Value> = ["echo.bat", "echo.cmd"]
        .iter()
        .map(|name| json!({ "name": name, "path": dir.join(name).to_string_lossy() }))
        .collect();
    std::fs::write(
        &input,
        json!({ "exe": ECHO, "rows": table, "batch": batch, "dir": dir.to_string_lossy() })
            .to_string(),
    )
    .unwrap();
    let mut cmd = Command::new("node");
    cmd.arg(&script).arg(&input).stdin(Stdio::null());
    rig.home.apply(&mut cmd);
    let out = cmd.output().expect("node runs");
    assert!(
        out.status.success(),
        "node failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let text = String::from_utf8(out.stdout).expect("node prints UTF-8");
    (serde_json::from_str(&text).expect("node prints JSON"), dir)
}

#[test]
fn rust_and_node_hand_the_child_the_same_arguments_for_every_exe_row() {
    if !node_available() {
        return;
    }
    let rig = Rig::new();
    let rows = rows();
    assert!(rows.len() >= 12, "the table holds {} rows", rows.len());
    let (node, _dir) = run_node(&rig, &rows);
    println!("node {}", node["node"]);

    let mut failures: Vec<String> = Vec::new();
    for (index, row) in rows.iter().enumerate() {
        let helper = via_helper(&rig, &row.args);
        let game = via_game(&rig, &row.args, index);
        let theirs = &node["exe"][index];
        if theirs["error"] != Value::Null || theirs["status"] != json!(0) {
            failures.push(format!(
                "{}: node could not run the stub: {theirs}",
                row.name
            ));
            continue;
        }
        let node_echo = parse_echo(theirs["stdout"].as_str().unwrap_or_default());

        // (1) The child receives exactly the arguments sent, on every path.
        for (path, echo) in [("helper", &helper), ("game", &game), ("node", &node_echo)] {
            if echo.argv != row.args {
                failures.push(format!(
                    "{}: the {path} path handed the child {:?}, want {:?} (command line {:?})",
                    row.name, echo.argv, row.args, echo.command_line
                ));
            }
        }
        // (2) The two Rust paths build one command line.
        if args_part(&helper.command_line) != args_part(&game.command_line) {
            failures.push(format!(
                "{}: helper {:?} and game {:?} command lines differ",
                row.name, helper.command_line, game.command_line
            ));
        }
        // (3) Rust and Node agree byte for byte where no quote is involved; otherwise print both.
        let (rust, theirs_line) = (
            args_part(&helper.command_line),
            args_part(&node_echo.command_line),
        );
        if row.has_quote() {
            println!(
                "{}: rust {rust:?} | node {theirs_line:?}{}",
                row.name,
                if rust == theirs_line {
                    " (equal)"
                } else {
                    " (differ: both parse to the same argv)"
                }
            );
        } else if rust != theirs_line {
            failures.push(format!(
                "{}: rust built {rust:?}, node built {theirs_line:?}",
                row.name
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn windows_call(bin: &str, dir: &Path, class: &str) -> RunnerCallArgs {
    serde_json::from_value(json!({
        "commandParts": ["x"],
        "runner": {
            "name": "sideload",
            "bin": bin,
            "dir": dir.to_string_lossy(),
            "logPrefix": "Sideload",
        },
        "abortId": "windows-quoting",
        "spawnClass": class,
        "skipErrorHandler": true,
    }))
    .expect("a call")
}

#[test]
fn batch_files_are_refused_by_node_and_by_the_direct_runner_path_with_one_message() {
    if !node_available() {
        return;
    }
    let rig = Rig::new();
    let rows = rows();
    let (node, dir) = run_node(&rig, &rows);

    for name in ["echo.bat", "echo.cmd"] {
        let target = &node["batch"][name];
        let path = dir.join(name);
        // The record, per row: what Node did, and what Rust's std does with the same file and arguments.
        let mut refused = 0;
        for (index, row) in rows.iter().enumerate() {
            let theirs = &target["rows"][index];
            let rust = Command::new(&path)
                .args(&row.args)
                .stdin(Stdio::null())
                .output()
                .map(|out| format!("ran, status {:?}", out.status.code()))
                .unwrap_or_else(|e| format!("refused ({:?}: {e})", e.kind()));
            println!(
                "{name} {}: node {} | rust std {rust}",
                row.name,
                if theirs["error"] == json!("EINVAL") {
                    "refused (EINVAL)".to_string()
                } else {
                    format!("ran, status {}", theirs["status"])
                }
            );
            if theirs["error"] == json!("EINVAL") {
                refused += 1;
            }
        }
        assert_eq!(
            refused,
            rows.len(),
            "{name}: node refuses by extension, so it must refuse every row (it refused {refused} of {})",
            rows.len()
        );

        // The message Node threw, and the Rust direct path's answer to the same call.
        let message = target["message"]
            .as_str()
            .unwrap_or_else(|| panic!("{name}: node threw no message for a batch file"));
        assert_eq!(
            message, BATCH_REFUSAL,
            "node's text is the one the runner copies"
        );
        for class in ["helper", "game"] {
            let ctx = rig.launch_ctx(
                Platform::Windows,
                Arc::new(SpecProcRunner),
                Arc::new(RecordingLog::new()),
            );
            let host = RunnerHost {
                env: rig.pinned_env(),
                path: String::new(),
            };
            let result = runtime().block_on(call_runner(
                &ctx,
                windows_call(name, &dir, class),
                &host,
                Arc::new(NullSink),
            ));
            assert_eq!(result.error.as_deref(), Some(message), "{name} {class}");
        }
    }
}
