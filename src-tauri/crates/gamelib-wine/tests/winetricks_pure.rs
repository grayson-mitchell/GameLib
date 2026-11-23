//! The pure half of Winetricks against the TS vectors (87-10 recorded them, 87-32 ports them; D-08):
//! every input/output pair of `tests/fixtures/vectors/winetricks_pure.json` (the `list-all` parser, the
//! verb shape, the line classifier, the chunk splitter, the wine-version derivation and the unsupported
//! rule, the apply guard, the visibility rule and the script's metadata readers) must give the same
//! answer in Rust. Every expected value is what the TS returned. The apply guard and the output
//! classifier are also pinned as named incident tests, one per threat or finding the TS comments name.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use gamelib_wine::winetricks::classify::{
    classify_line, is_unsupported_wine_version, parse_unsupported_wine_version,
    parse_wine_version_output, split_output_chunk, LineKind,
};
use gamelib_wine::winetricks::guard::{
    assert_apply_payload, is_visible_verb, WINETRICKS_APPLY_MAX_VERBS,
};
use gamelib_wine::winetricks::is_verb_shape;
use gamelib_wine::winetricks::list_parse::{parse_list_all, Component};
use gamelib_wine::winetricks::metadata::{derive_needs_gui_verbs, parse_metadata, MetadataMap};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The vector count the committed file must hold; editing the JSON alone cannot lower the bar.
const VECTOR_FLOOR: usize = 60;

fn crate_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf()
}

fn vectors() -> BTreeMap<String, Vec<Value>> {
    let path = crate_dir().join("tests/fixtures/vectors/winetricks_pure.json");
    serde_json::from_slice(&std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")))
        .unwrap_or_else(|e| panic!("{path:?}: {e}"))
}

/// The vectors of one function; an absent or empty list is a failure, not a pass.
fn section(name: &str) -> Vec<Value> {
    let list = vectors().remove(name).unwrap_or_default();
    assert!(!list.is_empty(), "no vectors for {name}");
    list
}

fn total(vectors: &BTreeMap<String, Vec<Value>>) -> usize {
    vectors.values().map(Vec::len).sum()
}

fn id(vector: &Value) -> &str {
    vector["id"].as_str().unwrap()
}

#[test]
fn the_committed_file_holds_at_least_the_floor() {
    assert!(total(&vectors()) >= VECTOR_FLOOR);
}

#[test]
fn an_empty_vector_list_fails_the_floor() {
    let empty: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    assert!(total(&empty) < VECTOR_FLOOR);
}

#[test]
fn every_function_has_vectors_and_unique_ids() {
    for (name, list) in vectors() {
        assert!(!list.is_empty(), "{name}");
        let mut ids: Vec<&str> = list.iter().map(id).collect();
        let count = ids.len();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), count, "{name}: duplicate ids");
    }
}

