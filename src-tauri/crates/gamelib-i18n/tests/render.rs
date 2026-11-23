//! Every row of `fixtures/rendered.json` (rendered by the real i18next) must equal the Rust render.
//! A row flagged `"escapeValue": false` is one the TS renders with `interpolation: { escapeValue:
//! false }` and is replayed through `Catalog::t_unescaped`; every other row goes through `t`.

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
    let mut unescaped_rows = 0usize;
    let mut failures = Vec::new();
    for row in &rows {
        let language = row["language"].as_str().unwrap();
        let key = row["key"].as_str().unwrap();
        let default = row["default"].as_str().unwrap();
        let params: Map<String, Value> = row["params"].as_object().unwrap().clone();
        let want = row["rendered"].as_str().unwrap();
        let catalog = Catalog::load(&locales_dir(), language);
        let unescaped = row.get("escapeValue").and_then(Value::as_bool) == Some(false);
        if unescaped {
            unescaped_rows += 1;
        }
        let got = if unescaped {
            catalog.t_unescaped(key, default, &params)
        } else {
            catalog.t(key, default, &params)
        };
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
    // The unescaped path is exercised: at least one flagged row per language.
    assert!(unescaped_rows >= 1, "no row is flagged escapeValue: false");
}

#[test]
fn every_humble_and_shortcut_key_is_in_the_golden() {
    let golden = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/rendered.json");
    let rows: Vec<Value> = serde_json::from_str(&fs::read_to_string(golden).unwrap()).unwrap();
    let keys: std::collections::HashSet<&str> = rows
        .iter()
        .map(|row| row["key"].as_str().unwrap())
        .collect();
    for key in [
        "humble.notification.expiringTitleSingle",
        "humble.notification.expiringTitlePlural",
        "humble.notification.expiringBodySingle",
        "humble.notification.expiringBodyPlural",
        "box.shortcuts.title",
        "box.shortcuts.error",
        "box.shortcuts.error-remove",
        "box.shortcuts.message",
        "box.shortcuts.message-mac",
        "gamelib:box.shortcuts.messageMacDesktop",
        "box.shortcuts.message-remove",
        "box.shortcuts.message-remove-mac",
        "gamelib:box.shortcuts.messageRemoveMacDesktop",
        "notify.finished.add.steam.title",
        "notify.finished.add.steam.success",
        "notify.finished.add.steam.corrupt",
        "notify.finished.remove.steam.title",
        "notify.finished.remove.steam.success",
        "notify.finished.remove.steam.corrupt",
        "box.error.add.steam.title",
        "box.error.add.steam.body",
    ] {
        assert!(keys.contains(key), "{key} is not in the golden");
    }
}

#[test]
fn the_unescaped_dialog_row_differs_from_the_escaped_one_only_in_escaping() {
    let golden = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/rendered.json");
    let rows: Vec<Value> = serde_json::from_str(&fs::read_to_string(golden).unwrap()).unwrap();
    let body: Vec<&Value> = rows
        .iter()
        .filter(|r| r["language"] == "en" && r["key"] == "box.error.add.steam.body")
        .collect();
    let unescaped = body
        .iter()
        .find(|r| r.get("escapeValue").and_then(Value::as_bool) == Some(false))
        .expect("an unescaped en body row");
    let escaped = body
        .iter()
        .find(|r| {
            r["params"]["error"] == unescaped["params"]["error"] && r.get("escapeValue").is_none()
        })
        .expect("the same params rendered escaped");
    assert_ne!(unescaped["rendered"], escaped["rendered"]);
    assert!(unescaped["rendered"].as_str().unwrap().contains("<path>"));
    assert!(escaped["rendered"]
        .as_str()
        .unwrap()
        .contains("&lt;path&gt;"));
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
