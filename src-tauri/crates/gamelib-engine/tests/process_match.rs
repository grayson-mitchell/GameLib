//! The non-Steam process match against the TS oracle's vectors (87-15 recorded `vectors/process_match.json`,
//! 87-44 ported the listing and the line parse, 87-51 ports the prefixes, the match and the watch; D-08).
//!
//! The vectors pin five things, each replayed here over the Rust function that replaced the TS one:
//! - `prefixes`: every lowercased form (unix path, `Z:`, `Y:` under home, `C:` under the bottle's `drive_c`)
//!   a command line can carry, for an install path, a home and a bottle dir;
//! - `prefix`: the unix form alone;
//! - `parsePsLine`: one `ps -axo pid=,command=` or `pgrep -lf .` line into a pid and a command;
//! - `match`: one polled listing against an install path: whether a watcher is wanted at all, whether a
//!   process matched and which pid was seen first;
//! - `listing`: the `ps` then `pgrep` fallback through the one spawn seam.
//!
//! The vectors say nothing about time, so the incident tests of the TS `gameProcessWatch.test.ts` that are
//! about behaviour are ported below over the real watch task on a paused clock: a match on the third poll
//! ends the watch once, a stopped watch never polls again, the 20-failure and the cap give-ups, a path with
//! no usable form starts nothing, and a quit ends a watch with no callback. The TS tests that only counted
//! `unref()` calls on fake timer handles inspected the sidecar's own timers and have no Rust meaning: the
//! watch is a tokio task that ends with the shutdown token, which the quit test asserts.
//!
//! A count floor lives here beside the replay, so editing the JSON alone cannot lower the bar, and an empty
//! vector list fails. POSIX only, as the rest of the engine's golden tests are.
#![cfg(unix)]

mod common;

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};
use gamelib_engine::ctx::EngineCtx;
use gamelib_engine::launch::process_listing::{list_processes_via, parse_ps_line};
use gamelib_engine::launch::watch::{
    self, derive_game_process_prefix, derive_game_process_prefixes, first_match_pid, GiveUp,
    WatchArgs, WatchEnd,
};
use gamelib_engine::testing::RecordingLog;
use serde_json::{json, Value};

use common::{check_floor, fixtures, read_json, Profile};

/// How many vectors the oracle recorded; a later edit may raise it, never lower it.
const VECTOR_FLOOR: usize = 70;

fn vectors() -> Value {
    read_json(&fixtures().join("vectors/process_match.json"))
}

fn list<'a>(vectors: &'a Value, name: &str) -> &'a Vec<Value> {
    vectors[name].as_array().unwrap_or_else(|| panic!("{name}"))
}

fn text<'a>(vector: &'a Value, key: &str) -> Option<&'a str> {
    vector.get(key).and_then(Value::as_str)
}

#[test]
fn every_prefix_vector_derives_the_same_forms() {
    let all = vectors();
    for vector in list(&all, "prefixes") {
        let id = vector["id"].as_str().unwrap();
        let got = derive_game_process_prefixes(
            vector["installPath"].as_str().unwrap(),
            vector["home"].as_str().unwrap(),
            text(vector, "bottleDir"),
        );
        assert_eq!(json!(got), vector["expected"], "{id}");
    }
    for vector in list(&all, "prefix") {
        let id = vector["id"].as_str().unwrap();
        let got = derive_game_process_prefix(vector["installPath"].as_str().unwrap());
        assert_eq!(json!(got), vector["expected"], "{id}");
    }
}

#[test]
fn every_ps_line_vector_parses_to_the_same_pid_and_command() {
    let all = vectors();
    for vector in list(&all, "parsePsLine") {
        let id = vector["id"].as_str().unwrap();
        let got = parse_ps_line(vector["line"].as_str().unwrap()).map_or(
            Value::Null,
            |(pid, command)| json!({"pid": pid, "command": command}),
        );
        assert_eq!(got, vector["expected"], "{id}");
    }
}

