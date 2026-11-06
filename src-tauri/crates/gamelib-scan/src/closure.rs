//! Port of `steamApiImportsTs` (legacyTsScanners.ts): the static steam_api import table of an
//! exe, the bounded same-directory DLL closure, and the delay-import merge, in one call.
//! Reads the PE headers natively; nothing is spawned.

use crate::pe::delay::steam_api_delay_imports;
use crate::pe::imports::{all_import_dll_names, steam_api_import_table, ImportTable};
use crate::reader::FileReader;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Component, Path};

const CONFLICTING_HEADINGS_ERROR: &str =
    "conflicting steam_api.dll and steam_api64.dll import headings";
const CLOSURE_MAX_DEPTH: usize = 2;
const CLOSURE_MAX_DLLS: usize = 32;
const SYSTEM_DLLS: &[&str] = &[
    "kernel32.dll",
    "user32.dll",
    "ntdll.dll",
    "msvcrt.dll",
    "advapi32.dll",
    "gdi32.dll",
    "shell32.dll",
    "ole32.dll",
    "oleaut32.dll",
    "ws2_32.dll",
    "winmm.dll",
];

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Diagnostic {
    pub level: &'static str,
    pub message: String,
}

fn warn(message: String) -> Diagnostic {
    Diagnostic {
        level: "warn",
        message,
    }
}

fn info(message: String) -> Diagnostic {
    Diagnostic {
        level: "info",
        message,
    }
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum ImportScanResult {
    Ok {
        arch: &'static str,
        dll: Option<&'static str>,
        symbols: Vec<String>,
        #[serde(rename = "delaySymbols", skip_serializing_if = "Option::is_none")]
        delay_symbols: Option<Vec<String>>,
        diagnostics: Vec<Diagnostic>,
    },
    Error {
        error: String,
        diagnostics: Vec<Diagnostic>,
    },
}

fn is_followable_name(name: &str) -> bool {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return false;
    }
    let lower = name.to_lowercase();
    !(SYSTEM_DLLS.contains(&lower.as_str())
        || lower.starts_with("api-ms-")
        || lower.starts_with("ext-ms-"))
}

fn is_steam_api_name(name: &str) -> bool {
    let l = name.to_lowercase();
    l == "steam_api.dll" || l == "steam_api64.dll"
}

/// Lexical containment: the name must be exactly one normal path component, so joining it onto
/// the exe's directory can only name a direct child (T-63-19).
fn is_direct_child_name(name: &str) -> bool {
    let mut c = Path::new(name).components();
    matches!((c.next(), c.next()), (Some(Component::Normal(_)), None))
}

fn dedupe(a: &[String], b: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    a.iter()
        .chain(b.iter())
        .filter(|s| seen.insert((*s).clone()))
        .cloned()
        .collect()
}

fn read_table(path: &Path) -> Option<(ImportTable, Vec<String>)> {
    let table = steam_api_import_table(&mut FileReader::open(path).ok()?)?;
    let names = all_import_dll_names(&mut FileReader::open(path).ok()?)?;
    Some((table, names))
}

