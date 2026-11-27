//! The macOS `run.sh` single-quotes the percent-encoded launch URL (T-34.5-C6-17). JavaScript's
//! `encodeURIComponent` leaves `'` alone, so an app name or runner holding an apostrophe used to close
//! those single quotes early and the shortcut stopped launching (todo
//! 2026-11-24-macos-shortcut-run-sh-breaks-on-single-quote-in-app-name). `run_sh_url` in `mac.rs` now
//! writes `'` as `%27`; these tests prove the written script end to end, over the hostile names the
//! goldens use.
//!
//! Three checks, each over every case:
//!
//! - the command line holds exactly two `'` (the pair around the URL), and the URL between them decodes,
//!   with form-urlencoded rules (the algorithm `URLSearchParams.get` applies at `src/backend/protocol.ts`
//!   lines 172-173), back to the original app name and runner;
//! - the script parses under `/bin/sh -n` and `/bin/bash -n`;
//! - the shell hands the shortcut executable exactly two arguments, `--no-gui` and one URL. This is the
//!   check that cannot be dropped: a balanced pair of apostrophes (`Rock'n'Roll`) parses cleanly, yet the
//!   shell quietly removes them and delivers `appName=RocknRoll`. Only the delivered argv sees that.
//!
//! Spawns are short synchronous probes, so they stay on `Command::output()` as the spawn convention
//! allows (`gamelib-launch/tests/spawn_async_real.rs`, `alive()`). None of them depends on the operator's
//! profile, so each runs with a cleared environment plus a fresh `FakeHome` (the two-profile rule's
//! isolated half; nothing here arms only under a populated profile, so there is no real-profile arm).

// The two spawn tests are Unix-only, so on Windows their helpers are unused.
#![cfg_attr(not(unix), allow(dead_code, unused_imports))]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use gamelib_shortcuts::ctx::ShortcutPaths;
use gamelib_shortcuts::mac::write_mac_app;
use gamelib_testutil::FakeHome;
use url::Url;

/// One written bundle over a fresh fake profile.
struct Written {
    home: FakeHome,
    run_sh: PathBuf,
    shell_exe: PathBuf,
}

fn write_case(app_name: &str, runner: &str) -> Written {
    let home = FakeHome::new("gamelib-shortcuts-quote-");
    let root = home.root().to_path_buf();
    let paths = ShortcutPaths {
        user_home: root.clone(),
        app_data: Some(root.join("AppData").join("Roaming")),
        desktop_dir: Some(root.join("Desktop")),
        icon_folder: root.join(".config").join("GameLib").join("icons"),
        shell_exe: root.join("shell-exe"),
        cwd: root.clone(),
    };
    let shell_exe = root.join("shell-exe");
    let written = write_mac_app(&paths, "Quote Test", app_name, runner, &shell_exe, None)
        .expect("the bundle is written");
    let run_sh = written.bundle.join("Contents").join("MacOS").join("run.sh");
    Written {
        home,
        run_sh,
        shell_exe,
    }
}

/// The app name the `darwin-everything-*` goldens use, copied from the golden and not retyped.
fn everything_app_name() -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("golden")
        .join("text")
        .join("darwin-everything-gog.json");
    let case: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(path).expect("the golden is readable"))
            .expect("the golden is JSON");
    case["input"]["appName"]
        .as_str()
        .expect("an appName")
        .to_string()
}

/// (app name, runner) for every case. The last is the control: it passes at HEAD and after the fix.
fn cases() -> Vec<(String, String)> {
    vec![
        ("a'b'; touch pwned; '".into(), "legendary".into()),
        ("plainapp".into(), "a'b\"c".into()),
        ("Rock'n'Roll".into(), "legendary".into()),
        (everything_app_name(), "gog".into()),
        ("O'".into(), "sideload".into()),
        ("plainapp".into(), "legendary".into()),
    ]
}

/// The `run.sh` line holding the command.
fn command_line(run_sh: &Path) -> String {
    let text = fs::read_to_string(run_sh).expect("run.sh is readable");
    text.lines()
        .find(|line| line.contains("--no-gui"))
        .unwrap_or_else(|| panic!("no --no-gui line in {text:?}"))
        .to_string()
}

/// `url` decoded into its two query values, which must be `appName` then `runner` and nothing else.
fn url_problem(url: &str, app_name: &str, runner: &str) -> Option<String> {
    let parsed = match Url::parse(url) {
        Ok(parsed) => parsed,
        Err(e) => return Some(format!("{url:?} is not a URL: {e}")),
    };
    let pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    let want = vec![
        ("appName".to_string(), app_name.to_string()),
        ("runner".to_string(), runner.to_string()),
    ];
    (pairs != want)
        .then(|| format!("the URL {url:?} does not decode back to the inputs: {pairs:?}"))
}

