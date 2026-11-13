//! Fixture tests for the non-ACF readers (plan 75-08).
//!
//! The committed `valve/*.vdf` fixtures wrap the manifest in a `steam_client_win64` root, so
//! the TS oracle (and therefore Rust) reports `no win64 root` for all of them (see
//! `expected.json`). The real Valve manifest has `win64` at the top level; the cases that need
//! that shape are generated inline by `manifest()`.

use gamelib_steamfiles::readers::*;
use std::path::{Path, PathBuf};

fn fx(rel: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(rel)
}

const FILE_OK: &str = "bins_win64.zip.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_OK: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn manifest(version: &str, file: &str, sha: &str, size: &str) -> String {
    format!(
        "\"win64\"\n{{\n\t\"version\"\t{version}\n\t\"bins_win64\"\n\t{{\n\t\t\"file\"\t\"{file}\"\n\t\t\"sha2\"\t\"{sha}\"\n\t\t\"size\"\t{size}\n\t}}\n}}\n"
    )
}

fn check(text: &str) -> ValveManifestResult {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("m.vdf");
    std::fs::write(&p, text).unwrap();
    parse_valve_manifest(&p)
}

fn reason(text: &str) -> String {
    let r = check(text);
    assert!(!r.ok, "{text}");
    r.reason.unwrap()
}

#[test]
fn valve_good() {
    let r = check(&manifest("\"1700000000\"", FILE_OK, SHA_OK, "\"1048576\""));
    assert!(r.ok);
    let pkg = r.pkg.unwrap();
    assert_eq!(pkg.manifest_version, "1700000000");
    assert_eq!(pkg.file, FILE_OK);
    assert_eq!(pkg.sha2, SHA_OK);
    assert_eq!(pkg.size, 1_048_576);
}

#[test]
fn valve_fixtures_match_oracle_wrapped_shape() {
    for n in [
        "good",
        "no-bins",
        "no-win64",
        "bad-file",
        "bad-sha",
        "size-too-big",
        "size-as-string",
        "version-number",
    ] {
        let r = parse_valve_manifest(&fx(&format!("valve/{n}.vdf")));
        assert!(!r.ok, "{n}");
        assert_eq!(r.reason.as_deref(), Some("no win64 root"), "{n}");
    }
}

#[test]
fn valve_forbidden_key_before_parse() {
    let r = parse_valve_manifest(&fx("valve/forbidden-proto.vdf"));
    assert_eq!(r.reason.as_deref(), Some("forbidden key __proto__"));
    // Even an unparseable file is rejected on the forbidden key first.
    assert_eq!(
        reason("\"constructor\" { \"a\" "),
        "forbidden key constructor"
    );
}

#[test]
fn valve_too_large_from_metadata() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("big.vdf");
    std::fs::write(&p, vec![b' '; MAX_VALVE_MANIFEST_BYTES as usize + 1]).unwrap();
    assert_eq!(
        parse_valve_manifest(&p).reason.as_deref(),
        Some("manifest too large")
    );
}

#[test]
fn valve_missing_and_non_utf8_are_not_text() {
    let r = parse_valve_manifest(&fx("valve/does-not-exist.vdf"));
    assert!(!r.ok);
    assert_eq!(r.reason.as_deref(), Some("not text"));
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("b.vdf");
    std::fs::write(&p, [0xff, 0xfe, 0x00]).unwrap();
    assert_eq!(parse_valve_manifest(&p).reason.as_deref(), Some("not text"));
}

#[test]
fn valve_malformed_did_not_parse() {
    assert_eq!(reason("\"win64\" {"), "manifest did not parse");
}

#[test]
fn valve_shape_reasons() {
    assert_eq!(reason("\"linux64\" { \"a\" \"b\" }"), "no win64 root");
    assert_eq!(
        reason("\"win64\" { \"version\" \"1\" }"),
        "no bins_win64 node"
    );
    assert_eq!(
        reason(&manifest("\"1\"", "bins_win64.zip.zzzz", SHA_OK, "\"5\"")),
        "bad bins_win64 file"
    );
    assert_eq!(
        reason(&manifest("\"1\"", FILE_OK, "nothex", "\"5\"")),
        "bad bins_win64 sha2"
    );
    assert_eq!(
        reason(&manifest("\"1\"", FILE_OK, SHA_OK, "\"999999999999\"")),
        "bad bins_win64 size"
    );
    assert_eq!(
        reason(&manifest("\"1\"", FILE_OK, SHA_OK, "\"0\"")),
        "bad bins_win64 size"
    );
    assert_eq!(
        reason(&manifest("\"x\"", FILE_OK, SHA_OK, "\"5\"")),
        "bad manifest version"
    );
}

