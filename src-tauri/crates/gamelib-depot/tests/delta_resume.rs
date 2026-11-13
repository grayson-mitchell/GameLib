//! Delta resume and failure safety (Phase 74-02): an update killed mid-commit is finished by
//! re-running the same job, and a commit-phase failure leaves a `1026` ACF naming the OLD builds
//! plus the journal (`<steamapps>/gamelib-delta/<appId>.json`) that makes the retry a commit-resume.

#[allow(dead_code)]
#[path = "support/delta_env.rs"]
mod delta_env;
#[allow(dead_code)]
#[path = "support/encode.rs"]
mod encode;
#[allow(dead_code)]
#[path = "support/fake_cdn.rs"]
mod fake_cdn;
#[allow(dead_code)]
#[path = "support/fake_host.rs"]
mod fake_host;
#[allow(dead_code)]
#[path = "support/fixture_builder.rs"]
mod fixture_builder;

use delta_env::{
    assert_tree_matches, piece, round_trip_cases, setup, sha_hex, tmp_files, wait_for, Env,
};
use fake_cdn::Reply;
use gamelib_depot::job::JobEventBody;
use gamelib_depot::outcome::{DeltaMode, Status};
use gamelib_depot::registry;
use std::time::Duration;

const DEPOT: &str = "940001";

/// The interrupted state of a kill during the commit: every work file (b, c, d) has its new bytes
/// as a temp, and `renamed` of them were already renamed over their targets.
fn interrupt(env: &Env, new: &fixture_builder::FixtureCase, renamed: &[&str]) {
    for f in &new.depots[0].files {
        if !["b.bin", "c.bin", "d.bin"].contains(&f.path.as_str()) {
            continue;
        }
        let t = env.plant_temp(&f.path, &f.content);
        if renamed.contains(&f.path.as_str()) {
            std::fs::rename(&t, env.root().join(&f.path)).unwrap();
        }
    }
    env.write_journal(
        &[(DEPOT, env.new_gid(DEPOT))],
        &[(DEPOT, env.old_gid(DEPOT).unwrap())],
    );
}

fn assert_finished(
    env: &Env,
    new: &fixture_builder::FixtureCase,
    out: &gamelib_depot::outcome::Outcome,
) {
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_tree_matches(env, new);
    let report = out.delta.as_ref().expect("delta report");
    assert_eq!(report.mode, DeltaMode::CommitResume);
    assert!(report.committed);
    assert!(
        !env.journal_path().exists(),
        "journal removed after finalize"
    );
    assert!(tmp_files(env.dir.path()).is_empty());
    let acf = env.acf_string();
    assert!(acf.contains("\"StateFlags\"\t\t\"4\""), "{acf}");
    assert!(acf.contains("\"buildid\"\t\t\"1002\""), "{acf}");
    assert!(acf.contains(&env.new_gid(DEPOT)), "{acf}");
    assert!(!acf.contains(&env.old_gid(DEPOT).unwrap()), "{acf}");
}

#[test]
fn resume_after_kill_mid_commit() {
    let (old, new) = round_trip_cases("dr-kill");
    let env = setup(&old, &new);
    interrupt(&env, &new, &["b.bin", "c.bin"]);
    let out = env.run(env.job("dr-kill"));
    assert_finished(&env, &new, &out);
}

#[test]
fn resume_after_kill_mid_commit_without_temps() {
    let (old, new) = round_trip_cases("dr-kill-notemp");
    let env = setup(&old, &new);
    interrupt(&env, &new, &["b.bin"]);
    // The not-yet-renamed temps are gone too.
    for t in tmp_files(env.dir.path()) {
        std::fs::remove_file(t).unwrap();
    }
    let out = env.run(env.job("dr-kill-notemp"));
    assert_finished(&env, &new, &out);
    assert!(
        !env.chunk_hits().is_empty(),
        "chunks the half-replaced tree cannot supply come from the CDN"
    );
}

