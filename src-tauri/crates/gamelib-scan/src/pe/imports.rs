//! Port of `readPeImportedDllNames` (peSteamDrm.ts). 63-05 adds symbol enumeration on top of
//! `walk_import_descriptors`.

use super::{rd_u32, read_asciiz, rva_to_offset_or_header, PeInfo, Section};
use crate::reader::{FileReader, RangeRead};
use serde::Serialize;
use std::path::Path;

const MAX_IMPORT_DESCRIPTORS: u64 = 1024;

/// One import descriptor that names a DLL.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ImportDescriptor {
    pub dll_name: String,
    pub original_first_thunk: u32,
    pub first_thunk: u32,
}

/// How `walk_import_descriptors` treats a descriptor whose name cannot be read.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum NameFailure {
    /// Fail the whole walk (`readPeImportedDllNames` parity).
    Fail,
    /// Skip that descriptor and keep walking, as objdump reports the readable descriptors of
    /// a partly malformed table (63 WR-01: the paths that replaced objdump use this).
    Skip,
}

/// Walk the import directory at file offset `table`: stops at the all-zero terminator or the
/// 1024-descriptor cap, skips descriptors without a name. `None` on any short descriptor
/// read; a name RVA outside every section and the header region, or an over-long /
/// unterminated name, is `None` under `NameFailure::Fail` and a skipped descriptor under
/// `NameFailure::Skip`.
pub(crate) fn walk_import_descriptors(
    r: &mut impl RangeRead,
    sections: &[Section],
    size_of_headers: u32,
    table: u64,
    on_name_failure: NameFailure,
) -> Option<Vec<ImportDescriptor>> {
    let mut out = Vec::new();
    for i in 0..MAX_IMPORT_DESCRIPTORS {
        let d = table.saturating_add(i * 20);
        let original_first_thunk = rd_u32(r, d)?;
        let name_rva = rd_u32(r, d.saturating_add(12))?;
        let first_thunk = rd_u32(r, d.saturating_add(16))?;
        if original_first_thunk == 0 && name_rva == 0 && first_thunk == 0 {
            break;
        }
        if name_rva == 0 {
            continue;
        }
        let dll_name = rva_to_offset_or_header(sections, size_of_headers, i128::from(name_rva))
            .and_then(|off| read_asciiz(r, off));
        let dll_name = match (dll_name, on_name_failure) {
            (Some(n), _) => n,
            (None, NameFailure::Skip) => continue,
            (None, NameFailure::Fail) => return None,
        };
        out.push(ImportDescriptor {
            dll_name,
            original_first_thunk,
            first_thunk,
        });
    }
    Some(out)
}

/// DLL names in file order, original spelling, duplicates kept. `Some([])` when the directory
/// is absent; `None` when not a well-formed PE.
pub(crate) fn imported_dll_names(r: &mut impl RangeRead) -> Option<Vec<String>> {
    imported_dll_names_with(r, NameFailure::Fail)
}

fn imported_dll_names_with(
    r: &mut impl RangeRead,
    on_name_failure: NameFailure,
) -> Option<Vec<String>> {
    let info = PeInfo::parse(r)?;
    if info.num_rva_and_sizes < 2 {
        return Some(Vec::new());
    }
    let (import_rva, _) = info.data_dir(r, 1)?;
    if import_rva == 0 {
        return Some(Vec::new());
    }
    let sections = info.read_sections(r)?;
    let table = rva_to_offset_or_header(&sections, info.size_of_headers, i128::from(import_rva))?;
    Some(
        walk_import_descriptors(r, &sections, info.size_of_headers, table, on_name_failure)?
            .into_iter()
            .map(|d| d.dll_name)
            .collect(),
    )
}

const MAX_IMPORT_THUNKS: u64 = 4096;

/// The `steam_api(64).dll` block of the static import table (importParse.ts
/// `parseSteamApiImportTable`, read natively instead of from objdump text).
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ImportTable {
    pub dll: Option<&'static str>,
    pub arch: &'static str,
    pub symbols: Vec<String>,
    pub conflict: bool,
}

