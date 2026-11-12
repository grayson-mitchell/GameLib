//! Delta fallbacks (Phase 74-02): D-14 (old manifest unavailable -> file-level reconcile against
//! the new manifest) and retired-depot cleanup.

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

use delta_env::{assert_tree_matches, case, cat, file, piece, setup, tmp_files, Env};
use gamelib_depot::job::{DepotJob, JobEventBody};
use gamelib_depot::outcome::{DeltaMode, Status};
use serde_json::{json, Value};

const APP: u32 = 940_000;

/// Old: depot A {a, old_only}. New: depot A {a, e}.
fn drop_file_cases(
    name: &'static str,
) -> (fixture_builder::FixtureCase, fixture_builder::FixtureCase) {
    let old = case(
        name,
        1,
        vec![(
            940_001,
            vec![
                file("a.bin", piece("a0")),
                file("old_only.bin", piece("o0")),
            ],
        )],
    );
    let new = case(
        name,
        2,
        vec![(
            940_001,
            vec![file("a.bin", piece("a0")), file("e.bin", piece("e0"))],
        )],
    );
    (old, new)
}

#[test]
fn fallback_when_old_manifest_unavailable() {
    let (old, new) = drop_file_cases("df-fallback");
    let env = setup(&old, &new);
    env.hide_old_manifest("940001");

    let out = env.run(env.job("df-fallback"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    let report = out.delta.as_ref().expect("delta report");
    assert_eq!(report.mode, DeltaMode::FileFallback);
    assert!(report.committed);
    assert_tree_matches(&env, &new);
    assert!(
        env.root().join("old_only.bin").exists(),
        "without the old manifest nothing can be known removed (documented limitation)"
    );
    assert!(env.acf_string().contains("\"StateFlags\"\t\t\"4\""));
    assert!(tmp_files(env.dir.path()).is_empty());
    let warned = env.host.emits.lock().unwrap().iter().any(|e| {
        matches!(&e.body, JobEventBody::Warning { message, .. } if message.contains("old manifest unavailable"))
    });
    assert!(warned, "the fallback is announced");
}

/// Old: A {a, shared(old)} + B {b_only, shared(old)}. New: A {a, shared(new)}; B is retired.
fn retired_cases(
    name: &'static str,
) -> (fixture_builder::FixtureCase, fixture_builder::FixtureCase) {
    let old = case(
        name,
        1,
        vec![
            (
                940_001,
                vec![
                    file("a.bin", piece("a0")),
                    file("shared.bin", piece("s_old")),
                ],
            ),
            (
                940_002,
                vec![
                    file("b_only.bin", cat(&[&piece("b0"), &piece("b1")])),
                    file("sub/b_shared.bin", piece("bs_old")),
                ],
            ),
        ],
    );
    let new = case(
        name,
        2,
        vec![(
            940_001,
            vec![
                file("a.bin", piece("a0")),
                file("shared.bin", piece("s_new")),
                file("sub/b_shared.bin", piece("bs_new")),
            ],
        )],
    );
    (old, new)
}

fn retired_job(env: &Env, job_id: &str) -> DepotJob {
    let (d, g, k) = env
        .old_depots
        .iter()
        .find(|(d, _, _)| d == "940002")
        .unwrap()
        .clone();
    let mut v = env.job_json(job_id);
    v["retiredDepots"] = json!([{
        "depotId": d, "manifestId": g, "requestCode": null, "key": k,
        "ownerAppId": APP.to_string(), "fromManifest": null
    }]);
    let _: &Value = &v;
    serde_json::from_value(v).unwrap()
}

#[test]
fn retired_depot_files_deleted() {
    let (old, new) = retired_cases("df-retired");
    let env = setup(&old, &new);
    std::fs::write(env.root().join("b_only.bin.keep"), b"mine").unwrap();

    let out = env.run(retired_job(&env, "df-retired"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_eq!(out.delta.as_ref().unwrap().mode, DeltaMode::Chunk);
    assert!(!env.root().join("b_only.bin").exists());
    assert_eq!(env.root_file("b_only.bin.keep"), b"mine");
    // A path the new depot also owns survives with the NEW content.
    assert_tree_matches(&env, &new);
    assert_eq!(env.root_file("sub/b_shared.bin"), piece("bs_new"));
    assert_eq!(
        out.delta.as_ref().unwrap().removed_files,
        vec!["b_only.bin".to_string()]
    );
}

#[test]
fn retired_depot_manifest_unavailable_is_warning() {
    let (old, new) = retired_cases("df-retired-gone");
    let env = setup(&old, &new);
    env.hide_old_manifest("940002");

    let out = env.run(retired_job(&env, "df-retired-gone"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    assert_tree_matches(&env, &new);
    assert!(env.root().join("b_only.bin").exists(), "its files are kept");
    let warned = env.host.emits.lock().unwrap().iter().any(|e| {
        matches!(&e.body, JobEventBody::Warning { message, .. } if message.contains("retired depot"))
    });
    assert!(warned);
}