#[test]
fn valve_size_leading_zeros_and_unquoted_version() {
    let r = check(&manifest("1700000000", FILE_OK, SHA_OK, "\"0000000042\""));
    assert!(r.ok);
    let pkg = r.pkg.unwrap();
    assert_eq!(pkg.size, 42);
    assert_eq!(pkg.manifest_version, "1700000000");
}

#[test]
fn installscript_duplicate_entries_in_file_order() {
    let r = read_installscript(&fx("installscript/dotnet-duplicate.vdf"));
    assert!(r.exists);
    let e = r.entries.unwrap();
    assert_eq!(e.len(), 2);
    assert_eq!(e[0].name, "4.8");
    assert_eq!(e[1].name, "4.8");
    assert!(e[0].processes[0]
        .process
        .ends_with("dotNetFx40_Full_x86_x64.exe"));
    assert!(e[1].processes[0]
        .process
        .ends_with("NDP48-x86-x64-AllOS-ENU.exe"));
    assert_eq!(e[1].processes[0].command.as_deref(), Some("/q /norestart"));
    assert_eq!(e[0].minimum_has_run_value, 1);
}

#[test]
fn installscript_conditionals_ignored() {
    let e = read_installscript(&fx("installscript/conditionals.vdf"))
        .entries
        .unwrap();
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].name, "VC 2019");
    assert_eq!(
        e[0].processes[0].process,
        "%INSTALLDIR%\\vcredist\\VC_redist.x64.exe"
    );
}

#[test]
fn installscript_escapes_decoded() {
    let e = read_installscript(&fx("installscript/escapes.vdf"))
        .entries
        .unwrap();
    assert_eq!(
        e[0].processes[0].process,
        "%INSTALLDIR%\\Redist\\DXSETUP.exe"
    );
    assert_eq!(
        e[0].processes[0].command.as_deref(),
        Some("/silent \"quoted\"")
    );
}

#[test]
fn installscript_none_cases() {
    for n in ["no-run-process", "malformed"] {
        let r = read_installscript(&fx(&format!("installscript/{n}.vdf")));
        assert!(r.exists, "{n}");
        assert!(r.entries.is_none(), "{n}");
    }
    let r = read_installscript(&fx("installscript/missing.vdf"));
    assert!(!r.exists);
    assert!(r.entries.is_none());
}

#[test]
fn installscript_fields() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("i.vdf");
    std::fs::write(
        &p,
        "\"InstallScript\" { \"Run Process\" { \"X\" { \"HasRunKey\" \"HKLM\\\\k\" \
         \"MinimumHasRunValue\" \"3\" \"Process 1\" \"a.exe\" \"Process 2\" \"b.exe\" \
         \"Command 2\" \"/q\" \"Requirement_OS\" { \"Is64BitWindows\" \"1\" \"OSType\" \"Windows 10\" } } } }",
    )
    .unwrap();
    let e = read_installscript(&p).entries.unwrap();
    assert_eq!(e[0].has_run_key.as_deref(), Some("HKLM\\k"));
    assert_eq!(e[0].minimum_has_run_value, 3);
    assert_eq!(e[0].processes.len(), 2);
    assert_eq!(e[0].processes[0].command, None);
    let os = e[0].requirement_os.as_ref().unwrap();
    assert_eq!(os.is64_bit_windows.as_deref(), Some("1"));
    assert_eq!(os.os_type.as_deref(), Some("Windows 10"));
    let j = serde_json::to_value(&e[0]).unwrap();
    assert!(j.get("hasRunKey").is_some() && j["requirementOs"].get("is64BitWindows").is_some());
}

fn running(text: &str) -> u32 {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("registry.vdf");
    std::fs::write(&p, text).unwrap();
    read_running_app_id(&p).running_app_id
}

#[test]
fn registry_fixtures() {
    let id = |n: &str| read_running_app_id(&fx(&format!("registry/{n}.vdf"))).running_app_id;
    assert_eq!(id("running"), 1_245_620);
    assert_eq!(id("not-running"), 0);
    assert_eq!(id("missing-key"), 0);
    assert_eq!(id("missing"), 0);
    // Divergence from the case-exact TS oracle (returned 0), recorded in plan 23.
    assert_eq!(id("lowercase"), 1_245_620);
}