impl ImportTable {
    pub(crate) fn empty() -> ImportTable {
        ImportTable {
            dll: None,
            arch: "none",
            symbols: Vec::new(),
            conflict: false,
        }
    }
}

/// Hint/name symbols of one descriptor's thunk array, in thunk order, NOT deduplicated.
///
/// A5: ordinal-only thunks are skipped, matching the objdump text parser (its
/// TRAILING_IDENTIFIER regex drops numeric-only rows). The real-game sweep (63-11)
/// confirms this; a diff there is a D-07 finding. The delay table keeps its `#<n>` form.
fn thunk_symbols(
    r: &mut impl RangeRead,
    sections: &[Section],
    size_of_headers: u32,
    plus: bool,
    d: &ImportDescriptor,
) -> Option<Vec<String>> {
    let thunk_rva = if d.original_first_thunk != 0 {
        d.original_first_thunk
    } else {
        d.first_thunk
    };
    let mut at = rva_to_offset_or_header(sections, size_of_headers, i128::from(thunk_rva))?;
    let width: u64 = if plus { 8 } else { 4 };
    let mut out = Vec::new();
    for _ in 0..MAX_IMPORT_THUNKS {
        let low = rd_u32(r, at)?;
        let high = if plus {
            rd_u32(r, at.saturating_add(4))?
        } else {
            0
        };
        at = at.saturating_add(width);
        if low == 0 && high == 0 {
            break;
        }
        let ordinal = if plus { high } else { low } & 0x8000_0000 != 0;
        if ordinal {
            continue;
        }
        let hint_name = low & 0x7fff_ffff;
        let off = rva_to_offset_or_header(sections, size_of_headers, i128::from(hint_name))?;
        out.push(read_asciiz(r, off.saturating_add(2))?);
    }
    Some(out)
}

/// `Some(empty)` when the directory is absent; `None` when not a well-formed PE or a
/// steam_api descriptor's thunk array / hint-name entries are unreadable. A non-steam
/// descriptor whose name cannot be read is skipped, as objdump reported the readable
/// descriptors of a partly malformed table (63 WR-01).
pub(crate) fn steam_api_import_table(r: &mut impl RangeRead) -> Option<ImportTable> {
    let info = PeInfo::parse(r)?;
    if info.num_rva_and_sizes < 2 {
        return Some(ImportTable::empty());
    }
    let (import_rva, _) = info.data_dir(r, 1)?;
    if import_rva == 0 {
        return Some(ImportTable::empty());
    }
    let sections = info.read_sections(r)?;
    let table = rva_to_offset_or_header(&sections, info.size_of_headers, i128::from(import_rva))?;
    let mut out = ImportTable::empty();
    for d in walk_import_descriptors(r, &sections, info.size_of_headers, table, NameFailure::Skip)?
    {
        let name = d.dll_name.to_lowercase();
        let (dll, arch) = match name.as_str() {
            "steam_api.dll" => ("steam_api.dll", "x86"),
            "steam_api64.dll" => ("steam_api64.dll", "x64"),
            _ => continue,
        };
        if matches!(out.dll, Some(prev) if prev != dll) {
            out.conflict = true;
        }
        out.dll = Some(dll);
        out.arch = arch;
        out.symbols.extend(thunk_symbols(
            r,
            &sections,
            info.size_of_headers,
            info.is_plus,
            &d,
        )?);
    }
    Some(out)
}

