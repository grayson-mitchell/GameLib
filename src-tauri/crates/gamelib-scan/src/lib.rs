//! Tauri-free scanner library. `dispatch` is the single entry point shared by the in-process
//! sidecar bridge and `gamelib-scan-cli`. Not-a-PE / truncated / unreadable input is a RESULT;
//! `Err` means bad arguments, an unknown op or a panic only.

pub mod contain;
pub mod pe;
pub mod reader;

use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

/// Ops reachable from the sidecar. Keep sorted.
pub const OPS: &[&str] = &[
    "scan_contained_real",
    "scan_pe_delay_imports",
    "scan_pe_imported_dlls",
    "scan_steam_drm",
    "scan_steamstub_section",
];
/// Ops reachable from the CLI only.
pub const CLI_ONLY_OPS: &[&str] = &["scan_pe_delay_imports"];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContainedRealArgs {
    path: String,
    root_dir: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExePathArgs {
    exe_path: String,
}

fn parse_args<T: for<'de> Deserialize<'de>>(op: &str, args: &[Value]) -> Result<T, String> {
    let bad = || format!("{op}:bad-args");
    if args.len() != 1 {
        return Err(bad());
    }
    serde_json::from_value(args[0].clone()).map_err(|_| bad())
}

fn to_value<T: serde::Serialize>(op: &str, v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|_| format!("{op}:serialize"))
}

fn run_op(op: &str, args: &[Value]) -> Result<Value, String> {
    match op {
        "scan_contained_real" => {
            let a: ContainedRealArgs = parse_args(op, args)?;
            let r = contain::contained_real(Path::new(&a.path), Path::new(&a.root_dir));
            serde_json::to_value(r).map_err(|_| format!("{op}:serialize"))
        }
        "scan_pe_delay_imports" => {
            let a: ExePathArgs = parse_args(op, args)?;
            to_value(op, pe::delay::scan_pe_delay_imports(Path::new(&a.exe_path)))
        }
        "scan_pe_imported_dlls" => {
            let a: ExePathArgs = parse_args(op, args)?;
            to_value(
                op,
                pe::imports::scan_pe_imported_dlls(Path::new(&a.exe_path)),
            )
        }
        "scan_steam_drm" => {
            let a: ExePathArgs = parse_args(op, args)?;
            to_value(op, pe::drm::scan_steam_drm(Path::new(&a.exe_path)))
        }
        "scan_steamstub_section" => {
            let a: ExePathArgs = parse_args(op, args)?;
            to_value(
                op,
                pe::sections::scan_steamstub_section(Path::new(&a.exe_path)),
            )
        }
        #[cfg(test)]
        "__panic_probe" => panic!("probe"),
        _ => Err(format!("unknown-op:{op}")),
    }
}

pub fn dispatch(op: &str, args: &[Value]) -> Result<Value, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_op(op, args)))
        .unwrap_or_else(|_| Err(format!("{op}:panic")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_args_is_bad_args() {
        assert_eq!(
            dispatch("scan_contained_real", &[]),
            Err("scan_contained_real:bad-args".to_string())
        );
    }

    #[test]
    fn extra_field_is_bad_args() {
        let a = json!({"path": "a", "rootDir": "b", "extra": 1});
        assert_eq!(
            dispatch("scan_contained_real", &[a]),
            Err("scan_contained_real:bad-args".to_string())
        );
    }

    #[test]
    fn unknown_op() {
        assert_eq!(dispatch("nope", &[]), Err("unknown-op:nope".to_string()));
    }

    #[test]
    fn ops_list_is_sorted_and_unique() {
        let mut v: Vec<&str> = OPS.to_vec();
        v.sort_unstable();
        v.dedup();
        assert_eq!(v, OPS.to_vec());
        assert!(!OPS.contains(&"__panic_probe"));
    }

    #[test]
    fn every_op_dispatches_bad_args_on_empty_args() {
        for op in OPS.iter().chain(CLI_ONLY_OPS.iter()) {
            let e = dispatch(op, &[]).unwrap_err();
            assert!(e.ends_with(":bad-args"), "{op}: {e}");
        }
    }

    #[test]
    fn panic_is_caught() {
        assert_eq!(
            dispatch("__panic_probe", &[]),
            Err("__panic_probe:panic".to_string())
        );
    }

    #[test]
    fn contained_real_end_to_end() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("a.exe");
        std::fs::write(&f, b"x").unwrap();
        let v = dispatch(
            "scan_contained_real",
            &[json!({"path": f.to_str().unwrap(), "rootDir": dir.path().to_str().unwrap()})],
        )
        .unwrap();
        assert!(v["real"].is_string());
    }

    #[test]
    fn cli_only_ops_are_registered() {
        for op in CLI_ONLY_OPS {
            assert!(OPS.contains(op), "{op}");
        }
    }

    #[test]
    fn steamstub_missing_file_is_a_result() {
        let v = dispatch(
            "scan_steamstub_section",
            &[json!({"exePath": "/definitely/not/here.exe"})],
        )
        .unwrap();
        assert!(v["drmWrapper"].is_null());
        assert!(v["readError"].is_string());
    }

    #[test]
    fn pe_ops_end_to_end() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.exe");
        std::fs::write(&p, pe::drm::tests::ceg_pe(true, &["STEAM_GUIDD"], true)).unwrap();
        let a = json!({"exePath": p.to_str().unwrap()});
        let v = dispatch("scan_steam_drm", std::slice::from_ref(&a)).unwrap();
        assert_eq!(
            v,
            json!({"parsed": true, "cegMarkers": ["STEAM_GUIDD"], "hasBindSection": true, "readError": null})
        );
        assert_eq!(
            dispatch("scan_steamstub_section", std::slice::from_ref(&a)).unwrap()["drmWrapper"],
            "steamstub"
        );
        assert_eq!(
            dispatch("scan_pe_imported_dlls", std::slice::from_ref(&a)).unwrap()["names"],
            json!([])
        );
        assert_eq!(
            dispatch("scan_pe_delay_imports", &[a]).unwrap()["arch"],
            "none"
        );
    }

    #[test]
    fn security_truncation_never_panics() {
        use crate::reader::SliceReader;
        use pe::pe_builder::Spec;
        let mut pes: Vec<Vec<u8>> = vec![
            pe::drm::tests::ceg_pe(false, &["STEAM_GUIDD", "steam_split_guid"], false),
            pe::drm::tests::ceg_pe(true, &["STEAM_MINSTANCE"], true),
            pe::imports::tests::import_pe(false, &["a.dll", "steam_api.dll"]),
            pe::imports::tests::import_pe(true, &["b.dll"]),
            pe::delay::tests::delay_pe(false, &[("steam_api.dll", &["A", "#2"])]),
            pe::delay::tests::delay_pe(true, &[("steam_api64.dll", &["A", "#2"])]),
        ];
        pes.push(Spec::new(false).build());
        for pe_bytes in &pes {
            for len in 0..=pe_bytes.len() {
                let prefix = &pe_bytes[..len];
                let _ = pe::sections::parse_section_names(prefix);
                let _ = pe::drm::detect_steam_drm(&mut SliceReader::new(prefix));
                let _ = pe::imports::imported_dll_names(&mut SliceReader::new(prefix));
                let _ = pe::delay::steam_api_delay_imports(&mut SliceReader::new(prefix));
            }
        }
    }
}
