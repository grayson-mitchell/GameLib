//! Port of `readPeSteamApiDelayImports` (peSteamDrm.ts): the steam_api(64).dll entries of the
//! Delay Import Directory (data directory 13), which the text header dump of a PE does not list.

use super::{rd_u32, read_asciiz, rva_to_offset, PeInfo};
use crate::reader::{FileReader, RangeRead};
use serde::Serialize;
use std::path::Path;

const MAX_DELAY_DESCRIPTORS: u64 = 256;
const MAX_DELAY_THUNKS: u64 = 4096;
/// `Number.isSafeInteger` bound used by the TS.
const MAX_SAFE: u128 = (1 << 53) - 1;

#[derive(Debug, PartialEq)]
pub struct PeDelayImportResult {
    pub parsed: bool,
    pub dll: Option<&'static str>,
    pub arch: &'static str,
    pub symbols: Vec<String>,
    pub conflict: bool,
}

fn none(parsed: bool) -> PeDelayImportResult {
    PeDelayImportResult {
        parsed,
        dll: None,
        arch: "none",
        symbols: Vec::new(),
        conflict: false,
    }
}

pub fn steam_api_delay_imports(r: &mut impl RangeRead) -> PeDelayImportResult {
    inner(r).unwrap_or_else(|| none(false))
}