#[test]
fn every_match_vector_watches_and_matches_as_the_oracle_did() {
    let all = vectors();
    for vector in list(&all, "match") {
        let id = vector["id"].as_str().unwrap();
        let prefixes = derive_game_process_prefixes(
            vector["installPath"].as_str().unwrap(),
            vector["home"].as_str().unwrap(),
            text(vector, "bottleDir"),
        );
        // No usable form means no watcher at all (the TS returned `null`).
        let watching = !prefixes.is_empty();
        let pid = if watching {
            first_match_pid(vector["listing"].as_str().unwrap(), &prefixes)
        } else {
            None
        };
        let got = json!({"watching": watching, "matched": pid.is_some(), "pid": pid});
        assert_eq!(got, vector["expected"], "{id}");
    }
}

/// The spawn seam of the listing vectors: each spawn takes the next scripted step, and a missing or
/// failing step is a program that could not run.
struct ScriptedListing {
    steps: Mutex<Vec<(String, bool, String)>>,
    spawned: Mutex<Vec<(String, Vec<String>)>>,
}

impl SpecRunner for ScriptedListing {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        self.spawned
            .lock()
            .unwrap()
            .push((spec.program.clone(), spec.argv.clone()));
        let step = {
            let mut steps = self.steps.lock().unwrap();
            (!steps.is_empty()).then(|| steps.remove(0))
        };
        let output = match step {
            Some((_, true, stdout)) => SpecOutput {
                code: Some(0),
                stdout,
                ..SpecOutput::default()
            },
            _ => SpecOutput::default(),
        };
        Box::pin(async move { output })
    }
}

#[tokio::test]
async fn every_listing_vector_asks_ps_then_pgrep_as_the_oracle_did() {
    let all = vectors();
    for vector in list(&all, "listing") {
        let id = vector["id"].as_str().unwrap();
        let steps = vector["script"]
            .as_array()
            .unwrap()
            .iter()
            .map(|step| {
                (
                    step["cmd"].as_str().unwrap().to_string(),
                    step["outcome"].as_str() == Some("ok"),
                    step["stdout"].as_str().unwrap_or_default().to_string(),
                )
            })
            .collect();
        let runner = ScriptedListing {
            steps: Mutex::new(steps),
            spawned: Mutex::new(Vec::new()),
        };
        let result = list_processes_via(&runner).await;
        let spawned: Vec<Value> = runner
            .spawned
            .lock()
            .unwrap()
            .iter()
            .map(|(program, argv)| json!({"cmd": program, "args": argv}))
            .collect();
        let want = &vector["expected"];
        assert_eq!(json!(spawned), want["spawned"], "{id}: the spawns");
        match (&result, want.get("stdout"), want.get("threw")) {
            (Ok(stdout), Some(expected), _) => assert_eq!(&json!(stdout), expected, "{id}"),
            // The ps error is the one that reaches the caller. The oracle's scripted failure said
            // `ps failed`; a real one has no stderr, so it says `ps did not run`.
            (Err(message), _, Some(threw)) => {
                assert_eq!(threw, "ps failed", "{id}");
                assert_eq!(message, "ps did not run", "{id}");
            }
            other => panic!("{id}: {other:?}"),
        }
    }
}

#[test]
fn the_vectors_are_counted_unique_and_an_empty_list_fails_the_floor() {
    let all = vectors();
    let mut total = 0;
    for name in ["prefixes", "prefix", "parsePsLine", "match", "listing"] {
        let ids: Vec<&str> = list(&all, name)
            .iter()
            .map(|v| v["id"].as_str().unwrap())
            .collect();
        assert_eq!(
            ids.iter().collect::<BTreeSet<_>>().len(),
            ids.len(),
            "{name}: unique ids"
        );
        check_floor(name, ids.len(), 1).unwrap();
        total += ids.len();
    }
    check_floor("process match vectors", total, VECTOR_FLOOR).unwrap();
    assert!(check_floor("process match vectors", 0, VECTOR_FLOOR).is_err());
    assert!(check_floor("process match vectors", VECTOR_FLOOR - 1, VECTOR_FLOOR).is_err());
}

