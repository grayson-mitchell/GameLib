//! Port of `readPeImportedDllNames` (peSteamDrm.ts). 63-05 adds symbol enumeration on top of
//! `walk_import_descriptors`.

use super::{rd_u32, read_asciiz, rva_to_offset, PeInfo, Section};
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

/// Walk the import directory at file offset `table`: stops at the all-zero terminator or the
/// 1024-descriptor cap, skips descriptors without a name. `None` on any short read or a
/// name RVA outside every section.
pub(crate) fn walk_import_descriptors(
    r: &mut impl RangeRead,
    sections: &[Section],
    table: u64,
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
        let name_off = rva_to_offset(sections, i128::from(name_rva))?;
        out.push(ImportDescriptor {
            dll_name: read_asciiz(r, name_off)?,
            original_first_thunk,
            first_thunk,
        });
    }
    Some(out)
}

/// DLL names in file order, original spelling, duplicates kept. `Some([])` when the directory
/// is absent; `None` when not a well-formed PE.
pub(crate) fn imported_dll_names(r: &mut impl RangeRead) -> Option<Vec<String>> {
    let info = PeInfo::parse(r)?;
    if info.num_rva_and_sizes < 2 {
        return Some(Vec::new());
    }
    let (import_rva, _) = info.data_dir(r, 1)?;
    if import_rva == 0 {
        return Some(Vec::new());
    }
    let sections = info.read_sections(r)?;
    let table = rva_to_offset(&sections, i128::from(import_rva))?;
    Some(
        walk_import_descriptors(r, &sections, table)?
            .into_iter()
            .map(|d| d.dll_name)
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

    #[test]
    fn open_error_sets_read_error() {
        let r = scan_pe_imported_dlls(Path::new("/definitely/not/here.exe"));
        assert!(r.names.is_none() && r.read_error.is_some());
    }
}
