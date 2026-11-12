//! Phase 74-03: `summarize` with `fromManifest` returns a manifest-to-manifest estimate (D-09)
//! whose changed-file bytes match the delta job's peak, and degrades when the old manifest is gone.

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

use delta_env::{round_trip_cases, setup, Env};
use gamelib_depot::outcome::Status;
use gamelib_depot::{JobContext, JobHost};
use serde_json::{json, Value};
use std::sync::Arc;

fn summarize(env: &Env, from: Option<&str>) -> Value {
    let job = env.job_json("sum");
    let mut depots = job["depots"].clone();
    for d in depots.as_array_mut().unwrap() {
        d["fromManifest"] = from.map_or(Value::Null, |g| json!(g));
        if from.is_some() {
            d["requestCode"] = Value::Null;
        }
    }
    let args = json!({
        "appId": "940000", "depots": depots, "hosts": job["hosts"], "patterns": []
    });
    gamelib_depot::dispatch(
        "depot_manifest_summary",
        &args,
        &JobContext {
            cache_dir: env.dir.path().join("sumcache"),
        },
        env.host.clone() as Arc<dyn JobHost>,
    )
    .unwrap()
}

#[test]
fn estimate_matches_delta_peak() {
    let (old, new) = round_trip_cases("sd-parity");
    let env = setup(&old, &new);
    let old_gid = env.old_gid("940001").unwrap();
    let v = summarize(&env, Some(&old_gid));
    assert!(v.get("error").is_none(), "{v}");
    let est = &v["depots"][0]["delta"];
    assert_eq!(est["oldManifestAvailable"], true);
    assert_eq!(est["changedFiles"], 3);
    assert_eq!(est["removedFiles"], 0);

    let out = env.run(env.job("sd-run"));
    assert_eq!(out.status, Status::Completed, "{:?}", out.failures);
    let report = out.delta.as_ref().expect("delta report");
    assert_eq!(est["changedBytes"].as_u64().unwrap(), report.peak_bytes);
    assert!(est["maxDownloadBytes"].as_u64().unwrap() >= report.cdn_bytes);
}

#[test]
fn estimate_old_unavailable() {
    let (old, new) = round_trip_cases("sd-fallback");
    let env = setup(&old, &new);
    env.hide_old_manifest("940001");
    let old_gid = env.old_gid("940001").unwrap();
    let v = summarize(&env, Some(&old_gid));
    assert!(v.get("error").is_none(), "{v}");
    let est = &v["depots"][0]["delta"];
    assert_eq!(est["oldManifestAvailable"], false);
    assert_eq!(est["changedFiles"], 4);
    assert_eq!(est["removedFiles"], 0);
    // Largest single new file: b.bin is 3000 bytes.
    assert_eq!(est["changedBytes"], 3000);
    // Unique new chunks only; the 500-byte synth chunk compresses, so the figure is nonzero.
    assert!(est["maxDownloadBytes"].as_u64().unwrap() > 0);
}

#[test]
fn estimate_absent_without_from_manifest() {
    let (old, new) = round_trip_cases("sd-plain");
    let env = setup(&old, &new);
    let v = summarize(&env, None);
    assert!(v.get("error").is_none(), "{v}");
    assert!(v["depots"][0].get("delta").is_none(), "{v}");
}

#[test]
fn estimate_same_gid_is_zero() {
    let (old, new) = round_trip_cases("sd-same");
    let env = setup(&old, &new);
    let new_gid = env.new_depots[0].1.clone();
    let v = summarize(&env, Some(&new_gid));
    assert!(v.get("error").is_none(), "{v}");
    let est = &v["depots"][0]["delta"];
    assert_eq!(est["oldManifestAvailable"], true);
    assert_eq!(est["changedBytes"], 0);
    assert_eq!(est["changedFiles"], 0);
    assert_eq!(est["maxDownloadBytes"], 0);
}