/// The verdicts are asserted here as well as replayed: a form that stopped matching fails this test even if
/// the vector file were rewritten in the same change.
#[test]
fn each_match_form_the_plan_names_has_the_verdict_its_form_says() {
    let all = vectors();
    let verdict = |id: &str| -> (bool, bool) {
        let vector = list(&all, "match")
            .iter()
            .find(|v| v["id"] == id)
            .unwrap_or_else(|| panic!("no vector {id}"));
        (
            vector["expected"]["watching"].as_bool().unwrap(),
            vector["expected"]["matched"].as_bool().unwrap(),
        )
    };
    for id in [
        "unix-path-start-of-command",
        "unix-path-later-argument-after-space",
        "z-drive-form",
        "z-drive-form-case-insensitive",
        "y-drive-form-under-home",
        "c-drive-form-under-the-bottle",
        "unix-path-case-insensitive",
        "install-path-with-trailing-slash",
    ] {
        assert_eq!(verdict(id), (true, true), "{id}");
    }
    for id in [
        "trailing-separator-keeps-a-sibling-apart",
        "basename-only-is-unmatchable",
        "unix-path-glued-to-a-longer-path-is-not-a-match",
        "y-drive-form-not-derived-outside-home",
        "c-drive-form-without-a-bottle-is-not-derived",
    ] {
        assert_eq!(verdict(id), (true, false), "{id}");
    }
    for id in [
        "relative-install-path-is-not-watched",
        "empty-install-path-is-not-watched",
        "root-install-path-is-not-watched",
    ] {
        assert_eq!(verdict(id), (false, false), "{id}");
    }
}

// ---- the watch task, on a paused clock ----

const INSTALL: &str = "/Users/u/Games/Avernum 4";

/// A `ps` that answers the next listing of its script on each spawn (the last repeats), and fails for an
/// `Err` item; `pgrep` always fails, as it does when `ps` could not run.
struct PsScript {
    items: Vec<Result<String, ()>>,
    polls: AtomicUsize,
}

impl SpecRunner for PsScript {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let output = if spec.program == "ps" {
            let n = self.polls.fetch_add(1, Ordering::SeqCst);
            match &self.items[n.min(self.items.len() - 1)] {
                Ok(stdout) => SpecOutput {
                    code: Some(0),
                    stdout: stdout.clone(),
                    ..SpecOutput::default()
                },
                Err(()) => SpecOutput::default(),
            }
        } else {
            SpecOutput::default()
        };
        Box::pin(async move { output })
    }
}

struct Watch {
    ctx: Arc<EngineCtx>,
    runner: Arc<PsScript>,
    log: Arc<RecordingLog>,
    ends: Arc<Mutex<Vec<WatchEnd>>>,
    _profile: Profile,
}

impl Watch {
    fn new(items: Vec<Result<String, ()>>) -> Watch {
        let profile = Profile::new();
        let runner = Arc::new(PsScript {
            items,
            polls: AtomicUsize::new(0),
        });
        let log = Arc::new(RecordingLog::new());
        let ctx = profile.ctx_with(log.clone(), Some(runner.clone())).share();
        Watch {
            ctx,
            runner,
            log,
            ends: Arc::new(Mutex::new(Vec::new())),
            _profile: profile,
        }
    }

    fn polls(&self) -> usize {
        self.runner.polls.load(Ordering::SeqCst)
    }

    fn ends(&self) -> Vec<WatchEnd> {
        self.ends.lock().unwrap().clone()
    }

    fn lines(&self) -> Vec<String> {
        self.log.lines().into_iter().map(|(_, l)| l).collect()
    }

    /// Starts the watch of `key` over `install`, recording how it ends.
    async fn start(&self, key: &str, args: &WatchArgs) -> bool {
        let ends = self.ends.clone();
        let started = watch::start(&self.ctx, key, args, move |end| {
            ends.lock().unwrap().push(end);
        });
        settle().await;
        started
    }
}

async fn settle() {
    for _ in 0..6 {
        tokio::task::yield_now().await;
    }
}

/// Moves the paused clock `ms` forward, 100 ms at a time so each timer's task runs in order.
async fn pass(ms: u64) {
    let mut left = ms;
    while left > 0 {
        let chunk = left.min(100);
        tokio::time::advance(Duration::from_millis(chunk)).await;
        settle().await;
        left -= chunk;
    }
}

fn args(install: &str) -> WatchArgs {
    WatchArgs::new(install, None)
}

