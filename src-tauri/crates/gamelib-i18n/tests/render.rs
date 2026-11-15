//! Every row of `fixtures/rendered.json` (rendered by the real i18next) must equal the Rust render.

use std::fs;
use std::path::{Path, PathBuf};

use gamelib_i18n::Catalog;
use serde_json::{Map, Value};

fn locales_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../public/locales")
}

#[test]
fn rust_renders_every_golden_row_like_i18next() {
    let golden = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/rendered.json");
    let rows: Vec<Value> = serde_json::from_str(&fs::read_to_string(golden).unwrap()).unwrap();
    assert!(!rows.is_empty());
    let mut checked = 0usize;
    let mut failures = Vec::new();
    for row in &rows {
        let language = row["language"].as_str().unwrap();
        let key = row["key"].as_str().unwrap();
        let default = row["default"].as_str().unwrap();
        let params: Map<String, Value> = row["params"].as_object().unwrap().clone();
        let want = row["rendered"].as_str().unwrap();
        let got = Catalog::load(&locales_dir(), language).t(key, default, &params);
        if got != want {
            failures.push(format!("[{language}] {key}: want {want:?}, got {got:?}"));
        }
        checked += 1;
    }
    assert!(
        failures.is_empty(),
        "{} mismatches:\n{}",
        failures.len(),
        failures.join("\n")
    );
    assert_eq!(checked, rows.len());
}

#[test]
fn missing_locales_dir_returns_the_interpolated_default() {
    let catalog = Catalog::load(Path::new("/nonexistent/gamelib/locales"), "de");
    let mut params = Map::new();
    params.insert("game".into(), Value::String("A & B".into()));
    assert_eq!(
        catalog.t("steam.waitingForSteam.notify", "Restart {{game}}", &params),
        "Restart A &amp; B"
    );
}

#[test]
fn malformed_locale_file_falls_back_to_en() {
    let dir = std::env::temp_dir().join(format!("gamelib-i18n-malformed-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("de")).unwrap();
    fs::create_dir_all(dir.join("en")).unwrap();
    fs::write(dir.join("de/translation.json"), "{ not json").unwrap();
    fs::write(dir.join("en/translation.json"), r#"{"a":{"b":"English"}}"#).unwrap();
    let catalog = Catalog::load(&dir, "de");
    assert_eq!(catalog.t("a.b", "default", &Map::new()), "English");
    assert_eq!(catalog.t("a.missing", "default", &Map::new()), "default");
    fs::remove_dir_all(&dir).unwrap();
}