#[test]
fn registry_malformed_and_garbage_are_zero() {
    assert_eq!(running("\"Registry\" { \"HKCU\" {"), 0);
    let wrap = |v: &str| {
        format!(
            "\"Registry\" {{ \"HKCU\" {{ \"Software\" {{ \"Valve\" {{ \"Steam\" {{ \"RunningAppID\" \"{v}\" }} }} }} }} }}"
        )
    };
    assert_eq!(running(&wrap("abc")), 0);
    assert_eq!(running(&wrap("99999999999")), 0);
    assert_eq!(running(&wrap("42")), 42);
}

/// Binary KV: `UserConfig { BetaKey "<key>" }` as the first root map, hex-encoded.
fn blob_hex(key: &str) -> String {
    let mut b = vec![0u8];
    b.extend_from_slice(b"UserConfig\0");
    b.push(1);
    b.extend_from_slice(b"BetaKey\0");
    b.extend_from_slice(key.as_bytes());
    b.push(0);
    b.extend_from_slice(&[8, 8]);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn localconfig(app_entries: &str) -> (tempfile::TempDir, PathBuf) {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("localconfig.vdf");
    std::fs::write(
        &p,
        format!(
            "\"UserLocalConfigStore\"\n{{\n\t\"UserAppConfig\"\n\t{{\n{app_entries}\n\t}}\n}}\n"
        ),
    )
    .unwrap();
    (d, p)
}

#[test]
fn localconfig_decodes_binary_blob() {
    let (_d, p) = localconfig(&format!("\"10\" \"{}\"", blob_hex("beta_a")));
    assert_eq!(
        read_localconfig_beta_key(&p, "10").beta_key.as_deref(),
        Some("beta_a")
    );
    assert_eq!(read_localconfig_beta_key(&p, "20").beta_key, None);
    assert_eq!(read_localconfig_beta_key(&p, "abc").beta_key, None);
}

#[test]
fn localconfig_fixtures() {
    // The committed hex is plain ASCII, not a binary KV blob: no key. Outside-block app 10 too.
    let p = fx("localconfig/userappconfig.vdf");
    assert_eq!(read_localconfig_beta_key(&p, "10").beta_key, None);
    assert_eq!(read_localconfig_beta_key(&p, "20").beta_key, None);
    let n = fx("localconfig/none.vdf");
    assert_eq!(read_localconfig_beta_key(&n, "10").beta_key, None);
    assert_eq!(
        read_localconfig_beta_key(&fx("localconfig/missing.vdf"), "10").beta_key,
        None
    );
}

#[test]
fn localconfig_app_outside_block_is_ignored() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("lc.vdf");
    std::fs::write(
        &p,
        format!(
            "\"S\" {{ \"apps\" {{ \"10\" {{ \"BetaKey\" \"x\" }} }} \"UserAppConfig\" {{ \"20\" \"{}\" }} }}",
            blob_hex("b")
        ),
    )
    .unwrap();
    assert_eq!(read_localconfig_beta_key(&p, "10").beta_key, None);
    assert_eq!(
        read_localconfig_beta_key(&p, "20").beta_key.as_deref(),
        Some("b")
    );
}

#[test]
fn localconfig_bad_blobs_are_none() {
    for hex in [
        "abc".to_string(),                    // odd length
        "zz".to_string(),                     // not hex
        String::new(),                        // empty
        "0055736572436f6e666967".to_string(), // truncated binary KV
        blob_hex("bad key!"),                 // fails is_valid_beta_key
        blob_hex(&"a".repeat(65)),            // too long
    ] {
        let (_d, p) = localconfig(&format!("\"10\" \"{hex}\""));
        assert_eq!(read_localconfig_beta_key(&p, "10").beta_key, None, "{hex}");
    }
}

#[test]
fn localconfig_beta_key_only_inside_userconfig() {
    // BetaKey at the blob root (not under UserConfig) is not a beta key.
    let mut b = vec![1u8];
    b.extend_from_slice(b"BetaKey\0beta_a\0\x08");
    let hex: String = b.iter().map(|x| format!("{x:02x}")).collect();
    let (_d, p) = localconfig(&format!("\"10\" \"{hex}\""));
    assert_eq!(read_localconfig_beta_key(&p, "10").beta_key, None);
}

#[test]
fn results_serialize_camel_case() {
    let j = serde_json::to_value(RunningAppIdResult { running_app_id: 5 }).unwrap();
    assert_eq!(j["runningAppId"], 5);
    let j = serde_json::to_value(LocalConfigBetaKeyResult { beta_key: None }).unwrap();
    assert!(j.get("betaKey").is_some());
}