fn inner(r: &mut impl RangeRead) -> Option<PeDelayImportResult> {
    let info = PeInfo::parse(r)?;
    if info.num_rva_and_sizes < 14 {
        return Some(none(true));
    }
    let (delay_rva, _) = info.data_dir(r, 13)?;
    if delay_rva == 0 {
        return Some(none(true));
    }
    let plus = info.is_plus;
    let image_base: u128 = if plus {
        u128::from(rd_u32(r, info.opt.saturating_add(24))?)
            + u128::from(rd_u32(r, info.opt.saturating_add(28))?) * 0x1_0000_0000
    } else {
        u128::from(rd_u32(r, info.opt.saturating_add(28))?)
    };
    if image_base > MAX_SAFE {
        return Some(none(false));
    }
    let image_base = image_base as i128;
    let sections = info.read_sections(r)?;
    let table = rva_to_offset(&sections, i128::from(delay_rva))?;

    let mut symbols: Vec<String> = Vec::new();
    let (mut has_x86, mut has_x64, mut terminated) = (false, false, false);
    for i in 0..MAX_DELAY_DESCRIPTORS {
        let d = table.saturating_add(i * 32);
        let attributes = rd_u32(r, d)?;
        let name_field = rd_u32(r, d.saturating_add(4))?;
        if name_field == 0 {
            terminated = true;
            break;
        }
        // Attributes bit 0 clear: the address fields are VAs, not RVAs.
        let va_form = attributes & 1 == 0;
        let fix = |v: i128| if va_form { v - image_base } else { v };
        let name_off = rva_to_offset(&sections, fix(i128::from(name_field)))?;
        let name = read_asciiz(r, name_off)?.to_lowercase();
        if name != "steam_api.dll" && name != "steam_api64.dll" {
            continue;
        }
        if name == "steam_api.dll" {
            has_x86 = true;
        } else {
            has_x64 = true;
        }
        let int_field = rd_u32(r, d.saturating_add(16))?;
        let mut entry = rva_to_offset(&sections, fix(i128::from(int_field)))?;
        let width: u64 = if plus { 8 } else { 4 };
        let mut int_terminated = false;
        for _ in 0..MAX_DELAY_THUNKS {
            let low = rd_u32(r, entry)?;
            let high = if plus {
                rd_u32(r, entry.saturating_add(4))?
            } else {
                0
            };
            entry = entry.saturating_add(width);
            if low == 0 && high == 0 {
                int_terminated = true;
                break;
            }
            let is_ordinal = if plus { high } else { low } & 0x8000_0000 != 0;
            let sym = if is_ordinal {
                format!("#{}", low & 0xffff)
            } else {
                let mut hint_name = i128::from(low);
                if plus {
                    hint_name = i128::from(high) * 0x1_0000_0000 + i128::from(low);
                } else if va_form && hint_name >= image_base {
                    hint_name -= image_base;
                }
                if plus && va_form {
                    hint_name -= image_base;
                }
                if hint_name < 0 || hint_name as u128 > MAX_SAFE {
                    return None;
                }
                read_asciiz(r, rva_to_offset(&sections, hint_name)?.saturating_add(2))?
            };
            if !symbols.contains(&sym) {
                symbols.push(sym);
            }
        }
        if !int_terminated {
            return Some(none(false));
        }
    }
    if !terminated {
        return Some(none(false));
    }
    if !has_x86 && !has_x64 {
        return Some(none(true));
    }
    let x64_only = has_x64 && !has_x86;
    Some(PeDelayImportResult {
        parsed: true,
        dll: Some(if x64_only {
            "steam_api64.dll"
        } else {
            "steam_api.dll"
        }),
        arch: if x64_only { "x64" } else { "x86" },
        symbols,
        conflict: has_x86 && has_x64,
    })
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PeDelayImportScanResult {
    pub parsed: bool,
    pub dll: Option<&'static str>,
    pub arch: &'static str,
    pub symbols: Vec<String>,
    pub conflict: bool,
    pub read_error: Option<String>,
}

pub fn scan_pe_delay_imports(exe: &Path) -> PeDelayImportScanResult {
    let (d, read_error) = match FileReader::open(exe) {
        Ok(mut r) => (steam_api_delay_imports(&mut r), None),
        Err(e) => (none(false), Some(e.to_string())),
    };
    PeDelayImportScanResult {
        parsed: d.parsed,
        dll: d.dll,
        arch: d.arch,
        symbols: d.symbols,
        conflict: d.conflict,
        read_error,
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::super::pe_builder::*;
    use super::*;
    use crate::reader::SliceReader;

    /// Delay table at 0x1000 (RVA form, attributes = 1). `dlls` = (name, symbols; "#n" = ordinal).
    pub(crate) fn delay_pe(plus: bool, dlls: &[(&str, &[&str])]) -> Vec<u8> {
        let mut spec = Spec::new(plus);
        spec.dirs[13] = (0x1000, 64);
        let mut b = spec.build();
        let width = if plus { 8 } else { 4 };
        for (i, (dll, syms)) in dlls.iter().enumerate() {
            let d = 0x1000 + i * 32;
            let name_at = 0x3000 + i * 0x40;
            let int_at = 0x2000 + i * 0x200;
            put32(&mut b, d, 1);
            put32(&mut b, d + 4, name_at as u32);
            put32(&mut b, d + 16, int_at as u32);
            put_str(&mut b, name_at, dll);
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

    fn run(b: &[u8]) -> PeDelayImportResult {
        steam_api_delay_imports(&mut SliceReader::new(b))
    }

    #[test]
    fn x64_symbols_in_order_with_ordinals_skipping_other_dlls() {
        let b = delay_pe(
            true,
            &[
                ("OTHER.dll", &["ignored"]),
                (
                    "STEAM_API64.DLL",
                    &["SteamAPI_Init", "#12", "SteamAPI_Shutdown"],
                ),
            ],
        );
        let d = run(&b);
        assert!(d.parsed && !d.conflict);
        assert_eq!(d.dll, Some("steam_api64.dll"));
        assert_eq!(d.arch, "x64");
        assert_eq!(d.symbols, vec!["SteamAPI_Init", "#12", "SteamAPI_Shutdown"]);
    }

    #[test]
    fn x86_pe32_and_dedupe() {
        let b = delay_pe(false, &[("steam_api.dll", &["A", "#3", "A"])]);
        let d = run(&b);
        assert_eq!((d.dll, d.arch), (Some("steam_api.dll"), "x86"));
        assert_eq!(d.symbols, vec!["A", "#3"]);
    }

    #[test]
    fn conflict_reports_x86() {
        let b = delay_pe(
            false,
            &[("steam_api.dll", &["A"]), ("steam_api64.dll", &["B"])],
        );
        let d = run(&b);
        assert!(d.conflict);
        assert_eq!((d.dll, d.arch), (Some("steam_api.dll"), "x86"));
    }

    #[test]
    fn va_form_uses_image_base() {
        let mut b = delay_pe(false, &[("steam_api.dll", &["Sym"])]);
        put32(&mut b, 0x1000, 0); // attributes bit 0 clear -> VAs
        put32(&mut b, 0x1004, 0x40_0000 + 0x3000);
        put32(&mut b, 0x1010, 0x40_0000 + 0x2000);
        put32(&mut b, 0x2000, 0x40_0000 + 0x4000);
        let d = run(&b);
        assert_eq!(d.symbols, vec!["Sym"]);
        // plus: 64-bit VA thunk
        let mut b = delay_pe(true, &[("steam_api64.dll", &["Sym"])]);
        put32(&mut b, 0x1000, 0);
        put32(&mut b, 0x1004, 0x40_0000 + 0x3000);
        put32(&mut b, 0x1010, 0x40_0000 + 0x2000);
        put32(&mut b, 0x2000, 0x40_0000 + 0x4000);
        assert_eq!(run(&b).symbols, vec!["Sym"]);
    }

    #[test]
    fn absent_directory_and_garbage() {
        let d = run(&Spec::new(false).build());
        assert!(d.parsed && d.dll.is_none() && d.arch == "none");
        let mut spec = Spec::new(false);
        spec.num_rva = 13;
        assert!(run(&spec.build()).parsed);
        assert!(!run(&[0, 1, 2]).parsed);
    }

    #[test]
    fn security_caps_descriptors_256() {
        // 300 non-steam descriptors with no terminator: unterminated within the cap => unparsed.
        let mut spec = Spec::new(false);
        spec.dirs[13] = (0x1000, 0x3000);
        spec.sections[0].vsize = 0x8000;
        spec.sections[0].rawsize = 0x8000;
        spec.total = 0xA000;
        let mut b = spec.build();
        for i in 0..300usize {
            put32(&mut b, 0x1000 + i * 32, 1);
            put32(&mut b, 0x1000 + i * 32 + 4, 0x7000);
        }
        put_str(&mut b, 0x7000, "x.dll");
        assert!(!run(&b).parsed);
    }

    #[test]
    fn security_caps_thunks_4096() {
        // 4100 non-zero ordinal thunks, no terminator within the cap => unparsed.
        let mut spec = Spec::new(false);
        spec.dirs[13] = (0x1000, 64);
        spec.sections[0].vsize = 0x8000;
        spec.sections[0].rawsize = 0x8000;
        spec.total = 0xA000;
        let mut b = spec.build();
        put32(&mut b, 0x1000, 1);
        put32(&mut b, 0x1004, 0x3000);
        put32(&mut b, 0x1010, 0x4000);
        put_str(&mut b, 0x3000, "steam_api.dll");
        for k in 0..4100usize {
            put32(&mut b, 0x4000 + k * 4, 0x8000_0000 | (k as u32 + 1));
        }
        assert!(!run(&b).parsed);
    }

    #[test]
    fn security_name_cap_256_bytes() {
        let mut b = delay_pe(false, &[("steam_api.dll", &["A"])]);
        for i in 0..300 {
            b[0x3000 + i] = b'a';
        }
        b[0x3000 + 300] = 0;
        assert!(!run(&b).parsed);
    }

    #[test]
    fn open_error_sets_read_error() {
        let r = scan_pe_delay_imports(Path::new("/definitely/not/here.exe"));
        assert!(!r.parsed && r.dll.is_none() && r.arch == "none");
        assert!(r.read_error.is_some());
    }
}