#[test]
fn stale_journal_falls_back() {
    let (old, new) = round_trip_cases("dr-stale");
    let env = setup(&old, &new);
    // A journal for some other build: the tree state is unknown, only a full reconcile is safe.
    env.write_journal(
        &[(DEPOT, "1".to_string())],
        &[(DEPOT, env.old_gid(DEPOT).unwrap())],
    );
    env.write_temp_ledger(&[(DEPOT, "1".to_string())], &["b.bin"]);
    env.plant_temp("b.bin", b"kept earlier");
    let out = env.run(env.job("dr-stale"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(out.delta.as_ref().unwrap().mode, DeltaMode::FileFallback);
    assert_tree_matches(&env, &new);
    assert!(!env.temp_ledger_path().exists(), "ledger swept on fallback");
    assert!(tmp_files(env.dir.path()).is_empty(), "kept temps swept");
    assert!(!env.journal_path().exists());
    assert!(env.acf_string().contains("\"StateFlags\"\t\t\"4\""));
}

#[test]
fn stale_temps_cleaned_on_fresh_run() {
    let (old, new) = round_trip_cases("dr-temps");
    let env = setup(&old, &new);
    env.plant_temp("b.bin", b"garbage");
    env.plant_temp("d.bin", b"more garbage");
    let out = env.run(env.job("dr-temps"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(out.delta.as_ref().unwrap().mode, DeltaMode::Chunk);
    assert_tree_matches(&env, &new);
    assert!(tmp_files(env.dir.path()).is_empty());
    assert!(!env.journal_path().exists());
}

#[test]
fn commit_failure_writes_1026() {
    let (old, new) = round_trip_cases("dr-fail");
    let env = setup(&old, &new);
    // d.bin is new; a non-empty directory at its path makes its rename fail during the commit.
    std::fs::create_dir_all(env.root().join("d.bin")).unwrap();
    std::fs::write(env.root().join("d.bin").join("child"), b"x").unwrap();

    let out = env.run(env.job("dr-fail"));
    assert_eq!(out.status, Status::Error, "{:?}", out.failures);
    assert!(!out.delta.as_ref().unwrap().committed);
    let acf = env.acf_string();
    assert!(acf.contains("\"StateFlags\"\t\t\"1026\""), "{acf}");
    assert!(acf.contains(&env.old_gid(DEPOT).unwrap()), "{acf}");
    assert!(!acf.contains(&env.new_gid(DEPOT)), "{acf}");
    assert_eq!(out.acf.as_ref().unwrap().state_flags, "1026");
    assert!(env.journal_path().exists(), "journal kept for the resume");

    // The user clears the obstruction; the same job finishes the update.
    std::fs::remove_dir_all(env.root().join("d.bin")).unwrap();
    let out = env.run(env.job("dr-fail-2"));
    assert_finished(&env, &new, &out);
}

fn chunk_target(label_bytes: &[u8]) -> String {
    format!("/depot/{DEPOT}/chunk/{}", sha_hex(label_bytes))
}

fn new_content(new: &fixture_builder::FixtureCase, path: &str) -> Vec<u8> {
    new.depots[0]
        .files
        .iter()
        .find(|f| f.path == path)
        .unwrap()
        .content
        .clone()
}

fn temp_path(env: &Env, rel: &str) -> std::path::PathBuf {
    let mut t = env.root().join(rel).into_os_string();
    t.push(gamelib_depot::delta::DELTA_TMP_SUFFIX);
    t.into()
}

#[test]
fn pause_keeps_verified_temps_and_resume_skips_them() {
    let (old, new) = round_trip_cases("dr-pause");
    let env = setup(&old, &new);
    let d1 = chunk_target(&piece_d1());
    let original = env.cdn.replies(&d1);
    assert_eq!(original.len(), 1);
    env.cdn.script(&d1, vec![Reply::Hang, original[0].clone()]);
    let acf_before = env.acf_bytes();
    let old_b = env.root_file("b.bin");

    let out = std::thread::scope(|s| {
        let h = s.spawn(|| env.run(env.job("dr-pause")));
        wait_for("the d1 chunk to be requested", || {
            env.cdn.hit_count(&d1) > 0
        });
        wait_for("b and c temps to be built", || {
            std::fs::read(temp_path(&env, "b.bin")).is_ok_and(|b| b == new_content(&new, "b.bin"))
                && std::fs::read(temp_path(&env, "c.bin"))
                    .is_ok_and(|b| b == new_content(&new, "c.bin"))
        });
        // Let the whole-file SHA-1 of each finish before the pause.
        std::thread::sleep(Duration::from_millis(400));
        assert!(registry::cancel("dr-pause"));
        h.join().unwrap()
    });
    assert_eq!(out.status, Status::Cancelled, "{:?}", out.failures);
    assert_eq!(env.root_file("b.bin"), old_b);
    assert_eq!(env.acf_bytes(), acf_before);
    assert_eq!(
        std::fs::read(temp_path(&env, "b.bin")).unwrap(),
        new_content(&new, "b.bin")
    );
    assert_eq!(
        std::fs::read(temp_path(&env, "c.bin")).unwrap(),
        new_content(&new, "c.bin")
    );
    assert!(!temp_path(&env, "d.bin").exists(), "partial temp deleted");
    assert!(env.temp_ledger_path().exists(), "ledger written on pause");

    let b3 = chunk_target(&piece("b3"));
    let c1n = chunk_target(&piece("c1n"));
    let (b3_hits, c1n_hits) = (env.cdn.hit_count(&b3), env.cdn.hit_count(&c1n));
    env.host.emits.lock().unwrap().clear();

    let out = env.run(env.job("dr-pause-2"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_tree_matches(&env, &new);
    assert!(tmp_files(env.dir.path()).is_empty());
    assert!(!env.temp_ledger_path().exists());
    assert!(!env.journal_path().exists());
    assert_eq!(env.cdn.hit_count(&b3), b3_hits, "b3 not re-requested");
    assert_eq!(env.cdn.hit_count(&c1n), c1n_hits, "c1n not re-requested");

    let emits = env.host.emits.lock().unwrap();
    let first = emits
        .iter()
        .find_map(|e| match &e.body {
            JobEventBody::Progress {
                done_bytes,
                files_done,
                ..
            } => Some((*done_bytes, *files_done)),
            _ => None,
        })
        .expect("a progress frame");
    let want = (new_content(&new, "b.bin").len() + new_content(&new, "c.bin").len()) as u64;
    assert!(first.0 >= want, "{first:?} seeded with reused bytes");
    assert!(first.1 >= 2, "{first:?} seeded with reused files");
    assert!(
        emits.iter().any(|e| matches!(&e.body,
            JobEventBody::Warning { message, .. } if message.contains("reusing 2 verified files"))),
        "reuse is logged"
    );
}

fn piece_d1() -> Vec<u8> {
    fixture_builder::synth("d1", 500)
}

#[test]
fn resume_rebuilds_mismatched_temps() {
    for (variant, name) in [("flip", "dr-rebuild-flip"), ("trunc", "dr-rebuild-trunc")] {
        let (old, new) = round_trip_cases(name);
        let env = setup(&old, &new);
        env.write_temp_ledger(&[(DEPOT, env.new_gid(DEPOT))], &["b.bin", "c.bin"]);
        env.plant_temp("b.bin", &new_content(&new, "b.bin"));
        let mut bad = new_content(&new, "c.bin");
        if variant == "flip" {
            bad[10] ^= 0xff;
        } else {
            bad.pop();
        }
        env.plant_temp("c.bin", &bad);
        let out = env.run(env.job(name));
        assert_eq!(
            out.status,
            Status::Completed,
            "{variant}: {:?}",
            out.failures
        );
        assert_tree_matches(&env, &new);
        assert_eq!(
            env.cdn.hit_count(&chunk_target(&piece("b3"))),
            0,
            "{variant}: b reused"
        );
        assert!(
            env.cdn.hit_count(&chunk_target(&piece("c1n"))) > 0,
            "{variant}: c rebuilt"
        );
        assert!(tmp_files(env.dir.path()).is_empty());
        assert!(!env.temp_ledger_path().exists());
    }
}

#[test]
fn changed_target_starts_clean() {
    let (old, new) = round_trip_cases("dr-newtarget");
    let env = setup(&old, &new);
    env.write_temp_ledger(&[(DEPOT, "999".to_string())], &["b.bin", "zzz.bin"]);
    env.plant_temp("b.bin", &new_content(&new, "b.bin"));
    let zzz = env.plant_temp("zzz.bin", b"orphan");
    let out = env.run(env.job("dr-newtarget"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_tree_matches(&env, &new);
    assert!(
        env.cdn.hit_count(&chunk_target(&piece("b3"))) > 0,
        "b rebuilt, not reused"
    );
    assert!(!zzz.exists());
    assert!(!env.temp_ledger_path().exists());
    assert!(tmp_files(env.dir.path()).is_empty());
}

#[test]
fn error_deletes_all_temps() {
    let (old, new) = round_trip_cases("dr-error");
    let env = setup(&old, &new);
    env.write_temp_ledger(&[(DEPOT, env.new_gid(DEPOT))], &["b.bin"]);
    env.plant_temp("b.bin", &new_content(&new, "b.bin"));
    env.cdn.script(
        &chunk_target(&piece_d1()),
        vec![Reply::Status(200, b"not a chunk".to_vec())],
    );
    let out = env.run(env.job("dr-error"));
    assert_eq!(out.status, Status::Error, "{:?}", out.failures);
    assert!(tmp_files(env.dir.path()).is_empty(), "every temp deleted");
    assert!(!env.temp_ledger_path().exists());
}