fn ps(pid: u32, command: &str) -> String {
    format!("  {pid} {command}\n")
}

#[tokio::test(start_paused = true)]
async fn a_match_on_the_third_poll_reports_the_pid_once_and_ends_the_watch() {
    let w = Watch::new(vec![
        Ok(ps(1, "/bin/sh")),
        Ok(ps(1, "/bin/sh")),
        Ok(format!(
            "{}{}",
            ps(1, "/bin/sh"),
            ps(4242, &format!("Z:{}\\Game.exe", INSTALL.replace('/', "\\")))
        )),
    ]);
    assert!(w.start("gog:1", &args(INSTALL)).await);
    assert_eq!(w.ctx.launch_state.active_watchers(), 1);
    pass(4_500).await;
    assert_eq!(w.polls(), 3);
    assert_eq!(w.ends(), [WatchEnd::FirstMatch { pid: "4242".into() }]);
    // The watch leaves the state and polls no more.
    assert_eq!(w.ctx.launch_state.active_watchers(), 0);
    pass(60_000).await;
    assert_eq!(w.polls(), 3);
    assert_eq!(w.ends().len(), 1);
    assert!(w
        .lines()
        .contains(&"gameProcessWatch: game process seen (pid 4242)".to_string()));
    // The pid only: no other process's command line reaches the log.
    assert!(!w.lines().iter().any(|l| l.contains("/bin/sh")));
    assert!(w.ctx.shutdown.drain(Duration::ZERO).is_empty());
}

#[tokio::test(start_paused = true)]
async fn the_gptk_argument_form_and_the_z_and_c_forms_match_and_a_sibling_does_not() {
    let gptk = Watch::new(vec![Ok(ps(
        7,
        "wine64-preloader /w/bin/wine64 /Users/u/Games/Avernum 4/Game.exe",
    ))]);
    gptk.start("gog:1", &args(INSTALL)).await;
    pass(1_500).await;
    assert_eq!(gptk.ends(), [WatchEnd::FirstMatch { pid: "7".into() }]);

    let bottle = "/Users/u/Library/Application Support/CrossOver/Bottles/B";
    let install = format!("{bottle}/drive_c/Program Files/Game");
    let with_bottle = WatchArgs::new(&install, Some(bottle));
    let hit = Watch::new(vec![Ok(ps(123, "C:\\Program Files\\Game\\Game.exe"))]);
    hit.start("gog:1", &with_bottle).await;
    pass(1_500).await;
    assert_eq!(hit.ends(), [WatchEnd::FirstMatch { pid: "123".into() }]);

    let miss = Watch::new(vec![Ok(ps(
        124,
        "C:\\Program Files\\Game Remastered\\x.exe",
    ))]);
    miss.start("gog:1", &with_bottle).await;
    pass(3_000).await;
    assert!(miss.ends().is_empty());
    assert!(miss.polls() >= 2, "it keeps watching");
}

#[tokio::test(start_paused = true)]
async fn a_stopped_watch_never_polls_again_and_calls_nothing_back() {
    let w = Watch::new(vec![Ok(ps(1, "x"))]);
    w.start("gog:1", &args(INSTALL)).await;
    pass(1_600).await;
    assert_eq!(w.polls(), 1);
    assert!(w.ctx.launch_state.stop_watcher("gog:1"));
    settle().await;
    pass(60_000).await;
    assert_eq!(w.polls(), 1);
    assert!(w.ends().is_empty());
    assert_eq!(w.ctx.launch_state.active_watchers(), 0);
    assert!(w.ctx.shutdown.drain(Duration::ZERO).is_empty());

    // A watch stopped before its first poll never lists at all.
    let early = Watch::new(vec![Ok(ps(1, "x"))]);
    early.start("gog:1", &args(INSTALL)).await;
    early.ctx.launch_state.stop_watcher("gog:1");
    settle().await;
    pass(10_000).await;
    assert_eq!(early.polls(), 0);
    assert!(early.ends().is_empty());
}

