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

use delta_env::{assert_tree_matches, round_trip_cases, setup, tmp_files, Env};
use gamelib_depot::outcome::{DeltaMode, Status};

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
    let out = env.run(env.job("dr-stale"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(out.delta.as_ref().unwrap().mode, DeltaMode::FileFallback);
    assert_tree_matches(&env, &new);
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