/// Runs `check` over every case and fails once, naming every case that did not hold.
fn over_every_case(check: impl Fn(&str, &str) -> Result<(), String>) {
    let failures: Vec<String> = cases()
        .iter()
        .filter_map(|(app_name, runner)| {
            check(app_name, runner)
                .err()
                .map(|why| format!("{app_name:?} / {runner:?}: {why}"))
        })
        .collect();
    assert!(
        failures.is_empty(),
        "{} of {} cases failed:\n{}",
        failures.len(),
        cases().len(),
        failures.join("\n")
    );
}

/// A short synchronous probe (the spawn convention's `output()` arm, as `alive()` in
/// `gamelib-launch/tests/spawn_async_real.rs`): a cleared environment plus this case's fake profile.
#[cfg(unix)]
fn probe(shell: &str, args: &[&Path], home: &FakeHome, flag: Option<&str>) -> Output {
    let mut cmd = Command::new(shell);
    if let Some(flag) = flag {
        cmd.arg(flag);
    }
    cmd.args(args).env_clear();
    home.apply(&mut cmd);
    cmd.current_dir(home.root())
        .output()
        .unwrap_or_else(|e| panic!("{shell} did not run: {e}"))
}

/// `Some(why)` when `shell -n` rejects the script.
#[cfg(unix)]
fn parse_problem(shell: &str, written: &Written) -> Option<String> {
    let out = probe(shell, &[&written.run_sh], &written.home, Some("-n"));
    (!out.status.success() || !out.stderr.is_empty()).then(|| {
        format!(
            "{shell} -n rejected the run.sh: {:?} {:?}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        )
    })
}

#[test]
fn the_command_line_holds_one_single_quoted_url_that_decodes_to_the_inputs() {
    over_every_case(|app_name, runner| {
        let written = write_case(app_name, runner);
        let line = command_line(&written.run_sh);
        let quotes = line.matches('\'').count();
        if quotes != 2 {
            return Err(format!(
                "the command line holds {quotes} quotes, not the pair around the URL: {line:?}"
            ));
        }
        let url = line.split('\'').nth(1).expect("text between the quotes");
        if !url.starts_with("gamelib://launch?") {
            return Err(format!("unexpected URL {url:?}"));
        }
        url_problem(url, app_name, runner).map_or(Ok(()), Err)
    });
}

#[cfg(unix)]
#[test]
fn run_sh_parses_under_sh_and_bash() {
    over_every_case(|app_name, runner| {
        let written = write_case(app_name, runner);
        for shell in ["/bin/sh", "/bin/bash"] {
            if let Some(why) = parse_problem(shell, &written) {
                return Err(why);
            }
        }
        Ok(())
    });
}

#[cfg(unix)]
#[test]
fn the_shell_hands_the_shortcut_exactly_one_url_argument() {
    use std::os::unix::fs::PermissionsExt;
    over_every_case(|app_name, runner| {
        let written = write_case(app_name, runner);

        // Parse first: a script that does not parse is never executed.
        if let Some(why) = parse_problem("/bin/bash", &written) {
            return Err(format!("not run: {why}"));
        }

        // The shortcut executable, as a stub that prints each argument on its own line.
        fs::write(&written.shell_exe, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n").expect("the stub");
        fs::set_permissions(&written.shell_exe, fs::Permissions::from_mode(0o755))
            .expect("the stub is executable");

        let out = probe("/bin/bash", &[&written.run_sh], &written.home, None);
        if !out.status.success() || !out.stderr.is_empty() {
            return Err(format!(
                "run.sh failed: {:?} {:?}",
                out.status,
                String::from_utf8_lossy(&out.stderr)
            ));
        }
        let stdout = String::from_utf8(out.stdout).expect("the stub prints UTF-8");
        let args: Vec<&str> = stdout
            .strip_suffix('\n')
            .unwrap_or(&stdout)
            .split('\n')
            .collect();
        if args.len() != 2 || args[0] != "--no-gui" {
            return Err(format!("the shell delivered {args:?}"));
        }
        if let Some(why) = url_problem(args[1], app_name, runner) {
            return Err(why);
        }
        if written.home.root().join("pwned").exists() {
            return Err("the hostile name ran a command".to_string());
        }
        Ok(())
    });
}
