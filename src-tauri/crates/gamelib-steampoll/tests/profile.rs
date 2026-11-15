//! SidecarProfile against the paths the real TS `derivePaths` produced (fixtures/profile).

use gamelib_steampoll::profile::{Platform, SidecarProfile};
use serde_json::Value;
use std::collections::HashMap;

fn rows() -> Vec<Value> {
    let text = include_str!("fixtures/profile/app-paths.json");
    serde_json::from_str::<Value>(text)
        .unwrap()
        .as_array()
        .unwrap()
        .clone()
}

#[test]
fn matches_ts_paths_for_every_fixture_row() {
    let rows = rows();
    assert!(rows.len() >= 3);
    let mut seen = std::collections::HashSet::new();
    for r in rows {
        let platform = r["platform"].as_str().unwrap();
        seen.insert(platform.to_string());
        let env: HashMap<String, String> = r["env"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string()))
            .collect();
        let p = SidecarProfile::resolve(
            Platform::from_node(platform),
            r["home"].as_str().unwrap(),
            &|k| env.get(k).cloned(),
        );
        assert_eq!(p.user_data, r["userData"].as_str().unwrap(), "{r}");
        assert_eq!(p.config_path, r["configPath"].as_str().unwrap(), "{r}");
        assert_eq!(
            p.restart_hold_store_path,
            r["restartHoldStorePath"].as_str().unwrap(),
            "{r}"
        );
    }
    for want in ["darwin", "win32", "linux"] {
        assert!(seen.contains(want), "fixture lacks {want}");
    }
}

#[test]
fn empty_env_value_counts_as_unset() {
    let p = SidecarProfile::resolve(Platform::Linux, "/home/u", &|_| Some(String::new()));
    assert_eq!(p.user_data, "/home/u/.config/GameLib");
}

fn profile_in(dir: &std::path::Path) -> SidecarProfile {
    let mut p = SidecarProfile::resolve(Platform::Linux, "/nowhere", &|_| None);
    p.config_path = dir.join("config.json").to_string_lossy().into_owned();
    p
}

#[test]
fn language_and_steam_path_are_read_fresh_each_call() {
    let dir = tempfile::tempdir().unwrap();
    let p = profile_in(dir.path());
    assert_eq!(p.language(), None);
    assert_eq!(p.default_steam_path(), None);

    std::fs::write(
        dir.path().join("config.json"),
        r#"{"version":"v0","defaultSettings":{"language":"de","defaultSteamPath":"/s/steam"}}"#,
    )
    .unwrap();
    assert_eq!(p.language().as_deref(), Some("de"));
    assert_eq!(p.default_steam_path().as_deref(), Some("/s/steam"));

    std::fs::write(
        dir.path().join("config.json"),
        r#"{"defaultSettings":{"language":"fr"}}"#,
    )
    .unwrap();
    assert_eq!(p.language().as_deref(), Some("fr"));
    assert_eq!(p.default_steam_path(), None);
}

#[test]
fn malformed_config_answers_none() {
    let dir = tempfile::tempdir().unwrap();
    let p = profile_in(dir.path());
    std::fs::write(dir.path().join("config.json"), "{not json").unwrap();
    assert_eq!(p.language(), None);
    std::fs::write(
        dir.path().join("config.json"),
        r#"{"defaultSettings":{"language":3}}"#,
    )
    .unwrap();
    assert_eq!(p.language(), None);
}