/// Breadth-first walk of same-directory DLL imports; returns the steam_api blocks found.
fn scan_import_closure(
    app_id: &str,
    exe_path: &Path,
    exe_names: Vec<String>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Vec<(String, ImportTable)> {
    let dir = exe_path.parent().unwrap_or_else(|| Path::new(""));
    let mut blocks = Vec::new();
    let mut visited: HashSet<String> = HashSet::new();
    let mut examined = 0usize;
    let mut frontier = exe_names;
    for _depth in 1..=CLOSURE_MAX_DEPTH {
        if frontier.is_empty() {
            break;
        }
        let mut next = Vec::new();
        for name in frontier {
            let key = name.to_lowercase();
            if visited.contains(&key) || !is_followable_name(&name) || is_steam_api_name(&name) {
                continue;
            }
            let full = dir.join(&name);
            if !is_direct_child_name(&name) || !full.exists() {
                continue;
            }
            if examined >= CLOSURE_MAX_DLLS {
                return blocks;
            }
            visited.insert(key);
            examined += 1;
            match read_table(&full) {
                None => diagnostics.push(warn(format!(
                    "scanSteamApiImports: PE import scan could not parse followed DLL \"{}\" (appId {app_id}); skipping",
                    full.display()
                ))),
                Some((table, names)) => {
                    if table.arch != "none" || table.conflict {
                        blocks.push((name.clone(), table));
                    }
                    next.extend(names);
                }
            }
        }
        frontier = next;
    }
    blocks
}

pub fn scan_steam_api_imports(exe_path: &Path, app_id: &str) -> ImportScanResult {
    let mut diagnostics: Vec<Diagnostic> = Vec::new();
    let exe_disp = exe_path.display().to_string();

    // T-24-06: digits only, checked before any file is opened.
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        diagnostics.push(warn(format!(
            "scanSteamApiImports: rejected non-numeric appId \"{app_id}\" -- not opening the exe (T-24-06)"
        )));
        return ImportScanResult::Error {
            error: format!("Invalid appId: \"{app_id}\""),
            diagnostics,
        };
    }

    let mut reader = match FileReader::open(exe_path) {
        Ok(r) => r,
        Err(e) => {
            diagnostics.push(warn(format!(
                "scanSteamApiImports: PE import scan could not read appId {app_id} (\"{exe_disp}\"): {e}"
            )));
            return ImportScanResult::Error {
                error: format!("could not read \"{exe_disp}\": {e}"),
                diagnostics,
            };
        }
    };
    let Some(mut parsed) = steam_api_import_table(&mut reader) else {
        diagnostics.push(warn(format!(
            "scanSteamApiImports: not a parseable PE for appId {app_id} (\"{exe_disp}\")"
        )));
        return ImportScanResult::Error {
            error: format!("not a parseable PE: \"{exe_disp}\""),
            diagnostics,
        };
    };
    let exe_names = all_import_dll_names(&mut reader).unwrap_or_default();

    let blocks = scan_import_closure(app_id, exe_path, exe_names, &mut diagnostics);
    let mut contributing: Vec<&str> = Vec::new();
    for (name, b) in &blocks {
        if b.conflict || (parsed.arch != "none" && b.arch != parsed.arch) {
            diagnostics.push(warn(format!(
                "scanSteamApiImports: {CONFLICTING_HEADINGS_ERROR} (via {name}) for appId {app_id} (\"{exe_disp}\")"
            )));
            return ImportScanResult::Error {
                error: CONFLICTING_HEADINGS_ERROR.to_string(),
                diagnostics,
            };
        }
        parsed = ImportTable {
            dll: parsed.dll.or(b.dll),
            arch: if parsed.arch == "none" {
                b.arch
            } else {
                parsed.arch
            },
            symbols: dedupe(&parsed.symbols, &b.symbols),
            conflict: parsed.conflict,
        };
        contributing.push(name);
    }
    if !contributing.is_empty() {
        diagnostics.push(info(format!(
            "scanSteamApiImports: appId {app_id} steam_api imported via {} (Phase 52 closure)",
            contributing.join(", ")
        )));
    }
    if parsed.conflict {
        diagnostics.push(warn(format!(
            "scanSteamApiImports: {CONFLICTING_HEADINGS_ERROR} for appId {app_id} (\"{exe_disp}\")"
        )));
        return ImportScanResult::Error {
            error: CONFLICTING_HEADINGS_ERROR.to_string(),
            diagnostics,
        };
    }

    // Delay imports: any read problem means "no delay evidence".
    let delay = FileReader::open(exe_path)
        .ok()
        .map(|mut r| steam_api_delay_imports(&mut r));
    let delay = match delay {
        Some(d) if d.parsed && d.dll.is_some() => d,
        _ => {
            return ImportScanResult::Ok {
                arch: parsed.arch,
                dll: parsed.dll,
                symbols: parsed.symbols,
                delay_symbols: None,
                diagnostics,
            }
        }
    };
    if delay.conflict || (parsed.arch != "none" && parsed.arch != delay.arch) {
        diagnostics.push(warn(format!(
            "scanSteamApiImports: {CONFLICTING_HEADINGS_ERROR} (import table vs delay import table) for appId {app_id} (\"{exe_disp}\")"
        )));
        return ImportScanResult::Error {
            error: CONFLICTING_HEADINGS_ERROR.to_string(),
            diagnostics,
        };
    }
    diagnostics.push(info(format!(
        "scanSteamApiImports: appId {app_id} delay-imports {} symbol(s) from {} (\"{exe_disp}\")",
        delay.symbols.len(),
        delay.dll.unwrap_or("")
    )));
    ImportScanResult::Ok {
        arch: if parsed.arch == "none" {
            delay.arch
        } else {
            parsed.arch
        },
        dll: parsed.dll.or(delay.dll),
        symbols: dedupe(&parsed.symbols, &delay.symbols),
        delay_symbols: Some(delay.symbols),
        diagnostics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pe::delay::tests::delay_pe;
    use crate::pe::imports::tests::sym_pe;
    use std::fs;
    use tempfile::TempDir;

    type Dlls<'a> = &'a [(&'a str, &'a [&'a str])];

    fn put(dir: &TempDir, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let p = dir.path().join(name);
        fs::write(&p, bytes).unwrap();
        p
    }

    fn ok(r: &ImportScanResult) -> (&'static str, Option<&'static str>, &Vec<String>) {
        match r {
            ImportScanResult::Ok {
                arch, dll, symbols, ..
            } => (*arch, *dll, symbols),
            other => panic!("expected ok, got {other:?}"),
        }
    }

    fn err(r: &ImportScanResult) -> &str {
        match r {
            ImportScanResult::Error { error, .. } => error,
            other => panic!("expected error, got {other:?}"),
        }
    }

    fn diags(r: &ImportScanResult) -> &Vec<Diagnostic> {
        match r {
            ImportScanResult::Ok { diagnostics, .. }
            | ImportScanResult::Error { diagnostics, .. } => diagnostics,
        }
    }

    /// A chain exe -> d1.dll -> d2.dll ... where the last one imports steam_api.
    fn chain(dir: &TempDir, links: usize) -> std::path::PathBuf {
        let name = |i: usize| format!("d{i}.dll");
        for i in 1..=links {
            let next: Dlls = if i == links {
                &[("steam_api.dll", &["SteamAPI_Init"])]
            } else {
                &[]
            };
            let nxt = name(i + 1);
            let owned: Vec<(&str, &[&str])> = if i == links {
                next.to_vec()
            } else {
                vec![(nxt.as_str(), &[][..])]
            };
            put(dir, &name(i), &sym_pe(false, &owned));
        }
        put(dir, "game.exe", &sym_pe(false, &[("d1.dll", &[])]))
    }

    #[test]
    fn closure_x86_symbols() {
        let d = tempfile::tempdir().unwrap();
        let exe = put(
            &d,
            "g.exe",
            &sym_pe(
                false,
                &[
                    ("KERNEL32.dll", &["X"]),
                    ("steam_api.dll", &["A", "B", "A"]),
                ],
            ),
        );
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(
            ok(&r),
            (
                "x86",
                Some("steam_api.dll"),
                &vec!["A".into(), "B".into(), "A".into()]
            )
        );
    }

    #[test]
    fn closure_x64_symbols_skip_ordinals() {
        let d = tempfile::tempdir().unwrap();
        let exe = put(
            &d,
            "g.exe",
            &sym_pe(
                true,
                &[("STEAM_API64.DLL", &["SteamAPI_Init", "#7", "SteamUser"])],
            ),
        );
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(
            ok(&r),
            (
                "x64",
                Some("steam_api64.dll"),
                &vec!["SteamAPI_Init".into(), "SteamUser".into()]
            )
        );
    }

    #[test]
    fn closure_no_steam_api_is_none() {
        let d = tempfile::tempdir().unwrap();
        let exe = put(&d, "g.exe", &sym_pe(false, &[("a.dll", &["x"])]));
        let r = scan_steam_api_imports(&exe, "1");
        assert_eq!(ok(&r), ("none", None, &vec![]));
    }

    #[test]
    fn closure_conflict_both_headings_in_exe() {
        let d = tempfile::tempdir().unwrap();
        let exe = put(
            &d,
            "g.exe",
            &sym_pe(
                false,
                &[("steam_api.dll", &["A"]), ("steam_api64.dll", &["B"])],
            ),
        );
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(err(&r), CONFLICTING_HEADINGS_ERROR);
    }

    #[test]
    fn closure_conflict_exe_vs_closure_arch() {
        let d = tempfile::tempdir().unwrap();
        put(
            &d,
            "Engine.dll",
            &sym_pe(true, &[("steam_api64.dll", &["A"])]),
        );
        let exe = put(
            &d,
            "g.exe",
            &sym_pe(false, &[("steam_api.dll", &["A"]), ("Engine.dll", &[])]),
        );
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(err(&r), CONFLICTING_HEADINGS_ERROR);
    }

    #[test]
    fn closure_conflict_import_vs_delay_arch() {
        let d = tempfile::tempdir().unwrap();
        // x86 static steam_api plus an x64 delay table in the same image.
        let mut b = sym_pe(false, &[("steam_api.dll", &["A"])]);
        let delay = delay_pe(false, &[("steam_api64.dll", &["Z"])]);
        graft_delay(&mut b, &delay);
        let exe = put(&d, "g.exe", &b);
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(err(&r), CONFLICTING_HEADINGS_ERROR);
    }

    /// Copy the delay directory (0x1000..) of `delay` over a sym_pe image: sym_pe keeps its
    /// descriptors at 0x1000 so the delay table is relocated to 0x4800.
    fn graft_delay(b: &mut [u8], delay: &[u8]) {
        use crate::pe::pe_builder::put32;
        // Data directory 13 lives at opt(0x98) + 96 + 13*8 for PE32.
        let dir13 = 0x98 + 96 + 13 * 8;
        put32(b, dir13, 0x4800);
        put32(b, dir13 + 4, 64);
        let d = &delay[0x1000..0x1000 + 32];
        b[0x4800..0x4800 + 32].copy_from_slice(d);
        // name -> 0x4900, INT -> 0x4a00 with one hint/name at 0x4b00
        put32(b, 0x4800 + 4, 0x4900);
        put32(b, 0x4800 + 16, 0x4a00);
        let n = b"steam_api64.dll\0";
        b[0x4900..0x4900 + n.len()].copy_from_slice(n);
        put32(b, 0x4a00, 0x4b00);
        let s = b"\0\0Z\0";
        b[0x4b00..0x4b00 + s.len()].copy_from_slice(s);
    }

    #[test]
    fn closure_depth1_via_engine_dll() {
        let d = tempfile::tempdir().unwrap();
        put(
            &d,
            "Engine.dll",
            &sym_pe(false, &[("steam_api.dll", &["SteamAPI_Init"])]),
        );
        let exe = put(&d, "g.exe", &sym_pe(false, &[("Engine.dll", &[])]));
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(
            ok(&r),
            ("x86", Some("steam_api.dll"), &vec!["SteamAPI_Init".into()])
        );
        assert!(diags(&r)
            .iter()
            .any(|x| x.message.contains("via Engine.dll")));
    }

    #[test]
    fn closure_depth2_is_followed() {
        let d = tempfile::tempdir().unwrap();
        let exe = chain(&d, 2);
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(ok(&r).1, Some("steam_api.dll"));
    }

    #[test]
    fn closure_depth3_is_not_followed() {
        let d = tempfile::tempdir().unwrap();
        let exe = chain(&d, 3);
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(ok(&r), ("none", None, &vec![]));
    }

    fn many(d: &TempDir, steam_at: usize) -> std::path::PathBuf {
        let names: Vec<String> = (1..=33).map(|i| format!("m{i:02}.dll")).collect();
        for (i, n) in names.iter().enumerate() {
            let bytes = if i + 1 == steam_at {
                sym_pe(false, &[("steam_api.dll", &["Seen"])])
            } else {
                sym_pe(false, &[])
            };
            put(d, n, &bytes);
        }
        let refs: Vec<(&str, &[&str])> = names.iter().map(|n| (n.as_str(), &[][..])).collect();
        put(d, "g.exe", &sym_pe_many(&refs))
    }

    #[test]
    fn closure_33rd_dll_is_not_examined() {
        let d = tempfile::tempdir().unwrap();
        let r = scan_steam_api_imports(&many(&d, 33), "480");
        assert_eq!(ok(&r), ("none", None, &vec![]));
    }

    #[test]
    fn closure_32nd_dll_is_examined() {
        let d = tempfile::tempdir().unwrap();
        let r = scan_steam_api_imports(&many(&d, 32), "480");
        assert_eq!(ok(&r), ("x86", Some("steam_api.dll"), &vec!["Seen".into()]));
    }

    /// PE importing many DLLs by name only (no thunks), 0x40 name stride.
    fn sym_pe_many(dlls: &[(&str, &[&str])]) -> Vec<u8> {
        use crate::pe::pe_builder::*;
        let mut spec = Spec::new(false);
        spec.dirs[1] = (0x1000, (dlls.len() as u32 + 1) * 20);
        spec.sections[0].vsize = 0x8000;
        spec.sections[0].rawsize = 0x8000;
        spec.total = 0x9000;
        let mut b = spec.build();
        for (i, (d, _)) in dlls.iter().enumerate() {
            let at = 0x1000 + i * 20;
            put32(&mut b, at, 0x2000);
            put32(&mut b, at + 12, 0x3000 + i as u32 * 0x40);
            put32(&mut b, at + 16, 0x2000);
            put_str(&mut b, 0x3000 + i * 0x40, d);
        }
        b
    }

    #[test]
    fn closure_system_dll_not_followed() {
        let d = tempfile::tempdir().unwrap();
        put(
            &d,
            "kernel32.dll",
            &sym_pe(false, &[("steam_api.dll", &["A"])]),
        );
        put(
            &d,
            "api-ms-win-core-x.dll",
            &sym_pe(false, &[("steam_api.dll", &["A"])]),
        );
        let exe = put(
            &d,
            "g.exe",
            &sym_pe(
                false,
                &[("kernel32.dll", &[]), ("api-ms-win-core-x.dll", &[])],
            ),
        );
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(ok(&r).0, "none");
    }

    #[test]
    fn closure_dotdot_and_separator_names_refused() {
        let d = tempfile::tempdir().unwrap();
        let sub = d.path().join("sub");
        fs::create_dir(&sub).unwrap();
        fs::write(
            d.path().join("evil.dll"),
            sym_pe(false, &[("steam_api.dll", &["A"])]),
        )
        .unwrap();
        fs::write(
            sub.join("g.exe"),
            sym_pe(
                false,
                &[
                    ("..\\evil.dll", &[]),
                    ("../evil.dll", &[]),
                    ("..evil.dll", &[]),
                ],
            ),
        )
        .unwrap();
        let r = scan_steam_api_imports(&sub.join("g.exe"), "480");
        assert_eq!(ok(&r).0, "none");
    }

    #[test]
    fn closure_steam_api_itself_not_followed() {
        let d = tempfile::tempdir().unwrap();
        // An on-disk steam_api.dll that imports steam_api64.dll would conflict if followed.
        put(
            &d,
            "steam_api.dll",
            &sym_pe(true, &[("steam_api64.dll", &["Q"])]),
        );
        let exe = put(&d, "g.exe", &sym_pe(false, &[("steam_api.dll", &["A"])]));
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(ok(&r), ("x86", Some("steam_api.dll"), &vec!["A".into()]));
    }

    #[test]
    fn closure_missing_dll_skipped() {
        let d = tempfile::tempdir().unwrap();
        let exe = put(&d, "g.exe", &sym_pe(false, &[("Gone.dll", &[])]));
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(ok(&r).0, "none");
        assert!(diags(&r).is_empty());
    }

    #[test]
    fn closure_unparseable_followed_dll_is_warn_and_scan_continues() {
        let d = tempfile::tempdir().unwrap();
        put(&d, "Bad.dll", b"not a pe");
        put(&d, "Good.dll", &sym_pe(false, &[("steam_api.dll", &["A"])]));
        let exe = put(
            &d,
            "g.exe",
            &sym_pe(false, &[("Bad.dll", &[]), ("Good.dll", &[])]),
        );
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(ok(&r).1, Some("steam_api.dll"));
        assert!(diags(&r)
            .iter()
            .any(|x| x.level == "warn" && x.message.contains("could not parse followed DLL")));
    }

    #[test]
    fn closure_delay_symbols_absent_vs_present() {
        let d = tempfile::tempdir().unwrap();
        let exe = put(&d, "a.exe", &sym_pe(false, &[("steam_api.dll", &["A"])]));
        let v = serde_json::to_value(scan_steam_api_imports(&exe, "480")).unwrap();
        assert!(v.get("delaySymbols").is_none());
        assert_eq!(v["status"], "ok");

        let exe = put(
            &d,
            "b.exe",
            &delay_pe(false, &[("steam_api.dll", &["A", "B"])]),
        );
        let v = serde_json::to_value(scan_steam_api_imports(&exe, "480")).unwrap();
        assert_eq!(v["delaySymbols"], serde_json::json!(["A", "B"]));
        assert_eq!(v["arch"], "x86");
        assert_eq!(v["dll"], "steam_api.dll");
    }

    #[test]
    fn closure_delay_merge_dedupes_first_wins() {
        let d = tempfile::tempdir().unwrap();
        let mut b = sym_pe(false, &[("steam_api.dll", &["A", "Z"])]);
        let delay = delay_pe(false, &[("steam_api.dll", &["Z"])]);
        graft_delay(&mut b, &delay);
        // graft_delay installs steam_api64 + "Z"; rename to the x86 DLL for a same-arch merge.
        let n = b"steam_api.dll\0\0";
        b[0x4900..0x4900 + n.len()].copy_from_slice(n);
        let exe = put(&d, "g.exe", &b);
        let r = scan_steam_api_imports(&exe, "480");
        assert_eq!(
            ok(&r),
            ("x86", Some("steam_api.dll"), &vec!["A".into(), "Z".into()])
        );
    }

    #[test]
    fn closure_invalid_app_id_rejected_before_open() {
        for bad in ["1 2", "../x", "", "12a", "-1"] {
            let r = scan_steam_api_imports(Path::new("/definitely/not/here.exe"), bad);
            assert_eq!(err(&r), format!("Invalid appId: \"{bad}\""));
        }
    }

    #[test]
    fn closure_unreadable_and_unparseable_exe() {
        let r = scan_steam_api_imports(Path::new("/definitely/not/here.exe"), "480");
        assert!(err(&r).starts_with("could not read \"/definitely/not/here.exe\": "));
        let d = tempfile::tempdir().unwrap();
        let p = put(&d, "x.exe", b"MZ nope");
        let r = scan_steam_api_imports(&p, "480");
        assert!(err(&r).starts_with("not a parseable PE: "));
    }
}