#[tokio::test(start_paused = true)]
async fn a_second_watch_of_the_same_key_ends_the_first_without_a_callback() {
    let w = Watch::new(vec![Ok(ps(1, "x"))]);
    w.start("gog:1", &args(INSTALL)).await;
    pass(1_600).await;
    w.start("gog:1", &args(INSTALL)).await;
    assert_eq!(w.ctx.launch_state.active_watchers(), 1);
    // Only the second one lists now: 1.5 s later one more poll, not two.
    let before = w.polls();
    pass(1_500).await;
    assert_eq!(w.polls(), before + 1);
    assert!(w.ends().is_empty());
}

#[tokio::test(start_paused = true)]
async fn a_watch_gives_up_at_its_cap() {
    let w = Watch::new(vec![Ok(ps(1, "x"))]);
    let mut capped = args(INSTALL);
    capped.max_duration = Duration::from_millis(60_000);
    w.start("gog:1", &capped).await;
    pass(59_900).await;
    assert!(w.ends().is_empty());
    pass(200).await;
    assert_eq!(w.ends(), [WatchEnd::GaveUp(GiveUp::MaxDuration)]);
    assert!(w
        .lines()
        .iter()
        .any(|l| l.starts_with("gameProcessWatch: gave up (max-duration) after ")));
    assert_eq!(w.ctx.launch_state.active_watchers(), 0);
    let polls = w.polls();
    pass(10_000).await;
    assert_eq!(w.polls(), polls);
}

#[tokio::test(start_paused = true)]
async fn twenty_listing_failures_in_a_row_give_up_and_one_success_resets_the_count() {
    let w = Watch::new(vec![Err(())]);
    w.start("gog:1", &args(INSTALL)).await;
    pass(29_900).await;
    assert!(w.ends().is_empty());
    assert_eq!(w.polls(), 19);
    pass(200).await;
    assert_eq!(w.ends(), [WatchEnd::GaveUp(GiveUp::ListingFailures)]);
    assert_eq!(w.polls(), 20);
    let warned = w
        .lines()
        .iter()
        .filter(|l| l.starts_with("gameProcessWatch: process listing failed ("))
        .count();
    assert_eq!(warned, 20);
    assert!(w
        .lines()
        .contains(&"gameProcessWatch: process listing failed (20/20): ps did not run".to_string()));

    // Nineteen failures, one good listing, then failures again: the count started over, so it is still
    // watching after the 20th poll overall.
    let mut items: Vec<Result<String, ()>> = vec![Err(()); 19];
    items.push(Ok(ps(1, "x")));
    items.push(Err(()));
    let reset = Watch::new(items);
    reset.start("gog:1", &args(INSTALL)).await;
    pass(45_000).await;
    assert!(reset.ends().is_empty(), "{:?}", reset.ends());
    assert!(reset.polls() > 20);
}

#[tokio::test(start_paused = true)]
async fn a_path_with_no_usable_form_a_context_never_shared_and_a_quit_start_nothing_or_end_quietly()
{
    let w = Watch::new(vec![Ok(ps(1, "x"))]);
    for bad in ["rel", "", "/", "///"] {
        assert!(!w.start("gog:1", &args(bad)).await, "{bad:?}");
    }
    assert_eq!(w.ctx.launch_state.active_watchers(), 0);
    assert_eq!(w.polls(), 0);

    // A context nobody shared has no handle for the task to reach, so nothing starts.
    let profile = Profile::new();
    let unshared = profile.ctx(Arc::new(RecordingLog::new()));
    assert!(!watch::start(&unshared, "gog:1", &args(INSTALL), |_| {}));
    assert_eq!(unshared.launch_state.active_watchers(), 0);

    // The app quits: the watch ends with no callback and no line, and releases its registrant.
    let q = Watch::new(vec![Ok(ps(1, "x"))]);
    q.start("gog:1", &args(INSTALL)).await;
    pass(3_000).await;
    assert_eq!(q.ctx.shutdown.drain(Duration::ZERO), ["engine-watch"]);
    settle().await;
    assert!(q.ctx.shutdown.drain(Duration::ZERO).is_empty());
    let polls = q.polls();
    pass(30_000).await;
    assert_eq!(q.polls(), polls);
    assert!(q.ends().is_empty());
    assert!(!q.lines().iter().any(|l| l.contains("gave up")));
    assert_eq!(q.ctx.launch_state.active_watchers(), 0);
}