#[test]
fn list_all_parses_like_the_ts() {
    for vector in section("parseWinetricksListAll") {
        let chunks: Vec<String> = vector["chunks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c.as_str().unwrap().to_string())
            .collect();
        let got = serde_json::to_value(parse_list_all(&chunks)).unwrap();
        assert_eq!(got, vector["expected"], "{}", id(&vector));
    }
}

#[test]
fn the_verb_shape_matches() {
    for vector in section("verbShape") {
        let input = vector["input"].as_str().unwrap();
        assert_eq!(
            is_verb_shape(input),
            vector["expected"].as_bool().unwrap(),
            "{}",
            id(&vector)
        );
    }
}

#[test]
fn lines_classify_like_the_ts() {
    for vector in section("classifyWinetricksLine") {
        let got = classify_line(vector["line"].as_str().unwrap())
            .map(|line| serde_json::to_value(line).unwrap())
            .unwrap_or(Value::Null);
        assert_eq!(got, vector["expected"], "{}", id(&vector));
    }
}

/// `(length in UTF-16 units, the first three units)`, as the vector stores a long line.
fn shape(text: &str) -> Value {
    let units: Vec<u16> = text.encode_utf16().collect();
    json!({
        "length": units.len(),
        "head": String::from_utf16_lossy(&units[..units.len().min(3)]),
    })
}

#[test]
fn chunks_split_like_the_ts() {
    for vector in section("splitOutputChunk") {
        // A long chunk is stored as its generator, so the vector file stays small.
        let chunk = match &vector["chunk"] {
            Value::String(text) => text.clone(),
            generated => {
                let repeat = &generated["repeat"];
                repeat["char"]
                    .as_str()
                    .unwrap()
                    .repeat(repeat["count"].as_u64().unwrap() as usize)
            }
        };
        let split = split_output_chunk(vector["remainder"].as_str().unwrap(), &chunk);
        let got = json!({
            "lines": split.lines.iter().map(|l| shape(l)).collect::<Vec<_>>(),
            "remainder": shape(&split.remainder),
        });
        assert_eq!(got, vector["expected"], "{}", id(&vector));
    }
}

#[test]
fn wine_versions_reduce_like_the_ts() {
    for vector in section("parseWineVersionOutput") {
        let got = parse_wine_version_output(vector["raw"].as_str().unwrap());
        assert_eq!(json!(got), vector["expected"], "{}", id(&vector));
    }
}

#[test]
fn the_unsupported_notice_parses_like_the_ts() {
    for vector in section("parseUnsupportedWineVersion") {
        let got = parse_unsupported_wine_version(vector["line"].as_str().unwrap());
        assert_eq!(json!(got), vector["expected"], "{}", id(&vector));
    }
}

#[test]
fn the_unsupported_rule_is_numeric() {
    for vector in section("isUnsupportedWineVersion") {
        let got = is_unsupported_wine_version(vector["version"].as_str().unwrap());
        assert_eq!(json!(got), vector["expected"], "{}", id(&vector));
    }
}

#[test]
fn the_apply_guard_answers_like_the_ts() {
    let list = section("assertWinetricksApplyPayload");
    let mut accepted = 0;
    let mut reasons = std::collections::BTreeSet::new();
    for vector in &list {
        let catalog: Vec<Component> = serde_json::from_value(vector["catalog"].clone()).unwrap();
        let got = match assert_apply_payload(&vector["verbs"], &catalog) {
            Ok(verbs) => {
                accepted += 1;
                json!({ "accepted": verbs })
            }
            Err(rejected) => {
                reasons.insert(rejected.0.clone());
                json!({ "rejected": rejected.0 })
            }
        };
        assert_eq!(got, vector["expected"], "{}", id(vector));
    }
    // The accepted shapes and every rejection the guard has are represented.
    assert!(accepted >= 5, "{accepted} accepted vectors");
    assert!(reasons.len() >= 7, "{reasons:?}");
}

#[test]
fn the_apply_guard_constant_matches() {
    for vector in section("applyGuardConstants") {
        assert_eq!(id(&vector), "WINETRICKS_APPLY_MAX_VERBS");
        assert_eq!(
            vector["expected"].as_u64().unwrap() as usize,
            WINETRICKS_APPLY_MAX_VERBS
        );
    }
}

#[test]
fn visibility_matches() {
    for vector in section("isVisibleVerb") {
        let got = is_visible_verb(
            vector["verb"].as_str().unwrap(),
            vector["category"].as_str().unwrap(),
            vector["needsGui"].as_bool(),
        );
        assert_eq!(json!(got), vector["expected"], "{}", id(&vector));
    }
}

/// The `[{ verb, meta }]` the vectors store for a metadata map.
fn entries_value(map: &MetadataMap) -> Value {
    Value::Array(
        map.iter()
            .map(|meta| json!({ "verb": meta.verb, "meta": meta.to_value() }))
            .collect(),
    )
}

#[test]
fn metadata_parses_like_the_ts() {
    for vector in section("parseWinetricksMetadata") {
        let map = parse_metadata(vector["script"].as_str().unwrap());
        assert_eq!(entries_value(&map), vector["expected"], "{}", id(&vector));
    }
}

#[test]
fn needs_gui_derives_like_the_ts() {
    for vector in section("deriveNeedsGuiVerbs") {
        let set = derive_needs_gui_verbs(vector["script"].as_str().unwrap());
        let got: Vec<&str> = set.iter().map(String::as_str).collect();
        assert_eq!(json!(got), vector["expected"], "{}", id(&vector));
    }
}

/// The committed excerpt of the pinned script: 567 verbs, the same JSON as the TS wrote for them
/// (field order included, so the digest of `JSON.stringify` agrees), and the same needs-GUI set.
#[test]
fn the_pinned_script_excerpt_reads_like_the_ts() {
    for vector in section("parseWinetricksMetadataFixture") {
        let path = crate_dir()
            .join("../../..")
            .join(vector["file"].as_str().unwrap());
        let text = String::from_utf8_lossy(
            &std::fs::read(&path).unwrap_or_else(|e| panic!("{path:?}: {e}")),
        )
        .into_owned();
        let map = parse_metadata(&text);
        let expected = &vector["expected"];
        assert_eq!(map.len() as u64, expected["verbCount"].as_u64().unwrap());

        let stringified = format!(
            "[{}]",
            map.iter()
                .map(|meta| format!(
                    "{{\"verb\":{},\"meta\":{}}}",
                    json!(meta.verb),
                    meta.to_json_text()
                ))
                .collect::<Vec<_>>()
                .join(",")
        );
        let digest = Sha256::digest(stringified.as_bytes());
        let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, expected["entriesSha256"].as_str().unwrap());

        let needs_gui = derive_needs_gui_verbs(&text);
        let got: Vec<&str> = needs_gui.iter().map(String::as_str).collect();
        assert_eq!(json!(got), expected["needsGui"]);

        for sample in expected["sampled"].as_array().unwrap() {
            let verb = sample["verb"].as_str().unwrap();
            let meta = map.get(verb).map(|m| m.to_value()).unwrap_or(Value::Null);
            assert_eq!(meta, sample["meta"], "{verb}");
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The incidents the TS comments name, as behaviour tests (D-08).

fn component(verb: &str, category: &str, needs_gui: Option<bool>) -> Component {
    Component {
        needs_gui,
        ..Component::new(verb, &format!("title of {verb}"), category, false)
    }
}

fn guard_catalog() -> Vec<Component> {
    vec![
        component("vcrun2019", "dlls", None),
        component("corefonts", "fonts", None),
        component("xact", "dlls", None),
        component("annihilate", "settings", None),
        component("foobar2000", "apps", None),
        component("manualdll", "dlls", Some(true)),
    ]
}

/// T-45-02: a repeated verb is installed once, in first-occurrence order.
#[test]
fn incident_a_repeated_verb_is_installed_once() {
    let got = assert_apply_payload(&json!(["xact", "xact", "corefonts"]), &guard_catalog());
    assert_eq!(got.unwrap(), ["xact", "corefonts"]);
}

/// T-45-01: a verb of legal shape that is not in the real catalog (stale or forged) never reaches an
/// install, and a verb that is not even shaped like one never reaches argv.
#[test]
fn incident_a_forged_verb_is_refused() {
    let catalog = guard_catalog();
    for forged in [
        "dotnet48",
        "vcrun2019;rm",
        "vc run",
        "../x",
        "-q",
        "=rgb",
        "VCRUN2019",
    ] {
        assert!(
            assert_apply_payload(&json!([forged]), &catalog).is_err(),
            "{forged}"
        );
    }
}

/// T-45-16, D-09/D-17: a stale or unfiltered catalog cannot smuggle a bottle-wiper, an app or a
/// needs-GUI verb through the guard.
#[test]
fn incident_a_stale_catalog_cannot_smuggle_a_hidden_verb() {
    let catalog = guard_catalog();
    for hidden in ["annihilate", "foobar2000", "manualdll"] {
        let error = assert_apply_payload(&json!(["vcrun2019", hidden]), &catalog).unwrap_err();
        assert_eq!(
            error.0,
            "winetricksApply: verbs must be installable (hidden verbs are refused)"
        );
    }
}

/// The maximum is an entry count: exactly the maximum passes, one more is refused before the catalog
/// is looked at, and a duplicate still counts as an entry.
#[test]
fn incident_the_maximum_counts_entries_not_verbs() {
    let verbs: Vec<String> = (0..=WINETRICKS_APPLY_MAX_VERBS)
        .map(|i| format!("v{i:03}"))
        .collect();
    let catalog: Vec<Component> = verbs.iter().map(|v| component(v, "dlls", None)).collect();
    assert!(assert_apply_payload(&json!(&verbs[..WINETRICKS_APPLY_MAX_VERBS]), &catalog).is_ok());
    let over = assert_apply_payload(&json!(verbs), &[]).unwrap_err();
    assert_eq!(
        over.0,
        format!(
            "winetricksApply: verbs must not exceed {WINETRICKS_APPLY_MAX_VERBS} entries, got {}",
            WINETRICKS_APPLY_MAX_VERBS + 1
        )
    );
}

/// F-6: the `prefix` block of `list-all` is category names, which pass the verb shape; it is skipped as
/// a whole block.
#[test]
fn incident_the_prefix_block_is_category_names_not_verbs() {
    let list = parse_list_all(&[
        "===== prefix =====\napps\ndlls\nfonts\nsettings\n===== dlls =====\nd3dx9  t\n".to_string(),
    ]);
    assert_eq!(
        list.iter().map(|c| c.verb.as_str()).collect::<Vec<_>>(),
        ["d3dx9"]
    );
}

/// F-10: macOS's `taskset` warning ends in a colon after `warning`, which fails the verb charset.
#[test]
fn incident_a_macos_stdout_warning_is_not_a_verb() {
    let list = parse_list_all(&[
        "===== dlls =====\nwarning: taskset/cpuset not available on your platform!\n".to_string(),
    ]);
    assert!(list.is_empty());
}

/// F-11: `=====` is built from a legal verb character, so the header must be matched before the shape.
#[test]
fn incident_a_header_is_not_a_candidate_verb() {
    assert!(!is_verb_shape("====="));
    assert!(!is_verb_shape("=x"));
}

/// D-15: a failed `w_try` arrives behind a `warning:` prefix and must stay an error; `w_die` is only a
/// warning, so the exit code (not the text) decides a failure.
#[test]
fn incident_a_failed_w_try_is_an_error_not_a_warning() {
    for line in [
        "Note: command \"wine setup.exe\" returned status 1. Aborting.",
        "warning: Note: command x returned status 2. Aborting.",
    ] {
        assert_eq!(classify_line(line).unwrap().kind, LineKind::Error, "{line}");
    }
    assert_eq!(
        classify_line("warning: fatal: the installer failed")
            .unwrap()
            .kind,
        LineKind::Environment
    );
}

/// D-15: curl's meter header, sub-header and rows are progress with a percentage on the rows; a row
/// whose first column passes 100 is not a percentage.
#[test]
fn incident_curls_meter_is_progress_with_a_percent() {
    let header = classify_line("  % Total    % Received % Xferd  Average Speed").unwrap();
    assert_eq!((header.kind, header.percent), (LineKind::Progress, None));
    let row = classify_line("100 12.3M  100 12.3M    0     0  1234k      0  0:00:10").unwrap();
    assert_eq!((row.kind, row.percent), (LineKind::Progress, Some(100)));
    let over = classify_line("101 12.3M  101 12.3M    0     0  1234k      0  0:00:10").unwrap();
    assert_eq!(over.kind, LineKind::Info);
}

/// T-45-17: a process that never writes a newline cannot grow the buffer without bound.
#[test]
fn incident_a_tail_without_a_newline_is_bounded() {
    let chunk = "y".repeat(65536 * 2 + 5);
    let split = split_output_chunk("", &chunk);
    assert_eq!(split.lines.len(), 2);
    assert!(split.lines.iter().all(|l| l.len() == 65536));
    assert_eq!(split.remainder.len(), 5);
}

/// 261011-iel (D-16): `10.0` sorts above `7.99`, so the threshold is numeric field by field.
#[test]
fn incident_the_wine_threshold_is_not_a_string_comparison() {
    assert!(!is_unsupported_wine_version("10.0"));
    assert!(is_unsupported_wine_version("7.99"));
    assert!(is_unsupported_wine_version("6.23"));
}