/// Every descriptor DLL name in file order, deduped case-insensitively, first spelling kept
/// (`parseImportedDllNames` parity). Replaces objdump text, so an unreadable descriptor name
/// is skipped rather than failing the list (63 WR-01).
pub(crate) fn all_import_dll_names(r: &mut impl RangeRead) -> Option<Vec<String>> {
    let mut seen = std::collections::HashSet::new();
    Some(
        imported_dll_names_with(r, NameFailure::Skip)?
            .into_iter()
            .filter(|n| seen.insert(n.to_lowercase()))
            .collect(),
    )
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PeImportedDllsResult {
    pub names: Option<Vec<String>>,
    pub read_error: Option<String>,
}

pub fn scan_pe_imported_dlls(exe: &Path) -> PeImportedDllsResult {
    match FileReader::open(exe) {
        Ok(mut r) => PeImportedDllsResult {
            names: imported_dll_names(&mut r),
            read_error: None,
        },
        Err(e) => PeImportedDllsResult {
            names: None,
            read_error: Some(e.to_string()),
        },
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::super::pe_builder::*;
    use super::*;
    use crate::reader::SliceReader;

    /// Import table at 0x1000 (20 bytes per descriptor), names from 0x3000.
    pub(crate) fn import_pe(plus: bool, dlls: &[&str]) -> Vec<u8> {
        let mut spec = Spec::new(plus);
        spec.dirs[1] = (0x1000, (dlls.len() as u32 + 1) * 20);
        let mut b = spec.build();
        for (i, d) in dlls.iter().enumerate() {
            let at = 0x1000 + i * 20;
            put32(&mut b, at, 0x2000);
            put32(&mut b, at + 12, 0x3000 + i as u32 * 0x40);
            put32(&mut b, at + 16, 0x2000);
            put_str(&mut b, 0x3000 + i * 0x40, d);
        }
        b
    }

    /// Import table at 0x1000; per DLL a thunk array at 0x2000 + i*0x200 and hint/name entries
    /// at 0x4000 + i*0x400 + k*0x40 (`#n` = ordinal-only thunk). Names from 0x3000.
    pub(crate) fn sym_pe(plus: bool, dlls: &[(&str, &[&str])]) -> Vec<u8> {
        let mut spec = Spec::new(plus);
        spec.dirs[1] = (0x1000, (dlls.len() as u32 + 1) * 20);
        let mut b = spec.build();
        let width = if plus { 8 } else { 4 };
        for (i, (d, syms)) in dlls.iter().enumerate() {
            let at = 0x1000 + i * 20;
            let int_at = 0x2000 + i * 0x200;
            put32(&mut b, at, int_at as u32);
            put32(&mut b, at + 12, 0x3000 + i as u32 * 0x40);
            put32(&mut b, at + 16, int_at as u32);
            put_str(&mut b, 0x3000 + i * 0x40, d);
            for (k, s) in syms.iter().enumerate() {
                let e = int_at + k * width;
                if let Some(n) = s.strip_prefix('#') {
                    let n: u32 = n.parse().unwrap();
                    if plus {
                        put32(&mut b, e, n);
                        put32(&mut b, e + 4, 0x8000_0000);
                    } else {
                        put32(&mut b, e, 0x8000_0000 | n);
                    }
                } else {
                    let hn = 0x4000 + i * 0x400 + k * 0x40;
                    put32(&mut b, e, hn as u32);
                    put_str(&mut b, hn + 2, s);
                }
            }
        }
        b
    }

    #[test]
    fn symbol_table_orders_dups_and_skips_ordinals() {
        for plus in [false, true] {
            let b = sym_pe(
                plus,
                &[
                    ("KERNEL32.dll", &["Nope"]),
                    ("Steam_Api64.DLL", &["A", "#5", "B", "A"]),
                    ("steam_api64.dll", &["C"]),
                ],
            );
            let t = steam_api_import_table(&mut SliceReader::new(&b)).unwrap();
            assert_eq!(t.dll, Some("steam_api64.dll"));
            assert_eq!(t.arch, "x64");
            assert_eq!(t.symbols, vec!["A", "B", "A", "C"]);
            assert!(!t.conflict);
        }
    }

    #[test]
    fn symbol_table_conflict_and_absent() {
        let b = sym_pe(
            false,
            &[("steam_api.dll", &["A"]), ("steam_api64.dll", &["B"])],
        );
        assert!(
            steam_api_import_table(&mut SliceReader::new(&b))
                .unwrap()
                .conflict
        );
        let b = Spec::new(false).build();
        assert_eq!(
            steam_api_import_table(&mut SliceReader::new(&b)),
            Some(ImportTable::empty())
        );
        assert_eq!(steam_api_import_table(&mut SliceReader::new(&[0; 4])), None);
    }

    /// 63-11 D-07: a Watcom-style section with VirtualSize 0 spans its raw size (the Windows
    /// loader's rule). objdump rejects such a file ("RVA .. for import table not found"); the
    /// native reader resolves the table. Rust is correct; the diff is recorded in 63-PARITY.md.
    #[test]
    fn zero_virtual_size_section_spans_raw_size() {
        let mut b = sym_pe(false, &[("steam_api.dll", &["A"])]);
        // Section table starts at 0x80 + 24 + 224; VirtualSize is at +8.
        put32(&mut b, 0x80 + 24 + 224 + 8, 0);
        let t = steam_api_import_table(&mut SliceReader::new(&b)).unwrap();
        assert_eq!(t.dll, Some("steam_api.dll"));
        assert_eq!(t.symbols, vec!["A"]);
    }

    #[test]
    fn symbol_table_falls_back_to_first_thunk() {
        let mut b = sym_pe(false, &[("steam_api.dll", &["A"])]);
        put32(&mut b, 0x1000, 0);
        let t = steam_api_import_table(&mut SliceReader::new(&b)).unwrap();
        assert_eq!(t.symbols, vec!["A"]);
    }

    #[test]
    fn all_names_dedupe_case_insensitively_first_spelling() {
        let b = import_pe(false, &["Foo.DLL", "bar.dll", "foo.dll"]);
        assert_eq!(
            all_import_dll_names(&mut SliceReader::new(&b)),
            Some(vec!["Foo.DLL".into(), "bar.dll".into()])
        );
    }

    #[test]
    fn security_thunk_cap_4096() {
        // 5000 non-zero thunks: the walk stops at 4096 without reading further.
        let mut spec = Spec::new(false);
        spec.dirs[1] = (0x1000, 40);
        spec.sections[0].vsize = 0x8000;
        spec.sections[0].rawsize = 0x8000;
        spec.total = 0x9000;
        let mut b = spec.build();
        put32(&mut b, 0x1000, 0x2000);
        put32(&mut b, 0x1000 + 12, 0x1100);
        put32(&mut b, 0x1000 + 16, 0x2000);
        put_str(&mut b, 0x1100, "steam_api.dll");
        put_str(&mut b, 0x1200 + 2, "S");
        for k in 0..5000usize {
            put32(&mut b, 0x2000 + k * 4, 0x1200);
        }
        // 0x2000 + 4096*4 = 0x6000 is still inside the section.
        let t = steam_api_import_table(&mut SliceReader::new(&b)).unwrap();
        assert_eq!(t.symbols.len(), 4096);
    }

    #[test]
    fn names_in_order_with_duplicates() {
        for plus in [false, true] {
            let b = import_pe(plus, &["KERNEL32.dll", "steam_api64.dll", "KERNEL32.dll"]);
            assert_eq!(
                imported_dll_names(&mut SliceReader::new(&b)),
                Some(vec![
                    "KERNEL32.dll".into(),
                    "steam_api64.dll".into(),
                    "KERNEL32.dll".into()
                ])
            );
        }
    }

    #[test]
    fn absent_directory_is_empty_and_garbage_is_none() {
        let b = Spec::new(false).build();
        assert_eq!(imported_dll_names(&mut SliceReader::new(&b)), Some(vec![]));
        assert_eq!(imported_dll_names(&mut SliceReader::new(&[1, 2, 3])), None);
        let mut b = Spec::new(false).build();
        b.truncate(0x90);
        assert_eq!(imported_dll_names(&mut SliceReader::new(&b)), None);
    }

    #[test]
    fn nameless_descriptor_is_skipped() {
        let mut b = import_pe(false, &["a.dll", "b.dll"]);
        put32(&mut b, 0x1000 + 12, 0);
        assert_eq!(
            imported_dll_names(&mut SliceReader::new(&b)),
            Some(vec!["b.dll".to_string()])
        );
    }

    #[test]
    fn security_caps_import_descriptors_1024() {
        // 1100 descriptors, no terminator within the cap: only the first 1024 are read.
        let mut spec = Spec::new(false);
        spec.dirs[1] = (0x1000, 0x8000);
        spec.sections[0].vsize = 0x8000;
        spec.sections[0].rawsize = 0x8000;
        spec.total = 0xA000;
        let mut b = spec.build();
        for i in 0..1100usize {
            let at = 0x1000 + i * 20;
            put32(&mut b, at, 0x2000);
            put32(&mut b, at + 12, 0x7000);
            put32(&mut b, at + 16, 0x2000);
        }
        put_str(&mut b, 0x7000, "x.dll");
        let names = imported_dll_names(&mut SliceReader::new(&b)).unwrap();
        assert_eq!(names.len(), 1024);
    }

    #[test]
    fn security_name_cap_256_bytes() {
        let mut b = import_pe(false, &["a.dll"]);
        for i in 0..300 {
            b[0x3000 + i] = b'a';
        }
        b[0x3000 + 300] = 0;
        assert_eq!(imported_dll_names(&mut SliceReader::new(&b)), None);
    }

    /// 63 WR-01: an unreadable non-steam descriptor name (RVA outside every section, or an
    /// over-long name) is skipped by the objdump-replacing readers; the strict
    /// `imported_dll_names` still fails.
    #[test]
    fn unreadable_non_steam_name_is_skipped_by_lenient_readers() {
        for plus in [false, true] {
            let mut b = sym_pe(plus, &[("KERNEL32.dll", &["X"]), ("steam_api.dll", &["A"])]);
            put32(&mut b, 0x1000 + 12, 0x00F0_0000);
            let t = steam_api_import_table(&mut SliceReader::new(&b)).unwrap();
            assert_eq!(t.dll, Some("steam_api.dll"));
            assert_eq!(t.symbols, vec!["A"]);
            assert_eq!(
                all_import_dll_names(&mut SliceReader::new(&b)),
                Some(vec!["steam_api.dll".to_string()])
            );
            assert_eq!(imported_dll_names(&mut SliceReader::new(&b)), None);
        }
        let mut b = sym_pe(
            false,
            &[("KERNEL32.dll", &["X"]), ("steam_api.dll", &["A"])],
        );
        // KERNEL32's name moved to an unterminated 300-byte run clear of the other names.
        put32(&mut b, 0x1000 + 12, 0x4800);
        for i in 0..300 {
            b[0x4800 + i] = b'a';
        }
        let t = steam_api_import_table(&mut SliceReader::new(&b)).unwrap();
        assert_eq!(t.symbols, vec!["A"]);
    }

    /// 63 WR-01: a steam_api descriptor whose hint/name RVA is unmapped still fails the table.
    #[test]
    fn unreadable_steam_api_thunk_still_fails() {
        let mut b = sym_pe(false, &[("steam_api.dll", &["A"])]);
        put32(&mut b, 0x2000, 0x00F0_0000);
        assert_eq!(steam_api_import_table(&mut SliceReader::new(&b)), None);
    }

    /// 63 WR-01: a descriptor name placed in the header region (RVA < SizeOfHeaders, file
    /// offset == RVA) resolves, as it does for the Windows loader and objdump.
    #[test]
    fn header_region_name_resolves() {
        for plus in [false, true] {
            let mut b = sym_pe(plus, &[("steam_api.dll", &["A"])]);
            // SizeOfHeaders at optional header + 60.
            put32(&mut b, 0x80 + 24 + 60, 0x400);
            put_str(&mut b, 0x3a0, "steam_api.dll");
            put32(&mut b, 0x1000 + 12, 0x3a0);
            let t = steam_api_import_table(&mut SliceReader::new(&b)).unwrap();
            assert_eq!(t.dll, Some("steam_api.dll"));
            assert_eq!(t.symbols, vec!["A"]);
            // Without SizeOfHeaders the same RVA is unmapped and the (only) name is skipped.
            put32(&mut b, 0x80 + 24 + 60, 0);
            assert_eq!(
                steam_api_import_table(&mut SliceReader::new(&b)),
                Some(ImportTable::empty())
            );
        }
    }

    #[test]
    fn open_error_sets_read_error() {
        let r = scan_pe_imported_dlls(Path::new("/definitely/not/here.exe"));
        assert!(r.names.is_none() && r.read_error.is_some());
    }
}
